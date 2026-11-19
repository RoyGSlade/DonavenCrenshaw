// The stealth minigame: SHADOW SLIP (verb: spend beats). A small map, a visible patrol schedule.
// Every beat you either step to a neighbouring cell or wait; then every guard takes one step along
// its patrol line and the lit view cones are checked against where you stand. Seen in a cone (and
// not in cover): heat up. Heard (you moved with a guard within the alert ring): a little heat.
// A quiet beat cools you. At 100 heat you are caught; reach the exit before the shift change.
// The map shows the cones for the NEXT beat (what will be watched if you end the beat there) and
// the beat after. Pure and seeded; the view sends act(). Numbers come from setup.js (setupStealth).
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { STEALTH_BASE } from './setup.js';

export const CELL = Object.freeze({ floor: 'floor', wall: 'wall', cover: 'cover' });
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function createStealth({ seed = 1, setup = {}, size = 6 } = {}) {
  const n = size;
  const guardsWanted = setup.guards ?? STEALTH_BASE.guards, beats = setup.beats ?? STEALTH_BASE.beats;
  // Draw maps until one has a route that adds no heat at all inside the shift; keep the best of the draws if none does
  // (a Rough roll has 3 guards and a short shift: then the best map still has a route far under the caught line).
  let best = null;
  for (let attempt = 0; attempt < 150; attempt++) {
    const s = build(seed, attempt, n, guardsWanted, setup);
    s.beats = beats;
    const r = bestRoute(s, beats);
    if (r && (!best || r.gain < best.r.gain)) best = { s, r };
    if (r && r.gain === 0) break;
  }
  best.s.safe = best.r.path; best.s.safeGain = best.r.gain;
  return best.s;
}

function build(seed, attempt, n, guardsWanted, setup) {
  let rng = hashSeed('stealth', seed, n, attempt);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const pick = (k) => Math.min(k - 1, Math.floor(rand() * k));
  const start = (n - 1) * n, exit = n - 1;
  const cells = new Array(n * n).fill(CELL.floor);
  const place = (type, count) => { let k = 0; for (let g = 0; g < 200 && k < count; g++) { const i = pick(n * n); if (i === start || i === exit || cells[i] !== CELL.floor) continue; cells[i] = type; k++; } };
  place(CELL.wall, 5); place(CELL.cover, 5);
  // Guards patrol a straight line (a row or a column), to and fro.
  const guards = []; const used = new Set();
  for (let g = 0; g < guardsWanted; g++) {
    const horizontal = rand() < 0.5, lane = 1 + pick(n - 2), len = 3 + pick(3);
    const from = pick(n - len + 1), key = `${horizontal}${lane}`;
    if (used.has(key)) { g--; if (used.size > 20) break; continue; }
    used.add(key);
    const line = Array.from({ length: len }, (_, k) => (horizontal ? lane * n + from + k : (from + k) * n + lane));
    for (const i of line) if (cells[i] === CELL.wall || i === start || i === exit) cells[i] = CELL.floor;
    guards.push({ line, phase: pick(2 * (len - 1)) });
  }
  return {
    size: n, cells, start, exit, guards, seed, attempt,
    quiet: setup.noiseFactor ?? 1, rangeFactor: setup.rangeFactor ?? 1, decay: setup.decay ?? STEALTH_BASE.decay,
    beat: 0, pos: start, heat: 0, maxHeat: 0, seenBeats: 0, heardBeats: 0, hiddenBeats: 0, trail: [start],
    beats: STEALTH_BASE.beats, done: false, result: null, events: [],
  };
}

/** Where guard g is at beat t and which way it is walking: { cell, dir: [dx, dy] }. */
export function guardAt(s, g, t) {
  const L = g.line.length, per = 2 * (L - 1);
  const idx = (u) => { const m = ((g.phase + u) % per + per) % per; return m < L ? m : per - m; };
  const a = g.line[idx(t)], b = g.line[idx(t + 1)];
  const ax = a % s.size, ay = Math.floor(a / s.size), bx = b % s.size, by = Math.floor(b / s.size);
  return { cell: a, dir: [Math.sign(bx - ax), Math.sign(by - ay)] };
}

/** The cone of a guard at beat t as a Map cell -> visibility 0..1 (the cone's last cell fades). */
export function coneOf(s, g, t) {
  const { cell, dir } = guardAt(s, g, t);
  const n = s.size, gx = cell % n, gy = Math.floor(cell / n);
  const reach = STEALTH_BASE.cone * s.rangeFactor;
  const out = new Map();
  for (let d = 1; d <= Math.ceil(reach); d++) {
    const frac = Math.max(0, Math.min(1, reach - (d - 1)));
    if (frac <= 0) break;
    const cx = gx + dir[0] * d, cy = gy + dir[1] * d;
    if (cx < 0 || cy < 0 || cx >= n || cy >= n || s.cells[cy * n + cx] === CELL.wall) break; // a wall stops the sight line
    for (let l = -Math.floor(d / 2); l <= Math.floor(d / 2); l++) {
      const x = cx + (dir[0] === 0 ? l : 0), y = cy + (dir[1] === 0 ? l : 0);
      if (x < 0 || y < 0 || x >= n || y >= n || s.cells[y * n + x] === CELL.wall) continue;
      const i = y * n + x; out.set(i, Math.max(out.get(i) || 0, frac));
    }
  }
  return out;
}

