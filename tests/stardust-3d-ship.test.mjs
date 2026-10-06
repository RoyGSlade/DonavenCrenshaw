// The 3D ship, camera and effects. Pure maths in gfx3d/motion/ runs without a
// browser; the rigs run against the vendored three.js (it builds geometry,
// materials and cameras fine in node, it just can't draw).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../projects/Space-Shooter/vendor/three/three.module.js';
import { clamp, angDelta, stepSpring, easeRate, wobble } from '../projects/Space-Shooter/gfx3d/motion/spring.js';
import {
  SHIP_MOTION, steerInput, strafeInput, localVelocity, bankTarget, pitchTarget, stunShake, createMotionState, stepMotion,
} from '../projects/Space-Shooter/gfx3d/motion/shipMotion.js';
import {
  CAMERA_3D, viewBasis, pitchForAnchor, cameraDistance, placeRig, projectGround, pixelNdc2d, lensShift, visibleGround,
  createFollow, stepFollow, shakeOffset,
} from '../projects/Space-Shooter/gfx3d/motion/cameraMath.js';
import { createPool, spawn, stepPool, clearPool, ageFrac, lifeAlpha } from '../projects/Space-Shooter/gfx3d/motion/particlePool.js';
import { createWatch, watchFrame } from '../projects/Space-Shooter/gfx3d/motion/fxWatch.js';
import { loftPrism, buildCourier, COURIER } from '../projects/Space-Shooter/gfx3d/motion/courierModel.js';
import { familyOf, pickShipModel, fitModel, ownMaterials } from '../projects/Space-Shooter/gfx3d/motion/shipAssets.js';
import { shipInfo, portWorld } from '../projects/Space-Shooter/gfx3d/motion/shipInfo.js';
import { createShipRig, createGhostRig } from '../projects/Space-Shooter/gfx3d/ship.js';
import { createCameraRig } from '../projects/Space-Shooter/gfx3d/camera.js';
import { createFx } from '../projects/Space-Shooter/gfx3d/fx.js';
import { buildScale } from '../projects/Space-Shooter/engine/shipStats.js';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, msg || `${a} not within ${eps} of ${b}`);

// --------------------------------------------------------------- spring ----
test('angDelta takes the short way round', () => {
  near(angDelta(0.1, -0.1), -0.2);
  near(angDelta(3.0, -3.0), 2 * Math.PI - 6.0);
  near(angDelta(-3.0, 3.0), 6.0 - 2 * Math.PI);
});

test('a critically damped spring settles without overshoot; an underdamped one overshoots a little', () => {
  const crit = { x: 0, v: 0 };
  let max = 0;
  for (let i = 0; i < 240; i++) { stepSpring(crit, 1, 12, 1, 1 / 60); max = Math.max(max, crit.x); }
  assert.ok(max <= 1 + 1e-4, `critical spring overshot to ${max}`);
  near(crit.x, 1, 1e-3);
  const under = { x: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < 240; i++) { stepSpring(under, 1, 12, 0.5, 1 / 60); peak = Math.max(peak, under.x); }
  assert.ok(peak > 1.05 && peak < 1.3, `underdamped peak ${peak}`);
});

test('spring and easing are stable on a huge frame', () => {
  const s = { x: 0, v: 0 };
  stepSpring(s, 1, 40, 0.6, 5);   // a 5 s hitch is clamped, not integrated blindly
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 3);
  near(easeRate(10, 0), 0);
  assert.ok(easeRate(10, 10) > 0.999);
  assert.ok(Math.abs(wobble(1.234, 3)) <= 1);
});

// ----------------------------------------------------------- ship motion ----
test('local velocity splits along the nose and toward starboard', () => {
  // Heading +x (angle 0): starboard is +y on the sim's y-down plane.
  const a = localVelocity(0, 3, 2);
  near(a.fwd, 3); near(a.lat, 2);
  // Heading down the screen (angle 90deg): forward is +y, starboard is -x.
  const b = localVelocity(Math.PI / 2, 0, 5);
  near(b.fwd, 5); near(b.lat, 0, 1e-9);
  const c = localVelocity(Math.PI / 2, -4, 0);
  near(c.lat, 4);
});

test('steering and strafe inputs read analog first, then keys', () => {
  assert.equal(steerInput({ turnStrength: -0.5, right: true }), -0.5);
  assert.equal(steerInput({ right: true }), 1);
  assert.equal(steerInput({ left: true }), -1);
  assert.equal(steerInput({ left: true, right: true }), 0);
  assert.equal(steerInput(null), 0);
  assert.equal(strafeInput({ strafeRight: true }), 1);
  assert.equal(strafeInput({ strafeLeft: true, strafeStrength: 0.6 }), -1);
  assert.equal(strafeInput({}), 0);
  assert.ok(strafeInput({ strafeRight: true, strafeStrength: 0.1 }) >= 0.35);
});

