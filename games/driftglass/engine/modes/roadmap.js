// src/roadmap/engine/modes/roadmap.js
import { state, config, MAX_LEVEL, SHARDS_PER_LEVEL } from '../../state.js';
import { generateLevelNodes, formatMs } from '../../data.js';
import { resizeCanvas } from '../../ui/graphics.js';
import { updateHUD, toast, blinkFuel } from '../../ui/hud.js';
import { openEndOverlay } from '../../ui/overlays.js';
import { stopEngine } from '../core.js';
import { handlePlayerMovement } from '../systems/movement.js';
import { updateParticles } from '../systems/particles.js';
import { checkCollisionsAndInteractions } from '../collisions/roadmap.js';
import { startCountdown } from '../modeManager.js';
import { findNearestShard } from '../rules.js';
// Ensure all exports are present for external usage

// ENSURED EXPORT
export function updateRoadmap(dt) {
  const lv = state.run?.current;
  if (!lv) return;

  if (lv) {
    lv.boost = Math.min(
      config.BOOST_MAX_PIPS,
      (lv.boost ?? config.BOOST_MAX_PIPS) + (config.BOOST_REGEN_PER_SEC ?? 0.22) * dt
    );
  }

  if (lv.launched && !lv.timerRunning) startTimer();

  if (state.ui.countdownActive) {
    lv.countdownT -= dt;
    lv.player.x = lv.startPos.x;
    lv.player.y = lv.startPos.y;
    lv.player.vx = 0; lv.player.vy = 0;
    if (lv.countdownT <= 0) state.ui.countdownActive = false;
  } else {
    if (lv.lockedInStart) {
      lv.stuckTimer += dt;
      if (lv.stuckTimer > config.STUCK_HINT_SECONDS) lv.showLaunchHint = true;
    }
    const movementEnv = {
      onFuelUse: (amount) => {
        lv.fuel = Math.max(0, lv.fuel - amount);
        if (lv.fuel === 0) outOfFuel();
      },
      onLaunch: () => { lv.showLaunchHint = false; lv.stuckTimer = 0; },
      onLeavePad: () => { startTimer(); }
    };
    handlePlayerMovement(dt, lv, lv.player, movementEnv);
    if (!lv.lockedInStart) {
      checkCollisionsAndInteractions();
      findNearestShard();
    }
    updateParticles(dt);
  }

  // Do NOT assign camera here. Camera is updated centrally.
  updateHUD();
}

// ENSURED EXPORT
export function buildLevel(level, existingNodes = null) {
  // Initialize camera zoom to base from config for roadmap
  state.gfx.camera.zoom = config.CAMERA_BASE_ZOOM ?? state.gfx.camera.zoom;
  resizeCanvas();
  setupResponsiveScaling();

  const seedStr = state.run.seeds[level - 1];
  const nodes = existingNodes ? structuredClone(existingNodes) : generateLevelNodes(level, state.data, seedStr);
  const startNode = nodes.find(n => n.kind === 'start') || { x: 1, y: Math.floor(config.GRID_H / 2) };

  const maxFuel = config.MAX_TANK;
  const startFuel = Math.min(maxFuel, config.BASE_START_FUEL + (level - 1) * config.FUEL_PER_LEVEL);

  state.run.current = {
    level, nodes,
    player: { x: startNode.x + 0.5, y: startNode.y + 0.5, vx: 0, vy: 0, angle: 0, hp: config.MAX_HP, maxHp: config.MAX_HP },
    startPos: { x: startNode.x + 0.5, y: startNode.y + 0.5 },
    fuel: startFuel, maxFuel, boost: config.BOOST_MAX_PIPS, shards: new Set(), activeMs: 0, timerRunning: false,
    t0: 0, lockedInStart: true, launched: false, countdownT: 0, completed: false,
    stuckTimer: 0, showLaunchHint: false, nearestShardTarget: null
  };
  updateHUD();
}

// ENSURED EXPORT (if needed externally)
export function outOfFuel() {
  if (!state.run.current.timerRunning) return;
  addPenalty(config.FUEL_OUT_PENALTY_MS);
  const level = state.run.current.level;
  buildLevel(level);
  startCountdown(config.COUNTDOWN_DURATION, state.run.current);
  toast(`Fuel depleted! +30s penalty.`);
}

// ENSURED EXPORT (if needed externally)
export function tryFinishLevel() {
  const lv = state.run.current;
  if (lv.completed) return;

  const totalPlanets = lv.nodes.filter(n => n.kind === 'planet').length;
  const required = Math.min(SHARDS_PER_LEVEL, totalPlanets);

  if (lv.shards.size >= required && lv.fuel >= config.GATE_MIN_FUEL) {
    pauseTimer();
    lv.completed = true;
    if (lv.level >= MAX_LEVEL) {
      finishRun();
    } else {
      toast(`Level ${lv.level} complete!`);
      state.run.levelIndex++;
      buildLevel(state.run.levelIndex);
      startCountdown(config.COUNTDOWN_DURATION, state.run.current);
    }
  } else {
    const needed = Math.max(0, required - lv.shards.size);
    toast(needed > 0
      ? `Gate requires ${needed} more shard(s).`
      : `Gate requires at least ${config.GATE_MIN_FUEL} fuel.`);
  }
}

// ENSURED EXPORT (if needed externally)
export async function finishRun() {
  const ms = Math.round(state.run.totalActiveMs);
  const formattedTime = formatMs(ms);
  toast(`All levels complete! Total time: ${formattedTime}.`);

  // Exit fullscreen if active
  if (document.fullscreenElement) {
    try { document.exitFullscreen().catch(() => { }); } catch { }
  }
  // Stop the engine loop so the game no longer updates after completion
  stopEngine();
  openEndOverlay(formattedTime);
  window.dispatchEvent(new CustomEvent('roadmap:runComplete', { detail: { runId: state.run.runId, totalMs: ms } }));
}

// ENSURED EXPORT
export function startTimer() {
  const lv = state.run?.current;
  if (!lv || lv.timerRunning) return;
  lv.timerRunning = true;
  lv.t0 = performance.now();
}

// ENSURED EXPORT
export function pauseTimer() {
  const lv = state.run?.current;
  if (!lv || !lv.timerRunning) return;
  const elapsed = performance.now() - lv.t0;
  lv.activeMs += elapsed;
  state.run.totalActiveMs += elapsed;
  lv.timerRunning = false;
}

// ENSURED EXPORT (if needed externally)
export function addPenalty(ms) {
  const lv = state.run?.current;
  if (!lv) return;
  lv.activeMs += ms;
  state.run.totalActiveMs += ms;
}

let responsiveScalingSetup = false;
function setupResponsiveScaling() {
  if (responsiveScalingSetup) return;
  const applyResize = () => resizeCanvas();
  window.addEventListener('resize', applyResize, { passive: true });
  if (window.matchMedia) {
    try {
      const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      query.addEventListener('change', applyResize);
    } catch (err) {
      console.log('Could not attach DPI media query listener:', err);
    }
  }
  responsiveScalingSetup = true;
}

