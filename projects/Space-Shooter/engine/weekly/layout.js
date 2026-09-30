// A weekly track's data (tracks/weekly.js) to a playable layout. Pure: no DOM,
// no clock, no randomness, so the game, the replay checker, the preview image
// and the tests all build exactly the same thing.
import { createTrack, pointOnTrack } from "../track.js";

export const WEEKLY_LEVEL = "weekly";

// The weekly rules, in one place (docs/stardust/WEEKLY.md).
export const WEEKLY_RULES = Object.freeze({
  STEP: 1 / 120,                // fixed simulation step; the clock is steps × STEP
  START_BEHIND: 2.5,            // the ship starts this far behind the line
  WALL_KEEP: 0.5,               // a rail hit halves the ship's speed…
  WALL_STUN: 0.5,               // …and takes the controls away for this long (s)
  WALL_STUN_FROM: 0.35,         // outward speed that counts as a hit, not a scrape
  MINE_RADIUS: 0.42,
  SHARD_PICKUP: 0.7,            // ship centre to shard centre
  SHARD_TOUCH: 0.31,            // physics 2: the drawn shard (0.95 × 0.66 cell diamond, half-height 0.31); touching it with the body counts
  STATION_PICKUP: 1.2,
  SENTRY_RANGE: 11,
  SENTRY_MIN_SPEED: 4.5,        // slower than this in range and the sentry fires
  SENTRY_TELEGRAPH: 0.45,
  SENTRY_COOLDOWN: 1.1,
  SENTRY_SHOT_SPEED: 14,
  SENTRY_SHOT_LIFE: 1.4,
  SENTRY_DAMAGE: 35,
  SENTRY_OFFSET: 1.1,           // cells beyond the outside rail
  // Track checks (the weekly tracks are far bigger than the network grid).
  MIN_WIDTH: 5.8,
  MAX_WIDTH: 8,
  MIN_LENGTH: 300,
  LANE_GAP: 20,
  MIN_SHARDS: 3,
  PILOT_SECONDS: 420,
});

const colors = ["blue", "green", "purple", "pink"];

function place(track, seg, t, off = 0) {
  const s = track.segments[((seg % track.segments.length) + track.segments.length) % track.segments.length];
  return pointOnTrack(track, s.start + s.length * t, off);
}

/** Which way the lap turns at point i: +1 right, -1 left (screen coordinates). */
export function cornerTurn(track, i) {
  const n = track.segments.length;
  const a = track.segments[(i - 1 + n) % n], b = track.segments[i % n];
  return Math.sign(a.tx * b.ty - a.ty * b.tx) || 1;
}

/** Unit vector from corner point i toward the inside of its turn. */
export function cornerInside(track, i) {
  const n = track.segments.length;
  const a = track.segments[(i - 1 + n) % n], b = track.segments[i % n];
  let tx = a.tx + b.tx, ty = a.ty + b.ty;
  const m = Math.hypot(tx, ty) || 1;
  tx /= m; ty /= m;
  const turn = cornerTurn(track, i);
  return { x: -ty * turn, y: tx * turn };
}

export function trackBounds(points, width, margin = 4) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const pad = width / 2 + margin;
  return { minX: Math.min(0, minX - pad), minY: Math.min(0, minY - pad), maxX: maxX + pad, maxY: maxY + pad };
}

/**
 * The layout of one weekly event. Positions use plain centres (x, y); nodes
 * keep the renderer's half-cell origin (x - 0.5) like engine/levels.js.
 */
export function createWeeklyLayout(event) {
  const source = event.track;
  const track = createTrack(source.points, source.width, source.title);
  track.bounds = trackBounds(source.points, source.width);
  const prefix = `W${event.week}`;
  const shards = source.shards.map((s, i) => {
    const p = place(track, s.seg, s.t, s.off);
    return { id: `${prefix}-S${i + 1}`, x: p.x, y: p.y, seg: s.seg, along: track.segments[s.seg].start + track.segments[s.seg].length * s.t, color: colors[i % colors.length] };
  });
  const mines = source.mines.map((m, i) => {
    const p = place(track, m.seg, m.t, m.off);
    return { id: `M${i + 1}`, x: p.x, y: p.y, radius: WEEKLY_RULES.MINE_RADIUS, seg: m.seg };
  });
  const bouncers = source.bouncers.map((b, i) => {
    const p = place(track, b.seg, b.t, 0);
    const s = track.segments[b.seg];
    // Sweep across the lane, rail to rail, along the segment's normal.
    const span = source.width / 2 - b.radius - 0.05;
    return {
      kind: "asteroid",
      id: `B${i + 1}`,
      x: p.x, y: p.y, originX: p.x, originY: p.y,
      nx: -s.ty, ny: s.tx,
      span, speed: b.speed, phase: b.phase || 0,
      radius: b.radius, baseRadius: b.radius, sizeScale: 1,
      hp: 100, maxHp: 100, destructible: true, bouncing: true, seg: b.seg,
    };
  });
  const sentries = source.sentries.map((s, i) => {
    const corner = track.points[s.point];
    const inside = cornerInside(track, s.point);
    const out = s.side === "inside" ? 1 : -1;
    const d = source.width / 2 + WEEKLY_RULES.SENTRY_OFFSET;
    const x = corner.x + inside.x * d * out, y = corner.y + inside.y * d * out;
    return { id: `T${i + 1}`, x, y, point: s.point, angle: Math.atan2(-inside.y * out, -inside.x * out), state: "idle", telegraph: 0, cooldown: 0, radius: 0.55 };
  });
  const stations = (source.stations || []).map((s, i) => {
    const p = place(track, s.seg, s.t, s.off || 0);
    return { id: `F${i + 1}`, x: p.x, y: p.y };
  });
  // Start behind the line, facing along the first straight.
  const portal = track.portal;
  const start = { x: portal.x - portal.tx * WEEKLY_RULES.START_BEHIND, y: portal.y - portal.ty * WEEKLY_RULES.START_BEHIND, angle: portal.angle };
  const nodes = [
    { kind: "start", x: start.x - 0.5, y: start.y - 0.5, angle: start.angle },
    ...shards.map((s, i) => ({ kind: "planet", x: s.x - 0.5, y: s.y - 0.5, id: s.id, color: s.color, title: `${source.title} shard ${i + 1}`, shardName: `Shard ${i + 1} of ${shards.length}`, clue: "" })),
    ...stations.map((s) => ({ kind: "station", x: s.x - 0.5, y: s.y - 0.5, id: s.id })),
  ];
  return {
    event,
    title: source.title,
    landmark: source.landmark,
    lesson: event.tagline,
    briefing: `Weekly time trial. Collect all ${shards.length} shards, then cross the finish line. Mines destroy you. Rails halve your speed and stun you for half a second. Corner sentries shoot slow ships.`,
    track,
    start,
    shards,
    mines,
    bouncers,
    sentries,
    stations,
    nodes,
  };
}

/** Where a bouncer is at race time `time` (s): a triangle wave rail to rail. */
export function bouncerPosition(b, time) {
  const travel = 4 * b.span;                     // one full there-and-back
  let u = ((time * b.speed) / travel + b.phase) % 1;
  if (u < 0) u += 1;
  const off = u < 0.5 ? -b.span + 4 * b.span * u : 3 * b.span - 4 * b.span * u;
  return { x: b.originX + b.nx * off, y: b.originY + b.ny * off };
}
