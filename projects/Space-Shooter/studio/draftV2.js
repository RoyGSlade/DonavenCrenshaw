// Track Studio draft format v2: one design document with layers, stamps, a
// width profile, the skin, requests and notes. Pure: shared by the studio page,
// the converter (studio/sketchToWeekly.js) and node tests.
//
// Coordinates are page coordinates, 0..1 on each axis of the drawing page
// (x by width, y by height, y down), exactly like v1 sketch points. The page is
// `page.cells` world cells on its long side, so world = page x * page width.
//
// {
//   version: 2, id, title, landmark, notes, nameIdeas, difficulty, skin,
//   page:   { aspect, cells },
//   lane:   { points: [[x, y]], closed, start },
//   width:  { base, taper, spans: [{ from, len, w }] },   (see studioGeometry.js)
//   strokes: [{ id, layer, points, closed, type, spacing, size, behavior, label }],
//   stamps:  [{ id, type, x, y, size, rotation, behavior, period, label, note, requestId }],
//   requests: [{ id, title, type, behavior, cardRef, queued, stampId, status }],
//   layers: { <layer>: { visible, locked } },
//   auto:   { hazards: 'auto' | 'on' | 'off' },
// }
import { SKINS, DEFAULT_SKIN } from '../gfx/trackSkin.js';
import { WEEKLY_EVENTS } from '../tracks/weekly.js';
import { GAME, DESIGN, polylineLength } from './studioGeometry.js';

export const DRAFT_VERSION = 2;
export { SKINS, DEFAULT_SKIN };

export const SKIN_LABELS = Object.freeze({ midnight: 'Midnight metal', classic: 'Classic' });

// Pen colours carry meaning. Each layer has its own pen, eraser and sub-tools.
export const LAYERS = Object.freeze({
  lane: { label: 'Lane', color: '#f4f7fb' },
  obstacles: { label: 'Obstacles', color: '#ff4fa3' },
  landmarks: { label: 'Landmarks', color: '#a98bff' },
  shards: { label: 'Shards', color: '#3df2ff' },
  hazards: { label: 'Hazard zones', color: '#ff9a3d' },
  notes: { label: 'Notes', color: '#9aa3ad' },
});
export const LAYER_ORDER = Object.freeze(['lane', 'hazards', 'landmarks', 'obstacles', 'shards', 'notes']);

// game: what the converter turns it into today (false: design intent only).
export const STAMP_TYPES = Object.freeze({
  landmark: { label: 'Landmark', layer: 'landmarks', game: false, size: 6 },
  star: { label: 'Star', layer: 'landmarks', game: false, size: 4 },
  mine: { label: 'Mine', layer: 'obstacles', game: 'mines', size: 0.84 },
  rock: { label: 'Sweeping rock', layer: 'obstacles', game: 'bouncers', size: 1.6 },
  sentry: { label: 'Sentry', layer: 'obstacles', game: 'sentries', size: 1.2 },
  barricade: { label: 'Barricade', layer: 'obstacles', game: false, size: 3 },
  debris: { label: 'Falling debris', layer: 'obstacles', game: false, size: 2 },
  gate: { label: 'Gate / checkpoint', layer: 'lane', game: 'checkpoint', size: 7 },
  shards: { label: 'Shard cluster', layer: 'shards', game: 'shards', size: 3 },
  shard: { label: 'Shard', layer: 'shards', game: 'shards', size: 1 },
  start: { label: 'Start / finish', layer: 'lane', game: 'start', size: 7 },
  fuel: { label: 'Fuel dock', layer: 'lane', game: 'stations', size: 2.4 },
  fast: { label: 'Feels fast', layer: 'notes', game: 'feel', size: 3 },
  tight: { label: 'Feels tight', layer: 'notes', game: 'feel', size: 3 },
  calm: { label: 'Breather', layer: 'notes', game: 'feel', size: 3 },
  hazard: { label: 'More hazards', layer: 'notes', game: 'feel', size: 3 },
  text: { label: 'Text note', layer: 'notes', game: false, size: 3 },
  request: { label: 'Requested item', layer: 'notes', game: false, size: 4 },
});

