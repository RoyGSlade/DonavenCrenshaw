import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiltController, computeTurnAxis, screenTiltDegrees, toggleMobileFullscreen, isFullscreen } from '../projects/Space-Shooter/systems/mobileControls.js';

function sensorWindow(permission) {
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
  return { win, advance: ms => { clock += ms; }, timeout: () => timeout?.(),
    sample(beta, gamma) {
      clock += 100;
      win.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }));
    } };
}

test('tilt curves reject bad readings and map portrait and either landscape orientation', () => {
  for (const value of [NaN, Infinity, null, undefined]) assert.equal(computeTurnAxis(value), 0);
  assert.equal(computeTurnAxis(2), 0);
  assert.equal(computeTurnAxis(24), 1);
  assert.equal(computeTurnAxis(-24), -1);
  assert.equal(screenTiltDegrees({ beta: 10, gamma: 20 }, 0), 20);
  assert.ok(Math.abs(screenTiltDegrees({ beta: 10, gamma: 20 }, 90) - 10) < 1e-8);
  assert.ok(Math.abs(screenTiltDegrees({ beta: 10, gamma: 20 }, 270) + 10) < 1e-8);
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
});

test('tilt waits for real readings, calibrates, recenters, zeros stale input and recalibrates after rotation/blur', async () => {
  const f = sensorWindow();
  const tilt = createTiltController({ windowTarget: f.win });
  const ready = tilt.enable();
  assert.equal(tilt.getState().enabled, false);
  f.sample(10, 15);
  assert.equal(await ready, true);
  assert.equal(tilt.getAxis(), 0);
  f.sample(10, 39);
  assert.ok(tilt.getAxis() > 0.7);
  f.advance(351);
  assert.equal(tilt.getAxis(), 0);
  assert.equal(tilt.calibrate(), true);
  f.sample(10, 30);
  assert.equal(tilt.getAxis(), 0);
  f.sample(10, 6);
  assert.ok(tilt.getAxis() < -0.7);
  f.win.screen.orientation.angle = 90;
  f.sample(40, 10);
  assert.equal(tilt.getAxis(), 0);
  f.sample(64, 10);
  assert.ok(tilt.getAxis() > 0.7);
  f.win.dispatchEvent(new Event('blur'));
  assert.equal(tilt.getAxis(), 0);
  f.sample(64, 10);
  assert.equal(tilt.getAxis(), 0);
  f.win.document.hidden = true;
  f.win.document.dispatchEvent(new Event('visibilitychange'));
  f.sample(90, 10);
  assert.equal(tilt.getAxis(), 0);
  tilt.disable();
  assert.equal(tilt.getState().enabled, false);
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
