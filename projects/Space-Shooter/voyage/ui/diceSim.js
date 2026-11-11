// A real six-sided die, simulated: one rigid cube thrown into a walled tray,
// falling under gravity, bouncing, sliding and rolling until it rests. The
// roll is whichever face points up once it settles, read from the cube's
// orientation; nothing picks the number in advance. Pure: no DOM, no clock,
// no Math.random (the throw takes an rng), so the same throw always lands the
// same way and tests can run thousands of them.
//
// A cube's inertia is the same about every axis through its centre, so the
// world-space inertia is a plain number and the solver stays small: impulses
// at the eight corners against the floor and the four tray walls, with
// restitution, Coulomb friction and a little rolling drag.

export const DIE = Object.freeze({
  size: 1,            // edge length (metres, nominally)
  mass: 1,
  gravity: 9.8,
  tray: 2.7,          // walls at |x|, |y| = tray
  restitution: 0.38,  // bounce on a firm hit
  friction: 0.55,
  dt: 1 / 240,        // fixed step: the same throw lands the same way at any frame rate
  iterations: 5,
  maxSeconds: 12,
});

// Face values: opposite faces add up to 7, as on a real die.
export const FACES = Object.freeze([
  { value: 1, n: [0, 0, 1] },
  { value: 6, n: [0, 0, -1] },
  { value: 2, n: [1, 0, 0] },
  { value: 5, n: [-1, 0, 0] },
  { value: 3, n: [0, 1, 0] },
  { value: 4, n: [0, -1, 0] },
]);

const H = DIE.size / 2;
const INERTIA = (DIE.mass * DIE.size * DIE.size) / 6;
export const CORNERS = Object.freeze([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x * H, y * H, z * H]))));

// --- Tiny vector and quaternion helpers (arrays, no classes) --------------------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Rotate vector v by unit quaternion q = [w, x, y, z]. */
export function rotate(q, v) {
  const [w, x, y, z] = q;
  const t = scale(cross([x, y, z], v), 2);
  return add(add(v, scale(t, w)), cross([x, y, z], t));
}
function qmul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
function qnorm(q) { const l = Math.hypot(...q) || 1; return q.map((c) => c / l); }

