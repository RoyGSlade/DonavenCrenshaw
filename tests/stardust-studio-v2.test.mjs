// Track Studio v2: geometry (smoothing, overlap and turn checks), width taper
// maths, the draft v2 schema and v1 compatibility, the converter on v2
// designs, and the per-track skin field.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  smoothStroke, resample, rdp, rdpClosed, chaikin, catmullRom, autoClose, polylineLength, nearestOnPolyline,
  spanMembership, widthAt, widthSamples, paintWidthSpan, coveredStretch, isUniformWidth, analyzeLane, laneSamples,
  racingLine, pointsAlong, snapPoint, mirrorAcrossLane, reshapeLane, eraseLane, autoStartDistance, GAME, DESIGN,
} from '../projects/Space-Shooter/studio/studioGeometry.js';
import { newDoc, normalizeDoc, fromV1, pageSize, toWorld, toPage, DRAFT_VERSION, STAMP_TYPES, LAYER_ORDER } from '../projects/Space-Shooter/studio/draftV2.js';
import { sketchToWeekly, weeklyPreviewSvg, gameLane } from '../projects/Space-Shooter/studio/sketchToWeekly.js';
import { validateDraftEvent, DRAFT_SKINS } from '../projects/Space-Shooter/systems/weeklyStudio.js';
import { SKINS, configureTrackSkin, laneSkin } from '../projects/Space-Shooter/gfx/trackSkin.js';
import { createWeeklyLayout, WEEKLY_RULES as R } from '../projects/Space-Shooter/engine/weekly/layout.js';

const circle = (r, n = 200, cx = 100, cy = 100, jitter = 0) => Array.from({ length: n }, (_, i) => {
  const a = (2 * Math.PI * i) / n, noise = jitter * Math.sin(i * 12.9898) * Math.cos(i * 4.1414);
  return [cx + (r + noise) * Math.cos(a), cy + (r + noise) * Math.sin(a)];
});
const maxRadiusError = (pts, r, cx = 100, cy = 100) => Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r)));

// A page-coordinate oval as a closed v2 lane.
function ovalDoc({ aspect = 0.75, cells = 260, rx = 0.4, ry = 0.42, n = 240 } = {}) {
  const doc = newDoc({ id: 'd-test', aspect, cells });
  doc.lane = { points: Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [0.5 + rx * Math.cos(a), 0.5 + ry * Math.sin(a)]; }), closed: true, start: 0 };
  return doc;
}

// ---------------------------------------------------------------- smoothing

test('smoothStroke removes finger jitter, keeps the shape and spaces points evenly', () => {
  const raw = circle(60, 400, 100, 100, 1.6);
  assert.ok(maxRadiusError(raw, 60) > 1);
  const smooth = smoothStroke(raw, { closed: true, spacing: 1.5 });
  assert.ok(maxRadiusError(smooth, 60) < 1.2, `error ${maxRadiusError(smooth, 60)}`);
  const gaps = smooth.map((p, i) => Math.hypot(p[0] - smooth[(i + 1) % smooth.length][0], p[1] - smooth[(i + 1) % smooth.length][1]));
  assert.ok(Math.max(...gaps) < 1.7 && Math.min(...gaps) > 1.3, `${Math.min(...gaps)}..${Math.max(...gaps)}`);
  // Stronger smoothing is smoother: less total length wasted on wiggles.
  const low = polylineLength(smoothStroke(raw, { closed: true, strength: 'low' }), true);
  const high = polylineLength(smoothStroke(raw, { closed: true, strength: 'high' }), true);
  assert.ok(high <= low + 1e-6, `${high} vs ${low}`);
  // Open strokes keep their end points.
  const open = smoothStroke([[0, 0], [10, 0.4], [20, -0.3], [30, 0]], { closed: false });
  assert.deepEqual(open[0], [0, 0]);
  assert.deepEqual(open.at(-1), [30, 0]);
});

