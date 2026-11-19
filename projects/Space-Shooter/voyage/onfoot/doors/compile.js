// Compiles a map definition's wall doors and entries (pure). A map def may carry:
//   wallDoors: [{ id, at: [col,row], size: [w,h], style: 'slide' | 'swing', label?, color?, lock?, locked?, access?, far? }]
//   entries:   [{ id, room: <wallDoor id>, far: <wallDoor id>, zone: { at, size }, spawn: <spawn in this vestibule>,
//                 to: <map id>, arrive: <spawn in the other map's vestibule>, color? }]
//   entries may instead name an existing link door: { id?, door: <id in def.doors>, depth?: 2|3, spawn, color? }. The link door
//   becomes the room door (its label, lock and states keep working through def.doors), the far door and the vestibule zone are
//   worked out from where it sits on the room's edge (def.roomBox, tiles [x0, y0, x1, y1]; default: the whole grid), and the
//   spawn is the vestibule spawn named by the other map's door `arrive`. to/arrive come from the door.
// The gap (door rect) is made of floor cells in the wall; the wall cells at both ends along the slide are the pockets.
import { DEFAULT_LEGEND } from '../rules/mapdata.js';

export const DOOR_STYLES = Object.freeze(['slide', 'swing']);
/** Erik, 2026-11-18: sliding everywhere; the swing code stays but is never a default. */
export const DEFAULT_STYLE = 'slide';
export const DEPTH = 3;
const OUT = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

/** Which edge of the room a link door sits on, from def.roomBox (or the grid): 'n' | 's' | 'w' | 'e' | null. */
export function sideOf(def, door) {
  const box = def.roomBox || [0, 0, Math.max(0, ...(def.grid || []).map(r => r.length)), (def.grid || []).length];
  const [c, r] = door.at, [w, h] = door.size || [1, 1];
  if (r === box[1]) return 'n'; if (r + h === box[3]) return 's'; if (c === box[0]) return 'w'; if (c + w === box[2]) return 'e';
  return null;
}

/** wallDoors and entries with the link-door entries worked out (pure). */
export function expand(def) {
  const wallDoors = [...(def.wallDoors || [])], entries = [];
  for (const e of def.entries || []) {
    if (!e.door) { entries.push(e); continue; }
    const src = (def.doors || []).find(d => d.id === e.door);
    if (!src) { entries.push({ ...e, room: e.door, far: `${e.door}-far`, broken: true }); continue; }
    const side = sideOf(def, src) || 'n', [ox, oy] = OUT[side], depth = e.depth || DEPTH, [w, h] = src.size || [1, 1];
    const axis = side === 'n' || side === 's' ? 'h' : 'v';
    const color = e.color || def.look?.doorColors?.[src.id];
    const far = `${src.id}-far`;
    wallDoors.push({ id: src.id, at: src.at, size: [w, h], axis, style: DEFAULT_STYLE, label: src.label, color, entry: e.id || src.id, fromDoor: true });
    wallDoors.push({ id: far, at: [src.at[0] + ox * (depth + 1) + (ox > 0 ? w - 1 : 0), src.at[1] + oy * (depth + 1) + (oy > 0 ? h - 1 : 0)], size: [w, h], axis, style: DEFAULT_STYLE, color, far: true, entry: e.id || src.id, fromDoor: true });
    // zone: the cells between the two doors
    const zc = ox < 0 ? src.at[0] - depth : ox > 0 ? src.at[0] + w : src.at[0], zr = oy < 0 ? src.at[1] - depth : oy > 0 ? src.at[1] + h : src.at[1];
    entries.push({ id: e.id || src.id, room: src.id, far, zone: { at: [zc, zr], size: ox ? [depth, h] : [w, depth] }, spawn: e.spawn, to: src.to, arrive: src.arrive, color, side });
  }
  return { wallDoors, entries };
}

const cellSolid = (def, c, r) => {
  const ch = def.grid?.[r]?.[c];
  if (ch === undefined) return true;
  const cell = { ...DEFAULT_LEGEND, ...(def.legend || {}) }[ch];
  return !cell || Boolean(cell.solid);
};

