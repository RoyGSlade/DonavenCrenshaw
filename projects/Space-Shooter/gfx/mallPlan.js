/**
 * The Abandoned Mall, planned from the track. PURE and VISUAL ONLY: no DOM, no
 * clock, no Math.random, and it never touches the simulation. The same track
 * always gives the same district, so a replay screenshot matches the live game.
 *
 * The lane is the concourse. Around it sits a floating district: a floor slab
 * that follows the track (the "island": everything within `R` of the
 * centreline), a walkway band just outside the rails, and buildings packed into
 * whatever free space is left, including the gaps between neighbouring legs.
 * Every building rectangle stays farther than `width / 2 + RAIL_MARGIN` from the
 * centreline, so nothing can sit on the lane or its rails.
 */

export const MALL = Object.freeze({
  RAIL_MARGIN: 2.4,     // building edge to the lane edge, cells (the walkway)
  ISLAND_EXTRA: 15,     // the slab reaches this far past the lane edge
  GAP: 0.7,             // alley between neighbouring buildings
  BUCKET: 16,
});
export const MALL_PALETTE = Object.freeze(['#ff4fa3', '#35e0ff', '#ffb23d', '#a174ff']);
export const MALL_TONES = Object.freeze(['#0e1424', '#121a2c', '#10161f', '#17132a']);

export function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function trackSeed(points, width, name = '') {
  let h = 2166136261;
  const eat = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  eat(`${name}|${width.toFixed(3)}|`);
  for (const p of points) eat(`${p.x.toFixed(3)},${p.y.toFixed(3)};`);
  return h >>> 0;
}

