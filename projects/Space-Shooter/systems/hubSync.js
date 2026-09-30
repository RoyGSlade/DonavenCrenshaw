// Keeps a signed-in pilot's stuff on their account: the equipped ship, the flight
// settings and the garage's design library. Guests and offline play are untouched:
// everything lives in this browser first, and this file only ever mirrors it.
//
// What goes where (the hub's contract):
//   ship       PUT|GET|DELETE /api/stardust/ship         { appearance }
//   settings   PUT|GET /api/games/stardust/saves/settings  { version: 1, data: { code, updatedAt } }
//   garage     PUT|GET /api/games/stardust/saves/garage    { version: 1, data: { designs, updatedAt } }
//
// Conflicts:
//   ship       the device wins. A device with a ship pushes it; a device with none
//              adopts the hub's.
//   settings / garage   the newer `updatedAt` wins. Every local change stamps the
//              browser's clock; a pulled copy newer than the local stamp is applied
//              (settings replace, designs merge by id and never delete a local one),
//              an older or missing copy is overwritten by a push.
//
// Every call fails soft: a failure is a console warning and a status line in the
// flight settings, never an error in the game. The hub's three save slots per
// player can run out; a 409 no_free_slot stops that slot for the session.
//
// No DOM here: the browser (storage, events, fetch) is handed in by
// systems/hubSyncLive.js, so the rules can be tested alone.
import { cleanAppearance } from './shipLivery.js';

export const SETTINGS_SLOT = 'settings';
export const GARAGE_SLOT = 'garage';
export const SAVE_VERSION = 1;
// The hub refuses a save over 64 KB. A little is kept back for the envelope and
// for a hub that counts the whole body.
export const MAX_SAVE_BYTES = 64 * 1024;
export const SAVE_HEADROOM = 512;
export const LIBRARY_LIMIT = 12; // the same cap liveryLibrary.js keeps
export const DEBOUNCE_MS = 4000;
// Re-check the hub when the tab comes back, but not more often than this.
export const RESYNC_MS = 60 * 1000;

const STATUS_TEXT = Object.freeze({
  saved: 'Saved to your account',
  saving: 'Saving to your account…',
  guest: 'Sign in to save to your account',
  offline: 'Offline: saved on this device',
  'no-slot': 'Not saved to your account: no free save slot',
  local: 'Saved on this device',
});
export const syncStatusText = (status) => STATUS_TEXT[status] || STATUS_TEXT.local;

// --- Pure rules -------------------------------------------------------------------

/** Milliseconds from a number or a date string; 0 when it is neither. */
export function toMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  if (typeof value === 'string') { const t = Date.parse(value); return Number.isFinite(t) && t > 0 ? t : 0; }
  return 0;
}

export function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

/** A small stable fingerprint of a string, to notice that something changed. */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

/** Designs from anywhere (the hub, local storage) → the shape the library keeps. Bad ones are dropped. */
export function cleanDesigns(list, limit = LIBRARY_LIMIT) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (out.length >= limit) break;
    const id = typeof item?.id === 'string' ? item.id : '';
    const appearance = cleanAppearance(item?.appearance);
    if (!id || id.length > 64 || seen.has(id) || typeof item.name !== 'string' || !appearance) continue;
    seen.add(id);
    out.push({ id, name: item.name.slice(0, 60), appearance });
  }
  return out;
}

