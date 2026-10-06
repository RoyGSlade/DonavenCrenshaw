// The 3D camera: a tilted top-down chase camera that frames the race like the
// 2D one does (same view mode, same zoom, same intro pan), with perspective
// added so the track ahead reads further. All the framing maths lives in
// motion/cameraMath.js (tested without WebGL); this file only moves a
// THREE.PerspectiveCamera to what that maths says.
//
// Contract (gfx3d/index.js):
//   createCameraRig(THREE) -> { camera, update(lv, pose, cam2d, viewport, dt), resize(w, h) }
//
// cam2d is state.gfx.camera. Its x/y already carry the 2D chase framing (the
// look-ahead along velocity, the intro flythrough pan), and viewRot/anchorY say
// whether it is the track view or the behind-ship view, so following it is how
// the 3D view mirrors them. If it is missing (a fresh page, a test) the rig
// follows the ship itself with its own smoothed look-ahead along its velocity.
import { CAMERA_3D, cameraDistance, createFollow, lensShift, pitchForAnchor, placeRig, shakeOffset, stepFollow } from './motion/cameraMath.js';
import { reducedMotion, viewCells } from './motion/prefs.js';
import { easeRate } from './motion/spring.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export function createCameraRig(THREE) {
  const camera = new THREE.PerspectiveCamera(CAMERA_3D.FOV, 1, CAMERA_3D.NEAR, CAMERA_3D.FAR);
  const follow = createFollow();
  const placed = {};
  const shift = {};
  const shakeVec = { x: 0, y: 0 };
  const view = { x: 0, y: 0, zoom: 1, viewRot: 0, anchorY: 0.5 };
  const own2d = { x: 0, y: 0, zoom: 1.85, viewRot: 0, anchorY: 0.5 };
  let aspect = 1;
  let clock = 0;
  let shake = 0;
  let lastStun = 0, lastWreck = false;
  const target = new THREE.Vector3();

  function apply(W, H, cam, pose, dt, lv) {
    const reduced = reducedMotion(lv);
    clock += Math.min(Math.max(dt, 0), 0.1);

    // Screen shake from what the player just felt: a rail hit, the wreck. Decays fast; off with reduced motion.
    const stun = pose?.stunTimer || 0, wreck = !!lv?.wreck;
    if (stun > 0 && lastStun <= 0) shake = Math.max(shake, 0.28);
    if (wreck && !lastWreck) shake = Math.max(shake, 0.9);
    lastStun = stun; lastWreck = wreck;
    shake *= 1 - easeRate(7, dt);
    if (shake < 0.002) shake = 0;
    if (reduced || shake === 0) { shakeVec.x = shakeVec.y = 0; } else shakeOffset(clock, shake, shakeVec);

    const cells = viewCells();
    const zoom = finite(cam.zoom) && cam.zoom > 0.05 ? cam.zoom : 1;
    const anchorY = finite(cam.anchorY) ? cam.anchorY : 0.5;
    const viewRot = finite(cam.viewRot) ? cam.viewRot : 0;
    view.x = cam.x; view.y = cam.y; view.zoom = zoom; view.viewRot = viewRot; view.anchorY = anchorY;

    placeRig({
      tx: cam.x + shakeVec.x, ty: cam.y + shakeVec.y, viewRot,
      distance: cameraDistance(cells, zoom), pitch: pitchForAnchor(anchorY), aspect: W / Math.max(1, H),
    }, placed);
    camera.position.set(placed.px, placed.py, placed.pz);
    target.set(placed.tx, 0, placed.ty);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.aspect = W / Math.max(1, H);
    camera.updateProjectionMatrix();

    // Lens shift: anchor the view like 2D, and keep the ship on its 2D pixel so the 2D HUD stays attached to it.
    lensShift(placed, view, pose && finite(pose.x) && finite(pose.y) ? pose : null, W, H, cells, shift);
    const e = camera.projectionMatrix.elements;
    e[8] = -shift.x;
    e[9] = -shift.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  return {
    camera,
    update(lv, pose, cam2d, viewport, dt = 0) {
      const W = viewport?.width || 1, H = viewport?.height || 1;
      let cam = cam2d;
      if (!cam || !finite(cam.x) || !finite(cam.y)) {
        // No 2D camera to mirror: chase the ship with a look-ahead along its velocity.
        if (!pose) return;
        stepFollow(follow, pose, dt);
        own2d.x = follow.x; own2d.y = follow.y;
        cam = own2d;
      }
      apply(W, H, cam, pose, dt, lv);
    },
    resize(w, h) {
      aspect = w / Math.max(1, h);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}
