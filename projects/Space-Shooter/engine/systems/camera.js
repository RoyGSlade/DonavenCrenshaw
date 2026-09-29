// src/roadmap/engine/systems/camera.js
// Ship-aligned camera with smoothing, forward bias, aim look-ahead, and cinematic pans
import { state, config } from '../../state.js';

const CAM = {
  // Look-ahead tuning
  LOOK_FWD_BASE: 2.2 * (config.SHIP_SCALE ?? 1),
  LOOK_FWD_SPEED_BOOST: 0.025,          // gentler than before
  LOOK_AIM_MAX: 2.2 * (config.SHIP_SCALE ?? 1),

  // Rotation smoothing (less snappy)
  ROT_MAX_RATE: Math.PI * 1.8,          // rad/s clamp
  ROT_RESP: 8.0,                         // lower = smoother
  ROT_DAMP: 0.86,

  // Position/rotation/zoom smoothing are driven by config.CAMERA_FOLLOW_SPEED (0..1 per second)
  // Fallbacks kept only if config missing
  POS_FOLLOW: Math.min(0.99, Math.max(0.0001, config.CAMERA_FOLLOW_SPEED ?? 0.12)),
  ROT_FOLLOW: Math.min(0.99, Math.max(0.0001, config.CAMERA_FOLLOW_SPEED ?? 0.12)),
  ZOOM_FOLLOW: Math.min(0.99, Math.max(0.0001, config.CAMERA_FOLLOW_SPEED ?? 0.12)),

  // Speed→zoom around the initial zoom
  ZOOM_MIN_MULT: 0.96,
  ZOOM_MAX_MULT: 1.10,
  ZOOM_SPEED_AT_MAX: (config.MAX_SPEED ?? 14),
};

function lerp(a,b,t){ return a + (b-a)*t; }
function angDelta(a,b){ let d=((b-a+Math.PI)%(2*Math.PI))-Math.PI; return d<-Math.PI?d+2*Math.PI:d; }

export function ensureCamera() {
  const gfx = state.gfx || (state.gfx = {});
  if (!gfx.camera) gfx.camera = { x: 0, y: 0, rot: 0, zoom: config.CAMERA_BASE_ZOOM ?? 1 };
  // State initializes a partial camera; repair absent/non-finite fields before smoothing.
  const camera = gfx.camera;
  for (const [key, fallback] of Object.entries({ x: 0, y: 0, rot: 0, zoom: config.CAMERA_BASE_ZOOM })) {
    if (!Number.isFinite(camera[key])) camera[key] = fallback;
  }
  return camera;
}

/** Begin a cinematic pan. While active, player following is ignored. */
export function beginCameraPanTo(x, y, duration = undefined, holdAtEnd = false) {
  const cam = ensureCamera();
  // If duration not provided, compute from desired pan speed (cells/sec)
  let dur = duration;
  if (!(typeof dur === 'number' && isFinite(dur) && dur > 0)) {
    const speed = Math.max(0.01, config.CAMERA_PAN_SPEED ?? 0.2); // cells per second
    const dx = (x - cam.x);
    const dy = (y - cam.y);
    const dist = Math.hypot(dx, dy);
    dur = Math.max(0.05, dist / speed);
  }
  cam._pan = {
    fromX: cam.x, fromY: cam.y,
    toX: x, toY: y,
    t: 0, dur: Math.max(0.01, dur),
    hold: !!holdAtEnd,
    active: true,
  };
}

/** Clear any active pan and hold. Normal player follow resumes. */
export function clearCameraPan() {
  const cam = ensureCamera();
  cam._pan = null;
  cam._hold = null;
}

