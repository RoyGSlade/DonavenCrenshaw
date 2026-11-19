// Compiles a map definition's wall doors and entries (pure). A map def may carry:
//   wallDoors: [{ id, at: [col,row], size: [w,h], style: 'slide' | 'swing', label?, color?, lock?, locked?, access?, far? }]
//   entries:   [{ id, room: <wallDoor id>, far: <wallDoor id>, zone: { at, size }, spawn: <spawn in this vestibule>,
//                 to: <map id>, arrive: <spawn in the other map's vestibule>, color? }]
// The gap (door rect) is made of floor cells in the wall; the wall cells at both ends along the slide are the pockets.
import { DEFAULT_LEGEND } from '../rules/mapdata.js';

export const DOOR_STYLES = Object.freeze(['slide', 'swing']);

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
export const axisOf = d => ((d.size || [2, 1])[0] >= (d.size || [2, 1])[1] ? 'h' : 'v');

/** Everything wrong with one map's wall doors and entries; [] when sound. */
export function doorIssues(def) {
  const out = [], id = def?.id || '?';
  const doors = def?.wallDoors || [], entries = def?.entries || [];
  if (!doors.length && !entries.length) return out;
  const ids = new Set((def.doors || []).map(d => d.id));
  const byId = new Map();
  for (const d of doors) {
    const where = `${id}: door ${d.id}`;
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(d.id || '')) { out.push(`${where} has a bad id`); continue; }
    if (ids.has(d.id)) out.push(`${where} repeats an id`);
    ids.add(d.id); byId.set(d.id, d);
    const [w, h] = d.size || [2, 1];
    if (Math.min(w, h) !== 1 || Math.max(w, h) < 2) { out.push(`${where} must be 1 tile thick and 2 or more long (size ${w}x${h})`); continue; }
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
  for (const def of defs) for (const e of def.entries || []) {
    const other = by.get(e.to), where = `${def.id}: entry ${e.id}`;
    if (!other) { out.push(`${where} goes to missing map ${e.to}`); continue; }
    const back = (other.entries || []).find(x => x.spawn === e.arrive);
    if (!back) { out.push(`${where}: ${e.to} has no entry whose spawn is ${e.arrive}`); continue; }
    if (back.to !== def.id || back.arrive !== e.spawn) out.push(`${where}: ${back.id} in ${e.to} does not point back here`);
    const dim = x => [...x.zone.size].sort().join('x');
    if (dim(e) !== dim(back)) out.push(`${where}: the vestibule is ${dim(e)} here and ${dim(back)} in ${e.to} (the cut would show)`);
    const style = x => (def.wallDoors.find(d => d.id === x.room) || {}).style || 'slide';
    const styleBack = (other.wallDoors.find(d => d.id === back.room) || {}).style || 'slide';
    if (style(e) !== styleBack) out.push(`${where}: door style differs across the entry`);
  }
  return out;
}

/** Compiled doors (world px) and entries for a compiled map. */
export function compileDoors(map) {
  const def = map.def, T = map.tile;
  const doors = (def.wallDoors || []).map(d => {
    const R = rectOf(def, d), axis = axisOf(d);
    return { ...d, x: R.x, y: R.y, w: R.w, h: R.h, axis, style: d.style || 'slide', length: axis === 'h' ? R.w : R.h, thick: axis === 'h' ? R.h : R.w, far: Boolean(d.far), entry: null };
  });
  const byId = new Map(doors.map(d => [d.id, d]));
  const entries = (def.entries || []).map(e => {
    const zone = { x: e.zone.at[0] * T, y: e.zone.at[1] * T, w: e.zone.size[0] * T, h: e.zone.size[1] * T };
    const room = byId.get(e.room), far = byId.get(e.far);
    if (room) room.entry = e.id; if (far) far.entry = e.id;
    return { ...e, zone, roomDoor: room, farDoor: far, spawnPx: map.spawns[e.spawn] };
  });
  return { doors, byId, entries };
}
