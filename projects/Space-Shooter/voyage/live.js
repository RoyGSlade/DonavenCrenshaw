// Connects the Voyage save to the account for a page: the hub client from the
// racing hangar (systems/hubRuns.js), the save slot sync and the browser's
// tab events. Everything fails soft; with no hub the save stays in this browser.
import { createRunRecorder } from '../systems/hubRuns.js';
import { createVoyageSync, syncStatusText } from './sync.js';

const RESYNC_MS = 60 * 1000;

export function startVoyageSync(store, { onStatus = () => {} } = {}) {
  const recorder = createRunRecorder();
  const sync = createVoyageSync({
    api: (path, options) => recorder.api(path, options),
    gamePath: (path) => recorder.gamePath(path),
    signedIn: () => Boolean(recorder.player),
    reachable: () => recorder.reachable,
    store,
    emit: (status) => onStatus(status, syncStatusText(status)),
  });
  store.subscribe((_, source) => { if (source === 'local') sync.changed(); });
  let last = 0;
  const session = async ({ force = false } = {}) => {
    if (!force && Date.now() - last < RESYNC_MS) return;
    last = Date.now();
    await recorder.connect();
    await sync.onSession();
  };
  const ready = session({ force: true }).catch((error) => console.warn('Stardust: Voyage account sync unavailable', error));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sync.flush();
    else session().catch(() => {});
  });
  window.addEventListener('pagehide', () => { sync.flush(); });
  return { recorder, sync, ready };
}
