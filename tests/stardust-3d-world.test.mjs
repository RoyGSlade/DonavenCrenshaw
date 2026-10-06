// The 3D weekly world: pure lane maths and geometry (no WebGL needed) and a
// headless build of the whole world against the vendored three.js (scene graph
// only, no renderer), including update() against a live weekly scene and dispose().
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../projects/Space-Shooter/vendor/three/three.module.js';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { createWeeklyLayout, cornerTurn, bouncerPosition, WEEKLY_RULES } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { createWeeklyScene, WEEKLY_CONFIG } from '../projects/Space-Shooter/engine/weekly/sim.js';
import { trackFrames, distanceToTrack, cornerTurns, detectCorners, haloRadius, bouncerSweep, laneBoundaryRuns, runLength, TIGHT_CORNER_DEG, HAIRPIN_DEG } from '../projects/Space-Shooter/gfx3d/world/laneMath.js';
import { buildLaneSurface, buildLaneOverlay, buildRails, buildCornerChevrons, buildCheckerStrip, positionBounds } from '../projects/Space-Shooter/gfx3d/world/laneGeometry.js';
import { starSlab, skyStars, laneMotes, backdropPlan } from '../projects/Space-Shooter/gfx3d/world/backdrop.js';
import { flowPixel, valueNoise } from '../projects/Space-Shooter/gfx3d/world/textures.js';
import { propFrom, fitProp } from '../projects/Space-Shooter/gfx3d/world/glb.js';
import { createWorld } from '../projects/Space-Shooter/gfx3d/world.js';

const event = WEEKLY_EVENTS[0];
const layout = createWeeklyLayout(event);
const points = layout.track.points;
const width = layout.track.width;
const half = width / 2;
const frames = trackFrames(points);

// A 20 x 20 square loop, width 4: the lane's outer edge is 4 x 20 straight plus four quarter circles of radius 2, the inner edge a 16 x 16 square.
const square = [[0, 0], [20, 0], [20, 20], [0, 20]];
const SQUARE_RAIL = 4 * 20 + 2 * Math.PI * 2 + 4 * 16;

// ---------------------------------------------------------------- lane maths
test('track frames close the loop and match the engine track', () => {
  assert.equal(frames.segments.length, points.length);
  assert.ok(Math.abs(frames.length - layout.track.length) < 1e-9);
  frames.segments.forEach((s, i) => {
    const next = frames.segments[(i + 1) % frames.segments.length];
    assert.ok(Math.abs(s.x + s.dx - next.x) < 1e-9 && Math.abs(s.y + s.dy - next.y) < 1e-9, `segment ${i} ends where ${i + 1} starts`);
    assert.ok(Math.abs(s.tx * layout.track.segments[i].ty - s.ty * layout.track.segments[i].tx) < 1e-12, 'same direction as the engine segment');
    assert.ok(Math.abs(s.nx * s.tx + s.ny * s.ty) < 1e-12 && Math.abs(Math.hypot(s.nx, s.ny) - 1) < 1e-12, 'unit normal');
  });
  assert.throws(() => trackFrames([[0, 0], [0, 0], [5, 5]]), /length/);
});

test('distanceToTrack agrees with the engine for sampled points', () => {
  for (const [x, y] of [[26, 11.5], [100, 20], [60, 100], [30, 250], [200, 300]]) {
    const mine = distanceToTrack(frames, x, y).distance;
    let best = Infinity;
    for (const s of layout.track.segments) {
      const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (y - s.y) * s.dy) / s.length ** 2));
      best = Math.min(best, Math.hypot(x - (s.x + s.dx * t), y - (s.y + s.dy * t)));
    }
    assert.ok(Math.abs(mine - best) < 1e-9);
  }
});

test('corner turns agree with the layout and detect the tight corners of Week 1', () => {
  const turns = cornerTurns(points);
  assert.equal(turns.length, points.length);
  turns.forEach((c, i) => {
    if (c.degrees > 1) assert.equal(c.turn, cornerTurn(layout.track, i), `corner ${i} turns the same way as the engine's`);
    assert.ok(c.degrees >= 0 && c.degrees <= 180);
    // The inside vector is a unit vector perpendicular to the bisector tangent.
    assert.ok(Math.abs(Math.hypot(c.insideX, c.insideY) - 1) < 1e-9 && Math.abs(c.insideX * c.tx + c.insideY * c.ty) < 1e-9);
  });
  const tight = detectCorners(points);
  assert.deepEqual(tight.map((c) => c.index), [1, 2, 3, 4, 5, 6, 7, 10, 16, 17]);
  assert.ok(tight.every((c) => c.degrees >= TIGHT_CORNER_DEG && c.kind === 'tight'), 'Week 1 has no hairpin');
  assert.equal(detectCorners(points, 80).length, 8, 'a stricter threshold keeps the 83-90 degree corners');
  // The sentry corners are tight corners (they sit on them).
  for (const s of layout.sentries) assert.ok(tight.some((c) => c.index === s.point), `sentry on point ${s.point} is at a marked corner`);
});

