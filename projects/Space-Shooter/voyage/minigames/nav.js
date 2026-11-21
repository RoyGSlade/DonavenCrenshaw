// The navigation minigame: PLOT THE LANE (verb: draw a route). A grid of sectors; tap the cell
// next to your ship to chain a route from the start to the port. Every sector has a visible
// travel-time and fuel cost (lane 1/1, nebula 2/1, rubble 1/2). Hidden hazards cost 3 time and 3
// fuel when entered and only show when the route head is within the warning radius. Backing up
// re-crosses the sector you leave, so it costs too: nothing you spend comes back. Reach the port
// inside both budgets. No clock: it is a planning game. Pure and seeded; the view sends enter()
// and backUp(). Numbers come from setup.js (setupNav).
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const TERRAIN = Object.freeze({
  lane: Object.freeze({ id: 'lane', name: 'Open lane', time: 1, fuel: 1 }),
  nebula: Object.freeze({ id: 'nebula', name: 'Nebula', time: 2, fuel: 1 }),
  rubble: Object.freeze({ id: 'rubble', name: 'Rubble field', time: 1, fuel: 2 }),
});
export const HAZARD_COST = Object.freeze({ time: 3, fuel: 3 });

/** setup: from setupNav. Returns the state; `solution` is a hazard-free route the budgets are built from. */
export function createNav({ seed = 1, setup = {} } = {}) {
  const n = Math.max(4, Math.min(8, setup.size ?? 6));
  let rng = hashSeed('nav', seed, n);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const cells = Array.from({ length: n * n }, () => { const r = rand(); return r < 0.4 ? 'lane' : r < 0.7 ? 'nebula' : 'rubble'; });
  const start = 0, port = n * n - 1;
  cells[start] = 'lane'; cells[port] = 'lane';
  // Hazards: random cells (not the ends), re-drawn until a hazard-free route to the port still exists.
  const want = Math.max(0, setup.hazards ?? 5);
  let hazards = new Set();
  for (let tries = 0; tries < 50; tries++) {
    hazards = new Set();
    while (hazards.size < want) { const i = Math.floor(rand() * n * n); if (i !== start && i !== port) hazards.add(i); }
    if (bestRoute(n, cells, hazards)) break;
    if (tries === 49) hazards = new Set();
  }
  const sol = bestRoute(n, cells, hazards);
  const sum = (path, key) => path.slice(1).reduce((a, i) => a + TERRAIN[cells[i]][key], 0);
  const baseTime = sum(sol, 'time'), baseFuel = sum(sol, 'fuel');
  const timeFactor = setup.timeFactor ?? 1, fuelFactor = setup.fuelFactor ?? 1;
  const s = {
    size: n, cells, hazards, start, port, solution: sol, reveal: Math.max(0, setup.reveal ?? 1),
    timeFactor, fuelFactor,
    // Budgets come from the full-price route (points make it cheaper, they never shrink the budget).
    budgetTime: Math.ceil(baseTime * 1.5 * (setup.budgetFactor ?? 1)), budgetFuel: Math.ceil(baseFuel * 1.5),
    path: [start], time: 0, fuel: 0, hits: 0, backups: 0, seen: new Set(), hitSet: new Set(), done: false, result: null, events: [],
  };
  uncover(s);
  return s;
}

const neighbours = (n, i) => { const x = i % n, y = Math.floor(i / n); return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => b * n + a); };
export const manhattan = (n, a, b) => Math.abs((a % n) - (b % n)) + Math.abs(Math.floor(a / n) - Math.floor(b / n));