// ---------------------------------------------------------------- geometry
export function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
export function distToPolyline(px, py, P) {
  let best = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const d = ptSegDist(px, py, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}
function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
function segsCross(a, b, c, d) {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  return ((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0));
}
function segSegDist(a, b, c, d) {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(
    ptSegDist(a[0], a[1], c[0], c[1], d[0], d[1]), ptSegDist(b[0], b[1], c[0], c[1], d[0], d[1]),
    ptSegDist(c[0], c[1], a[0], a[1], b[0], b[1]), ptSegDist(d[0], d[1], a[0], a[1], b[0], b[1]),
  );
}
/** r = { cx, cy, ux, uy, hu, hv }: centre, unit axis u, half sizes along u and along v = (-uy, ux). */
export function rectCorners(r) {
  const vx = -r.uy, vy = r.ux;
  const out = [];
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([r.cx + r.ux * r.hu * su + vx * r.hv * sv, r.cy + r.uy * r.hu * su + vy * r.hv * sv]);
  return out;
}
export function pointInRect(r, x, y) {
  const dx = x - r.cx, dy = y - r.cy;
  return Math.abs(dx * r.ux + dy * r.uy) <= r.hu && Math.abs(-dx * r.uy + dy * r.ux) <= r.hv;
}
/** Exact nearest distance between a rectangle (filled) and the closed centreline; 0 when they touch or overlap. */
export function rectDistToPolyline(r, P) {
  const q = rectCorners(r);
  const rad = Math.hypot(r.hu, r.hv);
  let best = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (ptSegDist(r.cx, r.cy, a.x, a.y, b.x, b.y) - rad >= best) continue;
    if (pointInRect(r, a.x, a.y) || pointInRect(r, b.x, b.y)) return 0;
    for (let k = 0; k < 4; k++) {
      const d = segSegDist(q[k], q[(k + 1) % 4], [a.x, a.y], [b.x, b.y]);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}
/** SAT overlap of two rectangles, each inflated by gap / 2. */
export function rectsOverlap(a, b, gap = 0) {
  const g = gap / 2;
  for (const r of [a, b]) {
    const axes = [[r.ux, r.uy], [-r.uy, r.ux]];
    for (const [ax, ay] of axes) {
      const pa = Math.abs(a.ux * ax + a.uy * ay) * a.hu + Math.abs(-a.uy * ax + a.ux * ay) * a.hv + g;
      const pb = Math.abs(b.ux * ax + b.uy * ay) * b.hu + Math.abs(-b.uy * ax + b.ux * ay) * b.hv + g;
      const dist = Math.abs((b.cx - a.cx) * ax + (b.cy - a.cy) * ay);
      if (dist >= pa + pb) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- the plan
const norm = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });
const FACE_NORMAL = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // in the rectangle's own (u, v) frame

function finish(r, face, kind, rng, extra = {}) {
  const vx = -r.uy, vy = r.ux;
  const [fu, fv] = FACE_NORMAL[face];
  const nx = r.ux * fu + vx * fv, ny = r.uy * fu + vy * fv;          // out of the building, toward the lane
  const depth = (face % 2 === 0 ? r.hu : r.hv) * 2, length = (face % 2 === 0 ? r.hv : r.hu) * 2;
  const ax = -ny, ay = nx;                                           // along the facade
  const ox = r.cx + nx * depth / 2 - ax * length / 2, oy = r.cy + ny * depth / 2 - ay * length / 2;
  const ex = Math.abs(r.ux) * r.hu + Math.abs(vx) * r.hv, ey = Math.abs(r.uy) * r.hu + Math.abs(vy) * r.hv;
  return {
    ...r, kind, face, L: length, D: depth,
    m: [ax, ay, -nx, -ny, ox, oy],                                   // local x along the facade, local y into the building
    box: [r.cx - ex, r.cy - ey, r.cx + ex, r.cy + ey],
    seed: Math.floor(rng() * 4294967295) >>> 0,
    color: MALL_PALETTE[Math.floor(rng() * MALL_PALETTE.length)],
    color2: MALL_PALETTE[Math.floor(rng() * MALL_PALETTE.length)],
    tone: MALL_TONES[Math.floor(rng() * MALL_TONES.length)],
    ...extra,
  };
}

/**
 * Plan the district for a track { points, width, name? } (points are {x,y} or [x,y]).
 * Options: landmarkAt { seg, t } to pin the escalator; sentries [{x,y}] to keep lamps clear.
 */
export function planMallDistrict(track, { landmarkAt = null, sentries = [] } = {}) {
  const width = track.width;
  const P = track.points.map(norm);
  const n = P.length;
  const seed = trackSeed(P, width, track.name || track.title || '');
  const rng = mulberry32(seed);
  const pick = (a, b) => a + (b - a) * rng();
  const thr = width / 2 + MALL.RAIL_MARGIN;
  const R = width / 2 + MALL.ISLAND_EXTRA;
  const segs = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len, start: total });
    total += len;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const bounds = { minX: minX - R - 14, minY: minY - R - 14, maxX: maxX + R + 14, maxY: maxY + R + 14 };

  const rects = [];
  const index = new Map();
  const B = MALL.BUCKET;
  const forBuckets = (box, fn) => {
    for (let bx = Math.floor(box[0] / B); bx <= Math.floor(box[2] / B); bx++) for (let by = Math.floor(box[1] / B); by <= Math.floor(box[3] / B); by++) fn(`${bx},${by}`);
  };
  const boxOf = (r) => {
    const vx = -r.uy, vy = r.ux;
    const ex = Math.abs(r.ux) * r.hu + Math.abs(vx) * r.hv, ey = Math.abs(r.uy) * r.hu + Math.abs(vy) * r.hv;
    return [r.cx - ex, r.cy - ey, r.cx + ex, r.cy + ey];
  };
  const inIsland = (r, limit) => {
    const vx = -r.uy, vy = r.ux;
    const nu = Math.max(1, Math.ceil(r.hu * 2 / 3)), nv = Math.max(1, Math.ceil(r.hv * 2 / 3));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      if (i > 0 && i < nu && j > 0 && j < nv) continue;           // the boundary is what can leave the slab
      const u = -r.hu + (2 * r.hu * i) / nu, v = -r.hv + (2 * r.hv * j) / nv;
      if (distToPolyline(r.cx + r.ux * u + vx * v, r.cy + r.uy * u + vy * v, P) > limit) return false;
    }
    return true;
  };
  const fits = (r, gap = MALL.GAP) => {
    if (rectDistToPolyline(r, P) <= thr + 0.02) return false;
    if (!inIsland(r, R - 0.8)) return false;
    const box = boxOf(r);
    let clash = false;
    forBuckets(box, (key) => { if (clash) return; for (const i of index.get(key) || []) if (rectsOverlap(r, rects[i], gap)) { clash = true; return; } });
    return !clash;
  };
  const add = (b) => {
    const i = rects.push(b) - 1;
    forBuckets(b.box, (key) => { if (!index.has(key)) index.set(key, []); index.get(key).push(i); });
    return b;
  };
  const along = (d) => {
    const a = ((d % total) + total) % total;
    const s = segs.find((q) => a <= q.start + q.len) || segs.at(-1);
    return { x: s.ax + s.tx * (a - s.start), y: s.ay + s.ty * (a - s.start), tx: s.tx, ty: s.ty };
  };

  // 1. The landmark: a broken escalator beside the walkway, a third of the way round.
  let landmark = null;
  {
    const base = landmarkAt && Number.isInteger(landmarkAt.seg) && segs[landmarkAt.seg]
      ? segs[landmarkAt.seg].start + segs[landmarkAt.seg].len * Math.max(0, Math.min(1, landmarkAt.t ?? 0.5)) : total / 3;
    const first = rng() < 0.5 ? 1 : -1;
    search: for (let step = 0; step <= 16; step++) {
      for (const shift of step === 0 ? [0] : [step * 3, -step * 3]) {
        const p = along(base + shift);
        for (const side of [first, -first]) {
          const hu = 6, hv = 3.5;
          const nx = -p.ty, ny = p.tx;
          const r = { cx: p.x + nx * side * (thr + hv + 0.06), cy: p.y + ny * side * (thr + hv + 0.06), ux: p.tx, uy: p.ty, hu, hv };
          if (fits(r)) { landmark = add(finish(r, side > 0 ? 3 : 1, 'escalator', rng)); break search; }
        }
      }
    }
  }

  // 2. Anchor stores at the big corners, on the outside of the turn.
  const corners = [];
  for (let i = 0; i < n; i++) {
    const a = segs[(i - 1 + n) % n], b = segs[i];
    const bx = a.tx + b.tx, by = a.ty + b.ty, m = Math.hypot(bx, by);
    if (m < 0.3) continue;
    const turn = Math.acos(Math.max(-1, Math.min(1, a.tx * b.tx + a.ty * b.ty)));
    if (turn < 0.6) continue;
    const sign = Math.sign(a.tx * b.ty - a.ty * b.tx) || 1;
    corners.push({ i, turn, x: P[i].x, y: P[i].y, ox: (by / m) * sign, oy: (-bx / m) * sign });  // outside of the turn
  }
  corners.sort((p, q) => q.turn - p.turn || p.i - q.i);
  for (const c of corners.slice(0, 14)) {
    const hu = pick(4.2, 5.2), hv = pick(6.5, 9);
    for (let k = 0; k < 14; k++) {
      const d = thr + hu + 0.06 + k * 0.5;
      const r = { cx: c.x + c.ox * d, cy: c.y + c.oy * d, ux: c.ox, uy: c.oy, hu, hv };
      if (fits(r)) { add(finish(r, 2, 'anchor', rng)); break; }
    }
  }

  // 3. Frontage rows hugging both rails, facades toward the lane.
  for (const s of segs) {
    const nx = -s.ty, ny = s.tx;
    for (const side of [1, -1]) {
      let pos = pick(0, 2);
      while (pos < s.len) {
        let placed = false;
        const L0 = pick(5, 11), D0 = pick(4.5, 7.5);
        for (const [fl, fd] of [[1, 1], [0.7, 1], [0.55, 0.8]]) {
          const L = Math.max(3.4, L0 * fl), D = Math.max(4, D0 * fd);
          const mid = pos + L / 2;
          const px = s.ax + s.tx * mid, py = s.ay + s.ty * mid;
          const r = { cx: px + nx * side * (thr + D / 2 + 0.06), cy: py + ny * side * (thr + D / 2 + 0.06), ux: s.tx, uy: s.ty, hu: L / 2, hv: D / 2 };
          if (fits(r)) { add(finish(r, side > 0 ? 3 : 1, 'shop', rng)); pos += L + pick(0.5, 1.4); placed = true; break; }
        }
        if (!placed) pos += 2;
      }
    }
  }

  // 4. Infill: grow rectangles into whatever free space is left (the gaps between legs, behind the rows).
  const seeds = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += 2) for (let y = bounds.minY; y <= bounds.maxY; y += 2) {
    const d = distToPolyline(x, y, P);
    if (d > thr + 2 && d < R - 1.5) seeds.push({ x: x + pick(-0.6, 0.6), y: y + pick(-0.6, 0.6), key: d + pick(0, 3) });
  }
  seeds.sort((p, q) => p.key - q.key);
  let atria = 0;
  const maxAtria = Math.max(1, Math.round(total / 800));
  for (const sd of seeds) {
    let h = { cx: sd.x, cy: sd.y, ux: 1, uy: 0, hu: 2, hv: 2 };
    if (!fits(h)) continue;
    const capU = pick(4.5, 9), capV = pick(3.5, 7);
    for (let pass = 0; pass < 14; pass++) {
      let grew = false;
      for (const [dim, dir] of [['hu', 1], ['hu', -1], ['hv', 1], ['hv', -1]]) {
        if (h[dim] + 0.5 > (dim === 'hu' ? capU : capV)) continue;
        const next = { ...h, [dim]: h[dim] + 0.5 };
        if (dim === 'hu') next.cx += dir * 0.5; else next.cy += dir * 0.5;
        if (fits(next)) { h = next; grew = true; }
      }
      if (!grew) break;
    }
    const area = 4 * h.hu * h.hv;
    // Face the lane: the axis-aligned edge whose outward normal points at the nearest centreline point.
    let near = null, nd = Infinity;
    for (const s of segs) {
      const t = Math.max(0, Math.min(1, ((h.cx - s.ax) * s.tx + (h.cy - s.ay) * s.ty) / s.len));
      const qx = s.ax + s.tx * s.len * t, qy = s.ay + s.ty * s.len * t, dd = Math.hypot(h.cx - qx, h.cy - qy);
      if (dd < nd) { nd = dd; near = [qx - h.cx, qy - h.cy]; }
    }
    let face = 0, bestDot = -Infinity;
    FACE_NORMAL.forEach(([fu, fv], f) => { const dd = (fu * near[0] + fv * near[1]) / (Math.hypot(...near) || 1); if (dd > bestDot) { bestDot = dd; face = f; } });
    let kind = 'shop';
    if (area >= 110 && atria < maxAtria) { kind = 'atrium'; atria++; }
    else if (area >= 70 && rng() < 0.45) kind = 'deck';
    add(finish(h, face, kind, rng, { far: nd > thr + 9 }));
  }

  // 5. Details: lamps along the walkway, beacons on the slab edge, debris past it.
  const lamps = [], edgeLights = [];
  for (const s of segs) {
    const nx = -s.ty, ny = s.tx;
    for (const side of [1, -1]) {
      for (let d = 3.5; d < s.len - 2; d += 7) {
        const x = s.ax + s.tx * d + nx * side * (width / 2 + 1.3), y = s.ay + s.ty * d + ny * side * (width / 2 + 1.3);
        if (distToPolyline(x, y, P) < width / 2 + 1.2) continue;
        if (sentries.some((q) => Math.hypot(q.x - x, q.y - y) < 1.8)) continue;
        lamps.push([x, y, lamps.length % 3 === 0 ? 1 : 2]);
      }
      for (let d = 2; d < s.len - 1; d += 6) {
        const x = s.ax + s.tx * d + nx * side * R, y = s.ay + s.ty * d + ny * side * R;
        if (distToPolyline(x, y, P) < R - 0.1) continue;
        edgeLights.push([x, y, edgeLights.length % 2]);
      }
    }
  }
  const debris = [];
  const wanted = Math.max(8, Math.min(90, Math.round(total / 12)));
  for (let tries = 0; tries < wanted * 6 && debris.length < wanted; tries++) {
    const p = along(rng() * total), side = rng() < 0.5 ? 1 : -1, off = R + pick(2.5, 11);
    const x = p.x - p.ty * side * off, y = p.y + p.tx * side * off;
    if (distToPolyline(x, y, P) < R + 2) continue;
    const r = pick(0.8, 3), rot = pick(0, 6.283), count = 5 + Math.floor(rng() * 2);
    const verts = [];
    for (let k = 0; k < count; k++) { const a = (k / count) * 6.283 + pick(-0.3, 0.3), q = r * pick(0.65, 1); verts.push([Math.cos(a + rot) * q, Math.sin(a + rot) * q]); }
    debris.push({ x, y, r, verts, hue: rng() < 0.3 ? 1 : 0 });
  }

  return { seed, width, R, thr, points: P, total, bounds, rects, landmark, lamps, edgeLights, debris };
}