function rectOf(def, d) {
  const T = def.tile || 48, [c, r] = d.at, [w, h] = d.size || [2, 1];
  return { x: c * T, y: r * T, w: w * T, h: h * T, cols: [c, c + w - 1], rows: [r, r + h - 1] };
}
/** 'h' = a doorway in a horizontal wall (slides along x), 'v' = in a vertical wall (slides along y). */
export const axisOf = d => d.axis || ((d.size || [2, 1])[0] >= (d.size || [2, 1])[1] ? 'h' : 'v');

/** Everything wrong with one map's wall doors and entries; [] when sound. */
export function doorIssues(def) {
  const out = [], id = def?.id || '?';
  if (!def?.wallDoors?.length && !def?.entries?.length) return out;
  const { wallDoors: doors, entries } = expand(def);
  const ids = new Set((def.doors || []).map(d => d.id));
  const byId = new Map();
  for (const d of doors) {
    const where = `${id}: door ${d.id}`;
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(d.id || '')) { out.push(`${where} has a bad id`); continue; }
    if (ids.has(d.id) && !d.fromDoor) out.push(`${where} repeats an id`);
    if (d.fromDoor && d.far && (def.doors || []).some(x => x.id === d.id)) out.push(`${where} repeats a link door id`);
    ids.add(d.id); byId.set(d.id, d);
    const [w, h] = d.size || [2, 1];
    if (Math.min(w, h) !== 1) { out.push(`${where} must be 1 tile thick (size ${w}x${h})`); continue; }
    if (d.style && !DOOR_STYLES.includes(d.style)) out.push(`${where} has unknown style ${d.style}`);
    const R = rectOf(def, d), ax = axisOf(d);
    for (let r = R.rows[0]; r <= R.rows[1]; r++) for (let c = R.cols[0]; c <= R.cols[1]; c++) if (cellSolid(def, c, r)) out.push(`${where}: the gap cell ${c},${r} is solid (a door gap is floor)`);
    // Pockets: the wall cells at both ends of the gap, along the slide.
    const before = ax === 'h' ? [R.cols[0] - 1, R.rows[0]] : [R.cols[0], R.rows[0] - 1];
    const after = ax === 'h' ? [R.cols[1] + 1, R.rows[0]] : [R.cols[0], R.rows[1] + 1];
    if (!cellSolid(def, ...before) || !cellSolid(def, ...after)) out.push(`${where}: no wall pocket at an end of the gap`);
    // It is a doorway: floor on at least one side across the wall, on both sides of a plain doorway.
    const across = ax === 'h' ? [[R.cols[0], R.rows[0] - 1], [R.cols[0], R.rows[0] + 1]] : [[R.cols[0] - 1, R.rows[0]], [R.cols[0] + 1, R.rows[0]]];
    if (across.every(p => cellSolid(def, ...p))) out.push(`${where}: leads nowhere (wall on both sides)`);
  }
  for (const e of entries) {
    const where = `${id}: entry ${e.id}`;
    if (e.broken) { out.push(`${where}: link door ${e.room} is missing`); continue; }
    const room = byId.get(e.room), far = byId.get(e.far);
    if (!room) { out.push(`${where}: room door ${e.room} is missing`); continue; }
    if (!far) { out.push(`${where}: far door ${e.far} is missing`); continue; }
    if (!far.far) out.push(`${where}: the far door must be marked far (it never opens in this map)`);
    if (room.far) out.push(`${where}: the room door cannot be a far door`);
    if (axisOf(room) !== axisOf(far)) { out.push(`${where}: the two doors must run the same way`); continue; }
    const z = e.zone && { c: e.zone.at[0], r: e.zone.at[1], w: e.zone.size[0], h: e.zone.size[1] };
    if (!z) { out.push(`${where}: needs a zone`); continue; }
    const depth = axisOf(room) === 'h' ? z.h : z.w, width = axisOf(room) === 'h' ? z.w : z.h;
    if (depth < 2 || depth > 3) out.push(`${where}: a vestibule is 2 or 3 tiles deep (zone is ${depth})`);
    if (width !== Math.max(...room.size)) out.push(`${where}: the zone is as wide as the doors`);
    for (let r = z.r; r < z.r + z.h; r++) for (let c = z.c; c < z.c + z.w; c++) if (cellSolid(def, c, r)) out.push(`${where}: zone cell ${c},${r} is solid`);
    // The doors sit at the two ends of the zone, touching it.
    const Rr = rectOf(def, room), Rf = rectOf(def, far), T = def.tile || 48;
    const Z = { x: z.c * T, y: z.r * T, w: z.w * T, h: z.h * T };
    const touches = (a, b) => (a.x + a.w === b.x || b.x + b.w === a.x ? a.y < b.y + b.h && b.y < a.y + a.h : a.y + a.h === b.y || b.y + b.h === a.y ? a.x < b.x + b.w && b.x < a.x + a.w : false);
    if (!touches(Rr, Z) || !touches(Rf, Z)) out.push(`${where}: both doors must touch the vestibule zone`);
    else if (touches(Rr, Rf)) out.push(`${where}: the doors are in the same place`);
    const sp = def.spawns?.[e.spawn];
    if (!sp) out.push(`${where}: spawn ${e.spawn} is missing`);
    else if (!(sp[0] >= z.c && sp[0] < z.c + z.w && sp[1] >= z.r && sp[1] < z.r + z.h)) out.push(`${where}: spawn ${e.spawn} is outside the vestibule`);
    if (!e.to || !e.arrive) out.push(`${where}: needs to and arrive`);
  }
  return out;
}

