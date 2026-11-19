// The shooting gallery (Donaven 2026-11-19): shooting's own training game. Pure and seeded: no DOM, no clock of its own.
//
// A holodeck range, 160 wide and 100 high. Targets slide left and right on rails at three depths (far, middle, near: the
// nearer a rail, the bigger and faster its targets) and some pop up from below the counter and drop again. You shoot at a point;
// the shot lands somewhere inside the crosshair's bloom (a ring that kicks wider with every shot and settles back), the
// magazine holds a few rounds and a reload takes a while. The round has a clock and a number of targets; hit a target and it flips.
//
// Score, each line in XP (the lesson sets the sizes, see setup.js SHOOTING_LESSONS):
//   targets   hitXp x (targets hit / targets), rounded
//   bullseyes one XP per `bullEvery` bullseyes, up to bullXp (each target has rings: the middle one pays as a bullseye)
//   accuracy  hits / shots: 85% and up +2, 65% and up +1 (needs 3 shots)
//   time      clear every target by par +2, by par plus a quarter +1
// The caller (trainer.js) takes the entry fee and the hour's cap; this module only says what the range pays.
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { setupShooting, shootingLesson } from './setup.js';

export const RANGE = Object.freeze({ w: 160, h: 100 });
/** The three depths: rail height, target radius and base speed (units a second). Nearer is bigger and faster. */
export const LANES = Object.freeze([
  Object.freeze({ id: 'far', y: 30, r: 5, v: 18 }),
  Object.freeze({ id: 'mid', y: 54, r: 7, v: 30 }),
  Object.freeze({ id: 'near', y: 79, r: 9.5, v: 44 }),
]);
export const RINGS = Object.freeze({ inner: 0.62 }); // the inner ring's share of the radius; the bullseye share comes from the lesson
export const POP = Object.freeze({ rise: 0.2, hittable: 0.7 }); // a pop-up rises in 0.2 s and can be hit from 70% up
export const FLIP_SECONDS = 0.35;
export const ACCURACY_STEPS = Object.freeze([[0.85, 2], [0.65, 1]]);
export const TIME_SLACK = 1.25; // finishing within par x 1.25 earns the smaller time bonus
const MIN_SHOTS_FOR_ACCURACY = 3;
const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const r2 = (x) => Math.round(x * 100) / 100;

/** A triangle wave: 0..1..0 as `p` runs 0..2 (the same shape the portal marker uses). */
export const tri = (p) => { const m = mod(p, 2); return m <= 1 ? m : 2 - m; };

/**
 * Where a target is at time `t`: { x, y, up } with `up` 0..1 (a slider is always 1; a pop-up rises, holds and drops).
 * Pure: the path is fixed when the range is made, so the same seed gives the same paths.
 */
export function targetAt(tg, t) {
  if (tg.kind === 'slider') {
    const span = tg.x1 - tg.x0;
    return { x: tg.x0 + tri(tg.phase + (tg.v * t) / span) * span, y: tg.y, up: 1 };
  }
  const c = mod(t + tg.offset, tg.up + tg.down);
  const up = c < POP.rise ? c / POP.rise : c < tg.up - POP.rise ? 1 : c < tg.up ? (tg.up - c) / POP.rise : 0;
  return { x: tg.x0, y: tg.y, up };
}
export const hittable = (tg, t) => !tg.hit && targetAt(tg, t).up >= POP.hittable;

/**
 * A range: { seed, lesson (1..3), setup (setup.js setupShooting) }.
 * State: lesson, setup, targets, t, left, ammo, reloading (seconds left, 0 when not), cooldown, heat, shots, hits, rings, done, result, events.
 */
export function createGallery({ seed = 1, lesson = 1, setup = null } = {}) {
  const l = shootingLesson(lesson);
  const s = setup || setupShooting({ lesson: l.id });
  let rng = hashSeed('gallery', seed, l.id);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const targets = [];
  const nPop = Math.round(l.targets * 0.3);
  for (let i = 0; i < l.targets; i++) {
    const lane = LANES[(i * 2 + Math.floor(rand() * 3)) % 3];
    const r = r2(lane.r * l.size);
    const base = { id: i, lane: lane.id, y: lane.y, r, bullR: r2(r * l.bull), innerR: r2(r * RINGS.inner), hit: false, ring: null, flip: 0 };
    if (i >= l.targets - nPop) {
      targets.push({ ...base, kind: 'popup', x0: r2(24 + rand() * (RANGE.w - 48)), up: r2(1.5 / l.speed), down: r2(1.0 + rand() * 0.8), offset: r2(rand() * 3) });
    } else {
      const margin = r + 4;
      const dir = rand() < 0.5 ? 0 : 1;
      targets.push({ ...base, kind: 'slider', x0: margin, x1: RANGE.w - margin, v: r2(lane.v * l.speed * (0.85 + rand() * 0.3)), phase: dir + rand() * 0.9 });
    }
  }
  return {
    seed, lesson: l.id, setup: s, targets, t: 0, total: l.time, left: l.time,
    ammo: s.magazine, reloading: 0, cooldown: 0, heat: 0, shots: 0, hits: 0, rings: { bull: 0, inner: 0, outer: 0 }, empty: 0, reloads: 0,
    rng, done: false, result: null, events: [],
  };
}

/** The crosshair's bloom radius now: the resting spread plus one kick for each recent shot. */
export const bloomOf = (s) => r2(s.setup.spread + s.setup.kick * s.heat);
/** The bloom the crosshair would have with the heat at its most (the ring never grows past this). */
export const bloomMax = (s) => r2(s.setup.spread + s.setup.kick * s.setup.heatMax);
export const canShoot = (s) => !s.done && s.reloading <= 0 && s.cooldown <= 0 && s.ammo > 0;

