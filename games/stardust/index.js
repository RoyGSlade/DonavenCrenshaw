// src/roadmap/index.js
import { bindInput } from './input.js';
import { initEngine } from './engine/index.js';
import { initOverlays, openStartOverlay } from './ui/overlays.js';
import { loadRoadmapData } from './data.js';
import { state } from './state.js';
import { resizeCanvas } from './ui/graphics.js';
import { loadAssets } from './assets.js';


let isInitialized = false;

export async function initStarmap(canvas) {
  if (isInitialized) return;

  try {
    const [data] = await Promise.all([
      loadRoadmapData(),
      loadAssets()
    ]);
    state.data = data;
  } catch (e) {
    console.error('Failed to load assets or data', e);
    return;
  }

  initEngine(canvas);
  resizeCanvas();
  await bindInput();
  initOverlays();
  openStartOverlay();

  isInitialized = true;
  console.log('Starmap Initialized');
}
