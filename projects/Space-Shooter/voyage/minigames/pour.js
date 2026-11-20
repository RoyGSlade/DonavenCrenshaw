// Pour (v2/PLAN.md section 6): hold to pour, let go at the line. Pure and clock-free: every call takes the time in seconds, so a test can
// play any hand. Seeded: the same seed, the same flask, the same lines, the same liquids.
//
//   The glass is 0..100. It fills 25 a second while you hold (a Speed point: 5% more, but only while the level is far from the line;
//   the last 22 always run at 25, so Speed never makes the stop harder). Every ingredient has its own glass and its own line (40 to 84).
//   Within 6 of the line: clean (100). Within 12: it passes, on a straight slope from 100 at 6 down to 70 at 12.
//   Over the line by more than 12: a SPILL. That ingredient is spoiled: the glass is emptied and you pour it again.
//   Under the line by more than 12 you can TOP IT UP: press again, -5 a press after the first.
//   The roll widens or narrows both bands by 15% a tier (6 -> 4.2 at Rough, 7.8 at Smooth; 12 -> 8.4 and 15.6).
//   Grade = the average of the pours. My readings, not in the plan: a spill costs 50 off that pour (it wastes the ingredient: half the pour's
//   worth, tuned so a spill is felt but a second try can still pass); the third spill ruins the batch; the game ends early once the grade cannot reach 70 (like Screw); a press that
//   pours under half a point is not a pour; Give up is a grade 0.
import { PASS, gradeWord } from './craftChain.js';

export const TOP_UP_COST = 5, SPILL_COST = 50, MAX_SPILLS = 3, TAPER = 22, RIM = 100, MIN_POUR = 0.5, PASS_GRADE_AT_EDGE = 70;
export const LIQUIDS = Object.freeze({
  coolant: Object.freeze({ id: 'coolant', name: 'coolant', color: '#4fd8e8' }),
  glycol: Object.freeze({ id: 'glycol', name: 'glycol', color: '#b6e86a' }),
  water: Object.freeze({ id: 'water', name: 'distilled water', color: '#a9c8ff' }),
  oil: Object.freeze({ id: 'oil', name: 'fuel oil', color: '#e2a23c' }),
  dye: Object.freeze({ id: 'dye', name: 'blue dye', color: '#5a6cff' }),
});
const LIQUID_IDS = Object.keys(LIQUIDS);

function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

/**
 * The seeded plan of a batch: one entry per pour, { id, name, color, line }. Each ingredient has its own glass and its own line, 40 to 84 so
 * a spill at line + 12 (15.6 at Smooth) stays inside the glass; neighbouring lines differ by at least 8. `liquids` names them in order, or they are drawn.
 */
export function planFor(seed, count, liquids = null) {
  const n = Math.max(1, Math.min(4, Math.trunc(count) || 1)), r = lcg((seed >>> 0) * 2654435761 + 11); r(); r();
  const pool = [...LIQUID_IDS]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [];
  for (let i = 0; i < n; i++) {
    let line = 40 + Math.floor(r() * 45);
    for (let k = 0; k < 20 && i && Math.abs(line - out[i - 1].line) < 8; k++) line = 40 + Math.floor(r() * 45);
    const id = liquids?.[i] && LIQUIDS[liquids[i]] ? liquids[i] : pool[i % pool.length];
    out.push({ ...LIQUIDS[id], line });
  }
  return out;
}

export function createPour({ seed = 1, setup = {} } = {}) {
  const plan = planFor(seed, setup.pours ?? 3, setup.liquids);
  return {
    seed, setup, N: plan.length, plan, clean: setup.clean ?? 6, pass: setup.pass ?? 12, rate: setup.rate ?? 25, quick: setup.quick ?? 0,
    idx: 0, level: 0, base: 0, holding: false, startLevel: 0, tAt: 0, spillWait: false, presses: 0, curSpills: 0, spills: 0, topUps: 0,
    pours: [], events: [], done: false, result: null,
  };
}

export const lineOf = (s) => (s.plan[Math.min(s.idx, s.N - 1)]).line;
export const liquidOf = (s) => s.plan[Math.min(s.idx, s.N - 1)];
export const levelOf = (s) => s.level;
/** The stream's speed at a level: the base rate, quicker (Speed points) only while far from the line. */
export function rateAt(s, level = s.level) {
  const ease = Math.max(0, Math.min(1, (lineOf(s) - TAPER - level) / 8));
  return s.rate * (1 + s.quick * ease);
}
const penalty = (s) => TOP_UP_COST * Math.max(0, s.presses - 1) + SPILL_COST * s.curSpills;
/** The grade so far: finished pours count as graded, the rest as zero. */
export const gradeOf = (s) => Math.max(0, Math.round((s.pours.reduce((a, p) => a + p.grade, 0) / s.N) * 100) / 100);
/** The best grade still possible. */
const ceilingOf = (s) => (s.pours.reduce((a, p) => a + p.grade, 0) + Math.max(0, 100 - penalty(s)) + Math.max(0, s.N - s.pours.length - 1) * 100) / s.N;

