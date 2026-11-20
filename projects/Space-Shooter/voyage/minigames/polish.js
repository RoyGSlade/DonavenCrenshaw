// Polish (v2/PLAN.md section 4.3): a dull plate of 40 cells and a wire wheel. Pure and clock-free: polishStep(s, dt, input) moves the
// game on by dt seconds with the hand's input, so a test can play any hand at any rate. Seeded: the same seed, the same pull.
//
//   The wheel moves at up to 220 units a second (WASD, a mouse drag, or a thumb drag: all become one input vector, length at most 1).
//   The wheel is PULLED left all the time, 40 to 140 units a second, a new strength every 1.5 to 3 s: you fight it by steering.
//   Cells under the wheel gain shine (60 a second, a Speed point 5% faster: 87 at nine). 70 is polished.
//   Keep grinding a polished cell and at 130 it DIMPLES (it stays dimpled and no longer counts).
//   The plate finishes by itself at 36 polished cells, or when you say Done (Space, or the Done pad). Three dimples ruin it.
//   Grade = polished share x 100 - 10 per dimple. (At the automatic finish that is 90 at best: the plan's own numbers.)
//   My readings: a cell is under the wheel when the wheel's middle is within 54 units of the cell's middle (cells are 60 units; so the
//   wheel covers one cell at a cell's middle and up to four at a corner); the wheel stays on the plate; a cell with 45 shine to spare
//   before its limit is HOT (the view glows it; the word says "too hot!"); the plate is 8 x 5 cells, or 5 x 8 on a portrait screen.
import { PASS, gradeWord } from './craftChain.js';

export const CELL = 60, REACH = 54, SPEED = 220, POLISHED = 70, DIMPLE_COST = 10, AUTO_AT = 36, RUIN_AT = 3, HOT_SPARE = 45, CELLS = 40;

function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

export function createPolish({ seed = 1, setup = {}, portrait = false } = {}) {
  const cols = portrait ? 5 : 8, rows = portrait ? 8 : 5;
  const s = {
    seed, setup, cols, rows, W: cols * CELL, H: rows * CELL, pullMin: setup.pullMin ?? 40, pullMax: setup.pullMax ?? 140, limit: setup.limit ?? 130, rate: setup.rate ?? 60,
    cells: Array.from({ length: cols * rows }, (_, i) => ({ i, col: i % cols, row: Math.floor(i / cols), x: (i % cols) * CELL + CELL / 2, y: Math.floor(i / cols) * CELL + CELL / 2, shine: 0, state: 'dull' })),
    wheel: { x: cols * CELL / 2, y: rows * CELL / 2 }, t: 0, segs: [], dimples: 0, polished: 0, ground: 0, events: [], done: false, result: null,
  };
  const r = lcg(seed * 2654435761 + 11); r(); r();
  let at = 0;
  for (let i = 0; i < 80; i++) { const dur = 1.5 + 1.5 * r(); s.segs.push({ from: at, to: at + dur, v: s.pullMin + (s.pullMax - s.pullMin) * r() }); at += dur; }
  return s;
}

/** The pull at time t, units a second to the left (it eases from one strength to the next over 1.2 s, so you can watch it change and answer). */
export function pullAt(s, t) {
  const i = s.segs.findIndex((g) => t < g.to), g = s.segs[i < 0 ? s.segs.length - 1 : i];
  if (i > 0) { const k = Math.min(1, (t - g.from) / 1.2); return s.segs[i - 1].v + (g.v - s.segs[i - 1].v) * k; }
  return g.v;
}
export const coveredBy = (s, wheel = s.wheel) => s.cells.filter((c) => Math.hypot(c.x - wheel.x, c.y - wheel.y) <= REACH);
export const hotAt = (s) => s.limit - HOT_SPARE;
/** The hottest cell under the wheel (null when none is polished and close to its limit). */
export const hotCell = (s) => coveredBy(s).filter((c) => c.state !== 'dimpled' && c.shine >= hotAt(s)).sort((a, b) => b.shine - a.shine)[0] || null;
export const gradeOf = (s) => Math.max(0, Math.round((s.polished / CELLS) * 100 - DIMPLE_COST * s.dimples));

