// Painting for maps with a `look` block: the outside, calm floors, decals,
// chunky wall caps with a lit lip and a cast shadow, door frames, wall-hugging
// pieces, clutter and light. Everything here is drawn once into the static
// layer (look.js), in world px (one tile = map.tile), lit from the upper left.
// Art from the art lanes replaces a painted piece when lookArt.js names a file
// for it; until then these code stand-ins hold the value ladder (looks.json).
import { lookImage } from './lookArt.js';

const TAU = Math.PI * 2;

// ---- small helpers ---------------------------------------------------------------
export function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex = (h, a = 1) => {
  const n = parseInt(h.slice(1), 16);
  return h.length === 7 ? `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` : h;
};
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hex(color, alpha)); g.addColorStop(0.45, hex(color, alpha * 0.45)); g.addColorStop(1, hex(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
let noiseTile = null;
function noise() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d'); const d = x.createImageData(96, 96); const r = rng('noise');
  for (let i = 0; i < d.data.length; i += 4) { const v = 70 + r() * 116; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); noiseTile = c; return c;
}

// The grid as the painter sees it.
export function gridOf(map, look) {
  const T = map.tile;
  const solidIds = new Set(['wall', 'window', 'void', 'rock', ...Object.values(map.legend).filter(l => l.solid).map(l => l.tile)]);
  const cell = (r, c) => map.cells[r]?.[c];
  const solid = (r, c) => { const id = cell(r, c); return id === undefined || solidIds.has(id); };
  const doorAt = (r, c) => map.doors.find(d => c * T >= d.x - 1 && (c + 1) * T <= d.x + d.w + 1 && r * T >= d.y - 1 && (r + 1) * T <= d.y + d.h + 1) || null;
  const floor = (r, c) => cell(r, c) !== undefined && !solid(r, c);
  const inside = (r, c) => r >= 0 && c >= 0 && r < map.rows && c < map.cols;
  return { T, cell, solid, floor, doorAt, inside, look };
}

// ---- outside: dark station hull around the room -----------------------------------
export function paintOutside(ctx, map, look, M) {
  const o = look.outside, T = map.tile, x0 = -M, y0 = -M, w = map.w + M * 2, h = map.h + M * 2;
  const art = lookImage('backdrop', o.art);
  if (art) {
    const p = ctx.createPattern(art, 'repeat'); const k = T / (o.artTilePx || 64);
    p.setTransform?.(new DOMMatrix([k, 0, 0, k, 0, 0])); ctx.fillStyle = p; ctx.fillRect(x0, y0, w, h);
    if (o.artLift) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = o.artLift; ctx.fillRect(x0, y0, w, h); ctx.restore(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = T * 0.5; ctx.strokeRect(-T * 0.25, -T * 0.25, map.w + T * 0.5, map.h + T * 0.5);
    return;
  }
  const r = rng(`${map.id}-outside`);
  ctx.fillStyle = o.base; ctx.fillRect(x0, y0, w, h);
  // Big hull plates of mixed sizes, a hair lighter or darker, soft seams (no even grid).
  for (let y = y0; y < y0 + h; ) {
    const ph = T * (1.5 + Math.floor(r() * 3) * 0.75);
    for (let x = x0 - r() * T * 2; x < x0 + w; ) {
      const pw = T * (2 + Math.floor(r() * 4));
      ctx.fillStyle = r() < 0.45 ? o.plate : r() < 0.5 ? o.base : 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 1.5, y + 1.5, pw - 3, ph - 3);
      ctx.fillStyle = o.seam; ctx.globalAlpha = 0.6; ctx.fillRect(x, y, pw, 1.5); ctx.fillRect(x, y, 1.5, ph); ctx.globalAlpha = 1;
      if (r() < 0.25) { ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(x + T * 0.3, y + T * 0.3, pw - T * 0.6, T * 0.2); }
      x += pw;
    }
    y += ph;
  }
  // Ribs: structure running out from the room.
  ctx.fillStyle = o.beam;
  for (let x = T * 2; x < map.w; x += T * 5) { ctx.fillRect(x, y0, T * 0.35, M); ctx.fillRect(x, map.h, T * 0.35, M); }
  for (let y = T * 2; y < map.h; y += T * 5) { ctx.fillRect(x0, y, M, T * 0.35); ctx.fillRect(map.w, y, M, T * 0.35); }
  // A darker band right outside the walls (the wall's outer thickness).
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = T * 0.5; ctx.strokeRect(-T * 0.25, -T * 0.25, map.w + T * 0.5, map.h + T * 0.5);
  // A few running lights on the hull.
  for (let i = 0; i < o.lightCount; i++) {
    const side = Math.floor(r() * 4), t = r();
    const px = side < 2 ? t * map.w : side === 2 ? -M * (0.3 + r() * 0.5) : map.w + M * (0.3 + r() * 0.5);
    const py = side >= 2 ? t * map.h : side === 0 ? -M * (0.3 + r() * 0.5) : map.h + M * (0.3 + r() * 0.5);
    const c = o.light[i % o.light.length];
    glow(ctx, px, py, T * 0.5, c, 0.16);
    ctx.fillStyle = hex(c, 0.75); ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
  }
}

// Stars and a force field through an open bay mouth (a solid 'baymouth' cell).
function paintBayMouth(ctx, g, r, c, look) {
  const T = g.T, x = c * T, y = r * T;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
  ctx.fillStyle = '#05070b'; ctx.fillRect(x, y, T, T);
  const strip = lookImage('backdrop', look.outside.bayArt);
  if (strip) {
    let i = 0; while (g.cell(r, c - i - 1) === 'baymouth') i++;
    const n = Math.round(strip.width / strip.height);
    ctx.drawImage(strip, (i % n) * strip.height, 0, strip.height, strip.height, x, y, T, T);
    ctx.restore(); return;
  }
  const rand = rng(`stars-${r}-${c}`);
  for (let i = 0; i < 9; i++) { const v = 120 + rand() * 135; ctx.fillStyle = `rgba(${v},${v},${Math.min(255, v + 20)},${0.5 + rand() * 0.5})`; const s = rand() < 0.15 ? 2 : 1.2; ctx.fillRect(x + rand() * T, y + rand() * T * 0.8, s, s); }
  // The field: a faint cyan sheen thickening toward the room.
  const toRoom = g.floor(r + 1, c) ? 1 : g.floor(r - 1, c) ? -1 : 0;
  const gy = ctx.createLinearGradient(0, toRoom > 0 ? y : y + T, 0, toRoom > 0 ? y + T : y);
  gy.addColorStop(0, 'rgba(92,225,240,0.02)'); gy.addColorStop(0.8, 'rgba(92,225,240,0.10)'); gy.addColorStop(1, 'rgba(92,225,240,0.32)');
  ctx.fillStyle = gy; ctx.fillRect(x, y, T, T);
  ctx.fillStyle = 'rgba(92,225,240,0.08)'; for (let k = 4; k < T; k += 7) ctx.fillRect(x, y + k, T, 1);
  ctx.restore();
}

// ---- floor ---------------------------------------------------------------------------
function panelLayout(map, set, seed) {
  const r = rng(seed), taken = new Set(), out = [];
  const opts = set.panels;
  const total = opts.reduce((s, o) => s + o[2], 0);
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    if (taken.has(`${x},${y}`)) continue;
    let pick = r() * total, chosen = [1, 1];
    for (const o of opts) { pick -= o[2]; if (pick <= 0) { chosen = o; break; } }
    let [w, h] = chosen;
    const free = (w2, h2) => { for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) if (taken.has(`${x + i},${y + j}`) || x + i >= map.cols || y + j >= map.rows) return false; return true; };
    while (!free(w, h) && (w > 1 || h > 1)) { if (w >= h && w > 1) w--; else h--; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) taken.add(`${x + i},${y + j}`);
    out.push({ x, y, w, h, tone: (r() * 2 - 1) });
  }
  return out;
}

