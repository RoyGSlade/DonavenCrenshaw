import test from "node:test";
import assert from "node:assert/strict";
import {
  createMatch,
  stepMatch,
  snapshot,
  NEUTRAL,
  RULES,
} from "../projects/Space-Shooter/dogfight/simulation.js";
import { cleanSnapshot } from "../projects/Space-Shooter/dogfight/protocol.js";
import { MAPS } from "../projects/Space-Shooter/dogfight/maps.js";
import {
  defaultLoadout,
  shipStats,
} from "../projects/Space-Shooter/dogfight/ships.js";
import {
  advanceLaserTraps,
  prepareLaserTraps,
  TRAP_RULES,
} from "../projects/Space-Shooter/dogfight/laserTraps.js";

const idle = [NEUTRAL, NEUTRAL, NEUTRAL];
const fire = { ...NEUTRAL, fire: true };
const trap = { ...NEUTRAL, trap: true };
function active(map = "classic", loadouts = []) {
  const match = createMatch(42, 1, loadouts, map, "ffa3");
  match.phase = "playing";
  match.countdown = 0;
  return match;
}
function openArena() {
  const match = active();
  match.obstacles = [];
  return match;
}
const input = (id, control) =>
  idle.map((neutral, i) => (i === id ? control : neutral));
const clean = (match) =>
  cleanSnapshot(
    snapshot(match),
    match.round,
    match.ships.map((s) => s.loadout),
    match.mapId,
    match.mode,
  );

test("all maps offer deterministic heavy-safe triangular spawns without editing their cover", () => {
  for (const map of Object.keys(MAPS))
    for (const seed of [1, 42, 999, 4294967295]) {
      const loadouts = [0, 1, 2].map((id) => ({
        ...defaultLoadout(id),
        classId: "heavy",
      }));
      const match = createMatch(seed, 1, loadouts, map, "ffa3");
      assert.deepEqual(match, createMatch(seed, 1, loadouts, map, "ffa3"));
      assert.equal(match.ships.length, 3);
      assert.deepEqual(
        match.obstacles,
        createMatch(seed, 1, [], map).obstacles,
      );
      for (const ship of match.ships) {
        const margin = shipStats(ship).radius + 0.5;
        assert.ok(
          ship.x > margin &&
            ship.x < 40 - margin &&
            ship.y > margin &&
            ship.y < 24 - margin,
        );
        for (const o of match.obstacles)
          assert.ok(
            Math.hypot(ship.x - o.x, ship.y - o.y) > margin + o.radius,
            `${map}: spawn ${ship.id} cover clearance`,
          );
        for (const g of match.gates)
          assert.ok(Math.hypot(ship.x - g.x, ship.y - g.y) > margin + 1.1);
        for (const f of match.fields.filter((f) => f.type === "gravity"))
          assert.ok(Math.hypot(ship.x - f.x, ship.y - f.y) > f.radius);
        for (const v of [
          ...match.vents,
          ...match.fields.filter((f) => f.type === "stream"),
        ])
          assert.ok(
            ship.x < v.x - margin ||
              ship.x > v.x + v.width + margin ||
              ship.y < v.y - margin ||
              ship.y > v.y + v.height + margin,
          );
      }
      assert.ok(clean(match));
    }
  assert.throws(() => createMatch(1, 1, [], "classic", "unknown"), RangeError);
});

test("third pilot can eliminate either rival using actual bullets; first elimination does not end FFA", () => {
  const match = openArena();
  Object.assign(match.ships[2], { x: 10, y: 12, angle: 0 });
  Object.assign(match.ships[0], { x: 14, y: 12 });
  Object.assign(match.ships[1], { x: 30, y: 12 });
  for (let i = 0; i < 100 && match.ships[0].hp > 0; i++)
    stepMatch(match, input(2, fire));
  assert.equal(match.ships[0].hp, 0);
  assert.equal(match.phase, "playing");
  assert.equal(match.winner, null);
  assert.equal(match.ships[1].hp, 100);
  assert.ok(clean(match));
  match.ships[1].x = 15;
  for (let i = 0; i < 150 && match.phase !== "finished"; i++)
    stepMatch(match, input(2, fire));
  assert.equal(match.phase, "finished");
  assert.equal(match.winner, 2);
  assert.equal(match.reason, "hull");
  assert.ok(clean(match));
  assert.deepEqual(match.bullets, []);
  assert.deepEqual(match.traps, []);
});

test("swept bullets hit nearest live enemy independent of array order and ignore dead/own hulls", () => {
  const match = openArena();
  Object.assign(match.ships[0], { x: 12, y: 12 });
  Object.assign(match.ships[1], { x: 18, y: 12 });
  Object.assign(match.ships[2], { x: 14, y: 12 });
  match.bullets.push({
    id: 1,
    owner: 0,
    x: 12,
    y: 12,
    vx: 1000,
    vy: 0,
    life: 1,
  });
  stepMatch(match);
  assert.deepEqual(
    match.ships.map((s) => s.hp),
    [100, 100, 50],
  );
  match.ships[2].hp = 0;
  match.bullets.push({
    id: 2,
    owner: 0,
    x: 12,
    y: 12,
    vx: 1000,
    vy: 0,
    life: 1,
  });
  stepMatch(match);
  assert.deepEqual(
    match.ships.map((s) => s.hp),
    [100, 50, 0],
  );
});

