// Track Studio v2: true-to-game sizes. The size table must match the game's
// own constants (this file fails when one changes and the table does not),
// default stamps start at the in-game size, handles lock or snap honestly,
// the scale maths, the width clamps, old wide drafts, and the true-size checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZES, sizeTable, sizeRule, defaultStampSize, snapStampSize, trueStampSize, sizeLabel, sizeLocked,
  clampLaneWidth, widerThanGame, clampDocWidths, cellsToPx, scaleBar, shipVisible, blockedRows, shardReach,
  ROCK_RADIUS, SHARD_CLUSTER_MIN_GAP, SHIP_OUTLINE,
} from '../projects/Space-Shooter/studio/gameSizes.js';
import { newDoc, normalizeDoc, STAMP_TYPES } from '../projects/Space-Shooter/studio/draftV2.js';
import { paintWidthSpan, widthAt, DESIGN, GAME } from '../projects/Space-Shooter/studio/studioGeometry.js';
import { sketchToWeekly } from '../projects/Space-Shooter/studio/sketchToWeekly.js';
import { createWeeklyLayout, WEEKLY_RULES as R } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { SHIP_BODY, SHIP_HULL } from '../projects/Space-Shooter/engine/shipHull.js';
import { PLAYER_HULL } from '../projects/Space-Shooter/engine/hull.js';
import { config } from '../projects/Space-Shooter/state.js';
import { finishChecker } from '../projects/Space-Shooter/gfx/trackSkin.js';

