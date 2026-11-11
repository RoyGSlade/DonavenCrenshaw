// Quest race mode in the live game: a race for the new game (a quest's race
// leg, or the hangar's practice circuit) on a weekly layout, flown with the
// upgraded ship (engine/weekly/questRaceScene.js).
//
// It sits BESIDE engine/modes/weekly.js and changes none of it: the weekly
// mode, its finish, its bests, ghosts and run-saving events are untouched
// (tests/stardust-mall-theme.test.mjs keeps those files byte-identical). This
// file steps the same fixed-step simulation (engine/weekly/sim.js) the same
// way, with no input recording, no ghosts and no events for run saving. At the
// finish it asks systems/questRace.js about each write today's weekly finish
// makes (best, ghost, weekly events); in quest race mode the answer is no, and
// the time goes out as stardust:questRaceFinish for ui/questRaceUi.js.
//
// Events: stardust:questRaceAttempt { token, attempt }, stardust:questRaceFinish
// { token, ms, finished, wallHits, attempt }, stardust:questRaceWreck { token,
// cause, ms, shards, total }.
import { state, config } from "../../state.js";
import { createWeeklyLayout, WEEKLY_RULES } from "../weekly/layout.js";
import { stepWeekly, frameFromKeys, sceneMs, BIT } from "../weekly/sim.js";
import { createQuestRaceScene } from "../weekly/questRaceScene.js";
import { setFlightBuild, clearFlightBuild } from "../../systems/shipAppearance.js";
import { equippedBuild } from "../../systems/shipBuild.js";
import { parseBuild } from "../shipStats.js";
import { allowPersistentWrite } from "../../systems/questRace.js";
import { nearestTrackPoint } from "../track.js";
import { resizeCanvas } from "../../ui/graphics.js";
import { updateHUD, toast } from "../../ui/hud.js";
import { stopEngine } from "../core.js";
import { startCountdown } from "../lifecycle.js";
import { clearCameraPan, resetWeeklyCamera } from "../systems/camera.js";
import { spawnExhaust, updateParticles } from "../systems/particles.js";
import { playMusic, playSoundEffectThrottled } from "../../audio.js";

const STEP = WEEKLY_RULES.STEP;
const RETRY_COUNTDOWN = 1.5;
const WRECK_SECONDS = 0.75;
const ZOOM = 1.15; // as the weekly mode: at these speeds you need to see mines coming

let session = null; // { event, layout, race, attempts }

/** A quest race launch (or Fly it again). race: the resolved race (systems/questRace.js mode). */
export function startQuestRace(event, race) {
  if (session?.event !== event || session?.race !== race) session = { event, layout: createWeeklyLayout(event), race, attempts: 0 };
  session.attempts = 0;
  buildAttempt();
  playMusic(event.music || "level3");
}

function buildAttempt() {
  clearCameraPan();
  resetWeeklyCamera();
  state.gfx.camera.zoom = ZOOM;
  state.gfx.camera._baseZoom = ZOOM;
  resizeCanvas();
  const ship = session.race.build || null;
  if (ship && ship !== equippedBuild()) {
    const b = parseBuild(ship);
    setFlightBuild(b.family, { body: b.body, wings: b.wings, cockpit: b.cockpit, engines: b.engines }).catch(() => clearFlightBuild());
  } else clearFlightBuild();
  const scene = createQuestRaceScene(session.layout, { stats: session.race.stats, build: ship });
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
  session.attempts += 1;
  updateTarget(scene);
  window.dispatchEvent(new CustomEvent("stardust:questRaceAttempt", { detail: { token: session.race.token, attempt: session.attempts } }));
  updateHUD();
}

/** Back on the grid after a wreck (ui/questRaceUi.js "Try again"). */
export function retryQuestRaceAttempt() {
  if (!session || !state.run?.current?.wreck) return false;
  buildAttempt();
  startCountdown(RETRY_COUNTDOWN, state.run.current);
  return true;
}

function react(lv, e) {
  switch (e.type) {
    case "wall": state.ui.screenshake = 0.12; toast("Rail hit: speed halved, controls stunned.", 1100); break;
    case "shard": toast(e.count === e.total ? `All ${e.total} shards. Cross the finish line!` : `Shard ${e.count} of ${e.total}.`, 1500); break;
    case "station": toast("Fuel dock: tank full, hull repaired.", 1400); break;
    case "shot": state.ui.screenshake = 0.2; toast("Sentry hit. Keep your speed up in the corners.", 1500); break;
    case "rock": state.ui.screenshake = 0.15; break;
    case "sentry-fire": playSoundEffectThrottled("laser", 0.12, 90); break;
    case "missing-shards":
      if ((lv._shardNagAt || 0) < performance.now()) {
        lv._shardNagAt = performance.now() + 2000;
        toast(`The line won't count yet: ${e.missing} shard${e.missing === 1 ? "" : "s"} still out there.`, 2000);
      }
      break;
    default:
  }
}

function updateTarget(lv) {
  const here = nearestTrackPoint(lv.track, lv.player.x, lv.player.y)?.along ?? 0;
  const left = lv.shardList.filter((s) => !lv.shards.has(s.id));
  const next = left.find((s) => s.along >= here - 2) || left[0];
  lv.nearestShardTarget = next
    ? { kind: "planet", x: next.x - 0.5, y: next.y - 0.5, title: "Next shard" }
    : { kind: "gate", x: lv.track.portal.x - 0.5, y: lv.track.portal.y - 0.5, title: "Finish line" };
}

export function updateQuestRace(dt) {
  const lv = state.run?.current;
  if (!lv || lv.completed || !session) return;
  if (state.ui.paused || state.ui.showStartOverlay || state.ui.showEndOverlay || state.ui.showFailOverlay) return;
  if (lv.wreck) {
    lv.wreck.t += dt;
    updateParticles(dt);
    if (lv.wreck.t >= WRECK_SECONDS && !lv.wreck.shown) {
      lv.wreck.shown = true;
      window.dispatchEvent(new CustomEvent("stardust:questRaceWreck", { detail: { token: session.race.token, cause: lv.wreck.cause, ms: Math.round(sceneMs(lv)), shards: lv.shards.size, total: lv.shardList.length } }));
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
      if (wasLocked) { frame.bits |= BIT.LAUNCH; state.keys.launch = false; lv.showLaunchHint = false; }
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

// Render interpolation between fixed steps, as the weekly mode does (visual only).
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
  const ms = Math.round(lv.finishMs);
  lv.activeMs = ms;
  state.run.totalActiveMs = ms;
  // Today's weekly finish keeps a best, a ghost and sends run-saving events.
  // Each is asked about here; quest race mode refuses all three (and notes it).
  const keep = { best: allowPersistentWrite("best"), ghost: allowPersistentWrite("ghost"), weekly: allowPersistentWrite("weekly") };
  if (keep.best || keep.ghost || keep.weekly) console.warn("Stardust: a quest race finished outside quest race mode; nothing was kept anyway.");
  if (document.fullscreenElement) { try { document.exitFullscreen().catch(() => {}); } catch { /* ignore */ } }
  stopEngine();
  window.dispatchEvent(new CustomEvent("stardust:questRaceFinish", { detail: { token: session.race.token, ms, finished: true, wallHits: lv.wallHits, attempt: session.attempts } }));
}
