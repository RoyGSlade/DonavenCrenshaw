// Stardust procgen: the public API (Studio, onfoot, tools). Pure functions:
// map data in, map data out. No DOM, no network, no Math.random.
//
// Layers (ROADMAP.md in lhc-lanes/stardust/procgen/): planet -> biome region
// -> settlement -> building -> room. Built so far: room (the dresser) and a
// simple biome region (outdoor areas). Each layer is a deterministic function
// (parent context, seed) -> data the layer below consumes, using the same
// rule/prop-set format and the same validator.
//
// Studio hooks:
//   dressRoom(input)                    "Dress this room"
//   rerollRoom(map, seed?)              "Reroll" (same room, next or given seed)
//   lockAndReroll(map, keep, seed?)     "Lock these props and reroll the rest"
//   dressArea(input), rerollArea(...)   outdoor versions
//   validateMap(map) / assessMap(map)   checks + quality numbers for hand-edited maps
//   suggestShell(type, seed)            a sensible empty room of that type

import PROPS from './data/props.json' with { type: 'json' };
import ROOMS from './data/rooms.json' with { type: 'json' };
import BIOMES from './data/biomes.json' with { type: 'json' };
import { dressRoom as dressRoomWith, defaultShell, DRESSER_VERSION } from './layers/room/dresser.js';
import { dressArea as dressAreaWith, REGION_VERSION } from './layers/region/dresser.js';
import { validateMap, assessMap, designChecks as designChecksWith } from './core/validate.js';
import { makeRng, hash32 } from './core/rng.js';

export const CATALOGS = Object.freeze({ props: PROPS, rooms: ROOMS, biomes: BIOMES });
export const ROOM_TYPES = Object.freeze(Object.keys(ROOMS.rooms));
export const THEMES = Object.freeze(Object.keys(ROOMS.themes));
export const BIOME_TYPES = Object.freeze(Object.keys(BIOMES.biomes));
export const VERSION = Object.freeze({ room: DRESSER_VERSION, region: REGION_VERSION });
export { validateMap, assessMap };

/** Design checks for any map (dressed or hand-edited): off-wall shelves, blocked fronts, lone seats, anchors facing walls. */
export function designChecks(map, catalogs = CATALOGS) {
  return designChecksWith(map, catalogs.props.props);
}

/** "Dress this room." See API.md for the input shape. */
export function dressRoom(input, catalogs = CATALOGS) {
  return dressRoomWith(input, catalogs);
}

/** The next seed after `seed` (stable, so Reroll, Reroll walks a fixed sequence). */
export function nextSeed(seed) {
  return hash32(`reroll:${seed}`) % 1000000;
}

/** "Reroll": the same room input with a new seed (the next one, or the one given). Locks are kept. */
export function rerollRoom(map, seed, catalogs = CATALOGS) {
  const input = map?.procgen?.input;
  if (!input) throw new Error('rerollRoom: this map was not made by the dresser (no procgen.input)');
  const locked = (map.props || []).filter(p => p.locked);
  return dressRoomWith({ ...input, seed: seed ?? nextSeed(map.procgen.seed), locked }, catalogs);
}

/**
 * "Lock this prop and reroll the rest": keep = indexes into map.props, or a
 * predicate. Kept props are marked locked and stay locked on later rerolls.
 */
export function lockAndReroll(map, keep, seed, catalogs = CATALOGS) {
  const input = map?.procgen?.input;
  if (!input) throw new Error('lockAndReroll: this map was not made by the dresser (no procgen.input)');
  const pickFn = typeof keep === 'function' ? keep : (p, i) => keep.includes(i);
  const locked = (map.props || []).filter((p, i) => p.locked || pickFn(p, i)).map(p => ({ ...p, locked: true }));
  return dressRoomWith({ ...input, seed: seed ?? nextSeed(map.procgen.seed), locked }, catalogs);
}

/**
 * A sensible empty shell for a room type: size inside the type's range, an
 * L-shape now and then for big rooms, the door on a varied wall.
 */
export function suggestShell(type, seed = 1, catalogs = CATALOGS) {
  const room = catalogs.rooms.rooms[type];
  if (!room) throw new Error(`suggestShell: unknown room type ${type}`);
  const rng = makeRng(seed, 'shell', type);
  const [minW, minH] = room.size.min, [maxW, maxH] = room.size.max;
  const w = rng.int(minW, maxW), h = rng.int(minH, maxH);
  const spec = { w, h };
  const big = (w - 2) * (h - 2) >= 100;
  if (big && rng.chance(0.35)) {
    spec.shape = 'L';
    spec.cut = { corner: rng.pick(['ne', 'nw']), w: Math.max(3, Math.floor(w * rng.range(0.25, 0.4))), h: Math.max(3, Math.floor(h * rng.range(0.3, 0.45))) };
  }
  const base = room.doors || [{ side: 's' }];
  const used = new Set();
  spec.doors = base.map((d, i) => {
    if (i > 0) { const side = [d.side || 'e', 'e', 'w', 'n', 's'].find(x => !used.has(x)); used.add(side); return { ...d, side }; }
    const side = rng.chance(0.7) ? (d.side || 's') : rng.pick(['w', 'e']);
    used.add(side);
    const len = side === 'n' || side === 's' ? w : h;
    const at = rng.chance(0.5) ? undefined : rng.int(2, len - 4);
    return { ...d, side, ...(at != null ? { at } : {}) };
  });
  return spec;
}

/** Outdoor area: "Dress this area". */
export function dressArea(input, catalogs = CATALOGS) {
  return dressAreaWith(input, catalogs);
}

/** Outdoor "Reroll" / "Lock and reroll", same contract as rooms. */
export function rerollArea(map, seed, keep = null, catalogs = CATALOGS) {
  const input = map?.procgen?.input;
  if (!input) throw new Error('rerollArea: this map was not made by procgen (no procgen.input)');
  const pickFn = keep == null ? () => false : typeof keep === 'function' ? keep : (p, i) => keep.includes(i);
  const locked = (map.props || []).filter((p, i) => p.locked || pickFn(p, i)).map(p => ({ ...p, locked: true }));
  // reroll keeps the ground (terrainSeed) and changes what stands on it
  return dressAreaWith({ ...input, terrainSeed: input.terrainSeed ?? map.procgen.seed, seed: seed ?? nextSeed(map.procgen.seed), locked }, catalogs);
}

export { defaultShell };
