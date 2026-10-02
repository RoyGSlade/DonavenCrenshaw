// Connects systems/hubSync.js to the running game: the hub client, this browser's
// storage and the events the settings, the design library and the garage raise.
import { createHubSync, cleanDesigns, syncStatusText } from './hubSync.js';
import { encodeSettingsCode, applySettingsCode } from './flightSettings.js';
import { readLibrary, writeLibrary } from './liveryLibrary.js';
import { getEquippedAppearance, equipAppearance, initCourierAppearance } from './shipAppearance.js';

const STATE_KEY = 'stardust.sync.v1';
let current = null;
// The first account sync of this page, once it has started (see whenAccountSynced).
let firstSync = null;

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
  // Remember the page's first sync, so a copied ship or settings is not applied underneath it.
  const onSession = current.onSession;
  current.onSession = (...args) => {
    const done = onSession.apply(current, args);
    if (!firstSync) { firstSync = Promise.resolve(done).catch(() => {}); window.dispatchEvent(new Event('stardust:sync-started')); }
    return done;
  };
  window.addEventListener('stardust:flightSettings', () => current.settingsChanged());
  window.addEventListener('stardust:library-changed', () => current.libraryChanged());
  window.addEventListener('stardust:appearance-changed', () => current.shipChanged());
  // Leaving the page sends what is waiting; anything cut off is sent at the next start.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') current.flush(); });
  window.addEventListener('pagehide', () => current.flush());
  return current;
}

/**
 * Resolves once the page's first account sync has finished, or after timeoutMs (a page
 * that does not sync just waits that long). The account's copy of the settings can replace
 * this browser's during that sync, so a prompt that changes them waits for it.
 */
export function whenAccountSynced(timeoutMs = 3500) {
  const waitFor = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  if (firstSync) return waitFor(firstSync);
  return waitFor(new Promise((resolve) => window.addEventListener('stardust:sync-started', () => resolve(firstSync), { once: true })));
}

/** 'saved' | 'saving' | 'guest' | 'offline' | 'no-slot' | 'local' (not syncing on this page). */
export function getSyncStatus() {
  return current ? current.status() : 'local';
}
export { syncStatusText };
