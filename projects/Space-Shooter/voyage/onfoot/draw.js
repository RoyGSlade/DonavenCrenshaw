// Drawing for the on-foot layers. Cheap on purpose (bench: phones were
// pixel-bound): the floor, walls and still props of a map are drawn once into
// an offscreen layer, and each frame blits it, then draws the few moving
// bodies. Missing art draws a placeholder in the approved palette (gunmetal,
// cyan lights, amber for hostiles).
import { wallPiece } from './rules/walls.js';
import { sprite, groundImage, tileImage, castImage, roomArt, interiorProp, CAST_LOOK } from './assets.js';

const TAU = Math.PI * 2;

// ---- placeholders ----------------------------------------------------------
const TILE_LOOK = {
  floor: { base: '#152332', line: '#1d3042' }, deck: { base: '#152332', line: '#1d3042' },
  'deck-dark': { base: '#0f1822', line: '#172434' }, 'deck-warm': { base: '#2a2020', line: '#382a28' },
  grate: { base: '#101b26', line: '#24394b', grate: true }, hazard: { base: '#1a1a14', stripes: '#a3713f' },
  rug: { base: '#3a1f33', line: '#542a46' }, pad: { base: '#13222f', line: '#2c6c74' },
  wall: { base: '#2b3a48', top: '#4b6175', edge: '#0b1219', solid: true }, window: { base: '#2b3a48', top: '#4b6175', edge: '#0b1219', glass: true, solid: true },
  void: { base: '#05080d' }, rock: { base: '#2a2c30', top: '#44474d', edge: '#111214', solid: true },
};

