// Assembly repair (v2/PLAN.md section 5), pure rules. A housing with shaped sockets and a tray of parts. The player picks the part
// whose outline fits the socket, turns it in quarter turns, drags it in (it snaps within `snap` units and only when turned right),
// then drags each of its bolts to a hole (within `boltSnap` units) and drives it down with the real Screw game (screw.js). When the
// last bolt is snug the next socket shows. Out of clock: the unit stays broken. No DOM, no clock of its own: the view (or a bot)
// calls tick(s, dt) and the actions below, and reads the events.
//
//   Shapes: 6 hand-drawn outlines, none with any symmetry, plus their 6 mirror images = the 12-outline set. Each outline has
//   4 distinct quarter-turn orientations, so a part fits a socket in exactly one orientation, and a mirror twin never fits.
//   Tray: the parts (one per socket) and the decoys (a mirror twin of a part first, then other outlines): every outline in the
//   tray is different, so exactly one piece fits each socket, in exactly one turn.
//   Result: quality = 40 + up to 30 for few wrong fits (30, less 6 each) + up to 30 for the clock left + Repair quality points,
//   100 at most; stars at 65 and 90. Lost on the clock: broken: true and the system's name (coolant v2's world result).
import { setupAssembly, ASSEMBLY_BASE } from './setup.js';
import { SYSTEMS, DEFAULT_SYSTEM } from './repair.js';

export const WRONG_COST = 6, WRONG_MAX = 5;
export const STAR_AT = Object.freeze([65, 90]);
export const XP_CAP = 10;

// ---- the 12 outlines ----------------------------------------------------------------------------------------------------------
const SOURCE = Object.freeze([
  { id: 'wedge', name: 'Wedge', rows: 'XXX/XX.' },
  { id: 'hook', name: 'Hook', rows: 'XXX/X.X/X..' },
  { id: 'spur', name: 'Spur', rows: '.X./XXX/X..' },
  { id: 'plate', name: 'Plate', rows: 'XX./XXX/X..' },
  { id: 'bracket', name: 'Bracket', rows: 'XXX/.XX/XX.' },
  { id: 'clamp', name: 'Clamp', rows: 'X.X/XXX/X..' },
]);
export const normalise = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
/** One quarter turn clockwise on the screen (y down), normalised. */
export const turnCells = (cells, quarters = 1) => { let c = cells; for (let i = 0; i < ((quarters % 4) + 4) % 4; i++) c = normalise(c.map(([x, y]) => [-y, x])); return normalise(c); };
export const keyOf = (cells) => normalise(cells).map((c) => c.join(',')).join(';');
export const sizeOf = (cells) => ({ w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 });
const parse = (rows) => normalise(rows.split('/').flatMap((row, y) => [...row].map((ch, x) => (ch === 'X' ? [x, y] : null)).filter(Boolean)));
const mirror = (cells) => normalise(cells.map(([x, y]) => [-x, y]));

/** The 12 outlines: id, name, cells (normalised grid cells), mirrored, twin (the id of the mirror image). */
export const OUTLINES = Object.freeze(SOURCE.flatMap((s) => {
  const cells = parse(s.rows);
  return [
    Object.freeze({ id: s.id, name: s.name, cells: Object.freeze(cells), mirrored: false, twin: `${s.id}-m` }),
    Object.freeze({ id: `${s.id}-m`, name: `${s.name} (mirrored)`, cells: Object.freeze(mirror(cells)), mirrored: true, twin: s.id }),
  ];
}));
export const outlineById = (id) => OUTLINES.find((o) => o.id === id) || null;

/** Does a part turned `rot` quarter turns have exactly the socket's outline? (The fit rule.) */
export const fitsSocket = (outline, rot, socketOutline) => keyOf(turnCells(outline.cells, rot)) === keyOf(socketOutline.cells);

// ---- the board ------------------------------------------------------------------------------------------------------------------
/** Board units, the same on every screen. Wide: 1000 x 620 (housing left, tray right). Tall (phones): 620 x 1000 (housing top, tray under it). */
export const LAYOUTS = Object.freeze({
  wide: Object.freeze({ kind: 'wide', W: 1000, H: 620, cell: 40, housing: { x: 20, y: 20, w: 560, h: 580, cols: 3, rows: 2 }, tray: { x: 600, y: 20, w: 380, h: 580, cols: 3, rows: 3 } }),
  tall: Object.freeze({ kind: 'tall', W: 620, H: 1000, cell: 48, housing: { x: 20, y: 20, w: 580, h: 500, cols: 3, rows: 2 }, tray: { x: 20, y: 540, w: 580, h: 440, cols: 3, rows: 3 } }),
});
export const layoutOf = (kind) => LAYOUTS[kind] || LAYOUTS.wide;
const slot = (area, i) => { const cw = area.w / area.cols, ch = area.h / area.rows, c = i % area.cols, r = Math.floor(i / area.cols); return { x: area.x + c * cw, y: area.y + r * ch, w: cw, h: ch }; };
const centred = (box, w, h) => ({ x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h) / 2) });

