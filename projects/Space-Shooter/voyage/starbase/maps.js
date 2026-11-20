// The star base's four places, as plain map data built from a base block (starbase/base.js). They are NOT in maps/index.js's
// MAP_DEFS: the page registers them at run time, once the base is yours (registerStarbase), through the same registerMap the
// Studio and the workbench room use. Pure builders (no DOM); the same base block always builds the same maps.
//
//   airlock    your berth and the airlock (the ship's ramp opens here)
//   concourse  the dock strip: four units in two rows of two, in the slots your base block names; doors to your rooms
//   workshop   your own room: the workbench
//   galley     your own room: a stand-in for cooking
//
// "Your rooms" go through the room dresser (procgen), seeded from the base seed, with their must-have props kept; if a seed's room
// breaks a procgen rule the hand-made props stay. Everything uses props that already exist: no new art.
import { BASE_MAPS, UNITS, unitsOf } from './base.js';
import { dressRoom } from '../procgen/dress.js';
import { validateMap } from '../procgen/index.js';
import { compileMap } from '../onfoot/rules/mapdata.js';

// Four unit bays in two rows of two (a narrow, tall concourse: it fits a phone's width whole). A bay is [x, yBack]: its back wall
// props stand at yBack, its walk-up counter one row below, and you use it from the aisle south of it.
export const SLOT_POS = Object.freeze([[1, 1], [4, 1], [1, 5], [4, 5]].map((p) => Object.freeze(p)));
const W = 8, H = 13;

const solidRow = (w) => '#'.repeat(w);
/** A rectangular room: walls round it, gaps cut in the named sides. gaps: [{ side: 'n'|'s'|'e'|'w', at, size }]. */
function box(w, h, gaps = []) {
  const rows = Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? solidRow(w) : `#${'.'.repeat(w - 2)}#`)).map((r) => r.split(''));
  for (const g of gaps) for (let i = 0; i < g.size; i++) {
    if (g.side === 'n') rows[0][g.at + i] = '.';
    if (g.side === 's') rows[h - 1][g.at + i] = '.';
    if (g.side === 'w') rows[g.at + i][0] = '.';
    if (g.side === 'e') rows[g.at + i][w - 1] = '.';
  }
  return rows.map((r) => r.join(''));
}

// --- airlock --------------------------------------------------------------------------------------------------------
function airlock() {
  return {
    id: BASE_MAPS.airlock, name: 'Your star base: berth and airlock', kind: 'interior', tile: 48, floor: 'deck', ambient: 'ship-hum',
    grid: box(12, 9, [{ side: 's', at: 5, size: 2 }, { side: 'e', at: 3, size: 2 }]),
    look: {
      set: 'freighter', accents: { berth: '#ffc93a', cool: '#81e6df' }, doorColors: { in: 'cool', out: 'berth' },
      decals: [
        { kind: 'hazard', at: [4, 7.6], size: [4, 0.28] },
        { kind: 'text', at: [5.5, 5.8], text: 'BERTH 1', size: 0.34, color: 'berth', alpha: 0.55 },
        { kind: 'text', at: [6, 1.4], text: 'YOUR STAR BASE', size: 0.3, color: 'cool', alpha: 0.5 },
        { art: 'station-mat-cyan', alpha: 0.5, at: [10.2, 2.6], size: [1, 2.7] },
      ],
      lights: [{ kind: 'lamp', at: [5.5, 4], r: 3.6, color: 'berth', strength: 0.26 }, { kind: 'lamp', at: [10, 3.5], r: 2.6, color: 'cool', strength: 0.26 }],
    },
    props: [
      { art: 'locker', at: [1, 1], size: [1, 1], block: true }, { art: 'locker', at: [2, 1], size: [1, 1], block: true },
      { art: 'crate-large', at: [8, 1], size: [2, 1], block: 'low' }, { art: 'fuel-barrel', at: [1, 6], size: [1, 1], block: 'low' },
      { art: 'fuel-barrel', at: [1, 7], size: [1, 1], block: 'low' }, { art: 'potted-plant', at: [10, 6], size: [1, 1], block: true },
    ],
    npcs: [],
    doors: [
      { id: 'out', at: [5, 8], size: [2, 1], to: 'ship', arrive: 'from-dock', label: 'Back aboard your ship' },
      { id: 'in', at: [11, 3], size: [1, 2], to: BASE_MAPS.concourse, arrive: 'from-airlock', label: 'In to the concourse' },
    ],
    spawns: { default: [5.5, 4.5, 'up'], 'from-dock': [5.5, 6.5, 'up'], 'from-concourse': [9.5, 3.5, 'left'] },
    roomBox: [0, 0, 12, 9],
  };
}

