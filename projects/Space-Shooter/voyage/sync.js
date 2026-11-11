// Keeps a signed-in captain's Voyage save on their account, in the hub save
// slot `voyage` (Stardust's third, beside `settings` and `garage`). Guests and
// offline play are untouched: the save lives in this browser first
// (voyage/store.js) and this file only mirrors it, on the same rules as
// systems/hubSync.js:
//   - the newer `updatedAt` wins; a pulled copy replaces this browser's save,
//     after a backup of it is kept (stardust.voyage.backup.v1);
//   - local changes go up a few seconds after the last one, and at once on flush();
//   - every call fails soft; a 409 no_free_slot keeps the save on this device.
// No DOM here: the browser parts are handed in by voyage/live.js.
import { decideSync, syncStatusText } from '../systems/hubSync.js';
import { cleanSave, encodeSave, hasProgress, SAVE_VERSION } from './save.js';

export const VOYAGE_SLOT = 'voyage';
export const DEBOUNCE_MS = 3000;
export { syncStatusText };

/** The hub's slot body -> a save, or null. */
export function readVoyageSave(body) {
  const data = body?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? cleanSave(data) : null;
}

const unreachable = (status) => !status || status >= 500;

/**
 * deps:
 *   api(path, { method, body }) -> { ok, status, data }, never throws (systems/hubRuns.js recorder.api)
 *   gamePath(path), signedIn(), reachable()
 *   store   voyage/store.js (get, replace, backup)
 *   emit(status), log, setTimer, clearTimer
 */
export function createVoyageSync({
  api, gamePath, signedIn, reachable = () => true, store,
  emit = () => {}, log = console, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = DEBOUNCE_MS,
}) {
  let blocked = false;
  let timer = null;
  let busy = 0;
  let net = 'ok';
  let chain = Promise.resolve();
  let shown = null;
  const path = () => gamePath(`/saves/${VOYAGE_SLOT}`);

  const status = () => {
    if (!signedIn()) return reachable() ? 'guest' : 'offline';
    if (blocked) return 'no-slot';
    if (busy > 0 || timer) return 'saving';
    return net === 'offline' ? 'offline' : 'saved';
  };
  const announce = () => { const s = status(); if (s !== shown) { shown = s; try { emit(s); } catch { /* a listener's problem */ } } };
  const heard = (res) => { net = unreachable(res.status) ? 'offline' : 'ok'; };
  const warn = (what, res) => log.warn?.(`Stardust: ${what} (${res?.status || 'no answer'}${res?.data?.error ? ` ${res.data.error}` : ''})`);
  const enqueue = (job) => {
    busy += 1;
    announce();
    chain = chain.then(job).catch((error) => { log.warn?.('Stardust: Voyage save sync failed', error); })
      .finally(() => { busy -= 1; announce(); });
    return chain;
  };

  async function push() {
    if (blocked || !signedIn()) return;
    const save = store.get();
    const text = encodeSave(save);
    if (!text) { log.warn?.('Stardust: your Voyage save is too big for your account; it stays on this device.'); return; }
    const res = await api(path(), { method: 'PUT', body: { version: SAVE_VERSION, data: JSON.parse(text) } });
    heard(res);
    if (res.ok) return;
    if (res.status === 409 && res.data?.error === 'no_free_slot') {
      blocked = true;
      log.warn?.('Stardust: no free save slot on your account, so your Voyage captain stays on this device.');
      return;
    }
    warn('your Voyage save was not saved to your account', res);
  }

  async function sync() {
    if (blocked || !signedIn()) return;
    const res = await api(path());
    heard(res);
    if (res.status !== 404 && !res.ok) { warn('could not read your Voyage save', res); return; }
    const local = store.get();
    const remote = res.ok ? readVoyageSave(res.data) : null;
    const localAt = hasProgress(local) ? local.updatedAt : 0;
    const same = !!remote && encodeSave({ ...remote, updatedAt: 0 }) === encodeSave({ ...local, updatedAt: 0 });
    const action = decideSync({ localAt, remoteAt: remote ? remote.updatedAt : null, same });
    if (action === 'push') await push();
    else if (action === 'align') store.replace(remote);
    else if (action === 'pull') {
      // Progress made here (offline, or before signing in) is kept aside, never just dropped.
      if (hasProgress(local)) store.backup();
      store.replace(remote);
    }
  }

  return {
    status,
    get blocked() { return blocked; },
    /** The pilot's session is known (page start, back to the tab, signed in). */
    onSession() {
      if (!signedIn()) { if (timer) { clearTimer(timer); timer = null; } announce(); return Promise.resolve(); }
      return enqueue(sync);
    },
    /** A local change: push it after a short pause. */
    changed() {
      if (blocked || !signedIn()) { announce(); return; }
      if (timer) clearTimer(timer);
      timer = setTimer(() => { timer = null; enqueue(push); }, debounceMs);
      announce();
    },
    /** Push a waiting change now (the page is closing). */
    flush() {
      if (!timer) return chain;
      clearTimer(timer);
      timer = null;
      return enqueue(push);
    },
  };
}
