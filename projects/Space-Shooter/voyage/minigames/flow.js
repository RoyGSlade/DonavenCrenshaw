// The foam valve (opening track C, scene 1): a small flow-balance game. A tank of wellness foam, three hand-wheels, a floor underneath.
// Pure: no DOM, no clock. The view feeds wheel turns and the clock.
//
//   FEED     brings foam into the tank (starts shut).      STUCK VALVE  leaks foam out of the tank onto the floor (starts wide open).
//   DRAIN    sends foam off to the waste line (starts shut): the trim when the tank is over the line.
//   Turn a wheel clockwise to close it, the other way to open it (TRAVEL full turns from open to shut).
//   The tank starts low. Fill it into the marked band and keep it there for HOLD seconds. Every drop the stuck valve leaks and every drop
//   that goes over the top lands on the floor; when the floor is full the room is flooded and the line is lost.
//   Tighten the leak, open the feed, stop at the line. Points never hurt: a roll or more Repair "time" points only make the floor hold more.
export const TRAVEL = 3;                 // full turns from wide open to shut
export const BAND = Object.freeze([0.58, 0.76]);   // the marked fill band, as a share of the tank
export const HOLD = 3;                 // seconds in the band to finish
export const RATE = Object.freeze({ feed: 0.12, leak: 0.05, drain: 0.1 }); // tank share per second at wide open
export const SPILL = Object.freeze({ leak: 0.03, over: 0.2 });              // floor share per second: the leak at wide open, and a tank over the top
export const START_LEVEL = 0.15;

export const VALVES = Object.freeze(['feed', 'leak', 'drain']);
export const VALVE_NAME = Object.freeze({ feed: 'Foam feed', leak: 'Stuck valve', drain: 'Drain' });

/** setup: { capacity } from setupRepair (the floor holds capacity / 120 of the base); anything missing is the base. Never less than the base. */
export function createFlow({ setup = {} } = {}) {
  const room = Math.max(1, (Number(setup.capacity) || 120) / 120);
  return { level: START_LEVEL, valves: { feed: 0, leak: 1, drain: 0 }, spilled: 0, floor: room, hold: 0, t: 0, done: false, result: null, shut: false, events: [] };
}

/** How open a valve is, 0 shut .. 1 wide open. */
export const openness = (s, id) => s.valves[id];
/** The floor's fullness, 0..1. */
export const floorFill = (s) => Math.min(1, s.spilled / s.floor);
export const inBand = (s) => s.level >= BAND[0] && s.level <= BAND[1];
/** A word for a valve: shut, a crack, half, mostly, wide open. */
export const valveWord = (p) => (p <= 0.02 ? 'shut' : p < 0.3 ? 'a crack' : p < 0.6 ? 'half open' : p < 0.9 ? 'mostly open' : 'wide open');

/** Turn a wheel by `turns` (clockwise positive: closing). Returns the state. */
export function turnValve(s, id, turns) {
  if (s.done || !s.valves || !(id in s.valves)) return s;
  const before = s.valves[id];
  s.valves[id] = Math.max(0, Math.min(1, before - turns / TRAVEL));
  if (id === 'leak' && before > 0.02 && s.valves.leak <= 0.02) { s.valves.leak = 0; s.events.push({ type: 'leak-shut' }); }
  return s;
}

/** Advance time. */
export function stepFlow(s, dt) {
  if (s.done) return s;
  s.t += dt;
  const v = s.valves;
  const wasOver = s.level >= 1;
  s.level += (RATE.feed * v.feed - RATE.leak * v.leak - RATE.drain * v.drain) * dt;
  let spill = SPILL.leak * v.leak * dt;
  if (s.level >= 1) { s.level = 1; if (v.feed * RATE.feed > RATE.leak * v.leak + RATE.drain * v.drain) spill += SPILL.over * dt; if (!wasOver) s.events.push({ type: 'over' }); }
  if (s.level < 0) s.level = 0;
  s.spilled += spill;
  s.hold = inBand(s) ? s.hold + dt : 0;
  if (s.hold >= HOLD) return finish(s, true);
  if (s.spilled >= s.floor) return finish(s, false);
  return s;
}

function finish(s, success) {
  s.done = true;
  s.result = { success, how: success ? 'held' : 'flooded', spilled: Math.round(floorFill(s) * 100) / 100, time: Math.round(s.t * 10) / 10, valveShut: false, xp: 0 };
  s.events.push({ type: 'done', ...s.result });
  return s;
}

/** After a lost line: shut everything off by hand. The flooding stops (a lesser mess). Returns the result, or null. */
export function shutAll(s) {
  if (!s.done || s.result.success || s.shut) return null;
  s.shut = true; s.result.valveShut = true; s.result.how = 'shut-off';
  return s.result;
}

/** A bot's whole play, in game time: tighten the leak, open the feed, close it as the tank nears the line. Returns the state. */
export function playFlow(s, { dt = 0.05, limit = 120 } = {}) {
  turnValve(s, 'leak', TRAVEL); turnValve(s, 'feed', -TRAVEL);
  while (!s.done && s.t < limit) {
    if (s.level > 0.5 && s.valves.feed > 0) turnValve(s, 'feed', 1.2 * dt);
    stepFlow(s, dt);
  }
  return s;
}
