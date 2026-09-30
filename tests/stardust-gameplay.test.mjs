import test from "node:test";
import assert from "node:assert/strict";
import {
  createLevelLayout,
  LEVELS,
} from "../projects/Space-Shooter/engine/levels.js";
import { generateLevelNodes } from "../projects/Space-Shooter/data.js";
import { state, config } from "../projects/Space-Shooter/state.js";
import { handlePlayerMovement } from "../projects/Space-Shooter/engine/systems/movement.js";
import { shipTouchesCircle } from "../projects/Space-Shooter/engine/hull.js";
import {
  motionPosition,
  updateHazards,
  applyGravity,
  resolveHazards,
  updateDrones,
  predictAim,
  resolveRoadmapProjectiles,
  updateFlux,
  segmentHitsCircle,
} from "../projects/Space-Shooter/engine/systems/environment.js";
import {
  ensureCamera,
  updateCamera,
} from "../projects/Space-Shooter/engine/systems/camera.js";
import {
  secretEligible,
  isBacksideArenaEntry,
  levelElapsedMs,
} from "../projects/Space-Shooter/engine/rules.js";

test("moving hazards are bounded and periodic, not random on retry", () => {
  for (let level = 1; level <= 5; level++)
    for (const h of createLevelLayout(level).hazards.filter((h) => h.motion)) {
      const p = motionPosition(h, 2.75),
        again = motionPosition(h, 2.75 + h.motion.period);
      assert.ok(Math.hypot(p.x - again.x, p.y - again.y) < 1e-8);
      assert.ok(
        Math.hypot(p.x - h.motion.originX, p.y - h.motion.originY) <=
          h.motion.amplitude + 1e-8,
      );
    }
});
function fly(frameDt) {
  state.mode = "roadmap";
  state.ui.countdownActive = false;
  state.gfx.particles = [];
  Object.assign(state.keys, {
    left: false,
    right: false,
    turnStrength: 0.3,
    thrustStrength: 1,
    backStrength: 0,
    strafeLeft: false,
    strafeRight: false,
    boost: false,
    launch: false,
    brake: false,
  });
  const scene = {
    startPos: { x: 16, y: 9 },
    lockedInStart: false,
    launched: true,
    fuel: 100,
    boost: 3,
    flux: 0,
  };
  const player = { x: 16, y: 9, vx: 0, vy: 0, angle: 0 };
  for (let t = 0; t < 2 - 1e-8; t += frameDt)
    handlePlayerMovement(frameDt, scene, player);
  return player;
}
test("flight is stable across 20, 30, 60 and 120 fps", () => {
  const baseline = fly(1 / 120);
  for (const dt of [1 / 20, 1 / 30, 1 / 60]) {
    const p = fly(dt);
    for (const key of ["x", "y", "vx", "vy", "angle"])
      assert.ok(Math.abs(p[key] - baseline[key]) < 1e-8, `${dt}: ${key}`);
  }
});
test("extreme dt and gravity-core overlap stay finite and below speed cap", () => {
  const p = { x: 16, y: 9, vx: 0, vy: 0, angle: 0, hp: 100 };
  const scene = {
    startPos: { x: 16, y: 9 },
    lockedInStart: false,
    launched: true,
    fuel: 100,
    boost: 3,
    flux: 0,
    hazards: [],
    gravityWells: [{ x: 16, y: 9, radius: 1.2, influence: 6, strength: 10 }],
  };
  applyGravity(p, scene.gravityWells, 1 / 120);
  resolveHazards(scene, p);
  // The ship's real body (engine/hull.js) is pushed clear of the core.
  assert.ok(!shipTouchesCircle(p, 16, 9, 1.2), 'the hull is clear of the well core');
  handlePlayerMovement(99, scene, p);
  assert.ok(Object.values(p).every(Number.isFinite));
  assert.ok(Math.hypot(p.vx, p.vy) <= config.MAX_SPEED + 1e-6);
  assert.ok(Math.hypot(p.x - 16, p.y - 9) > 1.2);
});
test("gravity attracts, leaves exterior coasting untouched, and bounded core is not singular", () => {
  const well = { x: 10, y: 10, radius: 1.2, influence: 6, strength: 10 };
  const p = { x: 13, y: 10, vx: 0, vy: 2 };
  applyGravity(p, [well], 0.1);
  assert.ok(p.vx < 0);
  assert.equal(p.vy, 2);
  const out = { x: 20, y: 10, vx: 0, vy: 2 };
  applyGravity(out, [well], 0.1);
  assert.equal(out.vx, 0);
});
test("flux rewards movement and emergency retro burn spends it to reduce speed", () => {
  const scene = { flux: 0 },
    p = { vx: 8, vy: 0, angle: Math.PI / 2 };
  updateFlux(scene, p, 1);
  assert.ok(scene.flux > 0);
  const before = scene.flux;
  updateFlux(scene, p, 0.1, true);
  assert.ok(scene.flux < before);
  assert.ok(p.vx < 8);
  scene.flux = 0;
  const speed = p.vx;
  updateFlux(scene, p, 1, true);
  assert.equal(p.vx, speed);
});
test("sentinels telegraph a fixed predictive shot and do not home or shoot through cover", () => {
  const drone = { x: 2, y: 2, hp: 100, state: "patrol", cooldown: 0 };
  const player = { x: 6, y: 2, vx: 0, vy: 2 };
  const scene = { drones: [drone], hazards: [], gravityWells: [], elapsed: 0 },
    shots = [];
  updateDrones(scene, player, shots, 0.01);
  assert.equal(drone.state, "telegraph");
  assert.equal(shots.length, 0);
  assert.ok(drone.aimY > player.y);
  const lockedY = drone.aimY;
  player.vy = -3;
  updateDrones(scene, player, shots, 0.4);
  assert.equal(drone.aimY, lockedY);
  assert.equal(shots.length, 0);
  updateDrones(scene, player, shots, 0.41);
  assert.equal(shots.length, 1);
  assert.ok(shots[0].vy > 0);
  drone.state = "patrol";
  drone.cooldown = 0;
  scene.hazards = [{ x: 4, y: 2, radius: 1 }];
  updateDrones(scene, player, shots, 0.1);
  assert.equal(drone.state, "patrol");
  assert.ok(Number.isFinite(predictAim(drone, { x: 6, y: 2, vx: 6, vy: 0 }).x));
});
test("projectiles sweep through targets; solid cover absorbs before damage", () => {
  const scene = {
    hazards: [],
    gravityWells: [],
    drones: [{ x: 5, y: 2, radius: 0.55, hp: 100 }],
    player: { x: 9, y: 2, hp: 100 },
  };
  const shot = () => ({ owner: "player", prevX: 3, prevY: 2, x: 7, y: 2 });
  let shots = [shot()];
  resolveRoadmapProjectiles(scene, shots);
  assert.equal(scene.drones[0].hp, 50);
  assert.equal(shots.length, 0);
  scene.hazards = [{ x: 4, y: 2, radius: 1 }];
  shots = [shot()];
  resolveRoadmapProjectiles(scene, shots);
  assert.equal(scene.drones[0].hp, 50);
});
function eligible() {
  const l = createLevelLayout(5);
  return {
    ...l,
    level: 5,
    shards: new Set(
      l.nodes.filter((n) => n.kind === "planet").map((n) => n.id),
    ),
    launched: true,
    completed: false,
    trackProgress: {
      nextCheckpoint: l.track.checkpoints.length,
      passed: l.track.checkpoints.length,
      lapStarted: true,
      distance: l.track.length,
    },
    activeMs: 59000,
    timerRunning: true,
    t0: 1000,
    fuel: 50,
    player: {
      x: l.track.portal.x + 0.6,
      y: l.track.portal.y,
      vx: -2,
      vy: 0,
      angle: Math.PI,
    },
  };
}
test("secret demands every actual shard, L5, under 60 seconds at entry, fuel and inward rear velocity", () => {
  const lv = eligible(),
    gate = lv.nodes.find((n) => n.kind === "gate");
  assert.equal(levelElapsedMs(lv, 1500), 59500);
  assert.equal(isBacksideArenaEntry(gate, lv, 1500), true);
  assert.equal(isBacksideArenaEntry(gate, lv, 2000), false); // exact 60s is not sub60
  lv.player.vx = 2;
  assert.equal(isBacksideArenaEntry(gate, lv, 1500), false);
  lv.player.vx = -2;
  lv.player.x = lv.track.portal.x - 0.4;
  assert.equal(isBacksideArenaEntry(gate, lv, 1500), false);
  lv.player.x = lv.track.portal.x + 0.6;
  lv.shards.delete("L5-S1");
  lv.shards.add("unrelated");
  assert.equal(secretEligible(lv, 1500), false);
  const other = eligible();
  other.level = 4;
  assert.equal(secretEligible(other, 1500), false);
  const dry = eligible();
  dry.fuel = 0;
  assert.equal(secretEligible(dry, 1500), false);
});