// --- concourse ------------------------------------------------------------------------------------------------------
/** The props of one unit standing in its bay: the walk-up counter carries the interact; the rest is set dressing. */
function unitProps(unit) {
  const [x, y] = SLOT_POS[unit.slot], c = y + 1; // c: the counter row
  const use = (label) => ({ kind: 'station', id: `sb-${unit.id}`, label });
  const st = (extra = {}) => ({ station: `sb-${unit.id}`, ...extra });
  switch (unit.id) {
    case 'bay': return [
      { art: 'tool-rack', at: [x, y], size: [2, 1], block: true }, { art: 'welding-cart', at: [x + 2, y], size: [1, 1], block: 'low' },
      { art: 'engineering-console', at: [x, c], size: [2, 1], block: 'low', ...st({ interact: use('Fuel and repair bay: pump, repair console') }) },
      { art: 'fuel-barrel', at: [x + 2, c], size: [1, 1], block: 'low' },
    ];
    case 'noodles': return [
      { art: 'galley-unit', at: [x, y], size: [2, 1], block: true }, { art: 'potted-plant', at: [x + 2, y], size: [1, 1], block: true },
      { art: 'bar-counter', at: [x, c], size: [2, 1], block: 'low', ...st({ interact: use('Noodle stall: a hot bowl') }) },
      { art: 'bar-stool', at: [x + 2, c], size: [1, 1], block: false },
    ];
    case 'store': return [
      { art: 'parts-shelf', at: [x, y], size: [2, 1], block: true }, { art: 'locker', at: [x + 2, y], size: [1, 1], block: true },
      { art: 'shop-counter', at: [x, c], size: [3, 1], block: 'low', ...st({ interact: use('General store') }) },
    ];
    case 'board': return [
      { art: 'job-board', at: [x, y], size: [3, 1], block: true, ...st({ interact: use('Job board') }) },
      { art: 'potted-plant', at: [x, c], size: [1, 1], block: true }, { art: 'crate-small', at: [x + 2, c], size: [1, 1], block: 'low' },
    ];
    default: return [];
  }
}

function concourse(base) {
  const units = unitsOf(base);
  const props = units.flatMap(unitProps);
  // The plaza south of the units: a table to sit at, stools and plants, so it is not an empty corridor.
  props.push({ art: 'crew-table', at: [2, 8], size: [3, 2], block: 'low' }, { art: 'bar-stool', at: [5, 8], size: [1, 1], block: false },
    { art: 'potted-plant', at: [6, 8], size: [1, 1], block: true }, { art: 'potted-plant', at: [1, 11], size: [1, 1], block: true }, { art: 'vending-machine', at: [6, 11], size: [1, 1], block: true });
  const signs = units.map((u) => { const [x, y] = SLOT_POS[u.slot]; return { kind: 'text', at: [x + 1.5, y - 0.28], text: u.short, size: 0.26, color: 'unit', alpha: 0.8 }; });
  return {
    id: BASE_MAPS.concourse, name: 'Your star base: the concourse', kind: 'interior', tile: 48, room: 'fitting-bay', floor: 'deck-warm', ambient: 'cantina',
    grid: box(W, H, [{ side: 'w', at: 3, size: 2 }, { side: 'w', at: 9, size: 2 }, { side: 'e', at: 9, size: 2 }]),
    look: {
      set: 'hangar', accents: { unit: '#7fe8cf', workshop: '#ffb054', galley: '#ff9a4a', airlock: '#9bff5a' }, doorColors: { airlock: 'airlock', workshop: 'workshop', galley: 'galley' },
      decals: [...signs, { kind: 'text', at: [1.1, 9.35], text: 'WORKSHOP', size: 0.2, color: 'workshop', alpha: 0.6 }, { kind: 'text', at: [6.9, 9.35], text: 'GALLEY', size: 0.2, color: 'galley', alpha: 0.6 }, { kind: 'text', at: [1.2, 2.9], text: 'AIRLOCK', size: 0.2, color: 'airlock', alpha: 0.6 }],
      lights: units.map((u) => { const [x, y] = SLOT_POS[u.slot]; return { kind: 'lamp', at: [x + 1.5, y + 1.6], r: 2.6, color: 'unit', strength: 0.3 }; }),
    },
    props, npcs: [],
    doors: [
      { id: 'airlock', at: [0, 3], size: [1, 2], to: BASE_MAPS.airlock, arrive: 'from-concourse', label: 'Back to the airlock' },
      { id: 'workshop', at: [0, 9], size: [1, 2], to: BASE_MAPS.workshop, arrive: 'from-concourse', label: 'Your workshop' },
      { id: 'galley', at: [7, 9], size: [1, 2], to: BASE_MAPS.galley, arrive: 'from-concourse', label: 'Your galley' },
    ],
    spawns: { default: [3.5, 3.5, 'down'], 'from-airlock': [1.5, 3.5, 'right'], 'from-workshop': [1.5, 9.5, 'right'], 'from-galley': [6.5, 9.5, 'left'] },
    roomBox: [0, 0, W, H],
  };
}

