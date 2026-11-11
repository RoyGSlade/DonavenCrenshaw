// The hangar menu: ship and upgrades, the captain and their skills, the ledger
// (credits, rep, items, account rewards) and the crew seat. Every bit of text
// reaches the page through textContent. Reads and writes go through the store.
import {
  STATS, TREES, SKILLS, GIVERS, UPGRADES, PORTRAITS, COLORS, NAME_MAX, REP_MAX, MAX_REP_REWARDS,
  SHIP_STAT_NAMES, TOP_TIER, UNLOCK_NAMES, ITEMS, CURRENCY, ACTIVITIES,
} from './data.js';
import { unspentPoints, treePoints, canLearn, spentPoints } from './character.js';
import { money, giverName, itemName, repBand, discount } from './economy.js';
import { voyageShipStats, canUpgrade, visualTier } from './upgrades.js';

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
const pips = (n, max = TOP_TIER) => '■'.repeat(n) + '□'.repeat(Math.max(0, max - n));
const costText = (cost) => [cost.money ? money(cost.money) : null, ...Object.entries(cost.items || {}).map(([id, n]) => `${n} ${itemName(id)}`)].filter(Boolean).join(' · ');
const fmt = (k, v) => (['speed', 'accel', 'turn'].includes(k) ? `${Math.round(v * 100)}%` : String(v));
const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/**
 * root: { ship, captain, ledger, crew, dev } panes; store: voyage/store.js;
 * ship: { name(), build() } for the equipped garage ship; crew: { render(pane) };
 * toast(text); dev: show test tools; onTier(n).
 */
