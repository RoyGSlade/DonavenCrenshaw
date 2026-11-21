// The five bots the tests (and the builder) use. They play through the same `step(g, dt, input)` a hand would, plus the buttons.
//   perfect : knows the tunnel: plans a route, picks a cleared side, reels at the speed the bends allow, nudges off the walls.
//   wobbly  : a human-ish hand: a shaky pointer, reaction lag, guesses the side by eye, flutters the reel pad, nudges late.
//   thinker : the wobbly hand, but it stops for two to four seconds between moves (pointer held, reel let go).
//   lazy    : gets in cleanly, then holds Reel flat out and never nudges.
//   mash    : scribbles at random.
// Bots never use Math.random: every choice comes from a seeded roller.
import { hashSeed, roller } from './rng.js';
import { BASE, step, grab, goBack, done, giveUp, pathAt, loadRadius } from './model.js';
import { probe, graspCheck } from './board.js';

const mkGauss = (rnd) => () => Math.sqrt(-2 * Math.log(rnd.next() || 1e-9)) * Math.cos(2 * Math.PI * rnd.next());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- planning on the cell grid --------------------------------------------------------------------------------------
/** Cost to reach every open cell from (x, y), preferring the middle of the tunnel. Returns { dist, prev }. */
export function flood(B, x, y, headR = BASE.headR) {
  const n = B.gw * B.gh, dist = new Float32Array(n).fill(1e9), prev = new Int32Array(n).fill(-1);
  if (!B._clear) { B._clear = new Float32Array(n); for (let c = 0; c < n; c++) if (B.open[c]) B._clear[c] = probe(B, ((c % B.gw) + 0.5) * B.cell, (((c / B.gw) | 0) + 0.5) * B.cell, 30).d; }
  const sc = clamp(Math.floor(y / B.cell), 0, B.gh - 1) * B.gw + clamp(Math.floor(x / B.cell), 0, B.gw - 1);
  const heap = [[0, sc]]; dist[sc] = 0;
  const push = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [d0, c] = pop();
    if (d0 > dist[c]) continue;
    const gx = c % B.gw, gy = (c / B.gw) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= B.gw || ny >= B.gh) continue;
      const m = ny * B.gw + nx;
      if (!B.open[m]) continue;
      const w = (dx && dy ? 1.414 : 1) * (1 + 6 * Math.max(0, 14 - B._clear[m]) / 14);
      if (dist[m] > dist[c] + w) { dist[m] = dist[c] + w; prev[m] = c; push([dist[m], m]); }
    }
  }
  return { dist, prev, sc };
}
const cellXY = (B, c) => ({ x: ((c % B.gw) + 0.5) * B.cell, y: (((c / B.gw) | 0) + 0.5) * B.cell });
function routeTo(B, fl, tc) {
  const pts = [];
  for (let c = tc; c >= 0; c = fl.prev[c]) { pts.push(cellXY(B, c)); if (c === fl.sc) break; }
  pts.reverse();
  // pull the string: keep only the points the straight line cannot skip
  const clearLine = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y); for (let s = 0; s <= L; s += 4) if (probe(B, a.x + (b.x - a.x) * s / L, a.y + (b.y - a.y) * s / L, 12).d < 10.5) return false; return true; };
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clearLine(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
  return out;
}

/** Candidate places to close the jaws on a find: round it, open, wide enough, and with the side cleared. `check` false = by eye (not checked). */
function approachSpots(g, i, check = true) {
  const B = g.board, f = g.finds[i], out = [];
  if (f.state === 'lying') return [{ x: f.x, y: f.y, a: 0 }];
  for (let k = 0; k < 36; k++) {
    const a = k / 36 * Math.PI * 2;
    const x = f.x + Math.cos(a) * (f.r + 13), y = f.y + Math.sin(a) * (f.r + 13);
    const c = Math.floor(y / B.cell) * B.gw + Math.floor(x / B.cell);
    if (!B.open[c] || probe(B, x, y, 12).d < BASE.headR + 1.5) continue;
    if (check && !graspCheck(B, f, x, y, BASE.reach, i).ok) continue;
    out.push({ x, y, a });
  }
  return out;
}

