// A weekly layout flown with the new game's upgraded ship (quest races and the
// hangar's practice circuit). It sits NEXT TO the versioned weekly physics and
// changes none of it: the scene is today's own createWeeklyScene (the hull
// physics, or the garage build's hull when one is equipped), and only this
// scene's config is swapped for one with the upgraded multipliers, through the
// same applyBuildStats the garage builds use. WEEKLY_CONFIG, the physics
// versions, recorded logs and ghosts are untouched, and a quest race scene is
// never encoded, replayed or saved (systems/questRace.js).
import { createWeeklyScene, WEEKLY_CONFIG, WEEKLY_PHYSICS } from "./sim.js";
import { applyBuildStats, buildStats } from "../shipStats.js";

const STAT_KEYS = ["topSpeed", "accel", "grip", "boost", "brake"];
const LIMIT = Object.freeze({ lo: 0.5, hi: 2 });

/** Racing multipliers, cleaned: every key present, finite, inside 0.5..2. */
export function cleanRaceStats(stats) {
  const out = {};
  for (const k of STAT_KEYS) {
    const v = Number(stats?.[k]);
    out[k] = Number.isFinite(v) ? Math.min(LIMIT.hi, Math.max(LIMIT.lo, v)) : 1;
  }
  return Object.freeze(out);
}

/**
 * layout: createWeeklyLayout(event). stats: core's raceStats(save, build, 'race').
 * build: the equipped garage build key, or null for the standard ship.
 */
export function createQuestRaceScene(layout, { stats, build = null } = {}) {
  const ship = build && buildStats(build) ? build : null;
  const scene = createWeeklyScene(layout, ship ? { physics: WEEKLY_PHYSICS.BUILD, ship } : {});
  const clean = cleanRaceStats(stats);
  scene.questRace = true;
  // A stock ship with no upgrades flies today's physics exactly (no swapped config).
  const stock = !ship && Object.values(clean).every((v) => Math.abs(v - 1) < 1e-9);
  if (stock) return scene;
  scene.stats = clean;
  scene.config = applyBuildStats(WEEKLY_CONFIG, clean);
  return scene;
}