const nextRand = (s) => { const [v, next] = rngStep(s.rng); s.rng = next; return v; };

/** Start a reload (also what the R key and the Reload button do). Returns false when it is not needed or already going. */
export function reload(s) {
  if (s.done || s.reloading > 0 || s.ammo >= s.setup.magazine) return false;
  s.reloading = s.setup.reloadSeconds; s.reloads++;
  s.events.push({ type: 'reload', seconds: s.reloading });
  return true;
}

/**
 * Fire at the range point (ax, ay). The shot lands inside the bloom (drawn from the seeded stream). Returns
 * { ok: false, why } when it cannot fire, or { ok: true, x, y, ring ('bull' | 'inner' | 'outer' | null), target (id | null) }.
 */
export function shoot(s, ax, ay) {
  s.events = [];
  if (s.done) return { ok: false, why: 'done' };
  if (s.reloading > 0) return { ok: false, why: 'reloading' };
  if (s.ammo <= 0) { s.empty++; reload(s); return { ok: false, why: 'empty' }; }
  if (s.cooldown > 0) return { ok: false, why: 'cooldown' };
  const bloom = bloomOf(s);
  const a = nextRand(s) * TAU, d = bloom * Math.sqrt(nextRand(s));
  const x = ax + Math.cos(a) * d, y = ay + Math.sin(a) * d;
  s.ammo--; s.shots++; s.cooldown = s.setup.fireGap; s.heat = Math.min(s.setup.heatMax, s.heat + 1);
  // The nearest rail is in front: test it first.
  let hit = null, ring = null;
  const order = s.targets.slice().sort((p, q) => q.y - p.y || p.id - q.id);
  for (const tg of order) {
    if (!hittable(tg, s.t)) continue;
    const at = targetAt(tg, s.t);
    const dist = Math.hypot(x - at.x, y - at.y);
    if (dist > tg.r) continue;
    hit = tg; ring = dist <= tg.bullR ? 'bull' : dist <= tg.innerR ? 'inner' : 'outer'; break;
  }
  if (hit) {
    hit.hit = true; hit.ring = ring; hit.flip = FLIP_SECONDS; hit.hitAt = r2(s.t); s.hits++; s.rings[ring]++;
    s.events.push({ type: ring === 'bull' ? 'bullseye' : 'hit', ring, id: hit.id });
  } else s.events.push({ type: 'miss' });
  const res = { ok: true, x, y, ring, target: hit ? hit.id : null };
  if (s.hits >= s.targets.length) finish(s, 'cleared');
  else if (s.ammo <= 0) reload(s);
  return res;
}

/** Advance the range: the clock, the reload, the fire gap, the bloom settling and the flips. */
export function stepGallery(s, dt = 1 / 60) {
  if (s.done) return s;
  s.events = [];
  s.t += dt; s.left = Math.max(0, s.left - dt);
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.heat = Math.max(0, s.heat - s.setup.heatDecay * dt);
  for (const tg of s.targets) if (tg.flip > 0) tg.flip = Math.max(0, tg.flip - dt);
  if (s.reloading > 0) {
    s.reloading = Math.max(0, s.reloading - dt);
    if (s.reloading === 0) { s.ammo = s.setup.magazine; s.events.push({ type: 'loaded' }); }
  }
  if (s.left <= 0) finish(s, 'time');
  return s;
}

/** The score lines for a finished (or in progress) round: { lines: [{ id, label, detail, xp }], xp, accuracy, cleared, elapsed, par }. Pure. */
export function scoreLines(s) {
  const l = shootingLesson(s.lesson), n = s.targets.length;
  const acc = s.shots ? s.hits / s.shots : 0;
  const cleared = s.hits >= n;
  const elapsed = r2(s.t);
  const hitXp = Math.round((l.hitXp * s.hits) / n);
  const bullXp = Math.min(l.bullXp, Math.floor(s.rings.bull / l.bullEvery));
  const accXp = s.shots >= MIN_SHOTS_FOR_ACCURACY ? (ACCURACY_STEPS.find(([min]) => acc >= min)?.[1] ?? 0) : 0;
  const timeXp = cleared ? (elapsed <= l.par ? 2 : elapsed <= l.par * TIME_SLACK ? 1 : 0) : 0;
  const lines = [
    { id: 'targets', label: 'Targets', detail: `${s.hits} of ${n}`, xp: hitXp },
    { id: 'bullseye', label: 'Bullseyes', detail: `${s.rings.bull} (1 XP for every ${l.bullEvery}, up to ${l.bullXp})`, xp: bullXp },
    { id: 'accuracy', label: 'Accuracy', detail: s.shots ? `${Math.round(acc * 100)}% (${s.hits} of ${s.shots} shots)` : 'no shots', xp: accXp },
    { id: 'time', label: 'Time', detail: cleared ? `${elapsed} s against par ${l.par} s` : `not cleared (par ${l.par} s)`, xp: timeXp },
  ];
  return { lines, xp: lines.reduce((a, x) => a + x.xp, 0), accuracy: Math.round(acc * 1000) / 1000, cleared, elapsed, par: l.par };
}

function finish(s, how) {
  s.done = true;
  const sc = scoreLines(s);
  s.result = {
    success: sc.xp > 0, how, lesson: s.lesson, targets: s.targets.length, hits: s.hits, shots: s.shots, bullseyes: s.rings.bull, rings: { ...s.rings },
    accuracy: sc.accuracy, time: sc.elapsed, par: sc.par, cleared: sc.cleared, lines: sc.lines, xp: sc.xp, reloads: s.reloads,
  };
  s.events.push({ type: 'done', how });
}
