// Flatten (v2/PLAN.md section 4.3): a sheet with bubbles. Pick a bubble, hold to charge the hammer, let go to swing. Pure and
// clock-free: every call takes the time in seconds, so a test can play any hand. Seeded: the same seed, the same sheet.
//
//   Each bubble needs a power (30 to 80). Charge goes 0 to 100 in 1.2 s (a Speed point charges 5% faster: 0.83 s at nine).
//   Within the band of the right power (10 at a Steady roll): FLAT, the bubble is gone.
//   Too soft: the bubble shrinks by what you gave and needs another hit. Too hard: a DIMPLE that stays (-8), the bubble is gone.
//   While you charge the hammer LEANS, drifting from side to side; steer against it (the mouse, or the thumb on the Swing pad).
//   Let go with the lean past 35% and the blow lands BESIDE the bubble: a new small bubble if it was soft, a dimple if it was hard.
//   Done when no bubbles are left. Grade = 100 - 8 per dimple - 3 per swing over one a bubble.
//   My readings: the lean is a smooth seeded wander that builds over the first half second of a hold (about +-1 at a Steady roll, the roll scales it; a longer hold leans more, so a faster hammer helps) plus the steer you add, so
//   lean = wander + steer x 1 and a perfect hand steers against it exactly; a missed blow that was at least the right power is
//   "hard", a lighter one "soft"; a soft hit never leaves less than 20 to find (an 8% charge is under a tenth of a second);
//   the game ends early when the grade can no longer reach 70 (like Screw), and Give up is a grade 0.
import { PASS, gradeWord } from './craftChain.js';

export const DIMPLE_COST = 8, SWING_COST = 3, LEAN_LIMIT = 0.35, STEER_GAIN = 1.0, MIN_LEFT = 20, SMALL_NEED = 30;

function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

/** The seeded bubbles of a sheet: positions in the unit square (the view maps them to the board), needs 30 to 80. */
export function bubblesFor(seed, count) {
  const r = lcg((seed >>> 0) * 2246822519 + 5); r(); r();
  const out = [];
  for (let tries = 0; out.length < count && tries < 900; tries++) {
    const x = 0.16 + 0.68 * r(), y = 0.2 + 0.6 * r(), gap = tries < 200 ? 0.22 : tries < 500 ? 0.19 : 0.16; // relax the spacing if a sheet will not fit
    if (out.every((b) => Math.hypot(b.x - x, (b.y - y) * 0.75) > gap)) out.push({ id: out.length + 1, x: +x.toFixed(4), y: +y.toFixed(4), need: 30 + Math.floor(r() * 51) });
  }
  while (out.length < count) out.push({ id: out.length + 1, x: 0.2 + 0.12 * out.length, y: 0.5 + 0.1 * (out.length % 2), need: 30 + Math.floor(r() * 51) });
  return out;
}

export function createFlatten({ seed = 1, setup = {} } = {}) {
  const N = Math.max(1, Math.trunc(setup.bubbles ?? 5));
  return {
    seed, setup, N, band: setup.band ?? 10, drift: setup.drift ?? 1, chargeTime: setup.charge ?? 1.2,
    bubbles: bubblesFor(seed, N), nextId: N + 1, dimples: [], swings: 0, selected: null, charging: false, t0: 0, steer: 0, steerAt: 0,
    leanLog: [], events: [], done: false, result: null,
  };
}

const wave = (s) => { const r = lcg(s.seed * 131 + s.swings * 17 + 3); const f1 = 0.25 + 0.25 * r(), f2 = 0.5 + 0.4 * r(), p1 = r() * 6.283, p2 = r() * 6.283; return { f1, f2, p1, p2 }; };
/** The lean the hammer would have with no hand on it, at charge time tau seconds (-1..1 scaled by the roll). */
export function wander(s, tau) {
  const w = wave(s), ramp = Math.min(1, Math.max(0, tau) / 0.5);
  return 1.0 * s.drift * ramp * (0.6 * Math.sin(6.283 * w.f1 * tau + w.p1) + 0.4 * Math.sin(6.283 * w.f2 * tau + w.p2));
}
/** The lean now: the drift plus where the hand is. Positive leans right. */
export const leanOf = (s, t) => (s.charging ? wander(s, t - s.t0) + s.steer * STEER_GAIN : 0);
/** Charge now, 0..100. */
export const powerOf = (s, t) => (s.charging ? Math.max(0, Math.min(100, (100 * (t - s.t0)) / s.chargeTime)) : 0);
export const bubbleOf = (s, id = s.selected) => s.bubbles.find((b) => b.id === id) || null;
export const gradeOf = (s) => Math.max(0, 100 - DIMPLE_COST * s.dimples.length - SWING_COST * Math.max(0, s.swings - s.N));