test('a reversal is a hairpin and faces across the lane', () => {
  const hairpin = detectCorners([[0, 0], [30, 0], [0, 4]]);
  const apex = hairpin.find((c) => c.index === 1);
  assert.equal(apex.kind, 'hairpin');
  assert.ok(apex.degrees >= HAIRPIN_DEG && apex.degrees <= 180);
  assert.ok(Math.hypot(apex.tx, apex.ty) > 0.99);
});

test('mine halo radius is the 2D renderer\'s: circle physics adds the ship radius, hulls a hair', () => {
  const mine = layout.mines[0];
  assert.equal(haloRadius(mine, 1, WEEKLY_CONFIG.PLAYER_RADIUS), mine.radius + WEEKLY_CONFIG.PLAYER_RADIUS);
  assert.equal(haloRadius(mine, 2, WEEKLY_CONFIG.PLAYER_RADIUS), mine.radius + 0.06);
  assert.equal(haloRadius(mine, 3, WEEKLY_CONFIG.PLAYER_RADIUS), mine.radius + 0.06);
  assert.ok(haloRadius(mine, 1, WEEKLY_CONFIG.PLAYER_RADIUS) > haloRadius(mine, 2, WEEKLY_CONFIG.PLAYER_RADIUS));
});

test('a bouncer\'s sweep rectangle spans exactly where it travels', () => {
  for (const b of layout.bouncers) {
    const sweep = bouncerSweep(b);
    assert.equal(sweep.halfWidth, b.radius);
    for (const time of [0, 1.7, 4.2, 9.9, 33]) {
      const p = bouncerPosition(b, time);
      const along = (p.x - sweep.x) * sweep.dx + (p.y - sweep.y) * sweep.dy;
      const across = (p.x - sweep.x) * -sweep.dy + (p.y - sweep.y) * sweep.dx;
      assert.ok(Math.abs(along) <= sweep.halfLength - sweep.halfWidth + 1e-9, 'the centre stays inside the swept strip');
      assert.ok(Math.abs(across) < 1e-9, 'and on its axis');
    }
    // The sweep reaches from rail to rail without leaving the lane.
    assert.ok(sweep.halfLength <= half + 0.05 + 1e-9);
  }
});

// ------------------------------------------------------------------- rails
test('rails follow the lane edge exactly: on the edge, facing out, trimmed at inner corners', () => {
  const runs = laneBoundaryRuns(points, width);
  assert.ok(runs.length > 20);
  for (const run of runs) {
    for (const p of run) {
      const d = distanceToTrack(frames, p.x, p.y).distance;
      assert.ok(d >= half - 2e-3 && d <= half + 2e-3, `boundary point is ${d} from the centreline, expected ${half}`);
      assert.ok(Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9);
      assert.ok(distanceToTrack(frames, p.x + p.nx * 0.05, p.y + p.ny * 0.05).distance > d, 'normal points out of the lane');
    }
  }
  const length = runs.reduce((s, r) => s + runLength(r), 0);
  assert.ok(length > 1.6 * layout.track.length && length < 2.6 * layout.track.length, `rail length ${length} vs track ${layout.track.length}`);
});

test('rails of a square loop add up to the analytic boundary and chain into closed loops', () => {
  const runs = laneBoundaryRuns(square, 4);
  const total = runs.reduce((s, r) => s + runLength(r), 0);
  assert.ok(Math.abs(total - SQUARE_RAIL) < 0.2, `rail ${total} vs analytic ${SQUARE_RAIL}`);
  // Every run end meets another run's start (no gaps, no strays): the boundary is two closed loops.
  const ends = runs.map((r) => [r[0], r.at(-1)]);
  for (const [a, b] of ends) {
    const meets = (p) => ends.some(([c, d]) => (c !== a || d !== b) && (Math.hypot(c.x - p.x, c.y - p.y) < 0.02 || Math.hypot(d.x - p.x, d.y - p.y) < 0.02));
    assert.ok(meets(a) && meets(b), 'every rail run joins its neighbours');
  }
});

