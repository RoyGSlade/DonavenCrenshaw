// Where the crew of the Tin Duchess are, and how they get there (opening track A, 2026-11-19). Pure: no DOM, no real clock.
//
// Donaven: "how is the captain another room before we are that makes no sense they should have states and have to travel".
// Before this, every room carried its own copy of Tull, so he was already on the bridge when you walked in. Now there is one
// ledger. A person is in exactly one room, or on a trip. A trip is a route over the ship's doors (never a jump), walked at
// walking speed along a path in each room, and where they stand at any moment is a pure function of the clock.
//
//   roomRoute(from, to)              the rooms to cross, door by door: [{ room, door }] (the last entry has no door)
//   pathIn(room, a, b)               a walkable polyline between two points in one room (A* on the tile grid)
//   planTrip(...)                    the segments of a walk: one per room crossed, each with its polyline and timing
//   createPresence({ speed })        the ledger: settle, send, where, entries, arrival
//
// The crew's places per scene beat are data in presenceData.js; the world and the director wire this to the screen
// (presenceRun.js, slice/director.js, onfoot/world.js).
import { MAP_DEFS } from '../maps/index.js';
import SHIP from '../maps/tin-duchess.json' with { type: 'json' };
import { compileMap, walkable } from '../onfoot/rules/mapdata.js';
import { SPOTS, DOWNED, AWAY } from './presenceData.js';

/** Walking pace of the crew, px per second (the player walks at 175). */
export const NPC_SPEED = 135;
/** Pause at a door, seconds: none. A person standing in a doorway or its entry passage would hold the door cycle. */
export const DOOR_PAUSE = 0; // nobody stops in a doorway: they walk straight through
export const ROOMS = Object.freeze([...SHIP.rooms]);
export { AWAY, DOWNED };

const COMPILED = new Map();
/** A room, compiled (cached). */
export function roomMap(id) {
  if (!COMPILED.has(id)) COMPILED.set(id, compileMap(MAP_DEFS[id]));
  return COMPILED.get(id);
}
const T = 48;
const RADIUS = 14;

/** The doors of a room that lead to another Duchess room. */
export const doorsOf = (room) => (MAP_DEFS[room]?.doors || []).filter((d) => ROOMS.includes(d.to));

/** Where you stand to leave by a door: the end of its entry passage when the room has one, else the door itself. */
export function exitPoint(room, doorId) {
  const def = MAP_DEFS[room];
  const door = (def.doors || []).find((d) => d.id === doorId);
  if (!door) throw new Error(`presence: ${room} has no door ${doorId}`);
  const entry = (def.entries || []).find((e) => e.door === doorId);
  const s = entry && def.spawns?.[entry.spawn];
  if (s) return { x: (s[0] + 0.5) * T, y: (s[1] + 0.5) * T };
  const size = door.size || [1, 1];
  return { x: (door.at[0] + size[0] / 2) * T, y: (door.at[1] + size[1] / 2) * T };
}
/** Where you appear in a room after coming through a door (a named spawn). */
export function entryPoint(room, spawn) {
  const s = MAP_DEFS[room]?.spawns?.[spawn] || MAP_DEFS[room]?.spawns?.default;
  return { x: (s[0] + 0.5) * T, y: (s[1] + 0.5) * T };
}

/** A person's place in a room: an explicit spot from the data, else where the room's own map stands them. Null when the room has none. */
export function spotIn(room, npc) {
  const own = SPOTS[room]?.[npc];
  const n = own ? { at: own.at, face: own.face } : (MAP_DEFS[room]?.npcs || []).find((x) => x.id === npc);
  if (!n) return null;
  return { x: (n.at[0] + 0.5) * T, y: (n.at[1] + 0.5) * T, face: n.face || 'down', wander: own?.wander ?? (MAP_DEFS[room]?.npcs || []).find((x) => x.id === npc)?.wander ?? 0.2, custom: Boolean(own) };
}

/** Rooms to cross from one Duchess room to another, by the fewest doors. [{ room, door }]; the last has door null. Null when there is no way. */
export function roomRoute(from, to) {
  if (from === to) return [{ room: from, door: null }];
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const room = queue.shift();
    for (const d of doorsOf(room)) {
      if (prev.has(d.to)) continue;
      prev.set(d.to, { room, door: d.id });
      if (d.to === to) { queue.length = 0; break; }
      queue.push(d.to);
    }
  }
  if (!prev.has(to)) return null;
  const hops = [{ room: to, door: null }];
  for (let at = to; prev.get(at);) { const p = prev.get(at); hops.unshift({ room: p.room, door: p.door }); at = p.room; }
  return hops;
}

