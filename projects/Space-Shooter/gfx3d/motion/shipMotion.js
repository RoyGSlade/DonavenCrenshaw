// How the 3D ship moves on top of the sim's pose. Visual only: it reads the
// pose (x, y, angle, vx, vy, ...) and the keys and never writes back, so the
// drift, the replays and the leaderboards are exactly what they were in 2D.
//
// Sign conventions (sim space, y down on screen, angle 0 = +x, increasing
// clockwise on screen): "starboard" is the ship's right-hand side, at
// angle + 90deg. Positive bank rolls the starboard wing down.
import { clamp, angDelta, easeRate, stepSpring, wobble } from './spring.js';

export const SHIP_MOTION = Object.freeze({
  MAX_BANK: 0.62,        // rad, about 35 degrees
  TURN_BANK: 0.5,        // bank at full steering
  STRAFE_BANK: 0.3,      // extra lean while a strafe key is down
  SLIP_BANK: 0.2,        // lean toward the nose side while sliding sideways
  YAW_REF: 2.6,          // rad/s of yaw that counts as "full turn" for banking
  YAW_SMOOTH: 22,        // 1/s low-pass on the measured yaw rate
  SLIP_REF: 5,           // cells/s of sideways slide that counts as full slip
  BANK_OMEGA: 15,        // spring: stiff, a little overshoot
  BANK_ZETA: 0.6,
  MAX_PITCH: 0.12,
  PITCH_THRUST: 0.05,    // nose lifts a touch under power
  PITCH_BRAKE: 0.09,     // and dips when braking or reversing
  PITCH_BOOST: 0.07,
  PITCH_OMEGA: 11,
  PITCH_ZETA: 0.7,
  GLOW_UP: 26,           // 1/s: engines light fast...
  GLOW_DOWN: 9,          // ...and fade slower
  BOOST_REF_COOLDOWN: 0.25,
  TELEPORT: 4,           // cells in one frame = a restart, not motion
  STUN_SHAKE: 0.035,     // cells of jitter while stunned
});

/** Signed steering in -1..1 from the live keys (analog first, then left/right). */
export function steerInput(keys) {
  const t = keys?.turnStrength || 0;
  if (Math.abs(t) > 0.01) return clamp(t, -1, 1);
  return (keys?.right ? 1 : 0) - (keys?.left ? 1 : 0);
}

/** Signed strafe in -1..1 (positive = starboard). strafeStrength tops out near 0.6 on a pad. */
export function strafeInput(keys) {
  const dir = (keys?.strafeRight ? 1 : 0) - (keys?.strafeLeft ? 1 : 0);
  if (!dir) return 0;
  const s = keys.strafeStrength;
  return dir * (Number.isFinite(s) && s > 0 ? clamp(s / 0.6, 0.35, 1) : 1);
}

/** Velocity split along the heading: fwd along the nose, lat toward starboard. */
export function localVelocity(angle, vx, vy, out = {}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.fwd = vx * c + vy * s;
  out.lat = -vx * s + vy * c;
  return out;
}

/** Target roll (rad, + = starboard wing down) from steering, measured yaw rate, strafe and sideways slide. */
export function bankTarget({ steer = 0, yawRate = 0, strafe = 0, lat = 0 }, P = SHIP_MOTION) {
  const turn = clamp(0.55 * steer + 0.45 * clamp(yawRate / P.YAW_REF, -1, 1), -1, 1);
  const slip = clamp(lat / P.SLIP_REF, -1, 1);
  return clamp(P.TURN_BANK * turn + P.STRAFE_BANK * strafe - P.SLIP_BANK * slip, -P.MAX_BANK, P.MAX_BANK);
}

/** Target pitch (rad, + = nose up) from throttle, brake/reverse and boost. */
export function pitchTarget({ thrust = 0, back = 0, brake = 0, boost = 0 }, P = SHIP_MOTION) {
  return clamp(P.PITCH_THRUST * thrust + P.PITCH_BOOST * boost - P.PITCH_BRAKE * Math.max(back, brake), -P.MAX_PITCH, P.MAX_PITCH);
}

/** Jitter for a stunned hull at `time`: writes x, z (cells), roll, yaw (rad) into out. */
export function stunShake(time, amount, out = {}, P = SHIP_MOTION) {
  const a = clamp(amount, 0, 1);
  out.x = wobble(time, 1) * P.STUN_SHAKE * a;
  out.z = wobble(time, 2) * P.STUN_SHAKE * a;
  out.roll = wobble(time, 3) * 0.12 * a;
  out.yaw = wobble(time, 4) * 0.06 * a;
  return out;
}

