/**
 * Track skins for the racing lane. Visual only: reads the track, never writes it.
 *
 *   midnight (default, weekly lanes): dark brushed gunmetal deck plates, etched
 *     seams, rivets and service hatches, faint rain streaks, and a dashed cyan
 *     neon strip on each rail throwing a soft underglow onto the space around.
 *   classic (?skin=classic, and every non-weekly circuit): the original ribbon.
 *
 * The midnight lane is static per track, so it is painted once per track and
 * zoom bucket into 516 px chunks (512 + a 2 px apron), only for chunks the lane
 * touches, built as the camera reaches them and kept in a small LRU cache. Each
 * frame only blits the visible chunks (plus a slow sheen on capable devices
 * unless reduced motion is on).
 */

export const SKINS = Object.freeze(['midnight', 'classic']);
export const DEFAULT_SKIN = 'midnight';

export const SKIN_CACHE = Object.freeze({
  CHUNK_PX: 512,          // texels per chunk side, apron excluded
  PAD: 2,                 // apron texels on each side (filtering and the overlap)
  MAX_CANVAS_PX: 4096,    // no cache canvas is ever bigger than this on a side
  DENSITIES: [8, 12, 16, 24, 32, 48, 64, 96], // texels per cell: the zoom buckets
  BUILD_MS: 4,            // per-frame budget for painting new chunks
  GLOW: 1.35,             // cells of underglow beyond the rail
});

// low: phones and small-memory devices. high: everything else.
export const SKIN_TIERS = Object.freeze({
  low: Object.freeze({ maxDensity: 64, maxChunks: 28, sheen: false }),
  high: Object.freeze({ maxDensity: 96, maxChunks: 48, sheen: true }),
});

const NEON = '#3DF2FF';

/** ?skin=classic brings back the original lane; anything else is the default. */
export function parseSkin(search) {
  let value = '';
  try { value = (new URLSearchParams(search || '').get('skin') || '').trim().toLowerCase(); } catch { value = ''; }
  return SKINS.includes(value) ? value : DEFAULT_SKIN;
}

function detectTier() {
  const nav = globalThis.navigator;
  const lowMemory = Number.isFinite(nav?.deviceMemory) && nav.deviceMemory <= 4;
  let coarse = false;
  try { coarse = !!globalThis.matchMedia?.('(pointer: coarse)')?.matches; } catch { coarse = false; }
  return lowMemory || coarse ? 'low' : 'high';
}

function defaultCanvas(w, h) {
  if (globalThis.document?.createElement) {
    const c = globalThis.document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof globalThis.OffscreenCanvas === 'function') return new globalThis.OffscreenCanvas(w, h);
  return null;
}

const settings = { skin: parseSkin(globalThis.location?.search || ''), tier: null, createCanvas: defaultCanvas };

/** The active skin name. */
export function trackSkin() { return settings.skin; }

/** Tests and tools: switch skin, device tier or canvas factory. Clears the cache. */
export function configureTrackSkin({ skin, tier, createCanvas } = {}) {
  if (skin !== undefined) settings.skin = SKINS.includes(skin) ? skin : DEFAULT_SKIN;
  if (tier !== undefined) settings.tier = SKIN_TIERS[tier] ? tier : null;
  if (createCanvas !== undefined) { settings.createCanvas = createCanvas || defaultCanvas; brushTexture = null; }
  resetSkinCache();
  return { skin: settings.skin, tier: currentTierName() };
}

function currentTierName() { return settings.tier || (settings.tier = detectTier()); }
function tier() { return SKIN_TIERS[currentTierName()]; }

/** The skin a scene's lane is drawn with: midnight dresses the weekly lanes only. */
export function laneSkin(scene) {
  return scene?.weekly && settings.skin === 'midnight' ? 'midnight' : 'classic';
}

/** The screen backdrop behind the world for a lane skin. */
export function backdropStops(skin) {
  return skin === 'midnight'
    ? [[0, '#03050a'], [0.55, '#05080d'], [1, '#020306']]
    : [[0, '#060f1d'], [0.55, '#0b1825'], [1, '#050a12']];
}