// --- the shared hand ------------------------------------------------------------------------------------------------
/** Follows a plan: where to point going in, when to grab, and which find to go for. */
function planner(g, { check = true, rnd = null, eyeNoise = 0 } = {}) {
  let plan = null, planKey = '', bad = new Set();
  const nextTarget = () => {
    // the main find first, then any other that can still be taken
    const order = g.finds.map((f, i) => i).filter((i) => g.finds[i].state === 'rock' || g.finds[i].state === 'lying');
    return order;
  };
  const make = (targets, wantBonus) => {
    const fl = flood(g.board, g.anchor.x, g.anchor.y);
    let best = null;
    for (const i of targets) {
      if (i !== 0 && !wantBonus) continue;
      const f = g.finds[i];
      if (f.state === 'rock' && !f.canGrab) continue;
      for (const sp of approachSpots(g, i, check)) {
        const key = `${i}:${Math.round(sp.a * 10)}`;
        if (bad.has(key)) continue;
        const c = Math.floor(sp.y / g.board.cell) * g.board.gw + Math.floor(sp.x / g.board.cell);
        let d = fl.dist[c]; if (d >= 1e8) continue;
        if (rnd && !check) d *= 1 + rnd.next() * 0.25;   // by eye: it takes the nearest-looking side, give or take
        d += i === 0 ? 0 : 400;
        if (!best || d < best.d) best = { d, spot: sp, i, key, c };
      }
    }
    if (!best) return null;
    return { ...best, route: routeTo(g.board, fl, best.c), ri: 0 };
  };
  return {
    bad,
    /** Returns { x, y, grab } for this moment, or null when there is nothing left to go for. */
    aim(wantBonus) {
      const key = `${g.attempts}:${g.drops}:${g.outCount}:${g.phase}`;
      if (!plan || planKey !== key || plan.stale) { plan = make(nextTarget(), wantBonus); planKey = key; }
      if (!plan) return null;
      const a = g.anchor, P = plan.route;
      // progress along the route: the nearest point of it ahead of where we were, then look 40 units further on
      if (!plan.S) { plan.S = [0]; for (let k = 1; k < P.length; k++) plan.S.push(plan.S[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y)); plan.prog = 0; }
      let bestD = 1e9, bestS = plan.prog;
      for (let k = 0; k < P.length - 1; k++) {
        if (plan.S[k + 1] < plan.prog - 1) continue;
        const dx = P[k + 1].x - P[k].x, dy = P[k + 1].y - P[k].y, l2 = dx * dx + dy * dy || 1;
        const u = clamp(((a.x - P[k].x) * dx + (a.y - P[k].y) * dy) / l2, 0, 1);
        const d = Math.hypot(a.x - (P[k].x + dx * u), a.y - (P[k].y + dy * u));
        const sAt = plan.S[k] + u * Math.sqrt(l2);
        if (d < bestD && sAt >= plan.prog - 1 && sAt <= plan.prog + 60) { bestD = d; bestS = sAt; }
        if (plan.S[k] > plan.prog + 120) break;
      }
      plan.prog = Math.max(plan.prog, bestS);
      const want = Math.min(plan.S[plan.S.length - 1], plan.prog + 22);
      let k2 = 0; while (k2 < P.length - 2 && plan.S[k2 + 1] < want) k2++;
      const seg = plan.S[k2 + 1] - plan.S[k2] || 1, uu = clamp((want - plan.S[k2]) / seg, 0, 1);
      const tgt = P.length === 1 ? P[0] : { x: P[k2].x + (P[k2 + 1].x - P[k2].x) * uu, y: P[k2].y + (P[k2 + 1].y - P[k2].y) * uu };
      const last = P[P.length - 1];
      const atEnd = Math.hypot(last.x - g.head.x, last.y - g.head.y) < 7 + eyeNoise;
      return { x: tgt.x, y: tgt.y, atEnd, plan };
    },
    refused(why) { if (plan) { bad.add(plan.key); plan.stale = true; } void why; },
    reset() { plan = null; },
  };
}

