// Bend (v2/PLAN.md section 4.3): a bar, a ghost line at the target angle, A and D in turn. Pure and clock-free: the view (or a bot)
// passes the time of every press in seconds, so a test can play any hand at any rhythm. Seeded: the same seed, the same targets.
//
//   Press A and D in turn. A press 0.18 to 0.45 s after the last one is GOOD: +2 degrees. Slower: not enough pressure, +0.
//   Faster (RUSHED): +0 degrees and the strain goes up 25 (the Speed path takes 2 off that a point, 7 at nine points).
//   Strain falls 10 a second. At 100 the bar KINKS: the bend is redone from a straight bar. The same key twice does nothing.
//   Stop pressing and SET it. Grade of a bend = 100 - (30 / stop) per degree off, so the plan's 10 a degree at a Steady roll
//   (stop within 3 degrees = the 70 that passes). A press that takes the bar more than 10 degrees over cannot be saved: it
//   cracks, the whole piece is spoiled (grade 0).
//   A step can ask for 1 to 3 bends, each with its own target (30 to 120, even, so every target can be hit square). The game's
//   grade is the average of its bends.
//   Changes from the plan (the plan never ends a hand that mashes): a kink costs 10 off that bend's grade, and the third kink
//   cracks the piece (grade 0). The first press of a bend has no press before it, so it counts as good. The rhythm window scales
//   about its middle: at tier t it is 0.315 +- 0.135 x (1 + 0.15 t).
import { PASS, gradeWord } from './craftChain.js';

export const KINK_COST = 10, MAX_KINKS = 3;
export const KEYS = Object.freeze(['a', 'd']);

function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

/** The seeded targets (degrees) of every bend of a game: even numbers, 30 to 120. */
export function targetsFor(seed, count, { min = 30, max = 120 } = {}) {
  const r = lcg((seed >>> 0) * 2654435761 + 17); r(); r();
  const steps = Math.floor((max - min) / 2) + 1;
  return Array.from({ length: count }, () => min + 2 * Math.min(steps - 1, Math.floor(r() * steps)));
}

export function createBend({ seed = 1, setup = {} } = {}) {
  const bends = Math.max(1, Math.min(3, Math.trunc(setup.bends ?? 1) || 1));
  const s = {
    seed, setup, bends, targets: targetsFor(seed, bends, { min: setup.minAngle, max: setup.maxAngle }),
    lo: setup.lo ?? 0.18, hi: setup.hi ?? 0.45, stop: setup.stop ?? 3, press: setup.press ?? 2, rush: setup.rush ?? 25, fall: setup.fall ?? 10, over: setup.over ?? 10,
    index: 0, angle: 0, strain: 0, lastKey: null, lastAt: null, tickAt: null, kinks: 0, bendKinks: 0, presses: 0, good: 0, rushed: 0, slow: 0, ignored: 0,
    sets: [], events: [], done: false, result: null,
  };
  return s;
}

export const targetOf = (s) => s.targets[Math.min(s.index, s.bends - 1)];
/** Degrees the grade drops for each degree off. */
export const slope = (s) => 30 / s.stop;
/** The grade of a bend set at `angle` for `target`, with `kinks` redone: 0..100. */
export const bendGrade = (s, angle, target, kinks = 0) => Math.max(0, Math.min(100, 100 - slope(s) * Math.abs(angle - target) - KINK_COST * kinks));
/** The key the bar wants next ('a' or 'd'); the first press may be either. */
export const nextKey = (s) => (s.lastKey ? (s.lastKey === 'a' ? 'd' : 'a') : null);
/** The gap to the line in degrees: positive short of it, negative over it. */
export const gap = (s) => targetOf(s) - s.angle;
/** The plain word for where the bar is. */
export function word(s) {
  if (s.done) return s.result.success ? 'set' : 'cracked';
  const g = gap(s);
  if (g === 0) return 'on the line: set it';
  if (g < 0) return s.angle - targetOf(s) > s.over ? 'over: it cannot be saved' : 'over';
  return g <= 2 * s.press ? 'close' : 'keep going';
}
/** Seconds since the last accepted press at time t (null before the first press). */
export const since = (s, t) => (s.lastAt == null ? null : t - s.lastAt);
/** How the press at this gap would count: 'good', 'rushed' or 'slow' (null before the first press: the first one is good). */
export const quality = (s, dt) => (dt == null ? 'good' : dt < s.lo - 1e-9 ? 'rushed' : dt > s.hi + 1e-9 ? 'slow' : 'good');

