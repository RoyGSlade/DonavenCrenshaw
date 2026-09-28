// The track editor's data operations, kept pure so node tests cover them.
// A track here is the LEVELS format (see tracks/custom-track.js). Every edit
// returns a new track and keeps apexes (point numbers) and rocks (segment
// numbers) pointing at the same corners and stretches when points come and go.
import { pickTrackFields } from '../systems/customTrack.js';
import { TRACK_RULES } from '../engine/trackChecks.js';

export const GRID_W = TRACK_RULES.GRID_W;
export const GRID_H = TRACK_RULES.GRID_H;

export function blankTrack(releaseAt = '') {
  return pickTrackFields({ title: 'Custom Track', releaseAt, width: 6.4, points: [], apexes: [], rocks: [] });
}

export function snap(value, step = 0.5) {
  return step > 0 ? Math.round(value / step) * step : Math.round(value * 100) / 100;
}

export function clampPoint(x, y) {
  return [Math.min(GRID_W, Math.max(0, x)), Math.min(GRID_H, Math.max(0, y))];
}

function copy(track) {
  return {
    ...track,
    points: track.points.map((p) => [...p]),
    apexes: [...track.apexes],
    rocks: [...track.rocks],
    ...(track.moving ? { moving: [...track.moving] } : {}),
    ...(track.drones ? { drones: [...track.drones] } : {}),
    ...(track.well ? { well: { ...track.well } } : {}),
  };
}

const sorted = (list) => [...new Set(list)].sort((a, b) => a - b);

/** Put a point at `index` (0…length). Segment index-1 splits in two; its rock stays on the first half. */
export function insertPoint(track, index, point) {
  const t = copy(track);
  const at = Math.max(0, Math.min(t.points.length, index));
  t.points.splice(at, 0, clampPoint(point[0], point[1]));
  const shift = (i) => (i >= at ? i + 1 : i);
  t.apexes = sorted(t.apexes.map(shift));
  t.rocks = sorted(t.rocks.map(shift));
  if (t.moving) t.moving = sorted(t.moving.map(shift));
  return t;
}

/** Take a point out. Its apex goes; the rock on the segment leaving it goes too. */
export function removePoint(track, index) {
  if (index < 0 || index >= track.points.length) return track;
  const t = copy(track);
  t.points.splice(index, 1);
  const n = t.points.length;
  const shift = (i) => (i > index ? i - 1 : i);
  t.apexes = sorted(t.apexes.filter((i) => i !== index).map(shift));
  // After removal the old last segment (n) wraps to n - 1 at most.
  t.rocks = sorted(t.rocks.filter((i) => i !== index).map(shift).filter((i) => i < Math.max(n, 1)));
  if (t.moving) {
    t.moving = sorted(t.moving.filter((i) => i !== index).map(shift)).filter((i) => t.rocks.includes(i));
    if (!t.moving.length) delete t.moving;
  }
  return t;
}

export function movePoint(track, index, point) {
  if (index < 0 || index >= track.points.length) return track;
  const t = copy(track);
  t.points[index] = clampPoint(point[0], point[1]);
  return t;
}

/** Point 0 is the start portal and never an apex. */
export function toggleApex(track, index) {
  if (index <= 0 || index >= track.points.length) return track;
  const t = copy(track);
  t.apexes = t.apexes.includes(index) ? t.apexes.filter((i) => i !== index) : sorted([...t.apexes, index]);
  return t;
}

export function toggleRock(track, segment) {
  if (segment < 0 || segment >= track.points.length) return track;
  const t = copy(track);
  if (t.rocks.includes(segment)) {
    t.rocks = t.rocks.filter((i) => i !== segment);
    if (t.moving) {
      t.moving = t.moving.filter((i) => i !== segment);
      if (!t.moving.length) delete t.moving;
    }
  } else t.rocks = sorted([...t.rocks, segment]);
  return t;
}

/** The nearest point within `radius` cells of (x, y), or -1. */
export function hitPoint(track, x, y, radius = 0.9) {
  let best = -1, bestD = radius;
  track.points.forEach(([px, py], i) => {
    const d = Math.hypot(px - x, py - y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

/** The nearest closed-loop segment within `radius` cells of (x, y), or -1. */
export function hitSegment(track, x, y, radius = 3) {
  const n = track.points.length;
  if (n < 2) return -1;
  let best = -1, bestD = radius;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = track.points[i], [bx, by] = track.points[(i + 1) % n];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d <= bestD) { best = i; bestD = d; }
  }
  return best;
}

/**
 * Pasted track text: JSON, or the JS module the editor exports (and the
 * shipped tracks/custom-track.js). Comments, `export const X =`, unquoted keys,
 * single quotes and trailing commas are handled. Nothing is evaluated.
 * { track } or { error }.
 */
export function parseTrackText(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  const nope = { error: 'That text isn’t a track the editor can read. Paste the exported JSON or the whole custom-track.js file.' };
  if (start < 0 || end <= start) return nope;
  const body = raw.slice(start, end + 1);
  for (const candidate of [body, jsObjectToJson(body)]) {
    try {
      const track = pickTrackFields(JSON.parse(candidate));
      if (track) return { track };
    } catch { /* try the next form */ }
  }
  return nope;
}

// A JS object literal (as written in custom-track.js) to JSON text.
function jsObjectToJson(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i], next = body[i + 1];
    if (c === '"' || c === "'") {
      let s = '';
      for (i++; i < body.length && body[i] !== c; i++) {
        if (body[i] !== '\\') { s += body[i]; continue; }
        const e = body[++i];
        if (e === 'u') { s += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16)); i += 4; }
        else s += { n: '\n', t: '\t', r: '\r' }[e] ?? e;
      }
      out += JSON.stringify(s);
    } else if (c === '/' && next === '/') {
      while (i < body.length && body[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      const close = body.indexOf('*/', i + 2);
      i = close < 0 ? body.length : close + 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      let word = c;
      while (i + 1 < body.length && /[\w$]/.test(body[i + 1])) word += body[++i];
      const rest = body.slice(i + 1).match(/^\s*:/);
      out += rest ? JSON.stringify(word) : word;
    } else if (c === ',') {
      // Drop a trailing comma before } or ] (comments between are already gone from `out` later).
      const rest = body.slice(i + 1).replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
      if (rest[0] !== '}' && rest[0] !== ']') out += c;
    } else out += c;
  }
  return out;
}