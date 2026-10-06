// Camera framing for the 3D view, as plain maths so it tests without WebGL.
//
// The 2D game draws world point P at
//   screen = (W/2, H*anchorY) + zoom * cell * R(viewRot) * (P - cam)
// with cell = H / viewCells px per cell (R = a clockwise screen rotation). The
// 3D camera is a tilted chase camera that reproduces that framing:
//   - it looks at (cam.x, cam.y) with the screen's "up" along the same world
//     direction as the 2D view (so the track view and the behind-ship view mean
//     the same thing),
//   - its distance is chosen so the ground it shows across the screen matches
//     the 2D view at the same zoom (players read upcoming hazards off it),
//   - a lens shift puts the camera point at the 2D anchor, and then pins the
//     ship to the exact pixel the 2D renderer would draw it, so the 2D HUD
//     (shard arrow, markers) stays attached to the ship in the 3D view.
// The tilt then adds what 2D can't: more of the track ahead, and height.
import { clamp, lerp, smooth01, easeRate } from './spring.js';

export const CAMERA_3D = Object.freeze({
  FOV: 40,                 // vertical, degrees
  PITCH_TRACK: 58,         // degrees from the horizon (90 = straight down); track view
  PITCH_BEHIND: 50,        // behind-ship view: lower, so more of what's ahead shows
  COVERAGE: 1,             // 1 = same ground width as the 2D view at the same zoom
  NEAR: 0.3,
  FAR: 2500,
  PIN_FROM: 1.0,           // ship pinned to its 2D pixel while within this many half-screens of centre...
  PIN_TO: 1.7,             // ...fading out to the anchor-only framing by here (intro flythrough)
  LOOK_TIME: 0.42,         // fallback follow: seconds of travel looked ahead
  LOOK_MAX: 6,             // fallback follow: cells
  LOOK_RESP: 2.2,          // fallback follow: how fast the look-ahead builds (1/s)
  FOLLOW_RESP: 9,          // fallback follow: how tightly the view tracks the ship (1/s)
});

const RAD = Math.PI / 180;

/** World directions (sim x, y) of the screen's up and right for a 2D view rotation. */
export function viewBasis(viewRot = 0, out = {}) {
  const s = Math.sin(viewRot), c = Math.cos(viewRot);
  out.upX = -s; out.upY = -c;
  out.rightX = c; out.rightY = -s;
  return out;
}

/** Pitch (rad) for the current view: eases from track view to behind-ship view with the anchor. */
export function pitchForAnchor(anchorY = 0.5, P = CAMERA_3D) {
  return lerp(P.PITCH_TRACK, P.PITCH_BEHIND, smooth01(0.55, 0.85, anchorY)) * RAD;
}

/** Distance from the camera to its look-at point that shows the 2D view's ground width at this zoom. */
export function cameraDistance(viewCells, zoom, fovDeg = CAMERA_3D.FOV, coverage = CAMERA_3D.COVERAGE) {
  return (viewCells / (2 * Math.max(0.05, zoom) * Math.tan(fovDeg * RAD / 2))) * coverage;
}

/**
 * Build a camera rig description (pure numbers) looking at ground point (tx, ty).
 * position/forward/right/upVec are in three.js axes: X = sim x, Y = up, Z = sim y.
 */
export function placeRig({ tx, ty, viewRot = 0, distance, pitch, fovDeg = CAMERA_3D.FOV, aspect = 1 }, out = {}) {
  const b = viewBasis(viewRot, out._basis || (out._basis = {}));
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const dh = distance * cp, h = distance * sp;
  out.px = tx - b.upX * dh; out.py = h; out.pz = ty - b.upY * dh;
  out.tx = tx; out.ty = ty;
  out.fx = b.upX * cp; out.fy = -sp; out.fz = b.upY * cp;          // unit, camera -> target
  out.rx = b.rightX; out.ry = 0; out.rz = b.rightY;                  // screen right
  out.ux = b.upX * sp; out.uy = cp; out.uz = b.upY * sp;             // screen up
  out.tanY = Math.tan(fovDeg * RAD / 2);
  out.tanX = out.tanY * aspect;
  out.aspect = aspect;
  out.distance = distance;
  out.pitch = pitch;
  return out;
}

/** NDC (x right, y up, -1..1) of ground point (wx, wy) with no lens shift. Returns depth in out.z. */
export function projectGround(rig, wx, wy, out = {}) {
  const vx = wx - rig.px, vy = -rig.py, vz = wy - rig.pz;
  const xc = vx * rig.rx + vz * rig.rz;
  const yc = vx * rig.ux + vy * rig.uy + vz * rig.uz;
  const zc = vx * rig.fx + vy * rig.fy + vz * rig.fz;
  out.z = zc;
  out.x = zc > 1e-6 ? xc / (zc * rig.tanX) : 0;
  out.y = zc > 1e-6 ? yc / (zc * rig.tanY) : 0;
  return out;
}

