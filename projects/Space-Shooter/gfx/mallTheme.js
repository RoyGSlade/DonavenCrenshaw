/**
 * The Abandoned Mall: a mall district floating in space, drawn from the track
 * (the plan lives in mallPlan.js). VISUAL ONLY: it reads the scene and never
 * writes to it, and it only runs when the weekly event carries `theme: 'mall'`.
 *
 * Performance: the district is static, so it is baked once into small tile
 * canvases (16 x 16 cells, made on demand and kept in a small LRU) and the live
 * frame is a handful of drawImage calls plus one pattern stroke, the same cost
 * whatever the track length. Week 1 and every other track never enter this file.
 */
import { planMallDistrict, mulberry32, MALL, MALL_PALETTE } from './mallPlan.js';

export const MALL_THEME = 'mall';
/** 'mall' when the scene's weekly event asks for the mall look; otherwise null (the sim never reads `theme`). */
export function mallThemeOf(scene) { return scene?.weekly?.theme === MALL_THEME ? MALL_THEME : null; }

const TILE = 16, PAD = 0.5, MAX_TILES = 28, MIN_DENSITY = 16, MAX_DENSITY = 48;
const caches = new WeakMap();
const rgbaCache = new Map();
function rgba(hex, a) {
  const key = hex + a;
  let v = rgbaCache.get(key);
  if (!v) { v = `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`; rgbaCache.set(key, v); }
  return v;
}
const WINDOW_LIGHT = ['#bfefff', '#ffe3a8', '#ffc7e6'];
const CAR_COLORS = ['#7a8aa8', '#a85a6a', '#5a8a9a', '#a89a5a', '#6a5aa8'];

