// The skill tree screen: Helm, Guns and Wrench drawn as one tree seen from
// above, the captain at the root, branches of glowing conduit out to every
// skill, and the shared skills sitting between the two trees that feed them.
// Tap a node for what it does, in plain words, what it costs and what it
// needs; learn it (with a little burst of light) or take a rank back (respec).
// All text through textContent.
import { TREES, SKILLS } from '../data.js';
import { unspentPoints, treePoints, canLearn, spentPoints } from '../character.js';
import { spend } from '../economy.js';
import { treeLayout, skillWords, unlockList, canUnlearn, unlearn, respecAll, respecCost, respecQuote } from '../hangarSkills.js';
import { uiArt } from './assets.js';
import { HANGAR_DATA } from '../hangarData.js';

const SKILL_TREE_SHAPE = HANGAR_DATA.skillTree;

const SVG = 'http://www.w3.org/2000/svg';
// Small line glyphs for what a skill unlocks (24-unit boxes, drawn with currentColor).
const GLYPHS = {
  door: 'M6 21V4h12v17M3 21h18M15 12h.01',
  terminal: 'M3 5h18v11H3zM8 20h8M12 16v4M7 9l3 2-3 2M12 13h4',
  lane: 'M4 20 10 4M20 20 14 4M12 6v2M12 11v2M12 16v2',
  move: 'M13 3 5 13h6l-1 8 8-10h-6z',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  option: 'M4 5h16v10H9l-5 4z',
  area: 'M3 10 12 3l9 7v11H3zM9 21v-6h6v6',
};
function glyph(kind, cls = 'ui-glyph') {
  const g = svg('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true', 'data-kind': kind });
  g.append(svg('path', { d: GLYPHS[kind] || GLYPHS.move, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return g;
}
const TREE_COLOUR = SKILL_TREE_SHAPE.colours;
const SKILL = new Map(SKILLS.map((s) => [s.id, s]));
const TREE_NAME = Object.fromEntries(TREES.map((t) => [t.id, t.name]));
const VB = 1.34; // the layout is in [-1, 1]; leave room for branch labels
const pct = (v) => `${((v + VB) / (2 * VB)) * 100}%`;
const money = (n) => `${n} credits`;

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k === 'on') for (const [e, f] of Object.entries(v)) node.addEventListener(e, f);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) node.append(c);
  return node;
}
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * root: the element to fill. store: voyage/store.js. toast(text).
 * tutorialOn(save): respec is free while true. reducedMotion().
 * onLearned(skillId) / onRespec(points): for the story bus or sounds.
 */
