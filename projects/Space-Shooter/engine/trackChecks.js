// The rules every Stardust circuit has to pass, in one place: the five network
// circuits (tests/stardust-track.test.mjs), the custom track
// (tests/stardust-custom-track.test.mjs) and the track editor (editor.html) all
// run these same checks and the same scripted pilot.
//
// Every problem is { code, message } with a message in plain words, because
// the editor shows them to the person drawing the track.
import { createCustomLayout, CUSTOM_LEVEL } from "./levels.js";
import {
  isInsideTrack,
  pointOnTrack,
  createTrackProgress,
  updateTrackProgress,
  isLapReady,
  constrainToTrack,
  portalCoordinates,
} from "./track.js";
import { state, config } from "../state.js";
import { handlePlayerMovement } from "./systems/movement.js";
import {
  applyGravity,
  resolveHazards,
  updateHazards,
  updateDrones,
  resolveRoadmapProjectiles,
} from "./systems/environment.js";
import { hasRequiredShards } from "./rules.js";

export const TRACK_RULES = Object.freeze({
  GRID_W: 48,
  GRID_H: 32,
  MIN_POINTS: 4,
  MAX_POINTS: 40,
  MIN_WIDTH: 5.8,
  MAX_WIDTH: 8,
  MIN_LENGTH: 95,
  MIN_APEXES: 3,
  MAX_APEXES: 5,
  // Two stretches of lane this far apart along the lap must not touch.
  LANE_GAP: 20,
  // The scripted careful pilot must finish inside this, with fuel to spare.
  PILOT_SECONDS: 60,
  PILOT_MIN_FUEL: 25,
});

const round = (n) => Math.round(n * 10) / 10;
const at = (p) => `(${round(p.x)}, ${round(p.y)})`;
const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const isIndexList = (list) => Array.isArray(list) && list.every((i) => Number.isInteger(i));
const problem = (code, message) => ({ code, message });

function nodeName(node) {
  if (node.kind === "start" || node.kind === "gate") return "the start portal";
  if (node.kind === "station") return "the fuel station";
  if (node.kind === "planet") return `the apex signal at point ${node.corner}`;
  return node.kind;
}

/**
 * The shape of a LEVELS-format source, before any geometry: the things that
 * would stop the layout from being built at all.
 */
export function checkTrackSource(source) {
  const R = TRACK_RULES;
  const out = [];
  if (!source || typeof source !== "object") return [problem("source", "There is no track data.")];
  if (typeof source.title !== "string" || !source.title.trim()) out.push(problem("title", "Give the track a title."));
  const points = source.points;
  if (!Array.isArray(points) || points.length < R.MIN_POINTS) {
    out.push(problem("points", `A track needs at least ${R.MIN_POINTS} points (it has ${Array.isArray(points) ? points.length : 0}).`));
    return out;
  }
  if (points.length > R.MAX_POINTS) out.push(problem("points", `Keep it to ${R.MAX_POINTS} points or fewer (it has ${points.length}).`));
  points.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1]))
      out.push(problem("points", `Point ${i} isn't a pair of numbers.`));
  });
  if (out.some((p) => p.code === "points")) return out;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n];
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.001)
      out.push(problem("duplicate-point", `Points ${i} and ${(i + 1) % n} are on top of each other.`));
  }
  if (!isNum(source.width)) out.push(problem("width", "Set a lane width."));
  else if (source.width < R.MIN_WIDTH) out.push(problem("narrow", `The lane is too narrow (${source.width}). Make it at least ${R.MIN_WIDTH} wide.`));
  else if (source.width > R.MAX_WIDTH) out.push(problem("wide", `The lane is too wide (${source.width}). Keep it at ${R.MAX_WIDTH} or less.`));

  const apexes = source.apexes;
  if (!isIndexList(apexes)) out.push(problem("apex-count", "Mark the apex corners by point number."));
  else {
    if (apexes.length < R.MIN_APEXES || apexes.length > R.MAX_APEXES)
      out.push(problem("apex-count", `Mark ${R.MIN_APEXES} to ${R.MAX_APEXES} apex corners (now ${apexes.length}).`));
    if (new Set(apexes).size !== apexes.length) out.push(problem("apex-index", "An apex corner is marked twice."));
    for (const i of apexes) {
      if (i === 0) out.push(problem("apex-index", "Point 0 is the start portal; it can't also be an apex."));
      else if (i < 0 || i >= n) out.push(problem("apex-index", `Apex ${i} isn't a point of this track (points 1 to ${n - 1}).`));
    }
    for (let k = 1; k < apexes.length; k++)
      if (apexes[k] <= apexes[k - 1]) { out.push(problem("apex-order", "List the apex corners in lap order (smallest point number first).")); break; }
  }
  const rocks = source.rocks ?? [];
  if (!isIndexList(rocks)) out.push(problem("rock-index", "Rocks are listed by segment number."));
  else {
    if (new Set(rocks).size !== rocks.length) out.push(problem("rock-index", "A segment has two rocks listed."));
    for (const i of rocks) if (i < 0 || i >= n) out.push(problem("rock-index", `Segment ${i} doesn't exist (segments 0 to ${n - 1}).`));
    const moving = source.moving ?? [];
    if (!isIndexList(moving) || moving.some((i) => !rocks.includes(i)))
      out.push(problem("moving", "A moving rock has to be on a segment that has a rock."));
  }
  const drones = source.drones ?? [];
  if (!Array.isArray(drones) || drones.some((f) => !isNum(f) || f <= 0 || f >= 1))
    out.push(problem("drones", "Sentinels are placed by lap fraction, between 0 and 1."));
  if (source.well != null) {
    const w = source.well;
    if (!w || ![w.x, w.y, w.radius, w.influence, w.strength].every(isNum))
      out.push(problem("well", "The gravity well needs x, y, radius, influence and strength."));
    else if (w.x < 0 || w.y < 0 || w.x > R.GRID_W || w.y > R.GRID_H)
      out.push(problem("well", "The gravity well is off the map."));
  }
  return out;
}

