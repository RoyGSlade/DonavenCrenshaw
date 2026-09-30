// The weekly time trial in the live game: the fixed-step simulation from
// engine/weekly/sim.js at 120 steps a second, the input recording, deaths
// that send the ship straight back to the grid, the finish, and ghosts.
//
// Events for systems/runSaving.js:
//   stardust:weeklyAttempt      { eventId, version, preview, build, appearance }  a fresh attempt (grid + countdown)
//   stardust:weeklyRunComplete  { eventId, version, totalMs, inputLog, preview, personalBest, previousMs, title, build, appearance }
// build is the garage build the attempt flies (null for the standard ship) and
// appearance the ship equipped when it started, cleaned (null when none).
// Both are taken once, at the start of the attempt.
import { state, config } from "../../state.js";
import { createWeeklyLayout, WEEKLY_RULES } from "../weekly/layout.js";
import { createWeeklyScene, stepWeekly, frameFromKeys, sceneMs, BIT, WEEKLY_PHYSICS } from "../weekly/sim.js";
import { buildForRun, equippedBuild } from "../../systems/shipBuild.js";
import { setFlightBuild, clearFlightBuild } from "../../systems/shipAppearance.js";
import { parseBuild } from "../shipStats.js";
// A test build that is not the equipped ship is drawn as itself for the run.
globalThis.addEventListener?.("stardust:runQuit", () => clearFlightBuild());
import { encodeInputLog, replayInputLog, ghostPose } from "../weekly/replay.js";
import { nearestTrackPoint } from "../track.js";
import { formatMs } from "../../data.js";
import { resizeCanvas } from "../../ui/graphics.js";
import { updateHUD, toast } from "../../ui/hud.js";
import { openEndOverlay } from "../../ui/overlays.js";
import { stopEngine } from "../core.js";
import { startCountdown } from "../lifecycle.js";
import { clearCameraPan, resetWeeklyCamera } from "../systems/camera.js";
import { spawnExhaust, updateParticles } from "../systems/particles.js";
import { playMusic, playSoundEffectThrottled } from "../../audio.js";
import { showFailScreen } from "../../ui/failScreen.js";
import { quitRun } from "../modeManager.js";

const STEP = WEEKLY_RULES.STEP;
const RETRY_COUNTDOWN = 1.5;
const WRECK_SECONDS = 0.75;
// Wider than the network circuits: at weekly speeds you need to see mines coming.
const WEEKLY_ZOOM = 1.15;

// This launch: the event, its layout, the frames of the current attempt, ghosts.
let session = null;
// Ghosts by id ("best" = this browser's best, "top" = the leaderboard's #1).
const ghosts = new Map();
let ghostsVisible = true;

// This browser's best per event lives in engine/weekly/localBest.js.
import { readLocalBest, saveLocalBest, makeLocalBest } from "../weekly/localBest.js";
import { snapshotAppearance } from "../../systems/runClient.js";
export { readLocalBest };

/** Add or replace a ghost from an input log; it is replayed once here. */
export function setWeeklyGhost(id, { log, label, color = "#9fe8ff", layout = session?.layout, appearance = null, build = null } = {}) {
  if (!layout || !log) { ghosts.delete(id); return false; }
  const replay = replayInputLog(layout, log);
  if (!replay.ok || !replay.finished) { ghosts.delete(id); return false; }
  // appearance / build: the ship the ghost was flown in (gfx/ghostShip.js draws it;
  // the drawn sprite is cached on this entry). Without them it is the standard ship.
  ghosts.set(id, { poses: replay.poses, label, color, ms: replay.finishMs, appearance, build, sprite: null });
  return true;
}
export function weeklyGhosts() {
  return ghostsVisible ? [...ghosts.values()] : [];
}
export function toggleWeeklyGhosts() {
  ghostsVisible = !ghostsVisible;
  toast(ghostsVisible ? "Ghosts on." : "Ghosts off.", 1400);
}
export function currentWeeklySession() {
  return session;
}

/** A new weekly launch from the hangar (or Fly again). */
// ship: 'equipped' (or a build key) flies a preview attempt as that garage build,
// the same as ?preview=weekly&ship= in the address bar; it only applies to
// previews, so a ranked attempt can never fly it.
export function startWeekly(event, { preview = false, ship = null } = {}) {
  if (session?.event !== event) {
    ghosts.clear();
    session = { event, layout: createWeeklyLayout(event), preview, attempts: 0, frames: [] };
    const best = readLocalBest(event);
    if (best) setWeeklyGhost("best", { log: best.log, label: `Your best ${formatMs(best.ms)}`, color: "#9fe8ff", appearance: best.appearance, build: best.build });
  }
  session.preview = preview;
  session.ship = preview ? ship : null;
  session.attempts = 0;
  buildAttempt();
  playMusic(event.music || "level3");
}