test('rail geometry has walls and trim along every run, with sane bounds', () => {
  const rails = buildRails(points, width);
  assert.equal(rails.body.index.length % 3, 0);
  assert.equal(rails.glow.color.length, rails.glow.vertexCount * 4, 'glow has RGBA vertex colours');
  const [minX, minY, maxX, maxY] = positionBounds(rails.body.position);
  const lane = positionBounds(buildLaneSurface(points, width).position);
  assert.ok(minX >= lane[0] - 0.5 && maxX <= lane[2] + 0.5 && minY >= lane[1] - 0.5 && maxY <= lane[3] + 0.5, 'rails stay on the lane\'s footprint');
  const ys = rails.body.position.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) === 0 && Math.max(...ys) > 0.4 && Math.max(...ys) < 1.5, 'a low wall');
  // Wall faces point toward the lane (-normal) or up.
  for (let i = 0; i < rails.body.index.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => rails.body.index[i + k]);
    const P = rails.body.position, N = rails.body.normal;
    const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(n[0] * N[a * 3] + n[1] * N[a * 3 + 1] + n[2] * N[a * 3 + 2] >= -1e-9, 'triangle faces the way its vertex normal says');
  }
});

// -------------------------------------------------------------------- lane
function triangles(mesh) {
  const out = [];
  for (let i = 0; i < mesh.index.length; i += 3) out.push([0, 1, 2].map((k) => [mesh.position[mesh.index[i + k] * 3], mesh.position[mesh.index[i + k] * 3 + 2]]));
  return out;
}
function covered(tris, x, y) {
  for (const [a, b, c] of tris) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    if (l1 >= -1e-9 && l2 >= -1e-9 && 1 - l1 - l2 >= -1e-9) return true;
  }
  return false;
}

test('lane surface: vertex counts, bounds, up-facing, and it covers exactly the lane', () => {
  const surface = buildLaneSurface(points, width, { discSteps: 28 });
  assert.equal(surface.vertexCount, points.length * 6 + points.length * 29);
  assert.equal(surface.triangleCount, points.length * 4 + points.length * 28);
  assert.equal(surface.position.length, surface.vertexCount * 3);
  assert.equal(surface.color.length, surface.vertexCount * 3);
  const [minX, minY, maxX, maxY] = positionBounds(surface.position);
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  // Corner discs are polygons of radius `half`, so extremes are within a hair of centreline +- half.
  assert.ok(Math.abs(minX - (Math.min(...xs) - half)) < 0.1 && Math.abs(maxX - (Math.max(...xs) + half)) < 0.1);
  assert.ok(Math.abs(minY - (Math.min(...ys) - half)) < 0.1 && Math.abs(maxY - (Math.max(...ys) + half)) < 0.1);
  assert.ok(surface.position.every((v, i) => i % 3 !== 1 || v === 0), 'flat on y = 0');
  for (let i = 0; i < surface.normal.length; i += 3) assert.deepEqual([surface.normal[i], surface.normal[i + 1], surface.normal[i + 2]], [0, 1, 0]);
  const tris = triangles(surface);
  for (const [a, b, c] of tris) assert.ok((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) >= -1e-9, 'every triangle faces up');
  // Points well inside the lane are covered; points well outside are not.
  let inside = 0, outside = 0;
  for (let i = 0; i < 400; i++) {
    const s = frames.segments[(i * 7) % frames.segments.length], t = ((i * 37) % 100) / 100, off = (((i * 53) % 100) / 100 - 0.5) * (width - 0.4);
    assert.ok(covered(tris, s.x + s.dx * t + s.nx * off, s.y + s.dy * t + s.ny * off), 'a point inside the lane is on the surface');
    inside++;
    const far = half + 0.3 + (i % 5) * 0.5, side = i % 2 ? 1 : -1;
    const px = s.x + s.dx * t + s.nx * far * side, py = s.y + s.dy * t + s.ny * far * side;
    if (distanceToTrack(frames, px, py).distance > half + 0.2) { assert.ok(!covered(tris, px, py), 'a point outside the lane is not'); outside++; }
  }
  assert.ok(inside === 400 && outside > 200);
});

