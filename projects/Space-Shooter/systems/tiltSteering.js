/**
 * Pure tilt-steering math: no DOM, no timers, no globals. See docs/stardust/TILT.md.
 *
 * Frames
 * - Device frame (W3C DeviceOrientation/DeviceMotion): x = right edge, y = top edge,
 *   z = out of the screen toward the viewer, fixed to the hardware in its natural
 *   (portrait) orientation. It does NOT rotate with the screen.
 * - Screen frame: the same axes after undoing screen.orientation.angle, so x is the
 *   right of what the player sees and y is the top of what the player sees.
 * - "Up" vector: the unit vector pointing away from the ground, expressed in one of the
 *   frames above. Per the W3C spec this is what accelerationIncludingGravity reports at
 *   rest ({0,0,+9.8} lying face up); some iOS builds are reported to invert it, which the
 *   gravity-sign resolver below detects instead of assuming.
 */

/** Mirrors tilt-config.json; a test keeps the two identical. */
export const DEFAULT_TILT_CONFIG = Object.freeze({
  DEAD_ZONE_DEG: 3,
  FULL_LOCK_DEG: 40,
  EXPO: 0.35,
  FILTER_MIN_CUTOFF_HZ: 2.5,
  FILTER_BETA: 0.015,
  FILTER_DERIVATIVE_CUTOFF_HZ: 1,
  FLAT_FADE_START_DEG: 72,
  FLAT_FADE_END_DEG: 85,
  CALIBRATION_MS: 300,
  CALIBRATION_MAX_MS: 1500,
  CALIBRATION_MAX_SPREAD_DEG: 8,
  CALIBRATION_CLAMP_DEG: 25,
  ORIENTATION_SETTLE_MS: 250,
  PREFERRED_SOURCE: "motion",
});

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const finite = Number.isFinite;
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
/** Signed shortest difference a - b in degrees, in (-180, 180]. */
export function angleDelta(a, b) {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

const RANGES = {
  DEAD_ZONE_DEG: [0, 20], FULL_LOCK_DEG: [5, 90], EXPO: [-1, 1],
  FILTER_MIN_CUTOFF_HZ: [0.1, 30], FILTER_BETA: [0, 1], FILTER_DERIVATIVE_CUTOFF_HZ: [0.1, 30],
  FLAT_FADE_START_DEG: [30, 89], FLAT_FADE_END_DEG: [31, 90],
  CALIBRATION_MS: [0, 3000], CALIBRATION_MAX_MS: [0, 10000], CALIBRATION_MAX_SPREAD_DEG: [1, 90],
  CALIBRATION_CLAMP_DEG: [0, 45], ORIENTATION_SETTLE_MS: [0, 2000],
};

/** Merge a (possibly hand-edited) config over the defaults, rejecting bad values. */
export function normalizeTiltConfig(raw = {}) {
  const out = { ...DEFAULT_TILT_CONFIG };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, [lo, hi]] of Object.entries(RANGES))
    if (finite(raw[key])) out[key] = clamp(raw[key], lo, hi);
  if (raw.PREFERRED_SOURCE === "motion" || raw.PREFERRED_SOURCE === "orientation")
    out.PREFERRED_SOURCE = raw.PREFERRED_SOURCE;
  // Keep the curve and fade well-formed even if someone swaps the numbers.
  if (out.FULL_LOCK_DEG < out.DEAD_ZONE_DEG + 2) out.FULL_LOCK_DEG = out.DEAD_ZONE_DEG + 2;
  if (out.FLAT_FADE_END_DEG < out.FLAT_FADE_START_DEG + 1) out.FLAT_FADE_END_DEG = out.FLAT_FADE_START_DEG + 1;
  if (out.CALIBRATION_MAX_MS < out.CALIBRATION_MS) out.CALIBRATION_MAX_MS = out.CALIBRATION_MS;
  return Object.freeze(out);
}

