// Track Studio v2 canvas renderer. Draws one frame from a plain description of
// what is on the board; it never changes the design. The lane uses the game's
// own skin code (gfx/trackSkin.js): exactly the game's lane for a uniform
// width, and the same deck clipped to the ribbon when the width varies.
import { drawMidnightLane, drawClassicLane, finishChecker, skinCacheStats } from '/projects/Space-Shooter/gfx/trackSkin.js';
import { STAMP_TYPES } from '/projects/Space-Shooter/studio/draftV2.js';
import { SIZES, SHIP_OUTLINE, trueStampSize, scaleBar, shipVisible, SHARD_CLUSTER_MIN_GAP } from '/projects/Space-Shooter/studio/gameSizes.js';

export const PEN = Object.freeze({
  lane: '#f4f7fb', obstacles: '#ff4fa3', landmarks: '#a98bff', shards: '#3df2ff', hazards: '#ff9a3d', notes: '#9aa3ad',
});
const NEON = '#3DF2FF';
const PINK = '#ff4fa3';
const FEEL_LETTER = { fast: 'F', tight: 'T', calm: 'C', hazard: 'H' };
// Everything is drawn at its in-game size on the lane's scale. Things smaller
// than a fingertip on screen get a hollow locator ring (screen pixels) around
// them, never a bigger body.
const LOCATOR_UNDER_PX = 6;
const LOCATOR_PX = 9;
const SHARD_HALF = SIZES.shardHeight.value / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** World cells to screen CSS px. */
export const toScreen = (view, p) => [view.ox + p[0] * view.scale, view.oy + p[1] * view.scale];
export const toWorldPx = (view, q) => [(q[0] - view.ox) / view.scale, (q[1] - view.oy) / view.scale];

function worldTransform(ctx, R) {
  const { dpr, view } = R;
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
}
function screenTransform(ctx, R) { ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); }

function path(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (closed) ctx.closePath();
}

// ------------------------------------------------------------------ page