export function createMotionState() {
  return {
    seen: false, lastX: 0, lastY: 0, lastAngle: 0, vx: 0, vy: 0, yawRate: 0,
    bank: { x: 0, v: 0 }, pitch: { x: 0, v: 0 },
    glow: 0, strafe: 0, brake: 0, boost: 0, boostPeak: 0, stun: 0,
    tmp: { fwd: 0, lat: 0 },
  };
}

function reset(m, pose) {
  m.seen = true;
  m.lastX = pose.x; m.lastY = pose.y; m.lastAngle = pose.angle;
  m.vx = Number.isFinite(pose.vx) ? pose.vx : 0;
  m.vy = Number.isFinite(pose.vy) ? pose.vy : 0;
  m.yawRate = 0;
  m.bank.x = m.bank.v = m.pitch.x = m.pitch.v = 0;
  m.glow = m.strafe = m.brake = m.boost = m.boostPeak = m.stun = 0;
}

/**
 * Advance the visual state one frame.
 *   pose:  { x, y, angle, vx?, vy?, stunTimer?, _boostCd? }  (ghosts have only x, y, angle)
 *   input: { steer, strafe, thrust, back, brake, active }   (omit or zero for ghosts)
 * Writes the result into `out` and returns it: bank, pitch, glow (0..1+),
 * boost (0..1 flare), strafe (-1..1), brake (0..1), stun (0..1), slip, speed, yawRate.
 */
export function stepMotion(m, pose, input = {}, dt = 0, out = {}, P = SHIP_MOTION) {
  const jumped = m.seen && Math.hypot(pose.x - m.lastX, pose.y - m.lastY) > P.TELEPORT;
  if (!m.seen || jumped) reset(m, pose);
  const step = clamp(dt, 0, 0.1);
  if (step > 1e-5) {
    const raw = clamp(angDelta(m.lastAngle, pose.angle) / step, -9, 9);
    m.yawRate += (raw - m.yawRate) * easeRate(P.YAW_SMOOTH, step);
    if (Number.isFinite(pose.vx) && Number.isFinite(pose.vy)) { m.vx = pose.vx; m.vy = pose.vy; }
    else {
      // Ghosts carry no velocity: estimate it from where they were.
      const k = easeRate(14, step);
      m.vx += ((pose.x - m.lastX) / step - m.vx) * k;
      m.vy += ((pose.y - m.lastY) / step - m.vy) * k;
    }
  }
  m.lastX = pose.x; m.lastY = pose.y; m.lastAngle = pose.angle;

  const stunned = (pose.stunTimer || 0) > 0;
  const live = input.active !== false && !stunned;
  const steer = live ? input.steer || 0 : 0;
  const strafe = live ? input.strafe || 0 : 0;
  const thrust = live ? clamp(input.thrust || 0, 0, 1) : 0;
  const back = live ? clamp(input.back || 0, 0, 1) : 0;
  const brake = live && input.brake ? 1 : 0;

  const cd = pose._boostCd || 0;
  if (cd <= 0) m.boostPeak = 0; else if (cd > m.boostPeak) m.boostPeak = cd;
  const boostTarget = cd > 0 ? clamp(cd / Math.max(P.BOOST_REF_COOLDOWN, m.boostPeak), 0, 1) : 0;
  m.boost = Math.max(boostTarget, m.boost * (1 - easeRate(8, step)));

  localVelocity(pose.angle, m.vx, m.vy, m.tmp);
  const bank = bankTarget({ steer, yawRate: m.yawRate, strafe, lat: m.tmp.lat }, P);
  const pitch = pitchTarget({ thrust, back, brake, boost: m.boost }, P);
  stepSpring(m.bank, bank, P.BANK_OMEGA, P.BANK_ZETA, step);
  stepSpring(m.pitch, pitch, P.PITCH_OMEGA, P.PITCH_ZETA, step);

  const power = clamp(Math.max(thrust, back * 0.45), 0, 1);
  m.glow += (power - m.glow) * easeRate(power > m.glow ? P.GLOW_UP : P.GLOW_DOWN, step);
  m.strafe += (strafe - m.strafe) * easeRate(18, step);
  m.brake += (brake - m.brake) * easeRate(16, step);
  m.stun += ((stunned ? 1 : 0) - m.stun) * easeRate(30, step);

  out.bank = m.bank.x;
  out.pitch = m.pitch.x;
  out.glow = m.glow;
  out.boost = m.boost;
  out.strafe = m.strafe;
  out.brake = m.brake;
  out.stun = m.stun;
  out.stunned = stunned;
  out.slip = m.tmp.lat;
  out.speed = Math.hypot(m.vx, m.vy);
  out.yawRate = m.yawRate;
  return out;
}
