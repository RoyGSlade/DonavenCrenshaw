import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiltController, computeTurnAxis, screenTiltDegrees, toggleMobileFullscreen, isFullscreen } from '../projects/Space-Shooter/systems/mobileControls.js';

const RAD = Math.PI / 180;
/** Device-frame "up" for a phone shown at screenAngle, pitched back p° from upright, turned r° clockwise. */
function upFromPose(pitchBack, roll, screenAngle = 0) {
  const p = pitchBack * RAD, r = roll * RAD;
  const s = { x: -Math.sin(r) * Math.cos(p), y: Math.cos(r) * Math.cos(p), z: Math.sin(p) };
  if (screenAngle === 90) return { x: s.y, y: -s.x, z: s.z };
  if (screenAngle === 180) return { x: -s.x, y: -s.y, z: s.z };
  if (screenAngle === 270) return { x: -s.y, y: s.x, z: s.z };
  return s;
}
const eulerFromUp = up => ({ alpha: null, beta: Math.asin(up.y) / RAD, gamma: Math.atan2(-up.x, up.z) / RAD });

function sensorWindow(permission, { motionPermission, fetchConfig } = {}) {
  const win = new EventTarget();
  let clock = 100, timeout;
  Object.assign(win, {
    isSecureContext: true,
    DeviceOrientationEvent: permission ? { requestPermission: permission } : {},
    document: Object.assign(new EventTarget(), { hidden: false }),
    screen: { orientation: { angle: 0 } },
    performance: { now: () => clock },
    setTimeout: fn => { timeout = fn; return 1; },
    clearTimeout: () => { timeout = null; },
  });
  if (motionPermission) win.DeviceMotionEvent = { requestPermission: motionPermission };
  if (fetchConfig) win.fetch = async () => ({ ok: true, json: async () => fetchConfig });
  const angle = () => win.screen.orientation?.angle ?? ((win.orientation % 360) + 360) % 360;
  const f = {
    win, advance: ms => { clock += ms; }, timeout: () => timeout?.(),
    /** Raw DeviceOrientationEvent-shaped reading, 100 ms after the previous one. */
    sample(beta, gamma, step = 100) {
      clock += step;
      win.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: null, beta, gamma }));
    },
    /** A physical hold, delivered through deviceorientation Euler angles. */
    pose(pitch, roll, step = 100) {
      const { beta, gamma } = eulerFromUp(upFromPose(pitch, roll, angle()));
      f.sample(beta, gamma, step);
    },
    /** The same hold through devicemotion; sign -1 mimics platforms that invert the vector. */
    motion(pitch, roll, { sign = 1, step = 16, withOrientation = false } = {}) {
      clock += step;
      const up = upFromPose(pitch, roll, angle());
      if (withOrientation) {
        const { beta, gamma } = eulerFromUp(up);
        win.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: null, beta, gamma }));
      }
      win.dispatchEvent(Object.assign(new Event('devicemotion'), {
        accelerationIncludingGravity: { x: up.x * 9.81 * sign, y: up.y * 9.81 * sign, z: up.z * 9.81 * sign },
      }));
    },
    hold(pitch, roll, count = 6, step = 100) { for (let i = 0; i < count; i++) f.pose(pitch, roll, step); },
  };
  return f;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('tilt maths reject bad readings and read roll from gravity in portrait and either landscape', () => {
  for (const value of [NaN, Infinity, null, undefined]) assert.equal(computeTurnAxis(value), 0);
  assert.equal(computeTurnAxis(2), 0);
  assert.equal(computeTurnAxis(40), 1);
  assert.equal(computeTurnAxis(-40), -1);
  assert.ok(computeTurnAxis(24) < 0.6, 'the old 24° full lock is now a partial turn');
  for (const angle of [0, 90, 180, 270]) {
    const reading = eulerFromUp(upFromPose(45, 15, angle));
    assert.ok(Math.abs(screenTiltDegrees(reading, angle) - 15) < 1e-9, `screen angle ${angle}`);
  }
  // Upright portrait: gamma is a yaw about the vertical, not steering; the Euler blend got this wrong.
  assert.ok(Math.abs(screenTiltDegrees({ beta: 90, gamma: 30 }, 0)) < 1e-9);
  assert.equal(screenTiltDegrees({ beta: null, gamma: 4 }, 0), null);
});

