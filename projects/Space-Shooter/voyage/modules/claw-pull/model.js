// Claw: the pure rules. Seeded, no DOM, no clock, no Math.random; time comes in as `dt`.
// A claw head hangs on a cable and sways. Going in, it follows the pointer through the tunnel the drill cut. A tap closes the jaws on a find
// (the side has to be cleared). Reeling drags the load back along the way the head came in; the load swings, knocks the walls, and every
// knock loosens the grip, which also tires while you reel. When the grip goes the find drops, takes a crack, and lies somewhere else.
// Every number below is a placeholder from the brief until a real hand says otherwise; where tuning moved one, the comment says so.
import { hashSeed, roller } from './rng.js';
import { buildBoard, probe, openCore, graspCheck, looseCheck, cellAt } from './board.js';

export const TIERS = Object.freeze([-2, -1, 0, 1, 2]);
export const PATHS = Object.freeze(['control', 'maneuver', 'pursuit']);
/** Stardust's piloting names for the same three paths, accepted as aliases. */
export const ALIASES = Object.freeze({ handling: 'control', boost: 'maneuver', landing: 'pursuit' });
export const POINT_MAX = 9;

/** The shared tier numbers (copied from minigames/setup.js: time x is the grip clock) plus this game's sway scale. */
export const TIER = Object.freeze({
  '-2': Object.freeze({ time: 0.70, label: 'Rough' }),
  '-1': Object.freeze({ time: 0.85, label: 'Shaky' }),
  '0': Object.freeze({ time: 1.00, label: 'Steady' }),
  '1': Object.freeze({ time: 1.15, label: 'Good' }),
  '2': Object.freeze({ time: 1.30, label: 'Smooth' }),
});
export const tierOf = (tier) => Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
export const tierInfo = (tier) => TIER[String(tierOf(tier))];

export const BASE = Object.freeze({
  speedIn: 180,                 // head speed going in, units a second (brief)
  headR: 4.5,                     // collision radius of the folded head. The brief's "30 wide" is the jaws spread; the drill's tunnel is only about 26 wide (measured), so the folded head is what has to fit
  loadPad: 10,                  // the brief's "+10": the load's extra width at 0 points (7.3 at 9)
  loadR: 2.2,                   // how much radius the load adds at pad 10 for a core of radius 40 (tuned: the brief's core width + 10 cannot fit a 26-wide tunnel)
  period: 1.1, damping: 0.35,   // sway: natural period (s) and damping (brief)
  loadSway: 0.35,               // a load swings 1 + 0.35 x (core radius / 40) times as far as the empty head (brief: a bigger find swings more)
  reach: 26,                    // grab reach from the head to the core's skin (brief)
  slow: 80, full: 200,          // reel speeds (brief)
  rampUp: 0.7, rampDown: 2.2,   // how fast a held pad winds the winch from slow to full, and how fast it unwinds when let go (per second)
  accel: 100, brake: 140,       // how fast the winch itself speeds up and slows down (units a second per second)
  grip: 100,                    // the grip (brief)
  crackGrip: 0.1,               // each crack takes this share off the grip on that find (not in the brief: it is what makes a drop a harder problem)
  knockLo: 22, knockHi: 40,     // a knock costs this much by how hard the load hit (brief: 22 to 40 by speed)
  strain: 30,                   // a fast pull strains the jaws this much a second at full reel, by the square of how far past slow it is (not in the brief)
  tire: 3,                      // the grip tires this much a second while you reel (brief 2.5; raised a little so that creeping all the way is not free)
  nudgeMax: 16, nudgeW: 8,      // how far the nudge can shift the cable's end, and how quickly it follows the push (per second)
  lead: 64,                     // how far ahead of the head the pointer's anchor may run
  knockSpeed: 3, knockCool: 0.4, grindAfter: 0.3,
  shatter: 3,                   // cracks to shatter, shared with the drill (brief)
  gradeMain: 70, perKnock: 6, floorMain: 40, perBonus: 15, noDrop: 15,   // brief
  jostle: 24, jostleExp: 3,     // sideways jolts from the rough rock: units a second per second at the slow reel, growing with the cube of the speed (not in the brief: it is what makes a fast reel swing the load into the walls)
  grain: 1.5, grainL: 110,      // the rock's grain: how far the cable wanders either side (units) and over what length
  landT: 1.5,                   // the load rising into the bay light
  openAt: 18,                   // the head is "at the mouth" within this many units of it
});

export function cleanPoints(points) {
  const out = {};
  for (const p of PATHS) {
    const alias = Object.keys(ALIASES).find((k) => ALIASES[k] === p);
    const v = points?.[p] ?? (alias ? points?.[alias] : 0);
    out[p] = Math.max(0, Math.min(POINT_MAX, Math.trunc(v) || 0));
  }
  return out;
}