/** Starfield opacity multiplier: a few faint stars around the midnight lane. */
export function starAlpha(skin) { return skin === 'midnight' ? 0.55 : 1; }

/** Start/finish checker: colours, rows along the lane and row depth (cells). */
export function finishChecker(skin) {
  return skin === 'midnight'
    ? { light: '#e8edf1', dark: '#2a2f35', rows: 3, depth: 0.16 }
    : { light: '#81ddd98a', dark: '#0a1b26', rows: 2, depth: 0.13 };
}

// ------------------------------- classic -----------------------------------

function traceLane(ctx, track, unit) {
  ctx.beginPath();
  track.points.forEach((point, i) => i ? ctx.lineTo(point.x * unit, point.y * unit) : ctx.moveTo(point.x * unit, point.y * unit));
  ctx.closePath();
}

/** The original ribbon, rails and direction chevrons. */
export function drawClassicLane(ctx, track, unit) {
  const trace = () => traceLane(ctx, track, unit);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // The visible racing ribbon shares the same round-segment corridor as collisions.
  trace(); ctx.strokeStyle = '#142c3b'; ctx.lineWidth = (track.width + .7) * unit; ctx.stroke();
  ctx.strokeStyle = '#527b88'; ctx.lineWidth = (track.width + .16) * unit; ctx.stroke();
  ctx.setLineDash([.55 * unit, .55 * unit]); ctx.strokeStyle = '#97d7d0'; ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = track.width * unit; ctx.strokeStyle = '#10202e'; ctx.stroke();
  trace(); ctx.strokeStyle = '#182c3b'; ctx.lineWidth = (track.width - .4) * unit; ctx.stroke();
  // A faint broken guide gives speed and direction without covering apex pickups.
  trace(); ctx.lineWidth = .025 * unit; ctx.setLineDash([.22 * unit, .55 * unit]); ctx.strokeStyle = '#6095a13a'; ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < track.points.length; i++) {
    const a = track.points[i], b = track.points[(i + 1) % track.points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    for (let distance = 2; distance < length - 1; distance += 4) {
      const t = distance / length;
      ctx.save(); ctx.translate((a.x + (b.x - a.x) * t) * unit, (a.y + (b.y - a.y) * t) * unit); ctx.rotate(heading);
      ctx.strokeStyle = '#8de5dc48'; ctx.lineWidth = .035 * unit;
      ctx.beginPath(); ctx.moveTo(-.15 * unit, -.16 * unit); ctx.lineTo(.07 * unit, 0); ctx.lineTo(-.15 * unit, .16 * unit); ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}

// ------------------------------- midnight ----------------------------------

// Deterministic per-position noise: every chunk paints the same deck, so chunk edges meet.
function hash(...ints) {
  let h = 0x9e3779b1;
  for (const n of ints) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 0xc2b2ae35) ^ 0x27d4eb2f;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const mix = (a, b, t) => Math.round(a + (b - a) * t);
function plateTone(t) { return `rgb(${mix(0x2a, 0x4a, t)},${mix(0x2f, 0x52, t)},${mix(0x35, 0x5b, t)})`; }

// Plates, seams and fittings for every segment, in the segment's own frame
// (u along the lane, v across), clipped to its share of each corner (the
// bisector with its neighbours). Pure numbers, built once per track.
const plans = new WeakMap();
function deckPlan(track) {
  let plan = plans.get(track);
  if (plan) return plan;
  const segs = track.segments, n = segs.length, w = track.width, R = w / 2 + 0.3;
  plan = segs.map((s, i) => {
    const prev = segs[(i - 1 + n) % n], next = segs[(i + 1) % n];
    // Where the bisector line through a joint crosses v, as an offset along u.
    const cut = (a, b, v) => {
      let mx = a.tx + b.tx, my = a.ty + b.ty;
      const m = Math.hypot(mx, my);
      if (m < 1e-6) return 0;
      mx /= m; my /= m;
      const mu = mx * s.tx + my * s.ty, mv = mx * -s.ty + my * s.tx;
      const off = -v * mv / Math.max(0.05, mu);
      return Math.max(-s.length * 0.45, Math.min(s.length * 0.45, off));
    };
    const poly = [
      [cut(prev, s, -R), -R], [s.length + cut(s, next, -R), -R],
      [s.length + cut(s, next, R), R], [cut(prev, s, R), R],
    ];
    const uLo = Math.min(poly[0][0], poly[3][0]), uHi = Math.max(poly[1][0], poly[2][0]);
    const cos = s.tx, sin = s.ty;
    const world = poly.map(([u, v]) => [s.x + u * cos - v * sin, s.y + u * sin + v * cos]);
    const xs = world.map((p) => p[0]), ys = world.map((p) => p[1]);
    const bbox = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    const edges = [-R, -w / 6 + (hash(i, 1) - 0.5) * 0.7, w / 6 + (hash(i, 2) - 0.5) * 0.7, R];
    const plates = [];
    for (let row = 0; row < 3; row++) {
      let u = uLo - hash(i, row, 3) * 3, k = 0;
      while (u < uHi) {
        const len = 2.4 + hash(i, row, k, 4) * 3.6;
        plates.push({
          u0: u, v0: edges[row], u1: u + len, v1: edges[row + 1],
          tone: 0.12 + hash(i, row, k, 5) * 0.55,
          rivets: hash(i, row, k, 6) > 0.3,
          hatch: hash(i, row, k, 7) > 0.62 && len > 3 ? { at: 0.2 + hash(i, row, k, 8) * 0.45, long: hash(i, row, k, 9) > 0.5 } : null,
          tex: [hash(i, row, k, 10) * 200, hash(i, row, k, 11) * 100],
        });
        u += len; k++;
      }
    }
    const bands = [];
    for (let u = uLo + hash(i, 12) * 10; u < uHi; u += 11 + hash(i, u | 0, 13) * 9) bands.push({ u, a: 0.04 + hash(i, u | 0, 14) * 0.05 });
    return { x: s.x, y: s.y, angle: Math.atan2(sin, cos), poly, R, uLo, uHi, bbox, plates, bands };
  });
  plans.set(track, plan);
  return plan;
}

// Fine horizontal brushing, one small texture shared by every chunk.
const BRUSH_TEXELS = 48; // brush texels per cell
let brushTexture = null;
function brush() {
  if (brushTexture) return brushTexture;
  const c = settings.createCanvas(256, 128);
  if (!c) return null;
  const g = c.getContext('2d');
  for (let i = 0; i < 520; i++) {
    const light = hash(i, 21) > 0.45;
    g.fillStyle = light ? `rgba(220,232,245,${0.03 + hash(i, 22) * 0.07})` : `rgba(0,0,0,${0.05 + hash(i, 23) * 0.1})`;
    const x = hash(i, 24) * 256, y = Math.floor(hash(i, 25) * 128), len = 20 + hash(i, 26) * 180;
    g.fillRect(x, y, len, 1);
    if (x + len > 256) g.fillRect(x - 256, y, len, 1); // wrap so the pattern tiles
  }
  return (brushTexture = c);
}

function paintSegment(g, seg, pattern) {
  g.save();
  g.translate(seg.x, seg.y); g.rotate(seg.angle);
  g.beginPath(); seg.poly.forEach(([u, v], j) => j ? g.lineTo(u, v) : g.moveTo(u, v)); g.closePath();
  g.clip();
  for (const p of seg.plates) {
    const du = p.u1 - p.u0, dv = p.v1 - p.v0;
    g.fillStyle = plateTone(p.tone); g.fillRect(p.u0, p.v0, du, dv);
    if (pattern) {
      g.save(); g.translate(p.u0, p.v0); g.scale(1 / BRUSH_TEXELS, 1 / BRUSH_TEXELS); g.translate(-p.tex[0], -p.tex[1]);
      g.fillStyle = pattern; g.fillRect(p.tex[0], p.tex[1], du * BRUSH_TEXELS, dv * BRUSH_TEXELS);
      g.restore();
    }
  }
  // Diagonal specular sheen across the plates.
  for (const b of seg.bands) {
    const grad = g.createLinearGradient(b.u - 3, -seg.R, b.u + 3, seg.R);
    grad.addColorStop(0, 'rgba(215,228,240,0)');
    grad.addColorStop(0.5, `rgba(215,228,240,${b.a})`);
    grad.addColorStop(1, 'rgba(215,228,240,0)');
    g.fillStyle = grad; g.fillRect(b.u - seg.R - 4, -seg.R, seg.R * 2 + 8, seg.R * 2);
  }
  // Etched seams: a dark groove with a faint lit lip below it.
  g.lineWidth = 0.045; g.strokeStyle = '#13171b';
  g.beginPath();
  for (const p of seg.plates) g.rect(p.u0, p.v0, p.u1 - p.u0, p.v1 - p.v0);
  g.moveTo(seg.poly[0][0], seg.poly[0][1]); g.lineTo(seg.poly[3][0], seg.poly[3][1]); // the corner seam
  g.stroke();
  g.lineWidth = 0.02; g.strokeStyle = 'rgba(170,186,200,.16)';
  g.beginPath();
  for (const p of seg.plates) g.rect(p.u0 + 0.035, p.v0 + 0.035, p.u1 - p.u0, p.v1 - p.v0);
  g.stroke();
  // Service hatches: recessed slots with a lit lower edge.
  for (const p of seg.plates) {
    if (!p.hatch) continue;
    const hw = p.hatch.long ? 1.5 : 0.9, hh = p.hatch.long ? 0.34 : 0.6;
    const hx = p.u0 + (p.u1 - p.u0 - hw) * p.hatch.at, hy = (p.v0 + p.v1) / 2 - hh / 2;
    g.fillStyle = '#1b2025'; g.fillRect(hx, hy, hw, hh);
    g.strokeStyle = '#101317'; g.lineWidth = 0.035; g.strokeRect(hx, hy, hw, hh);
    g.strokeStyle = 'rgba(190,204,216,.2)'; g.lineWidth = 0.02;
    g.beginPath(); g.moveTo(hx, hy + hh + 0.02); g.lineTo(hx + hw, hy + hh + 0.02); g.lineTo(hx + hw + 0.02, hy); g.stroke();
    g.fillStyle = '#0d1013'; g.fillRect(hx + 0.12, hy + hh / 2 - 0.035, hw - 0.24, 0.07);
  }
  // Rivets at plate corners.
  g.fillStyle = '#15191e';
  g.beginPath();
  for (const p of seg.plates) {
    if (!p.rivets) continue;
    for (const [x, y] of [[p.u0 + 0.18, p.v0 + 0.18], [p.u1 - 0.18, p.v0 + 0.18], [p.u0 + 0.18, p.v1 - 0.18], [p.u1 - 0.18, p.v1 - 0.18]]) { g.moveTo(x + 0.05, y); g.arc(x, y, 0.05, 0, Math.PI * 2); }
  }
  g.fill();
  g.fillStyle = 'rgba(200,212,224,.3)';
  g.beginPath();
  for (const p of seg.plates) {
    if (!p.rivets) continue;
    for (const [x, y] of [[p.u0 + 0.17, p.v0 + 0.17], [p.u1 - 0.19, p.v0 + 0.17], [p.u0 + 0.17, p.v1 - 0.19], [p.u1 - 0.19, p.v1 - 0.19]]) { g.moveTo(x + 0.022, y); g.arc(x, y, 0.022, 0, Math.PI * 2); }
  }
  g.fill();
  g.restore();
}

// Wet midnight: faint short diagonal streaks, fixed in the world.
const RAIN = { dx: Math.cos(1.2), dy: Math.sin(1.2) };
function paintRain(g, x0, y0, x1, y1) {
  g.lineWidth = 0.018; g.lineCap = 'round';
  for (const [alpha, bucket] of [[0.07, 0], [0.11, 1], [0.16, 2]]) {
    g.strokeStyle = `rgba(205,225,240,${alpha})`;
    g.beginPath();
    for (let gy = Math.floor(y0) - 1; gy <= y1; gy++) for (let gx = Math.floor(x0) - 1; gx <= x1; gx++) {
      for (let k = 0; k < 2; k++) {
        const h = hash(gx, gy, k, 31);
        if (h > 0.55 || Math.floor(hash(gx, gy, k, 32) * 3) !== bucket) continue;
        const x = gx + hash(gx, gy, k, 33), y = gy + hash(gx, gy, k, 34), len = 0.16 + hash(gx, gy, k, 35) * 0.3;
        g.moveTo(x, y); g.lineTo(x + RAIN.dx * len, y + RAIN.dy * len);
      }
    }
    g.stroke();
  }
}

function strokeLane(g, track, width, color, dash = null) {
  g.lineWidth = width; g.strokeStyle = color;
  g.setLineDash(dash || []);
  traceLane(g, track, 1);
  g.stroke();
}

/** Paint one chunk: deck clipped to the lane, then neon, rim and glow behind it. */
function buildChunk(track, cx, cy, density, chunkWorld) {
  const { CHUNK_PX, PAD } = SKIN_CACHE;
  const size = CHUNK_PX + PAD * 2;
  const canvas = settings.createCanvas(size, size);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const x0 = cx * chunkWorld, y0 = cy * chunkWorld;
  const apron = PAD / density;
  const rx0 = x0 - apron, ry0 = y0 - apron, rx1 = x0 + chunkWorld + apron, ry1 = y0 + chunkWorld + apron;
  g.setTransform(density, 0, 0, density, PAD - x0 * density, PAD - y0 * density);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const w = track.width;
  // The deck.
  g.fillStyle = '#30363d'; g.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
  const tex = brush();
  const pattern = tex ? g.createPattern(tex, 'repeat') : null;
  for (const seg of deckPlan(track)) {
    const b = seg.bbox;
    if (b.maxX < rx0 || b.minX > rx1 || b.maxY < ry0 || b.minY > ry1) continue;
    paintSegment(g, seg, pattern);
  }
  paintRain(g, rx0, ry0, rx1, ry1);
  // Keep only the lane.
  g.globalCompositeOperation = 'destination-in';
  strokeLane(g, track, w, '#000');
  // Behind the deck, top layer first: the neon strip, its recess, the metal lip, the glow.
  g.globalCompositeOperation = 'destination-over';
  const dash = [2.6, 0.2];
  strokeLane(g, track, w + 0.07, '#dcfeff', dash);
  strokeLane(g, track, w + 0.13, NEON, dash);
  strokeLane(g, track, w + 0.2, '#0a0d10');
  strokeLane(g, track, w + 0.34, '#5d6873');
  strokeLane(g, track, w + 0.42, '#12161a');
  // Underglow: thin steps that add up to a smooth falloff away from the rail.
  strokeLane(g, track, w + 0.62, 'rgba(61,242,255,.16)');
  for (let i = 1; i <= 8; i++) strokeLane(g, track, w + 0.62 + (SKIN_CACHE.GLOW * 2 - 0.62) * i / 8, 'rgba(61,242,255,.04)');
  g.globalCompositeOperation = 'source-over';
  g.setLineDash([]);
  return canvas;
}

function segmentDistance(s, x, y) {
  const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (y - s.y) * s.dy) / (s.length ** 2)));
  return Math.hypot(x - (s.x + s.dx * t), y - (s.y + s.dy * t));
}