test('HTTP and denied motion permission never enable tilt', async () => {
  let calls = 0;
  const fixture = sensorWindow(() => { calls++; return Promise.resolve('denied'); });
  fixture.win.isSecureContext = false;
  const tilt = createTiltController({ windowTarget: fixture.win });
  assert.equal(await tilt.enable(), false);
  assert.equal(calls, 0);
  assert.match(tilt.getState().message, /HTTPS/);
  fixture.win.isSecureContext = true;
  assert.equal(await tilt.enable(), false);
  assert.equal(calls, 1);
  assert.equal(tilt.getState().status, 'denied');
  fixture.sample(0, 30);
  assert.equal(tilt.getAxis(), 0);
  const failing = sensorWindow(() => { throw new Error('NotAllowedError'); });
  const tilt2 = createTiltController({ windowTarget: failing.win });
  assert.equal(await tilt2.enable(), false);
  assert.match(tilt2.getState().message, /failed/);
});

test('iOS-style permission: orientation and motion prompts both start inside the tap, either grant is enough', async () => {
  const asked = [];
  const f = sensorWindow(() => { asked.push('orientation'); return Promise.resolve('denied'); }, {
    motionPermission: () => { asked.push('motion'); return Promise.resolve('granted'); },
  });
  const tilt = createTiltController({ windowTarget: f.win });
  const pending = tilt.enable();
  assert.deepEqual(asked, ['orientation', 'motion'], 'both requested synchronously, before any await');
  await flush();
  for (let i = 0; i < 8; i++) f.motion(45, 0);
  assert.equal(await pending, true);
  assert.equal(tilt.getDebug().source, 'motion');
});

test('tilt waits for real readings, calibrates, recenters, zeros stale input and pauses on blur/hidden', async () => {
  const f = sensorWindow();
  const tilt = createTiltController({ windowTarget: f.win });
  const ready = tilt.enable();
  assert.equal(tilt.getState().enabled, false);
  assert.equal(tilt.getState().status, 'calibrating');
  f.pose(45, 6);
  assert.equal(await ready, true);
  assert.equal(tilt.getState().enabled, true);
  f.hold(45, 6, 4);                          // the comfortable hold becomes straight ahead
  assert.equal(tilt.getDebug().calibrating, false);
  assert.ok(Math.abs(tilt.getDebug().neutral - 6) < 1e-6);
  assert.match(tilt.getState().message, /Recenter/);
  assert.equal(tilt.getAxis(), 0);
  f.hold(45, 50, 3);                         // 44° right of neutral → full lock
  assert.ok(tilt.getAxis() > 0.95);
  f.hold(70, 50, 3);                         // held further back, same turn → same steering
  assert.ok(tilt.getAxis() > 0.95);
  f.advance(351);
  assert.equal(tilt.getAxis(), 0, 'stale sensor stream releases the wheel');
  assert.equal(tilt.calibrate(), true);
  assert.match(tilt.getState().message, /Recentering/);
  f.hold(45, 20, 5);
  assert.ok(Math.abs(tilt.getDebug().neutral - 20) < 1e-6);
  assert.equal(tilt.getAxis(), 0);
  f.hold(45, -10, 4);
  assert.ok(tilt.getAxis() < -0.5);
  f.win.dispatchEvent(new Event('blur'));
  assert.equal(tilt.getAxis(), 0);
  f.win.document.hidden = true;
  f.win.document.dispatchEvent(new Event('visibilitychange'));
  f.pose(45, 60);
  assert.equal(tilt.getAxis(), 0, 'hidden tab never steers');
  f.win.document.hidden = false;
  f.pose(45, 20);
  assert.equal(tilt.getAxis(), 0, 'back in view, the kept neutral still applies');
  tilt.disable();
  assert.equal(tilt.getState().enabled, false);
  f.pose(45, 60);
  assert.equal(tilt.getAxis(), 0);
});

test('turning the phone to the other landscape re-neutrals instead of steering', async () => {
  const f = sensorWindow();
  f.win.screen.orientation.angle = 90;
  const tilt = createTiltController({ windowTarget: f.win });
  const ready = tilt.enable();
  f.hold(40, 10, 5);
  assert.equal(await ready, true);
  assert.ok(Math.abs(tilt.getDebug().neutral - 10) < 1e-6);
  f.win.screen.orientation.angle = 270;
  f.pose(40, 45, 50);
  assert.equal(tilt.getAxis(), 0, 'held at 0 while the phone swings round');
  f.hold(40, -4, 12, 60);
  assert.ok(Math.abs(tilt.getDebug().neutral + 4) < 1e-6);
  assert.equal(tilt.getAxis(), 0);
  f.hold(40, 30, 4);
  assert.ok(tilt.getAxis() > 0.5);
  // Legacy window.orientation (-90) means the same as screen.orientation.angle 270.
  delete f.win.screen.orientation;
  f.win.orientation = -90;
  f.hold(40, 30, 2);
  assert.ok(tilt.getAxis() > 0.5);
  assert.equal(tilt.getDebug().screenAngle, 270);
});