test('flow overlay runs along the race direction with continuous UVs', () => {
  const period = 8;
  const overlay = buildLaneOverlay(points, width, { period });
  assert.equal(overlay.vertexCount, points.length * 4);
  frames.segments.forEach((s, i) => {
    const base = i * 4;
    const u = (k) => overlay.uv[(base + k) * 2], v = (k) => overlay.uv[(base + k) * 2 + 1];
    assert.ok(Math.abs(u(0) - s.start / period) < 1e-4 && Math.abs(u(2) - (s.start + s.length) / period) < 1e-4, 'u is distance along the lap over the period');
    assert.ok(u(2) > u(0), 'u increases in the race direction');
    assert.deepEqual([v(0), v(1)], [0, 1]);
  });
  const total = overlay.uv[(overlay.vertexCount - 2) * 2];
  assert.ok(Math.abs(total - frames.length / period) < 1e-4, 'the last segment ends at one full lap');
});

test('flow texture: dashes, lane lines and forward chevrons, periodic along the lane', () => {
  const px = (u, v) => { const out = [0, 0, 0, 0]; flowPixel(u, v, out, { period: 8, width: 6, pxAlong: 8 / 512, pxAcross: 6 / 128 }); return out; };
  for (let i = 0; i < 50; i++) {
    const u = (i * 0.0173) % 1, v = (i * 0.071) % 1;
    const a = px(1e-9, v), b = px(1 - 1e-9, v);
    assert.ok(px(u, v)[3] >= 0 && px(u, v)[3] <= 1);
    assert.ok(Math.abs(a[3] - b[3]) < 1e-5, 'the texture tiles: its two ends match');
  }
  assert.ok(px(0.5 / 8 + 0.06, 0.5)[3] > 0.2, 'centre dash');
  // Chevron tip (forward) sits ahead of its arms: at the centre the line is further along u than at the sides.
  const tipU = (v) => { let best = 0, at = 0; for (let k = 0; k < 400; k++) { const u = k / 400 / 2; const a = px(u, v)[3]; if (u > 0.05 && a > best) { best = a; at = u; } } return at; };
  assert.ok(tipU(0.5) > tipU(0.5 + 0.7 / 6) + 0.005, 'chevrons point down the lane');
  assert.ok(valueNoise(3.3, 2.1, 8, 1) >= 0 && Math.abs(valueNoise(0.5, 1.5, 8, 1) - valueNoise(8.5, 1.5, 8, 1)) < 1e-12, 'noise wraps');
});

test('corner chevrons: 3 per tight corner, on the lane, pointing along the bisector', () => {
  const corners = detectCorners(points);
  const mesh = buildCornerChevrons(corners, width);
  assert.equal(mesh.marks.length, corners.length * 3);
  assert.equal(mesh.vertexCount, mesh.marks.length * 6);
  for (const m of mesh.marks) assert.ok(distanceToTrack(frames, m.x, m.y).distance <= half - 0.2, 'chevron sits on the lane');
  const hair = detectCorners([[0, 0], [60, 0], [0, 6]], 40).filter((c) => c.kind === 'hairpin');
  assert.equal(buildCornerChevrons(hair, 6).marks.length, hair.length * 5, 'a hairpin gets five');
  assert.equal(buildCornerChevrons([], width).marks.length, 0);
});

test('checker strip spans the lane across the finish line', () => {
  const strip = buildCheckerStrip(layout.track.portal, width);
  assert.equal(strip.vertexCount, 12 * 2 * 4);
  const p = layout.track.portal;
  let minAcross = Infinity, maxAcross = -Infinity, minAlong = Infinity, maxAlong = -Infinity;
  for (let i = 0; i < strip.position.length; i += 3) {
    const dx = strip.position[i] - p.x, dy = strip.position[i + 2] - p.y;
    const across = dx * p.nx + dy * p.ny, along = dx * p.tx + dy * p.ty;
    minAcross = Math.min(minAcross, across); maxAcross = Math.max(maxAcross, across); minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along);
  }
  assert.ok(Math.abs(minAcross + half) < 1e-5 && Math.abs(maxAcross - half) < 1e-5, 'full lane width');
  assert.ok(Math.abs(minAlong + 0.45) < 1e-5 && Math.abs(maxAlong - 0.45) < 1e-5, 'centred on the line');
});