/** Every chunk the lane or its glow touches at this chunk size. */
function laneChunkKeys(track, chunkWorld) {
  const keys = new Set();
  const reach = track.width / 2 + SKIN_CACHE.GLOW + 0.1;
  const halfDiag = chunkWorld * Math.SQRT1_2;
  for (const s of track.segments) {
    const minX = Math.min(s.x, s.x + s.dx) - reach, maxX = Math.max(s.x, s.x + s.dx) + reach;
    const minY = Math.min(s.y, s.y + s.dy) - reach, maxY = Math.max(s.y, s.y + s.dy) + reach;
    for (let cy = Math.floor(minY / chunkWorld); cy <= Math.floor(maxY / chunkWorld); cy++) {
      for (let cx = Math.floor(minX / chunkWorld); cx <= Math.floor(maxX / chunkWorld); cx++) {
        const mx = (cx + 0.5) * chunkWorld, my = (cy + 0.5) * chunkWorld;
        if (segmentDistance(s, mx, my) <= reach + halfDiag) keys.add(`${cx},${cy}`);
      }
    }
  }
  return keys;
}

const cache = { track: null, density: 0, chunkWorld: 0, lane: null, chunks: new Map(), built: 0, evicted: 0 };

function dropChunk(canvas) { if (canvas) { canvas.width = 0; canvas.height = 0; } }