/** The cheapest route from start to port avoiding hazards (Dijkstra on time + fuel at full price); null if none. */
export function bestRoute(n, cells, hazards) {
  const goal = n * n - 1;
  const dist = new Array(n * n).fill(Infinity), prev = new Array(n * n).fill(-1), done = new Array(n * n).fill(false);
  dist[0] = 0;
  for (let k = 0; k < n * n; k++) {
    let u = -1; for (let i = 0; i < n * n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const v of neighbours(n, u)) {
      if (hazards.has(v) || done[v]) continue;
      const c = dist[u] + TERRAIN[cells[v]].time + TERRAIN[cells[v]].fuel;
      if (c < dist[v]) { dist[v] = c; prev[v] = u; }
    }
  }
  if (dist[goal] === Infinity) return null;
  const path = []; for (let i = goal; i >= 0; i = prev[i]) path.unshift(i);
  return path;
}

/** The hazards the player can see: those within `reveal` of any cell the route head has been on, or already hit. */
export const isRevealed = (s, i) => s.hazards.has(i) && s.seen.has(i);
function uncover(s) {
  const head = s.path[s.path.length - 1];
  for (const h of s.hazards) if (manhattan(s.size, head, h) <= s.reveal) s.seen.add(h);
}
export const head = (s) => s.path[s.path.length - 1];
/** The costs of entering cell i at this run's prices: { time, fuel }. */
export const costOf = (s, i) => ({ time: TERRAIN[s.cells[i]].time * s.timeFactor, fuel: TERRAIN[s.cells[i]].fuel * s.fuelFactor });

/** Extend the route into cell i (must touch the head). Returns 'moved', 'hit', 'port', 'dry' or null. */
export function enter(s, i) {
  if (s.done || !neighbours(s.size, head(s)).includes(i)) return null;
  const c = costOf(s, i);
  s.time += c.time; s.fuel += c.fuel;
  s.path.push(i);
  let r = 'moved';
  if (s.hazards.has(i) && !s.hitSet.has(i)) { s.hitSet.add(i); s.hits++; s.time += HAZARD_COST.time; s.fuel += HAZARD_COST.fuel; s.seen.add(i); r = 'hit'; }
  uncover(s);
  s.events = [{ type: r, i }];
  if (i === s.port) { finish(s, 'port'); return 'port'; }
  if (spare(s).time < 0 || spare(s).fuel < 0) { finish(s, spare(s).time < 0 ? 'out-of-time' : 'out-of-fuel'); return 'dry'; }
  return r;
}

/** Back the route head up one sector. It costs the sector you leave again (nothing is refunded). */
export function backUp(s) {
  if (s.done || s.path.length < 2) return null;
  const left = s.path.pop();
  const c = costOf(s, left);
  s.time += c.time; s.fuel += c.fuel; s.backups++;
  uncover(s);
  s.events = [{ type: 'back', i: left }];
  if (spare(s).time < 0 || spare(s).fuel < 0) { finish(s, spare(s).time < 0 ? 'out-of-time' : 'out-of-fuel'); return 'dry'; }
  return 'back';
}

/** What is left of each budget (can be negative once spent over). */
export const spare = (s) => ({ time: s.budgetTime - s.time, fuel: s.budgetFuel - s.fuel });
/** Stars: 3 when at least 30% of both budgets is left, 2 at 15%, else 1. */
export const starsFor = (s) => { const m = Math.min(spare(s).time / s.budgetTime, spare(s).fuel / s.budgetFuel); return m >= 0.3 ? 3 : m >= 0.15 ? 2 : 1; };
/** Placeholder XP: 4, +1 per star above one, +1 when no hazard was hit; none when stranded. */
export const navXp = (r) => (r?.success ? 4 + (r.stars - 1) + (r.hits === 0 ? 1 : 0) : 0);

function finish(s, how) {
  s.done = true;
  const r = Math.round;
  const success = how === 'port';
  s.result = {
    success, how, stars: success ? starsFor(s) : 0, hits: s.hits, backups: s.backups, steps: s.path.length - 1,
    time: r(s.time * 100) / 100, fuel: r(s.fuel * 100) / 100, budgetTime: s.budgetTime, budgetFuel: s.budgetFuel,
    spareTime: r(spare(s).time * 100) / 100, spareFuel: r(spare(s).fuel * 100) / 100, xp: 0,
  };
  s.result.xp = navXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
