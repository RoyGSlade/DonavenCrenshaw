import { initAudioUnlock } from './audio.js';
import { initStarmap } from './index.js';
import { checkBackend } from './systems/backend.js';
import { initRunSaving } from './systems/runSaving.js';
import { config } from './state.js';
import { parseLab, labConfig } from './systems/lab.js';
import { initLab } from './systems/labUi.js';
import { initCustomTrackUi } from './systems/customTrackUi.js';
import { initWeeklyUi } from './systems/weeklyUi.js';
import { initFlightUi } from './ui/flightUi.js';
import { initHangar } from './ui/hangar.js';
import { initShareImport } from './ui/shareImport.js';
import { initWeeklyNavigation } from './systems/weeklyNavigation.js';
import { setQuestRaceMode } from './systems/questRace.js';
import { parseQuestRaceQuery } from './voyage/races/questRace.js';
import { initQuestRaceUi } from './ui/questRaceUi.js';
// ?questrace=<token>: a race for the new game (a quest's race leg or the
// hangar's practice circuit). The mode goes on before anything else runs, so
// nothing this page does can keep a best, a ghost, a board run or a weekly entry.
const questRace = parseQuestRaceQuery(location.search);
if (questRace) setQuestRaceMode({ kind: 'pending', token: questRace.token });
const status = document.getElementById('boot-status');
const button = document.getElementById('starmap-start-btn');
// ?lab=... swaps in playtest rules. Such a session never saves runs.
const lab = parseLab(location.search);
if (lab) Object.assign(config, labConfig(lab));
initAudioUnlock();
let ready = false;
try {
  await initStarmap(document.getElementById('starmap-canvas'));
  initFlightUi();
  initHangar();
  status.textContent = 'FLIGHT SYSTEMS READY · Controller detection: Controls & settings → Controller';
  button.disabled = false;
  button.textContent = 'Fly five circuits →';
  button.focus({ preventScroll: true });
  ready = true;
} catch (error) {
  status.textContent = 'Flight systems could not load. Reload this page to retry.';
  button.textContent = 'Loading failed';
  console.error('Stardust initialization failed', error);
}
if (ready && questRace) {
  try { initQuestRaceUi(questRace); } catch (error) { console.error('Stardust: quest race unavailable', error); }
}
// A leaderboard link (?import=ship|settings&from=<pilot>) offers that pilot's ship or settings.
if (ready && !questRace) initShareImport().catch(error => console.warn('Stardust: could not copy that setup', error));
// The custom track card: countdown until release, then its own one-lap run.
try { initCustomTrackUi({ ready, lab }); } catch (error) { console.error('Stardust: custom track unavailable', error); }
// The weekly time trial card: countdown to the opening, then to the close.
try { initWeeklyUi({ ready, lab }); } catch (error) { console.error('Stardust: weekly track unavailable', error); }
initWeeklyNavigation();
if (lab) {
  initLab(lab);
} else if (questRace) {
  // Saves nothing (like the lab): no run saving, no hub sync.
  document.getElementById('connection-status').textContent = 'QUEST RACE · OFF THE BOOKS';
} else {
  checkBackend().then(result => {
    document.getElementById('connection-status').textContent = result.available ? 'LOCAL FLIGHT · RELAY ONLINE' : 'LOCAL FLIGHT';
    // Saved runs need the hub. Run saving starts either way: while the hub is
    // down it says so, and it reconnects on every launch.
    initRunSaving().catch(error => console.warn('Stardust: leaderboard unavailable', error));
  });
}
