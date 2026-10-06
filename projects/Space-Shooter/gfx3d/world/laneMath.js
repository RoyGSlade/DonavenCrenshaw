// Pure track maths for the 3D world: no three.js, no DOM, so node tests can
// check it. Sim coordinates (x, y) throughout; world.js maps y to three's Z.
//
// The lane is every point within width/2 of the closed centreline polyline
// (the same rule engine/track.js uses for the rails), so its edge is straight
// rails, round outer corners and sharp inner corners.

const TAU = Math.PI * 2;

/** Points ([{x,y}] or [[x,y]]) to a closed loop of segments with tangent, normal and running length. */
export function trackFrames(rawPoints) {
  const points = rawPoints.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }));
  let length = 0;
  const segments = points.map((p, index) => {
    const q = points[(index + 1) % points.length];
    const dx = q.x - p.x, dy = q.y - p.y, size = Math.hypot(dx, dy);
    if (size < 1e-6) throw new Error('Track segments must have length');
    // Normal (-ty, tx) is the right-hand side facing the race direction in sim coordinates.
    const seg = { x: p.x, y: p.y, dx, dy, length: size, tx: dx / size, ty: dy / size, nx: -dy / size, ny: dx / size, start: length, index };
    length += size;
    return seg;
  });
  return { points, segments, length };
}

/** Distance from (x, y) to the centreline loop, and which segment is nearest. */
export function distanceToTrack(frames, x, y) {
  let best = Infinity, index = 0;
  for (const s of frames.segments) {
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (y - s.y) * s.dy) / (s.length * s.length)));
    const d = Math.hypot(x - (s.x + s.dx * t), y - (s.y + s.dy * t));
    if (d < best) { best = d; index = s.index; }
  }
  return { distance: best, segment: index };
}

/** Which way, and how hard, the lap turns at every point. */
export function cornerTurns(rawPoints) {
  const { points, segments } = trackFrames(rawPoints);
  const n = points.length;
  return points.map((p, i) => {
    const a = segments[(i - 1 + n) % n], b = segments[i];
    const cross = a.tx * b.ty - a.ty * b.tx, dot = a.tx * b.tx + a.ty * b.ty;
    const angle = Math.atan2(Math.abs(cross), dot);              // 0 = straight on, PI = full reversal
    const turn = Math.sign(cross) || 1;                           // +1 right, -1 left (screen coordinates)
    let tx = a.tx + b.tx, ty = a.ty + b.ty;
    const m = Math.hypot(tx, ty);
    if (m < 1e-6) { tx = b.nx * -turn; ty = b.ny * -turn; } else { tx /= m; ty /= m; }   // a reversal: face across it
    return { index: i, x: p.x, y: p.y, turn, angle, degrees: (angle * 180) / Math.PI, tx, ty, insideX: -ty * turn, insideY: tx * turn };
  });
}

/** Corners sharp enough to deserve a warning marker. */
export const TIGHT_CORNER_DEG = 40;
export const HAIRPIN_DEG = 120;
export function detectCorners(rawPoints, minDegrees = TIGHT_CORNER_DEG) {
  return cornerTurns(rawPoints)
    .filter((c) => c.degrees >= minDegrees)
    .map((c) => ({ ...c, kind: c.degrees >= HAIRPIN_DEG ? 'hairpin' : 'tight' }));
}

/** The radius of a mine's kill halo, exactly as gfx/weeklyVfx.js draws it. */
export const HULL_CONTACT_PAD = 0.06;
export function haloRadius(mine, physics, playerRadius) {
  return mine.radius + (physics === 1 ? playerRadius : HULL_CONTACT_PAD);
}

/** The rectangle a bouncer sweeps: centre, unit direction (the lane normal), half length and half width. */
export function bouncerSweep(b) {
  return { x: b.originX, y: b.originY, dx: b.nx, dy: b.ny, halfLength: b.span + b.radius, halfWidth: b.radius, angle: Math.atan2(b.ny, b.nx) };
}

/**
 * The lane boundary as polylines. Each run is a list of { x, y, nx, ny } where
 * (nx, ny) is the unit normal pointing out of the lane. A rail run starts and
 * ends where the boundary does, so inside corners (where two inner offsets
 * cross) are trimmed exactly and no rail is drawn across the lane.
 */
export function laneBoundaryRuns(rawPoints, width, { step = 0.5, arcDegrees = 2, tolerance = 1e-6 } = {}) {
  const frames = trackFrames(rawPoints);
  const half = width / 2;
  const onEdge = (x, y) => distanceToTrack(frames, x, y).distance >= half - tolerance;
  const runs = [];
  // Walk a parametrised curve; keep the stretches that are on the lane edge, refining each end by bisection.
  const walk = (at, from, to, count, simplify) => {
    let current = null;
    let prevS = from, prevKept = false;
    const flush = () => { if (current && current.length > 1) runs.push(simplify && current.length > 2 ? [current[0], current[current.length - 1]] : current); current = null; };
    for (let k = 0; k <= count; k++) {
      const s = from + ((to - from) * k) / count;
      const p = at(s);
      const kept = onEdge(p.x, p.y);
      if (k > 0 && kept !== prevKept) {
        let lo = prevS, hi = s, loKept = prevKept;
        for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; const m = at(mid); if (onEdge(m.x, m.y) === loKept) lo = mid; else hi = mid; }
        const edge = at(loKept ? lo : hi);
        if (kept) { current = [edge]; } else if (current) { current.push(edge); flush(); }
      }
      if (kept) { if (!current) current = []; current.push(p); }
      prevS = s; prevKept = kept;
    }
    flush();
  };
  for (const s of frames.segments) {
    for (const side of [1, -1]) {
      const n = { x: s.nx * side, y: s.ny * side };
      const count = Math.max(2, Math.ceil(s.length / step));
      walk((u) => ({ x: s.x + s.tx * u + n.x * half, y: s.y + s.ty * u + n.y * half, nx: n.x, ny: n.y }), 0, s.length, count, true);
    }
  }
  const arcCount = Math.ceil(360 / arcDegrees);
  for (const p of frames.points) {
    walk((a) => ({ x: p.x + Math.cos(a) * half, y: p.y + Math.sin(a) * half, nx: Math.cos(a), ny: Math.sin(a) }), 0, TAU, arcCount, false);
  }
  return runs;
}

/** Length of a polyline run. */
export function runLength(run) {
  let l = 0;
  for (let i = 1; i < run.length; i++) l += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
  return l;
}
