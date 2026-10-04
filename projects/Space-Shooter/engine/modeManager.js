// src/roadmap/engine/modeManager.js
import { state, config, MAX_LEVEL } from '../state.js';
import { stopMusic } from '../audio.js';
import { closePauseOverlay, openStartOverlay, closeEndOverlay } from '../ui/overlays.js';
import { updateHUD, toast } from '../ui/hud.js';
import { resizeCanvas } from '../ui/graphics.js';
import { buildLevel, pauseTimer, updateRoadmap } from './modes/roadmap.js';
import { CUSTOM_LEVEL } from './levels.js';
import { buildArena, updateArena } from './modes/arena.js';
import { startWeekly, updateWeekly } from './modes/weekly.js';
import { ensureEngineRunning } from './core.js';
import { startCountdown } from './lifecycle.js';
import { canLaunchWeeklyMode } from '../systems/weeklyAccess.js';
export { startCountdown } from './lifecycle.js';
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
  if (state.mode === 'arena' && state.arena?.victoryPresented) return;
  // Active combat cannot be paused by input.
  if (state.mode === 'arena' && state.ui.paused) {
    state.ui.paused = false;
    // optional: toast once on entry already; skip spam here
  }

  if (state.mode === 'roadmap') {
    if (state.run?.kind === 'weekly') updateWeekly(dt);
    else updateRoadmap(dt);
  } else if (state.mode === 'arena') {
    updateArena(dt);
  }
}

// kind 'network' is the five-circuit run; 'custom' is one lap of the custom
// track, with its own start/complete events so the network run, its splits,
// challenges and boards never see it. 'weekly' is the weekly time trial of
// `event` (engine/modes/weekly.js). preview (custom/weekly) is never saved.
// ship: 'equipped' flies a weekly preview as the equipped garage build (see startWeekly).
export function startNewRun({ kind = 'network', preview = false, event = null, ship = null } = {}) {
  if (!canLaunchWeeklyMode({ kind, event, preview })) {
    toast('This mode is retired or awaiting release. Fly the current weekly track.');
    openStartOverlay();
    return false;
  }
  // Ensure engine loop is active (may have been stopped after a completed run)
  ensureEngineRunning();
  // Clear any lingering end overlay from prior run
  closeEndOverlay();
  state.mode = 'roadmap';
  state.arena = null;
  state.ui.showBossUI = false;
  state.ui.showStartOverlay = false;
  if (kind === 'weekly' && event) {
    state.run = { runId: Date.now().toString(36), kind: 'weekly', event, preview: !!preview, ship: preview ? ship : null, totalActiveMs: 0, levelIndex: 1, seeds: [], current: null };
    state.ui.paused = false;
    startWeekly(event, { preview: !!preview, ship: preview ? ship : null });
    startCountdown(config.COUNTDOWN_DURATION, state.run.current);
    return;
  }
  const custom = kind === 'custom';
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  state.run = {
    runId,
    kind: custom ? 'custom' : 'network',
    preview: custom && !!preview,
    totalActiveMs: 0,
    levelIndex: 1,
    seeds: Array.from({ length: MAX_LEVEL }, (_, i) => `${runId}-L${i + 1}`),
    current: null,
  };
  state.ui.paused = false;
  buildLevel(custom ? CUSTOM_LEVEL : 1);
  startCountdown(config.COUNTDOWN_DURATION, state.run.current);
  if (custom) window.dispatchEvent(new CustomEvent('stardust:customRunStart', { detail: { runId, preview: state.run.preview } }));
  else window.dispatchEvent(new CustomEvent('stardust:runStart', { detail: { runId } }));
}

export function retryRun() {
  // If no run exists, simply start a new one
  if (!state.run) {
    startNewRun();
    return;
  }

  closePauseOverlay();

  // Retry is a fresh run of the same kind with the same deterministic authored routes.
  startNewRun({ kind: state.run.kind, preview: state.run.preview, event: state.run.event, ship: state.run.ship });
}

export function quitRun() {
  state.mode = 'roadmap';
  state.arena = null;
  state.gfx.projectiles = [];
  state.ui.countdownActive = false;
  state.run = null;
  state.ui.paused = false;
  window.dispatchEvent(new CustomEvent('stardust:runQuit'));
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
  state.ui.countdownActive = false;
  state.ui.paused = true;
  state.gfx.projectiles = [];
  const player = state.run?.current?.player;
  if (player) { player.vx = 0; player.vy = 0; }

  if (reason === 'win') toast('Unique event complete. Returning to orbit.');
  else if (reason === 'loss') toast('Defeated. Returning to orbit.');
  else toast('Left the arena.');
  
  state.gfx.camera.zoom = config.CAMERA_BASE_ZOOM ?? state.gfx.camera.zoom;
  resizeCanvas();
}

// NEW: Called by arena mode when the boss death animation finishes.
// Fetch latest encrypted shard context from API and show victory overlay.
// Removed: victory is handled within arena.js to avoid circular deps.