/** The other side of every entry exists, points back, and has the same vestibule footprint and style. */
export function entryPairIssues(defs) {
  const out = [], by = new Map(defs.map(d => [d.id, d]));
  for (const def of defs) for (const e of expand(def).entries) {
    const other = by.get(e.to), where = `${def.id}: entry ${e.id}`;
    if (!other) { out.push(`${where} goes to missing map ${e.to}`); continue; }
    const back = expand(other).entries.find(x => x.spawn === e.arrive);
    if (!back) { out.push(`${where}: ${e.to} has no entry whose spawn is ${e.arrive}`); continue; }
    if (back.to !== def.id || back.arrive !== e.spawn) out.push(`${where}: ${back.id} in ${e.to} does not point back here`);
    const dim = x => [...x.zone.size].sort().join('x');
    if (dim(e) !== dim(back)) out.push(`${where}: the vestibule is ${dim(e)} here and ${dim(back)} in ${e.to} (the cut would show)`);
    const style = x => (expand(def).wallDoors.find(d => d.id === x.room) || {}).style || DEFAULT_STYLE;
    const styleBack = (expand(other).wallDoors.find(d => d.id === back.room) || {}).style || DEFAULT_STYLE;
    if (style(e) !== styleBack) out.push(`${where}: door style differs across the entry`);
  }
  return out;
}

/** Compiled doors (world px) and entries for a compiled map. */
export function compileDoors(map) {
  const def = map.def, T = map.tile;
  const ex = expand(def);
  const doors = ex.wallDoors.map(d => {
    const R = rectOf(def, d), axis = axisOf(d);
    return { ...d, x: R.x, y: R.y, w: R.w, h: R.h, axis, style: d.style || DEFAULT_STYLE, length: axis === 'h' ? R.w : R.h, thick: axis === 'h' ? R.h : R.w, far: Boolean(d.far), entry: null };
  });
  const byId = new Map(doors.map(d => [d.id, d]));
  const entries = ex.entries.map(e => {
    const zone = { x: e.zone.at[0] * T, y: e.zone.at[1] * T, w: e.zone.size[0] * T, h: e.zone.size[1] * T };
    const room = byId.get(e.room), far = byId.get(e.far);
    if (room) room.entry = e.id; if (far) far.entry = e.id;
    return { ...e, zone, roomDoor: room, farDoor: far, spawnPx: map.spawns[e.spawn] };
  });
  return { doors, byId, entries };
}
