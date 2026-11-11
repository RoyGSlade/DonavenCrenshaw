// What each hangar station shows: the ship and its upgrades (the pad), the
// captain's stats and skill tree (the bunk), the ledger (credits, rep, items,
// account rewards), and the smaller stations (Ralph's kennel, the scrap pile,
// Mel's locker and range, Edna's back room, the launch hatch). hangarPlace.js
// decides which station is open; this file only draws. Words on the station
// panels come from hangarData.js. Every bit of text reaches the page through
// textContent. Reads and writes go through the store.
import {
  STATS, GIVERS, UPGRADES, REP_MAX, MAX_REP_REWARDS,
  SHIP_STAT_NAMES, TOP_TIER, UNLOCK_NAMES, ITEMS, CURRENCY, ACTIVITIES, DEATH,
} from './data.js';
import { unspentPoints, spentPoints } from './character.js';
import { money, giverName, itemName, repBand, discount } from './economy.js';
import { voyageShipStats, canUpgrade, visualTier } from './upgrades.js';
import { QUESTS } from './quests/data/quests/index.js';
import { createSkillTree } from './ui/skillTree.js';
import { iconFor, HANGAR_ART } from './ui/assets.js';
import { STAT_TEXT } from './hangarLinks.js';
import { rollWords } from './ui/licence.js';
import { CAST_NAMES } from './hangarStations.js';
import { launches } from './hangarApi.js';

// --- Tiny DOM helpers ----------------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'style') node.setAttribute('style', v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null && c !== false) node.append(c);
  return node;
}
// replaceChildren would print a null as the word "null"; leave such parts out.
const fill = (node, ...kids) => node.replaceChildren(...kids.filter((k) => k != null && k !== false));
const pips = (n, max = TOP_TIER) => '■'.repeat(n) + '□'.repeat(Math.max(0, max - n));
const costText = (cost) => [cost.money ? money(cost.money) : null, ...Object.entries(cost.items || {}).map(([id, n]) => `${n} ${itemName(id)}`)].filter(Boolean).join(' · ');
const fmt = (k, v) => (['speed', 'accel', 'turn'].includes(k) ? `${Math.round(v * 100)}%` : String(v));
const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const pick = (list, n) => list[((n % list.length) + list.length) % list.length];

function itemRow(id, name, count) {
  const icon = iconFor(id);
  return el('li', { 'data-item': id }, [icon ? el('img', { src: icon, alt: '' }) : el('i'), el('span', { text: name }), el('b', { text: String(count) })]);
}
function holdLine(save, ids) {
  const rows = ids.filter((id) => save.items[id]).map((id) => itemRow(id, itemName(id), save.items[id]));
  return rows.length ? el('ul', { class: 'ui-iconlist', 'aria-label': 'Parts in the hold' }, rows) : null;
}

/**
 * panes: { ship, captain, ledger, crew, station, dev }; store: voyage/store.js;
 * ship: { name(), build() } for the equipped garage ship; crew: { render(pane) };
 * toast(text); dev: show test tools; onTier(n); tutorialOn(save): respec is free;
 * openLicence(): the captain's licence (no captain yet); hooks: { mine, range,
 * puzzle } from the onfoot lane (a button shows only when its hook is given);
 * bus: the story bus.
 */