/** Let the strain fall to time t (10 a second). Called by every press and by the view each frame. */
export function bendTick(s, t) {
  if (s.done) return s;
  if (s.tickAt != null && t > s.tickAt) s.strain = Math.max(0, s.strain - s.fall * (t - s.tickAt));
  if (s.tickAt == null || t > s.tickAt) s.tickAt = t;
  return s;
}

/** Press A or D at time t. Returns 'good' | 'slow' | 'rushed' | 'ignored' | 'kink' | 'cracked'. */
export function bendPress(s, key, t) {
  if (s.done) return 'ignored';
  key = String(key).toLowerCase();
  if (!KEYS.includes(key)) return 'ignored';
  bendTick(s, t);
  if (key === s.lastKey) { s.ignored++; s.events.push({ type: 'ignored', key }); return 'ignored'; } // the same key twice does nothing
  const dt = since(s, t), q = quality(s, dt);
  s.lastKey = key; s.lastAt = t; s.presses++;
  if (q === 'good') { s.good++; s.angle += s.press; s.events.push({ type: 'good', key, angle: s.angle }); }
  else if (q === 'slow') { s.slow++; s.events.push({ type: 'slow', key }); }
  else {
    s.rushed++; s.strain += s.rush; s.events.push({ type: 'rushed', key, strain: s.strain });
    if (s.strain >= 100 - 1e-9) return kink(s);
  }
  if (s.angle - targetOf(s) > s.over + 1e-9) { finish(s, 'over'); return 'cracked'; }
  return q;
}

function kink(s) {
  s.kinks++; s.bendKinks++; s.events.push({ type: 'kink', kinks: s.kinks });
  s.angle = 0; s.strain = 0; s.lastKey = null; s.lastAt = null;
  if (s.kinks >= MAX_KINKS) { finish(s, 'kinks'); return 'cracked'; }
  return 'kink';
}

/** Set the bend (Space). Returns { grade, off } for that bend; the game ends after the last one. */
export function bendSet(s, t) {
  if (s.done) return null;
  if (t != null) bendTick(s, t);
  const target = targetOf(s), off = Math.abs(s.angle - target), grade = bendGrade(s, s.angle, target, s.bendKinks);
  const set = { index: s.index, target, angle: s.angle, off, kinks: s.bendKinks, grade };
  s.sets.push(set); s.events.push({ type: 'set', ...set });
  s.index++; s.angle = 0; s.strain = 0; s.lastKey = null; s.lastAt = null; s.bendKinks = 0;
  if (s.index >= s.bends) finish(s, 'set');
  return set;
}

/** Give the piece up (the button): grade 0. */
export function bendGiveUp(s) { if (!s.done) finish(s, 'gave-up'); return s.result; }

export const gradeOf = (s) => {
  if (s.done) return s.result.grade;
  const total = s.sets.reduce((a, b) => a + b.grade, 0) + bendGrade(s, s.angle, targetOf(s), s.bendKinks);
  return Math.round(total / s.bends * 100) / 100; // what it would be if set now
};

function finish(s, how) {
  s.done = true;
  const grade = how === 'set' ? Math.round((s.sets.reduce((a, b) => a + b.grade, 0) / s.bends) * 100) / 100 : 0;
  s.result = { success: grade >= PASS, grade, word: gradeWord(grade), how, sets: s.sets.map((x) => ({ ...x })), kinks: s.kinks, bends: s.bends, presses: s.presses, good: s.good, rushed: s.rushed, slow: s.slow };
  s.events.push({ type: 'done', ...s.result });
}

export function bendWhy(r) {
  if (!r || r.grade >= 95) return '';
  const bits = [];
  if (r.how === 'over') bits.push('bent more than 10 degrees past the line: cracked, it cannot be saved');
  else if (r.how === 'kinks') bits.push('kinked three times: the metal cracked');
  else if (r.how === 'gave-up') bits.push('given up');
  else {
    const off = r.sets.filter((x) => x.off > 0);
    if (off.length) bits.push(off.map((x) => (r.bends > 1 ? `bend ${x.index + 1}: ` : '') + `${x.angle > x.target ? 'over' : 'short of'} the line by ${x.off} degree${x.off === 1 ? '' : 's'}`).join(', '));
    if (r.kinks) bits.push(`${r.kinks} kink${r.kinks === 1 ? '' : 's'} (-${r.kinks * KINK_COST})`);
  }
  return bits.join('; ') + (bits.length ? '.' : '');
}