// Prop placeholders: a fill, an accent and a simple shape.
const PROP_LOOK = {
  console: ['#1d3446', '#81e6df', 'console'], terminal: ['#1d3446', '#81e6df', 'console'], comms: ['#1d3446', '#b9a4ff', 'console'],
  'job-board': ['#20303f', '#ffad72', 'board'], 'ledger-desk': ['#2a3542', '#f4d35e', 'console'], 'power-panel': ['#23303c', '#f4d35e', 'console'],
  crate: ['#3b3226', '#a3713f', 'box'], 'crate-stack': ['#3b3226', '#a3713f', 'box'], barrel: ['#2d3b46', '#ffad72', 'round'],
  'tool-rack': ['#2b3640', '#8fa6b7', 'rack'], shelf: ['#2b3640', '#8fa6b7', 'rack'], bunk: ['#25303b', '#5b7f9a', 'bunk'],
  locker: ['#2e3d4b', '#81e6df', 'locker'], plant: ['#1f3a2a', '#9fe870', 'plant'], vending: ['#28324a', '#ff8fa3', 'console'],
  workbench: ['#3a3328', '#ffad72', 'bench'], pipe: ['#34414d', '#5b7f9a', 'pipe'], table: ['#33302c', '#8f7b62', 'table'],
  stool: ['#3a3633', '#8f7b62', 'round'], bar: ['#3a2c22', '#ffad72', 'bench'], couch: ['#3b2740', '#c8a2ff', 'couch'],
  desk: ['#2e2a26', '#8f7b62', 'table'], 'engine-core': ['#26313c', '#81e6df', 'engine'], 'engine-stand': ['#2c343c', '#ffad72', 'engine'],
  safe: ['#2b3138', '#f4d35e', 'box'], 'holo-table': ['#14303a', '#81e6df', 'holo'], jukebox: ['#3a2440', '#ff8fa3', 'console'],
  'scrap-pile': ['#3a3530', '#a3713f', 'pile'], 'armor-stand': ['#2c3742', '#ff8fa3', 'holo'], mirror: ['#3a5566', '#cfe8f0', 'rack'],
  curtain: ['#4a2033', '#ff8fa3', 'rack'], counter: ['#3a2c22', '#b9a4ff', 'bench'], 'tea-machine': ['#2d3a2f', '#9fe870', 'console'],
  'pilot-seat': ['#26323e', '#81e6df', 'round'], 'hull-panel': ['#2d3946', '#f4d35e', 'console'], 'dog-bed': ['#4a3a2a', '#f4d35e', 'round'],
  'hatch-console': ['#2a2f3a', '#ffad72', 'console'], lockbox: ['#3a3226', '#f4d35e', 'box'],
  'ore-slab': ['#3a3f47', '#ffad72', 'ore'], 'ore-vein': ['#3a3f47', '#ffad72', 'ore'], 'range-mat': ['#162a33', '#ffad72', 'mat'],
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawPropPlaceholder(ctx, p) {
  const [fill, accent, shape] = PROP_LOOK[p.art] || ['#2b3a48', '#81e6df', 'box'];
  const { x, y, w, h } = p;
  const m = Math.min(w, h);
  ctx.save();
  if (shape === 'mat') {
    ctx.strokeStyle = accent + '88'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(x + 3, y + 3, w - 6, h - 6); ctx.setLineDash([]);
    ctx.fillStyle = accent + '14'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.restore(); return;
  }
  // Shadow, body, top highlight.
  ctx.fillStyle = '#0006'; rr(ctx, x + 3, y + 5, w - 2, h - 2, m * 0.18); ctx.fill();
  if (shape === 'round' || shape === 'plant' || shape === 'pile' || shape === 'ore') {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, TAU); ctx.fill();
    if (shape === 'plant') {
      ctx.fillStyle = accent + 'aa';
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.ellipse(x + w / 2 + Math.cos(a) * m * 0.2, y + h / 2 + Math.sin(a) * m * 0.2, m * 0.2, m * 0.1, a, 0, TAU); ctx.fill(); }
    } else if (shape === 'ore' || shape === 'pile') {
      ctx.fillStyle = accent;
      for (let i = 0; i < 5; i++) { const a = i * 2.3; ctx.beginPath(); ctx.arc(x + w / 2 + Math.cos(a) * m * 0.22, y + h / 2 + Math.sin(a) * m * 0.2, m * 0.06, 0, TAU); ctx.fill(); }
    } else { ctx.strokeStyle = accent + '99'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, m * 0.3, 0, TAU); ctx.stroke(); }
    ctx.restore(); return;
  }
  ctx.fillStyle = fill; rr(ctx, x + 1, y + 1, w - 2, h - 2, m * 0.12); ctx.fill();
  ctx.fillStyle = '#ffffff12'; ctx.fillRect(x + 3, y + 2, w - 6, Math.max(2, h * 0.12));
  ctx.fillStyle = accent;
  if (shape === 'console') { ctx.globalAlpha = 0.85; ctx.fillRect(x + w * 0.2, y + h * 0.25, w * 0.6, h * 0.3); ctx.globalAlpha = 1; ctx.fillStyle = accent + '55'; ctx.fillRect(x + w * 0.2, y + h * 0.65, w * 0.6, h * 0.08); }
  else if (shape === 'board') { ctx.globalAlpha = 0.8; for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.12 + i * 0.29), y + h * 0.25, w * 0.2, h * 0.45); ctx.globalAlpha = 1; }
  else if (shape === 'box') { ctx.strokeStyle = accent + '88'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 5, w - 10, h - 10); ctx.beginPath(); ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + w - 5, y + h - 5); ctx.stroke(); }
  else if (shape === 'rack') { for (let i = 1; i < 5; i++) ctx.fillRect(x + (w * i) / 5 - 1, y + h * 0.2, 2, h * 0.6); }
  else if (shape === 'bunk') { ctx.fillStyle = '#3d5568'; rr(ctx, x + 4, y + 4, w - 8, h * 0.3, 4); ctx.fill(); ctx.fillStyle = accent + '44'; ctx.fillRect(x + 4, y + h * 0.4, w - 8, h * 0.5); }
  else if (shape === 'locker') { ctx.fillRect(x + w / 2 - 1, y + 4, 2, h - 8); ctx.fillRect(x + w * 0.3, y + h * 0.45, 3, 6); ctx.fillRect(x + w * 0.65, y + h * 0.45, 3, 6); }
  else if (shape === 'bench' || shape === 'table') { ctx.fillStyle = accent + '66'; ctx.fillRect(x + 4, y + h * 0.4, w - 8, 3); if (shape === 'bench') { ctx.fillStyle = accent; ctx.fillRect(x + w * 0.15, y + h * 0.2, w * 0.1, h * 0.15); ctx.fillRect(x + w * 0.6, y + h * 0.25, w * 0.15, h * 0.12); } }
  else if (shape === 'pipe') { ctx.fillStyle = accent + '88'; const vertical = h > w; for (let i = 1; i < 4; i++) vertical ? ctx.fillRect(x, y + (h * i) / 4, w, 2) : ctx.fillRect(x + (w * i) / 4, y, 2, h); }
  else if (shape === 'couch') { ctx.fillStyle = accent + '55'; rr(ctx, x + 4, y + 4, w - 8, h * 0.35, 5); ctx.fill(); }
  else if (shape === 'engine' || shape === 'holo') { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.28, h * 0.28, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
}