test('bank follows steering, yaw, strafe and slide with the right signs, and is capped', () => {
  assert.ok(bankTarget({ steer: 1 }) > 0.2, 'turning right banks starboard-down');
  assert.ok(bankTarget({ steer: -1 }) < -0.2);
  assert.ok(bankTarget({ yawRate: 3 }) > 0);
  assert.ok(bankTarget({ strafe: 1 }) > 0);
  // Sliding toward starboard means the nose points to port of travel: lean to the nose side.
  assert.ok(bankTarget({ lat: 5 }) < 0);
  assert.equal(bankTarget({}), 0);
  const huge = bankTarget({ steer: 1, yawRate: 99, strafe: 1 });
  assert.ok(huge <= SHIP_MOTION.MAX_BANK + 1e-9);
  assert.ok(bankTarget({ steer: -1, yawRate: -99, strafe: -1 }) >= -SHIP_MOTION.MAX_BANK - 1e-9);
});

test('pitch lifts under power and dips on brake, within limits', () => {
  assert.ok(pitchTarget({ thrust: 1 }) > 0);
  assert.ok(pitchTarget({ brake: 1 }) < 0);
  assert.ok(pitchTarget({ back: 1 }) < 0);
  assert.ok(Math.abs(pitchTarget({ thrust: 1, boost: 1 })) <= SHIP_MOTION.MAX_PITCH + 1e-9);
});

test('stun shake is zero at rest, bounded, and deterministic', () => {
  const z = stunShake(0.3, 0, {});
  assert.deepEqual([z.x, z.z, z.roll, z.yaw], [0, 0, 0, 0]);
  const a = stunShake(0.7, 1, {}), b = stunShake(0.7, 1, {});
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.x) <= SHIP_MOTION.STUN_SHAKE && Math.abs(a.roll) <= 0.12);
});

function run(m, frames, poseAt, input, dt = 1 / 60) {
  const out = {};
  for (let i = 0; i < frames; i++) stepMotion(m, poseAt(i), typeof input === 'function' ? input(i) : input, dt, out);
  return out;
}

test('holding a right turn banks the ship right and it levels out after', () => {
  const m = createMotionState();
  const rate = 2.2; // rad/s, as the sim turns
  const turning = run(m, 40, (i) => ({ x: i * 0.1, y: 0, angle: rate * i / 60, vx: 6, vy: 0 }), { steer: 1, thrust: 1, active: true });
  assert.ok(turning.bank > 0.3, `banked ${turning.bank}`);
  assert.ok(turning.glow > 0.8 && turning.pitch > 0);
  const lvl = run(m, 120, () => ({ x: 5, y: 0, angle: 1.4, vx: 6 * Math.cos(1.4), vy: 6 * Math.sin(1.4) }), { thrust: 1, active: true });
  assert.ok(Math.abs(lvl.bank) < 0.05, `levelled to ${lvl.bank}`);
});

test('a left turn banks left, and strafing leans toward the strafe', () => {
  const m = createMotionState();
  const left = run(m, 40, (i) => ({ x: 0, y: 0, angle: -2.2 * i / 60, vx: 6, vy: 0 }), { steer: -1, thrust: 1, active: true });
  assert.ok(left.bank < -0.3);
  const s = createMotionState();
  const strafe = run(s, 30, () => ({ x: 0, y: 0, angle: 0, vx: 4, vy: 0 }), { strafe: 1, active: true });
  assert.ok(strafe.bank > 0.1 && strafe.strafe > 0.8);
});

test('stun kills the engines and flags the shake; boost raises the flare then fades', () => {
  const m = createMotionState();
  const out = run(m, 20, () => ({ x: 0, y: 0, angle: 0, vx: 8, vy: 0, stunTimer: 0.5 }), { thrust: 1, steer: 1, active: true });
  assert.equal(out.stunned, true);
  assert.ok(out.stun > 0.9 && out.glow < 0.05, 'a stunned hull ignores the keys');
  assert.ok(Math.abs(out.bank) < 0.05);
  const b = createMotionState();
  const fired = run(b, 3, () => ({ x: 0, y: 0, angle: 0, vx: 8, vy: 0, _boostCd: 0.25 }), { thrust: 1, active: true });
  assert.ok(fired.boost > 0.9);
  const faded = run(b, 90, () => ({ x: 0, y: 0, angle: 0, vx: 8, vy: 0, _boostCd: 0 }), { thrust: 1, active: true });
  assert.ok(faded.boost < 0.02);
});

