// The opening slice's places (launch slice lane): the Tin Duchess's rooms as places quests and the tracker can point at,
// and where a quest step's marker stands inside one. Pure: no DOM. A room id is a map id (maps/tin-duchess.json lists them).
//
//   isPlace(id)                      a Duchess room id
//   placeName(id)                    "the mess hall" (or null)
//   markerPoint(map, at)             { x, y } in world px for { npc } | { zone } | { prop } in a compiled map, or null
//   markerReach(map)                 how close to the point counts as reaching it
import SHIP from '../maps/tin-duchess.json' with { type: 'json' };

export const PLACES = Object.freeze([...SHIP.rooms]);
const NAMES = SHIP.roomNames || {};
export const isPlace = (id) => PLACES.includes(id);
export const placeName = (id) => NAMES[id] || null;

/** A marker spot in a compiled map (the map in its current state): npc id, zone id or prop name. */
export function markerPoint(map, at) {
  if (!map || !at) return null;
  if (at.npc) { const n = (map.npcs || []).find((x) => x.id === at.npc); return n ? { x: n.x, y: n.y } : null; }
  if (at.zone) { const z = (map.zones || []).find((x) => x.id === at.zone); return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null; }
  if (at.prop) { const p = (map.props || []).find((x) => x.name === at.prop); return p ? { x: p.cx, y: p.cy } : null; }
  return null;
}
export const markerReach = (map) => map.tile * 1.9;
