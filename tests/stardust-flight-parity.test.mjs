import test from 'node:test';
import assert from 'node:assert/strict';
import { state, config } from '../projects/Space-Shooter/state.js';
import { handlePlayerMovement } from '../projects/Space-Shooter/engine/systems/movement.js';
import { rechargeBoost } from '../projects/Space-Shooter/engine/systems/flight.js';
import { createMatch, stepMatch, snapshot, NEUTRAL } from '../projects/Space-Shooter/dogfight/simulation.js';
import { inputControls, cleanSnapshot } from '../projects/Space-Shooter/dogfight/protocol.js';

test('Dogfight matches solo movement and resources through analog controls, inertia, boost and depleted braking', () => {
  state.mode = 'arena';
  state.ui.countdownActive = false;
  const match = createMatch();
  match.phase = 'playing';
  match.countdown = 0;
  match.obstacles = [];
  const pilot = { x: 20, y: 12, vx: 0, vy: 0, angle: 0, angVel: 0, _boostCd: 0 };
  const scene = { fuel: Infinity, boost: 3, flux: 30, launched: true, startPos: { x: 20, y: 12 } };
  const sequence = [
    [90, { thrust: true, thrustStrength: .65, turn: .45 }],
    [45, { reverse: true, backStrength: .32, strafe: -.4 }],
    [45, { strafe: .6, turn: -.75 }],
    [180, { boost: true, thrust: true, thrustStrength: 1 }],
    [240, { brake: true }],
    [240, {}],
  ];
  for (const [frames, command] of sequence) {
    if (command.brake) scene.flux = match.ships[0].flux = .2;
    const input = { ...NEUTRAL, ...command };
    for (let frame = 0; frame < frames; frame++) {
      // Recenter both ships without changing momentum; arena collisions are mode-specific.
      Object.assign(pilot, { x: 20, y: 12 });
      Object.assign(match.ships[0], { x: 20, y: 12 });
      Object.assign(state.keys, {
        left: false, right: false, launch: false,
        turnStrength: input.turn,
        thrustStrength: input.thrustStrength ?? 0,
        backStrength: input.backStrength ?? 0,
        strafeStrength: Math.abs(input.strafe || 0),
        strafeLeft: input.strafe < 0, strafeRight: input.strafe > 0,
        boost: input.boost, brake: input.brake,
      });
      for (let substep = 0; substep < 2; substep++) {
        rechargeBoost(scene, 1 / 120, config);
        handlePlayerMovement(1 / 120, scene, pilot);
      }
      stepMatch(match, [input, NEUTRAL]);
      const duel = match.ships[0];
      for (const key of ['x', 'y', 'vx', 'vy', 'angle', 'angVel', '_boostCd'])
        assert.equal(duel[key], pilot[key], `${key}, command ${JSON.stringify(command)}, frame ${frame}`);
      assert.equal(duel.flux, scene.flux);
      assert.equal(duel.boost, scene.boost);
      assert.ok(cleanSnapshot(snapshot(match), 1), 'continuous angular state remains serializable');
      if (command.brake && frame > 0) assert.equal(scene.flux, 0, 'braking exhausts the remaining flux');
    }
  }
});

test('relay retains analog precision and rejects malformed control and resource ranges', () => {
  const analog = { ...NEUTRAL, thrust: true, thrustStrength: .37, reverse: true, backStrength: .23, strafe: -.49 };
  const parsed = inputControls(analog);
  assert.equal(parsed.thrustStrength, .37);
  assert.equal(parsed.backStrength, .23);
  assert.equal(parsed.strafe, -.49);
  for (const [key, invalid] of Object.entries({ thrustStrength: [-.01, 1.01, NaN, Infinity, '1'], backStrength: [-.01, .61, NaN], strafe: [-.61, .61, NaN] }))
    for (const value of invalid) assert.equal(inputControls({ ...analog, [key]: value }), null);
  assert.equal(inputControls({ ...NEUTRAL, thrust: true }).thrustStrength, 1);
  assert.equal(inputControls({ ...NEUTRAL, reverse: true }).backStrength, .6);
  for (const [key, value] of Object.entries({ flux: 101, boost: 3.01, heat: 101, boostCooldown: .251, isOverheated: 1 })) {
    const data = snapshot(createMatch());
    data.ships[0][key] = value;
    assert.equal(cleanSnapshot(data, 1), null);
  }
});

test('Dogfight primary fire matches solo cadence, heat and moving projectile trajectories', async () => {
  // The real solo wrapper also emits HUD/audio effects; keep those inert in this physics test.
  globalThis.document = { getElementById: () => null };
  const { handleShooting, handleOverheat, updateProjectiles } = await import('../projects/Space-Shooter/engine/systems/projectiles.js');
  state.mode = 'arena';
  state.ui.countdownActive = false;
  state.gfx.projectiles = [];
  const match = createMatch();
  match.phase = 'playing';
  match.obstacles = [];
  Object.assign(match.ships[0], { x: 10, y: 8, vx: 1.3, vy: .7, angle: .4 });
  const pilot = { ...match.ships[0] };
  const scene = { fuel: Infinity, flux: 30, boost: 3, launched: true };
  Object.assign(state.keys, {
    left: false, right: false, launch: false, turnStrength: 0,
    thrustStrength: 0, backStrength: 0, strafeStrength: 0,
    strafeLeft: false, strafeRight: false, boost: false, brake: false, shoot: true,
  });
  for (let frame = 0; frame < 180; frame++) {
    for (let substep = 0; substep < 2; substep++) {
      rechargeBoost(scene, 1 / 120);
      handlePlayerMovement(1 / 120, scene, pilot);
      handleShooting(1 / 120, pilot);
      handleOverheat(1 / 120, pilot);
      updateProjectiles(1 / 120);
    }
    stepMatch(match, [{ ...NEUTRAL, fire: true }, NEUTRAL]);
    assert.equal(match.ships[0].heat, pilot.heat);
    assert.equal(match.ships[0].isOverheated, pilot.isOverheated);
    assert.equal(match.ships[0].shootCooldown, pilot.shootCooldown);
    const trajectory = ({ x, y, vx, vy, life }) => ({ x, y, vx, vy, life });
    assert.deepEqual(match.bullets.map(trajectory), state.gfx.projectiles.map(trajectory));
  }
  assert.equal(pilot.isOverheated, true, 'exercise actual overheat, not just the first shot');
  state.keys.shoot = false;
  state.gfx.projectiles = [];
});
