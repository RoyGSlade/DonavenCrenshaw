import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, stepMatch, snapshot, NEUTRAL, RULES } from "../projects/Space-Shooter/dogfight/simulation.js";
import { TRAP_RULES } from "../projects/Space-Shooter/dogfight/laserTraps.js";
import { cleanSnapshot, inputControls } from "../projects/Space-Shooter/dogfight/protocol.js";
import { createGamepadReader } from "../projects/Space-Shooter/systems/gamepad.js";
import { defaultLoadout, shipStats } from "../projects/Space-Shooter/dogfight/ships.js";

const trap = { ...NEUTRAL, trap: true };
function active() {
  const match = createMatch(123);
  match.phase = "playing";
  match.countdown = 0;
  match.obstacles = [];
  return match;
}
function tick(match, count, inputs) {
  for (let i = 0; i < count; i++) stepMatch(match, inputs);
}
function catchTarget(match, owner = 0) {
  const inputs = [NEUTRAL, NEUTRAL];
  inputs[owner] = trap;
  for (let i = 0; i < 110 && !match.ships[1 - owner].trapLock; i++) stepMatch(match, inputs);
  assert.equal(match.ships[1 - owner].trapLock, TRAP_RULES.lockSeconds);
}

test("trap waits for GO, fires once per press, recharges slowly, and does not queue a failed press", () => {
  const m = createMatch();
  tick(m, 100, [trap, trap]);
  assert.equal(m.traps.length, 0);
  assert.equal(m.ships[0].trapCooldown, 0);
  while (m.phase === "countdown") stepMatch(m, [trap, trap]);
  stepMatch(m, [trap, trap]);
  assert.equal(m.traps.length, 2);
  assert.equal(m.ships[0].trapCooldown, 12);
  tick(m, 750, [trap, trap]);
  assert.equal(m.nextTrap, 3, "Holding past recharge cannot autofire");
  assert.equal(m.ships[0].trapCooldown, 0);
  stepMatch(m);
  stepMatch(m, [trap, NEUTRAL]);
  assert.equal(m.nextTrap, 4);
  stepMatch(m);
  stepMatch(m, [trap, NEUTRAL]);
  tick(m, 750, [trap, NEUTRAL]);
  assert.equal(m.nextTrap, 4, "A cooldown press is consumed, not queued");
});

test("either pilot can land a zero-damage trap without trapping themselves", () => {
  for (const owner of [0, 1]) {
    const m = active();
    const initialHull = m.ships.map(s => s.hp);
    catchTarget(m, owner);
    assert.equal(m.ships[owner].trapLock, 0);
    assert.deepEqual(m.ships.map(s => s.hp), initialHull);
    assert.equal(m.traps.length, 0);
  }
});

test("lock stops momentum, rotation, analog movement and boost but allows return fire; releases on time", () => {
  const m = active();
  catchTarget(m);
  const target = m.ships[1], x = target.x, y = target.y, angle = target.angle;
  target.vx = -9;
  target.angVel = 3;
  const struggle = { ...trap, fire: true, thrust: true, reverse: true, turn: 1,
    boost: true, thrustStrength: 1, backStrength: 0.6, strafe: 0.6 };
  const boostBefore = target.boostCooldown;
  tick(m, Math.round(TRAP_RULES.lockSeconds / RULES.step), [NEUTRAL, struggle]);
  assert.equal(target.x, x);
  assert.equal(target.y, y);
  assert.equal(target.angle, angle);
  assert.equal(target.vx, 0);
  assert.equal(target.vy, 0);
  assert.equal(target.trapLock, 0);
  assert.equal(target.boostCooldown, boostBefore, "Blocked boost does not spend charge");
  assert.ok(m.bullets.some(b => b.owner === 1), "Weapons still work inside the clamp");
  stepMatch(m, [NEUTRAL, { ...NEUTRAL, thrust: true, turn: 1 }]);
  assert.notEqual(target.x, x);
  assert.notEqual(target.angle, angle);
});

test("lock anchor survives another ship bumping into the target", () => {
  const m = active();
  catchTarget(m);
  const target = m.ships[1], x = target.x, y = target.y;
  Object.assign(m.ships[0], { x: x - 0.1, y });
  stepMatch(m);
  assert.equal(target.x, x);
  assert.equal(target.y, y);
});

test("trap near misses respect light and heavy collision radii", () => {
  for (const classId of ["light", "heavy"]) {
    const m = active(), target = m.ships[1];
    target.loadout = { ...defaultLoadout(1), classId };
    target.hp = shipStats(target).hp;
    target.y += RULES.shipRadius * 1.02 + TRAP_RULES.radius;
    stepMatch(m, [trap, NEUTRAL]);
    let caught = false;
    for (let i = 0; i < 110; i++) {
      stepMatch(m);
      caught ||= target.trapLock > 0;
    }
    assert.equal(caught, classId === "heavy");
  }
});

test("cover absorbs the whole clamp, near misses pass, and escaped projectiles expire", () => {
  for (const rockY of [12, 13.2]) {
    const m = active();
    m.obstacles = [{ x: 20, y: rockY, radius: 1 }];
    stepMatch(m, [trap, NEUTRAL]);
    tick(m, 110);
    assert.equal(m.ships[1].trapLock, 0, "Cover clips the projectile radius too");
    assert.equal(m.traps.length, 0);
  }
  const miss = active();
  miss.ships[1].y += 1.5;
  stepMatch(miss, [trap, NEUTRAL]);
  tick(miss, 120);
  assert.equal(miss.ships[1].trapLock, 0);
  assert.equal(miss.traps.length, 0);
  const wall = active();
  wall.ships[0].angle = Math.PI;
  stepMatch(wall, [trap, NEUTRAL]);
  tick(wall, 30);
  assert.equal(wall.traps.length, 0);
});

