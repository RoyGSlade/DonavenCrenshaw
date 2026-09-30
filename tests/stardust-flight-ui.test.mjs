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
  const back = decodeSettingsCode(`  ${code}\n`);
  assert.deepEqual({ minimap: back.minimap, autoFire: back.autoFire, tilt: back.tilt, cameraMode: back.cameraMode, layouts: back.layouts }, {
    minimap: settings.minimap, autoFire: false, tilt: settings.tilt, cameraMode: 'track',
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

test("behind-ship camera: the ship points up, the view eases in and back out, and the setting travels in share codes", async () => {
  const { state } = await import('../projects/Space-Shooter/state.js');
  const { updateCamera, ensureCamera, behindRotation, BEHIND } = await import('../projects/Space-Shooter/engine/systems/camera.js');
  const { flightSettings, encodeSettingsCode, decodeSettingsCode, cameraTuning, CAMERA_DEFAULTS, CAMERA_FOVS } = await import('../projects/Space-Shooter/systems/flightSettings.js');
  // Rotating a heading by behindRotation puts it at -90° (up the screen) for any ship angle.
  for (const angle of [0, 1, -2.5, Math.PI, 7]) {
    const onScreen = angle + behindRotation(angle);
    assert.ok(Math.abs(Math.cos(onScreen)) < 1e-9 && Math.sin(onScreen) < -0.999, `heading ${angle} points up`);
  }
  state.mode = 'roadmap';
  state.run = { current: { weekly: true } };
  state.gfx.canvas = { width: 844, height: 390 };
  state.gfx.cellW = state.gfx.cellH = 30;
  const cam = ensureCamera();
  const player = { x: 12, y: 7, vx: 0, vy: 9, angle: Math.PI / 2 };
  flightSettings().cameraMode = 'behind';
  for (let i = 0; i < 240; i++) updateCamera(1 / 60, player);
  assert.ok(Math.abs(Math.sin(cam.viewRot - behindRotation(player.angle))) < 1e-3, 'view settles on the ship heading');
  assert.equal(cam.x, player.x); assert.equal(cam.y, player.y);
  const tune = cameraTuning();
  assert.ok(cam.anchorY > tune.distance && cam.anchorY <= tune.distance + BEHIND.SPEED_PULL, `ship sits low on the screen (${cam.anchorY})`);
  // Stiffness 1: the camera does not pull back or widen with speed. Distance moves the ship.
  const looseZoom = cam.zoom;
  flightSettings().camera = { ...CAMERA_DEFAULTS, stiffnessIndex: 4, distanceIndex: 5 };
  for (let i = 0; i < 600; i++) updateCamera(1 / 60, player);
  assert.ok(Math.abs(cam.anchorY - 0.84) < 1e-3, `stiff camera holds its distance (${cam.anchorY})`);
  assert.ok(cam.zoom > looseZoom, 'stiff camera does not widen with speed');
  // Field of view: a wider view is a smaller zoom, in both camera modes.
  const stiffZoom = cam.zoom;
  flightSettings().camera = { ...CAMERA_DEFAULTS, stiffnessIndex: 4, distanceIndex: 5, fovIndex: CAMERA_FOVS.length - 1 };
  for (let i = 0; i < 600; i++) updateCamera(1 / 60, player);
  assert.ok(Math.abs(cam.zoom / stiffZoom - 1 / CAMERA_FOVS.at(-1)) < 1e-3, 'field of view scales the zoom');
  flightSettings().camera = { ...CAMERA_DEFAULTS };
  for (let i = 0; i < 600; i++) updateCamera(1 / 60, player);
  // One frame never snaps the view: a quarter turn takes several frames.
  player.angle += Math.PI / 2;
  const before = cam.viewRot;
  updateCamera(1 / 60, player);
  const moved = Math.abs(Math.atan2(Math.sin(cam.viewRot - before), Math.cos(cam.viewRot - before)));
  assert.ok(moved > 0.01 && moved < 0.4, 'rotation is eased (' + moved + ')');
  // Back to the track view: upright and centred again.
  flightSettings().cameraMode = 'track';
  for (let i = 0; i < 600; i++) updateCamera(1 / 60, player);
  assert.equal(cam.viewRot, 0);
  assert.ok(Math.abs(cam.anchorY - 0.5) < 1e-3);
  // Share codes: the camera travels; codes from before the setting leave it alone.
  assert.equal(decodeSettingsCode(encodeSettingsCode({ ...flightSettings(), cameraMode: 'behind' })).cameraMode, 'behind');
  assert.equal(decodeSettingsCode(encodeSettingsCode({ ...flightSettings(), cameraMode: 'track' })).cameraMode, 'track');
  assert.equal('cameraMode' in decodeSettingsCode(`SD1-${btoa(JSON.stringify({ v: 1, m: [0, 0, 0], a: 1, t: [0, 0, 0], l: {} }))}`), false);
});

test("key bindings: defaults match the old keys, a rebind steals from its old action, junk is repaired", async () => {
  const K = await import('../projects/Space-Shooter/systems/keybinds.js');
  const d = K.defaultBinds();
  // The keys the game has always used.
  assert.deepEqual(d.keys.thrust, ['w', 'ArrowUp']);
  assert.deepEqual(d.keys.shoot, ['Control', 'Mouse0']);
  assert.deepEqual(d.keys.launch, ['Space']);
  assert.deepEqual([d.pad.launch, d.pad.boostToggle, d.pad.boostHold, d.pad.brake, d.pad.shoot, d.pad.pause, d.pad.fullscreen, d.pad.minimap], [0, 3, 4, 5, 7, 8, 9, 13]);
  // Tokens from events.
  assert.equal(K.keyToken({ key: 'W' }), 'w');
  assert.equal(K.keyToken({ key: ' ' }), 'Space');
  assert.equal(K.keyToken({ key: 'ArrowLeft' }), 'ArrowLeft');
  assert.equal(K.keyToken({ key: 'Dead' }), null);
  assert.equal(K.mouseToken(2), 'Mouse2');
  assert.equal(K.mouseToken(9), null);
  assert.equal(K.isKeyToken('Escape'), false, 'Escape always pauses');
  // Binding X to boost takes it from brake.
  const r = K.bindKey(d, 'boost', 1, 'x');
  assert.equal(r.took, 'brake');
  assert.deepEqual(r.binds.keys.boost, ['Shift', 'x']);
  assert.deepEqual(r.binds.keys.brake, []);
  assert.deepEqual(d.keys.brake, ['x'], 'the input is not mutated');
  // Replacing a slot, clearing one, and moving a key inside the same action.
  assert.deepEqual(K.bindKey(d, 'thrust', 0, 'i').binds.keys.thrust, ['i', 'ArrowUp']);
  assert.deepEqual(K.clearKey(d, 'thrust', 0).keys.thrust, ['ArrowUp']);
  assert.deepEqual(K.bindKey(d, 'thrust', 0, 'ArrowUp').binds.keys.thrust, ['ArrowUp']);
  assert.equal(K.bindKey(d, 'boost', 0, 'Escape').binds.keys.boost[0], 'Shift', 'a reserved key is refused');
  // Mouse buttons are actions, never steering: there is no axis to bind.
  assert.deepEqual(K.bindKey(d, 'boost', 1, 'Mouse2').binds.keys.boost, ['Shift', 'Mouse2']);
  // Controller: one button, one action.
  const p = K.bindPad(d, 'thrust', 7);
  assert.equal(p.took, 'shoot');
  assert.equal(p.binds.pad.thrust, 7);
  assert.equal(p.binds.pad.shoot, null);
  assert.equal(K.bindPad(d, 'brake', 99).binds.pad.brake, 5, 'an impossible button is refused');
  // Hand-edited or hostile saved data comes back complete and valid.
  const fixed = K.normalizeBinds({ keys: { thrust: ['w', 'w', '<script>', 5, 'Escape', 'k', 'j'], nope: ['z'] }, pad: { launch: 3, boostToggle: 3, brake: 'x' }, sticks: 'sideways' });
  assert.deepEqual(fixed.keys.thrust, ['w', 'k']);
  assert.deepEqual(fixed.keys.left, ['a', 'ArrowLeft']);
  assert.equal('nope' in fixed.keys, false);
  assert.equal(fixed.pad.launch, 3);
  assert.equal(fixed.pad.boostToggle, null, 'a duplicated button keeps its first use');
  assert.equal(fixed.pad.brake, 5);
  assert.equal(fixed.sticks, 'split');
  assert.match(K.keyHint(d), /^W thrust · S reverse · A turn left/);
});

test("bindings and camera tuning travel in share codes; older codes leave them alone", async () => {
  const F = await import('../projects/Space-Shooter/systems/flightSettings.js');
  const K = await import('../projects/Space-Shooter/systems/keybinds.js');
  let b = K.bindKey(K.defaultBinds(), 'boost', 0, 'Mouse2').binds;
  b = K.bindPad(b, 'thrust', 7).binds;
  b.sticks = 'left-turn';
  const settings = { minimap: { show: false, zoomIndex: 0, iconIndex: 2 }, autoFire: true, cameraMode: 'behind', tilt: { ...F.TILT_DEFAULTS }, camera: { fovIndex: 4, distanceIndex: 0, stiffnessIndex: 3, swivelIndex: 5, transitionIndex: 0 }, binds: b, layouts: {} };
  const back = F.decodeSettingsCode(F.encodeSettingsCode(settings));
  assert.deepEqual(back.camera, settings.camera);
  assert.deepEqual(back.binds, b);
  // Default bindings add nothing to the code.
  const plain = F.encodeSettingsCode({ ...settings, binds: K.defaultBinds() });
  assert.ok(plain.length < F.encodeSettingsCode(settings).length);
  assert.deepEqual(F.decodeSettingsCode(plain).binds, K.defaultBinds());
  // A code from before these settings existed.
  const old = F.decodeSettingsCode(`SD1-${btoa(JSON.stringify({ v: 1, m: [0, 0, 0], a: 1, t: [0, 0, 0], l: {} }))}`);
  assert.equal('camera' in old, false);
  assert.equal('binds' in old, false);
  // Out-of-range camera steps refuse the whole code; junk bindings fall back to defaults.
  assert.equal(F.decodeSettingsCode(`SD1-${btoa(JSON.stringify({ v: 1, m: [0, 0, 0], a: 1, t: [0, 0, 0], l: {}, cs: [99, 0, 0, 0, 0] }))}`), null);
  const junk = F.decodeSettingsCode(`SD1-${btoa(JSON.stringify({ v: 1, m: [0, 0, 0], a: 1, t: [0, 0, 0], l: {}, cs: [0, 0, 0, 0, 0], k: { thrust: ['<img>', 'Escape'], evil: ['x'] }, g: { launch: -4 }, s: 9 }))}`);
  assert.deepEqual(junk.binds.keys.thrust, []);
  assert.equal(junk.binds.pad.launch, 0);
  assert.equal(junk.binds.sticks, 'split');
});
