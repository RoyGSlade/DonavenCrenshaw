// Phone stroke -> weekly preview. Pure and bounded: no DOM, clock or randomness.
//
// Two inputs: a v1 sketch (one loop plus marks) and a v2 studio design
// (studio/draftV2.js: lane, width profile, skin, layers of strokes and stamps,
// requests). For v2 the converter emits only what the game supports today
// (one lane width, mines, sweeping rocks, corner sentries, fuel docks, shards,
// checkpoints, the start and the skin) and returns everything else as
// `intent`: design intent the refine agents and the owner can see.
import { WEEKLY_EVENTS } from '../tracks/weekly.js';
import { createTrack, pointOnTrack } from '../engine/track.js';
import { createWeeklyLayout, WEEKLY_RULES as R, bouncerPosition, cornerInside } from '../engine/weekly/layout.js';
import { flyWeeklyLap } from '../engine/weekly/pilot.js';
import { normalizeDoc, pageSize, STAMP_TYPES, ZONE_TYPES, BEHAVIORS, SKINS } from './draftV2.js';
import { pointsAlong, isUniformWidth, widthSamples, polygonArea, clampWidth } from './studioGeometry.js';
import { ROCK_RADIUS, SHARD_CLUSTER_MIN_GAP, SHARD_MERGE } from './gameSizes.js';

export { ROCK_RADIUS, SHARD_CLUSTER_MIN_GAP, SHARD_MERGE };

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lapLength = (p) => p.reduce((s, a, i) => s + dist(a, p[(i + 1) % p.length]), 0);
const BASE_LENGTH = lapLength(WEEKLY_EVENTS[0].track.points);
const KINDS = new Set(['landmark', 'fast', 'tight', 'hazard', 'calm']);