// ---------------------------------------------------------------- backdrop
test('backdrop is seeded, deep below the lane, and covers the track', () => {
  const bounds = { minX: 0, minY: 0, maxX: 180, maxY: 280 };
  const a = starSlab({ seed: 4, bounds }), b = starSlab({ seed: 4, bounds }), c = starSlab({ seed: 5, bounds });
  assert.deepEqual(a.positions, b.positions);
  assert.notDeepEqual(a.positions, c.positions);
  assert.equal(a.positions.length, a.count * 3);
  for (let i = 0; i < a.count; i++) {
    assert.ok(a.positions[i * 3 + 1] < -10, 'below the lane');
    assert.ok(a.positions[i * 3] >= -260 && a.positions[i * 3] <= 440 && a.positions[i * 3 + 2] >= -260 && a.positions[i * 3 + 2] <= 540);
    assert.ok(a.sizes[i] > 0 && a.colors[i * 3] <= 1);
  }
  const sky = skyStars({ seed: 2, count: 200, radius: 500 });
  for (let i = 0; i < sky.count; i++) assert.ok(Math.abs(Math.hypot(sky.positions[i * 3], sky.positions[i * 3 + 1], sky.positions[i * 3 + 2]) - 500) < 1e-3, 'on the sphere');
  const motes = laneMotes(frames, { seed: 3, count: 300, spread: 11 });
  for (let i = 0; i < motes.count; i++) {
    assert.ok(distanceToTrack(frames, motes.positions[i * 3], motes.positions[i * 3 + 2]).distance <= 11 + 1e-6, 'dust hugs the lane');
    assert.ok(motes.positions[i * 3 + 1] > 0.5 && motes.positions[i * 3 + 1] < 6);
  }
  const plan = backdropPlan(bounds);
  assert.ok(plan.planet.y < -plan.planet.radius * 0 - 80 && plan.moon.y < -50 && plan.nebulae.every((n) => n.y < -50), 'big things hang below the lane');
});

// ------------------------------------------------------------ the whole world
function freshScene(options) {
  const lv = createWeeklyScene(layout, options);
  lv.viewPlayer = lv.player;
  lv.viewHazards = lv.hazards;
  lv.nearestShardTarget = { kind: 'planet', x: layout.shards[0].x - 0.5, y: layout.shards[0].y - 0.5 };
  return lv;
}
const byName = (root, name) => { let hit = null; root.traverse((o) => { if (!hit && o.name === name) hit = o; }); return hit; };
const allOf = (root, test) => { const out = []; root.traverse((o) => { if (test(o)) out.push(o); }); return out; };

test('the world builds from Week 1 with every gameplay object present', () => {
  const world = createWorld(THREE, layout, {});
  assert.deepEqual(
    { shards: world.stats.shards, mines: world.stats.mines, bouncers: world.stats.bouncers, sentries: world.stats.sentries, docks: world.stats.docks, corners: world.stats.corners },
    { shards: 8, mines: 22, bouncers: 9, sentries: 5, docks: 2, corners: 10 },
  );
  assert.ok(byName(world.group, 'lane-surface') && byName(world.group, 'rails') && byName(world.group, 'rail-glow') && byName(world.group, 'lane-flow') && byName(world.group, 'finish-line') && byName(world.group, 'finish-gate'));
  // The gate stands on the start/finish line, turned along the race direction, spanning the lane.
  const holder = byName(world.group, 'gate-holder');
  assert.ok(Math.abs(holder.position.x - layout.track.portal.x) < 1e-9 && Math.abs(holder.position.z - layout.track.portal.y) < 1e-9);
  assert.ok(Math.abs(holder.rotation.y + layout.track.portal.angle) < 1e-9, 'sim angle a is rotation.y = -a');
  const gate = new THREE.Box3().setFromObject(byName(world.group, 'finish-gate'));
  assert.ok(gate.max.y > 3 && gate.max.y < 6, 'an arch over the lane');
  // Mapping: sim (x, y) -> world (x, 0, y).
  const m = layout.mines[3];
  const mine = byName(world.group, `mine-${m.id}`);
  assert.ok(Math.abs(mine.position.x - m.x) < 1e-9 && Math.abs(mine.position.z - m.y) < 1e-9);
  world.dispose();
});

