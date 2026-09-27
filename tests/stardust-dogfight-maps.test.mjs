import test from "node:test";
import assert from "node:assert/strict";
import { MAPS, createArena, arenaSnapshot, ventPhase } from "../projects/Space-Shooter/dogfight/maps.js";
import { advanceTerrain, resolveTerrain, damageTerrain, impactTime } from "../projects/Space-Shooter/dogfight/terrain.js";
import { cleanArenaSnapshot } from "../projects/Space-Shooter/dogfight/terrainProtocol.js";
import { createMatch, NEUTRAL, RULES, stepMatch, snapshot } from "../projects/Space-Shooter/dogfight/simulation.js";
import { cleanSnapshot } from "../projects/Space-Shooter/dogfight/protocol.js";
import { SHIP_CLASSES, defaultLoadout } from "../projects/Space-Shooter/dogfight/ships.js";
const ids = Object.keys(MAPS).filter(id => id !== "classic");
function active(id) { const m = createMatch(123, 1, [], id); m.phase = "playing"; m.countdown = 0; return m; }

test("three authored maps are mirrored, deterministic, spawn-safe for every hull and have distinct mechanics", () => {
  for (const id of ids) {
    const arena = createArena(id);
    assert.deepEqual(arena, createArena(id));
    for (const o of arena.obstacles) {
      assert.ok(arena.obstacles.some(p => p.type === o.type && p.radius === o.radius && p.hp === o.hp &&
        Math.abs(p.x + o.x - 40) < 1e-8 && Math.abs(p.y + o.y - 24) < 1e-8), `${id}: mirrored ${o.id}`);
      assert.ok(o.x - o.radius > 0 && o.x + o.radius < 40 && o.y - o.radius > 0 && o.y + o.radius < 24);
      for (const stats of Object.values(SHIP_CLASSES)) for (const x of [6, 34])
        assert.ok(Math.hypot(o.x - x, o.y - 12) > o.radius + stats.radius + 2, `${id} spawn clearance`);
    }
  }
  assert.ok(createArena("shatterbelt").obstacles.some(o => o.type === "crystal"));
  assert.equal(createArena("gravemaw").gates.length, 2);
  assert.equal(createArena("stormworks").vents.length, 2);
  assert.throws(() => createArena("__proto__"), RangeError);
});

test("crystals require three primary hits; destroyed cover stops blocking ships and laser traps", () => {
  const m = active("shatterbelt"), o = m.obstacles.find(o => o.type === "crystal");
  m.obstacles = [o]; m.fields = []; m.gates = [];
  Object.assign(m.ships[0], { x: o.x - 4, y: o.y, vx: 0, vy: 0, angle: 0 });
  m.ships[1].y = 22;
  for (let shot = 1; shot <= 3; shot++) {
    m.bullets.push({ id: shot, owner: 0, x: o.x - o.radius - 0.02, y: o.y, vx: 16, vy: 0, life: 1 });
    stepMatch(m);
    assert.equal(o.hp, 150 - shot * RULES.damage);
    assert.equal(m.bullets.length, 0);
  }
  Object.assign(m.ships[0], { x: o.x, y: o.y, vx: 0, vy: 0 });
  stepMatch(m);
  assert.equal(m.ships[0].x, o.x);
  m.traps.push({ id: 1, owner: 0, x: o.x - 0.2, y: o.y, vx: 18, vy: 0, angle: 0, life: 1 });
  stepMatch(m);
  assert.equal(m.traps.length, 1);
});

test("fuel explosions damage both pilots, crack cover, and cannot fire twice", () => {
  const m = active("shatterbelt"), pod = m.obstacles.find(o => o.type === "fuel");
  for (const [i, ship] of m.ships.entries()) Object.assign(ship, { x: pod.x + (i ? -1 : 1), y: pod.y });
  damageTerrain(m, pod, RULES.damage); assert.equal(m.bursts.length, 0);
  damageTerrain(m, pod, RULES.damage); assert.equal(pod.hp, 0);
  assert.equal(m.bursts.length, 1); assert.ok(m.ships.every(s => s.hp < 100 && s.hp >= 70));
  assert.ok(m.obstacles.some(o => o.type === "crystal" && o.hp < o.maxHp), "blast cracks neighboring crystal cover");
  assert.equal(m.ships[0].hp, m.ships[1].hp);
  const hp = m.ships.map(s => s.hp); damageTerrain(m, pod, 50);
  assert.deepEqual(m.ships.map(s => s.hp), hp);
  for (let i = 0; i < 90; i++) advanceTerrain(m, RULES.step);
  assert.equal(m.bursts.length, 0);
});

test("gravity and streams alter flight, mirrored starts receive opposite forces, trapped ships stay anchored", () => {
  const m = active("gravemaw");
  Object.assign(m.ships[0], { x: 11, y: 8 }); Object.assign(m.ships[1], { x: 29, y: 16 });
  advanceTerrain(m, RULES.step);
  assert.ok(m.ships[0].vx > 0); assert.ok(m.ships[1].vx < 0);
  assert.ok(Math.abs(m.ships[0].vx + m.ships[1].vx) < 1e-9);
  Object.assign(m.ships[0], { vx: 0, vy: 0, trapLock: 0.5 }); advanceTerrain(m, RULES.step);
  assert.equal(m.ships[0].vx, 0);
  const stream = active("stormworks");
  Object.assign(stream.ships[0], { x: 7, y: 4 }); Object.assign(stream.ships[1], { x: 33, y: 20 });
  stepMatch(stream); assert.ok(stream.ships[0].x > 7 && stream.ships[1].x < 33);
});

