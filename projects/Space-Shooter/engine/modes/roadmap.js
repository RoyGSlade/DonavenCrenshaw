import { rechargeBoost } from '../systems/flight.js';
import { state, config, MAX_LEVEL } from "../../state.js";
import { createLevelLayout, formatMs } from "../../data.js";
import { createCustomLayout, CUSTOM_LEVEL } from "../levels.js";
import { activeCustomTrack, customMusic } from "../../systems/customTrack.js";
import { resizeCanvas } from "../../ui/graphics.js";
import { updateHUD, toast } from "../../ui/hud.js";
import { openEndOverlay } from "../../ui/overlays.js";
import { runtimeConfig } from "../../runtime-config.js";
import { stopEngine } from "../core.js";
import { railRules } from "../systems/movement.js";
import { handleShipMovement } from "../shipMovement.js";
import { PLAYER_HULL } from "../hull.js";
import { labHooks } from "../../systems/lab.js";
import { updateParticles } from "../systems/particles.js";
import { checkCollisionsAndInteractions } from "../collisions/roadmap.js";
import { startCountdown } from "../lifecycle.js";
import {
  findNearestShard,
  hasRequiredShards,
  secretEligible,
} from "../rules.js";
import {
  handleShooting,
  handleOverheat,
  updateProjectiles,
} from "../systems/projectiles.js";
import {
  updateHazards,
  applyGravity,
  resolveHazards,
  updateDrones,
  resolveRoadmapProjectiles,
} from "../systems/environment.js";
import { playGateMotif, playMusic } from "../../audio.js";
import {
  createTrackProgress,
  updateTrackProgress,
  constrainToTrack,
  isLapReady,
  crossedFinishLine,
} from "../track.js";
import { clearCameraPan } from "../systems/camera.js";

export function updateRoadmap(dt) {
  const lv = state.run?.current;
  if (!lv || lv.completed) return;
  if (state.ui.paused || state.ui.showStartOverlay || state.ui.showEndOverlay) {
    pauseTimer();
    return;
  }
  if (lv.launched && !lv.timerRunning) startTimer();
  if (state.ui.countdownActive) {
    lv.countdownT -= dt;
    lv.player.x = lv.startPos.x;
    lv.player.y = lv.startPos.y;
    lv.player.vx = 0;
    lv.player.vy = 0;
    if (lv.countdownT <= 0) state.ui.countdownActive = false;
    updateHUD();
    return;
  }
  if (lv.lockedInStart) {
    lv.stuckTimer += dt;
    lv.showLaunchHint = lv.stuckTimer > config.STUCK_HINT_SECONDS;
  }
  // Bound physics/collision steps so a boost cannot tunnel through a shard or rock.
  let remaining = Math.min(0.1, Math.max(0, dt));
  while (remaining > 1e-8) {
    const step = Math.min(1 / 120, remaining);
    remaining -= step;
    rechargeBoost(lv, step, config);
    lv.player.invulnTimer = Math.max(0, (lv.player.invulnTimer || 0) - step);
    updateHazards(lv, step);
    if (!lv.lockedInStart) applyGravity(lv.player, lv.gravityWells, step);
    const previousPosition = { x: lv.player.x, y: lv.player.y };
    // The ship's real body (engine/hull.js) meets the rails, rocks and shots.
    handleShipMovement(step, lv, lv.player, {
      onFuelUse: (amount) => {
        // FUEL_BURN_SCALE is 1 outside the playtest lab.
        lv.fuel = Math.max(0, lv.fuel - amount * (config.FUEL_BURN_SCALE ?? 1));
        labHooks.fuel(lv.fuel);
      },
      onBoost: (scale) => {
        if (config.BOOST_FUEL_COST) lv.fuel = Math.max(0, lv.fuel - config.BOOST_FUEL_COST);
        labHooks.boost(scale);
      },
      onLaunch: () => {
        lv.showLaunchHint = false;
        lv.stuckTimer = 0;
        startTimer();
      },
      onLeavePad: startTimer,
    });
    if (!lv.lockedInStart) {
      if (resolveHazards(lv, lv.player)) state.ui.screenshake = 0.15;
      constrainToTrack(
        lv.track,
        lv.player,
        previousPosition,
        PLAYER_HULL,
        railRules(lv.player),
      );
      updateTrackProgress(lv, previousPosition);
      // No portal: a full lap ends by crossing the start/finish line forward.
      if (isLapReady(lv) && crossedFinishLine(lv.track, previousPosition, lv.player) !== null) {
        tryFinishLevel();
        if (state.run?.current !== lv || lv.completed) return;
      }
      updateDrones(lv, lv.player, state.gfx.projectiles, step);
      handleShooting(step, lv.player);
      handleOverheat(step, lv.player);
      updateProjectiles(step);
      resolveRoadmapProjectiles(lv, state.gfx.projectiles);
      if (lv.player.hp <= 0) {
        labHooks.hullLoss();
        restartLevel("Hull lost. +15s penalty.", 15000);
        return;
      }
      if (lv.fuel <= 0) {
        outOfFuel();
        return;
      }
      lv.secretReady = runtimeConfig.bossFight !== false && secretEligible(lv);
      if (lv.secretReady !== !!lv._secretMusicActive) {
        lv._secretMusicActive = lv.secretReady;
        playMusic(lv.secretReady ? "secret" : `level${lv.level}`);
      }
      if (lv.secretReady && !lv._secretCuePlayed) {
        lv._secretCuePlayed = true;
        playGateMotif(true);
        toast("The gate answers in reverse. Its far side glows.", 4500);
      }
      checkCollisionsAndInteractions();
      if (state.run?.current !== lv || state.mode !== "roadmap" || lv.completed)
        return;
      findNearestShard();
    }
    updateParticles(step);
  }
  updateHUD();
}

