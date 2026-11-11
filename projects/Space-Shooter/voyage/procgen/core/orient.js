// Facing and rotation, shared by every layer.
//
// Convention (matches the interiors art): a prop's art has a native front
// ("down" for almost everything: you stand below a console and look up at it).
// Directions are quarter turns clockwise from down, in screen space (y down):
//   0 down (0, 1)   1 left (-1, 0)   2 up (0, -1)   3 right (1, 0)
// `rot` in map data is radians, clockwise, about the footprint centre (canvas
// rotate). `size` in map data is always the footprint on the grid AFTER the
// turn, so a 2x1 desk turned to face left has size [1, 2] and rot PI/2.

export const DIRS = Object.freeze(['down', 'left', 'up', 'right']);
export const VEC = Object.freeze([[0, 1], [-1, 0], [0, -1], [1, 0]]);
const INDEX = { down: 0, left: 1, up: 2, right: 3, s: 0, w: 1, n: 2, e: 3 };

export const dirIndex = (name) => (typeof name === 'number' ? ((name % 4) + 4) % 4 : INDEX[name] ?? 0);
export const dirName = (k) => DIRS[((k % 4) + 4) % 4];
export const opposite = (k) => (k + 2) % 4;

/** Quarter turns needed to point a prop with native front `native` toward `k`. */
export const turnsFor = (k, native = 0) => ((k - native) % 4 + 4) % 4;

/** Radians for a number of clockwise quarter turns, in (-PI, PI]. */
export function rotFor(turns) {
  const t = ((turns % 4) + 4) % 4;
  return [0, Math.PI / 2, Math.PI, -Math.PI / 2][t];
}

/** Footprint after turning. */
export const turnedSize = ([w, h], turns) => (turns % 2 ? [h, w] : [w, h]);

/** Quarter turns from radians (nearest), for reading map data back. */
export function turnsFromRot(rot = 0) {
  return ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4;
}

/** The cells just outside a rect on side k, `dist` tiles out (1 = touching). */
export function sideCells(r, k, dist = 1) {
  const out = [];
  if (k === 0) for (let x = r.x; x < r.x + r.w; x++) out.push([x, r.y + r.h - 1 + dist]);
  else if (k === 2) for (let x = r.x; x < r.x + r.w; x++) out.push([x, r.y - dist]);
  else if (k === 1) for (let y = r.y; y < r.y + r.h; y++) out.push([r.x - dist, y]);
  else for (let y = r.y; y < r.y + r.h; y++) out.push([r.x + r.w - 1 + dist, y]);
  return out;
}

/** Length of a rect's side k. */
export const sideLen = (r, k) => (k % 2 === 0 ? r.w : r.h);
