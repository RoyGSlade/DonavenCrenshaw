// The one validator every layer shares. It reads finished MAP DATA (the onfoot
// format), not the dresser's internals, so it also checks maps a person
// hand-tweaked in the Studio. Hard rules (any failure = not shippable):
//   bounds          every prop stands on open floor, inside the walls
//   overlap         no two props share a tile (rugs and rails may sit under things)
//   door-blocked    nothing stands in a doorway or the tile just inside it
//   doors-split     every door can reach every other door
//   interact        every interact point can be reached from its use side
//   npc / spawn     every npc and spawn stands on reachable floor
//   pocket          no open floor is sealed off (strict mode; a warning otherwise)
// Grid walking is 4-way on whole tiles, so a 1-tile gap is the narrowest path.

import { buildShell } from '../layers/room/shell.js';
import { FLOOR, DOOR } from './grid.js';
import { VEC, dirIndex, sideCells, opposite } from './orient.js';

const EPS = 1e-6;
const coverRect = (p) => {
  const [ax, ay] = p.at, [sw, sh] = p.size || [1, 1];
  const x = Math.floor(ax + EPS), y = Math.floor(ay + EPS);
  return { x, y, w: Math.max(1, Math.ceil(ax + sw - EPS) - x), h: Math.max(1, Math.ceil(ay + sh - EPS) - y) };
};

/** Validates map data. Returns { ok, problems: [{ code, text }], warnings, stats }. */
export function validateMap(map, { strictPockets = true, apron = 1 } = {}) {
  const problems = [], warnings = [];
  const add = (code, text) => problems.push({ code, text });
  let shell;
  try {
    const solid = Object.entries(map.legend || {}).filter(([, v]) => v.solid).map(([k]) => k);
    const grid = solid.length ? map.grid.map(r => r.replace(new RegExp(`[${solid.map(c => c.replace(/[\]\\^-]/g, '\\$&')).join('')}]`, 'g'), '#')) : map.grid;
    shell = buildShell({ grid, doors: (map.doors || []).map(d => ({ ...d })) });
  } catch (error) {
    return { ok: false, problems: [{ code: 'shell', text: error.message }], warnings, stats: {} };
  }
  const g = shell.grid;
  const objAt = new Int16Array(g.w * g.h).fill(-1);
  const flrAt = new Int16Array(g.w * g.h).fill(-1);
  const props = map.props || [];
  props.forEach((p, i) => {
    const r = coverRect(p);
    const floor = p.layer === 'floor';
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const t = g.t(x, y);
      if (t !== FLOOR) { add('bounds', `${p.art} at ${p.at} covers ${t === DOOR ? 'a doorway' : 'a wall or the outside'} (${x},${y})`); continue; }
      const k = g.idx(x, y);
      if (floor) {
        if (flrAt[k] >= 0) add('overlap', `${p.art} overlaps ${props[flrAt[k]].art} at (${x},${y})`);
        flrAt[k] = i;
      } else {
        if (objAt[k] >= 0) add('overlap', `${p.art} overlaps ${props[objAt[k]].art} at (${x},${y})`);
        objAt[k] = i;
        if (p.block) g.block[k] = 1;
      }
    }
  });
  // floor decals that are not "under" things must not be covered
  props.forEach((p, i) => {
    if (p.layer !== 'floor' || p.under) return;
    const r = coverRect(p);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const o = g.in(x, y) ? objAt[g.idx(x, y)] : -1;
      if (o >= 0) add('overlap', `${props[o].art} hides ${p.art} at (${x},${y})`);
    }
    void i;
  });
  // doorways and the tiles just inside them stay clear
  for (const d of shell.doors) {
    const [dx, dy] = VEC[d.inward];
    for (const [x, y] of d.cells) for (let k = 0; k <= apron; k++) {
      const cx = x + dx * k, cy = y + dy * k;
      if (!g.in(cx, cy)) continue;
      const o = objAt[g.idx(cx, cy)];
      if (o >= 0 && props[o].block) add('door-blocked', `${props[o].art} blocks door ${d.id}`);
    }
  }
  // reachability from the doors (or the default spawn when a map has no doors)
  const starts = shell.doors.flatMap(d => d.cells);
  const spawnList = Object.entries(map.spawns || {});
  if (!starts.length && spawnList.length) starts.push([Math.floor(spawnList[0][1][0]), Math.floor(spawnList[0][1][1])]);
  const { seen, n } = g.flood(starts);
  const reached = (x, y) => g.in(x, y) && seen[g.idx(x, y)] === 1;
  for (const d of shell.doors) if (!d.cells.some(([x, y]) => reached(x, y))) add('doors-split', `door ${d.id} cannot be reached from the other doors`);
  props.forEach((p) => {
    if (!p.interact) return;
    const r = coverRect(p);
    const face = p.face != null ? dirIndex(p.face) : null;
    const sides = p.use === 'front' && face != null ? [face] : p.use === 'back' && face != null ? [opposite(face)] : [0, 1, 2, 3];
    const ok = sides.some(k => sideCells(r, k, 1).some(([x, y]) => reached(x, y)));
    if (!ok) add('interact', `${p.interact.label || p.interact.id} (${p.art}) cannot be reached from its ${p.use || 'any'} side`);
  });
  for (const npc of map.npcs || []) if (!reached(Math.floor(npc.at[0] + EPS), Math.floor(npc.at[1] + EPS))) add('npc', `npc ${npc.id} stands where nobody can reach`);
  for (const [name, s] of spawnList) if (!reached(Math.floor(s[0] + EPS), Math.floor(s[1] + EPS))) add('spawn', `spawn ${name} is not on reachable floor`);
  for (const z of map.zones || []) if (z.required && !reached(Math.floor(z.at[0]), Math.floor(z.at[1]))) add('zone', `zone ${z.id} cannot be reached`);
  // sealed pockets
  let walkable = 0;
  g.forEach((x, y) => { if (g.walk(x, y)) walkable++; });
  if (walkable !== n) {
    const text = `${walkable - n} open tile(s) are sealed off`;
    if (strictPockets) add('pocket', text); else warnings.push({ code: 'pocket', text });
  }
  return { ok: problems.length === 0, problems, warnings, stats: { walkable, reached: n } };
}