export const OBSTACLE_TYPES = Object.freeze(['mine', 'rock', 'sentry', 'barricade', 'debris']);
export const ZONE_TYPES = Object.freeze({
  debris: 'Falling debris', wind: 'Wind / current', gravity: 'Gravity well', slow: 'Slow field',
  boost: 'Boost strip', collapse: 'Collapsing floor', dark: 'Blackout',
});
export const BEHAVIORS = Object.freeze({
  static: 'Static', moving: 'Moving on a path', rotating: 'Rotating', falling: 'Falling', timed: 'Timed', triggered: 'Triggered',
});
export const REQUEST_TYPES = Object.freeze(['obstacle', 'landmark', 'pickup', 'hazard', 'mechanic', 'decor', 'skin', 'other']);
export const REQUEST_BEHAVIORS = Object.freeze(['static', 'moving', 'rotating', 'falling', 'timed', 'triggered']);
// Request types that usually need a 3D/visual asset made.
export const VISUAL_REQUEST_TYPES = Object.freeze(['obstacle', 'landmark', 'pickup', 'hazard', 'decor', 'skin']);

export const STROKE_LAYERS = Object.freeze(['obstacles', 'landmarks', 'shards', 'hazards', 'notes']);
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
export const PAGE_CELLS = Object.freeze({ min: 120, max: 2400, default: 260 });
export const LIMITS = Object.freeze({
  lanePoints: 2000, strokes: 300, strokePoints: 1500, stamps: 600, spans: 64, requests: 100,
  text: 140, label: 80, notes: 4000,
});

const BASE_LENGTH = polylineLength(WEEKLY_EVENTS[0].track.points, true);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d, a, b) => (finite(v) ? clamp(v, a, b) : d);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '');
const round = (v, k = 5) => Math.round(v * 10 ** k) / 10 ** k;
const pagePoint = (p) => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]);
const cleanPoints = (pts, max) => (Array.isArray(pts) ? pts : []).filter(pagePoint).slice(0, max)
  .map((p) => [round(clamp(p[0], -0.5, 1.5)), round(clamp(p[1], -0.5, 1.5))]);
const idOf = (v, prefix, i) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : `${prefix}${i + 1}`);

export function defaultLayers() {
  return Object.fromEntries(LAYER_ORDER.map((k) => [k, { visible: true, locked: false }]));
}

/** A blank design. */
export function newDoc({ id = 'd-new', aspect = 0.75, cells = PAGE_CELLS.default, skin = DEFAULT_SKIN, difficulty = 'normal' } = {}) {
  return {
    version: DRAFT_VERSION, id, title: '', landmark: '', notes: '', nameIdeas: '',
    difficulty, skin: SKINS.includes(skin) ? skin : DEFAULT_SKIN,
    page: { aspect: num(aspect, 0.75, 0.2, 5), cells: num(cells, PAGE_CELLS.default, PAGE_CELLS.min, PAGE_CELLS.max) },
    lane: { points: [], closed: false, start: 0 },
    width: { base: { easy: 7.6, normal: 7, hard: 6.4 }[difficulty] ?? 7, taper: 24, spans: [] },
    strokes: [], stamps: [], requests: [], layers: defaultLayers(), auto: { hazards: 'auto' },
  };
}

/** Page size in world cells: { w, h }. */
export function pageSize(doc) {
  const a = doc.page.aspect, c = doc.page.cells;
  return a >= 1 ? { w: c, h: c / a } : { w: c * a, h: c };
}
export function toWorld(doc, p) { const s = pageSize(doc); return [p[0] * s.w, p[1] * s.h]; }
export function toPage(doc, p) { const s = pageSize(doc); return [round(p[0] / s.w, 6), round(p[1] / s.h, 6)]; }