test("eliminated ships cannot move, collide, teleport or create new weapons", () => {
  const match = active("gravemaw"),
    dead = match.ships[2];
  Object.assign(dead, {
    hp: 0,
    x: 7,
    y: 5.5,
    vx: 10,
    vy: 6,
    angVel: 1,
    trapLock: 0.5,
    trapImmunity: 1,
    trapAnchor: { x: 20, y: 20, angle: 2 },
  });
  Object.assign(match.ships[0], { x: 7.1, y: 5.5, gateCooldown: 1 });
  const angle = dead.angle;
  stepMatch(
    match,
    input(2, { ...fire, trap: true, thrust: true, boost: true, turn: 1 }),
  );
  assert.deepEqual(
    [dead.x, dead.y, dead.angle, dead.vx, dead.vy, dead.angVel],
    [7, 5.5, angle, 0, 0, 0],
  );
  assert.equal(dead.trapLock, 0);
  assert.equal(dead.trapAnchor, null);
  assert.equal(match.ships[0].x, 7.1, "Dead overlap cannot push a live ship");
  assert.equal(match.ships[0].hp, 100);
  assert.equal(match.bullets.length, 0);
  assert.equal(match.traps.length, 0);
});

test("live pair separation includes third pilot and skips eliminated hulls", () => {
  const match = openArena();
  Object.assign(match.ships[1], { x: 20, y: 12 });
  Object.assign(match.ships[2], { x: 20.1, y: 12 });
  stepMatch(match);
  assert.ok(
    Math.hypot(
      match.ships[1].x - match.ships[2].x,
      match.ships[1].y - match.ships[2].y,
    ) >=
      RULES.shipRadius * 2 - 1e-9,
  );
});

test("three simultaneous traps are permitted; third trap picks nearest enemy and respects cover", () => {
  const match = openArena();
  prepareLaserTraps(match, [trap, trap, trap], RULES.step);
  assert.deepEqual(
    match.traps.map((t) => t.owner),
    [0, 1, 2],
  );
  assert.ok(clean(match));
  match.ships[2].trapCooldown = 0;
  match.ships[2].trapHeld = false;
  prepareLaserTraps(match, input(2, trap), RULES.step);
  assert.equal(match.traps.length, 3, "FFA has a three-total projectile cap");
  Object.assign(match.ships[2], { x: 10, y: 12 });
  Object.assign(match.ships[0], { x: 16, y: 12 });
  Object.assign(match.ships[1], { x: 13, y: 12 });
  match.traps = [
    { id: 9, owner: 2, x: 10, y: 12, vx: 18, vy: 0, angle: 0, life: 1 },
  ];
  advanceLaserTraps(match, RULES, 0.5);
  assert.equal(match.ships[1].trapLock, TRAP_RULES.lockSeconds);
  assert.equal(match.ships[0].trapLock, 0);
  assert.equal(match.ships[2].trapLock, 0);
  match.ships[1].hp = 0;
  match.obstacles = [{ x: 14, y: 12, radius: 0.5 }];
  match.traps = [
    { id: 10, owner: 2, x: 10, y: 12, vx: 18, vy: 0, angle: 0, life: 1 },
  ];
  advanceLaserTraps(match, RULES, 0.5);
  assert.equal(match.ships[0].trapLock, 0);
  assert.equal(match.traps.length, 0);
});

test("FFA resolves last survivor, all-dead draw, unique percentage leader and percentage ties", () => {
  for (const [hps, winner, timeout] of [
    [[0, 0, 140], 2, false],
    [[0, 0, 0], null, false],
    [[40, 60, 70], 1, true],
    [[40, 50, 70], null, true],
    [[0, 50, 140], 2, true],
  ]) {
    const loadouts = ["light", "medium", "heavy"].map((classId, i) => ({
      ...defaultLoadout(i),
      classId,
    }));
    const match = active("classic", loadouts);
    match.ships.forEach((ship, i) => (ship.hp = hps[i]));
    if (timeout) match.remaining = RULES.step;
    stepMatch(match);
    assert.equal(match.phase, "finished");
    assert.equal(match.winner, winner);
    assert.equal(match.reason, timeout ? "time" : "hull");
    assert.ok(clean(match));
  }
});

