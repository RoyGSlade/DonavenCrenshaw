// Ship builds: what each garage part does to how the ship flies. Pure data and
// arithmetic (no DOM, no randomness), so the weekly sim and its replays can use
// it. The collision outline of a build is in shipHulls.js; this file is the
// other half of the trade-off.
//
// The idea (owner's design, 2026-09-30): surface area carries inertial
// dampeners, tiny nozzles that cancel sideways slide. A wide, heavy build grips
// and accelerates well but tops out lower; a thin one is a small target with a
// high top speed that drifts through corners and is slow off the line.
//
// Every stat is a multiplier on the standard ship (1 = today's Courier):
//   topSpeed  0.80 .. 1.20   (the cap is 15 cells/s, so 12 .. 18)
//   accel     0.85 .. 1.15   thrust
//   grip      0.75 .. 1.25   how fast sideways slide bleeds off (see GRIP below)
//   boost     0.90 .. 1.10   boost impulse
//   brake     0.90 .. 1.10   flux brake strength
// A build is "family:body-wings-cockpit-engines", e.g. "needle:0-1-2-0". The
// cockpit never changes anything.
import { BUILD_HULL, HULLS, HULL_METRICS } from "./shipHulls.js";

export const STAT_LIMITS = Object.freeze({
  topSpeed: [0.8, 1.2], accel: [0.85, 1.15], grip: [0.75, 1.25], boost: [0.9, 1.1], brake: [0.9, 1.1],
});

// The hull family sets the character.
const FAMILY = Object.freeze({
  courier: {},                                                   // the standard ship
  needle: { grip: -0.15, topSpeed: +0.10, accel: -0.07 },        // thin: fast and drifty
  manta: { grip: +0.15, topSpeed: -0.10, accel: +0.07 },         // wide: grippy and quick off the line
  wisp: { boost: +0.10, brake: +0.10 },                          // balanced: boosts and stops better
});
// Wings swing it 5% either way, body 2%, engines another 5%.
const THIN_WING = Object.freeze({ grip: -0.05, topSpeed: +0.05, accel: -0.03 });
const THICK_WING = Object.freeze({ grip: +0.05, topSpeed: -0.05, accel: +0.03 });
const SLIM_BODY = Object.freeze({ grip: -0.02, topSpeed: +0.02 });
const ARMOURED_BODY = Object.freeze({ grip: +0.02, topSpeed: -0.02 });
const BIG_ENGINE = Object.freeze({ topSpeed: +0.05, accel: -0.05, grip: -0.05 });  // one large drive: top end, slow off the line
const TWIN_ENGINE = Object.freeze({ topSpeed: -0.05, accel: +0.05, grip: +0.05 }); // two small drives: snappy, steadier
const NONE = Object.freeze({});

// Which part index is which, per family (names from the garage's PART_CHOICES).
const PARTS = Object.freeze({
  needle: {
    body: { 0: SLIM_BODY, 2: ARMOURED_BODY },       // Spear, Bastion
    wings: { 0: THIN_WING, 1: THICK_WING },         // Lance (twin needles), Talon (armoured hooks)
    engines: { 0: BIG_ENGINE, 1: TWIN_ENGINE },     // Torch (single nozzle), Twin
  },
  manta: {
    body: { 0: SLIM_BODY, 2: ARMOURED_BODY },       // Keel, Citadel
    wings: { 0: THIN_WING, 1: THICK_WING },         // Crescent, Scythe (broad sweep)
    engines: { 0: TWIN_ENGINE, 1: BIG_ENGINE },     // Twin inset drives, Pulse drive pods
  },
  wisp: {
    body: { 0: SLIM_BODY, 2: ARMOURED_BODY },       // Petal, Carapace
    wings: { 0: THIN_WING, 1: THICK_WING },         // Veil, Lotus (flared lobes)
    engines: { 0: TWIN_ENGINE, 1: BIG_ENGINE },     // Whisper paired vents, Bloom drive pods
  },
  courier: {
    body: { 0: NONE },
    wings: { 0: NONE, 1: THIN_WING, 2: THICK_WING }, // Courier, Vector, Bulwark
    engines: { 0: NONE },
  },
});

const BUILD = /^(courier|needle|manta|wisp):(\d)-(\d)-(\d)-(\d)$/;