/** What a roll and the points do to the game, in one place so the tests and the view agree. */
export function rulesFor({ tier = 0, points = {}, quick = false } = {}) {
  const t = tierOf(tier), info = tierInfo(t), p = cleanPoints(points);
  const pad = BASE.loadPad * (1 - 0.03 * p.maneuver);
  const ease = 1 - 0.04 * p.pursuit;
  return {
    tier: t, label: info.label, points: p, quick: !!quick,
    sway: 1 - 0.12 * t,                                    // x (1 - 0.12 t)
    damping: BASE.damping * (1 + 0.06 * p.control),        // 0.35 to 0.54 at 9 points
    period: BASE.period,
    pad,                                                   // +10 to +7.3
    gripMax: BASE.grip * info.time,                        // the shared tier clock, 0.70 to 1.30
    knockLo: BASE.knockLo * ease, knockHi: BASE.knockHi * ease,   // 22 to 40, down to 14 to 26
    freeTire: 2 * Math.floor(p.pursuit / 3),               // seconds of a trip the grip does not tire (every 3 points: 2 s)
    tire: BASE.tire,
  };
}
export const loadRadius = (rules, f) => BASE.headR + rules.pad / 10 * BASE.loadR * (f.r / 40);

// ---------------------------------------------------------------------------------------------------------------------
// The cable's path

const pathLen = (P) => (P.length ? P[P.length - 1].s : 0);
/** Position and heading on the path at arc length s (clamped). */
export function pathAt(P, s) {
  if (P.length < 2) return { x: P[0].x, y: P[0].y, tx: 1, ty: 0 };
  s = Math.max(0, Math.min(pathLen(P), s));
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], seg = b.s - a.s || 1, u = (s - a.s) / seg;
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  return { x: a.x + dx * u, y: a.y + dy * u, tx: dx / l, ty: dy / l };
}
function withS(pts) { let s = 0; return pts.map((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); return { x: p.x, y: p.y, s }; }); }
/** Resample a polyline to even spacing. */
function resample(P, step) {
  if (P.length < 2) return P.slice();
  const L = pathLen(P), out = [];
  for (let s = 0; s < L; s += step) { const q = pathAt(P, s); out.push({ x: q.x, y: q.y }); }
  out.push({ x: P[P.length - 1].x, y: P[P.length - 1].y });
  return withS(out);
}
/**
 * The cable takes up its slack when the jaws close: the path is smoothed and eased away from walls. Which way in stays the player's;
 * only the little jitters of a hand are taken out, so the load is never dragged through a wall a hand brushed.
 */
export function relaxPath(B, P0, grain = null) {
  let P = resample(P0, 8);
  for (let it = 0; it < 3; it++) {
    const Q = P.map((p, i) => {
      if (i === 0 || i === P.length - 1) return { x: p.x, y: p.y };
      const a = P[i - 1], b = P[i + 1];
      let x = p.x * 0.5 + (a.x + b.x) * 0.25, y = p.y * 0.5 + (a.y + b.y) * 0.25;
      const pr = probe(B, x, y, 18);
      if (pr.d < 9) { const k = Math.min(2.5, 9 - pr.d); x += pr.nx * k; y += pr.ny * k; }
      return { x, y };
    });
    P = withS(Q);
  }
  // The rock's own grain: the cable never lies dead straight. It wanders a few units either side where the rock is rough, with a wavelength of
  // a hundred units or so, so a fast reel whips the load and a slow one does not. Seeded by the rock, kept clear of the walls.
  if (grain) {
    const Q = P.map((p, i) => {
      if (i === 0 || i === P.length - 1) return { x: p.x, y: p.y };
      const a = P[i - 1], b = P[i + 1], tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
      const w = grain.amp * (Math.sin(p.s / grain.l1 + grain.p1) * 0.65 + Math.sin(p.s / grain.l2 + grain.p2) * 0.35);
      const fade = Math.min(1, p.s / 40, (pathLen(P) - p.s) / 40);   // no grain at the mouth and at the find
      let x = p.x - ty / tl * w * fade, y = p.y + tx / tl * w * fade;
      const pr = probe(B, x, y, 14);
      if (pr.d < 6) { x = p.x; y = p.y; }
      return { x, y };
    });
    P = withS(Q);
  }
  return resample(P, 8);
}

// ---------------------------------------------------------------------------------------------------------------------
// The game

/**
 * Start a game.
 * `result` is a drill result ({ finds, tunnel }); `items` the host's records. The caller (index.js / the view) has already picked a result when
 * the host gave none (see board.pickResult), so the model itself is the same either way.
 */