function drawTile(ctx, id, x, y, T, row, col, faceBelow = true, overlay = false) {
  const img = tileImage(id);
  if (img) { ctx.drawImage(img, x, y, T, T); return; }
  const look = TILE_LOOK[id] || TILE_LOOK.floor;
  if (overlay && !look.solid) {
    // Markings over a painted floor (ground texture or room floor art): translucent, so the art shows through.
    if (id === 'pad') { ctx.fillStyle = '#0b1a2455'; ctx.fillRect(x, y, T, T); ctx.strokeStyle = '#81e6df44'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2); }
    else if (id === 'grate') { ctx.fillStyle = '#05090e55'; ctx.fillRect(x, y, T, T); ctx.fillStyle = '#0a121a99'; for (let i = 6; i < T; i += 8) ctx.fillRect(x + 4, y + i, T - 8, 2); }
    else if (id === 'rug') { ctx.fillStyle = '#5a2a4640'; ctx.fillRect(x, y, T, T); }
    else if (id === 'hazard') { ctx.save(); ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip(); ctx.fillStyle = look.stripes; for (let i = -T; i < T; i += 16) { ctx.beginPath(); ctx.moveTo(x + i, y + T); ctx.lineTo(x + i + 8, y + T); ctx.lineTo(x + i + T + 8, y); ctx.lineTo(x + i + T, y); ctx.fill(); } ctx.restore(); }
    return;
  }
  ctx.fillStyle = look.base; ctx.fillRect(x, y, T, T);
  if (look.solid) {
    // Straight down: a wall shows its top; only the row facing open floor shows a front edge.
    const face = faceBelow ? 0.28 : 0;
    ctx.fillStyle = look.top; ctx.fillRect(x, y, T, T * (1 - face));
    if (face) { ctx.fillStyle = look.edge; ctx.fillRect(x, y + T * (1 - face), T, T * face); }
    ctx.fillStyle = '#ffffff10'; ctx.fillRect(x, y, T, 2);
    if (look.glass) { ctx.fillStyle = '#0b2a3a'; ctx.fillRect(x + 3, y + T * 0.18, T - 6, T * 0.36); ctx.fillStyle = '#81e6df33'; ctx.fillRect(x + 3, y + T * 0.18, T - 6, 2); if ((row * 7 + col * 13) % 5 === 0) { ctx.fillStyle = '#eaf4f5'; ctx.fillRect(x + T * 0.6, y + T * 0.3, 1.5, 1.5); } }
    return;
  }
  if (look.stripes) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
    ctx.fillStyle = look.stripes;
    for (let i = -T; i < T; i += 16) { ctx.beginPath(); ctx.moveTo(x + i, y + T); ctx.lineTo(x + i + 8, y + T); ctx.lineTo(x + i + T + 8, y); ctx.lineTo(x + i + T, y); ctx.fill(); }
    ctx.restore(); return;
  }
  if (look.line) { ctx.strokeStyle = look.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1); }
  if (look.grate) { ctx.fillStyle = look.line; for (let i = 6; i < T; i += 8) ctx.fillRect(x + 4, y + i, T - 8, 2); }
  else if (id === 'deck' || id === 'floor' || id === 'deck-dark' || id === 'deck-warm') { ctx.fillStyle = look.line; ctx.fillRect(x + 4, y + 4, 2, 2); ctx.fillRect(x + T - 6, y + T - 6, 2, 2); }
}

