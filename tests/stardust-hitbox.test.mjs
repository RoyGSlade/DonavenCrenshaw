// The ship's exact-body hitbox: the hull traced from the sprite, the polygon
// maths, the rails (swept, rotation, notches), rocks, shots, pickups and the
// debug overlay. The weekly's physics versions are in stardust-weekly.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_HULL, SHIP_BODY } from '../projects/Space-Shooter/engine/shipHull.js';
import {
  PLAYER_HULL, hullWorld, pointInPolygon, polygonCircle, segmentHitsPolygon,
  shipTouchesCircle, pushShipOutOfCircle, shotHitsShip,
} from '../projects/Space-Shooter/engine/hull.js';
import {
  createTrack, nearestTrackPoint, pointOnTrack, constrainToTrack, hullLaneContact,
  isHullInsideTrack, laneNotches, isInsideTrack,
} from '../projects/Space-Shooter/engine/track.js';
import { createLevelLayout } from '../projects/Space-Shooter/engine/levels.js';
import { resolveHazards, resolveRoadmapProjectiles } from '../projects/Space-Shooter/engine/systems/environment.js';
import { touchesSignal } from '../projects/Space-Shooter/engine/rules.js';
import { config } from '../projects/Space-Shooter/state.js';
import { drawHitboxDebug } from '../projects/Space-Shooter/gfx/hitboxDebug.js';
import { traceHull } from '../scripts/generate-stardust-ship-hull.mjs';

const extent = (i) => [Math.min(...SHIP_HULL.map((v) => v[i])), Math.max(...SHIP_HULL.map((v) => v[i]))];

test('the hull is the sprite: 16-28 vertices spanning the measured 0.87 x 0.95 body', () => {
  assert.ok(SHIP_HULL.length >= 16 && SHIP_HULL.length <= 28, `${SHIP_HULL.length} vertices`);
  const [minX, maxX] = extent(0), [minY, maxY] = extent(1);
  assert.ok(Math.abs(maxX - minX - 0.87) < 0.02, `width ${(maxX - minX).toFixed(3)}`);
  assert.ok(Math.abs(maxY - minY - 0.95) < 0.02, `length ${(maxY - minY).toFixed(3)}`);
  assert.ok(Math.abs(SHIP_BODY.width - 0.87) < 0.01 && Math.abs(SHIP_BODY.length - 0.95) < 0.01);
  // The outline keeps the body's tips: within 0.03 of the measured extents.
  assert.ok(SHIP_BODY.width - (maxX - minX) < 0.03 && SHIP_BODY.length - (maxY - minY) < 0.03);
  // Nose forward (+y) and wing tips out to both sides.
  assert.ok(maxY > 0.45 && minY < -0.4 && minX < -0.4 && maxX > 0.4);
  // Traced at the size the ship is drawn (drawCourier: 1.6 * SHIP_VISUAL_SCALE cells).
  assert.ok(Math.abs(SHIP_BODY.spriteCells - 1.6 * config.SHIP_VISUAL_SCALE) < 1e-4, 'regenerate the hull after changing the ship\'s draw size');
});

test('the committed hull matches a fresh trace of art/player-ship.png', () => {
  const fresh = traceHull();
  assert.deepEqual(fresh.verts, SHIP_HULL.map((v) => [...v]), 'run node scripts/generate-stardust-ship-hull.mjs');
});

test('the hull is a simple counter-clockwise outline around the ship centre', () => {
  const poly = SHIP_HULL.map(([x, y]) => ({ x, y }));
  const area = poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
  assert.ok(area > 0.15, `area ${area.toFixed(3)} (counter-clockwise, x right / y forward)`);
  assert.ok(pointInPolygon(poly, 0, 0), 'the centre is inside the body');
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  for (let i = 0; i < poly.length; i++)
    for (let j = i + 2; j < poly.length; j++) {
      if (i === 0 && j === poly.length - 1) continue; // neighbours through the wrap
      const [a, b, c, d] = [poly[i], poly[(i + 1) % poly.length], poly[j], poly[(j + 1) % poly.length]];
      const cross = side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0;
      assert.ok(!cross, `edges ${i} and ${j} cross`);
    }
  assert.ok(PLAYER_HULL.radius > 0.5 && PLAYER_HULL.radius < 0.56);
  assert.ok(PLAYER_HULL.minReach > config.PLAYER_RADIUS, 'the body reaches past the old circle in every direction');
});

