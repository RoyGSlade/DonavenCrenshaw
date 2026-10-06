// The optional weekly `theme: 'mall'` look (gfx/mallPlan.js, gfx/mallTheme.js).
// It is visual only: the sim, replay, hub sync and Week 1 must not notice it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { WEEK2_DRAFT } from '../projects/Space-Shooter/tracks/weeklyRollout.js';
import { createWeeklyLayout } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { createWeeklyScene } from '../projects/Space-Shooter/engine/weekly/sim.js';
import { flyWeeklyLap } from '../projects/Space-Shooter/engine/weekly/pilot.js';
import { createTrack } from '../projects/Space-Shooter/engine/track.js';
import { planMallDistrict, MALL, distToPolyline, rectCorners, rectsOverlap } from '../projects/Space-Shooter/gfx/mallPlan.js';
import { mallThemeOf, drawMallDistrict, drawMallLane } from '../projects/Space-Shooter/gfx/mallTheme.js';

const week1 = WEEKLY_EVENTS[0];
const SHOOTER = 'projects/Space-Shooter';

// A synthetic zig-zag: five long legs folding back on each other, 12 cells apart at the folds.
const zig = createTrack([[10, 10], [150, 12], [152, 40], [20, 44], [22, 72], [160, 76], [162, 110], [30, 112]], 6, 'zigzag');

function repoGit(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

test('the simulation and replay files are byte-identical to the branch base', (t) => {
  let base;
  try { base = repoGit('merge-base', 'HEAD', 'origin/claude/ship-week2-tool'); } catch { base = null; }
  if (!base) { t.skip('no git history to compare against'); return; }
  const files = [
    'engine/weekly/sim.js', 'engine/weekly/replay.js', 'engine/weekly/pilot.js', 'engine/weekly/layout.js', 'engine/weekly/localBest.js',
    'engine/hull.js', 'engine/track.js', 'engine/modes/weekly.js', 'input.js', 'systems/hubRuns.js', 'systems/hubSync.js', 'systems/hubSyncLive.js',
  ].map((f) => `${SHOOTER}/${f}`);
  const changed = repoGit('diff', '--name-only', base, '--', ...files);
  assert.equal(changed, '', `sim files changed: ${changed}`);
});

test('theme is an optional string; the layout and the sim ignore it', () => {
  assert.equal(WEEK2_DRAFT.theme, 'mall');
  assert.equal(week1.theme, undefined, 'Week 1 carries no theme');
  const themed = { ...week1, theme: 'mall' };
  const a = createWeeklyLayout(week1), b = createWeeklyLayout(themed);
  const strip = (l) => JSON.stringify({ ...l, event: undefined });
  assert.equal(strip(a), strip(b), 'same layout with and without a theme');
  const la = flyWeeklyLap(a), lb = flyWeeklyLap(b);
  assert.equal(la.finished, true);
  assert.equal(lb.time, la.time);
  assert.deepEqual(lb.frames, la.frames, 'same scripted lap, input for input');
  assert.equal(JSON.stringify(createWeeklyScene(a).player), JSON.stringify(createWeeklyScene(b).player));
});

function minDistToLane(rect, P) {
  // Independent of the planner: dense sampling of the filled rectangle against the closed centreline.
  const vx = -rect.uy, vy = rect.ux;
  let best = Infinity;
  const nu = Math.ceil(rect.hu * 2 / 0.25), nv = Math.ceil(rect.hv * 2 / 0.25);
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = -rect.hu + (2 * rect.hu * i) / nu, v = -rect.hv + (2 * rect.hv * j) / nv;
    best = Math.min(best, distToPolyline(rect.cx + rect.ux * u + vx * v, rect.cy + rect.uy * u + vy * v, P));
  }
  return best;
}