test('the engines are off before launch, and a restart (teleport) resets the springs', () => {
  const m = createMotionState();
  const idle = run(m, 20, () => ({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 }), { thrust: 1, active: false });
  assert.equal(idle.glow, 0, 'before launch the keys do nothing');
  const fresh = createMotionState();
  const out = {};
  stepMotion(fresh, { x: 0, y: 0, angle: 0, vx: 6, vy: 0 }, { steer: 1, thrust: 1 }, 1 / 60, out);
  for (let i = 0; i < 40; i++) stepMotion(fresh, { x: i * 0.1, y: 0, angle: 2.2 * i / 60, vx: 6, vy: 0 }, { steer: 1, thrust: 1 }, 1 / 60, out);
  assert.ok(Math.abs(out.bank) > 0.2);
  stepMotion(fresh, { x: 80, y: 40, angle: 0, vx: 0, vy: 0 }, {}, 1 / 60, out);
  assert.ok(Math.abs(out.bank) < 1e-6 && out.glow === 0, 'a jump of many cells is a restart, not motion');
});

test('ghosts without velocity still bank from where they have been', () => {
  const m = createMotionState();
  const out = run(m, 60, (i) => ({ x: 10 * Math.cos(i / 20), y: 10 * Math.sin(i / 20), angle: i / 20 + Math.PI / 2 }), {});
  assert.ok(out.speed > 5, `estimated speed ${out.speed}`);
  assert.ok(out.bank > 0.05, 'a ghost circling clockwise on screen leans right');
});

// ------------------------------------------------------------ camera math ----
test('the view basis matches the 2D renderer for the track and behind-ship views', () => {
  const t = viewBasis(0);
  near(t.upX, 0); near(t.upY, -1); near(t.rightX, 1); near(t.rightY, 0);
  for (const a of [0, 0.7, 2.1, -1.3, 3.0]) {
    const b = viewBasis(-Math.PI / 2 - a);   // behindRotation(a): the ship points up the screen
    near(b.upX, Math.cos(a), 1e-9); near(b.upY, Math.sin(a), 1e-9);
  }
});

test('camera distance scales inversely with zoom and shows the 2D width at the look-at point', () => {
  const d1 = cameraDistance(18, 1), d2 = cameraDistance(18, 2);
  near(d1, 2 * d2, 1e-9);
  for (const zoom of [0.8, 1.15, 1.85]) {
    for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
      const rig = placeRig({ tx: 3, ty: 4, viewRot: 0.4, distance: cameraDistance(18, zoom), pitch: pitchForAnchor(0.5), aspect });
      const shift = lensShift(rig, { x: 3, y: 4, zoom, viewRot: 0.4, anchorY: 0.5 }, null, 1000, 1000 / aspect, 18, {});
      const g = visibleGround(rig, shift, {});
      const want = (18 / zoom) * aspect;
      assert.ok(Math.abs(g.width / want - 1) < 0.02, `zoom ${zoom} aspect ${aspect}: ground width ${g.width} vs 2D ${want}`);
      assert.ok(g.depth > 18 / zoom * 0.95, 'it shows at least as much track top to bottom as 2D');
    }
  }
});

test('pitch eases from the track view to the behind-ship view with the anchor', () => {
  const track = pitchForAnchor(0.5), behind = pitchForAnchor(0.9);
  near(track, CAMERA_3D.PITCH_TRACK * Math.PI / 180, 1e-9);
  near(behind, CAMERA_3D.PITCH_BEHIND * Math.PI / 180, 1e-9);
  assert.ok(pitchForAnchor(0.7) < track && pitchForAnchor(0.7) > behind);
  assert.ok(track > 0.7 && track < 1.1 && behind > 0.7, 'the chase pitch stays in the 45-60 degree band');
});

test('the look-at point lands on the 2D anchor (centre of the track view, lower in the behind view)', () => {
  for (const anchorY of [0.5, 0.78, 0.9]) {
    const cam2d = { x: 10, y: 20, zoom: 1.3, viewRot: -1.0, anchorY };
    const rig = placeRig({ tx: 10, ty: 20, viewRot: -1.0, distance: cameraDistance(18, 1.3), pitch: pitchForAnchor(anchorY), aspect: 16 / 9 });
    const shift = lensShift(rig, cam2d, null, 1280, 720, 18, {});
    const p = projectGround(rig, 10, 20, {});
    const ndcY = p.y + shift.y, want = pixelNdc2d(cam2d, 10, 20, 1280, 720, 18, {}).y;
    near(ndcY, want, 1e-9);
    near(p.x + shift.x, 0, 1e-9);
  }
});

test('the ship is pinned to the exact pixel the 2D renderer draws it at, so the 2D HUD stays attached', () => {
  const cam2d = { x: 30, y: 12, zoom: 0.83, viewRot: -2.8, anchorY: 0.78 };
  const ship = { x: 33, y: 7 };
  const rig = placeRig({ tx: cam2d.x, ty: cam2d.y, viewRot: cam2d.viewRot, distance: cameraDistance(18, cam2d.zoom), pitch: pitchForAnchor(cam2d.anchorY), aspect: 1280 / 720 });
  const shift = lensShift(rig, cam2d, ship, 1280, 720, 18, {});
  const got = projectGround(rig, ship.x, ship.y, {}), want = pixelNdc2d(cam2d, ship.x, ship.y, 1280, 720, 18, {});
  near(got.x + shift.x, want.x, 1e-9); near(got.y + shift.y, want.y, 1e-9);
});

