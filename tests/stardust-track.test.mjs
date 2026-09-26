import test from "node:test";
import assert from "node:assert/strict";
import { createLevelLayout } from "../projects/Space-Shooter/engine/levels.js";
import { generateLevelNodes } from "../projects/Space-Shooter/data.js";
import { state, config } from "../projects/Space-Shooter/state.js";
import { handlePlayerMovement } from "../projects/Space-Shooter/engine/systems/movement.js";
import {
  applyGravity,
  resolveHazards,
  updateHazards,
  updateDrones,
  resolveRoadmapProjectiles,
} from "../projects/Space-Shooter/engine/systems/environment.js";
import {
  createTrackProgress,
  updateTrackProgress,
  isLapReady,
  constrainToTrack,
  isInsideTrack,
  pointOnTrack,
  portalCoordinates,
} from "../projects/Space-Shooter/engine/track.js";
import {
  isBacksideArenaEntry,
  secretEligible,
  hasRequiredShards,
} from "../projects/Space-Shooter/engine/rules.js";

function sceneFor(level) {
  const scene = createLevelLayout(level),
    portal = scene.track.portal;
  return {
    ...scene,
    level,
    player: {
      x: portal.x,
      y: portal.y,
      vx: 0,
      vy: 0,
      angle: portal.angle,
      hp: 100,
      invulnTimer: 0,
    },
    startPos: { x: portal.x, y: portal.y },
    lockedInStart: false,
    launched: true,
    fuel: 100,
    flux: 30,
    boost: 3,
    elapsed: 0,
    trackProgress: createTrackProgress(),
    shards: new Set(),
    activeMs: 0,
    timerRunning: false,
  };
}
for (let level = 1; level <= 5; level++) {
  test(`circuit ${level} has deterministic apex signals, one portal, sized obstacles and a connected corridor`, () => {
    const scene = createLevelLayout(level),
      track = scene.track;
    assert.equal(
      track.inspiration,
      ["Laguna Seca", "Silverstone", "Monza", "Monaco", "Spa-Francorchamps"][
        level - 1
      ],
    );
    assert.deepEqual(
      generateLevelNodes(level, null, "one"),
      generateLevelNodes(level, null, "two"),
    );
    const start = scene.nodes.find((n) => n.kind === "start"),
      gate = scene.nodes.find((n) => n.kind === "gate");
    assert.equal(start.x, gate.x);
    assert.equal(start.y, gate.y);
    assert.ok(track.width >= 5.8);
    assert.ok(track.length > 95);
    for (const point of track.points) {
      assert.ok(
        point.x - track.width / 2 > 0 && point.x + track.width / 2 < 48,
      );
      assert.ok(
        point.y - track.width / 2 > 0 && point.y + track.width / 2 < 32,
      );
    }
    for (const node of scene.nodes) {
      assert.ok(
        isInsideTrack(track, node.x + 0.5, node.y + 0.5, config.PLAYER_RADIUS),
        `${node.kind} outside corridor`,
      );
      for (const h of scene.hazards)
        assert.ok(
          Math.hypot(node.x + 0.5 - h.x, node.y + 0.5 - h.y) >
            h.radius + config.PLAYER_RADIUS + 0.1,
        );
    }
    for (const h of scene.hazards) {
      assert.ok(h.sizeScale >= 0.75 && h.sizeScale <= 1.25);
      assert.equal(h.radius, h.baseRadius * h.sizeScale);
    }
    // Continuous centerline and central racing lane remain drivable along the entire lap.
    for (let d = 0; d < track.length; d += 0.1) {
      const p = pointOnTrack(track, d);
      assert.ok(isInsideTrack(track, p.x, p.y, config.PLAYER_RADIUS));
    }
    // Nonlocal portions do not merge into an infield shortcut; local corner cutting is intentional.
    for (let a = 0; a < track.length; a += 1)
      for (let b = a + 20; b < track.length; b += 1) {
        if (track.length - (b - a) < 20) continue;
        const p = pointOnTrack(track, a),
          q = pointOnTrack(track, b);
        assert.ok(
          Math.hypot(p.x - q.x, p.y - q.y) > track.width,
          `nonlocal lanes merge at ${a},${b}`,
        );
      }
  });
}
test("swept rails block a cross-infield move even when its endpoint is on another valid lane", () => {
  const scene = sceneFor(1),
    track = scene.track;
  const previous = { x: 25, y: 25 },
    player = { x: 24, y: 5, vx: 0, vy: -15 };
  assert.ok(isInsideTrack(track, player.x, player.y, config.PLAYER_RADIUS));
  assert.equal(
    constrainToTrack(track, player, previous, config.PLAYER_RADIUS),
    true,
  );
  assert.ok(player.y > 20);
  assert.ok(isInsideTrack(track, player.x, player.y, config.PLAYER_RADIUS));
  assert.ok(player.vy > 0);
});
test("authored asteroid sizes include both requested limits and remain deterministic on retry", () => {
  const sizes = [];
  for (let level = 1; level <= 5; level++) {
    const first = createLevelLayout(level).hazards,
      retry = createLevelLayout(level).hazards;
    assert.deepEqual(first, retry);
    sizes.push(...first.map((h) => h.sizeScale));
  }
  assert.equal(Math.min(...sizes), 0.75);
  assert.equal(Math.max(...sizes), 1.25);
});
test("rear-entry rules rotate with the portal instead of relying on world east/west", () => {
  const scene = sceneFor(5);
  scene.shards = new Set(
    scene.nodes.filter((n) => n.kind === "planet").map((n) => n.id),
  );
  Object.assign(scene.trackProgress, {
    lapStarted: true,
    nextCheckpoint: scene.track.checkpoints.length,
    distance: scene.track.length,
  });
  const portal = scene.track.portal;
  Object.assign(portal, { tx: 0, ty: -1, nx: 1, ny: 0, angle: -Math.PI / 2 });
  Object.assign(scene.player, {
    x: portal.x,
    y: portal.y - 0.4,
    vx: 0,
    vy: 1,
    angle: Math.PI / 2,
  });
  const gate = scene.nodes.find((n) => n.kind === "gate");
  assert.equal(isBacksideArenaEntry(gate, scene, 0), true);
  scene.player.vy = -1;
  assert.equal(isBacksideArenaEntry(gate, scene, 0), false);
});
test("spawn, reverse checkpoint crossing, skipped checkpoints and teleports cannot manufacture a lap", () => {
  const scene = sceneFor(5),
    cp = scene.track.checkpoints[0];
  assert.equal(isLapReady(scene), false);
  scene.shards = new Set(
    scene.nodes.filter((n) => n.kind === "planet").map((n) => n.id),
  );
  assert.equal(secretEligible(scene, 0), false);
  scene.trackProgress.lapStarted = true;
  scene.player.x = cp.x - cp.tx * 0.1;
  scene.player.y = cp.y - cp.ty * 0.1;
  updateTrackProgress(scene, { x: cp.x + cp.tx * 0.1, y: cp.y + cp.ty * 0.1 });
  assert.equal(scene.trackProgress.passed, 0);
  const wrong = scene.track.checkpoints[5];
  scene.player.x = wrong.x + wrong.tx * 0.1;
  scene.player.y = wrong.y + wrong.ty * 0.1;
  updateTrackProgress(scene, {
    x: wrong.x - wrong.tx * 0.1,
    y: wrong.y - wrong.ty * 0.1,
  });
  assert.equal(scene.trackProgress.passed, 0);
  scene.player.x = cp.x + cp.tx;
  scene.player.y = cp.y + cp.ty;
  updateTrackProgress(scene, { x: cp.x - cp.tx, y: cp.y - cp.ty });
  assert.equal(scene.trackProgress.passed, 0);
});
test("lap proof requires every checkpoint in forward order and actual distance travelled", () => {
  const scene = sceneFor(2),
    track = scene.track;
  let previous = { ...scene.player };
  for (let d = 0.1; d < track.length - 0.1; d += 0.1) {
    const p = pointOnTrack(track, d);
    scene.player.x = p.x;
    scene.player.y = p.y;
    updateTrackProgress(scene, previous);
    previous = { x: p.x, y: p.y };
  }
  assert.equal(scene.trackProgress.passed, track.checkpoints.length);
  assert.equal(isLapReady(scene), true);
  scene.trackProgress.distance = 1;
  assert.equal(isLapReady(scene), false);
});
test("destroying a scaled asteroid removes its collision, and infield rails absorb shots", () => {
  const scene = sceneFor(1),
    rock = scene.hazards[0];
  for (let hit = 0; hit < 2; hit++)
    resolveRoadmapProjectiles(scene, [
      { owner: "player", x: rock.x, y: rock.y, prevX: rock.x, prevY: rock.y },
    ]);
  assert.equal(rock.hp, 0);
  assert.equal(rock.destroyedAt, 0);
  const ship = { x: rock.x, y: rock.y, vx: 0, vy: 0, hp: 100 };
  resolveHazards(scene, ship);
  assert.equal(ship.x, rock.x);
  assert.equal(ship.y, rock.y);
  const shots = [{ owner: "player", prevX: 25, prevY: 25, x: 24, y: 5 }];
  resolveRoadmapProjectiles(scene, shots);
  assert.equal(shots.length, 0);
});

