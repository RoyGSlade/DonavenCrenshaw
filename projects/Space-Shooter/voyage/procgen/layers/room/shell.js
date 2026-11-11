// Room shells: the layer between a building and the dresser. A shell is the
// room's outline (walls, windows, doorways) on a grid, with nothing in it.
//
// Two ways in:
//   1. Described: { w, h, shape: 'rect' | 'L', cut: { corner: 'ne', w, h },
//                   doors: [{ id, side: 's', at, width, to, arrive, label }],
//                   windows: [{ side: 'n', at, len }] }
//      w and h are OUTER sizes in tiles, walls included (walls are 1 tile).
//      A door's `at` is the grid x (north/south walls) or y (east/west walls)
//      of its first cell; leave it out to centre the door on that wall.
//   2. Drawn: { grid: ['#####', '#...#', ...], doors: [{ id, at: [x, y], size: [w, h], ... }] }
//      the onfoot map format (STUDIO-SCHEMA.md, "Proposed by onfoot"), so an
//      existing map can be re-dressed. Its props are ignored.
// Later, the building layer (ROADMAP.md) produces described shells from plots.

import { Grid, OUT, WALL, WINDOW, FLOOR, DOOR } from '../../core/grid.js';
import { VEC } from '../../core/orient.js';

const SIDE_IN = { n: 0, s: 2, w: 3, e: 1 }; // a door on the north wall leads in downward
const sideOfInward = (k) => ({ 0: 'n', 2: 's', 3: 'w', 1: 'e' })[k];

export const APRON_DEPTH = 2;

/** Builds a shell grid plus its doorways. Throws on impossible input. */
export function buildShell(spec) {
  const shell = spec.grid ? fromGrid(spec) : fromSize(spec);
  const doorSpecs = spec.doors && spec.doors.length ? spec.doors : spec.grid ? [] : [{ id: 'door', side: 's' }];
  shell.doors = doorSpecs.map((d, i) => placeDoor(shell.grid, d, i));
  for (const w of spec.windows || []) placeWindow(shell.grid, w);
  return shell;
}

function fromSize(spec) {
  const w = Math.round(spec.w ?? 12), h = Math.round(spec.h ?? 9);
  if (w < 5 || h < 5) throw new Error(`Shell: room ${w}x${h} is too small (min 5x5 outer)`);
  if (w > 64 || h > 64) throw new Error(`Shell: room ${w}x${h} is too big (max 64x64)`);
  const g = new Grid(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) g.type[g.idx(x, y)] = FLOOR;
  if (spec.shape === 'L' && spec.cut) {
    const { corner = 'ne' } = spec.cut;
    const cw = Math.min(spec.cut.w, w - 4), ch = Math.min(spec.cut.h, h - 4);
    if (cw >= 2 && ch >= 2) {
      const x0 = corner.includes('w') ? 0 : w - cw, y0 = corner.includes('n') ? 0 : h - ch;
      for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) g.type[g.idx(x, y)] = OUT;
    }
  }
  wallUp(g);
  return { grid: g, w, h, shape: spec.shape === 'L' ? 'L' : 'rect' };
}

/** Any non-floor cell touching floor (8-way) becomes wall. */
function wallUp(g) {
  const isF = (x, y) => g.t(x, y) === FLOOR;
  g.forEach((x, y, i) => {
    if (g.type[i] === FLOOR) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isF(x + dx, y + dy)) { g.type[i] = WALL; return; }
  });
}

const MARKS = new Set(['=', '/', ',', ':']);
function fromGrid(spec) {
  const rows = spec.grid;
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const g = new Grid(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] ?? ' ';
    const i = g.idx(x, y);
    if (ch === '#' || ch === 'R') g.type[i] = WALL;
    else if (ch === '|') g.type[i] = WINDOW;
    else if (ch === ' ') g.type[i] = OUT;
    else { g.type[i] = FLOOR; if (MARKS.has(ch)) g.mark[i] = ch; }
  }
  return { grid: g, w, h, shape: 'grid' };
}

/** Wall runs on a side: wall cells with floor inward and no floor outward. */
function wallRuns(g, side) {
  const k = SIDE_IN[side];
  const [dx, dy] = VEC[k];
  const along = (side === 'n' || side === 's');
  const runs = [];
  let run = null;
  const outer = along ? g.h : g.w, inner = along ? g.w : g.h;
  // scan every line parallel to that wall; keep the outermost qualifying cells
  const best = new Map();
  for (let a = 0; a < outer; a++) for (let b = 0; b < inner; b++) {
    const x = along ? b : a, y = along ? a : b;
    if (g.t(x, y) !== WALL) continue;
    if (g.t(x + dx, y + dy) !== FLOOR || g.t(x + 2 * dx, y + 2 * dy) !== FLOOR) continue;
    if (g.t(x - dx, y - dy) === FLOOR) continue;
    const key = b;
    const prev = best.get(key);
    // north/west walls: smallest coordinate is outermost; south/east: largest
    const coord = a;
    const outermost = (side === 'n' || side === 'w') ? (prev == null || coord < prev) : (prev == null || coord > prev);
    if (outermost) best.set(key, coord);
  }
  const keys = [...best.keys()].sort((p, q) => p - q);
  for (const b of keys) {
    const a = best.get(b);
    if (run && b === run.end + 1 && a === run.line) run.end = b;
    else { run = { line: a, start: b, end: b }; runs.push(run); }
  }
  return runs.map(r => ({ ...r, len: r.end - r.start + 1, along }));
}