test('update: collected shards disappear, the next one is marked, the gate shows whether the line counts', () => {
  const world = createWorld(THREE, layout, {});
  const lv = freshScene();
  world.update(lv, 1, {});
  for (const s of layout.shards) assert.equal(byName(world.group, `shard-${s.id}`).visible, true);
  const beams = () => layout.shards.filter((s) => byName(world.group, `shard-${s.id}`).visible && byName(world.group, `shard-${s.id}`).children.some((c) => c.geometry?.attributes?.color?.itemSize === 4 && c.visible));
  assert.deepEqual(beams().map((s) => s.id), [layout.shards[0].id], 'only the next shard has a beam');
  lv.shards.add(layout.shards[0].id);
  lv.nearestShardTarget = { kind: 'planet', x: layout.shards[1].x - 0.5, y: layout.shards[1].y - 0.5 };
  world.update(lv, 1.1, {});
  assert.equal(byName(world.group, `shard-${layout.shards[0].id}`).visible, false, 'a collected shard is hidden');
  assert.equal(byName(world.group, `shard-${layout.shards[1].id}`).visible, true);
  assert.deepEqual(beams().map((s) => s.id), [layout.shards[1].id], 'the beam moves to the next one');
  const gateLight = (() => { let m = null; byName(world.group, 'finish-gate').traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial && !m) m = o.material; }); return m; })();
  const locked = gateLight.color.getHex();
  for (const s of layout.shards) lv.shards.add(s.id);
  lv.nearestShardTarget = { kind: 'gate' };
  world.update(lv, 1.2, {});
  for (const s of layout.shards) assert.equal(byName(world.group, `shard-${s.id}`).visible, false);
  assert.notEqual(gateLight.color.getHex(), locked, 'gate lights change once the line counts');
  assert.ok(gateLight.color.g > gateLight.color.r, 'green when ready, amber while shards are missing');
  world.dispose();
});

test('update: mine halos match the kill radius for the attempt\'s physics', () => {
  const world = createWorld(THREE, layout, {});
  const lv = freshScene();
  const halo = (m) => byName(world.group, `mine-halo-${m.id}`);
  world.update(lv, 0, {});
  for (const m of layout.mines) assert.ok(Math.abs(halo(m).scale.x - (m.radius + 0.06)) < 1e-9, 'hull physics: the mine plus a hair');
  const circle = freshScene({ physics: 1 });
  world.update(circle, 0.5, {});
  for (const m of layout.mines) assert.ok(Math.abs(halo(m).scale.x - (m.radius + WEEKLY_CONFIG.PLAYER_RADIUS)) < 1e-9, 'circle physics: the mine plus the ship');
  world.dispose();
});

test('update: bouncers follow their interpolated positions, destroyed ones vanish', () => {
  const world = createWorld(THREE, layout, {});
  const lv = freshScene();
  lv.viewHazards = lv.hazards.map((h, i) => { const p = bouncerPosition(h, 2.5); return { ...h, x: p.x, y: p.y }; });
  world.update(lv, 2.5, {});
  layout.bouncers.forEach((b, i) => {
    const rock = byName(world.group, `rock-${b.id}`).parent;
    assert.ok(Math.abs(rock.position.x - lv.viewHazards[i].x) < 1e-9 && Math.abs(rock.position.z - lv.viewHazards[i].y) < 1e-9);
    assert.equal(byName(world.group, `rock-${b.id}`).visible, true);
    assert.equal(byName(world.group, `sweep-${b.id}`).visible, true);
  });
  lv.viewHazards[2] = { ...lv.viewHazards[2], hp: 0, destroyedAt: 2.4 };
  lv.elapsed = 2.5;
  world.update(lv, 2.5, {});
  const id = layout.bouncers[2].id;
  assert.equal(byName(world.group, `rock-${id}`).visible, false, 'destroyed rock is hidden');
  assert.equal(byName(world.group, `sweep-${id}`).visible, false, 'and so is its sweep lane, like the 2D view');
  const burst = byName(world.group, `rock-${id}`).parent.children.find((c) => c.isSprite);
  assert.equal(burst.visible, true, 'a short flash marks the destruction');
  lv.elapsed = 4;
  world.update(lv, 4, {});
  assert.equal(burst.visible, false);
  world.dispose();
});

