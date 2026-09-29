/** Closed racing-corridor geometry. All positions and widths are world-cell units. */
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

/**
 * Clip the entire swept move, not just its endpoint, so boosts cannot cross an infield.
 * rails: optional { model: "impact", onImpact({ impact, damage }) } for the playtest lab,
 * or { model: "stun", keep, hits(outward), onImpact({ impact }) } for the weekly tracks.
 */
export function constrainToTrack(track, player, previous, radius, rails = null) {
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
