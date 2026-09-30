/** Closed racing-corridor geometry. All positions and widths are world-cell units. */
import { PLAYER_HULL, isHullShape, hullWorld, pointInPolygon, closestOnPolygon } from "./hull.js";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function nearestTrackPoint(track, x, y) {
  let best = null;
  for (const segment of track.segments) {
    const t = clamp(
      ((x - segment.x) * segment.dx + (y - segment.y) * segment.dy) /
        segment.length ** 2,
      0,
      1,
    );
    const px = segment.x + segment.dx * t,
      py = segment.y + segment.dy * t;
    const distance = Math.hypot(x - px, y - py);
    if (!best || distance < best.distance)
      best = {
        x: px,
        y: py,
        distance,
        segment: segment.index,
        along: segment.start + t * segment.length,
        tx: segment.tx,
        ty: segment.ty,
      };
  }
  return best;
}
export function pointOnTrack(track, distance, offset = 0) {
  const along = ((distance % track.length) + track.length) % track.length;
  const segment =
    track.segments.find((s) => along <= s.start + s.length) ||
    track.segments.at(-1);
  const t = (along - segment.start) / segment.length;
  return {
    x: segment.x + segment.dx * t - segment.ty * offset,
    y: segment.y + segment.dy * t + segment.tx * offset,
    tx: segment.tx,
    ty: segment.ty,
  };
}
export function isInsideTrack(track, x, y, radius = 0) {
  return (
    nearestTrackPoint(track, x, y).distance <= track.width / 2 - radius + 1e-7
  );
}
export function createTrack(coordinates, width, name) {
  const points = coordinates.map(([x, y]) => ({ x, y }));
  let length = 0;
  const segments = points.map((p, index) => {
    const q = points[(index + 1) % points.length],
      dx = q.x - p.x,
      dy = q.y - p.y;
    const size = Math.hypot(dx, dy);
    if (size < 0.001) throw new Error("Track segments must have length");
    const segment = {
      x: p.x,
      y: p.y,
      dx,
      dy,
      length: size,
      tx: dx / size,
      ty: dy / size,
      start: length,
      index,
    };
    length += size;
    return segment;
  });
  const first = segments[0];
  const portal = {
    ...points[0],
    tx: first.tx,
    ty: first.ty,
    nx: -first.ty,
    ny: first.tx,
    angle: Math.atan2(first.ty, first.tx),
  };
  const checkpoints = points.slice(1).map((point, index) => {
    const incoming = segments[index],
      outgoing = segments[index + 1];
    let tx = incoming.tx + outgoing.tx,
      ty = incoming.ty + outgoing.ty;
    const magnitude = Math.hypot(tx, ty) || 1;
    // Full width, corner included: across the bisector the lane reaches
    // width/2 on the outside (the rounded rail) but width/2 / cos(turn/2) on
    // the inside, where the two inner rails meet. An apex cut still counts.
    const turn = Math.acos(Math.max(-1, Math.min(1, incoming.tx * outgoing.tx + incoming.ty * outgoing.ty)));
    const side = Math.sign(incoming.tx * outgoing.ty - incoming.ty * outgoing.tx);
    return {
      ...point,
      tx: tx / magnitude,
      ty: ty / magnitude,
      index,
      along: outgoing.start,
      // +1: the inside of the corner is on the normal (-ty, tx) side.
      insideSide: side,
      insideReach: Math.min(width * 2, width / 2 / Math.max(0.25, Math.cos(turn / 2))),
    };
  });
  return {
    points,
    segments,
    checkpoints,
    portal,
    width,
    length,
    name,
    bounds: { minX: 0, minY: 0, maxX: 48, maxY: 32 },
  };
}
export function createTrackProgress() {
  return {
    nextCheckpoint: 0,
    passed: 0,
    lapStarted: false,
    distance: 0,
    boundaryHits: 0,
  };
}
// Playtest-lab rails (systems/lab.js): a head-on hit bites and a scrape only
// rubs. The along-rail speed is scrubbed in proportion to how hard the ship
// hit the rail, and hull damage starts above a threshold impact speed.
export const IMPACT_RAILS = Object.freeze({ SCRUB_PER_SPEED: 0.035, MAX_SCRUB: 0.45, DAMAGE_FROM: 4, DAMAGE_PER_SPEED: 3.5, MAX_DAMAGE: 25 });