// ---- the static layer ---------------------------------------------------------
/** Draws a map's floor, walls and still props at `scale` into an offscreen canvas. extraArt(p) may draw special props. */
export function buildStaticLayer(map, scale, { extraArt = null, isLocked = () => false } = {}) {
  const maxSide = 4096, maxPixels = 9e6;
  let s = Math.min(scale, maxSide / map.w, maxSide / map.h);
  if (map.w * map.h * s * s > maxPixels) s = Math.sqrt(maxPixels / (map.w * map.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(map.w * s); canvas.height = Math.ceil(map.h * s);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const T = map.tile;
  const ground = map.kind === 'exterior' ? groundImage(map.floor) : null;
  if (ground) {
    // One pattern fill for the whole ground: the texture repeats every 4 tiles.
    const pattern = ctx.createPattern(ground, 'repeat');
    const k = (T * 4) / ground.width;
    pattern.setTransform?.(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.fillStyle = pattern; ctx.fillRect(0, 0, map.w, map.h);
    ctx.fillStyle = '#070d1733'; ctx.fillRect(0, 0, map.w, map.h);
  } else if (map.kind === 'exterior') { ctx.fillStyle = '#1a2430'; ctx.fillRect(0, 0, map.w, map.h); }
  const solidTile = id => Boolean(TILE_LOOK[id]?.solid) || Object.values(map.legend).some(l => l.tile === id && l.solid);
  const cellAt = (r, c) => map.cells[r]?.[c];
  // Door cells count as wall for picking wall pieces: a door sits in a gap in the wall and the wall runs on.
  const inDoor = (r, c) => map.doors.some(d => c * T >= d.x - 1 && (c + 1) * T <= d.x + d.w + 1 && r * T >= d.y - 1 && (r + 1) * T <= d.y + d.h + 1);
  const open = (r, c) => { const id = cellAt(r, c); return id !== undefined && !solidTile(id) && !inDoor(r, c); };
  // Which art room each cell belongs to (map "room", or "rooms" regions for a multi-room map like the ship).
  const regions = (map.def.rooms || []).map(r => ({ room: r.room, x0: r.at[0], y0: r.at[1], x1: r.at[0] + r.size[0], y1: r.at[1] + r.size[1] }));
  const roomOf = (r, c) => regions.find(g => c >= g.x0 && c < g.x1 && r >= g.y0 && r < g.y1)?.room || map.def.room || null;
  const artFor = new Map();
  const art = room => { if (!artFor.has(room)) artFor.set(room, roomArt(room)); return artFor.get(room); };
  // Floors: a room's seamless floor repeats every 4 tiles under everything that isn't outside the map.
  const floorRooms = new Set();
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (cellAt(r, c) !== 'void' && art(roomOf(r, c))?.floor) floorRooms.add(roomOf(r, c));
  for (const room of floorRooms) {
    const a = art(room);
    ctx.save();
    ctx.beginPath();
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (cellAt(r, c) !== 'void' && roomOf(r, c) === room) ctx.rect(c * T, r * T, T, T);
    ctx.clip();
    const pattern = ctx.createPattern(a.floor, 'repeat');
    const k = (T * a.floorCovers[0]) / a.floor.width;
    pattern.setTransform?.(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.fillStyle = pattern; ctx.fillRect(0, 0, map.w, map.h);
    ctx.restore();
  }
  // Three passes: floors, then the soft shadow walls cast on the floor, then the walls.
  for (const pass of ['floor', 'solid']) {
    if (pass === 'solid') {
      ctx.fillStyle = '#0000002e';
      for (const s2 of map.solids) if (s2.wall) ctx.fillRect(s2.x, s2.y + s2.h, s2.w, 8);
    }
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const id = map.cells[r][c];
        const solid = solidTile(id);
        if ((pass === 'solid') !== solid) continue;
        const floorish = id === 'floor';
        if (floorish && (ground || floorRooms.has(roomOf(r, c)))) continue;
        if (solid && id !== 'void' && drawWallPiece(ctx, art(roomOf(r, c)), r, c, T, open, id === 'window')) continue;
        const below = map.cells[r + 1]?.[c];
        const faceBelow = below !== undefined && !solidTile(below);
        drawTile(ctx, floorish ? map.floor : id, c * T, r * T, T, r, c, faceBelow, Boolean(ground) || floorRooms.has(roomOf(r, c)));
      }
    }
  }
  for (const d of map.doors) drawDoor(ctx, d, isLocked(d));
  const props = [...map.props].sort((a, b) => (a.block === false ? -1 : 0) - (b.block === false ? -1 : 0) || a.y + a.h - (b.y + b.h));
  for (const p of props) {
    if (extraArt?.(ctx, p)) continue;
    const img = sprite(p.art);
    const meta = interiorProp(p.art);
    // A long counter or shelf made of one art piece repeats it along its length.
    const nx = img && meta ? Math.max(1, Math.round(p.w / T / meta.tiles[0])) : 1;
    const ny = img && meta ? Math.max(1, Math.round(p.h / T / meta.tiles[1])) : 1;
    if (img && nx * ny > 1) {
      const w = p.w / nx, h = p.h / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) drawContained(ctx, img, { ...p, x: p.x + i * w, y: p.y + j * h, w, h, cx: p.x + i * w + w / 2, cy: p.y + j * h + h / 2 });
    } else if (img) drawContained(ctx, img, p);
    else drawPropPlaceholder(ctx, p);
  }
  return { canvas, scale: s };
}

function drawWallPiece(ctx, art, r, c, T, open, glass) {
  if (!art) return false;
  const piece = wallPiece(open, r, c);
  if (!piece) { ctx.fillStyle = '#080d14'; ctx.fillRect(c * T, r * T, T, T); return true; }
  const img = art.wall(piece);
  if (!img) return false;
  ctx.drawImage(img, c * T, r * T, T, T);
  if (glass) { ctx.fillStyle = '#0b2a3acc'; ctx.fillRect(c * T + 4, r * T + T * 0.3, T - 8, T * 0.3); ctx.fillStyle = '#81e6df44'; ctx.fillRect(c * T + 4, r * T + T * 0.3, T - 8, 2); }
  return true;
}

function drawDoor(ctx, d, locked) {
  const ratio = Math.max(d.w, d.h) / Math.min(d.w, d.h);
  const img = ratio >= 1.5 && ratio <= 2.6 ? (!locked ? sprite('door-open') : sprite('door-closed')) : null;
  if (img) {
    ctx.save();
    if (d.w >= d.h) ctx.drawImage(img, d.x, d.y, d.w, d.h);
    else { ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -d.h / 2, -d.w / 2, d.h, d.w); }
    ctx.restore();
    if (!locked) return;
  }
  ctx.save();
  ctx.fillStyle = '#0b1622'; ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.fillStyle = locked ? '#ffad72' : '#81e6df';
  ctx.globalAlpha = 0.85;
  const horizontal = d.w >= d.h;
  if (horizontal) { ctx.fillRect(d.x + 4, d.y + d.h / 2 - 2, d.w - 8, 4); } else { ctx.fillRect(d.x + d.w / 2 - 2, d.y + 4, 4, d.h - 8); }
  ctx.restore();
}