test('a ship far off screen (the intro pan) falls back to anchor-only framing instead of lurching', () => {
  const cam2d = { x: 0, y: 0, zoom: 1.15, viewRot: 0, anchorY: 0.5 };
  const rig = placeRig({ tx: 0, ty: 0, viewRot: 0, distance: cameraDistance(18, 1.15), pitch: pitchForAnchor(0.5), aspect: 16 / 9 });
  const shift = lensShift(rig, cam2d, { x: 400, y: -300 }, 1280, 720, 18, {});
  near(shift.x, 0, 1e-9); near(shift.y, 0, 1e-9);
  const mid = lensShift(rig, cam2d, { x: 14, y: 0 }, 1280, 720, 18, {});
  assert.ok(Number.isFinite(mid.x) && Math.abs(mid.x) < 1);
});

test('the fallback follow looks ahead along the velocity and converges on the ship', () => {
  const f = createFollow();
  stepFollow(f, { x: 0, y: 0, vx: 0, vy: 0 }, 1 / 60);
  let pose;
  for (let i = 0; i < 300; i++) { pose = { x: i * 0.1, y: 0, vx: 6, vy: 0 }; stepFollow(f, pose, 1 / 60); }
  assert.ok(f.x > pose.x + 1.5, `looked ahead by ${f.x - pose.x}`);
  assert.ok(f.x - pose.x <= CAMERA_3D.LOOK_MAX + 0.5);
  assert.ok(Math.abs(f.y) < 1e-6);
  const g = createFollow();
  for (let i = 0; i < 300; i++) stepFollow(g, { x: 5, y: 5, vx: 0, vy: 0 }, 1 / 60);
  near(g.x, 5, 1e-3); near(g.y, 5, 1e-3);
});

test('camera shake is zero at zero and bounded', () => {
  const z = shakeOffset(3.3, 0, {});
  near(z.x, 0, 1e-12); near(z.y, 0, 1e-12);
  for (let t = 0; t < 5; t += 0.07) { const s = shakeOffset(t, 1, {}); assert.ok(Math.abs(s.x) <= 0.45 && Math.abs(s.y) <= 0.45); }
});

test('the camera rig mirrors the 2D camera end to end: ship on its 2D pixel, view rotation, no NaN', () => {
  const rig = createCameraRig(THREE);
  rig.resize(1280, 720);
  for (const cam2d of [
    { x: 24, y: 11, zoom: 1.15, viewRot: 0, anchorY: 0.5 },
    { x: 50, y: 150, zoom: 0.83, viewRot: -2.8, anchorY: 0.78 },
  ]) {
    const pose = { x: cam2d.x + 2.5, y: cam2d.y - 1.5, angle: 0.3, vx: 3, vy: 1 };
    rig.update({}, pose, cam2d, { width: 1280, height: 720 }, 1 / 60);
    rig.camera.updateMatrixWorld(true);   // the renderer does this each frame
    const v = new THREE.Vector3(pose.x, 0, pose.y).project(rig.camera);
    const want = pixelNdc2d(cam2d, pose.x, pose.y, 1280, 720, 18, {});
    near(v.x, want.x, 1e-6, 'ship x on its 2D pixel'); near(v.y, want.y, 1e-6, 'ship y on its 2D pixel');
    // Screen up (toward NDC +y) is the world direction viewBasis says.
    const b = viewBasis(cam2d.viewRot);
    const ahead = new THREE.Vector3(pose.x + b.upX * 2, 0, pose.y + b.upY * 2).project(rig.camera);
    assert.ok(ahead.y > v.y, 'moving up the 2D screen moves up the 3D screen');
    const right = new THREE.Vector3(pose.x + b.rightX * 2, 0, pose.y + b.rightY * 2).project(rig.camera);
    assert.ok(right.x > v.x, 'and right is right (no mirroring)');
    assert.ok(Number.isFinite(rig.camera.position.x + rig.camera.position.y + rig.camera.position.z));
    assert.ok(rig.camera.position.y > 5 && rig.camera.position.y < 60, 'a chase height, not a ground-level or orbital one');
  }
});

test('with no 2D camera the rig follows the ship itself', () => {
  const rig = createCameraRig(THREE);
  rig.resize(800, 600);
  for (let i = 0; i < 120; i++) rig.update({}, { x: i * 0.1, y: 3, angle: 0, vx: 6, vy: 0 }, null, { width: 800, height: 600 }, 1 / 60);
  assert.ok(Number.isFinite(rig.camera.position.x));
  const v = new THREE.Vector3(11.9, 0, 3).project(rig.camera);
  assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1, 'the ship stays on screen');
});

