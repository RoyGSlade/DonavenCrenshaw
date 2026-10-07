// Track Studio: the true in-game size of everything the studio draws, read
// from the game's own code and data (never guessed), and the maths that puts
// it on screen at one world-to-screen scale. Pure: shared by the studio page,
// the converter and node tests (tests/stardust-studio-sizes.test.mjs fails if
// a game constant changes without this table changing with it).
//
// Units are world cells, the game's units. The lane is drawn at its real width
// in cells, so every stamp, shard, row, zone and the ship use that same scale.
import { WEEKLY_RULES as R, createWeeklyLayout } from '../engine/weekly/layout.js';
import { SHIP_BODY, SHIP_HULL } from '../engine/shipHull.js';
import { PLAYER_HULL } from '../engine/hull.js';
import { config as GAME_CONFIG } from '../state.js';
import { finishChecker } from '../gfx/trackSkin.js';

// Values the layout code writes inline: measured from a real layout.
const MEASURED = (() => {
  const layout = createWeeklyLayout({
    week: 0, tagline: '',
    track: {
      title: 'measure', width: 7, points: [[0, 0], [40, 0], [40, 40], [0, 40]],
      shards: [], mines: [{ seg: 0, t: 0.5, off: 0 }], bouncers: [], sentries: [{ point: 1, side: 'outside' }], stations: [],
    },
  });
  return { sentryRadius: layout.sentries[0].radius, mineRadius: layout.mines[0].radius };
})();

// The converter (studio/sketchToWeekly.js) is the only thing that turns a
// design's rocks and shard clusters into game data; these are its limits.
export const ROCK_RADIUS = Object.freeze({ MIN: 0.4, RAIL_GAP: 0.3 }); // radius = clamp(size / 2, MIN, width / 2 - RAIL_GAP)
export const SHARD_MERGE = 1.2;          // the converter merges shards closer than this
// Three shards at -gap, 0, +gap along the lap; gap = max(MIN_GAP, size / 2).
// The gap is measured along the lap, so on a curve the shards are a little
// closer than `gap`: MIN_GAP keeps them apart by more than SHARD_MERGE on any
// flyable turn (a 3.8-cell racing radius bends a 1.5 arc to a 1.49 chord).
export const SHARD_CLUSTER_MIN_GAP = 1.5;

// The drawn shard (ui/graphics.js: drawShard(cellW * .95, config.SHARD_SCALE);
// gfx/stardustVfx.js: a diamond ±0.5 tall, ±0.28 wide of that size).
const SHARD_DRAW = 0.95 * GAME_CONFIG.SHARD_SCALE;