test('devicemotion gravity is preferred, its platform sign is detected, orientation is the fallback', async () => {
  // Inverted accelerometer sign (reported on some iOS builds), cross-checked against orientation.
  const f = sensorWindow();
  const tilt = createTiltController({ windowTarget: f.win });
  const ready = tilt.enable();
  for (let i = 0; i < 30; i++) f.motion(45, 0, { sign: -1, withOrientation: true });
  assert.equal(await ready, true);
  assert.equal(tilt.getDebug().source, 'motion');
  assert.equal(tilt.getDebug().motionSign, -1);
  for (let i = 0; i < 20; i++) f.motion(45, 35, { sign: -1, withOrientation: true });
  assert.ok(tilt.getAxis() > 0.6, `right turn through inverted motion: ${tilt.getAxis()}`);
  // Motion stream stops: orientation takes over.
  for (let i = 0; i < 8; i++) f.pose(45, -35, 50);
  assert.equal(tilt.getDebug().source, 'orientation');
  assert.ok(tilt.getAxis() < -0.6);
  tilt.disable();

  // Motion only, spec sign: resolved from how the screen is held.
  const m = sensorWindow();
  const onlyMotion = createTiltController({ windowTarget: m.win });
  const ok = onlyMotion.enable();
  for (let i = 0; i < 30; i++) m.motion(50, 0);
  assert.equal(await ok, true);
  assert.equal(onlyMotion.getDebug().motionSign, 1);
  for (let i = 0; i < 20; i++) m.motion(50, -30);
  assert.ok(onlyMotion.getAxis() < -0.5);
  // A flat phone on the table does not steer.
  for (let i = 0; i < 20; i++) m.motion(89, 40);
  assert.equal(onlyMotion.getAxis(), 0);
});

test('tilt-config.json values are fetched and applied without blocking the permission tap', async () => {
  const f = sensorWindow(null, { fetchConfig: { FULL_LOCK_DEG: 15, DEAD_ZONE_DEG: 1 } });
  const tilt = createTiltController({ windowTarget: f.win });
  await flush();
  const ready = tilt.enable();
  f.hold(45, 0, 5);
  assert.equal(await ready, true);
  f.hold(45, 16, 4);
  assert.ok(tilt.getAxis() > 0.99, 'full lock at the configured 15°');
  const d = sensorWindow(null, { fetchConfig: { FULL_LOCK_DEG: 15 } });
  const fixed = createTiltController({ windowTarget: d.win, config: {} });
  await flush();
  const r2 = fixed.enable();
  d.hold(45, 0, 5);
  await r2;
  d.hold(45, 16, 4);
  assert.ok(fixed.getAxis() < 0.5, 'an explicit config wins over the file');
});

test('no sensor readings and late permission promises cannot leave active controls', async () => {
  const f = sensorWindow();
  const tilt = createTiltController({ windowTarget: f.win });
  const pending = tilt.enable();
  f.timeout();
  assert.equal(await pending, false);
  f.sample(20, 20);
  assert.equal(tilt.getState().status, 'unavailable');
  let permit;
  f.win.DeviceOrientationEvent.requestPermission = () => new Promise(resolve => { permit = resolve; });
  const late = tilt.enable();
  tilt.disable();
  permit('granted');
  assert.equal(await late, false);
  f.sample(20, 20);
  assert.equal(tilt.getState().enabled, false);
});

test('fullscreen targets the whole document and exits without losing DOM controls', async () => {
  const doc = { defaultView: { screen: { orientation: {} } }, fullscreenElement: null };
  const root = { async requestFullscreen() { assert.equal(this, root); doc.fullscreenElement = root; } };
  doc.documentElement = root;
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; };
  assert.equal((await toggleMobileFullscreen(doc)).ok, true);
  assert.equal(isFullscreen(doc), true);
  assert.equal((await toggleMobileFullscreen(doc)).ok, true);
  assert.equal(isFullscreen(doc), false);
});

test('unsupported or rejected fullscreen reports fallback honestly, and Home Screen mode is recognized', async () => {
  const doc = { documentElement: {}, defaultView: {} };
  const unavailable = await toggleMobileFullscreen(doc);
  assert.equal(unavailable.ok, false);
  assert.match(unavailable.message, /Home Screen/);
  doc.documentElement.requestFullscreen = async () => { throw new Error('Denied'); };
  assert.equal((await toggleMobileFullscreen(doc)).ok, false);
  doc.defaultView.navigator = { standalone: true };
  assert.equal(isFullscreen(doc), true);
  assert.equal((await toggleMobileFullscreen(doc)).ok, true);
});
