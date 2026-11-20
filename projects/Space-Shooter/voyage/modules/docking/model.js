// Docking: the pure rules. A top-down view: a big base turns slowly, a lit corridor runs out from a berth on its rim, so the corridor
// SWEEPS. You fly in: line up inside the funnel, match its sweep, and reach the berth under the safe speed (measured against the
// berth, which is itself moving). The clamps catch. A miss is a scrape (touch the wall longer than the warning, arrive too fast, or
// miss the berth face): it costs hull and bounces you back out, and never ends the run. Only the approach lights end it: they go out
// one by one, and when the last is out a tug brings you in (you still end up docked, minus the tug's fee).
//
// Seeded and pure: no DOM, no clock, no Math.random. Time comes in as an argument: stepDocking(s, dt, { aim, thrust }).
// World: x right, y down, the base centre is (0, 0), the rim is RB out. The corridor leaves the berth along u(theta) = (sin, cos)
// (straight down at theta 0) and the base turns at a steady rate, so the berth and every point of the lane move sideways (n).
// aim is an angle in world space (0 = right, PI/2 = down); thrust is 0..1 (a finger or key gives 0 or 1).
import { step as rngStep, hashSeed } from './rng.js';

export const DOCKING_DT = 1 / 60;
export const RB = 40;            // the base rim (the berth sits here)
export const DM = 80;            // the corridor's length: the funnel mouth is this far from the berth
export const SHIP_R = 2.5;       // the ship's nose reaches the berth when d is this
export const A_T = 20;           // thrust (units/s^2)
export const DRAG = 0.7;         // a docking-aid drag on the ship's world speed, a second
export const TURN = 9;           // how fast the ship swings to its aim (rad/s)
export const T0 = 6;             // the lane points straight down this many seconds in (the sweep starts to one side of it)
export const T0_QUICK = 3;
export const QUICK_IN = 16;      // a quick run starts this far inside the funnel mouth
export const PASS = 70;
export const OUTCOMES = Object.freeze({ docked: 'docked', wavedOff: 'waved-off' });
export const SCRAPE = Object.freeze({ wall: 8, face: 10, fast: 14, both: 16 }); // hull lost (of 100) by kind
export const PATH_EVERY = 0.1;   // the flight line is sampled this often (seconds)

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const r1 = (x) => Math.round(x * 10) / 10;

/** setup: from setupDocking. berth: which berth (a number) the corridor leads to; it only rides along in the result. */
export function createDocking({ seed = 1, setup = {}, quick = setup.quick ?? false, berth = 1 } = {}) {
  let rng = hashSeed('docking', seed);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const omega = setup.sweep ?? 0.095;
  const dir = rand() < 0.5 ? -1 : 1;
  const th0 = -dir * omega * (quick ? T0_QUICK : T0);
  const side = rand() < 0.5 ? -1 : 1, offs = side * (0.12 + 0.12 * rand());       // the ship starts to one side of the lane, past the mouth
  const d0 = DM + 6 + 8 * rand();
  const s = {
    seed, quick: !!quick, t: 0, dir, omega, th0, berthNo: berth,
    berth: setup.berth ?? 4, mouth: setup.mouth ?? 12, warn: setup.warn ?? 0.6, safe: setup.safe ?? 8,
    tmax: setup.tmax ?? (quick ? 15 : 26), lights: setup.lights ?? 6, fee: setup.fee ?? 25,
    x: 0, y: 0, vx: 0, vy: 0, h: 0,
    thrusting: false, warnLeft: setup.warn ?? 0.6, outside: false,
    scrapes: 0, hullLost: 0, flash: 0, dockedAt: null, lightsOut: 0,
    path: [], marks: [], pathAt: 0,
    done: false, result: null, events: [],
  };
  if (quick) {
    // already lined up at the mouth, riding the sweep: only the last approach is left
    const f0 = frameOf(s, 0), l0 = side * (0.2 + 0.25 * rand()) * s.mouth, d = DM - QUICK_IN;
    s.x = f0.B.x + f0.u.x * d + f0.n.x * l0; s.y = f0.B.y + f0.u.y * d + f0.n.y * l0;
    const lane = f0.w * (RB + d);
    s.vx = f0.n.x * lane; s.vy = f0.n.y * lane;
    s.h = Math.atan2(-f0.u.y, -f0.u.x);
  } else {
    const ths = th0 + offs;
    s.x = (RB + d0) * Math.sin(ths); s.y = (RB + d0) * Math.cos(ths); s.h = Math.atan2(-Math.cos(ths), -Math.sin(ths));
  }
  return s;
}

