// The repair minigame (v2): route coolant from the pump to the leaking valve.
// A square board of pipe pieces; tap a piece to turn it a quarter. Two rules:
//  1. A closed network. Every opening on every piece that coolant reaches must meet
//     another opening (or the pump or the valve). A T only works if all three of its
//     ends connect. Any open end on the wet network leaks.
//  2. No clock. Coolant flows out of the pump at a steady speed through the connected
//     pipe, pours out of every open end it reaches, and the spill collects in a pool
//     along the bottom of the board. Pool full: the line floods. The patch holds when
//     the coolant reaches the valve and nothing is left open.
// Every board is built from a seed by drawing a closed network first (a route from
// pump to valve plus loops that come back) and scrambling it after, so it always has
// a solution. Pure: the page shows it and sends turns and ticks.
// Setup numbers (board size, pool depth, flow, quality bonus) come from setup.js.
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const N = 1, E = 2, S = 4, W = 8;
const DIRS = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
export const turn = (m) => ((m << 1) | (m >> 3)) & 15;
const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/** The piece's shape from its openings: 'straight', 'corner', 'tee', 'end', 'cross' or 'blank'. */
export function shapeOf(m) {
  const n = bits(m);
  if (n === 0) return 'blank';
  if (n === 1) return 'end';
  if (n === 2) return m === (N | S) || m === (E | W) ? 'straight' : 'corner';
  return n === 3 ? 'tee' : 'cross';
}

const MIN_SIZE = 3, MAX_SIZE = 6;
/** How fast coolant fills a piece (pieces a second) and how fast a dry piece empties. */
const EAR_MAX = 4;
export const FILL_SPEED = 4.5, DRAIN_SPEED = 12;

