// The dresser in the shape the Studio and onfoot call (STUDIO-SCHEMA.md section 6):
//   dressRoom(map, { seed, locked = [], art = null }) -> { props, notes }
// `map` is a walkable map exactly as its JSON file. Only `props` comes back:
// walls, doors, npcs, spawns and zones are never changed. Pure (no DOM, no
// clock, no Math.random): same map + options = same props.
//
// What it keeps, so a dress never breaks the game:
//   - locked props (indices into map.props) come back exactly as they were;
//   - a prop with an interaction or a station is a must-have: the same art and
//     the same interaction/station are placed again by the room's rules (or
//     kept where it is when the catalog cannot move it);
//   - a prop a door stands on (the hangar ramp over the ship) stays put;
//   - npcs and spawns stay reachable and clear; zones (a firing range) stay empty.
// A map with `rooms: [{ room, at, size }]` (the ship) is dressed room by room,
// each with its own type; the gaps between them act as doorways.
// The room type comes from map.dress.type, map.procgen.type, the map id
// (rooms.json mapTypes) in that order.

import { dressRoom as dressFull, CATALOGS } from './index.js';

const MAX_PROPS = 300;
const KEEP_KEYS = ['art', 'at', 'size', 'rot', 'block', 'layer', 'under', 'face', 'use', 'interact', 'station', 'rule', 'role', 'sat'];

export function dressRoom(map, { seed = 1, locked = [], art = null, theme, density } = {}) {
  if (!map || !Array.isArray(map.grid)) throw new Error('dressRoom: needs a walkable map (with a grid)');
  const catalog = CATALOGS.props.props;
  const original = map.props || [];
  const lockedSet = new Set(locked.filter(i => Number.isInteger(i) && i >= 0 && i < original.length));
  const notes = [];
  const kept = new Set(lockedSet);
  const musts = [];
  original.forEach((p, i) => {
    if (kept.has(i)) return;
    if ((map.doors || []).some(d => overlaps(rectOfProp(p), { x: d.at[0], y: d.at[1], w: (d.size || [1, 1])[0], h: (d.size || [1, 1])[1] }))) {
      kept.add(i); notes.push(`Kept ${p.art} where it is: a door stands on it.`); return;
    }
    if (p.interact || p.station) {
      if (catalog[p.art]) musts.push({ index: i, id: `keep-${i}`, prop: p.art, interact: p.interact || null, station: p.station || null });
      else { kept.add(i); notes.push(`Kept ${p.art} where it is (it carries ${p.interact ? `"${p.interact.label || p.interact.id}"` : `station ${p.station}`} and has no catalog art).`); }
    }
  });
  const regions = map.rooms?.length
    ? map.rooms.map(r => ({ type: r.room, rect: { x: r.at[0], y: r.at[1], w: r.size[0], h: r.size[1] } }))
    : [{ type: typeFor(map), rect: null }];
  const fresh = [];
  regions.forEach((region, ri) => {
    const type = CATALOGS.rooms.rooms[region.type] ? region.type : typeFor(map);
    const sub = region.rect ? subShell(map, region.rect) : { grid: map.grid, doors: (map.doors || []).map(d => ({ ...d })), offset: [0, 0] };
    const [ox, oy] = sub.offset;
    const inside = (x, y) => !region.rect || (x >= region.rect.x && x < region.rect.x + region.rect.w && y >= region.rect.y && y < region.rect.y + region.rect.h);
    const centreIn = (p) => { const r = rectOfProp(p); return inside(r.x + r.w / 2 - 0.01, r.y + r.h / 2 - 0.01); };
    const shift = (p) => ({ ...p, at: [p.at[0] - ox, p.at[1] - oy] });
    const lockedHere = [...kept].filter(i => centreIn(original[i])).map(i => ({ ...shift(original[i]), lockIndex: i }));
    const mustHere = musts.filter(m => centreIn(original[m.index])).map(({ index, ...m }) => { void index; return m; });
    const reach = [
      ...(map.npcs || []).filter(n => inside(n.at[0], n.at[1])).map(n => [n.at[0] - ox, n.at[1] - oy]),
      ...Object.values(map.spawns || {}).filter(s => inside(s[0], s[1])).map(s => [s[0] - ox, s[1] - oy]),
    ];
    const keep = (map.zones || []).filter(z => inside(z.at[0], z.at[1])).map(z => ({ at: [z.at[0] - ox, z.at[1] - oy], size: z.size || [1, 1] }));
    void lockedHere;
    const input = { type, seed: regions.length > 1 ? `${seed}:${ri}` : seed, theme, density, shell: { grid: sub.grid, doors: sub.doors }, reach, keep, art };
    // a must-have that will not fit stays where it was; the rest are still re-placed
    let result = null;
    let mustLeft = mustHere.slice();
    for (let tries = 0; tries <= mustHere.length && !result; tries++) {
      try {
        result = dressFull({ ...input, must: mustLeft, locked: [...kept].filter(i => centreIn(original[i])).map(i => ({ ...shift(original[i]), lockIndex: i })) });
      } catch (error) {
        const m = /must-have (keep-\d+)/.exec(error.message);
        if (!m) throw error;
        const idx = Number(m[1].slice(5));
        kept.add(idx);
        mustLeft = mustLeft.filter(x => x.id !== m[1]);
        notes.push(`${CATALOGS.rooms.rooms[type].name}: no good spot for ${original[idx].art} (${original[idx].interact?.label || original[idx].station}); kept it where it was.`);
      }
    }
    if (!result) return;
    const lockedCount = [...kept].filter(i => centreIn(original[i])).length;
    const added = result.props.filter(p => !p.locked);
    for (const p of added) fresh.push(lean(p, ox, oy));
    const problems = result.procgen.problems.length;
    notes.push(`${CATALOGS.rooms.rooms[type].name}${regions.length > 1 ? ` (${region.type})` : ''}: ${added.length} props${lockedCount ? `, ${lockedCount} kept` : ''}${problems ? `, ${problems} problem(s)` : ''}.`);
  });
  const props = [...[...kept].sort((a, b) => a - b).map(i => original[i]), ...fresh];
  if (props.length > MAX_PROPS) notes.push(`Trimmed to ${MAX_PROPS} props.`);
  return { props: props.slice(0, MAX_PROPS), notes };
}

