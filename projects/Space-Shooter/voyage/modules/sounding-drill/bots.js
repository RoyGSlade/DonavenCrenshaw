// The four bots the tests (and the builder) use to prove the rules. They play through the same `step(g, dt, input)` a hand would.
//   perfect : knows the rock, plans a path with A*, circles the main find at the right distance.
//   wobbly  : a human-ish hand: a shaky pointer, reaction lag, only sees what is lit, forgets the find after a few seconds.
//   lazy    : drags straight down and never looks.
//   mash    : scribbles at random.
// Bots never use Math.random: every choice comes from a seeded roller.
import { hashSeed, roller } from './rng.js';
import { BASE, K, F, step, claw, resultOf, findLight, mainProgress, turn, isOpen, cellIndex } from './model.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const mkGauss = (rnd) => () => Math.sqrt(-2 * Math.log(rnd.next() || 1e-9)) * Math.cos(2 * Math.PI * rnd.next());

// --- A* on the cell grid -------------------------------------------------------------------------------------------
function astar(g, from, to, blocked) {
  const R = g.rock, { gw, gh } = R, n = gw * gh;
  const gcost = new Float32Array(n).fill(1e9), prev = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap = []; // [f, idx]
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const tx = to % gw, ty = (to / gw) | 0;
  const h = (i) => Math.hypot((i % gw) - tx, ((i / gw) | 0) - ty) * 0.3;
  const costOf = (i) => {
    if (blocked[i]) return 1e9;
    const k = R.kind[i];
    if (k === K.OUT) return 1e9;
    if (g.cut[i] || k === K.HOLLOW) return 0.3;
    return k === K.VEIN ? (g._veinW || 2.2) : 1;
  };
  gcost[from] = 0; push(h(from), from);
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === to) break;
    const x = i % gw, y = (i / gw) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const j = ny * gw + nx;
      if (closed[j]) continue;
      const c = costOf(j);
      if (c >= 1e9) continue;
      const ng = gcost[i] + c * (dx && dy ? 1.414 : 1);
      if (ng < gcost[j]) { gcost[j] = ng; prev[j] = i; push(ng + h(j), j); }
    }
  }
  if (prev[to] < 0 && from !== to) return null;
  const path = [];
  for (let i = to; i >= 0; i = prev[i]) { path.push({ x: (i % gw + 0.5) * R.cell, y: (((i / gw) | 0) + 0.5) * R.cell }); if (i === from) break; }
  return path.reverse();
}

/** Cells nearer than (core radius + margin) to any find are off limits to the planner. */
function blockMap(g, margin) {
  const R = g.rock, blocked = new Uint8Array(R.gw * R.gh);
  for (const f of R.finds) {
    const reach = f.r + margin + R.cell;
    for (let gy = Math.max(0, Math.floor((f.y - reach) / R.cell)); gy <= Math.min(R.gh - 1, Math.floor((f.y + reach) / R.cell)); gy++) {
      for (let gx = Math.max(0, Math.floor((f.x - reach) / R.cell)); gx <= Math.min(R.gw - 1, Math.floor((f.x + reach) / R.cell)); gx++) {
        if (Math.hypot((gx + 0.5) * R.cell - f.x, (gy + 0.5) * R.cell - f.y) < f.r + margin) blocked[gy * R.gw + gx] = 1;
      }
    }
  }
  return blocked;
}

