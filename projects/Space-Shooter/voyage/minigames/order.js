// Order and timing (v2/PLAN.md section 6): put things in the pan in order, each inside its window. Pure and clock-free: every call takes the
// time in seconds since the pan went on, so a test can play any hand. Seeded: the same seed, the same cold-pan start and the same tile layout.
//
//   Until Tend the heat exists, the pan heat follows a scripted curve that rises on its own: from a cold start (18 to 24) at 5 a second
//   (Speed: only up to 40, 5% a point), 5 a second from 40 to 80, then a slow 1.5 a second up to 100, then flat. Past 100 for 6 s it burns.
//   Each ingredient names a HEAT BAND and (all but the first) a TIME WINDOW counted from a reference ingredient:
//     Butter  heat 40 to 60
//     Steak   heat 70 to 90, 3 to 9 s after the butter (it foams for 1 s, the plan then wants 2 s of foam; the window opens at 3 s)
//     Salt    heat 60 to 100, within 4 s of the steak
//     Turn    heat 70 to 100, 8 to 10 s after the steak
//   The roll widens or narrows every band and window by 15% a tier, about its middle.
//   Costs: wrong order spoils the ingredient, -15 (a fresh portion comes back); outside the heat band -10; outside the time window -10.
//   Grade = 100 minus the costs. Pass 70, so three misses pass and a fourth does not. My readings, not in the plan: heat and time are two
//   separate checks of 10 each (the plan's "outside the window costs 10" names both a heat band and a time window); you may still add an
//   ingredient late (it costs, it is not refused); the game ends early once the grade cannot reach 70; a pan left to burn is a grade of
//   100 minus the costs minus 25 for each ingredient never added; Give up is 0.
import { PASS, gradeWord } from './craftChain.js';

export const WRONG_COST = 15, HEAT_COST = 10, TIME_COST = 10, MISSING_COST = 25, BURN_GRACE = 6, WARM_TO = 40, MID_RATE = 5, HOT_FROM = 80, HOT_RATE = 1.5;
export const STEAK = Object.freeze([
  Object.freeze({ id: 'butter', name: 'Butter', heat: Object.freeze([40, 60]), ref: null, after: null }),
  Object.freeze({ id: 'steak', name: 'Steak', heat: Object.freeze([70, 90]), ref: 0, after: Object.freeze([3, 9]) }),
  Object.freeze({ id: 'salt', name: 'Salt', heat: Object.freeze([60, 100]), ref: 1, after: Object.freeze([0, 4]) }),
  Object.freeze({ id: 'turn', name: 'Turn', heat: Object.freeze([70, 100]), ref: 1, after: Object.freeze([8, 10]) }),
]);

function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function createOrder({ seed = 1, setup = {} } = {}) {
  const r = lcg((seed >>> 0) * 2246822519 + 3); r(); r();
  const f = setup.f ?? 1, start = 18 + Math.floor(r() * 7);
  const base = STEAK.map((st) => ({ ...st }));
  const steps = base.map((st) => {
    const mid = (st.heat[0] + st.heat[1]) / 2, half = ((st.heat[1] - st.heat[0]) / 2) * f;
    const heat = [Math.max(0, mid - half), Math.min(100, mid + half)];
    if (st.heat[1] >= 100) heat[1] = 100; // an upper band of 100 has no ceiling; the roll only moves the low edge
    if (st.heat[1] >= 100) heat[0] = clamp(st.heat[1] - (st.heat[1] - st.heat[0]) * f, 0, 100);
    let after = null;
    if (st.after) { const m = (st.after[0] + st.after[1]) / 2, h = ((st.after[1] - st.after[0]) / 2) * f; after = [Math.max(0, m - h), m + h]; }
    return { id: st.id, name: st.name, heat, ref: st.ref, after };
  });
  const order = steps.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { seed, setup, f, start, quick: setup.quick ?? 0, steps, layout: order.map((i) => steps[i].id), next: 0, taps: [], wrongs: [], misses: [], events: [], done: false, result: null, t: 0 };
}

// ---- the pan's scripted heat ---------------------------------------------------------------------------------------------
const warmRate = (s) => MID_RATE * (1 + s.quick);
/** The pan heat at time t, 0..100. */
export function heatAt(s, t) {
  const tw = (WARM_TO - s.start) / warmRate(s), x = Math.max(0, t);
  if (x <= tw) return s.start + warmRate(s) * x;
  const tm = tw + (HOT_FROM - WARM_TO) / MID_RATE;
  if (x <= tm) return WARM_TO + MID_RATE * (x - tw);
  return Math.min(100, HOT_FROM + HOT_RATE * (x - tm));
}
/** The time the pan reaches heat h (0 if it starts above it, Infinity above 100). */
export function timeAtHeat(s, h) {
  if (h <= s.start) return 0; if (h > 100) return Infinity;
  const tw = (WARM_TO - s.start) / warmRate(s);
  if (h <= WARM_TO) return (h - s.start) / warmRate(s);
  const tm = tw + (HOT_FROM - WARM_TO) / MID_RATE;
  if (h <= HOT_FROM) return tw + (h - WARM_TO) / MID_RATE;
  return tm + (h - HOT_FROM) / HOT_RATE;
}
/** When the pan burns (100 for BURN_GRACE seconds). */
export const burnAt = (s) => timeAtHeat(s, 100) + BURN_GRACE;