// --- reel control --------------------------------------------------------------------------------------------------
/** The fastest the load can go over the rough ground coming up: the jolts grow with the square of the speed and the slack is what the tunnel leaves. */
function safeSpeed(g, c = 1) {
  const P = g.path, f = g.finds[g.carry], K = g.rules.sway * (1 + BASE.loadSway * (f.r / 40));
  const ahead = clamp(g.v * 0.55 + 24, 24, 130);
  let slack = 99;
  for (let d = 0; d <= ahead; d += 8) { const q = pathAt(P, g.s - d); slack = Math.min(slack, probe(g.board, q.x, q.y, 20).d - f.carriedR); }
  slack = Math.max(1.5, slack);
  const w = 2 * Math.PI / (g.rules.period * (1 + 0.12 * (f.r / 40))), Q = 1 / (2 * g.rules.damping);
  return BASE.slow * (c * slack * w * w / (K * Q * BASE.jostle)) ** (1 / BASE.jostleExp);
}

function reelControl(g, o, rnd, st) {
  // pace: hold while below what the bends coming up allow
  const vs = safeSpeed(g, o.paceC);
  const hold = g.v < Math.min(o.vmax ?? BASE.full, Math.max(vs, o.vmin ?? 72));   // a careful hand never stops dead mid-trip: the load would swing on into the wall
  // keep the load off the walls: push the cable's end away from the nearest wall
  const pr = probe(g.board, g.head.x, g.head.y, g.head.r + 14);
  let nx = 0, ny = 0;
  const want = g.head.r + o.margin;
  if (pr.d < want) { const k = clamp((want - pr.d) / 4, 0, 1); nx = pr.nx * k; ny = pr.ny * k; }
  void rnd; void st;
  return { reel: hold, nx, ny };
}

// --- perfect -------------------------------------------------------------------------------------------------------
export function perfectBot(g, o = {}) {
  const P = { paceC: 0.4, margin: 2, vmax: 100, vmin: 80, ...o };
  const pl = planner(g, { check: true });
  let lastFail = -9, waitT = 0;
  return {
    think() {
      if (g.over) return {};
      if (g.phase === 'bay') {
        // the perfect hand fetches every other find it can
        const more = g.finds.some((f) => (f.state === 'rock' && f.canGrab) || f.state === 'lying');
        return more ? { goBack: true } : { done: true };
      }
      if (g.phase === 'reel') {
        // let the swing from the grab settle before the first pull
        if (g.reeledT < 0.01 && Math.hypot(g.off.x, g.off.y) + Math.hypot(g.off.vx, g.off.vy) * 0.2 > 1.6 && g.t - (g.grabT ??= g.t) < 1.5) return { reel: false, nx: 0, ny: 0 };
        return reelControl(g, P, null, null);
      }
      if (g.phase !== 'in') return {};
      const a = pl.aim(true);
      if (!a) return { done: g.passed, giveUp: !g.passed };
      g.grabT = undefined;
      const calm = Math.hypot(g.off.x, g.off.y) < 2.5 && Math.hypot(g.anchor.vx, g.anchor.vy) < 10;
      if (a.atEnd && g.t - lastFail > 0.4 && Math.hypot(g.head.x - g.anchor.x, g.head.y - g.anchor.y) < 6 && (calm || (waitT += 1 / 60) > 1.2)) {
        waitT = 0;
        return { x: a.x, y: a.y, down: true, grab: true };
      }
      return { x: a.x, y: a.y, down: true };
    },
    refused(why) { lastFail = g.t; pl.refused(why); },
  };
}

