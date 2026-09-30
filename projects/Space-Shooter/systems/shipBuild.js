// Which garage build a run flies (engine/shipStats.js), or null for the
// standard ship. Every run, ranked or not, flies the equipped ship with its own
// hitbox and stats, on the same leaderboards as everyone else (owner's call,
// 2026-09-30). A preview flight (never submitted) can instead fly a build named
// in the address bar, `?ship=needle:0-1-0-0`, to test the stat table.
import { isBuild, buildKey } from '../engine/shipStats.js';

const APPEARANCE_KEY = 'stardust.courier.appearance.v1'; // written by the garage (systems/shipAppearance.js)

/** The build equipped in the garage on this device, or null. */
export function equippedBuild(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(APPEARANCE_KEY) || 'null');
    const p = saved?.parts;
    if (!saved || typeof saved.family !== 'string' || !p) return null;
    const key = buildKey({ family: saved.family, body: p.body | 0, wings: p.wings | 0, cockpit: p.cockpit | 0, engines: p.engines | 0 });
    return isBuild(key) ? key : null;
  } catch { return null; }
}

// ship: the same ask as ?ship=, made by the game instead of the address bar (the
// hangar's "Practice in your ship"). Like the address bar, it only counts on a preview.
export function buildForRun(event, { preview = false, search = globalThis.location?.search || '', storage, ship = null } = {}) {
  if (preview) {
    const asked = ship || new URLSearchParams(search).get('ship');
    if (asked === 'equipped') return equippedBuild(storage);
    if (asked && isBuild(asked)) return asked;
  }
  return equippedBuild(storage);
}