/** Draws an image fitted inside a prop's box (keeps its aspect), with a soft shadow. */
export function drawContained(ctx, img, p, pad = 0) {
  const k = Math.min((p.w - pad * 2) / img.width, (p.h - pad * 2) / img.height);
  const w = img.width * k, h = img.height * k;
  const x = p.x + (p.w - w) / 2, y = p.y + (p.h - h) / 2;
  ctx.save();
  if (p.rot) { ctx.translate(p.cx, p.cy); ctx.rotate(p.rot); ctx.translate(-p.cx, -p.cy); }
  ctx.globalAlpha = 0.35; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.cx + 4, p.cy + 6, w * 0.3, h * 0.3, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

// ---- bodies -------------------------------------------------------------------
/**
 * A straight-down body: sprite rotated to its heading (sprites face up), with
 * the code sway and bob the art lead advised (straight down hides the legs).
 * opts: { size, t, moving, stride, frames, hit, look }
 */
export function drawBody(ctx, x, y, angle, img, { size = 44, t = 0, moving = false, stride = 0, hit = 0, tint = null, label = null, dog = false } = {}) {
  const sway = moving ? Math.sin(stride * Math.PI) * 0.07 : Math.sin(t * 1.6) * 0.015;
  const bob = moving ? 1 + Math.abs(Math.sin(stride * Math.PI)) * 0.035 : 1 + Math.sin(t * 2.1) * 0.01;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.ellipse(3, 5, size * 0.36, size * 0.3, 0, 0, TAU); ctx.fill();
  ctx.rotate(angle + Math.PI / 2 + sway);
  ctx.scale(bob, bob);
  if (img) {
    const k = size / Math.max(img.width, img.height);
    ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
    if (hit > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, hit * 6); ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k); }
  } else drawPersonPlaceholder(ctx, size, tint || '#81e6df', dog);
  ctx.restore();
  if (label) {
    ctx.save();
    ctx.font = '600 11px Inter, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#070d17cc'; const w = ctx.measureText(label).width + 10; rr(ctx, x - w / 2, y - size * 0.75 - 16, w, 15, 4); ctx.fill();
    ctx.fillStyle = tint || '#eaf4f5'; ctx.fillText(label, x, y - size * 0.75 - 5);
    ctx.restore();
  }
}

