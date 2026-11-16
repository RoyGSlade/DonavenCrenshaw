// What each hangar station shows: the ship and its upgrades (the pad), the
// bunk's nap (respec: round 3, the captain and pack pages moved to the
// datapad), and the smaller stations (Ralph's kennel, the scrap pile,
// Mel's locker and range, Edna's back room, the launch hatch). hangarPlace.js
// decides which station is open; this file only draws. Words on the station
// panels come from hangarData.js. Every bit of text reaches the page through
// textContent. Reads and writes go through the store.
import { UPGRADES, REP_MAX, SHIP_STAT_NAMES, TOP_TIER, UNLOCK_NAMES, ACTIVITIES, DEATH, SKILLS } from './data.js';
import { unspentPoints, spentPoints, check } from './character.js';
import { money, giverName, itemName, discount } from './economy.js';
import { voyageShipStats, canUpgrade, visualTier } from './upgrades.js';
import { BASICS_DATA } from './datapad/data.js';
import { napQuote, takeNap, canPick, canUnpick, fillText } from './datapad/nap.js';
import { iconFor, HANGAR_ART } from './ui/assets.js';
import { CAST_NAMES } from './hangarStations.js';
import { launches } from './hangarApi.js';
import { BADGES_DATA } from './quests/data/badges.js';

const NAP = BASICS_DATA.nap;

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
 * panes: { ship, crew, station, dev } (the captain and pack pages live on the datapad); store: voyage/store.js;
 * ship: { name(), build() } for the equipped garage ship; crew: { render(pane) };
 * toast(text); dev: show test tools; onTier(n); tutorialOn(save): respec is free;
 * openLicence(): the captain's licence (no captain yet); hooks: { mine, range,
 * puzzle } from the onfoot lane (a button shows only when its hook is given);
 * bus: the story bus.
 */
