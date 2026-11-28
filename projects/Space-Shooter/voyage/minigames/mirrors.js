// Hacking v2: mirrors, a portal and firewalls (Donaven 2026-11-18). Pure and seeded: no DOM, no clock of its own.
//
// A hack is a row of firewalls (stages). Each stage is a board with an emitter on the left, a firewall target, mirrors
// you can turn, and some decoy mirrors. You:
//   1. select a mirror and hold to turn it (one step = 7.5 degrees) until the previewed beam runs emitter -> mirrors -> firewall;
//   2. open the portal with a timed catch: a marker sweeps a bar, press when it is inside the window;
//   3. fire: a projectile follows the mirror path and breaks the firewall if the path ends on it.
// Each firewall is timed. Out of time: the mirrors and the portal reset on the SAME seed (same board, same catch window) and
// a retry is spent. No retries left: the hack fails and the world answers by context (security is alerted, and on foot the
// terminal locks, on a ship a port closes, in ship to ship combat you must target a new section).
//
// Every board is built backwards from a solution: a beam path with mirrors at its bounces whose angles are on the 7.5 degree
// grid (beam directions on a 15 degree grid), so every board is solvable. The path is traced to check it.
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { setupHack } from './setup.js';

export const FIELD = Object.freeze({ w: 160, h: 100 });
export const MIRROR = Object.freeze({ half: 8.5, box: 20 }); // half the mirror's length and the side of the box you click, in field units
export const STEPS = 24; // a mirror's orientation repeats every half turn: 24 steps of 7.5 degrees
export const STEP_RAD = Math.PI / STEPS;
export const TURN_SECONDS = 0.09; // holding a mirror turns one step this often (about 83 degrees a second)
export const PROJECTILE_SPEED = 95; // field units a second
export const CATCH_COOLDOWN = 0.6; // after a missed catch
const SEP = 26; // the least distance between any two mirrors
const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const DEG = Math.PI / 180;

/** What the world does when the last retry is gone, by context: { security, terminal | port | section, line }. */
export const CONSEQUENCES = Object.freeze({
  foot: Object.freeze({ security: 'alerted', terminal: 'locked', find: 'a new terminal', line: 'Security is alerted. This terminal is locked for breach attempts: find a new terminal.' }),
  ship: Object.freeze({ security: 'alerted', port: 'closed', find: 'a new way in', line: 'Security is alerted. The ship has closed its ports to this entry: find a new one.' }),
  combat: Object.freeze({ security: 'alerted', section: 'changed', find: 'a new section', line: 'Security is alerted. They sealed that section: target a new section of the ship.' }),
});
export const CONTEXTS = Object.freeze(Object.keys(CONSEQUENCES));

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** The mirror's end points for an orientation step. */
export function mirrorEnds(m, step) {
  const a = step * STEP_RAD; const dx = Math.cos(a) * MIRROR.half, dy = Math.sin(a) * MIRROR.half;
  return [m.x - dx, m.y - dy, m.x + dx, m.y + dy];
}

/**
 * Follow the beam from the emitter through the mirrors at `angles` (a step for each mirror, by index).
 * Returns { pts: [[x, y], ...], hit, bounces, via: [mirror index, ...], length }. The beam stops at the firewall (hit),
 * at the field's edge, or after `max` bounces.
 */
export function trace(layout, angles, { max = 12 } = {}) {
  const { emitter, target, mirrors } = layout;
  let x = emitter.x, y = emitter.y, dx = Math.cos(emitter.dir), dy = Math.sin(emitter.dir);
  const pts = [[x, y]], via = []; let hit = false, from = -1, length = 0;
  for (let n = 0; n <= max; n++) {
    let best = Infinity, kind = 'edge', which = -1;
    // the field's edge
    for (const [t, ok] of [[dx > 0 ? (FIELD.w - x) / dx : dx < 0 ? -x / dx : Infinity, true], [dy > 0 ? (FIELD.h - y) / dy : dy < 0 ? -y / dy : Infinity, true]]) if (ok && t > 1e-6 && t < best) best = t;
    // the firewall (a circle)
    { const fx = x - target.x, fy = y - target.y; const b = fx * dx + fy * dy, c = fx * fx + fy * fy - target.r * target.r; const disc = b * b - c;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 1e-6 && t < best) { best = t; kind = 'target'; } } }
    // the mirrors
    mirrors.forEach((m, i) => {
      if (i === from) return;
      const [ax, ay, bx, by] = mirrorEnds(m, angles[i]);
      const ex = bx - ax, ey = by - ay; const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) return;
      const t = ((ax - x) * ey - (ay - y) * ex) / den; const u = ((ax - x) * dy - (ay - y) * dx) / den;
      if (t > 1e-6 && u >= 0 && u <= 1 && t < best) { best = t; kind = 'mirror'; which = i; }
    });
    x += dx * best; y += dy * best; length += best; pts.push([x, y]);
    if (kind === 'target') { hit = true; break; }
    if (kind === 'edge') break;
    // reflect about the mirror's line
    const a = angles[which] * STEP_RAD; const mx = Math.cos(a), my = Math.sin(a); const dot = dx * mx + dy * my;
    dx = 2 * dot * mx - dx; dy = 2 * dot * my - dy; from = which; via.push(which);
  }
  return { pts, hit, bounces: via.length, via, length };
}

