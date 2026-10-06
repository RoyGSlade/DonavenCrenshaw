// Small smoothing helpers shared by the 3D ship, camera and effects. Pure
// maths (no three.js, no DOM), so they run in node tests.
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

/** Frame-rate independent exponential easing factor: 1 - e^(-rate * dt). */
export const easeRate = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));

/**
 * Advance a damped spring {x, v} toward `target`. omega is the natural
 * frequency (rad/s), zeta the damping ratio (1 = critical, < 1 overshoots a
 * little, which is what makes a banking ship feel alive). Sub-stepped at
 * 120 Hz so a long frame can't blow it up.
 */
export function stepSpring(s, target, omega, zeta, dt) {
  let left = clamp(dt, 0, 0.1);
  while (left > 1e-9) {
    const h = left < 1 / 120 ? left : 1 / 120;
    s.v += (omega * omega * (target - s.x) - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
  return s.x;
}

/** Cheap deterministic pseudo-noise in [-1, 1] (no allocation, no Math.random) for shakes. */
export function wobble(t, seed = 0) {
  return Math.sin(t * 61.7 + seed * 12.9898) * 0.5 + Math.sin(t * 97.3 + seed * 78.233 + 1.3) * 0.3 + Math.sin(t * 143.1 + seed * 37.719 + 2.1) * 0.2;
}