export function railImpact(outward) {
  const impact = Math.max(0, outward);
  return {
    impact,
    keep: 1 - Math.min(IMPACT_RAILS.MAX_SCRUB, impact * IMPACT_RAILS.SCRUB_PER_SPEED),
    damage: impact > IMPACT_RAILS.DAMAGE_FROM
      ? Math.min(IMPACT_RAILS.MAX_DAMAGE, (impact - IMPACT_RAILS.DAMAGE_FROM) * IMPACT_RAILS.DAMAGE_PER_SPEED)
      : 0,
  };
}

// The velocity response to touching a rail whose outward normal is (nx, ny).
// Shared by the circle and the hull; the arithmetic is exactly the original
// circle code's, so SDW1 weekly replays stay bit-for-bit.
function railResponse(player, nx, ny, rails) {
  const outward = player.vx * nx + player.vy * ny;
  if (rails?.model === "impact" && outward > 0) {
    const hit = railImpact(outward);
    const alongX = player.vx - outward * nx,
      alongY = player.vy - outward * ny;
    player.vx = alongX * hit.keep - outward * 0.25 * nx;
    player.vy = alongY * hit.keep - outward * 0.25 * ny;
    rails.onImpact?.(hit);
  } else if (rails?.model === "stun" && outward > 0) {
    // Weekly rails: a real hit halves the ship's speed (the caller stuns
    // the controls); a scrape, or a touch while already stunned, just slides.
    const alongX = player.vx - outward * nx,
      alongY = player.vy - outward * ny;
    const keep = rails.hits(outward) ? rails.keep : 1;
    player.vx = (alongX - outward * 0.2 * nx) * keep;
    player.vy = (alongY - outward * 0.2 * ny) * keep;
    if (keep !== 1) rails.onImpact?.({ impact: outward });
  } else if (outward > 0) {
    player.vx -= outward * 1.25 * nx;
    player.vy -= outward * 1.25 * ny;
  }
}

// Inner corners of the lane: where the two inside rails of a corner meet,
// the only places where the lane's edge points into the lane, so the only
// places a rail can poke between two hull vertices. Cached per track.
const notchCache = new WeakMap();
export function laneNotches(track) {
  let notches = notchCache.get(track);
  if (notches) return notches;
  notches = [];
  const n = track.segments.length, half = track.width / 2;
  for (let i = 0; i < n; i++) {
    const a = track.segments[(i - 1 + n) % n], b = track.segments[i];
    const cross = a.tx * b.ty - a.ty * b.tx, dot = a.tx * b.tx + a.ty * b.ty;
    if (Math.abs(cross) < 1e-6 && dot > 0) continue; // straight on
    const side = Math.sign(cross) || 1;
    // Inside normals of both segments; the notch is on their bisector.
    let ux = side * (-a.ty - b.ty), uy = side * (a.tx + b.tx);
    const m = Math.hypot(ux, uy);
    if (m < 1e-6) continue; // a hairpin reversal: no single notch
    ux /= m; uy /= m;
    const cosHalf = Math.max(0.05, ux * side * -a.ty + uy * side * a.tx);
    const x = b.x + ux * (half / cosHalf), y = b.y + uy * (half / cosHalf);
    // Only where it really is on the lane's edge (not covered by other lane).
    if (nearestTrackPoint(track, x, y).distance >= half - 1e-6) notches.push({ x, y });
  }
  notchCache.set(track, notches);
  return notches;
}

/**
 * How far a hull pokes out of the lane at (x, y) facing `angle`:
 * { depth, nx, ny, px, py }. depth > 0 is outside by that much at (px, py)
 * (the deepest hull point), and (nx, ny) is the rail's outward normal there.
 * depth <= 0 means the whole body is on the lane. The lane is every point
 * within width/2 of the centreline; its edge is straight rails, round outer
 * corners and sharp inner corners, so testing the hull's vertices plus the
 * inner-corner notches against the polygon is exact.
 */