// --- your rooms -----------------------------------------------------------------------------------------------------
function workshop() {
  return {
    id: BASE_MAPS.workshop, name: 'Your star base: workshop', kind: 'interior', tile: 48, room: 'workshop', floor: 'deck', ambient: 'workshop',
    dress: { type: 'workshop' },
    grid: box(14, 10, [{ side: 'n', at: 6, size: 2 }]),
    props: [
      { art: 'workbench', at: [1, 8], size: [2, 1], block: 'low', station: 'sb-workbench', interact: { kind: 'station', id: 'sb-workbench', label: 'Workbench: cut, screw, bolt, craft' } },
      { art: 'tool-rack', at: [3, 8], size: [2, 1], block: true }, { art: 'welding-cart', at: [5, 8], size: [1, 1], block: 'low' },
      { art: 'parts-shelf', at: [8, 8], size: [2, 1], block: true }, { art: 'parts-shelf', at: [10, 8], size: [2, 1], block: true },
      { art: 'toolbox-chest', at: [12, 8], size: [1, 1], block: 'low' }, { art: 'crate-large', at: [1, 3], size: [2, 1], block: 'low' },
      { art: 'oil-drum', at: [12, 3], size: [1, 1], block: 'low' },
    ],
    npcs: [],
    doors: [{ id: 'out', at: [6, 0], size: [2, 1], to: BASE_MAPS.concourse, arrive: 'from-workshop', label: 'Out to the concourse' }],
    spawns: { default: [6.5, 3, 'down'], 'from-concourse': [6.5, 1.5, 'down'] },
    roomBox: [0, 0, 14, 10],
  };
}

function galley() {
  return {
    id: BASE_MAPS.galley, name: 'Your star base: galley', kind: 'interior', tile: 48, room: 'crew-deck', floor: 'deck-warm', ambient: 'cantina',
    dress: { type: 'crew-deck' },
    grid: box(12, 9, [{ side: 'n', at: 5, size: 2 }]),
    props: [
      { art: 'galley-unit', at: [1, 7], size: [2, 1], block: true, station: 'sb-galley', interact: { kind: 'station', id: 'sb-galley', label: 'Galley: heat a meal' } },
      { art: 'crew-table', at: [5, 4], size: [3, 2], block: 'low' }, { art: 'bar-stool', at: [4, 4], size: [1, 1], block: false }, { art: 'bar-stool', at: [8, 5], size: [1, 1], block: false },
      { art: 'locker', at: [10, 7], size: [1, 1], block: true }, { art: 'potted-plant', at: [10, 2], size: [1, 1], block: true }, { art: 'vending-machine', at: [3, 7], size: [1, 1], block: true },
    ],
    npcs: [],
    doors: [{ id: 'out', at: [5, 0], size: [2, 1], to: BASE_MAPS.concourse, arrive: 'from-galley', label: 'Out to the concourse' }],
    spawns: { default: [5.5, 3, 'down'], 'from-concourse': [5.5, 1.5, 'down'] },
    roomBox: [0, 0, 12, 9],
  };
}

/** Run a room through the dresser with the base seed; the hand-made props stay when the seed's room breaks a rule. */
export function dressed(def, seed) {
  if (!def.dress) return def;
  try {
    const props = dressRoom(def, { seed, locked: [], art: null })?.props;
    if (Array.isArray(props) && props.length) {
      const candidate = { ...def, props };
      if (validateMap(candidate).ok) { compileMap(candidate); return candidate; }
    }
  } catch { /* the hand-made props stay */ }
  return def;
}

/** The four map defs for a base block, in order: airlock, concourse, workshop, galley. */
export function buildMaps(base) {
  const seed = base.seed >>> 0;
  return [airlock(), concourse(base), dressed(workshop(), seed), dressed(galley(), seed + 1)];
}

/** The unit's own name for the prompt marks and panels. */
export const unitName = (id) => UNITS[id]?.name || id;
