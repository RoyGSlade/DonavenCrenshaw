// The on-foot map format and its compiler. Every place you walk around in
// (the hangar bay, your ship, the workshop, Mel's bay, Edna's den, the givers'
// offices, the cantina, a moon outpost) is plain data in ../maps/*.js, so a new
// interior is a new data file, nothing else. Pure: no DOM.
//
// A map, in tile units (art and size come from the interiors manifest when it
// lands; until then ../assets.js draws placeholders):
//   {
//     id: 'ship', name: 'Your ship', kind: 'interior' | 'exterior',
//     tile: 48,                      // world px per tile
//     floor: 'deck',                 // floor tile id for '.', or a ground texture for exteriors
//     ambient: 'ship-hum',           // ambience id for the voice lane's audio map
//     grid: ['#######', '#.....#', ...],   // one char per tile, legend below
//     legend: { 'g': { tile: 'grate' } },  // extra or overriding legend entries
//     props: [{ art: 'console', at: [x, y], size: [w, h], rot: 0, block: true | 'low' | false,
//               layer: 'floor' (drawn first, walked over: rugs, vents), under: true (things may stand on it),
//               interact: { kind: 'console', id: 'nav', label: 'Nav console' } }],
// `size` is the footprint on the grid AFTER turning (a 2x1 desk turned a quarter is 1x2, rot PI/2);
// walking and the art both use it (the art is fitted unturned, then rotated: draw.js).
// Props cover whole tiles for procgen's validator (voyage/procgen validateMap): keep `at` and `size`
// on tile edges unless a prop really is smaller. `dress: { fresh: true }` marks a generic place that
// is dressed again on every visit (maps/index.js enterMap); `dress: { seed }` dresses once.
//     npcs: [{ id: 'chibby', at: [x, y], face: 'down', wander: 1.5 }],
//     doors: [{ id: 'ramp', at: [x, y], size: [w, h], to: 'hangar', arrive: 'ship-ramp', label: 'Down the ramp' }],
//     spawns: { default: [x, y, 'up'], 'from-hangar': [x, y, 'up'] },
//     zones: [{ id: 'range', at: [x, y], size: [w, h] }],
//   }
// block: true stops walking and shots; 'low' (crates, consoles) stops walking
// and shots too but reads as cover; false is decoration you walk over.
// Interact kinds the walk layer routes (world.js): npc, station, door, mine,
// puzzle, hack, range, repair, console, ship. Gates (doors and interacts):
// `locked` (a puzzle id), `access` (a contract access id from ROUND2-CONTRACT section 9,
// 'door.sealed', 'terminal', 'area.salvage'), `requires` (core's requirement format,
// { skills: { hacker: 2 } }), `lock: { hack: level }` (bypass it with the hack minigame) and
// `lock: { pick: level }` (pick it: needs Lockpick). See onfoot.js gate().

export const FACES = Object.freeze({ up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 });

// '#': wall, '.': floor, ' ': outside the map (solid, unlit), '=': floor grate,
// '/': hazard-striped floor, '|': window wall, ',': rug or carpet, ':': pad marking.
export const DEFAULT_LEGEND = Object.freeze({
  '#': { tile: 'wall', solid: true },
  '|': { tile: 'window', solid: true },
  ' ': { tile: 'void', solid: true },
  '.': { tile: 'floor' },
  '=': { tile: 'grate' },
  '/': { tile: 'hazard' },
  ',': { tile: 'rug' },
  ':': { tile: 'pad' },
});