test('resample, RDP, Chaikin and Catmull-Rom behave', () => {
  const line = resample([[0, 0], [10, 0]], 1);
  assert.equal(line.length, 11);
  assert.deepEqual(rdp([[0, 0], [5, 0.01], [10, 0]], 0.1), [[0, 0], [10, 0]]);
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(rdpClosed(resample(square, 0.5, true), 0.05).length, 4);
  assert.equal(chaikin(square, 1, true).length, 8);
  const cr = catmullRom(square, 1, true);
  assert.ok(cr.length >= 40);
  for (const p of square) assert.ok(cr.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9), 'passes through its control points');
});

test('autoClose closes a loop that ends near its start and trims the overshoot', () => {
  const pts = circle(40, 120).concat(circle(40, 120).slice(0, 6));
  const closed = autoClose(pts, 6);
  assert.equal(closed.closed, true);
  assert.ok(closed.points.length <= 121);
  const open = autoClose(circle(40, 120).slice(0, 80), 6);
  assert.equal(open.closed, false);
});

test('nearestOnPolyline reports lap distance and a signed offset (+ right of travel)', () => {
  const q = nearestOnPolyline([[0, 0], [10, 0], [10, 10], [0, 10]], [5, 2], true);
  assert.equal(q.i, 0);
  assert.ok(Math.abs(q.s - 5) < 1e-9);
  assert.ok(Math.abs(q.off - 2) < 1e-9, 'y down: +y is right of +x travel');
});

// ---------------------------------------------------------------- width taper

test('spanMembership: hard steps without taper, smooth symmetric ramps with it', () => {
  const lap = 100;
  assert.equal(spanMembership(5, 10, 20, 0, lap), 0);
  assert.equal(spanMembership(10, 10, 20, 0, lap), 1);
  assert.equal(spanMembership(29.9, 10, 20, 0, lap), 1);
  assert.equal(spanMembership(30, 10, 20, 0, lap), 0);
  // Taper 10: the ramp is centred on each edge, half value right at the edge.
  assert.equal(spanMembership(5, 10, 20, 10, lap), 0);
  assert.ok(Math.abs(spanMembership(10, 10, 20, 10, lap) - 0.5) < 1e-9);
  assert.equal(spanMembership(15, 10, 20, 10, lap), 1);
  assert.equal(spanMembership(25, 10, 20, 10, lap), 1);
  assert.ok(Math.abs(spanMembership(30, 10, 20, 10, lap) - 0.5) < 1e-9);
  assert.equal(spanMembership(35, 10, 20, 10, lap), 0);
  // Monotonic up the in-ramp, down the out-ramp.
  let prev = -1;
  for (let s = 4; s <= 16; s += 0.25) { const m = spanMembership(s, 10, 20, 10, lap); assert.ok(m >= prev - 1e-12); prev = m; }
  prev = 2;
  for (let s = 24; s <= 36; s += 0.25) { const m = spanMembership(s, 10, 20, 10, lap); assert.ok(m <= prev + 1e-12); prev = m; }
  // A span shorter than its taper never reaches full strength.
  const peak = Math.max(...Array.from({ length: 200 }, (_, i) => spanMembership(i / 2, 40, 4, 20, lap)));
  assert.ok(peak > 0 && peak < 1, `peak ${peak}`);
  // Wraps across the start of the lap.
  assert.equal(spanMembership(2, 95, 10, 0, lap), 1);
  assert.equal(spanMembership(97, 95, 10, 0, lap), 1);
  assert.equal(spanMembership(50, 95, 10, 0, lap), 0);
  assert.equal(spanMembership(50, 0, 100, 10, lap), 1);
});

test('widthAt: very wide flows into narrow over the taper, clamped to the game minimum', () => {
  const lap = 400;
  const profile = { base: 6, taper: 40, spans: [{ from: 0.25, len: 0.25, w: 12 }] };
  assert.equal(widthAt(profile, 0, lap), 6);
  assert.equal(widthAt(profile, 150, lap), 12);
  assert.ok(Math.abs(widthAt(profile, 100, lap) - 9) < 1e-9, 'half way at the edge');
  const ws = widthSamples(profile, lap, 400);
  for (let i = 1; i < ws.length; i++) assert.ok(Math.abs(ws[i] - ws[i - 1]) < 0.35, `no jumps (${i})`);
  assert.equal(widthAt({ base: 3, spans: [] }, 0, lap), GAME.MIN_WIDTH, 'never under 5.8');
  assert.equal(widthAt({ base: 7, spans: [{ from: 0, len: 0.5, w: 2 }], taper: 0 }, 10, lap), GAME.MIN_WIDTH);
  assert.equal(widthAt({ base: 7, spans: [{ from: 0, len: 0.5, w: 40 }], taper: 0 }, 10, lap), DESIGN.MAX_WIDTH);
  assert.equal(isUniformWidth({ base: 7, spans: [] }), true);
  assert.equal(isUniformWidth(profile), false);
  // Later spans win where they overlap.
  const layered = { base: 7, taper: 0, spans: [{ from: 0, len: 0.5, w: 10 }, { from: 0.1, len: 0.1, w: 6 }] };
  assert.equal(widthAt(layered, 0.15 * lap, lap), 6);
  assert.equal(widthAt(layered, 0.3 * lap, lap), 10);
});