test('in the world the nose points along the heading and the right wing to its right', () => {
  const noseLocal = SHIP_HULL.reduce((a, b) => (b[1] > a[1] ? b : a));
  const tipLocal = SHIP_HULL.reduce((a, b) => (b[0] > a[0] ? b : a));
  const i = SHIP_HULL.indexOf(noseLocal), k = SHIP_HULL.indexOf(tipLocal);
  // Facing +x: nose at +x, right wing at +y (the canvas y points down).
  let w = hullWorld(10, 5, 0);
  assert.ok(Math.abs(w[i].x - (10 + noseLocal[1])) < 1e-12 && Math.abs(w[i].y - (5 + noseLocal[0])) < 1e-12);
  assert.ok(w[k].y > 5.4);
  // Facing +y (down the screen): nose at +y, right wing at -x.
  w = hullWorld(10, 5, Math.PI / 2);
  assert.ok(Math.abs(w[i].y - (5 + noseLocal[1])) < 1e-9);
  assert.ok(w[k].x < 9.6);
});

test('polygon vs circle: exact overlap, depth and the separating normal', () => {
  const ship = { x: 0, y: 0, angle: 0 };
  const poly = hullWorld(0, 0, 0);
  // Ahead of the nose, apart then touching.
  assert.equal(polygonCircle(poly, PLAYER_HULL.nose + 0.3, 0, 0.29), null);
  const c = polygonCircle(poly, PLAYER_HULL.nose + 0.3, 0, 0.35);
  assert.ok(c && Math.abs(c.depth - 0.05) < 0.02, JSON.stringify(c));
  assert.ok(c.nx < -0.9, 'the ship is pushed back, away from the circle');
  // Circle centre inside the body: depth is radius + distance to the outline.
  const inside = polygonCircle(poly, 0, 0, 0.1);
  assert.ok(inside.depth > 0.1);
  // Pushing out clears it.
  const pushed = { ...ship, vx: 0, vy: 0 };
  const hit = pushShipOutOfCircle(pushed, 0.3, 0.1, 0.4);
  assert.ok(hit && !shipTouchesCircle(pushed, 0.3, 0.1, 0.4));
});

test('shots hit the wings and the nose, not the empty corners of the old sprite square', () => {
  const ship = { x: 5, y: 5, angle: -Math.PI / 2 }; // nose up the screen
  // A shot grazing the right wing tip, far outside the old 0.21 circle.
  const tip = hullWorld(5, 5, ship.angle).reduce((a, b) => (b.x > a.x ? b : a));
  assert.ok(Math.hypot(tip.x - 5, tip.y - 5) > 0.4);
  assert.ok(shotHitsShip(ship, tip.x - 0.02, tip.y - 1, tip.x - 0.02, tip.y + 1));
  assert.ok(!shotHitsShip(ship, tip.x + 0.05, tip.y - 1, tip.x + 0.05, tip.y + 1));
  // Sprite corner (inside the drawn square, outside the body): a miss.
  assert.ok(!shotHitsShip(ship, 5.45, 4.45, 5.5, 4.5));
  // The main game's drone shots use the same body.
  const scene = { player: { ...ship, hp: 100, invulnTimer: 0 }, hazards: [], gravityWells: [], drones: [] };
  const shots = [{ owner: 'enemy', prevX: tip.x - 0.02, prevY: tip.y - 1, x: tip.x - 0.02, y: tip.y + 1, damage: 10 }];
  resolveRoadmapProjectiles(scene, shots);
  assert.equal(shots.length, 0);
  assert.equal(scene.player.hp, 90);
});