export const SIZES = Object.freeze({
  laneMin: { value: R.MIN_WIDTH, label: 'Lane width, narrowest', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.MIN_WIDTH' },
  laneMax: { value: R.MAX_WIDTH, label: 'Lane width, widest', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.MAX_WIDTH' },
  mineRadius: { value: MEASURED.mineRadius, label: 'Mine radius', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.MINE_RADIUS' },
  shardPickup: { value: R.SHARD_PICKUP, label: 'Shard pickup radius (ship centre)', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.SHARD_PICKUP' },
  shardTouch: { value: R.SHARD_TOUCH, label: 'Shard touch radius (ship body)', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.SHARD_TOUCH' },
  shardHeight: { value: SHARD_DRAW, label: 'Shard drawn height', source: 'ui/graphics.js + state.js', constant: 'drawShard(0.95 cell × config.SHARD_SCALE)' },
  shardWidth: { value: SHARD_DRAW * 0.56, label: 'Shard drawn width', source: 'gfx/stardustVfx.js', constant: 'drawShard diamond ±0.28 × size' },
  stationPickup: { value: R.STATION_PICKUP, label: 'Fuel dock pickup radius', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.STATION_PICKUP' },
  sentryRadius: { value: MEASURED.sentryRadius, label: 'Sentry body radius', source: 'engine/weekly/layout.js', constant: 'createWeeklyLayout sentry radius' },
  sentryRange: { value: R.SENTRY_RANGE, label: 'Sentry range', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.SENTRY_RANGE' },
  sentryOffset: { value: R.SENTRY_OFFSET, label: 'Sentry distance beyond the rail', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.SENTRY_OFFSET' },
  rockRadiusMin: { value: ROCK_RADIUS.MIN, label: 'Sweeping rock radius, smallest', source: 'studio/gameSizes.js, used by studio/sketchToWeekly.js', constant: 'ROCK_RADIUS.MIN' },
  rockRailGap: { value: ROCK_RADIUS.RAIL_GAP, label: 'Sweeping rock radius, largest = half width minus', source: 'studio/gameSizes.js, used by studio/sketchToWeekly.js', constant: 'ROCK_RADIUS.RAIL_GAP' },
  shardMerge: { value: SHARD_MERGE, label: 'Shards closer than this merge into one', source: 'studio/gameSizes.js, used by studio/sketchToWeekly.js', constant: 'SHARD_MERGE' },
  shardClusterGap: { value: SHARD_CLUSTER_MIN_GAP, label: 'Shard cluster gap, smallest', source: 'studio/gameSizes.js, used by studio/sketchToWeekly.js', constant: 'SHARD_CLUSTER_MIN_GAP' },
  shipLength: { value: SHIP_BODY.length, label: 'Ship hull length', source: 'engine/shipHull.js', constant: 'SHIP_BODY.length' },
  shipWidth: { value: SHIP_BODY.width, label: 'Ship hull width', source: 'engine/shipHull.js', constant: 'SHIP_BODY.width' },
  shipHalfSpan: { value: PLAYER_HULL.halfSpan, label: 'Ship hull half wingspan', source: 'engine/hull.js', constant: 'PLAYER_HULL.halfSpan' },
  startBehind: { value: R.START_BEHIND, label: 'Ship start, behind the line', source: 'engine/weekly/layout.js', constant: 'WEEKLY_RULES.START_BEHIND' },
  finishDepth: { value: finishChecker('midnight').rows * finishChecker('midnight').depth, label: 'Start/finish line depth (midnight)', source: 'gfx/trackSkin.js', constant: 'finishChecker rows × depth' },
  checkpointAcross: { value: 'lane width', label: 'Checkpoint / gate / start line across', source: 'engine/track.js, engine/weekly/sim.js', constant: 'track.width / 2 each side' },
});

/** The ship's outline in ship-local cells (x right, y forward), for the silhouette. */
export const SHIP_OUTLINE = SHIP_HULL;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roundTo = (v, step) => Math.round(v / step) * step;
const fmt = (v) => (Math.round(v * 100) / 100).toFixed(v < 10 ? 2 : 1).replace(/0$/, '');

/** The game's lane width range. */
export const clampLaneWidth = (w) => clamp(Number.isFinite(w) ? w : R.MIN_WIDTH, R.MIN_WIDTH, R.MAX_WIDTH);

// What a stamp's size is in the game. kind:
//   fixed  one size in the game (locked handle, "fixed in game")
//   lane   spans the lane: the game's lane width (locked, follows the width)
//   range  the game supports min..max (the handle snaps inside it)
//   free   design intent: any size, shown in cells
const FREE = Object.freeze({ min: 0.3, max: 60 });
export const SIZE_STEP = 0.05;

/** The size rule for a stamp type on a lane of game width `width`. */
export function sizeRule(type, width = 7) {
  const w = clampLaneWidth(width);
  switch (type) {
    case 'mine': return { kind: 'fixed', size: 2 * SIZES.mineRadius.value, what: `mine radius ${SIZES.mineRadius.value}` };
    case 'sentry': return { kind: 'fixed', size: 2 * SIZES.sentryRadius.value, what: `sentry radius ${SIZES.sentryRadius.value}, range ${SIZES.sentryRange.value}` };
    case 'shard': return { kind: 'fixed', size: SIZES.shardHeight.value, what: `pickup radius ${SIZES.shardPickup.value}` };
    case 'fuel': return { kind: 'fixed', size: 2 * SIZES.stationPickup.value, what: `pickup radius ${SIZES.stationPickup.value}` };
    case 'gate': case 'start': return { kind: 'lane', size: w, what: 'the lane width' };
    case 'rock': {
      const min = 2 * ROCK_RADIUS.MIN, max = Math.max(min, w - 2 * ROCK_RADIUS.RAIL_GAP);
      return { kind: 'range', min, max, size: clamp(1.6, min, max), what: `rock radius ${ROCK_RADIUS.MIN}–${fmt(max / 2)}` };
    }
    case 'shards': return { kind: 'range', min: 2 * SHARD_CLUSTER_MIN_GAP, max: FREE.max, size: 2 * SHARD_CLUSTER_MIN_GAP, what: 'gap between the three shards' };
    default: return { kind: 'free', min: FREE.min, max: FREE.max, size: null, what: 'design intent' };
  }
}

/** The default size for a new stamp: the in-game size where there is one. */
export function defaultStampSize(type, width = 7, fallback = 3) {
  const r = sizeRule(type, width);
  return r.size ?? fallback;
}

/** A size the handle may land on: fixed and lane sizes are locked, ranges snap inside, free sizes round. */
export function snapStampSize(type, size, width = 7) {
  const r = sizeRule(type, width);
  if (r.kind === 'fixed' || r.kind === 'lane') return r.size;
  const v = Number.isFinite(size) ? size : r.size ?? 1;
  return Math.round(clamp(roundTo(v, SIZE_STEP), r.min, r.max) * 1000) / 1000;
}

/** The size a stamp is drawn and checked at: what the game shows. */
export function trueStampSize(stamp, width = 7) {
  return snapStampSize(stamp.type, stamp.size, width);
}

/** Size handle / properties label in game units. */
export function sizeLabel(type, size, width = 7) {
  const r = sizeRule(type, width), v = snapStampSize(type, size, width);
  if (r.kind === 'fixed') return `${fmt(v)} cells across · fixed in game`;
  if (r.kind === 'lane') return `${fmt(v)} cells across · fixed in game (the lane width)`;
  if (r.kind === 'range') return `${fmt(v)} cells across · game ${fmt(r.min)}–${fmt(r.max)}`;
  return `${v.toFixed(1)} cells across · design intent`;
}

export const sizeLocked = (type) => ['fixed', 'lane'].includes(sizeRule(type).kind);

// ------------------------------------------------------------------ scale

/** World cells to screen pixels at view scale `scale` (px per cell). */
export const cellsToPx = (cells, scale) => cells * scale;

const BAR_STEPS = [1, 2, 5, 10, 20, 50, 100];
/**
 * The scale bar: a whole number of lane widths that is at least `minPx` long
 * on screen. { lanes, cells, px, label }.
 */
export function scaleBar(scale, width, { minPx = 36, maxPx = 160 } = {}) {
  const w = Number.isFinite(width) && width > 0 ? width : 7;
  const one = w * scale;
  const lanes = BAR_STEPS.find((n) => n * one >= minPx) ?? BAR_STEPS.at(-1);
  const px = Math.min(lanes * one, Math.max(maxPx, one));
  const label = lanes === 1 ? `1 lane width = ${w.toFixed(1)} cells` : `${lanes} lane widths = ${Math.round(lanes * w)} cells`;
  return { lanes, cells: lanes * w, px, label };
}

/** The ship silhouette shows once it is at least `minPx` long on screen. */
export const shipVisible = (scale, minPx = 10) => SIZES.shipLength.value * scale >= minPx;

// ------------------------------------------------------------------ lane widths (old drafts)

/** True when a design asks for a width the game cannot fly (older drafts allowed up to 14). */
export function widerThanGame(doc) {
  const wd = doc && doc.width;
  if (!wd) return false;
  return wd.base > R.MAX_WIDTH || (wd.spans || []).some((s) => s.w > R.MAX_WIDTH);
}

/** Clamp a design's widths to the game's range in place. Returns true when anything changed. */
export function clampDocWidths(doc) {
  if (!doc || !doc.width) return false;
  let changed = false;
  const base = clampLaneWidth(doc.width.base);
  if (base !== doc.width.base) { doc.width.base = base; changed = true; }
  for (const s of doc.width.spans || []) {
    const w = clampLaneWidth(s.w);
    if (w !== s.w) { s.w = w; changed = true; }
  }
  return changed;
}

// ------------------------------------------------------------------ checks at true size

/**
 * Where obstacles leave no gap the ship fits through. items: [{ s, off, r }]
 * in lane coordinates (lap distance, signed offset from the centre line,
 * radius). Items closer along the lap than their radii plus a ship length
 * count as one row. Returns [{ s, gap, items }] (one per blocked row).
 */
export function blockedRows(items, width, { lap = Infinity, ship = SIZES } = {}) {
  const half = width / 2, need = ship.shipWidth.value, len = ship.shipLength.value;
  const sorted = [...items].sort((a, b) => a.s - b.s);
  const out = [];
  const along = (a, b) => { const d = Math.abs(a - b); return Number.isFinite(lap) ? Math.min(d, lap - d) : d; };
  for (const it of sorted) {
    const row = sorted.filter((o) => along(o.s, it.s) < it.r + o.r + len);
    const cuts = row.map((o) => [clamp(o.off - o.r, -half, half), clamp(o.off + o.r, -half, half)]).sort((a, b) => a[0] - b[0]);
    let gap = 0, edge = -half;
    for (const [lo, hi] of cuts) { gap = Math.max(gap, lo - edge); edge = Math.max(edge, hi); }
    gap = Math.max(gap, half - edge);
    if (gap < need && !out.some((b) => along(b.s, it.s) < len * 2)) out.push({ s: it.s, gap, items: row.length });
  }
  return out;
}

/**
 * How far from the centre line a shard can be and still be collected: the
 * ship's centre stays a half wingspan inside the rail and picks up within
 * SHARD_PICKUP; its body touches the drawn shard (SHARD_TOUCH) up to the rail.
 */
export function shardReach(width) {
  const half = width / 2;
  return Math.max(half - SIZES.shipHalfSpan.value + SIZES.shardPickup.value, half + SIZES.shardTouch.value);
}

/** The size table as rows for the studio and the report. */
export function sizeTable() {
  return Object.entries(SIZES).map(([key, v]) => ({ key, label: v.label, value: typeof v.value === 'number' ? Math.round(v.value * 10000) / 10000 : v.value, source: v.source, constant: v.constant }));
}
