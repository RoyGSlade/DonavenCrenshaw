// The piloting minigame: docking at the star base. A top-down view: a big base turns slowly, a lit corridor runs out from a berth
// on its rim, so the corridor SWEEPS. You fly in: line up inside the funnel, match its sweep, and arrive at the berth under the safe
// speed (measured against the berth, which is itself moving). The clamps catch and a result card says how clean it was.
// A miss is a scrape: touching the wall for longer than the warning, or arriving too fast or off the berth, costs hull and bounces
// you out. It never ends the run; only the clock does (the base waves you off).
// World: x right, y down, the base centre is (0, 0), the base rim is RB out. The corridor leaves the berth along u(theta) = (sin, cos)
// (straight down at theta 0) and the base turns at a steady rate, so the berth and every point of the lane move sideways (n).
// Pure and seeded; the view calls stepDocking(s, dt, { aim, thrust }) on a fixed timestep. aim is an angle in world space (0 = right,
// PI/2 = down, -PI/2 = up); thrust is 0..1 (a finger or key gives 0 or 1; the test bots may give any level, which a quick
// tapping hand does on average).
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const DOCKING_DT = 1 / 60;
export const RB = 40;            // the base rim (the berth sits here)
export const DM = 80;            // the corridor's length: the funnel mouth is this far from the berth
export const SHIP_R = 2.5;       // the ship's nose reaches the berth when d is this
export const A_T = 20;           // thrust (units/s^2)
export const DRAG = 0.7;         // a docking-aid drag on the ship's world speed, a second
export const TURN = 9;           // how fast the ship swings to its aim (rad/s)
export const T0 = 6;             // the lane points straight down this many seconds in (the sweep starts to one side of it)
export const PASS = 70;
export const OUTCOMES = Object.freeze({ docked: 'docked', wavedOff: 'waved-off' });
export const SCRAPE = Object.freeze({ wall: 8, face: 10, fast: 14, both: 16 }); // hull lost (of 100) by kind

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** setup: from setupDocking. */
export function createDocking({ seed = 1, setup = {} } = {}) {
  let rng = hashSeed('docking', seed);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const omega = setup.sweep ?? 0.06;
  const dir = rand() < 0.5 ? -1 : 1;
  const th0 = -dir * omega * T0;
  const offs = (rand() < 0.5 ? -1 : 1) * (0.12 + 0.12 * rand());          // the ship starts to one side of the lane, past the mouth
  const d0 = DM + 6 + 8 * rand();
  const ths = th0 + offs;
  const s = {
    seed, t: 0, dir, omega, th0,
    berth: setup.berth ?? 9, mouth: setup.mouth ?? 30, warn: setup.warn ?? 0.6, safe: setup.safe ?? 6, tmax: setup.tmax ?? 26,
    x: (RB + d0) * Math.sin(ths), y: (RB + d0) * Math.cos(ths), vx: 0, vy: 0, h: Math.atan2(-Math.cos(ths), -Math.sin(ths)),
    thrusting: false, warnLeft: setup.warn ?? 0.6, outside: false,
    scrapes: 0, hullLost: 0, flash: 0, dockedAt: null,
    done: false, result: null, events: [],
  };
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

/** The word for how the approach is going: clamped, scrape, drifting wide, too fast, lined up, or in the corridor. */
export function dockingWord(s) {
  if (s.done) return s.result?.outcome === OUTCOMES.docked ? 'clamped' : 'waved off';
  if (s.flash > 0) return 'scrape';
  const f = frameOf(s);
  if (Math.abs(f.l) > f.half) return f.d >= DM ? 'find the corridor' : 'drifting wide';
  if (f.d < 45 && f.speed > s.safe) return 'too fast';
  if (Math.abs(f.l) <= f.half * 0.55 && f.d < DM + 10) return 'lined up';
  return 'in the corridor';
}

/** How much of the warning is left before the wall scrapes, 1 (all of it) to 0. */
export const warnFill = (s) => clamp(s.warnLeft / s.warn, 0, 1);

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
    if (lined && slow) return dock(s, f);
    const kind = !lined && !slow ? 'both' : !lined ? 'face' : 'fast';
    scrape(s, SCRAPE[kind], kind);
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
        scrape(s, SCRAPE.wall, 'wall');
        const sign = f.l < 0 ? -1 : 1;
        setLat(sign * f.half * 0.8, -sign * 0.4 * Math.abs(f.lat));
        s.warnLeft = s.warn;
      }
    } else s.warnLeft = Math.min(s.warn, s.warnLeft + 2 * dt);
  } else { s.outside = false; s.warnLeft = Math.min(s.warn, s.warnLeft + 2 * dt); }
  if (!s.done && s.t >= s.tmax) finish(s, OUTCOMES.wavedOff, f);
  return s;
}

function scrape(s, hull, kind) {
  s.scrapes++; s.hullLost = Math.min(100, s.hullLost + hull); s.flash = 0.5;
  s.events.push({ type: 'scrape', kind, hull });
}
function dock(s, f) { s.dockedAt = s.t; finish(s, OUTCOMES.docked, f); }

function finish(s, outcome, f) {
  s.done = true; s.thrusting = false;
  const docked = outcome === OUTCOMES.docked;
  const timeS = Math.round(s.t * 10) / 10;
  const speed = docked ? f.speed : 0, off = docked ? Math.abs(f.l) : 0;
  const grade = docked ? Math.round(clamp(100 - 1.5 * s.hullLost - 12 * (speed / s.safe) - 12 * (off / s.berth) - clamp(s.t - 20, 0, 8), 0, 100)) : 0;
  const success = docked && grade >= PASS;
  s.result = { outcome, success, clean: docked && s.hullLost === 0, grade, hullLost: s.hullLost, timeS, speed: Math.round(speed * 10) / 10, off: Math.round(off * 10) / 10, scrapes: s.scrapes, xp: 0 };
  s.result.xp = dockingXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}

/** Placeholder XP: 4 for a pass, +1 for a grade of 90, +1 for a clean dock. None for a run the base waved off or a scruffy dock. */
export const dockingXp = (r) => (r?.success ? 4 + (r.grade >= 90 ? 1 : 0) + (r.clean ? 1 : 0) : 0);

/** What the corridor hands back to a caller (the base lane): { clean, grade, hullLost, timeS }. */
export const dockingHandBack = (r) => ({ clean: !!r?.clean, grade: r?.grade ?? 0, hullLost: r?.hullLost ?? 0, timeS: r?.timeS ?? 0 });