test('shake respects reduced motion', async () => {
  const { state } = await import('../projects/Space-Shooter/state.js');
  const rig = createCameraRig(THREE);
  rig.resize(1280, 720);
  const cam2d = { x: 5, y: 5, zoom: 1.15, viewRot: 0, anchorY: 0.5 };
  const at = (lv, pose) => { rig.update(lv, pose, cam2d, { width: 1280, height: 720 }, 1 / 60); return rig.camera.position.x; };
  const base = { x: 5, y: 5, angle: 0, vx: 0, vy: 0, stunTimer: 0 };
  at({}, base);
  const still = at({}, base);
  const hit = []; for (let i = 0; i < 6; i++) hit.push(at({}, { ...base, stunTimer: 0.3 }));
  assert.ok(hit.some((x) => Math.abs(x - still) > 1e-4), 'a rail hit shakes the view');
  state.settings.reducedMotion = true;
  try {
    const rig2 = createCameraRig(THREE); rig2.resize(1280, 720);
    rig2.update({}, base, cam2d, { width: 1280, height: 720 }, 1 / 60);
    const x0 = rig2.camera.position.x;
    for (let i = 0; i < 6; i++) rig2.update({}, { ...base, stunTimer: 0.3 }, cam2d, { width: 1280, height: 720 }, 1 / 60);
    near(rig2.camera.position.x, x0, 1e-9);
  } finally { state.settings.reducedMotion = false; }
});

// ------------------------------------------------------------ particles ----
test('the particle pool never grows, recycles the oldest slot and expires on time', () => {
  const pool = createPool(4);
  const arrays = pool.px;
  const d = { x: 1, life: 0.5, vx: 2 };
  for (let i = 0; i < 10; i++) spawn(pool, d);
  assert.equal(pool.px, arrays, 'same typed arrays');
  assert.equal(pool.capacity, 4);
  assert.equal(stepPool(pool, 0.25), 4);
  near(pool.px[0], 1 + 2 * 0.25, 1e-6);
  near(ageFrac(pool, 0), 0.5, 1e-6);
  assert.equal(stepPool(pool, 0.3), 0);
  clearPool(pool);
  assert.equal(pool.alive, 0);
  assert.equal(stepPool(pool, -1), 0, 'a negative step does nothing');
});

test('particles damp, fall and fade', () => {
  const pool = createPool(2);
  spawn(pool, { life: 1, vx: 10, drag: 3, grav: -9.8, y: 5 });
  stepPool(pool, 0.5);
  assert.ok(pool.vx[0] < 10 * Math.exp(-1.4) + 0.01 && pool.vx[0] > 0);
  assert.ok(pool.py[0] < 5, 'gravity pulls it down');
  assert.equal(lifeAlpha(0, 1), 0);
  assert.ok(lifeAlpha(0.3, 1) > lifeAlpha(0.8, 1));
  near(lifeAlpha(1, 1), 0);
});

// ----------------------------------------------------------- fx watching ----
function scene(extra = {}) {
  return { layout: {}, shardList: [{ id: 'S1', x: 5, y: 6 }, { id: 'S2', x: 9, y: 2 }, { id: 'S3', x: 12, y: 3 }], shards: new Set(), wreck: null, launched: false, ...extra };
}
const pose0 = { x: 1, y: 1, angle: 0, vx: 3, vy: 0, stunTimer: 0, _boostCd: 0 };
const kinds = (w, n) => Array.from({ length: n }, (_, i) => w.events[i].kind);

test('the watcher reports a collected shard once, at the shard', () => {
  const w = createWatch(), lv = scene();
  assert.equal(watchFrame(w, lv, pose0), 0);
  lv.shards.add('S2');
  const n = watchFrame(w, lv, pose0);
  assert.deepEqual(kinds(w, n), ['shard']);
  assert.deepEqual([w.events[0].x, w.events[0].y], [9, 2]);
  assert.equal(watchFrame(w, lv, pose0), 0);
  lv.shards.add('S1'); lv.shards.add('S3');
  const m = watchFrame(w, lv, pose0);
  assert.deepEqual(kinds(w, m).sort(), ['shard', 'shard']);
});

test('the watcher starts clean on a restart and on shards already held', () => {
  const w = createWatch(), lv = scene({ shards: new Set(['S1']) });
  assert.equal(watchFrame(w, lv, pose0), 0, 'what was already collected is not an event');
  const again = scene();
  again.layout = lv.layout;           // same track, fresh attempt
  assert.equal(watchFrame(w, again, pose0), 0);
  again.shards.add('S1');
  assert.deepEqual(kinds(w, watchFrame(w, again, pose0)), ['shard'], 'collected again after the restart');
});