test('paintWidthSpan and coveredStretch: brush strokes become spans, covered ones are replaced', () => {
  const lap = 200;
  let p = { base: 7, taper: 10, spans: [] };
  p = paintWidthSpan(p, 20, 60, 10, lap);
  p = paintWidthSpan(p, 30, 40, 6, lap);
  assert.equal(p.spans.length, 2);
  p = paintWidthSpan(p, 10, 80, 9, lap);
  assert.equal(p.spans.length, 1, 'a span that covers older ones replaces them');
  assert.deepEqual(p.spans[0], { from: 0.05, len: 0.35, w: 9 });
  assert.deepEqual(coveredStretch([5, 7, 9], lap), { s0: 5, s1: 9 });
  assert.deepEqual(coveredStretch([195, 198, 2, 4], lap), { s0: 195, s1: 4 }, 'wraps over the start');
});

// ---------------------------------------------------------------- lane checks

test('analyzeLane: a clean oval passes, with a lap time estimate', () => {
  const oval = circle(70, 300);
  const a = analyzeLane(oval, { closed: true, width: 7 });
  assert.equal(a.overlaps.length, 0);
  assert.equal(a.crossings.length, 0);
  assert.equal(a.tight.length, 0);
  assert.equal(a.zigzags.length, 0);
  assert.ok(Math.abs(a.length - 2 * Math.PI * 70) < 2);
  assert.ok(a.pilotMs > 30000 && a.pilotMs < 80000, `${a.pilotMs}`);
  assert.ok(a.humanMs < a.pilotMs);
});

test('analyzeLane: overlapping stretches, a crossing, razor turns and zig-zags get markers', () => {
  // Two long stretches 5 cells apart: lanes 7 wide overlap.
  const hairpinLoop = [[0, 0], [100, 0], [100, 5], [0, 5]];
  const near = analyzeLane(resample(hairpinLoop, 1, true), { closed: true, width: 7 });
  assert.ok(near.overlaps.length > 0, 'parallel stretches overlap');
  assert.ok(near.tight.length > 0, 'the 5-cell hairpins are too tight');
  // Wider apart: no overlap.
  const apart = analyzeLane(resample([[0, 0], [100, 0], [100, 40], [0, 40]], 1, true), { closed: true, width: 7 });
  assert.equal(apart.overlaps.length, 0);
  // Variable width matters: widen the lane to 30 and the same loop overlaps.
  const wide = analyzeLane(resample([[0, 0], [100, 0], [100, 40], [0, 40]], 1, true), { closed: true, profile: { base: 7, taper: 0, spans: [{ from: 0, len: 1, w: 14 }] } });
  assert.equal(wide.maxWidth, 14);
  // A figure eight crosses itself.
  const eight = Array.from({ length: 400 }, (_, i) => { const t = (2 * Math.PI * i) / 400; return [100 + 80 * Math.sin(t), 100 + 40 * Math.sin(2 * t)]; });
  assert.ok(analyzeLane(eight, { closed: true, width: 7 }).crossings.length > 0);
  // Razor zig-zags (the week-2 v1 problem).
  const zig = [];
  for (let i = 0; i <= 12; i++) zig.push([i * 6, i % 2 ? 6 : 0]);
  const zz = analyzeLane([...zig, [72, 80], [0, 80]], { closed: true, width: 6 });
  assert.ok(zz.zigzags.length >= 3, `zigzags ${zz.zigzags.length}`);
});

