import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_TILT_CONFIG, angleDelta, computeNeutral, createGravitySignResolver, createOneEuroFilter,
  createSteeringProcessor, flatConfidence, gravityFromOrientation, normalizeScreenAngle,
  normalizeTiltConfig, steeringFromGravity, steeringResponse, toScreenFrame,
} from "../projects/Space-Shooter/systems/tiltSteering.js";

// Pure math only: these prove the geometry and tuning, not real phone sensors.
const RAD = Math.PI / 180;
const near = (actual, expected, tolerance, label = "") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected} ± ${tolerance}, got ${actual}`);

/** Device-frame "up" for a phone shown at screenAngle, pitched back p° from upright, then turned r° clockwise (right). */
function upFromPose(pitchBack, roll, screenAngle = 0) {
  const p = pitchBack * RAD, r = roll * RAD;
  const s = { x: -Math.sin(r) * Math.cos(p), y: Math.cos(r) * Math.cos(p), z: Math.sin(p) };
  switch (normalizeScreenAngle(screenAngle)) {
    case 90: return { x: s.y, y: -s.x, z: s.z };
    case 180: return { x: -s.x, y: -s.y, z: s.z };
    case 270: return { x: -s.y, y: s.x, z: s.z };
    default: return s;
  }
}
/** W3C beta/gamma (cos beta > 0 branch) that produce a given up vector. */
const eulerFromUp = up => ({ beta: Math.asin(up.y) / RAD, gamma: Math.atan2(-up.x, up.z) / RAD });

test("tilt-config.json and the code defaults are the same numbers; bad hand edits fall back", async () => {
  const json = JSON.parse(await readFile(new URL("../projects/Space-Shooter/systems/tilt-config.json", import.meta.url), "utf8"));
  assert.deepEqual(json, { ...DEFAULT_TILT_CONFIG });
  const fixed = normalizeTiltConfig({ DEAD_ZONE_DEG: "3", FULL_LOCK_DEG: 1, EXPO: 9, FLAT_FADE_END_DEG: 10, PREFERRED_SOURCE: "gps" });
  assert.equal(fixed.DEAD_ZONE_DEG, DEFAULT_TILT_CONFIG.DEAD_ZONE_DEG);
  assert.ok(fixed.FULL_LOCK_DEG >= fixed.DEAD_ZONE_DEG + 2);
  assert.equal(fixed.EXPO, 1);
  assert.ok(fixed.FLAT_FADE_END_DEG > fixed.FLAT_FADE_START_DEG);
  assert.equal(fixed.PREFERRED_SOURCE, "motion");
  assert.deepEqual(normalizeTiltConfig(null), { ...DEFAULT_TILT_CONFIG });
});

test("screen angles normalize from screen.orientation.angle and legacy window.orientation", () => {
  assert.deepEqual([0, 90, 180, 270, -90, 360, 89.6, NaN, undefined].map(normalizeScreenAngle), [0, 90, 180, 270, 270, 0, 90, 0, 0]);
});

test("orientation-derived gravity is the third row of the W3C matrix R = Rz(alpha)·Rx(beta)·Ry(gamma)", () => {
  const mul = (a, b) => a.map((row, i) => b[0].map((_, j) => row.reduce((sum, _, k) => sum + a[i][k] * b[k][j], 0)));
  const Rz = t => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  const Rx = t => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
  const Ry = t => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
  for (const [alpha, beta, gamma] of [[0, 0, 0], [30, 45, 10], [200, -20, 80], [359, 90, -45], [120, 170, -89]]) {
    const R = mul(mul(Rz(alpha * RAD), Rx(beta * RAD)), Ry(gamma * RAD));
    const up = gravityFromOrientation(alpha, beta, gamma);
    near(up.x, R[2][0], 1e-12); near(up.y, R[2][1], 1e-12); near(up.z, R[2][2], 1e-12);
    // Heading never matters for steering, and browsers without a compass send alpha = null.
    assert.deepEqual(gravityFromOrientation(null, beta, gamma), up);
  }
  assert.deepEqual(gravityFromOrientation(0, 0, 0), { x: -0, y: 0, z: 1 });
  assert.equal(gravityFromOrientation(0, null, 5), null);
  assert.equal(gravityFromOrientation(0, 5, NaN), null);
});

test("gravity → steering roll in all four screen angles, positive = clockwise = right", () => {
  for (const angle of [0, 90, 180, 270]) {
    for (const roll of [-60, -30, -10, 0, 10, 30, 60]) {
      const reading = steeringFromGravity(upFromPose(40, roll, angle), angle);
      near(reading.roll, roll, 1e-9, `angle ${angle} roll ${roll}`);
      near(reading.pitch, 40, 1e-9);
      assert.equal(reading.confidence, 1);
      // The same physical hold read through Euler angles gives the same answer.
      const { beta, gamma } = eulerFromUp(upFromPose(40, roll, angle));
      near(steeringFromGravity(gravityFromOrientation(0, beta, gamma), angle).roll, roll, 1e-9);
    }
  }
  // Physical checks against the W3C axes, independent of the pose helper:
  // portrait, lying back, right edge dipped (gamma > 0) → steer right.
  assert.ok(steeringFromGravity(gravityFromOrientation(0, 40, 15), 0).roll > 0);
  // Landscape with the device top on the player's left (angle 90) held upright: gamma ≈ -90, level.
  near(steeringFromGravity(gravityFromOrientation(0, 0, -89), 90).roll, 0, 1e-9);
  // Angle 90: raising the device top (on the left) dips the right side → right. Angle 270 mirrors it.
  const raisedTop = gravityFromOrientation(0, 15, -50);
  assert.ok(steeringFromGravity(raisedTop, 90).roll > 0);
  assert.ok(steeringFromGravity(raisedTop, 270).roll < 0);
  // Unusable vectors are rejected rather than steering.
  for (const bad of [null, { x: 0, y: 0, z: 0 }, { x: NaN, y: 1, z: 0 }]) assert.equal(steeringFromGravity(bad, 0), null);
  // Magnitude (m/s² vs g) does not matter.
  near(steeringFromGravity({ x: -3, y: 5, z: 7.4 }, 0).roll, steeringFromGravity({ x: -0.3, y: 0.5, z: 0.74 }, 0).roll, 1e-12);
});

test("pitch independence: 20°, 45° and 70° back with the same roll steer identically", () => {
  for (const angle of [0, 90, 270]) {
    for (const roll of [-25, -8, 12, 30]) {
      const axes = [20, 45, 70].map(pitch => {
        const reading = steeringFromGravity(upFromPose(pitch, roll, angle), angle);
        near(reading.roll, roll, 1e-9);
        assert.equal(reading.confidence, 1, `pitch ${pitch} is a normal hold`);
        return steeringResponse(reading.roll) * reading.confidence;
      });
      near(axes[1], axes[0], 1e-9); near(axes[2], axes[0], 1e-9);
    }
  }
  // The old beta/gamma blend did not have this property: the same 10° turn read ~2.8x
  // weaker when the phone was held further back.
  const oldBlend = (pitch, angle) => {
    const { beta, gamma } = eulerFromUp(upFromPose(pitch, 10, angle));
    return gamma * Math.cos(angle * RAD) + beta * Math.sin(angle * RAD);
  };
  assert.ok(oldBlend(70, 90) < oldBlend(20, 90) / 2);
});

test("a phone laid flat fades steering out instead of going wild", () => {
  assert.equal(flatConfidence(0), 1);
  assert.equal(flatConfidence(DEFAULT_TILT_CONFIG.FLAT_FADE_START_DEG), 1);
  assert.equal(flatConfidence(DEFAULT_TILT_CONFIG.FLAT_FADE_END_DEG), 0);
  assert.equal(flatConfidence(90), 0);
  assert.equal(flatConfidence(NaN), 0);
  let previous = 1;
  for (let pitch = 60; pitch <= 90; pitch += 0.5) {
    const c = flatConfidence(pitch);
    assert.ok(c <= previous + 1e-12 && c >= 0 && c <= 1);
    previous = c;
  }
  // Face up and face down on a table: tiny wobbles swing the in-plane angle wildly, output stays ~0.
  for (const z of [1, -1]) {
    const processor = createSteeringProcessor();
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      const wobble = { x: 0.02 * Math.sin(i * 1.7), y: 0.02 * Math.cos(i * 2.3), z };
      worst = Math.max(worst, Math.abs(processor.update(wobble, 0, i * 16)));
    }
    assert.equal(worst, 0);
  }
  // Nearly flat but still sensed: strongly reduced, never full lock.
  const reading = steeringFromGravity(upFromPose(80, 35), 0);
  assert.ok(reading.confidence > 0 && reading.confidence < 0.5);
  assert.ok(steeringResponse(reading.roll) * reading.confidence < 0.5);
});

test("response curve: dead zone, full lock, continuous, monotonic and symmetric", () => {
  const { DEAD_ZONE_DEG: dz, FULL_LOCK_DEG: full } = DEFAULT_TILT_CONFIG;
  assert.equal(dz, 3);
  assert.equal(full, 40);
  for (const bad of [NaN, Infinity, -Infinity, null, undefined]) assert.equal(steeringResponse(bad), 0);
  assert.equal(steeringResponse(0), 0);
  assert.equal(steeringResponse(dz), 0);
  assert.equal(steeringResponse(-dz + 0.01), 0);
  assert.equal(steeringResponse(full), 1);
  assert.equal(steeringResponse(-full), -1);
  assert.equal(steeringResponse(170), 1);
  assert.ok(steeringResponse(dz + 0.1) < 0.01, "no jump at the dead-zone edge");
  let previous = 0;
  for (let d = 0; d <= 60; d += 0.25) {
    const y = steeringResponse(d);
    assert.ok(y >= previous, `monotonic at ${d}`);
    assert.ok(steeringResponse(-d) === -y, `symmetric at ${d}`);
    previous = y;
  }
  // Softer than the old 24° lock: a 20° lean is a firm but partial turn.
  const mid = steeringResponse(20);
  assert.ok(mid > 0.25 && mid < 0.5, `20° → ${mid}`);
  // Configurable from tilt-config.json.
  const tight = normalizeTiltConfig({ DEAD_ZONE_DEG: 1, FULL_LOCK_DEG: 20, EXPO: 0 });
  assert.equal(steeringResponse(20, tight), 1);
  near(steeringResponse(10.5, tight), 0.5, 1e-12);
});

test("one-euro filter settles, rejects jitter and still follows a deliberate turn quickly", () => {
  const f = createOneEuroFilter({ minCutoff: 2.5, beta: 0.015, dCutoff: 1 });
  let random = 7;
  const noise = () => { random = (random * 16807) % 2147483647; return (random / 2147483647 - 0.5) * 2; };
  let t = 0, out = 0;
  const raw = [], filtered = [];
  for (let i = 0; i < 240; i++, t += 1 / 60) {
    const sample = 10 + noise() * 1.5; // ±1.5° hand/sensor jitter at 60 Hz
    out = f.filter(sample, t);
    if (i > 60) { raw.push(sample); filtered.push(out); }
  }
  const std = values => { const m = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length); };
  assert.ok(std(filtered) < std(raw) / 2.5, `jitter ${std(raw).toFixed(2)} → ${std(filtered).toFixed(2)}`);
  near(filtered.reduce((a, b) => a + b, 0) / filtered.length, 10, 0.3, "no bias");
  // Step 10° → 35° (a real turn): 90% of the way within 150 ms, settled within 0.5 s.
  let reached = null;
  for (let ms = 0; ms <= 500; ms += 1000 / 60, t += 1 / 60) {
    out = f.filter(35, t);
    if (reached === null && out >= 10 + 0.9 * 25) reached = ms;
  }
  assert.ok(reached !== null && reached <= 150, `90% after ${reached} ms`);
  near(out, 35, 0.05);
  f.reset();
  assert.equal(f.filter(-4, t), -4, "reset starts from the next reading, no stale glide");
});

test("calibration averages a steady window, is clamped to ±25° and restarts if the phone moves", () => {
  assert.equal(computeNeutral([]), null);
  assert.equal(computeNeutral([{ roll: 40, confidence: 0.2 }]), null, "flat samples are ignored");
  near(computeNeutral([{ roll: 4 }, { roll: 6 }, { roll: 5 }]), 5, 1e-9);
  assert.equal(computeNeutral([{ roll: 60 }, { roll: 62 }]), 25);
  assert.equal(computeNeutral([{ roll: -170 }]), -25);
  near(Math.abs(computeNeutral([{ roll: 179 }, { roll: -179 }], { CALIBRATION_CLAMP_DEG: 180 })), 180, 1e-9);
  near(angleDelta(-179, 179), 2, 1e-12);

  const p = createSteeringProcessor();
  let t = 0;
  const feed = (roll, n, angle = 0, pitch = 45) => {
    let axis = 0;
    for (let i = 0; i < n; i++, t += 16) axis = p.update(upFromPose(pitch, roll, angle), angle, t);
    return axis;
  };
  // Before any calibration, level (roll 0) is straight ahead.
  assert.equal(p.neutral, 0);
  assert.ok(feed(12, 10) > 0);
  p.calibrate(t);
  feed(12, 30);
  assert.equal(p.calibrating, false);
  near(p.neutral, 12, 1e-6);
  assert.equal(feed(12, 20), 0, "the calibrated hold is straight ahead");
  assert.ok(feed(30, 20) > 0.25);
  assert.ok(feed(-5, 20) < -0.2);
  // A calibration taken leaning hard can bias at most 25°.
  p.calibrate(t);
  feed(70, 30);
  assert.equal(p.neutral, 25);
  // A phone swinging through the window is not a neutral: the window restarts until steady.
  p.calibrate(t);
  for (let i = 0; i < 12; i++, t += 16) p.update(upFromPose(45, i % 2 ? -15 : 15), 0, t);
  assert.equal(p.calibrating, true);
  feed(3, 30);
  assert.equal(p.calibrating, false);
  near(p.neutral, 3, 1e-6);
  // Never steady: gives up after CALIBRATION_MAX_MS with a clamped average instead of hanging.
  p.calibrate(t);
  for (let i = 0; i < 200 && p.calibrating; i++, t += 16) p.update(upFromPose(45, (i % 2 ? -1 : 1) * 40), 0, t);
  assert.equal(p.calibrating, false);
  assert.ok(Math.abs(p.neutral) <= 25);
});

test("rotating the phone to another orientation re-neutrals after it settles", () => {
  const p = createSteeringProcessor();
  let t = 0;
  const feed = (roll, n, angle) => {
    let axis = 0;
    for (let i = 0; i < n; i++, t += 16) axis = p.update(upFromPose(40, roll, angle), angle, t);
    return axis;
  };
  p.calibrate(t);
  feed(8, 30, 90);
  near(p.neutral, 8, 1e-6);
  // Flip to the other landscape: steering is held at 0 while the phone swings round.
  assert.equal(p.update(upFromPose(40, 50, 270), 270, t), 0);
  assert.equal(p.neutral, 0);
  assert.equal(p.calibrating, true);
  for (let ms = 0; ms < DEFAULT_TILT_CONFIG.ORIENTATION_SETTLE_MS - 20; ms += 16, t += 16)
    assert.equal(p.update(upFromPose(40, ms % 32 ? 60 : -60), 270, t), 0);
  // Then the new comfortable hold becomes straight ahead.
  feed(-6, 40, 270);
  assert.equal(p.calibrating, false);
  near(p.neutral, -6, 1e-6);
  assert.equal(feed(-6, 10, 270), 0);
  assert.ok(feed(20, 20, 270) > 0.2);
});

test("accelerationIncludingGravity sign is resolved from orientation or from how a screen is held", () => {
  const up = upFromPose(40, 10, 90);
  const inverted = { x: -up.x, y: -up.y, z: -up.z };
  const withReference = createGravitySignResolver();
  for (let i = 0; i < 3; i++) assert.equal(withReference.push(inverted, up, 90), 0);
  assert.equal(withReference.push(inverted, up, 90), -1);
  const specSign = createGravitySignResolver();
  for (let i = 0; i < 4; i++) specSign.push(up, up, 90);
  assert.equal(specSign.sign, 1);
  // No orientation stream: a player facing the screen has its top above its bottom.
  const heuristic = createGravitySignResolver();
  for (let i = 0; i < 4; i++) heuristic.push(inverted, null, 90);
  assert.equal(heuristic.sign, -1);
  // Ambiguous (edge-on) readings never vote.
  const edge = createGravitySignResolver();
  for (let i = 0; i < 10; i++) edge.push(toScreenFrame({ x: 1, y: 0, z: 0 }, 0), null, 0);
  assert.equal(edge.sign, 0);
});

test("player tilt settings: every dead zone, max tilt and sensitivity step gives a well-formed curve", async () => {
  const { TILT_DEAD_ZONES, TILT_MAX_TILTS, TILT_EXPOS, TILT_DEFAULTS, tiltTuning } = await import("../projects/Space-Shooter/systems/flightSettings.js");
  // The defaults are the tuned config, so nothing changes until a player moves a setting.
  const base = tiltTuning({ tilt: { ...TILT_DEFAULTS } });
  assert.deepEqual(base, { deadZoneDeg: DEFAULT_TILT_CONFIG.DEAD_ZONE_DEG, fullLockDeg: DEFAULT_TILT_CONFIG.FULL_LOCK_DEG, expo: DEFAULT_TILT_CONFIG.EXPO });
  // Missing or junk saved values fall back to the defaults.
  assert.deepEqual(tiltTuning({}), base);
  assert.deepEqual(tiltTuning({ tilt: { deadIndex: 99, maxIndex: -1, sensIndex: "x" } }), base);
  for (const dz of TILT_DEAD_ZONES) for (const full of TILT_MAX_TILTS) for (const expo of TILT_EXPOS) {
    const config = normalizeTiltConfig({ DEAD_ZONE_DEG: dz, FULL_LOCK_DEG: full, EXPO: expo });
    assert.equal(config.DEAD_ZONE_DEG, dz); assert.equal(config.FULL_LOCK_DEG, full); assert.equal(config.EXPO, expo);
    assert.equal(steeringResponse(dz, config), 0);
    near(steeringResponse(full, config), 1, 1e-12);
    let previous = 0;
    for (let d = 0; d <= full + 5; d += 0.25) {
      const y = steeringResponse(d, config);
      assert.ok(y >= previous - 1e-12 && y <= 1, `monotonic at ${d} (${dz}/${full}/${expo})`);
      previous = y;
    }
  }
  // Sensitivity orders the curve: at half travel a higher level always turns harder.
  const half = TILT_EXPOS.map((expo) => steeringResponse(21.5, normalizeTiltConfig({ DEAD_ZONE_DEG: 3, FULL_LOCK_DEG: 40, EXPO: expo })));
  for (let i = 1; i < half.length; i++) assert.ok(half[i] > half[i - 1], `level ${i + 1} is quicker than level ${i}`);
});

test("the tilt controller applies player tuning on top of its config", async () => {
  const { createTiltController } = await import("../projects/Space-Shooter/systems/mobileControls.js");
  const controller = createTiltController({ windowTarget: {}, config: DEFAULT_TILT_CONFIG });
  controller.setTuning({ deadZoneDeg: 8, fullLockDeg: 25, expo: -0.3 });
  assert.deepEqual([controller.getConfig().DEAD_ZONE_DEG, controller.getConfig().FULL_LOCK_DEG, controller.getConfig().EXPO], [8, 25, -0.3]);
  assert.equal(controller.getConfig().FILTER_BETA, DEFAULT_TILT_CONFIG.FILTER_BETA);
  controller.setTuning({});
  assert.equal(controller.getConfig().FULL_LOCK_DEG, DEFAULT_TILT_CONFIG.FULL_LOCK_DEG);
});
