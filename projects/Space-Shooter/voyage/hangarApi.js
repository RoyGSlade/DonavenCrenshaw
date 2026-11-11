// The hangar's API for other lanes on the same page. Import it; never reach
// into the hangar's DOM. Everything here works before the hangar has booted
// (registrations are kept and shown once it does).
//
// Walking up to a station (onfoot lane):
//   hangarApi.openStation('pad', { via: 'walk' });  // the player pressed interact in pad's talk ring
//   hangarApi.closeStation();
//   const off = hangarApi.subscribe(({ type, station, via }) => { ... });  // type 'open' | 'close'
//   hangarApi.stationNear(x, y);   // which talk ring a floor point (metres) is in; hangarApi.stations, hangarApi.floor
//
// Station content slots (content lane: Mel's gear, Edna's black market, Chibby's parts):
//   const off = mountStation('locker', { id: 'shop', label: 'Shop', order: 10, render(el, ctx) { ...; return () => cleanup(); } });
//   The station's panel gets a "Shop" view; render(el, ctx) fills `el` (textContent only) each time the view opens;
//   ctx = { store, toast, bus, station, close() }. A returned function runs when the view closes.
//
// The launch menu at the hatch (races lane: arena, practice circuit; explore lane: sector hops):
//   const off = addLaunch({ id: 'arena', label: 'Dogfight arena', blurb: '2-3 pilots, today\'s classes', order: 20,
//                           available(save) { return { ok: true } }, run(ctx) { ... } });
//
// Station ids, positions and talk rings: hangarStations.js / hangarData.js.
import { stationNear, STATIONS, HANGAR, stationById } from './hangarStations.js';

const idle = {
  openStation: () => false,
  closeStation: () => false,
  subscribe: () => () => {},
  get current() { return null; },
};
let impl = idle;
const mounts = new Map(); // stationId -> Map(id -> spec)
const launchList = new Map();
const watchers = new Set();
const changed = () => { for (const fn of [...watchers]) { try { fn(); } catch (e) { console.warn('Stardust: a hangar registry listener failed', e); } } };
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Add a view to a station's panel. Returns an unmount function. */
export function mountStation(stationId, spec) {
  if (!stationById(stationId)) throw new Error(`Unknown hangar station: ${stationId}`);
  if (!spec || !ID.test(spec.id || '') || typeof spec.render !== 'function') throw new Error('mountStation needs { id, label, render(el, ctx) }');
  if (!mounts.has(stationId)) mounts.set(stationId, new Map());
  mounts.get(stationId).set(spec.id, { order: 50, ...spec, label: String(spec.label || spec.id) });
  changed();
  return () => { mounts.get(stationId)?.delete(spec.id); changed(); };
}

/** The extra views mounted on a station, in order. */
export function stationMounts(stationId) {
  return [...(mounts.get(stationId)?.values() || [])].sort((a, b) => a.order - b.order);
}

/** Add an entry to the hatch's launch menu. Returns a remove function. */
export function addLaunch(spec) {
  if (!spec || !ID.test(spec.id || '') || typeof spec.run !== 'function') throw new Error('addLaunch needs { id, label, run(ctx) }');
  launchList.set(spec.id, { order: 50, ...spec, label: String(spec.label || spec.id) });
  changed();
  return () => { launchList.delete(spec.id); changed(); };
}

/** The launch menu, in order. */
export function launches() {
  return [...launchList.values()].sort((a, b) => a.order - b.order);
}

/** fn() whenever a mount or launch is added or removed. */
export function watchRegistry(fn) { watchers.add(fn); return () => watchers.delete(fn); }

export const hangarApi = {
  openStation: (id, opts) => impl.openStation(id, opts),
  closeStation: (opts) => impl.closeStation(opts),
  /** fn({ type: 'open'|'close', station, via }); works before boot too. */
  subscribe(fn) { apiListeners.add(fn); return () => apiListeners.delete(fn); },
  get current() { return impl.current; },
  stationNear,
  stations: STATIONS,
  floor: HANGAR,
  mountStation,
  addLaunch,
};

const apiListeners = new Set();
let unhook = () => {};
/** The hangar page plugs its place controller in here (hangarPlace.js). */
export function provideHangar(place) {
  unhook();
  impl = place || idle;
  unhook = impl.subscribe((e) => { for (const fn of [...apiListeners]) { try { fn(e); } catch (err) { console.warn('Stardust: a hangar listener failed', err); } } });
}
