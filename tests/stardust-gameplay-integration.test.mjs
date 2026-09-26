import test from "node:test";
import assert from "node:assert/strict";
// Lightweight DOM doubles allow the actual browser module graph and mode APIs to run in Node.
// These tests exercise game state, not canvas visual acceptance.
const noOp = () => {};
const element = () => ({
  getContext: () => ({}),
  focus: noOp,
  appendChild: noOp,
  dataset: {},
  pause: noOp,
  play: () => Promise.resolve(),
  classList: { toggle: noOp, add: noOp, remove: noOp },
});
const canvas = element();
globalThis.document = {
  getElementById: (id) => (id === "starmap-canvas" ? canvas : null),
  querySelector: () => null,
  addEventListener: noOp,
  createElement: element,
  body: { classList: { toggle: noOp } },
  fullscreenElement: null,
};
globalThis.window = {
  addEventListener: noOp,
  removeEventListener: noOp,
  dispatchEvent: noOp,
  devicePixelRatio: 1,
};
globalThis.CustomEvent = class {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = noOp;
globalThis.sessionStorage = { getItem: () => null, removeItem: noOp };
const { state, config } = await import("../projects/Space-Shooter/state.js");
const { buildLevel, updateRoadmap, outOfFuel, tryFinishLevel } = await import(
  "../projects/Space-Shooter/engine/modes/roadmap.js"
);
const { buildArena, updateArena, completeArenaVictory } = await import(
  "../projects/Space-Shooter/engine/modes/arena.js"
);
const { checkArenaCollisions } = await import(
  "../projects/Space-Shooter/engine/collisions/arena.js"
);
const { retryRun, exitArena } = await import(
  "../projects/Space-Shooter/engine/modeManager.js"
);
const { getMusicStatus } = await import("../projects/Space-Shooter/audio.js");
function reset() {
  state.mode = "roadmap";
  state.arena = null;
  state.run = {
    runId: "test",
    totalActiveMs: 0,
    levelIndex: 1,
    seeds: ["a", "b", "c", "d", "e"],
  };
  Object.assign(state.ui, {
    paused: false,
    showStartOverlay: false,
    showEndOverlay: false,
    countdownActive: false,
  });
  Object.assign(state.keys, {
    turnStrength: 0,
    thrustStrength: 0,
    backStrength: 0,
    left: false,
    right: false,
    launch: false,
    boost: false,
    shoot: false,
    brake: false,
    strafeLeft: false,
    strafeRight: false,
  });
  state.gfx.projectiles = [];
  state.gfx.particles = [];
}
test("real mode import graph, launch, pause and retry preserve intended lifecycle", () => {
  reset();
  buildLevel(1);
  const lv = state.run.current;
  state.keys.launch = true;
  updateRoadmap(1 / 60);
  assert.equal(lv.launched, true);
  assert.equal(lv.timerRunning, true);
  assert.ok(lv.player.vx > 0);
  state.ui.paused = true;
  const x = lv.player.x;
  updateRoadmap(0.05);
  assert.equal(lv.player.x, x);
  assert.equal(lv.timerRunning, false);
  state.run.totalActiveMs = 80000;
  retryRun();
  assert.equal(state.run.totalActiveMs, 0);
  assert.equal(state.run.current.level, 1);
  assert.equal(state.run.current.shards.size, 0);
  assert.equal(state.run.current.trackProgress.passed, 0);
  assert.equal(state.run.current.trackProgress.distance, 0);
  assert.equal(state.ui.countdownActive, true);
});
test("fuel failure retains spent time and adds penalty instead of resetting secret timer", () => {
  reset();
  buildLevel(5);
  const lv = state.run.current;
  lv.launched = true;
  lv.activeMs = 35000;
  lv.trackProgress.passed = 3;
  lv.trackProgress.nextCheckpoint = 3;
  state.run.totalActiveMs = 35000;
  outOfFuel();
  assert.equal(state.run.current.activeMs, 65000);
  assert.equal(state.run.totalActiveMs, 65000);
  assert.equal(state.run.current.fuel, 100);
  assert.equal(state.run.current.trackProgress.passed, 0);
  assert.equal(state.run.current.trackProgress.nextCheckpoint, 0);
});
test("the actual finish API rejects a full shard inventory without lap proof", () => {
  reset();
  buildLevel(1);
  const lv = state.run.current;
  lv.launched = true;
  lv.shards = new Set(
    lv.nodes.filter((n) => n.kind === "planet").map((n) => n.id),
  );
  tryFinishLevel();
  assert.equal(state.run.current, lv);
  assert.equal(lv.completed, false);
});
// The Warden fight is switched off (runtime-config bossFight: false), so a lap
// that meets the secret's conditions keeps Iron Veil's own music and cue. The
// conditions themselves are still covered by the secretEligible test.
test("each sector selects its cue, and with the boss fight off the secret never wakes", () => {
  reset();
  for (let level = 1; level <= 5; level++) {
    buildLevel(level);
    assert.equal(getMusicStatus().requested, `level${level}`);
  }
  const lv = state.run.current;
  lv.lockedInStart = false;
  lv.launched = true;
  lv.shards = new Set(
    lv.nodes.filter((node) => node.kind === "planet").map((node) => node.id),
  );
  Object.assign(lv.trackProgress, {
    nextCheckpoint: lv.track.checkpoints.length,
    passed: lv.track.checkpoints.length,
    lapStarted: true,
    distance: lv.track.length,
  });
  updateRoadmap(1 / 60);
  assert.equal(lv.secretReady, false);
  assert.equal(getMusicStatus().requested, "level5");
});
test("arena moves with unlimited fuel; full generators never consume carried shards", () => {
  reset();
  state.mode = "arena";
  buildArena();
  state.ui.countdownActive = false;
  const a = state.arena;
  state.keys.launch = true;
  state.keys.thrustStrength = 1;
  updateArena(1 / 20);
  assert.equal(a.combatActive, true);
  assert.ok(Math.hypot(a.player.vx, a.player.vy) > 3.5);
  assert.equal(a.fuel, Infinity);
  a.player.x = a.generators[0].x;
  a.player.y = a.generators[0].y;
  a.generators[0].shardsDeposited = 2;
  a.player.shardsCarried = 2;
  checkArenaCollisions();
  assert.equal(a.player.shardsCarried, 2);
  a.player.x = a.generators[1].x;
  a.player.y = a.generators[1].y;
  checkArenaCollisions();
  assert.equal(a.player.shardsCarried, 0);
  assert.equal(a.boss.shielded, false);
});
test("arena seal requires dead boss plus special shard and exit freezes residual roadmap motion", async () => {
  reset();
  buildLevel(5);
  state.mode = "arena";
  buildArena();
  const a = state.arena;
  await completeArenaVictory();
  assert.notEqual(a.victoryPresented, true);
  a.boss.state = "dead";
  await completeArenaVictory();
  assert.notEqual(a.victoryPresented, true);
  // Rendering a seal is parent UI scope; guard path is tested without opening a fake DOM panel.
  state.run.current.player.vx = -8;
  exitArena("loss");
  assert.equal(state.mode, "roadmap");
  assert.equal(state.ui.paused, true);
  assert.equal(state.run.current.player.vx, 0);
  assert.equal(state.arena, null);
});

test("arena objective locations are reachable around cover and remain inside the octagonal walls", () => {
  reset();
  state.mode = "arena";
  buildArena();
  const a = state.arena;
  const clear = (x, y) => {
    if (
      a.cover.some(
        (c) =>
          x > c.x - c.w / 2 - 0.45 &&
          x < c.x + c.w / 2 + 0.45 &&
          y > c.y - c.h / 2 - 0.45 &&
          y < c.y + c.h / 2 + 0.45,
      )
    )
      return false;
    return a.walls.every((w) => {
      const dx = w.x2 - w.x1,
        dy = w.y2 - w.y1;
      return (dx * (y - w.y1) - dy * (x - w.x1)) / Math.hypot(dx, dy) > 0.45;
    });
  };
  const visited = new Set(),
    queue = [[a.startPos.x * 2, a.startPos.y * 2]];
  visited.add(queue[0].join(","));
  assert.ok(clear(a.startPos.x, a.startPos.y));
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = queue[i][0] + dx,
        y = queue[i][1] + dy,
        key = `${x},${y}`;
      if (!visited.has(key) && clear(x / 2, y / 2)) {
        visited.add(key);
        queue.push([x, y]);
      }
    }
  for (const objective of [...a.shards, ...a.generators])
    assert.ok(visited.has(`${objective.x * 2},${objective.y * 2}`));
});
test("actual arena collision sequence blocks shield damage, opens shield, drops and collects special shard", () => {
  reset();
  state.mode = "arena";
  buildArena();
  const a = state.arena;
  a.boss.x = 20;
  a.boss.y = 16;
  a.boss.state = "idle_shielded";
  state.gfx.projectiles = [{ owner: "player", x: 20, y: 16 }];
  checkArenaCollisions();
  assert.equal(a.boss.hp, config.BOSS_MAX_HP);
  for (const generator of a.generators) {
    a.player.x = generator.x;
    a.player.y = generator.y;
    a.player.shardsCarried = 2;
    checkArenaCollisions();
  }
  assert.equal(a.boss.shielded, false);
  state.gfx.projectiles = Array.from({ length: 10 }, () => ({
    owner: "player",
    x: 20,
    y: 16,
  }));
  checkArenaCollisions();
  assert.equal(a.boss.state, "dead");
  assert.ok(a.encryptedShard);
  assert.equal(a.hasEncryptedShard, false);
  a.player.x = a.encryptedShard.x;
  a.player.y = a.encryptedShard.y;
  checkArenaCollisions();
  assert.equal(a.hasEncryptedShard, true);
});
