import test from "node:test";
import assert from "node:assert/strict";
import {
  createGamepadReader,
  gamepadMapping,
} from "../projects/Space-Shooter/systems/gamepad.js";
const pad = (index = 0, axes = [0, 0, 0, 0], pressed = {}) => ({
  index,
  connected: true,
  mapping: "standard",
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: !!pressed[i],
    value: pressed[i] ?? 0,
  })),
});
test("exact solo mapping yields analog thrust, reverse, strafe, turn and combat", () => {
  const r = createGamepadReader(),
    p = pad(0, [0.5, -0.75, -0.4], {
      4: 1,
      5: 1,
      7: 0.6,
      0: 1,
      8: 1,
      9: 1,
      13: 1,
    });
  const c = r.poll([p]);
  assert.equal(c.thrustStrength, 0.75);
  assert.equal(c.strafe, 0.3);
  assert.equal(c.turnStrength, -0.4);
  for (const k of [
    "boost",
    "brake",
    "shoot",
    "launchEdge",
    "pauseEdge",
    "fullscreenEdge",
    "minimapEdge",
  ])
    assert.equal(c[k], true, k);
  assert.equal(r.poll([p]).launchEdge, false);
  p.axes[1] = 0.5;
  const reverse = r.poll([p]);
  assert.equal(reverse.backStrength, 0.3);
  assert.equal(reverse.thrust, false);
  assert.deepEqual(gamepadMapping.BUTTONS.MINIMAP_TOGGLE, [13]);
});
test("deadzone and finite clamps reject malformed analog values", () => {
  const r = createGamepadReader();
  let c = r.poll([pad(0, [0.19, -0.19, NaN], { 7: 0.07 })]);
  assert.equal(c.turnStrength, 0);
  assert.equal(c.thrustStrength, 0);
  assert.equal(c.strafe, 0);
  assert.equal(c.shoot, false);
  c = r.poll([pad(0, [9, -8, Infinity], { 7: 2 })]);
  assert.equal(c.strafe, 0.6);
  assert.equal(c.thrustStrength, 1);
  assert.equal(c.turnStrength, 0);
  assert.equal(c.shoot, true);
});
test("first connected pad remains selected across hotplug and reconnect must neutralize", () => {
  const r = createGamepadReader(),
    p = pad(2, [0, -1, 0]),
    other = pad(5, [0, 1, 0]);
  assert.equal(r.poll([null, null, p]).thrust, true);
  assert.equal(r.getState().index, 2);
  assert.equal(r.poll([other, null, p]).thrust, true);
  r.disconnect(2);
  assert.equal(r.poll([other]).thrustBack, false);
  assert.equal(r.getState().index, 5);
  other.axes = [0, 0, 0];
  r.poll([other]);
  other.axes[1] = 1;
  assert.equal(r.poll([other]).backStrength, 0.6);
});
test("Y toggles only on edges; blur or hidden clears toggle and blocks held controls until neutral", () => {
  for (const mode of ["suspend", "inactive"]) {
    const r = createGamepadReader(),
      p = pad(0, undefined, { 3: 1 });
    assert.equal(r.poll([p]).boost, true);
    assert.equal(r.poll([p]).boost, true);
    if (mode === "suspend") r.suspend();
    else r.poll([p], { active: false });
    assert.equal(r.poll([p]).boost, false);
    assert.equal(r.getState().boostToggle, false);
    p.buttons[3] = { value: 0, pressed: false };
    r.poll([p]);
    assert.equal(r.poll([p]).boost, false);
    p.buttons[3] = { value: 1, pressed: true };
    assert.equal(r.poll([p]).boost, true);
  }
});
test("missing pad polling also clears toggle and blocks reconnection while pressed", () => {
  const r = createGamepadReader(),
    p = pad(0, undefined, { 3: 1 });
  r.poll([p]);
  r.poll([]);
  assert.equal(r.poll([p]).boost, false);
  p.buttons[3] = { value: 0, pressed: false };
  r.poll([p]);
  p.buttons[4] = { value: 1, pressed: true };
  assert.equal(r.poll([p]).boost, true);
});

test('paused reader preserves menu edges and suppresses gameplay including LT trap',()=>{
 const r=createGamepadReader(),p=pad(0,[.5,-1,.5],{0:1,3:1,4:1,6:1,7:1,8:1,9:1});
 const c=r.poll([p],{gameplayActive:false});
 assert.equal(c.pauseEdge,true);assert.equal(c.fullscreenEdge,true);
 for(const key of ['launchEdge','boost','trap','shoot','thrust'])assert.equal(c[key],false);
 assert.equal(r.getState().boostToggle,false);
 assert.equal(r.poll([pad()],{gameplayActive:true}).boost,false);
});

test("player bindings: remapped buttons, thrust on a trigger, swapped sticks, camera switch", () => {
  const pad = (buttons = {}, axes = [0, 0, 0, 0]) => ({ index: 0, connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!buttons[i], value: typeof buttons[i] === 'number' ? buttons[i] : buttons[i] ? 1 : 0 })) });
  let bindings = { pad: { launch: 0, boostToggle: 3, boostHold: 4, brake: 1, shoot: 5, thrust: 7, thrustBack: 6, camera: 2, minimap: 13, pause: 8, fullscreen: 9 }, sticks: 'left-turn' };
  const r = createGamepadReader({ getBindings: () => bindings });
  r.poll([pad()]);
  // Right trigger half down = half thrust; B brakes; RB fires; the old brake button does nothing.
  let out = r.poll([pad({ 7: 0.5, 1: true, 5: true })]);
  assert.equal(out.thrust, true);
  assert.equal(out.thrustStrength, 0.5);
  assert.equal(out.brake, true);
  assert.equal(out.shoot, true);
  // Left trigger reverses at the usual 60%.
  out = r.poll([pad({ 6: 1 })]);
  assert.ok(Math.abs(out.backStrength - 0.6) < 1e-9);
  assert.equal(out.trap, false, 'a rebound button no longer fires its fixed action');
  // Swapped sticks: the left stick turns, the right stick strafes.
  out = r.poll([pad({}, [0.8, 0, -0.7, 0])]);
  assert.equal(out.turnStrength, 0.8);
  assert.equal(out.strafeLeft, true);
  assert.equal(out.turnRight, true);
  // Camera switch is an edge: once per press.
  assert.equal(r.poll([pad({ 2: true })]).cameraEdge, true);
  assert.equal(r.poll([pad({ 2: true })]).cameraEdge, false);
  // Bindings are read live.
  bindings = { pad: { ...bindings.pad, camera: null, launch: 2 }, sticks: 'split' };
  r.poll([pad()]);
  out = r.poll([pad({ 2: true }, [0.8, 0, 0, 0])]);
  assert.equal(out.launchEdge, true);
  assert.equal(out.cameraEdge, false);
  assert.equal(out.strafeRight, true);
  assert.equal(out.turnStrength, 0);
});