export function buildLevel(level, _existingNodes = null) {
  clearCameraPan();
  state.gfx.camera.zoom = config.CAMERA_BASE_ZOOM;
  state.gfx.camera._baseZoom = config.CAMERA_BASE_ZOOM;
  resizeCanvas();
  setupResponsiveScaling();
  // The custom track is its own one-circuit run; level is CUSTOM_LEVEL there.
  const custom = level === CUSTOM_LEVEL;
  const layout = custom ? createCustomLayout(activeCustomTrack()) : createLevelLayout(level);
  const start = layout.nodes.find((n) => n.kind === "start");
  const startPos = { x: start.x + 0.5, y: start.y + 0.5 };
  state.gfx.camera.x = startPos.x;
  state.gfx.camera.y = startPos.y;
  const { nodes, hazards, gravityWells, drones, track, ...levelInfo } = layout;
  state.gfx.projectiles = [];
  state.gfx.particles = [];
  state.run.current = {
    level,
    nodes,
    hazards,
    gravityWells,
    drones,
    levelInfo,
    track,
    trackProgress: createTrackProgress(),
    elapsed: 0,
    flux: 30,
    secretReady: false,
    player: {
      ...startPos,
      vx: 0,
      vy: 0,
      angle: track.portal.angle,
      hp: config.MAX_HP,
      maxHp: config.MAX_HP,
      invulnTimer: 0,
      heat: 0,
      maxHeat: config.PLAYER_MAX_HEAT,
      isOverheated: false,
      shootCooldown: 0,
    },
    startPos,
    fuel: config.MAX_TANK,
    maxFuel: config.MAX_TANK,
    boost: config.BOOST_MAX_PIPS,
    shards: new Set(),
    activeMs: 0,
    timerRunning: false,
    t0: 0,
    lockedInStart: true,
    launched: false,
    countdownT: 0,
    completed: false,
    stuckTimer: 0,
    showLaunchHint: false,
    nearestShardTarget: null,
  };
  findNearestShard();
  playMusic(custom ? customMusic(activeCustomTrack()) : `level${level}`);
  playGateMotif(false);
  updateHUD();
}
function restartLevel(message, penalty) {
  const previous = state.run.current;
  pauseTimer();
  const elapsed = previous.activeMs + penalty;
  state.run.totalActiveMs += penalty;
  buildLevel(previous.level);
  // A failed attempt is still time spent in this level: no secret timer reset exploit.
  state.run.current.activeMs = elapsed;
  startCountdown(config.COUNTDOWN_DURATION, state.run.current);
  toast(message);
}
export function outOfFuel() {
  if (state.run?.current?.launched) {
    labHooks.fuelOut();
    restartLevel("Fuel depleted. +30s penalty.", config.FUEL_OUT_PENALTY_MS);
  }
}
export function tryFinishLevel() {
  const lv = state.run?.current;
  if (!lv || lv.completed) return;
  if (
    isLapReady(lv) &&
    hasRequiredShards(lv) &&
    lv.fuel >= config.GATE_MIN_FUEL
  ) {
    pauseTimer();
    lv.completed = true;
    // A custom-track lap is the whole run: no network circuit events, splits or boards.
    if (lv.level === CUSTOM_LEVEL) {
      finishCustomRun();
      return;
    }
    window.dispatchEvent(
      new CustomEvent("stardust:levelComplete", {
        detail: { level: lv.level, elapsedMs: lv.activeMs },
      }),
    );
    if (lv.level >= MAX_LEVEL) finishRun();
    else {
      toast(`${lv.levelInfo.title} complete.`);
      state.run.levelIndex = lv.level + 1;
      buildLevel(lv.level + 1);
      startCountdown(config.COUNTDOWN_DURATION, state.run.current);
      window.dispatchEvent(new CustomEvent("stardust:levelStart", { detail: { level: lv.level + 1 } }));
    }
  } else if ((lv._gateMessageAt || 0) < performance.now()) {
    lv._gateMessageAt = performance.now() + 1800;
    const needed = lv.nodes.filter(
      (n) => n.kind === "planet" && !lv.shards.has(n.id),
    ).length;
    toast(
      !isLapReady(lv)
        ? "Complete the whole lap before crossing the finish line."
        : needed
          ? `Gate needs ${needed} more corner signal${needed === 1 ? "" : "s"}.`
          : "Refuel before using the gate.",
    );
  }
}
export async function finishRun() {
  const ms = Math.round(state.run.totalActiveMs),
    formatted = formatMs(ms);
  toast(`All five sectors complete. ${formatted}.`);
  if (document.fullscreenElement) {
    try {
      document.exitFullscreen().catch(() => {});
    } catch {}
  }
  stopEngine();
  openEndOverlay(formatted);
  window.dispatchEvent(
    new CustomEvent("roadmap:runComplete", {
      detail: { runId: state.run.runId, totalMs: ms },
    }),
  );
}
/** The end of a custom-track run: one lap, its own event for its own board. */
export function finishCustomRun() {
  const ms = Math.round(state.run.totalActiveMs),
    formatted = formatMs(ms);
  const title = state.run.current?.levelInfo?.title || "Custom track";
  const preview = !!state.run.preview;
  toast(`${title} complete. ${formatted}.`);
  if (document.fullscreenElement) {
    try {
      document.exitFullscreen().catch(() => {});
    } catch {}
  }
  stopEngine();
  openEndOverlay(formatted, { kind: "custom", title, preview });
  window.dispatchEvent(
    new CustomEvent("stardust:customRunComplete", {
      detail: { runId: state.run.runId, totalMs: ms, title, preview },
    }),
  );
}
export function startTimer() {
  const lv = state.run?.current;
  if (!lv || lv.timerRunning || !lv.launched) return;
  lv.timerRunning = true;
  lv.t0 = performance.now();
}
export function pauseTimer() {
  const lv = state.run?.current;
  if (!lv || !lv.timerRunning) return;
  const elapsed = Math.max(0, performance.now() - lv.t0);
  lv.activeMs += elapsed;
  state.run.totalActiveMs += elapsed;
  lv.timerRunning = false;
}
export function addPenalty(ms) {
  const lv = state.run?.current;
  if (lv) {
    lv.activeMs += ms;
    state.run.totalActiveMs += ms;
  }
}
let responsiveScalingSetup = false;
function setupResponsiveScaling() {
  if (responsiveScalingSetup) return;
  window.addEventListener("resize", resizeCanvas, { passive: true });
  responsiveScalingSetup = true;
}