export function createGame({ seed = 1, tier = 0, points = {}, quick = false, result, items = {}, fixtures = {} } = {}) {
  const rules = rulesFor({ tier, points, quick });
  const B = buildBoard({ result, items: { ...(fixtures.items || {}), ...items }, quick });
  const finds = B.finds.map((f) => ({
    ...f, home: { x: f.x, y: f.y }, state: 'rock', cracks: f.cracks, drops: 0, knocks: 0, carriedR: loadRadius(rules, f), lieFrom: null, rollT: 9,
    canGrab: false,
  }));
  const g = {
    seed, rules, board: B, finds, t: 0, phase: 'in', over: null,
    head: { x: B.start.x, y: B.start.y, r: BASE.headR }, anchor: { x: B.start.x, y: B.start.y, vx: 0, vy: 0 }, off: { x: 0, y: 0, vx: 0, vy: 0 }, aVel: { x: 0, y: 0 },
    path: withS([{ x: B.start.x, y: B.start.y }]), pathSample: { x: B.start.x, y: B.start.y },
    carry: -1, grip: 0, gripMax: rules.gripMax, s: 0, nudge: { x: 0, y: 0 }, nudgeIn: { x: 0, y: 0 },
    reelHold: false, ramp: 0, v: 0, reeledT: 0, tripTired: 0,
    touching: false, touchT: 0, knockCool: 0, lastN: { x: 0, y: 0 }, scrapeT: 0,
    knocks: 0, knocksTrip: 0, drops: 0, landT: 0, landFind: -1, passed: false,
    say: { text: '', t: 0, tone: '' }, events: [], grabbed: 0, outCount: 0, lastGrabFail: '',
    attempts: 1,
    jost: (() => { const r = roller({ rng: hashSeed('claw-pull', 'jostle', seed) }); return { f: [0.7 + r.next() * 0.25, 0.95 + r.next() * 0.3, 1.2 + r.next() * 0.4], p: [r.next() * 6.28, r.next() * 6.28, r.next() * 6.28] }; })(),
  };
  finds.forEach((f, i) => { f.canGrab = canEverGrab(g, i); });
  return g;
}

/** Can the jaws ever close on this find from open ground? (Used to offer "go back for the other one".) */
function canEverGrab(g, i) {
  const f = g.finds[i], B = g.board;
  if (f.state === 'lying') return true;
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * Math.PI * 2;
    for (const rr of [10, 20]) {
      const x = f.x + Math.cos(a) * (f.r + rr), y = f.y + Math.sin(a) * (f.r + rr);
      if (!B.open[cellAt(B, x, y)] || probe(B, x, y, 12).d < BASE.headR) continue;
      if (graspCheck(B, f, x, y, BASE.reach, i).ok) return true;
    }
  }
  return false;
}

const say = (g, text, tone = '', secs = 1.6) => { g.say = { text, t: secs, tone }; };
const emit = (g, ev) => g.events.push(ev);
export const drain = (g) => { const e = g.events; g.events = []; return e; };

const loadOf = (g) => (g.carry >= 0 ? g.finds[g.carry] : null);
const headRadius = (g) => { const f = loadOf(g); return f ? f.carriedR : BASE.headR; };
const swayScale = (g) => { const f = loadOf(g); return g.rules.sway * (f ? 1 + BASE.loadSway * (f.r / 40) : 1); };

/** The sway offset: a damped spring driven by the anchor's own acceleration, so a bend or a start swings the load. */
function swing(g, dt, ax, ay) {
  const o = g.off, f = loadOf(g);
  const per = g.rules.period * (f ? 1 + 0.12 * (f.r / 40) : 1), w = 2 * Math.PI / per, z = g.rules.damping;
  const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
  for (let i = 0; i < n; i++) {
    o.vx += (-w * w * o.x - 2 * z * w * o.vx - ax) * h; o.vy += (-w * w * o.y - 2 * z * w * o.vy - ay) * h;
    o.x += o.vx * h; o.y += o.vy * h;
  }
  const lim = 60 / Math.max(0.3, swayScale(g)), l = Math.hypot(o.x, o.y);
  if (l > lim) { o.x *= lim / l; o.y *= lim / l; }
}

/** Put the head where the anchor and the sway say, then push it out of the walls. Returns the wall hit, if any. */
function seat(g, dt, K) {
  const B = g.board, o = g.off, a = g.anchor, r = headRadius(g);
  let hx = a.x + o.x * K, hy = a.y + o.y * K;
  let hit = null;
  for (let it = 0; it < 3; it++) {
    const pr = probe(B, hx, hy, r + 2);
    if (pr.d >= r) break;
    const pen = r - pr.d;
    hx += pr.nx * pen; hy += pr.ny * pen;
    // the speed the head was running into the wall
    const vhx = a.vx + o.vx * K, vhy = a.vy + o.vy * K, vn = -(vhx * pr.nx + vhy * pr.ny);
    if (vn > 0) { o.vx += pr.nx * vn * 1.2 / K; o.vy += pr.ny * vn * 1.2 / K; }
    hit = { nx: pr.nx, ny: pr.ny, vn: Math.max(vn, hit?.vn || 0), pen };
  }
  // keep the offset in step with where the head really is (the wall took part of the swing)
  o.x = (hx - a.x) / K; o.y = (hy - a.y) / K;
  g.head.x = hx; g.head.y = hy;
  return hit;
}