test('racing line stays inside the lane and is shorter than the centre line', () => {
  const { samples, length } = laneSamples(resample([[0, 0], [120, 0], [120, 60], [0, 60]], 1, true), { closed: true, width: 8 });
  analyzeLane(samples.map((p) => [p.x, p.y]), { closed: true, width: 8 });
  const line = racingLine(samples);
  assert.equal(line.length, samples.length);
  assert.ok(polylineLength(line, true) < length);
  const centre = samples.map((p) => [p.x, p.y]);
  for (const p of line) assert.ok(nearestOnPolyline(centre, p, true).d <= 4 - DESIGN.PILOT_MARGIN + 0.05);
});

test('pointsAlong, snapping, mirroring, reshaping and erasing', () => {
  assert.equal(pointsAlong([[0, 0], [30, 0]], 10).length, 3);
  const lane = [[0, 0], [100, 0], [100, 50], [0, 50]];
  assert.deepEqual(snapPoint([40, 3], 'centre', { lane }), [40, 0]);
  assert.deepEqual(snapPoint([40, 3], 'edge', { lane, width: 7, inset: 0.5 }), [40, 3]);
  assert.deepEqual(snapPoint([41, 3], 'grid', { grid: 5 }), [40, 5]);
  const m = mirrorAcrossLane([40, 2], lane);
  assert.ok(Math.abs(m[0] - 40) < 1e-9 && Math.abs(m[1] + 2) < 1e-9);
  // Reshape the top stretch into a bump.
  const dense = resample(lane, 2, true);
  const bump = [[30, 0], [40, -20], [60, -20], [70, 0]];
  const reshaped = reshapeLane(dense, bump, 4);
  assert.ok(reshaped && reshaped.some((p) => p[1] < -15));
  assert.ok(!reshaped.some((p) => p[1] === 0 && p[0] > 35 && p[0] < 65), 'the replaced arc is gone');
  assert.ok(Math.abs(polylineLength(reshaped, true) - polylineLength(dense, true)) > 10);
  assert.equal(reshapeLane(dense, [[50, 25], [55, 25]], 4), null, 'must start and end on the lane');
  // Erase a bite: the loop opens at the gap.
  const erased = eraseLane(dense, true, [[50, 50]], 5);
  assert.equal(erased.closed, false);
  assert.ok(erased.points.length < dense.length);
  assert.ok(!erased.points.some((p) => Math.hypot(p[0] - 50, p[1] - 50) <= 5));
  const s = autoStartDistance(analyzeLane(resample([[0, 0], [200, 0], [200, 30], [0, 30]], 1, true), { closed: true, width: 7 }));
  assert.ok(s > 0 && s < 200, `start on the long top straight (${s})`);
});

// ---------------------------------------------------------------- draft schema

