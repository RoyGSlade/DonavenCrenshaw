// The datapad's Skills page (skills-menu lane, 2026-11-18): the approved design
// (launch/skills-menu/design-round1/Main.dc.html and Phone.dc.html) built into the new game,
// replacing the old node tree. The DOM is built once and painted from the save, so the
// re-tint, the XP bar and the notch pulse animate instead of jumping. All words go through
// textContent. Every numeric thing comes from skills/model.js; every picture is asked for
// through skills/art.js (the FLUX kit, with the design's inline SVG and CSS as the stand-in).
import { el, fill } from '../datapad/dom.js';
import { napLine } from '../datapad/nap.js';
import { spend } from '../economy.js';
import { createSkillSave } from '../skillSave.js';
import { skillArt } from './art.js';
import * as M from './model.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};
const hueOf = (hex) => {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
};
const CYAN_HUE = 178; // the card's trim in the FLUX picture
const arc = (i, r) => {
  const a0 = (-90 + i * 40 + 5) * Math.PI / 180, a1 = (-90 + i * 40 + 35) * Math.PI / 180;
  const f = (n) => n.toFixed(2);
  return `M ${f(88 + r * Math.cos(a0))} ${f(88 + r * Math.sin(a0))} A ${r} ${r} 0 0 1 ${f(88 + r * Math.cos(a1))} ${f(88 + r * Math.sin(a1))}`;
};
const cssUrl = (u) => (u ? `url("${u}")` : 'none');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * root: the page's section. store, toast. skillSave: voyage/skillSave.js facade (made from the store when not given).
 * tutorialOn(save), reducedMotion(). onTrain({ skill, gameId }), onScan(): the floor's own doors (default: a plain line).
 * art(piece): a URL or null (default: the FLUX kit through skills/art.js).
 */
