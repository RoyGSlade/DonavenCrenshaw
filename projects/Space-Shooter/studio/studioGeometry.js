// Track Studio v2 geometry: stroke smoothing, the width profile (brush spans
// and auto taper), lane checks (overlap, crossings, tight turns, zig-zags,
// width) and a lap-time estimate. Pure and bounded: no DOM, clock or
// randomness, so the phone page, the converter and node tests agree.
//
// Units are world cells (the game's units) unless a name says otherwise.
// A lane is a list of [x, y] centre-line points; `closed` joins the last
// point back to the first. Lap distance `s` is measured from point 0.
import { WEEKLY_RULES as R } from '../engine/weekly/layout.js';

export const GAME = Object.freeze({
  MIN_WIDTH: R.MIN_WIDTH, MAX_WIDTH: R.MAX_WIDTH, LANE_GAP: R.LANE_GAP, MIN_LENGTH: R.MIN_LENGTH,
  MIN_SHARDS: R.MIN_SHARDS, OVERLAP_MARGIN: 0.3,
});

// The studio's own limits and the turning model. The ship turns by thrusting
// sideways, so a corner of radius r is flown at about sqrt(GRIP * r) (the same
// lateral-grip model the scripted pilot plans with, engine/weekly/pilot.js).
export const DESIGN = Object.freeze({
  MAX_WIDTH: R.MAX_WIDTH, // the brush and sliders stop at the game's widest lane
  LEGACY_MAX_WIDTH: 14,   // older drafts asked for up to 14: they load and draw as saved, and clamp on edit
  GRIP: 3.2, CRUISE: 11, ACCEL: 3, BRAKE: 2.2, FLOOR: 3.5,
  PILOT_MARGIN: 0.75,     // the racing line stays this far inside the rails
  TIGHT_RADIUS: 3.8,      // FLOOR^2 / GRIP: slower than the floor speed means "too tight"
  SLOW_RADIUS: 12,        // corners under about 6 cells/s
  ZIGZAG_TURN: 0.7,       // radians each way within a few lane widths
  HUMAN: 0.78,            // the converter's human-vs-pilot heuristic
});

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (v, m) => ((v % m) + m) % m;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const finitePoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Drop points closer than `min` to the previous kept one. */
export function dedupe(points, min = 1e-6) {
  const out = [];
  for (const p of points) {
    if (!finitePoint(p)) continue;
    if (!out.length || dist(p, out.at(-1)) > min) out.push([p[0], p[1]]);
  }
  return out;
}

export function polylineLength(points, closed = false) {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  if (closed && points.length > 1) s += dist(points.at(-1), points[0]);
  return s;
}

/** Cumulative distance at each point; closed lanes get one extra entry: the full lap. */
export function cumulative(points, closed = false) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  if (closed && points.length > 1) cum.push(cum.at(-1) + dist(points.at(-1), points[0]));
  return cum;
}

/** The point `s` cells along the polyline (wraps when closed). */
export function pointAt(points, cum, s, closed = false) {
  const total = cum.at(-1);
  if (!(total > 0)) return { x: points[0][0], y: points[0][1], tx: 1, ty: 0, i: 0 };
  s = closed ? mod(s, total) : clamp(s, 0, total);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const a = points[lo], b = points[(lo + 1) % points.length];
  const len = cum[lo + 1] - cum[lo] || 1, t = (s - cum[lo]) / len;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / len, ty: (b[1] - a[1]) / len, i: lo };
}

/** Evenly spaced points every ~`spacing` cells (the last open point is kept). */
export function resample(points, spacing, closed = false) {
  const pts = dedupe(points);
  if (pts.length < 2) return pts;
  const cum = cumulative(pts, closed), total = cum.at(-1);
  const n = Math.max(closed ? 3 : 1, Math.round(total / Math.max(1e-6, spacing)));
  const out = [];
  for (let k = 0; k < n; k++) { const p = pointAt(pts, cum, (total * k) / n, closed); out.push([p.x, p.y]); }
  if (!closed) out.push([...pts.at(-1)]);
  return out;
}