test('the watcher spots the wreck, a rail hit, a boost and the launch', () => {
  const w = createWatch(), lv = scene();
  watchFrame(w, lv, pose0);
  lv.launched = true;
  assert.deepEqual(kinds(w, watchFrame(w, lv, pose0)), ['launch']);
  assert.deepEqual(kinds(w, watchFrame(w, lv, { ...pose0, _boostCd: 0.25 })), ['boost']);
  assert.equal(watchFrame(w, lv, { ...pose0, _boostCd: 0.2 }), 0, 'a cooldown ticking down is not a boost');
  assert.deepEqual(kinds(w, watchFrame(w, lv, { ...pose0, _boostCd: 0, stunTimer: 0.4 })), ['sparks']);
  assert.equal(watchFrame(w, lv, { ...pose0, stunTimer: 0.3 }), 0, 'stun continuing is not a new hit');
  watchFrame(w, lv, { ...pose0, stunTimer: 0 });
  lv.wreck = { x: 7, y: 8, t: 0, cause: 'mine' };
  const n = watchFrame(w, lv, pose0);
  assert.deepEqual(kinds(w, n), ['explosion']);
  assert.deepEqual([w.events[0].x, w.events[0].y], [7, 8]);
  assert.equal(watchFrame(w, lv, pose0), 0);
});

// ----------------------------------------------------------------- models ----
test('lofted prisms face outward (top up, bottom down, sides away from the centre)', () => {
  for (const outline of [[[0.5, 0], [0, 0.2], [-0.5, 0.1], [-0.5, -0.1], [0, -0.2]], [[0.5, 0], [0, -0.2], [-0.5, -0.1], [-0.5, 0.1], [0, 0.2]]]) {
    const g = loftPrism(THREE, outline, 0, 0.1, 0.7);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 - 0.05, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      assert.ok(n.getX(i) * cx + n.getY(i) * cy + n.getZ(i) * cz > 0, `triangle ${i / 3} faces inward`);
    }
  }
});

test('the procedural Courier is one cell long, nose on +X, with the sprite\'s span and engine ports', () => {
  const m = buildCourier(THREE);
  const box = new THREE.Box3().setFromObject(m.root);
  const size = box.getSize(new THREE.Vector3());
  near(size.x, 1, 0.06); near(box.max.x, 0.5, 0.02);
  assert.ok(size.z > 0.8 && size.z < 0.95, `span ${size.z}`);
  assert.ok(size.y < 0.2, 'a low profile');
  assert.equal(COURIER.PORTS.length, 2);
  assert.ok(COURIER.PORTS.every((p) => p.x < -0.3));
  for (const g of m.geometries) g.dispose();
});

test('ship models are picked by build, then family, then the standard ship', () => {
  const a = new THREE.Group(), b = new THREE.Group(), c = new THREE.Group();
  const assets = { ships: { 'needle:0-1-2-0': a, needle: b, default: c } };
  assert.equal(pickShipModel(assets, 'needle:0-1-2-0').object, a);
  assert.equal(pickShipModel(assets, 'needle:2-0-0-1').object, b);
  assert.equal(pickShipModel(assets, 'manta:0-0-0-0').object, c);
  assert.equal(pickShipModel(assets, null).key, 'default');
  assert.equal(pickShipModel({ ships: {} }, 'needle:0-0-0-0'), null);
  assert.equal(pickShipModel(null, 'x'), null);
  assert.equal(familyOf('wisp:1-1-1-1'), 'wisp');
  assert.equal(familyOf(null), '');
});

test('a loaded model is scaled to one cell long, centred, and its exhaust nodes become ports', () => {
  const src = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 6), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
  hull.position.set(10, 3, -2);                        // off-centre and in arbitrary units
  src.add(hull);
  const nozzle = new THREE.Object3D(); nozzle.name = 'exhaust_L'; nozzle.position.set(6.5, 3, -3);
  src.add(nozzle);
  const fit = fitModel(THREE, src);
  const box = new THREE.Box3().setFromObject(fit.root);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  near(size.x, 1, 1e-6); near(centre.x, 0, 1e-6); near(centre.z, 0, 1e-6);
  assert.equal(fit.ports.length, 1);
  assert.ok(fit.ports[0].x < -0.3);
  const plain = fitModel(THREE, hull.clone());
  assert.equal(plain.ports.length, 2, 'no exhaust nodes: the standard two ports');
  // Rigs own their materials: flashing one never touches the shared asset.
  const own = ownMaterials(fit.root);
  assert.equal(own.length, 1);
  assert.notEqual(own[0].material, hull.material);
  assert.equal(src.children[0].material, hull.material);
});

// ----------------------------------------------------------------- rigs ----
const baseLv = (extra = {}) => ({ lockedInStart: false, launched: true, fuel: 80, flux: 50, layout: {}, ship: null, shardList: [], shards: new Set(), wreck: null, ...extra });

