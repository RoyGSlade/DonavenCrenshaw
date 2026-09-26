/** Pure, stateless math and utility functions. */

export function angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function onPad(x, y, startPos, radius) {
  return Math.hypot(x - startPos.x, y - startPos.y) <= radius;
}