/**
 * Quality numbers a designer can read (and tests can bound): how full the room
 * is, how even the two halves are, the longest line of one identical prop.
 */
export function assessMap(map) {
  const props = (map.props || []).filter(p => p.layer !== 'floor');
  const rows = map.grid.length, cols = Math.max(...map.grid.map(r => r.length));
  let floor = 0, sx = 0, sy = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ch = map.grid[y][x] ?? ' ';
    if (ch !== '#' && ch !== '|' && ch !== ' ' && !(map.legend?.[ch]?.solid)) { floor++; sx += x + 0.5; sy += y + 0.5; }
  }
  const cx = sx / Math.max(1, floor), cy = sy / Math.max(1, floor);
  const half = { l: 0, r: 0, t: 0, b: 0 };
  let used = 0;
  for (const p of props) {
    const r = coverRect(p);
    const m = p.block ? 1 : 0.4;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      used += m;
      if (x + 0.5 < cx) half.l += m; else half.r += m;
      if (y + 0.5 < cy) half.t += m; else half.b += m;
    }
  }
  const ratio = (a, b) => (Math.max(a, b) === 0 ? 1 : Math.min(a, b) / Math.max(a, b));
  // longest chain of the same art touching edge to edge
  const parent = props.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const R = props.map(coverRect);
  for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) {
    if (props[i].art !== props[j].art) continue;
    const a = R[i], b = R[j];
    const xTouch = (a.x + a.w === b.x || b.x + b.w === a.x) && a.y < b.y + b.h && b.y < a.y + a.h;
    const yTouch = (a.y + a.h === b.y || b.y + b.h === a.y) && a.x < b.x + b.w && b.x < a.x + a.w;
    if (xTouch || yTouch) parent[find(i)] = find(j);
  }
  const sizes = new Map();
  for (let i = 0; i < props.length; i++) sizes.set(find(i), (sizes.get(find(i)) || 0) + 1);
  const counts = new Map();
  for (const p of props) counts.set(p.art, (counts.get(p.art) || 0) + 1);
  return {
    floor,
    props: props.length,
    fill: +(used / Math.max(1, floor)).toFixed(3),
    balanceLR: +ratio(half.l, half.r).toFixed(3),
    balanceTB: +ratio(half.t, half.b).toFixed(3),
    maxIdenticalRun: Math.max(0, ...sizes.values()),
    distinctArt: counts.size,
    mostRepeated: Math.max(0, ...counts.values()),
  };
}
