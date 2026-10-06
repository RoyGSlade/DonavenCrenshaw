import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkin, configureTrackSkin, laneSkin, finishChecker, drawMidnightLane, drawClassicLane,
  skinCacheStats, resetSkinCache, pickDensity, SKIN_CACHE, SKIN_TIERS,
} from '../projects/Space-Shooter/gfx/trackSkin.js';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { createWeeklyLayout } from '../projects/Space-Shooter/engine/weekly/layout.js';

// A 2D context that accepts every call and remembers a transform: enough to drive the cache.
function fakeContext(canvas, transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) {
  const calls = { drawImage: 0, stroke: 0 };
  const target = {
    canvas,
    calls,
    transform,
    getTransform: () => target.transform,
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    drawImage: () => { calls.drawImage++; },
    stroke: () => { calls.stroke++; },
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}
function fakeCanvasFactory(made) {
  return (width, height) => {
    const canvas = { width, height };
    canvas.getContext = () => fakeContext(canvas);
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