/** A uniformly random orientation (Shoemake), from three rng draws. */
export function randomQuat(rng) {
  const u1 = rng(), u2 = rng() * Math.PI * 2, u3 = rng() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/**
 * A die thrown in from one edge of the tray, high and spinning, in a random
 * orientation. Everything random comes from rng(). `aim` (optional, from a
 * flick on the tray) bends the throw's direction and strength; the spin and
 * orientation stay random, so the result stays a fair roll.
 */
export function throwDie(rng, aim = null) {
  const r = () => { const v = Number(rng()); return Number.isFinite(v) ? Math.min(0.999999, Math.max(0, v)) : 0.5; };
  const side = r() < 0.5 ? -1 : 1; // thrown in from the left or the right
  const spin = 9 + r() * 12;
  const axis = [r() - 0.5, r() - 0.5, r() - 0.5];
  const al = len(axis) || 1;
  let v = [side * (4.5 + r() * 3), (r() - 0.5) * 4, 0.5 + r() * 2];
  let p = [side * -DIE.tray * 0.62, (r() - 0.5) * DIE.tray, 2.2 + r() * 1.2];
  if (aim && Number.isFinite(aim.dx) && Number.isFinite(aim.dy) && Math.hypot(aim.dx, aim.dy) > 0.05) {
    const l = Math.hypot(aim.dx, aim.dy);
    const power = Math.min(1, Math.max(0.3, Number(aim.power) || 0.6));
    const speed = 4 + power * 5;
    v = [(aim.dx / l) * speed, (aim.dy / l) * speed, 0.5 + r() * 2];
    // Start on the side the flick comes from, so it crosses the tray.
    p = [(-aim.dx / l) * DIE.tray * 0.6, (-aim.dy / l) * DIE.tray * 0.6, 2.2 + r() * 1.2];
  }
  return {
    p,
    v,
    q: randomQuat(r),
    w: scale(axis, spin / al),
    t: 0,
    still: 0,
    cocked: 0,
    nudges: 0,
    settled: false,
    nudge: r, // the same rng, for the rare die that balances on an edge
  };
}

/** Which way is up for each face right now: [{ value, up }], up = world z of the face normal. */
export function faceUps(q) {
  return FACES.map((f) => ({ value: f.value, up: rotate(q, f.n)[2] }));
}

/** The face pointing most nearly straight up, and how flat it sits (1 = flat). */
export function topFace(q) {
  let best = null;
  for (const f of faceUps(q)) if (!best || f.up > best.up) best = f;
  return { value: best.value, flatness: best.up };
}

const PLANES = [
  { n: [0, 0, 1], d: 0 },            // floor z >= 0
  { n: [1, 0, 0], d: -DIE.tray },    // x >= -tray
  { n: [-1, 0, 0], d: -DIE.tray },   // x <= tray
  { n: [0, 1, 0], d: -DIE.tray },
  { n: [0, -1, 0], d: -DIE.tray },
];

/** One fixed step. Mutates and returns the die (a sim object is the caller's own). */
export function step(die, dt = DIE.dt) {
  if (die.settled) return die;
  const m = DIE.mass;
  die.v = add(die.v, [0, 0, -DIE.gravity * dt]);

  // Contacts: every corner behind a plane.
  let onFloor = false;
  for (let it = 0; it < DIE.iterations; it++) {
    for (const plane of PLANES) {
      for (const c of CORNERS) {
        const r = rotate(die.q, c);
        const pos = add(die.p, r);
        const depth = -(dot(plane.n, pos) - plane.d);
        if (depth <= 0) continue;
        if (plane.n[2] === 1) onFloor = true;
        const n = plane.n;
        const vrel = add(die.v, cross(die.w, r));
        const vn = dot(vrel, n);
        if (vn >= 0) continue;
        const rn = cross(r, n);
        const kn = 1 / m + dot(rn, rn) / INERTIA;
        const e = vn < -1.2 ? DIE.restitution : 0; // soft contacts don't bounce (no jitter at rest)
        const jn = (-(1 + e) * vn) / kn / (it === 0 ? 1 : 2);
        die.v = add(die.v, scale(n, jn / m));
        die.w = add(die.w, scale(cross(r, scale(n, jn)), 1 / INERTIA));
        // Friction along the sliding direction, capped by the normal impulse.
        const vrel2 = add(die.v, cross(die.w, r));
        const vt = add(vrel2, scale(n, -dot(vrel2, n)));
        const vtl = len(vt);
        if (vtl > 1e-6) {
          const t = scale(vt, 1 / vtl);
          const rt = cross(r, t);
          const kt = 1 / m + dot(rt, rt) / INERTIA;
          const jt = Math.min(vtl / kt, DIE.friction * jn);
          die.v = add(die.v, scale(t, -jt / m));
          die.w = add(die.w, scale(cross(r, t), -jt / INERTIA));
        }
      }
    }
  }

  // Integrate.
  die.p = add(die.p, scale(die.v, dt));
  const wq = [0, ...die.w];
  const dq = qmul(wq, die.q).map((c) => c * 0.5 * dt);
  die.q = qnorm(die.q.map((c, i) => c + dq[i]));

  // Push back out of any plane (largest corner depth per plane).
  for (const plane of PLANES) {
    let deepest = 0;
    for (const c of CORNERS) {
      const depth = -(dot(plane.n, add(die.p, rotate(die.q, c))) - plane.d);
      if (depth > deepest) deepest = depth;
    }
    if (deepest > 0) die.p = add(die.p, scale(plane.n, deepest * 0.9));
  }

  // Air and rolling drag (felt on the tray, more when touching it).
  // Lying flat on a face, the felt grips: it slows like static friction would.
  const top = topFace(die.q);
  const lying = onFloor && top.flatness > 0.985 && die.p[2] < H + 0.02;
  const drag = lying ? 1 - 6 * dt : onFloor ? 1 - 1.6 * dt : 1 - 0.05 * dt;
  die.v = scale(die.v, drag);
  die.w = scale(die.w, lying ? 1 - 6 * dt : onFloor ? 1 - 2.2 * dt : 1 - 0.05 * dt);

  die.t += dt;
  const calm = len(die.v) < 0.1 && len(die.w) < 0.2 && onFloor;
  if (calm && top.flatness > 0.985) {
    die.still += dt;
    if (die.still > 0.25) die.settled = true;
  } else {
    die.still = 0;
  }
  // A die balanced on an edge or corner: real dice tip over; give it the
  // smallest push the table would and let physics finish it.
  if (calm && top.flatness <= 0.985) {
    die.cocked += dt;
    if (die.cocked > 0.4) {
      die.cocked = 0;
      die.nudges++;
      die.w = add(die.w, [(die.nudge() - 0.5) * 3, (die.nudge() - 0.5) * 3, 0]);
      die.v = add(die.v, [-die.p[0] * 0.25, -die.p[1] * 0.25, 0.4]); // and off a wall it leans on
    }
  } else {
    die.cocked = 0;
  }
  if (die.t >= DIE.maxSeconds) die.settled = true; // never seen in tests; the top face still decides
  return die;
}

/** Step until the die rests. Returns { value, die, seconds, steps }. */
export function settle(die, maxSteps = Math.ceil(DIE.maxSeconds / DIE.dt) + 1) {
  let steps = 0;
  while (!die.settled && steps < maxSteps) { step(die); steps++; }
  return { value: topFace(die.q).value, die, seconds: die.t, steps };
}

/** Throw and settle in one go (reduced motion, tests). */
export function rollOnce(rng) {
  return settle(throwDie(rng));
}

/** A die resting on a face, for drawing a known result (e.g. a saved stat). */
export function restingOn(value) {
  // Rotation that brings the face with this value to +z.
  const R = {
    1: [1, 0, 0, 0],
    6: [0, 1, 0, 0],
    2: [Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
    5: [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
    3: [Math.SQRT1_2, Math.SQRT1_2, 0, 0],
    4: [Math.SQRT1_2, -Math.SQRT1_2, 0, 0],
  }[value] || [1, 0, 0, 0];
  return { p: [0, 0, H], v: [0, 0, 0], q: R, w: [0, 0, 0], t: 0, still: 0, cocked: 0, nudges: 0, settled: true, nudge: () => 0.5 };
}