export function createSkillTree({ root, store, toast = () => {}, tutorialOn = () => false, reducedMotion = () => false, onLearned = () => {}, onRespec = () => {} }) {
  const layout = treeLayout();
  let selected = null;
  let fresh = null; // the node just learned, for its burst
  let freshTimer = 0;
  let confirmAll = false;

  function nodeState(c, id) {
    const s = SKILL.get(id);
    const rank = c.skills[id] || 0;
    if (rank >= s.max) return 'maxed';
    if (rank > 0) return canLearn(c, id).ok ? 'learned-more' : 'learned';
    return canLearn(c, id).ok ? 'available' : 'locked';
  }
  // Is the node's requirement met (ignoring points to spend)? Lights its conduit.
  function reachable(c, id) {
    const s = SKILL.get(id);
    return Object.entries(s.needs || {}).every(([t, n]) => treePoints(c, t) - (s.trees.includes(t) ? c.skills[id] || 0 : 0) >= n);
  }

  function learn(id) {
    const c = store.get().character;
    const s = SKILL.get(id);
    if (!canLearn(c, id).ok) return;
    fresh = id;
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => { fresh = null; }, 1400);
    if (store.learn(id)) {
      onLearned(id);
      toast(`${s.name}: rank ${(c.skills[id] || 0) + 1} learned.`);
    }
  }

  function takeBack(id) {
    const save = store.get();
    const c = save.character;
    const can = canUnlearn(c, id);
    if (!can.ok) { toast(can.reason); return; }
    const cost = respecCost(1, { tutorial: tutorialOn(save) });
    const paid = cost.money ? spend(save, cost) : { ok: true, save };
    if (!paid.ok) { toast(`Taking a point back costs ${money(cost.money)}. ${paid.reason || ''}`.trim()); return; }
    store.update(() => ({ ...paid.save, character: unlearn(c, id) }));
    onRespec(1);
    toast(`${SKILL.get(id).name}: 1 point back${cost.money ? ` for ${money(cost.money)}` : ', free'}.`);
  }

  function respecEverything() {
    const save = store.get();
    const quote = respecQuote(save.character, { tutorial: tutorialOn(save) });
    if (!quote.points) return;
    const paid = quote.cost.money ? spend(save, quote.cost) : { ok: true, save };
    if (!paid.ok) { toast(`A full respec costs ${money(quote.cost.money)}. ${paid.reason || ''}`.trim()); return; }
    store.update(() => ({ ...paid.save, character: respecAll(save.character) }));
    confirmAll = false;
    selected = null;
    onRespec(quote.points);
    toast(`All ${quote.points} point${quote.points === 1 ? '' : 's'} back to spend${quote.cost.money ? ` (${money(quote.cost.money)})` : ''}.`);
  }

  function drawConnectors(c) {
    const g = svg('svg', { viewBox: `${-VB} ${-VB} ${VB * 2} ${VB * 2}`, class: 'ui-tree-svg', 'aria-hidden': 'true' });
    const defs = svg('defs');
    const blur = svg('filter', { id: 'ui-tree-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    blur.append(svg('feGaussianBlur', { stdDeviation: '0.012' }));
    defs.append(blur);
    g.append(defs);
    // The three great limbs, thick and tapering, under everything.
    for (const b of layout.branches) {
      const a = (b.angle * Math.PI) / 180;
      const ex = Math.cos(a) * 0.98, ey = Math.sin(a) * 0.98;
      const nx = -Math.sin(a) * 0.05, ny = Math.cos(a) * 0.05;
      g.append(svg('path', { class: 'ui-limb', d: `M ${nx} ${ny} Q ${ex * 0.5 + nx * 0.6} ${ey * 0.5 + ny * 0.6} ${ex} ${ey} Q ${ex * 0.5 - nx * 0.6} ${ey * 0.5 - ny * 0.6} ${-nx} ${-ny} Z`, fill: TREE_COLOUR[b.tree], 'fill-opacity': '0.11' }));
    }
    for (const e of layout.edges) {
      const to = layout.byId.get(e.to);
      const from = e.from === 'root' ? { x: 0, y: 0 } : layout.byId.get(e.from);
      // Bend each conduit a little, like a branch, not a ruler line.
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const bend = 0.08 * len;
      const cx = mx + (-(to.y - from.y) / len) * bend, cy = my + ((to.x - from.x) / len) * bend;
      const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
      const lit = (c.skills[e.to] || 0) > 0;
      const ready = !lit && reachable(c, e.to);
      const colour = TREE_COLOUR[e.trees[0]];
      const cls = `ui-conduit ${lit ? 'is-lit' : ready ? 'is-ready' : 'is-dim'}${fresh === e.to && !reducedMotion() ? ' is-fresh' : ''}`;
      g.append(svg('path', { d, class: `${cls} ui-conduit-base` }));
      g.append(svg('path', { d, class: cls, stroke: colour, 'data-edge': `${e.from}>${e.to}`, pathLength: '1' }));
    }
    return g;
  }

  function nodeButton(c, n) {
    const s = SKILL.get(n.id);
    const rank = c.skills[n.id] || 0;
    const state = nodeState(c, n.id);
    const art = state === 'locked' ? 'node-locked' : rank > 0 ? 'node-learned' : 'node-available';
    const shared = s.trees.length > 1;
    // Names sit on the outside of the node, away from the root, so neighbours never cover them.
    const cos = Math.cos((n.angle * Math.PI) / 180), sin = Math.sin((n.angle * Math.PI) / 180);
    const side = sin < -0.45 ? 'up' : cos > 0.55 ? 'right' : cos < -0.55 ? 'left' : 'down';
    const b = el('button', {
      type: 'button',
      'data-label': side,
      class: `ui-node is-${state}${shared ? ' is-shared' : ''}${selected === n.id ? ' is-selected' : ''}${fresh === n.id && !reducedMotion() ? ' is-fresh' : ''}`,
      style: `left:${pct(n.x)};top:${pct(n.y)};--node-art:url("${uiArt(art)}");--tree:${TREE_COLOUR[s.trees[0]]};--tree2:${TREE_COLOUR[s.trees[1] || s.trees[0]]}`,
      'data-skill': n.id,
      'data-state': state,
      'aria-pressed': String(selected === n.id),
      'aria-label': `${s.name}, ${s.trees.map((t) => TREE_NAME[t]).join(' and ')}, rank ${rank} of ${s.max}${state === 'available' || state === 'learned-more' ? ', can learn' : ''}`,
      on: { click: () => { selected = n.id; confirmAll = false; render(store.get()); } },
    },
    el('span', { class: 'ui-node-rank', text: `${rank}/${s.max}`, 'aria-hidden': 'true' }),
    el('span', { class: 'ui-node-name', text: s.name, 'aria-hidden': 'true' }));
    const unlocks = unlockList(s);
    if (unlocks.length) b.append(glyph(unlocks[0].kind, 'ui-node-kind'));
    if (fresh === n.id && !reducedMotion()) b.append(el('i', { class: 'ui-burst', 'aria-hidden': 'true' }));
    return b;
  }

  function detail(save) {
    const c = save.character;
    if (!selected) {
      return el('div', { class: 'ui-skill-card is-empty' },
        el('p', { class: 'ui-eyebrow', text: 'HOW IT WORKS' }),
        el('p', { text: 'Each rank costs 1 skill point. Lit nodes are ready to learn; locked ones need points in their tree first. Skills between two trees count toward both.' }),
        el('p', { class: 'ui-note', text: tutorialOn(save) ? 'Changed your mind? Taking points back is free while Chibby is still showing you around.' : 'Changed your mind? You can take points back for a small fee.' }));
    }
    const s = SKILL.get(selected);
    const rank = c.skills[selected] || 0;
    const words = skillWords(s, rank);
    const can = canLearn(c, selected);
    const back = canUnlearn(c, selected);
    const fee = respecCost(1, { tutorial: tutorialOn(save) }).money;
    return el('div', { class: 'ui-skill-card', 'data-detail': selected },
      el('p', { class: 'ui-eyebrow', text: `${words.trees.join(' + ').toUpperCase()}${s.trees.length > 1 ? ' · SHARED' : ''}` }),
      el('h4', { text: s.name }),
      el('p', { class: 'ui-skill-blurb', text: s.blurb }),
      el('dl', { class: 'ui-skill-facts' },
        ...(words.unlocks.length ? [
          el('dt', { text: 'Unlocks' }),
          el('dd', {}, el('ul', { class: 'ui-unlocks' }, words.unlocks.map((u) => el('li', { class: rank >= u.rank ? 'is-open' : null },
            glyph(u.kind), el('span', { text: u.rank > 1 ? `${u.text} (rank ${u.rank})` : u.text }))))),
          el('dt', { text: 'You have' }), el('dd', { text: `Rank ${rank} of ${s.max}` }),
        ] : [
          el('dt', { text: 'Each rank' }), el('dd', { text: words.perRank }),
          el('dt', { text: 'You have' }), el('dd', { text: rank ? `Rank ${rank} of ${s.max}: ${words.now}` : `Rank 0 of ${s.max}` }),
        ]),
        el('dt', { text: 'Cost' }), el('dd', { text: words.cost }),
        el('dt', { text: 'Needs' }), el('dd', { text: words.needs })),
      el('div', { class: 'ui-skill-actions' },
        el('button', { type: 'button', class: 'ui-btn primary', 'data-learn': selected, disabled: !can.ok, text: rank >= s.max ? 'Top rank' : rank ? `Learn rank ${rank + 1}` : 'Learn', on: { click: () => learn(selected) } }),
        el('button', { type: 'button', class: 'ui-btn', 'data-unlearn': selected, disabled: !back.ok, text: `Take back 1${fee ? ` (${fee} cr)` : ' (free)'}`, on: { click: () => takeBack(selected) } })),
      !can.ok && rank < s.max ? el('p', { class: 'ui-why', text: can.reason }) : null,
      !back.ok && rank > 0 ? el('p', { class: 'ui-why', text: back.reason }) : null);
  }

  function render(save = store.get()) {
    const c = save.character;
    if (!c) { root.replaceChildren(); return; }
    const points = unspentPoints(c);
    const quote = respecQuote(c, { tutorial: tutorialOn(save) });
    const stage = el('div', { class: 'ui-tree', role: 'group', 'aria-label': 'Skill tree' },
      drawConnectors(c),
      el('div', { class: 'ui-tree-root', style: `left:50%;top:50%;--captain:${c.look.color}`, 'aria-hidden': 'true' }, el('span', { text: String(points) })),
      ...layout.branches.map((b) => el('div', {
        class: 'ui-branch-label', style: `left:${pct(b.x)};top:${pct(b.y)};--tree:${TREE_COLOUR[b.tree]}`,
      }, el('img', { src: uiArt(`icon-${b.tree}`), alt: '' }), el('span', { text: `${TREE_NAME[b.tree]} ${treePoints(c, b.tree)}` }))),
      ...layout.nodes.map((n) => nodeButton(c, n)));
    const respecBtn = el('button', {
      type: 'button', class: `ui-btn${confirmAll ? ' danger' : ''}`, id: 'ui-respec-all', disabled: !quote.points,
      text: confirmAll ? `Refund all ${quote.points}${quote.cost.money ? ` for ${quote.cost.money} cr` : ''}? Yes` : `Respec all${quote.points ? (quote.cost.money ? ` (${quote.cost.money} cr)` : ' (free)') : ''}`,
      on: { click: () => { if (confirmAll) respecEverything(); else { confirmAll = true; render(store.get()); } } },
    });
    root.replaceChildren(
      el('div', { class: 'ui-tree-head' },
        el('div', { class: 'ui-points' },
          el('img', { src: uiArt('icon-skillpoint'), alt: '' }),
          el('span', {}, el('b', { 'data-points': 'unspent', text: String(points) }), ` to spend · ${spentPoints(c)} spent`)),
        respecBtn),
      el('div', { class: 'ui-tree-wrap' }, stage),
      detail(save),
    );
    // On a narrow screen the tree is wider than the panel: start centred on the root.
    const wrap = root.querySelector('.ui-tree-wrap');
    if (wrap && wrap.scrollWidth > wrap.clientWidth && !wrap.dataset.centred) {
      wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
      wrap.dataset.centred = '1';
    }
  }

  return {
    render,
    select(id) { selected = SKILL.has(id) ? id : null; render(); },
    get selected() { return selected; },
  };
}