// --- wobbly --------------------------------------------------------------------------------------------------------
export function wobblyBot(g, o = {}) {
  const P = { sigma: 7, lag: 0.28, paceC: 1.3, margin: 2.5, flutter: 0.35, hold: [1.2, 2.2], nudgeLag: 0.3, nudgeSigma: 0.35, eye: 6, lapse: 0.15, ...o };
  const rnd = roller({ rng: hashSeed('claw-pull', 'bot', o.kind || 'wobbly', g.seed, o.salt || 0) });
  const gauss = mkGauss(rnd);
  const pl = planner(g, { check: false, rnd, eyeNoise: P.eye });
  const hist = [];       // delayed view of the world: what the hand saw a moment ago
  let held = 0, off = 0, nudge = { x: 0, y: 0 }, nTimer = 0, grabAt = -9, wait = 0, paceT = 0, paceMis = 1;
  const seen = () => { const t = g.t - P.lag; let k = hist.length - 1; while (k > 0 && hist[k].t > t) k--; return hist[Math.max(0, k)] || { x: g.head.x, y: g.head.y, d: 99, nx: 0, ny: 0 }; };
  return {
    think(gg, dt) {
      if (g.over) return {};
      const pr = probe(g.board, g.head.x, g.head.y, 24);
      hist.push({ t: g.t, x: g.head.x, y: g.head.y, d: pr.d, nx: pr.nx, ny: pr.ny }); if (hist.length > 80) hist.shift();
      if (g.phase === 'bay') return { done: true };
      if (g.phase === 'in') {
        const a = pl.aim(false);
        if (!a) return { giveUp: !g.passed, done: g.passed };
        const tx = a.x + gauss() * P.sigma, ty = a.y + gauss() * P.sigma;
        if (a.atEnd && g.t - grabAt > 0.9 && Math.hypot(g.head.x - g.anchor.x, g.head.y - g.anchor.y) < 9) { grabAt = g.t; return { x: tx, y: ty, down: true, grab: true }; }
        return { x: tx, y: ty, down: true };
      }
      if (g.phase === 'reel') {
        // the pad: hold a second or two, let go a moment (the thumb flutters), slow down for a bend it can see
        wait -= dt; held -= dt;
        if (held <= 0 && off <= 0) { off = P.flutter * (0.5 + rnd.next()); }
        if (off > 0) { off -= dt; if (off <= 0) held = P.hold[0] + rnd.next() * (P.hold[1] - P.hold[0]); }
        // it judges the bends by eye: every second or so it re-reads the speed it thinks is fine, and is off by a third either way
        paceT -= dt;
        if (paceT <= 0) { paceT = 0.7 + rnd.next() * 0.8; paceMis = rnd.next() < P.lapse ? 20 : 0.65 + rnd.next() * 0.9; }   // now and then its mind is elsewhere and it ignores the bend
        const vs = safeSpeed(g, P.paceC) * paceMis;
        const frac = g.grip / g.gripNow;
        const reel = held > 0 && off <= 0 && g.v < Math.min(BASE.full, vs) && (frac > 0.45 || g.v < 60);
        // the nudge: late, and a little off
        nTimer -= dt;
        if (nTimer <= 0) {
          nTimer = P.nudgeLag * (0.7 + 0.6 * rnd.next());
          const v = seen(), want = g.head.r + P.margin;
          if (v.d < want) { const k = clamp((want - v.d) / 4, 0, 1); nudge = { x: v.nx * k + gauss() * P.nudgeSigma * 0.4, y: v.ny * k + gauss() * P.nudgeSigma * 0.4 }; } else nudge = { x: 0, y: 0 };
        }
        return { reel, nx: nudge.x, ny: nudge.y };
      }
      return {};
    },
    refused(why) { pl.refused(why); },
  };
}

// --- thinker -------------------------------------------------------------------------------------------------------
/** The wobbly hand that stops for two to four seconds between moves: the pointer held still going in, the pad let go while reeling. */
export function thinkerBot(g, o = {}) {
  const inner = wobblyBot(g, { kind: 'thinker', ...o });
  const rnd = roller({ rng: hashSeed('claw-pull', 'bot', 'thinker', g.seed, o.salt || 0) });
  let rest = 0, since = 0, last = { x: g.head.x, y: g.head.y }, lastPhase = g.phase;
  return {
    think(gg, dt) {
      if (g.over) return {};
      const b = g.head;
      if (g.phase !== lastPhase) { lastPhase = g.phase; since = 0; rest = 0; }
      since += Math.hypot(b.x - last.x, b.y - last.y) + (g.phase === 'reel' ? g.v * dt : 0); last = { x: b.x, y: b.y };
      if (rest > 0) { rest -= dt; return g.phase === 'in' ? { x: b.x, y: b.y, down: true } : { reel: false }; }
      if (g.phase !== 'bay' && since > (g.phase === 'reel' ? 620 : 260) * (0.7 + 0.6 * rnd.next())) { since = 0; rest = 2 + rnd.next() * 2; g.restedT = (g.restedT || 0) + rest; return g.phase === 'in' ? { x: b.x, y: b.y, down: true } : { reel: false }; }
      return inner.think(gg, dt);
    },
    refused(why) { inner.refused(why); },
  };
}