/**
 * The board for one firewall: { emitter, target, mirrors: [{ id, x, y, solved, start, decoy }], solved: [step...], start: [step...] }.
 * `path` mirrors have a `solved` step; decoys have solved = null. Deterministic from (seed, stage).
 */
export function createLayout({ seed = 1, stage = 0, mirrors = 2, decoys = 1, spread = 12 } = {}) {
  let rng = hashSeed('mirrors', seed, stage, mirrors, decoys, Math.trunc(spread) || 12);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const pick = (a) => a[Math.min(a.length - 1, Math.floor(rand() * a.length))];
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const radius = 5.5;
  const margin = 15;
  for (let attempt = 0; attempt < 400; attempt++) {
    // a beam path built forwards: emitter, then a mirror at each bounce, then the firewall
    const emitter = { x: 9, y: Math.round(between(22, 78)), dir: pick([-45, -30, -15, 0, 15, 30, 45]) * DEG };
    let x = emitter.x, y = emitter.y, dirDeg = Math.round(emitter.dir / DEG);
    const path = []; let ok = true;
    for (let k = 0; k < mirrors && ok; k++) {
      const len = between(28, 56);
      const nx = Math.round((x + Math.cos(dirDeg * DEG) * len) * 10) / 10, ny = Math.round((y + Math.sin(dirDeg * DEG) * len) * 10) / 10;
      if (nx < margin || nx > FIELD.w - margin - 6 || ny < margin || ny > FIELD.h - margin) { ok = false; break; }
      const turns = [-105, -90, -75, -60, 60, 75, 90, 105].filter((d) => {
        const nd = (dirDeg + d) * DEG; const fx = nx + Math.cos(nd) * 30, fy = ny + Math.sin(nd) * 30; return fx > margin && fx < FIELD.w - margin && fy > margin - 4 && fy < FIELD.h - margin + 4;
      });
      if (!turns.length) { ok = false; break; }
      const nextDir = dirDeg + pick(turns);
      // mirror line = bisector of the incoming and outgoing directions, on the 7.5 degree grid
      const solved = mod(Math.round(((dirDeg + nextDir) / 2) / 7.5), STEPS);
      path.push({ x: nx, y: ny, solved });
      x = nx; y = ny; dirDeg = nextDir;
    }
    if (!ok) continue;
    const last = between(26, 50);
    const tx = x + Math.cos(dirDeg * DEG) * last, ty = y + Math.sin(dirDeg * DEG) * last;
    if (tx < margin + 6 || tx > FIELD.w - margin || ty < margin || ty > FIELD.h - margin) continue;
    const tgt = { x: Math.round(tx * 10) / 10, y: Math.round(ty * 10) / 10, r: radius };
    // separation: mirrors apart from each other, and clear of the emitter and the firewall
    const all = path.map((m) => [m.x, m.y]);
    let apart = true;
    for (let i = 0; i < all.length && apart; i++) {
      for (let j = i + 1; j < all.length; j++) if (Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]) < SEP) { apart = false; break; }
      if (Math.hypot(all[i][0] - tgt.x, all[i][1] - tgt.y) < 22 || Math.hypot(all[i][0] - emitter.x, all[i][1] - emitter.y) < 22) apart = false;
    }
    if (!apart) continue;
    const list = path.map((m, i) => ({ id: i, x: m.x, y: m.y, solved: m.solved, start: 0, decoy: false }));
    const solvedAngles = list.map((m) => m.solved);
    let layout = { emitter, target: tgt, mirrors: list };
    const t0 = trace(layout, solvedAngles);
    if (!t0.hit || t0.bounces !== mirrors || t0.via.some((v, i) => v !== i)) continue;
    // decoys: loose mirrors clear of the solved beam, of each other and of the ends
    const beam = t0.pts;
    let allPlaced = true;
    for (let k = 0; k < decoys; k++) {
      let placed = false;
      for (let tries = 0; tries < 80 && !placed; tries++) {
        const dx = Math.round(between(margin, FIELD.w - margin) * 10) / 10, dy = Math.round(between(margin, FIELD.h - margin) * 10) / 10;
        if (list.some((m) => Math.hypot(m.x - dx, m.y - dy) < SEP)) continue;
        if (Math.hypot(dx - tgt.x, dy - tgt.y) < 22 || Math.hypot(dx - emitter.x, dy - emitter.y) < 22) continue;
        let clear = true;
        for (let s = 0; s + 1 < beam.length; s++) if (segDist(dx, dy, beam[s][0], beam[s][1], beam[s + 1][0], beam[s + 1][1]) < 14) { clear = false; break; }
        if (!clear) continue;
        list.push({ id: list.length, x: dx, y: dy, solved: null, start: 0, decoy: true });
        placed = true;
      }
      if (!placed) { allPlaced = false; break; }
    }
    if (!allPlaced) continue;
    // scramble: every path mirror starts 3 to `spread` steps (22.5 degrees up to half a turn) from its solution, either way round
    const far = Math.max(3, Math.min(STEPS / 2, Math.trunc(spread) || 12));
    for (const m of list) {
      if (m.decoy) { m.start = Math.floor(rand() * STEPS) % STEPS; continue; }
      const off = 3 + Math.floor(rand() * (far - 3 + 1)); m.start = mod(m.solved + (rand() < 0.5 ? -off : off), STEPS);
    }
    layout = { emitter, target: tgt, mirrors: list, solved: list.map((m) => m.solved), start: list.map((m) => m.start) };
    // the starting board must not already break the firewall (it has to be a puzzle)
    if (trace(layout, layout.start).hit) continue;
    // and with the decoys in, the solved beam still reaches the firewall
    if (!trace(layout, layout.solved.map((s, i) => s ?? layout.start[i])).hit) continue;
    return layout;
  }
  throw new Error('mirror layout: no board for this seed');
}