test('the ship rig sits at the sim pose with the sim heading and banks into a turn', () => {
  const rig = createShipRig(THREE, { ships: {} });
  const scene3 = new THREE.Scene(); scene3.add(rig.group);
  const lv = baseLv();
  let pose = { x: 10, y: 4, angle: 0.5, vx: 5, vy: 2, stunTimer: 0 };
  rig.update(pose, { thrustStrength: 1 }, lv, 1, 1 / 60);
  near(rig.group.position.x, 10); near(rig.group.position.z, 4);
  near(rig.group.rotation.y, -0.5);
  assert.ok(rig.group.position.y === 0);
  for (let i = 0; i < 40; i++) {
    pose = { x: 10 + i * 0.1, y: 4, angle: 0.5 + 2.2 * i / 60, vx: 5, vy: 2, stunTimer: 0 };
    rig.update(pose, { thrustStrength: 1, right: true }, lv, 1 + i / 60, 1 / 60);
  }
  const body = rig.group.children[0].children[0];
  assert.ok(body.rotation.x > 0.25, `banked ${body.rotation.x} (+ is starboard wing down)`);
  assert.ok(shipInfo.glow > 0.8 && shipInfo.active);
  near(shipInfo.length, 1, 1e-9);
  rig.setVisible(false);
  assert.equal(rig.group.visible, false);
  rig.dispose();
});

test('a garage build flies at its own size, and a supplied model replaces the stand-in', () => {
  const lone = new THREE.Group();
  lone.add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 2), new THREE.MeshStandardMaterial()));
  const rig = createShipRig(THREE, { ships: { manta: lone } });
  const lv = baseLv({ ship: 'manta:0-0-0-0' });
  rig.update({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 }, {}, lv, 0, 1 / 60);
  near(shipInfo.length, buildScale('manta:0-0-0-0'), 1e-9);
  const names = []; rig.group.traverse((o) => names.push(o.name));
  assert.ok(!names.includes('courier-procedural'), 'the .glb is used, not the stand-in');
  // Back to the standard ship.
  rig.update({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 }, {}, baseLv({ ship: null }), 0.1, 1 / 60);
  near(shipInfo.length, 1, 1e-9);
  rig.dispose();
});

test('stun flashes the hull amber and shows the ring; reduced motion holds it steady', async () => {
  const { state } = await import('../projects/Space-Shooter/state.js');
  const rig = createShipRig(THREE, { ships: {} });
  const lv = baseLv();
  const stunned = { x: 3, y: 3, angle: 0, vx: 1, vy: 0, stunTimer: 0.5 };
  for (let i = 0; i < 12; i++) rig.update(stunned, {}, lv, 0.3 + i / 60, 1 / 60);
  const g0 = rig.group.position.x;
  assert.ok(shipInfo.stunned);
  assert.ok(Math.abs(g0 - 3) > 0 || Math.abs(rig.group.position.z - 3) > 0, 'jitter while stunned');
  state.settings.reducedMotion = true;
  try {
    rig.update(stunned, {}, lv, 1.0, 1 / 60);
    near(rig.group.position.x, 3, 1e-12); near(rig.group.position.z, 3, 1e-12);
  } finally { state.settings.reducedMotion = false; }
  rig.dispose();
});

test('the rig adds its own fill light only when the scene has none', () => {
  const lights = (rig) => { let n = 0; rig.group.traverse((o) => { if (o.isLight && o.parent.visible) n++; }); return n; };
  const bare = createShipRig(THREE, { ships: {} });
  new THREE.Scene().add(bare.group);
  bare.update({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 }, {}, baseLv(), 0, 1 / 60);
  assert.ok(lights(bare) >= 2);
  const lit = createShipRig(THREE, { ships: {} });
  const s = new THREE.Scene(); s.add(new THREE.AmbientLight(0xffffff, 1)); s.add(lit.group);
  lit.update({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 }, {}, baseLv(), 0, 1 / 60);
  assert.equal(lights(lit), 0);
  bare.dispose(); lit.dispose();
});

test('ghosts follow their pose, bank on their own and dispose cleanly', () => {
  const g = createGhostRig(THREE, { ships: {} }, '#ff8800');
  for (let i = 0; i < 50; i++) g.update({ x: 10 * Math.cos(i / 20), y: 10 * Math.sin(i / 20), angle: i / 20 + Math.PI / 2, label: 'Best' }, i / 60);
  near(g.group.position.x, 10 * Math.cos(49 / 20), 1e-9);
  near(g.group.rotation.y, -(49 / 20 + Math.PI / 2), 1e-9);
  const body = g.group.children[0].children[0];
  assert.ok(body.rotation.x > 0.02);
  let mats = new Set(); g.group.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) mats.add(o.material); });
  assert.equal(mats.size, 1, 'one shared translucent material');
  assert.ok([...mats][0].transparent && [...mats][0].opacity < 0.6);
  g.dispose();
});