/** Chaikin corner cutting; open strokes keep their end points. */
export function chaikin(points, iterations = 2, closed = false) {
  let pts = points;
  for (let it = 0; it < iterations && pts.length > 2; it++) {
    const out = closed ? [] : [pts[0]];
    const n = pts.length, edges = closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const q = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25];
      const r = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75];
      if (!closed && i === 0) out.push(r);
      else if (!closed && i === edges - 1) out.push(q);
      else out.push(q, r);
    }
    if (!closed) out.push(pts.at(-1));
    pts = out;
  }
  return pts;
}

/** Uniform Catmull-Rom through the points, sampled every ~`step` cells. */
export function catmullRom(points, step = 1, closed = false) {
  const n = points.length;
  if (n < 3) return points.map((p) => [...p]);
  const at = (i) => closed ? points[mod(i, n)] : points[clamp(i, 0, n - 1)];
  const out = [], edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const m = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push([...points.at(-1)]);
  return out;
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** Ramer-Douglas-Peucker for an open polyline (iterative, end points kept). */
export function rdp(points, epsilon) {
  if (points.length < 3) return points.map((p) => [...p]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = epsilon, at = -1;
    for (let i = a + 1; i < b; i++) { const d = segmentDistance(points[i], points[a], points[b]); if (d > best) { best = d; at = i; } }
    if (at >= 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]).map((p) => [...p]);
}

/** RDP for a closed loop: split at point 0 and the point farthest from it. */
export function rdpClosed(points, epsilon) {
  const n = points.length;
  if (n < 4) return points.map((p) => [...p]);
  let far = 1;
  for (let i = 2; i < n; i++) if (dist(points[0], points[i]) > dist(points[0], points[far])) far = i;
  const a = rdp(points.slice(0, far + 1), epsilon), b = rdp([...points.slice(far), points[0]], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function lowPass(points, passes, closed) {
  let pts = points;
  const n = pts.length;
  if (n < 3) return pts;
  for (let k = 0; k < passes; k++) {
    pts = pts.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const a = pts[mod(i - 1, n)], b = pts[mod(i + 1, n)];
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  return pts;
}

// sigma: the jitter filter's width in cells (a Gaussian, built from [1 2 1]
// passes over 0.5-cell samples); epsilon: RDP tolerance in cells.
export const SMOOTHING = Object.freeze({
  low: { sigma: 0.8, epsilon: 0.12, chaikin: 1 },
  medium: { sigma: 1.6, epsilon: 0.3, chaikin: 2 },
  high: { sigma: 3, epsilon: 0.7, chaikin: 3 },
});

/**
 * A finger stroke (world cells) to a smooth centre line: even out the finger's
 * speed, low-pass the jitter, simplify (RDP), round what is left (Chaikin) and
 * resample every `spacing` cells. Live while drawing and again on lift.
 */
export function smoothStroke(raw, { strength = 'medium', spacing = 1.5, closed = false } = {}) {
  const cfg = SMOOTHING[strength] || SMOOTHING.medium;
  let pts = dedupe(raw, 0.05);
  if (pts.length < 2) return pts;
  pts = resample(pts, 0.5, closed);
  // Each [1 2 1]/4 pass adds half a sample squared of variance.
  pts = lowPass(pts, Math.round(2 * (cfg.sigma / 0.5) ** 2), closed);
  pts = closed ? rdpClosed(pts, cfg.epsilon) : rdp(pts, cfg.epsilon);
  pts = chaikin(pts, cfg.chaikin, closed);
  return resample(pts, spacing, closed);
}

/**
 * If the stroke ends within `reach` cells of its start, close it: trim the
 * tail that overshoots the start and return { points, closed: true }.
 */
export function autoClose(points, reach) {
  if (points.length < 8) return { points, closed: false };
  const cum = cumulative(points), total = cum.at(-1);
  if (total < reach * 4) return { points, closed: false };
  // The tail's closest pass by the start (a finger often overshoots it).
  let end = -1, best = reach;
  for (let i = points.length - 1; i > 2 && cum[i] > total * 0.6; i--) {
    const d = dist(points[i], points[0]);
    if (d <= best) { best = d; end = i; }
  }
  if (end < 0) return { points, closed: false };
  return { points: points.slice(0, end + 1).filter((p, i, a) => i < a.length - 1 || dist(p, a[0]) > 0.3), closed: true };
}

/**
 * Nearest point on a polyline to p: { s, i, t, d, x, y, tx, ty, off } where
 * off is signed across the lane, + to the right of the race direction (the
 * game's convention, screen y down).
 */
export function nearestOnPolyline(points, p, closed = false, cum = cumulative(points, closed)) {
  let best = null;
  const n = points.length, edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    if (!(len2 > 0)) continue;
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
    const x = a[0] + dx * t, y = a[1] + dy * t, d = Math.hypot(p[0] - x, p[1] - y);
    if (!best || d < best.d) {
      const len = Math.sqrt(len2), tx = dx / len, ty = dy / len;
      best = { i, t, d, x, y, tx, ty, s: cum[i] + len * t, off: (p[0] - x) * -ty + (p[1] - y) * tx };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Width profile: a base width plus brushed spans, blended by an auto taper.
//   { base: cells, taper: cells, spans: [{ from: lap fraction, len: lap fraction, w: cells }] }
// Spans are measured from lane point 0 as fractions of the lap, so reshaping
// the lane keeps them roughly where they were.
// ---------------------------------------------------------------------------

const smoothstep = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

export const clampWidth = (w, max = DESIGN.LEGACY_MAX_WIDTH) => clamp(Number.isFinite(w) ? w : GAME.MIN_WIDTH, GAME.MIN_WIDTH, max);

/**
 * How much of a span is in force at lap distance s (0..1). The taper is a
 * smoothstep ramp `taper` cells long centred on each edge of the span; with no
 * taper the edges are hard steps. A span shorter than its taper never reaches
 * full strength, which is what lets a very wide stretch flow into a narrow one.
 */
export function spanMembership(s, from, len, taper, lap) {
  if (!(lap > 0) || !(len > 0)) return 0;
  if (len >= lap) return 1;
  const T = Math.max(0, Math.min(taper, lap - len));
  if (T <= 0) return mod(s - from, lap) < len ? 1 : 0;
  const half = T / 2;
  const v = mod(s - from + half, lap) - half;   // -half at the start of the in-ramp
  const rampIn = smoothstep((v + half) / T);
  const rampOut = 1 - smoothstep((v - len + half) / T);
  return Math.min(rampIn, rampOut);
}

/** Lane width (cells) at lap distance s for a lap of `lap` cells. */
export function widthAt(profile, s, lap) {
  const base = clampWidth(profile?.base ?? 7);
  const taper = Math.max(0, Number(profile?.taper) || 0);
  let w = base;
  for (const span of profile?.spans || []) {
    const m = spanMembership(s, span.from * lap, span.len * lap, taper, lap);
    if (m > 0) w += (clampWidth(span.w) - w) * m;
  }
  return clampWidth(w);
}

/** `n` evenly spaced widths around the lap (the mini graph). */
export function widthSamples(profile, lap, n = 120) {
  return Array.from({ length: n }, (_, i) => widthAt(profile, (lap * i) / n, lap));
}

export function isUniformWidth(profile) {
  const base = clampWidth(profile?.base ?? 7);
  return !(profile?.spans || []).some((s) => Math.abs(clampWidth(s.w) - base) > 1e-6);
}

/**
 * Paint a width span from lap distance s0 forward to s1 (cells). Spans the new
 * one fully covers are removed; at most `max` spans are kept (oldest first out).
 * Returns a new profile.
 */
export function paintWidthSpan(profile, s0, s1, w, lap, max = 64) {
  const from = mod(s0, lap) / lap;
  const len = clamp(mod(s1 - s0, lap) / lap, 0, 1);
  if (!(len > 0)) return profile;
  const covers = (o) => {
    const start = mod(o.from - from, 1);
    return start + o.len <= len + 1e-9;
  };
  const spans = (profile.spans || []).filter((o) => !covers(o));
  spans.push({ from: Math.round(from * 1e5) / 1e5, len: Math.round(len * 1e5) / 1e5, w: Math.round(clampWidth(w, DESIGN.MAX_WIDTH) * 100) / 100 });
  return { ...profile, spans: spans.slice(-max) };
}

/** The stretch [s0, s1] a brush covered, from the lap distances it touched (handles wrap). */
export function coveredStretch(distances, lap) {
  if (!distances.length) return null;
  const sorted = [...distances].map((d) => mod(d, lap)).sort((a, b) => a - b);
  // The biggest gap between touched distances is the part NOT painted.
  let gap = lap - sorted.at(-1) + sorted[0], at = sorted.length - 1;
  for (let i = 0; i < sorted.length - 1; i++) if (sorted[i + 1] - sorted[i] > gap) { gap = sorted[i + 1] - sorted[i]; at = i; }
  const s0 = sorted[(at + 1) % sorted.length], s1 = sorted[at];
  return { s0, s1: mod(s1 - s0, lap) < 1e-9 ? s0 : s1 };
}

// ---------------------------------------------------------------------------
// Lane checks
// ---------------------------------------------------------------------------

/** Samples every `step` cells with lap distance and width: [{ x, y, s, w, tx, ty }]. */
export function laneSamples(points, { closed = true, profile = null, width = 7, step = 1 } = {}) {
  const pts = dedupe(points);
  if (pts.length < 2) return { samples: [], length: 0 };
  const cum = cumulative(pts, closed), length = cum.at(-1);
  const n = Math.max(2, Math.ceil(length / step));
  const samples = [];
  for (let k = 0; k < (closed ? n : n + 1); k++) {
    const s = Math.min(length, (length * k) / n), p = pointAt(pts, cum, s, closed);
    samples.push({ x: p.x, y: p.y, s, tx: p.tx, ty: p.ty, w: profile ? widthAt(profile, s, length) : clampWidth(width) });
  }
  return { samples, length };
}

function lapGap(a, b, length, closed) {
  const g = Math.abs(a - b);
  return closed ? Math.min(g, length - g) : g;
}

function crossingPoint(a, b, c, d) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
  const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + dx * t, a[1] + dy * t] : null;
}

function pushMarker(list, marker, spread, cap) {
  if (list.length >= cap) return;
  if (list.some((m) => Math.hypot(m.x - marker.x, m.y - marker.y) < spread)) return;
  list.push(marker);
}

/**
 * Everything the studio flags while you draw: lane overlaps (two stretches at
 * least LANE_GAP apart along the lap whose lanes touch), centre-line crossings,
 * corners too tight for the ship, razor zig-zags, and the lap-time estimate.
 * Markers carry x, y (cells) for the pink badges.
 */
export function analyzeLane(points, { closed = true, profile = null, width = 7, step = 1, cap = 40 } = {}) {
  const { samples, length } = laneSamples(points, { closed, profile, width, step });
  const out = { length, samples, overlaps: [], crossings: [], tight: [], zigzags: [], minWidth: Infinity, maxWidth: 0, pilotMs: null, humanMs: null, corners: 0, slowest: null };
  const n = samples.length;
  if (n < 4) return out;
  let maxW = 0;
  for (const s of samples) { maxW = Math.max(maxW, s.w); out.minWidth = Math.min(out.minWidth, s.w); }
  out.maxWidth = maxW;
  // Overlaps: spatial buckets the size of the widest lane.
  const size = maxW + GAME.OVERLAP_MARGIN, buckets = new Map();
  for (let i = 0; i < n; i++) {
    const p = samples[i], bx = Math.floor(p.x / size), by = Math.floor(p.y / size);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of buckets.get(`${bx + dx},${by + dy}`) || []) {
        const q = samples[j];
        if (lapGap(p.s, q.s, length, closed) < GAME.LANE_GAP) continue;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d <= (p.w + q.w) / 2 + GAME.OVERLAP_MARGIN) pushMarker(out.overlaps, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, s: q.s, s2: p.s, gap: d }, 6, cap);
      }
    }
    const key = `${bx},${by}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  // Centre-line crossings (also the small loops the overlap gap skips).
  const segBuckets = new Map(), cell = Math.max(2, step * 4);
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const a = [samples[i].x, samples[i].y], b = [samples[(i + 1) % n].x, samples[(i + 1) % n].y];
    const own = new Set(), near = new Set();
    for (const p of [a, b]) {
      const bx = Math.floor(p[0] / cell), by = Math.floor(p[1] / cell);
      own.add(`${bx},${by}`);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.add(`${bx + dx},${by + dy}`);
    }
    const seen = new Set();
    for (const key of near) {
      for (const j of segBuckets.get(key) || []) {
        if (seen.has(j) || Math.abs(i - j) < 2 || (closed && Math.abs(i - j) > edges - 2)) continue;
        seen.add(j);
        const c = [samples[j].x, samples[j].y], d = [samples[(j + 1) % n].x, samples[(j + 1) % n].y];
        const hit = crossingPoint(a, b, c, d);
        if (hit) pushMarker(out.crossings, { x: hit[0], y: hit[1], s: samples[j].s, s2: samples[i].s }, 4, cap);
      }
    }
    for (const key of own) {
      if (!segBuckets.has(key)) segBuckets.set(key, []);
      segBuckets.get(key).push(i);
    }
  }
  // Turns: heading change across a window of about a lane width each side.
  const heading = samples.map((p) => Math.atan2(p.ty, p.tx));
  const at = (i) => closed ? mod(i, n) : clamp(i, 0, n - 1);
  const speeds = new Float64Array(n);
  let inCorner = false;
  for (let i = 0; i < n; i++) {
    const h = Math.max(3, Math.round(samples[i].w / step));
    const a = at(i - h), b = at(i + h);
    const before = wrapAngle(heading[i] - heading[a]), after = wrapAngle(heading[b] - heading[i]);
    const turn = Math.abs(before + after), span = Math.max(step, (b - a) * step);
    const radius = turn > 1e-3 ? span / turn : Infinity;
    // The racing line can use the lane: it runs wider than the centre line by about half the free width.
    const effective = radius + Math.max(0, samples[i].w / 2 - DESIGN.PILOT_MARGIN);
    samples[i].radius = radius;
    samples[i].effective = effective;
    speeds[i] = clamp(Math.sqrt(DESIGN.GRIP * effective), DESIGN.FLOOR, DESIGN.CRUISE);
    if (effective < DESIGN.TIGHT_RADIUS && (closed || (i > h && i < n - 1 - h))) pushMarker(out.tight, { x: samples[i].x, y: samples[i].y, s: samples[i].s, radius }, 8, cap);
    if (Math.abs(before) > DESIGN.ZIGZAG_TURN && Math.abs(after) > DESIGN.ZIGZAG_TURN && Math.sign(before) !== Math.sign(after)
        && (closed || (i > h && i < n - 1 - h))) pushMarker(out.zigzags, { x: samples[i].x, y: samples[i].y, s: samples[i].s }, 8, cap);
    const corner = effective < DESIGN.SLOW_RADIUS * 3;
    if (corner && !inCorner) out.corners++;
    inCorner = corner;
    if (!out.slowest || effective < out.slowest.effective) out.slowest = { x: samples[i].x, y: samples[i].y, s: samples[i].s, effective, speed: speeds[i] };
  }
  // Speed profile: corner limits, then braking and acceleration passes.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) { const j = closed ? (i + 1) % n : Math.min(n - 1, i + 1); speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[j] ** 2 + 2 * DESIGN.BRAKE * step)); }
    for (let i = 0; i < n; i++) { const j = closed ? mod(i - 1, n) : Math.max(0, i - 1); speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[j] ** 2 + 2 * DESIGN.ACCEL * step)); }
  }
  let seconds = 0;
  for (let i = 0; i < (closed ? n : n - 1); i++) seconds += (length / n) / ((speeds[i] + speeds[(i + 1) % n]) / 2);
  out.pilotMs = Math.round(seconds * 1000);
  out.humanMs = Math.round(seconds * 1000 * DESIGN.HUMAN);
  return out;
}

/**
 * A suggested racing line: an elastic band through the lane that cuts
 * corners like a pilot (the same idea as engine/weekly/pilot.js, without
 * mines or pins), kept `margin` inside the rails. Closed lanes only.
 */
export function racingLine(samples, { margin = DESIGN.PILOT_MARGIN, iterations = 260 } = {}) {
  const n = samples.length;
  if (n < 6) return samples.map((p) => [p.x, p.y]);
  const pts = samples.map((p) => [p.x, p.y]);
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < n; i++) {
      const a = pts[mod(i - 1, n)], b = pts[(i + 1) % n], p = pts[i];
      p[0] += ((a[0] + b[0]) / 2 - p[0]) * 0.5;
      p[1] += ((a[1] + b[1]) / 2 - p[1]) * 0.5;
      // Stay inside the lane around this sample's own stretch of centre line.
      let best = null;
      for (let d = -6; d <= 6; d++) {
        const c = samples[mod(i + d, n)], e = samples[mod(i + d + 1, n)];
        const q = segmentDistance(p, [c.x, c.y], [e.x, e.y]);
        if (!best || q < best.q) best = { q, c, e };
      }
      const half = Math.max(0, best.c.w / 2 - margin);
      if (best.q > half) {
        const dx = best.e.x - best.c.x, dy = best.e.y - best.c.y, len2 = dx * dx + dy * dy || 1;
        const t = clamp(((p[0] - best.c.x) * dx + (p[1] - best.c.y) * dy) / len2, 0, 1);
        const cx = best.c.x + dx * t, cy = best.c.y + dy * t, s = half / best.q;
        p[0] = cx + (p[0] - cx) * s; p[1] = cy + (p[1] - cy) * s;
      }
    }
  }
  return pts;
}

/** Points every `spacing` cells along a stroke, starting half a spacing in. */
export function pointsAlong(points, spacing, closed = false) {
  const pts = dedupe(points);
  if (!pts.length) return [];
  if (pts.length === 1) return [[...pts[0]]];
  const cum = cumulative(pts, closed), total = cum.at(-1);
  if (total < spacing) { const p = pointAt(pts, cum, total / 2, closed); return [[p.x, p.y]]; }
  const out = [];
  for (let s = spacing / 2; s <= total + 1e-9 && out.length < 500; s += spacing) { const p = pointAt(pts, cum, s, closed); out.push([p.x, p.y]); }
  return out;
}

/**
 * Where a start/finish line flies best: a third of the way into the longest
 * gently curving stretch (the converter adds an approach if the start sits on
 * a corner). Takes analyzeLane's result; returns a lap distance in cells.
 */
export function autoStartDistance(analysis) {
  const samples = analysis?.samples || [];
  if (samples.length < 8) return 0;
  const n = samples.length, straight = samples.map((p) => (p.effective ?? Infinity) >= DESIGN.SLOW_RADIUS * 3);
  let best = { len: -1, start: 0 };
  // Rotate so we start on a corner, then measure runs (wrapping once).
  let first = straight.findIndex((v) => !v);
  if (first < 0) return 0;
  let run = 0, runStart = 0;
  for (let k = 1; k <= n; k++) {
    const i = (first + k) % n;
    if (straight[i]) { if (!run) runStart = i; run++; if (run > best.len) best = { len: run, start: runStart }; }
    else run = 0;
  }
  if (best.len <= 0) return 0;
  return samples[(best.start + Math.floor(best.len / 3)) % n].s;
}

/** Ray-casting point-in-polygon. */
export function pointInPolygon(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1] || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

/**
 * Snap a point: 'centre' to the lane's centre line, 'edge' just inside the
 * nearer rail, 'grid' to a `grid`-cell grid, anything else unchanged.
 */
export function snapPoint(p, mode, { lane = null, closed = true, profile = null, width = 7, grid = 5, inset = 0.6 } = {}) {
  if (mode === 'grid') return [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid];
  if ((mode !== 'centre' && mode !== 'edge') || !lane || lane.length < 2) return [p[0], p[1]];
  const cum = cumulative(lane, closed), q = nearestOnPolyline(lane, p, closed, cum);
  if (!q) return [p[0], p[1]];
  if (mode === 'centre') return [q.x, q.y];
  const w = profile ? widthAt(profile, q.s, cum.at(-1)) : clampWidth(width);
  const off = (Math.sign(q.off) || 1) * Math.max(0, w / 2 - inset);
  return [q.x - q.ty * off, q.y + q.tx * off];
}

/** The same lap position on the other side of the lane's centre line. */
export function mirrorAcrossLane(p, lane, closed = true) {
  const q = nearestOnPolyline(lane, p, closed);
  if (!q) return [p[0], p[1]];
  return [q.x + q.ty * q.off, q.y - q.tx * q.off];
}

/**
 * Splice a reshaping stroke into a closed lane: the stroke must start and end
 * within `reach` of the lane. The shorter arc between those two lap positions
 * (in the stroke's direction) is replaced. Returns new points or null.
 */
export function reshapeLane(lane, stroke, reach) {
  if (lane.length < 4 || stroke.length < 2) return null;
  const cum = cumulative(lane, true), lap = cum.at(-1);
  const a = nearestOnPolyline(lane, stroke[0], true, cum), b = nearestOnPolyline(lane, stroke.at(-1), true, cum);
  if (!a || !b || a.d > reach || b.d > reach) return null;
  const forward = mod(b.s - a.s, lap);
  const reversed = forward > lap / 2;
  const from = reversed ? b : a, to = reversed ? a : b, path = reversed ? [...stroke].reverse() : stroke;
  // Keep lane points outside the replaced arc, in lap order starting after `to`.
  const keep = [];
  const n = lane.length;
  for (let k = 1; k <= n; k++) {
    const i = (to.i + k) % n;
    const s = cum[i];
    if (mod(s - from.s, lap) < mod(to.s - from.s, lap)) continue; // inside the replaced arc
    keep.push(lane[i]);
  }
  const replaced = [...keep, [from.x, from.y], ...path, [to.x, to.y]];
  return dedupe(replaced, 0.2);
}

/**
 * Erase the lane points within `radius` of any brush point. A closed lane is
 * opened at the gap; with several gaps the longest remaining piece is kept.
 * Returns { points, closed } (points may be empty).
 */
export function eraseLane(lane, closed, brush, radius) {
  const n = lane.length;
  const gone = lane.map((p) => brush.some((b) => dist(p, b) <= radius));
  if (!gone.some(Boolean)) return { points: lane, closed };
  if (gone.every(Boolean)) return { points: [], closed: false };
  const pieces = [];
  let cur = [];
  const start = closed ? gone.findIndex(Boolean) : 0;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (gone[i]) { if (cur.length) pieces.push(cur); cur = []; } else cur.push(lane[i]);
  }
  if (cur.length) pieces.push(cur);
  pieces.sort((a, b) => polylineLength(b) - polylineLength(a));
  return { points: pieces[0] || [], closed: false };
}

/** Bounding box of point lists: { minX, minY, maxX, maxY } or null. */
export function bounds(lists) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const list of lists) for (const p of list) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
