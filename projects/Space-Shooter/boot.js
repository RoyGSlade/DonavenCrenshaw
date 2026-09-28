import { initAudioUnlock } from './audio.js';
import { initStarmap } from './index.js';
import { checkBackend } from './systems/backend.js';
import { initRunSaving } from './systems/runSaving.js';
import { config } from './state.js';
import { parseLab, labConfig } from './systems/lab.js';
import { initLab } from './systems/labUi.js';
const status = document.getElementById('boot-status');
const button = document.getElementById('starmap-start-btn');
// ?lab=... swaps in playtest rules. Such a session never saves runs.
const lab = parseLab(location.search);
if (lab) Object.assign(config, labConfig(lab));
initAudioUnlock();
try {
  await initStarmap(document.getElementById('starmap-canvas'));
  status.textContent = 'FLIGHT SYSTEMS READY / KEYBOARD · GAMEPAD · TOUCH';
  button.disabled = false;
  button.textContent = 'Launch expedition  →';
} catch (error) {
  status.textContent = 'Flight systems could not load. Reload this page to retry.';
  button.textContent = 'Loading failed';
  console.error('Stardust initialization failed', error);
}
if (lab) {
  initLab(lab);
} else {
  checkBackend().then(result => {
    document.getElementById('connection-status').textContent = result.available ? 'LOCAL FLIGHT · RELAY ONLINE' : 'LOCAL FLIGHT';
    // Saved runs need the hub. Run saving starts either way: while the hub is
    // down it says so, and it reconnects on every launch.
    initRunSaving().catch(error => console.warn('Stardust: leaderboard unavailable', error));
  });
}