/** The catch for a stage: where the window is on the 0..1 bar and where the marker starts, from the seed. */
export function catchFor({ seed = 1, stage = 0, window = 0.2 } = {}) {
  const [a, r1] = rngStep(hashSeed('catch', seed, stage)); const [b] = rngStep(r1);
  const half = window / 2;
  return { centre: Math.round((0.22 + a * 0.56) * 1000) / 1000, width: window, phase: b, half };
}

/** Marker position 0..1 at `phase` (a triangle wave: it sweeps there and back). */
export const markerAt = (p) => { const m = mod(p, 2); return m <= 1 ? m : 2 - m; };

/**
 * A hack: { seed, setup (setup.js setupHack), context ('foot' | 'ship' | 'combat') }.
 * State: stage, stages, layout, angles, selected, portal { open, phase, centre, width, cooldown },
 * left (seconds on this firewall), retriesLeft, retriesUsed, projectile, done, result, events.
 */
export function createMirrorHack({ seed = 1, setup = null, context = 'foot' } = {}) {
  const s = setup || setupHack({});
  const state = {
    seed, setup: s, context: CONSEQUENCES[context] ? context : 'foot', stage: 0, stages: s.firewalls,
    layout: null, angles: [], selected: null, portal: null, left: s.time, total: s.time,
    retriesLeft: s.retries, retriesUsed: 0, shots: 0, catchMisses: 0, fizzles: 0, held: 0,
    projectile: null, t: 0, done: false, result: null, events: [],
  };
  loadStage(state);
  return state;
}

function loadStage(state) {
  const { setup: s, stage } = state;
  const at = (list, i) => list[Math.min(i, list.length - 1)];
  state.layout = createLayout({ seed: state.seed, stage, mirrors: at(s.mirrors, stage), decoys: at(s.decoys, stage), spread: s.spread });
  resetBoard(state);
}
function resetBoard(state) {
  const { setup: s, stage } = state;
  state.angles = state.layout.start.slice();
  state.selected = state.layout.mirrors.length ? 0 : null;
  const c = catchFor({ seed: state.seed, stage, window: s.catchWindow });
  state.portal = { open: false, phase: c.phase * 2, centre: c.centre, width: c.width, cooldown: 0, speed: s.catchSpeed };
  state.left = s.time; state.total = s.time; state.projectile = null; state.held = 0;
}

/** The beam as it would go now (the preview). */
export const preview = (state) => trace(state.layout, state.angles);
/** Where the catch marker is now, 0..1. */
export const marker = (state) => markerAt(state.portal.phase);
/** Is the marker inside the window now? */
export const inWindow = (state) => Math.abs(marker(state) - state.portal.centre) <= state.portal.width / 2;

export function select(state, id) {
  if (state.done || !state.layout.mirrors[id]) return false;
  state.selected = id; state.events = [{ type: 'select', id }]; return true;
}

