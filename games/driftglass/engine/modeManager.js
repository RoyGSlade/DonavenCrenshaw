// src/roadmap/engine/modeManager.js
import { state, config, MAX_LEVEL } from '../state.js';
import { stopMusic } from '../audio.js';
import { closePauseOverlay, openStartOverlay, closeEndOverlay } from '../ui/overlays.js';
import { updateHUD, toast } from '../ui/hud.js';
import { resizeCanvas } from '../ui/graphics.js';
import { buildLevel, pauseTimer, updateRoadmap } from './modes/roadmap.js';
import { buildArena, updateArena } from './modes/arena.js';
import { ensureEngineRunning } from './index.js';
// NEW: Explicit mode transition functions
export function enterArena() {
  // Restart engine loop if it was previously stopped by finishRun
  ensureEngineRunning();
  // Ensure end overlay (Go Again) is closed if user slipped in from completed run state
  closeEndOverlay();
  state.mode = 'arena';
  state.ui.showBossUI = true;
  toast('The Secret Altar accepts your challenge... No pausing!', 4000);
  buildArena();
  startCountdown(config.COUNTDOWN_DURATION, state.arena);
}

export function updateCurrentMode(dt) {
  // Disallow pausing in arena
  if (state.mode === 'arena' && state.ui.paused) {
    state.ui.paused = false;
    // optional: toast once on entry already; skip spam here
  }

  if (state.mode === 'roadmap') {
    updateRoadmap(dt);
  } else if (state.mode === 'arena') {
    updateArena(dt);
  }
}

export function startCountdown(seconds, sceneState) {
  if (!sceneState) return;
  sceneState.countdownT = seconds;
  state.ui.countdownActive = true;
  sceneState.lockedInStart = true;
  sceneState.launched = false;
  if ('timerRunning' in sceneState) sceneState.timerRunning = false;
}

export function startNewRun() {
  // Ensure engine loop is active (may have been stopped after a completed run)
  ensureEngineRunning();
  // Clear any lingering end overlay from prior run
  closeEndOverlay();
  state.mode = 'roadmap';
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  state.run = {
    runId,
    totalActiveMs: 0,
    levelIndex: 1,
    seeds: Array.from({ length: MAX_LEVEL }, (_, i) => `${runId}-L${i + 1}`),
    current: null,
  };
  state.ui.paused = false;
  buildLevel(1);
  startCountdown(config.COUNTDOWN_DURATION, state.run.current);
}

export function retryRun() {
  // If no run exists, simply start a new one
  if (!state.run) {
    startNewRun();
    return;
  }

  closePauseOverlay();

  // Preserve existing run id, seeds and total active time
  const { runId, seeds, totalActiveMs } = state.run;
  const priorNodes = state.run.current?.nodes ?? null;

  state.run = { runId, seeds, totalActiveMs, levelIndex: 1, current: null };

  // Rebuild level one reusing prior shard positions if available
  buildLevel(1, priorNodes);
  startCountdown(config.COUNTDOWN_DURATION, state.run.current);
}

export function quitRun() {
  stopMusic();
  state.mode = 'roadmap';
  state.run = null;
  state.ui.paused = false;
  closePauseOverlay();
  openStartOverlay();
  updateHUD();
  toast('Run aborted.');
}

export function exitArena(reason = 'quit') {
  stopMusic();
  state.arena = null;
  state.mode = 'roadmap';
  state.ui.showBossUI = false;

  if (reason === 'win') toast('Unique event complete. Returning to orbit.');
  else if (reason === 'loss') toast('Defeated. Returning to orbit.');
  else toast('Left the arena.');
  
  state.gfx.camera.zoom = config.CAMERA_BASE_ZOOM ?? state.gfx.camera.zoom;
  resizeCanvas();
}

// NEW: Called by arena mode when the boss death animation finishes.
// Fetch latest encrypted shard context from API and show victory overlay.
// Removed: victory is handled within arena.js to avoid circular deps.