function knockCost(g, sev) { return g.rules.knockLo + (g.rules.knockHi - g.rules.knockLo) * Math.max(0, Math.min(1, sev)); }

/** One tick. `input` = { x, y, down } (the pointer's place on the board, going in), { reel, nx, ny } (the pad and the nudge, reeling). */
export function step(g, dt, input = {}) {
  if (g.over) return;
  g.t += dt;
  g.knockCool = Math.max(0, g.knockCool - dt);
  g.say.t = Math.max(0, g.say.t - dt);
  if (g.phase === 'in') stepIn(g, dt, input);
  else if (g.phase === 'reel') stepReel(g, dt, input);
  else if (g.phase === 'land') stepLand(g, dt);
  // loose finds that rolled settle
  for (const f of g.finds) if (f.rollT < 1) f.rollT = Math.min(1, f.rollT + dt / 0.55);
}

function stepIn(g, dt, input) {
  const B = g.board, a = g.anchor;
  const down = !!input.down;
  let tx = input.x ?? a.x, ty = input.y ?? a.y;
  if (!down) { tx = a.x; ty = a.y; }
  // the anchor runs toward the pointer, never further than `lead` ahead of the head
  const hx = g.head.x, hy = g.head.y;
  const lx = tx - hx, ly = ty - hy, ll = Math.hypot(lx, ly);
  if (ll > BASE.lead) { tx = hx + lx / ll * BASE.lead; ty = hy + ly / ll * BASE.lead; }
  const dx = tx - a.x, dy = ty - a.y, L = Math.hypot(dx, dy);
  const slow = g.touching ? 0.55 : 1;
  const sp = Math.min(BASE.speedIn * slow, L * 7);
  let nx = a.x, ny = a.y;
  if (L > 0.5) { nx = a.x + dx / L * sp * dt; ny = a.y + dy / L * sp * dt; }
  // the anchor slides along the walls: it never goes into rock
  const ar = BASE.headR * 0.7;
  const free = (x, y) => probe(B, x, y, ar + 1).d >= ar;
  if (!free(nx, ny)) {
    let best = null;
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const ang = Math.atan2(dy, dx) + da, x = a.x + Math.cos(ang) * sp * dt * 0.9, y = a.y + Math.sin(ang) * sp * dt * 0.9;
      if (free(x, y)) { const score = Math.cos(da); if (!best || score > best.score) best = { x, y, score }; }
    }
    if (best) { nx = best.x; ny = best.y; } else { nx = a.x; ny = a.y; }
  }
  // the cable cannot run through rock: the anchor stays in sight of the head, so it is never left on the far side of a corner
  {
    const sx = nx - g.head.x, sy = ny - g.head.y, sl = Math.hypot(sx, sy);
    if (sl > 6) {
      let t = 1;
      for (let k = 1; k <= 12; k++) { const u = k / 12; if (probe(B, g.head.x + sx * u, g.head.y + sy * u, ar + 1).d < ar) { t = (k - 1) / 12; break; } }
      if (t < 1) { nx = g.head.x + sx * t; ny = g.head.y + sy * t; }
    }
  }
  const vx = (nx - a.x) / dt, vy = (ny - a.y) / dt;
  const ax = (vx - a.vx) / dt, ay = (vy - a.vy) / dt;
  a.x = nx; a.y = ny; a.vx = vx; a.vy = vy;
  swing(g, dt, ax, ay);
  const hit = seat(g, dt, swayScale(g));
  g.touching = !!hit;
  if (hit) { g.scrapeT += dt; if (g.scrapeT > 0.18) { g.scrapeT = 0; emit(g, { type: 'scrape', x: g.head.x - hit.nx * BASE.headR, y: g.head.y - hit.ny * BASE.headR, nx: hit.nx, ny: hit.ny, loaded: false }); } }
  // the cable remembers the way in: a point every few units, and retracing it reels the cable back in
  const ps = g.pathSample;
  if (Math.hypot(a.x - ps.x, a.y - ps.y) >= 6) { recordPath(g, a.x, a.y); g.pathSample = { x: a.x, y: a.y }; }
  nearbyWords(g);
}

function recordPath(g, x, y) {
  const P = g.path;
  const L = pathLen(P);
  // retrace: if the new point lies on an earlier part of the cable, the cable between is reeled in
  for (let j = 0; j < P.length - 1; j++) {
    if (L - P[j].s < 36) break;
    if (Math.hypot(P[j].x - x, P[j].y - y) < 9) { P.length = j + 1; break; }
  }
  const last = P[P.length - 1];
  P.push({ x, y, s: last.s + Math.hypot(x - last.x, y - last.y) });
}

