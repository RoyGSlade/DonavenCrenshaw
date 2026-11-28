// Real-time stealth on foot. Pure: no DOM, no clock. The page (onfoot/stealthLayer.js) feeds it the player each frame and draws it.
//
// What it does (Donaven, 2026-11-18: "a real walking minigame, realtime cones on enemies, fog of war; if you haven't peaked 1.5 seconds
// in an enemy's cone that enemy will inspect your current location, 3 seconds and all enemies alerted; collisions on items block los;
// if you get behind one you can take them down"):
//   - every guard has a live view cone; walls and props (every solid) clip it, so a crate leaves a shadow behind it;
//   - time in a cone fills that guard's meter. At 1.5 s the guard goes to inspect the spot where you stand. At 3 s every guard is alerted
//     (they converge, search, then stand down). Out of the cone the meter drains slowly (faster with Decay points);
//   - noise: sneaking is nearly silent, walking carries a little, running carries far (muffled by walls); a heard step turns a guard to
//     look at the sound but never fills a meter;
//   - silent takedown from behind an unaware guard in reach; the body stays and another guard can find it;
//   - fog of war: your sight is a clipped circle; what is outside it is hidden (the page dims it and hides guards in it);
//   - stealth points: Quiet shrinks noise, Range shortens and narrows cones, Decay drains the meter faster (liveTuning).
// The d20 is not used: live stealth is pure play, like shooting.
import { segRect, wrapAngle, moveCircle } from './geom.js';
import { setupStealth } from '../../minigames/setup.js';

const EPS = 1e-6;
const FACES = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };

export const STEALTH = Object.freeze({
  inspectAt: 1.5, alertAt: 3,
  coneTiles: 6, half: 0.6, alertConeScale: 1.2,
  drain: 0.4,
  sightTiles: 7.5,
  noise: Object.freeze({ sneak: 0.7, walk: 2.4, run: 6 }), // tiles, before the Quiet points
  speed: Object.freeze({ sneak: 70, walk: 130, run: 215 }), // px per second
  guardSpeed: Object.freeze({ patrol: 62, inspect: 95, alert: 125, return: 85 }),
  searchTime: 12, lookTime: 1.4, inspectLook: 2.5, searchRadius: 2.5,
  turn: 3.6, lookTurn: 8,
  takedownReach: 54, behind: 1.83, catchDist: 34, takedownLock: 0.45,
});

/** The live numbers for a character's stealth points (the same Quiet / Range / Decay as shadow slip; the d20 tier plays no part). */
export function liveTuning({ points = {}, level = 9 } = {}) {
  const s = setupStealth({ tier: 0, points, level });
  return {
    coneTiles: STEALTH.coneTiles * s.rangeFactor,
    half: STEALTH.half * (1 - (1 - s.rangeFactor) / 2),
    drain: STEALTH.drain * (s.decay / 8),
    noise: { sneak: STEALTH.noise.sneak * s.noiseFactor, walk: STEALTH.noise.walk * s.noiseFactor, run: STEALTH.noise.run * s.noiseFactor },
    points: s.points,
  };
}

// ---- geometry --------------------------------------------------------------------------------------------------------------
/** Is the straight line a to b open? Every solid (walls, crates, consoles) blocks it. */
export function hasLos(rects, ax, ay, bx, by) {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
  for (const r of rects) {
    if (r.x > x1 || r.x + r.w < x0 || r.y > y1 || r.y + r.h < y0) continue;
    const t = segRect(ax, ay, bx, by, r);
    if (t !== null && t < 0.999) return false;
  }
  return true;
}

/** How far a ray from (ox, oy) at `angle` runs before a solid (or `maxLen`). */
export function castRay(rects, ox, oy, angle, maxLen) {
  const dx = Math.cos(angle) * maxLen, dy = Math.sin(angle) * maxLen;
  let best = 1;
  const x0 = Math.min(ox, ox + dx), x1 = Math.max(ox, ox + dx), y0 = Math.min(oy, oy + dy), y1 = Math.max(oy, oy + dy);
  for (const r of rects) {
    if (r.x > x1 || r.x + r.w < x0 || r.y > y1 || r.y + r.h < y0) continue;
    const t = segRect(ox, oy, ox + dx, oy + dy, r);
    if (t !== null && t < best) best = t;
  }
  return best * maxLen;
}