/** The half width of the lit funnel at distance d from the berth (the berth's width at the berth, the mouth's from the mouth out). */
export const halfAt = (s, d) => (d >= DM ? s.mouth : d <= 0 ? s.berth : s.berth + ((s.mouth - s.berth) * d) / DM);

/**
 * The scene as the corridor sees it at time t: the lane's direction u and its side n, the berth B and how fast it moves (Vb),
 * the ship's distance d along the lane and lateral offset l, its speed against the berth (vrel, speed, closing, lat).
 */
export function frameOf(s, t = s.t) {
  const th = s.th0 + s.dir * s.omega * t;
  const u = { x: Math.sin(th), y: Math.cos(th) }, n = { x: Math.cos(th), y: -Math.sin(th) };
  const B = { x: RB * u.x, y: RB * u.y };
  const w = s.dir * s.omega;
  const Vb = { x: w * RB * n.x, y: w * RB * n.y };
  const rx = s.x - B.x, ry = s.y - B.y;
  const d = rx * u.x + ry * u.y, l = rx * n.x + ry * n.y;
  const vrel = { x: s.vx - Vb.x, y: s.vy - Vb.y };
  return { th, u, n, B, Vb, w, d, l, half: halfAt(s, d), vrel, speed: Math.hypot(vrel.x, vrel.y), closing: -(vrel.x * u.x + vrel.y * u.y), lat: vrel.x * n.x + vrel.y * n.y };
}

/** The word for how the approach is going: clamped, scrape, drifting wide, too fast, ease off, lined up, or in the corridor. */
export function dockingWord(s) {
  if (s.done) return s.result?.outcome === OUTCOMES.docked ? 'clamped' : 'waved off';
  if (s.flash > 0) return 'scrape';
  const f = frameOf(s);
  if (Math.abs(f.l) > f.half) return f.d >= DM ? 'find the corridor' : 'drifting wide';
  if (f.d < 45 && f.speed > s.safe * 1.6) return 'too fast';
  if (f.d < 45 && f.speed > s.safe) return 'ease off';
  if (Math.abs(f.l) <= f.half * 0.55 && f.d < DM + 10) return 'lined up';
  return 'in the corridor';
}

/** How much of the warning is left before the wall scrapes, 1 (all of it) to 0. */
export const warnFill = (s) => clamp(s.warnLeft / s.warn, 0, 1);

/**
 * How close the ship is to a wall, 0 (comfortably inside) .. 1 (touching), 2+ means outside. The wall starts to glow a band before
 * the wall itself, and a longer warning (the Pursuit path) makes that band wider: the wall glows earlier.
 */
export const wallBand = (s) => clamp(0.15 * (s.warn / 0.6), 0.1, 0.7);
export function wallNear(s, f = frameOf(s)) {
  if (f.d >= DM) return 0;
  const rel = Math.abs(f.l) / Math.max(f.half, 0.5), band = wallBand(s);
  return rel >= 1 ? 1 : clamp((rel - (1 - band)) / band, 0, 1);
}

/** Approach lights still lit, 0..s.lights. They go out evenly across the limit; the last one going out is the tug. */
export const lightsLeft = (s, t = s.t) => Math.max(0, s.lights - Math.min(s.lights, Math.floor(t / (s.tmax / s.lights) + 1e-9)));