/** Plain words about what is near, going in. */
function nearbyWords(g) {
  if (g.say.t > 0) return;
  const B = g.board;
  let best = null;
  g.finds.forEach((f, i) => {
    if (f.state !== 'rock' && f.state !== 'lying') return;
    const d = Math.hypot(f.x - g.head.x, f.y - g.head.y) - f.r;
    if (!best || d < best.d) best = { d, i, f };
  });
  g.nearest = best;
  void B;
}

/** The player closes the jaws. Returns { ok, why } and says it in words. */
export function grab(g) {
  if (g.over || g.phase !== 'in') return { ok: false, why: 'busy' };
  const B = g.board;
  let seen = null, buried = null, nearest = null;
  for (let i = 0; i < g.finds.length; i++) {
    const f = g.finds[i];
    if (f.state !== 'rock' && f.state !== 'lying') continue;
    const d = Math.hypot(f.x - g.head.x, f.y - g.head.y);
    if (!nearest || d - f.r < nearest.d) nearest = { d: d - f.r, i };
    const chk = f.state === 'lying' ? looseCheck(f, g.head.x, g.head.y, BASE.reach) : graspCheck(B, f, g.head.x, g.head.y, BASE.reach, i);
    if (chk.ok) { if (!seen || d < seen.d) seen = { d, i }; } else if (chk.why === 'buried') buried = i;
  }
  if (!seen) {
    const why = buried != null ? 'buried' : 'far';
    g.lastGrabFail = why;
    if (why === 'buried') { say(g, "that side's still buried", 'warn', 2.0); emit(g, { type: 'buried', x: g.head.x, y: g.head.y, find: buried }); }
    else { say(g, nearest && nearest.d < 90 ? 'closer: the jaws will not reach' : 'nothing to grab here', 'warn', 1.6); emit(g, { type: 'miss', x: g.head.x, y: g.head.y }); }
    return { ok: false, why };
  }
  const i = seen.i, f = g.finds[i];
  g.carry = i; f.state = 'carried'; g.grabbed++;
  const wasLying = f.lieFrom != null;
  if (!wasLying) openCore(B, i);
  const gr = roller({ rng: hashSeed('claw-pull', 'grain', g.seed, i, f.drops) });
  g.path = relaxPath(B, g.path, { amp: BASE.grain, l1: BASE.grainL * (0.8 + gr.next() * 0.5) / (2 * Math.PI), l2: BASE.grainL * 0.55 * (0.8 + gr.next() * 0.5) / (2 * Math.PI), p1: gr.next() * 6.28, p2: gr.next() * 6.28 });
  g.s = pathLen(g.path);
  if (!g.deepPath || g.s > pathLen(g.deepPath)) g.deepPath = g.path.slice();   // the way in as it first stood: where a dropped find can roll back to
  const e = pathAt(g.path, g.s);
  g.anchor = { x: e.x, y: e.y, vx: 0, vy: 0 };
  g.off = { x: g.off.x * 0.3, y: g.off.y * 0.3, vx: 0, vy: 0 };
  g.gripNow = g.gripMax * Math.max(0.4, 1 - BASE.crackGrip * f.cracks);   // a cracked find crumbles under the jaws: it holds worse for every crack
  g.grip = g.gripNow; g.reelHold = false; g.ramp = 0; g.v = 0; g.nudge = { x: 0, y: 0 }; g.reeledT = 0; g.knocksTrip = 0; g.tripTired = 0;
  g.aVel = { x: 0, y: 0 }; g.phase = 'reel'; g.touching = false; g.touchT = 0;
  g.freeLeft = g.rules.freeTire;
  emit(g, { type: 'grab', find: i, x: f.x, y: f.y, tear: !wasLying });
  say(g, 'got it: hold Reel', 'good', 2.2);
  return { ok: true, why: '', find: i };
}