test("jump gates preserve momentum, have re-entry cooldown and never teleport a trapped pilot", () => {
  const m = active("gravemaw"), ship = m.ships[0];
  Object.assign(ship, { x: 7, y: 5.5, vx: 2, vy: 1, gateCooldown: 0 });
  resolveTerrain(m); assert.ok(ship.x > 30 && ship.y > 18);
  assert.equal(ship.vx, 2); assert.equal(ship.vy, 1); assert.equal(ship.gateCooldown, 1.2);
  Object.assign(ship, { x: 33, y: 18.5 }); resolveTerrain(m); assert.equal(ship.x, 33);
  Object.assign(ship, { gateCooldown: 0, trapLock: 0.5 }); resolveTerrain(m); assert.equal(ship.x, 33);
  ship.trapLock = 0; resolveTerrain(m); assert.ok(ship.x < 10);
});

test("actual simulation keeps laser-locked ships stationary inside wells, gates and streams", () => {
  for (const [id, x, y] of [["gravemaw", 11, 8], ["gravemaw", 7, 5.5], ["stormworks", 7, 4]]) {
    const m = active(id), ship = m.ships[0]; Object.assign(ship, { x, y, vx: 3, vy: 2, trapLock: 0.5, angVel: 2 });
    for (let i = 0; i < 15; i++) stepMatch(m, [{ ...NEUTRAL, thrust: true, turn: 1, boost: true }, NEUTRAL]);
    assert.equal(ship.x, x); assert.equal(ship.y, y); assert.equal(ship.vx, 0); assert.equal(ship.angle, 0);
  }
});

test("vent warnings precede damage, safe windows and a damage cooldown work at simulation time", () => {
  assert.deepEqual([0, 4.9, 5, 6.49, 6.5, 7.99, 8].map(ventPhase), ["safe", "safe", "warning", "warning", "live", "live", "safe"]);
  const m = active("stormworks"), ship = m.ships[0]; Object.assign(ship, { x: 20, y: 6 });
  m.remaining = 174.5; advanceTerrain(m, RULES.step); resolveTerrain(m); assert.equal(ship.hp, 100);
  m.remaining = 173; resolveTerrain(m); assert.equal(ship.hp, 88);
  resolveTerrain(m); assert.equal(ship.hp, 88);
  m.remaining = 172; advanceTerrain(m, 0.65); resolveTerrain(m); assert.equal(ship.hp, 88);
});

test("terrain snapshot rejects mismatched maps, invented health, duplicate or forged explosions", () => {
  const m = active("shatterbelt"), pod = m.obstacles.find(o => o.type === "fuel"); damageTerrain(m, pod, 100);
  const data = snapshot(m); assert.ok(cleanSnapshot(data, 1, null, m.mapId));
  assert.equal(cleanSnapshot(data, 1, null, "gravemaw"), null);
  for (const mutate of [
    s => { s.mapId = "bad"; }, s => { s.terrain.hp.pop(); }, s => { s.terrain.hp[0] = 0; },
    s => { s.terrain.hp[pod.id] = 101; }, s => { s.terrain.bursts[0].x += 1; },
    s => { s.terrain.bursts[0].life = Infinity; }, s => { s.terrain.bursts.push(s.terrain.bursts[0]); },
  ]) { const bad = structuredClone(data); mutate(bad); assert.equal(cleanArenaSnapshot(bad), null); }
  const cleaned = cleanArenaSnapshot(data); cleaned.terrain.hp[pod.id] = 99;
  assert.equal(data.terrain.hp[pod.id], 0);
});

test("all three maps replay identically with traps/classes/terrain and fully reset on rematch", () => {
  const loadouts = [{ ...defaultLoadout(0), classId: "heavy" }, { ...defaultLoadout(1), classId: "light" }];
  for (const id of ids) {
    const a = createMatch(42, 1, loadouts, id), b = createMatch(42, 1, loadouts, id);
    for (let tick = 0; tick < 2100; tick++) {
      const controls = [0, 1].map(i => ({ ...NEUTRAL, turn: Math.sin(tick / 120 + i), thrust: tick % 200 < 100,
        fire: tick % 130 < 50, boost: tick % 260 < 1, trap: tick % 780 < 1 }));
      stepMatch(a, controls); stepMatch(b, controls);
      if (tick % 30 === 0) assert.ok(cleanSnapshot(snapshot(a), 1, loadouts, id), `${id} tick ${tick}`);
    }
    assert.deepEqual(a, b);
    assert.ok(a.ships.every(s => [s.x, s.y, s.vx, s.vy, s.hp].every(Number.isFinite)));
    const c = createMatch(42, 2, loadouts, id); assert.deepEqual(c.obstacles, createArena(id).obstacles);
    assert.deepEqual(c.bursts, []); assert.deepEqual(c.ships.map(s => s.hp), [140, 80]);
  }
});

test("swept collision selects the closest cover and hits a target in front of cover", () => {
  assert.ok(impactTime(0, 0, 2, 0, 1, 0, 0.1) < impactTime(0, 0, 2, 0, 1.9, 0, 0.1));
  const m = active("shatterbelt"); m.fields = []; m.gates = [];
  m.obstacles = [{ x: 12.2, y: 12, radius: 0.05, hp: 150, type: "crystal" }];
  Object.assign(m.ships[1], { x: 12, y: 12 });
  m.bullets.push({ id: 1, owner: 0, x: 11, y: 12, vx: 180, vy: 0, life: 1 });
  stepMatch(m); assert.equal(m.ships[1].hp, 50); assert.equal(m.obstacles[0].hp, 150);
});