export function createHangar({ panes, store, ship, crew, toast, dev = false, onTier = () => {}, tutorialOn = () => false, openLicence = () => {}, hooks = {}, bus = null, reducedMotion = () => false, openPad = () => {}, onNap = () => {} }) {
  let pets = 0;
  let napping = false;
  const napPlan = {}; // { skillId: ranks to take back } picked at the bunk
  let lastWhy = '';

  function say(events) {
    const lines = [];
    for (const e of events) {
      if (e.type === 'money') lines.push(`${e.amount > 0 ? '+' : ''}${money(e.amount)}`);
      else if (e.type === 'rep') lines.push(`${e.amount > 0 ? '+' : ''}${e.amount} rep with ${giverName(e.giver)}`);
      else if (e.type === 'item') lines.push(`${e.amount > 0 ? '+' : ''}${e.amount} ${itemName(e.id)}`);
      else if (e.type === 'skill-points') lines.push(`+${e.amount} skill point${e.amount === 1 ? '' : 's'}`);
      else if (e.type === 'max-rep') lines.push(`${giverName(e.giver)} swears you in: +${e.permanent} permanent points${e.unlocks.length ? `, ${e.unlocks.map((u) => UNLOCK_NAMES[u] || u).join(', ')}` : ''}`);
      else if (e.type === 'unlock') {
        const badge = e.id.startsWith('badge:') ? BADGES_DATA.badges[e.id.slice(6)] : null;
        lines.push(badge ? `Badge: ${badge.name}` : `Unlocked ${UNLOCK_NAMES[e.id] || e.id}`);
      }
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

  // Round 3: the captain's stats, the skill tree, the pack and the job record live on the
  // datapad (datapad/*), reachable anywhere. The bunk keeps the nap (respec), below.

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
      case 'board':
        // Postings from givers who are not on this station (jobs.js draws them).
        if (hooks.postings) { hooks.postings(pane); return; }
        fill(pane, hero(station, station.name, station.blurb));
        return;
      case 'quarters': {
        // Respec is a nap (Donaven): you pick which ranks to take back ("not all, that could be
        // annoying"), see the running price (the respec rule; free in the tutorial), then sleep on it.
        const c = save.character;
        if (!c) {
          fill(pane, hero(station, NAP.title, NAP.body), el('button', { type: 'button', class: 'primary', text: 'Open the licence', on: { click: openLicence } }));
          return;
        }
        const tutorial = tutorialOn(save);
        // Drop picks the save no longer allows (a skill learned or lost since).
        for (const id of Object.keys(napPlan)) if (!(c.skills?.[id] > 0)) delete napPlan[id]; else napPlan[id] = Math.min(napPlan[id], c.skills[id]);
        const q = napQuote(save, tutorial, napPlan);
        const redraw = () => renderStation(station, state, pane, view);
        let why = '';
        const spent = SKILLS.filter((sk) => (c.skills?.[sk.id] || 0) > 0);
        const rows = spent.map((sk) => {
          const rank = c.skills[sk.id];
          const back = napPlan[sk.id] || 0;
          const pick = canPick(c, napPlan, sk.id);
          const keep = canUnpick(c, napPlan, sk.id);
          const pips = el('span', { class: 'vy-nap-pips', 'aria-hidden': 'true' }, Array.from({ length: sk.max }, (_, n) => el('i', { class: n < rank - back ? 'is-kept' : n < rank ? 'is-back' : '' })));
          return el('li', { class: `vy-nap-row${back ? ' is-picked' : ''}`, 'data-nap-skill': sk.id }, [
            el('span', { class: 'vy-nap-name' }, [el('b', { text: sk.name }), el('small', { text: back ? `${rank - back} of ${rank} kept, ${back} back` : `Rank ${rank} of ${sk.max}` })]),
            pips,
            el('button', { type: 'button', class: 'vy-nap-btn', 'data-keep': sk.id, disabled: !back || napping, 'aria-label': fillText(NAP.keepOne, { skill: sk.name }), text: '+', on: { click: () => { if (keep.ok) { napPlan[sk.id] -= 1; if (!napPlan[sk.id]) delete napPlan[sk.id]; redraw(); } else { lastWhy = keep.reason; redraw(); } } } }),
            el('button', { type: 'button', class: 'vy-nap-btn', 'data-take': sk.id, disabled: back >= rank || napping, 'aria-label': fillText(NAP.pickOne, { skill: sk.name }), text: '−', on: { click: () => { if (pick.ok) { napPlan[sk.id] = back + 1; lastWhy = ''; redraw(); } else { lastWhy = pick.reason; redraw(); } } } }),
          ]);
        });
        why = lastWhy;
        lastWhy = '';
        const nap = el('button', {
          type: 'button', class: 'primary', id: 'hg-nap', 'data-nap': '', disabled: !q.ok || napping,
          text: q.points ? fillText(NAP.buttonPicked, { points: q.points }) : NAP.button,
          on: { click: async () => {
            if (napping) return;
            napping = true;
            onNap(true);
            const plan = { ...napPlan };
            const r = await takeNap({ store, tutorial: tutorialOn(store.get()), plan, reducedMotion });
            napping = false;
            onNap(false);
            if (r.ok) { for (const k of Object.keys(napPlan)) delete napPlan[k]; bus?.emit('hangar:respec', { points: r.points, nap: true, cost: r.cost }); toast(r.text); } else toast(r.reason);
            redraw();
          } },
        });
        fill(pane,
          hero(station, NAP.title, NAP.body),
          el('div', { class: 'vy-points' }, [
            el('span', {}, ['Spent ', el('b', { 'data-points': 'spent', text: String(spentPoints(c)) })]),
            el('span', {}, ['Unspent ', el('b', { text: String(unspentPoints(c)) })]),
            el('span', {}, ['Credits ', el('b', { text: money(save.money) })]),
          ]),
          spent.length ? el('h3', { text: NAP.pickTitle }) : null,
          spent.length ? el('ul', { class: 'vy-nap-list' }, rows) : null,
          why ? el('p', { class: 'vy-note vy-why', 'data-nap-why': '', text: why }) : null,
          el('p', { class: q.ok ? 'vy-note' : 'vy-note vy-why', 'data-nap-quote': '', text: q.ok ? q.line : q.reason }),
          el('div', { class: 'vy-nap-actions' }, [
            nap,
            el('button', { type: 'button', 'data-open-pad': 'captain', text: NAP.openPad, on: { click: () => openPad('captain') } }),
          ]),
        );
        return;
      }
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
        el('button', { type: 'button', id: 'vy-dev-check', text: 'Test a check', on: { click: () => {
          const c = store.get().character;
          if (!c) { toast('Make a captain first.'); return; }
          bus?.emit('roll:attempt', { ...check(c, { stat: 'dex', tag: 'test', dc: 8 }, Math.random), who: c.name, label: 'Test: thread the needle' });
        } } }),
        el('button', { type: 'button', id: 'vy-dev-reset', text: 'Fresh save', on: { click: () => { if (confirm('Start a fresh save on this device? Your account copy is replaced on the next sync.')) store.reset(); } } }),
      ]),
    ]));
  }

  function render(save = store.get()) {
    renderShip(save);
    crew?.render(panes.crew);
  }
  store.subscribe((save) => render(save));
  renderDev();
  render();
  return { render, say, renderStation };
}
