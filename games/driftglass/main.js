// Driftglass entry point, loaded as a module by /infinite-ages/driftglass/play/.
import { initAudioUnlock } from './audio.js';
import { initStarmap } from './index.js';

const canvas = document.getElementById('starmap-canvas');
if (canvas) {
  initAudioUnlock();
  initStarmap(canvas);
}