function buildAttempt() {
  clearCameraPan();
  resetWeeklyCamera();
  state.gfx.camera.zoom = WEEKLY_ZOOM;
  state.gfx.camera._baseZoom = WEEKLY_ZOOM;
  resizeCanvas();
  // A garage build flies its own hitbox and stats where the event allows it
  // (or on a preview flight asked for with ?ship=); otherwise the standard ship.
  const ship = buildForRun(session.event, { preview: session.preview, ship: session.ship });
  if (ship && ship !== equippedBuild()) {
    const b = parseBuild(ship);
    setFlightBuild(b.family, { body: b.body, wings: b.wings, cockpit: b.cockpit, engines: b.engines }).catch(() => clearFlightBuild());
  } else clearFlightBuild();
  const scene = createWeeklyScene(session.layout, ship ? { physics: WEEKLY_PHYSICS.BUILD, ship } : {});
  if (ship && session.attempts === 0) {
    const pct = (v) => `${v >= 1 ? "+" : ""}${Math.round((v - 1) * 100)}%`;
    toast(`Test build ${ship}: top speed ${pct(scene.stats.topSpeed)}, thrust ${pct(scene.stats.accel)}, grip ${pct(scene.stats.grip)}`, 5000);
  }
  Object.assign(scene, {
    activeMs: 0, timerRunning: false, t0: 0, countdownT: 0, completed: false,
    stuckTimer: 0, showLaunchHint: false, nearestShardTarget: null, acc: 0, wreck: null,
  });
  state.gfx.projectiles = [];
  state.gfx.particles = [];
  state.gfx.camera.x = scene.player.x;
  state.gfx.camera.y = scene.player.y;
  state.run.current = scene;
  state.run.totalActiveMs = 0;
  session.frames = [];
  session.attempts += 1;
  // What this attempt is flown in, fixed now: a ship changed mid-attempt changes nothing.
  session.build = ship || null;
  session.appearance = snapshotAppearance();
  updateTarget(scene);
  window.dispatchEvent(new CustomEvent("stardust:weeklyAttempt", { detail: { eventId: session.event.id, version: session.event.version, preview: session.preview, build: session.build, appearance: session.appearance } }));
  updateHUD();
}

function restartAttempt() {
  buildAttempt();
  startCountdown(RETRY_COUNTDOWN, state.run.current);
}


function react(lv, e) {
  switch (e.type) {
    case "wall":
      state.ui.screenshake = 0.12;
      toast("Rail hit: speed halved, controls stunned.", 1100);
      break;
    case "shard":
      toast(e.count === e.total ? `All ${e.total} shards. Cross the finish line!` : `Shard ${e.count} of ${e.total}.`, 1500);
      break;
    case "station":
      toast("Fuel dock: tank full, hull repaired.", 1400);
      break;
    case "shot":
      state.ui.screenshake = 0.2;
      toast("Sentry hit. Keep your speed up in the corners.", 1500);
      break;
    case "rock":
      state.ui.screenshake = 0.15;
      break;
    case "sentry-fire":
      playSoundEffectThrottled("laser", 0.12, 90);
      break;
    case "missing-shards":
      if ((lv._shardNagAt || 0) < performance.now()) {
        lv._shardNagAt = performance.now() + 2000;
        toast(`The line won't count yet: ${e.missing} shard${e.missing === 1 ? "" : "s"} still out there.`, 2000);
      }
      break;
    default:
  }
}

// The arrow points at the next uncollected shard ahead, or the finish line.
function updateTarget(lv) {
  const here = nearestTrackPoint(lv.track, lv.player.x, lv.player.y)?.along ?? 0;
  const left = lv.shardList.filter((s) => !lv.shards.has(s.id));
  const next = left.find((s) => s.along >= here - 2) || left[0];
  lv.nearestShardTarget = next
    ? { kind: "planet", x: next.x - 0.5, y: next.y - 0.5, title: "Next shard" }
    : { kind: "gate", x: lv.track.portal.x - 0.5, y: lv.track.portal.y - 0.5, title: "Finish line" };
}