test('rocks meet the body: a wing tip clips a rock the old circle missed', () => {
  const ship = { x: 10, y: 10, vx: 0, vy: 3, angle: 0, hp: 100, invulnTimer: 0 }; // facing +x, drifting +y
  const tip = hullWorld(10, 10, 0).reduce((a, b) => (b.y > a.y ? b : a));
  const rock = { x: tip.x, y: tip.y + 0.95, radius: 1, hp: 100 };
  assert.ok(Math.hypot(rock.x - 10, rock.y - 10) > rock.radius + config.PLAYER_RADIUS, 'clear of the old circle');
  const scene = { hazards: [rock], gravityWells: [] };
  resolveHazards(scene, ship);
  assert.ok(!shipTouchesCircle(ship, rock.x, rock.y, rock.radius), 'pushed clear');
  assert.ok(ship.vy < 0, 'bounced off');
  assert.ok(ship.hp < 100, 'a 3-cell/s hit hurts');
  // The old circle is still there for callers that ask for it.
  const old = { x: 10, y: 10, vx: 0, vy: 3, angle: 0, hp: 100, invulnTimer: 0 };
  resolveHazards({ hazards: [{ ...rock }], gravityWells: [] }, old, config.PLAYER_RADIUS);
  assert.equal(old.vy, 3);
});

test('signals: touching the drawn shard with a wing tip collects it; the old centre radius still does', () => {
  const node = { kind: 'planet', x: 9.5, y: 9.5 }; // centre (10, 10)
  const [tx, ty] = PLAYER_HULL.points.reduce((a, b) => (b[0] > a[0] ? b : a));
  // Facing +x the right wing tip is at (x + ty, y + tx).
  const wing = { x: 10 - ty, y: 10 - tx - config.PLANET_RADIUS + 0.02, angle: 0 };
  assert.ok(Math.hypot(wing.x - 10, wing.y - 10) > config.PLANET_RADIUS + config.PLAYER_RADIUS);
  assert.ok(touchesSignal(wing, node));
  assert.ok(!touchesSignal({ ...wing, y: wing.y - 0.05 }, node));
  assert.ok(touchesSignal({ x: 10.5, y: 10, angle: Math.PI / 4 }, node));
});

test('lane contact: the deepest hull point and the rail normal', () => {
  const track = createTrack([[4, 4], [40, 4], [40, 28], [4, 28]], 6, 'box');
  // On the top straight (y = 4, rails at y = 1 and 7), nose toward the outer rail (-y).
  const c = hullLaneContact(track, 20, 1.3, -Math.PI / 2);
  assert.ok(c.depth > 0.15, `nose ${c.depth.toFixed(3)} past the rail`);
  assert.ok(Math.abs(c.ny + 1) < 1e-9 && Math.abs(c.nx) < 1e-9, 'outward normal is -y');
  assert.ok(Math.abs(c.py - (1.3 - PLAYER_HULL.nose)) < 1e-9, 'deepest point is the nose');
  assert.ok(Math.abs(c.depth - (PLAYER_HULL.nose - 0.3)) < 1e-9);
  // Far from the rails: a quick, negative answer.
  assert.ok(hullLaneContact(track, 20, 4, 0).depth < 0);
  assert.ok(isHullInsideTrack(track, 20, 4, 1.3));
});

test('inner corners: a rail tip poking between two hull vertices is caught', () => {
  const track = createTrack([[4, 4], [40, 4], [40, 28], [4, 28]], 6, 'box');
  const notches = laneNotches(track);
  assert.equal(notches.length, 4);
  assert.ok(notches.some((n) => Math.abs(n.x - 37) < 1e-9 && Math.abs(n.y - 7) < 1e-9), JSON.stringify(notches));
  const n = notches.find((q) => Math.abs(q.x - 37) < 1e-9);
  // Find a pose where every vertex is on the lane but the corner is inside the body.
  let found = null;
  for (let a = 0; a < 64 && !found; a++)
    for (let dx = -0.5; dx <= 0.5 && !found; dx += 0.02)
      for (let dy = -0.5; dy <= 0.5 && !found; dy += 0.02) {
        const angle = (a / 64) * Math.PI * 2, x = n.x + dx, y = n.y + dy;
        const poly = hullWorld(x, y, angle);
        if (!pointInPolygon(poly, n.x, n.y)) continue;
        if (poly.every((p) => nearestTrackPoint(track, p.x, p.y).distance <= 3)) found = { x, y, angle };
      }
  assert.ok(found, 'such a pose exists for this hull');
  const c = hullLaneContact(track, found.x, found.y, found.angle);
  assert.ok(c.depth > 0, 'the notch counts as outside');
  assert.ok(!isHullInsideTrack(track, found.x, found.y, found.angle));
});