const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`);

function ovalDoc({ rx = 0.4, ry = 0.42, n = 240 } = {}) {
  const doc = newDoc({ id: 'd-sizes', aspect: 0.75, cells: 260 });
  doc.lane = { points: Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [0.5 + rx * Math.cos(a), 0.5 + ry * Math.sin(a)]; }), closed: true, start: 0 };
  return doc;
}

// ---------------------------------------------------------------- the table vs the game

test('size table: pinned to the game constants (update both together)', () => {
  const pinned = {
    laneMin: 5.8, laneMax: 8, mineRadius: 0.42, shardPickup: 0.7, shardTouch: 0.31, shardHeight: 0.627, shardWidth: 0.3511,
    stationPickup: 1.2, sentryRadius: 0.55, sentryRange: 11, sentryOffset: 1.1, rockRadiusMin: 0.4, rockRailGap: 0.3,
    shardMerge: 1.2, shardClusterGap: 1.5, shipLength: 0.9533, shipWidth: 0.8691, shipHalfSpan: 0.4337, startBehind: 2.5, finishDepth: 0.48,
    checkpointAcross: 'lane width',
  };
  const rows = Object.fromEntries(sizeTable().map((r) => [r.key, r.value]));
  assert.deepEqual(rows, pinned);
  for (const r of sizeTable()) assert.ok(r.source && r.constant && r.label, `${r.key} names its source`);
});

test('size table: read from the game code, not copied', () => {
  assert.equal(SIZES.laneMin.value, R.MIN_WIDTH);
  assert.equal(SIZES.laneMax.value, R.MAX_WIDTH);
  assert.equal(SIZES.mineRadius.value, R.MINE_RADIUS);
  assert.equal(SIZES.shardPickup.value, R.SHARD_PICKUP);
  assert.equal(SIZES.shardTouch.value, R.SHARD_TOUCH);
  assert.equal(SIZES.stationPickup.value, R.STATION_PICKUP);
  assert.equal(SIZES.sentryRange.value, R.SENTRY_RANGE);
  assert.equal(SIZES.sentryOffset.value, R.SENTRY_OFFSET);
  assert.equal(SIZES.startBehind.value, R.START_BEHIND);
  assert.equal(SIZES.shipLength.value, SHIP_BODY.length);
  assert.equal(SIZES.shipWidth.value, SHIP_BODY.width);
  assert.equal(SIZES.shipHalfSpan.value, PLAYER_HULL.halfSpan);
  assert.equal(SHIP_OUTLINE, SHIP_HULL);
  close(SIZES.shardHeight.value, 0.95 * config.SHARD_SCALE);
  close(SIZES.shardHeight.value / 2, R.SHARD_TOUCH, 0.01, 'the drawn shard is what SHARD_TOUCH describes');
  close(SIZES.finishDepth.value, finishChecker('midnight').rows * finishChecker('midnight').depth);
  // Values the layout writes inline, measured from a real shipped-style layout.
  const layout = createWeeklyLayout({ week: 9, tagline: '', track: {
    title: 't', width: 7.4, points: [[0, 0], [60, 0], [60, 50], [0, 50]],
    shards: [], mines: [{ seg: 1, t: 0.3, off: 1 }], bouncers: [], sentries: [{ point: 2, side: 'inside' }], stations: [{ seg: 0, t: 0.5 }],
  } });
  assert.equal(layout.sentries[0].radius, SIZES.sentryRadius.value);
  assert.equal(layout.mines[0].radius, SIZES.mineRadius.value);
});

test('size table: the converter flies rocks and shard clusters inside the listed limits', () => {
  const doc = ovalDoc();
  doc.width.base = 7;
  doc.stamps = [
    { id: 's1', type: 'rock', x: 0.9, y: 0.5, size: 0.1, rotation: 0, behavior: 'static' },
    { id: 's2', type: 'rock', x: 0.1, y: 0.5, size: 40, rotation: 0, behavior: 'static' },
    { id: 's3', type: 'shards', x: 0.5, y: 0.08, size: 0.5, rotation: 0, behavior: 'static' },
  ];
  const { event } = sketchToWeekly(doc);
  const radii = event.track.bouncers.map((b) => b.radius).sort((a, b) => a - b);
  const half = event.track.width / 2;
  assert.equal(radii[0], ROCK_RADIUS.MIN, 'smallest rock radius');
  close(radii[1], half - ROCK_RADIUS.RAIL_GAP, 1e-3, 'largest rock radius');
  const rule = sizeRule('rock', event.track.width);
  close(rule.min, 2 * radii[0], 1e-9); close(rule.max, 2 * radii[1], 1e-3);
  // The cluster's three shards all survive at the smallest size (none merged),
  // SHARD_CLUSTER_MIN_GAP apart along the lap.
  assert.equal(event.track.shards.length, 3);
  const layout = createWeeklyLayout(event);
  const pts = layout.shards.map((s) => [s.x, s.y]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < 3; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    assert.ok(d > SIZES.shardMerge.value && Math.abs(d - SHARD_CLUSTER_MIN_GAP) < 0.05, `gap ${d}`);
  }
});

// ---------------------------------------------------------------- stamp sizes

test('default stamp sizes are the in-game sizes', () => {
  close(STAMP_TYPES.mine.size, 2 * R.MINE_RADIUS, 1e-3);
  close(STAMP_TYPES.sentry.size, 2 * SIZES.sentryRadius.value, 1e-3);
  close(STAMP_TYPES.fuel.size, 2 * R.STATION_PICKUP, 1e-3);
  close(STAMP_TYPES.shard.size, SIZES.shardHeight.value, 1e-3);
  for (const t of Object.keys(STAMP_TYPES)) {
    const r = sizeRule(t, 7);
    if (r.kind !== 'free') close(STAMP_TYPES[t].size, defaultStampSize(t, 7), 1e-3, t);
  }
  assert.equal(defaultStampSize('gate', 6.4), 6.4, 'gates span the lane');
  assert.equal(defaultStampSize('start', 12), R.MAX_WIDTH, 'the lane the game flies');
  assert.equal(defaultStampSize('landmark', 7, 6), 6, 'design intent keeps its sketch size');
});

test('size handles: fixed sizes lock, ranges snap inside, design intent is free in cells', () => {
  for (const t of ['mine', 'sentry', 'shard', 'fuel', 'gate', 'start']) assert.ok(sizeLocked(t), t);
  for (const t of ['rock', 'shards', 'barricade', 'debris', 'landmark', 'star', 'request', 'text']) assert.ok(!sizeLocked(t), t);
  assert.equal(snapStampSize('mine', 5, 7), 0.84);
  assert.equal(snapStampSize('sentry', 0.1, 7), 1.1);
  assert.equal(snapStampSize('gate', 99, 7.3), 7.3);
  assert.equal(snapStampSize('rock', 0.1, 7), 0.8, 'rock: smallest the converter flies');
  assert.equal(snapStampSize('rock', 50, 7), 6.4, 'rock: lane width minus 2 × RAIL_GAP');
  assert.equal(snapStampSize('rock', 50, 6), 5.4, 'the range follows the lane width');
  assert.equal(snapStampSize('rock', 1.63, 7), 1.65, 'snaps to 0.05 cells');
  assert.equal(snapStampSize('shards', 1, 7), 2 * SHARD_CLUSTER_MIN_GAP);
  assert.equal(STAMP_TYPES.shards.size, 3, 'the default cluster is unchanged');
  assert.equal(snapStampSize('barricade', 4.02, 7), 4);
  assert.equal(snapStampSize('landmark', 0.01, 7), 0.3);
  assert.equal(trueStampSize({ type: 'mine', size: 3 }, 7), 0.84, 'old drafts with a big mine draw at the real size');
  assert.equal(sizeLabel('mine', 0.84, 7), '0.84 cells across · fixed in game');
  assert.equal(sizeLabel('gate', 7, 7), '7.0 cells across · fixed in game (the lane width)');
  assert.equal(sizeLabel('rock', 1.6, 7), '1.6 cells across · game 0.8–6.4');
  assert.equal(sizeLabel('barricade', 4, 7), '4.0 cells across · design intent');
});

// ---------------------------------------------------------------- scale maths

test('scale: one world-to-screen scale, a lane-width scale bar, the ship when it can be seen', () => {
  assert.equal(cellsToPx(7, 3), 21);
  // Every item uses the lane's scale: a mine is the same fraction of the lane on screen at any zoom.
  for (const scale of [0.5, 3, 40]) close(cellsToPx(0.84, scale) / cellsToPx(7, scale), 0.12, 1e-12);
  assert.deepEqual(scaleBar(20, 7), { lanes: 1, cells: 7, px: 140, label: '1 lane width = 7.0 cells' });
  const far = scaleBar(1.5, 7);
  assert.equal(far.lanes, 5);
  assert.equal(far.label, '5 lane widths = 35 cells');
  close(far.px, 52.5);
  assert.deepEqual(scaleBar(0.3, 8), { lanes: 20, cells: 160, px: 48, label: '20 lane widths = 160 cells' });
  assert.equal(scaleBar(100, 6).px, 600, 'never shorter than one lane width');
  assert.equal(shipVisible(5), false);
  assert.equal(shipVisible(11), true);
});

// ---------------------------------------------------------------- width clamps and old drafts

test('width clamps: the brush and sliders stop at the game range', () => {
  assert.equal(clampLaneWidth(14), 8);
  assert.equal(clampLaneWidth(2), 5.8);
  assert.equal(clampLaneWidth(NaN), 5.8);
  assert.equal(DESIGN.MAX_WIDTH, GAME.MAX_WIDTH);
  const p = paintWidthSpan({ base: 7, taper: 0, spans: [] }, 0, 50, 12, 200);
  assert.equal(p.spans[0].w, 8);
});

test('old drafts wider than the game: load as saved, clamp on edit', () => {
  const raw = { ...ovalDoc(), width: { base: 11, taper: 10, spans: [{ from: 0.1, len: 0.2, w: 13 }, { from: 0.5, len: 0.1, w: 6 }] } };
  const doc = normalizeDoc(JSON.parse(JSON.stringify(raw)));
  assert.equal(doc.width.base, 11, 'loads as saved');
  assert.equal(doc.width.spans[0].w, 13);
  assert.equal(widthAt(doc.width, 0.2 * 600, 600), 13, 'draws as saved');
  assert.equal(widerThanGame(doc), true);
  // The game still flies it at its widest, with the wider ask as intent.
  const out = sketchToWeekly(doc);
  assert.equal(out.event.track.width, R.MAX_WIDTH);
  assert.ok(out.intent.some((i) => i.kind === 'width'));
  // The first edit clamps.
  assert.equal(clampDocWidths(doc), true);
  assert.equal(doc.width.base, 8);
  assert.deepEqual(doc.width.spans.map((s) => s.w), [8, 6]);
  assert.equal(widerThanGame(doc), false);
  assert.equal(clampDocWidths(doc), false, 'nothing more to do');
  assert.equal(widerThanGame(newDoc()), false);
});

// ---------------------------------------------------------------- checks at true size

test('blocked rows: a mine row across the lane at real size is flagged, a gappy one is not', () => {
  const r = SIZES.mineRadius.value;
  const across = (step, s = 50) => { const out = []; for (let off = -3; off <= 3 + 1e-9; off += step) out.push({ s, off, r }); return out; };
  const tight = blockedRows(across(1), 7);
  assert.equal(tight.length, 1);
  assert.ok(tight[0].gap < SIZES.shipWidth.value);
  assert.deepEqual(blockedRows(across(2), 7), [], 'gaps of 1.16 cells let the 0.87-wide ship through');
  // A row along the lane (one mine every 6 cells, all on the centre line) never blocks.
  assert.deepEqual(blockedRows(Array.from({ length: 10 }, (_, i) => ({ s: i * 6, off: 0, r })), 7), []);
  // Two staggered rows closer than a ship length count as one wall.
  const stagger = [...across(2, 50), ...across(2, 50.6).map((m) => ({ ...m, off: m.off + 1 }))];
  assert.equal(blockedRows(stagger, 7).length, 1);
  // Wraps over the start of the lap.
  assert.equal(blockedRows([...across(1, 0.2).slice(0, 4), ...across(1, 299.8).slice(3)], 7, { lap: 300 }).length, 1);
});

test('shard reach: a shard is collectable up to the rail plus the real pickup/touch size', () => {
  const half = 3.5;
  close(shardReach(7), Math.max(half - PLAYER_HULL.halfSpan + R.SHARD_PICKUP, half + R.SHARD_TOUCH));
  assert.ok(shardReach(7) > half && shardReach(7) < half + 0.5);
});
