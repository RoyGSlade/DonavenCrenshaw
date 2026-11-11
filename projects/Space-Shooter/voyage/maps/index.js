// Every walkable place, the sector map and the puzzles, as plain data
// (Stardust Studio edits these files; schema: lhc-lanes/stardust/STUDIO-SCHEMA.md,
// "Proposed by onfoot"). A new map = a new JSON file plus one line here.
import hangar from './hangar.json' with { type: 'json' };
import ship from './ship.json' with { type: 'json' };
import workshop from './workshop.json' with { type: 'json' };
import melBay from './mel-bay.json' with { type: 'json' };
import ednaDen from './edna-den.json' with { type: 'json' };
import cantina from './cantina.json' with { type: 'json' };
import haskOffice from './hask-office.json' with { type: 'json' };
import veyLounge from './vey-lounge.json' with { type: 'json' };
import garrityOffice from './garrity-office.json' with { type: 'json' };
import moonOutpost from './moon-outpost.json' with { type: 'json' };
import sector from './sector.json' with { type: 'json' };
import puzzles from './puzzles.json' with { type: 'json' };
import { compileMap } from '../onfoot/rules/mapdata.js';

export const MAP_DEFS = Object.freeze(Object.fromEntries(
  [hangar, ship, workshop, melBay, ednaDen, cantina, haskOffice, veyLounge, garrityOffice, moonOutpost].map(m => [m.id, m]),
));
export const SECTOR_MAP = sector;
export const PUZZLES = puzzles;

// Where each quest giver is met after the exploration hop (from the sector map).
export const GIVER_PLACES = Object.freeze(Object.fromEntries(sector.places.map(p => [p.giver, p.map])));

// Maps can also come from the procedural room dresser (voyage/procgen,
// `dressRoom(shell, seed)`), which outputs this same format:
//   - registerMap(def): add a map made at runtime (a dressed room, a Studio preview);
//   - setRoomDresser(dressRoom): a hand-made map with `"dress": { "seed": 7 }` and
//     no props is dressed when first entered: dressRoom(map, { seed }) -> { props }
//     (the API in STUDIO-SCHEMA.md section 6).
const runtime = new Map();
let dresser = null;
const cache = new Map();

export function registerMap(def) {
  const compiled = compileMap(def); // throws on bad data before it is kept
  runtime.set(def.id, def);
  cache.set(def.id, compiled);
  return compiled;
}
export function setRoomDresser(fn) { dresser = typeof fn === 'function' ? fn : null; cache.clear(); }
export const mapDef = id => runtime.get(id) || MAP_DEFS[id] || null;

/** The compiled map for an id (compiled once). */
export function getMap(id) {
  if (!cache.has(id)) {
    let def = mapDef(id);
    if (!def) throw new Error(`No map ${id}`);
    if (dresser && def.dress && !(def.props || []).length) def = { ...def, props: dresser(def, { seed: def.dress.seed ?? 1, locked: [], art: null })?.props || [] };
    cache.set(id, compileMap(def));
  }
  return cache.get(id);
}