test('hull rails: a cross-infield move is blocked, the whole body stays on the lane', () => {
  const track = createLevelLayout(1).track;
  const previous = { x: 25, y: 25 }, player = { x: 24, y: 5, vx: 0, vy: -15, angle: -Math.PI / 2 };
  assert.ok(isInsideTrack(track, player.x, player.y, PLAYER_HULL.radius), 'the end point alone is on a lane');
  assert.equal(constrainToTrack(track, player, previous, PLAYER_HULL), true);
  assert.ok(player.y > 20);
  assert.ok(isHullInsideTrack(track, player.x, player.y, player.angle));
  assert.ok(player.vy > 0, 'bounced back');
});

test('hull rails: turning into a rail pushes the ship off it instead of through', () => {
  const track = createTrack([[4, 4], [40, 4], [40, 28], [4, 28]], 6, 'box');
  // Flying +x along the top straight, the right wing tip just inside the lower rail (y = 7).
  const y = 7 - PLAYER_HULL.halfSpan - 0.01;
  const player = { x: 20, y, vx: 4, vy: 0, angle: 0 };
  assert.ok(isHullInsideTrack(track, player.x, player.y, player.angle));
  // A hard turn right: the nose swings into the rail within one step.
  player.angle = Math.PI / 2;
  const previous = { x: 20, y };
  player.x += player.vx / 120;
  assert.ok(!isHullInsideTrack(track, player.x, player.y, player.angle), 'the turn alone would cross the rail');
  assert.equal(constrainToTrack(track, player, previous, PLAYER_HULL), true);
  assert.ok(isHullInsideTrack(track, player.x, player.y, player.angle), 'resolved');
  assert.ok(player.y < y - (PLAYER_HULL.nose - PLAYER_HULL.halfSpan) + 0.01, 'moved off the rail');
  assert.ok(player.x > 20, 'and kept its motion along the rail');
  assert.ok(player.boundaryContact > 0);
});

test('hull rails keep the stun and impact models, acting at the deepest hull point', () => {
  const track = createTrack([[4, 4], [40, 4], [40, 28], [4, 28]], 6, 'box');
  const hits = [];
  // Head-on into the lower rail, nose first, at 12 cells/s.
  const make = () => ({ x: 20, y: 6.6, vx: 0, vy: 12, angle: Math.PI / 2 });
  const lab = make();
  const previous = { x: 20, y: 6.4 };
  assert.equal(constrainToTrack(track, lab, previous, PLAYER_HULL, { model: 'impact', onImpact: (h) => hits.push(h) }), true);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].damage > 0, 'a 12-unit head-on hit damages the hull');
  assert.ok(lab.vy < 0);
  assert.ok(isHullInsideTrack(track, lab.x, lab.y, lab.angle));
  const stunned = [];
  const weekly = make();
  constrainToTrack(track, weekly, previous, PLAYER_HULL, { model: 'stun', keep: 0.5, hits: (o) => o >= 0.35, onImpact: (e) => stunned.push(e) });
  assert.equal(stunned.length, 1);
  assert.ok(Math.abs(stunned[0].impact - 12) < 1e-9, 'outward speed along the rail normal at the nose');
  // Nose at the rail: the body stops a nose-length short, not a circle-radius short.
  assert.ok(Math.abs(weekly.y + PLAYER_HULL.nose - 7) < 0.01, `nose at ${(weekly.y + PLAYER_HULL.nose).toFixed(3)}`);
});

test('every circuit start pose fits the lane, and so does a lap of centreline poses', () => {
  for (let level = 1; level <= 5; level++) {
    const track = createLevelLayout(level).track;
    for (let d = 0; d < track.length; d += 0.5) {
      const p = pointOnTrack(track, d);
      assert.ok(isHullInsideTrack(track, p.x, p.y, Math.atan2(p.ty, p.tx)), `L${level} at ${d}`);
    }
  }
});