/**
 * A v1 sketch ({version:1, points, start, aspect, marks, difficulty, scale?})
 * as a v2 design: the loop becomes the lane, landmark marks become landmark
 * stamps and fast/tight/hazard/calm marks become feel stamps on the lane. The
 * page is sized so the lap keeps the length v1 gave it.
 */
export function fromV1(sketch, { id = 'd-v1' } = {}) {
  if (!sketch || sketch.version !== 1 || !Array.isArray(sketch.points)) throw new TypeError('Not a v1 sketch.');
  const aspect = finite(sketch.aspect) && sketch.aspect > 0 ? sketch.aspect : 1;
  const points = cleanPoints(sketch.points, LIMITS.lanePoints).map((p) => [clamp(p[0], 0, 1), clamp(p[1], 0, 1)]);
  // v1 scaled every loop to the Gantry Drop lap (times `scale`).
  const unit = points.map(([x, y]) => (aspect >= 1 ? [x, y / aspect] : [x * aspect, y]));
  const drawn = polylineLength(unit, true) || 1;
  const cells = clamp(BASE_LENGTH * (finite(sketch.scale) ? sketch.scale : 1) / drawn, PAGE_CELLS.min, PAGE_CELLS.max);
  const difficulty = DIFFICULTIES.includes(sketch.difficulty) ? sketch.difficulty : 'normal';
  const doc = newDoc({ id, aspect, difficulty });
  doc.page.cells = round(cells, 3);
  doc.lane = { points, closed: true, start: Number.isInteger(sketch.start) && sketch.start < points.length ? sketch.start : 0 };
  doc.stamps = (Array.isArray(sketch.marks) ? sketch.marks : []).filter((m) => m && Number.isInteger(m.at) && points[m.at]
    && ['landmark', 'fast', 'tight', 'hazard', 'calm'].includes(m.kind)).map((m, i) => ({
    id: `s${i + 1}`, type: m.kind, x: points[m.at][0], y: points[m.at][1],
    size: STAMP_TYPES[m.kind].size, rotation: 0, behavior: 'static', label: str(m.note, LIMITS.label),
  }));
  doc.fromV1 = true;
  return doc;
}

/**
 * Any stored or posted design to a clean v2 document: v1 sketches are
 * converted, unknown types dropped, numbers clamped and lists bounded. Throws
 * TypeError only for things that are not a design at all.
 */