/**
 * The area seen from a point: a fan of rays from `angle - half` to `angle + half` (half >= PI: all round), each cut short by the first solid
 * or by `radius`. Returns the polygon as points (the origin first for a fan). The one function both the guards' cones and your own sight use.
 */
export function viewPolygon(rects, ox, oy, { angle = 0, half = Math.PI, radius = 300, step = 0.05 } = {}) {
  const full = half >= Math.PI - 1e-9;
  const near = rects.filter((r) => r.x <= ox + radius && r.x + r.w >= ox - radius && r.y <= oy + radius && r.y + r.h >= oy - radius);
  const rel = new Set();
  const add = (a) => {
    let d = wrapAngle(a - angle);
    if (!full) { if (d < -half - 1e-9 || d > half + 1e-9) return; d = Math.max(-half, Math.min(half, d)); }
    rel.add(Math.round(d * 1e6) / 1e6);
  };
  if (!full) { add(angle - half); add(angle + half); }
  for (let a = -(full ? Math.PI : half); a <= (full ? Math.PI : half) + 1e-9; a += step) rel.add(Math.round(a * 1e6) / 1e6);
  for (const r of near) {
    for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      if (Math.hypot(cx - ox, cy - oy) > radius * 1.5) continue;
      const a = Math.atan2(cy - oy, cx - ox);
      add(a - 1e-4); add(a); add(a + 1e-4);
    }
  }
  const angles = [...rel].sort((p, q) => p - q);
  const pts = angles.map((d) => { const a = angle + d, len = castRay(near, ox, oy, a, radius); return { x: ox + Math.cos(a) * len, y: oy + Math.sin(a) * len }; });
  return full ? pts : [{ x: ox, y: oy }, ...pts];
}

export function pointInPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return Math.abs(s) / 2;
}

/** Does a guard ({ x, y, angle }) see a point with a cone { len, half }? In range, inside the angle, and nothing in the way. */
export function coneSees(rects, g, target, cone) {
  const dx = target.x - g.x, dy = target.y - g.y, d = Math.hypot(dx, dy);
  if (d > cone.len) return false;
  if (d > 1 && Math.abs(wrapAngle(Math.atan2(dy, dx) - g.angle)) > cone.half) return false;
  return hasLos(rects, g.x, g.y, target.x, target.y);
}

// ---- paths -----------------------------------------------------------------------------------------------------------------
const blockedCache = new WeakMap();
function blockedTiles(map) {
  if (blockedCache.has(map)) return blockedCache.get(map);
  const T = map.tile, cols = Math.ceil(map.w / T), rows = Math.ceil(map.h / T), blocked = new Uint8Array(cols * rows);
  for (const s of map.solids) {
    for (let ty = Math.floor((s.y + 0.5) / T); ty <= Math.floor((s.y + s.h - 0.5) / T); ty++) for (let tx = Math.floor((s.x + 0.5) / T); tx <= Math.floor((s.x + s.w - 0.5) / T); tx++) if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) blocked[ty * cols + tx] = 1;
  }
  const out = { cols, rows, blocked };
  blockedCache.set(map, out);
  return out;
}
/** Can a body of this radius walk straight from a to b? (every solid, padded by the radius). */
export function clearWalk(rects, a, b, pad = 13) {
  for (const r of rects) {
    if (Math.max(a.x, b.x) < r.x - pad || Math.min(a.x, b.x) > r.x + r.w + pad || Math.max(a.y, b.y) < r.y - pad || Math.min(a.y, b.y) > r.y + r.h + pad) continue;
    if (segRect(a.x, a.y, b.x, b.y, r, pad) !== null) return false;
  }
  return true;
}
/**
 * A walkable route from `from` to `to` (world px) on the tile grid, smoothed, not counting the start. The end is `to` itself when that
 * spot is open, else the open tile beside it (a console you walk up to). null when there is no way.
 */