test('engine ports are placed from the pose and the ship\'s own port list', () => {
  const out = {};
  const saved = shipInfo.ports;
  shipInfo.ports = [{ x: -1, z: 0.5 }];
  portWorld({ x: 10, y: 20, angle: 0 }, 0, out);
  near(out.x, 9); near(out.y, 20.5);
  portWorld({ x: 10, y: 20, angle: Math.PI / 2 }, 0, out);   // heading down the screen: starboard is -x
  near(out.x, 9.5, 1e-9); near(out.y, 19, 1e-9);
  shipInfo.ports = saved;
});

// ------------------------------------------------------------------- fx ----
test('effects: bursts fill the pool, expire, and the buffers are reused', () => {
  const fx = createFx(THREE);
  const lv = baseLv();
  const pose = { x: 0, y: 0, angle: 0, vx: 0, vy: 0 };
  fx.update(lv, pose, {}, 0, 1 / 60);
  const before = fx.stats();
  assert.equal(before.glow, 0);
  for (const kind of ['explosion', 'shard', 'sparks', 'boost', 'launch', 'puff', 'unknown-kind']) fx.burst(kind, 4, 5, { dx: 1, dy: 0 });
  fx.update(lv, pose, {}, 0.02, 1 / 60);
  const mid = fx.stats();
  assert.ok(mid.glow > 80 && mid.smoke > 5, `particles ${mid.glow}/${mid.smoke}`);
  const geoms = []; fx.group.traverse((o) => { if (o.geometry?.instanceCount !== undefined && o.geometry.isInstancedBufferGeometry) geoms.push(o.geometry); });
  assert.equal(geoms.length, 2);
  assert.ok(geoms.every((g) => g.instanceCount <= 1800));
  const positions = geoms.map((g) => g.getAttribute('iPos').array);
  for (let i = 0; i < 400; i++) fx.update(lv, pose, {}, 0.1 + i / 60, 1 / 60);
  assert.equal(fx.stats().glow, 0);
  assert.equal(fx.stats().smoke, 0);
  assert.deepEqual(geoms.map((g) => g.getAttribute('iPos').array), positions, 'the same buffers are reused');
  fx.burst('explosion', Number.NaN, 1);   // junk in, nothing out
  fx.dispose();
});

test('effects: the wreck, a shard and a rail hit trigger the right bursts; reduced motion trims them', async () => {
  const { state } = await import('../projects/Space-Shooter/state.js');
  const count = (setup) => {
    const fx = createFx(THREE), lv = baseLv(), pose = { x: 5, y: 5, angle: 0, vx: 4, vy: 0, stunTimer: 0 };
    fx.update(lv, pose, {}, 0, 1 / 60);
    setup(lv, pose);
    fx.update(lv, pose, {}, 0.02, 1 / 60);
    const s = fx.stats(); fx.dispose();
    return s.glow + s.smoke;
  };
  const shipOff = shipInfo.active; shipInfo.active = false;
  try {
    const boom = count((lv) => { lv.wreck = { x: 5, y: 5, t: 0, cause: 'mine' }; });
    const shard = count((lv) => { lv.shardList = [{ id: 'a', x: 6, y: 6 }]; lv.shards = new Set(['a']); });
    const rail = count((lv, pose) => { pose.stunTimer = 0.4; });
    assert.ok(boom > shard && shard > 10 && rail > 10, `boom ${boom} shard ${shard} rail ${rail}`);
    state.settings.reducedMotion = true;
    const calm = count((lv) => { lv.wreck = { x: 5, y: 5, t: 0, cause: 'mine' }; });
    assert.ok(calm < boom, 'fewer particles with reduced motion');
  } finally { state.settings.reducedMotion = false; shipInfo.active = shipOff; }
});

test('effects: exhaust streams from the engine ports while the engines burn, and not when they are off', () => {
  const fx = createFx(THREE), lv = baseLv();
  const pose = { x: 5, y: 5, angle: 0, vx: 6, vy: 0, stunTimer: 0 };
  Object.assign(shipInfo, { glow: 0, boost: 0, active: true, ports: [{ x: -0.42, z: -0.135 }, { x: -0.42, z: 0.135 }] });
  fx.update(lv, pose, {}, 0, 1 / 60);
  for (let i = 0; i < 30; i++) fx.update(lv, pose, {}, i / 60, 1 / 60);
  assert.equal(fx.stats().glow, 0, 'idle engines make no exhaust');
  shipInfo.glow = 1;
  for (let i = 0; i < 30; i++) fx.update(lv, pose, {}, 1 + i / 60, 1 / 60);
  const burning = fx.stats().glow;
  assert.ok(burning > 15, `exhaust ${burning}`);
  shipInfo.boost = 1;
  for (let i = 0; i < 30; i++) fx.update(lv, pose, {}, 2 + i / 60, 1 / 60);
  assert.ok(fx.stats().glow > burning, 'a boost makes more');
  shipInfo.glow = 0; shipInfo.boost = 0;
  fx.dispose();
});
