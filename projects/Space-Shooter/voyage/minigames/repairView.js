// The repair board on screen: a grid of pipe pieces you tap to turn, coolant that
// flows out of the pump and pours from any open end, a pool along the bottom that
// fills with the spill (no clock: the pool is the timer), and a result card. Plain DOM + inline SVG (no canvas, no art files), so a tap
// is a real button press: it works by touch and by keyboard (arrows move, Enter
// or Space turns). Resolves with the rules' result.
import { createRepair, rotateTile, stepRepair, shapeOf, N, E, S, W, nextHint, leaks } from './repair.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const SHAPE_WORDS = { straight: 'straight pipe', corner: 'bent pipe', tee: 'T pipe', end: 'pipe end', cross: 'cross pipe', blank: 'empty socket', pump: 'coolant pump', valve: 'leaking valve' };

// Pipe art for a piece in its SOLVED-agnostic base orientation: the openings are drawn straight from the mask,
// and the whole piece is rotated by CSS, so a turn animates. Base mask = the piece's mask at creation.
function pieceSvg(mask, role) {
  const g = svg('g');
  const arms = [];
  if (mask & N) arms.push([50, 0]);
  if (mask & E) arms.push([100, 50]);
  if (mask & S) arms.push([50, 100]);
  if (mask & W) arms.push([0, 50]);
  const layer = (cls) => arms.forEach(([x, y]) => g.append(svg('line', { x1: 50, y1: 50, x2: x, y2: y, class: cls })));
  layer('rp-arm'); layer('rp-water'); layer('rp-flow');
  g.append(svg('circle', { cx: 50, cy: 50, r: role === 'pump' || role === 'valve' ? 22 : 9, class: 'rp-hub' }));
  if (role === 'pump') g.append(svg('path', { d: 'M40 50h20M52 42l8 8-8 8', class: 'rp-glyph' }));
  if (role === 'valve') { // a hand wheel: rim and three spokes, coloured by CSS (red while dry, cyan once sealed)
    const wheel = svg('g', { class: 'rp-wheel' }, svg('circle', { cx: 50, cy: 50, r: 21, class: 'rp-wheel-rim' }));
    for (const a of [0, 60, 120]) wheel.append(svg('line', { x1: 50, y1: 50 - 21, x2: 50, y2: 50 + 21, class: 'rp-wheel-spoke', transform: `rotate(${a} 50 50)` }));
    wheel.append(svg('circle', { cx: 50, cy: 50, r: 5, class: 'rp-wheel-nut' }));
    g.append(wheel);
  }
  if (role === 'blank') { g.append(svg('rect', { x: 26, y: 26, width: 48, height: 48, rx: 8, class: 'rp-socket' })); }
  return svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' }, g);
}

/**
 * root: where the panel goes. opts: { seed, setup: { size, capacity, flow, qualityBonus, label, tier }, reducedMotion, sound, title }.
 * Returns a promise (with .state) resolving to the result: { success, how ('sealed' or 'flooded'), moves, par, time, spilled, quality, stars, size, xp }.
 */