export function createHangar({ panes, store, ship, crew, toast, dev = false, onTier = () => {} }) {
  const view = { creating: { name: '', portrait: PORTRAITS[0].id, color: COLORS[0] } };

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

  // --- Ship ---
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
          type: 'button', disabled: top || !next.ok, 'data-upgrade': u.id,
          text: top ? 'Top tier' : `Tier ${next.tier}`,
          on: { click: () => { const r = store.upgrade(u.id); toast(r.ok ? `${u.name} tier ${next.tier} fitted.` : r.reason); } },
        }),
        top ? null : el('small', {}, [`Tier ${next.tier}: ${costText(next.cost)}`, next.ok ? null : el('span', { class: 'vy-why', text: ` ${next.reasons.join(' ')}` })]),
      ]);
    });
    panes.ship.replaceChildren(
      el('p', { class: 'vy-eyebrow', text: `YOUR SHIP · TIER ${tier}` }),
      el('h2', { text: ship.name() }),
      el('p', { text: 'The same ship, made better one system at a time. Upgrades fly in jobs, fights and the new races; the classic circuits and weekly boards stay as they always were.' }),
      el('div', { class: 'vy-stats' }, Object.entries(SHIP_STAT_NAMES).map(([k, name]) => el('div', { class: 'vy-stat' }, [el('span', { text: name }), el('b', { 'data-stat': k, text: fmt(k, stats[k]) })]))),
      el('h3', { text: 'UPGRADES' }),
      ...rows,
      discount(save) ? el('p', { class: 'vy-note', text: `Your captain gets ${discount(save)}% off upgrade prices.` }) : null,
      el('h3', { text: 'ACTIVITIES' }),
      el('ul', { class: 'vy-list' }, [
        el('li', {}, [el('span', { text: `${ACTIVITIES['classic-race'].name}: stock ship, today's boards` }), el('a', { class: 'vy-link', href: '../?activity=classic', text: 'Fly ↗' })]),
        el('li', {}, [el('span', { text: `${ACTIVITIES.arena.name}: today's classes` }), el('a', { class: 'vy-link', href: '../dogfight/', text: 'Open ↗' })]),
      ]),
      el('p', { class: 'vy-note' }, ['Paint and parts are changed in the ', el('a', { class: 'vy-link', href: '../?activity=classic', text: 'ship garage' }), '. Your look carries over here.']),
    );
  }

  // --- Captain ---
  function renderCreate() {
    const c = view.creating;
    const name = el('input', { type: 'text', id: 'vy-name', maxLength: NAME_MAX, value: c.name, autocomplete: 'off', on: { input: (e) => { c.name = e.target.value; } } });
    const choice = (list, key, label) => el('div', { class: 'vy-choices', role: 'group', 'aria-label': label }, list.map((item) => {
      const id = typeof item === 'string' ? item : item.id;
      const b = el('button', {
        type: 'button', 'aria-pressed': String(c[key] === id), class: key === 'color' ? 'vy-swatch' : null,
        'aria-label': key === 'color' ? `Colour ${id}` : null, text: key === 'color' ? null : item.name,
        on: { click: () => { c[key] = id; renderCaptain(store.get()); } },
      });
      if (key === 'color') b.append(el('i', { style: `background:${id}` }));
      return b;
    }));
    const form = el('form', { class: 'vy-form', on: { submit: (e) => {
      e.preventDefault();
      const r = store.createCharacter({ name: c.name, look: { portrait: c.portrait, color: c.color } });
      toast(r.ok ? 'Your captain signs on. Stats rolled.' : r.reason);
    } } }, [
      el('label', { for: 'vy-name' }, ['Name', name]),
      el('div', {}, [el('p', { class: 'vy-note', text: 'Portrait' }), choice(PORTRAITS, 'portrait', 'Portrait')]),
      el('div', {}, [el('p', { class: 'vy-note', text: 'Colour' }), choice(COLORS, 'color', 'Colour')]),
      el('button', { type: 'submit', class: 'primary', text: 'Roll stats and sign on' }),
    ]);
    panes.captain.replaceChildren(
      el('p', { class: 'vy-eyebrow', text: 'NEW CAPTAIN' }),
      el('h2', { text: 'Who flies this ship?' }),
      el('p', { text: 'Four stats are rolled once, 1d6 each. If your captain dies, half of their skill points are lost and the stats are rolled again. Points from maxed-out rep are never lost.' }),
      form,
    );
  }

  function renderCaptain(save) {
    const c = save.character;
    if (!c) return renderCreate();
    const points = unspentPoints(c);
    const trees = TREES.map((tree) => el('section', { class: 'vy-tree', 'aria-label': tree.name }, [
      el('h3', { text: `${tree.name.toUpperCase()} · ${treePoints(c, tree.id)}` }),
      el('p', { class: 'vy-note', text: tree.blurb }),
      ...SKILLS.filter((s) => s.trees.includes(tree.id)).map((s) => {
        const rank = c.skills[s.id] || 0;
        const can = canLearn(c, s.id);
        const shared = s.trees.length > 1 ? ` · also ${s.trees.filter((t) => t !== tree.id).map((t) => TREES.find((x) => x.id === t).name).join(', ')}` : '';
        return el('div', { class: 'vy-row' }, [
          el('strong', {}, [s.name, el('span', { class: 'vy-pips', 'aria-label': `Rank ${rank} of ${s.max}`, text: pips(rank, s.max) })]),
          el('button', { type: 'button', disabled: !can.ok, 'data-skill': s.id, text: rank >= s.max ? 'Max' : 'Learn', on: { click: () => store.learn(s.id) } }),
          el('small', {}, [`${s.blurb}${shared}`, !can.ok && rank < s.max ? el('span', { class: 'vy-why', text: ` ${can.reason}` }) : null]),
        ]);
      }),
    ]));
    panes.captain.replaceChildren(
      el('div', { class: 'vy-captain' }, [
        el('div', { class: 'vy-badge', style: `background:${c.look.color}`, 'aria-hidden': 'true', text: initials(c.name) }),
        el('div', {}, [el('p', { class: 'vy-eyebrow', text: `CAPTAIN · ${PORTRAITS.find((p) => p.id === c.look.portrait)?.name.toUpperCase() || ''}` }), el('h2', { text: c.name })]),
      ]),
      el('div', { class: 'vy-stats' }, STATS.map((s) => el('div', { class: 'vy-stat', title: s.blurb }, [el('span', { text: s.name }), el('b', { 'data-stat': s.id, text: String(c.stats[s.id]) })]))),
      el('div', { class: 'vy-points' }, [
        el('span', {}, ['Unspent ', el('b', { 'data-points': 'unspent', text: String(points) })]),
        el('span', {}, ['Spent ', el('b', { text: String(spentPoints(c)) })]),
        el('span', {}, ['Permanent ', el('b', { 'data-points': 'permanent', text: String(c.permanent) })]),
        el('span', {}, ['Deaths ', el('b', { 'data-points': 'deaths', text: String(c.deaths) })]),
      ]),
      el('div', { class: 'vy-trees' }, trees),
    );
  }

  // --- Ledger ---
  function renderLedger(save) {
    const items = ITEMS.filter((i) => save.items[i.id]).map((i) => el('li', {}, [el('span', { text: i.name }), el('b', { text: String(save.items[i.id]) })]));
    const others = Object.keys(save.items).filter((id) => !ITEMS.some((i) => i.id === id)).map((id) => el('li', {}, [el('span', { text: id }), el('b', { text: String(save.items[id]) })]));
    panes.ledger.replaceChildren(
      el('p', { class: 'vy-eyebrow', text: CURRENCY.name.toUpperCase() }),
      el('p', { class: 'vy-money', 'data-money': '', text: money(save.money) }),
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
      items.length + others.length ? el('ul', { class: 'vy-list' }, [...items, ...others]) : el('p', { class: 'vy-note', text: 'Nothing in the hold yet. Jobs pay in parts as well as credits.' }),
      el('h3', { text: 'ACCOUNT REWARDS' }),
      save.account.unlocks.length
        ? el('ul', { class: 'vy-list' }, save.account.unlocks.map((u) => el('li', { text: UNLOCK_NAMES[u] || u })))
        : el('p', { class: 'vy-note', text: `Max out rep with a giver (${REP_MAX}) for rewards that stay with your account.` }),
    );
  }

  // --- Test tools (only with ?voyage=on&dev=1) ---
  function renderDev() {
    if (!dev || !panes.dev) return;
    panes.dev.hidden = false;
    panes.dev.replaceChildren(
      el('p', { class: 'vy-eyebrow', text: 'TEST TOOLS · THIS TAB ONLY' }),
      el('div', {}, [
        el('button', { type: 'button', id: 'vy-dev-job', text: 'Practice job', on: { click: () => say(store.grant({ money: 250, rep: { 'relay-guild': 10 }, items: { scrap: 6, ore: 2, circuit: 1 }, skillPoints: 1 })) } }),
        el('button', { type: 'button', id: 'vy-dev-maxrep', text: 'Max Relay rep', on: { click: () => say(store.grant({ rep: { 'relay-guild': REP_MAX } })) } }),
        el('button', { type: 'button', id: 'vy-dev-die', text: 'Test death', on: { click: () => {
          const lost = store.die();
          toast(lost == null ? 'Make a captain first.' : `Your captain died. ${lost} skill point${lost === 1 ? '' : 's'} lost, stats rolled again, skills refunded.`);
        } } }),
        el('button', { type: 'button', id: 'vy-dev-reset', text: 'Fresh save', on: { click: () => { if (confirm('Start a fresh save on this device? Your account copy is replaced on the next sync.')) store.reset(); } } }),
      ]),
    );
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
  return { render, say };
}