export const INTERACT_KINDS = Object.freeze(['npc', 'station', 'door', 'mine', 'puzzle', 'hack', 'range', 'repair', 'console', 'ship']);
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Compiles map data to world px: solid rects, blockers, interact points, doors, spawns. Throws on bad data. */
export function compileMap(def) {
  if (!def || !ID.test(def.id || '')) throw new Error(`Map: bad id ${def?.id}`);
  const T = def.tile || 48;
  const grid = def.grid || [];
  const rows = grid.length;
  const cols = Math.max(0, ...grid.map(r => r.length));
  if (!rows || !cols) throw new Error(`Map ${def.id}: empty grid`);
  const legend = { ...DEFAULT_LEGEND, ...(def.legend || {}) };
  const cells = [];
  const solids = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    let run = -1;
    for (let x = 0; x <= cols; x++) {
      const ch = x < cols ? (grid[y][x] ?? ' ') : null;
      const cell = ch == null ? null : legend[ch];
      if (ch != null && !cell) throw new Error(`Map ${def.id}: unknown tile '${ch}' at ${x},${y}`);
      if (cell) row.push(cell.tile);
      const solid = Boolean(cell?.solid);
      if (solid && run < 0) run = x;
      if (!solid && run >= 0) { solids.push({ x: run * T, y: y * T, w: (x - run) * T, h: T, wall: true }); run = -1; }
    }
    cells.push(row);
  }
  const px = ([x, y]) => ({ x: x * T, y: y * T });
  const props = (def.props || []).map((p, i) => {
    const size = p.size || [1, 1];
    const at = px(p.at);
    const prop = { ...p, index: i, x: at.x, y: at.y, w: size[0] * T, h: size[1] * T, rot: p.rot || 0, block: p.block ?? true };
    prop.cx = prop.x + prop.w / 2; prop.cy = prop.y + prop.h / 2;
    return prop;
  });
  for (const p of props) if (p.block) solids.push({ x: p.x, y: p.y, w: p.w, h: p.h, prop: p.index, low: p.block === 'low' });
  const interacts = [];
  for (const p of props) {
    if (!p.interact) continue;
    if (!INTERACT_KINDS.includes(p.interact.kind)) throw new Error(`Map ${def.id}: prop ${p.art} has unknown interact kind ${p.interact.kind}`);
    interacts.push({ ...p.interact, station: p.station || null, x: p.cx, y: p.cy, reach: Math.max(p.w, p.h) / 2 + T * 0.75, prop: p.index });
  }
  const npcs = (def.npcs || []).map(n => {
    const at = px(n.at);
    const npc = { ...n, x: at.x + T / 2, y: at.y + T / 2, home: { x: at.x + T / 2, y: at.y + T / 2 }, angle: FACES[n.face] ?? FACES.down };
    interacts.push({ kind: 'npc', id: n.id, label: n.label || null, x: npc.x, y: npc.y, reach: T * 1.4, npc: n.id });
    return npc;
  });
  const doors = (def.doors || []).map(d => {
    const size = d.size || [1, 1];
    const at = px(d.at);
    const door = { ...d, x: at.x, y: at.y, w: size[0] * T, h: size[1] * T };
    interacts.push({ kind: 'door', id: d.id, label: d.label || 'Door', to: d.to, arrive: d.arrive || 'default', x: door.x + door.w / 2, y: door.y + door.h / 2, reach: Math.max(door.w, door.h) / 2 + T * 0.6, auto: Boolean(d.auto) });
    return door;
  });
  const spawns = {};
  for (const [name, s] of Object.entries(def.spawns || {})) spawns[name] = { x: (s[0] + 0.5) * T, y: (s[1] + 0.5) * T, angle: FACES[s[2]] ?? FACES.up };
  if (!spawns.default) throw new Error(`Map ${def.id}: needs a default spawn`);
  const zones = (def.zones || []).map(z => ({ ...z, x: z.at[0] * T, y: z.at[1] * T, w: (z.size || [1, 1])[0] * T, h: (z.size || [1, 1])[1] * T }));
  // Station talk rings (contract: tutorial:arrived { station }): every prop,
  // door or zone tagged with a hangar station id. Npc rings move with the npc (world.js).
  const rings = [];
  for (const p of props) if (p.station) rings.push({ station: p.station, x: p.cx, y: p.cy, r: Math.max(p.w, p.h) / 2 + T * 0.9 });
  for (const d of doors) if (d.station) rings.push({ station: d.station, x: d.x + d.w / 2, y: d.y + d.h / 2, r: Math.max(d.w, d.h) / 2 + T });
  for (const z of zones) if (z.station) rings.push({ station: z.station, rect: { x: z.x, y: z.y, w: z.w, h: z.h } });
  return Object.freeze({
    id: def.id, name: def.name || def.id, kind: def.kind || 'interior', tile: T, floor: def.floor || 'deck', ambient: def.ambient || null,
    cols, rows, w: cols * T, h: rows * T, cells, legend, solids, blockers: solids, props, interacts, npcs, doors, spawns, zones, rings, def,
  });
}

/** Walkable at a world point? (inside the map, not in a solid). */
export function walkable(map, x, y, r = 0) {
  if (x < r || y < r || x > map.w - r || y > map.h - r) return false;
  for (const s of map.solids) if (x + r > s.x && x - r < s.x + s.w && y + r > s.y && y - r < s.y + s.h) return false;
  return true;
}

/**
 * Checks a set of maps for broken links: every door goes to a map that exists
 * and arrives at a spawn that exists, every spawn and npc stands on walkable
 * floor. Returns a list of problems (empty = fine).
 */
export function checkMaps(defs, options = {}) {
  const problems = [];
  const compiled = {};
  for (const def of Object.values(defs)) {
    try { compiled[def.id] = compileMap(def); } catch (error) { problems.push(error.message); }
  }
  for (const map of Object.values(compiled)) {
    for (const [name, s] of Object.entries(map.spawns)) if (!walkable(map, s.x, s.y, 12)) problems.push(`${map.id}: spawn ${name} is not on open floor`);
    for (const n of map.npcs) if (!walkable(map, n.x, n.y, 10)) problems.push(`${map.id}: npc ${n.id} is not on open floor`);
    for (const p of map.props) if (p.interact?.kind === 'puzzle' && options.puzzles && !options.puzzles[p.interact.id]) problems.push(`${map.id}: puzzle ${p.interact.id} is not in puzzles.json`);
    for (const p of [...map.props, ...map.npcs, ...map.doors, ...map.zones]) if (p.station && options.stations && !options.stations.includes(p.station)) problems.push(`${map.id}: unknown station ${p.station}`);
    for (const d of map.doors) {
      const to = compiled[d.to];
      if (!to) { if (!d.external) problems.push(`${map.id}: door ${d.id} goes to missing map ${d.to}`); continue; }
      if (!to.spawns[d.arrive || 'default']) problems.push(`${map.id}: door ${d.id} arrives at missing spawn ${d.arrive} in ${d.to}`);
    }
  }
  return { problems, compiled };
}