export function findPath(map, from, to) {
  const { cols, rows, blocked } = blockedTiles(map), T = map.tile;
  const tile = (p) => [Math.max(0, Math.min(cols - 1, Math.floor(p.x / T))), Math.max(0, Math.min(rows - 1, Math.floor(p.y / T)))];
  const free = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !blocked[y * cols + x];
  let [sx, sy] = tile(from);
  const [tx, ty] = tile(to);
  const goalOpen = free(tx, ty);
  if (!free(sx, sy)) { const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [sx + dx, sy + dy]).find(([x, y]) => free(x, y)); if (!near) return null; [sx, sy] = near; }
  const isGoal = (x, y) => (goalOpen ? x === tx && y === ty : free(x, y) && Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1);
  const prev = new Map(), q = [[sx, sy]], key = (x, y) => y * cols + x;
  prev.set(key(sx, sy), -1);
  let end = null;
  for (let h = 0; h < q.length && !end; h++) {
    const [x, y] = q[h];
    if (isGoal(x, y)) { end = [x, y]; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!free(nx, ny) || prev.has(key(nx, ny))) continue;
      if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue; // no cutting corners
      prev.set(key(nx, ny), key(x, y));
      q.push([nx, ny]);
    }
  }
  if (!end) return null;
  const cells = [];
  for (let k = key(end[0], end[1]); k !== -1; k = prev.get(k)) cells.push({ x: (k % cols + 0.5) * T, y: (Math.floor(k / cols) + 0.5) * T });
  cells.reverse();
  cells.shift(); // the start tile
  if (goalOpen && cells.length) cells[cells.length - 1] = { x: to.x, y: to.y };
  else if (goalOpen) cells.push({ x: to.x, y: to.y });
  // String-pulling: skip every point a body can walk past in a straight line.
  const out = [], from0 = { x: from.x, y: from.y };
  let at = from0, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearWalk(map.solids, at, cells[j])) j--;
    out.push(cells[j]); at = cells[j]; i = j + 1;
  }
  return out;
}

// ---- takedowns -------------------------------------------------------------------------------------------------------------
export const UNAWARE = Object.freeze(['patrol', 'look', 'return']);
/** Can this player ({ x, y }) take this guard down? Unaware, in reach, behind it, nothing in the way. */
export function takedownOf(g, player, rects) {
  if (!UNAWARE.includes(g.state)) return false;
  const dx = player.x - g.x, dy = player.y - g.y;
  if (Math.hypot(dx, dy) > STEALTH.takedownReach) return false;
  if (Math.abs(wrapAngle(Math.atan2(dy, dx) - g.angle)) < STEALTH.behind) return false;
  return hasLos(rects, g.x, g.y, player.x, player.y);
}

// ---- the simulation --------------------------------------------------------------------------------------------------------
const turnToward = (g, want, rate, dt) => { const d = wrapAngle(want - g.angle); g.angle = wrapAngle(g.angle + Math.max(-rate * dt, Math.min(rate * dt, d))); };

/**
 * createStealth({ map, def?, tuning?, seed? }): the guards of a map's `stealth` block, live.
 *   map.def.stealth = { guards: [{ id, path: [[tx, ty], ...], mode: 'loop' | 'pingpong', pause, face, sweep, speed }] }  (tile coordinates)
 *   step(dt, { x, y, gait: 'sneak' | 'walk' | 'run', moving }) -> events [{ type, ... }]
 *     types: inspect, alarm, heard, takedown, body-found, stand-down, caught
 */
