// Small geometry for the on-foot layers. Pure: no DOM, no randomness.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const len = (x, y) => Math.hypot(x, y);
export const TAU = Math.PI * 2;
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Pushes a circle out of an axis-aligned rect {x,y,w,h}. Returns the push {x,y} or null. */
export function circleRectPush(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  let dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
  }
  // Centre inside the rect: leave by the nearest side.
  const left = cx - rect.x, right = rect.x + rect.w - cx, top = cy - rect.y, bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -(left + r), y: 0 };
  if (m === right) return { x: right + r, y: 0 };
  if (m === top) return { x: 0, y: -(top + r) };
  return { x: 0, y: bottom + r };
}

/** First hit of segment (x0,y0)->(x1,y1) with a rect, as t in [0,1], or null (slab test). */
export function segRect(x0, y0, x1, y1, rect, pad = 0) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const edges = [[-dx, x0 - (rect.x - pad)], [dx, rect.x + rect.w + pad - x0], [-dy, y0 - (rect.y - pad)], [dy, rect.y + rect.h + pad - y0]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return t0;
}

export const pointInRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Moves a circle by (dx,dy) against a list of solid rects, sliding along them. Mutates and returns body. */
export function moveCircle(body, dx, dy, r, solids, bounds) {
  // Two half steps keep fast movers from tunnelling through thin walls.
  for (let i = 0; i < 2; i++) {
    body.x += dx / 2; body.y += dy / 2;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of solids) {
        if (body.x + r < s.x || body.x - r > s.x + s.w || body.y + r < s.y || body.y - r > s.y + s.h) continue;
        const p = circleRectPush(body.x, body.y, r, s);
        if (!p) continue;
        body.x += p.x; body.y += p.y;
        // Kill the velocity into the wall so the body slides instead of sticking.
        if (body.vx !== undefined) {
          const pl = Math.hypot(p.x, p.y) || 1, nx = p.x / pl, ny = p.y / pl;
          const into = body.vx * nx + body.vy * ny;
          if (into < 0) { body.vx -= into * nx; body.vy -= into * ny; }
        }
      }
    }
  }
  if (bounds) { body.x = clamp(body.x, r, bounds.w - r); body.y = clamp(body.y, r, bounds.h - r); }
  return body;
}

/** True when nothing in `blockers` crosses the segment. */
export function lineOfSight(x0, y0, x1, y1, blockers) {
  for (const b of blockers) if (segRect(x0, y0, x1, y1, b) !== null) return false;
  return true;
}

/**
 * The art's box BEFORE the prop was turned. Map data stores a prop's `size`
 * as the footprint after turning (a 2x1 desk turned a quarter has size 1x2),
 * so art for a quarter-turned prop must be fitted into the swapped box and
 * then rotated, or it comes out squashed. A free angle (scattered rocks,
 * a few degrees of jitter) is not a turn: its size is already the art's box.
 * Returns { w, h, turned }.
 */
export function unturnedBox(w, h, rot = 0) {
  const quarter = Math.round(rot / (Math.PI / 2));
  const exact = Math.abs(rot - quarter * (Math.PI / 2)) < 0.25;
  const turned = exact && Math.abs(quarter) % 2 === 1;
  return turned ? { w: h, h: w, turned } : { w, h, turned };
}