const ok = (m, x, y) => walkable(m, x, y, RADIUS);
const clear = (m, a, b) => {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12);
  for (let i = 1; i < n; i++) if (!ok(m, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  return true;
};

/** A walkable path in one room: A* over the tile grid, then pulled straight where the way is clear. Null when blocked. */
export function pathIn(room, a, b) {
  const m = roomMap(room);
  const cols = m.cols, rows = m.rows;
  const cell = (p) => ({ x: Math.max(0, Math.min(cols - 1, Math.floor(p.x / T))), y: Math.max(0, Math.min(rows - 1, Math.floor(p.y / T))) });
  const open = (cx, cy) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && ok(m, (cx + 0.5) * T, (cy + 0.5) * T);
  const s = cell(a), g = cell(b);
  if (!open(g.x, g.y) && !ok(m, b.x, b.y)) return null;
  if (clear(m, a, b)) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  const key = (c) => c.y * cols + c.x;
  const gScore = new Map([[key(s), 0]]);
  const from = new Map();
  const heap = [{ c: s, f: 0 }];
  const h = (c) => Math.hypot(c.x - g.x, c.y - g.y);
  const done = new Set();
  let found = false;
  while (heap.length) {
    heap.sort((p, q) => q.f - p.f);
    const { c } = heap.pop();
    if (done.has(key(c))) continue;
    done.add(key(c));
    if (c.x === g.x && c.y === g.y) { found = true; break; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = c.x + dx, ny = c.y + dy;
      if (!open(nx, ny)) continue;
      if (dx && dy && !(open(c.x + dx, c.y) && open(c.x, c.y + dy))) continue; // no cutting a corner
      const cost = gScore.get(key(c)) + (dx && dy ? 1.414 : 1);
      const nk = key({ x: nx, y: ny });
      if (cost < (gScore.get(nk) ?? Infinity)) { gScore.set(nk, cost); from.set(nk, c); heap.push({ c: { x: nx, y: ny }, f: cost + h({ x: nx, y: ny }) }); }
    }
  }
  if (!found) return null;
  const cells = [g];
  for (let c = g; from.get(key(c));) { c = from.get(key(c)); cells.unshift(c); }
  const pts = [{ x: a.x, y: a.y }, ...cells.slice(1, -1).map((c) => ({ x: (c.x + 0.5) * T, y: (c.y + 0.5) * T })), { x: b.x, y: b.y }];
  // String pulling: keep a point only when the straight line past it is blocked.
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(m, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

const plen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

/**
 * One walk. from: { room, x, y } where they are; to: { room, spot } (a room's spot), or to: 'away' (out by the cargo ramp).
 * Returns { segments, t0, t1, to } or null when there is no way. Each segment: { room, pts, t0, t1, enter, exit }
 * (enter: the door it came in by or null, exit: the door it leaves by or null), times in seconds.
 */
export function planTrip(from, to, { t0 = 0, speed = NPC_SPEED } = {}) {
  const target = to === AWAY ? { room: 'duchess-cargo', leave: 'ramp' } : { room: to.room };
  const hops = roomRoute(from.room, target.room);
  if (!hops) return null;
  const segments = [];
  let t = t0;
  let pos = { x: from.x, y: from.y };
  for (let i = 0; i < hops.length; i++) {
    const { room } = hops[i];
    const door = hops[i].door || (i === hops.length - 1 ? target.leave || null : null);
    const dest = door ? exitPoint(room, door) : to.spot;
    const pts = pathIn(room, pos, dest);
    if (!pts) return null;
    const dur = plen(pts) / speed + (door ? DOOR_PAUSE : 0);
    segments.push({ room, pts, t0: t, t1: t + dur, enter: i ? hops[i - 1].door : null, exit: door });
    t += dur;
    if (door && hops[i].door) {
      const next = doorsOf(room).find((d) => d.id === door);
      pos = entryPoint(next.to, next.arrive);
    }
  }
  return { segments, t0, t1: t, to };
}

/** Where a trip has them at time t: { room, x, y, angle, moving, done } (the last point once it is over). */
export function positionAt(trip, t) {
  const segs = trip.segments;
  let seg = segs.find((s) => t < s.t1) || segs[segs.length - 1];
  if (t >= seg.t1) { const p = seg.pts[seg.pts.length - 1]; return { room: seg.room, x: p.x, y: p.y, angle: angleOf(seg.pts), moving: false, done: true, gone: trip.to === AWAY }; }
  const dur = Math.max(0.0001, seg.t1 - seg.t0);
  const total = plen(seg.pts);
  const walk = seg.exit ? Math.max(0.0001, dur - DOOR_PAUSE) : dur;
  let d = Math.min(1, Math.max(0, (t - seg.t0) / walk)) * total;
  for (let i = 1; i < seg.pts.length; i++) {
    const a = seg.pts[i - 1], b = seg.pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= l || i === seg.pts.length - 1) {
      const f = l ? Math.min(1, d / l) : 1;
      return { room: seg.room, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x), moving: f < 1 || d < total, done: false };
    }
    d -= l;
  }
  const p = seg.pts[seg.pts.length - 1];
  return { room: seg.room, x: p.x, y: p.y, angle: angleOf(seg.pts), moving: false, done: false };
}
const angleOf = (pts) => (pts.length > 1 ? Math.atan2(pts[pts.length - 1].y - pts[pts.length - 2].y, pts[pts.length - 1].x - pts[pts.length - 2].x) : Math.PI / 2);
const FACE = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };

/**
 * The ledger. now(): the presence clock in seconds. Every person is settled in a room (at their spot there), on a trip, gone
 * (walked off the ship), or downed (a body the map draws).
 */
export function createPresence({ now = () => 0, speed = NPC_SPEED } = {}) {
  const who = new Map(); // id -> { state: 'settled'|'trip'|'gone'|'down', room?, trip?, to? }
  const ids = new Set(); // the same ids, kept as one Set the world can ask about every frame
  const tNow = () => now();

  function where(id, t = tNow()) {
    const w = who.get(id);
    if (!w || w.state === 'gone' || w.state === 'down') return null;
    if (w.state === 'settled') {
      const s = spotIn(w.room, id);
      return s ? { room: w.room, x: s.x, y: s.y, angle: FACE[s.face] ?? Math.PI / 2, moving: false, settled: true, spot: s } : { room: w.room, x: 0, y: 0, angle: 0, moving: false, settled: true, spot: null };
    }
    const p = positionAt(w.trip, t);
    if (p.done) {
      if (p.gone) return null;
      const s = spotIn(w.to.room, id);
      return { room: p.room, x: p.x, y: p.y, angle: s ? FACE[s.face] ?? p.angle : p.angle, moving: false, settled: true, spot: s };
    }
    return { ...p, settled: false };
  }

  const api = {
    /** Stand someone in a room, at their spot there, right now (a reload, the start of the game). */
    settle(id, room) { who.set(id, { state: 'settled', room }); ids.add(id); return api; },
    /** A body on the floor, or someone who has left for good: no walking, nothing in any room. */
    down(id) { who.set(id, { state: 'down' }); ids.add(id); return api; },
    gone(id) { who.set(id, { state: 'gone' }); ids.add(id); return api; },
    /** Send someone to a room (or AWAY). They walk from wherever they are now. Returns the arrival time, or null when no route. */
    send(id, room, at = tNow()) {
      const w = who.get(id);
      if (w?.state === 'down' || w?.state === 'gone') return null;
      const target = room === AWAY ? AWAY : { room, spot: null };
      if (target !== AWAY) {
        const s = spotIn(room, id);
        if (!s) return null;
        target.spot = { x: s.x, y: s.y };
      }
      const here = w ? where(id, at) : null;
      if (here && target !== AWAY && here.settled && here.room === room) return at;
      if (!here) return null;
      const trip = planTrip({ room: here.room, x: here.x, y: here.y }, target, { t0: at, speed });
      if (!trip) return null;
      who.set(id, { state: 'trip', trip, to: target });
      return trip.t1;
    },
    where,
    /** Is this person standing in this room (arrived, or settled there) at time t? */
    isIn(id, room, t = tNow()) { const p = where(id, t); return Boolean(p && p.settled && p.room === room); },
    /** When someone is where they are going (now when settled). Infinity for someone who is down or gone. */
    arrival(id) { const w = who.get(id); if (!w) return Infinity; if (w.state === 'trip') return w.trip.t1; return w.state === 'settled' ? tNow() : Infinity; },
    /** Everyone a room holds at time t: settled at their spot, or crossing it on a trip. [{ id, x, y, angle, moving, puppet, spot }] */
    entries(room, t = tNow()) {
      const out = [];
      for (const id of who.keys()) {
        const p = where(id, t);
        if (!p || p.room !== room) continue;
        out.push({ id, x: p.x, y: p.y, angle: p.angle, moving: p.moving, puppet: !p.settled, spot: p.spot || null });
      }
      return out;
    },
    /** Who the ledger runs (the world leaves their map entries alone no longer). */
    get managed() { return ids; },
    state(id) { return who.get(id)?.state || null; },
    /** Where they are heading (or standing): a room id, AWAY, or null for a body or someone gone. */
    dest(id) { const w = who.get(id); if (!w) return null; if (w.state === 'trip') return w.to === AWAY ? AWAY : w.to.room; return w.state === 'settled' ? w.room : null; },
    room(id, t = tNow()) { return where(id, t)?.room ?? null; },
    clear() { who.clear(); ids.clear(); },
  };
  return api;
}

/**
 * The bodies a door must not close on (and a vestibule cycle must wait for): the player and anyone who is not run by the ledger.
 * The crew open doors as they come but never hold one, so a person walking through a door can never keep the player waiting.
 */
export const gapBodies = (walker, npcs, managed = null) => [walker, ...npcs.filter((n) => !(managed && managed.has(n.id)))];