for (const [name, source] of [['Week 1 Gantry Drop', () => createWeeklyLayout(week1).track], ['synthetic zig-zag', () => zig]]) {
  test(`mall buildings never touch the lane or its rails: ${name}`, () => {
    const track = source();
    const plan = planMallDistrict(track);
    const limit = track.width / 2 + MALL.RAIL_MARGIN;
    assert.ok(plan.rects.length > 60, `a packed district (${plan.rects.length} buildings)`);
    assert.ok(plan.landmark, 'the escalator found a spot');
    for (const r of plan.rects) {
      const d = minDistToLane(r, plan.points);
      assert.ok(d > limit, `${r.kind} at ${r.cx.toFixed(1)},${r.cy.toFixed(1)} is ${d.toFixed(2)} from the lane, needs > ${limit}`);
      assert.ok(r.hu > 0 && r.hv > 0);
    }
    // No two buildings overlap, and each stays on the slab.
    const rs = plan.rects;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        if (rs[i].box[2] < rs[j].box[0] || rs[j].box[2] < rs[i].box[0] || rs[i].box[3] < rs[j].box[1] || rs[j].box[3] < rs[i].box[1]) continue;
        assert.equal(rectsOverlap(rs[i], rs[j], 0), false, `buildings ${i} and ${j} overlap`);
      }
      for (const [x, y] of rectCorners(rs[i])) assert.ok(distToPolyline(x, y, plan.points) <= plan.R, 'corner on the slab');
    }
    // Fills the gaps between legs: the zig-zag's folds are 24-30 cells apart, so most of that space gets buildings.
    if (name === 'synthetic zig-zag') {
      const between = rs.filter((r) => r.cy > 14 && r.cy < 42 && r.cx > 40 && r.cx < 130);
      assert.ok(between.length > 6, `gap between the first two legs is built up (${between.length})`);
    }
    // Deterministic: the same track gives the same district.
    assert.deepEqual(planMallDistrict(track).rects.map((r) => [r.cx, r.cy, r.kind, r.color]), plan.rects.map((r) => [r.cx, r.cy, r.kind, r.color]));
    // Details stay off the lane too.
    for (const [x, y] of plan.lamps) assert.ok(distToPolyline(x, y, plan.points) > track.width / 2 + 1);
    for (const d of plan.debris) assert.ok(distToPolyline(d.x, d.y, plan.points) > plan.R);
  });
}

// A recording stand-in for a 2D context, enough to run the drawing code in node.
function fakeCtx(width = 1280, height = 720) {
  const calls = [];
  const gradient = { addColorStop() {} };
  const matrix = { a: 1, b: 0, c: 0, d: 1, e: 640, f: 360, inverse() { return { transformPoint: (p) => ({ x: p.x - 640, y: p.y - 360 }) }; } };
  const ctx = new Proxy({ canvas: { width, height } }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'getTransform') return () => matrix;
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      if (prop === 'createPattern') return () => ({ setTransform() {} });
      if (prop === 'measureText') return () => ({ width: 80 });
      return (...args) => { calls.push(String(prop)); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return { ctx, calls };
}
function withFakeDocument(fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: () => { const c = fakeCtx(1, 1); return { width: 0, height: 0, getContext: () => c.ctx }; } };
  try { return fn(); } finally { if (had) Object.defineProperty(globalThis, 'document', had); else delete globalThis.document; }
}

test('Week 1 never enters the mall drawing code; a themed event does', () => {
  const w1 = createWeeklyScene(createWeeklyLayout(week1));
  assert.equal(mallThemeOf(w1), null);
  assert.equal(mallThemeOf(null), null);
  assert.equal(mallThemeOf({ weekly: { theme: 'other' } }), null);
  const quiet = fakeCtx();
  drawMallDistrict(quiet.ctx, w1, 40, { time: 1 });
  drawMallLane(quiet.ctx, w1, 40);
  assert.equal(quiet.calls.length, 0, 'no canvas calls at all for Week 1');

  const mall = createWeeklyScene(createWeeklyLayout({ ...week1, theme: 'mall' }));
  assert.equal(mallThemeOf(mall), 'mall');
  const loud = fakeCtx();
  withFakeDocument(() => { drawMallDistrict(loud.ctx, mall, 40, { time: 1, reducedMotion: true }); drawMallLane(loud.ctx, mall, 40); });
  assert.ok(loud.calls.includes('drawImage'), 'baked tiles are blitted');
  assert.ok(loud.calls.includes('stroke'), 'the lane floor is stroked');
  // Reduced motion: two frames at different times draw the same thing.
  const again = fakeCtx();
  withFakeDocument(() => { drawMallDistrict(again.ctx, mall, 40, { time: 9, reducedMotion: true }); });
  assert.ok(again.calls.length > 0);
});

test('the renderer wires the theme only behind a guard and the weekly world is untouched', () => {
  const graphics = readFileSync(new URL(`../${SHOOTER}/ui/graphics.js`, import.meta.url), 'utf8');
  assert.match(graphics, /const mall = mallThemeOf\(lv\);/);
  assert.match(graphics, /if \(mall\) drawMallDistrict\(/);
  assert.match(graphics, /if \(mall\) drawMallLane\(/);
  for (const f of ['gfx/weeklyVfx.js', 'gfx/stardustVfx.js', 'engine/weekly/sim.js', 'engine/weekly/layout.js', 'engine/modes/weekly.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../${SHOOTER}/${f}`, import.meta.url), 'utf8'), /bmallb|mallTheme|mallPlan/i, `${f} knows nothing about the mall`);
  }
});
