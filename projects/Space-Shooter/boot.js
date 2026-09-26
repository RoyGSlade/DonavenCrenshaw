import { initAudioUnlock } from './audio.js';
import { initStarmap } from './index.js';
import { checkBackend } from './systems/backend.js';
import { initRunSaving } from './systems/runSaving.js';
const status = document.getElementById('boot-status');
const button = document.getElementById('starmap-start-btn');
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
checkBackend().then(result => {
  document.getElementById('connection-status').textContent = result.available ? 'LOCAL FLIGHT · RELAY ONLINE' : 'LOCAL FLIGHT';
  // Saved runs need the hub; without it every flight stays local.
  if (result.available) initRunSaving().catch(error => console.warn('Stardust: leaderboard unavailable', error));
});