function validate(sketch, options) {
  const bad = (message) => { throw new TypeError(message); };
  if (!sketch || sketch.version !== 1) bad('Sketch version must be 1.');
  if (!Array.isArray(sketch.points) || sketch.points.length < 4 || sketch.points.length > 2000)
    bad('Supply 4 to 2000 sketch points.');
  for (const p of sketch.points)
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => finite(v) && v >= 0 && v <= 1))
      bad('Each sketch point must be two finite numbers between 0 and 1.');
  if (!finite(sketch.aspect) || sketch.aspect <= 0) bad('Canvas aspect must be a positive finite number.');
  if (sketch.start !== undefined && (!Number.isInteger(sketch.start) || sketch.start < 0 || sketch.start >= sketch.points.length))
    bad('Start must be an index in the sketch points.');
  if (sketch.scale !== undefined && (!finite(sketch.scale) || sketch.scale <= 0)) bad('Scale must be positive and finite.');
  if (sketch.difficulty !== undefined && !['easy', 'normal', 'hard'].includes(sketch.difficulty)) bad('Unknown difficulty.');
  if (sketch.marks !== undefined && !Array.isArray(sketch.marks)) bad('Marks must be an array.');
  for (const m of sketch.marks || []) {
    if (!m || !Number.isInteger(m.at) || m.at < 0 || m.at >= sketch.points.length || !KINDS.has(m.kind))
      bad('Each mark needs a valid point index and kind.');
    if (m.note !== undefined && typeof m.note !== 'string') bad('Mark notes must be strings.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) bad('Options must be an object.');
  for (const k of ['title', 'landmark', 'tagline', 'id'])
    if (options[k] !== undefined && (typeof options[k] !== 'string' || !options[k].trim())) bad(`${k} must be a nonempty string.`);
  if (options.version !== undefined && (!Number.isSafeInteger(options.version) || options.version < 1)) bad('Event version must be a positive integer.');
}

function projection(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return { t, distance: dist(p, [a[0] + dx * t, a[1] + dy * t]) };
}

// Iterative RDP avoids stack overflow on a long noisy stroke. Endpoints are pins.
function rdp(points, epsilon) {
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [a, b] = pending.pop();
    let best = epsilon, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = projection(points[i], points[a], points[b]).distance;
      if (d > best) { best = d; at = i; }
    }
    if (at >= 0) { keep.add(at); pending.push([a, at], [at, b]); }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

function cleanStroke(sketch) {
  // Aspect correction before simplification, then bbox normalization makes a
  // tiny doodle and a full-canvas drawing use the same noise tolerance.
  const raw = sketch.points.map(([x, y]) => sketch.aspect >= 1 ? [x, y / sketch.aspect] : [x * sketch.aspect, y]);
  const minX = Math.min(...raw.map((p) => p[0])), minY = Math.min(...raw.map((p) => p[1]));
  const extent = Math.max(Math.max(...raw.map((p) => p[0])) - minX, Math.max(...raw.map((p) => p[1])) - minY);
  if (!(extent > 0)) throw new TypeError('Draw a loop with distinct points.');
  const normalized = raw.map(([x, y]) => [(x - minX) / extent, (y - minY) / extent]);
  const start = sketch.start ?? 0, ordered = [], indexMap = new Map();
  for (let k = 0; k < raw.length; k++) {
    const idx = (start + k) % raw.length, p = normalized[idx];
    if (!ordered.length || dist(p, ordered.at(-1)) > 1e-9) ordered.push(p);
    indexMap.set(idx, ordered.length - 1);
  }
  if (dist(ordered[0], ordered.at(-1)) < 1e-9) {
    const last = ordered.length - 1;
    for (const [idx, value] of indexMap) if (value === last) indexMap.set(idx, 0);
    ordered.pop();
  }
  if (ordered.length < 4 || lapLength(ordered) < 1e-6) throw new TypeError('Draw a loop with at least four distinct points.');
  const pins = new Set([0]);
  for (const m of sketch.marks || []) if (m.kind === 'tight') pins.add(indexMap.get(m.at));
  if (pins.size > 28) throw new TypeError('Keep tight corner marks to 27 or fewer.');
  // Low-pass finger jitter; leave sharp marked corners and the start exactly pinned.
  const n = ordered.length;
  const smooth = ordered.map((p, i) => {
    if (pins.has(i)) return p;
    const a = ordered[(i - 1 + n) % n], b = ordered[(i + 1) % n];
    // Do not smear an apex or a very unevenly sampled edge.
    if (dist(a, p) + dist(p, b) > 0.08) return p;
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
  let farthest = 1;
  for (let i = 2; i < n; i++) if (dist(smooth[0], smooth[i]) > dist(smooth[0], smooth[farthest])) farthest = i;
  pins.add(farthest);
  const anchors = [...pins].sort((a, b) => a - b);
  let points;
  for (let epsilon = 0.006; ; epsilon *= 1.35) {
    points = [];
    for (let k = 0; k < anchors.length; k++) {
      const a = anchors[k], b = anchors[k + 1] ?? n;
      points.push(...rdp([...smooth.slice(a, b), smooth[b % n]], epsilon).slice(0, -1));
    }
    if (points.length <= 29) break;
  }
  // Subdivide long edges rather than round off their endpoints: sharp corners
  // stay sharp and the result has enough checkpoints for weekly lap progression.
  while (points.length < 12) {
    let longest = 0;
    for (let i = 1; i < points.length; i++) if (dist(points[i], points[(i + 1) % points.length]) > dist(points[longest], points[(longest + 1) % points.length])) longest = i;
    const a = points[longest], b = points[(longest + 1) % points.length];
    points.splice(longest + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  // v1 scales every loop to the Gantry Drop lap; a v2 design has a fixed page
  // scale (cells per unit of the page's long side), so what you draw is what you fly.
  const length = lapLength(points);
  const multiplier = sketch.cellsPerUnit ? sketch.cellsPerUnit * extent : BASE_LENGTH * (sketch.scale ?? 1) / length;
  if (!finite(multiplier) || multiplier < 0.001 || multiplier > 1e9) throw new TypeError('Scale is outside the supported numeric range.');
  const world = points.map(([x, y]) => [10 + x * multiplier, 10 + y * multiplier]);
  const marks = (sketch.marks || []).map((m) => ({ ...m, position: normalized[m.at].map((v) => 10 + v * multiplier) }));
  // Any other page point into the same world frame (v2 stamps and strokes).
  const toWorld = ([x, y]) => {
    const [ax, ay] = sketch.aspect >= 1 ? [x, y / sketch.aspect] : [x * sketch.aspect, y];
    return [10 + (ax - minX) / extent * multiplier, 10 + (ay - minY) / extent * multiplier];
  };
  return { points: world, marks, toWorld };
}

function crossing(a, b, c, d) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
  const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

function geometryProblems(track) {
  const out = [], n = track.points.length;
  const p = track.points.map((p) => [p.x, p.y]);
  if (track.length < R.MIN_LENGTH) out.push(`Lap is too short (${Math.round(track.length)} cells); use a larger scale (at least ${R.MIN_LENGTH} cells).`);
  // Bound synchronous pilot work in both node and the phone. Still return a preview.
  if (track.length > BASE_LENGTH * 4) out.push('Lap is over four times Gantry Drop; reduce scale before running the preview pilot.');
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
    if (crossing(a, b, c, d)) return [...out, `Stroke self-intersects between segments ${i} and ${j}; redraw the crossing.`];
    // Closest segment pair occurs at a projected endpoint (or an intersection).
    const candidates = [
      [0, projection(a, c, d).t, projection(a, c, d).distance],
      [1, projection(b, c, d).t, projection(b, c, d).distance],
      [projection(c, a, b).t, 0, projection(c, a, b).distance],
      [projection(d, a, b).t, 1, projection(d, a, b).distance],
    ];
    for (const [t, u, distance] of candidates) {
      const sa = track.segments[i], sb = track.segments[j];
      const gap = Math.abs(sa.start + t * sa.length - sb.start - u * sb.length);
      if (Math.min(gap, track.length - gap) >= R.LANE_GAP && distance <= track.width + 0.3)
        return [...out, `Lane overlaps between segments ${i} and ${j}; separate those stretches by more than ${track.width + 0.3} cells.`];
    }
  }
  // A pair's nearest endpoints can be local to the same corner while another
  // part of those segments is nonlocal. Check the full lap in spatial buckets
  // as well, using the weekly checks' distance rule (not the network grid).
  if (track.length <= BASE_LENGTH * 4) {
    const size = track.width + 0.3, buckets = new Map();
    for (let along = 0; along < track.length; along += 1) {
      const p = pointOnTrack(track, along), bx = Math.floor(p.x / size), by = Math.floor(p.y / size);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const q of buckets.get(`${bx + dx},${by + dy}`) || []) {
          const gap = along - q.along;
          if (Math.min(gap, track.length - gap) >= R.LANE_GAP && Math.hypot(p.x - q.x, p.y - q.y) <= size)
            return [...out, `Distant lanes overlap near lap distances ${Math.round(q.along)} and ${Math.round(along)} cells; spread those stretches apart.`];
        }
      }
      const key = `${bx},${by}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ ...p, along });
    }
  }
  return out;
}

function placement(track, along, off = 0) {
  const d = ((along % track.length) + track.length) % track.length;
  const s = track.segments.find((s) => d < s.start + s.length) || track.segments.at(-1);
  return { seg: s.index, t: (d - s.start) / s.length, off };
}

function turnAngles(track) {
  return track.segments.map((b, i) => {
    const a = track.segments[(i - 1 + track.segments.length) % track.segments.length];
    return Math.acos(clamp(a.tx * b.tx + a.ty * b.ty, -1, 1));
  });
}

// opts (v2): shards / stations are explicit placements (null: place them
// automatically, as v1 always does); hazards false skips the automatic mines,
// rocks and sentries.
function populate(event, sketch, marks, opts = {}) {
  const { shards = null, stations = null, hazards = true } = opts;
  const source = event.track, track = createTrack(source.points, source.width, source.title);
  const level = { easy: 0, normal: 1, hard: 2 }[sketch.difficulty ?? 'normal'];
  const angles = turnAngles(track);
  // Reproject marks after simplification, so density follows the lap rather
  // than the raw sample count (a finger may pause at a corner).
  const mapped = marks.map((m) => {
    let nearest = null;
    track.segments.forEach((s) => {
      const q = projection(m.position, [s.x, s.y], [s.x + s.dx, s.y + s.dy]);
      if (!nearest || q.distance < nearest.distance) nearest = { distance: q.distance, along: s.start + q.t * s.length };
    });
    return { ...m, along: nearest.along };
  });
  const near = (d, kind) => mapped.some((m) => {
    const gap = Math.abs(m.along - d);
    return m.kind === kind && Math.min(gap, track.length - gap) < track.length * 0.075;
  });
  const worldAt = (p) => {
    const s = track.segments[p.seg];
    return pointOnTrack(track, s.start + s.length * p.t, p.off);
  };
  const count = 8 + level;
  if (shards) source.shards.push(...shards);
  else for (let i = 0; i < count; i++) source.shards.push(placement(track, (i + 0.5) * track.length / count, (i % 2 ? -1 : 1) * 1.2));
  if (stations) source.stations.push(...stations);
  else for (const fraction of [0.24, 0.54, 0.82]) source.stations.push(placement(track, fraction * track.length));
  if (track.length > BASE_LENGTH * 4 || !hazards) return;
  let sequence = 0;
  for (const s of track.segments) {
    if (s.length < 18) continue;
    const mid = s.start + s.length / 2;
    const density = near(mid, 'calm') ? 0.25 : near(mid, 'hazard') ? 1.9 : near(mid, 'fast') ? 1.5 : 1;
    const number = Math.floor(s.length / [55, 34, 24][level] * density);
    for (let i = 0; i < number; i++) {
      const d = s.start + 8 + (s.length - 16) * (i + 1) / (number + 1);
      if (d < 12 || track.length - d < 12) continue;
      const p = placement(track, d, (sequence++ % 2 ? -1 : 1) * [1.9, 1.6, 1.3][level]);
      const w = worldAt(p);
      if ([...source.shards, ...source.stations, ...source.mines].some((q) => {
        const v = worldAt(q); return Math.hypot(w.x - v.x, w.y - v.y) < 3;
      })) continue;
      source.mines.push(p);
    }
  }
  const corners = angles.map((angle, i) => ({ angle, i })).filter((c) => c.angle > 0.22).sort((a, b) => b.angle - a.angle || a.i - b.i);
  for (const { i } of corners) {
    const s = track.segments[i];
    if (source.bouncers.length >= [3, 5, 8][level]) break;
    if (i === 0 || s.length < 12 || near(s.start, 'calm')) continue;
    const p = placement(track, s.start + Math.min(6, s.length / 3));
    const w = worldAt(p);
    if ([...source.shards, ...source.stations].some((q) => { const v = worldAt(q); return Math.hypot(w.x - v.x, w.y - v.y) < 5; })) continue;
    source.bouncers.push({ seg: p.seg, t: p.t, radius: 0.7 + level * 0.05, speed: 2.5 + level * 0.4, phase: (i * 0.381966) % 1 });
  }
  // Sentries belong on genuine corners, not each resampled straight checkpoint.
  for (const { i, angle } of corners) {
    if (source.sentries.length >= level) break;
    if (i && angle > 0.65 && angle < 2 && !near(track.segments[i].start, 'calm')) source.sentries.push({ point: i, side: 'outside' });
  }
}

const FEEL = new Set(['fast', 'tight', 'calm', 'hazard']);

/**
 * A v2 design to the v1-shaped sketch the pipeline cleans (lane loop, start,
 * feel marks, gates as pinned checkpoints) plus the page scale.
 */
function prepareDesign(raw) {
  const doc = normalizeDoc(raw);
  if (!doc.lane.closed || doc.lane.points.length < 4) throw new TypeError('Close the lane loop before making a track.');
  const points = doc.lane.points.map(([x, y]) => [clamp(x, 0, 1), clamp(y, 0, 1)]);
  const a = doc.page.aspect;
  const ac = ([x, y]) => (a >= 1 ? [x, y / a] : [x * a, y]);
  const lane = points.map(ac);
  const nearestIndex = (p) => {
    const q = ac(p);
    let best = 0, bd = Infinity;
    lane.forEach((r, i) => { const d = dist(q, r); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const startStamp = doc.stamps.find((s) => s.type === 'start');
  const start = startStamp ? nearestIndex([startStamp.x, startStamp.y]) : doc.lane.start;
  const marks = [], notes = [];
  let pins = 0;
  for (const s of doc.stamps) {
    const kind = FEEL.has(s.type) ? s.type : s.type === 'gate' ? 'tight' : null;
    if (!kind) continue;
    if (kind === 'tight' && ++pins > 27) { notes.push('Kept the first 27 gates and tight marks (the game has at most 28 pinned points).'); continue; }
    marks.push({ at: nearestIndex([s.x, s.y]), kind, ...(s.label ? { note: s.label } : {}) });
  }
  return { doc, notes, sketch: { version: 1, points, start, aspect: a, difficulty: doc.difficulty, marks, cellsPerUnit: doc.page.cells } };
}

// Nearest lane position of a world point: { seg, t, off, along, distance }, off + to the right.
function projectOnTrack(track, p) {
  let best = null;
  for (const s of track.segments) {
    const q = projection(p, [s.x, s.y], [s.x + s.dx, s.y + s.dy]);
    if (!best || q.distance < best.distance) {
      const x = s.x + s.dx * q.t, y = s.y + s.dy * q.t;
      best = { seg: s.index, t: q.t, distance: q.distance, along: s.start + s.length * q.t, off: (p[0] - x) * -s.ty + (p[1] - y) * s.tx };
    }
  }
  return best;
}

const round = (v, k = 4) => Math.round(v * 10 ** k) / 10 ** k;
const lapLabel = (track, p) => `${Math.round(projectOnTrack(track, p).along / track.length * 100)}% round the lap`;
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/**
 * The design's explicit placements on the cleaned track, and its design intent.
 * Only what the game supports is placed; off-lane items are left out (noted).
 */
function placeDesign(doc, toWorld, track) {
  const width = track.width, half = width / 2, notes = [], intent = [];
  const dropped = {};
  const drop = (what) => { dropped[what] = (dropped[what] || 0) + 1; };
  const onLane = (p, keep, what) => {
    const q = projectOnTrack(track, p);
    if (Math.abs(q.off) > half + 2) { drop(what); return null; }
    return { seg: q.seg, t: round(clamp(q.t, 0, 1)), off: round(clamp(q.off, -(half - keep), half - keep), 3), along: q.along };
  };
  const distinct = (list, gap) => {
    const out = [];
    for (const item of list) {
      if (!item) continue;
      const w = pointOnTrack(track, item.along, item.off);
      if (out.some((o) => Math.hypot(o.w.x - w.x, o.w.y - w.y) < gap)) continue;
      out.push({ item, w });
    }
    return out.map((o) => o.item);
  };
  const strip = ({ along, ...rest }) => rest;
  const world = (s) => toWorld([s.x, s.y]);
  const strokeWorld = (s) => s.points.map(toWorld);
  const say = (kind, text, at, extra = {}) => { if (intent.length < 80) intent.push({ kind, text, ...(at ? { at: at.map((v) => round(v, 2)), lap: round(projectOnTrack(track, at).along / track.length, 3) } : {}), ...extra }); };
  const unsupported = { barricade: 0, debris: 0 };
  const behaviourNotes = new Map();
  const wantsBehaviour = (type, behavior, at) => {
    const key = `${type}:${behavior}`;
    if (!behaviourNotes.has(key)) behaviourNotes.set(key, { type, behavior, count: 0, at });
    behaviourNotes.get(key).count++;
  };

  const shards = [], mines = [], rocks = [], sentries = [], stations = [];
  for (const s of doc.stamps) {
    const p = world(s);
    if (s.type === 'shard') shards.push(onLane(p, 0.35, 'shards'));
    else if (s.type === 'shards') {
      const c = onLane(p, 0.35, 'shards');
      if (c) {
        const gap = Math.max(SHARD_CLUSTER_MIN_GAP, s.size / 2);
        for (const d of [-gap, 0, gap]) {
          const w = pointOnTrack(track, c.along + d, c.off);
          shards.push(onLane([w.x, w.y], 0.35, 'shards'));
        }
      }
    } else if (s.type === 'mine') {
      if (s.behavior === 'static') mines.push(onLane(p, 0.5, 'mines')); else wantsBehaviour('mine', s.behavior, p);
    } else if (s.type === 'rock') {
      if (s.behavior === 'static' || s.behavior === 'moving') rocks.push({ q: onLane(p, 0, 'rocks'), size: s.size, period: s.period });
      else wantsBehaviour('rock', s.behavior, p);
    } else if (s.type === 'sentry') sentries.push(p);
    else if (s.type === 'fuel') stations.push(onLane(p, 1.2, 'fuel docks'));
    else if (s.type === 'barricade' || s.type === 'debris') { unsupported[s.type]++; if (s.behavior !== 'static') wantsBehaviour(s.type, s.behavior, p); say(s.type, `${STAMP_TYPES[s.type].label}${s.label ? ` "${s.label}"` : ''} (${s.size} cells across) ${lapLabel(track, p)}: not in the game yet.`, p); }
    else if (s.type === 'landmark' || s.type === 'star') say(s.type, `${STAMP_TYPES[s.type].label}${s.label ? ` "${s.label}"` : ''} (${s.size} cells across) ${lapLabel(track, p)}.`, p, { size: s.size });
    else if (s.type === 'text') say('note', `Note ${lapLabel(track, p)}: "${s.note || s.label || ''}"`, p);
    else if (s.type === 'request') {
      const r = doc.requests.find((q) => q.id === s.requestId || q.stampId === s.id);
      say('request', `Requested item${r ? ` "${r.title}" (${r.type}, ${r.behavior}${r.cardRef ? `, card ${r.cardRef}` : ''})` : ''} ${lapLabel(track, p)}.`, p);
    }
  }
  let scribbles = 0;
  for (const s of doc.strokes) {
    const pts = strokeWorld(s);
    if (!pts.length) continue;
    if (s.layer === 'shards') for (const p of pointsAlong(pts, s.spacing)) shards.push(onLane(p, 0.35, 'shards'));
    else if (s.layer === 'obstacles') {
      const row = pointsAlong(pts, s.spacing);
      if (s.type === 'mine') { if (s.behavior === 'static') for (const p of row) mines.push(onLane(p, 0.5, 'mines')); else wantsBehaviour('mine', s.behavior, centroid(pts)); }
      else if (s.type === 'rock') { if (s.behavior === 'static' || s.behavior === 'moving') for (const p of row) rocks.push({ q: onLane(p, 0, 'rocks'), size: s.size }); else wantsBehaviour('rock', s.behavior, centroid(pts)); }
      else if (s.type === 'sentry') sentries.push(...row);
      else { unsupported[s.type] += row.length; say(s.type, `A row of ${row.length} ${STAMP_TYPES[s.type].label.toLowerCase()} ${lapLabel(track, centroid(pts))}${s.behavior !== 'static' ? `, ${BEHAVIORS[s.behavior].toLowerCase()}` : ''}: not in the game yet.`, centroid(pts), { poly: pts.filter((_, i) => i % Math.ceil(pts.length / 40) === 0).map((p) => p.map((v) => round(v, 2))) }); }
    } else if (s.layer === 'hazards') {
      const area = Math.round(polygonArea(pts));
      say('zone', `Hazard zone: ${ZONE_TYPES[s.type]}${s.label ? ` "${s.label}"` : ''}, about ${area} square cells, ${lapLabel(track, centroid(pts))}: not in the game yet.`, centroid(pts),
        { zone: s.type, poly: pts.filter((_, i) => i % Math.ceil(pts.length / 40) === 0).map((p) => p.map((v) => round(v, 2))) });
    } else if (s.layer === 'landmarks') say('landmark', `Landmark sketch${s.label ? ` "${s.label}"` : ''} ${lapLabel(track, centroid(pts))}.`, centroid(pts));
    else if (s.layer === 'notes') { scribbles++; if (s.label) say('note', `Note ${lapLabel(track, centroid(pts))}: "${s.label}"`, centroid(pts)); }
  }
  if (scribbles) say('note', `${scribbles} note scribble${scribbles === 1 ? '' : 's'} on the design (open it in the studio to see them).`);
  for (const b of behaviourNotes.values()) say('behaviour', `${b.count} ${b.type}${b.count === 1 ? '' : 's'} meant to be ${BEHAVIORS[b.behavior].toLowerCase()}: not in the game yet, left out.`, b.at);
  // Width: the game flies one width.
  const size = pageSize(doc);
  const laneWorld = doc.lane.points.map(([x, y]) => [x * size.w, y * size.h]);
  const lap = lapLength(laneWorld);
  if (!isUniformWidth(doc.width)) {
    const ws = widthSamples(doc.width, lap, 240);
    say('width', `Lane width varies from ${Math.min(...ws).toFixed(1)} to ${Math.max(...ws).toFixed(1)} cells (${doc.width.spans.length} brushed stretch${doc.width.spans.length === 1 ? '' : 'es'}, ${doc.width.taper}-cell taper). The game flies one width (${width}) for now.`, null,
      { samples: ws.filter((_, i) => i % 4 === 0).map((v) => round(v, 2)) });
  }
  if (doc.width.base > R.MAX_WIDTH) say('width', `Lane drawn ${doc.width.base} cells wide; the game's widest is ${R.MAX_WIDTH}, so it flies at ${width}.`);

  // Supported placements.
  const shardList = distinct(shards, SHARD_MERGE).map(strip);
  const mineList = distinct(mines, 1).map(strip).slice(0, 150);
  const stationList = distinct(stations, 4).map(strip);
  const bouncers = [];
  rocks.forEach(({ q, size: rockSize, period }, i) => {
    if (!q) return;
    const radius = round(clamp(rockSize / 2, ROCK_RADIUS.MIN, half - ROCK_RADIUS.RAIL_GAP), 3);
    const span = half - radius - 0.05;
    const speed = period ? round(clamp((4 * span) / period, 0.5, 12), 3) : 3.2;
    bouncers.push({ seg: q.seg, t: q.t, radius, speed, phase: round((i * 0.381966) % 1) });
  });
  const sentryList = [];
  for (const p of sentries) {
    // A sentry sits just outside a corner's rail: the nearest corner point (never the start).
    if (projectOnTrack(track, p).distance > half + 8) { drop('sentries'); continue; }
    let point = 1, bd = Infinity;
    track.points.forEach((c, i) => { if (i === 0) return; const d = Math.hypot(c.x - p[0], c.y - p[1]); if (d < bd) { bd = d; point = i; } });
    if (sentryList.some((s) => s.point === point)) continue;
    const c = track.points[point], inside = cornerInside(track, point);
    sentryList.push({ point, side: (p[0] - c.x) * inside.x + (p[1] - c.y) * inside.y > 0 ? 'inside' : 'outside' });
  }
  for (const [what, n] of Object.entries(dropped)) notes.push(`Left out ${n} ${what} drawn off the lane.`);
  const obstacleContent = doc.strokes.some((s) => s.layer === 'obstacles') || doc.stamps.some((s) => STAMP_TYPES[s.type].layer === 'obstacles');
  const autoHazards = doc.auto.hazards === 'on' || (doc.auto.hazards === 'auto' && !obstacleContent);
  return { shards: shardList, mines: mineList, bouncers, sentries: sentryList, stations: stationList, autoHazards, intent, notes };
}

/** Invalid input throws TypeError. Valid but unflyable drawings return ok:false. */
export function sketchToWeekly(input, options = {}) {
  const v2 = input && typeof input === 'object' && input.version === 2 ? prepareDesign(input) : null;
  const sketch = v2 ? v2.sketch : input;
  validate(sketch, options);
  const { points, marks, toWorld } = cleanStroke(sketch);
  const title = options.title ?? (v2?.doc.title.trim() || 'Studio Draft');
  const v2Landmark = v2 && (v2.doc.landmark.trim() || v2.doc.stamps.find((s) => s.type === 'landmark' && s.label?.trim())?.label);
  const landmark = options.landmark ?? (v2Landmark || sketch.marks?.find((m) => m.kind === 'landmark' && m.note?.trim())?.note) ?? 'The Fingerprint';
  const width = v2 ? clamp(v2.doc.width.base, R.MIN_WIDTH, R.MAX_WIDTH) : { easy: 7.6, normal: 7, hard: 6.4 }[sketch.difficulty ?? 'normal'];
  const event = {
    id: options.id ?? 'studio-draft', week: 2, version: options.version ?? 1,
    title, tagline: options.tagline ?? 'One lap. Every shard. Your line.', music: 'level3',
    rewards: {}, commentsPage: null,
    track: { title, landmark, width, points, shards: [], mines: [], bouncers: [], sentries: [], stations: [] },
  };
  let design = null;
  if (v2) {
    if (SKINS.includes(v2.doc.skin)) event.track.skin = v2.doc.skin;
    design = placeDesign(v2.doc, toWorld, createTrack(points, width, title));
    populate(event, sketch, marks, { shards: design.shards.length ? design.shards : null, stations: design.stations.length ? design.stations : null, hazards: design.autoHazards });
    const source = event.track;
    source.mines.push(...design.mines);
    source.bouncers.push(...design.bouncers);
    source.sentries.push(...design.sentries);
    if (source.shards.length < R.MIN_SHARDS) {
      const track = createTrack(source.points, width, title), added = R.MIN_SHARDS - source.shards.length;
      for (let k = 0; source.shards.length < R.MIN_SHARDS && k < 12; k++) {
        const along = ((k + 0.5) / 12) * track.length;
        const w = pointOnTrack(track, along);
        if (source.shards.some((q) => { const v = pointOnTrack(track, track.segments[q.seg].start + track.segments[q.seg].length * q.t, q.off); return Math.hypot(v.x - w.x, v.y - w.y) < 20; })) continue;
        source.shards.push(placement(track, along));
      }
      design.notes.push(`Added ${added} shard${added === 1 ? '' : 's'} on the centre line: the game needs at least ${R.MIN_SHARDS}.`);
    }
  } else populate(event, sketch, marks);
  let layout = createWeeklyLayout(event), problems = geometryProblems(layout.track), flown = null;
  const fixes = [];
  let startFixed = false;
  if (!problems.length) {
    flown = flyWeeklyLap(layout);
    // Retry only with concrete, reviewable edits, then fly the final event again.
    for (let attempt = 0; !flown.finished && attempt < 6; attempt++) {
      const p = flown.scene.player, source = event.track;
      if (flown.dead === 'mine' && source.mines.length) {
        let index = 0;
        layout.mines.forEach((m, i) => { if (Math.hypot(m.x - p.x, m.y - p.y) < Math.hypot(layout.mines[index].x - p.x, layout.mines[index].y - p.y)) index = i; });
        const mine = source.mines.splice(index, 1)[0];
        fixes.push(`Removed the mine on segment ${mine.seg} hit by the pilot.`);
      } else if (flown.dead === 'hull' && (source.bouncers.length || source.sentries.length)) {
        source.bouncers = []; source.sentries = [];
        fixes.push('Removed bouncers and sentries after the pilot lost its hull.');
      } else if (!startFixed && flown.scene.shards.size === layout.shards.length && flown.scene.trackProgress.passed === layout.track.checkpoints.length && turnAngles(layout.track)[0] > 0.4) {
        // At a corner, an inside cut may approach point 0 from the positive
        // side of its outgoing finish plane and never cross it. Add a short
        // tangent approach behind the same start mark; keep the drawing order.
        const g = layout.track.portal;
        source.points.push([g.x - g.tx * 6, g.y - g.ty * 6]);
        startFixed = true;
        fixes.push('Added a 6-cell tangent approach behind the start mark so the pilot crosses the finish line.');
      } else if (source.shards.some((s, i) => s.off !== 0 && !flown.scene.shards.has(layout.shards[i].id))) {
        const missing = new Set(layout.shards.filter((s) => !flown.scene.shards.has(s.id)).map((s) => s.id));
        source.shards.forEach((s, i) => { if (missing.has(layout.shards[i].id)) s.off = 0; });
        fixes.push(`Moved ${missing.size} missed shards to the centreline.`);
      } else if (source.width < R.MAX_WIDTH) {
        source.width = R.MAX_WIDTH;
        fixes.push('Widened the lane to 8 cells so the pilot can turn through the corners.');
      } else if (source.mines.length || source.bouncers.length || source.sentries.length) {
        source.mines = []; source.bouncers = []; source.sentries = [];
        fixes.push('Removed remaining hazards for a final geometry-only pilot attempt.');
      } else break;
      layout = createWeeklyLayout(event);
      problems = geometryProblems(layout.track);
      if (problems.length) { flown = null; break; }
      flown = flyWeeklyLap(layout);
    }
    if (flown && !flown.finished) problems.push(`Test pilot could not finish (${flown.dead || 'stuck or missed checkpoints'}); redraw the tightest turn or move the start onto a straight.`);
  }
  const finished = flown?.finished === true;
  const ms = finished ? flown.time : null;
  const report = {
    ok: !problems.length && finished, problems, fixes,
    lengthCells: Math.round(layout.track.length * 100) / 100,
    corners: turnAngles(layout.track).filter((a) => a > 0.22).length,
    shards: event.track.shards.length, mines: event.track.mines.length, bouncers: event.track.bouncers.length,
    pilot: { finished, ms },
    // A heuristic, not a measured human time: the careful pilot is deliberately slow.
    estimatedHumanMs: ms === null ? null : Math.round(ms * 0.78),
  };
  if (!v2) return { event, report };
  // v2 only: what the design asked for that the game cannot do yet, and placement notes.
  report.draftVersion = 2;
  report.skin = event.track.skin ?? null;
  report.sentries = event.track.sentries.length;
  report.stations = event.track.stations.length;
  report.width = event.track.width;
  report.notes = [...v2.notes, ...design.notes];
  report.intent = design.intent.map((i) => i.text);
  return { event, report, intent: design.intent };
}

/** The lane exactly as the game will fly it (world points, start first) and the page-to-world map. */
export function gameLane(input) {
  const v2 = input && typeof input === 'object' && input.version === 2 ? prepareDesign(input) : null;
  const sketch = v2 ? v2.sketch : input;
  validate(sketch, {});
  const { points, toWorld } = cleanStroke(sketch);
  return { points, toWorld, width: v2 ? clamp(v2.doc.width.base, R.MIN_WIDTH, R.MAX_WIDTH) : { easy: 7.6, normal: 7, hard: 6.4 }[sketch.difficulty ?? 'normal'] };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const num = (n) => { if (!finite(n)) throw new TypeError('SVG geometry must be finite.'); return Number(n.toFixed(3)); };

const INTENT_COLOR = { landmark: '#a98bff', star: '#a98bff', zone: '#ff9a3d', request: '#ff4fa3', barricade: '#ff4fa3', debris: '#ff4fa3', note: '#9aa3ad', behaviour: '#ff4fa3' };

/**
 * Standalone obstacle preview. Text is escaped; geometry accepts only numbers.
 * `intent` (v2 converter output) adds the design intent dashed on top: zones,
 * landmarks, requested items and obstacles the game cannot do yet.
 */
export function weeklyPreviewSvg(event, { width = 600, intent = null } = {}) {
  if (!finite(width) || width <= 0) throw new TypeError('SVG width must be positive and finite.');
  const layout = createWeeklyLayout(event), { track } = layout, b = track.bounds;
  const x = b.minX - 8, y = b.minY - 28, w = b.maxX - x + 8, h = b.maxY - y + 8;
  const path = track.points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join(' ') + ' Z';
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(width * h / w)}" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}" role="img" aria-label="${esc(event.title)} track preview">`,
    `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="#03070b"/>`,
    `<text x="${num(x + 6)}" y="${num(y + 10)}" fill="#e6f5ff" font-size="7">${esc(event.title)}</text>`,
    `<text x="${num(x + 6)}" y="${num(y + 18)}" fill="#a9dcff" font-size="4">${esc(layout.landmark)}</text>`,
    `<path d="${path}" fill="none" stroke="#7fd3dc" stroke-width="${num(track.width + 0.6)}" stroke-linejoin="round"/>`,
    `<path d="${path}" fill="none" stroke="#0e1d29" stroke-width="${num(track.width)}" stroke-linejoin="round"/>`];
  for (const s of track.segments) {
    const p = pointOnTrack(track, s.start + s.length * 0.5);
    out.push(`<path d="M${num(p.x - s.tx * 1.5 - s.ty)} ${num(p.y - s.ty * 1.5 + s.tx)} L${num(p.x)} ${num(p.y)} L${num(p.x - s.tx * 1.5 + s.ty)} ${num(p.y - s.ty * 1.5 - s.tx)}" fill="none" stroke="#8de5dc" stroke-width=".5"/>`);
  }
  const g = track.portal;
  out.push(`<line x1="${num(g.x - g.nx * track.width / 2)}" y1="${num(g.y - g.ny * track.width / 2)}" x2="${num(g.x + g.nx * track.width / 2)}" y2="${num(g.y + g.ny * track.width / 2)}" stroke="#ffffff" stroke-width="1" stroke-dasharray=".7 .7"/>`);
  out.push(`<text x="${num(g.x + g.nx * (track.width / 2 + 2))}" y="${num(g.y + g.ny * (track.width / 2 + 2))}" fill="#e6f5ff" font-size="3">START / FINISH</text>`);
  for (const s of layout.shards) out.push(`<path d="M${num(s.x)} ${num(s.y - 1)} L${num(s.x + 0.7)} ${num(s.y)} L${num(s.x)} ${num(s.y + 1)} L${num(s.x - 0.7)} ${num(s.y)} Z" fill="#99e9b2"/>`);
  for (const m of layout.mines) out.push(`<circle cx="${num(m.x)}" cy="${num(m.y)}" r="${num(m.radius)}" fill="#ff5a4e"/>`);
  for (const b of layout.bouncers) {
    const p = bouncerPosition(b, 0);
    out.push(`<line x1="${num(b.originX - b.nx * b.span)}" y1="${num(b.originY - b.ny * b.span)}" x2="${num(b.originX + b.nx * b.span)}" y2="${num(b.originY + b.ny * b.span)}" stroke="#9aabb7" stroke-opacity=".5" stroke-width=".5"/><circle cx="${num(p.x)}" cy="${num(p.y)}" r="${num(b.radius)}" fill="#9aabb7"/>`);
  }
  for (const s of layout.sentries) out.push(`<circle cx="${num(s.x)}" cy="${num(s.y)}" r=".8" fill="#ffad72"/>`);
  for (const s of layout.stations) out.push(`<circle cx="${num(s.x)}" cy="${num(s.y)}" r="1.2" fill="none" stroke="#6ed2e3" stroke-width=".4"/>`);
  for (const item of Array.isArray(intent) ? intent.slice(0, 80) : []) {
    const color = INTENT_COLOR[item.kind];
    if (!color) continue;
    if (Array.isArray(item.poly) && item.poly.length > 1 && item.poly.every((p) => finite(p[0]) && finite(p[1]))) {
      const d = item.poly.map((p, i) => `${i ? 'L' : 'M'}${num(p[0])} ${num(p[1])}`).join(' ') + (item.kind === 'zone' ? ' Z' : '');
      out.push(`<path d="${d}" fill="${item.kind === 'zone' ? color : 'none'}" fill-opacity=".18" stroke="${color}" stroke-width=".6" stroke-dasharray="1.5 1"/>`);
    } else if (Array.isArray(item.at) && finite(item.at[0]) && finite(item.at[1])) {
      const [cx, cy] = item.at, r = item.kind === 'landmark' || item.kind === 'star' ? clamp((item.size || 4) / 2, 1, 8) : 1.6;
      out.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke="${color}" stroke-width=".6" stroke-dasharray="1 .8"/>`);
      if (item.kind === 'request') out.push(`<text x="${num(cx)}" y="${num(cy + 1.1)}" fill="${color}" font-size="3" text-anchor="middle">?</text>`);
    }
  }
  out.push('</svg>');
  return out.join('\n');
}