/** Free every cached chunk (track change, settings change, tests). */
export function resetSkinCache() {
  for (const c of cache.chunks.values()) dropChunk(c);
  cache.chunks.clear();
  cache.track = null; cache.density = 0; cache.chunkWorld = 0; cache.lane = null;
  cache.built = 0; cache.evicted = 0;
}

/** Cache numbers for tests and the report. */
export function skinCacheStats() {
  const { CHUNK_PX, PAD } = SKIN_CACHE;
  const side = CHUNK_PX + PAD * 2;
  return {
    chunks: cache.chunks.size,
    maxChunks: tier().maxChunks,
    density: cache.density,
    chunkPx: side,
    bytes: cache.chunks.size * side * side * 4,
    maxBytes: tier().maxChunks * side * side * 4,
    laneChunks: cache.lane?.size || 0,
    built: cache.built,
    evicted: cache.evicted,
  };
}

/** The zoom bucket for `needed` texels per cell, held while it stays close enough. */
export function pickDensity(needed, current, maxDensity) {
  const want = Math.min(needed, maxDensity);
  if (current && current <= maxDensity && current >= want * 0.75 && current <= Math.max(want * 2, SKIN_CACHE.DENSITIES[0])) return current;
  return SKIN_CACHE.DENSITIES.find((d) => d >= want && d <= maxDensity) ?? maxDensity;
}

