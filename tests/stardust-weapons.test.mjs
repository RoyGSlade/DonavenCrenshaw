import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_CONFIG, fireWeapon, coolWeapon, projectileFrom } from '../projects/Space-Shooter/engine/systems/weapons.js';

const pilot = (overrides = {}) => ({
  x: 3, y: 7, vx: 4, vy: -2, angle: 0,
  shootCooldown: 0, heat: 0, maxHeat: WEAPON_CONFIG.PLAYER_MAX_HEAT,
  isOverheated: false, ...overrides,
});

test('solo weapon cadence fires every ten 60Hz steps and overheats on the thirteenth shot', () => {
  const player = pilot();
  const shots = [], transitions = [];
  for (let tick = 0; tick < 140; tick++) {
    if (fireWeapon(1 / 60, player, true)) shots.push(tick);
    const transition = coolWeapon(1 / 60, player, true);
    if (transition) transitions.push([tick, transition]);
  }
  assert.deepEqual(shots, Array.from({ length: 13 }, (_, i) => i * 10));
  assert.deepEqual(transitions, [[120, 'overheated']]);
  assert.equal(player.isOverheated, true);
  assert.ok(player.heat < 100 && player.heat > 95);
});

test('shot callback sees the original spawn ordering; a long step never catches up multiple shots', () => {
  const player = pilot({ heat: 96, shootCooldown: 0.1 });
  let calls = 0;
  assert.equal(fireWeapon(1, player, true, WEAPON_CONFIG, () => {
    calls++;
    assert.equal(player.shootCooldown, 0);
    assert.equal(player.heat, 96);
    assert.equal(player.isOverheated, false);
  }), true);
  assert.equal(calls, 1);
  assert.equal(player.shootCooldown, 0.16);
  assert.equal(player.heat, 100);
  assert.equal(player.isOverheated, false);
  assert.equal(coolWeapon(1 / 60, player, true), 'overheated');
});

test('idle cooling precedes threshold checking, while held fire prevents idle cooling', () => {
  const idle = pilot({ heat: 100 });
  assert.equal(coolWeapon(0.5, idle, false), null);
  assert.equal(idle.heat, 86);
  assert.equal(idle.isOverheated, false);
  const firing = pilot({ heat: 40 });
  assert.equal(coolWeapon(0.5, firing, true), null);
  assert.equal(firing.heat, 40);
  assert.equal(fireWeapon(0.1, idle, false), false);
  assert.equal(idle.heat, 86);
});

test('overheat cools at fourteen per second, reports one recovery, and resumes fire next step', () => {
  const player = pilot({ heat: 14, isOverheated: true, shootCooldown: 0.16 });
  assert.equal(fireWeapon(0.5, player, true), false);
  assert.equal(coolWeapon(0.5, player, true), null);
  assert.equal(player.heat, 7);
  assert.equal(fireWeapon(0.5, player, true), false);
  assert.equal(coolWeapon(0.5, player, true), 'cooled');
  assert.equal(player.heat, 0);
  assert.equal(player.isOverheated, false);
  assert.equal(coolWeapon(1 / 60, player, false), null);
  assert.equal(fireWeapon(1 / 60, player, true), true);
  assert.equal(player.heat, 8);
});

test('projectiles retain full momentum, half-unit muzzle offset and solo lifetime without an owner', () => {
  const player = pilot();
  const before = structuredClone(player);
  assert.deepEqual(projectileFrom(player), { x: 3.5, y: 7, vx: 20, vy: -2, life: 1.2 });
  assert.deepEqual(player, before);
  const up = projectileFrom(pilot({ angle: Math.PI / 2 }));
  assert.ok(Math.abs(up.x - 3) < 1e-12);
  assert.equal(up.y, 7.5);
  assert.ok(Math.abs(up.vx - 4) < 1e-12);
  assert.equal(up.vy, 14);
  assert.equal(WEAPON_CONFIG.PLAYER_PROJECTILE_DAMAGE, 50);
  const custom = { ...WEAPON_CONFIG, PLAYER_PROJECTILE_SPEED: 9, PLAYER_PROJECTILE_LIFE: 3 };
  assert.deepEqual(projectileFrom(player, custom), { x: 3.5, y: 7, vx: 13, vy: -2, life: 3 });
});
