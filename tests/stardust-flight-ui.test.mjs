// The new flight UI's pure parts: joystick and wheel math, auto fire, the
// race intro plan and the widget layouts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stickToDrive, wheelToTurn, TOUCH_TUNING } from '../projects/Space-Shooter/ui/touchPad.js';
import { wantsAutoFire, AUTOFIRE } from '../projects/Space-Shooter/systems/autofire.js';
import { planIntro, introKey } from '../projects/Space-Shooter/ui/raceIntro.js';
import { DEFAULT_LAYOUTS, currentLayout } from '../projects/Space-Shooter/ui/layoutEditor.js';
import { createLevelLayout } from '../projects/Space-Shooter/data.js';

test('joystick: up thrusts, down reverses, sideways strafes, with a dead zone and analog strength', () => {
  assert.deepEqual(stickToDrive(0, 0), { thrust: 0, back: 0, strafe: 0 });
  assert.deepEqual(stickToDrive(0.05, -0.05), { thrust: 0, back: 0, strafe: 0 }, 'inside the dead zone');
  const up = stickToDrive(0, -1);
  assert.equal(up.thrust, 1);
  assert.equal(up.back, 0);
  const half = stickToDrive(0, -0.56);
  assert.ok(half.thrust > 0.45 && half.thrust < 0.55, `half push ≈ half thrust (${half.thrust})`);
  const down = stickToDrive(0, 1);
  assert.equal(down.thrust, 0);
  assert.equal(down.back, TOUCH_TUNING.REVERSE_MAX);
  assert.ok(stickToDrive(1, 0).strafe === TOUCH_TUNING.STRAFE_MAX && stickToDrive(-1, 0).strafe === -TOUCH_TUNING.STRAFE_MAX);
  const diag = stickToDrive(0.7, -0.7);
  assert.ok(diag.thrust > 0.6 && diag.strafe > 0.3, 'diagonal thrusts and strafes together');
});

test('wheel: rotation to turn, symmetric, dead zone, full lock at 90°', () => {
  assert.equal(wheelToTurn(0), 0);
  assert.equal(wheelToTurn(TOUCH_TUNING.WHEEL_DEAD_DEG - 0.5), 0);
  assert.equal(wheelToTurn(TOUCH_TUNING.WHEEL_FULL_DEG), 1);
  assert.equal(wheelToTurn(-TOUCH_TUNING.WHEEL_FULL_DEG), -1);
  assert.equal(wheelToTurn(130), 1);
  assert.equal(wheelToTurn(45), -wheelToTurn(-45));
  assert.ok(wheelToTurn(30) < wheelToTurn(60));
});

test('auto fire: only at breakable targets ahead of the nose, never at mines', () => {
  const player = { x: 0, y: 0, angle: 0 };
  const rock = (x, y, extra = {}) => ({ x, y, radius: 0.8, hp: 100, destructible: true, ...extra });
  const scene = (hazards, more = {}) => ({ player, hazards, drones: [], ...more });
  assert.ok(wantsAutoFire(scene([rock(5, 0)])), 'dead ahead');
  assert.ok(!wantsAutoFire(scene([rock(-5, 0)])), 'behind');
  assert.ok(!wantsAutoFire(scene([rock(5, 4)])), 'well off to the side');
  assert.ok(!wantsAutoFire(scene([rock(AUTOFIRE.RANGE + 2, 0)])), 'out of range');
  assert.ok(!wantsAutoFire(scene([rock(5, 0, { hp: 0 })])), 'already destroyed');
  assert.ok(!wantsAutoFire(scene([], { mines: [{ x: 5, y: 0, radius: 0.42 }] })), 'mines are not targets');
  assert.ok(wantsAutoFire(scene([], { drones: [{ x: 4, y: 0.2, radius: 0.48, hp: 100, state: 'patrol' }] })), 'drones are targets');
  assert.ok(!wantsAutoFire(scene([rock(5, 0)], { lockedInStart: true })), 'not on the grid');
  assert.ok(!wantsAutoFire(scene([rock(5, 0)]), { ...player, isOverheated: true }), 'not while overheated');
});

