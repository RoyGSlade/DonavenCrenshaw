// What to tell the hub about how a run was flown: the `client` block on every
// finish request.
//
//   device      'desktop' | 'phone' | 'tablet'
//   input       'keyboard' | 'controller' | 'touch' | 'tilt': what drove the ship for
//               most of the run, counted frame by frame while flying (input.js
//               feeds sampleInput), never guessed at the end
//   build       the garage build key the run was flown as (needle:0-1-0-1), only
//               when the weekly scene really flew one (scene.ship)
//   appearance  the ship the pilot had equipped when the run started (paint and
//               decals, for ghosts), or left out when nothing is equipped
//
// Everything decided here is a pure function of its arguments; the few readers
// of the browser (readDevice, the module-level run) are thin wrappers around it.
import { isTouchDevice } from './flightSettings.js';
import { cleanAppearance } from './shipLivery.js';
import { getEquippedAppearance } from './shipAppearance.js';
import { isBuild } from '../engine/shipStats.js';
import { state } from '../state.js';

export const DEVICES = Object.freeze(['desktop', 'phone', 'tablet']);
export const INPUTS = Object.freeze(['keyboard', 'controller', 'touch', 'tilt']);
// Smallest screen side, in CSS pixels, at which a touch device counts as a tablet
// (Android's own 600 dp line; an iPad mini is 744, a large phone about 430).
export const TABLET_MIN_SIDE = 600;

/**
 * Which kind of device this is. touch: a touch screen is the main way of playing
 * (see readDevice); width and height: the physical screen in CSS pixels, so
 * turning the phone does not change the answer.
 */
export function decideDevice({ touch = false, width = 0, height = 0 } = {}) {
  if (!touch) return 'desktop';
  const side = Math.min(Number(width) || 0, Number(height) || 0);
  // A touch device that cannot report its size is a phone: the common case.
  return side >= TABLET_MIN_SIDE ? 'tablet' : 'phone';
}

/**
 * Reads the browser. A laptop with a touch screen is still a desktop: if the
 * primary pointer is a mouse or trackpad (`pointer: fine`), touch is not the
 * way this device is played.
 */
export function readDevice(win = globalThis) {
  try {
    const fine = !!win.matchMedia?.('(pointer: fine)').matches;
    const touch = isTouchDevice(win) && !fine;
    return decideDevice({ touch, width: win.screen?.width, height: win.screen?.height });
  } catch { return 'desktop'; }
}

/**
 * The input that drove one frame, or null when nobody was touching anything.
 * Tilt steering being on beats everything (the phone is the steering wheel, the
 * buttons only add gas), then a gamepad, then the touch controls, then keys.
 *   tilt: tilt steering is on     pad/touch/keys: that source is giving input right now
 */
export function classifyInputFrame({ tilt = false, pad = false, touch = false, keys = false, tiltAxis = false } = {}) {
  if (!(pad || touch || keys || tiltAxis)) return null;
  if (tilt) return 'tilt';
  if (pad) return 'controller';
  if (touch) return 'touch';
  return keys ? 'keyboard' : null;
}

/** Whether a gamepad reading (systems/gamepad.js poll) is steering, pushing or firing. */
export function gamepadDriving(gp) {
  if (!gp) return false;
  return ['turnLeft', 'turnRight', 'thrust', 'thrustBack', 'strafeLeft', 'strafeRight', 'boost', 'shoot', 'brake'].some((k) => gp[k])
    || gp.thrustStrength > 0 || gp.backStrength > 0 || Math.abs(gp.turnStrength || 0) > 0;
}

// Ties go to the input that is harder to do by accident.
const PRIORITY = ['tilt', 'controller', 'touch', 'keyboard'];

/** Counts which input drove the frames of one run. */
export function createInputTally() {
  const counts = { keyboard: 0, controller: 0, touch: 0, tilt: 0 };
  return {
    /** Add one frame (a value from classifyInputFrame; null is ignored). */
    add(source) { if (Object.hasOwn(counts, source)) counts[source] += 1; },
    reset() { for (const k of Object.keys(counts)) counts[k] = 0; },
    counts: () => ({ ...counts }),
    /** The input used the most; `fallback` when the pilot never touched a control. */
    decide(fallback = 'keyboard') {
      let best = null;
      for (const source of PRIORITY) if (counts[source] > 0 && (best === null || counts[source] > counts[best])) best = source;
      return best ?? fallback;
    },
  };
}

// Where the equipped ship is read from: the garage's in-memory ship. Tests that
// run without a browser point it somewhere else.
let readEquipped = getEquippedAppearance;
export function setEquippedReader(read) { readEquipped = read || getEquippedAppearance; }

/** The equipped appearance, cleaned, or null when the standard ship is flying. */
export function snapshotAppearance(read = () => readEquipped()) {
  try { return cleanAppearance(read()); } catch { return null; }
}

/** The `client` block for a finish request. Only valid fields are kept. */
export function clientTag({ device, input, build, appearance } = {}) {
  const out = {};
  if (DEVICES.includes(device)) out.device = device;
  if (INPUTS.includes(input)) out.input = input;
  if (isBuild(build)) out.build = build;
  const clean = cleanAppearance(appearance);
  if (clean) out.appearance = clean;
  return out;
}

/**
 * What a hub ghost says about the ship it was flown in: { appearance, build },
 * each null when missing or not valid. An older hub sends neither.
 */
export function ghostShip(data) {
  return {
    appearance: cleanAppearance(data?.appearance),
    build: isBuild(data?.build) ? data.build : null,
  };
}

/**
 * One run's client facts. begin() is called when an attempt starts: it snapshots
 * the device and the equipped ship then, so changing ship mid-run cannot change
 * what a finish reports. current() is what a finish sends.
 */
export function createRunClient({ device = readDevice, appearance = snapshotAppearance, tiltOn = () => false, touchDevice = () => false } = {}) {
  const tally = createInputTally();
  let run = null;
  return {
    tally,
    /** A fresh attempt. `appearance` may be passed in when the caller already took the snapshot. */
    begin({ build = null, appearance: given } = {}) {
      tally.reset();
      run = { device: device(), build: isBuild(build) ? build : null, appearance: given === undefined ? appearance() : cleanAppearance(given) };
      return run;
    },
    sample(frame) { tally.add(classifyInputFrame(frame)); },
    /** The client block for a finish, or null before any attempt began. */
    current() {
      if (!run) return null;
      const fallback = tiltOn() ? 'tilt' : touchDevice() ? 'touch' : 'keyboard';
      return clientTag({ device: run.device, input: tally.decide(fallback), build: run.build, appearance: run.appearance });
    },
    get snapshot() { return run; },
  };
}

/** The running game's client facts (input.js samples into it; systems/runSaving.js reads it). */
export const runClient = createRunClient({
  tiltOn: () => !!state.input?.touch?.useTilt,
  touchDevice: () => isTouchDevice(),
});