/** The window of step i: the heat band, the time window (null for the first), and the times they allow together. Needs the reference ingredient to be in. */
export function windowOf(s, i) {
  const st = s.steps[i], tr = st.ref == null ? 0 : s.taps[st.ref]?.t;
  if (tr == null) return null;
  const heatT = [timeAtHeat(s, st.heat[0]), st.heat[1] >= 100 ? Infinity : timeAtHeat(s, st.heat[1])];
  const time = st.after ? [tr + st.after[0], tr + st.after[1]] : null;
  const open = Math.max(heatT[0], time ? time[0] : 0), close = Math.min(heatT[1], time ? time[1] : Infinity);
  return { heat: st.heat, heatT, time, open, close, ref: tr };
}

/** The word for the next ingredient at time t: 'too early', 'now', 'late' or 'burning'; '' when nothing is left. */
export function orderWord(s, t) {
  if (s.done || s.next >= s.steps.length) return '';
  const w = windowOf(s, s.next); if (!w) return '';
  const h = heatAt(s, t);
  if (h > w.heat[1] + 1e-9) return 'burning';
  if (t > w.close + 1e-9) return h >= 95 ? 'burning' : 'late';
  if (t < w.open - 1e-9) return 'too early';
  return 'now';
}
const inHeat = (w, h) => h >= w.heat[0] - 1e-9 && h <= w.heat[1] + 1e-9;
const inTime = (w, t) => !w.time || (t >= w.time[0] - 1e-9 && t <= w.time[1] + 1e-9);
export const gradeOf = (s) => Math.max(0, 100 - WRONG_COST * s.wrongs.length - HEAT_COST * s.misses.filter((m) => m.what === 'heat').length - TIME_COST * s.misses.filter((m) => m.what === 'time').length);

/** Tap an ingredient tile at time t. Returns { outcome: 'ok' | 'wrong', heat, time } or null. */
export function orderAdd(s, t, id) {
  if (s.done) return null;
  orderTick(s, t); if (s.done) return null;
  const st = s.steps[s.next], h = heatAt(s, t);
  if (!s.steps.some((x) => x.id === id)) return null;
  if (!st || id !== st.id) { s.wrongs.push({ id, t, wanted: st?.id }); s.events.push({ type: 'wrong', id, t, wanted: st?.id }); settle(s); return { outcome: 'wrong' }; }
  const w = windowOf(s, s.next), heatOK = inHeat(w, h), timeOK = inTime(w, t);
  s.taps.push({ id, t, heat: h, heatOK, timeOK, word: orderWord(s, t) });
  if (!heatOK) s.misses.push({ id, what: 'heat', t });
  if (!timeOK) s.misses.push({ id, what: 'time', t });
  s.events.push({ type: 'added', id, t, heat: h, heatOK, timeOK });
  s.next++; s.t = t;
  if (s.next >= s.steps.length) finish(s, 'done'); else settle(s);
  return { outcome: 'ok', heat: heatOK, time: timeOK };
}
function settle(s) { if (!s.done && gradeOf(s) < PASS) finish(s, 'rough'); }

/** Advance the clock: a pan left too long burns. */
export function orderTick(s, t) {
  if (s.done) return s;
  s.t = Math.max(s.t, t);
  if (t > burnAt(s)) finish(s, 'burnt');
  return s;
}
export function orderGiveUp(s) { if (!s.done) finish(s, 'gave-up'); return s.result; }

function finish(s, how) {
  s.done = true;
  const missing = s.steps.length - s.taps.length;
  const grade = how === 'gave-up' ? 0 : Math.max(0, gradeOf(s) - (how === 'burnt' ? MISSING_COST * missing : 0));
  s.result = { success: grade >= PASS && how === 'done', grade, word: gradeWord(grade), how, wrong: s.wrongs.length, heatMisses: s.misses.filter((m) => m.what === 'heat').length, timeMisses: s.misses.filter((m) => m.what === 'time').length, missing, added: s.taps.length, N: s.steps.length, seconds: s.t };
  s.result.success = grade >= PASS && how === 'done';
  s.events.push({ type: 'done', ...s.result });
}

export function orderWhy(r) {
  if (!r || r.grade >= 95) return '';
  const bits = [];
  if (r.wrong) bits.push(`${r.wrong} out of order (-${WRONG_COST} each, spoiled)`);
  if (r.heatMisses) bits.push(`${r.heatMisses} in the wrong heat (-${HEAT_COST} each)`);
  if (r.timeMisses) bits.push(`${r.timeMisses} outside its window (-${TIME_COST} each)`);
  if (r.how === 'burnt') bits.push(`the pan burnt${r.missing ? `, ${r.missing} never added (-${MISSING_COST} each)` : ''}`);
  if (r.how === 'gave-up') bits.push('given up');
  if (r.how === 'rough') bits.push('too many mistakes: it cannot pass');
  return bits.join(', ') + (bits.length ? '.' : '');
}