test('draft v2: new, normalized and bounded', () => {
  const doc = newDoc({ aspect: 0.75 });
  assert.equal(doc.version, DRAFT_VERSION);
  assert.deepEqual(Object.keys(doc.layers), LAYER_ORDER);
  assert.deepEqual(pageSize(doc), { w: 195, h: 260 });
  assert.deepEqual(toWorld(doc, [1, 1]), [195, 260]);
  assert.deepEqual(toPage(doc, [97.5, 130]), [0.5, 0.5]);
  const messy = {
    version: 2, id: '../evil', title: 'x'.repeat(500), skin: 'neon', difficulty: 'brutal',
    page: { aspect: 99, cells: 5 },
    lane: { points: [[0.1, 0.1], ['a', 0], [0.5, 0.9], [0.9, 0.1]], closed: true, start: 99 },
    width: { base: 2, taper: -4, spans: [{ from: 1.25, len: 0.1, w: 99 }, { from: 0, len: 0 }, null] },
    strokes: [{ layer: 'obstacles', type: 'laser', points: [[0, 0], [1, 1]], spacing: 0 }, { layer: 'lava', points: [[0, 0]] }],
    stamps: [{ type: 'mine', x: 0.5, y: 0.5, size: 1e9, behavior: 'teleport' }, { type: 'ufo', x: 0, y: 0 }],
    requests: [{ id: 'q1', title: 'Escalator', type: 'nope' }],
    layers: { notes: { visible: false, locked: true } }, auto: { hazards: 'maybe' },
  };
  const n = normalizeDoc(messy);
  assert.equal(n.id, 'd-1');
  assert.equal(n.title.length, 60);
  assert.equal(n.skin, 'midnight');
  assert.equal(n.difficulty, 'normal');
  assert.equal(n.page.aspect, 5);
  assert.equal(n.page.cells, 120);
  assert.equal(n.lane.points.length, 3);
  assert.equal(n.lane.start, 0);
  assert.equal(n.width.base, GAME.MIN_WIDTH);
  assert.equal(n.width.taper, 0);
  assert.deepEqual(n.width.spans, [{ from: 0.25, len: 0.1, w: DESIGN.MAX_WIDTH }]);
  assert.equal(n.strokes.length, 1);
  assert.equal(n.strokes[0].type, 'mine');
  assert.equal(n.strokes[0].spacing, 1);
  assert.equal(n.stamps.length, 1);
  assert.equal(n.stamps[0].behavior, 'static');
  assert.equal(n.stamps[0].size, 60);
  assert.equal(n.requests[0].type, 'other');
  assert.deepEqual(n.layers.notes, { visible: false, locked: true });
  assert.equal(n.auto.hazards, 'auto');
  assert.throws(() => normalizeDoc('nope'), TypeError);
  assert.throws(() => normalizeDoc({ version: 3 }), TypeError);
  assert.deepEqual(normalizeDoc(JSON.parse(JSON.stringify(n))), n, 'normalizing is idempotent');
});

test('v1 sketches stay loadable: marks become stamps and the lap keeps its length', () => {
  const v1 = {
    version: 1, aspect: 1.333, start: 3, difficulty: 'hard',
    points: Array.from({ length: 120 }, (_, i) => { const a = (2 * Math.PI * i) / 120; return [0.5 + 0.35 * Math.cos(a), 0.5 + 0.3 * Math.sin(a)]; }),
    marks: [{ at: 10, kind: 'landmark', note: 'Food court' }, { at: 40, kind: 'fast' }, { at: 70, kind: 'tight' }],
  };
  assert.equal(fromV1({ ...v1, marks: [...v1.marks, { at: 9999, kind: 'calm' }, { at: 2, kind: 'lava' }] }).stamps.length, 3, 'bad marks are dropped');
  const doc = fromV1(v1);
  assert.equal(doc.version, 2);
  assert.equal(doc.lane.closed, true);
  assert.equal(doc.lane.start, 3);
  assert.equal(doc.difficulty, 'hard');
  assert.deepEqual(doc.stamps.map((s) => s.type), ['landmark', 'fast', 'tight']);
  assert.equal(doc.stamps[0].label, 'Food court');
  assert.deepEqual(normalizeDoc(v1).lane, doc.lane, 'normalizeDoc accepts v1 too');
  const one = sketchToWeekly(v1), two = sketchToWeekly(doc);
  const ratio = two.report.lengthCells / one.report.lengthCells;
  assert.ok(ratio > 0.97 && ratio < 1.06, `lap ratio ${ratio}`);
  assert.equal(two.event.track.landmark, 'Food court');
  assert.equal(one.intent, undefined, 'v1 output is unchanged: no intent');
  assert.equal(one.report.draftVersion, undefined);
});

// ---------------------------------------------------------------- converter v2