test('update: a sentry shows its range, and lights its aim line and target while locking', () => {
  const world = createWorld(THREE, layout, {});
  const lv = freshScene();
  world.update(lv, 0, {});
  const sentryObjects = () => layout.sentries.map((x) => byName(world.group, `sentry-aim-${x.id}`));
  assert.equal(sentryObjects().filter((o) => o.visible).length, 0, 'idle: no aim line');
  const s = lv.sentries[1];
  s.state = 'telegraph'; s.slow = true; s.aimX = s.x + 6; s.aimY = s.y + 8; s.angle = Math.atan2(8, 6);
  world.update(lv, 0.1, {});
  const shown = sentryObjects().filter((o) => o.visible);
  assert.equal(shown.length, 1, 'only the locking sentry draws an aim line');
  const aim = shown[0];
  assert.equal(byName(world.group, `sentry-target-${s.id}`).visible, true, 'with a ring where it is aiming');
  const target = byName(world.group, `sentry-target-${s.id}`);
  assert.ok(Math.abs(target.position.x - s.aimX) < 1e-9 && Math.abs(target.position.z - s.aimY) < 1e-9);
  const range = byName(world.group, `sentry-range-${s.id}`), idleRange = byName(world.group, `sentry-range-${lv.sentries[0].id}`);
  assert.notEqual(range.material, idleRange.material, 'a locking sentry range ring turns hot');
  assert.ok(Math.abs(aim.scale.x - 10) < 1e-9, 'the line is as long as the lock distance');
  assert.ok(Math.abs(aim.position.x - s.x) < 1e-9 && Math.abs(aim.position.z - s.y) < 1e-9, 'it starts at the sentry');
  const along = new THREE.Vector3(1, 0, 0).applyEuler(aim.rotation);
  assert.ok(Math.abs(along.x - 0.6) < 1e-9 && Math.abs(along.z - 0.8) < 1e-9, 'and points at the aim point');
  s.state = 'idle'; s.slow = false;
  world.update(lv, 0.2, {});
  assert.equal(sentryObjects().filter((o) => o.visible).length, 0);
  world.dispose();
});

test('update: rails flash amber while the ship is stunned', () => {
  const world = createWorld(THREE, layout, {});
  const lv = freshScene();
  const glow = byName(world.group, 'rail-glow');
  world.update(lv, 0, {});
  const calm = glow.material.color.getHex();
  lv.player.stunTimer = 0.3;
  world.update(lv, 0.1, { reducedMotion: true });
  assert.notEqual(glow.material.color.getHex(), calm);
  assert.ok(glow.material.color.r > glow.material.color.b, 'amber, not cyan');
  lv.player.stunTimer = 0;
  world.update(lv, 0.2, {});
  assert.equal(glow.material.color.getHex(), calm);
  world.dispose();
});

test('reducedMotion: nothing pulses, spins or drifts however much time passes', () => {
  const world = createWorld(THREE, layout, {});
  const lv = freshScene();
  const snapshot = () => {
    const out = [];
    world.group.traverse((o) => { out.push(o.position.toArray().join(), o.rotation.toArray().slice(0, 3).join(), o.scale.toArray().join()); if (o.material?.opacity !== undefined) out.push(o.material.opacity); });
    return out.join('|') + `|${[...world.group.children].length}`;
  };
  const flow = (() => { const lane = byName(world.group, 'lane-flow'); return lane.material.map; })();
  world.update(lv, 0, { reducedMotion: true });
  const first = snapshot(), offset = flow.offset.x;
  world.update(lv, 7.77, { reducedMotion: true });
  assert.equal(snapshot(), first);
  assert.equal(flow.offset.x, offset);
  world.update(lv, 7.77, {});
  assert.notEqual(snapshot(), first, 'with motion on, the world animates');
  assert.notEqual(flow.offset.x, offset, 'flow lines drift in the race direction');
  world.dispose();
});

test('the world takes over scene fog and background and gives them back', () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x123456);
  scene.fog = null;
  const world = createWorld(THREE, layout, {});
  scene.add(world.group);
  world.update(freshScene(), 0, {});
  assert.ok(scene.fog && scene.fog.isFogExp2, 'mild exponential fog for depth');
  assert.notEqual(scene.background.getHex(), 0x123456);
  world.dispose();
  assert.equal(scene.fog, null);
  assert.equal(scene.background.getHex(), 0x123456);
  assert.equal(scene.children.length, 0, 'the group leaves the scene');
});