function stepReel(g, dt, input) {
  const B = g.board, f = loadOf(g), P = g.path;
  // the winch: a held pad winds it from slow toward full; let go and it slows to a stop
  g.reelHold = !!input.reel;
  g.ramp = g.reelHold ? Math.min(1, g.ramp + BASE.rampUp * dt) : Math.max(0, g.ramp - BASE.rampDown * dt);
  const target = g.reelHold ? BASE.slow + (BASE.full - BASE.slow) * g.ramp : 0;
  if (g.v < target) g.v = Math.min(target, g.v + BASE.accel * dt); else g.v = Math.max(target, g.v - BASE.brake * dt);
  g.s = Math.max(0, g.s - g.v * dt);
  // the nudge: where the player pushes the end of the cable, within a small reach
  const nl = Math.hypot(input.nx || 0, input.ny || 0), k = nl > 1 ? 1 / nl : 1;
  const wx = (input.nx || 0) * k * BASE.nudgeMax, wy = (input.ny || 0) * k * BASE.nudgeMax;
  // the end of the cable follows the push like a heavy thing: a critically damped follow, so a jab is not a jolt
  const wn = BASE.nudgeW, nv = g.nudge;
  nv.vx = (nv.vx || 0) + (wn * wn * (wx - nv.x) - 2 * wn * (nv.vx || 0)) * dt; nv.vy = (nv.vy || 0) + (wn * wn * (wy - nv.y) - 2 * wn * (nv.vy || 0)) * dt;
  nv.x += nv.vx * dt; nv.y += nv.vy * dt;
  const q = pathAt(P, g.s);
  let nx = q.x + g.nudge.x, ny = q.y + g.nudge.y;
  // the end of the cable cannot be pushed into rock
  const pe = probe(B, nx, ny, 5);
  if (pe.d < 3) { nx += pe.nx * (3 - pe.d); ny += pe.ny * (3 - pe.d); }
  const a = g.anchor;
  const vx = (nx - a.x) / dt, vy = (ny - a.y) / dt;
  let ax = (vx - a.vx) / dt, ay = (vy - a.vy) / dt;
  a.x = nx; a.y = ny; a.vx = vx; a.vy = vy;
  // dragging a heavy load over rough rock jolts it sideways, and the harder the faster you drag it
  if (g.v > 1) {
    const J = BASE.jostle * (g.v / BASE.slow) ** BASE.jostleExp, js = g.jost;
    const noise = (Math.sin(js.f[0] * 6.283 * g.t + js.p[0]) + Math.sin(js.f[1] * 6.283 * g.t + js.p[1]) * 0.8 + Math.sin(js.f[2] * 6.283 * g.t + js.p[2]) * 0.6) / 1.7;
    ax += -q.ty * J * noise; ay += q.tx * J * noise;
  }
  swing(g, dt, ax, ay);
  const K = swayScale(g);
  const hit = seat(g, dt, K);

  // the grip tires only while the winch is turning: a thumb resting on the glass costs nothing
  if (g.v > 2) {
    g.reeledT += dt;
    if (g.freeLeft > 0) g.freeLeft -= dt; else { g.grip -= g.rules.tire * dt; g.tripTired += g.rules.tire * dt; }
    // a fast pull also strains the jaws: the cable goes taut and the load tugs at them (nothing at the slow reel)
    const over = Math.max(0, (g.v - BASE.slow) / (BASE.full - BASE.slow));
    g.grip -= BASE.strain * over * over * dt;
  }
  // knocks: a load that meets a wall it was clear of is a knock; riding along a wall while the winch turns is another every so often
  const wasTouching = g.touching;
  g.touching = !!hit;
  if (hit) {
    g.touchT += dt;
    const sp = Math.hypot(a.vx + g.off.vx * K, a.vy + g.off.vy * K);
    const sev = Math.max(0, Math.min(1, (Math.max(hit.vn, 0.2 * sp) - 6) / 50));
    const fresh = hit.vn > BASE.knockSpeed, grind = g.touchT > BASE.grindAfter && g.v > 10;   // a load pressed to the wall while the winch is still costs nothing
    if ((fresh || grind) && g.knockCool <= 0) {
      g.knockCool = BASE.knockCool; g.touchT = 0;
      const fast = Math.max(0, (g.v - BASE.slow) / (BASE.full - BASE.slow));   // the cost goes by speed: a knock at full reel is a hard one
      const cost = knockCost(g, Math.max(fast, grind && !fresh ? Math.max(sev, 0.25) : Math.max(sev, 0.1)));
      g.grip -= cost; g.knocks++; g.knocksTrip++; f.knocks++;
      emit(g, { type: 'knock', x: g.head.x - hit.nx * g.head.r, y: g.head.y - hit.ny * g.head.r, nx: hit.nx, ny: hit.ny, sev, cost, grip: g.grip / g.gripNow });
      say(g, sev > 0.5 ? 'hard knock: the grip loosens' : 'knock: the grip loosens', 'warn', 1.4);
    } else if ((g.scrapeT += dt) > 0.12) { g.scrapeT = 0; emit(g, { type: 'scrape', x: g.head.x - hit.nx * 6, y: g.head.y - hit.ny * 6, nx: hit.nx, ny: hit.ny, loaded: true }); }
  } else g.touchT = 0;
  g.head.r = f.carriedR;
  // grip words and thresholds
  const frac = g.grip / g.gripNow;
  if (frac < 0.6 && !g.said60) { g.said60 = true; emit(g, { type: 'slip', level: 1 }); }
  if (frac < 0.3 && !g.said30) { g.said30 = true; emit(g, { type: 'slip', level: 2 }); }
  if (frac >= 0.6) g.said60 = false;
  if (frac >= 0.3) g.said30 = false;
  if (g.grip <= 0) { dropLoad(g); return; }
  // out at the mouth
  if (g.s <= 0.01 && Math.hypot(g.head.x - B.start.x, g.head.y - B.start.y) < BASE.openAt) {
    g.phase = 'land'; g.landT = 0; g.landFind = g.carry; g.v = 0; g.reelHold = false;
    emit(g, { type: 'mouth', find: g.carry });
    say(g, 'coming up into the light', 'good', 2);
  }
  reelWords(g);
}

