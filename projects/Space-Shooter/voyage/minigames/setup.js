// How a d20 roll and a skill's category points set up a minigame (design doc
// Section 5: "A roll also sets up a minigame. A high roll gives more time and an
// easier version... a low roll the opposite"; each skill's 3 category points
// change the minigame). Pure: no DOM, no randomness, no save access. The game
// passes in what the check already computed (character.js check()).
//
// Points: a skill has as many category points as its level (1..9, one per level),
// spent in any split across its 3 categories (PLAN.md assumption P1).

export const TIERS = Object.freeze([-2, -1, 0, 1, 2]);
export const POINT_MAX = 9;

/**
 * The roll's tier, -2 (rough) .. +2 (smooth), from a check result.
 *   natural 20 or margin >= 10  ->  +2
 *   margin 5..9                 ->  +1
 *   margin 0..4                 ->   0
 *   margin -5..-1               ->  -1
 *   margin <= -6                ->  -2
 * margin = total - dc. `attempt` is { total, dc, natural } (character.js check()).
 */
export function tierOf({ total = 0, dc = 10, natural = false } = {}) {
  if (natural) return 2;
  const m = total - dc;
  return m >= 10 ? 2 : m >= 5 ? 1 : m >= 0 ? 0 : m >= -5 ? -1 : -2;
}

/** Shared tier numbers. time: x this; shift: whole steps of puzzle size (negative = smaller); extra: a spare try. */
export const TIER = Object.freeze({
  '-2': Object.freeze({ time: 0.70, size: +1, extra: -1, label: 'Rough' }),
  '-1': Object.freeze({ time: 0.85, size: 0, extra: 0, label: 'Shaky' }),
  '0': Object.freeze({ time: 1.00, size: 0, extra: 0, label: 'Steady' }),
  '1': Object.freeze({ time: 1.15, size: 0, extra: +1, label: 'Good' }),
  '2': Object.freeze({ time: 1.30, size: -1, extra: +1, label: 'Smooth' }),
});
export const tierInfo = (tier) => TIER[String(Math.max(-2, Math.min(2, Math.trunc(tier) || 0)))];

/** Points clean-up: whole numbers 0..9 for known categories, and never more than `level` in total (spent from the first category on). */
export function cleanPoints(points, categories, level = POINT_MAX) {
  const out = Object.fromEntries(categories.map((c) => [c, 0]));
  let left = Math.max(0, Math.min(POINT_MAX, Math.trunc(level) || 0));
  for (const c of categories) {
    const n = Math.max(0, Math.min(POINT_MAX, Math.trunc(points?.[c]) || 0));
    out[c] = Math.min(n, left);
    left -= out[c];
  }
  return out;
}

// --- Repair: pipe routing (PLAN.md section 2) -------------------------------------
// Categories: time, size, quality.
//   time     +3 s per point                       (0..9 -> +0..+27 s)
//   size     one fewer row and column per 3 points (0-2: 0, 3-5: -1, 6-8: -2, 9: -3)
//   quality  +4 quality points per point           (0..9 -> +0..+36)
// Base 5 x 5 board, 50 s. Tier: time x, size +/-1 board step, nothing else.
// The board is never smaller than 3 x 3 or larger than 6 x 6.
export const REPAIR_BASE = Object.freeze({ size: 5, seconds: 50, minSize: 3, maxSize: 6, secondsPerPoint: 3, pointsPerStep: 3, qualityPerPoint: 4 });
export const REPAIR_CATEGORIES = Object.freeze(['time', 'size', 'quality']);

export function setupRepair({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, REPAIR_CATEGORIES, level);
  const t = tierInfo(tier);
  const b = REPAIR_BASE;
  const size = Math.max(b.minSize, Math.min(b.maxSize, b.size - Math.floor(p.size / b.pointsPerStep) + t.size));
  const seconds = Math.round(+((b.seconds + b.secondsPerPoint * p.time) * t.time).toFixed(6));
  return { size, seconds, qualityBonus: b.qualityPerPoint * p.quality, tier: Math.max(-2, Math.min(2, Math.trunc(tier) || 0)), points: p, label: t.label };
}

// --- Hacking: the existing bypass ring (onfoot/rules/hack.js) ---------------------
// Categories: time, size, retries.
//   time     +1.5 s per point   (0..9 -> +0..+13.5 s)
//   size     one fewer tumbler per 2 points (0-1: 0, 2-3: -1, 4-5: -2, 6-7: -3, 8-9: -4)
//   retries  one more allowed miss per 2 points (0..9 -> +0..+4)
// Base: the lock level's own numbers. Tier: time x, size +/-1 tumbler, spare miss +1/-1.
// Never fewer than 2 tumblers; never fewer than 0 allowed misses.
export const HACK_CATEGORIES = Object.freeze(['time', 'size', 'retries']);
export function setupHack({ tier = 0, points = {}, level = POINT_MAX, lock = { time: 16, tumblers: 3, misses: 2 } } = {}) {
  const p = cleanPoints(points, HACK_CATEGORIES, level);
  const t = tierInfo(tier);
  return {
    time: Math.round(+((lock.time + 1.5 * p.time) * t.time).toFixed(6) * 10) / 10,
    tumblers: Math.max(2, lock.tumblers - Math.floor(p.size / 2) + t.size),
    misses: Math.max(0, lock.misses + Math.floor(p.retries / 2) + t.extra),
    tier: Math.max(-2, Math.min(2, Math.trunc(tier) || 0)), points: p, label: t.label,
  };
}