// --- perfect -------------------------------------------------------------------------------------------------------
export function perfectBot(g, o = {}) {
  const P = { ringD: 19, sweep: 12.6, look: 40, stopAt: 0.74, ...o };
  const R = g.rock, main = R.finds[0];
  let path = null, pi = 0, circ = null, cooling = false, plannedFor = -1;
  const plan = () => {
    plannedFor = g.attempts;
    const D = main.r + P.ringD;
    // approach from the side nearest the entry
    const a0 = Math.atan2(g.bit.y - main.y, g.bit.x - main.x);
    let best = null;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1]) {
      const a = a0 + da, gx = main.x + Math.cos(a) * D, gy = main.y + Math.sin(a) * D;
      const ci = cellIndex(R, gx, gy);
      if (ci >= 0 && R.kind[ci] !== K.OUT) { best = { a, x: gx, y: gy, ci }; break; }
    }
    best = best || { a: a0, x: main.x + Math.cos(a0) * D, y: main.y + Math.sin(a0) * D, ci: cellIndex(R, main.x + Math.cos(a0) * D, main.y + Math.sin(a0) * D) };
    const blocked = blockMap(g, BASE.crackPad + 10);
    const from = cellIndex(R, g.bit.x, g.bit.y);
    blocked[best.ci] = 0; blocked[from] = 0;
    path = astar(g, from, best.ci, blocked) || [{ x: best.x, y: best.y }];
    pi = 0; circ = { a: best.a, dir: 1, swept: 0, last: best.a, D, started: false };
    // go the way round that stays inside the rock longer
    let inLeft = 0, inRight = 0;
    for (let k = 1; k <= 12; k++) {
      if (R.kind[cellIndex(R, main.x + Math.cos(best.a + k * 0.3) * D, main.y + Math.sin(best.a + k * 0.3) * D)] !== K.OUT) inLeft++;
      if (R.kind[cellIndex(R, main.x + Math.cos(best.a - k * 0.3) * D, main.y + Math.sin(best.a - k * 0.3) * D)] !== K.OUT) inRight++;
    }
    circ.dir = inLeft >= inRight ? 1 : -1;
  };
  return {
    think(gg) {
      if (plannedFor !== g.attempts) plan();
      const b = g.bit;
      if (g.heat > 84) cooling = true;
      if (cooling && g.heat < 42) cooling = false;
      if (cooling || g.seizeLeft > 0) return { x: b.x, y: b.y, down: false };
      if (!circ.started) {
        while (pi < path.length - 1 && Math.hypot(path[pi].x - b.x, path[pi].y - b.y) < P.look) pi++;
        let j = pi; // look ahead along the path by distance
        let acc = 0;
        while (j < path.length - 1 && acc < P.look) { acc += Math.hypot(path[j + 1].x - path[j].x, path[j + 1].y - path[j].y); j++; }
        const tgt = path[j];
        if (j >= path.length - 1 && Math.hypot(tgt.x - b.x, tgt.y - b.y) < 22) { circ.started = true; circ.last = Math.atan2(b.y - main.y, b.x - main.x); }
        return { x: tgt.x, y: tgt.y, down: true };
      }
      const th = Math.atan2(b.y - main.y, b.x - main.x);
      circ.swept += Math.max(0, wrap(th - circ.last) * circ.dir); circ.last = th;
      if (main.share >= P.stopAt || circ.swept > P.sweep || g.charge < g.chargeMax * 0.03) return { claw: true };
      // first loop close in, the second a little wider, so the outer part of the shell goes too
      const D = main.r + (circ.swept < 6.0 ? P.ringD : P.ringD + 9);
      const ahead = th + circ.dir * Math.max(0.42, 28 / D);
      return { x: main.x + Math.cos(ahead) * D, y: main.y + Math.sin(ahead) * D, down: true };
    },
  };
}

// --- wobbly --------------------------------------------------------------------------------------------------------
export function wobblyBot(g, o = {}) {
  const P = { sigma: 18, lag: 0.32, memT: 2.6, listenEvery: 200, corrT: 0.45, estSigma: 13, ringD: 26, look: 46, lapse: 0.25, lapseK: 14, pauseEvery: 400, ...o };
  const rnd = roller({ rng: hashSeed('sounding-drill', 'bot', 'wobbly', g.seed, o.salt || 0) });
  const gauss = mkGauss(rnd);
  const R = g.rock, main = R.finds[0];
  let pauseLeft = 0, sincePause = 0, lapsed = false, wp = null, nx = 0, ny = 0, mem = null, memAt = -1e9, lastSeen = -1e9, swept = 0, lastTh = null, dir = 0, sinceListen = 0, listenLeft = 0, cooling = false, lastB = null;
  const hist = [];
  return {
    think(gg, dt) {
      const b = g.bit;
      hist.push({ t: g.t, x: b.x, y: b.y, heat: g.heat });
      while (hist.length > 2 && hist[1].t <= g.t - P.lag) hist.shift();
      const lg = hist[0];
      const a = Math.exp(-dt / P.corrT), s = Math.sqrt(1 - a * a) * P.sigma;
      nx = a * nx + s * gauss(); ny = a * ny + s * gauss();
      if (lastB) { const dd = Math.hypot(b.x - lastB.x, b.y - lastB.y); sinceListen += dd; sincePause += dd; }
      // a person stops to look and think: finger up for a second or two every so often
      if (pauseLeft > 0) { pauseLeft -= dt; return { x: b.x, y: b.y, down: false }; }
      if (sincePause > P.pauseEvery * (0.7 + 0.6 * rnd.next())) { sincePause = 0; pauseLeft = 1 + rnd.next() * 1.8; }
      lastB = { x: b.x, y: b.y };
      // what it can see: only what is lit right now
      if (findLight(g, main) > 0.3) {
        // the glint is on screen: it is exactly where it is (give or take the eye)
        if (!mem) mem = { x: main.x, y: main.y, r: main.r };
        mem.x += (main.x + gauss() * P.estSigma * 0.4 - mem.x) * 0.35; mem.y += (main.y + gauss() * P.estSigma * 0.4 - mem.y) * 0.35;
        lastSeen = g.t; memAt = g.t; lapsed = false;
      } else if (mem && !lapsed) {
        // it has faded: now it is only remembered, and sometimes the memory is wrong
        lapsed = true;
        if (rnd.next() < P.lapse) { mem.x += gauss() * P.estSigma * P.lapseK; mem.y += gauss() * P.estSigma * P.lapseK; }
      }
      if (mem && g.t - memAt > P.memT) { mem = null; sinceListen = P.listenEvery; }
      if (lg.heat > 80) cooling = true;
      if (cooling && lg.heat < 50) cooling = false;
      if (cooling || g.seizeLeft > 0) return { x: b.x, y: b.y, down: false };
      if (listenLeft > 0) { listenLeft -= dt; return { x: b.x, y: b.y, down: true }; }

      if (!mem) {
        // explore: wander the rock (aiming through the middle first), stopping now and then to listen
        if (sinceListen > P.listenEvery) { sinceListen = 0; listenLeft = 0.75; return { x: b.x, y: b.y, down: true }; }
        if (!wp || Math.hypot(wp.x - lg.x, wp.y - lg.y) < 70) {
          if (!wp && !P.centreFirst) { const a = rnd.next() * 6.283, f = 0.1 + rnd.next() * 0.5; wp = { x: R.cx + Math.cos(a) * R.rx * f, y: R.cy + Math.sin(a) * R.ry * f }; }
          else if (!wp) wp = { x: R.cx, y: R.cy };
          else { const a = rnd.next() * 6.283, f = 0.15 + rnd.next() * 0.55; wp = { x: R.cx + Math.cos(a) * R.rx * f, y: R.cy + Math.sin(a) * R.ry * f }; sinceListen = P.listenEvery * 0.7; }
        }
        return { x: wp.x + nx, y: wp.y + ny, down: true };
      }
      const d = Math.hypot(mem.x - lg.x, mem.y - lg.y);
      if (d > mem.r + 80 && dir === 0) {
        const ux = (lg.x - mem.x) / d, uy = (lg.y - mem.y) / d;
        return { x: mem.x + ux * (mem.r + 34) + nx, y: mem.y + uy * (mem.r + 34) + ny, down: true };
      }
      // circle the find
      const th = Math.atan2(lg.y - mem.y, lg.x - mem.x);
      if (dir === 0) { dir = rnd.next() < 0.5 ? 1 : -1; lastTh = th; }
      swept += Math.max(0, wrap(th - lastTh) * dir); lastTh = th;
      const pr = mainProgress(g);
      if (pr.share >= 1 || swept > 2 * Math.PI * 2.4 || g.charge < g.chargeMax * 0.03) return { claw: true };
      const D = mem.r + P.ringD, ahead = th + dir * (P.look / D);
      return { x: mem.x + Math.cos(ahead) * D + nx, y: mem.y + Math.sin(ahead) * D + ny, down: true };
    },
  };
}