/** Put the hammer over a bubble (null puts it away). Not while charging. */
export function flattenSelect(s, id) { if (s.done || s.charging) return s; if (id == null || bubbleOf(s, id)) s.selected = id; return s; }
/** Where the hand is, -1..1 (the mouse left or right of the hammer, or the thumb left or right of the pad's middle). */
export function flattenSteer(s, v) { s.steer = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0)); return s; }
/** Start charging the selected bubble's hit at time t. */
export function flattenCharge(s, t) {
  if (s.done || s.charging || s.selected == null) return false;
  s.charging = true; s.t0 = t; s.events.push({ type: 'charge', id: s.selected }); return true;
}

/** Word for the charge against the selected bubble: 'too soft', 'just right' or 'too hard'. */
export function powerWord(s, t) {
  const b = bubbleOf(s); if (!b) return 'pick a bubble';
  const p = powerOf(s, t);
  return p < b.need - s.band - 1e-9 ? 'too soft' : p > b.need + s.band + 1e-9 ? 'too hard' : 'just right';
}
/** Word for the lean: 'steady', 'leaning left', 'leaning right', or 'too far over' past 35%. */
export function leanWord(lean) {
  const a = Math.abs(lean);
  if (a > LEAN_LIMIT) return `too far ${lean < 0 ? 'left' : 'right'}`;
  return a < 0.15 ? 'steady' : lean < 0 ? 'leaning left' : 'leaning right';
}

/** Let go at time t. Returns { outcome, power, lean }: 'flat', 'soft', 'hard', 'miss-soft' or 'miss-hard'. */
export function flattenRelease(s, t) {
  if (s.done || !s.charging) return null;
  const b = bubbleOf(s), power = powerOf(s, t), lean = leanOf(s, t);
  s.charging = false; s.swings++;
  let outcome;
  if (Math.abs(lean) > LEAN_LIMIT) {
    const dir = lean < 0 ? -1 : 1, bx = Math.max(0.05, Math.min(0.95, b.x + dir * 0.07)), by = Math.min(0.95, b.y + 0.05);
    if (power >= b.need) { s.dimples.push({ x: bx, y: by }); outcome = 'miss-hard'; }
    else { s.bubbles.push({ id: s.nextId++, x: bx, y: by, need: SMALL_NEED }); outcome = 'miss-soft'; }
  } else if (power < b.need - s.band - 1e-9) {
    b.need = Math.max(MIN_LEFT, Math.round((b.need - power) * 100) / 100); outcome = 'soft';
  } else if (power > b.need + s.band + 1e-9) {
    s.dimples.push({ x: b.x, y: b.y }); s.bubbles = s.bubbles.filter((x) => x.id !== b.id); s.selected = null; outcome = 'hard';
  } else { s.bubbles = s.bubbles.filter((x) => x.id !== b.id); s.selected = null; outcome = 'flat'; }
  s.events.push({ type: outcome, id: b.id, power, lean, x: b.x, y: b.y });
  if (!s.bubbles.length) finish(s, 'flat');
  else if (gradeOf(s) < PASS) finish(s, 'rough');
  return { outcome, power, lean };
}

export function flattenGiveUp(s) { if (!s.done) finish(s, 'gave-up'); return s.result; }

function finish(s, how) {
  s.done = true; s.charging = false;
  const grade = how === 'gave-up' ? 0 : gradeOf(s);
  s.result = { success: grade >= PASS, grade, word: gradeWord(grade), how, dimples: s.dimples.length, swings: s.swings, bubbles: s.N, extra: Math.max(0, s.swings - s.N), left: s.bubbles.length };
  s.events.push({ type: 'done', ...s.result });
}

export function flattenWhy(r) {
  if (!r || r.grade >= 95) return '';
  const bits = [];
  if (r.dimples) bits.push(`${r.dimples} dimple${r.dimples === 1 ? '' : 's'} (-${r.dimples * DIMPLE_COST})`);
  if (r.extra) bits.push(`${r.extra} swing${r.extra === 1 ? '' : 's'} over one a bubble (-${r.extra * SWING_COST})`);
  if (r.how === 'gave-up') bits.push('given up');
  if (r.how === 'rough') bits.push('too many dimples and swings: it cannot pass');
  return bits.join(', ') + (bits.length ? '.' : '');
}
