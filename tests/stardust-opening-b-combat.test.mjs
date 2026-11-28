// Opening B, outcome 6: move, aim and shoot at the same time. Pure checks of how aim and fire are decided, and the real shooter with
// a keyboard-only player (WASD + a fire key, the touchpad asleep) and with a phone player (left stick + right stick or a tap).
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAim, decideFire, nearestEnemy, MOUSE_LIVE_MS, FIRE_KEYS, ASSIST_RANGE } from '../projects/Space-Shooter/voyage/onfoot/aim.js';
import { createFight, stepFight, STEP } from '../projects/Space-Shooter/voyage/onfoot/rules/shooter.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('aim: right stick, then arrow keys, then a finger on the playfield, then the live mouse', () => {
  assert.ok(near(decideAim({ stick: { x: 0, y: 1 }, arrows: { x: 1, y: 0 }, mouse: { seen: true, ageMs: 0, angle: 3 } }), Math.PI / 2), 'the stick wins');
  assert.equal(decideAim({ stick: { x: 0.1, y: 0.1 } }), null, 'inside the dead zone is no aim');
  assert.ok(near(decideAim({ arrows: { x: -1, y: 0 }, mouse: { seen: true, ageMs: 0, angle: 3 } }), Math.PI), 'arrows over the mouse');
  assert.ok(near(decideAim({ touchAim: 0.7, mouse: { seen: true, ageMs: 0, angle: 3 } }), 0.7));
  assert.ok(near(decideAim({ mouse: { seen: true, ageMs: 100, angle: 2 }, fireKey: true, assist: { angle: -1 } }), 2), 'a live mouse still aims, even with a fire key down');
  assert.equal(decideAim({}), null);
});

test('aim: a fire key aims at the nearest enemy when the pointer has gone quiet (the touchpad that sleeps while you walk)', () => {
  const quiet = { seen: true, ageMs: MOUSE_LIVE_MS + 1, angle: 2 };
  assert.ok(near(decideAim({ mouse: quiet, fireKey: true, assist: { angle: -1 } }), -1), 'assist takes over');
  assert.ok(near(decideAim({ mouse: quiet, fireKey: false, assist: { angle: -1 } }), 2), 'no fire key: the mouse still points');
  assert.ok(near(decideAim({ mouse: null, fireKey: true, assist: { angle: 0.4 } }), 0.4), 'a player who never touched the mouse');
  assert.equal(decideAim({ mouse: null, fireKey: true, assist: null }), null, 'nothing to aim at');
  assert.deepEqual([...FIRE_KEYS], ['KeyF', 'KeyJ']);
});

test('fire: any one of the ways, so one hand on WASD is enough', () => {
  assert.equal(decideFire({}), false);
  assert.equal(decideFire({ fireKey: true }), true);
  assert.equal(decideFire({ arrows: true }), true);
  assert.equal(decideFire({ mouseDown: true }), true);
  assert.equal(decideFire({ touchHeld: true }), true);
  assert.equal(decideFire({ stick: { x: 0.3, y: 0 } }), false, 'a light touch on the stick only aims');
  assert.equal(decideFire({ stick: { x: 0.9, y: 0 } }), true);
});

test('assist picks the nearest living enemy in range', () => {
  const from = { x: 0, y: 0 };
  const e = [{ x: 300, y: 0, alive: true }, { x: 0, y: 100, alive: true }, { x: 50, y: 0, alive: false }, { x: ASSIST_RANGE + 10, y: 0, alive: true }];
  const n = nearestEnemy(from, e);
  assert.ok(near(n.angle, Math.PI / 2) && n.dist === 100);
  assert.equal(nearestEnemy(from, [{ x: ASSIST_RANGE + 50, y: 0, alive: true }]), null);
  assert.equal(nearestEnemy(from, []), null);
});

test('the shooter with a keyboard-only player: move, aim by assist and fire in the same steps, and the shots hit', () => {
  const map = compileMap(MAP_DEFS['duchess-corridor']);
  const f = createFight({ map, spawn: { x: 10 * 48, y: 9.5 * 48, angle: 0 }, enemies: [{ type: 'marauder', x: 16 * 48, y: 9.5 * 48, awake: true }], player: { hp: 200 }, seed: 3 });
  const x0 = f.player.x;
  let assistAngle = 0;
  for (let i = 0; i < 60 * 3 && !f.ended; i++) {
    const n = nearestEnemy(f.player, f.enemies);
    assistAngle = decideAim({ fireKey: true, assist: n });
    stepFight(f, { move: { x: 0, y: -1 }, aim: assistAngle, fire: decideFire({ fireKey: true }), dash: false }, STEP);
  }
  assert.ok(f.player.shots > 5, `shot while walking (${f.player.shots})`);
  assert.ok(Math.abs(f.player.y - 9.5 * 48) > 20, 'and moved while shooting');
  assert.ok(f.player.hits > 0, `and hit something (${f.player.hits})`);
  assert.ok(x0 > 0);
});