function reelWords(g) {
  if (g.say.t > 0) return;
  g.say.tone = '';
}

/** The grip is gone: the find falls where it is, takes a crack, and lies somewhere else along the way in. */
function dropLoad(g) {
  const f = loadOf(g), B = g.board, i = g.carry;
  const from = { x: g.head.x, y: g.head.y };
  g.carry = -1; g.drops++; f.drops++;
  f.cracks++;
  emit(g, { type: 'drop', find: i, x: from.x, y: from.y });
  emit(g, { type: 'crack', find: i, cracks: f.cracks, x: from.x, y: from.y });
  const shattered = f.cracks >= BASE.shatter;
  // where it ends up: the cable's own way, a little deeper or a little nearer the mouth, favouring tight places, never where it fell
  const rnd = roller({ rng: hashSeed('claw-pull', 'drop', g.seed, i, f.drops, f.cracks) });
  const P = g.deepPath || g.path, Smax = pathLen(P), sd = Math.min(g.s, Smax);
  const cands = [];
  // it tumbles back down the tunnel toward where it came from: half to nearly all of the way back to the pocket, favouring the tight places
  const lo = sd + 0.5 * (Smax - sd), hi = sd + 0.98 * (Smax - sd);
  for (let s = Math.max(40, lo); s <= Math.min(Smax, Math.max(hi, lo + 36)); s += 12) {
    if (Math.abs(s - sd) < 30) continue;
    const q = pathAt(P, s), pr = probe(B, q.x, q.y, 20);
    if (pr.d < 3) continue;
    const tight = Math.max(0, Math.min(1, (14 - pr.d) / 9));
    cands.push({ s, x: q.x, y: q.y, w: 0.5 + tight * 1.6 });
  }
  if (!cands.length) for (let d = -60; d <= 60; d += 12) {
    const s = sd + d;
    if (Math.abs(d) < 24 || s < 40 || s > Smax) continue;
    const q = pathAt(P, s), pr = probe(B, q.x, q.y, 20);
    if (pr.d >= 3) cands.push({ s, x: q.x, y: q.y, w: 1 });
  }
  let spot = { s: sd, x: from.x, y: from.y };
  if (cands.length) {
    let tot = cands.reduce((a, c) => a + c.w, 0), r = rnd.next() * tot;
    for (const c of cands) { r -= c.w; if (r <= 0) { spot = c; break; } spot = c; }
  }
  f.lieFrom = from; f.x = spot.x; f.y = spot.y; f.rollT = 0;
  g.anchor = { x: g.head.x, y: g.head.y, vx: 0, vy: 0 }; g.off = { x: 0, y: 0, vx: 0, vy: 0 };
  g.path = withS(g.path.filter((p) => p.s <= sd).concat([{ x: g.head.x, y: g.head.y }]));
  g.pathSample = { x: g.head.x, y: g.head.y };
  g.phase = 'in'; g.touching = false; g.v = 0; g.ramp = 0;
  if (shattered) {
    f.state = 'shattered'; emit(g, { type: 'shatter', find: i, x: from.x, y: from.y });
    if (f.main) { say(g, 'it shattered', 'bad', 3); finishOver(g, 'shattered'); return; }
    say(g, 'it dropped and shattered', 'bad', 2.4);
  } else {
    f.state = 'lying'; f.canGrab = true;
    say(g, i === 0 ? 'dropped! it is lying further along: go back for it' : 'dropped! go back for it, or leave it', 'bad', 2.8);
  }
}

function stepLand(g, dt) {
  g.landT += dt;
  const f = g.finds[g.landFind];
  g.head.x = g.board.start.x; g.head.y = g.board.start.y;
  if (g.landT >= BASE.landT) {
    f.state = 'out'; g.outCount++; g.carry = -1;
    emit(g, { type: 'landed', find: g.landFind });
    if (f.main) g.passed = true;
    // what is left to go back for?
    const left = g.finds.filter((q) => (q.state === 'rock' && q.canGrab) || q.state === 'lying');
    g.path = withS([{ x: g.board.start.x, y: g.board.start.y }]); g.pathSample = { ...g.board.start };
    g.anchor = { x: g.board.start.x, y: g.board.start.y, vx: 0, vy: 0 }; g.off = { x: 0, y: 0, vx: 0, vy: 0 };
    if (g.passed && left.length) { g.phase = 'bay'; say(g, f.main ? 'out! another one is waiting down there' : 'out! the main find is still down there', 'good', 3); }
    else if (g.passed) { g.phase = 'bay'; finishOver(g, 'done'); }
    else { g.phase = 'in'; say(g, 'out! now the main find', 'good', 2.4); }
  }
}