function trace(ctx, P) {
  ctx.beginPath();
  P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

// ------------------------------------------------------------- buildings
function windows(ctx, L, rng, color) {
  ctx.fillStyle = '#04070d'; ctx.fillRect(0, 0, L, 0.5);
  for (let x = 0.35; x < L - 1; ) {
    const w = 0.8 + rng() * 0.5;
    if (rng() > 0.14) { ctx.fillStyle = rgba(rng() < 0.35 ? color : WINDOW_LIGHT[Math.floor(rng() * 3)], 0.5 + rng() * 0.25); ctx.fillRect(x, 0.06, w, 0.38); }
    x += w + 0.3 + rng() * 0.2;
  }
}
function awning(ctx, L, color) {
  ctx.fillStyle = rgba(color, 0.58); ctx.fillRect(0, 0.5, L, 0.85);
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  for (let x = 0; x < L; x += 1.0) ctx.fillRect(x + 0.5, 0.5, 0.5, 0.85);
  ctx.fillStyle = rgba(color, 0.95); ctx.fillRect(0, 0.46, L, 0.1);
  // light spilling out onto the walkway
  ctx.fillStyle = rgba(color, 0.07); ctx.fillRect(-0.2, -0.9, L + 0.4, 0.9);
  ctx.fillStyle = rgba(color, 0.07); ctx.fillRect(-0.2, -0.45, L + 0.4, 0.45);
}
function signBar(ctx, x0, x1, y, color, thick = 0.3) {
  ctx.fillStyle = rgba(color, 0.14); ctx.fillRect(x0 - 0.35, y - 0.35, x1 - x0 + 0.7, thick + 0.7);
  ctx.fillStyle = rgba(color, 0.95); ctx.fillRect(x0, y, x1 - x0, thick);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x0, y + thick * 0.35, x1 - x0, thick * 0.2);
}
function hvac(ctx, x, y, s) {
  ctx.fillStyle = '#1a2231'; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = '#3b475d'; ctx.lineWidth = 0.06; ctx.strokeRect(x, y, s, s);
  ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.32, 0, 6.283); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.5, y + s * 0.2); ctx.lineTo(x + s * 0.5, y + s * 0.8); ctx.moveTo(x + s * 0.2, y + s * 0.5); ctx.lineTo(x + s * 0.8, y + s * 0.5); ctx.stroke();
}
function skylight(ctx, x, y, w, h, rng, broken) {
  ctx.fillStyle = 'rgba(159,232,255,.26)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(190,240,255,.65)'; ctx.lineWidth = 0.07; ctx.strokeRect(x, y, w, h);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  if (broken) {
    ctx.fillStyle = '#02040a';
    ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h * 0.2); ctx.lineTo(x + w * 0.62, y + h * 0.1); ctx.lineTo(x + w * 0.75, y + h * 0.6); ctx.lineTo(x + w * 0.4, y + h * 0.85); ctx.lineTo(x + w * 0.15, y + h * 0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(x + w * 0.62, y + h * 0.1); ctx.lineTo(x + w * 0.95, y); ctx.moveTo(x + w * 0.75, y + h * 0.6); ctx.lineTo(x + w, y + h * 0.8); ctx.moveTo(x + w * 0.15, y + h * 0.55); ctx.lineTo(x, y + h * 0.4); ctx.stroke();
  }
}
function roofText(ctx, text, x, y, size, color) {
  ctx.save(); ctx.font = `800 ${size}px Saira, Segoe UI, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(color, 0.55); ctx.fillText(text, x, y); ctx.restore();
}

function drawShop(ctx, b, rng) {
  const { L, D } = b;
  windows(ctx, L, rng, b.color);
  awning(ctx, L, b.color);
  if (D >= 4.8) signBar(ctx, L * 0.16, L * 0.84, 1.75, b.color2);
  if (b.kind === 'anchor') {
    signBar(ctx, L * 0.1, L * 0.9, 2.5, b.color, 0.22);
    ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(1, 3.1, L - 2, D - 4);
    ctx.strokeStyle = rgba(b.color2, 0.55); ctx.lineWidth = 0.1; ctx.strokeRect(1.4, 3.5, L - 2.8, D - 4.8);
  }
  const roofTop = b.kind === 'anchor' ? 3.4 : 2.5, roofH = D - roofTop - 0.6;
  if (roofH < 1.2) return;
  const area = L * D;
  // Roof panelling on the big ones, so a large roof is not an empty slab.
  if (roofH >= 3 && L >= 8) {
    ctx.strokeStyle = 'rgba(140,165,210,.07)'; ctx.lineWidth = 0.06; ctx.strokeRect(0.6, roofTop, L - 1.2, roofH);
    ctx.beginPath(); for (let x = 3.6; x < L - 1; x += 3) { ctx.moveTo(x, roofTop); ctx.lineTo(x, roofTop + roofH); } ctx.stroke();
  }
  const n = Math.min(9, Math.floor(area / 28) + Math.floor(rng() * 2));
  const placed = [];                                   // [x, y, w, h]
  const free = (x, y, w, h) => !placed.some((p) => x < p[0] + p[2] + 0.4 && p[0] < x + w + 0.4 && y < p[1] + p[3] + 0.4 && p[1] < y + h + 0.4);
  if (roofH >= 1.6 && L >= 6 && rng() < 0.6) {         // skylight first, some of them smashed
    const w = Math.min(L - 2, 2 + rng() * 1.8), h = Math.min(roofH - 0.1, 1.3 + rng() * 0.6);
    const x = 0.8 + rng() * Math.max(0.01, L - w - 1.6), y = roofTop + rng() * Math.max(0.01, roofH - h);
    placed.push([x, y, w, h]); skylight(ctx, x, y, w, h, rng, rng() < 0.4);
  }
  const have = placed.length;
  for (let k = 0; k < n * 3 && placed.length - have < n; k++) {
    const sz = 1.0 + rng() * 0.7;
    const x = 0.6 + rng() * Math.max(0.1, L - sz - 1.2), y = roofTop + rng() * Math.max(0.05, roofH - sz);
    if (!free(x, y, sz, sz)) continue;
    placed.push([x, y, sz, sz]); hvac(ctx, x, y, sz);
  }
}

function drawDeck(ctx, b, rng) {
  const { L, D } = b;
  ctx.fillStyle = 'rgba(160,185,220,.05)'; ctx.fillRect(0, 0, L, D);
  windows(ctx, L, rng, '#35e0ff');
  signBar(ctx, L * 0.25, L * 0.75, 0.75, '#35e0ff', 0.26);
  const rows = D >= 9 ? [[1.2, 3.5], [D - 3.5, D - 1.2]] : [[1.2, D - 0.8]];
  ctx.strokeStyle = 'rgba(225,235,255,.34)'; ctx.lineWidth = 0.05;
  for (const [y0, y1] of rows) {
    ctx.beginPath();
    for (let x = 0.8; x <= L - 0.7; x += 1.3) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    ctx.moveTo(0.8, y0); ctx.lineTo(L - 0.7, y0); ctx.moveTo(0.8, y1); ctx.lineTo(L - 0.7, y1);
    ctx.stroke();
    for (let x = 0.8; x + 1.3 <= L - 0.7; x += 1.3) {
      if (rng() < 0.55) {
        ctx.fillStyle = rgba(CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], 0.85);
        const cy = y0 + 0.25, ch = Math.max(0.5, y1 - y0 - 0.5);
        ctx.fillRect(x + 0.22, cy, 0.86, ch);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 0.32, cy + ch * 0.25, 0.66, ch * 0.3);
      }
    }
  }
  if (D >= 9) { // drive aisle chevrons
    ctx.strokeStyle = 'rgba(255,200,90,.35)'; ctx.lineWidth = 0.08;
    for (let x = 2; x < L - 2; x += 3) { ctx.beginPath(); ctx.moveTo(x, D / 2 - 0.35); ctx.lineTo(x + 0.5, D / 2); ctx.lineTo(x, D / 2 + 0.35); ctx.stroke(); }
  }
  if (L > 8 && D > 6) roofText(ctx, 'PARKING', L / 2, D / 2, Math.min(1.5, L / 8), '#cfe8ff');
  ctx.strokeStyle = 'rgba(255,200,90,.5)'; ctx.lineWidth = 0.1; ctx.setLineDash([0.5, 0.4]); ctx.strokeRect(0.25, 0.25, L - 0.5, D - 0.5); ctx.setLineDash([]);
}

function drawAtrium(ctx, b, rng) {
  const { L, D } = b;
  windows(ctx, L, rng, '#ffb23d');
  awning(ctx, L, '#ffb23d');
  signBar(ctx, L * 0.2, L * 0.8, 1.7, '#ff4fa3');
  const x = 1.4, y = 2.6, w = L - 2.8, h = D - 4;
  if (w < 3 || h < 2.5) return;
  const g = ctx.createRadialGradient(L / 2, y + h / 2, 0.2, L / 2, y + h / 2, Math.max(w, h) * 0.6);
  g.addColorStop(0, 'rgba(255,200,120,.55)'); g.addColorStop(1, 'rgba(255,170,80,.06)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,215,150,.85)'; ctx.lineWidth = 0.1; ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(255,220,170,.4)';
  ctx.beginPath(); for (let i = 1; i < 6; i++) { ctx.moveTo(x + (w * i) / 6, y); ctx.lineTo(x + (w * i) / 6, y + h); } ctx.stroke();
  ctx.beginPath(); ctx.ellipse(L / 2, y + h / 2, w * 0.28, h * 0.3, 0, 0, 6.283); ctx.stroke();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 6.283 + rng() * 0.2;
    ctx.fillStyle = rgba(MALL_PALETTE[i % 4], 0.85); ctx.beginPath(); ctx.arc(L / 2 + Math.cos(a) * w * 0.28, y + h / 2 + Math.sin(a) * h * 0.3, 0.2, 0, 6.283); ctx.fill();
  }
  if (w > 8) roofText(ctx, 'FOOD COURT', L / 2, y + h / 2, Math.min(1.6, w / 9), '#fff2cf');
}

function drawEscalator(ctx, b) {
  const { L, D } = b;
  ctx.fillStyle = 'rgba(255,178,61,.07)'; ctx.fillRect(-0.4, -0.9, L + 0.8, D + 1.3);
  ctx.fillStyle = '#12142a'; ctx.fillRect(0, 0, L, D);
  ctx.strokeStyle = 'rgba(255,178,61,.6)'; ctx.lineWidth = 0.1; ctx.strokeRect(0, 0, L, D);
  ctx.fillStyle = 'rgba(255,178,61,.5)'; ctx.fillRect(0, 0, L, 0.18);
  // hazard hatching along the facade
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0.18, L, 0.5); ctx.clip();
  ctx.fillStyle = 'rgba(255,178,61,.55)';
  for (let x = -1; x < L + 1; x += 1.2) { ctx.beginPath(); ctx.moveTo(x, 0.7); ctx.lineTo(x + 0.6, 0.18); ctx.lineTo(x + 1.0, 0.18); ctx.lineTo(x + 0.4, 0.7); ctx.fill(); }
  ctx.restore();
  // two landings and the diagonal flight between them
  const A = [1.9, D - 1.1], Z = [L - 1.9, 1.9];
  ctx.fillStyle = '#273252'; ctx.fillRect(A[0] - 1.1, A[1] - 0.2, 2.2, 1.0); ctx.fillRect(Z[0] - 1.1, Z[1] - 0.8, 2.2, 1.0);
  const dx = Z[0] - A[0], dy = Z[1] - A[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux, hw = 1.1;
  const flight = (t0, t1, ox, oy, rot, ragged) => {
    ctx.save(); ctx.translate(A[0] + ux * len * t0 + ox, A[1] + uy * len * t0 + oy); ctx.rotate(rot);
    const l = len * (t1 - t0), px = ux, py = uy;
    ctx.save(); ctx.transform(px, py, nx, ny, 0, 0);
    ctx.fillStyle = '#2a3552'; ctx.fillRect(0, -hw, l, hw * 2);
    ctx.strokeStyle = 'rgba(190,205,240,.3)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); for (let s = 0.3; s < l; s += 0.45) { if (ragged && (s * 7) % 3 < 0.9) continue; ctx.moveTo(s, -hw + 0.1); ctx.lineTo(s, hw - 0.1); } ctx.stroke();
    ctx.strokeStyle = '#ffb23d'; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.moveTo(0, -hw); ctx.lineTo(l, -hw); ctx.moveTo(0, hw); ctx.lineTo(l, hw); ctx.stroke();
    ctx.restore(); ctx.restore();
  };
  flight(0, 0.42, 0, 0, 0, false);
  flight(0.58, 1, 0.55, 0.5, 0.1, true);
  // the break: a dark void with glowing jagged edges and fallen steps
  const cx = A[0] + dx * 0.5, cy = A[1] + dy * 0.5;
  ctx.save(); ctx.translate(cx, cy); ctx.transform(ux, uy, nx, ny, 0, 0);
  ctx.fillStyle = '#02040a'; ctx.beginPath(); ctx.moveTo(-0.75, -hw - 0.1); ctx.lineTo(0.2, -hw * 0.3); ctx.lineTo(-0.2, 0.2); ctx.lineTo(0.55, hw * 0.6); ctx.lineTo(0.75, hw + 0.2); ctx.lineTo(1.4, hw + 0.2); ctx.lineTo(1.4, -hw - 0.2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,60,.85)'; ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.moveTo(-0.75, -hw - 0.1); ctx.lineTo(0.2, -hw * 0.3); ctx.lineTo(-0.2, 0.2); ctx.lineTo(0.55, hw * 0.6); ctx.lineTo(0.75, hw + 0.2); ctx.stroke();
  ctx.fillStyle = '#3a4668'; ctx.fillRect(0.3, -0.5, 0.5, 0.25); ctx.fillRect(0.9, 0.1, 0.4, 0.22); ctx.fillRect(-0.3, 0.45, 0.45, 0.2);
  ctx.restore();
  // out-of-order cross at the foot of the flight
  ctx.strokeStyle = 'rgba(255,70,70,.9)'; ctx.lineWidth = 0.2;
  ctx.beginPath(); ctx.moveTo(A[0] - 0.6, A[1] - 0.1); ctx.lineTo(A[0] + 0.6, A[1] + 0.6); ctx.moveTo(A[0] + 0.6, A[1] - 0.1); ctx.lineTo(A[0] - 0.6, A[1] + 0.6); ctx.stroke();
}

function drawBuilding(ctx, b) {
  const rng = mulberry32(b.seed);
  ctx.save();
  ctx.transform(b.m[0], b.m[1], b.m[2], b.m[3], b.m[4], b.m[5]);
  if (b.kind === 'escalator') { drawEscalator(ctx, b); ctx.restore(); return; }
  ctx.fillStyle = b.kind === 'deck' ? '#131a26' : b.tone; ctx.fillRect(0, 0, b.L, b.D);
  ctx.strokeStyle = rgba(b.far ? '#5b6a86' : b.color, b.far ? 0.5 : 0.42); ctx.lineWidth = 0.09; ctx.strokeRect(0, 0, b.L, b.D);
  if (b.kind === 'deck') drawDeck(ctx, b, rng);
  else if (b.kind === 'atrium') drawAtrium(ctx, b, rng);
  else drawShop(ctx, b, rng);
  ctx.restore();
}

// ------------------------------------------------------------- the district
function drawDistrict(ctx, plan, view) {
  const P = plan.points, R = plan.R, w = plan.width;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Chunks of slab drifting past the edge.
  for (const d of plan.debris) {
    if (d.x + d.r < view.minX || d.x - d.r > view.maxX || d.y + d.r < view.minY || d.y - d.r > view.maxY) continue;
    ctx.beginPath(); d.verts.forEach(([x, y], i) => (i ? ctx.lineTo(d.x + x, d.y + y) : ctx.moveTo(d.x + x, d.y + y))); ctx.closePath();
    ctx.fillStyle = '#0c141e'; ctx.fill(); ctx.strokeStyle = d.hue ? 'rgba(255,79,163,.5)' : 'rgba(90,150,180,.5)'; ctx.lineWidth = 0.12; ctx.stroke();
  }
  // The slab: a glowing rim, a lit edge band, then the floor.
  trace(ctx, P);
  ctx.strokeStyle = 'rgba(80,200,230,.07)'; ctx.lineWidth = R * 2 + 2.6; ctx.stroke();
  ctx.strokeStyle = '#3d6073'; ctx.lineWidth = R * 2 + 0.7; ctx.stroke();
  ctx.strokeStyle = '#1a2b3b'; ctx.lineWidth = R * 2; ctx.stroke();
  ctx.strokeStyle = '#0a1018'; ctx.lineWidth = R * 2 - 1.4; ctx.stroke();
  // Panel seams on the slab (only where the slab already is).
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.strokeStyle = 'rgba(110,150,185,.07)'; ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (let x = Math.floor(view.minX / 6) * 6; x <= view.maxX; x += 6) { ctx.moveTo(x, view.minY); ctx.lineTo(x, view.maxY); }
  for (let y = Math.floor(view.minY / 6) * 6; y <= view.maxY; y += 6) { ctx.moveTo(view.minX, y); ctx.lineTo(view.maxX, y); }
  ctx.stroke(); ctx.restore();
  // The walkway band the rails sit in.
  trace(ctx, P);
  ctx.strokeStyle = 'rgba(120,140,220,.5)'; ctx.lineWidth = w + 2 * (MALL.RAIL_MARGIN - 0.12) + 0.22; ctx.stroke();
  ctx.strokeStyle = '#161a2b'; ctx.lineWidth = w + 2 * (MALL.RAIL_MARGIN - 0.12); ctx.stroke();
  // Slab edge beacons and walkway lamps.
  for (const [x, y, c] of plan.edgeLights) {
    if (x < view.minX - 1 || x > view.maxX + 1 || y < view.minY - 1 || y > view.maxY + 1) continue;
    const col = c ? '#35e0ff' : '#ff4fa3';
    ctx.fillStyle = rgba(col, 0.16); ctx.beginPath(); ctx.arc(x, y, 0.75, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(x, y, 0.2, 0, 6.283); ctx.fill();
  }
  for (const [x, y, c] of plan.lamps) {
    if (x < view.minX - 1 || x > view.maxX + 1 || y < view.minY - 1 || y > view.maxY + 1) continue;
    const col = c === 1 ? '#ffb23d' : '#ffe3a8';
    ctx.fillStyle = rgba(col, 0.035); ctx.beginPath(); ctx.arc(x, y, 0.45, 0, 6.283); ctx.fill();
    ctx.fillStyle = rgba(col, 0.85); ctx.beginPath(); ctx.arc(x, y, 0.1, 0, 6.283); ctx.fill();
  }
  for (const b of plan.rects) {
    if (b.box[2] < view.minX || b.box[0] > view.maxX || b.box[3] < view.minY || b.box[1] > view.maxY) continue;
    drawBuilding(ctx, b);
  }
  ctx.restore();
}

// ------------------------------------------------------------- tile cache
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
function cacheFor(scene) {
  const key = scene.track;
  let c = caches.get(key);
  if (!c) {
    const plan = planMallDistrict(scene.track, { landmarkAt: scene.weekly?.track?.landmarkAt || null, sentries: scene.sentries || [] });
    c = { plan, tiles: new Map(), density: 0, tick: 0, content: new Map(), pending: [] };
    caches.set(key, c);
  }
  return c;
}
function tileHasContent(c, tx, ty) {
  const k = `${tx},${ty}`;
  let v = c.content.get(k);
  if (v === undefined) {
    const { plan } = c;
    const x0 = tx * TILE - PAD, y0 = ty * TILE - PAD, s = TILE + PAD * 2;
    const half = s / 2 * 1.4143;
    let near = false;
    // Nearest-centreline test for the tile centre, cheap and conservative.
    let best = Infinity;
    for (let i = 0; i < plan.points.length; i++) {
      const a = plan.points[i], b = plan.points[(i + 1) % plan.points.length];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x0 + s / 2 - a.x) * dx + (y0 + s / 2 - a.y) * dy) / l2));
      best = Math.min(best, Math.hypot(x0 + s / 2 - a.x - dx * t, y0 + s / 2 - a.y - dy * t));
    }
    near = best <= plan.R + 1.5 + half;
    if (!near) near = plan.debris.some((d) => d.x + d.r >= x0 && d.x - d.r <= x0 + s && d.y + d.r >= y0 && d.y - d.r <= y0 + s);
    c.content.set(k, v = near);
  }
  return v;
}
function bakeTile(c, tx, ty) {
  const d = c.density;
  const size = Math.ceil((TILE + PAD * 2) * d);
  const canvas = makeCanvas(size, size);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const x0 = tx * TILE - PAD, y0 = ty * TILE - PAD;
  g.setTransform(d, 0, 0, d, -x0 * d, -y0 * d);
  drawDistrict(g, c.plan, { minX: x0, minY: y0, maxX: x0 + size / d, maxY: y0 + size / d });
  return { canvas, x0, y0, cells: size / d };
}

/**
 * World-space, under the circuit. `ctx` already carries the camera transform; `unit` is px per cell.
 * Bakes missing tiles lazily (a few per frame), draws the visible ones, then the landmark label.
 */
export function drawMallDistrict(ctx, scene, unit, { time = 0, reducedMotion = false, viewRot = 0 } = {}) {
  if (!mallThemeOf(scene) || !scene.track) return;
  const c = cacheFor(scene);
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) * unit;            // device px per cell
  const want = Math.max(MIN_DENSITY, Math.min(MAX_DENSITY, Math.ceil(scale / 8) * 8));
  if (!c.density || want > c.density + 7 || want < c.density * 0.6) { c.tiles.clear(); c.density = want; }
  // The visible world rectangle, in cells.
  const inv = m.inverse(), cw = ctx.canvas.width, ch = ctx.canvas.height;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [sx, sy] of [[0, 0], [cw, 0], [cw, ch], [0, ch]]) {
    const p = inv.transformPoint({ x: sx, y: sy });
    minX = Math.min(minX, p.x / unit); maxX = Math.max(maxX, p.x / unit); minY = Math.min(minY, p.y / unit); maxY = Math.max(maxY, p.y / unit);
  }
  const t0x = Math.floor((minX - 1) / TILE), t1x = Math.floor((maxX + 1) / TILE), t0y = Math.floor((minY - 1) / TILE), t1y = Math.floor((maxY + 1) / TILE);
  c.tick++;
  let baked = 0;
  const tileFor = (tx, ty, budget) => {
    if (!tileHasContent(c, tx, ty)) return null;
    const k = `${tx},${ty}`;
    let t = c.tiles.get(k);
    if (!t) {
      if (baked >= budget) return null;
      t = bakeTile(c, tx, ty); baked++;
      if (!t) return null;
      c.tiles.set(k, t);
    }
    t.used = c.tick;
    return t;
  };
  for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
    const t = tileFor(tx, ty, 6);
    if (t) ctx.drawImage(t.canvas, t.x0 * unit, t.y0 * unit, t.cells * unit, t.cells * unit);
  }
  // One tile of look-ahead per frame so the district never pops in at speed.
  if (baked === 0) {
    outer: for (let ty = t0y - 1; ty <= t1y + 1; ty++) for (let tx = t0x - 1; tx <= t1x + 1; tx++) {
      if (tx >= t0x && tx <= t1x && ty >= t0y && ty <= t1y) continue;
      if (tileHasContent(c, tx, ty) && !c.tiles.has(`${tx},${ty}`)) { tileFor(tx, ty, 1); break outer; }
    }
  }
  if (c.tiles.size > MAX_TILES) {
    const old = [...c.tiles.entries()].sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
    for (const [k] of old.slice(0, c.tiles.size - MAX_TILES)) c.tiles.delete(k);
  }
  drawLandmarkLive(ctx, scene, c.plan, unit, time, reducedMotion, viewRot, { minX, minY, maxX, maxY });
}

/** Screen-upright label and a slow warning beacon at the escalator. */
function drawLandmarkLive(ctx, scene, plan, unit, time, reducedMotion, viewRot, view) {
  const b = plan.landmark;
  if (!b || b.box[2] < view.minX || b.box[0] > view.maxX || b.box[3] < view.minY || b.box[1] > view.maxY) return;
  const text = String(scene.layout?.landmark || scene.weekly?.track?.landmark || 'The Broken Escalator').toUpperCase();
  ctx.save();
  // Beacon on the break (the middle of the diagonal flight).
  const bx = b.m[0] * (b.L / 2) + b.m[2] * (b.D / 2 + 0.4) + b.m[4], by = b.m[1] * (b.L / 2) + b.m[3] * (b.D / 2 + 0.4) + b.m[5];
  const pulse = reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(time * 3.2);
  ctx.fillStyle = `rgba(255,90,60,${0.1 + pulse * 0.14})`; ctx.beginPath(); ctx.arc(bx * unit, by * unit, 1.2 * unit, 0, 6.283); ctx.fill();
  ctx.fillStyle = `rgba(255,120,80,${0.55 + pulse * 0.4})`; ctx.beginPath(); ctx.arc(bx * unit, by * unit, 0.2 * unit, 0, 6.283); ctx.fill();
  // Label, upright on screen like the ghost name tags.
  const px = Math.max(10, unit * 0.36);
  ctx.translate(b.cx * unit, b.cy * unit); ctx.rotate(-viewRot);
  ctx.font = `700 ${px}px Saira, Consolas, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const wText = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(6,8,16,.78)'; ctx.fillRect(-wText / 2 - px * 0.5, -px * 0.8, wText + px, px * 1.6);
  ctx.strokeStyle = 'rgba(255,178,61,.8)'; ctx.lineWidth = 1; ctx.strokeRect(-wText / 2 - px * 0.5, -px * 0.8, wText + px, px * 1.6);
  ctx.fillStyle = '#ffd08a'; ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------- lane floor
let floorPattern = null;
function laneFloor(ctx, unit) {
  if (floorPattern === false) return null;
  if (!floorPattern) {
    try {
      const c = makeCanvas(96, 96);
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(255,120,200,.03)'; g.fillRect(0, 0, 48, 48); g.fillRect(48, 48, 48, 48);
      g.strokeStyle = 'rgba(190,210,255,.075)'; g.lineWidth = 1.5;
      g.strokeRect(0.75, 0.75, 47.5, 47.5); g.strokeRect(48.75, 0.75, 47.5, 47.5); g.strokeRect(0.75, 48.75, 47.5, 47.5); g.strokeRect(48.75, 48.75, 47.5, 47.5);
      floorPattern = { c, pat: null };
    } catch { floorPattern = false; return null; }
  }
  return floorPattern;
}
/** Over the lane, under mines/shards/ships: a very faint tiled concourse floor. */
export function drawMallLane(ctx, scene, unit) {
  if (!mallThemeOf(scene) || !scene.track?.points?.length) return;
  const f = laneFloor(ctx, unit);
  if (!f) return;
  const pat = ctx.createPattern(f.c, 'repeat');
  if (!pat) return;
  const s = (1.6 * 2 * unit) / 96;                       // two 1.6-cell tiles per bitmap
  try { pat.setTransform(new DOMMatrix().scale(s, s)); } catch { /* an unscaled floor is still fine */ }
  const P = scene.track.points;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p.x * unit, p.y * unit) : ctx.moveTo(p.x * unit, p.y * unit))); ctx.closePath();
  ctx.strokeStyle = pat; ctx.lineWidth = (scene.track.width - 0.5) * unit; ctx.stroke();
  ctx.restore();
}