test('the debug overlay outlines the hull and the pickup shapes without touching the scene', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : (...args) => calls.push([key, ...args])),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  const layout = createLevelLayout(1);
  const scene = { ...layout, player: { x: layout.track.portal.x, y: layout.track.portal.y, angle: 0 }, shards: new Set() };
  const before = JSON.stringify(scene.player);
  drawHitboxDebug(ctx, scene, 40);
  assert.equal(JSON.stringify(scene.player), before);
  assert.equal(calls.filter((c) => c[0] === 'lineTo').length, SHIP_HULL.length - 1, 'the hull outline');
  const signals = layout.nodes.filter((n) => n.kind === 'planet').length;
  assert.ok(calls.filter((c) => c[0] === 'arc').length >= signals * 2 + 1, 'signal rings and the old circle');
  assert.equal(calls.filter((c) => c[0] === 'save').length, calls.filter((c) => c[0] === 'restore').length);
  // A weekly scene on physics 1 shows the circle only.
  calls.length = 0;
  drawHitboxDebug(ctx, { ...scene, weekly: {}, physics: 1, shardList: [], mines: [] }, 40);
  assert.equal(calls.filter((c) => c[0] === 'lineTo').length, 0);
});

test("ship builds: stats stay inside their limits, the cockpit never changes stats, and physics 3 replays exactly", async () => {
  const S = await import("../projects/Space-Shooter/engine/shipStats.js");
  const { createWeeklyLayout } = await import("../projects/Space-Shooter/engine/weekly/layout.js");
  const { WEEKLY_EVENTS } = await import("../projects/Space-Shooter/tracks/weekly.js");
  const { createWeeklyScene, stepWeekly, WEEKLY_PHYSICS, WEEKLY_CONFIG } = await import("../projects/Space-Shooter/engine/weekly/sim.js");
  const { encodeInputLog, decodeInputLog, replayInputLog } = await import("../projects/Space-Shooter/engine/weekly/replay.js");
  const { flyWeeklyLap } = await import("../projects/Space-Shooter/engine/weekly/pilot.js");
  assert.equal(S.ALL_BUILDS.length, 57);
  for (const key of S.ALL_BUILDS) {
    const stats = S.buildStats(key);
    for (const [stat, [lo, hi]] of Object.entries(S.STAT_LIMITS)) assert.ok(stats[stat] >= lo && stats[stat] <= hi, `${key} ${stat} ${stats[stat]}`);
    const hull = S.buildHull(key);
    assert.ok(hull.length >= 12 && hull.length <= 28, `${key} has ${hull.length} vertices`);
    // Same ship with another cockpit: same stats, same outline.
    const b = S.parseBuild(key);
    for (const other of S.ALL_BUILDS) {
      const o = S.parseBuild(other);
      if (o.family === b.family && o.body === b.body && o.wings === b.wings && o.engines === b.engines) {
        assert.deepEqual(S.buildStats(other), stats);
        // The Courier cockpits reshape the nose; in the other families the cockpit sits inside the body.
        if (b.family !== "courier") assert.equal(S.buildHull(other), hull);
      }
    }
  }
  // The owner's table: the standard courier is 100 across the board, the thin
  // Needle is the fast drifty extreme and the broad Manta the grippy slow one.
  assert.deepEqual(S.buildStats("courier:0-0-0-0"), { topSpeed: 1, accel: 1, grip: 1, boost: 1, brake: 1 });
  assert.deepEqual(S.buildStats("needle:0-0-0-0"), { topSpeed: 1.2, accel: 0.85, grip: 0.8, boost: 1, brake: 1 });
  // Every twin-blade Needle keeps some grip, and its parts move it.
  const lance = S.ALL_BUILDS.filter((k) => /^needle:\d-0-/.test(k)).map((k) => S.buildStats(k).grip);
  assert.equal(Math.min(...lance), 0.8);
  assert.equal(Math.max(...lance), 0.94);
  assert.deepEqual(S.buildStats("manta:2-1-0-0"), { topSpeed: 0.8, accel: 1.15, grip: 1.25, boost: 1, brake: 1 });
  assert.equal(S.buildStats("wisp:0-0-0-0").boost, 1.1);
  for (const bad of [null, "", "needle", "needle:1-0-0-0", "needle:0-0-0-0 ", "ghost:0-0-0-0", "needle:0-0-0-9"]) {
    assert.equal(S.buildStats(bad), null);
    assert.equal(S.isBuild(bad), false);
  }
  // Top speed is 12 to 18 around the standard 15; the driftiest build has no dampening at all.
  assert.equal(WEEKLY_CONFIG.MAX_SPEED, 15);
  assert.ok(Math.abs(S.applyBuildStats(WEEKLY_CONFIG, S.buildStats("needle:0-0-0-0")).MAX_SPEED - 18) < 1e-9);
  assert.ok(Math.abs(S.applyBuildStats(WEEKLY_CONFIG, S.buildStats("manta:2-1-0-0")).MAX_SPEED - 12) < 1e-9);
  // Every build has some dampening; the least is the twin-blade Needle's.
  for (const key of S.ALL_BUILDS) assert.ok(S.applyBuildStats(WEEKLY_CONFIG, S.buildStats(key)).LATERAL_DAMP > 0, key);

  const layout = createWeeklyLayout(WEEKLY_EVENTS[0]);
  // A build scene needs a real build, and the standard physics ignores one.
  assert.throws(() => createWeeklyScene(layout, { physics: WEEKLY_PHYSICS.BUILD }), /Unknown ship build/);
  assert.throws(() => createWeeklyScene(layout, { physics: WEEKLY_PHYSICS.BUILD, ship: "needle:1-1-1-1" }), /Unknown ship build/);
  const standard = createWeeklyScene(layout, { ship: "needle:0-0-0-0" });
  assert.equal(standard.ship, undefined);
  assert.equal(standard.hull, undefined);
  // Grip: sliding sideways with no thrust, a grippy build sheds the slide and
  // the driftiest one keeps it.
  const slide = (ship) => {
    const scene = createWeeklyScene(layout, { physics: WEEKLY_PHYSICS.BUILD, ship });
    scene.lockedInStart = false; scene.launched = true;
    const a = scene.player.angle;
    scene.player.vx = -Math.sin(a) * 2; scene.player.vy = Math.cos(a) * 2; // pure sideways
    for (let i = 0; i < 30; i++) stepWeekly(scene, { turn: 0, thrust: 0, back: 0, strafe: 0, bits: 0 });
    return Math.abs(-scene.player.vx * Math.sin(a) + scene.player.vy * Math.cos(a));
  };
  assert.ok(slide("manta:2-1-0-0") < slide("courier:0-0-0-0"), "more grip, less slide");
  assert.ok(slide("courier:0-0-0-0") < slide("needle:0-0-0-0"), "less grip, more slide");
  // Sizes on top of the garage framing: twin-blade Needles 1.5x, every Manta 1.4x, every Wisp 1.25x.
  assert.equal(S.buildScale("needle:0-0-0-0"), 1.5);
  assert.equal(S.buildScale("needle:0-1-0-0"), 1);
  assert.equal(S.buildScale("manta:2-1-2-1"), 1.4);
  assert.equal(S.buildScale("wisp:0-0-0-0"), 1.25);
  assert.equal(S.buildScale("courier:0-0-0-0"), 1);
  const H = await import("../projects/Space-Shooter/engine/shipHulls.js");
  const raw = H.HULLS[H.BUILD_HULL["manta:0-0-0-0"]];
  S.buildHull("manta:0-0-0-0").forEach(([x, y], i) => { assert.ok(Math.abs(x - raw[i][0] * 1.4) < 1e-4 && Math.abs(y - raw[i][1] * 1.4) < 1e-4, "the Manta outline is the traced one at 1.4x"); });
  assert.ok(Math.abs(S.buildHullSize("manta:0-0-0-0").area - H.HULL_METRICS[H.BUILD_HULL["manta:0-0-0-0"]].area * 1.96) < 1e-3);
  // A flown build lap records its build and replays to the same millisecond.
  const lap = flyWeeklyLap(layout, { physics: WEEKLY_PHYSICS.BUILD, ship: "wisp:0-0-0-0" });
  assert.ok(lap.finished, `the pilot finishes in a Wisp (dead: ${lap.dead})`);
  const log = encodeInputLog({ eventId: layout.event.id, version: layout.event.version, frames: lap.frames, finishMs: lap.time, physics: WEEKLY_PHYSICS.BUILD, ship: "wisp:0-0-0-0" });
  assert.match(log, /^SDW3\|.*\|wisp:0-0-0-0$/);
  assert.equal(decodeInputLog(log).ship, "wisp:0-0-0-0");
  const replay = replayInputLog(layout, log);
  assert.equal(replay.matches, true);
  assert.equal(replay.ship, "wisp:0-0-0-0");
  // The same inputs in another build do not land on the same time.
  const other = replayInputLog(layout, log.replace(/wisp:0-0-0-0$/, "needle:0-1-0-0"));
  assert.equal(other.matches, false);
  // A build log with a missing or made-up build is refused; standard logs never carry one.
  assert.equal(decodeInputLog(log.replace(/\|wisp:0-0-0-0$/, "")), null);
  assert.equal(decodeInputLog(log.replace(/wisp:0-0-0-0$/, "manta:9-9-9-9")), null);
  assert.equal(decodeInputLog(log.replace(/^SDW3/, "SDW2")), null);
  assert.throws(() => encodeInputLog({ eventId: "x", version: 1, frames: [], finishMs: 0, physics: WEEKLY_PHYSICS.BUILD }), /Unknown ship build/);
});