/**
 * All the geometry rules on a built layout: bounds, lap length, signals and
 * rocks inside the lane and clear of each other, a drivable centreline, and no
 * two distant parts of the lane close enough to cut across.
 * Returns { problems, warnings }.
 */
export function checkTrackLayout(layout, source = null) {
  const R = TRACK_RULES;
  const problems = [];
  const warnings = [];
  const track = layout.track;
  const radius = config.PLAYER_RADIUS;
  if (!(track.width >= R.MIN_WIDTH)) problems.push(problem("narrow", `The lane is too narrow (${track.width}). Make it at least ${R.MIN_WIDTH} wide.`));
  if (!(track.length > R.MIN_LENGTH)) problems.push(problem("short", `The lap is too short (${round(track.length)} cells). Make it longer than ${R.MIN_LENGTH}.`));
  track.points.forEach((point, i) => {
    const half = track.width / 2;
    if (!(point.x - half > 0 && point.x + half < R.GRID_W && point.y - half > 0 && point.y + half < R.GRID_H))
      problems.push(problem("bounds", `Point ${i} ${at(point)} is too close to the edge: the lane would leave the map.`));
  });
  for (const node of layout.nodes) {
    if (node.kind === "gate") continue; // same spot as the start
    if (!isInsideTrack(track, node.x + 0.5, node.y + 0.5, radius))
      problems.push(problem("node-outside", `${nodeName(node)[0].toUpperCase()}${nodeName(node).slice(1)} sits outside the lane.`));
    for (const h of layout.hazards)
      if (Math.hypot(node.x + 0.5 - h.x, node.y + 0.5 - h.y) <= h.radius + radius + 0.1)
        problems.push(problem("node-rock", `The rock on segment ${h.segment} is too close to ${nodeName(node)}.`));
  }
  for (const h of layout.hazards) {
    if (!(h.sizeScale >= 0.75 && h.sizeScale <= 1.25) || h.radius !== h.baseRadius * h.sizeScale)
      problems.push(problem("rock-size", `The rock on segment ${h.segment} has an unexpected size.`));
  }
  // The racing line the careful pilot follows must not run through a rock.
  const route = layout.safeRoute;
  for (const h of layout.hazards) {
    let best = Infinity;
    for (let i = 0; i + 1 < route.length; i++) best = Math.min(best, segmentDistance(h, route[i], route[i + 1]));
    if (best <= h.radius + radius)
      problems.push(problem("rock-on-line", `The rock on segment ${h.segment} sits on the racing line near ${at(h)}. Move the corner or the rock.`));
  }
  if (source?.rocks) {
    const placed = new Set(layout.hazards.map((h) => h.segment));
    for (const s of source.rocks)
      if (!placed.has(s)) warnings.push(problem("rock-dropped", `The rock on segment ${s} was left out: it's too close to a signal, the portal or the station.`));
  }
  // Continuous centreline and central racing lane remain drivable along the entire lap.
  for (let d = 0; d < track.length; d += 0.1) {
    const p = pointOnTrack(track, d);
    if (!isInsideTrack(track, p.x, p.y, radius)) { problems.push(problem("lane-break", `The lane breaks near ${at(p)}.`)); break; }
  }
  // Nonlocal portions do not merge into an infield shortcut; local corner cutting is intentional.
  let merges = 0, first = null;
  for (let a = 0; a < track.length; a += 1)
    for (let b = a + R.LANE_GAP; b < track.length; b += 1) {
      if (track.length - (b - a) < R.LANE_GAP) continue;
      const p = pointOnTrack(track, a), q = pointOnTrack(track, b);
      if (!(Math.hypot(p.x - q.x, p.y - q.y) > track.width)) { merges++; first ??= [p, q]; }
    }
  if (merges)
    problems.push(problem("lanes-merge", `Two parts of the lane merge near ${at(first[0])} and ${at(first[1])}: pilots could cut across. Move them further apart.`));
  return { problems, warnings };
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** A fresh flight scene on a layout, as the game builds it. */
export function sceneForLayout(layout, level = CUSTOM_LEVEL) {
  const portal = layout.track.portal;
  return {
    ...layout,
    level,
    player: { x: portal.x, y: portal.y, vx: 0, vy: 0, angle: portal.angle, hp: 100, invulnTimer: 0 },
    startPos: { x: portal.x, y: portal.y },
    lockedInStart: false,
    launched: true,
    fuel: 100,
    flux: 30,
    boost: 3,
    elapsed: 0,
    trackProgress: createTrackProgress(),
    shards: new Set(),
    activeMs: 0,
    timerRunning: false,
  };
}

/**
 * Closed-loop careful pilot: only turn/thrust inputs, real hazards, gravity,
 * enemies and rails, following the layout's safe route at a modest speed.
 * route/finish let a test fly another line (the Iron Veil rear entry).
 * Returns { scene, time, finished, leftLane }.
 */
export function flyCarefulLap(layout, { level = CUSTOM_LEVEL, route = null, finish = null, maxSeconds = TRACK_RULES.PILOT_SECONDS } = {}) {
  const scene = sceneForLayout(layout, level),
    player = scene.player;
  const path = route ? route(scene) : scene.safeRoute;
  state.mode = "roadmap";
  state.ui.countdownActive = false;
  state.gfx.particles = [];
  const shots = [];
  let target = 1,
    time = 0,
    finished = false,
    leftLane = false;
  for (; time < maxSeconds && target < path.length; time += 1 / 120) {
    const goal = path[target],
      dx = goal.x - player.x,
      dy = goal.y - player.y,
      d = Math.hypot(dx, dy);
    if (d < 0.3) {
      target++;
      continue;
    }
    const desiredSpeed = Math.min(4, Math.sqrt(5 * d));
    const ax = ((dx / d) * desiredSpeed - player.vx) * 2,
      ay = ((dy / d) * desiredSpeed - player.vy) * 2;
    let error = Math.atan2(ay, ax) - player.angle;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    Object.assign(state.keys, {
      launch: false,
      boost: false,
      brake: false,
      left: false,
      right: false,
      turnStrength: Math.max(-1, Math.min(1, error * 2)),
      thrustStrength: Math.abs(error) < 0.35 ? Math.min(1, Math.hypot(ax, ay) / 5) : 0,
      backStrength: 0,
      strafeLeft: false,
      strafeRight: false,
    });
    const previous = { x: player.x, y: player.y };
    updateHazards(scene, 1 / 120);
    applyGravity(player, scene.gravityWells, 1 / 120);
    handlePlayerMovement(1 / 120, scene, player, {
      // FUEL_BURN_SCALE is 1 outside the playtest lab, as in the game.
      onFuelUse: (amount) => (scene.fuel -= amount * (config.FUEL_BURN_SCALE ?? 1)),
    });
    resolveHazards(scene, player);
    constrainToTrack(scene.track, player, previous, config.PLAYER_RADIUS);
    updateTrackProgress(scene, previous);
    player.invulnTimer = Math.max(0, player.invulnTimer - 1 / 120);
    updateDrones(scene, player, shots, 1 / 120);
    for (let i = shots.length - 1; i >= 0; i--) {
      const shot = shots[i];
      shot.prevX = shot.x;
      shot.prevY = shot.y;
      shot.x += shot.vx / 120;
      shot.y += shot.vy / 120;
      shot.life -= 1 / 120;
      if (shot.life <= 0) shots.splice(i, 1);
    }
    resolveRoadmapProjectiles(scene, shots);
    for (const node of scene.nodes.filter((n) => n.kind === "planet"))
      if (Math.hypot(player.x - node.x - 0.5, player.y - node.y - 0.5) <= config.PLANET_RADIUS + config.PLAYER_RADIUS)
        scene.shards.add(node.id);
    scene.activeMs = time * 1000;
    const relative = portalCoordinates(scene.track, player);
    const ordinary =
      isLapReady(scene) &&
      hasRequiredShards(scene) &&
      Math.hypot(relative.forward, relative.lateral) <= config.GATE_RADIUS &&
      relative.forward < -0.12 &&
      relative.velocity > 0.15;
    if (finish ? finish(scene, ordinary) : ordinary) {
      finished = true;
      break;
    }
    if (!isInsideTrack(scene.track, player.x, player.y, config.PLAYER_RADIUS)) leftLane = true;
  }
  return { scene, time, finished, leftLane };
}

/** What the careful pilot's lap says about a track, in plain words. */
export function pilotProblems(result) {
  const R = TRACK_RULES;
  const { scene, time, finished, leftLane } = result;
  const out = [];
  if (!finished)
    out.push(problem("pilot", `The test pilot couldn't finish a lap within ${R.PILOT_SECONDS} s (stuck after checkpoint ${scene.trackProgress.passed} of ${scene.track.checkpoints.length}). Soften the tightest corner or widen the lane.`));
  else {
    if (!hasRequiredShards(scene)) out.push(problem("pilot", "The test pilot finished without every apex signal."));
    if (scene.fuel <= R.PILOT_MIN_FUEL) out.push(problem("pilot-fuel", `The test pilot finished with only ${Math.round(scene.fuel)} fuel. Shorten the lap or add a fuel stop.`));
    if (scene.player.hp <= 0) out.push(problem("pilot-hull", "The test pilot's hull was destroyed on the lap."));
    if (!(time < R.PILOT_SECONDS)) out.push(problem("pilot", `The test pilot needed ${round(time)} s; keep a careful lap under ${R.PILOT_SECONDS} s.`));
  }
  if (leftLane) out.push(problem("pilot-lane", "The test pilot was pushed outside the lane."));
  return out;
}

/**
 * Everything at once for a LEVELS-format source: shape, geometry and, when
 * asked, the scripted lap. { ok, problems, warnings, layout, pilot }.
 */
export function checkTrack(source, { pilot = false, level = CUSTOM_LEVEL, layoutFor = null } = {}) {
  const problems = checkTrackSource(source);
  if (problems.length) return { ok: false, problems, warnings: [], layout: null, pilot: null };
  let layout;
  try {
    layout = (layoutFor || createCustomLayout)(source);
  } catch (error) {
    return { ok: false, problems: [problem("layout", `The track can't be built: ${error.message}`)], warnings: [], layout: null, pilot: null };
  }
  const geometry = checkTrackLayout(layout, source);
  problems.push(...geometry.problems);
  let flown = null;
  if (pilot && !problems.length) {
    flown = flyCarefulLap(layout, { level });
    problems.push(...pilotProblems(flown));
  }
  return { ok: problems.length === 0, problems, warnings: geometry.warnings, layout, pilot: flown };
}