test('race intro: a flythrough only the first time, only on a full countdown', () => {
  const layout = createLevelLayout(1);
  const scene = { track: layout.track, levelInfo: { title: layout.title }, level: 1 };
  assert.equal(introKey(scene), 'track:Alpha Relay');
  const first = planIntro(scene, 3.5);
  assert.ok(first.fly && first.flyDur >= 3 && first.flyDur <= 6);
  assert.equal(first.total, first.flyDur + 3.5);
  const retry = planIntro(scene, 1.5);
  assert.ok(!retry.fly, 'a quick retry is just READY / SET / GO');
  assert.equal(retry.total, 1.5);
  assert.ok(!planIntro({}, 3.5).fly, 'the arena has no track to fly');
});

test('default layouts keep every widget on screen and the touch controls apart', () => {
  for (const [mode, layout] of Object.entries(DEFAULT_LAYOUTS)) {
    for (const [id, spot] of Object.entries(layout)) {
      assert.ok(spot.x > 0 && spot.x < 1 && spot.y > 0 && spot.y < 1 && spot.s > 0, `${mode}/${id} on screen`);
    }
  }
  const touch = DEFAULT_LAYOUTS['touch-landscape'];
  assert.ok(touch.stick.x < 0.5 && touch.wheel.x > 0.5, 'joystick left, wheel right');
  assert.ok(touch.gauges.x < 0.5 && touch.gauges.y < 0.3, 'gauges top-left');
  assert.ok(touch.settings.x > 0.9 && touch.settings.y < 0.2, 'settings top-right');
  assert.deepEqual(Object.keys(currentLayout('desktop')).sort(), Object.keys(DEFAULT_LAYOUTS.desktop).sort());
});

test("settings share code: round trip, and junk or hostile codes are refused or clamped", async () => {
  const { encodeSettingsCode, decodeSettingsCode } = await import('../projects/Space-Shooter/systems/flightSettings.js');
  const settings = {
    minimap: { show: true, zoomIndex: 2, iconIndex: 4 }, autoFire: false, introSeen: { 'weekly-01': true },
    tilt: { deadIndex: 5, maxIndex: 1, sensIndex: 6 },
    layouts: { 'touch-landscape': { stick: { x: 0.12, y: 0.74, s: 1.3 }, wheel: { x: 0.861, y: 0.72, s: 0.9 } }, desktop: null },
  };
  const code = encodeSettingsCode(settings);
  assert.match(code, /^SD1-[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSettingsCode(`  ${code}\n`), {
    minimap: settings.minimap, autoFire: false, tilt: settings.tilt,
    layouts: { 'touch-landscape': { stick: { x: 0.12, y: 0.74, s: 1.3 }, wheel: { x: 0.861, y: 0.72, s: 0.9 } } },
  });
  // introSeen is personal and never travels in a code.
  assert.ok(!atob(code.slice(4).replace(/-/g, '+').replace(/_/g, '/')).includes('weekly-01'));
  const forge = (data) => `SD1-${btoa(JSON.stringify(data))}`;
  for (const bad of [null, '', 'hello', 'SD1-', 'SD1-!!!', 'SD2-abcd', forge({ v: 2 }), forge({ v: 1, m: [1, 99, 0], t: [0, 0, 0] }), forge({ v: 1, m: [1, 0, 0], t: [0, 0, 'x'] }), `SD1-${'A'.repeat(7000)}`])
    assert.equal(decodeSettingsCode(bad), null, `refused: ${String(bad).slice(0, 20)}`);
  // Bad widgets are dropped; good ones in the same code survive.
  const mixed = decodeSettingsCode(forge({ v: 1, m: [0, 0, 0], a: 1, t: [0, 0, 0], l: { p: { stick: [500, 500, 1000], 'BAD ID': [1, 1, 1000], wheel: [5000, 1, 1000], boost: [1, 1, 99999] }, zz: { stick: [1, 1, 1000] } } }));
  assert.deepEqual(mixed.layouts, { 'touch-portrait': { stick: { x: 0.5, y: 0.5, s: 1 } } });
});