function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
function shuffle(list, r) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const PALETTE = Object.freeze(['#6fd4c9', '#ffb067', '#b9a4ff', '#9fe870', '#ff8f8f', '#7fb8ff', '#ffd166', '#e59cff']);

/** Bolts split over the parts: the first parts take the remainder (10 over 4: 3, 3, 2, 2). Never fewer than one a part. */
export const boltsPerPart = (total, parts) => Array.from({ length: parts }, (_, i) => Math.max(1, Math.floor(total / parts) + (i < total % parts ? 1 : 0)));

/** Hole cells of a part: spread over the part, the farthest cell from the ones already chosen each time, starting from the first cell. */
export function holeCells(cells, n) {
  const pick = [cells[0]];
  while (pick.length < Math.min(n, cells.length)) {
    let best = null, bestD = -1;
    for (const c of cells) { if (pick.includes(c)) continue; const d = Math.min(...pick.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))); if (d > bestD) { bestD = d; best = c; } }
    pick.push(best);
  }
  return pick;
}

// ---- the game -------------------------------------------------------------------------------------------------------------------
/**
 * `setup` is setupAssembly(...) (setup.js). `layout` is 'wide' or 'tall'. `system` names the unit that stays broken when the clock runs out.
 * State is plain JSON (apart from nothing): sockets (one per part, shown one at a time), pieces (parts and decoys), the bolts of the
 * part being fitted, the clock.
 */
export function createAssembly({ seed = 1, setup = setupAssembly(), layout = 'wide', system = DEFAULT_SYSTEM } = {}) {
  const r = lcg(seed * 2654435761 + 7);
  const L = layoutOf(layout);
  const n = setup.parts;
  // the outlines for the parts: n different outlines; decoys: mirror twins of parts first, then the rest, all different from every part
  const chosen = shuffle(OUTLINES.map((o) => o.id), r);
  const partIds = [];
  for (const id of chosen) { if (partIds.length >= n) break; const o = outlineById(id); if (!partIds.includes(o.twin)) partIds.push(id); } // never a part and its own twin: the twin is the decoy
  const decoyIds = [];
  for (const id of shuffle(partIds, r)) { if (decoyIds.length >= setup.decoys) break; decoyIds.push(outlineById(id).twin); }
  for (const id of chosen) { if (decoyIds.length >= setup.decoys) break; if (!partIds.includes(id) && !decoyIds.includes(id)) decoyIds.push(id); }
  const perPart = boltsPerPart(setup.bolts, n);
  const sockets = partIds.map((id, i) => {
    const o = outlineById(id), sl = slot(L.housing, i), sz = sizeOf(o.cells);
    const pos = centred(sl, sz.w * L.cell, sz.h * L.cell);
    return { id: `s${i}`, index: i, outline: id, cells: o.cells.map((c) => c.slice()), x: pos.x, y: pos.y, w: sz.w, h: sz.h, bolts: perPart[i], holes: holeCells(o.cells, perPart[i]).map((c) => c.slice()), part: `p${i}`, done: false };
  });
  const pieces = [];
  partIds.forEach((id, i) => pieces.push({ id: `p${i}`, outline: id, role: 'part', socket: `s${i}`, rot: 0, x: 0, y: 0, placed: false, color: PALETTE[i % PALETTE.length] }));
  decoyIds.forEach((id, i) => pieces.push({ id: `d${i}`, outline: id, role: 'decoy', socket: null, rot: 0, x: 0, y: 0, placed: false, color: PALETTE[(n + i) % PALETTE.length] }));
  const order = shuffle(pieces.map((p) => p.id), r);
  pieces.forEach((p) => { p.home = order.indexOf(p.id); p.rot = Math.floor(r() * 4); });
  // the first piece of the tray never starts already turned right for the first socket (the player always has something to do)
  const s = {
    seed, setup, system: SYSTEMS[system] ? system : DEFAULT_SYSTEM, layoutKind: L.kind, layout: L, snap: setup.snap ?? ASSEMBLY_BASE.snap, boltSnap: setup.boltSnap ?? ASSEMBLY_BASE.boltSnap,
    clock: setup.clock, t: 0, sockets, pieces, active: 0, phase: 'fit', selected: null, held: null,
    bolts: null, wrongFits: 0, wrongTurns: 0, stripped: 0, turns: 0, events: [], done: false, result: null,
  };
  place(s);
  return s;
}

