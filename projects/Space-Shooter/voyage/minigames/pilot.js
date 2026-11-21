// The piloting minigame: touchdown. A side view: the ship falls toward a landing pad and you
// steer it. Hold Thrust to slow the fall (it burns fuel), hold Left or Right to drift, tap Brake
// for an emergency brake (cancels 60% of the fall speed; you only have the ones your boost points
// earn). Touch down on the pad slower than the safe speed.
// World: 100 wide, 100 high, altitude 100 at the start, y falls toward 0. Drift has a little drag, and a
// seeded crosswind (two slow sine waves) pushes the ship sideways and a milder gust pushes it up or down. Pure and seeded; the view calls
// stepPilot(s, dt, { left, right, thrust }) on a fixed timestep and brake(s).
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const PILOT_DT = 1 / 60;
const DRAG = 0.35; // sideways speed bleeds off at this rate a second
export const OUTCOMES = Object.freeze({ landed: 'landed', crashed: 'crashed', missed: 'missed' });

/** setup: from setupPilot. */
export function createPilot({ seed = 1, setup = {} } = {}) {
  let rng = hashSeed('pilot', seed);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const fall = setup.fall ?? 12;
  const pad = setup.pad ?? 20;
  const padX = 30 + rand() * 40;                      // pad centre, 30..70
  const side = rand() < 0.5 ? -1 : 1;
  const startX = Math.max(8, Math.min(92, padX + side * (22 + rand() * 18))); // 22 to 40 from the pad
  return {
    x: startX, y: 100, vx: 0, vy: 0, t: 0,
    padX, pad, g: (2 * 100) / (fall * fall),
    drift: setup.drift ?? 4, wind: setup.wind ?? 1.5, thrustAcc: (setup.thrust ?? 2.2) * ((2 * 100) / (fall * fall)),
    safe: setup.safe ?? 3, fuelMax: setup.fuel ?? 10, fuel: setup.fuel ?? 10,
    brakes: setup.brakes ?? 0, brakesMax: setup.brakes ?? 0, brakeCancel: setup.brakeCancel ?? 0.6,
    w: [{ a: 0.6 + rand() * 0.4, f: 0.35 + rand() * 0.25, p: rand() * 6.28 }, { a: 0.4 * rand(), f: 0.9 + rand() * 0.5, p: rand() * 6.28 }],
    v: { a: 0.6 + rand() * 0.4, f: 0.5 + rand() * 0.4, p: rand() * 6.28 },
    thrusting: false, done: false, result: null, events: [],
  };
}

/** The crosswind acceleration right now (units/s^2, positive = to the right). */
export const windAt = (s, t = s.t) => s.wind * s.w.reduce((a, k) => a + k.a * Math.sin(6.283 * k.f * t + k.p), 0) / 1.4;

/** The vertical gust (units/s^2, positive = pushes the ship down): updrafts and downdrafts, a third of the crosswind. */
export const gustAt = (s, t = s.t) => s.wind * 0.33 * s.v.a * Math.sin(6.283 * s.v.f * t + s.v.p);

/** Advance one fixed step with the inputs held. */
export function stepPilot(s, dt = PILOT_DT, input = {}) {
  if (s.done) return s;
  s.events = [];
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const burn = !!input.thrust && s.fuel > 0;
  s.thrusting = burn;
  if (burn) s.fuel = Math.max(0, s.fuel - dt);
  s.vx += (dir * s.drift + windAt(s)) * dt - s.vx * DRAG * dt;
  s.vy += (s.g + gustAt(s) - (burn ? s.thrustAcc : 0)) * dt;
  s.x += s.vx * dt; s.y -= s.vy * dt; s.t += dt;
  if (s.x < 0) { s.x = 0; s.vx = Math.max(0, s.vx); }
  if (s.x > 100) { s.x = 100; s.vx = Math.min(0, s.vx); }
  if (s.y > 100) { s.y = 100; s.vy = Math.min(0, s.vy); } // the ship cannot climb off the top
  if (s.y <= 0) touchdown(s);
  return s;
}

/** An emergency brake: cancels 60% of the fall speed. Returns true when one was spent. */
export function brake(s) {
  if (s.done || s.brakes <= 0 || s.vy <= 0) return false;
  s.brakes--; s.vy *= 1 - s.brakeCancel; s.events.push({ type: 'brake' });
  return true;
}

export const onPad = (s) => Math.abs(s.x - s.padX) <= s.pad / 2;
/** Placeholder XP: 4, +1 per star above the first. None unless landed. */
export const pilotXp = (r) => (r?.success ? 4 + Math.max(0, r.stars - 1) : 0);

function touchdown(s) {
  s.y = 0; s.done = true;
  const speed = Math.max(0, s.vy);
  const slow = speed <= s.safe + 1e-9, pad = onPad(s);
  const outcome = !pad ? OUTCOMES.missed : !slow ? OUTCOMES.crashed : OUTCOMES.landed;
  const success = outcome === OUTCOMES.landed;
  const soft = success && speed <= s.safe * 0.6, thrifty = success && s.fuel >= s.fuelMax * 0.25;
  s.result = { outcome, success, speed: Math.round(speed * 10) / 10, safe: Math.round(s.safe * 10) / 10, off: Math.round(Math.abs(s.x - s.padX) * 10) / 10, fuelLeft: Math.round(s.fuel * 10) / 10, brakesLeft: s.brakes, seconds: Math.round(s.t * 10) / 10, soft, thrifty, stars: success ? 1 + (soft ? 1 : 0) + (thrifty ? 1 : 0) : 0, xp: 0 };
  s.result.xp = pilotXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
