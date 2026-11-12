// Where a marker target is across the walkable maps, and which door leads
// toward it. Pure, no imports: onfoot/world.js and the tracker both use it.
/**
 * Where a marker target stands: the maps (by id) holding it.
 * maps: { id: def } (MAP_DEFS shape). target: { station } | { npc }.
 */
export function mapsHolding(target, maps) {
  if (!target) return [];
  const out = [];
  for (const def of Object.values(maps)) {
    const tagged = [...(def.props || []), ...(def.npcs || []), ...(def.doors || []), ...(def.zones || [])];
    if (target.station && tagged.some((t) => t.station === target.station)) out.push(def.id);
    else if (target.npc && (def.npcs || []).some((n) => n.id === target.npc)) out.push(def.id);
  }
  return out;
}

/**
 * The door in `from` to walk through to reach any map in `to` (fewest doors), or null
 * when already there or there is no way on foot (a hop is needed: then the ship's door).
 */
export function doorToward(from, to, maps) {
  if (!to.length || to.includes(from)) return null;
  const goal = new Set(to);
  const seen = new Set([from]);
  const queue = (maps[from]?.doors || []).map((d) => ({ map: d.to, first: d.id }));
  while (queue.length) {
    const { map, first } = queue.shift();
    if (seen.has(map)) continue;
    seen.add(map);
    if (goal.has(map)) return first;
    for (const d of maps[map]?.doors || []) if (!seen.has(d.to)) queue.push({ map: d.to, first });
  }
  return null;
}
