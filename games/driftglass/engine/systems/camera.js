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
  return gfx.camera;
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

export function updateCamera(dt, player) {
  const cam = ensureCamera();
  if (!player) return cam;

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

  return cam;
}