// A person from above: shoulders, helmet, arms forward. Or a dog: body, head, ears, tail.
function drawPersonPlaceholder(ctx, size, tint, dog) {
  const s = size / 2;
  if (dog) {
    ctx.fillStyle = '#6b5a3c'; ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.42, s * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a7650'; ctx.beginPath(); ctx.arc(0, -s * 0.62, s * 0.38, 0, TAU); ctx.fill();
    ctx.fillStyle = tint; ctx.beginPath(); ctx.ellipse(-s * 0.32, -s * 0.78, s * 0.12, s * 0.26, -0.5, 0, TAU); ctx.ellipse(s * 0.32, -s * 0.78, s * 0.12, s * 0.26, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b5a3c'; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.quadraticCurveTo(s * 0.3, s * 1.2, s * 0.1, s * 1.35); ctx.stroke();
    ctx.fillStyle = '#81e6df'; ctx.fillRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.1); // collar light
    return;
  }
  ctx.fillStyle = '#3a4652'; ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.78, s * 0.42, 0, 0, TAU); ctx.fill(); // shoulders
  ctx.fillStyle = '#4b5a68'; ctx.beginPath(); ctx.ellipse(-s * 0.42, -s * 0.38, s * 0.16, s * 0.4, 0.2, 0, TAU); ctx.ellipse(s * 0.42, -s * 0.38, s * 0.16, s * 0.4, -0.2, 0, TAU); ctx.fill(); // arms
  ctx.fillStyle = '#5d6d7c'; ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.36, 0, TAU); ctx.fill(); // head
  ctx.fillStyle = tint; ctx.fillRect(-s * 0.06, -s * 0.36, s * 0.12, s * 0.66); // stripe
  ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.36, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = tint + 'aa'; ctx.stroke();
}

export function castSprite(id) { return castImage(id) || null; }
export function castLook(id) { return CAST_LOOK[id] || { name: id, color: '#eaf4f5', scale: 1 }; }

/** A vignette for the view, built once per size: dims the edges so the middle reads. */
export function buildVignette(w, h, dpr, strength = 0.55) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr / 2)); c.height = Math.max(1, Math.round(h * dpr / 2)); // half res: it's a blur anyway
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.6);
  g.addColorStop(0, '#070d1700'); g.addColorStop(1, `rgba(7,13,23,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export { rr };