export function paintFloor(ctx, map, g) {
  const { T, look } = g;
  const groups = new Map();
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    if (!g.floor(r, c)) continue;
    const id = look.floors[g.cell(r, c)] || look.floors.floor || 'deck';
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push([r, c]);
  }
  for (const [id, cells] of groups) {
    const set = look.floorSets[id] || Object.values(look.floorSets)[0];
    ctx.save();
    ctx.beginPath(); for (const [r, c] of cells) ctx.rect(c * T, r * T, T, T); ctx.clip();
    const variants = (Array.isArray(set.art) ? set.art : set.art ? [set.art] : []).map(v => lookImage('floor', v));
    const kit = variants.length > 0 && variants.every(Boolean);
    if (kit) {
      // Kit floors: every tile comes from one of the variants (picked by a hash of its x,y) at the same spot in the
      // 4x4 sheet, so the seams still meet but no plate lattice repeats. Built at the art's own size, then scaled once.
      const px = set.artTilePx || 64, per = set.covers || 4;
      const nat = document.createElement('canvas'); nat.width = map.cols * px; nat.height = map.rows * px;
      const nc = nat.getContext('2d');
      for (const [r, c] of cells) {
        const v = variants[(((c * 73856093) ^ (r * 19349663)) >>> 0) % variants.length];
        nc.drawImage(v, (c % per) * px, (r % per) * px, px, px, c * px, r * px, px, px);
      }
      ctx.drawImage(nat, 0, 0, map.w, map.h);
    } else {
      ctx.fillStyle = set.base; ctx.fillRect(0, 0, map.w, map.h);
      // Stand-in panels: each a little lighter or darker, thin seams with a lit lower-right lip.
      for (const p of panelLayout(map, set, `${map.id}-${id}`)) {
        const x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
        const a = Math.abs(p.tone) * set.tone / 255 * 2.2;
        ctx.fillStyle = p.tone > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = set.seam; ctx.fillRect(x, y, w, 1.1); ctx.fillRect(x, y, 1.1, h);
        ctx.fillStyle = set.seamLit; ctx.fillRect(x, y + 1.1, w, 1); ctx.fillRect(x + 1.1, y, 1, h);
      }
    }
    if (set.noise && !kit) { const p = ctx.createPattern(noise(), 'repeat'); ctx.globalAlpha = set.noise; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = p; ctx.fillRect(0, 0, map.w, map.h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // Wear: big soft patches, never a pattern.
    const r = rng(`${map.id}-wear-${id}`);
    for (let i = 0; i < (kit ? set.kitWear ?? 0 : set.wear || 0); i++) {
      const x = r() * map.w, y = r() * map.h, rad = T * (1.5 + r() * 3.5);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.65;
      gr.addColorStop(0, dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,240,220,0.035)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }
}

// ---- decals: flat paint on the floor ----------------------------------------------------
function hazardBand(ctx, x, y, w, h, look, alpha = look.hazard.alpha) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = look.hazard.dark; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = look.hazard.yellow;
  const s = Math.min(w, h) * 0.9 + 6, span = w + h;
  for (let i = -span; i < span; i += s * 2) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + s, y + h); ctx.lineTo(x + i + s + h, y); ctx.lineTo(x + i + h, y); ctx.fill(); }
  ctx.restore();
}