export function createRepair({ seed = 1, size = 5, capacity = 120, flow = 1, qualityBonus = 0 } = {}) {
  const n = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.trunc(size) || 5));
  let rng = hashSeed('repair', seed, n);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const pickIdx = (len) => Math.min(len - 1, Math.floor(rand() * len));
  const shuffle = (a) => { for (let k = a.length - 1; k > 0; k--) { const j = Math.min(k, Math.floor(rand() * (k + 1))); [a[k], a[j]] = [a[j], a[k]]; } return a; };

  // The pump sits on the left edge, the valve on the right; the route between is drawn first.
  let r0 = pickIdx(n), r1 = pickIdx(n);
  if (r0 === r1) r1 = (r1 + 1 + pickIdx(n - 1)) % n;
  const src = r0 * n, dst = r1 * n + (n - 1);
  const path = drawPath(n, src + 1, dst - 1, new Set([src, dst]), rand);

  // The closed network: edges between neighbouring cells. Every cell but the pump and valve gets at least
  // two edges (a route cell has two, a loop cell has two, a join has three), so no end is ever left open.
  const edges = new Map(); // cell -> Set of neighbour cells it opens toward
  const add = (a, b) => { if (!edges.has(a)) edges.set(a, new Set()); if (!edges.has(b)) edges.set(b, new Set()); edges.get(a).add(b); edges.get(b).add(a); };
  const route = [src, ...path, dst];
  for (let k = 0; k + 1 < route.length; k++) add(route[k], route[k + 1]);
  const inNet = () => new Set(edges.keys());
  const nbrs = (i) => { const x = i % n, y = Math.floor(i / n); return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => b * n + a); };
  // Loops ("ears"): a walk through free cells that leaves the network at one piece and comes back at another.
  const earsWanted = Math.max(1, Math.floor((n - 1) / 2));
  for (let e = 0; e < earsWanted; e++) {
    for (let tries = 0; tries < 16; tries++) {
      const used = inNet();
      const joinable = [...used].filter((i) => i !== src && i !== dst && edges.get(i).size === 2);
      if (!joinable.length) break;
      const a = joinable[pickIdx(joinable.length)];
      const firsts = shuffle(nbrs(a).filter((j) => !used.has(j)));
      let found = null;
      for (const f of firsts) {
        const seen = new Set([f]); const out = [f]; let budget = 300;
        const go = (i) => {
          if (budget-- <= 0) return false;
          const back = shuffle(nbrs(i)).find((j) => j !== a && used.has(j) && j !== src && j !== dst && edges.get(j).size === 2);
          if (back != null) { found = { cells: out.slice(), b: back }; return true; }
          if (out.length >= EAR_MAX) return false;
          for (const j of shuffle(nbrs(i).filter((j2) => !used.has(j2) && !seen.has(j2)))) { seen.add(j); out.push(j); if (go(j)) return true; out.pop(); }
          return false;
        };
        if (go(f)) break;
      }
      if (!found) continue;
      const chain = [a, ...found.cells, found.b];
      for (let k = 0; k + 1 < chain.length; k++) add(chain[k], chain[k + 1]);
      break;
    }
  }
  const net = [...edges.keys()].filter((i) => i !== src && i !== dst).sort((a, b) => a - b);
  const dirTo = (from, to) => link(from, to, n);
  const solved = new Array(n * n).fill(0);
  for (const [i, set] of edges) for (const j of set) solved[i] |= dirTo(i, j);
  const onNet = new Set(net);

  // Decoys: loose pieces that sit dry in the finished board (nothing opens toward them), and some empty sockets.
  const kinds = [N | S, N | E, N | E | S];
  const faces = (i, m) => DIRS.some(([bit, dx, dy, back]) => { if (!(m & bit)) return false; const x = i % n + dx, y = Math.floor(i / n) + dy; return x >= 0 && y >= 0 && x < n && y < n && (solved[y * n + x] & back); });
  for (let i = 0; i < n * n; i++) {
    if (edges.has(i)) continue;
    if (rand() < 0.3) continue; // an empty socket
    let m = kinds[pickIdx(3)];
    for (let k = pickIdx(4); k > 0; k--) m = turn(m);
    let ok = false;
    for (let k = 0; k < 4 && !ok; k++) { if (!faces(i, m)) ok = true; else m = turn(m); }
    solved[i] = ok ? m : 0;
  }
  const tiles = solved.map((mask, i) => ({ mask, solved: mask, fixed: i === src || i === dst || mask === 0 || mask === 15, role: i === src ? 'pump' : i === dst ? 'valve' : mask === 0 ? 'blank' : onNet.has(i) ? 'pipe' : 'loose', line: onNet.has(i), wet: 0 }));
  // Scramble until at least half the network is out of place and the board does not start sealed.
  const state = {
    size: n, cols: n, rows: n, tiles, src, dst, path, net, seed,
    par: 0, moves: 0, t: 0, capacity: Math.max(10, capacity), flow: Math.max(0.1, flow), qualityBonus: Math.max(0, qualityBonus),
    pool: 0, spilled: 0, powered: [], open: [], solved: false, done: false, result: null, events: [],
  };
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const t of tiles) {
      if (t.fixed) continue;
      t.mask = t.solved;
      for (let k = pickIdx(4); k > 0; k--) t.mask = turn(t.mask);
    }
    const wrong = net.filter((i) => !same(tiles[i])).length;
    refresh(state);
    if (wrong >= Math.ceil(net.length / 2) && !state.solved) break;
  }
  state.par = parTurns(tiles);
  if (state.solved) return createRepair({ seed: Number(seed) + 7919, size, capacity, flow, qualityBonus });
  return state;
}

// A tile is right when it matches its solved openings (straights either way round).
// (A straight turned half way round is the same mask, so no special case.)
function same(t) { return t.mask === t.solved; }

function link(from, to, n) {
  const dx = (to % n) - (from % n), dy = Math.floor(to / n) - Math.floor(from / n);
  return dx === 1 ? E : dx === -1 ? W : dy === 1 ? S : N;
}

