// Connects systems/hubSync.js to the running game: the hub client, this browser's
// storage and the events the settings, the design library and the garage raise.
import { createHubSync, cleanDesigns, syncStatusText } from './hubSync.js';
import { encodeSettingsCode, applySettingsCode } from './flightSettings.js';
import { readLibrary, writeLibrary } from './liveryLibrary.js';
import { getEquippedAppearance, equipAppearance, initCourierAppearance } from './shipAppearance.js';

const STATE_KEY = 'stardust.sync.v1';
let current = null;

const store = {
  read() { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; } },
  write(value) { try { localStorage.setItem(STATE_KEY, JSON.stringify(value)); } catch { /* private window */ } },
};

/** Starts syncing for this page. recorder is the hub client (systems/hubRuns.js); call onSession() once it knows who is flying. */
export function startHubSync(recorder) {
  if (current) return current;
  const emit = (status) => window.dispatchEvent(new CustomEvent('stardust:syncStatus', { detail: { status, text: syncStatusText(status) } }));
  current = createHubSync({
    api: (path, options) => recorder.api(path, options),
    gamePath: (path) => recorder.gamePath(path),
    signedIn: () => Boolean(recorder.player),
    reachable: () => recorder.reachable,
    store,
    settings: { code: () => encodeSettingsCode(), apply: (code) => applySettingsCode(code) },
    library: { read: () => cleanDesigns(readLibrary()), write: (designs) => writeLibrary(designs) },
    ship: { get: () => getEquippedAppearance(), prepare: () => initCourierAppearance(), equip: (appearance) => equipAppearance(appearance) },
    emit,
  });
  window.addEventListener('stardust:flightSettings', () => current.settingsChanged());
  window.addEventListener('stardust:library-changed', () => current.libraryChanged());
  window.addEventListener('stardust:appearance-changed', () => current.shipChanged());
  // Leaving the page sends what is waiting; anything cut off is sent at the next start.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') current.flush(); });
  window.addEventListener('pagehide', () => current.flush());
  return current;
}

/** 'saved' | 'saving' | 'guest' | 'offline' | 'no-slot' | 'local' (not syncing on this page). */
export function getSyncStatus() {
  return current ? current.status() : 'local';
}
export { syncStatusText };