// --- lazy ----------------------------------------------------------------------------------------------------------
/** Points straight at the find and lets the walls steer it, grabs on sight, then holds Reel flat out and never nudges. */
export function lazyBot(g, o = {}) {
  const pl = planner(g, { check: !!o.clean });
  let grabAt = -9;
  return {
    think() {
      if (g.over) return {};
      if (g.phase === 'bay') return { done: true };
      if (g.phase === 'reel') return { reel: true };
      if (g.phase !== 'in') return {};
      const a = pl.aim(false);
      if (!a) return { giveUp: !g.passed, done: g.passed };
      // it points straight at where it wants to be and lets the walls steer it, then grabs the moment the jaws are near
      const last = o.clean ? { x: a.x, y: a.y, end: a.atEnd } : a.plan.route[a.plan.route.length - 1];
      if (o.clean && a.atEnd && Math.hypot(g.head.x - g.anchor.x, g.head.y - g.anchor.y) < 8 && g.t - grabAt > 0.9) { grabAt = g.t; return { x: a.x, y: a.y, down: true, grab: true }; }
      if (o.clean) return { x: a.x, y: a.y, down: true };
      if (Math.hypot(last.x - g.head.x, last.y - g.head.y) < 14 && g.t - grabAt > 0.9) { grabAt = g.t; return { x: last.x, y: last.y, down: true, grab: true }; }
      return { x: last.x, y: last.y, down: true };
    },
    refused(why) { pl.refused(why); },
  };
}

// --- mash ----------------------------------------------------------------------------------------------------------
export function mashBot(g, o = {}) {
  const rnd = roller({ rng: hashSeed('claw-pull', 'bot', 'mash', g.seed, o.salt || 0) });
  let until = 0, tx = g.head.x, ty = g.head.y, down = true, reel = false, nx = 0, ny = 0;
  return {
    think() {
      if (g.over) return {};
      if (g.t >= until) {
        until = g.t + 0.15 + rnd.next() * 0.3;
        tx = rnd.next() * g.board.W; ty = rnd.next() * g.board.H; down = rnd.next() < 0.85; reel = rnd.next() < 0.6;
        nx = rnd.next() * 2 - 1; ny = rnd.next() * 2 - 1;
      }
      const grabNow = rnd.next() < 0.02;
      if (g.phase === 'bay') return rnd.next() < 0.5 ? { goBack: true } : { done: true };
      return { x: tx, y: ty, down, reel, nx, ny, grab: grabNow };
    },
  };
}

export const BOTS = Object.freeze({ perfect: perfectBot, wobbly: wobblyBot, thinker: thinkerBot, lazy: lazyBot, mash: mashBot });

/** Play one game to its end. Returns the game. */
export function playBot(g, bot, { dt = 1 / 60, maxT = 150 } = {}) {
  let guard = 0;
  while (!g.over && g.t < maxT && guard++ < maxT / dt + 10) {
    const inp = bot.think(g, dt);
    if (inp.goBack) goBack(g);
    else if (inp.done) done(g);
    else if (inp.giveUp) giveUp(g);
    if (g.over) break;
    if (inp.grab && g.phase === 'in') { const r = grab(g); if (!r.ok) bot.refused?.(r.why); }
    step(g, dt, inp);
    g.events.length = 0;
  }
  if (!g.over) giveUp(g);
  return g;
}
export { loadRadius };