test('converter v2: emits what the game supports, keeps the rest as intent', () => {
  const doc = ovalDoc();
  doc.title = 'The Abandoned Mall';
  doc.landmark = 'The Broken Escalator';
  doc.skin = 'classic';
  doc.width = { base: 7.2, taper: 30, spans: [{ from: 0.1, len: 0.1, w: 11 }] };
  doc.stamps = [
    { id: 's1', type: 'mine', x: 0.5, y: 0.08, size: 0.84, rotation: 0, behavior: 'static' },
    { id: 's2', type: 'mine', x: 0.1, y: 0.55, size: 0.84, rotation: 0, behavior: 'falling' },
    { id: 's3', type: 'rock', x: 0.13, y: 0.4, size: 1.6, rotation: 0, behavior: 'moving', period: 2 },
    { id: 's4', type: 'sentry', x: 0.5, y: 0.97, size: 1.2, rotation: 0, behavior: 'static' },
    { id: 's5', type: 'fuel', x: 0.783, y: 0.797, size: 2.4, rotation: 0, behavior: 'static' },
    { id: 's6', type: 'landmark', x: 0.5, y: 0.5, size: 10, rotation: 0, behavior: 'static', label: 'Food court' },
    { id: 's7', type: 'barricade', x: 0.5, y: 0.92, size: 3, rotation: 0, behavior: 'timed' },
    { id: 's8', type: 'request', x: 0.3, y: 0.15, size: 4, rotation: 0, behavior: 'static', requestId: 'q1' },
    { id: 's9', type: 'mine', x: 0.5, y: 0.5, size: 0.84, rotation: 0, behavior: 'static' },
  ];
  doc.requests = [{ id: 'q1', title: 'Broken escalator', type: 'hazard', behavior: 'falling', cardRef: 'ab12', status: 'filed', queued: true, stampId: 's8' }];
  doc.strokes = [
    { id: 'k1', layer: 'shards', points: [[0.9, 0.3], [0.9, 0.7]], spacing: 14 },
    { id: 'k2', layer: 'obstacles', type: 'mine', behavior: 'static', spacing: 9, size: 0.84, points: [[0.12, 0.45], [0.12, 0.6]] },
    { id: 'k3', layer: 'hazards', type: 'debris', closed: true, points: [[0.3, 0.3], [0.4, 0.3], [0.4, 0.4], [0.3, 0.4]] },
    { id: 'k4', layer: 'notes', points: [[0.6, 0.6], [0.65, 0.62]], label: 'shops fly by here' },
  ];
  const { event, report, intent } = sketchToWeekly(doc, { id: 'w2-v7', version: 7 });
  const t = event.track;
  assert.equal(event.title, 'The Abandoned Mall');
  assert.equal(t.landmark, 'The Broken Escalator');
  assert.equal(t.skin, 'classic');
  assert.equal(t.width, 7.2, 'the base width (inside 5.8..8) is what the game flies');
  assert.equal(report.draftVersion, 2);
  assert.equal(report.skin, 'classic');
  assert.ok(report.ok, JSON.stringify(report));
  // Explicit shards from the shard pen replace the automatic ones.
  assert.ok(t.shards.length >= 5 && t.shards.length <= 8, `shards ${t.shards.length}`);
  // Obstacles drawn: no automatic hazards. The static mine stamp and the mine row stay unless the pilot hit them.
  assert.ok(t.mines.length >= 3 && t.mines.length <= 5, `mines ${t.mines.length}`);
  assert.ok(t.bouncers.length <= 1 && t.sentries.length <= 1);
  assert.ok(report.notes.some((n) => /Left out 1 mines drawn off the lane/.test(n)), JSON.stringify(report.notes));
  assert.equal(t.stations.length, 1, 'the fuel dock stamp replaces the automatic docks');
  const kinds = intent.map((i) => i.kind);
  for (const k of ['width', 'landmark', 'barricade', 'zone', 'request', 'behaviour', 'note']) assert.ok(kinds.includes(k), `intent ${k}: ${kinds}`);
  assert.ok(report.intent.some((s) => s.includes('Broken escalator') && s.includes('card ab12')));
  assert.ok(report.intent.some((s) => s.includes('falling') && s.includes('left out')));
  for (const i of intent.filter((x) => x.at)) assert.ok(i.lap >= 0 && i.lap <= 1);
  // The emitted event is a valid studio draft for the game, and the preview draws the intent.
  assert.doesNotThrow(() => validateDraftEvent(structuredClone(event)));
  const svg = weeklyPreviewSvg(event, { intent });
  assert.ok(svg.includes('stroke-dasharray="1.5 1"') && svg.includes('>?</text>'));
  assert.ok(!weeklyPreviewSvg(event).includes('>?</text>'));
});

