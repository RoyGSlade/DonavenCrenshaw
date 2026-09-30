// Which garage build a weekly attempt flies (engine/shipStats.js), or null for
// the standard ship. Builds change the hitbox and the physics, so they only
// apply where that is allowed:
//   - an event marked `ships: "builds"` in tracks/weekly.js flies the equipped
//     garage ship;
//   - a preview flight (never submitted) flies `?ship=needle:0-1-0-0` from the
//     address bar, for testing the stat table.
// Everywhere else the ship is the standard one, whatever it looks like.
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

export function buildForRun(event, { preview = false, search = globalThis.location?.search || '', storage } = {}) {
  if (preview) {
    const asked = new URLSearchParams(search).get('ship');
    if (asked && isBuild(asked)) return asked;
  }
  return event?.ships === 'builds' ? equippedBuild(storage) : null;
}
