// src/roadmap/engine/core.js
import { state } from '../state.js';
// CORRECTED: Import resizeCanvas from the UI directory
import { render, resizeCanvas, drawCrashOverlay } from '../ui/graphics.js';
import { pumpInput } from '../input.js';
import { updateCurrentMode } from './modeManager.js';
import { ensureCamera, updateCamera } from './systems/camera.js';

let lastFrameTs = 0;
let rafId = 0;

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;
  try {
    update(dt);
    render();
  } catch (e) {
    console.error('Fatal in loop:', e);
    drawCrashOverlay(state.gfx.ctx, e);
  }
  rafId = requestAnimationFrame(loop);
}

function update(dt) {
  pumpInput();
  // expose dt to rendering systems that rely on elapsed time
  if (!state.gfx) state.gfx = {};
  state.gfx.lastDt = dt;
  updateCurrentMode(dt);
  // Update camera after movement updates; prefer arena player else roadmap
  const p = state.arena?.player || state.run?.current?.player || null;
  updateCamera(dt, p);
}

export function initEngine(canvas) {
  state.gfx.canvas = canvas;
  // CORRECTED: resizeCanvas is called ONCE here to ensure the context
  // and dimensions are set before the first render call.
  resizeCanvas();
  ensureCamera();
  lastFrameTs = performance.now();
  if (!rafId) rafId = requestAnimationFrame(loop);
}

// NEW: Allow stopping the engine loop (used when finishing roadmap run)
export function stopEngine() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

// NEW: Restart the engine loop if it was stopped (e.g., after finishRun)
export function ensureEngineRunning() {
  if (!rafId) {
    lastFrameTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }
}