export function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('A design must be an object.');
  if (raw.version === 1) return fromV1(raw);
  if (raw.version !== DRAFT_VERSION) throw new TypeError('Unknown design version.');
  const page = raw.page || {};
  const doc = newDoc({
    id: idOf(raw.id, 'd-', 0), aspect: page.aspect, cells: page.cells,
    skin: raw.skin, difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'normal',
  });
  doc.title = str(raw.title, 60); doc.landmark = str(raw.landmark, 60);
  doc.notes = str(raw.notes, LIMITS.notes); doc.nameIdeas = str(raw.nameIdeas, 1500);
  const lane = raw.lane || {};
  const points = cleanPoints(lane.points, LIMITS.lanePoints);
  doc.lane = { points, closed: lane.closed === true && points.length >= 3, start: Number.isInteger(lane.start) && lane.start >= 0 && lane.start < points.length ? lane.start : 0 };
  const width = raw.width || {};
  doc.width = {
    base: num(width.base, doc.width.base, GAME.MIN_WIDTH, DESIGN.MAX_WIDTH),
    taper: num(width.taper, 24, 0, 400),
    spans: (Array.isArray(width.spans) ? width.spans : []).filter((s) => s && finite(s.from) && finite(s.len) && finite(s.w) && s.len > 0)
      .slice(-LIMITS.spans).map((s) => ({ from: round(((s.from % 1) + 1) % 1), len: round(clamp(s.len, 0, 1)), w: round(clamp(s.w, GAME.MIN_WIDTH, DESIGN.MAX_WIDTH), 3) })),
  };
  doc.strokes = (Array.isArray(raw.strokes) ? raw.strokes : []).filter((s) => s && STROKE_LAYERS.includes(s.layer)).slice(0, LIMITS.strokes).map((s, i) => {
    const out = { id: idOf(s.id, 'k', i), layer: s.layer, points: cleanPoints(s.points, LIMITS.strokePoints), closed: s.closed === true };
    if (s.layer === 'obstacles') {
      out.type = OBSTACLE_TYPES.includes(s.type) ? s.type : 'mine';
      out.spacing = num(s.spacing, 6, 1, 60); out.size = num(s.size, STAMP_TYPES[out.type].size, 0.3, 12);
      out.behavior = BEHAVIORS[s.behavior] ? s.behavior : 'static';
    } else if (s.layer === 'shards') {
      out.spacing = num(s.spacing, 12, 2, 80);
    } else if (s.layer === 'hazards') {
      out.type = ZONE_TYPES[s.type] ? s.type : 'debris'; out.closed = true;
    }
    const label = str(s.label, LIMITS.label);
    if (label) out.label = label;
    return out;
  }).filter((s) => s.points.length >= 1);
  doc.stamps = (Array.isArray(raw.stamps) ? raw.stamps : []).filter((s) => s && STAMP_TYPES[s.type] && finite(s.x) && finite(s.y)).slice(0, LIMITS.stamps).map((s, i) => {
    const out = {
      id: idOf(s.id, 's', i), type: s.type, x: round(clamp(s.x, -0.5, 1.5)), y: round(clamp(s.y, -0.5, 1.5)),
      size: round(num(s.size, STAMP_TYPES[s.type].size, 0.3, 60), 3), rotation: round(num(s.rotation, 0, -720, 720), 2),
      behavior: BEHAVIORS[s.behavior] ? s.behavior : 'static',
    };
    if (finite(s.period)) out.period = round(clamp(s.period, 0.2, 60), 2);
    const label = str(s.label, LIMITS.label), note = str(s.note, LIMITS.text);
    if (label) out.label = label;
    if (note) out.note = note;
    if (typeof s.requestId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.requestId)) out.requestId = s.requestId;
    if (typeof s.path === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.path)) out.path = s.path;
    return out;
  });
  doc.requests = (Array.isArray(raw.requests) ? raw.requests : []).filter((r) => r && typeof r.id === 'string').slice(0, LIMITS.requests).map((r) => ({
    id: idOf(r.id, 'q', 0), title: str(r.title, 80), type: REQUEST_TYPES.includes(r.type) ? r.type : 'other',
    behavior: REQUEST_BEHAVIORS.includes(r.behavior) ? r.behavior : 'static',
    status: str(r.status, 20) || 'saved', cardRef: str(r.cardRef, 80), queued: r.queued === true,
    ...(typeof r.stampId === 'string' ? { stampId: idOf(r.stampId, 's', 0) } : {}),
  }));
  const layers = raw.layers || {};
  for (const k of LAYER_ORDER) doc.layers[k] = { visible: layers[k]?.visible !== false, locked: layers[k]?.locked === true };
  doc.auto = { hazards: ['auto', 'on', 'off'].includes(raw.auto?.hazards) ? raw.auto.hazards : 'auto' };
  if (raw.fromV1 === true) doc.fromV1 = true;
  return doc;
}

/** Stamps and strokes per layer, for the layer panel. */
export function layerCounts(doc) {
  const counts = Object.fromEntries(LAYER_ORDER.map((k) => [k, 0]));
  counts.lane = doc.lane.points.length ? 1 : 0;
  for (const s of doc.strokes) counts[s.layer]++;
  for (const s of doc.stamps) counts[STAMP_TYPES[s.type].layer]++;
  return counts;
}

/** Layer of a stamp (stamps carry their type's layer). */
export const stampLayer = (stamp) => STAMP_TYPES[stamp.type]?.layer || 'notes';