/** Turn one step (dir +1 clockwise, -1 the other way). Locked while the projectile flies. */
export function rotateStep(state, id, dir = 1) {
  if (state.done || state.projectile || !state.layout.mirrors[id]) return false;
  state.angles[id] = mod(state.angles[id] + (dir < 0 ? -1 : 1), STEPS);
  state.events = [{ type: 'turn', id }]; return true;
}
/** Hold a mirror: `dt` seconds of holding turns it one step every TURN_SECONDS. Returns the steps taken. */
export function holdMirror(state, id, dir, dt) {
  if (state.done || state.projectile || !state.layout.mirrors[id]) return 0;
  state.selected = id;
  state.held += dt; let n = 0;
  while (state.held >= TURN_SECONDS) { state.held -= TURN_SECONDS; state.angles[id] = mod(state.angles[id] + (dir < 0 ? -1 : 1), STEPS); n++; }
  if (n) state.events = [{ type: 'turn', id, steps: n }];
  return n;
}
/** Let go of a mirror (the partial step is dropped). */
export const releaseMirror = (state) => { state.held = 0; };

/** The timed catch. In the window: the portal opens. Outside it: a short cooldown. */
export function catchPortal(state) {
  const p = state.portal;
  if (state.done || state.projectile || p.open || p.cooldown > 0) return null;
  if (inWindow(state)) { p.open = true; state.events = [{ type: 'portal-open' }]; return 'open'; }
  p.cooldown = CATCH_COOLDOWN; state.catchMisses++; state.events = [{ type: 'catch-miss' }]; return 'miss';
}

/** Fire along the mirrors. Needs the portal open; it closes behind the shot. */
export function fire(state) {
  if (state.done || state.projectile || !state.portal.open) return null;
  const tr = trace(state.layout, state.angles);
  state.portal.open = false; state.shots++;
  state.projectile = { trace: tr, at: 0, length: tr.length, hit: tr.hit };
  state.events = [{ type: 'fire', hit: tr.hit }];
  return tr;
}

/** Where along the traced path the projectile is: [x, y] (or null with no shot in flight). */
export function projectileAt(state) {
  const p = state.projectile; if (!p) return null;
  let d = Math.min(p.at, p.length);
  const pts = p.trace.pts;
  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (d <= seg || i + 2 === pts.length) { const f = seg ? Math.min(1, d / seg) : 1; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
    d -= seg;
  }
  return pts[0];
}

/** Advance time: the firewall's clock, the catch marker, the projectile. A projectile that lands before the clock runs out still counts. */
export function stepMirrors(state, dt = 1 / 60) {
  state.events = [];
  if (state.done) return state;
  state.t += dt;
  const p = state.portal;
  p.phase += p.speed * dt; p.cooldown = Math.max(0, p.cooldown - dt);
  state.left -= dt;
  if (state.projectile) {
    state.projectile.at += PROJECTILE_SPEED * dt;
    if (state.projectile.at >= state.projectile.length) {
      const hit = state.projectile.hit; state.projectile = null;
      if (hit) { clearStage(state); return state; }
      state.fizzles++; state.events.push({ type: 'fizzle' });
    }
  }
  if (state.left <= 0) timeUp(state);
  return state;
}

function clearStage(state) {
  state.events.push({ type: 'stage-clear', stage: state.stage });
  state.stage++;
  if (state.stage >= state.stages) { finish(state, true); return; }
  loadStage(state);
}

function timeUp(state) {
  state.left = 0;
  if (state.retriesLeft > 0) {
    state.retriesLeft--; state.retriesUsed++;
    resetBoard(state); // the same seed: the same board, the same window, the mirrors back where they started
    state.events.push({ type: 'reset', retriesLeft: state.retriesLeft });
    return;
  }
  finish(state, false);
}

/** Placeholder XP: 3 + 2 per firewall broken, +1 for a clean run (no retry spent). */
export const mirrorXp = (result) => (result?.success ? 3 + 2 * result.firewalls + (result.retriesUsed === 0 ? 1 : 0) : 0);

function finish(state, success) {
  state.done = true; state.projectile = null;
  const c = CONSEQUENCES[state.context];
  const r = {
    success, how: success ? 'cleared' : 'locked-out', firewalls: state.stages, broken: success ? state.stages : state.stage,
    retriesUsed: state.retriesUsed, retriesLeft: state.retriesLeft, shots: state.shots, time: Math.round(state.t * 10) / 10, xp: 0,
    context: state.context, security: success ? 'quiet' : 'alerted', world: success ? { security: 'quiet' } : { ...c },
  };
  if (!success) for (const k of ['terminal', 'port', 'section']) if (c[k]) r[k] = c[k];
  r.xp = mirrorXp(r);
  state.result = r;
  state.events.push({ type: 'done', ...r });
}
