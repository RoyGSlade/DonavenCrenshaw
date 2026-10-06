import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkin, configureTrackSkin, laneSkin, finishChecker, drawMidnightLane, drawClassicLane,
  skinCacheStats, resetSkinCache, pickDensity, skinAnimStats, SKIN_CACHE, SKIN_TIERS, SKIN_ANIM,
} from '../projects/Space-Shooter/gfx/trackSkin.js';
import { WEEKLY_EVENTS, currentWeekly } from '../projects/Space-Shooter/tracks/weekly.js';
import { WEEKLY_ROLLOUT } from '../projects/Space-Shooter/tracks/weeklyRollout.js';
import { createWeeklyLayout } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { createWeeklyScene } from '../projects/Space-Shooter/engine/weekly/sim.js';

// A 2D context that accepts every call and remembers a transform: enough to drive the cache.
// It also notes, for every stroke, how many subpaths it had and its style.
function fakeContext(canvas, transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) {
  const calls = { drawImage: 0, stroke: 0, strokes: [] };
  let subpaths = 0;
  const target = {
    canvas,
    calls,
    transform,
    getTransform: () => target.transform,
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    drawImage: () => { calls.drawImage++; },
    beginPath: () => { subpaths = 0; },
    moveTo: () => { subpaths++; },
    stroke: () => { calls.stroke++; calls.strokes.push({ subpaths, style: target.strokeStyle, width: target.lineWidth }); },
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
function fakeCanvasFactory(made) {
  return (width, height) => {
    const canvas = { width, height };
    canvas.getContext = () => (canvas.ctx ||= fakeContext(canvas));
    made.push(canvas);
    return canvas;
  };
}

const layout = createWeeklyLayout(WEEKLY_EVENTS[0]);
const track = layout.track;

test('the midnight skin is the default for weekly lanes and ?skin=classic brings the original back', () => {
  assert.equal(parseSkin(''), 'midnight');
  assert.equal(parseSkin('?weekly=weekly-01&preview=weekly'), 'midnight');
  assert.equal(parseSkin('?weekly=weekly-01&preview=weekly&skin=classic'), 'classic');
  assert.equal(parseSkin('?skin=CLASSIC'), 'classic');
  assert.equal(parseSkin('?skin=bogus'), 'midnight');
  configureTrackSkin({ skin: 'midnight' });
  assert.equal(laneSkin({ weekly: true }), 'midnight');
  assert.equal(laneSkin({ weekly: false }), 'classic', 'main circuits keep the original lane');
  assert.equal(laneSkin(null), 'classic');
  configureTrackSkin({ skin: 'classic' });
  assert.equal(laneSkin({ weekly: true }), 'classic');
  assert.deepEqual(finishChecker('classic'), { light: '#81ddd98a', dark: '#0a1b26', rows: 2, depth: 0.13 });
  configureTrackSkin({ skin: 'midnight' });
});

test('the classic lane draws straight to the screen and never touches the chunk cache', () => {
  const made = [];
  configureTrackSkin({ skin: 'classic', tier: 'high', createCanvas: fakeCanvasFactory(made) });
  const ctx = fakeContext({ width: 1280, height: 720 });
  drawClassicLane(ctx, track, 40);
  assert.ok(ctx.calls.stroke > 0);
  assert.equal(made.length, 0);
  assert.equal(skinCacheStats().chunks, 0);
  configureTrackSkin({ skin: 'midnight', tier: null, createCanvas: null });
});

test('zoom buckets hold through small zoom changes and respect the tier cap', () => {
  assert.equal(pickDensity(40, 0, 96), 48);
  assert.equal(pickDensity(44, 48, 96), 48, 'a speed zoom wobble keeps the bucket');
  assert.equal(pickDensity(300, 0, 64), 64);
  assert.equal(pickDensity(300, 0, 96), 96);
  for (const n of [1, 5, 13, 50, 120, 1000]) assert.ok(SKIN_CACHE.DENSITIES.includes(pickDensity(n, 0, 96)));
});

for (const tierName of Object.keys(SKIN_TIERS)) {
  test(`midnight lane cache stays bounded over a full lap (${tierName} tier)`, () => {
    const made = [];
    configureTrackSkin({ skin: 'midnight', tier: tierName, createCanvas: fakeCanvasFactory(made) });
    const tier = SKIN_TIERS[tierName];
    const unit = 40, W = 2532, H = 1170; // a phone held sideways at dpr 3
    const ctx = fakeContext({ width: W, height: H });
    // Fly the camera round the lap at a heavy zoom (needs more texels than any bucket),
    // turned with the view like the behind-ship camera.
    const zoom = 3;
    let peak = 0;
    for (let d = 0; d < track.length; d += 2) {
      const s = track.segments.find((g) => d <= g.start + g.length) || track.segments.at(-1);
      const t = (d - s.start) / s.length, x = s.x + s.dx * t, y = s.y + s.dy * t;
      const r = -Math.PI / 2 - Math.atan2(s.ty, s.tx), c = Math.cos(r) * zoom, n = Math.sin(r) * zoom;
      // screen = rotate·scale·(world·unit - cam·unit) + centre
      ctx.transform = { a: c, b: n, c: -n, d: c, e: W / 2 - (c * x - n * y) * unit, f: H / 2 - (n * x + c * y) * unit };
      drawMidnightLane(ctx, track, unit, { time: d / 10 });
      peak = Math.max(peak, skinCacheStats().chunks);
    }
    const stats = skinCacheStats();
    assert.ok(peak <= tier.maxChunks, `peak ${peak} chunks over ${tier.maxChunks}`);
    assert.ok(stats.density <= tier.maxDensity);
    assert.ok(stats.built > tier.maxChunks, 'a lap needs more chunks than the cache keeps, so eviction ran');
    assert.ok(stats.evicted > 0);
    assert.ok(stats.bytes <= stats.maxBytes);
    assert.ok(ctx.calls.drawImage > 0, 'chunks are blitted');
    for (const canvas of made) {
      assert.ok(canvas.width <= SKIN_CACHE.MAX_CANVAS_PX && canvas.height <= SKIN_CACHE.MAX_CANVAS_PX);
    }
    // Evicted chunks give their memory back.
    const live = made.filter((c) => c.width > 0 && c.width === stats.chunkPx);
    assert.equal(live.length, stats.chunks);
    resetSkinCache();
    assert.equal(skinCacheStats().chunks, 0);
    configureTrackSkin({ tier: null, createCanvas: null });
  });
}

// Point the behind-ship camera at distance d along the lap.
function aimCamera(ctx, d, { unit = 40, zoom = 1, W = 2532, H = 1170 } = {}) {
  const s = track.segments.find((g) => d <= g.start + g.length) || track.segments.at(-1);
  const t = (d - s.start) / s.length, x = s.x + s.dx * t, y = s.y + s.dy * t;
  const r = -Math.PI / 2 - Math.atan2(s.ty, s.tx), c = Math.cos(r) * zoom, n = Math.sin(r) * zoom;
  ctx.transform = { a: c, b: n, c: -n, d: c, e: W / 2 - (c * x - n * y) * unit, f: H / 2 - (n * x + c * y) * unit };
}

test('no rain or other many-streak layer is baked into the cached chunks', () => {
  const made = [];
  configureTrackSkin({ skin: 'midnight', tier: 'high', createCanvas: fakeCanvasFactory(made) });
  const ctx = fakeContext({ width: 2532, height: 1170 });
  for (let d = 0; d < track.length; d += 3) { aimCamera(ctx, d); drawMidnightLane(ctx, track, 40, { time: d / 10 }); }
  const chunkStrokes = made.filter((c) => c.ctx).flatMap((c) => c.ctx.calls.strokes);
  assert.ok(chunkStrokes.length > 100, 'chunks were painted');
  // The old baked rain was hundreds of short subpaths per stroke; every deck stroke
  // now traces one lane, one seam set or one hatch lip.
  for (const s of chunkStrokes) assert.ok(s.subpaths <= 1, `a chunk stroke with ${s.subpaths} subpaths`);
  assert.ok(!chunkStrokes.some((s) => /^rgba\(205,225,240/.test(String(s.style))), 'no rain colour in the cache');
  configureTrackSkin({ tier: null, createCanvas: null });
});

test('the rain pool is bounded per tier, allocated once, and the drops and rail pulses move', () => {
  const made = [];
  const W = 2532, H = 1170;
  for (const tierName of ['low', 'high', 'low']) {
    configureTrackSkin({ skin: 'midnight', tier: tierName, createCanvas: fakeCanvasFactory(made) });
    const ctx = fakeContext({ width: W, height: H });
    aimCamera(ctx, 30); drawMidnightLane(ctx, track, 40, { time: 1 });
    const { rainPool, rainAllocs } = skinAnimStats();
    const before = Float32Array.from(rainPool);
    for (let f = 1; f <= 120; f++) { aimCamera(ctx, 30 + f * 0.4); drawMidnightLane(ctx, track, 40, { time: 1 + f / 60 }); }
    const stats = skinAnimStats();
    assert.equal(stats.rainCount, SKIN_TIERS[tierName].rain, `${tierName} tier drop count`);
    assert.ok(stats.rainCount <= SKIN_ANIM.RAIN_MAX && stats.rainCapacity === SKIN_ANIM.RAIN_MAX);
    assert.equal(stats.rainPool, rainPool, 'same pool every frame');
    assert.equal(stats.rainAllocs, 1, 'the pool is allocated once for the page');
    assert.equal(rainAllocs, 1);
    assert.ok(stats.rainPool.some((v, i) => v !== before[i]), 'drops fall');
    assert.equal(stats.rainDrops, stats.rainCount);
    assert.ok(stats.rainStrokes >= 1 && stats.rainStrokes <= 2, 'rain is at most two strokes a frame');
    assert.ok(stats.flowStrokes >= 2, 'both rails pulse');
    assert.ok(stats.flowStrokes <= 8 * SKIN_TIERS[tierName].flowLayers, `flow strokes ${stats.flowStrokes}`);
    assert.equal(stats.sheenStrokes, SKIN_TIERS[tierName].sheen ? 1 : 0);
  }
  configureTrackSkin({ tier: null, createCanvas: null });
});

test('reduced motion draws a static, rain-free lane', () => {
  const made = [];
  configureTrackSkin({ skin: 'midnight', tier: 'high', createCanvas: fakeCanvasFactory(made) });
  const ctx = fakeContext({ width: 2532, height: 1170 });
  aimCamera(ctx, 30); drawMidnightLane(ctx, track, 40, { time: 1 }); // build the visible chunks
  const pool = Float32Array.from(skinAnimStats().rainPool);
  ctx.calls.stroke = 0; ctx.calls.drawImage = 0;
  for (let f = 1; f <= 30; f++) drawMidnightLane(ctx, track, 40, { time: 1 + f / 60, reducedMotion: true });
  const stats = skinAnimStats();
  assert.equal(ctx.calls.stroke, 0, 'no rain, rail flow or sheen strokes');
  assert.ok(ctx.calls.drawImage > 0, 'the cached deck still draws');
  assert.equal(stats.flowStrokes + stats.rainStrokes + stats.sheenStrokes + stats.rainDrops, 0);
  assert.deepEqual(Float32Array.from(stats.rainPool), pool, 'no drop moved');
  configureTrackSkin({ tier: null, createCanvas: null });
});

test('week 2 gets the midnight skin like week 1; main circuits and the custom track stay classic', () => {
  configureTrackSkin({ skin: 'midnight' });
  const week2 = WEEKLY_EVENTS.find((e) => e.id === 'weekly-02');
  assert.ok(week2, 'week 2 is in the weekly catalogue');
  assert.equal(week2.opensAt, WEEKLY_ROLLOUT.opensAt);
  assert.equal(week2.closesAt, WEEKLY_ROLLOUT.closesAt);
  // The owner's geometry lands at release; any track flies the same scene shape.
  const released = { ...week2, enabled: true, track: WEEKLY_EVENTS[0].track };
  const scene2 = createWeeklyScene(createWeeklyLayout(released));
  assert.equal(scene2.weekly.id, 'weekly-02');
  assert.equal(laneSkin(scene2), 'midnight');
  assert.equal(laneSkin(createWeeklyScene(createWeeklyLayout(WEEKLY_EVENTS[0]))), 'midnight');
  // During week 2's window it is the featured weekly, and still midnight.
  const featured = currentWeekly(Date.parse('2026-10-08T12:00:00-07:00'), [WEEKLY_EVENTS[0], released]);
  assert.equal(featured.id, 'weekly-02');
  assert.equal(laneSkin(createWeeklyScene(createWeeklyLayout(featured))), 'midnight');
  // Main circuits and the custom track have no weekly event.
  assert.equal(laneSkin({ track: scene2.track }), 'classic');
  assert.equal(laneSkin({ track: scene2.track, custom: true }), 'classic');
  configureTrackSkin({ skin: 'classic' });
  assert.equal(laneSkin(scene2), 'classic', '?skin=classic still wins');
  configureTrackSkin({ skin: 'midnight' });
});
