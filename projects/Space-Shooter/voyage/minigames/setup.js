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

// --- Repair v2: closed pipe network, no clock (Donaven 2026-11-18) -----------------
// The coolant flows from the pump and pours out of every open end it reaches; the spill is water that rises up
// the board from the bottom row (v3); the water reaching the valve loses the line. `capacity` is how much spill
// brings the water from the bottom to the valve. Categories: time, size, quality.
//   time     +6 capacity per point (0..9 -> +0..+54): the water rises slower (a point = 6 seconds of one open end)
//   size     one fewer row and column per 3 points (0-2: 0, 3-5: -1, 6-8: -2, 9: -3)
//   quality  +4 quality points per point           (0..9 -> +0..+36)
// Base 5 x 5 board, capacity 120 (one open end brings the water to the valve in 120 s at flow 1; three open ends in 40 s).
// Tier: capacity x (0.70 .. 1.30), flow per open end +0.1 per step rougher (1.2 .. 0.8), size +/-1 board step.
// The board is never smaller than 3 x 3 or larger than 6 x 6.
export const REPAIR_BASE = Object.freeze({ size: 5, capacity: 120, minSize: 3, maxSize: 6, capacityPerPoint: 6, pointsPerStep: 3, qualityPerPoint: 4, flowPerTier: 0.1 });
export const REPAIR_CATEGORIES = Object.freeze(['time', 'size', 'quality']);

export function setupRepair({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, REPAIR_CATEGORIES, level);
  const t = tierInfo(tier);
  const b = REPAIR_BASE;
  const k = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const size = Math.max(b.minSize, Math.min(b.maxSize, b.size - Math.floor(p.size / b.pointsPerStep) + t.size));
  const capacity = Math.round(+((b.capacity + b.capacityPerPoint * p.time) * t.time).toFixed(6));
  const flow = Math.round((1 - b.flowPerTier * k) * 100) / 100;
  return { size, capacity, flow, qualityBonus: b.qualityPerPoint * p.quality, tier: k, points: p, label: t.label };
}

/** How long until the water reaches the valve with one leak open, in plain words, to the nearest half minute ("about 2\u00bd minutes"). */
export function poolLasts({ capacity, flow = 1 } = {}) {
  const halves = Math.round((capacity / (flow || 1)) / 30);
  if (halves < 1) return 'under half a minute';
  const whole = Math.floor(halves / 2), half = halves % 2;
  const n = whole ? `${whole}${half ? '\u00bd' : ''}` : '\u00bd';
  return `about ${n} minute${whole > 1 || (whole === 1 && half) ? 's' : ''}`;
}

// --- Hacking, the old bypass ring (onfoot/rules/hack.js): kept for the practice dummy lock ---------------
// Categories: time, size, retries.
//   time     +1.5 s per point   (0..9 -> +0..+13.5 s)
//   size     every point widens the lit window 5% (0..9 -> x1..x1.45); every 2nd point also removes a tumbler
//            (0-1: 0, 2-3: -1, 4-5: -2, 6-7: -3, 8-9: -4), never under 2, so points past the floor still widen the window
//   retries  one more allowed miss per 2 points (0..9 -> +0..+4)
// Base: the lock level's own numbers. Tier: time x, size +/-1 tumbler, spare miss +1/-1.
// Never fewer than 2 tumblers; never fewer than 0 allowed misses; never under 1.8 s per tumbler.
export const RING_SECONDS_PER_TUMBLER = 1.8;
export const RING_WINDOW_PER_POINT = 0.05;
export function setupRing({ tier = 0, points = {}, level = POINT_MAX, lock = { time: 16, tumblers: 3, misses: 2 } } = {}) {
  const p = cleanPoints(points, HACK_CATEGORIES, level);
  const t = tierInfo(tier);
  const tumblers = Math.max(2, lock.tumblers - Math.floor(p.size / 2) + t.size);
  // Floor: a perfect run of a Rough level-4 lock used 98% of its clock, so no hack gets under 1.8 s per tumbler.
  const time = Math.max(tumblers * RING_SECONDS_PER_TUMBLER, Math.round(+((lock.time + 1.5 * p.time) * t.time).toFixed(6) * 10) / 10);
  return {
    time: Math.round(time * 10) / 10, tumblers, window: Math.round((1 + RING_WINDOW_PER_POINT * p.size) * 100) / 100,
    misses: Math.max(0, lock.misses + Math.floor(p.retries / 2) + t.extra),
    tier: Math.max(-2, Math.min(2, Math.trunc(tier) || 0)), points: p, label: t.label,
  };
}

