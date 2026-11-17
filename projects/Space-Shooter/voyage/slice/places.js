// The opening slice's places (launch slice lane): the Tin Duchess's rooms as places quests and the tracker can point at,
// and where a quest step's marker stands inside one. Pure: no DOM. A room id is a map id (maps/tin-duchess.json lists them).
//
//   isPlace(id)                      a Duchess room id
//   placeName(id)                    "the mess hall" (or null)
//   markerPoint(map, at)             { x, y } in world px for { npc } | { zone } | { prop } in a compiled map, or null
//   markerDistance(map, at, x, y)    how far a spot is from a point (to a prop's or zone's edge)
//   markerReach(map, at)             how close counts as reaching it
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
/** How far a spot is from a point: to a person, or to the edge of a prop or a zone (0 inside it). null when the spot is not in the map. */
export function markerDistance(map, at, x, y) {
  const rect = at?.zone ? (map.zones || []).find((z) => z.id === at.zone) : at?.prop ? (map.props || []).find((p) => p.name === at.prop) : null;
  if (rect) return Math.hypot(Math.max(rect.x - x, 0, x - (rect.x + rect.w)), Math.max(rect.y - y, 0, y - (rect.y + rect.h)));
  const p = markerPoint(map, at);
  return p ? Math.hypot(p.x - x, p.y - y) : Infinity;
}
/** How close counts as reaching it: a person's talking distance, or a step from a prop's or a zone's edge. */
export const markerReach = (map, at) => map.tile * (at?.npc ? 1.9 : 1.25);