function placeDoor(g, d, i) {
  d = { ...d };
  const id = d.id || `door${i ? i + 1 : ''}`;
  let cells, inward;
  if (Array.isArray(d.at)) {
    const [ax, ay] = d.at.map(Math.round);
    const [sw, sh] = (d.size || [2, 1]).map(v => Math.max(1, Math.round(v)));
    cells = [];
    for (let y = ay; y < ay + sh; y++) for (let x = ax; x < ax + sw; x++) cells.push([x, y]);
    // inward = the direction from the door to open floor (the far side is not floor)
    const own = new Set(cells.map(([x, y]) => `${x},${y}`));
    const floorAt = (x, y) => !own.has(`${x},${y}`) && g.t(x, y) === FLOOR;
    const ok = (k) => cells.every(([x, y]) => own.has(`${x + VEC[k][0]},${y + VEC[k][1]}`) || floorAt(x + VEC[k][0], y + VEC[k][1]))
      && cells.some(([x, y]) => floorAt(x + VEC[k][0], y + VEC[k][1]))
      && !cells.some(([x, y]) => floorAt(x - VEC[k][0], y - VEC[k][1]));
    inward = [0, 1, 2, 3].find(ok);
    if (inward == null) inward = [0, 1, 2, 3].find(k => cells.some(([x, y]) => floorAt(x + VEC[k][0], y + VEC[k][1]))) ?? 2;
  } else {
    const asked = (d.side || 's')[0];
    if (!(asked in SIDE_IN)) throw new Error(`Shell: door ${id} has bad side ${d.side}`);
    const width = Math.max(1, Math.round(d.width ?? 2));
    // keep a wall tile each side of the frame; if that wall is full, the next wall round takes it
    const order = [asked, ...['s', 'e', 'n', 'w'].filter(x => x !== asked)];
    let side = null, runs = [];
    for (const sd of order) { runs = wallRuns(g, sd).filter(r => r.len >= width + 2); if (runs.length) { side = sd; break; } }
    if (!side) throw new Error(`Shell: no wall has room for door ${id}`);
    if (side !== asked) d = { ...d, at: undefined };
    inward = SIDE_IN[side];
    let run, start;
    if (d.at != null) {
      run = runs.find(r => d.at >= r.start + 1 && d.at + width - 1 <= r.end - 1) || runs[0];
      start = Math.min(Math.max(Math.round(d.at), run.start + 1), run.end - width);
    } else {
      run = runs.reduce((a, b) => (b.len > a.len ? b : a));
      start = run.start + Math.floor((run.len - width) / 2);
    }
    cells = [];
    for (let b = start; b < start + width; b++) cells.push(run.along ? [b, run.line] : [run.line, b]);
  }
  for (const [x, y] of cells) if (g.in(x, y)) g.type[g.idx(x, y)] = DOOR;
  const [dx, dy] = VEC[inward];
  const apron = [];
  for (let k = 1; k <= APRON_DEPTH; k++) for (const [x, y] of cells) if (g.t(x + dx * k, y + dy * k) === FLOOR) apron.push([x + dx * k, y + dy * k]);
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const at = [Math.min(...xs), Math.min(...ys)];
  const size = [Math.max(...xs) - at[0] + 1, Math.max(...ys) - at[1] + 1];
  return {
    id, cells, inward, side: sideOfInward(inward), apron, at, size,
    to: d.to ?? null, arrive: d.arrive ?? null, label: d.label ?? null, locked: d.locked ?? null, station: d.station ?? null,
  };
}

function placeWindow(g, wdef) {
  const side = (wdef.side || 'n')[0];
  const runs = wallRuns(g, side);
  if (!runs.length) return;
  const run = runs.reduce((a, b) => (b.len > a.len ? b : a));
  const len = Math.max(1, Math.min(wdef.len ?? 2, run.len - 2));
  const start = wdef.at != null ? Math.max(run.start + 1, Math.min(wdef.at, run.end - len)) : run.start + Math.floor((run.len - len) / 2);
  for (let b = start; b < start + len; b++) {
    const [x, y] = run.along ? [b, run.line] : [run.line, b];
    if (g.t(x, y) === WALL) g.type[g.idx(x, y)] = WINDOW;
  }
}