test("repeat hits cannot refresh a lock or bypass post-release immunity", () => {
  const m = active();
  catchTarget(m);
  const target = m.ships[1];
  const injectHit = () => m.traps.push({ id: m.nextTrap++, owner: 0,
    x: target.x - 0.2, y: target.y, vx: TRAP_RULES.speed, vy: 0, angle: 0, life: 1 });
  tick(m, 10);
  const previous = target.trapLock;
  injectHit();
  stepMatch(m);
  assert.ok(target.trapLock < previous);
  tick(m, 51);
  assert.equal(target.trapLock, 0);
  assert.ok(target.trapImmunity > 0);
  injectHit();
  stepMatch(m);
  assert.equal(target.trapLock, 0);
  tick(m, 100);
  injectHit();
  stepMatch(m);
  assert.equal(target.trapLock, TRAP_RULES.lockSeconds);
});

test("destroyed terrain stops blocking traps and spun ships emit bounded network angles", () => {
  const m = active();
  m.obstacles = [{ x: 20, y: 12, radius: 1, hp: 0 }];
  m.ships[0].angle = Math.PI * 20;
  stepMatch(m, [trap, NEUTRAL]);
  assert.ok(cleanSnapshot(snapshot(m), 1));
  catchTarget(m);
});

test("round completion clears clamps and rematch resets recharge, locks and held inputs", () => {
  const m = active();
  catchTarget(m);
  m.remaining = RULES.step;
  stepMatch(m, [NEUTRAL, trap]);
  assert.equal(m.phase, "finished");
  assert.equal(m.traps.length, 0);
  assert.ok(m.ships.every(s => s.trapLock === 0 && s.trapImmunity === 0));
  const fresh = createMatch(1, 2);
  assert.ok(fresh.ships.every(s => s.trapCooldown === 0 && s.trapLock === 0 && !s.trapHeld));
  assert.equal(fresh.traps.length, 0);
});

test("protocol carries trap state and rejects forged types, timers, owners and excess projectiles", () => {
  assert.equal(inputControls({ ...NEUTRAL, trap: true }).trap, true);
  assert.equal(inputControls({ turn: 0, thrust: false, fire: false, brake: false }).trap, false);
  for (const trap of [1, null, "true", {}, NaN]) assert.equal(inputControls({ ...NEUTRAL, trap }), null);
  assert.equal(inputControls({ ...NEUTRAL, trapLock: 0.85 }), null);
  const m = active();
  stepMatch(m, [trap, NEUTRAL]);
  const s = snapshot(m), clean = cleanSnapshot(s, 1);
  assert.deepEqual(clean.traps, s.traps);
  assert.equal(clean.ships[0].trapCooldown, 12);
  for (const [field, max] of [["trapCooldown", 12], ["trapLock", 0.85], ["trapImmunity", 2.35]]) {
    for (const bad of [-1, max + 0.01, NaN, Infinity, "1", null]) {
      const corrupt = structuredClone(s);
      corrupt.ships[0][field] = bad;
      assert.equal(cleanSnapshot(corrupt, 1), null, `${field} must reject ${bad}`);
    }
  }
  for (const bad of [null, {}, [s.traps[0], s.traps[0]], Array(3).fill(s.traps[0]),
    [{ ...s.traps[0], owner: 2 }], [{ ...s.traps[0], x: NaN }], [{ ...s.traps[0], angle: Infinity }]]) {
    assert.equal(cleanSnapshot({ ...s, traps: bad }, 1), null);
  }
  const legacy = structuredClone(s);
  delete legacy.traps;
  for (const ship of legacy.ships) for (const key of ["trapCooldown", "trapLock", "trapImmunity"]) delete ship[key];
  assert.deepEqual(cleanSnapshot(legacy, 1).traps, []);
  assert.equal(cleanSnapshot(legacy, 1).ships[0].trapLock, 0);
});

test("trap replay stays deterministic and every emitted snapshot fits the protocol", () => {
  const a = active(), b = active();
  for (let i = 0; i < 1500; i++) {
    const inputs = [{ ...NEUTRAL, trap: i % 780 < 120 }, { ...NEUTRAL, trap: i % 900 < 120 }];
    stepMatch(a, inputs); stepMatch(b, inputs);
    assert.ok(cleanSnapshot(snapshot(a), 1), `snapshot at ${i}`);
  }
  assert.deepEqual(a, b);
});

test("controller LT is independent of primary fire and requires neutral after focus loss", () => {
  const reader = createGamepadReader();
  const pad = { index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ value: 0, pressed: false })) };
  reader.poll([pad]);
  pad.buttons[6].value = 1;
  assert.equal(reader.poll([pad]).trap, true);
  assert.equal(reader.poll([pad]).shoot, false);
  pad.buttons[7].value = 1;
  assert.equal(reader.poll([pad]).shoot, true);
  reader.suspend();
  assert.equal(reader.poll([pad]).trap, false);
  pad.buttons[6].value = pad.buttons[7].value = 0;
  reader.poll([pad]);
  pad.buttons[6].value = 0.8;
  assert.equal(reader.poll([pad]).trap, true);
});