export function createSkillsPage({ root, store, toast = () => {}, skillSave = null, tutorialOn = () => false, reducedMotion = () => false, onTrain = null, onScan = null, art = skillArt, openLicence = () => {} }) {
  const sk = skillSave || createSkillSave({ store, economy: { on: false } });
  const state = { selected: 'repair', pending: {}, fresh: null, busy: false, note: '' };
  const A = {
    ring: art('ring-frame'), card: art('card-frame'), nEmpty: art('notch-empty'), nFilled: art('notch-filled'),
    lit: (id) => art(`emblem-${id}-lit`), dim: (id) => art(`emblem-${id}-dim`),
  };

  const page = el('div', { class: 'sk-page', 'data-own-arrows': '', dataset: { skill: state.selected } });
  const wrap = el('div', { class: 'sk-wrap' }, page);
  page.style.setProperty('--art-ring', cssUrl(A.ring));
  page.style.setProperty('--art-card', cssUrl(A.card));
  page.style.setProperty('--art-notch-empty', cssUrl(A.nEmpty));
  page.style.setProperty('--art-notch-filled', cssUrl(A.nFilled));
  page.classList.toggle('has-ring-art', Boolean(A.ring));
  page.classList.toggle('has-card-art', Boolean(A.card));
  page.classList.toggle('has-notch-art', Boolean(A.nEmpty && A.nFilled));

  // --- the emblem: the kit's badge when there is one, else the design's line icon ---
  function emblem(id, { lit = true, size = 22 } = {}) {
    const url = lit ? A.lit(id) : A.dim(id);
    if (url) return el('img', { class: 'sk-emblem', src: url, alt: '', width: size, height: size, 'data-art': lit ? 'lit' : 'dim' });
    const color = lit ? '#0A1220' : M.SKILL_UI[id].color;
    return svg('svg', { class: 'sk-emblem sk-emblem-line', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svg('path', { d: M.SKILL_UI[id].icon }));
  }

  // --- rail ---
  const tiles = M.SKILL_ORDER.map((id) => {
    const ui = M.SKILL_UI[id];
    const iconBox = el('span', { class: 'sk-icon' });
    const lv = el('span', { class: 'sk-lv' });
    const segs = Array.from({ length: 9 }, () => el('span', { class: 'sk-seg' }));
    const badge = el('span', { class: 'sk-badge', hidden: true });
    const b = el('button', { type: 'button', class: 'sk-tile', 'data-skill-tile': id, style: `--c:${ui.color};--c-soft:${M.tint(ui.color, 0.16)};--c-glow:${M.tint(ui.color, 0.22)};--c-line:${M.tint(ui.color, 0.35)};--c-icon:${M.tint(ui.color, 0.12)}` },
      iconBox,
      el('span', { class: 'sk-tile-body' }, el('span', { class: 'sk-tile-top' }, el('span', { class: 'sk-tile-name', text: ui.name }), el('span', { class: 'sk-tile-short', text: ui.short }), lv), el('span', { class: 'sk-segs' }, segs)),
      badge);
    b.addEventListener('click', () => select(id));
    return { id, b, iconBox, lv, segs, badge };
  });
  const rail = el('nav', { class: 'sk-rail', 'aria-label': 'Skills' }, el('div', { class: 'sk-eyebrow', text: 'SKILLS · 8' }), tiles.map((t) => t.b));

  // --- hero ---
  const ringSvg = svg('svg', { class: 'sk-ring-svg', viewBox: '0 0 176 176', role: 'img' });
  const arcs = Array.from({ length: 9 }, () => { const p = svg('path', { fill: 'none', 'stroke-linecap': 'round' }); ringSvg.append(p); return p; });
  const ringArt = el('div', { class: 'sk-ring-art', 'aria-hidden': 'true' });
  const heroEmblem = el('div', { class: 'sk-hero-emblem' });
  const heroLevel = el('div', { class: 'sk-hero-level' });
  const ring = el('div', { class: 'sk-ring' }, ringArt, ringSvg, el('div', { class: 'sk-ring-centre' }, heroEmblem, heroLevel, el('div', { class: 'sk-of9', text: 'OF 9' })));
  const eyebrow = el('div', { class: 'sk-hero-eyebrow' });
  const title = el('h1', { class: 'sk-title' });
  const tagline = el('p', { class: 'sk-tagline' });
  const xpFill = el('div', { class: 'sk-xp-fill' });
  const xpText = el('div', { class: 'sk-xp-text' });
  const chip = el('div', { class: 'sk-chip', 'data-chip': '' });
  const lockIn = el('button', { type: 'button', class: 'sk-btn sk-lock', 'data-lock': '', hidden: true });
  const undo = el('button', { type: 'button', class: 'sk-btn sk-undo', 'data-undo': '', text: 'Undo', hidden: true });
  const note = el('p', { class: 'sk-note', 'data-note': '', role: 'status', 'aria-live': 'polite' });
  const bunk = el('p', { class: 'sk-bunk', 'data-bunk-line': '' });
  const hero = el('section', { class: 'sk-hero', 'aria-label': 'Selected skill' },
    el('i', { class: 'sk-sweep', 'aria-hidden': 'true' }), ring,
    el('div', { class: 'sk-hero-body' }, eyebrow, title, tagline, el('div', { class: 'sk-xp' }, el('div', { class: 'sk-xp-bar' }, xpFill), xpText)),
    el('div', { class: 'sk-hero-side' }, chip, el('div', { class: 'sk-lock-row' }, lockIn, undo), note,
      el('p', { class: 'sk-hint', text: 'One point per level. Spend them in any path, then lock them in.' })));
  lockIn.addEventListener('click', () => lock());
  undo.addEventListener('click', () => { state.pending = M.clearPending(state.pending, state.selected); state.note = ''; paint(); });

  // --- the three paths ---
  const cats = [0, 1, 2].map((ci) => {
    const name = el('h2', { class: 'sk-cat-name' });
    const count = el('span', { class: 'sk-cat-count' });
    const notches = Array.from({ length: 9 }, (_, j) => {
      const n = el('button', { type: 'button', class: 'sk-notch', 'data-n': String(j), 'data-state': 'empty' });
      n.addEventListener('click', () => press(ci, j));
      n.addEventListener('animationend', () => n.classList.remove('is-fresh'));
      return n;
    });
    const track = el('div', { class: 'sk-track', role: 'group' }, notches);
    const now = el('div', { class: 'sk-now', 'data-now': '' });
    const next = el('div', { class: 'sk-next', 'data-next': '' });
    const minus = el('button', { type: 'button', class: 'sk-btn sk-minus', 'data-minus': '', text: '−' });
    const plusLong = el('span', { class: 'sk-long', text: 'Spend a point' });
    const plus = el('button', { type: 'button', class: 'sk-btn sk-plus', 'data-plus': '' }, plusLong, el('span', { class: 'sk-short', text: '+', 'aria-hidden': 'true' }));
    minus.addEventListener('click', () => minusPress(ci));
    plus.addEventListener('click', () => plusPress(ci));
    const card = el('article', { class: 'sk-cat', 'data-cat-index': String(ci) },
      el('div', { class: 'sk-cat-head' }, name, count),
      el('div', { class: 'sk-cat-text' }, el('div', { class: 'sk-label', text: 'NOW' }), now, el('div', { class: 'sk-label sk-label-next', text: 'ONE MORE POINT' }), next),
      el('div', { class: 'sk-cat-row' }, minus, track, plus));
    return { card, name, count, notches, track, now, next, minus, plus };
  });
  const paths = el('section', { class: 'sk-paths', 'aria-label': 'Upgrade paths' }, cats.map((c) => c.card));

  // --- side: risk and training ---
  const riskLine = el('div', { class: 'sk-risk-line', 'data-risk-line': '' });
  const riskFill = el('div', { class: 'sk-risk-fill' });
  const scanBtn = el('button', { type: 'button', class: 'sk-btn sk-scan', 'data-scan': '' }, el('span', { class: 'sk-long', text: `Scan at the reprinter · ${M.SCAN_COST} cr` }), el('span', { class: 'sk-short', 'data-risk-short': '' }));
  const risk = el('section', { class: 'sk-risk', 'aria-label': 'If you die now' },
    el('div', { class: 'sk-risk-title', text: 'IF YOU DIE NOW' }), riskLine, el('div', { class: 'sk-risk-bar' }, riskFill),
    el('div', { class: 'sk-risk-help', text: 'Progress since your last scan is what a death takes. Scan to lock it in.' }), scanBtn);
  const trainGame = el('div', { class: 'sk-train-game', 'data-train-game': '' });
  const trainLine = el('div', { class: 'sk-train-line' });
  const trainBtn = el('button', { type: 'button', class: 'sk-btn sk-train', 'data-train': '' }, el('span', { class: 'sk-long', 'data-train-label': '' }), el('span', { class: 'sk-short', 'data-train-short': '' }));
  const train = el('section', { class: 'sk-trainbox', 'aria-label': 'Train it' },
    el('div', { class: 'sk-train-title', text: 'TRAIN IT' }), trainGame, trainLine, trainBtn,
    el('div', { class: 'sk-train-help', text: "A win pays a quarter of a job's XP. Up to 6 XP per skill an hour." }));
  const side = el('aside', { class: 'sk-side', 'aria-label': 'Risk and training' }, risk, train);
  scanBtn.addEventListener('click', () => scanPress());
  trainBtn.addEventListener('click', () => trainPress());

  const head = el('div', { class: 'sk-total', 'data-total': '' });
  const empty = el('div', { class: 'dp-empty', hidden: true },
    el('p', { class: 'ui-eyebrow', text: 'NO CAPTAIN YET' }), el('h2', { text: 'Nobody to show yet.' }),
    el('p', { text: "Sign the captain's licence first: a face, a name and five rolls of the die." }),
    el('button', { type: 'button', class: 'ui-btn primary', text: 'Open the licence', on: { click: () => openLicence() } }));
  page.append(el('i', { class: 'sk-halo', 'aria-hidden': 'true' }), head, rail, el('main', { class: 'sk-main' }, hero, paths, bunk), side);
  root.replaceChildren(wrap, empty);

  // --- actions ---
  const view = () => sk.view();
  function select(id, { focus = false } = {}) {
    if (!M.SKILL_UI[id]) return;
    state.selected = id; state.fresh = null; state.note = '';
    paint();
    if (focus) tiles.find((t) => t.id === id)?.b.focus({ preventScroll: true });
  }
  function press(ci, j) {
    const v = view(); if (!v) return;
    const cat = M.SKILL_UI[state.selected].cats[ci].id;
    const r = M.pressNotch(v.progress, state.pending, state.selected, cat, j);
    state.pending = r.pending; state.note = r.words;
    state.fresh = r.kind === 'add' ? { skill: state.selected, ci, j: r.fresh } : null;
    paint();
    cats[ci].notches[j]?.focus({ preventScroll: true });
  }
  function plusPress(ci) {
    const v = view(); if (!v) return;
    const cat = M.SKILL_UI[state.selected].cats[ci].id;
    const before = M.pointsIn(v.progress, state.pending, state.selected, cat);
    state.pending = M.addPending(v.progress, state.pending, state.selected, cat);
    const after = M.pointsIn(v.progress, state.pending, state.selected, cat);
    state.note = after === before ? (M.leftOf(v.progress, state.pending, state.selected) <= 0 ? 'No free point. Level up to earn one.' : 'That path is full.') : '';
    state.fresh = after > before ? { skill: state.selected, ci, j: after - 1 } : null;
    paint();
  }
  function minusPress(ci) {
    const v = view(); if (!v) return;
    const cat = M.SKILL_UI[state.selected].cats[ci].id;
    const had = (state.pending[state.selected]?.[cat] || 0) > 0;
    state.pending = M.takePending(v.progress, state.pending, state.selected, cat);
    state.fresh = null;
    state.note = had ? '' : ((v.progress.points?.[state.selected]?.[cat] || 0) > 0 ? 'That point is locked in. To get it back, take a nap at your bunk.' : '');
    paint();
  }
  async function lock() {
    const v = view(); if (!v || state.busy) return;
    const skill = state.selected;
    const n = M.pendingCount(state.pending, skill);
    if (!n) return;
    state.busy = true; paint();
    const r = await sk.spend(skill, M.lockSpread(v.progress, state.pending, skill));
    state.busy = false;
    if (r.ok) { state.pending = M.clearPending(state.pending, skill); state.note = `Locked in ${plural(n, 'point')}.`; toast(state.note); } else { state.note = r.words || 'That did not work.'; toast(state.note); }
    paint();
  }
  async function scanPress() {
    if (onScan) { onScan(); return; }
    const save = store.get();
    if (!save.character) return;
    if (sk.hub) { const r = await sk.scan(); toast(r.ok ? 'Scanned. Everything so far is safe.' : r.words); return; }
    const paid = spend(save, { money: M.SCAN_COST });
    if (!paid.ok) { toast(paid.reason); return; }
    store.update(() => paid.save);
    await sk.scan();
    toast(`Scanned for ${M.SCAN_COST} cr. Everything so far is safe.`);
  }
  function trainPress() {
    const t = M.trainView(state.selected);
    if (!t.canTrain) return;
    if (onTrain) onTrain({ skill: state.selected, gameId: t.gameId }); else toast('The holodeck door is not on this map yet.');
  }

  // --- paint: save + local state -> the page ---
  function paint(save = store.get()) {
    const v = save.character ? view() : null;
    empty.hidden = Boolean(v);
    wrap.hidden = !v;
    if (!v) return;
    const { progress, scan } = v;
    state.pending = M.tidyPending(progress, state.pending);
    const id = state.selected, ui = M.SKILL_UI[id], c = ui.color;
    page.dataset.skill = id;
    page.classList.toggle('is-still', reducedMotion());
    for (const [k, val] of Object.entries({ '--sk': c, '--sk-soft': M.tint(c, 0.18), '--sk-glow': M.tint(c, 0.35), '--sk-line': M.tint(c, 0.55), '--sk-hue': `${hueOf(c) - CYAN_HUE}deg` })) page.style.setProperty(k, val);
    head.textContent = `${plural(M.totalUnspent(progress, state.pending), 'point')} unspent`;
    head.dataset.count = String(M.totalUnspent(progress, state.pending));

    for (const t of tiles) {
      const on = t.id === id, level = progress.levels[t.id], left = M.leftOf(progress, state.pending, t.id);
      t.b.setAttribute('aria-pressed', String(on));
      t.b.setAttribute('aria-label', `${M.SKILL_UI[t.id].name}, level ${level}${left ? `, ${plural(left, 'point')} to spend` : ''}`);
      t.b.tabIndex = on ? 0 : -1;
      t.lv.textContent = `LV ${level}`;
      t.segs.forEach((s, i) => s.classList.toggle('on', i < level));
      t.badge.hidden = left <= 0;
      t.badge.textContent = `+${left}`;
      const want = A.lit(t.id) ? (on ? 'lit' : 'dim') : (on ? 'line-lit' : 'line-dim');
      if (t.iconBox.dataset.kind !== want) { t.iconBox.dataset.kind = want; t.iconBox.replaceChildren(emblem(t.id, { lit: on, size: 40 })); }
    }

    const h = M.heroView(progress, state.pending, id);
    const r = A.ring ? 67 : 76, sw = A.ring ? 8 : 10;
    ringSvg.setAttribute('aria-label', `${ui.name} level ${h.level} of 9`);
    arcs.forEach((p, i) => { p.setAttribute('d', arc(i, r)); p.setAttribute('stroke-width', String(sw)); p.setAttribute('stroke', h.ring[i].on ? c : '#22324A'); p.dataset.on = String(h.ring[i].on); p.classList.toggle('on', h.ring[i].on); });
    const emb = A.lit(id) ? 'art' : 'line';
    if (heroEmblem.dataset.skill !== `${id}:${emb}`) { heroEmblem.dataset.skill = `${id}:${emb}`; heroEmblem.replaceChildren(emblem(id, { lit: true, size: A.ring ? 84 : 46 })); if (!A.lit(id)) heroEmblem.firstChild.setAttribute('stroke', c); }
    heroLevel.textContent = String(h.level);
    eyebrow.textContent = `SKILL · ${h.index} OF 8`;
    title.textContent = ui.name; tagline.textContent = ui.tagline;
    xpFill.style.width = `${h.pct}%`;
    xpText.textContent = h.xpLine;
    chip.textContent = h.chip; chip.classList.toggle('is-live', h.left > 0 && h.pendingCount === 0); chip.classList.toggle('is-pending', h.pendingCount > 0);
    const np = M.pendingCount(state.pending, id);
    lockIn.hidden = undo.hidden = np === 0;
    lockIn.textContent = state.busy ? 'Locking in…' : `Lock in ${plural(np, 'point')}`;
    lockIn.disabled = state.busy;
    note.textContent = state.note;
    bunk.replaceChildren(el('span', { class: 'sk-bunk-mark', 'aria-hidden': 'true', text: '☾' }), el('span', { text: napLine(tutorialOn(save), { hub: Boolean(sk.hub) }) }));

    const rows = M.catRows({ skill: id, level: progress.levels[id], locked: M.lockedOf(progress, id), pending: state.pending[id] || {} });
    cats.forEach((cc, ci) => {
      const row = rows[ci];
      cc.name.textContent = row.name;
      cc.count.textContent = `${row.points} / 9`;
      cc.track.setAttribute('aria-label', `${row.name}: ${row.points} of 9 points${row.pending ? `, ${row.pending} not locked in yet` : ''}`);
      cc.notches.forEach((n, j) => {
        const st = j < row.locked ? 'locked' : j < row.points ? 'pending' : 'empty';
        n.dataset.state = st;
        n.setAttribute('aria-label', `${row.name} point ${j + 1}, ${st === 'locked' ? 'locked in' : st === 'pending' ? 'not locked in yet' : 'empty'}`);
        n.setAttribute('aria-pressed', String(st !== 'empty'));
        n.tabIndex = j === Math.max(0, Math.min(8, row.points - (row.points > 0 ? 1 : 0))) || (row.points === 0 && j === 0) ? 0 : -1;
        const fresh = state.fresh && state.fresh.skill === id && state.fresh.ci === ci && state.fresh.j === j;
        if (fresh) { n.classList.remove('is-fresh'); void n.offsetWidth; n.classList.add('is-fresh'); }
      });
      cc.now.textContent = row.now;
      cc.next.textContent = row.nextWords;
      cc.next.classList.toggle('is-free', row.canAdd);
      cc.minus.classList.toggle('is-off', row.pending === 0);
      cc.minus.setAttribute('aria-disabled', String(row.pending === 0));
      cc.minus.setAttribute('aria-label', `Take back a point from ${row.name} (only points not locked in)`);
      cc.plus.classList.toggle('is-off', !row.canAdd);
      cc.plus.setAttribute('aria-disabled', String(!row.canAdd));
      cc.plus.setAttribute('aria-label', `Spend a point on ${row.name}`);
    });
    state.fresh = null;

    const rk = M.riskView(progress, scan, id);
    riskLine.textContent = rk.line; riskFill.style.width = rk.pct;
    risk.classList.toggle('is-safe', rk.safe);
    scanBtn.querySelector('[data-risk-short]').textContent = M.riskShort(rk);
    const t = M.trainView(id);
    trainGame.textContent = t.game; trainLine.textContent = t.line;
    trainBtn.querySelector('[data-train-label]').textContent = t.label;
    trainBtn.querySelector('[data-train-short]').textContent = t.canTrain ? `Train · ${t.cost} cr` : 'No game';
    trainBtn.classList.toggle('is-off', !t.canTrain);
    trainBtn.setAttribute('aria-disabled', String(!t.canTrain));
  }

  // --- keys: arrows move between skills and notches; Enter and Space press the focused button (native) ---
  page.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const tile = t.closest?.('.sk-tile');
    const notch = t.closest?.('.sk-notch');
    const idx = M.SKILL_ORDER.indexOf(state.selected);
    const key = e.key;
    if (tile) {
      const phone = getComputedStyle(rail).display === 'grid';
      const prev = phone ? 'ArrowLeft' : 'ArrowUp', next = phone ? 'ArrowRight' : 'ArrowDown';
      const at = M.SKILL_ORDER.indexOf(tile.dataset.skillTile);
      let to = null;
      if (key === prev || (phone && key === 'ArrowUp' && at >= 4)) to = phone && key === 'ArrowUp' ? at - 4 : at - 1;
      else if (key === next || (phone && key === 'ArrowDown' && at < 4)) to = phone && key === 'ArrowDown' ? at + 4 : at + 1;
      else if (key === 'Home') to = 0; else if (key === 'End') to = 7;
      else if (!phone && key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); cats[0].notches.find((n) => n.tabIndex === 0)?.focus(); return; }
      if (to !== null && to >= 0 && to < 8) { e.preventDefault(); e.stopPropagation(); select(M.SKILL_ORDER[to], { focus: true }); return; }
      if (key.startsWith('Arrow')) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (notch) {
      const card = notch.closest('.sk-cat'); const ci = Number(card.dataset.catIndex); const j = Number(notch.dataset.n);
      const go = (c2, j2) => { cats[c2]?.notches[j2]?.focus(); };
      if (key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (j < 8) go(ci, j + 1); }
      else if (key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (j > 0) go(ci, j - 1); else if (ci > 0) go(ci - 1, 8); else tiles[idx].b.focus(); }
      else if (key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); if (ci < 2) go(ci + 1, j); }
      else if (key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); if (ci > 0) go(ci - 1, j); else tiles[idx].b.focus(); }
      else if (key === 'Home') { e.preventDefault(); e.stopPropagation(); go(ci, 0); }
      else if (key === 'End') { e.preventDefault(); e.stopPropagation(); go(ci, 8); }
    }
  });

  return {
    render: (save = store.get()) => paint(save),
    select, root: page,
    get selected() { return state.selected; },
    get pending() { return state.pending; },
  };
}