/** Move the level on to time t (a hold adds liquid; crossing line + the pass band spills it). Safe to call every frame. */
export function pourTick(s, t) {
  if (s.done) return s;
  if (!s.holding) { s.tAt = Math.max(s.tAt, t); return s; }
  const step = 1 / 240;
  while (s.tAt < t - 1e-12 && s.holding) {
    const dt = Math.min(step, t - s.tAt);
    s.level += rateAt(s) * dt; s.tAt += dt;
    if (s.level > lineOf(s) + s.pass + 1e-9) { spill(s); break; }
  }
  if (s.holding) s.tAt = t;
  return s;
}

function spill(s) {
  s.events.push({ type: 'spill', idx: s.idx, id: liquidOf(s).id, level: s.level, base: s.base });
  s.spills++; s.curSpills++; s.level = s.base; s.holding = false; s.spillWait = true; s.presses = 0;
  if (s.spills >= MAX_SPILLS) finish(s, 'rough');
  else if (ceilingOf(s) < PASS) finish(s, 'rough');
}

/** Start pouring at time t. Not while a spill is waiting to be let go of. */
export function pourDown(s, t) {
  if (s.done || s.holding || s.spillWait) return false;
  pourTick(s, t); s.holding = true; s.startLevel = s.level; s.tAt = t;
  s.events.push({ type: 'start', idx: s.idx }); return true;
}

/**
 * Let go at time t. Returns { outcome, level, gap }: 'clean', 'passes', 'under' (top it up), 'spill' (it went over while you held, or
 * you are letting go after the spill) or 'none' (not a pour). null when nothing was held.
 */
export function pourUp(s, t) {
  if (s.done && !s.spillWait) return null;
  if (s.holding) pourTick(s, t);
  if (s.spillWait) { s.spillWait = false; return { outcome: 'spill', level: s.level, gap: lineOf(s) - s.level }; }
  if (s.done || !s.holding) return null;
  s.holding = false;
  if (s.level - s.startLevel < MIN_POUR) { return { outcome: 'none', level: s.level, gap: lineOf(s) - s.level }; }
  s.presses++;
  const line = lineOf(s), gap = line - s.level, off = Math.abs(gap);
  let outcome;
  if (off <= s.clean + 1e-9) outcome = 'clean';
  else if (off <= s.pass + 1e-9) outcome = 'passes';
  else outcome = 'under';
  if (outcome === 'under') {
    s.events.push({ type: 'under', idx: s.idx, level: s.level, gap });
    if (s.presses > 1) s.topUps++;
    if (ceilingOf(s) < PASS) finish(s, 'rough');
    return { outcome, level: s.level, gap };
  }
  const slope = off <= s.clean ? 0 : (30 * (off - s.clean)) / Math.max(1e-9, s.pass - s.clean);
  const grade = Math.max(0, Math.min(100, Math.round((100 - slope - penalty(s)) * 100) / 100));
  const topUps = Math.max(0, s.presses - 1);
  s.pours.push({ id: liquidOf(s).id, line, level: Math.round(s.level * 100) / 100, gap: Math.round(gap * 100) / 100, outcome, grade, topUps, spills: s.curSpills });
  s.events.push({ type: outcome, idx: s.idx, level: s.level, gap, grade });
  s.idx++; s.presses = 0; s.curSpills = 0;
  if (s.idx >= s.N) finish(s, 'done'); else { s.events.push({ type: 'next', idx: s.idx, left: { level: s.level, color: s.plan[s.idx - 1].color, line } }); s.level = 0; s.base = 0; }
  return { outcome, level: s.level, gap };
}

/** Word for the glass now: hold to pour / keep pouring / nearly / on the line: stop / a bit much: stop / top it up / spilled. */
export function pourWord(s) {
  if (s.done) return s.result?.how === 'gave-up' ? 'given up' : s.result?.success ? 'poured' : 'spilled';
  if (s.spillWait) return 'spilled';
  const gap = lineOf(s) - s.level;
  if (!s.holding) return s.presses > 0 ? 'top it up' : 'hold to pour';
  if (gap > s.pass) return 'keep pouring';
  if (gap > s.clean) return 'nearly';
  if (gap >= -s.clean) return 'on the line: stop';
  return 'a bit much: stop';
}

export function pourGiveUp(s) { if (!s.done) { s.holding = false; finish(s, 'gave-up'); } return s.result; }

function finish(s, how) {
  s.done = true; s.holding = false;
  const grade = how === 'gave-up' ? 0 : gradeOf(s);
  const topUps = s.pours.reduce((a, p) => a + p.topUps, 0) + Math.max(0, s.presses - 1);
  s.result = { success: grade >= PASS, grade, word: gradeWord(grade), how, pours: s.pours.map((p) => ({ ...p })), spills: s.spills, topUps, N: s.N, poured: s.pours.length };
  s.events.push({ type: 'done', ...s.result });
}

export function pourWhy(r) {
  if (!r || r.grade >= 95) return '';
  const bits = [];
  if (r.spills) bits.push(`${r.spills} spill${r.spills === 1 ? '' : 's'} (-${SPILL_COST} each)`);
  if (r.topUps) bits.push(`${r.topUps} top-up${r.topUps === 1 ? '' : 's'} (-${TOP_UP_COST} each)`);
  const wide = r.pours.filter((p) => Math.abs(p.gap) > 6).length;
  if (wide) bits.push(`${wide} pour${wide === 1 ? '' : 's'} not on the line`);
  if (r.how === 'gave-up') bits.push('given up');
  if (r.how === 'rough') bits.push('too much spoiled: it cannot pass');
  return bits.join(', ') + (bits.length ? '.' : '');
}
