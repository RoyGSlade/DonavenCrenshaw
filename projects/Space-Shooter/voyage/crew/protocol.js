// Crew rooms on the Stardust relay: the new game's pilot plus one crew aboard
// the same ship (S52, S15). The relay and both pages share these rules. No
// imports, so the relay image needs only this one extra file.
//
// The host's browser runs the job (it is the host's save), as Dogfight's host
// runs the fight. The relay only forwards small plain-data messages between
// the two seats:
//   host -> crew: { kind: 'state' | 'reward' | 'note', ... }  what to show, a share of a reward
//   crew -> host: { kind: 'card' | 'act', ... }               who the crew is, what they did
// Pages render every string with textContent; the relay only checks shape and size.
export const CREW_MODE = 'crew';
export const CREW_SEATS = 2;
// Sent in the relay's hello as `crew: 1` so a page knows crew rooms exist.
export const CREW_PROTOCOL = 1;

export const CREW_KINDS = Object.freeze({
  host: Object.freeze(['state', 'reward', 'note']),
  guest: Object.freeze(['card', 'act']),
});

export const CREW_LIMITS = Object.freeze({ depth: 6, string: 400, array: 40, keys: 40, bytes: 12000 });
const KEY = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

// A deep copy of plain JSON within the limits, or undefined when anything is off.
function plain(value, depth) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= CREW_LIMITS.string ? value : undefined;
  if (depth >= CREW_LIMITS.depth || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    if (value.length > CREW_LIMITS.array) return undefined;
    const out = [];
    for (const item of value) {
      const clean = plain(item, depth + 1);
      if (clean === undefined) return undefined;
      out.push(clean);
    }
    return out;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const keys = Object.keys(value);
  if (keys.length > CREW_LIMITS.keys) return undefined;
  const out = {};
  for (const key of keys) {
    if (!KEY.test(key)) return undefined;
    const clean = plain(value[key], depth + 1);
    if (clean === undefined) return undefined;
    out[key] = clean;
  }
  return out;
}

/**
 * from: 'host' or 'guest' (the seat that sent it). Returns a clean copy of the
 * message data, or null when its kind is not one that seat may send, or its
 * shape or size is outside the limits.
 */
export function cleanCrewData(from, data) {
  const kinds = CREW_KINDS[from];
  if (!kinds || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!kinds.includes(data.kind)) return null;
  const clean = plain(data, 0);
  if (!clean) return null;
  return JSON.stringify(clean).length <= CREW_LIMITS.bytes ? clean : null;
}