function drawPage(ctx, R) {
  const { page } = R;
  worldTransform(ctx, R);
  ctx.fillStyle = '#070a0f';
  ctx.fillRect(0, 0, page.w, page.h);
  // Brushed-metal grid: fine every 10 cells, strong every 50.
  const px = 1 / R.view.scale;
  ctx.lineWidth = px;
  for (const [step, color] of [[10, 'rgba(160,182,204,0.06)'], [50, 'rgba(160,182,204,0.13)']]) {
    if (step * R.view.scale < 6) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = 0; x <= page.w + 1e-6; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, page.h); }
    for (let y = 0; y <= page.h + 1e-6; y += step) { ctx.moveTo(0, y); ctx.lineTo(page.w, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(160,182,204,0.35)';
  ctx.lineWidth = 2 * px;
  ctx.strokeRect(0, 0, page.w, page.h);
}

// ------------------------------------------------------------------ lane

// Consecutive samples with the same (quantised) width, for stroking a ribbon.
function ribbonGroups(samples, closed, quantum = 0.2) {
  const groups = [];
  let cur = null;
  const n = samples.length;
  for (let i = 0; i < n + (closed ? 1 : 0); i++) {
    const s = samples[i % n], w = Math.round(s.w / quantum) * quantum;
    if (!cur || Math.abs(cur.w - w) > 1e-9) {
      if (cur) cur.pts.push([s.x, s.y]);
      cur = { w, pts: [[s.x, s.y]] };
      groups.push(cur);
    } else cur.pts.push([s.x, s.y]);
  }
  return groups;
}

function strokeGroups(ctx, groups, extra, color) {
  ctx.strokeStyle = color;
  for (const g of groups) {
    ctx.lineWidth = Math.max(0.05, g.w + extra);
    path(ctx, g.pts, false);
    ctx.stroke();
  }
}

function rails(samples) {
  const left = [], right = [];
  for (const s of samples) {
    const h = s.w / 2;
    left.push([s.x + s.ty * h, s.y - s.tx * h]);
    right.push([s.x - s.ty * h, s.y + s.tx * h]);
  }
  return { left, right };
}

/** A fast ribbon in the skin's colours (live drawing, open lanes, classic variable width). */
function drawRibbon(ctx, samples, closed, skin) {
  if (samples.length < 2) return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const groups = ribbonGroups(samples, closed);
  if (skin === 'midnight') {
    strokeGroups(ctx, groups, 1.2, 'rgba(61,242,255,0.10)');
    strokeGroups(ctx, groups, 0.34, '#5d6873');
    strokeGroups(ctx, groups, 0.13, NEON);
    strokeGroups(ctx, groups, 0, '#2c3239');
  } else {
    strokeGroups(ctx, groups, 0.7, '#142c3b');
    strokeGroups(ctx, groups, 0.16, '#527b88');
    strokeGroups(ctx, groups, 0, '#10202e');
    strokeGroups(ctx, groups, -0.4, '#182c3b');
  }
}

function drawLane(ctx, R) {
  const L = R.lane;
  if (!L || L.samples.length < 2) return;
  worldTransform(ctx, R);
  ctx.save();
  if (L.closed && L.skinTrack && L.uniform) {
    // Exactly the game's lane (same function, same width).
    if (R.skin === 'midnight') drawMidnightLane(ctx, L.skinTrack, 1, { time: R.time, reducedMotion: !R.animate });
    else drawClassicLane(ctx, L.skinTrack, 1);
  } else if (L.closed && L.skinTrack && R.skin === 'midnight') {
    // Variable width: the game's deck, clipped to the ribbon, with neon rails on its edges.
    const { left, right } = rails(L.samples);
    ctx.save();
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    right.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(61,242,255,0.12)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.clip('evenodd');
    drawMidnightLane(ctx, L.skinTrack, 1, { time: R.time, reducedMotion: true });
    ctx.restore();
    ctx.lineJoin = 'round';
    for (const ring of [left, right]) {
      path(ctx, ring, true);
      ctx.strokeStyle = '#12161a'; ctx.lineWidth = 0.3; ctx.stroke();
      ctx.strokeStyle = NEON; ctx.lineWidth = 0.13; ctx.setLineDash([2.6, 0.2]); ctx.stroke(); ctx.setLineDash([]);
    }
  } else {
    drawRibbon(ctx, L.samples, L.closed, R.skin);
  }
  ctx.restore();
  // Direction chevrons and the start/finish checker.
  ctx.save();
  ctx.strokeStyle = 'rgba(232,238,244,0.35)';
  ctx.lineWidth = 0.18;
  ctx.lineCap = 'round';
  const every = Math.max(12, 40 / R.view.scale);
  let next = every / 2;
  for (const s of L.samples) {
    if (s.s < next) continue;
    next += every;
    ctx.beginPath();
    ctx.moveTo(s.x - s.tx * 0.6 - s.ty * 0.7, s.y - s.ty * 0.6 + s.tx * 0.7);
    ctx.lineTo(s.x + s.tx * 0.4, s.y + s.ty * 0.4);
    ctx.lineTo(s.x - s.tx * 0.6 + s.ty * 0.7, s.y - s.ty * 0.6 - s.tx * 0.7);
    ctx.stroke();
  }
  if (L.start) {
    const g = L.start, checker = finishChecker(R.skin), squares = 12, across = g.w / squares;
    ctx.translate(g.x, g.y); ctx.rotate(Math.atan2(g.ty, g.tx));
    for (let i = 0; i < squares; i++) for (let row = 0; row < checker.rows; row++) {
      ctx.fillStyle = (i + row) % 2 ? checker.light : checker.dark;
      const d = Math.max(checker.depth, 0.5);
      ctx.fillRect((row - checker.rows / 2) * d, i * across - g.w / 2, d, across);
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ layers

function drawStroke(ctx, R, st, world, { selected = false } = {}) {
  const color = PEN[st.layer];
  const px = 1 / R.view.scale;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (st.layer === 'hazards') {
    path(ctx, world, true);
    ctx.fillStyle = 'rgba(255,154,61,0.16)';
    ctx.fill();
    ctx.setLineDash([8 * px, 6 * px]);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5 * px; ctx.stroke();
    ctx.setLineDash([]);
  } else if (st.layer === 'obstacles' || st.layer === 'shards') {
    path(ctx, world, false);
    ctx.strokeStyle = st.layer === 'shards' ? 'rgba(61,242,255,0.35)' : 'rgba(255,79,163,0.35)';
    ctx.lineWidth = 2 * px; ctx.setLineDash([4 * px, 6 * px]); ctx.stroke(); ctx.setLineDash([]);
    for (const p of R.rows.get(st.id) || []) {
      if (st.layer === 'shards') { drawShard(ctx, p[0], p[1], SHARD_HALF); locator(ctx, R, p, SHARD_HALF, PEN.shards); }
      else drawStampIcon(ctx, R, { type: st.type || 'mine', size: trueStampSize({ type: st.type || 'mine', size: st.size }, R.gameWidth), rotation: 0, behavior: st.behavior || 'static' }, p, { row: true });
    }
  } else {
    path(ctx, world, st.closed);
    ctx.strokeStyle = color; ctx.lineWidth = (st.layer === 'landmarks' ? 4 : 3) * px; ctx.stroke();
  }
  if (selected) {
    path(ctx, world, st.closed || st.layer === 'hazards');
    ctx.strokeStyle = NEON; ctx.lineWidth = 1.5 * px; ctx.setLineDash([5 * px, 5 * px]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The game's shard diamond (gfx/stardustVfx.js): `r` half its height, 0.56 r half its width. */
function drawShard(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.56, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.56, y); ctx.closePath();
  ctx.fillStyle = NEON; ctx.fill();
  ctx.strokeStyle = 'rgba(2,24,27,0.9)'; ctx.lineWidth = r * 0.15; ctx.stroke();
}

/** A hollow screen-size ring round an item too small to see at this zoom (world transform active). */
function locator(ctx, R, p, r, color) {
  if (r * R.view.scale >= LOCATOR_UNDER_PX) return;
  const px = 1 / R.view.scale;
  ctx.save();
  ctx.beginPath(); ctx.arc(p[0], p[1], LOCATOR_PX * px, 0, Math.PI * 2);
  ctx.globalAlpha = 0.75; ctx.strokeStyle = color; ctx.lineWidth = 1.5 * px; ctx.setLineDash([3 * px, 3 * px]); ctx.stroke();
  ctx.restore();
}

/** The player ship's hull outline at true size, nose along `angle` (world transform active). */
export function drawShip(ctx, x, y, angle, { fill = 'rgba(232,238,244,0.85)', stroke = '#3df2ff', px = 0.05 } = {}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  ctx.save();
  ctx.transform(-s, c, c, s, x, y); // ship-local x = right of the heading, y = forward
  ctx.beginPath();
  SHIP_OUTLINE.forEach(([hx, hy], i) => (i ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy)));
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = px; ctx.stroke();
  ctx.restore();
}

function starPath(ctx, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

const BEHAVIOR_GLYPH = { moving: '↔', rotating: '⟳', falling: '↓', timed: '⏱', triggered: '!' };

/** One stamp at world point p, at its true size in cells (stamp.size is the in-game size). */
export function drawStampIcon(ctx, R, stamp, p, { row = false, selected = false } = {}) {
  const px = 1 / R.view.scale;
  const r = stamp.size / 2;
  locator(ctx, R, p, stamp.type === 'shards' ? Math.max(SHARD_CLUSTER_MIN_GAP, r) : r, PEN[STAMP_TYPES[stamp.type]?.layer] || PINK);
  ctx.save();
  ctx.translate(p[0], p[1]);
  ctx.rotate((stamp.rotation || 0) * Math.PI / 180);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const t = stamp.type;
  const stroke = (color, w = 2) => { ctx.strokeStyle = color; ctx.lineWidth = w * px; ctx.stroke(); };
  // Outlines stay thin next to small bodies so the body edge is the collision edge.
  const line = (color, w) => { ctx.strokeStyle = color; ctx.lineWidth = Math.min(w * px, r * 0.3); ctx.stroke(); };
  if (t === 'mine') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = PINK; ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); }
    line('#5a0a31', 1.5);
    ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.2, r * 0.2, 0, Math.PI * 2); ctx.fillStyle = '#ffd0e6'; ctx.fill();
  } else if (t === 'rock') {
    ctx.beginPath();
    for (let k = 0; k < 9; k++) { const a = (k * 2 * Math.PI) / 9, rr = r * (0.84 + ((k * 7) % 5) * 0.04); k ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = '#6c5f6a'; ctx.fill(); line(PINK, 2);
  } else if (t === 'sentry') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#2a1520'; ctx.fill(); line(PINK, 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.95, 0); line(PINK, 3);
    if (selected) {
      // Its real reach: the sentry fires at slow ships inside this circle.
      ctx.beginPath(); ctx.arc(0, 0, SIZES.sentryRange.value, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,79,163,0.5)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 6 * px]); ctx.stroke(); ctx.setLineDash([]);
    }
  } else if (t === 'barricade') {
    ctx.beginPath(); ctx.rect(-r, -Math.max(0.35, r * 0.18), r * 2, Math.max(0.7, r * 0.36)); ctx.fillStyle = 'rgba(255,79,163,0.35)'; ctx.fill(); stroke(PINK, 2.5);
    ctx.beginPath(); for (let x = -r; x < r; x += Math.max(r / 3, 6 * px)) { ctx.moveTo(x, r * 0.18); ctx.lineTo(x + r * 0.2, -r * 0.18); } stroke(PINK, 1.5);
  } else if (t === 'debris') {
    ctx.beginPath();
    for (const [dx, dy, s] of [[-0.5, -0.3, 0.45], [0.35, -0.5, 0.35], [0.1, 0.35, 0.5]]) { ctx.moveTo((dx - s / 2) * r, (dy + s / 2) * r); ctx.lineTo(dx * r, (dy - s / 2) * r); ctx.lineTo((dx + s / 2) * r, (dy + s / 2) * r); ctx.closePath(); }
    ctx.fillStyle = 'rgba(255,79,163,0.5)'; ctx.fill(); stroke(PINK, 1.5);
  } else if (t === 'gate') {
    // A checkpoint line across the whole lane (the game checks lane width / 2 each side).
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.setLineDash([6 * px, 5 * px]); stroke('#f4f7fb', 2); ctx.setLineDash([]);
    for (const y of [-r, r]) { ctx.beginPath(); ctx.arc(0, y, 0.2, 0, Math.PI * 2); ctx.fillStyle = NEON; ctx.fill(); }
  } else if (t === 'start') {
    // The game's start/finish checker: lane width across, three rows deep.
    const squares = 12, across = (2 * r) / squares, d = SIZES.finishDepth.value / 3;
    for (let i = 0; i < squares; i++) for (let k = 0; k < 3; k++) { ctx.fillStyle = (i + k) % 2 ? '#e8edf1' : '#2a2f35'; ctx.fillRect((k - 1.5) * d, -r + i * across, d, across); }
  } else if (t === 'fuel') {
    // The dock's pickup circle.
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(61,242,255,0.1)'; ctx.fill(); line(NEON, 2);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); line(NEON, 1.5);
  } else if (t === 'shard') {
    drawShard(ctx, 0, 0, r);
    if (SIZES.shardPickup.value * R.view.scale >= 12) {
      // Its real pickup radius round the ship's centre.
      ctx.beginPath(); ctx.arc(0, 0, SIZES.shardPickup.value, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(61,242,255,0.45)'; ctx.lineWidth = px; ctx.setLineDash([3 * px, 3 * px]); ctx.stroke(); ctx.setLineDash([]);
    }
  } else if (t === 'shards') {
    // Three shards along the lap, `gap` apart: what the converter lays.
    const gap = Math.max(SHARD_CLUSTER_MIN_GAP, r);
    for (const dx of [-gap, 0, gap]) drawShard(ctx, dx, 0, SHARD_HALF);
  } else if (t === 'landmark') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(169,139,255,0.14)'; ctx.fill(); ctx.setLineDash([6 * px, 4 * px]); stroke('#a98bff', 2); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 0.45); ctx.lineTo(0, -r * 0.55); ctx.lineTo(r * 0.35, r * 0.45); ctx.closePath(); ctx.fillStyle = '#a98bff'; ctx.fill();
  } else if (t === 'star') {
    starPath(ctx, r); ctx.fillStyle = 'rgba(169,139,255,0.85)'; ctx.fill(); stroke('#e4dcff', 1.5);
  } else if (FEEL_LETTER[t]) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(154,163,173,0.25)'; ctx.fill(); stroke('#c6ced6', 2);
  } else if (t === 'text') {
    ctx.beginPath(); ctx.rect(-r, -r * 0.7, r * 2, r * 1.4); ctx.fillStyle = 'rgba(154,163,173,0.2)'; ctx.fill(); stroke('#c6ced6', 2);
  } else if (t === 'request') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,79,163,0.22)'; ctx.fill(); ctx.setLineDash([5 * px, 4 * px]); stroke(PINK, 2.5); ctx.setLineDash([]);
  }
  ctx.restore();
  // Letters and labels in screen space so they stay readable at any zoom.
  const letter = FEEL_LETTER[t] || (t === 'request' ? '?' : t === 'text' ? '…' : '');
  const glyph = stamp.behavior && stamp.behavior !== 'static' ? BEHAVIOR_GLYPH[stamp.behavior] : '';
  const label = !row ? (stamp.label || (t === 'text' ? stamp.note : '')) : '';
  if (letter || glyph || label || (!row && STAMP_TYPES[t] && STAMP_TYPES[t].game === false && t !== 'text' && t !== 'request')) {
    const q = toScreen(R.view, p), rs = r * R.view.scale;
    ctx.save();
    screenTransform(ctx, R);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (letter) { ctx.font = '800 16px system-ui, sans-serif'; ctx.fillStyle = t === 'request' ? '#ffd0e6' : '#e8eef4'; ctx.fillText(letter, q[0], q[1] + 1); }
    if (glyph) { ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ffd0e6'; ctx.fillText(glyph, q[0] + rs + 8, q[1] - rs - 4); }
    if (label) {
      ctx.font = '600 16px system-ui, sans-serif';
      const text = label.length > 28 ? label.slice(0, 27) + '…' : label, w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(4,6,10,0.78)'; ctx.fillRect(q[0] - w / 2 - 6, q[1] + rs + 4, w + 12, 22);
      ctx.fillStyle = PEN[STAMP_TYPES[t]?.layer] || '#e8eef4'; ctx.fillText(text, q[0], q[1] + rs + 15);
    }
    // Design intent the game cannot do yet: a small violet "intent" tick.
    if (!row && STAMP_TYPES[t] && STAMP_TYPES[t].game === false && t !== 'text' && t !== 'request') {
      ctx.beginPath(); ctx.arc(q[0] - rs - 4, q[1] - rs - 4, 5, 0, Math.PI * 2); ctx.fillStyle = '#a98bff'; ctx.fill();
    }
    ctx.restore();
  }
  if (selected) {
    ctx.save();
    ctx.beginPath(); ctx.arc(p[0], p[1], (t === 'shards' ? Math.max(SHARD_CLUSTER_MIN_GAP, r) + SHARD_HALF : r) + 6 * px, 0, Math.PI * 2);
    ctx.strokeStyle = NEON; ctx.lineWidth = 2 * px; ctx.setLineDash([5 * px, 4 * px]); ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ overlays

function drawMarkers(ctx, R) {
  screenTransform(ctx, R);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 16px system-ui, sans-serif';
  for (const m of R.markers) {
    const q = toScreen(R.view, [m.x, m.y]);
    ctx.beginPath(); ctx.arc(q[0], q[1], 15, 0, Math.PI * 2);
    ctx.fillStyle = m.soft ? 'rgba(255,154,61,0.9)' : 'rgba(255,79,163,0.92)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1a0010'; ctx.stroke();
    ctx.fillStyle = '#1a0010'; ctx.fillText('!', q[0], q[1] + 1);
  }
  ctx.restore();
}

function drawGame(ctx, R) {
  const G = R.game;
  if (!G) return;
  worldTransform(ctx, R);
  const px = 1 / R.view.scale;
  ctx.save();
  ctx.translate(-G.offset[0], -G.offset[1]);
  const pts = G.layout.track.points.map((p) => [p.x, p.y]);
  path(ctx, pts, true);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(61,242,255,0.75)'; ctx.lineWidth = 2 * px; ctx.setLineDash([10 * px, 6 * px]); ctx.stroke(); ctx.setLineDash([]);
  // The checkpoints (every game point after the start).
  for (const c of G.layout.track.checkpoints) {
    const reach = G.layout.track.width / 2;
    ctx.beginPath(); ctx.moveTo(c.x + c.ty * reach, c.y - c.tx * reach); ctx.lineTo(c.x - c.ty * reach, c.y + c.tx * reach);
    ctx.strokeStyle = 'rgba(61,242,255,0.45)'; ctx.lineWidth = 1.5 * px; ctx.stroke();
  }
  for (const m of G.layout.mines) { ctx.beginPath(); ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2); ctx.fillStyle = '#ff5a4e'; ctx.fill(); locator(ctx, R, [m.x, m.y], m.radius, '#ff5a4e'); }
  for (const s of G.layout.shards) { drawShard(ctx, s.x, s.y, SHARD_HALF); locator(ctx, R, [s.x, s.y], SHARD_HALF, NEON); }
  for (const b of G.layout.bouncers) {
    ctx.beginPath(); ctx.moveTo(b.originX - b.nx * b.span, b.originY - b.ny * b.span); ctx.lineTo(b.originX + b.nx * b.span, b.originY + b.ny * b.span);
    ctx.strokeStyle = 'rgba(154,171,183,0.6)'; ctx.lineWidth = 1.5 * px; ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fillStyle = '#9aabb7'; ctx.fill();
  }
  for (const s of G.layout.sentries) { ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.fillStyle = '#ffad72'; ctx.fill(); locator(ctx, R, [s.x, s.y], s.radius, '#ffad72'); }
  for (const s of G.layout.stations) { ctx.beginPath(); ctx.arc(s.x, s.y, SIZES.stationPickup.value, 0, Math.PI * 2); ctx.strokeStyle = '#6ed2e3'; ctx.lineWidth = 2 * px; ctx.stroke(); }
  ctx.restore();
}

function drawSelection(ctx, R) {
  const box = R.selectionBox;
  if (!box) return;
  screenTransform(ctx, R);
  ctx.save();
  ctx.strokeStyle = NEON; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.setLineDash([]);
  if (box.handles) {
    for (const h of box.handles) {
      ctx.beginPath();
      if (h.kind === 'rotate') ctx.arc(h.x, h.y, 14, 0, Math.PI * 2); else ctx.rect(h.x - 13, h.y - 13, 26, 26);
      ctx.fillStyle = 'rgba(4,6,10,0.85)'; ctx.fill(); ctx.strokeStyle = h.kind === 'locked' ? '#9aa3ad' : NEON; ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const h of box.handles) { ctx.fillStyle = h.kind === 'locked' ? '#c6ced6' : NEON; ctx.fillText(h.kind === 'rotate' ? '⟳' : h.kind === 'locked' ? '⊘' : '⤡', h.x, h.y + 1); }
  }
  if (box.sizeLabel) {
    // The size in game units under the box ("0.84 cells across · fixed in game").
    ctx.font = '600 16px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(box.sizeLabel).width, x = clamp(box.x, 6, R.W - w - 18), y = box.y + box.h + 44;
    ctx.fillStyle = 'rgba(4,6,10,0.85)'; ctx.fillRect(x - 6, y - 13, w + 12, 26);
    ctx.fillStyle = box.locked ? '#c6ced6' : NEON; ctx.fillText(box.sizeLabel, x, y + 1);
  }
  ctx.restore();
}

function drawLive(ctx, R) {
  const live = R.live;
  if (!live) return;
  if (live.ribbon && live.ribbon.length > 1) {
    worldTransform(ctx, R);
    ctx.save(); drawRibbon(ctx, live.ribbon, false, R.skin); ctx.restore();
  }
  if (live.points && live.points.length > 1) {
    worldTransform(ctx, R);
    const px = 1 / R.view.scale;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(ctx, live.points, live.closed);
    if (live.fill) { ctx.fillStyle = live.fill; ctx.fill(); }
    ctx.strokeStyle = live.color; ctx.lineWidth = (live.widthPx || 3) * px;
    if (live.dash) ctx.setLineDash([6 * px, 5 * px]);
    ctx.stroke();
    ctx.restore();
  }
  if (live.cursor) {
    screenTransform(ctx, R);
    ctx.save();
    ctx.beginPath(); ctx.arc(live.cursor[0], live.cursor[1], live.cursorR, 0, Math.PI * 2);
    ctx.strokeStyle = live.cursorColor || NEON; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke();
    ctx.restore();
  }
  if (live.band && live.band.length > 1) {
    worldTransform(ctx, R);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(ctx, live.band, false);
    ctx.strokeStyle = 'rgba(61,242,255,0.25)'; ctx.lineWidth = live.bandWidth; ctx.stroke();
    ctx.restore();
  }
}

/** The ship on the start grid, at true size, once it is big enough to see. */
function drawGridShip(ctx, R) {
  const g = R.shipStart;
  if (!g || !shipVisible(R.view.scale)) return;
  worldTransform(ctx, R);
  drawShip(ctx, g.x, g.y, g.angle, { px: 1.2 / R.view.scale });
}

/**
 * The scale bar in the corner: a whole number of lane widths at this zoom
 * ("1 lane width = 7.0 cells"), and the ship at true size beside it once it is
 * big enough to see.
 */
function drawScaleLegend(ctx, R) {
  const L = R.legend;
  if (!L) return;
  const bar = scaleBar(R.view.scale, R.gameWidth);
  const ship = shipVisible(R.view.scale), s = R.view.scale;
  const shipText = ship ? 'Ship' : `Ship ${SIZES.shipLength.value.toFixed(2)} long: zoom in`;
  screenTransform(ctx, R);
  ctx.save();
  ctx.font = '600 16px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const shipW = ship ? SIZES.shipWidth.value * s + 12 : 0;
  const textW = Math.max(ctx.measureText(bar.label).width, ctx.measureText(shipText).width + shipW);
  const hgt = 64 + (ship ? Math.max(0, SIZES.shipLength.value * s - 18) : 0);
  const w = Math.max(bar.px, textW) + 20, x = L.x, y = L.y - hgt;
  ctx.fillStyle = 'rgba(4,6,10,0.72)'; ctx.fillRect(x, y, w, hgt);
  const bx = x + 10, by = y + 12;
  ctx.strokeStyle = '#e8eef4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bar.px, by);
  const ticks = bar.lanes <= 10 ? bar.lanes : 1;
  for (let i = 0; i <= ticks; i++) { const tx = bx + (bar.px * i) / ticks, k = i === 0 || i === ticks ? 6 : 3; ctx.moveTo(tx, by - k); ctx.lineTo(tx, by + k); }
  ctx.stroke();
  ctx.fillStyle = '#e8eef4'; ctx.fillText(bar.label, bx, by + 20);
  const sy = by + 42 + (hgt - 64) / 2;
  ctx.fillStyle = '#9aa7b4'; ctx.fillText(shipText, bx, sy);
  const sx = bx + ctx.measureText(shipText).width + 6 + shipW / 2;
  ctx.restore();
  if (ship) {
    ctx.save();
    ctx.setTransform(R.dpr * s, 0, 0, R.dpr * s, R.dpr * sx, R.dpr * sy);
    drawShip(ctx, 0, 0, -Math.PI / 2, { px: 1.2 / s });
    ctx.restore();
  }
}

/**
 * Draw the board. R: { W, H, dpr, view, page, skin, animate, time, lane, layers,
 * strokes: [{ stroke, world }], stamps: [{ stamp, world, layer, laneAngle }], rows,
 * markers, racing, game, live, selected (Set), selectionBox, gameWidth (the lane
 * width the game flies; sizes that follow the lane use it), shipStart ({ x, y,
 * angle } on the start grid), legend ({ x, y }: bottom-left of the scale bar) }.
 * Returns true when the skin is still painting chunks (draw again next frame).
 */
export function renderBoard(ctx, R) {
  screenTransform(ctx, R);
  ctx.clearRect(0, 0, R.W, R.H);
  drawPage(ctx, R);
  if (R.layers.lane.visible) drawLane(ctx, R);
  worldTransform(ctx, R);
  const order = ['hazards', 'landmarks', 'obstacles', 'shards', 'notes'];
  for (const layer of order) {
    if (!R.layers[layer].visible) continue;
    for (const { stroke, world } of R.strokes) if (stroke.layer === layer) { worldTransform(ctx, R); drawStroke(ctx, R, stroke, world, { selected: R.selected.has(stroke.id) }); }
  }
  if (R.racing && R.racing.length > 2) {
    worldTransform(ctx, R);
    const px = 1 / R.view.scale;
    ctx.save(); path(ctx, R.racing, true);
    ctx.strokeStyle = 'rgba(61,242,255,0.8)'; ctx.lineWidth = 2 * px; ctx.setLineDash([3 * px, 6 * px]); ctx.stroke();
    ctx.restore();
  }
  for (const { stamp, world, layer, laneAngle } of R.stamps) {
    if (!R.layers[layer].visible) continue;
    worldTransform(ctx, R);
    const shown = { ...stamp, size: trueStampSize(stamp, R.gameWidth) };
    // A shard cluster is laid along the lap, whichever way the stamp was turned.
    if (stamp.type === 'shards' && Number.isFinite(laneAngle)) shown.rotation = laneAngle;
    drawStampIcon(ctx, R, shown, world, { selected: R.selected.has(stamp.id) });
  }
  if (R.layers.lane.visible) drawGridShip(ctx, R);
  if (R.game) drawGame(ctx, R);
  drawLive(ctx, R);
  drawMarkers(ctx, R);
  drawSelection(ctx, R);
  drawScaleLegend(ctx, R);
  const stats = R.lane && R.lane.skinTrack && R.skin === 'midnight' ? skinCacheStats() : null;
  return !!stats && stats.chunks < Math.min(stats.laneChunks, stats.maxChunks);
}

/** A small preview of a skin on a sample loop (the skin picker). */
export function drawSkinSample(canvas, track, skin) {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 160, h = canvas.clientHeight || 120;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const b = track.points.reduce((a, p) => ({ minX: Math.min(a.minX, p.x), minY: Math.min(a.minY, p.y), maxX: Math.max(a.maxX, p.x), maxY: Math.max(a.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const pad = track.width + 2, s = Math.min(w / (b.maxX - b.minX + pad * 2), h / (b.maxY - b.minY + pad * 2));
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - ((b.minX + b.maxX) / 2) * s), dpr * (h / 2 - ((b.minY + b.maxY) / 2) * s));
  if (skin === 'midnight') drawMidnightLane(ctx, track, 1, { reducedMotion: true }); else drawClassicLane(ctx, track, 1);
}