// A winding self-avoiding walk from a to b over free cells (randomised depth-first search).
// Longer than the straight run, so a board has real bends; falls back to any path.
function drawPath(n, a, b, blocked, rand) {
  const want = n + Math.ceil(n / 2);
  const at = (i) => [i % n, Math.floor(i / n)];
  for (let tries = 0; tries < 60; tries++) {
    const seen = new Set(blocked); const out = []; let budget = 4000;
    const go = (i) => {
      if (budget-- <= 0) return false;
      seen.add(i); out.push(i);
      if (i === b) { if (out.length >= want || tries > 40) return true; seen.delete(i); out.pop(); return false; }
      const [x, y] = at(i);
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < n && ny < n).map(([nx, ny]) => ny * n + nx).filter((j) => !seen.has(j));
      for (let k = nb.length - 1; k > 0; k--) { const j = Math.min(k, Math.floor(rand() * (k + 1))); [nb[k], nb[j]] = [nb[j], nb[k]]; }
      for (const j of nb) if (go(j)) return true;
      seen.delete(i); out.pop(); return false;
    };
    if (a === b) { return [a]; }
    if (go(a)) return out;
  }
  // Last resort: an L-shaped walk (never blocked: pump and valve sit on opposite edges).
  const [ax, ay] = at(a), [bx, by] = at(b); const res = [];
  let x = ax, y = ay; res.push(y * n + x);
  while (x !== bx) { x += Math.sign(bx - x); res.push(y * n + x); }
  while (y !== by) { y += Math.sign(by - y); res.push(y * n + x); }
  return res;
}

/**
 * The wet network: a flood from the pump along matching openings. Returns the set of tile indexes,
 * and (when `order` is given) fills it with the tiles in the order the coolant reaches them and `parent` with who fed whom.
 */
