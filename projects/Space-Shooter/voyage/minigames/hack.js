// The hacking minigame, set up from a d20 roll and the three category points.
// The bypass ring itself is onfoot/rules/hack.js (the slice lane's code, left
// untouched): this builds the same state shape from setup.js numbers, then the
// ring's own stepHack / splice run it. Pure and seeded.
import { createHack, stepHack, splice, speedOf, HACK } from '../onfoot/rules/hack.js';
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { setupHack } from './setup.js';

export { stepHack, splice, speedOf };
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

/** The base numbers of a lock level 1..4 (tuning.json "hack"): { time, tumblers, misses, window }. */
export function lockFor(level = 1) {
  const l = Math.max(1, Math.min(4, Math.trunc(level) || 1));
  return { level: l, time: Math.max(6, HACK.time + HACK.timePerLevel * (l - 1)), tumblers: HACK.tumblers + l - 1, misses: HACK.misses, window: Math.max(0.18, HACK.window + HACK.windowPerLevel * (l - 1)) };
}

/** What the setup gives for a lock: { time, tumblers, misses, tier, points, label } (setup.js setupHack on the lock's base). */
export const hackSetup = ({ tier = 0, points = {}, level = 9, lock = 1 } = {}) => setupHack({ tier, points, level, lock: lockFor(lock) });

/**
 * A bypass for `setup` (from hackSetup) on lock level `lock`. Same shape as createHack's state, so
 * stepHack and splice run it. With no setup it is the plain lock (same tumblers and clock as createHack).
 */
export function createSetupHack({ seed = 1, lock = 1, setup = null } = {}) {
  const base = lockFor(lock);
  const s = setup || hackSetup({ lock });
  let rng = hashSeed('hack', seed, base.level);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const tumblers = Array.from({ length: s.tumblers }, (_, i) => ({ at: wrap(rand() * TAU + i * 1.7), width: base.window * (1 - i * 0.05), set: false }));
  return {
    t: 0, difficulty: base.level, time: Math.max(6, s.time), misses: 0, allowed: s.misses,
    cursor: wrap(tumblers[0].at + Math.PI), dir: 1, tumblers, index: 0, done: false, result: null, events: [], setup: s,
  };
}

/**
 * The practice dummy lock (extra 6): a lock on the pad that never trips. No clock, no trace, any number
 * of misses; it only opens when you set every tumbler. Pays no XP. For trying the ring before the first airlock.
 */
export function createPracticeHack({ seed = 1, tumblers = 3 } = {}) {
  const s = createSetupHack({ seed, lock: 1, setup: { time: Infinity, tumblers: Math.max(2, Math.min(5, Math.trunc(tumblers) || 3)), misses: Infinity, tier: 0, points: {}, label: 'Practice' } });
  s.practice = true;
  return s;
}

/** XP for an opened lock (placeholder): 3 + lock level, +1 for no misses. */
export const hackXp = (result, lockLevel = 1) => (result?.success ? 3 + lockLevel + (result.misses === 0 ? 1 : 0) : 0);

export { createHack };