// A kit decal repainted in another accent: its worn alpha kept, its colour replaced (light keeps a little of the art's shading).
const tints = new WeakMap();
function tinted(img, color) {
  if (!tints.has(img)) tints.set(img, new Map());
  const m = tints.get(img);
  if (m.has(color)) return m.get(color);
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  m.set(color, c); return c;
}

function arrow(ctx, x, y, angle, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(size * 0.6, 0); ctx.lineTo(-size * 0.4, -size * 0.5); ctx.lineTo(-size * 0.4, -size * 0.2); ctx.lineTo(-size * 0.05, 0); ctx.lineTo(-size * 0.4, size * 0.2); ctx.lineTo(-size * 0.4, size * 0.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function paintDecals(ctx, map, g) {
  const { T, look } = g;
  // Hazard floor cells ('/') become painted stripes; the base under them is deck.
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (g.cell(r, c) === 'hazard') hazardBand(ctx, c * T + 1, r * T + T * 0.3, T - 2, T * 0.4, look, 0.62);
  for (const d of look.decals || []) {
    const color = d.color ? (look.accents?.[d.color] || d.color) : look.paint.lane;
    const art = d.art && lookImage('decal', d.art);
    if (art && d.at) {
      const [x, y] = d.at, [w, h] = d.size || [1, 1];
      ctx.save(); ctx.globalAlpha = d.alpha ?? 1;
      if (d.rot) { ctx.translate((x + w / 2) * T, (y + h / 2) * T); ctx.rotate(d.rot); ctx.translate(-(x + w / 2) * T, -(y + h / 2) * T); }
      ctx.drawImage(d.tint ? tinted(art, look.accents?.[d.tint] || d.tint) : art, x * T, y * T, w * T, h * T);
      ctx.restore(); continue;
    }
    ctx.save();
    if (d.kind === 'lane') {
      // A walkway: two thin painted edges, arrows at the far end.
      const pts = d.path.map(([x, y]) => [x * T, y * T]);
      const half = (d.width || 1.6) * T / 2, edge = T * 0.06;
      const scratch = document.createElement('canvas'); scratch.width = ctx.canvas.width; scratch.height = ctx.canvas.height;
      const sc = scratch.getContext('2d'); sc.setTransform(ctx.getTransform());
      sc.lineJoin = 'miter'; sc.lineCap = 'butt';
      const path = () => { sc.beginPath(); pts.forEach(([x, y], i) => (i ? sc.lineTo(x, y) : sc.moveTo(x, y))); };
      path(); sc.strokeStyle = hex(color, 1); sc.lineWidth = (half + edge / 2) * 2; sc.stroke();
      sc.globalCompositeOperation = 'destination-out'; path(); sc.lineWidth = (half - edge / 2) * 2; sc.stroke();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = look.paint.laneAlpha; ctx.drawImage(scratch, 0, 0); ctx.restore();
      if (d.arrows !== false) {
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const len = Math.hypot(bx - ax, by - ay); const ang = Math.atan2(by - ay, bx - ax);
          for (let s = T * 1.6; s < len - T * 0.6; s += T * (d.every || 3.5)) arrow(ctx, ax + Math.cos(ang) * s, ay + Math.sin(ang) * s, ang, T * 0.42, hex(color, look.paint.laneAlpha * 0.9));
        }
      }
    } else if (d.kind === 'pad') {
      // The landing pad: a ring, corner brackets, the bay number. Painted, flat.
      const [x, y] = d.at.map(v => v * T), [w, h] = d.size.map(v => v * T);
      const cx = x + w / 2, cy = y + h / 2, rad = Math.min(w, h) * 0.46;
      ctx.strokeStyle = hex(color, 0.55); ctx.lineWidth = T * 0.14; ctx.beginPath(); ctx.ellipse(cx, cy, rad * (w / h) * 0.86, rad, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = hex(color, 0.3); ctx.lineWidth = T * 0.05; ctx.beginPath(); ctx.ellipse(cx, cy, rad * (w / h) * 0.86 - T * 0.32, rad - T * 0.32, 0, 0, TAU); ctx.stroke();
      const k = T * 0.9; ctx.strokeStyle = hex(color, 0.7); ctx.lineWidth = T * 0.12;
      for (const [bx, by, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.beginPath(); ctx.moveTo(bx + sx * T * 0.15, by + sy * (k + T * 0.15)); ctx.lineTo(bx + sx * T * 0.15, by + sy * T * 0.15); ctx.lineTo(bx + sx * (k + T * 0.15), by + sy * T * 0.15); ctx.stroke(); }
      if (d.label) { ctx.fillStyle = hex(color, 0.55); ctx.font = `800 ${T * 0.9}px Consolas, "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.label, x + w - T * 1.1, y + h - T * 0.75); }
    } else if (d.kind === 'mark') {
      // A station's floor marking: an accent outline with a solid lead-in edge.
      const [x, y] = d.at.map(v => v * T), [w, h] = (d.size || [1, 1]).map(v => v * T);
      ctx.strokeStyle = hex(color, 0.6); ctx.lineWidth = T * 0.07; ctx.setLineDash([T * 0.32, T * 0.16]); ctx.strokeRect(x + T * 0.1, y + T * 0.1, w - T * 0.2, h - T * 0.2); ctx.setLineDash([]);
      ctx.fillStyle = hex(color, 0.09); ctx.fillRect(x + T * 0.1, y + T * 0.1, w - T * 0.2, h - T * 0.2);
    } else if (d.kind === 'range') {
      const [x, y] = d.at.map(v => v * T), [w, h] = d.size.map(v => v * T);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = hex(color, 0.6); ctx.lineWidth = T * 0.07; ctx.strokeRect(x + T * 0.08, y + T * 0.08, w - T * 0.16, h - T * 0.16);
      const lanes = d.lanes || 3; ctx.lineWidth = T * 0.035; ctx.strokeStyle = hex(color, 0.35);
      for (let i = 1; i < lanes; i++) { ctx.beginPath(); ctx.moveTo(x + T * 1.1, y + (h * i) / lanes); ctx.lineTo(x + w - T * 0.2, y + (h * i) / lanes); ctx.stroke(); }
      hazardBand(ctx, x + T * 0.85, y + T * 0.1, T * 0.22, h - T * 0.2, look, 0.75);
      ctx.fillStyle = hex(color, 0.45);
      for (let m = 2; m < w / T - 0.5; m += 1) ctx.fillRect(x + m * T, y + T * 0.12, T * 0.04, T * 0.22);
    } else if (d.kind === 'stain') {
      const [x, y] = d.at.map(v => v * T), rad = (d.r || 0.6) * T, r = rng(`stain-${x}-${y}`);
      ctx.fillStyle = 'rgba(34,24,12,0.13)';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad * 0.7, rad * (0.25 + r() * 0.3), rad * (0.18 + r() * 0.22), r() * 3, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(120,110,150,0.05)'; ctx.beginPath(); ctx.ellipse(x, y, rad * 0.3, rad * 0.18, 0.4, 0, TAU); ctx.fill();
    } else if (d.kind === 'scuff') {
      const [x, y] = d.at.map(v => v * T), r = rng(`scuff-${x}-${y}`);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 7; i++) { const a = (d.angle || 0) + (r() - 0.5) * 0.4, l = T * (0.4 + r() * 0.9), sx = x + (r() - 0.5) * T, sy = y + (r() - 0.5) * T * 0.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); ctx.stroke(); }
    } else if (d.kind === 'drain' || d.kind === 'vent') {
      const [x, y] = d.at.map(v => v * T), [w, h] = (d.size || [1, 1]).map(v => v * T * 0.7);
      const px = x + (T - w) / 2, py = y + (T - h) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; rr(ctx, px, py, w, h, T * 0.06); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let k = py + T * 0.08; k < py + h - T * 0.05; k += T * 0.11) ctx.fillRect(px + T * 0.06, k, w - T * 0.12, T * 0.035);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; rr(ctx, px + 0.5, py + 0.5, w - 1, h - 1, T * 0.06); ctx.stroke();
    } else if (d.kind === 'text') {
      ctx.fillStyle = hex(color, d.alpha ?? 0.4); ctx.font = `800 ${(d.size || 0.5) * T}px Consolas, "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(d.at[0] * T, d.at[1] * T); if (d.rot) ctx.rotate(d.rot); ctx.fillText(d.text, 0, 0);
    } else if (d.kind === 'hazard') {
      const [x, y] = d.at.map(v => v * T), [w, h] = (d.size || [1, 0.3]).map(v => v * T); hazardBand(ctx, x, y, w, h, look);
    }
    ctx.restore();
  }
}

// ---- walls ------------------------------------------------------------------------------
export function paintWallShadows(ctx, map, g) {
  const { T, look } = g, a = look.wall.shadow, len = look.wall.shadowLen * T;
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    if (!g.floor(r, c)) continue;
    const x = c * T, y = r * T;
    const up = g.solid(r - 1, c) && !g.doorAt(r - 1, c), left = g.solid(r, c - 1) && !g.doorAt(r, c - 1);
    if (up) { const gr = ctx.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x, y, T, len); }
    if (left) { const gr = ctx.createLinearGradient(x, 0, x + len, 0); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x, y, len, T); }
    // An outer corner up-left only: a soft quarter shadow.
    if (!up && !left && g.solid(r - 1, c - 1) && !g.doorAt(r - 1, c - 1)) { const gr = ctx.createRadialGradient(x, y, 0, x, y, len); gr.addColorStop(0, `rgba(0,0,0,${a * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x, y, len, len); }
  }
}

export function paintWalls(ctx, map, g) {
  const { T, look } = g, w = look.wall;
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    if (!g.solid(r, c) || g.cell(r, c) === undefined) continue;
    const id = g.cell(r, c);
    if (id === 'void') continue;
    const x = c * T, y = r * T;
    const N = g.floor(r - 1, c), S = g.floor(r + 1, c), W = g.floor(r, c - 1), E = g.floor(r, c + 1);
    if (id === 'baymouth') { paintBayMouth(ctx, g, r, c, look); }
    else {
      ctx.fillStyle = w.cap; ctx.fillRect(x, y, T, T);
      // One big inset panel per cap, a whisper lighter; a groove every few cells along a run.
      ctx.fillStyle = w.capPanel; ctx.fillRect(x + T * 0.16, y + T * 0.16, T * 0.68, T * 0.68);
      const along = (N || S) ? c : r;
      if (along % w.groovesEvery === 0) { ctx.fillStyle = w.groove; (N || S) ? ctx.fillRect(x, y, 1.5, T) : ctx.fillRect(x, y, T, 1.5); }
      if (id === 'window') { ctx.fillStyle = '#0a1a24'; ctx.fillRect(x + T * 0.2, y + T * 0.3, T * 0.6, T * 0.4); ctx.fillStyle = 'rgba(92,225,240,0.25)'; ctx.fillRect(x + T * 0.2, y + T * 0.3, T * 0.6, 1.5); }
    }
    // Edges: dark where the wall meets the outside, a dim rim on the shade sides, the lit lip on the sides facing the light.
    ctx.fillStyle = w.outer;
    const outside = (rr2, cc2) => !g.inside(rr2, cc2) || g.cell(rr2, cc2) === 'void';
    if (outside(r - 1, c)) ctx.fillRect(x, y, T, 2.2);
    if (outside(r + 1, c)) ctx.fillRect(x, y + T - 2.2, T, 2.2);
    if (outside(r, c - 1)) ctx.fillRect(x, y, 2.2, T);
    if (outside(r, c + 1)) ctx.fillRect(x + T - 2.2, y, 2.2, T);
    // The room's N and W walls (floor to their S or E) catch the light on their top edge: a bright, slightly warm lip,
    // then the cast shadow on the floor (paintWallShadows). The S and E walls get only a thin dark contact line.
    const lp = w.lipLitPx, cp = w.contactPx ?? 1.5;
    if (S) { ctx.fillStyle = w.lipLit; ctx.fillRect(x, y + T - lp, T, lp); ctx.fillStyle = hex(w.lipLit, 0.4); ctx.fillRect(x, y + T - lp - 1.5, T, 1.5); }
    if (E) { ctx.fillStyle = w.lipLit; ctx.fillRect(x + T - lp, y, lp, T); ctx.fillStyle = hex(w.lipLit, 0.4); ctx.fillRect(x + T - lp - 1.5, y, 1.5, T); }
    ctx.fillStyle = w.contact || '#07080a';
    if (N) ctx.fillRect(x, y, T, cp);
    if (W) ctx.fillRect(x, y, cp, T);
  }
  // Bay mouths: the field's bright edge on the room side and hazard posts at each end.
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    if (g.cell(r, c) !== 'baymouth') continue;
    const x = c * T, y = r * T, toRoom = g.floor(r + 1, c) ? 1 : -1;
    const ey = toRoom > 0 ? y + T - 2.5 : y;
    ctx.fillStyle = 'rgba(150,240,250,0.95)'; ctx.fillRect(x, ey, T, 2.5);
    for (const [cc, sx] of [[c - 1, x - T * 0.32], [c + 1, x + T]]) {
      if (g.cell(r, cc) === 'baymouth') continue;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, y, T * 0.32, T); ctx.clip();
      ctx.fillStyle = look.hazard.dark; ctx.fillRect(sx, y, T * 0.32, T);
      ctx.fillStyle = look.hazard.yellow; for (let k = -T; k < T * 2; k += T * 0.3) { ctx.beginPath(); ctx.moveTo(sx, y + k); ctx.lineTo(sx + T * 0.32, y + k - T * 0.16); ctx.lineTo(sx + T * 0.32, y + k - T * 0.01); ctx.lineTo(sx, y + k + T * 0.15); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(sx + T * 0.3, y, 1.5, T);
    }
  }
}

// ---- doors: a passage out, jambs with a coloured light strip, a hazard threshold --------
export function paintDoors(ctx, map, g, isLocked, objectiveDoor = null) {
  const { T, look } = g, D = look.doors;
  for (const d of map.doors) {
    const locked = isLocked(d);
    const color = locked ? D.locked : (look.doorColors?.[d.id] ? (look.accents?.[look.doorColors[d.id]] || look.doorColors[d.id]) : D.open);
    const side = d.y <= 0 ? 'n' : d.y + d.h >= map.h ? 's' : d.x <= 0 ? 'w' : d.x + d.w >= map.w ? 'e' : null;
    ctx.save();
    if (!side) { paintRamp(ctx, d, look, T); ctx.restore(); continue; }
    const horiz = side === 'n' || side === 's';
    // The passage: through the gap you see the corridor beyond, lit by the next room (a bright notch in the dark wall).
    const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side];
    const gx0 = d.x + d.w / 2 - out[0] * d.w / 2, gy0 = d.y + d.h / 2 - out[1] * d.h / 2;
    ctx.fillStyle = '#4a515a'; ctx.fillRect(d.x, d.y, d.w, d.h);
    const gr = ctx.createLinearGradient(gx0, gy0, gx0 + out[0] * d.w, gy0 + out[1] * d.h);
    gr.addColorStop(0, hex(locked ? '#000000' : color, locked ? 0.3 : 0.18)); gr.addColorStop(1, hex(locked ? '#000000' : color, locked ? 0.7 : 0.42));
    ctx.fillStyle = gr; ctx.fillRect(d.x, d.y, d.w, d.h);
    // Floor seams running away through the door.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 1; k < 3; k++) horiz ? ctx.fillRect(d.x + (d.w * k) / 3, d.y, 1.2, d.h) : ctx.fillRect(d.x, d.y + (d.h * k) / 3, d.w, 1.2);
    // Side walls of the passage (straight down: thin dark strips).
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    if (horiz) { ctx.fillRect(d.x, d.y, T * 0.08, d.h); ctx.fillRect(d.x + d.w - T * 0.08, d.y, T * 0.08, d.h); } else { ctx.fillRect(d.x, d.y, d.w, T * 0.08); ctx.fillRect(d.x, d.y + d.h - T * 0.08, d.w, T * 0.08); }
    // Hazard threshold on the room side.
    const th = T * 0.2;
    if (side === 'n') hazardBand(ctx, d.x, d.y + d.h - th, d.w, th, look);
    if (side === 's') hazardBand(ctx, d.x, d.y, d.w, th, look);
    if (side === 'w') hazardBand(ctx, d.x + d.w - th, d.y, th, d.h, look);
    if (side === 'e') hazardBand(ctx, d.x, d.y, th, d.h, look);
    // The door itself: open slabs tucked into the jambs, or a closed slab with a warning strip.
    if (locked) {
      ctx.fillStyle = '#3b4249';
      if (horiz) ctx.fillRect(d.x, d.y + d.h * 0.3, d.w, d.h * 0.4); else ctx.fillRect(d.x + d.w * 0.3, d.y, d.w * 0.4, d.h);
      ctx.fillStyle = color;
      if (horiz) ctx.fillRect(d.x + T * 0.2, d.y + d.h * 0.48, d.w - T * 0.4, T * 0.06); else ctx.fillRect(d.x + d.w * 0.48, d.y + T * 0.2, T * 0.06, d.h - T * 0.4);
    }
    // Jambs: frame blocks on the wall cells either side, a bright strip facing the opening.
    const jw = T * 0.34;
    const jambs = horiz ? [[d.x - jw, d.y, jw, d.h, 1], [d.x + d.w, d.y, jw, d.h, -1]] : [[d.x, d.y - jw, d.w, jw, 1], [d.x, d.y + d.h, d.w, jw, -1]];
    for (const [x, y, w, h, s] of jambs) {
      ctx.fillStyle = D.jamb; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; horiz ? ctx.fillRect(x, y, w, 1.5) : ctx.fillRect(x, y, 1.5, h);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; horiz ? ctx.fillRect(x, y + h - 1.5, w, 1.5) : ctx.fillRect(x + w - 1.5, y, 1.5, h);
      ctx.fillStyle = color;
      if (horiz) ctx.fillRect(s > 0 ? x + w - T * 0.1 : x + T * 0.04, y + T * 0.12, T * 0.06, h - T * 0.24);
      else ctx.fillRect(x + T * 0.12, s > 0 ? y + h - T * 0.1 : y + T * 0.04, w - T * 0.24, T * 0.06);
    }
    ctx.restore();
  }
}

function paintRamp(ctx, d, look, T) {
  // The ship's ramp: a lit plate with chevrons running down to the deck.
  ctx.fillStyle = '#5a636d'; rr(ctx, d.x + T * 0.1, d.y, d.w - T * 0.2, d.h, T * 0.08); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(d.x + T * 0.12, d.y, d.w - T * 0.24, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(d.x + T * 0.12, d.y + d.h - 3, d.w - T * 0.24, 3);
  ctx.strokeStyle = hex(look.hazard.yellow, 0.85); ctx.lineWidth = T * 0.08;
  for (let i = 0; i < 2; i++) { const yy = d.y + d.h * (0.32 + i * 0.32); ctx.beginPath(); ctx.moveTo(d.x + d.w * 0.3, yy - T * 0.1); ctx.lineTo(d.x + d.w / 2, yy + T * 0.1); ctx.lineTo(d.x + d.w * 0.7, yy - T * 0.1); ctx.stroke(); }
  ctx.fillStyle = look.doors.open;
  ctx.fillRect(d.x + T * 0.16, d.y + T * 0.15, T * 0.06, d.h - T * 0.3); ctx.fillRect(d.x + d.w - T * 0.22, d.y + T * 0.15, T * 0.06, d.h - T * 0.3);
}

// ---- wall-hugging pieces and clutter (code stand-ins until art-objects delivers) ---------
export function paintMounts(ctx, map, g) {
  const { T, look } = g;
  for (const m of look.mounts || []) {
    const art = m.art && (lookImage('prop', m.art) || lookImage('decal', m.art));
    const [x, y] = m.at.map(v => v * T), [w, h] = (m.size || [1, 1]).map(v => v * T);
    if (art) { ctx.drawImage(art, x, y, w, h); continue; }
    const color = m.color ? (look.accents?.[m.color] || m.color) : look.light.cool;
    ctx.save();
    shadowed(ctx, () => {
      if (m.kind === 'pipe') {
        const horiz = w >= h, th = Math.min(w, h);
        ctx.fillStyle = '#5d6670'; horiz ? ctx.fillRect(x, y, w, th) : ctx.fillRect(x, y, th, h);
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; horiz ? ctx.fillRect(x, y + th * 0.2, w, th * 0.18) : ctx.fillRect(x + th * 0.2, y, th * 0.18, h);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; horiz ? ctx.fillRect(x, y + th * 0.75, w, th * 0.25) : ctx.fillRect(x + th * 0.75, y, th * 0.25, h);
        ctx.fillStyle = '#3a4048';
        const len = horiz ? w : h; for (let k = T * 0.5; k < len; k += T * 1.2) horiz ? ctx.fillRect(x + k, y - 1, T * 0.12, th + 2) : ctx.fillRect(x - 1, y + k, th + 2, T * 0.12);
        if (m.valve) { ctx.fillStyle = '#c0453a'; ctx.beginPath(); ctx.arc(horiz ? x + w * 0.6 : x + th / 2, horiz ? y + th / 2 : y + h * 0.6, th * 0.75, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect((horiz ? x + w * 0.6 : x + th / 2) - th * 0.5, (horiz ? y + th / 2 : y + h * 0.6) - 1, th, 2); }
      } else if (m.kind === 'box') {
        ctx.fillStyle = '#56606a'; rr(ctx, x, y, w, h, T * 0.05); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x + 1, y + 1, w - 2, 1.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.6);
        ctx.fillStyle = color; ctx.fillRect(x + w * 0.62, y + h * 0.3, T * 0.08, T * 0.08);
      } else if (m.kind === 'screen') {
        ctx.fillStyle = '#2c333b'; rr(ctx, x, y, w, h, T * 0.05); ctx.fill();
        ctx.fillStyle = hex(color, 0.55); ctx.fillRect(x + w * 0.1, y + h * 0.18, w * 0.8, h * 0.64);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 3; k++) ctx.fillRect(x + w * 0.16, y + h * (0.3 + k * 0.17), w * (0.35 + (k % 2) * 0.3), 1.5);
      } else if (m.kind === 'shelf') {
        ctx.fillStyle = '#4a4036'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w, 1.5);
        const r = rng(`shelf-${x}-${y}`), cols = ['#8a8f96', '#b25a3c', '#6f8b5b', '#c9a243', '#596877'];
        for (let k = x + 3; k < x + w - 6; k += 4 + r() * 6) { ctx.fillStyle = cols[Math.floor(r() * cols.length)]; const s = 4 + r() * 6; ctx.fillRect(k, y + (h - s) / 2, s, s); }
      } else if (m.kind === 'vent') {
        ctx.fillStyle = '#3f4750'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let k = 3; k < (w > h ? w : h) - 2; k += 4) w > h ? ctx.fillRect(x + k, y + 2, 2, h - 4) : ctx.fillRect(x + 2, y + k, w - 4, 2);
      } else if (m.kind === 'lamp') {
        ctx.fillStyle = '#5b636c'; rr(ctx, x, y, w, h, T * 0.04); ctx.fill();
        ctx.fillStyle = '#fff1d6'; ctx.fillRect(x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.4);
      } else if (m.kind === 'reel') {
        ctx.fillStyle = '#c0453a'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.48, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2a2d31'; ctx.lineWidth = Math.min(w, h) * 0.16; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.28, 0, TAU); ctx.stroke();
      } else if (m.kind === 'board') {
        ctx.fillStyle = '#3d4650'; ctx.fillRect(x, y, w, h);
        const r = rng(`board-${x}-${y}`);
        for (let k = x + 4; k < x + w - 6; k += 7 + r() * 6) { ctx.fillStyle = r() < 0.5 ? '#a9b1b9' : '#c08a3e'; ctx.fillRect(k, y + h * 0.2, 2.5, h * (0.4 + r() * 0.4)); }
      }
    }, look, T);
    ctx.restore();
  }
}

function shadowed(ctx, fn, look, T) {
  // A soft shadow down and right (light from the upper left), then the thing.
  const s = look.props.shadow;
  ctx.save(); ctx.shadowColor = `rgba(0,0,0,${s.alpha})`; ctx.shadowBlur = s.blur * T * 2 * (ctx.getTransform().a || 1); ctx.shadowOffsetX = s.dx * T * 0.6 * (ctx.getTransform().a || 1); ctx.shadowOffsetY = s.dy * T * 0.6 * (ctx.getTransform().a || 1);
  fn(); ctx.restore();
}

export function paintClutter(ctx, map, g) {
  const { T, look } = g;
  for (const k of look.clutter || []) {
    const art = k.art && lookImage('prop', k.art);
    const [cx, cy] = k.at.map(v => v * T), s = (k.size || 0.4) * T;
    if (art) { const a = art.width / art.height; shadowed(ctx, () => ctx.drawImage(art, cx - s * a / 2, cy - s / 2, s * a, s), look, T); continue; }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(k.rot || 0);
    shadowed(ctx, () => {
      if (k.kind === 'cone') {
        ctx.fillStyle = '#e8702a'; ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.fillStyle = '#ff8f45'; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#f2efe8'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ffb27a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.09, 0, TAU); ctx.fill();
      } else if (k.kind === 'toolbox') {
        ctx.fillStyle = '#b8322a'; rr(ctx, -s * 0.6, -s * 0.35, s * 1.2, s * 0.7, s * 0.08); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-s * 0.55, -s * 0.32, s * 1.1, s * 0.08);
        ctx.fillStyle = '#2a2d31'; ctx.fillRect(-s * 0.25, -s * 0.06, s * 0.5, s * 0.12);
      } else if (k.kind === 'coil') {
        ctx.strokeStyle = '#2b2f34'; ctx.lineWidth = s * 0.2; ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#d0a13a'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0.4, 2.2); ctx.stroke();
      } else if (k.kind === 'crate') {
        ctx.fillStyle = '#7a6a4e'; ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeStyle = '#4f4430'; ctx.lineWidth = s * 0.08; ctx.strokeRect(-s / 2 + s * 0.06, -s / 2 + s * 0.06, s * 0.88, s * 0.88); ctx.beginPath(); ctx.moveTo(-s * 0.44, -s * 0.44); ctx.lineTo(s * 0.44, s * 0.44); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-s / 2, -s / 2, s, s * 0.07);
      } else if (k.kind === 'ball') {
        ctx.fillStyle = '#e34b6b'; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.14, s * 0.12, 0, TAU); ctx.fill();
      } else if (k.kind === 'bowl') {
        ctx.fillStyle = '#9aa3ab'; ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, TAU); ctx.fill();
      } else if (k.kind === 'cup') {
        ctx.fillStyle = '#e9e2d0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4a2f1c'; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, TAU); ctx.fill();
      } else if (k.kind === 'tyre') {
        ctx.strokeStyle = '#26292d'; ctx.lineWidth = s * 0.28; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, s * 0.46, 3.6, 5); ctx.stroke();
      } else if (k.kind === 'plant') {
        ctx.fillStyle = '#7b5236'; ctx.beginPath(); ctx.arc(0, 0, s * 0.42, 0, TAU); ctx.fill();
        const r = rng(`plant-${cx}-${cy}`);
        for (let i = 0; i < 9; i++) { const a = r() * TAU, l = s * (0.35 + r() * 0.35); ctx.fillStyle = i % 2 ? '#5fae4f' : '#7fcf62'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * l * 0.5, Math.sin(a) * l * 0.5, l * 0.5, l * 0.2, a, 0, TAU); ctx.fill(); }
      } else if (k.kind === 'rag') {
        ctx.fillStyle = '#b7a17a'; ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.2); ctx.lineTo(s * 0.3, -s * 0.35); ctx.lineTo(s * 0.45, s * 0.2); ctx.lineTo(-s * 0.2, s * 0.35); ctx.closePath(); ctx.fill();
      }
    }, look, T);
    ctx.restore();
  }
}

// ---- light: pools on the floor, glows from the things you can use ------------------------
export function paintPools(ctx, map, g) {
  const { T, look } = g;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of look.lights || []) {
    const color = look.accents?.[l.color] || look.light[l.color] || l.color || look.light.warm;
    glow(ctx, l.at[0] * T, l.at[1] * T, (l.r || 3) * T, color, l.alpha ?? 0.1);
  }
  // Wall lamps throw a warm pool onto the floor in front of them.
  for (const m of look.mounts || []) {
    if (m.kind !== 'lamp' && !m.glow) continue;
    const [x, y] = m.at.map(v => v * T), [w, h] = (m.size || [1, 1]).map(v => v * T);
    const gc = m.glow ? (look.light[m.glow] || look.accents?.[m.glow] || m.glow) : look.light.warm;
    glow(ctx, x + w / 2 + (m.gx || 0) * T, y + h / 2 + (m.gy || 0) * T, T * (m.r || 2.6), gc, m.alpha ?? 0.13);
  }
  // Doors spill their strip colour into the room.
  for (const d of map.doors) {
    const side = d.y <= 0 ? [0, 1] : d.y + d.h >= map.h ? [0, -1] : d.x <= 0 ? [1, 0] : d.x + d.w >= map.w ? [-1, 0] : null;
    if (!side) continue;
    const color = look.doorColors?.[d.id] ? (look.accents?.[look.doorColors[d.id]] || look.doorColors[d.id]) : look.doors.open;
    glow(ctx, d.x + d.w / 2 + side[0] * T * 0.4, d.y + d.h / 2 + side[1] * T * 0.4, T * 1.7, color, look.doors.spill);
  }
  ctx.restore();
}

export function paintEmitters(ctx, map, g) {
  const { T, look } = g;
  for (const e of look.emitters || []) {
    const color = look.accents?.[e.color] || e.color || look.light.cool;
    const [x, y] = e.at.map(v => v * T), [w, h] = (e.size || [0.12, 0.12]).map(v => v * T);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x + w / 2, y + h / 2, (e.glow || 1.1) * T, color, e.alpha ?? 0.22);
    ctx.restore();
    // The lit part itself: a hot core in the accent colour (200+ in a screenshot).
    ctx.fillStyle = hex(color, 1); rr(ctx, x, y, w, h, Math.min(w, h) * 0.4); ctx.fill();
    ctx.fillStyle = hex(color, 1); ctx.globalAlpha = 1; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; rr(ctx, x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.76, Math.min(w, h) * 0.3); ctx.fill(); ctx.restore();
  }
}