/** Every watched cell at beat t: Map cell -> total visibility (sum over guards). */
export function watched(s, t) {
  s._w ??= new Map();
  if (s._w.has(t)) return s._w.get(t);
  const out = new Map();
  for (const g of s.guards) for (const [i, f] of coneOf(s, g, t)) out.set(i, (out.get(i) || 0) + f);
  s._w.set(t, out);
  return out;
}

/** The heat a beat adds if you end beat t (the beat after you act) in `cell`, having `moved` or not: { seen, heard }. */
export function gainAt(s, cell, t, moved) {
  const cover = s.cells[cell] === CELL.cover;
  const vis = cover ? 0 : (watched(s, t).get(cell) || 0);
  const seen = STEALTH_BASE.seen * vis;
  let heard = 0;
  if (moved) {
    for (const g of s.guards) {
      const gc = guardAt(s, g, t).cell;
      if (Math.abs((gc % s.size) - (cell % s.size)) + Math.abs(Math.floor(gc / s.size) - Math.floor(cell / s.size)) <= STEALTH_BASE.alert) { heard = STEALTH_BASE.heard * s.quiet; break; }
    }
  }
  return { seen, heard, total: seen + heard };
}

const passable = (s, i) => s.cells[i] !== CELL.wall;
export function neighbours(s, i) {
  const n = s.size, x = i % n, y = Math.floor(i / n);
  return DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => b * n + a).filter((j) => passable(s, j));
}

/**
 * The route that adds the least heat (heat from cooling ignored, so a real run can only do better):
 * { path: [cells from the start, one per beat], gain } or null when the exit cannot be reached in the shift.
 * Dynamic programming over (cell, beat).
 */
export function bestRoute(s, limit = s.beats) {
  const N = s.size * s.size;
  let cost = new Array(N).fill(Infinity); cost[s.start] = 0;
  const back = [];
  let best = null;
  for (let t = 0; t < limit; t++) {
    const next = new Array(N).fill(Infinity), from = new Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (cost[i] === Infinity) continue;
      for (const j of [i, ...neighbours(s, i)]) {
        const c = cost[i] + gainAt(s, j, t + 1, j !== i).total;
        if (c < next[j]) { next[j] = c; from[j] = i; }
      }
    }
    back.push(from); cost = next;
    if (cost[s.exit] < Infinity && (!best || cost[s.exit] < best.gain - 1e-9)) best = { t: t + 1, gain: Math.round(cost[s.exit] * 1000) / 1000 };
    if (best && best.gain === 0) break;
  }
  if (!best) return null;
  // The reconstruction needs the run that ended at best.t: replay the choices backwards.
  const path = [s.exit];
  let i = s.exit;
  for (let t = best.t - 1; t >= 0; t--) { i = back[t][i]; path.unshift(i); }
  return { path, gain: best.gain };
}
/** A route with no heat at all, or null. */
export function safeRoute(s, limit = s.beats) { const r = bestRoute(s, limit); return r && r.gain === 0 ? r.path : null; }

/** Spend a beat: step to `cell` (a neighbour) or wait (cell = your own). Returns 'moved', 'waited', 'seen', 'heard', 'caught', 'exit', 'late' or null. */
export function act(s, cell) {
  if (s.done) return null;
  const moved = cell !== s.pos;
  if (moved && !neighbours(s, s.pos).includes(cell)) return null;
  s.pos = cell; s.trail.push(cell); s.beat++;
  const g = gainAt(s, cell, s.beat, moved);
  let how = moved ? 'moved' : 'waited';
  if (g.total > 0) {
    s.heat += g.total;
    if (g.seen > 0) { s.seenBeats++; how = 'seen'; } else { s.heardBeats++; how = 'heard'; }
  } else s.heat = Math.max(0, s.heat - s.decay);
  if (s.cells[cell] === CELL.cover) s.hiddenBeats++;
  s.heat = Math.round(s.heat * 1000) / 1000;
  s.maxHeat = Math.max(s.maxHeat, s.heat);
  s.events = [{ type: how, gain: g.total }];
  if (s.heat >= STEALTH_BASE.caught) { finish(s, 'caught'); return 'caught'; }
  if (cell === s.exit) { finish(s, 'exit'); return 'exit'; }
  if (s.beat >= s.beats) { finish(s, 'late'); return 'late'; }
  return how;
}

/** Stars by the hottest you got: under 30 heat 3, under 60 two, else one. */
export const starsFor = (maxHeat) => (maxHeat < 30 ? 3 : maxHeat < 60 ? 2 : 1);
/** Placeholder XP: 4, +1 per star above one; none if caught or late. */
export const stealthXp = (r) => (r?.success ? 3 + r.stars : 0);

function finish(s, how) {
  s.done = true;
  const success = how === 'exit';
  s.result = { success, how, stars: success ? starsFor(s.maxHeat) : 0, beats: s.beat, beatsLimit: s.beats, maxHeat: Math.round(s.maxHeat), heat: Math.round(s.heat), seenBeats: s.seenBeats, heardBeats: s.heardBeats, hiddenBeats: s.hiddenBeats, xp: 0 };
  s.result.xp = stealthXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
