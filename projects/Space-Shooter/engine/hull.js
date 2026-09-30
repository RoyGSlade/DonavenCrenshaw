// The player ship's exact body as a collision shape, and the polygon maths
// the hull needs: world placement, point/segment/circle tests with a
// penetration normal. Pure and deterministic (no Math.random, no clock), so
// the weekly replays stay exact. The lane (track) tests live in track.js.
//
// Conventions: a hull is ship-local [x, y] with x = right and y = forward
// (engine/shipHull.js). In the world the ship faces (cos a, sin a) and its
// right is (-sin a, cos a) — the way drawCourier rotates the sprite by
// a + PI/2 on the y-down canvas.
import { SHIP_HULL, SHIP_BODY } from "./shipHull.js";

function describe(points) {
  let radius = 0, halfSpan = 0, nose = -Infinity, tail = Infinity;
  for (const [x, y] of points) {
    radius = Math.max(radius, Math.hypot(x, y));
    halfSpan = Math.max(halfSpan, Math.abs(x));
    nose = Math.max(nose, y);
    tail = Math.min(tail, y);
  }
  // Smallest reach of the body from its centre over all directions (the
  // support function of the outline), sampled every half degree.
  let minReach = Infinity;
  for (let k = 0; k < 720; k++) {
    const a = (k / 720) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
    let h = -Infinity;
    for (const [x, y] of points) h = Math.max(h, x * ux + y * uy);
    minReach = Math.min(minReach, h);
  }
  return { radius, halfSpan, nose, tail: -tail, minReach };
}

/**
 * The player ship's hull shape. radius: the farthest vertex (the bounding
 * circle); halfSpan: half the wingspan; nose/tail: reach forward/back;
 * minReach: the least the body reaches in any direction.
 */
export const PLAYER_HULL = Object.freeze({ kind: "hull", points: SHIP_HULL, body: SHIP_BODY, ...describe(SHIP_HULL) });

export const isHullShape = (shape) => !!shape && typeof shape === "object" && shape.kind === "hull";

/** The hull's vertices in world cells for a ship at (x, y) facing `angle`. */
export function hullWorld(x, y, angle = 0, hull = PLAYER_HULL) {
  const c = Math.cos(angle || 0), s = Math.sin(angle || 0);
  const out = new Array(hull.points.length);
  for (let i = 0; i < hull.points.length; i++) {
    const [hx, hy] = hull.points[i];
    out[i] = { x: x - hx * s + hy * c, y: y + hx * c + hy * s };
  }
  return out;
}

/** The hull of a ship-like object { x, y, angle }. */
export const shipHull = (ship, hull = PLAYER_HULL) => hullWorld(ship.x, ship.y, ship.angle, hull);

/** Even-odd point-in-polygon (works for the concave hull). */
export function pointInPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The closest point on the polygon's outline to (x, y): { x, y, d, edge }. */
export function closestOnPolygon(poly, x, y) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { x: px, y: py, d, edge: i };
  }
  return best;
}

// A unit normal of edge i pointing into the polygon (for the degenerate case
// of a point exactly on the outline).
function inwardNormal(poly, edge, x, y) {
  const a = poly[edge], b = poly[(edge + 1) % poly.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  if (!pointInPolygon(poly, x + nx * 1e-4, y + ny * 1e-4)) { nx = -nx; ny = -ny; }
  return { nx, ny };
}

/**
 * Overlap of a polygon and a circle. null when apart; otherwise
 * { depth, nx, ny, px, py }: moving the polygon by (nx, ny) * depth separates
 * them (n is the polygon's inward normal at the contact, i.e. it points from
 * the circle toward the polygon), and (px, py) is the contact point on the
 * polygon's outline. Exact for concave polygons.
 */
export function polygonCircle(poly, cx, cy, r) {
  const q = closestOnPolygon(poly, cx, cy);
  const inside = pointInPolygon(poly, cx, cy);
  if (!inside && q.d >= r) return null;
  let nx, ny;
  if (q.d > 1e-9) {
    // Outside: push away from the circle. Inside: push so the centre leaves
    // through the nearest edge (the polygon moves toward the centre).
    nx = (inside ? cx - q.x : q.x - cx) / q.d;
    ny = (inside ? cy - q.y : q.y - cy) / q.d;
  } else ({ nx, ny } = inwardNormal(poly, q.edge, q.x, q.y));
  return { depth: inside ? r + q.d : r - q.d, nx, ny, px: q.x, py: q.y };
}

export const polygonTouchesCircle = (poly, cx, cy, r) => polygonCircle(poly, cx, cy, r) !== null;

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    || (d1 === 0 && onSegment(ax, ay, bx, by, cx, cy))
    || (d2 === 0 && onSegment(ax, ay, bx, by, dx, dy))
    || (d3 === 0 && onSegment(cx, cy, dx, dy, ax, ay))
    || (d4 === 0 && onSegment(cx, cy, dx, dy, bx, by));
}
const onSegment = (ax, ay, bx, by, px, py) =>
  Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);

/** Does the segment a→b (a shot's path this step) touch the polygon? */
export function segmentHitsPolygon(poly, ax, ay, bx, by) {
  if (pointInPolygon(poly, ax, ay) || pointInPolygon(poly, bx, by)) return true;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (segmentsCross(ax, ay, bx, by, p.x, p.y, q.x, q.y)) return true;
  }
  return false;
}

/** Does the ship's hull touch a circle (a shard, a mine, a rock)? */
export function shipTouchesCircle(ship, cx, cy, r, hull = PLAYER_HULL) {
  // Bounding-circle reject first: most things are nowhere near the ship.
  if (Math.hypot(cx - ship.x, cy - ship.y) >= r + hull.radius) return false;
  return polygonTouchesCircle(shipHull(ship, hull), cx, cy, r);
}

/**
 * Push a ship's hull out of a circle. Moves ship.x / ship.y and returns the
 * contact { nx, ny, depth, px, py } (n points from the circle toward the ship;
 * depth is the first overlap) or null when they don't touch. A concave hull
 * can need a second push (the first one clears a dent, the next the wing
 * tip), so it repeats until clear.
 */
export function pushShipOutOfCircle(ship, cx, cy, r, { hull = PLAYER_HULL, skin = 0.001, iterations = 6 } = {}) {
  if (Math.hypot(cx - ship.x, cy - ship.y) >= r + hull.radius) return null;
  let first = null, last = null;
  for (let k = 0; k < iterations; k++) {
    const c = polygonCircle(shipHull(ship, hull), cx, cy, r);
    if (!c) break;
    first ??= c;
    last = c;
    ship.x += c.nx * (c.depth + skin);
    ship.y += c.ny * (c.depth + skin);
  }
  if (!first) return null;
  return { nx: last.nx, ny: last.ny, depth: first.depth, px: last.px, py: last.py };
}

/** Does a shot's path this step (prev → now) touch the ship's hull? */
export function shotHitsShip(ship, ax, ay, bx, by, hull = PLAYER_HULL) {
  // Reject when the whole path is beyond the bounding circle.
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((ship.x - ax) * dx + (ship.y - ay) * dy) / len2));
  if (Math.hypot(ax + dx * t - ship.x, ay + dy * t - ship.y) > hull.radius) return false;
  return segmentHitsPolygon(shipHull(ship, hull), ax, ay, bx, by);
}