export function hullLaneContact(track, x, y, angle = 0, hull = PLAYER_HULL) {
  const half = track.width / 2;
  const centre = nearestTrackPoint(track, x, y);
  // Far from both rails: the bounding circle is on the lane, so is the hull.
  if (centre.distance + hull.radius <= half) return { depth: centre.distance + hull.radius - half, nx: 0, ny: 0, px: x, py: y };
  const poly = hullWorld(x, y, angle, hull);
  let best = null;
  for (const p of poly) {
    const q = nearestTrackPoint(track, p.x, p.y);
    const depth = q.distance - half;
    if (!best || depth > best.depth) {
      const d = q.distance || 1;
      best = { depth, nx: (p.x - q.x) / d, ny: (p.y - q.y) / d, px: p.x, py: p.y };
    }
  }
  for (const notch of laneNotches(track)) {
    if (Math.hypot(notch.x - x, notch.y - y) >= hull.radius || !pointInPolygon(poly, notch.x, notch.y)) continue;
    // The inner corner is inside the body: the hull must slide off it.
    const q = closestOnPolygon(poly, notch.x, notch.y);
    if (q.d > best.depth) {
      const d = q.d || 1;
      best = { depth: q.d, nx: (q.x - notch.x) / d, ny: (q.y - notch.y) / d, px: q.x, py: q.y };
    }
  }
  return best;
}

export function isHullInsideTrack(track, x, y, angle = 0, hull = PLAYER_HULL, slack = 1e-7) {
  return hullLaneContact(track, x, y, angle, hull).depth <= slack;
}

/** Lane containment for a body that is a circle of `shape` cells or a hull. */
export function isBodyInsideTrack(track, body, shape) {
  return isHullShape(shape) ? isHullInsideTrack(track, body.x, body.y, body.angle, shape) : isInsideTrack(track, body.x, body.y, shape || 0);
}

/**
 * The hull version of constrainToTrack. Same swept, no-tunnelling rails, with
 * the whole body instead of a centre circle:
 *  1. rotation (or a rock's push) can leave the body through a rail before the
 *     ship even moves: the start of the move is pushed back onto the lane
 *     first, along the deepest point's normal, and the ship keeps its motion;
 *  2. the move is swept at the ship's final angle and clipped at the first
 *     touch, found by bisection like the circle;
 *  3. the rails model responds with the normal at the deepest hull point.
 */
function constrainHullToTrack(track, player, previous, hull, rails) {
  const angle = player.angle || 0;
  const EPS = 1e-7;
  let sx = previous.x, sy = previous.y;
  const contacts = [];
  let start = hullLaneContact(track, sx, sy, angle, hull);
  for (let k = 0; k < 6 && start.depth > EPS; k++) {
    if (!contacts.length) contacts.push(start);
    sx -= start.nx * (start.depth + 0.002);
    sy -= start.ny * (start.depth + 0.002);
    start = hullLaneContact(track, sx, sy, angle, hull);
  }
  const tx = player.x + (sx - previous.x), ty = player.y + (sy - previous.y);
  const dx = tx - sx, dy = ty - sy;
  const inside = (t) => hullLaneContact(track, sx + dx * t, sy + dy * t, angle, hull).depth <= EPS;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.12));
  let safe = 0, blocked = false;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (inside(t)) { safe = t; continue; }
    let low = safe, high = t;
    for (let n = 0; n < 14; n++) {
      const mid = (low + high) / 2;
      if (inside(mid)) low = mid;
      else high = mid;
    }
    contacts.push(hullLaneContact(track, sx + dx * high, sy + dy * high, angle, hull));
    player.x = sx + dx * low;
    player.y = sy + dy * low;
    blocked = true;
    break;
  }
  if (!blocked) { player.x = tx; player.y = ty; }
  if (!contacts.length) return false;
  for (const c of contacts) railResponse(player, c.nx, c.ny, rails);
  const last = contacts.at(-1);
  // Move slightly inward so a tangent drift cannot become stuck to a rail by rounding.
  player.x -= last.nx * 0.002;
  player.y -= last.ny * 0.002;
  player.boundaryContact = 0.12;
  return true;
}

/**
 * Clip the entire swept move, not just its endpoint, so boosts cannot cross an infield.
 * shape: the ship's radius in cells (a circle: the original rails, kept exactly
 * for SDW1 weekly replays and the lab) or a hull shape (engine/hull.js,
 * PLAYER_HULL: the ship's real body).
 * rails: optional { model: "impact", onImpact({ impact, damage }) } for the playtest lab,
 * or { model: "stun", keep, hits(outward), onImpact({ impact }) } for the weekly tracks.
 */
