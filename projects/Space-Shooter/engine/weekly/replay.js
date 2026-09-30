// Weekly input logs and ghosts. A log is every step's quantised input frame
// from the launch to the finish, run-length encoded as text (the hub stores
// it as the run's inputLog, up to 256 KB). Replaying a log through the same
// simulation must land on the same finish time; the ghost is that replay's
// flight path.
//
// Format:  SDW2|<eventId>|<version>|<steps>|<finishMs>|<runs>
//   runs:  "<count>,<turn>,<thrust>,<back>,<strafe>,<bits>" joined by ";",
//          numbers in base 36 (turn may be negative).
// The prefix is the physics the run was flown under (sim.js WEEKLY_PHYSICS):
//   SDW1 — physics 1, the circle hitbox (every run before the hull);
//   SDW2 — physics 2, the ship's real body (what the game records now);
//   SDW3 — physics 3, a garage build: one extra field at the end names it
//          ("SDW3|…|<runs>|needle:0-1-2-0"), and the replay flies that build.
// A log always replays under its own physics, so old times never move.
import { createWeeklyScene, stepWeekly, sameFrame, WEEKLY_PHYSICS } from "./sim.js";
import { isBuild } from "../shipStats.js";

export const LOG_PREFIXES = Object.freeze({ SDW1: WEEKLY_PHYSICS.CIRCLE, SDW2: WEEKLY_PHYSICS.HULL, SDW3: WEEKLY_PHYSICS.BUILD });
const PREFIX_FOR = Object.freeze({ [WEEKLY_PHYSICS.CIRCLE]: "SDW1", [WEEKLY_PHYSICS.HULL]: "SDW2", [WEEKLY_PHYSICS.BUILD]: "SDW3" });
/** The prefix new recordings get (the current physics). */
export const LOG_PREFIX = PREFIX_FOR[WEEKLY_PHYSICS.CURRENT];
export const GHOST_EVERY = 4; // one ghost pose per 4 steps (30 a second)

/** physics: the version the frames were flown under (default: the current one). */
export function encodeInputLog({ eventId, version, frames, finishMs, physics = WEEKLY_PHYSICS.CURRENT, ship = null }) {
  const prefix = PREFIX_FOR[physics];
  if (!prefix) throw new RangeError(`Unknown weekly physics: ${physics}`);
  if (physics === WEEKLY_PHYSICS.BUILD && !isBuild(ship)) throw new RangeError(`Unknown ship build: ${ship}`);
  const runs = [];
  for (const f of frames) {
    const last = runs.at(-1);
    if (last && sameFrame(last.f, f)) last.n++;
    else runs.push({ n: 1, f });
  }
  const body = runs.map(({ n, f }) => [n, f.turn, f.thrust, f.back, f.strafe, f.bits].map((v) => v.toString(36)).join(",")).join(";");
  const fields = [prefix, eventId, version, frames.length, Math.round(finishMs ?? 0), body];
  if (physics === WEEKLY_PHYSICS.BUILD) fields.push(ship);
  return fields.join("|");
}

/** { eventId, version, steps, finishMs, frames, physics } or null for anything malformed. */
export function decodeInputLog(text) {
  if (typeof text !== "string" || text.length > 262144) return null;
  const parts = text.split("|");
  if (!Object.hasOwn(LOG_PREFIXES, parts[0])) return null;
  const physics = LOG_PREFIXES[parts[0]];
  // A build log carries its build as a seventh field; the others have six.
  if (parts.length !== (physics === WEEKLY_PHYSICS.BUILD ? 7 : 6)) return null;
  const [, eventId, version, steps, finishMs, body, ship = null] = parts;
  if (physics === WEEKLY_PHYSICS.BUILD && !isBuild(ship)) return null;
  const frames = [];
  for (const run of body ? body.split(";") : []) {
    const v = run.split(",").map((s) => parseInt(s, 36));
    if (v.length !== 6 || v.some((n) => !Number.isFinite(n))) return null;
    const [n, turn, thrust, back, strafe, bits] = v;
    if (n < 1 || n > 1e6 || frames.length + n > 2e6) return null;
    const f = { turn, thrust, back, strafe, bits };
    for (let i = 0; i < n; i++) frames.push(f);
  }
  if (frames.length !== Number(steps)) return null;
  return { eventId, version: Number(version), steps: Number(steps), finishMs: Number(finishMs), frames, physics, ...(ship ? { ship } : {}) };
}

/**
 * Fly a log through a fresh scene of `layout`. Returns { finished, finishMs,
 * dead, steps, poses } where poses is [x, y, angle] every GHOST_EVERY steps.
 * matches: the replay finished within a millisecond of the log's own time.
 * The physics comes from the log (its prefix); a frames object without one
 * replays under options.physics, else the current physics.
 */
export function replayInputLog(layout, log, { physics = WEEKLY_PHYSICS.CURRENT, ship = null } = {}) {
  const decoded = typeof log === "string" ? decodeInputLog(log) : log;
  if (!decoded) return { ok: false, error: "malformed" };
  const scene = createWeeklyScene(layout, { physics: decoded.physics ?? physics, ship: decoded.ship ?? ship });
  const poses = [];
  let i = 0;
  for (const frame of decoded.frames) {
    const before = scene.step;
    stepWeekly(scene, frame);
    i++;
    if (scene.step !== before && scene.step % GHOST_EVERY === 1) poses.push([scene.player.x, scene.player.y, scene.player.angle]);
    if (scene.finished || scene.dead) break;
  }
  poses.push([scene.player.x, scene.player.y, scene.player.angle]);
  const finishMs = scene.finished ? scene.finishMs : null;
  return {
    ok: true,
    physics: scene.physics,
    ...(scene.ship ? { ship: scene.ship } : {}),
    finished: scene.finished,
    finishMs,
    dead: scene.dead,
    steps: scene.step,
    framesUsed: i,
    poses,
    matches: scene.finished && Math.abs(Math.round(finishMs) - decoded.finishMs) <= 1,
  };
}

/** A ghost's pose at race time `ms`, interpolated between recorded poses. */
export function ghostPose(poses, ms) {
  if (!poses?.length) return null;
  const f = (ms / 1000) * (120 / GHOST_EVERY);
  const i = Math.max(0, Math.min(poses.length - 1, Math.floor(f)));
  const j = Math.min(poses.length - 1, i + 1);
  const t = Math.max(0, Math.min(1, f - i));
  const a = poses[i], b = poses[j];
  let da = b[2] - a[2];
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, angle: a[2] + da * t, done: f >= poses.length - 1 };
}