export function createStealth({ map, def = map.def?.stealth, tuning = liveTuning(), seed = 1 }) {
  const T = map.tile, solids = map.solids;
  const cone = { len: tuning.coneTiles * T, half: tuning.half };
  const noiseR = { sneak: tuning.noise.sneak * T, walk: tuning.noise.walk * T, run: tuning.noise.run * T };
  const sight = STEALTH.sightTiles * T;
  let rng = seed >>> 0 || 1;
  const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const px = ([x, y]) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T });

  const sim = { map, solids, tuning, guards: [], alarm: null, stats: null, caught: false, player: null, time: 0, pending: [] };
  let visCache = null;
  const emit = (e) => { sim.pending.push(e); return e; };

  function build() {
    sim.guards = (def?.guards || []).map((d, i) => {
      const path = (d.path || [[1, 1]]).map(px);
      const start = path[0];
      const heading = d.face != null ? FACES[d.face] ?? 0 : path.length > 1 ? Math.atan2(path[1].y - start.y, path[1].x - start.x) : 0;
      return {
        id: d.id || `g${i + 1}`, x: start.x, y: start.y, angle: heading, base: heading, state: 'patrol', meter: 0, radius: 12,
        path, pi: path.length > 1 ? 1 : 0, dir: 1, mode: d.mode || 'loop', pause: d.pause ?? 1, speed: d.speed ?? STEALTH.guardSpeed.patrol, sweep: d.sweep ?? 0, phase: i * 1.7,
        wait: 0, route: [], target: null, reason: null, lookT: 0, lookAngle: heading, dwell: 0, repath: 0, found: false, heardAt: -9, seen: false,
      };
    });
    sim.alarm = { on: false, at: null, timer: 0, by: null };
    sim.stats = { inspects: 0, alarms: 0, takedowns: 0, caught: 0, seen: 0, seconds: 0 };
    sim.caught = false; sim.time = 0; sim.pending = []; visCache = null;
  }
  build();

  const coneOf = (g) => (g.state === 'alert' ? { len: cone.len * STEALTH.alertConeScale, half: Math.min(1.1, cone.half * 1.1) } : cone);
  const live = (g) => g.state !== 'down';

  function routeTo(g, to) { g.route = findPath(map, g, to) || []; return g.route.length > 0; }
  /** Walk along g.route at `speed`; true when the route is spent. */
  function follow(g, dt, speed, turn = STEALTH.turn) {
    while (g.route.length && Math.hypot(g.route[0].x - g.x, g.route[0].y - g.y) < 5) g.route.shift();
    if (!g.route.length) return true;
    const w = g.route[0], dx = w.x - g.x, dy = w.y - g.y, d = Math.hypot(dx, dy), s = Math.min(d, speed * dt);
    moveCircle(g, (dx / d) * s, (dy / d) * s, g.radius, solids, map);
    turnToward(g, Math.atan2(dy, dx), turn * 1.6, dt);
    return false;
  }

  function patrol(g, dt) {
    if (g.path.length === 1) {
      const want = g.base + (g.sweep ? Math.sin(sim.time * 0.9 + g.phase) * g.sweep : 0);
      turnToward(g, want, STEALTH.turn, dt);
      const home = g.path[0], off = Math.hypot(home.x - g.x, home.y - g.y);
      if (off > 6) { g.route = [home]; follow(g, dt, STEALTH.guardSpeed.return); }
      return;
    }
    const w = g.path[g.pi], dx = w.x - g.x, dy = w.y - g.y, d = Math.hypot(dx, dy);
    if (g.wait > 0) {
      g.wait -= dt;
      const nx = g.path[nextIndex(g)];
      turnToward(g, Math.atan2(nx.y - g.y, nx.x - g.x), STEALTH.turn, dt);
      if (g.wait <= 0) g.pi = nextIndex(g, true);
      return;
    }
    if (d < 6) { g.wait = g.pause; if (g.wait <= 0) g.pi = nextIndex(g, true); return; }
    g.route = [w];
    follow(g, dt, g.speed);
  }
  function nextIndex(g, commit = false) {
    const n = g.path.length;
    if (g.mode === 'pingpong') {
      let d = g.dir, i = g.pi + d;
      if (i < 0 || i >= n) { d = -d; i = g.pi + d; }
      if (commit) g.dir = d;
      return i;
    }
    return (g.pi + 1) % n;
  }

  function startInspect(g, at, reason) {
    g.state = 'inspect'; g.target = { x: at.x, y: at.y }; g.reason = reason; g.dwell = 0; g.repath = 0;
    routeTo(g, at);
  }

  function raiseAlarm(at, by = null, cause = 'seen') {
    const a = sim.alarm;
    a.at = { x: at.x, y: at.y }; a.timer = STEALTH.searchTime;
    if (a.on) return;
    a.on = true; a.by = by; sim.stats.alarms++;
    emit({ type: 'alarm', by, cause, at: { ...a.at } });
    for (const g of sim.guards) if (live(g)) { g.state = 'alert'; g.meter = STEALTH.alertAt; g.dwell = 0; g.repath = 0; routeTo(g, a.at); }
  }
  function standDown() {
    sim.alarm.on = false; sim.alarm.by = null;
    for (const g of sim.guards) if (live(g)) { g.state = 'return'; g.meter = 0; g.dwell = 0; g.route = []; routeTo(g, g.path[g.pi]); }
    emit({ type: 'stand-down' });
  }

  function alertStep(g, dt, p) {
    g.repath -= dt;
    if (g.route.length) { follow(g, dt, STEALTH.guardSpeed.alert); return; }
    if (g.dwell > 0) { g.dwell -= dt; g.angle = wrapAngle(g.angle + 1.8 * dt); return; }
    // Search near the spot: a few open points round it.
    for (let tries = 0; tries < 8; tries++) {
      const r = STEALTH.searchRadius * T, a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      const to = { x: sim.alarm.at.x + Math.cos(a) * d, y: sim.alarm.at.y + Math.sin(a) * d };
      if (routeTo(g, to)) break;
    }
    g.dwell = 0.8 + rand() * 0.8;
  }

  function inspectStep(g, dt, p, sees) {
    if (sees) { g.target = { x: p.x, y: p.y }; g.repath -= dt; if (g.repath <= 0) { g.repath = 0.4; routeTo(g, g.target); } }
    if (g.route.length) { follow(g, dt, STEALTH.guardSpeed.inspect); return; }
    if (g.reason === 'body' && g.bodyAt) { // it reached a body: that is an alarm
      if (Math.hypot(g.bodyAt.x - g.x, g.bodyAt.y - g.y) < 70) { raiseAlarm(g.bodyAt, g.id, 'body'); return; }
    }
    // At the spot: look about, then go back to the post.
    if (g.dwell === 0) g.dwell = STEALTH.inspectLook;
    g.dwell -= dt;
    g.angle = wrapAngle(g.angle + Math.sin(g.dwell * 2.2) * 1.8 * dt + 0.5 * dt);
    if (g.dwell <= 0) { g.dwell = 0; g.state = 'return'; g.reason = null; routeTo(g, g.path[g.pi]); }
  }

  function step(dt, player) {
    sim.player = player ? { x: player.x, y: player.y, gait: player.gait || 'walk', moving: Boolean(player.moving) } : sim.player;
    const p = sim.player;
    sim.time += dt; sim.stats.seconds += dt; visCache = null;
    if (!p || sim.caught) return sim.pending.splice(0);
    // Noise: a step you can hear turns an unaware guard to look at it. It never fills a meter.
    if (p.moving) {
      const r = noiseR[p.gait] ?? noiseR.walk;
      for (const g of sim.guards) {
        if (!['patrol', 'return', 'look'].includes(g.state)) continue;
        let d = Math.hypot(g.x - p.x, g.y - p.y);
        if (!hasLos(solids, g.x, g.y, p.x, p.y)) d *= 1.6;
        if (d > r) continue;
        g.state = 'look'; g.lookT = STEALTH.lookTime; g.lookAngle = Math.atan2(p.y - g.y, p.x - g.x);
        if (sim.time - g.heardAt > 0.5) emit({ type: 'heard', guard: g.id, gait: p.gait, at: { x: p.x, y: p.y } });
        g.heardAt = sim.time;
      }
    }
    // The guards: move, then watch.
    let seenAny = false;
    for (const g of sim.guards) {
      if (!live(g)) continue;
      if (g.state === 'patrol') patrol(g, dt);
      else if (g.state === 'look') { turnToward(g, g.lookAngle, STEALTH.lookTurn, dt); g.lookT -= dt; if (g.lookT <= 0) g.state = 'patrol'; }
      else if (g.state === 'return') { if (follow(g, dt, STEALTH.guardSpeed.return)) { g.state = 'patrol'; } }
      const sees = coneSees(solids, g, p, coneOf(g));
      if (sees) { seenAny = true; g.meter = Math.min(STEALTH.alertAt, g.meter + dt); if (!g.seen) g.seen = true; } else { g.seen = false; if (g.state !== 'alert') g.meter = Math.max(0, g.meter - tuning.drain * dt); }
      if (g.state === 'alert') {
        alertStep(g, dt, p);
        if (sees) { sim.alarm.at = { x: p.x, y: p.y }; sim.alarm.timer = STEALTH.searchTime; if (g.repath <= 0) { g.repath = 0.35; routeTo(g, p); } }
        if (sees && Math.hypot(g.x - p.x, g.y - p.y) <= STEALTH.catchDist) { sim.caught = true; sim.stats.caught++; emit({ type: 'caught', guard: g.id }); break; }
        continue;
      }
      if (g.state === 'inspect') inspectStep(g, dt, p, sees);
      if (sees && g.meter >= STEALTH.alertAt - EPS) { raiseAlarm(p, g.id, 'seen'); continue; }
      if (sees && g.meter >= STEALTH.inspectAt - EPS && UNAWARE.includes(g.state)) { sim.stats.inspects++; startInspect(g, p, 'seen'); emit({ type: 'inspect', guard: g.id, at: { x: p.x, y: p.y } }); }
    }
    if (seenAny) sim.stats.seen += dt;
    if (sim.caught) return sim.pending.splice(0);
    // A body in a cone is found.
    for (const b of sim.guards) {
      if (b.state !== 'down' || b.found) continue;
      for (const g of sim.guards) {
        if (!live(g) || !UNAWARE.includes(g.state) || !coneSees(solids, g, b, coneOf(g))) continue;
        b.found = true; g.bodyAt = { x: b.x, y: b.y };
        emit({ type: 'body-found', guard: g.id, body: b.id, at: { ...g.bodyAt } });
        startInspect(g, b, 'body');
        break;
      }
    }
    // The alarm winds down when nobody has seen you for a while.
    if (sim.alarm.on && !seenAny) { sim.alarm.timer -= dt; if (sim.alarm.timer <= 0) standDown(); }
    return sim.pending.splice(0);
  }

  Object.assign(sim, {
    step, raiseAlarm: (at, by) => raiseAlarm(at, by, 'test'), coneOf,
    canTakedown(player) {
      let best = null, bd = Infinity;
      for (const g of sim.guards) { if (!takedownOf(g, player, solids)) continue; const d = Math.hypot(g.x - player.x, g.y - player.y); if (d < bd) { bd = d; best = g; } }
      return best;
    },
    takedown(id, player) {
      const g = sim.guards.find((x) => x.id === id);
      if (!g || !takedownOf(g, player, solids)) return false;
      g.state = 'down'; g.meter = 0; g.route = []; g.found = false; sim.stats.takedowns++;
      emit({ type: 'takedown', guard: g.id, at: { x: g.x, y: g.y } });
      return true;
    },
    /** Is a world point inside your sight? (round you, out to the sight radius, with nothing in the way.) */
    isVisible(x, y) {
      const p = sim.player;
      if (!p) return false;
      return Math.hypot(x - p.x, y - p.y) <= sight && hasLos(solids, p.x, p.y, x, y);
    },
    /** Your sight as a polygon (for the fog). */
    vision() {
      const p = sim.player;
      if (!p) return [];
      return (visCache ||= viewPolygon(solids, p.x, p.y, { radius: sight, step: 0.07 }));
    },
    sightRadius: sight,
    reset() { build(); },
    /** A copy of everything that changes (guards, alarm, counts, the dice), for a bot or a test to look ahead and come back. */
    save() { return structuredClone({ guards: sim.guards, alarm: sim.alarm, stats: sim.stats, caught: sim.caught, time: sim.time, rng, player: sim.player }); },
    load(snap) { const c = structuredClone(snap); sim.guards = c.guards; sim.alarm = c.alarm; sim.stats = c.stats; sim.caught = c.caught; sim.time = c.time; rng = c.rng; sim.player = c.player; sim.pending = []; visCache = null; },
  });
  return sim;
}