export const pieceOf = (s, id) => s.pieces.find((p) => p.id === id) || null;
export const socketOf = (s) => s.sockets[s.active] || null;
export const outlineOfPiece = (p) => outlineById(p.outline);
export const timeLeft = (s) => Math.max(0, s.clock - s.t);
export const clockShare = (s) => timeLeft(s) / s.clock;
export const pieceCells = (p) => turnCells(outlineOfPiece(p).cells, p.rot);
export const pieceSize = (s, p) => { const z = sizeOf(pieceCells(p)); return { w: z.w * s.layout.cell, h: z.h * s.layout.cell }; };
const centreOf = (s, p) => { const z = pieceSize(s, p); return { x: p.x + z.w / 2, y: p.y + z.h / 2 }; };
/** The tray pieces still to pick from. */
export const trayPieces = (s) => s.pieces.filter((p) => !p.placed);

/** Put every loose piece in its tray slot and every socket in its housing slot (also after a phone turns round). */
function place(s) {
  const L = s.layout;
  s.sockets.forEach((k, i) => { const sl = slot(L.housing, i), pos = centred(sl, k.w * L.cell, k.h * L.cell); k.x = pos.x; k.y = pos.y; });
  const loose = s.pieces.filter((p) => !p.placed);
  loose.forEach((p, i) => home(s, p, i));
  s.pieces.filter((p) => p.placed).forEach((p) => { const k = s.sockets.find((q) => q.id === p.socket); p.x = k.x; p.y = k.y; });
}
function home(s, p, index = null) {
  const L = s.layout, loose = s.pieces.filter((q) => !q.placed).sort((a, b) => a.home - b.home);
  const i = index ?? loose.indexOf(p);
  const sl = slot(L.tray, i), z = pieceSize(s, p), pos = centred(sl, z.w, z.h);
  p.x = pos.x; p.y = pos.y; p.homeX = pos.x; p.homeY = pos.y;
}
/** Switch between the wide and the tall board (a phone turned round). Loose pieces go home; placed ones stay in their sockets. */
export function relayout(s, kind) {
  if (s.layoutKind === kind) return s;
  s.layoutKind = kind; s.layout = layoutOf(kind); s.held = null; place(s); layBolts(s);
  return s;
}

const push = (s, type, extra = {}) => s.events.push({ type, ...extra });

/** Advance the clock. Out of time loses the unit: it stays broken. */
export function tick(s, dt) {
  if (s.done) return s;
  s.t += dt;
  if (s.t >= s.clock) { s.t = s.clock; finish(s, false); }
  return s;
}

// ---- the fitting ----------------------------------------------------------------------------------------------------------------
/** Select a part in the tray (it is the one the turn buttons turn). */
export function select(s, id) { const p = pieceOf(s, id); if (!p || p.placed || s.done || s.phase !== 'fit') return false; s.selected = id; return true; }

/** Turn the selected (or given) part one quarter turn: dir +1 clockwise, -1 the other way. It turns about its own middle. */
export function turn(s, dir = 1, id = s.selected) {
  const p = id ? pieceOf(s, id) : null;
  if (!p || p.placed || s.done || s.phase !== 'fit') return false;
  const c = centreOf(s, p);
  p.rot = (p.rot + (dir >= 0 ? 1 : 3)) % 4; s.turns++;
  const z = pieceSize(s, p); p.x = c.x - z.w / 2; p.y = c.y - z.h / 2;
  if (!p.floating) { p.homeX = p.x; p.homeY = p.y; } // a tray piece keeps its place when turned in the tray
  push(s, 'turned', { id: p.id, rot: p.rot });
  return true;
}

