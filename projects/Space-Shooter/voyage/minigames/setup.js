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
// Never fewer than 2 tumblers; never fewer than 0 allowed misses; never under 1.8 s per tumbler.
export const HACK_CATEGORIES = Object.freeze(['time', 'size', 'retries']);
export const HACK_SECONDS_PER_TUMBLER = 1.8;
export function setupHack({ tier = 0, points = {}, level = POINT_MAX, lock = { time: 16, tumblers: 3, misses: 2 } } = {}) {
  const p = cleanPoints(points, HACK_CATEGORIES, level);
  const t = tierInfo(tier);
  const tumblers = Math.max(2, lock.tumblers - Math.floor(p.size / 2) + t.size);
  // Floor: a perfect run of a Rough level-4 lock used 98% of its clock, so no hack gets under 1.8 s per tumbler.
  const time = Math.max(tumblers * HACK_SECONDS_PER_TUMBLER, Math.round(+((lock.time + 1.5 * p.time) * t.time).toFixed(6) * 10) / 10);
  return {
    time: Math.round(time * 10) / 10, tumblers,
    misses: Math.max(0, lock.misses + Math.floor(p.retries / 2) + t.extra),
    tier: Math.max(-2, Math.min(2, Math.trunc(tier) || 0)), points: p, label: t.label,
  };
}

// --- Social: haggle (PLAN.md section 2.6, first mode built) -----------------------
// Categories: persuade, intimidate, haggle (only haggle changes the haggle game).
//   haggle   +1.5% on the closing price per point (0..9 -> +0..+13.5%, never above the cap)
//            and the comfort band +0.4% of the price range per point (0..+3.6%)
// Base: comfort band 12% of the range, needle 0.9 ranges a second, patience 3, rounds 3.
// Tier: band x(1 + 0.15 x tier), needle x(1 - 0.06 x tier), patience +1 at +1 and +2 and -1 at -2,
// rounds +1 at +2 and -1 at -2. Never under 2 rounds or 1 patience.
export const SOCIAL_CATEGORIES = Object.freeze(['persuade', 'intimidate', 'haggle']);
export const HAGGLE_BASE = Object.freeze({ band: 0.12, bandPerPoint: 0.004, speed: 0.9, patience: 3, rounds: 3, bonusPerPoint: 0.015 });
export function setupHaggle({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, SOCIAL_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = HAGGLE_BASE;
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  return {
    band: r4((b.band + b.bandPerPoint * p.haggle) * (1 + 0.15 * t)),
    speed: r4(b.speed * (1 - 0.06 * t)),
    patience: Math.max(1, b.patience + (t >= 1 ? 1 : 0) - (t <= -2 ? 1 : 0)),
    rounds: Math.max(2, b.rounds + (t === 2 ? 1 : 0) - (t === -2 ? 1 : 0)),
    priceBonus: r4(b.bonusPerPoint * p.haggle),
    tier: t, points: p, label: tierInfo(t).label,
  };
}

// --- Crafting: forge strikes (PLAN.md section 2.5) --------------------------------
// Categories: quality, speed, material.
//   quality   +4 quality per point                    (0..9 -> +0..+36)
//   speed     build time 5% shorter per point (0..-45%) and fewer strikes:
//             0-2 points 5, 3-5: 4, 6-8: 3, 9: 2
//   material  4% less material per point (0..-36%), never under 1 of an item
// v2 (heat and shape): the "strikes" are shaping steps. Base: heat band 22% of the temperature
// gauge, heat rate 1.1 x 0.45 of the gauge a second. Tier: band x(1 + 0.15 x tier), heat rate
// x(1 - 0.06 x tier), steps -1 at +2 and +1 at -2 (never under 2), work time x the shared tier clock.
export const CRAFT_CATEGORIES = Object.freeze(['quality', 'speed', 'material']);
export const CRAFT_BASE = Object.freeze({ zone: 0.22, speed: 1.1, strikes: 5, qualityPerPoint: 4, buildPerPoint: 0.05, materialPerPoint: 0.04, pointsPerStrike: 3 });
export function setupCraft({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, CRAFT_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = CRAFT_BASE;
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  return {
    zone: r4(b.zone * (1 + 0.15 * t)),
    speed: r4(b.speed * (1 - 0.06 * t)),
    strikes: Math.max(2, b.strikes - Math.floor(p.speed / b.pointsPerStrike) - (t === 2 ? 1 : 0) + (t === -2 ? 1 : 0)),
    qualityBonus: b.qualityPerPoint * p.quality,
    workFactor: tierInfo(t).time,
    buildFactor: r4(1 - b.buildPerPoint * p.speed),
    materialFactor: r4(1 - b.materialPerPoint * p.material),
    tier: t, points: p, label: tierInfo(t).label,
  };
}