test("which build a run flies: the equipped ship, ranked or not; a preview can name another", async () => {
  const { buildForRun, equippedBuild } = await import("../projects/Space-Shooter/systems/shipBuild.js");
  const store = (value) => ({ getItem: () => (value === undefined ? null : JSON.stringify(value)) });
  const needle = { family: "needle", parts: { body: 0, wings: 1, cockpit: 2, engines: 0 } };
  assert.equal(equippedBuild(store(needle)), "needle:0-1-2-0");
  assert.equal(equippedBuild(store(undefined)), null);
  assert.equal(equippedBuild(store({ family: "needle", parts: { body: 1, wings: 9, cockpit: 0, engines: 0 } })), null);
  assert.equal(equippedBuild({ getItem: () => "{not json" }), null);
  // A ranked flight flies the equipped ship; the address bar can't swap it.
  assert.equal(buildForRun({ id: "weekly-01" }, { preview: false, search: "?ship=needle:0-0-0-0", storage: store(needle) }), "needle:0-1-2-0");
  assert.equal(buildForRun({ id: "weekly-01" }, { preview: false, search: "", storage: store(undefined) }), null, "nothing equipped: the standard ship");
  // A preview flight can test any real build from the address bar.
  assert.equal(buildForRun({ id: "weekly-01" }, { preview: true, search: "?ship=needle:0-0-0-0", storage: store(needle) }), "needle:0-0-0-0");
  assert.equal(buildForRun({ id: "weekly-01" }, { preview: true, search: "?ship=needle:7-7-7-7", storage: store(needle) }), "needle:0-1-2-0", "an unknown build falls back to the equipped ship");
  // ...or the ship equipped in the garage.
  assert.equal(buildForRun({ id: "weekly-01" }, { preview: true, search: "?ship=equipped", storage: store(needle) }), "needle:0-1-2-0");
  assert.equal(buildForRun({ id: "weekly-01" }, { preview: false, search: "?ship=equipped", storage: store(needle) }), "needle:0-1-2-0");
});

test("stat points: the standard ship is 50 on every stat, the ends of each range are 0 and 100", async () => {
  const S = await import("../projects/Space-Shooter/engine/shipStats.js");
  assert.deepEqual(S.statPoints(S.buildStats("courier:0-0-0-0")), { topSpeed: 50, accel: 50, grip: 50, boost: 50, brake: 50 });
  // The twin-blade Needle at its extremes: fastest, weakest thrust, least grip.
  assert.deepEqual(S.statPoints(S.buildStats("needle:0-0-0-0")), { topSpeed: 100, accel: 0, grip: 10, boost: 50, brake: 50 });
  assert.equal(S.statPoints(S.buildStats("needle:2-0-0-1")).grip, 38);
  assert.deepEqual(S.statPoints(S.buildStats("manta:2-1-0-0")), { topSpeed: 0, accel: 100, grip: 100, boost: 50, brake: 50 });
  for (const key of S.ALL_BUILDS) for (const v of Object.values(S.statPoints(S.buildStats(key)))) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
  assert.deepEqual(S.STAT_NAMES.map(([id]) => id), ["topSpeed", "accel", "grip", "boost", "brake"]);
});