/** Pick a part up (it leaves its slot while held). */
export function grab(s, id) { const p = pieceOf(s, id); if (!p || p.placed || s.done || s.phase !== 'fit') return false; s.selected = id; s.held = id; p.floating = true; return true; }
/** Move a held part so its middle is at (cx, cy). */
export function carry(s, cx, cy) { const p = s.held ? pieceOf(s, s.held) : null; if (!p) return false; const z = pieceSize(s, p); p.x = cx - z.w / 2; p.y = cy - z.h / 2; return true; }

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
/**
 * Let go of the held part. Returns what happened:
 *   'snapped'  within `snap` units of the socket and turned right: it is in, and the bolt step opens
 *   'wrong'    within `snap` units but it is the wrong part: it bounces back to the tray and counts as a wrong fit
 *   'turn'     the right part but not turned right: it bounces back, no penalty
 *   'close'    near the socket but not within `snap` units: back to the tray, nothing counted
 *   'miss'     nowhere near: back to the tray
 */
export function drop(s, id = s.held) {
  const p = id ? pieceOf(s, id) : null;
  if (!p || p.placed || s.done || s.phase !== 'fit') return null;
  const k = socketOf(s);
  s.held = null; p.floating = false;
  const d = dist(p.x, p.y, k.x, k.y), reach = s.layout.cell * 2.5;
  let out;
  if (d <= s.snap) {
    if (fitsSocket(outlineOfPiece(p), p.rot, outlineById(k.outline))) {
      p.placed = true; p.x = k.x; p.y = k.y; p.socket = k.id; s.selected = null;
      push(s, 'snapped', { id: p.id, socket: k.id });
      openBolts(s);
      return 'snapped';
    }
    const anyTurn = [0, 1, 2, 3].some((q) => fitsSocket(outlineOfPiece(p), q, outlineById(k.outline)));
    if (anyTurn) { s.wrongTurns++; out = 'turn'; push(s, 'bounce', { id: p.id, why: 'turn' }); }
    else { s.wrongFits++; out = 'wrong'; push(s, 'wrong', { id: p.id, wrongFits: s.wrongFits }); }
  } else out = d <= reach ? 'close' : 'miss';
  if (out === 'close' || out === 'miss') push(s, 'bounce', { id: p.id, why: out });
  p.x = p.homeX; p.y = p.homeY;
  place(s);
  return out;
}

// ---- the bolts ------------------------------------------------------------------------------------------------------------------
/** Where the part's bolts wait: the tray area's slots (the view draws them there while a part is being bolted). */
function layBolts(s) {
  if (!s.bolts) return;
  const k = socketOf(s);
  s.bolts.forEach((b, i) => {
    const sl = slot(s.layout.tray, i);
    b.homeX = sl.x + sl.w / 2; b.homeY = sl.y + sl.h / 2;
    if (!b.seated) { b.x = b.homeX; b.y = b.homeY; }
    const c = k.holes[i]; b.hx = k.x + (c[0] + 0.5) * s.layout.cell; b.hy = k.y + (c[1] + 0.5) * s.layout.cell;
    if (b.seated) { b.x = b.hx; b.y = b.hy; }
  });
}
function openBolts(s) {
  const k = socketOf(s);
  s.phase = 'bolt'; s.held = null;
  s.bolts = k.holes.map((_, i) => ({ id: `b${i}`, seated: false, tight: false, tries: 0 }));
  layBolts(s);
}
export const boltOf = (s, id) => s.bolts?.find((b) => b.id === id) || null;
export const boltsTight = (s) => (s.bolts ? s.bolts.filter((b) => b.tight).length : 0);

/** Pick a bolt up from the tray. */
export function grabBolt(s, id) { const b = boltOf(s, id); if (!b || b.seated || b.tight || s.done || s.phase !== 'bolt') return false; s.held = id; return true; }
export function carryBolt(s, cx, cy) { const b = s.held ? boltOf(s, s.held) : null; if (!b) return false; b.x = cx; b.y = cy; return true; }
/**
 * Let go of the held bolt: 'seated' when it is within `boltSnap` units of ITS hole (each bolt has its own point, line them up one to one),
 * else it goes back to the tray ('miss').
 */
export function dropBolt(s, id = s.held) {
  const b = id ? boltOf(s, id) : null;
  if (!b || b.seated || s.done || s.phase !== 'bolt') return null;
  s.held = null;
  // the nearest hole that is still empty takes it: the player lines each bolt up with a point, any free point will do
  let hole = null, hd = Infinity;
  s.bolts.forEach((o) => { if (o.seated) return; const d = dist(b.x, b.y, o.hx, o.hy); if (d < hd) { hd = d; hole = o; } });
  if (!hole || hd > s.boltSnap) { b.x = b.homeX; b.y = b.homeY; push(s, 'bolt-miss', { id: b.id }); return 'miss'; }
  // swap: the bolt takes that hole's slot so the holes stay matched to bolt slots
  const other = hole;
  if (other !== b) { [b.hx, other.hx] = [other.hx, b.hx]; [b.hy, other.hy] = [other.hy, b.hy]; }
  b.seated = true; b.x = b.hx; b.y = b.hy;
  push(s, 'seated', { id: b.id });
  return 'seated';
}