export function createHangar({ panes, store, ship, crew, toast, dev = false, onTier = () => {}, tutorialOn = () => false, openLicence = () => {}, hooks = {}, bus = null, reducedMotion = () => false }) {
  const treeHost = el('div', { class: 'ui-tree-host' });
  // The tree draws into its own host, so its scroll and its learn burst survive re-renders.
  const tree = createSkillTree({
    root: treeHost, store, toast, tutorialOn, reducedMotion,
    onLearned: (id) => bus?.emit('hangar:learned', { skill: id }),
    onRespec: (n) => bus?.emit('hangar:respec', { points: n }),
  });
  let pets = 0;

  function say(events) {
    const lines = [];
    for (const e of events) {
      if (e.type === 'money') lines.push(`${e.amount > 0 ? '+' : ''}${money(e.amount)}`);
      else if (e.type === 'rep') lines.push(`${e.amount > 0 ? '+' : ''}${e.amount} rep with ${giverName(e.giver)}`);
      else if (e.type === 'item') lines.push(`${e.amount > 0 ? '+' : ''}${e.amount} ${itemName(e.id)}`);
      else if (e.type === 'skill-points') lines.push(`+${e.amount} skill point${e.amount === 1 ? '' : 's'}`);
      else if (e.type === 'max-rep') lines.push(`${giverName(e.giver)} swears you in: +${e.permanent} permanent points${e.unlocks.length ? `, ${e.unlocks.map((u) => UNLOCK_NAMES[u] || u).join(', ')}` : ''}`);
      else if (e.type === 'unlock') lines.push(`Unlocked ${UNLOCK_NAMES[e.id] || e.id}`);
    }
    if (lines.length) toast(lines.join('\n'));
  }

  // --- The pad: ship and upgrades ---
  function renderShip(save) {
    const stats = voyageShipStats(save, ship.build());
    const tier = visualTier(save);
    onTier(tier);
    const rows = UPGRADES.map((u) => {
      const now = save.upgrades[u.id];
      const next = canUpgrade(save, u.id);
      const top = now >= TOP_TIER;
      return el('div', { class: 'vy-row' }, [
        el('strong', {}, [u.name, el('span', { class: 'vy-pips', 'aria-label': `Tier ${now} of ${TOP_TIER}`, text: pips(now) })]),
        el('button', {
          type: 'button', disabled: top || !next.ok, 'data-upgrade': u.id, class: next.ok && !top ? 'primary' : null,
          text: top ? 'Top tier' : `Fit tier ${next.tier}`,
          on: { click: () => {
            const r = store.upgrade(u.id);
            toast(r.ok ? `${u.name} tier ${next.tier} fitted. Chibby wipes his hands on his overalls, proud as anything.` : r.reason);
            if (r.ok) bus?.emit('hangar:upgraded', { system: u.id, tier: next.tier });
          } },
        }),
        top ? el('small', { text: 'As good as Chibby can make it.' }) : el('small', {}, [`Tier ${next.tier}: ${costText(next.cost)}`, next.ok ? null : el('span', { class: 'vy-why', text: ` ${next.reasons.join(' ')}` })]),
      ]);
    });
    fill(panes.ship,
      el('p', { class: 'vy-eyebrow', text: `YOUR SHIP · TIER ${tier}` }),
      el('h2', { text: ship.name() }),
      el('p', { text: 'The same ship, made better one system at a time. Chibby fits the parts; you bring the credits and the scrap. Upgrades fly in jobs, fights and the new races; the classic circuits and weekly boards stay exactly as they were.' }),
      el('div', { class: 'vy-stats' }, Object.entries(SHIP_STAT_NAMES).map(([k, name]) => el('div', { class: 'vy-stat' }, [el('span', { text: name }), el('b', { 'data-stat': k, text: fmt(k, stats[k]) })]))),
      el('h3', { text: 'UPGRADES' }),
      ...rows,
      discount(save) ? el('p', { class: 'vy-note', text: `Your captain talks ${discount(save)}% off every upgrade.` }) : null,
      holdLine(save, ['scrap', 'ore', 'circuit', 'fuel-cell', 'nav-chip', 'railgun']),
      el('h3', { text: 'ELSEWHERE' }),
      el('ul', { class: 'vy-list' }, [
        el('li', {}, [el('span', { text: `${ACTIVITIES['classic-race'].name}: stock ship, today's boards` }), el('a', { class: 'vy-link', href: '../?activity=classic', text: 'Fly ↗' })]),
        el('li', {}, [el('span', { text: 'Paint and parts: the ship garage. Your look carries over here.' }), el('a', { class: 'vy-link', href: '../?activity=classic', text: 'Garage ↗' })]),
      ]),
    );
  }

  // --- The bunk: stats with what they're for, then the skill tree ---
  function renderCaptain(save) {
    const c = save.character;
    if (!c) {
      fill(panes.captain,
        el('p', { class: 'vy-eyebrow', text: 'NO CAPTAIN YET' }),
        el('h2', { text: 'Nobody sleeps here yet.' }),
        el('p', { text: 'Sign the captain\'s licence first: a name, a colour and four rolls of the die.' }),
        el('button', { type: 'button', class: 'primary', text: 'Open the licence', on: { click: openLicence } }),
      );
      return;
    }
    tree.render(save);
    fill(panes.captain,
      el('div', { class: 'vy-captain' }, [
        el('div', { class: 'vy-badge', style: `background:${c.look.color}`, 'aria-hidden': 'true', text: initials(c.name) }),
        el('div', {}, [el('p', { class: 'vy-eyebrow', text: `CAPTAIN${c.deaths ? ` · ${c.deaths} DEATH${c.deaths === 1 ? '' : 'S'}` : ''}` }), el('h2', { text: c.name })]),
      ]),
      el('div', { class: 'ui-stats' }, STATS.map((s) => {
        const icon = iconFor(s.id);
        return el('div', { class: 'ui-stat', title: rollWords(s.id, c.stats[s.id]) }, [
          icon ? el('img', { src: icon, alt: '' }) : el('i'),
          el('span', {}, [s.name, el('small', { text: STAT_TEXT[s.id]?.short || s.blurb })]),
          el('b', { 'data-stat': s.id, text: String(c.stats[s.id]) }),
        ]);
      })),
      el('div', { class: 'vy-points' }, [
        el('span', {}, ['Unspent ', el('b', { text: String(unspentPoints(c)) })]),
        el('span', {}, ['Spent ', el('b', { text: String(spentPoints(c)) })]),
        el('span', {}, ['Permanent ', el('b', { 'data-points': 'permanent', text: String(c.permanent) })]),
        el('span', {}, ['Deaths ', el('b', { 'data-points': 'deaths', text: String(c.deaths) })]),
      ]),
      el('h3', { text: 'SKILL TREE' }),
      treeHost,
    );
  }

  // --- Ledger (a view of the bunk) ---
  function renderLedger(save) {
    const items = ITEMS.filter((i) => save.items[i.id]).map((i) => itemRow(i.id, i.name, save.items[i.id]));
    const others = Object.keys(save.items).filter((id) => !ITEMS.some((i) => i.id === id)).map((id) => itemRow(id, id, save.items[id]));
    fill(panes.ledger,
      el('p', { class: 'vy-eyebrow', text: CURRENCY.name.toUpperCase() }),
      el('div', { class: 'ui-money' }, [iconFor('credits') ? el('img', { src: iconFor('credits'), alt: '' }) : null, el('p', { class: 'vy-money', 'data-money': '', text: money(save.money) })]),
      el('h3', { text: 'REPUTATION' }),
      ...GIVERS.map((g) => {
        const rep = save.rep[g.id] || 0;
        const prize = MAX_REP_REWARDS[g.id];
        const claimed = save.account.maxRep[g.id];
        return el('div', { class: 'vy-row' }, [
          el('strong', { text: g.name }),
          el('span', { 'data-rep': g.id, text: `${rep} / ${REP_MAX} · ${repBand(rep)}` }),
          el('div', { class: 'vy-bar', style: 'grid-column:1/-1', role: 'progressbar', 'aria-label': `${g.name} rep`, 'aria-valuemin': '0', 'aria-valuemax': String(REP_MAX), 'aria-valuenow': String(rep) }, [el('i', { style: `width:${(rep / REP_MAX) * 100}%` })]),
          prize ? el('small', { text: `${claimed ? 'Earned' : `At ${REP_MAX}`}: +${prize.permanent} permanent skill points, ${prize.unlocks.map((u) => UNLOCK_NAMES[u] || u).join(', ')}` }) : null,
        ]);
      }),
      el('h3', { text: 'HOLD' }),
      items.length + others.length ? el('ul', { class: 'ui-iconlist' }, [...items, ...others]) : el('p', { class: 'vy-note', text: 'Nothing in the hold yet. Jobs pay in parts as well as credits.' }),
      el('h3', { text: 'JOB RECORD' }),
      jobRecord(save),
      el('h3', { text: 'ACCOUNT REWARDS' }),
      save.account.unlocks.length
        ? el('ul', { class: 'vy-list' }, save.account.unlocks.map((u) => el('li', { text: UNLOCK_NAMES[u] || u })))
        : el('p', { class: 'vy-note', text: `Max out rep with a giver (${REP_MAX}) for rewards that stay with your account.` }),
    );
  }

  function jobRecord(save) {
    const done = Object.entries(save.quests?.done || {}).filter(([id]) => QUESTS[id]);
    if (!done.length) return el('p', { class: 'vy-note', text: 'No jobs yet. The job board has three people who are hiring.' });
    return el('ul', { class: 'vy-list', 'data-jobs': '' }, done.map(([id, d]) => el('li', { 'data-job': id }, [
      el('span', { text: `${QUESTS[id].title}: ${d.result === 'success' ? 'done' : 'failed'} (${d.outcome})` }),
      el('b', { text: `${d.times}×` }),
    ])));
  }

  // --- The smaller stations ---
  function hero(station, title, body) {
    const art = HANGAR_ART.props[station.art];
    return el('div', { class: 'ui-station-hero' }, [
      art ? el('img', { src: art, alt: '' }) : el('i'),
      el('div', {}, [
        station.who ? el('p', { class: 'vy-eyebrow', text: (CAST_NAMES[station.who] || station.who).toUpperCase() }) : null,
        el('h2', { text: title }),
        el('p', { text: body }),
      ]),
    ]);
  }
  const hookButton = (label, fn, attrs = {}) => (fn ? el('button', { type: 'button', class: 'primary', text: label, on: { click: fn }, ...attrs }) : null);

  /** Draw a station's own panel. view: its sub view id, or 'locked'. */
  function renderStation(station, state, pane, view = 'station') {
    const copy = station.copy || {};
    const save = store.get();
    if (view === 'locked' || state.locked) {
      fill(pane,
        hero(station, station.name, station.blurb),
        el('div', { class: 'ui-locked', 'data-locked': station.id }, [el('strong', { text: 'NOT YET' }), el('p', { text: copy.locked || 'Not open yet.' })]),
      );
      return;
    }
    switch (station.id) {
      case 'kennel': {
        const line = el('p', { class: 'vy-note', 'aria-live': 'polite' });
        fill(pane,
          hero(station, copy.title, copy.body),
          el('button', { type: 'button', 'data-pet': '', text: copy.pet, on: { click: () => {
            line.textContent = pick(copy.petted, pets++);
            bus?.emit('hangar:petted', { cast: 'ralph' });
          } } }),
          line,
        );
        return;
      }
      case 'scrap':
        fill(pane,
          hero(station, copy.title, copy.body),
          hookButton(copy.mine, hooks.mine && (() => hooks.mine()), { 'data-hook': 'mine' }),
          el('h3', { text: copy.holdTitle }),
          holdLine(save, ['scrap', 'ore']) || el('p', { class: 'vy-note', text: 'No scrap or ore in the hold yet.' }),
        );
        return;
      case 'locker': {
        const kit = Object.keys(save.flags || {}).filter((f) => f.startsWith('kit-') && save.flags[f]);
        fill(pane,
          hero(station, copy.title, copy.body),
          el('h3', { text: copy.kitTitle }),
          kit.length ? el('ul', { class: 'vy-list' }, kit.map((f) => el('li', { text: f.slice(4).replace(/-/g, ' ') }))) : el('p', { class: 'vy-note', text: copy.noKit }),
          holdLine(save, ['permit', 'mining-drill', 'railgun', 'cargo-crate']),
          el('p', { class: 'vy-note', text: copy.shopSoon }),
        );
        return;
      }
      case 'range':
        fill(pane, hero(station, copy.title, copy.body), hookButton(copy.shoot, hooks.range && (() => hooks.range()), { 'data-hook': 'range' }));
        return;
      case 'backroom':
        fill(pane,
          hero(station, copy.title, copy.body),
          hookButton(copy.lockbox, hooks.puzzle && (() => hooks.puzzle()), { 'data-hook': 'puzzle' }),
          el('div', { class: 'ui-money' }, [iconFor('credits') ? el('img', { src: iconFor('credits'), alt: '' }) : null, el('p', { class: 'vy-money', text: money(save.money) })]),
          el('p', { class: 'vy-note', text: copy.shopSoon }),
        );
        return;
      case 'hatch': {
        const list = launches();
        fill(pane,
          hero(station, copy.title, copy.body),
          el('h3', { text: copy.launchTitle }),
          list.length ? el('ul', { class: 'ui-launches' }, list.map((l) => {
            const can = l.available ? l.available(save) : { ok: true };
            return el('li', { 'data-launch': l.id }, [
              el('strong', { text: l.label }),
              l.blurb ? el('small', { text: l.blurb }) : null,
              el('button', { type: 'button', class: can.ok ? 'primary' : null, disabled: !can.ok, text: can.ok ? 'Launch' : (can.reason || 'Not yet'), on: { click: () => l.run({ store, toast, bus }) } }),
            ]);
          })) : el('p', { class: 'vy-note', text: copy.noLaunch }),
        );
        return;
      }
      default:
        fill(pane, hero(station, station.name, station.blurb));
    }
  }

  // --- Test tools (only with ?newgame=1&dev=1) ---
  function renderDev() {
    if (!dev || !panes.dev) return;
    panes.dev.hidden = false;
    let n = 0;
    fill(panes.dev, el('details', { class: 'hg-dev' }, [
      el('summary', { class: 'vy-eyebrow', id: 'vy-dev-open', text: 'TEST TOOLS · THIS TAB ONLY' }),
      el('div', {}, [
        el('button', { type: 'button', id: 'vy-dev-job', text: 'Practice job', on: { click: () => say(store.grant({ money: 250, rep: { hask: 10 }, items: { scrap: 6, ore: 2, circuit: 1 }, skillPoints: 1 })) } }),
        el('button', { type: 'button', id: 'vy-dev-maxrep', text: 'Max Hask rep', on: { click: () => say(store.grant({ rep: { hask: REP_MAX } })) } }),
        el('button', { type: 'button', id: 'vy-dev-die', text: 'Test death', on: { click: () => {
          const lost = store.die();
          toast(lost == null ? 'Make a captain first.' : `Your captain died. ${lost} skill point${lost === 1 ? '' : 's'} lost, stats rolled again, skills refunded${DEATH.loseUpgrades ? ', ship upgrades lost' : ''}.`);
        } } }),
        el('button', { type: 'button', id: 'vy-dev-line', text: 'Test a line', on: { click: () => bus?.emit('story:say', { seq: `dev-${++n}`, id: 'dev.line', speaker: 'chibby', name: 'Chibby', text: 'Test line, Captain. If you can read this, the dialogue box works. If you can hear it, the voice lane does too.', audio: null, durationMs: 4200 }) } }),
        el('button', { type: 'button', id: 'vy-dev-reset', text: 'Fresh save', on: { click: () => { if (confirm('Start a fresh save on this device? Your account copy is replaced on the next sync.')) store.reset(); } } }),
      ]),
    ]));
  }

  function render(save = store.get()) {
    renderShip(save);
    renderCaptain(save);
    renderLedger(save);
    crew?.render(panes.crew);
  }
  store.subscribe((save) => render(save));
  renderDev();
  render();
  return { render, say, renderStation, tree };
}