/** The same designs in any order give the same fingerprint. */
export function librarySignature(designs) {
  const sorted = [...designs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hashText(JSON.stringify(sorted));
}

/**
 * Local designs plus the hub's, by id. The local version of a design wins, and no
 * local design is ever dropped; designs only the hub has are added after them, up
 * to the library's size (a full local library takes nothing).
 */
export function mergeDesigns(local, remote, limit = LIBRARY_LIMIT) {
  const merged = cleanDesigns(local, limit);
  const have = new Set(merged.map((d) => d.id));
  for (const d of cleanDesigns(remote, limit)) {
    if (merged.length >= limit) break;
    if (!have.has(d.id)) { merged.push(d); have.add(d.id); }
  }
  return merged;
}

/**
 * The garage slot's data, cut to fit the hub's 64 KB. Designs are kept newest
 * first, so when the library is too big for one save the OLDEST designs are left
 * out of the pushed copy (they stay on this device). Returns { data, dropped }, or
 * null when not even one design fits (nothing is pushed then, rather than an
 * empty library that would wipe the hub's).
 */
export function fitGarageSave(designs, updatedAt, max = MAX_SAVE_BYTES - SAVE_HEADROOM) {
  const list = [...designs];
  const size = () => byteLength(JSON.stringify({ version: SAVE_VERSION, data: { designs: list, updatedAt } }));
  while (list.length && size() > max) list.pop();
  if (!list.length && designs.length) return null;
  return { data: { designs: list, updatedAt }, dropped: designs.length - list.length };
}

/**
 * What to do with one synced value: 'pull' (apply the hub's), 'push' (send ours),
 * 'align' (same content, only the stamp moves) or 'none'.
 *   localAt   when this browser last changed it (0: never, since this started tracking)
 *   remoteAt  the hub copy's updatedAt, or null when the hub has none
 */
export function decideSync({ localAt = 0, remoteAt = null, same = false } = {}) {
  if (remoteAt == null) return localAt > 0 ? 'push' : 'none';
  if (same) return 'align';
  if (remoteAt > localAt) return 'pull';
  if (localAt > remoteAt) return 'push';
  return 'none';
}

/** Two appearances are the same ship when their cleaned documents match. */
export const sameAppearance = (a, b) => JSON.stringify(cleanAppearance(a)) === JSON.stringify(cleanAppearance(b));

/** The hub's settings slot → { code, updatedAt } or null. */
export function readSettingsSave(body) {
  const data = body?.data;
  return typeof data?.code === 'string' && data.code ? { code: data.code, updatedAt: toMs(data.updatedAt) } : null;
}

/** The hub's garage slot → { designs, updatedAt } or null. */
export function readGarageSave(body) {
  const data = body?.data;
  return Array.isArray(data?.designs) ? { designs: cleanDesigns(data.designs), updatedAt: toMs(data.updatedAt) } : null;
}

// --- The syncer -------------------------------------------------------------------

const unreachable = (status) => !status || status >= 500;

/**
 * deps:
 *   api(path, { method, body }) → { ok, status, data }   never throws (recorder.api)
 *   gamePath(path)             → the game's path on the hub ('/saves/x' → '/api/games/stardust/saves/x')
 *   signedIn(), reachable()    → booleans
 *   store { read() → object, write(object) }   where the sync's own bookkeeping lives
 *   settings { code(), apply(code) → boolean }
 *   library  { read() → designs, write(designs) }
 *   ship     { get() → appearance | null, prepare() → Promise (loads what equip needs), equip(appearance) }
 *   emit(status), log, now, setTimer, clearTimer
 */
export function createHubSync({
  api, gamePath, signedIn, reachable = () => true, store, settings, library, ship,
  emit = () => {}, log = console, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  debounceMs = DEBOUNCE_MS, resyncMs = RESYNC_MS,
}) {
  const state = (() => { try { return { ...store.read() }; } catch { return {}; } })();
  const save = () => { try { store.write(state); } catch { /* storage unavailable: stamps live for this session only */ } };
  const blocked = new Set();
  const timers = {};
  let chain = Promise.resolve();
  let busy = 0;
  let net = 'ok';
  let applying = false; // a pulled copy is being applied; its events are not local edits
  let shipQueued = false;
  let lastSync = 0;
  let wasSignedIn = false;

  const status = () => {
    if (!signedIn()) return reachable() ? 'guest' : 'offline';
    if (blocked.size) return 'no-slot';
    if (busy > 0 || Object.keys(timers).length) return 'saving';
    return net === 'offline' ? 'offline' : 'saved';
  };
  let shown = null;
  const announce = () => { const s = status(); if (s !== shown) { shown = s; try { emit(s); } catch { /* a listener's problem */ } } };

  const warn = (what, res) => log.warn?.(`Stardust: ${what} (${res?.status || 'no answer'}${res?.data?.error ? ` ${res.data.error}` : ''})`);
  // Files a network answer: did the hub answer at all?
  const heard = (res) => { net = unreachable(res.status) ? 'offline' : 'ok'; };
  const enqueue = (job) => {
    busy += 1;
    announce();
    chain = chain.then(job).catch((error) => { log.warn?.('Stardust: account sync failed', error); })
      .finally(() => { busy -= 1; announce(); });
    return chain;
  };

  // --- Noticing local edits ---
  // Stamps are the browser's clock, but never earlier than the newest hub copy
  // seen, so an edit made after a pull always outranks it, even on a slow clock.
  const stamp = (seen) => Math.max(now(), (seen || 0) + 1);

  function noteSettings() {
    const code = settings.code();
    if (state.settingsCode === undefined) { state.settingsCode = code; state.settingsAt = state.settingsAt || 0; save(); return false; }
    if (code === state.settingsCode) return false;
    state.settingsCode = code;
    state.settingsAt = stamp(state.settingsSeen);
    save();
    return true;
  }
  function noteLibrary() {
    const sig = librarySignature(library.read());
    if (state.garageSig === undefined) { state.garageSig = sig; state.garageAt = state.garageAt || 0; save(); return false; }
    if (sig === state.garageSig) return false;
    state.garageSig = sig;
    state.garageAt = stamp(state.garageSeen);
    save();
    return true;
  }

  // --- Settings ---
  async function pushSettings() {
    if (blocked.has(SETTINGS_SLOT) || !signedIn() || !state.settingsAt) return;
    const res = await api(gamePath(`/saves/${SETTINGS_SLOT}`), { method: 'PUT', body: { version: SAVE_VERSION, data: { code: settings.code(), updatedAt: state.settingsAt } } });
    heard(res);
    if (res.ok) { state.settingsSeen = Math.max(state.settingsSeen || 0, state.settingsAt); save(); return; }
    if (res.status === 409 && res.data?.error === 'no_free_slot') { blocked.add(SETTINGS_SLOT); log.warn?.('Stardust: no free save slot on your account, so your settings stay on this device.'); return; }
    warn('settings were not saved to your account', res);
  }
  async function syncSettings() {
    if (blocked.has(SETTINGS_SLOT)) return;
    noteSettings();
    const res = await api(gamePath(`/saves/${SETTINGS_SLOT}`));
    heard(res);
    if (res.status !== 404 && !res.ok) { warn('could not read your saved settings', res); return; }
    const remote = res.ok ? readSettingsSave(res.data) : null;
    const code = settings.code();
    const action = decideSync({ localAt: state.settingsAt || 0, remoteAt: remote ? remote.updatedAt : null, same: !!remote && remote.code === code });
    if (remote) { state.settingsSeen = Math.max(state.settingsSeen || 0, remote.updatedAt); save(); }
    if (action === 'align') { state.settingsAt = remote.updatedAt; save(); }
    else if (action === 'push') await pushSettings();
    else if (action === 'pull') {
      // A browser that has never tracked its settings loses them to the hub's copy; keep them once.
      if (!state.settingsAt && code !== remote.code) state.settingsBackup = code;
      applying = true;
      let ok = false;
      try { ok = settings.apply(remote.code); } catch { ok = false; } finally { applying = false; }
      if (ok) { state.settingsCode = settings.code(); state.settingsAt = remote.updatedAt; save(); }
      else { log.warn?.('Stardust: the settings saved on your account could not be read.'); if (state.settingsAt) await pushSettings(); }
    }
  }

  // --- Garage library ---
  async function pushGarage() {
    if (blocked.has(GARAGE_SLOT) || !signedIn() || !state.garageAt) return;
    const fit = fitGarageSave(library.read(), state.garageAt);
    if (!fit) { log.warn?.('Stardust: your design library is too big to save to your account.'); return; }
    if (fit.dropped) log.warn?.(`Stardust: ${fit.dropped} oldest design${fit.dropped === 1 ? '' : 's'} left out of the copy on your account (64 KB limit); they stay on this device.`);
    const res = await api(gamePath(`/saves/${GARAGE_SLOT}`), { method: 'PUT', body: { version: SAVE_VERSION, data: fit.data } });
    heard(res);
    if (res.ok) { state.garageSeen = Math.max(state.garageSeen || 0, state.garageAt); save(); return; }
    if (res.status === 409 && res.data?.error === 'no_free_slot') { blocked.add(GARAGE_SLOT); log.warn?.('Stardust: no free save slot on your account, so your designs stay on this device.'); return; }
    warn('designs were not saved to your account', res);
  }
  async function syncGarage() {
    if (blocked.has(GARAGE_SLOT)) return;
    noteLibrary();
    const res = await api(gamePath(`/saves/${GARAGE_SLOT}`));
    heard(res);
    if (res.status !== 404 && !res.ok) { warn('could not read your saved designs', res); return; }
    const remote = res.ok ? readGarageSave(res.data) : null;
    const local = library.read();
    const action = decideSync({ localAt: state.garageAt || 0, remoteAt: remote ? remote.updatedAt : null, same: !!remote && librarySignature(remote.designs) === librarySignature(local) });
    if (remote) { state.garageSeen = Math.max(state.garageSeen || 0, remote.updatedAt); save(); }
    if (action === 'align') { state.garageAt = remote.updatedAt; save(); }
    else if (action === 'push') await pushGarage();
    else if (action === 'pull') {
      const merged = mergeDesigns(local, remote.designs);
      applying = true;
      try { library.write(merged); } finally { applying = false; }
      const now2 = library.read();
      state.garageSig = librarySignature(now2);
      // Designs the hub did not have go back up; otherwise this browser now matches it.
      if (librarySignature(now2) === librarySignature(remote.designs)) state.garageAt = remote.updatedAt;
      else { state.garageAt = stamp(remote.updatedAt); save(); await pushGarage(); return; }
      save();
    }
  }

  // --- Ship ---
  async function pushShip() {
    if (!signedIn()) return;
    const local = cleanAppearance(ship.get());
    const res = local
      ? await api('/api/stardust/ship', { method: 'PUT', body: { appearance: local } })
      : await api('/api/stardust/ship', { method: 'DELETE' });
    heard(res);
    if (res.ok || (!local && res.status === 404)) return;
    warn(local ? 'your ship was not saved to your account' : 'your ship was not cleared on your account', res);
  }
  async function syncShip() {
    const local = cleanAppearance(ship.get());
    const res = await api('/api/stardust/ship');
    heard(res);
    if (res.status === 404) { if (local) await pushShip(); return; }
    if (!res.ok) { warn('could not read your saved ship', res); return; }
    const remote = cleanAppearance(res.data?.appearance);
    if (!remote) { if (local) await pushShip(); return; }
    if (!local) {
      // Nothing equipped here: fly the ship from the account. The ship parts load first,
      // and only if the pilot still has nothing equipped after that does it go on.
      try { await ship.prepare(); } catch (error) { log.warn?.('Stardust: could not load your ship from your account', error); return; }
      if (cleanAppearance(ship.get())) return;
      applying = true;
      try { ship.equip(remote); } catch (error) { log.warn?.('Stardust: could not equip your ship from your account', error); } finally { applying = false; }
      return;
    }
    if (!sameAppearance(local, remote)) await pushShip();
  }

  // --- Scheduling ---
  function schedule(slot, push) {
    if (blocked.has(slot)) return;
    if (timers[slot]) clearTimer(timers[slot]);
    timers[slot] = setTimer(() => { delete timers[slot]; enqueue(push); }, debounceMs);
    announce();
  }
  function flush() {
    for (const [slot, t] of Object.entries(timers)) {
      clearTimer(t); delete timers[slot];
      enqueue(slot === SETTINGS_SLOT ? pushSettings : pushGarage);
    }
    announce();
  }

  return {
    status,
    get blocked() { return [...blocked]; },
    flush,
    /** The pilot's session is known (start, or back from signing in): stamp local edits, then sync. */
    onSession({ force = false } = {}) {
      noteSettings();
      noteLibrary();
      const signed = signedIn();
      const fresh = signed && !wasSignedIn;
      wasSignedIn = signed;
      if (!signed) { for (const t of Object.values(timers)) clearTimer(t); for (const k of Object.keys(timers)) delete timers[k]; announce(); return Promise.resolve(); }
      if (!fresh && !force && now() - lastSync < resyncMs) { announce(); return chain; }
      lastSync = now();
      return enqueue(async () => { await syncSettings(); await syncGarage(); await syncShip(); });
    },
    settingsChanged() {
      if (applying) return;
      if (noteSettings() && signedIn()) schedule(SETTINGS_SLOT, pushSettings);
    },
    libraryChanged() {
      if (applying) return;
      if (noteLibrary() && signedIn()) schedule(GARAGE_SLOT, pushGarage);
    },
    // Equipping (or going back to the standard ship) goes up at once, in order.
    shipChanged() {
      if (applying || !signedIn() || shipQueued) return;
      shipQueued = true;
      enqueue(async () => { shipQueued = false; await pushShip(); });
    },
  };
}