/** Advance one fixed step with the inputs held: { aim (radians, or null to hold the heading), thrust (0..1 or true) }. */
export function stepDocking(s, dt = DOCKING_DT, input = {}) {
  if (s.done) return s;
  s.events = [];
  s.t += dt;
  s.flash = Math.max(0, s.flash - dt);
  // the ship swings to its aim, then burns along its heading
  if (Number.isFinite(input.aim)) { const e = wrap(input.aim - s.h), m = TURN * dt; s.h = wrap(s.h + clamp(e, -m, m)); }
  const level = input.thrust === true ? 1 : clamp(Number(input.thrust) || 0, 0, 1);
  s.thrusting = level > 0.02;
  s.vx += (level * A_T * Math.cos(s.h) - DRAG * s.vx) * dt;
  s.vy += (level * A_T * Math.sin(s.h) - DRAG * s.vy) * dt;
  s.x += s.vx * dt; s.y += s.vy * dt;

  const f = frameOf(s);
  const { u, n } = f;
  const setLat = (l, vl) => { s.x += (l - f.l) * n.x; s.y += (l - f.l) * n.y; s.vx += (vl - f.lat) * n.x; s.vy += (vl - f.lat) * n.y; };
  if (f.d <= SHIP_R) {
    // at the berth's face
    const lined = Math.abs(f.l) <= s.berth, slow = f.speed <= s.safe;
    if (lined && slow) { record(s, f); return dock(s, f); }
    const kind = !lined && !slow ? 'both' : !lined ? 'face' : 'fast';
    scrape(s, SCRAPE[kind], kind, f);
    // bounce off: out along the lane, the sideways speed softened
    const va = -f.closing, out = Math.max(3, 0.35 * Math.abs(va));
    s.x += (SHIP_R + 1 - f.d) * u.x; s.y += (SHIP_R + 1 - f.d) * u.y;
    s.vx += (out - va) * u.x; s.vy += (out - va) * u.y;
    setLat(f.l, f.lat * 0.6);
  } else if (f.d < DM) {
    // inside the funnel: the walls warn first, then scrape
    const out = Math.abs(f.l) > f.half;
    s.outside = out;
    if (out) {
      s.warnLeft = Math.max(0, s.warnLeft - dt);
      if (s.warnLeft <= 0) {
        scrape(s, SCRAPE.wall, 'wall', f);
        const sign = f.l < 0 ? -1 : 1;
        setLat(sign * f.half * 0.8, -sign * 0.4 * Math.abs(f.lat));
        s.warnLeft = s.warn;
      }
    } else s.warnLeft = Math.min(s.warn, s.warnLeft + 2 * dt);
  } else { s.outside = false; s.warnLeft = Math.min(s.warn, s.warnLeft + 2 * dt); }
  // the approach lights: one goes out at a time, and the last one out is the tug
  const left = lightsLeft(s);
  while (s.lightsOut < s.lights - left) { s.lightsOut++; s.events.push({ type: 'light', left: s.lights - s.lightsOut }); }
  record(s, f);
  if (!s.done && s.t >= s.tmax - 1e-9) finish(s, OUTCOMES.wavedOff, f);
  return s;
}

function record(s, f) {
  if (s.t + 1e-9 < s.pathAt) return;
  s.pathAt = s.t + PATH_EVERY;
  s.path.push([r1(f.d), r1(f.l)]);
}
function scrape(s, hull, kind, f) {
  s.scrapes++; s.hullLost = Math.min(100, s.hullLost + hull); s.flash = 0.5;
  s.marks.push([r1(Math.max(0, f.d)), r1(f.l), kind]);
  s.events.push({ type: 'scrape', kind, hull });
}
function dock(s, f) { s.dockedAt = s.t; finish(s, OUTCOMES.docked, f); }

function finish(s, outcome, f) {
  s.done = true; s.thrusting = false;
  const docked = outcome === OUTCOMES.docked;
  const timeS = r1(s.t);
  const speed = docked ? f.speed : 0, off = docked ? Math.abs(f.l) : 0;
  const grade = docked ? Math.round(clamp(100 - 1.5 * s.hullLost - 12 * (speed / s.safe) - 12 * (off / s.berth) - clamp(s.t - 20, 0, 8), 0, 100)) : 0;
  const middle = docked && off <= s.berth / 3;
  const clean = docked && s.hullLost === 0;
  s.result = {
    outcome, success: docked && grade >= PASS, grade, clean, perfect: clean && middle, middle,
    hullLost: s.hullLost, timeS, speed: r1(speed), off: r1(off), scrapes: s.scrapes,
    wavedOff: !docked, berth: s.berthNo, fee: docked ? 0 : s.fee, lightsLeft: lightsLeft(s), xp: 0,
    path: s.path.slice(), marks: s.marks.slice(),
  };
  s.result.xp = dockingXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}

/** Placeholder XP: 2 for a dock, +1 for a clean one, +1 for coming in through the middle third of the berth; 4 at most; none when waved off. */
export const dockingXp = (r) => (r && r.outcome === OUTCOMES.docked ? Math.min(4, 2 + (r.clean ? 1 : 0) + (r.middle ? 1 : 0)) : 0);

/** What the caller hands back to the world: hull, docked berth, and the tug's fee only when waved off. */
export function dockingEffects(r, base = {}) {
  const world = { hullDelta: -(r?.hullLost ?? 0), docked: { base: base.id ?? null, berth: r?.berth ?? base.berth ?? 1 } };
  if (r?.wavedOff) world.feeDelta = -(r.fee ?? 0);
  return { world };
}