function typeFor(map) {
  const t = map.dress?.type || map.procgen?.type || CATALOGS.rooms.mapTypes?.[map.id];
  if (t && CATALOGS.rooms.rooms[t]) return t;
  return map.kind === 'exterior' ? 'hangar-bay' : 'workshop';
}

function lean(p, ox, oy) {
  const out = {};
  for (const k of KEEP_KEYS) if (p[k] !== undefined && p[k] !== null && !(k === 'sat' && !p[k])) out[k] = p[k];
  out.at = [p.at[0] + ox, p.at[1] + oy];
  return out;
}

function rectOfProp(p) { const [w, h] = p.size || [1, 1]; return { x: p.at[0], y: p.at[1], w, h }; }
function overlaps(a, b) { return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6; }

/**
 * One room of a multi-room map as its own shell: the room's rect plus a
 * 1-tile border. Open floor in the border that touches the room becomes a
 * doorway (the gap to the next room); everything else in the border is wall.
 */
export function subShell(map, rect) {
  const H = map.grid.length, W = Math.max(...map.grid.map(r => r.length));
  const solid = new Set(['#', '|', ' ', 'R', ...Object.entries(map.legend || {}).filter(([, v]) => v.solid).map(([k]) => k)]);
  const ch = (x, y) => (y >= 0 && y < H && x >= 0 && x < W ? (map.grid[y][x] ?? ' ') : ' ');
  const isIn = (x, y) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  const X0 = rect.x - 1, Y0 = rect.y - 1, X1 = rect.x + rect.w + 1, Y1 = rect.y + rect.h + 1;
  const links = [];
  const rows = [];
  for (let y = Y0; y < Y1; y++) {
    let row = '';
    for (let x = X0; x < X1; x++) {
      const c = ch(x, y);
      if (isIn(x, y)) { row += solid.has(c) ? (c === '|' ? '|' : c === ' ' ? ' ' : '#') : c; continue; }
      const floor = !solid.has(c);
      const touches = floor && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isIn(x + dx, y + dy) && !solid.has(ch(x + dx, y + dy)));
      if (touches) { links.push([x - X0, y - Y0]); row += '.'; } else row += c === ' ' ? ' ' : '#';
    }
    rows.push(row);
  }
  // runs of link cells become doorways
  const doors = [];
  const seen = new Set();
  for (const [x, y] of links) {
    if (seen.has(`${x},${y}`)) continue;
    let w = 1, h = 1;
    while (links.some(([a, b]) => a === x + w && b === y)) w++;
    if (w === 1) while (links.some(([a, b]) => a === x && b === y + h)) h++;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) seen.add(`${x + i},${y + j}`);
    doors.push({ id: `link-${doors.length + 1}`, at: [x, y], size: [w, h], external: true });
  }
  for (const d of map.doors || []) {
    const [dx, dy] = d.at;
    if (dx >= X0 && dy >= Y0 && dx < X1 && dy < Y1) doors.push({ ...d, at: [dx - X0, dy - Y0] });
  }
  return { grid: rows, doors, offset: [X0, Y0] };
}
