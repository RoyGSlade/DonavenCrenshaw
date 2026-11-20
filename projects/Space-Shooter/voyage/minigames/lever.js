// The holodeck power lever (opening track C, scene 1): pull it down and HOLD it (power off), wait for the hum to die, then let
// it go (power on). Pure: the view feeds the lever's position and the clock.
//
//   pos 0 is up (power on), 1 is fully down (power off). Pulling past 0.9 throws the power off: the hum starts at 1 and runs
//   down over HUM_TIME seconds while the lever is held down. Let go (or push it up) once the hum is dead and the program resets.
//   Let go while the hum is still up (above HUM_OK) and the power comes back into a live projector: a surge. The first surge is a
//   warning (the lights flicker hard, the lever kicks back, the hum starts over); the second fries the projector.
export const HUM_TIME = 3.2;       // seconds from a full hum to dead, with the lever held down
export const HUM_OK = 0.15;        // the hum counts as dead at or below this
export const DOWN_AT = 0.9;        // the lever is "down" from here
export const STRIKES = 2;          // surges the projector survives: the second one fries it

export function createLever() {
  return { pos: 0, phase: 'on', hum: 0, strikes: 0, held: 0, grabbed: false, t: 0, done: false, result: null, events: [] };
}

/** True while the power is off (lever down and held). */
export const powerOff = (s) => s.phase === 'off' || s.phase === 'dead';

/** Take hold of the lever. */
export function leverGrab(s) { if (!s.done) s.grabbed = true; return s; }

/** Move the lever to `pos` (0..1) while held. Pulling it down throws the power off. */
export function leverMove(s, pos) {
  if (s.done || !s.grabbed) return s;
  s.pos = Math.max(0, Math.min(1, pos));
  if (s.phase === 'on' && s.pos >= DOWN_AT) { s.phase = 'off'; s.hum = 1; s.held = 0; s.events.push({ type: 'off' }); }
  else if ((s.phase === 'off' || s.phase === 'dead') && s.pos < DOWN_AT) release(s, 'moved');
  return s;
}

/** Let go of the lever. */
export function leverRelease(s) {
  if (s.done || !s.grabbed) return s;
  s.grabbed = false;
  if (s.phase === 'off' || s.phase === 'dead') release(s, 'let go');
  else s.pos = 0; // not pulled far enough: it springs back, nothing happened
  return s;
}

function release(s, why) {
  s.pos = 0; s.grabbed = false;
  if (s.hum <= HUM_OK) { s.phase = 'on'; s.hum = 0; finish(s, true); return; }
  s.strikes++; s.phase = 'on'; s.events.push({ type: 'surge', strikes: s.strikes, why });
  s.hum = 0;
  if (s.strikes >= STRIKES) finish(s, false);
}

/** Advance time: the hum dies while the lever is held down. */
export function leverTick(s, dt) {
  s.t += dt;
  if (s.done) return s;
  if (s.phase === 'off') {
    s.held += dt;
    s.hum = Math.max(0, 1 - s.held / HUM_TIME);
    if (s.hum <= HUM_OK) { s.phase = 'dead'; s.events.push({ type: 'dead' }); }
  }
  return s;
}

function finish(s, success) {
  s.done = true; s.grabbed = false;
  s.result = { success, how: success ? 'reset' : 'fried', strikes: s.strikes, time: Math.round(s.t * 10) / 10, xp: 0 };
  s.events.push({ type: 'done', ...s.result });
}

/** A bot's whole play: pull down, wait the hum out (`wait` seconds; HUM_TIME is enough), let go. Returns the state. */
export function playLever(s, wait = HUM_TIME + 0.1) {
  leverGrab(s); leverMove(s, 1);
  for (let t = 0; t < wait; t += 0.1) leverTick(s, 0.1);
  leverRelease(s);
  return s;
}
