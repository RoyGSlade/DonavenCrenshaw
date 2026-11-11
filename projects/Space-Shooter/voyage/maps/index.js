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
import { dressRoom } from '../procgen/dress.js';
import { validateMap } from '../procgen/index.js';

export const MAP_DEFS = Object.freeze(Object.fromEntries(
  [hangar, ship, workshop, melBay, ednaDen, cantina, haskOffice, veyLounge, garrityOffice, moonOutpost].map(m => [m.id, m]),
));
export const SECTOR_MAP = sector;
export const PUZZLES = puzzles;

// Where each quest giver is met after the exploration hop (from the sector map).
export const GIVER_PLACES = Object.freeze(Object.fromEntries(sector.places.map(p => [p.giver, p.map])));

// Maps can also come from the procedural room dresser (voyage/procgen,
// `dressRoom(map, { seed, locked, art }) -> { props }`, the API in
// STUDIO-SCHEMA.md section 6). The dresser is registered here, by the on-foot
// layer itself, so any page that walks (createOnFoot) gets it.
//   - Story places (the hangar, Mel's bay, Hask's office...) are dressed ONCE and fixed:
//     hand-made props in the file, or `"dress": { "seed": 7 }` on a map with no props
//     (dressed on first entry, then kept).
//   - Generic places (the cantina, derelicts) say `"dress": { "fresh": true }`:
//     each visit (enterMap) dresses the room again with a new seed. The map's
//     file keeps walls, doors, npcs, spawns, zones and its must-have props
//     (anything with an `interact` or `station` is placed again by the dresser);
//     its hand-made props are the fallback if no seed gives a valid room.
//   - registerMap(def): add a map made at runtime (a dressed room, a Studio preview).
const runtime = new Map();
let dresser = dressRoom;
const cache = new Map();
let visits = 0;
let seedSource = () => (((Date.now() % 1000003) * 2654435761) + (++visits) * 40503) % 2147483646 + 1;

/** How many seeds a fresh dress tries before it gives up and keeps the hand-made props. */
export const FRESH_TRIES = 6;

export function registerMap(def) {
  const compiled = compileMap(def); // throws on bad data before it is kept
  runtime.set(def.id, def);
  cache.set(def.id, compiled);
  return compiled;
}
/** Swap the dresser (tests, the Studio). Pass nothing to go back to procgen's own. */
export function setRoomDresser(fn) { dresser = typeof fn === 'function' ? fn : dressRoom; cache.clear(); }
/** Where fresh dresses get their seeds (tests pass a counter; the game uses the clock). Nothing = the clock again. */
export function setVisitSeed(fn) { seedSource = typeof fn === 'function' ? fn : () => (((Date.now() % 1000003) * 2654435761) + (++visits) * 40503) % 2147483646 + 1; }
export const mapDef = id => runtime.get(id) || MAP_DEFS[id] || null;

const dressOptions = (def, seed) => ({ seed, locked: def.dress?.locked || [], art: null, ...(def.dress?.theme ? { theme: def.dress.theme } : {}), ...(def.dress?.density != null ? { density: def.dress.density } : {}) });

/**
 * Dresses a map's props with the dresser and checks the result holds procgen's
 * hard rules (validateMap). Returns the new props, or null when this seed's room is not valid.
 */
function tryDress(def, seed) {
  let props;
  try { props = dresser(def, dressOptions(def, seed))?.props; } catch { return null; }
  if (!Array.isArray(props) || !props.length) return null;
  const candidate = { ...def, props };
  try { if (!validateMap(candidate).ok) return null; compileMap(candidate); } catch { return null; }
  return props;
}

/** The compiled map for an id (compiled once). A "fresh" map answers with its last visit's dress (the hand-made props before any visit). */
export function getMap(id) {
  if (!cache.has(id)) {
    let def = mapDef(id);
    if (!def) throw new Error(`No map ${id}`);
    if (dresser && def.dress && !def.dress.fresh && !(def.props || []).length) def = { ...def, props: dresser(def, dressOptions(def, def.dress.seed ?? 1))?.props || [] };
    cache.set(id, compileMap(def));
  }
  return cache.get(id);
}

/**
 * Walk into a map: what the world calls on every entry. A normal map is its
 * compiled self. A generic map (`"dress": { "fresh": true }`) is dressed again
 * with a new seed; if a seed's room breaks a rule it tries the next one (a few
 * times), then falls back to the hand-made props. The result stays as the
 * current look of that place (getMap) until the next visit.
 */
export function enterMap(id, { seed = null } = {}) {
  const def = mapDef(id);
  if (!def) throw new Error(`No map ${id}`);
  if (!def.dress?.fresh || !dresser) return getMap(id);
  let s = Number.isInteger(seed) && seed > 0 ? seed : seedSource();
  for (let tries = 1; tries <= FRESH_TRIES; tries++) {
    const props = tryDress(def, s);
    if (props) {
      const compiled = compileMap({ ...def, props });
      const visit = Object.freeze({ ...compiled, visit: Object.freeze({ seed: s, tries, fallback: false }) });
      cache.set(id, visit);
      return visit;
    }
    s = (s % 2147483646) + 1; // the next seed
  }
  const kept = compileMap(def);
  const visit = Object.freeze({ ...kept, visit: Object.freeze({ seed: s, tries: FRESH_TRIES, fallback: true }) });
  cache.set(id, visit);
  return visit;
}