test("partial or stale camera state cannot produce NaN after launch", () => {
  state.gfx.camera = { x: 0, y: 0, zoom: 1.85 };
  updateCamera(1 / 60, { x: 2.5, y: 9.5, angle: 0, vx: 3.5, vy: 0 });
  assert.ok(
    ["x", "y", "rot", "zoom"].every((k) =>
      Number.isFinite(state.gfx.camera[k]),
    ),
  );
  state.gfx.camera.rot = NaN;
  ensureCamera();
  assert.equal(state.gfx.camera.rot, 0);
});

test("portrait camera keeps a fast ship inside the central half of the screen", () => {
  const original = {
    canvas: state.gfx.canvas,
    cellW: state.gfx.cellW,
    dpr: state.gfx.dpr,
  };
  state.gfx.canvas = { width: 390, height: 844 };
  state.gfx.cellW = 844 / 18;
  state.gfx.dpr = 1;
  state.gfx.camera = { x: 20, y: 20, rot: 0, zoom: 1.85 };
  const player = { x: 2.5, y: 9.5, angle: 0, vx: 15, vy: 0 };
  updateCamera(1 / 60, player);
  const camera = state.gfx.camera;
  const sx = 195 + (player.x - camera.x) * state.gfx.cellW * camera.zoom;
  const sy = 422 + (player.y - camera.y) * state.gfx.cellW * camera.zoom;
  assert.ok(sx >= 97.49 && sx <= 292.51);
  assert.ok(sy >= 210.99 && sy <= 633.01);
  Object.assign(state.gfx, original);
});
