// What a d20 roll is worth (opening B, outcome 3). Pure: no DOM, no clock.
//
// The roll maths is unchanged: d20 + skill + stat against the target, drawn by the engine from the run's seed. What changed is what the
// result means on screen. A check that is not a minigame no longer picks pass or fail. It sets how much HELP you get (a hint, a tool,
// someone stepping in) and how much TIME you have; then you do the thing, and doing it in time is the pass.
// The tier is the minigames' own (setup.js tierOf: margin 10+ or a natural 20 Smooth, 5-9 Good, 0-4 Steady, -5..-1 Shaky, -6 or worse
// Rough), and so is the time multiplier (setup.js TIER), so a roll means one thing everywhere.
import { tierOf, tierInfo } from '../minigames/setup.js';

/** Help by tier: each tier keeps the help of the one below it. */
export const HELP = Object.freeze({
  '-2': Object.freeze([]),
  '-1': Object.freeze([]),
  '0': Object.freeze(['hint']),
  '1': Object.freeze(['hint', 'tool']),
  '2': Object.freeze(['hint', 'tool', 'hand']),
});

/** How long you hold the use key at the target to finish the job (ms). A hand does it for you; a tool is quick. */
export const WORK_MS = Object.freeze({ '-2': 2500, '-1': 2000, '0': 1500, '1': 500, '2': 0 });

/** The table as data for the DESIGN and HANDOFF notes and the tests: one row per tier. */
export const TABLE = Object.freeze([2, 1, 0, -1, -2].map((tier) => ({ tier, label: tierInfo(tier).label, help: HELP[String(tier)], timeX: tierInfo(tier).time, workMs: WORK_MS[String(tier)] })));

/**
 * attempt: { total, dc, natural } from the engine's run.assist. spec: the approach's staging { baseMs, workScale?, instant? }.
 * Returns { tier, label, help: [...], timeMs, workMs, needsHold }.
 */
export function approachFor(attempt, spec = {}) {
  const tier = tierOf(attempt);
  const info = tierInfo(tier);
  const help = HELP[String(tier)];
  const base = Number.isFinite(spec.baseMs) ? spec.baseMs : 25000;
  const work = Math.round((WORK_MS[String(tier)] * (spec.workScale ?? 1)) / 50) * 50;
  return { tier, label: info.label, help: [...help], timeMs: Math.round(base * info.time), workMs: work, needsHold: !help.includes('hand') };
}

/** The words under the die: what this roll bought. "Good roll: a hint and a tool. 28 s." */
export function verdictWords(a) {
  const has = (h) => a.help.includes(h);
  const parts = has('hand') ? ['a hint, a tool and a hand'] : has('tool') ? ['a hint and a tool'] : has('hint') ? ['a hint'] : ['no help'];
  return `${a.label} roll: ${parts[0]}. ${Math.round(a.timeMs / 1000)} s.`;
}

/**
 * The approach clock. createApproach(a, { reachGraceMs }) -> { step({ dtMs, inReach, holding }), state, abandon() }.
 *   - the time bar drains every step; at zero the approach ends 'fail';
 *   - work fills only while the player is at the target (inReach) and holding the use key; a hand needs no hold (tier 2),
 *     only that they get there, then it takes 500 ms;
 *   - when work is full the approach ends 'pass'.
 * step returns an event the moment it ends: { type: 'pass' | 'fail' | 'abandon' }; null otherwise.
 */
export function createApproach(a, { handMs = 500 } = {}) {
  const total = Math.max(1, a.timeMs);
  const need = a.needsHold ? Math.max(50, a.workMs) : handMs;
  let left = total, work = 0, ended = null;
  const api = {
    get left() { return left; },
    get total() { return total; },
    get timeFraction() { return Math.max(0, left / total); },
    get workFraction() { return Math.min(1, work / need); },
    get ended() { return ended; },
    step({ dtMs = 16, inReach = false, holding = false } = {}) {
      if (ended) return null;
      const active = inReach && (a.needsHold ? holding : true);
      if (active) work = Math.min(need, work + dtMs); else if (a.needsHold) work = Math.max(0, work - dtMs * 1.5); // let go and it slips back
      if (work >= need) { ended = 'pass'; return { type: 'pass' }; }
      left = Math.max(0, left - dtMs);
      if (left <= 0) { ended = 'fail'; return { type: 'fail' }; }
      return null;
    },
    abandon() { if (ended) return null; ended = 'abandon'; return { type: 'abandon' }; },
  };
  return api;
}
