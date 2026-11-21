// Mop the goo (opening track C, scene 1): wipe strokes on the goo puddles. Pure: no DOM, no clock. The view feeds pointer
// positions in grid cells; a test can play any hand.
//
//   The floor is a COLS x ROWS grid of cells; each holds goo from 0 (clean) to 1 (thick). Goo starts in puddles: a base of
//   five, plus two more for every point of "mess" the earlier beats made (a lost valve floods the room, a lost hose sprays it).
//   Dragging the mop head over a cell lifts goo from every cell within the head's reach. Slime is sticky, so a plain head lifts
//   little on each pass; an absorber head (the craft step at the cart) lifts 2.4 times as much, a loose one 1.6 times.
//   Done when 92% of the starting goo is gone.
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const COLS = 24, ROWS = 14;
export const CLEAR_AT = 0.92;
export const REACH = 1.25;                 // the head's reach, in cells (a head 2.5 cells wide)
export const SAMPLE = 0.25;                // one lift for every quarter cell of travel
export const MAX_JUMP = 4;                 // a pointer jump longer than this (cells) is a lift and a new press, not a stroke
export const BASE_PUDDLES = 5, PUDDLES_PER_MESS = 1, MAX_PUDDLES = 12;
export const BASE_POWER = 0.11; // tuned by play: a plain head about 25 s on a normal floor, an absorber head about 10 s
/** Mop heads: how much more each lifts than the plain head. */
export const HEADS = Object.freeze({
  plain: Object.freeze({ id: 'plain', name: 'Plain head', mult: 1 }),
  loose: Object.freeze({ id: 'loose', name: 'Loose absorber head', mult: 1.6 }),
  absorber: Object.freeze({ id: 'absorber', name: 'Absorber head', mult: 2.4 }),
});
export const headOf = (id) => HEADS[id] || HEADS.plain;
export const powerOf = (head) => BASE_POWER * headOf(head).mult;

/** How many puddles a room with this much mess has. */
export const puddlesFor = (mess = 0) => Math.min(MAX_PUDDLES, BASE_PUDDLES + PUDDLES_PER_MESS * Math.max(0, Math.trunc(mess) || 0));

/** cols x rows: the floor's grid (24 x 14 wide, or 14 x 22 for a tall phone screen: the view picks the one that fills the screen). */
export function createMop({ seed = 1, mess = 0, head = 'plain', cols = COLS, rows = ROWS } = {}) {
  let rng = hashSeed('mop', seed, mess);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const COLS = cols, ROWS = rows;
  const goo = new Array(COLS * ROWS).fill(0);
  const n = puddlesFor(mess);
  // Puddles are placed on a loose grid so they spread over the floor instead of piling up.
  const spots = [];
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 5; gx++) spots.push([(gx + 0.5) * (COLS / 5), (gy + 0.5) * (ROWS / 3)]);
  for (let k = spots.length - 1; k > 0; k--) { const j = Math.min(k, Math.floor(rand() * (k + 1))); [spots[k], spots[j]] = [spots[j], spots[k]]; }
  const puddles = [];
  for (let i = 0; i < n; i++) {
    const [bx, by] = spots[i % spots.length];
    const r = 1.5 + rand() * 1.5;
    const cx = Math.max(r, Math.min(COLS - r, bx + (rand() - 0.5) * 2)), cy = Math.max(r, Math.min(ROWS - r, by + (rand() - 0.5) * 2));
    const thick = 0.7 + rand() * 0.3;
    puddles.push({ cx, cy, r, thick });
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) goo[y * COLS + x] = Math.max(goo[y * COLS + x], thick * (1 - 0.35 * (d / r)));
    }
  }
  const total = goo.reduce((a, b) => a + b, 0);
  return { cols: COLS, rows: ROWS, goo, puddles, total, head: HEADS[head] ? head : 'plain', power: powerOf(head), x: null, y: null, down: false, strokes: 0, travel: 0, lifted: 0, done: false, result: null, mess, events: [] };
}

/** The share of the starting goo that is gone, 0..1. */
export const cleared = (s) => (s.total <= 0 ? 1 : Math.max(0, Math.min(1, 1 - s.goo.reduce((a, b) => a + b, 0) / s.total)));
/** Cells that still hold goo worth drawing. */
export const gooLeft = (s) => s.goo.filter((g) => g > 0.02).length;

/** Put the mop down at (x, y) in grid cells. */
export function mopDown(s, x, y) {
  if (s.done) return s;
  s.down = true; s.x = x; s.y = y; s.strokes++;
  return s;
}

/** Lift the mop. */
export function mopUp(s) { s.down = false; return s; }

function lift(s, x, y) {
  const COLS = s.cols, ROWS = s.rows;
  const x0 = Math.max(0, Math.floor(x - REACH)), x1 = Math.min(COLS - 1, Math.floor(x + REACH));
  const y0 = Math.max(0, Math.floor(y - REACH)), y1 = Math.min(ROWS - 1, Math.floor(y + REACH));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) > REACH) continue;
    const i = cy * COLS + cx;
    if (s.goo[i] <= 0) continue;
    const take = Math.min(s.goo[i], s.power * SAMPLE);
    s.goo[i] -= take; s.lifted += take;
  }
}

/** Drag the mop to (x, y): lifts goo along the way. Returns the state. */
export function mopMove(s, x, y) {
  if (s.done || !s.down) return s;
  const dx = x - s.x, dy = y - s.y;
  const dist = Math.hypot(dx, dy);
  if (dist > MAX_JUMP) { s.x = x; s.y = y; s.strokes++; return s; }
  const steps = Math.max(1, Math.round(dist / SAMPLE));
  for (let k = 1; k <= steps; k++) lift(s, s.x + (dx * k) / steps, s.y + (dy * k) / steps);
  s.travel += dist; s.x = x; s.y = y;
  if (cleared(s) >= CLEAR_AT) finish(s);
  return s;
}

function finish(s) {
  s.done = true; s.down = false;
  for (let i = 0; i < s.goo.length; i++) s.goo[i] = 0; // the last streaks come up with the last stroke
  s.result = { success: true, cleared: 1, strokes: s.strokes, travel: Math.round(s.travel * 10) / 10, head: s.head, power: s.power, puddles: s.puddles.length, mess: s.mess, xp: 0 };
  s.events.push({ type: 'done', ...s.result });
}

/**
 * A straight sweep from one side to the other, for tests and bots: one stroke across `row` (a row y in cells), left to right.
 * Returns the state. Real hands wander; this is the cleanest a stroke can be.
 */
export function sweepRow(s, y, from = 0, to = s.cols) {
  mopDown(s, from, y);
  for (let x = from + 1; x <= to && !s.done; x++) mopMove(s, x, y);
  mopUp(s);
  return s;
}

/** Cells' travel needed to finish with this head, by a bot that sweeps rows back and forth 2 cells apart (the head's width). */
export function sweepsToClear(opts = {}) {
  const s = createMop(opts);
  let rows = 0;
  for (let pass = 0; pass < 60 && !s.done; pass++) {
    for (let y = 1; y < ROWS && !s.done; y += 2) { sweepRow(s, y); rows++; }
  }
  return { rows, travel: s.travel, done: s.done };
}
