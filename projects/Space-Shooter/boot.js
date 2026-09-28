import { initAudioUnlock } from './audio.js';
import { initStarmap } from './index.js';
import { checkBackend } from './systems/backend.js';
import { initRunSaving } from './systems/runSaving.js';
import { config } from './state.js';
import { parseLab, labConfig } from './systems/lab.js';
import { initLab } from './systems/labUi.js';
import { initCustomTrackUi } from './systems/customTrackUi.js';
const status = document.getElementById('boot-status');
const button = document.getElementById('starmap-start-btn');
// ?lab=... swaps in playtest rules. Such a session never saves runs.
const lab = parseLab(location.search);
if (lab) Object.assign(config, labConfig(lab));
initAudioUnlock();
let ready = false;
try {
  await initStarmap(document.getElementById('starmap-canvas'));
  status.textContent = 'FLIGHT SYSTEMS READY / KEYBOARD · GAMEPAD · TOUCH';
  button.disabled = false;
  button.textContent = 'Launch expedition  →';
  ready = true;
} catch (error) {
  status.textContent = 'Flight systems could not load. Reload this page to retry.';
  button.textContent = 'Loading failed';
  console.error('Stardust initialization failed', error);
}
// The custom track card: countdown until release, then its own one-lap run.
try { initCustomTrackUi({ ready, lab }); } catch (error) { console.error('Stardust: custom track unavailable', error); }
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