export function updateWeekly(dt) {
  const lv = state.run?.current;
  if (!lv || lv.completed || !session) return;
  if (state.ui.paused || state.ui.showStartOverlay || state.ui.showEndOverlay || state.ui.showFailOverlay) return;
  if (lv.wreck) {
    lv.wreck.t += dt;
    updateParticles(dt);
    // After the explosion: the attempt-over screen (retry, hangar, nearby pilots).
    if (lv.wreck.t >= WRECK_SECONDS && !lv.wreck.shown) {
      lv.wreck.shown = true;
      showFailScreen(
        { cause: lv.wreck.cause, ms: sceneMs(lv), shards: lv.shards.size, total: lv.shardList.length, eventTitle: `Week ${session.event.week} · ${session.event.title}` },
        { onRetry: () => restartAttempt(), onHangar: () => quitRun() },
      );
    }
    return;
  }
  if (state.ui.countdownActive) {
    lv.countdownT -= dt;
    if (lv.countdownT <= 0) state.ui.countdownActive = false;
    updateHUD();
    return;
  }
  lv.acc = Math.min(lv.acc + Math.min(Math.max(0, dt), 0.1), 0.25);
  while (lv.acc >= STEP - 1e-9) {
    lv.acc -= STEP;
    rememberPoses(lv);
    const frame = frameFromKeys(state.keys);
    const wasLocked = lv.lockedInStart;
    const events = stepWeekly(lv, frame);
    if (!lv.lockedInStart) {
      if (wasLocked) {
        // The recording starts on the launch step, and always says so.
        frame.bits |= BIT.LAUNCH;
        state.keys.launch = false;
        lv.showLaunchHint = false;
      }
      session.frames.push(frame);
      if (frame.thrust > 0 && !(lv.player.stunTimer > 0)) spawnExhaust(lv.player, { intensity: Math.max(0.5, frame.thrust / 100) });
    }
    for (const e of events) react(lv, e);
    if (lv.finished) { finish(lv); return; }
    if (lv.dead) {
      lv.wreck = { x: lv.player.x, y: lv.player.y, t: 0, cause: lv.dead };
      state.ui.screenshake = 0.45;
      return;
    }
  }
  if (lv.lockedInStart) {
    lv.stuckTimer += dt;
    lv.showLaunchHint = lv.stuckTimer > config.STUCK_HINT_SECONDS;
  }
  lv.activeMs = sceneMs(lv);
  state.run.totalActiveMs = lv.activeMs;
  updateView(lv);
  updateTarget(lv);
  updateParticles(dt);
  updateHUD();
}

// Render interpolation. The simulation steps at exactly 120 Hz, but screens
// refresh at 60, 144, 165 Hz…, so a frame can hold two steps, one or none. The
// renderer and camera draw everything between the last two steps instead of
// at the last one, which keeps motion smooth on any display. Visual only: the
// simulation, recordings and times never see these numbers.
function rememberPoses(lv) {
  const p = lv.player;
  lv._prev = { x: p.x, y: p.y, angle: p.angle };
  for (const h of lv.hazards) { h._px = h.x; h._py = h.y; }
}

const lerp = (a, b, t) => a + (b - a) * t;
function updateView(lv) {
  const alpha = Math.max(0, Math.min(1, lv.acc / STEP));
  lv.alpha = alpha;
  const p = lv.player, prev = lv._prev || p;
  let da = p.angle - prev.angle;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  lv.viewPlayer = { ...p, x: lerp(prev.x, p.x, alpha), y: lerp(prev.y, p.y, alpha), angle: prev.angle + da * alpha };
  lv.viewHazards = lv.hazards.map((h) => (h.hp > 0 && h._px != null ? { ...h, x: lerp(h._px, h.x, alpha), y: lerp(h._py, h.y, alpha) } : h));
}

function finish(lv) {
  lv.completed = true;
  const { event, layout, preview } = session;
  const ms = Math.round(lv.finishMs);
  lv.activeMs = ms;
  state.run.totalActiveMs = ms;
  const inputLog = encodeInputLog({ eventId: event.id, version: event.version, frames: session.frames, finishMs: lv.finishMs, physics: lv.physics, ship: lv.ship });
  const previous = readLocalBest(event);
  // A practice flight in a garage build (preview + build) is not a time on the
  // standard ship, so it never replaces this browser's best or its ghost.
  const practice = preview && !!lv.ship;
  const personalBest = !practice && (!previous || ms < previous.ms);
  const { build, appearance } = session;
  if (personalBest) {
    saveLocalBest(event, makeLocalBest({ ms, log: inputLog, appearance, build }));
    setWeeklyGhost("best", { log: inputLog, label: `Your best ${formatMs(ms)}`, color: "#9fe8ff", layout, appearance, build });
  }
  const title = `Week ${event.week} · ${event.title}`;
  toast(`${title}: ${formatMs(ms)}${personalBest && previous ? " — new personal best!" : ""}`, 3500);
  if (document.fullscreenElement) { try { document.exitFullscreen().catch(() => {}); } catch { /* ignore */ } }
  stopEngine();
  openEndOverlay(formatMs(ms), { kind: "weekly", title, preview, previousMs: previous?.ms ?? null });
  window.dispatchEvent(new CustomEvent("stardust:weeklyRunComplete", {
    detail: { eventId: event.id, version: event.version, totalMs: ms, inputLog, preview, personalBest, previousMs: previous?.ms ?? null, title, wallHits: lv.wallHits, build, appearance },
  }));
}

/** A ghost's pose for the renderer at the current race time, or none. */
export function ghostPosesNow() {
  const lv = state.run?.current;
  if (!lv?.weekly || !ghostsVisible) return [];
  // Interpolated like the ship, so ghost and ship move in step.
  const ms = sceneMs(lv) + (lv.launched && !lv.finished ? (lv.alpha || 0) * STEP * 1000 : 0);
  const out = [];
  for (const g of ghosts.values()) {
    const pose = ghostPose(g.poses, ms);
    if (pose && !(pose.done && lv.launched && ms > g.ms + 1500)) out.push({ ...pose, label: g.label, color: g.color, ghost: g });
  }
  return out;
}