/** Where the 2D renderer draws world point (wx, wy), in NDC. cam2d = { x, y, zoom, viewRot, anchorY }. */
export function pixelNdc2d(cam2d, wx, wy, W, H, viewCells, out = {}) {
  const unit = (H / viewCells) * (cam2d.zoom || 1);
  const r = cam2d.viewRot || 0, c = Math.cos(r), s = Math.sin(r);
  const dx = (wx - cam2d.x) * unit, dy = (wy - cam2d.y) * unit;
  const px = W / 2 + dx * c - dy * s;
  const py = H * (cam2d.anchorY ?? 0.5) + dx * s + dy * c;
  out.x = (2 * px) / W - 1;
  out.y = 1 - (2 * py) / H;
  return out;
}

/**
 * The projection shear (lens shift, in NDC) that frames the shot like the 2D view.
 * Anchor-only: the look-at point lands on the 2D anchor. With a ship position
 * it also pins the ship to its 2D pixel, fading back to anchor-only when the
 * ship is far off screen (the intro pan) so nothing ever lurches.
 */
export function lensShift(rig, cam2d, ship, W, H, viewCells, out = {}, P = CAMERA_3D) {
  const sy0 = 1 - 2 * (cam2d.anchorY ?? 0.5);
  out.x = 0; out.y = sy0;
  if (!ship) return out;
  const want = pixelNdc2d(cam2d, ship.x, ship.y, W, H, viewCells, out._want || (out._want = {}));
  const have = projectGround(rig, ship.x, ship.y, out._have || (out._have = {}));
  if (have.z <= 1e-6) return out;
  const w = 1 - smooth01(P.PIN_FROM, P.PIN_TO, Math.max(Math.abs(want.x), Math.abs(want.y)));
  out.x = lerp(0, want.x - have.x, w);
  out.y = lerp(sy0, want.y - have.y, w);
  return out;
}

/**
 * Ground cells visible across the screen (width) and from the bottom edge to the top edge along
 * the screen's up direction (depth), measured on the ground through the look-at point.
 * Solves the pinhole equations directly (shift included); depth is NaN if the top ray never hits the ground.
 */
export function visibleGround(rig, shift, out = {}) {
  const rayHit = (ndcX, ndcY, o) => {
    // Ray through NDC (ndcX, ndcY) once the lens shift is undone, intersected with y = 0.
    const ax = (ndcX - shift.x) * rig.tanX, ay = (ndcY - shift.y) * rig.tanY;
    const dx = rig.fx + ax * rig.rx + ay * rig.ux, dy = rig.fy + ay * rig.uy, dz = rig.fz + ax * rig.rz + ay * rig.uz;
    if (dy >= -1e-9) { o.hit = false; return o; }
    const t = -rig.py / dy;
    o.hit = true; o.x = rig.px + dx * t; o.y = rig.pz + dz * t;
    return o;
  };
  const l = rayHit(-1, 0, {}), r = rayHit(1, 0, {}), top = rayHit(0, 1, {}), bottom = rayHit(0, -1, {});
  out.width = l.hit && r.hit ? Math.hypot(r.x - l.x, r.y - l.y) : NaN;
  out.depth = top.hit && bottom.hit ? Math.hypot(top.x - bottom.x, top.y - bottom.y) : NaN;
  return out;
}

/** Fallback follow (no 2D camera): the ship plus a smoothed look-ahead along its velocity. */
export function createFollow() { return { seen: false, x: 0, y: 0, lx: 0, ly: 0 }; }
export function stepFollow(f, pose, dt, P = CAMERA_3D) {
  const vx = Number.isFinite(pose.vx) ? pose.vx : 0, vy = Number.isFinite(pose.vy) ? pose.vy : 0;
  const speed = Math.hypot(vx, vy);
  const reach = Math.min(P.LOOK_MAX, speed * P.LOOK_TIME);
  const wantX = speed > 1e-6 ? (vx / speed) * reach : 0, wantY = speed > 1e-6 ? (vy / speed) * reach : 0;
  if (!f.seen) { f.seen = true; f.x = pose.x; f.y = pose.y; f.lx = 0; f.ly = 0; }
  const kl = easeRate(P.LOOK_RESP, dt), kf = easeRate(P.FOLLOW_RESP, dt);
  f.lx += (wantX - f.lx) * kl; f.ly += (wantY - f.ly) * kl;
  f.x += (pose.x + f.lx - f.x) * kf; f.y += (pose.y + f.ly - f.y) * kf;
  return f;
}

/** Screen shake offset (cells) for a decaying amount, deterministic in time. */
export function shakeOffset(time, amount, out = {}) {
  const a = clamp(amount, 0, 1);
  out.x = (Math.sin(time * 71.3) * 0.6 + Math.sin(time * 113.7 + 1.9) * 0.4) * 0.45 * a;
  out.y = (Math.sin(time * 83.1 + 0.7) * 0.6 + Math.sin(time * 127.9 + 2.6) * 0.4) * 0.45 * a;
  return out;
}