// --- lazy and mash -------------------------------------------------------------------------------------------------
export function lazyBot(g) {
  let still = 0, last = { x: g.bit.x, y: g.bit.y };
  return {
    think(gg, dt) {
      if (Math.hypot(g.bit.x - last.x, g.bit.y - last.y) < 0.3) still += dt; else still = 0;
      last = { x: g.bit.x, y: g.bit.y };
      if (still > 2.5) return { claw: true };   // it has hit the rim: it gives up
      return { x: g.bit.x, y: g.rock.H, down: true };
    },
  };
}
export function mashBot(g, o = {}) {
  const rnd = roller({ rng: hashSeed('sounding-drill', 'bot', 'mash', g.seed, o.salt || 0) });
  let until = 0, tx = g.bit.x, ty = g.bit.y, down = true;
  return {
    think() {
      if (g.t >= until) { until = g.t + 0.2 + rnd.next() * 0.3; tx = rnd.next() * g.rock.W; ty = rnd.next() * g.rock.H; down = rnd.next() < 0.85; }
      return { x: tx, y: ty, down };
    },
  };
}

// --- the thinker ---------------------------------------------------------------------------------------------------
/** Like the wobbly hand, but it stops for two to four seconds between moves with the pointer HELD (a thumb resting on the glass). */
export function thinkerBot(g, o = {}) {
  const inner = wobblyBot(g, { pauseEvery: 1e9, ...o });
  const rnd = roller({ rng: hashSeed('sounding-drill', 'bot', 'thinker', g.seed, o.salt || 0) });
  let rest = 0, since = 0, last = { x: g.bit.x, y: g.bit.y };
  return {
    think(gg, dt) {
      const b = g.bit;
      since += Math.hypot(b.x - last.x, b.y - last.y); last = { x: b.x, y: b.y };
      if (rest > 0) { rest -= dt; return { x: b.x, y: b.y, down: true }; }
      if (since > 300 * (0.7 + 0.6 * rnd.next())) { since = 0; rest = 2 + rnd.next() * 2; return { x: b.x, y: b.y, down: true }; }
      return inner.think(gg, dt);
    },
  };
}

export const BOTS = Object.freeze({ perfect: perfectBot, wobbly: wobblyBot, thinker: thinkerBot, lazy: lazyBot, mash: mashBot });

/** Play one attempt to its end. Returns the result and the final game. */
export function playBot(g, bot, { dt = 1 / 30, maxT = 140 } = {}) {
  while (!g.over && g.t < maxT) {
    const inp = bot.think(g, dt);
    if (inp.claw) claw(g); else step(g, dt, inp);
    g.events.length = 0;
  }
  if (!g.over) claw(g);
  return resultOf(g);
}
export { turn };