/** "needle:0-1-2-0" → { family, body, wings, cockpit, engines } or null if it is not a real build. */
export function parseBuild(key) {
  const m = typeof key === "string" ? BUILD.exec(key) : null;
  if (!m || !Object.hasOwn(BUILD_HULL, key)) return null;
  return { family: m[1], body: +m[2], wings: +m[3], cockpit: +m[4], engines: +m[5] };
}
export const isBuild = (key) => parseBuild(key) !== null;
export const buildKey = ({ family, body, wings, cockpit, engines }) => `${family}:${body}-${wings}-${cockpit}-${engines}`;
/** Every build the garage can make, in a stable order. */
export const ALL_BUILDS = Object.freeze(Object.keys(BUILD_HULL).sort());

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v * 1000) / 1000;

/** A build's stats as multipliers on the standard ship, or null for an unknown build. */
export function buildStats(key) {
  const b = parseBuild(key);
  if (!b) return null;
  const parts = PARTS[b.family];
  const mods = [FAMILY[b.family], parts.body[b.body] || NONE, parts.wings[b.wings] || NONE, parts.engines[b.engines] || NONE];
  const out = {};
  for (const stat of Object.keys(STAT_LIMITS)) {
    let v = 1;
    for (const m of mods) v += m[stat] || 0;
    out[stat] = round(clamp(v, STAT_LIMITS[stat]));
  }
  return Object.freeze(out);
}

// Size on top of the garage's framing (which fits every ship to the same
// square). The twin-blade Needle (Lance wings) came out 0.30 cells wide, a
// third of every other ship, so it flies at 1.75 times the size (owner's
// call, 2026-09-30): about 0.52 wide and 1.7 long. Drawing and hitbox both.
const SCALE = Object.freeze({ "needle-lance": 1.75 });
/** How much bigger than the garage framing a build is drawn and collides. */
export function buildScale(key) {
  const b = parseBuild(key);
  if (!b) return 1;
  return b.family === "needle" && b.wings === 0 ? SCALE["needle-lance"] : 1;
}

const scaled = new Map(); // "hull index x scale" -> frozen outline, shared by builds that differ only by cockpit
/** The build's collision outline (ship-local cells), scaled, or null. */
export function buildHull(key) {
  if (!Object.hasOwn(BUILD_HULL, key)) return null;
  const k = buildScale(key), id = `${BUILD_HULL[key]}x${k}`;
  if (!scaled.has(id)) scaled.set(id, k === 1 ? HULLS[BUILD_HULL[key]] : Object.freeze(HULLS[BUILD_HULL[key]].map(([x, y]) => Object.freeze([+(x * k).toFixed(4), +(y * k).toFixed(4)]))));
  return scaled.get(id);
}
/** { width, length, area } of the build's hull in cells, scaled, or null. */
export function buildHullSize(key) {
  if (!Object.hasOwn(BUILD_HULL, key)) return null;
  const k = buildScale(key), m = HULL_METRICS[BUILD_HULL[key]];
  return k === 1 ? m : Object.freeze({ width: +(m.width * k).toFixed(4), length: +(m.length * k).toFixed(4), area: +(m.area * k * k).toFixed(4) });
}

// Grip. Today's ship has no sideways damping at all: it keeps sliding until
// thrust cancels it. Builds add dampeners: sideways speed (relative to where
// the nose points) decays at GRIP_RATE * (grip - GRIP_FLOOR) per second. The
// driftiest possible build (grip 0.75) is pure inertia like today's ship; the
// standard build (1.00) sheds half its slide in about 2.3 s; the grippiest
// (1.25) in about 1.2 s.
export const GRIP_FLOOR = 0.75;
export const GRIP_RATE = 1.2;

/** A flight config for a build: the base config with the build's stats applied. */
export function applyBuildStats(base, stats) {
  return Object.freeze({
    ...base,
    MAX_SPEED: base.MAX_SPEED * stats.topSpeed,
    THRUST_ACCEL: base.THRUST_ACCEL * stats.accel,
    BOOST_IMPULSE: base.BOOST_IMPULSE * stats.boost,
    BRAKE_SCALE: stats.brake,
    LATERAL_DAMP: GRIP_RATE * Math.max(0, stats.grip - GRIP_FLOOR),
  });
}