// --- Hacking v2: mirrors, a portal and firewalls (Donaven 2026-11-18) ---------------------------------
// "use mirrors, click a box and hold to rotate them, open a portal with a timed catch, then shoot a projectile
// to break a firewall per stage; you are timed per firewall; miss it and the mirrors and portal reset on the same
// seed; fail all your retries and security is alerted." Categories: time, size, retries.
//   time     +2 s per firewall per point (0..9 -> +0..+18 s)
//   size     every point brings the farthest a mirror can start from its place one step closer (12 .. 3 steps of 7.5 degrees);
//            every 2 points one fewer decoy mirror on every stage (never under 0); every 3 points one fewer mirror on the path (never under 1)
//   retries  +1 retry per point (0..9): a retry is a reset of the same firewall on the same seed
// Base: lock grade 1..4 = that many firewalls (grade 1 has only one). Time 26 s a firewall. Mirrors on the path by stage
// [2, 3, 3, 4], decoys [1, 2, 3, 3]. One retry. The portal catch: a marker sweeps a bar at 0.9 bars a second, a window 20% wide.
// Tier: time x (0.70 .. 1.30); decoys -1 at +2 and +1 at -2; retries +1 at Good and Smooth, -1 at Rough; the catch window x(1 + 0.1 x tier).
// Never under 8 s a firewall.
export const HACK_CATEGORIES = Object.freeze(['time', 'size', 'retries']);
export const HACK_BASE = Object.freeze({ time: 26, timePerPoint: 2, minTime: 8, spread: 12, minSpread: 3, mirrors: Object.freeze([2, 3, 3, 4]), decoys: Object.freeze([1, 2, 3, 3]), retries: 1, spreadPerPoint: 1, pointsPerDecoy: 2, pointsPerMirror: 3, catchWindow: 0.2, catchSpeed: 0.9 });
export function setupHack({ tier = 0, points = {}, level = POINT_MAX, lock = 1 } = {}) {
  const p = cleanPoints(points, HACK_CATEGORIES, level);
  const k = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const t = tierInfo(k);
  const b = HACK_BASE;
  const grade = Math.max(1, Math.min(4, Math.trunc(typeof lock === 'object' ? lock?.level : lock) || 1));
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  const stage = (list, i) => list[Math.min(i, list.length - 1)];
  const mirrors = Array.from({ length: grade }, (_, i) => Math.max(1, stage(b.mirrors, i) - Math.floor(p.size / b.pointsPerMirror)));
  const decoys = Array.from({ length: grade }, (_, i) => Math.max(0, stage(b.decoys, i) - Math.floor(p.size / b.pointsPerDecoy) + (k === 2 ? -1 : k === -2 ? 1 : 0)));
  return {
    firewalls: grade, mirrors, decoys,
    time: Math.round(Math.max(b.minTime, (b.time + b.timePerPoint * p.time) * t.time) * 10) / 10,
    spread: Math.max(b.minSpread, b.spread - b.spreadPerPoint * p.size),
    retries: Math.max(0, b.retries + (k >= 1 ? 1 : k === -2 ? -1 : 0) + p.retries),
    catchWindow: r4(b.catchWindow * (1 + 0.1 * k)), catchSpeed: b.catchSpeed,
    tier: k, points: p, label: t.label,
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

// --- Social: persuade, read the room (PLAN.md section 2.6) -------------------------
// They care about 3 of 5 values and dislike 1. You pick argument cards from a hand; a card on
// something they care about lands (its worth + a streak bonus), a miss costs patience.
// Base: trust needed 22, patience 3, tells shown 1.
// Tier: tells [0,1,1,2,2]; patience +1 at +1 and +2, -1 at -2 (never under 2); trust needed
//   [+2,+1,0,-1,-3] for tiers -2..+2.
// Points (persuade): trust needed -1 per point (never under 10); one more tell per 3 points.
export const PERSUADE_BASE = Object.freeze({ goal: 22, goalMin: 10, patience: 3, tells: 1, goalPerPoint: 1, pointsPerTell: 3, maxTells: 4 });
export function setupPersuade({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, SOCIAL_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = PERSUADE_BASE;
  return {
    goal: Math.max(b.goalMin, b.goal + [2, 1, 0, -1, -3][t + 2] - b.goalPerPoint * p.persuade),
    patience: Math.max(2, b.patience + (t >= 1 ? 1 : 0) - (t <= -2 ? 1 : 0)),
    tells: Math.min(b.maxTells, b.tells + [-1, 0, 0, 1, 1][t + 2] + Math.floor(p.persuade / b.pointsPerTell)),
    tier: t, points: p, label: tierInfo(t).label,
  };
}

// --- Social: intimidate, push your luck (PLAN.md section 2.6) ----------------------
// Each Push raises what you have won (3, 6, 10, 15, 21, 28 after 1 to 6 pushes) and risks a snap
// (they lose their temper and you win nothing). Stand takes what you have; you need 10 to win,
// 15 for a second star, 21 for a third.
// Base snap chance on push 1 to 6: 8, 14, 22, 32, 44, 58 percent.
// Tier: chances +6, +3, 0, -3, -6 points for tiers -2..+2; at Shaky and Rough you cannot read the
// exact chance, only a word for it.
// Points (intimidate): each point takes 1 point off every snap chance (never under 2 percent); every 4 points
// give one save (a snap is shrugged off once: you lose that push but keep what you won).
export const INTIMIDATE_BASE = Object.freeze({ chances: Object.freeze([8, 14, 22, 32, 44, 58]), wins: Object.freeze([3, 6, 10, 15, 21, 28]), goal: 10, stars: Object.freeze([10, 15, 21]), perPoint: 1, floor: 2, pointsPerSave: 4 });
export function setupIntimidate({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, SOCIAL_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = INTIMIDATE_BASE;
  const off = [6, 3, 0, -3, -6][t + 2];
  return {
    chances: b.chances.map((c) => Math.max(b.floor, c + off - b.perPoint * p.intimidate)),
    wins: b.wins.slice(), goal: b.goal, stars: b.stars.slice(),
    saves: Math.floor(p.intimidate / b.pointsPerSave),
    readsOdds: t >= 0,
    tier: t, points: p, label: tierInfo(t).label,
  };
}

// --- Piloting: touchdown (PLAN.md section 2.7) -------------------------------------
// Categories: handling, boost, landing.
//   handling  drift power +6% per point
//   boost     +0.5 s of thrust fuel per point, and one emergency brake per 3 points
//   landing   safe touchdown speed +5% per point
// Base: free fall from the top takes 12 s, safe touchdown speed 3.0, drift power 4.0, wind 2.5,
// thrust fuel 10 s (thrust pushes 2.2 x gravity), pad 20 wide (of 100), no brakes (each brake cancels 60% of the fall speed).
// Tier: wind x(1 - 0.15 x tier); fall time x the shared tier clock (more time = gentler fall);
// pad x0.90, 0.95, 1.00, 1.10, 1.20 for tiers -2..+2.
export const PILOT_CATEGORIES = Object.freeze(['handling', 'boost', 'landing']);
export const PILOT_BASE = Object.freeze({ fall: 12, safe: 3.0, drift: 4.0, wind: 2.5, fuel: 10, pad: 20, thrust: 2.2, handlingPerPoint: 0.06, fuelPerPoint: 0.5, pointsPerBrake: 3, safePerPoint: 0.05, brakeCancel: 0.6 });
export function setupPilot({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, PILOT_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = PILOT_BASE;
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  return {
    fall: r4(b.fall * tierInfo(t).time),
    safe: r4(b.safe * (1 + b.safePerPoint * p.landing)),
    drift: r4(b.drift * (1 + b.handlingPerPoint * p.handling)),
    wind: r4(b.wind * (1 - 0.15 * t)),
    fuel: r4(b.fuel + b.fuelPerPoint * p.boost),
    pad: r4(b.pad * [0.9, 0.95, 1, 1.1, 1.2][t + 2]),
    brakes: Math.floor(p.boost / b.pointsPerBrake),
    thrust: b.thrust, brakeCancel: b.brakeCancel,
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

// --- Navigation: plot the lane (PLAN.md section 2.3) ------------------------------
// Categories: time (travel time), fuel (fuel use), warning (hazard warning).
//   time     every lane costs 4% less travel time per point        (0..9 -> x1 .. x0.64, exact, never rounded)
//   fuel     every lane costs 4% less fuel per point               (x1 .. x0.64)
//   warning  hazards show this many cells from the route head: 0-2 points 1, 3-5: 2, 6-8: 3, 9: 4
// Base: 6 x 6 grid, 5 hidden hazards, budgets 1.5 x the best hazard-free route. Tier: grid 5 at +2 and
// 7 at -2, hazards -1 at +2 and +1 at -2, time budget x the shared tier clock (0.7 .. 1.3).
export const NAV_CATEGORIES = Object.freeze(['time', 'fuel', 'warning']);
export const NAV_BASE = Object.freeze({ size: 6, hazards: 5, reveal: 1, costPerPoint: 0.04, pointsPerReveal: 3, budget: 1.5 });
export function setupNav({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, NAV_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = NAV_BASE;
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  return {
    size: b.size - (t === 2 ? 1 : 0) + (t === -2 ? 1 : 0),
    hazards: b.hazards - (t === 2 ? 1 : 0) + (t === -2 ? 1 : 0),
    reveal: Math.min(4, b.reveal + Math.floor(p.warning / b.pointsPerReveal)),
    timeFactor: r4(1 - b.costPerPoint * p.time),
    fuelFactor: r4(1 - b.costPerPoint * p.fuel),
    budgetFactor: tierInfo(t).time,
    tier: t, points: p, label: tierInfo(t).label,
  };
}

// --- Stealth: shadow slip (PLAN.md section 2.4) -----------------------------------
// Categories: quiet (quiet movement), range (detection range), decay (heat decay).
//   quiet   a heard step adds 7% less heat per point                 (12 .. 4.4 per heard step)
//   range   guard view cones are 6% shorter per point; the cone's last cell fades smoothly   (4 .. 1.84 cells)
//   decay   heat cools 2 more per quiet beat per point               (8 .. 26 per beat)
// Base: 2 guards, cone 4 cells, seen +34 heat per guard per beat, heard +12, alert ring 2, caught at 100,
// shift change after 28 beats. Tier: guards -1 at +2 and +1 at -2 (never under 1); beats x the shared clock.
export const STEALTH_CATEGORIES = Object.freeze(['quiet', 'range', 'decay']);
export const STEALTH_BASE = Object.freeze({ guards: 2, cone: 4, seen: 34, heard: 12, alert: 2, caught: 100, beats: 28, decay: 8, quietPerPoint: 0.07, rangePerPoint: 0.06, decayPerPoint: 2 });
export function setupStealth({ tier = 0, points = {}, level = POINT_MAX } = {}) {
  const p = cleanPoints(points, STEALTH_CATEGORIES, level);
  const t = Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
  const b = STEALTH_BASE;
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  return {
    guards: Math.max(1, b.guards - (t === 2 ? 1 : 0) + (t === -2 ? 1 : 0)),
    beats: Math.round(+(b.beats * tierInfo(t).time).toFixed(6)),
    noiseFactor: r4(1 - b.quietPerPoint * p.quiet),
    rangeFactor: r4(1 - b.rangePerPoint * p.range),
    decay: b.decay + b.decayPerPoint * p.decay,
    tier: t, points: p, label: tierInfo(t).label,
  };
}

// --- Shooting: the shooting gallery (Donaven 2026-11-19) ------------------------------------------------
// Shooting has no d20 roll (like live stealth): the gallery is set up by the points and the lesson level you pick.
// Categories: reload, ammo, spray. Each point changes something you can see on the range.
//   reload  a reload is 0.14 s faster per point (1.8 s .. 0.54 s): the reload bar is shorter
//   ammo    one more round in the magazine per point (6 .. 15): one more pip in the magazine
//   spray   the resting crosshair bloom is 0.22 units narrower per point (3.2 .. 1.22), and every shot kicks it
//           0.12 units less (1.6 .. 0.52): the ring drawn around the crosshair is smaller
// The bloom is the radius, in range units (the range is 160 wide and 100 high), a shot may land from where you aim.
// It grows by one kick per shot fired (up to 4 shots' worth) and settles back at 2.5 shots a second.
// Lessons (the difficulty; there is no roll): 1 Basic, 2 Standard, 3 Expert.
export const SHOOTING_CATEGORIES = Object.freeze(['reload', 'ammo', 'spray']);
export const SHOOTING_BASE = Object.freeze({ reload: 1.8, reloadPerPoint: 0.14, magazine: 6, spread: 3.2, spreadPerPoint: 0.22, kick: 1.6, kickPerPoint: 0.12, heatMax: 4, heatDecay: 2.5, fireGap: 0.22 });
export const SHOOTING_LESSONS = Object.freeze([
  Object.freeze({ id: 1, name: 'Basic', unlockLevel: 1, targets: 10, time: 30, par: 9, speed: 1, size: 1, bull: 0.26, hitXp: 2, bullXp: 1, bullEvery: 3 }),
  Object.freeze({ id: 2, name: 'Standard', unlockLevel: 4, targets: 12, time: 28, par: 11, speed: 1.25, size: 0.9, bull: 0.22, hitXp: 3, bullXp: 2, bullEvery: 2 }),
  Object.freeze({ id: 3, name: 'Expert', unlockLevel: 7, targets: 14, time: 26, par: 13, speed: 1.5, size: 0.8, bull: 0.18, hitXp: 4, bullXp: 3, bullEvery: 2 }),
]);
export const shootingLesson = (n) => SHOOTING_LESSONS[Math.max(1, Math.min(SHOOTING_LESSONS.length, Math.trunc(n) || 1)) - 1];
export function setupShooting({ points = {}, level = POINT_MAX, lesson = 1 } = {}) {
  const p = cleanPoints(points, SHOOTING_CATEGORIES, level);
  const b = SHOOTING_BASE;
  const r2 = (x) => Math.round(+x.toFixed(6) * 100) / 100;
  const l = shootingLesson(lesson);
  return {
    reloadSeconds: r2(b.reload - b.reloadPerPoint * p.reload),
    magazine: b.magazine + p.ammo,
    spread: r2(b.spread - b.spreadPerPoint * p.spray),
    kick: r2(b.kick - b.kickPerPoint * p.spray),
    heatMax: b.heatMax, heatDecay: b.heatDecay, fireGap: b.fireGap,
    lesson: l.id, points: p, label: l.name,
  };
}