/** Closed-loop pilot: only turn/thrust inputs, real hazards, gravity, enemies and rails. */
function flyLap(level, rear = false) {
  const scene = sceneFor(level),
    player = scene.player,
    gate = scene.nodes.find((n) => n.kind === "gate"),
    portal = scene.track.portal;
  const at = (forward, lateral) => ({
    x: portal.x + portal.tx * forward + portal.nx * lateral,
    y: portal.y + portal.ty * forward + portal.ny * lateral,
  });
  const path = rear
    ? [
        ...scene.safeRoute.slice(0, -1),
        at(-2, 1.7),
        at(2, 1.7),
        at(2, 0),
        at(-2, 0),
      ]
    : scene.safeRoute;
  state.mode = "roadmap";
  state.ui.countdownActive = false;
  state.gfx.particles = [];
  const shots = [];
  let target = 1,
    time = 0,
    finished = false;
  for (; time < 60 && target < path.length; time += 1 / 120) {
    const goal = path[target],
      dx = goal.x - player.x,
      dy = goal.y - player.y,
      d = Math.hypot(dx, dy);
    if (d < 0.3) {
      target++;
      continue;
    }
    const desiredSpeed = Math.min(4, Math.sqrt(5 * d));
    const ax = ((dx / d) * desiredSpeed - player.vx) * 2,
      ay = ((dy / d) * desiredSpeed - player.vy) * 2;
    let error = Math.atan2(ay, ax) - player.angle;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    Object.assign(state.keys, {
      launch: false,
      boost: false,
      brake: false,
      left: false,
      right: false,
      turnStrength: Math.max(-1, Math.min(1, error * 2)),
      thrustStrength:
        Math.abs(error) < 0.35 ? Math.min(1, Math.hypot(ax, ay) / 5) : 0,
      backStrength: 0,
      strafeLeft: false,
      strafeRight: false,
    });
    const previous = { x: player.x, y: player.y };
    updateHazards(scene, 1 / 120);
    applyGravity(player, scene.gravityWells, 1 / 120);
    handlePlayerMovement(1 / 120, scene, player, {
      onFuelUse: (amount) => (scene.fuel -= amount),
    });
    resolveHazards(scene, player);
    constrainToTrack(scene.track, player, previous, config.PLAYER_RADIUS);
    updateTrackProgress(scene, previous);
    player.invulnTimer = Math.max(0, player.invulnTimer - 1 / 120);
    updateDrones(scene, player, shots, 1 / 120);
    for (let i = shots.length - 1; i >= 0; i--) {
      const shot = shots[i];
      shot.prevX = shot.x;
      shot.prevY = shot.y;
      shot.x += shot.vx / 120;
      shot.y += shot.vy / 120;
      shot.life -= 1 / 120;
      if (shot.life <= 0) shots.splice(i, 1);
    }
    resolveRoadmapProjectiles(scene, shots);
    for (const node of scene.nodes.filter((n) => n.kind === "planet"))
      if (
        Math.hypot(player.x - node.x - 0.5, player.y - node.y - 0.5) <=
        config.PLANET_RADIUS + config.PLAYER_RADIUS
      )
        scene.shards.add(node.id);
    scene.activeMs = time * 1000;
    const relative = portalCoordinates(scene.track, player);
    const ordinary =
      isLapReady(scene) &&
      hasRequiredShards(scene) &&
      Math.hypot(relative.forward, relative.lateral) <= config.GATE_RADIUS &&
      relative.forward < -0.12 &&
      relative.velocity > 0.15;
    if (rear && ordinary)
      throw new Error("Secret pilot accidentally triggered the ordinary exit");
    if (rear ? isBacksideArenaEntry(gate, scene, 0) : ordinary) {
      finished = true;
      break;
    }
    assert.ok(
      isInsideTrack(scene.track, player.x, player.y, config.PLAYER_RADIUS),
    );
  }
  return { scene, time, finished };
}
for (let level = 1; level <= 5; level++)
  test(`full circuit ${level}: controls fly all checkpoints and apexes back to original portal under60`, (t) => {
    const { scene, time, finished } = flyLap(level);
    assert.ok(
      finished,
      `lap incomplete after ${time}s; checkpoint ${scene.trackProgress.passed}`,
    );
    assert.equal(scene.trackProgress.passed, scene.track.checkpoints.length);
    assert.ok(hasRequiredShards(scene));
    assert.ok(scene.fuel > 25);
    assert.ok(scene.player.hp > 0);
    assert.ok(time < 60);
    t.diagnostic(
      `${scene.track.inspiration}: ${time.toFixed(2)}s, fuel ${scene.fuel.toFixed(1)}, hull ${scene.player.hp.toFixed(1)}, rail contacts ${scene.trackProgress.boundaryHits}`,
    );
  });
test("Spa-inspired L5 genuine full lap permits an intentional under60 rear entry", (t) => {
  const { scene, time, finished } = flyLap(5, true);
  assert.ok(finished, `rear entry failed after ${time}s`);
  assert.ok(scene.player.hp > 0);
  assert.ok(time < 60);
  assert.ok(isLapReady(scene));
  t.diagnostic(
    `Full lap plus portal bypass/rear entry: ${time.toFixed(2)}s, fuel ${scene.fuel.toFixed(1)}, hull ${scene.player.hp.toFixed(1)}`,
  );
});