/**
 * Move on by dt seconds. `input` is { x, y } (screen right and down, each -1..1; a longer vector is cut to length 1).
 * Returns the state. Does nothing once the plate is finished.
 */
export function polishStep(s, dt, input = { x: 0, y: 0 }) {
  if (s.done || !(dt > 0)) return s;
  let ix = Number.isFinite(input.x) ? input.x : 0, iy = Number.isFinite(input.y) ? input.y : 0;
  const len = Math.hypot(ix, iy); if (len > 1) { ix /= len; iy /= len; }
  const pull = pullAt(s, s.t);
  s.wheel.x = Math.max(0, Math.min(s.W, s.wheel.x + (ix * SPEED - pull) * dt));
  s.wheel.y = Math.max(0, Math.min(s.H, s.wheel.y + iy * SPEED * dt));
  s.t += dt;
  for (const c of coveredBy(s)) {
    if (c.state === 'dimpled') continue;
    c.shine += s.rate * dt;
    if (c.state === 'dull' && c.shine >= POLISHED) { c.state = 'polished'; s.polished++; s.events.push({ type: 'polished', cell: c.i }); }
    if (c.shine >= s.limit) {
      c.state = 'dimpled'; s.dimples++; s.polished--; s.events.push({ type: 'dimple', cell: c.i });
      if (s.dimples >= RUIN_AT) { finish(s, 'ruined'); return s; }
    }
  }
  if (s.polished >= AUTO_AT) finish(s, 'auto');
  return s;
}

/** Say Done (Space, or the Done pad). */
export function polishFinish(s) { if (!s.done) finish(s, 'done'); return s.result; }
export function polishGiveUp(s) { if (!s.done) finish(s, 'gave-up'); return s.result; }

function finish(s, how) {
  s.done = true;
  const grade = how === 'ruined' || how === 'gave-up' ? 0 : gradeOf(s);
  s.result = { success: grade >= PASS, grade, word: gradeWord(grade), how, polished: s.polished, dimples: s.dimples, seconds: Math.round(s.t * 10) / 10, cells: CELLS };
  s.events.push({ type: 'done', ...s.result });
}

/** Words (no numbers). */
export function plateWord(s) { return s.done ? 'done' : s.polished >= AUTO_AT ? 'done' : s.polished >= 20 ? 'nearly done' : 'keep going'; }
export function heatWord(s) {
  const cov = coveredBy(s).filter((c) => c.state !== 'dimpled');
  if (hotCell(s)) return 'too hot!';
  const top = Math.max(0, ...cov.map((c) => c.shine));
  return top >= POLISHED ? 'polished here: move on' : top > 0 ? 'grinding' : 'cool';
}
/** What the wheel's sideways motion teaches: with the pull it is fast and light, against it slow and heavy, on the spot it grinds in one place. vx: units a second, right positive. */
export function motionWord(vx) { return vx < -15 ? 'with the pull: fast and light' : vx > 15 ? 'against the pull: slow, grinds hard' : 'on the spot: grinds hard, watch the heat'; }
export function pullWord(s, t = s.t) { const p = pullAt(s, t) / s.pullMax; return p < 0.45 ? 'light pull' : p < 0.75 ? 'steady pull' : 'strong pull'; }

export function polishWhy(r) {
  if (!r || r.grade >= 95) return '';
  const bits = [];
  if (r.how === 'ruined') bits.push('three dimples ruined the plate');
  else if (r.how === 'gave-up') bits.push('given up');
  else { if (r.polished < CELLS) bits.push(`${r.polished} of ${r.cells} cells polished`); if (r.dimples) bits.push(`${r.dimples} dimple${r.dimples === 1 ? '' : 's'} (-${r.dimples * DIMPLE_COST})`); }
  return bits.join(', ') + (bits.length ? '.' : '');
}