test('converter v2: automatic hazards when no obstacles are drawn, top-up to the shard minimum', () => {
  const doc = ovalDoc();
  doc.difficulty = 'hard';
  const auto = sketchToWeekly(doc);
  assert.ok(auto.event.track.mines.length > 0, 'nothing drawn: automatic mines');
  assert.ok(auto.event.track.shards.length >= 8);
  const off = ovalDoc();
  off.auto.hazards = 'off';
  off.stamps = [{ id: 's1', type: 'shard', x: 0.9, y: 0.5, size: 1, rotation: 0, behavior: 'static' }];
  const out = sketchToWeekly(off);
  assert.equal(out.event.track.mines.length, 0);
  assert.equal(out.event.track.shards.length, R.MIN_SHARDS);
  assert.ok(out.report.notes.some((n) => n.startsWith('Added 2 shards')));
  assert.equal(out.event.track.skin, 'midnight');
  // Page scale is honoured: a bigger page makes a longer lap.
  const big = ovalDoc({ cells: 390 });
  const ratio = sketchToWeekly(big).report.lengthCells / auto.report.lengthCells;
  assert.ok(Math.abs(ratio - 1.5) < 0.05, `ratio ${ratio}`);
});

test('converter v2: start stamp moves the start, gates pin checkpoints, bad designs are refused', () => {
  const doc = ovalDoc();
  doc.stamps = [{ id: 's1', type: 'start', x: 0.1, y: 0.5, size: 7, rotation: 0, behavior: 'static' },
    { id: 's2', type: 'gate', x: 0.5, y: 0.08, size: 7, rotation: 0, behavior: 'static' }];
  const lane = gameLane(doc);
  const [x0, y0] = lane.toWorld([0.1, 0.5]);
  assert.ok(Math.hypot(lane.points[0][0] - x0, lane.points[0][1] - y0) < 1, 'point 0 is at the start stamp');
  const [gx, gy] = lane.toWorld(doc.lane.points[Math.round(doc.lane.points.length * 0.75)]);
  assert.ok(lane.points.some((p) => Math.hypot(p[0] - gx, p[1] - gy) < 1), 'the gate is a pinned checkpoint');
  const open = ovalDoc();
  open.lane.closed = false;
  assert.throws(() => sketchToWeekly(open), /Close the lane loop/);
  assert.throws(() => sketchToWeekly({ version: 2, lane: { points: [], closed: true } }), TypeError);
});

// ---------------------------------------------------------------- skin field

test('per-track skin: the track picks, ?skin= wins, drafts are checked', () => {
  assert.deepEqual(DRAFT_SKINS, [...SKINS]);
  configureTrackSkin({ skin: null });
  assert.equal(laneSkin({ weekly: { track: { skin: 'classic' } } }), 'classic');
  assert.equal(laneSkin({ weekly: { track: { skin: 'midnight' } } }), 'midnight');
  assert.equal(laneSkin({ weekly: { track: {} } }), 'midnight', 'no skin: the default');
  assert.equal(laneSkin({ weekly: { track: { skin: 'bogus' } } }), 'midnight');
  assert.equal(laneSkin({ track: {} }), 'classic', 'non-weekly circuits keep the original lane');
  configureTrackSkin({ skin: 'midnight' });
  assert.equal(laneSkin({ weekly: { track: { skin: 'classic' } } }), 'midnight', 'the address bar wins');
  configureTrackSkin({ skin: 'classic' });
  assert.equal(laneSkin({ weekly: { track: { skin: 'midnight' } } }), 'classic');
  configureTrackSkin({ skin: null });
  const { event } = sketchToWeekly(ovalDoc());
  assert.doesNotThrow(() => validateDraftEvent(structuredClone(event)));
  assert.throws(() => validateDraftEvent({ ...structuredClone(event), track: { ...structuredClone(event.track), skin: 'neon' } }), /skin/);
  // Visual only: the layout (what the sim flies) is the same with or without a skin.
  const plain = structuredClone(event); delete plain.track.skin;
  const a = createWeeklyLayout(event), b = createWeeklyLayout(plain);
  assert.deepEqual(a.track.points, b.track.points);
  assert.deepEqual([a.shards, a.mines, a.bouncers, a.sentries, a.stations], [b.shards, b.mines, b.bouncers, b.sentries, b.stations]);
  assert.ok(STAMP_TYPES.mine.game === 'mines');
});