// Weekly time trial: chase framing. The ship sits near the trailing edge of the
// screen along its direction of travel, so most of the view shows what's ahead
// (mines come fast at these speeds). Locked to the ship's interpolated pose, so
// the only smoothing is on the direction and how far ahead it looks.
const CHASE = {
  LEAD: 0.76,        // at speed: ship 12% in from the trailing edge (88% of the view ahead)
  LEAD_SLOW: 0.32,   // slow: ship a third of the way in (66% of the view ahead)
  LEAD_FROM: 2,      // cells/s where the lead starts growing…
  LEAD_FULL: 11,     // …and where it reaches LEAD (eased between)
  LEAD_RESP: 0.9,    // how fast the lead follows speed (1/s): a slow slide, not a jump
  TURN_EASE: 0.3,    // the lead eases in by up to this much while the framing swings
  SPRING: 2.2,       // critically damped direction spring (rad/s): no lurch, no overshoot
  ZOOM_OUT: 0.9,     // zoom multiplier at full speed
};
const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function updateWeeklyCamera(cam, dt, player) {
  const speed = Math.hypot(player.vx || 0, player.vy || 0);
  // Where the ship is going, blended with where it points while it's slow, so
  // the target never snaps from one to the other.
  const w = smooth01(0.5, 3, speed);
  const hx = Math.cos(player.angle) * (1 - w) + (speed > 1e-6 ? (player.vx / speed) * w : 0);
  const hy = Math.sin(player.angle) * (1 - w) + (speed > 1e-6 ? (player.vy / speed) * w : 0);
  const want = Math.hypot(hx, hy) > 1e-6 ? Math.atan2(hy, hx) : player.angle;
  const k = (rate) => 1 - Math.exp(-rate * Math.max(0, dt));
  if (!Number.isFinite(cam._chaseDir)) { cam._chaseDir = want; cam._chaseSpin = 0; }
  // Critically damped spring on the framing's direction: it eases into a turn
  // and settles without overshooting (sub-stepped so long frames stay stable).
  const err = angDelta(cam._chaseDir, want);
  for (let left = Math.max(0, Math.min(dt, 0.1)); left > 1e-6; left -= 1 / 240) {
    const h = Math.min(1 / 240, left);
    const e = angDelta(cam._chaseDir, want);
    cam._chaseSpin += (CHASE.SPRING ** 2 * e - 2 * CHASE.SPRING * cam._chaseSpin) * h;
    cam._chaseDir += cam._chaseSpin * h;
  }
  const leadWant = lerp(CHASE.LEAD_SLOW, CHASE.LEAD, smooth01(CHASE.LEAD_FROM, CHASE.LEAD_FULL, speed))
    * (1 - CHASE.TURN_EASE * Math.min(1, Math.abs(err) / 1.2));
  cam._chaseLead = Number.isFinite(cam._chaseLead) ? lerp(cam._chaseLead, leadWant, k(CHASE.LEAD_RESP)) : CHASE.LEAD_SLOW;
  const baseZoom = (cam._baseZoom ??= (cam.zoom ?? (config.CAMERA_BASE_ZOOM ?? 1)));
  cam.zoom = lerp(cam.zoom ?? baseZoom, baseZoom * lerp(1, CHASE.ZOOM_OUT, Math.min(1, speed / 12)), k(1.5));
  const gfx = state.gfx;
  const unit = (gfx.cellW || 1) * cam.zoom;
  const halfW = (gfx.canvas?.width / (gfx.dpr || 1)) / unit / 2;
  const halfH = (gfx.canvas?.height / (gfx.dpr || 1)) / unit / 2;
  const dx = Math.cos(cam._chaseDir), dy = Math.sin(cam._chaseDir);
  // Distance from the screen centre to its edge along the travel direction.
  const edge = Math.min(Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity);
  const lead = Number.isFinite(edge) ? edge * cam._chaseLead : 0;
  cam.x = player.x + dx * lead;
  cam.y = player.y + dy * lead;
  return cam;
}
export function resetWeeklyCamera() {
  const cam = ensureCamera();
  cam._chaseDir = NaN;
  cam._chaseLead = NaN;
  cam._chaseSpin = 0;
}