function ensureBucket(track, needed) {
  const density = pickDensity(needed, cache.track === track ? cache.density : 0, tier().maxDensity);
  if (cache.track === track && cache.density === density) return;
  resetSkinCache();
  cache.track = track; cache.density = density;
  cache.chunkWorld = SKIN_CACHE.CHUNK_PX / density;
  cache.lane = laneChunkKeys(track, cache.chunkWorld);
}

// The world rectangle (cells) the canvas shows through the current transform.
function visibleCells(m, W, H, unit) {
  const det = m.a * m.d - m.b * m.c;
  if (!det) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [X, Y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const x = (m.d * (X - m.e) - m.c * (Y - m.f)) / det / unit;
    const y = (-m.b * (X - m.e) + m.a * (Y - m.f)) / det / unit;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

const now = () => globalThis.performance?.now?.() ?? Date.now();

// While chunks are still being painted: a plain deck with its neon, one stroke each.
function drawPlainLane(ctx, track, unit) {
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  traceLane(ctx, track, unit);
  ctx.strokeStyle = NEON; ctx.lineWidth = (track.width + 0.13) * unit; ctx.stroke();
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = track.width * unit; ctx.stroke();
  ctx.restore();
}

/**
 * Draw the midnight lane into a context already in world space (pixels =
 * cells × unit). Builds missing chunks within a small time budget per frame.
 */
export function drawMidnightLane(ctx, track, unit, { time = 0, reducedMotion = false } = {}) {
  if (!track?.points?.length || !(unit > 0)) return;
  const m = ctx.getTransform?.();
  const W = ctx.canvas?.width, H = ctx.canvas?.height;
  const scale = m ? Math.hypot(m.a, m.b) : 1;
  const view = m && W && H ? visibleCells(m, W, H, unit) : null;
  if (!view) { drawPlainLane(ctx, track, unit); return; }
  ensureBucket(track, unit * scale);
  const { chunkWorld, lane, chunks, density } = cache;
  const fresh = chunks.size === 0;
  const start = now();
  const { PAD, CHUNK_PX } = SKIN_CACHE;
  const half = 0.5 / density; // half a texel of overlap hides seams between chunks
  const srcPad = PAD - 0.5, srcSize = CHUNK_PX + 1;
  let missing = false;
  const draws = [];
  const cx0 = Math.floor(view.minX / chunkWorld), cx1 = Math.floor(view.maxX / chunkWorld);
  const cy0 = Math.floor(view.minY / chunkWorld), cy1 = Math.floor(view.maxY / chunkWorld);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const key = `${cx},${cy}`;
    if (!lane.has(key)) continue;
    let canvas = chunks.get(key);
    if (canvas) { chunks.delete(key); chunks.set(key, canvas); }
    else if (fresh || draws.length === 0 || now() - start < SKIN_CACHE.BUILD_MS) {
      canvas = buildChunk(track, cx, cy, density, chunkWorld);
      if (!canvas) { missing = true; continue; }
      chunks.set(key, canvas); cache.built++;
    } else { missing = true; continue; }
    draws.push([canvas, cx, cy]);
  }
  if (missing) drawPlainLane(ctx, track, unit);
  for (const [canvas, cx, cy] of draws) {
    ctx.drawImage(canvas, srcPad, srcPad, srcSize, srcSize,
      (cx * chunkWorld - half) * unit, (cy * chunkWorld - half) * unit, (chunkWorld + half * 2) * unit, (chunkWorld + half * 2) * unit);
  }
  // Paint ahead: the ring just outside the view, while the budget lasts.
  if (!missing && now() - start < SKIN_CACHE.BUILD_MS && chunks.size < tier().maxChunks) {
    ahead: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      if (cy > cy0 - 1 && cy < cy1 + 1 && cx > cx0 - 1 && cx < cx1 + 1) continue;
      const key = `${cx},${cy}`;
      if (!lane.has(key) || chunks.has(key)) continue;
      const canvas = buildChunk(track, cx, cy, density, chunkWorld);
      if (canvas) { chunks.set(key, canvas); cache.built++; }
      break ahead; // one per frame
    }
  }
  // Least recently drawn chunks go first.
  const max = tier().maxChunks;
  for (const [key, canvas] of chunks) {
    if (chunks.size <= max) break;
    chunks.delete(key); dropChunk(canvas); cache.evicted++;
  }
  if (tier().sheen && !reducedMotion) drawSheen(ctx, track, unit, view, time);
}

// A slow wet shimmer sliding across the deck: one gradient stroke per frame.
function drawSheen(ctx, track, unit, view, time) {
  const cx = (view.minX + view.maxX) / 2, cy = (view.minY + view.maxY) / 2;
  const span = Math.max(view.maxX - view.minX, view.maxY - view.minY);
  const d = { x: Math.cos(0.7), y: Math.sin(0.7) };
  const shift = ((time * 0.35) % 1 + 1) % 1;
  const g = ctx.createLinearGradient((cx - d.x * span) * unit, (cy - d.y * span) * unit, (cx + d.x * span) * unit, (cy + d.y * span) * unit);
  const bands = 4;
  for (let i = 0; i <= bands; i++) {
    const at = (i + shift) / (bands + 1);
    g.addColorStop(Math.max(0, at - 0.06), 'rgba(200,225,245,0)');
    g.addColorStop(at, 'rgba(200,225,245,.045)');
    g.addColorStop(Math.min(1, at + 0.06), 'rgba(200,225,245,0)');
  }
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  traceLane(ctx, track, unit);
  ctx.strokeStyle = g; ctx.lineWidth = track.width * unit; ctx.stroke();
  ctx.restore();
}