/** screen.orientation.angle (0/90/180/270) or legacy window.orientation (-90/0/90/180) → 0/90/180/270. */
export function normalizeScreenAngle(angle) {
  if (!finite(angle)) return 0;
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

/**
 * Up vector in the device frame from W3C Euler angles (intrinsic Z-X'-Y'', R = Rz(α)Rx(β)Ry(γ)).
 * It is the third row of R, so alpha (compass heading) drops out and may be null.
 */
export function gravityFromOrientation(alpha, beta, gamma) {
  if (!finite(beta) || !finite(gamma)) return null;
  const b = beta * RAD, g = gamma * RAD;
  return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
}

/** Rotate a device-frame vector into the screen frame for a screen angle of 0/90/180/270. */
export function toScreenFrame(v, screenAngle = 0) {
  const a = normalizeScreenAngle(screenAngle);
  // Exact quarter turns avoid cos(90°) ≈ 6e-17 noise.
  if (a === 90) return { x: -v.y, y: v.x, z: v.z };
  if (a === 180) return { x: -v.x, y: -v.y, z: v.z };
  if (a === 270) return { x: v.y, y: -v.x, z: v.z };
  return { x: v.x, y: v.y, z: v.z };
}

const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 1 while the screen is at most FLAT_FADE_START from vertical, 0 once FLAT_FADE_END (flat). */
export function flatConfidence(pitchDeg, config = DEFAULT_TILT_CONFIG) {
  if (!finite(pitchDeg)) return 0;
  return 1 - smoothstep(config.FLAT_FADE_START_DEG, config.FLAT_FADE_END_DEG, Math.abs(pitchDeg));
}

/**
 * Steering roll of the screen about its own normal, relative to gravity.
 * roll > 0 = the screen is rotated clockwise as the player sees it = turn right.
 * Pitch (how far back the phone is held) does not change roll; it only lowers
 * confidence as the screen nears flat, where the in-plane gravity direction is noise.
 */
export function steeringFromGravity(up, screenAngle = 0, config = DEFAULT_TILT_CONFIG) {
  if (!up || !finite(up.x) || !finite(up.y) || !finite(up.z)) return null;
  const length = Math.hypot(up.x, up.y, up.z);
  if (!(length > 1e-6)) return null;
  const s = toScreenFrame({ x: up.x / length, y: up.y / length, z: up.z / length }, screenAngle);
  const inPlane = Math.hypot(s.x, s.y);
  const pitch = Math.atan2(Math.abs(s.z), inPlane) * DEG; // 0 = upright, 90 = flat
  const roll = inPlane > 1e-9 ? Math.atan2(-s.x, s.y) * DEG : 0;
  return { roll, pitch, confidence: flatConfidence(pitch, config), screen: s };
}

/** Degrees from neutral → steering in [-1, 1]: dead zone, RC-style expo curve, full lock. */
export function steeringResponse(degrees, config = DEFAULT_TILT_CONFIG) {
  if (!finite(degrees)) return 0;
  const { DEAD_ZONE_DEG: dz, FULL_LOCK_DEG: full, EXPO: e } = config;
  const u = clamp((Math.abs(degrees) - dz) / (full - dz), 0, 1);
  if (u === 0) return 0;
  // (1-e)·u + e·u³: keeps a live slope just past the dead zone, soft middle, exact 1 at full lock.
  // A negative e bends the other way (quick off centre, gentle near full lock).
  const curve = e >= 0 ? u * u * u : 1 - (1 - u) ** 3;
  return Math.sign(degrees) * ((1 - Math.abs(e)) * u + Math.abs(e) * curve);
}

/**
 * One Euro filter (Casiez, Roussel, Vogel, CHI 2012): a low-pass whose cutoff rises with speed,
 * so it is heavily smoothed while held still and nearly lag-free during a deliberate turn.
 */
export function createOneEuroFilter({ minCutoff = 2.5, beta = 0.015, dCutoff = 1 } = {}) {
  let x = null, dx = 0, lastT = null;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return {
    filter(value, tSeconds) {
      if (!finite(value)) return x ?? 0;
      if (x === null || lastT === null || !finite(tSeconds)) {
        x = value; dx = 0; lastT = tSeconds;
        return x;
      }
      const dt = clamp(tSeconds - lastT, 1 / 240, 0.1);
      lastT = tSeconds;
      const rawDx = (value - x) / dt;
      dx += alpha(dCutoff, dt) * (rawDx - dx);
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (value - x);
      return x;
    },
    reset() { x = null; dx = 0; lastT = null; },
    get value() { return x; },
  };
}

/**
 * Circular mean of confident roll samples, clamped to ±CALIBRATION_CLAMP_DEG so a
 * calibration taken mid-turn or with the phone on its side can never bias steering hard.
 * Returns null when there were no usable samples.
 */
export function computeNeutral(samples, config = DEFAULT_TILT_CONFIG) {
  let sx = 0, sy = 0, weight = 0;
  for (const { roll, confidence = 1 } of samples) {
    if (!finite(roll) || !(confidence > 0.5)) continue;
    sx += Math.sin(roll * RAD) * confidence;
    sy += Math.cos(roll * RAD) * confidence;
    weight += confidence;
  }
  if (weight === 0) return null;
  const mean = Math.atan2(sx, sy) * DEG;
  return clamp(mean, -config.CALIBRATION_CLAMP_DEG, config.CALIBRATION_CLAMP_DEG);
}

/**
 * accelerationIncludingGravity sign varies by platform (spec says "up"; some iOS reports are
 * inverted). Vote for the sign that agrees with orientation-derived gravity when available,
 * otherwise with the fact that a player looking at the game has the screen's top above its
 * bottom and/or the screen facing the sky. Locks after `needed` consistent votes.
 */
export function createGravitySignResolver({ needed = 4 } = {}) {
  let sign = 0, streak = 0, candidate = 0;
  return {
    get sign() { return sign; },
    push(motionUnit, referenceUp = null, screenAngle = 0) {
      if (sign !== 0) return sign;
      let vote = 0;
      if (referenceUp) {
        const dot = motionUnit.x * referenceUp.x + motionUnit.y * referenceUp.y + motionUnit.z * referenceUp.z;
        vote = dot > 0.6 ? 1 : dot < -0.6 ? -1 : 0;
      } else {
        const s = toScreenFrame(motionUnit, screenAngle);
        const score = s.y + 0.5 * s.z;
        vote = score > 0.35 ? 1 : score < -0.35 ? -1 : 0;
      }
      if (vote === 0) return 0;
      streak = vote === candidate ? streak + 1 : 1;
      candidate = vote;
      if (streak >= needed) sign = vote;
      return sign;
    },
    reset() { sign = 0; streak = 0; candidate = 0; },
  };
}

/**
 * Stateful but DOM-free steering pipeline: gravity sample → roll → neutral → filter → curve.
 * Times are milliseconds from any monotonic clock.
 */
export function createSteeringProcessor(initialConfig = DEFAULT_TILT_CONFIG) {
  let config = normalizeTiltConfig(initialConfig);
  let filter = makeFilter();
  let neutral = 0;            // absolute roll 0 = screen level; a sane default before calibration
  let calibrated = false;
  let calibration = null;     // { start, first, samples }
  let screenAngle = null;
  let holdUntil = -Infinity;  // output forced to 0 while a rotation settles
  let axis = 0, lastRoll = null, lastConfidence = 0;

  function makeFilter() {
    return createOneEuroFilter({
      minCutoff: config.FILTER_MIN_CUTOFF_HZ,
      beta: config.FILTER_BETA,
      dCutoff: config.FILTER_DERIVATIVE_CUTOFF_HZ,
    });
  }
  function startCalibration(time) {
    calibration = { start: time, first: time, samples: [] };
  }
  function feedCalibration(reading, time) {
    if (!calibration || time < calibration.start) return false;
    const c = calibration;
    if (reading.confidence > 0.5) {
      c.samples.push({ roll: reading.roll, confidence: reading.confidence, time });
      // A moving phone is not a neutral: restart the window if the spread is too wide.
      const rolls = c.samples.map(s => s.roll);
      const base = rolls[0];
      const spread = Math.max(...rolls.map(r => angleDelta(r, base))) - Math.min(...rolls.map(r => angleDelta(r, base)));
      if (spread > config.CALIBRATION_MAX_SPREAD_DEG && time - c.first < config.CALIBRATION_MAX_MS) {
        c.samples = [{ roll: reading.roll, confidence: reading.confidence, time }];
        c.start = time;
      }
    }
    const steadyLongEnough = c.samples.length >= 3 && time - c.start >= config.CALIBRATION_MS;
    if (!steadyLongEnough && time - c.first < config.CALIBRATION_MAX_MS) return false;
    const value = computeNeutral(c.samples, config);
    calibration = null;
    // The filter is kept, so a new neutral eases in over ~60 ms instead of snapping.
    if (value !== null) { neutral = value; calibrated = true; }
    return true;
  }

  return {
    /** Feed one up-vector sample (device frame). Returns the new axis in [-1, 1]. */
    update(up, angle, time) {
      const a = normalizeScreenAngle(angle);
      if (screenAngle !== null && a !== screenAngle) {
        // The player just rotated the phone: forget the old neutral and re-centre once settled.
        neutral = 0; calibrated = false; filter.reset(); axis = 0;
        holdUntil = time + config.ORIENTATION_SETTLE_MS;
        startCalibration(holdUntil);
      }
      screenAngle = a;
      const reading = steeringFromGravity(up, a, config);
      if (!reading) return axis;
      lastRoll = reading.roll;
      lastConfidence = reading.confidence;
      if (time < holdUntil) { axis = 0; return axis; }
      feedCalibration(reading, time);
      const relative = filter.filter(angleDelta(reading.roll, neutral), time / 1000);
      axis = clamp(steeringResponse(relative, config) * reading.confidence, -1, 1);
      return axis;
    },
    /** Average the next CALIBRATION_MS of steady samples into the neutral; steering continues meanwhile. */
    calibrate(time) { startCalibration(time); },
    /** Drop filter history (blur, hidden tab, pause). Neutral is kept. */
    reset() { filter.reset(); axis = 0; },
    /** Forget everything, including neutral and orientation (disable). */
    hardReset() {
      filter.reset(); axis = 0; neutral = 0; calibrated = false; calibration = null;
      screenAngle = null; holdUntil = -Infinity; lastRoll = null; lastConfidence = 0;
    },
    setConfig(next) { config = normalizeTiltConfig(next); filter = makeFilter(); },
    get config() { return config; },
    get axis() { return axis; },
    get neutral() { return neutral; },
    get calibrated() { return calibrated; },
    get calibrating() { return calibration !== null; },
    get roll() { return lastRoll; },
    get confidence() { return lastConfidence; },
  };
}