test("FFA protocol binds mode, seat count, third loadout/resources and every projectile owner", () => {
  const match = active("shatterbelt");
  prepareLaserTraps(match, [trap, trap, trap], RULES.step);
  const state = snapshot(match),
    loadouts = match.ships.map((s) => s.loadout);
  const check = (value) =>
    cleanSnapshot(value, 1, loadouts, "shatterbelt", "ffa3");
  assert.ok(check(state));
  assert.equal(cleanSnapshot(state, 1, loadouts, "shatterbelt", "duel"), null);
  for (const mutate of [
    (s) => delete s.mode,
    (s) => (s.mode = "duel"),
    (s) => (s.mode = "unknown"),
    (s) => s.ships.pop(),
    (s) => s.ships.push({ ...s.ships[2], id: 3 }),
    (s) => (s.ships[2].id = 1),
    (s) => (s.ships[2].hp = 141),
    (s) => (s.ships[2].flux = Infinity),
    (s) => (s.ships[2].boost = 4),
    (s) => (s.ships[2].heat = -1),
    (s) => (s.ships[2].trapLock = 99),
    (s) => (s.ships[2].loadout.classId = "light"),
    (s) => (s.winner = 3),
    (s) => (s.winner = -1),
    (s) => (s.winner = "2"),
    (s) => (s.bullets = [{ id: 1, owner: 3, x: 1, y: 1 }]),
    (s) => (s.traps[2].owner = -1),
    (s) => s.traps.push({ ...s.traps[2], id: 99 }),
  ]) {
    const bad = structuredClone(state);
    mutate(bad);
    assert.equal(check(bad), null);
  }
  const legacy = snapshot(createMatch());
  delete legacy.mode;
  assert.equal(cleanSnapshot(legacy, 1).mode, "duel");
  assert.equal(cleanSnapshot(legacy, 1, null, null, "ffa3"), null);
  assert.equal(
    cleanSnapshot(state, 1, loadouts.slice(0, 2), "shatterbelt", "ffa3"),
    null,
  );
  assert.equal(cleanSnapshot(state, 1, loadouts, "classic", "ffa3"), null);
});

test("three-input replay stays deterministic across authored arenas and every snapshot is mode-valid", () => {
  for (const map of Object.keys(MAPS)) {
    const a = active(map),
      b = active(map);
    for (let i = 0; i < 900; i++) {
      const inputs = a.ships.map((_, id) => ({
        ...NEUTRAL,
        turn: Math.sin((i + id * 70) / 80),
        thrust: i % 180 < 110,
        fire: i % 200 < 90,
        trap: i % 750 === id * 3,
        boost: i % 120 < 2,
      }));
      stepMatch(a, inputs);
      stepMatch(b, inputs);
      assert.ok(clean(a), `${map} tick ${i}`);
    }
    assert.deepEqual(a, b);
  }
});

test("simultaneous lethal in-flight trades are independent of bullet array order in duel and FFA", () => {
  for (const mode of ["duel", "ffa3"])
    for (const reverse of [false, true]) {
      const match = createMatch(42, 1, [], "classic", mode);
      match.phase = "playing";
      match.countdown = 0;
      match.obstacles = [];
      Object.assign(match.ships[0], { x: 6, y: 12, hp: 50 });
      Object.assign(match.ships[1], { x: 34, y: 12, hp: 50 });
      match.bullets = [
        { id: 1, owner: 0, x: 33.6, y: 12, vx: 16, vy: 0, life: 1 },
        { id: 2, owner: 1, x: 6.4, y: 12, vx: -16, vy: 0, life: 1 },
      ];
      if (reverse) match.bullets.reverse();
      stepMatch(match);
      assert.deepEqual(
        match.ships.slice(0, 2).map((ship) => ship.hp),
        [0, 0],
      );
      assert.equal(match.phase, "finished");
      assert.equal(match.winner, mode === "duel" ? null : 2);
      assert.equal(match.reason, "hull");
      assert.ok(clean(match));
    }
});

test("FFA eliminated-owner bullets and traps still hit, and missed shots expire naturally", () => {
  const match = openArena();
  match.ships[2].hp = 0;
  Object.assign(match.ships[0], { x: 10, y: 12 });
  Object.assign(match.ships[1], { x: 30, y: 12 });
  match.bullets = [{ id: 1, owner: 2, x: 8, y: 12, vx: 16, vy: 0, life: 1 }];
  match.traps = [
    { id: 1, owner: 2, x: 8, y: 12, vx: 18, vy: 0, angle: 0, life: 1 },
  ];
  stepMatch(match, input(2, { ...fire, trap: true }));
  assert.equal(match.bullets.length, 1);
  assert.equal(match.traps.length, 1);
  assert.ok(match.bullets[0].x > 8 && match.traps[0].x > 8);
  for (let i = 0; i < 10; i++) stepMatch(match);
  assert.equal(match.ships[0].hp, 50);
  assert.ok(match.ships[0].trapLock > 0);
  assert.equal(match.phase, "playing");
  assert.equal(match.bullets.length, 0);
  assert.equal(match.traps.length, 0);
  match.bullets = [{ id: 2, owner: 2, x: 10, y: 2, vx: 1, vy: 0, life: 0.04 }];
  match.traps = [
    { id: 2, owner: 2, x: 10, y: 2, vx: 1, vy: 0, angle: 0, life: 0.04 },
  ];
  stepMatch(match);
  assert.equal(match.bullets.length, 1);
  assert.equal(match.traps.length, 1);
  stepMatch(match);
  stepMatch(match);
  assert.equal(match.bullets.length, 0);
  assert.equal(match.traps.length, 0);
  assert.equal(match.phase, "playing");
});