export function updateCamera(dt, player) {
  const cam = ensureCamera();
  if (!player) return cam;
  if (state.mode === 'roadmap' && state.run?.current?.weekly && !cam._pan?.active && !cam._hold) return updateWeeklyCamera(cam, dt, player);

  // If we are in a cinematic pan, drive position solely by pan until finished
  if (cam._pan?.active) {
    cam._pan.t += dt;
    const p = Math.min(1, cam._pan.t / cam._pan.dur);
    // Smoothstep for nicer easing
    const pp = p * p * (3 - 2 * p);
    cam.x = cam._pan.fromX + (cam._pan.toX - cam._pan.fromX) * pp;
    cam.y = cam._pan.fromY + (cam._pan.toY - cam._pan.fromY) * pp;
    if (p >= 1) {
      if (cam._pan.hold) {
        cam._hold = { x: cam._pan.toX, y: cam._pan.toY };
      }
      cam._pan.active = false;
      cam._pan = null;
    }
  } else if (cam._hold) {
    // While holding, pin the camera until cleared
    cam.x = cam._hold.x;
    cam.y = cam._hold.y;
  }

  const speed = Math.hypot(player.vx, player.vy);
  const fwd = player.angle;

  // Look-ahead based on heading + optional aim bias
  let lookFwd = CAM.LOOK_FWD_BASE + speed * CAM.LOOK_FWD_SPEED_BOOST;
  if (state.keys?.aimActive && state.keys?.aimStrength > 0.05) {
    const a = state.keys.aimAngle;
    const aimBias = CAM.LOOK_AIM_MAX * Math.min(1, state.keys.aimStrength);
    const ax = Math.cos(a) * aimBias;
    const ay = Math.sin(a) * aimBias;
    cam._aimOffsetX = ax; cam._aimOffsetY = ay;
    lookFwd += (ax * Math.cos(fwd) + ay * Math.sin(fwd)) * 0.55;
  } else {
    cam._aimOffsetX = cam._aimOffsetY = 0;
  }

  const targetX = player.x + Math.cos(fwd) * lookFwd;
  const targetY = player.y + Math.sin(fwd) * lookFwd;
  const targetRot = fwd;

  // Base zoom comes from initial state.gfx.camera.zoom and never gets “forgotten.”
  const baseZoom = (cam._baseZoom ??= (cam.zoom ?? (config.CAMERA_BASE_ZOOM ?? 1)));

  // Arena = fixed zoom. Roadmap = gentle speed-based zoom around base.
  let targetZoom = baseZoom;
  if (state.mode === 'roadmap') {
    const speedT = Math.min(1, speed / (CAM.ZOOM_SPEED_AT_MAX * 1.25));
    targetZoom = lerp(baseZoom * 0.95, baseZoom * 1.10, speedT);
  }

  // Smoothing
  // Only follow target when not in a pan/hold
  if (!cam._pan?.active && !cam._hold) {
    const posAlpha = 1 - Math.pow(1 - CAM.POS_FOLLOW, dt);
    cam.x = lerp(cam.x, targetX, posAlpha);
    cam.y = lerp(cam.y, targetY, posAlpha);
  }

  const rotAlpha = 1 - Math.pow(1 - CAM.ROT_FOLLOW, dt);
  const d = angDelta(cam.rot, targetRot);
  const step = Math.max(-CAM.ROT_MAX_RATE * dt, Math.min(CAM.ROT_MAX_RATE * dt, d));
  cam.rot = cam.rot + step * rotAlpha;

  const zoomAlpha = 1 - Math.pow(1 - CAM.ZOOM_FOLLOW, dt);
  cam.zoom = lerp(cam.zoom ?? baseZoom, targetZoom, zoomAlpha);

  // A heading offset that fits a desktop can push the entire ship off a portrait screen.
  // Keep ordinary follow inside the central half; cinematic pans retain their own framing.
  if (!cam._pan?.active && !cam._hold) {
    const gfx = state.gfx;
    const pixelsPerCell = gfx.cellW * cam.zoom;
    const width = gfx.canvas?.width / (gfx.dpr || 1);
    const height = gfx.canvas?.height / (gfx.dpr || 1);
    if (pixelsPerCell > 0 && Number.isFinite(width) && Number.isFinite(height)) {
      const marginX = width / pixelsPerCell * 0.25;
      const marginY = height / pixelsPerCell * 0.25;
      cam.x = Math.max(player.x - marginX, Math.min(player.x + marginX, cam.x));
      cam.y = Math.max(player.y - marginY, Math.min(player.y + marginY, cam.y));
    }
  }

  return cam;
}

