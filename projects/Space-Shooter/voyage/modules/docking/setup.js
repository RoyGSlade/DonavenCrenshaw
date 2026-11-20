// How the roll and the three Handling paths set up Docking. Pure: no DOM, no randomness. Copied from the game's minigames/setup.js
// (TIER, tierInfo, cleanPoints) so this module stands alone; the docking block is the draft's setupDocking with the three paths
// named by their tabletop divisions (control, maneuver, pursuit) and Stardust's old piloting names accepted as aliases.
//
//   control   (landing)   a wider corridor        +4% a point
//   maneuver  (handling)  a slower sweep          -4% a point
//   pursuit   (boost)     a longer wall warning   +0.12 s a point (the wall glows earlier and the tone starts sooner)
// The roll (tier -2 Rough .. +2 Smooth) widens or narrows the corridor and slows or quickens the sweep. Points never touch anything
// but toward easier, so a point can never make a run harder.

export const POINT_MAX = 9;
export const PATHS = Object.freeze(['control', 'maneuver', 'pursuit']);
/** Stardust's piloting names today, accepted for the three divisions. */
export const ALIASES = Object.freeze({ landing: 'control', handling: 'maneuver', boost: 'pursuit' });

export const TIER = Object.freeze({
  '-2': Object.freeze({ label: 'Rough' }),
  '-1': Object.freeze({ label: 'Shaky' }),
  '0': Object.freeze({ label: 'Steady' }),
  '1': Object.freeze({ label: 'Good' }),
  '2': Object.freeze({ label: 'Smooth' }),
});
export const clampTier = (tier) => Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
export const tierInfo = (tier) => TIER[String(clampTier(tier))];

/** Points by division. Accepts the division names or Stardust's old ones; whole numbers 0..9, never more than `level` in total (spent in path order). */
export function cleanPoints(points = {}, level = POINT_MAX) {
  const out = Object.fromEntries(PATHS.map((p) => [p, 0]));
  let left = Math.max(0, Math.min(POINT_MAX, Math.trunc(level) || 0));
  for (const p of PATHS) {
    const old = Object.keys(ALIASES).find((k) => ALIASES[k] === p);
    const raw = points?.[p] ?? points?.[old];
    const n = Math.max(0, Math.min(POINT_MAX, Math.trunc(raw) || 0));
    out[p] = Math.min(n, left);
    left -= out[p];
  }
  return out;
}

// Base numbers, all placeholders (the draft's, tuned by one lane): half width at the berth and at the mouth of the lit funnel, the
// sweep in radians a second, the wall warning in seconds, the safe closing speed against the berth, the lights-out limit in seconds
// (a quick run gets less), the number of approach lights, and the tug's fee.
export const DOCKING_BASE = Object.freeze({
  berth: 4, mouth: 12, sweep: 0.095, warn: 0.6, safe: 8, tmax: 26, tmaxQuick: 15, lights: 6, fee: 25,
  corridorPerPoint: 0.04, sweepPerPoint: 0.04, warnPerPoint: 0.12,
  corridorTier: [0.85, 0.92, 1, 1.1, 1.2], sweepTier: [1.2, 1.1, 1, 0.9, 0.8],
});

export function setupDocking({ tier = 0, points = {}, level = POINT_MAX, quick = false } = {}) {
  const p = cleanPoints(points, level);
  const t = clampTier(tier);
  const b = DOCKING_BASE;
  const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
  const c = b.corridorTier[t + 2] * (1 + b.corridorPerPoint * p.control);
  return {
    berth: r4(b.berth * c), mouth: r4(b.mouth * c),
    sweep: r4(b.sweep * b.sweepTier[t + 2] * (1 - b.sweepPerPoint * p.maneuver)),
    warn: r4(b.warn + b.warnPerPoint * p.pursuit),
    safe: b.safe, tmax: quick ? b.tmaxQuick : b.tmax, lights: b.lights, fee: b.fee, quick: !!quick,
    tier: t, points: p, label: tierInfo(t).label,
  };
}

/** The result band the brief names: Smooth (exceptional) a wide corridor and a slow sweep; Steady the base game; Rough a narrow one and a quick sweep. */
export const bandOf = (tier) => (clampTier(tier) >= 1 ? 'smooth' : clampTier(tier) <= -1 ? 'rough' : 'steady');
