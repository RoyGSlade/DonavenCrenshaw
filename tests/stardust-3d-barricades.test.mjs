import test from 'node:test';
import assert from 'node:assert/strict';
import { barricadePlacements } from '../projects/Space-Shooter/gfx3d/world/barricades.js';
import { laneBoundaryRuns } from '../projects/Space-Shooter/gfx3d/world/laneMath.js';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';

test('barricades line both edges of the Week 1 lane, outside the rails, evenly spaced', () => {
  const track = WEEKLY_EVENTS[0].track;
  const points = track.points.map(([x, y]) => ({ x, y }));
  const runs = laneBoundaryRuns(points, track.width);
  const placed = barricadePlacements(runs, { pitch: 2.6, offset: 0.95 });
  assert.ok(placed.length > 100 && placed.length < 1200, `count ${placed.length}`);
  for (const p of placed) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.angle));
    assert.ok(p.length > 0 && p.length <= 2.6 + 1e-9);
  }
});

test('a straight run gets segments pushed outward along its normal', () => {
  const run = [{ x: 0, y: 3, nx: 0, ny: 1 }, { x: 10, y: 3, nx: 0, ny: 1 }];
  const placed = barricadePlacements([run], { pitch: 2.5, offset: 1 });
  assert.equal(placed.length, 4);
  for (const p of placed) { assert.equal(p.y, 4); assert.equal(p.angle, 0); }
  assert.deepEqual(placed.map((p) => p.x), [1.25, 3.75, 6.25, 8.75]);
});

test('runs too short for a segment are skipped', () => {
  assert.equal(barricadePlacements([[{ x: 0, y: 0, nx: 0, ny: 1 }, { x: 0.5, y: 0, nx: 0, ny: 1 }]]).length, 0);
});
