import test from 'node:test';
import assert from 'node:assert/strict';
import { createControllerSelector } from '../projects/Space-Shooter/systems/controllerDevices.js';
import { createGamepadReader } from '../projects/Space-Shooter/systems/gamepad.js';
import { CONTROLLER_DEFAULTS, normalizeControllerTuning, controllerAxis } from '../projects/Space-Shooter/systems/controllerTuning.js';
import { encodeSettingsCode, decodeSettingsCode } from '../projects/Space-Shooter/systems/flightSettings.js';
const pad = (index, id, axes = [0, 0, 0, 0], down = {}) => ({ index, id, connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ value: down[i] || 0, pressed: down[i] >= 0.5 })) });

test('a deliberate second-device press wins over idle/virtual first device and stays selected', () => {
  const selector = createControllerSelector(), idle = pad(0, 'Virtual'), active = pad(2, 'USB');
  assert.equal(selector.poll([idle, null, active]).pad.index, 0);
  active.buttons[0] = { pressed: true, value: 1 };
  assert.equal(selector.poll([idle, null, active]).pad.index, 2);
  idle.buttons[0] = { pressed: true, value: 1 };
  assert.equal(selector.poll([idle, active]).pad.index, 2, 'another controller cannot steal an activated device');
  const fresh = pad(2, 'USB', [0.6, 0, 0, 0]);
  assert.equal(selector.poll([idle, fresh]).pad.axes[0], 0.6, 'browser snapshots are refreshed');
});

test('explicit device choice persists by identity, survives index changes, and never falls back when missing', () => {
  let saved;
  const selector = createControllerSelector({ save: p => { saved = p; } });
  const chosen = pad(2, 'USB'); selector.select(chosen);
  assert.deepEqual(saved, { index: 2, id: 'USB' });
  assert.equal(selector.poll([pad(0, 'Virtual')]).pad, null);
  assert.equal(selector.poll([pad(3, 'USB'), pad(0, 'Virtual')]).pad.index, 3);
  const reopened = createControllerSelector({ preference: saved });
  assert.equal(reopened.poll([pad(0, 'Virtual'), pad(5, 'USB')]).pad.index, 5);
  assert.equal(reopened.poll([pad(2, 'Other')]).pad, null, 'reused slot is not the chosen device');
  selector.select(null);
  assert.equal(saved, null);
  assert.equal(selector.poll([pad(0, 'Virtual'), pad(1, 'USB', undefined, { 0: 1 })]).pad.index, 1);
});

test('shared selection, live tuning, neutral safety and actionable blockers agree', () => {
  const selector = createControllerSelector(), idle = pad(0, 'Virtual'), p = pad(2, 'USB', [0.24, 0, -0.25, 0], { 7: 0.12 });
  selector.select(p);
  let snapshot = selector.poll([idle, p]), tuning = { ...CONTROLLER_DEFAULTS };
  const reader = createGamepadReader({ getPad: () => snapshot.pad, getRevision: () => snapshot.revision, getTuning: () => tuning });
  assert.equal(reader.poll().shoot, false);
  assert.equal(reader.getState().awaitingNeutral, true);
  assert.deepEqual(reader.getState().blocking, ['Left stick', 'Right stick', 'Fire button / trigger']);
  tuning = { stickDeadzone: 0.3, triggerDeadzone: 0.15, sensitivity: 2 };
  reader.poll();
  assert.equal(reader.getState().awaitingNeutral, false, 'resting drift within configured deadzones is neutral');
  p.axes[2] = -0.5;
  assert.equal(reader.poll().turnStrength, -Math.sqrt(0.5));
  reader.suspend();
  assert.equal(reader.poll().turnStrength, 0, 'focus loss never replays held input');
  p.axes[2] = 0; reader.poll();
  p.axes[2] = -0.5; assert.equal(reader.poll().turnLeft, true);
  snapshot = selector.poll([idle]); assert.equal(reader.poll().turnStrength, 0);
  snapshot = selector.poll([idle, p]); assert.equal(reader.poll().turnStrength, 0, 'held reconnect is blocked');
  p.axes[2] = 0; reader.poll(); p.axes[2] = 1;
  assert.equal(reader.poll().turnStrength, 1);
});

test('response curve keeps default parity, signs, full travel, inclusive deadzone and finite bounds', () => {
  assert.equal(controllerAxis(0.2), 0);
  assert.equal(controllerAxis(-0.5), -0.5);
  for (const sensitivity of [0.5, 1, 2]) {
    const tuning = normalizeControllerTuning({ sensitivity });
    assert.equal(controllerAxis(1, tuning), 1);
    assert.equal(controllerAxis(-1, tuning), -1);
    assert.equal(controllerAxis(NaN, tuning), 0);
  }
  assert.ok(controllerAxis(0.5, { ...CONTROLLER_DEFAULTS, sensitivity: 0.5 }) < 0.5);
  assert.ok(controllerAxis(0.5, { ...CONTROLLER_DEFAULTS, sensitivity: 2 }) > 0.5);
  assert.deepEqual(normalizeControllerTuning({ stickDeadzone: 9, triggerDeadzone: -2, sensitivity: NaN }), { stickDeadzone: 0.45, triggerDeadzone: 0, sensitivity: 1 });
});

test('nonstandard mappings expose diagnostics but cannot drive standard flight', () => {
  let p = pad(0, 'Generic', [1, -1, 1, 0], { 0: 1, 7: 1 }); p.mapping = '';
  const r = createGamepadReader({ getPad: () => p });
  assert.equal(r.poll().thrust, false);
  assert.equal(r.getState().unsupported, true);
  p = pad(0, 'Generic'); r.poll(); p.axes[1] = -1;
  assert.equal(r.poll().thrust, true);
});

test('tuning travels in share codes; old codes retain local tuning; device IDs are excluded', () => {
  const settings = { minimap: { show: true, zoomIndex: 0, iconIndex: 2 }, controller: { stickDeadzone: 0.32, triggerDeadzone: 0.15, sensitivity: 1.6 }, tilt: {}, layouts: {}, selectedDevice: { id: 'private-usb-id' } };
  const code = encodeSettingsCode(settings);
  assert.deepEqual(decodeSettingsCode(code).controller, settings.controller);
  const data = JSON.parse(atob(code.slice(4).replace(/-/g, '+').replace(/_/g, '/')));
  assert.ok(!JSON.stringify(data).includes('private-usb-id'));
  delete data.ct;
  assert.equal(decodeSettingsCode(`SD1-${btoa(JSON.stringify(data))}`).controller, undefined);
  data.ct = [0.3, 'junk', 2];
  assert.equal(decodeSettingsCode(`SD1-${btoa(JSON.stringify(data))}`), null);
});