export function playRepair(root, { seed = 1, setup = {}, title = 'Coolant line', reducedMotion = () => false, sound = () => {} } = {}) {
  const state = createRepair({ seed, size: setup.size, capacity: setup.capacity, flow: setup.flow, qualityBonus: setup.qualityBonus });
  const n = state.size;
  const moves = h('span', { class: 'rp-moves', text: '0 turns' });
  const poolText = h('span', { class: 'rp-time', text: 'Pool 0%' });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: 'Close every open end and bring the coolant to the valve.' });
  const board = h('div', { class: 'rp-board', role: 'grid', 'aria-label': 'Pipe board', style: `--n:${n}` });
  const streams = h('div', { class: 'rp-streams', 'aria-hidden': 'true' });
  const poolFill = h('i', { class: 'rp-pool-fill' });
  const pool = h('div', { class: 'rp-pool', role: 'progressbar', 'aria-label': 'Spill pool', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, poolFill);
  const stage = h('div', { class: 'rp-stage' }, board, streams, pool);
  const turns = state.tiles.map(() => 0); // quarter turns applied, for the CSS rotation
  const cells = state.tiles.map((t, i) => {
    const solvedLook = t.role === 'pump' ? E : t.role === 'valve' ? W : t.mask;
    const btn = h('button', { type: 'button', class: `rp-tile rp-${t.role}`, 'data-i': i, role: 'gridcell', tabindex: i === 0 ? '0' : '-1' });
    const inner = h('span', { class: 'rp-spin' });
    inner.append(pieceSvg(solvedLook, t.role));
    btn.append(inner);
    if (t.fixed) btn.setAttribute('aria-disabled', 'true');
    btn.addEventListener('click', () => turnTile(i));
    return { btn, inner, base: solvedLook };
  });
  cells.forEach((c) => board.append(c.btn));
  const label = (i) => `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${SHAPE_WORDS[state.tiles[i].role === 'pump' || state.tiles[i].role === 'valve' ? state.tiles[i].role : shapeOf(state.tiles[i].mask)]}${state.tiles[i].fixed ? '' : '. Turn.'}`;
  const hintBtn = h('button', { type: 'button', class: 'rp-hint ui-btn', text: 'Hint' });
  const panel = h('section', { class: 'rp-panel mg-skin ui-panel', role: 'group', 'aria-label': `Repair: ${title}`, 'data-size': n, 'data-tier': setup.tier ?? 0 },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `REPAIR · ${title.toUpperCase()} · ${n} x ${n}${setup.label ? ` · ${setup.label.toUpperCase()}` : ''}` }),
    h('div', { class: 'rp-hud' }, moves, poolText), stage, status,
    h('div', { class: 'rp-foot' }, hintBtn, h('span', { class: 'rp-par', text: `Par ${state.par} turns` })),
    h('p', { class: 'rp-help', text: 'Every end of every pipe the coolant reaches must meet another pipe, or it leaks. Tap a piece to turn it. Arrows move, Enter or Space turns.' }));
  panel.__state = state;
  root.append(panel);
  let raf = 0, last = 0, finish, hintAt = null;
  const promise = new Promise((r) => { finish = r; });
  promise.state = state;

  const mouths = new Map(); // "i:dir" -> element (an open end; a stream once the coolant reaches it)
  const DIRNAME = { [N]: 'n', [E]: 'e', [S]: 's', [W]: 'w' };
  function paintOpen() {
    const pouring = new Set(leaks(state).map((o) => `${o.i}:${o.dir}`));
    const want = new Set(state.done && state.result?.success ? [] : state.open.map((o) => `${o.i}:${o.dir}`));
    for (const [k, el] of mouths) if (!want.has(k)) { el.remove(); mouths.delete(k); }
    const stageH = pool.offsetTop;
    for (const o of state.done && state.result?.success ? [] : state.open) {
      const k = `${o.i}:${o.dir}`;
      let el = mouths.get(k);
      if (!el) { el = h('span', { class: `rp-mouth d-${DIRNAME[o.dir]}` }); streams.append(el); mouths.set(k, el); }
      const b = cells[o.i].btn;
      const cx = b.offsetLeft + b.offsetWidth / 2, cy = b.offsetTop + b.offsetHeight / 2;
      const x = o.dir === E ? b.offsetLeft + b.offsetWidth : o.dir === W ? b.offsetLeft : cx;
      const y = o.dir === S ? b.offsetTop + b.offsetHeight : o.dir === N ? b.offsetTop : cy;
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.style.setProperty('--fall', `${Math.max(0, stageH - y)}px`);
      el.classList.toggle('is-pouring', pouring.has(k));
    }
  }

  function paint() {
    const on = new Set(state.powered);
    state.tiles.forEach((t, i) => {
      const c = cells[i];
      const quarter = turns[i] * 90;
      c.inner.style.transform = `rotate(${quarter}deg)`;
      c.btn.classList.toggle('is-on', on.has(i) && t.wet >= 1);
      c.btn.classList.toggle('is-filling', t.wet > 0 && t.wet < 1);
      c.btn.style.setProperty('--wet', t.wet.toFixed(2));
      c.btn.classList.toggle('is-hint', hintAt === i);
      c.btn.setAttribute('aria-label', label(i));
    });
    moves.textContent = `${state.moves} turn${state.moves === 1 ? '' : 's'}`;
    const pct = Math.round((100 * state.pool) / state.capacity);
    poolText.textContent = `Pool ${pct}%`;
    poolFill.style.height = `${(100 * state.pool) / state.capacity}%`;
    pool.setAttribute('aria-valuenow', String(pct));
    pool.classList.toggle('is-high', pct >= 60);
    paintOpen();
  }

  function say() {
    const k = state.open.length;
    status.textContent = state.solved ? 'Sealed. The coolant holds.'
      : k ? `${k} open end${k === 1 ? '' : 's'} on the wet pipe. Turn pieces until every end meets another.`
      : 'Nothing leaks, but the coolant is not reaching the valve yet.';
  }

  function turnTile(i) {
    if (state.done) return;
    if (!rotateTile(state, i)) { sound('hurt'); return; }
    turns[i]++;
    if (hintAt === i) hintAt = null;
    sound('power');
    say();
    paint();
    if (state.done) end();
  }
  board.addEventListener('keydown', (e) => {
    const i = Number(document.activeElement?.dataset?.i);
    if (!Number.isInteger(i)) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: n, ArrowUp: -n }[e.key];
    if (!d) return;
    e.preventDefault();
    const j = i + d;
    if (j < 0 || j >= n * n || (Math.abs(d) === 1 && Math.floor(j / n) !== Math.floor(i / n))) return;
    cells[i].btn.tabIndex = -1; cells[j].btn.tabIndex = 0; cells[j].btn.focus();
  });
  hintBtn.addEventListener('click', () => { if (state.done) return; hintAt = nextHint(state); paint(); });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    stepRepair(state, dt);
    paint();
    if (state.done) end();
  }
  function end() {
    cancelAnimationFrame(raf);
    board.classList.add('is-done');
    cells.forEach((c) => { c.btn.disabled = true; });
    const r = state.result;
    if (r.success) cells[state.dst].btn.classList.add('is-sealed');
    // Let the coolant finish its run to the valve (or the pool finish rising) before the card.
    let wait = r.success ? 1.6 : 0.4; last = performance.now();
    const settle = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      stepRepair(state, dt); paint(); wait -= dt;
      if (wait > 0 && (!r.success || state.powered.some((i) => state.tiles[i].wet < 1))) { raf = requestAnimationFrame(settle); return; }
      show(r);
    };
    raf = requestAnimationFrame((t) => { last = t; settle(t); });
  }
  function show(r) {
    paint();
    status.textContent = r.success ? 'Sealed. The coolant holds.' : 'The pool is full. The line floods.';
    const stars = '\u2605'.repeat(r.stars) + '\u2606'.repeat(3 - r.stars);
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status' },
      h('b', { class: 'rp-stars', text: r.success ? stars : 'FLOODED' }),
      h('span', { text: r.success ? `Quality ${r.quality} \u00b7 ${r.moves} turns (par ${r.par}) \u00b7 ${r.spilled} spilled of ${state.capacity} \u00b7 +${r.xp} Repair XP` : `${r.moves} turns, no seal. No XP.` }));
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    card.append(go);
    panel.append(card);
    go.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  paint();
  if (reducedMotion()) panel.classList.add('is-still');
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}