export function constrainToTrack(track, player, previous, radius, rails = null) {
  if (isHullShape(radius)) return constrainHullToTrack(track, player, previous, radius, rails);
  const dx = player.x - previous.x,
    dy = player.y - previous.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.12));
  let safe = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (
      isInsideTrack(track, previous.x + dx * t, previous.y + dy * t, radius)
    ) {
      safe = t;
      continue;
    }
    let low = safe,
      high = t;
    for (let n = 0; n < 14; n++) {
      const mid = (low + high) / 2;
      if (
        isInsideTrack(
          track,
          previous.x + dx * mid,
          previous.y + dy * mid,
          radius,
        )
      )
        low = mid;
      else high = mid;
    }
    player.x = previous.x + dx * low;
    player.y = previous.y + dy * low;
    const nearest = nearestTrackPoint(track, player.x, player.y);
    const nx = (player.x - nearest.x) / (nearest.distance || 1),
      ny = (player.y - nearest.y) / (nearest.distance || 1);
    railResponse(player, nx, ny, rails);
    // Move slightly inward so a tangent drift cannot become stuck to a rail by rounding.
    player.x -= nx * 0.002;
    player.y -= ny * 0.002;
    player.boundaryContact = 0.12;
    return true;
  }
  return false;
}
export function updateTrackProgress(scene, previous) {
  const { track, player, trackProgress: progress } = scene;
  if (!track || !progress || !scene.launched) return;
  const distance = Math.hypot(player.x - previous.x, player.y - previous.y);
  // Runtime advances in <=1/120s steps. Discontinuities never count as race progress.
  if (
    distance > 0.5 ||
    !isInsideTrack(track, previous.x, previous.y) ||
    !isInsideTrack(track, player.x, player.y)
  )
    return;
  progress.distance += distance;
  if (Math.hypot(player.x - track.portal.x, player.y - track.portal.y) > 3)
    progress.lapStarted = true;
  if (!progress.lapStarted) return;
  const checkpoint = track.checkpoints[progress.nextCheckpoint];
  if (!checkpoint) return;
  const before =
    (previous.x - checkpoint.x) * checkpoint.tx +
    (previous.y - checkpoint.y) * checkpoint.ty;
  const after =
    (player.x - checkpoint.x) * checkpoint.tx +
    (player.y - checkpoint.y) * checkpoint.ty;
  if (before > 0 || after < 0 || after <= before) return;
  const t = -before / (after - before);
  const x = previous.x + (player.x - previous.x) * t,
    y = previous.y + (player.y - previous.y) * t;
  const signed =
    (x - checkpoint.x) * -checkpoint.ty + (y - checkpoint.y) * checkpoint.tx;
  const inside = checkpoint.insideSide ? Math.sign(signed) === checkpoint.insideSide : false;
  const reach = inside ? checkpoint.insideReach ?? track.width / 2 : track.width / 2;
  if (Math.abs(signed) <= reach) {
    progress.nextCheckpoint++;
    progress.passed = progress.nextCheckpoint;
  }
}
export function isLapReady(scene) {
  const progress = scene?.trackProgress,
    track = scene?.track;
  return (
    !!track &&
    !!progress &&
    progress.lapStarted &&
    progress.nextCheckpoint === track.checkpoints.length &&
    progress.distance >= track.length * 0.65
  );
}
/**
 * The finish: a forward crossing of point 0's full-width start/finish line
 * between two positions (no portal). Returns the fraction of the move where
 * it crossed, or null.
 */
export function crossedFinishLine(track, previous, current) {
  const g = track.portal;
  const before = (previous.x - g.x) * g.tx + (previous.y - g.y) * g.ty;
  const after = (current.x - g.x) * g.tx + (current.y - g.y) * g.ty;
  if (!(before < 0 && after >= 0)) return null;
  const t = after > before ? -before / (after - before) : 1;
  const x = previous.x + (current.x - previous.x) * t, y = previous.y + (current.y - previous.y) * t;
  return Math.abs((x - g.x) * g.nx + (y - g.y) * g.ny) <= track.width / 2 ? t : null;
}

/** Signed portal coordinates: forward is race direction, lateral is across the lane. */
export function portalCoordinates(track, player) {
  const gate = track.portal,
    dx = player.x - gate.x,
    dy = player.y - gate.y;
  return {
    forward: dx * gate.tx + dy * gate.ty,
    lateral: dx * gate.nx + dy * gate.ny,
    velocity: player.vx * gate.tx + player.vy * gate.ty,
    facing: Math.cos(player.angle) * gate.tx + Math.sin(player.angle) * gate.ty,
  };
}