test('dispose frees every geometry, material and texture the world made', () => {
  const world = createWorld(THREE, layout, {});
  world.update(freshScene(), 0, {});
  const geometries = new Set(), materials = new Set(), textures = new Set();
  world.group.traverse((o) => {
    if (o.geometry && !o.isSprite) geometries.add(o.geometry);   // all sprites share one three.js-owned quad
    for (const m of [].concat(o.material || [])) { materials.add(m); for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v); }
  });
  assert.ok(geometries.size > 20 && materials.size > 40 && textures.size >= 5);
  const disposed = { g: 0, m: 0, t: 0 };
  geometries.forEach((g) => g.addEventListener('dispose', () => disposed.g++));
  materials.forEach((m) => m.addEventListener('dispose', () => disposed.m++));
  textures.forEach((t) => t.addEventListener('dispose', () => disposed.t++));
  const counts = world.dispose();
  assert.equal(disposed.g, geometries.size, 'every geometry in the scene graph is disposed');
  assert.equal(disposed.m, materials.size, 'every material');
  assert.equal(disposed.t, textures.size, 'every texture');
  assert.ok(counts.geometries >= geometries.size && counts.materials >= materials.size && counts.textures >= textures.size);
  assert.equal(world.group.children.length, 0);
  assert.deepEqual(world.dispose(), { geometries: 0, materials: 0, textures: 0 }, 'a second dispose is harmless');
});

// ---------------------------------------------------------------- GLB overrides
function crate(x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshStandardMaterial());
  const g = new THREE.Group(); g.add(mesh); mesh.position.set(5, 7, -3);
  return g;
}

test('fitProp scales, centres and seats a model', () => {
  const fitted = fitProp(THREE, crate(2, 3, 4), { target: 8, by: 'z', base: 'floor' });
  const box = new THREE.Box3().setFromObject(fitted);
  assert.ok(Math.abs(box.max.z - box.min.z - 8) < 1e-9, 'Z extent is the target');
  assert.ok(Math.abs(box.min.y) < 1e-9, 'sits on the floor');
  assert.ok(Math.abs((box.max.x + box.min.x) / 2) < 1e-9 && Math.abs((box.max.z + box.min.z) / 2) < 1e-9, 'centred');
  assert.ok(Math.abs(box.max.x - box.min.x - 4) < 1e-9 && Math.abs(box.max.y - 6) < 1e-9, 'uniform scale');
  const sphere = fitProp(THREE, new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8)), { target: 1, by: 'sphere' });
  assert.ok(Math.abs(new THREE.Box3().setFromObject(sphere).getBoundingSphere(new THREE.Sphere()).radius - 1) < 0.02);
  assert.equal(fitProp(THREE, new THREE.Group(), { target: 1 }), null, 'an empty model is rejected');
  assert.equal(propFrom({ props: { a: { scene: crate(1, 1, 1) } } }, 'a').isObject3D, true, 'accepts a glTF result');
  assert.equal(propFrom({ props: {} }, 'a'), null);
  assert.equal(propFrom({}, 'a'), null);
});

test('GLB props replace the procedural ones and survive dispose', () => {
  const props = { fuelStation: crate(6, 5, 2), mine: crate(2, 2, 2), asteroid: crate(2, 1, 1), shard: crate(1, 2, 1), sentry: crate(2, 1, 1), fuelDock: crate(3, 2, 2) };
  const owned = Object.values(props).map((p) => { let g = null; p.traverse((o) => { if (o.geometry) g = o.geometry; }); let disposed = false; g.addEventListener('dispose', () => { disposed = true; }); return () => disposed; });
  const world = createWorld(THREE, layout, { props });
  assert.deepEqual(world.stats.customProps.sort(), ['asteroid', 'fuelDock', 'fuelStation', 'mine', 'sentry', 'shard']);
  assert.equal(byName(world.group, 'finish-gate'), null, 'the procedural gate is not built');
  const holder = byName(world.group, 'gate-holder');
  const bbox = new THREE.Box3().setFromObject(holder);
  assert.ok(Math.abs(holder.children[0].userData.fit.size.z - (width + 1.4)) < 1e-6, 'gate model spans the lane plus a margin');
  assert.ok(Math.abs(bbox.min.y) < 1e-6, 'and stands on the floor');
  const rock = byName(world.group, `rock-${layout.bouncers[0].id}`);
  assert.equal(rock.children.some((c) => c.isMesh), false, 'no procedural mesh inside (the clone is nested deeper)');
  assert.ok(Math.abs(new THREE.Box3().setFromObject(rock).getBoundingSphere(new THREE.Sphere()).radius - layout.bouncers[0].radius) < 0.05, 'rock model matches the collision radius');
  world.update(freshScene(), 1, {});
  world.dispose();
  assert.ok(owned.every((isDisposed) => !isDisposed()), 'assets own their geometry; the world must not free it');
});