export function poweredSet(state, order = [], parent = new Map()) {
  const { cols, rows, tiles } = state;
  const seen = new Set([state.src]); const queue = [state.src]; order.push(state.src);
  while (queue.length) {
    const i = queue.shift(); const x = i % cols, y = Math.floor(i / cols);
    for (const [bit, dx, dy, back] of DIRS) {
      if (!(tiles[i].mask & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen.has(j) || !(tiles[j].mask & back)) continue;
      seen.add(j); queue.push(j); order.push(j); parent.set(j, i);
    }
  }
  return seen;
}

/**
 * Every open end on the wet network: an opening on a wet piece that meets no opening
 * (the board's edge, an empty socket, or a piece turned the other way). { i, dir } with dir = N, E, S or W.
 */
export function openEnds(state, set = poweredSet(state)) {
  const { cols, rows, tiles } = state; const out = [];
  for (const i of [...set].sort((a, b) => a - b)) {
    const x = i % cols, y = Math.floor(i / cols);
    for (const [bit, dx, dy, back] of DIRS) {
      if (!(tiles[i].mask & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !(tiles[ny * cols + nx].mask & back)) out.push({ i, dir: bit });
    }
  }
  return out;
}

let _order = [], _parent = new Map();
/** Re-derive the wet network, open ends and sealed flag from the pieces (the rules call it after every turn; tests call it after setting pieces). */
export function recompute(state) { refresh(state); return state; }
function refresh(state) {
  _order = []; _parent = new Map();
  const set = poweredSet(state, _order, _parent);
  state.powered = [...set].sort((a, b) => a - b);
  state.open = openEnds(state, set);
  state.order = _order; state.parent = _parent;
  state.solved = set.has(state.dst) && state.open.length === 0;
}

/** Open ends that are pouring now: the coolant has filled the piece they are on. The pool rises by `flow` for each. */
export const leaks = (state) => state.open.filter((o) => state.tiles[o.i].wet >= 1);

/** The fewest quarter turns that put every piece of the drawn network back (a reference; a lucky board can beat it). */
export function parTurns(tiles) {
  let total = 0;
  for (const t of tiles) {
    if (t.fixed || !t.line) continue;
    if (same(t)) continue;
    let m = t.mask, k = 0;
    while (k < 4 && !same({ mask: m, solved: t.solved })) { m = turn(m); k++; }
    total += k;
  }
  return total;
}

/** Turn piece i a quarter clockwise. Returns true when the piece moved. */
export function rotateTile(state, i) {
  const t = state.tiles[i];
  if (state.done || !t || t.fixed) return false;
  t.mask = turn(t.mask);
  state.moves++;
  state.events = [{ type: 'turn', i }];
  refresh(state);
  if (state.solved) finish(state, true, 'sealed');
  return true;
}

/**
 * Advance time: the coolant spreads along the connected pipe, dry pieces empty,
 * every pouring open end adds `flow` to the pool, and a full pool floods the line.
 * The coolant keeps moving after the end so the last picture is of a filled line.
 */
export function stepRepair(state, dt = 1 / 60) {
  state.events = [];
  const on = new Set(state.powered);
  const snap = state.tiles.map((t) => t.wet);
  for (const i of state.order) {
    const t = state.tiles[i];
    const fed = i === state.src || snap[state.parent.get(i)] >= 1;
    if (fed) t.wet = Math.min(1, t.wet + FILL_SPEED * dt);
  }
  state.tiles.forEach((t, i) => { if (!on.has(i) && t.wet > 0) t.wet = Math.max(0, t.wet - DRAIN_SPEED * dt); });
  if (state.done) return state;
  state.t += dt;
  const spill = leaks(state).length * state.flow * dt;
  state.pool += spill; state.spilled += spill;
  if (state.pool >= state.capacity) { state.pool = state.capacity; finish(state, false, 'flooded'); }
  return state;
}

/**
 * Quality 0..100 for a sealed patch: 40 base, up to 30 for few turns (par / moves),
 * up to 30 for how little spilled (the pool's share left), plus the Repair quality points' bonus. Failed: 0.
 * Stars: 3 at 90+, 2 at 65+, else 1.
 */
export function qualityOf({ success, moves, par, spilled, capacity, qualityBonus = 0 }) {
  if (!success) return 0;
  const eff = moves <= 0 ? 0 : Math.min(1, Math.max(par, 1) / moves);
  const dry = Math.max(0, 1 - spilled / capacity);
  return Math.max(0, Math.min(100, Math.round(40 + 30 * eff + 30 * dry + qualityBonus)));
}
export const starsOf = (q) => (q >= 90 ? 3 : q >= 65 ? 2 : 1);

/** Placeholder XP for a sealed patch (tuned by playing): 4 + 2 per board step above 3 x 3, +1 per star above one. */
export const xpFor = (result, size) => (result?.success ? 4 + 2 * (size - MIN_SIZE) + (result.stars - 1) : 0);

function finish(state, success, how) {
  state.done = true;
  const q = qualityOf({ success, moves: state.moves, par: state.par, spilled: state.spilled, capacity: state.capacity, qualityBonus: state.qualityBonus });
  state.result = { success, how, moves: state.moves, par: state.par, time: Math.round(state.t * 10) / 10, spilled: Math.round(state.spilled * 10) / 10, quality: q, stars: success ? starsOf(q) : 0, size: state.size, xp: 0 };
  state.result.xp = xpFor(state.result, state.size);
  state.events.push({ type: 'done', ...state.result });
}

/** A hint for the view: the first wrong piece of the network, next to the coolant if possible. */
export function nextHint(state) {
  const powered = new Set(state.powered);
  const wrong = state.net.filter((i) => !same(state.tiles[i]));
  if (!wrong.length) return null;
  const n = state.cols;
  return wrong.find((i) => [i - 1, i + 1, i - n, i + n].some((j) => powered.has(j))) ?? wrong[0];
}