/** Hand in the Screw game's result for a seated bolt: snug (grade 70+) or stripped (it comes out and goes back to the tray). */
export function screwed(s, id, result) {
  const b = boltOf(s, id);
  if (!b || !b.seated || b.tight || s.done || s.phase !== 'bolt') return null;
  b.tries++;
  if (result?.success) { b.tight = true; push(s, 'tight', { id: b.id, grade: result.grade }); }
  else {
    s.stripped++; b.seated = false; b.x = b.homeX; b.y = b.homeY;
    // the bolt left its hole: it must go back to a free point (the hole slot it had stays with it)
    push(s, 'stripped', { id: b.id, stripped: s.stripped });
  }
  if (s.bolts.every((o) => o.tight)) partDone(s);
  return b.tight ? 'tight' : 'stripped';
}

function partDone(s) {
  const k = socketOf(s);
  k.done = true; push(s, 'part-done', { socket: k.id, index: s.active });
  s.bolts = null;
  if (s.active + 1 >= s.sockets.length) { finish(s, true); return; }
  s.active++; s.phase = 'fit'; s.selected = null;
  push(s, 'next-socket', { index: s.active });
  place(s);
}

// ---- the result -----------------------------------------------------------------------------------------------------------------
/** Quality 0..100: 40 for finishing, up to 30 for few wrong fits (30 less 6 each), up to 30 for the clock left, plus the Repair quality points. */
export function qualityOf({ success, wrongFits = 0, left = 0, clock = 1, qualityBonus = 0 }) {
  if (!success) return 0;
  const fits = Math.max(0, 30 - WRONG_COST * wrongFits), time = 30 * Math.max(0, Math.min(1, left / clock));
  return Math.max(0, Math.min(100, Math.round(+(40 + fits + time + qualityBonus).toFixed(6))));
}
export const starsOf = (q) => (q >= STAR_AT[1] ? 3 : q >= STAR_AT[0] ? 2 : 1);
/** Placeholder XP: 4 + 2 per part above three + 1 per star above one, 10 at most (the engine's cap). 0 when lost. */
export const xpFor = ({ success, parts, stars }) => (success ? Math.min(XP_CAP, 4 + 2 * (parts - 3) + (stars - 1)) : 0);

function finish(s, success) {
  s.done = true; s.held = null; s.phase = success ? 'won' : 'lost';
  const left = timeLeft(s), quality = qualityOf({ success, wrongFits: s.wrongFits, left, clock: s.clock, qualityBonus: s.setup.qualityBonus });
  s.result = {
    success, how: success ? 'fixed' : 'out-of-time', quality, stars: success ? starsOf(quality) : 0, wrongFits: s.wrongFits, wrongTurns: s.wrongTurns, stripped: s.stripped,
    timeLeft: Math.round(left * 10) / 10, clock: s.clock, parts: s.sockets.length, bolts: s.setup.bolts, done: s.sockets.filter((k) => k.done).length, xp: 0,
    // the world result (as coolant v2): a unit lost on the clock stays broken
    broken: !success, system: s.system, systemName: SYSTEMS[s.system], retry: success ? null : { scrap: 1, why: 'a spoiled gasket' },
  };
  s.result.xp = xpFor({ success, parts: s.sockets.length, stars: s.result.stars });
  push(s, 'done', { ...s.result });
}

/** The world result as plain facts (what a scene hook or the workbench shows). */
export const worldOf = (result) => ({ broken: !!result?.broken, system: result?.system ?? DEFAULT_SYSTEM, systemName: result?.systemName ?? SYSTEMS[DEFAULT_SYSTEM] });

/** A line in plain words for the HUD: how the clock looks. */
export const clockWords = (s) => { const f = clockShare(s); return f > 0.66 ? 'plenty of time' : f > 0.33 ? 'time is going' : f > 0.15 ? 'running low' : 'hurry'; };
/** Plain words for the wrong fits so far. */
export const wrongWords = (n) => (n <= 0 ? 'none yet' : n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : n === 4 ? 'four' : 'five or more');
export const ordinal = (i) => ['first', 'second', 'third', 'fourth', 'fifth'][i] || `${i + 1}th`;
