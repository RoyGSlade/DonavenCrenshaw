// Crew rooms on the Stardust relay: the new game's pilot plus up to three crew
// aboard the same ship (S52, S15; launch outcome 3: 1 to 4 players). The relay
// and every page share these rules. No imports, so the relay image needs only
// this one extra file.
//
// Protocol 2 (4 seats): the host creates with { seats: 1..4 }; seats fill from 1
// up; the host sends to one seat ({ to }) or to all; a seat's message reaches the
// host with { from: seat }. Protocol 1 (today's 2-seat rooms) is unchanged: a
// create without `seats` gets a 2-seat room, and the relay's hello still says
// `crew: 1`, so pages from before outcome 3 keep working.
//
// The host's browser runs the job (it is the host's save), as Dogfight's host
// runs the fight. The relay only forwards small plain-data messages between
// the two seats:
//   host -> crew: { kind: 'state' | 'reward' | 'note', ... }  what to show, a share of a reward
//   crew -> host: { kind: 'card' | 'act', ... }               who the crew is, what they did
// Pages render every string with textContent; the relay only checks shape and size.
export const CREW_MODE = 'crew';
export const CREW_SEATS = 4;
// A protocol-1 room (a create without `seats`) has two.
export const LEGACY_SEATS = 2;
// The newest crew protocol; the relay's hello lists every one it speaks in
// `crewProtocols` and keeps `crew: 1` for pages from before outcome 3.
export const CREW_PROTOCOL = 2;
export const CREW_PROTOCOLS = Object.freeze([1, 2]);

/** A seat number 0..CREW_SEATS-1, or null. */
export function cleanSeat(n) {
  return Number.isInteger(n) && n >= 0 && n < CREW_SEATS ? n : null;
}

export const CREW_KINDS = Object.freeze({
  host: Object.freeze(['state', 'reward', 'note']),
  guest: Object.freeze(['card', 'act']),
});

export const CREW_LIMITS = Object.freeze({ depth: 6, string: 400, array: 40, keys: 40, bytes: 12000 });
// Keys are short names; hyphens allowed for ids such as skill and giver ids.
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

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