/** After a find is out: go back in for another, or call it done. */
export function goBack(g) { if (g.phase !== 'bay' || g.over) return false; g.phase = 'in'; say(g, 'back in: the cable is out again', '', 2); return true; }
export function done(g) { if (g.over) return; if (g.phase === 'bay' || g.passed) finishOver(g, 'done'); }
/** The player gives up. A pass already earned stays a pass. */
export function giveUp(g) { if (g.over) return; if (g.phase === 'reel') { g.carry = -1; const f = g.finds.find((q) => q.state === 'carried'); if (f) f.state = 'lying'; } finishOver(g, g.passed ? 'done' : 'gaveup'); }

function finishOver(g, why) { if (!g.over) { g.over = { why }; g.phase = 'over'; emit(g, { type: 'over', why }); } }

/** Plain-word state for the HUD (no digits). Event words (a knock, a drop) show first, then what is going on. */
export function words(g) {
  if (g.over) return g.over.why === 'shattered' ? 'it shattered' : g.over.why === 'gaveup' ? 'you let it go' : g.passed ? 'the find is out' : 'the claw comes up empty';
  if (g.say.t > 0 && g.say.text) return g.say.text;
  if (g.phase === 'land') return 'coming up into the light';
  if (g.phase === 'bay') return 'resting at the mouth';
  if (g.phase === 'reel') {
    const frac = g.grip / g.gripNow;
    if (g.v < 2) return frac < 0.3 ? "it's going: be gentle" : frac < 0.6 ? 'slipping: take it easy' : 'hold Reel to pull';
    if (g.touching) return 'scraping the wall';
    const sp = (g.v - BASE.slow) / (BASE.full - BASE.slow);
    if (frac < 0.3) return "it's going";
    if (frac < 0.6) return 'slipping';
    return sp > 0.7 ? 'pulling hard' : sp > 0.25 ? 'steady pull' : 'easy pull';
  }
  // going in
  const near = g.nearest;
  if (near) {
    if (near.d < BASE.reach + 6) {
      const chk = near.f.state === 'lying' ? looseCheck(near.f, g.head.x, g.head.y, BASE.reach) : graspCheck(g.board, near.f, g.head.x, g.head.y, BASE.reach, near.i);
      return chk.ok ? 'in reach: close the jaws' : chk.why === 'buried' ? "that side's buried: try another" : 'a little closer';
    }
    if (near.d < 120) return 'the find is close';
  }
  if (g.touching) return 'scraping in';
  return g.drift ? 'drifting' : 'steer down the tunnel';
}

/** The grip as a plain word, for the HUD on the claw. */
export function gripWord(g) {
  if (g.phase !== 'reel' && g.carry < 0) return '';
  const f = g.grip / g.gripNow;
  return f > 0.6 ? 'good grip' : f > 0.3 ? 'slipping' : "it's going";
}
export const gripFrac = (g) => (g.carry >= 0 ? Math.max(0, Math.min(1, g.grip / (g.gripNow || g.gripMax))) : 1);

/** The numbers and records at the end. */
export function resultOf(g) {
  const main = g.finds[0];
  const outs = g.finds.filter((f) => f.state === 'out');
  const success = main.state === 'out';
  const bonusOut = outs.filter((f) => !f.main).length;
  const grade = success
    ? Math.min(100, Math.max(0, Math.max(BASE.floorMain, BASE.gradeMain - BASE.perKnock * g.knocks) + BASE.perBonus * bonusOut + (g.drops === 0 ? BASE.noDrop : 0)))
    : Math.min(30, 10 * bonusOut + (g.grabbed ? 10 : 0));
  const freedLeft = g.finds.filter((f) => f.state !== 'out' && f.state !== 'shattered' && f.canGrab);
  const perfect = success && g.knocks === 0 && g.drops === 0 && freedLeft.length === 0;
  const quality = (f) => (f.state === 'shattered' ? 0 : Math.max(0, Math.min(100, 100 - 28 * f.cracks - 4 * f.knocks)));
  const pulled = outs.map((f) => ({ item: f.item, cracks: f.cracks, quality: quality(f) }));
  const items = {};
  for (const f of outs) items[f.item] = (items[f.item] || 0) + 1;
  if (main.state === 'shattered' && main.shards) items[main.shards] = (items[main.shards] || 0) + 1;
  const xp = success ? Math.min(6, 2 + outs.length + (g.knocks === 0 ? 1 : 0)) : 0;
  return {
    done: true, success, grade: Math.round(grade), perfect, xp,
    pulled, dropped: g.drops, knocks: g.knocks,
    why: g.over?.why || 'done',
    finds: g.finds.map((f) => ({ item: f.item, name: f.name, state: f.state, cracks: f.cracks, kind: f.kind })),
    shattered: main.state === 'shattered' ? { item: main.item, shards: main.shards || null } : null,
    effects: Object.keys(items).length ? { items } : {},
  };
}

/** Grip as a fraction and the load's state, for tests and the view. */
export const isTight = (g) => { const pr = probe(g.board, g.head.x, g.head.y, 24); return pr.d < headRadius(g) + 3; };
