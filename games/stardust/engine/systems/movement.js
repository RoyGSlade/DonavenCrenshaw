import { state, config } from '../../state.js';
import { spawnExhaust } from './particles.js';
import { onPad } from '../utils.js';

// --- NEW: optional angular inertia tuning (safe defaults keep old feel) ---
const ANGULAR = {
  USE_INERTIA: true,           // keyboard-only fallback
  ACCEL: Math.PI * 6.0,
  DAMPING: 5.0,
  MAX_VEL: Math.PI * 2.5,
  AIMER_MAX_RATE: Math.PI * 4.0,  // max rad/s when using right-stick aim
  AIMER_MIN_RATE: Math.PI * 1.25  // slower base so aim never feels snappy
};

// --- NEW: optional tap-boost (charge-based; reads config) ---
const BOOST = {
  ENABLED: true,
  IMPULSE: config.BOOST_IMPULSE ?? 4.0,
  COOLDOWN: 0.25
};

function shortestAngleDelta(a, b) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  return d < -Math.PI ? d + 2 * Math.PI : d;
}

function applyRotation(dt, player, env) {
  if (!player) return;

  const t = state.keys.turnStrength || 0; // signed -1..1
  if (Math.abs(t) > 0.01) {
    // Slow down max rotation using configurable scale factor
    const rate = (ANGULAR.MAX_VEL * config.ROTATION_SCALE) * t;
    player.angVel = rate;
    player.angle += rate * dt;
    if (env.onFuelUse) env.onFuelUse(config.FUEL_ROT_PER_SEC * Math.abs(t) * dt);
    return;
  }

  // Keyboard/inertia fallback (unchanged feel)
  if (ANGULAR.USE_INERTIA) {
    if (player.angVel == null) player.angVel = 0;

    let turnAccel = 0;
    if (state.keys.left)  turnAccel -= ANGULAR.ACCEL;
    if (state.keys.right) turnAccel += ANGULAR.ACCEL;

    // integrate, clamp, damp
    player.angVel += turnAccel * dt;
    player.angVel -= player.angVel * Math.min(1, ANGULAR.DAMPING * dt);
    player.angVel = Math.max(-ANGULAR.MAX_VEL, Math.min(ANGULAR.MAX_VEL, player.angVel));
    player.angle += player.angVel * dt;

    if ((state.keys.left || state.keys.right) && env.onFuelUse) {
      env.onFuelUse(config.FUEL_ROT_PER_SEC * dt);
    }
  } else {
    let turnDir = 0;
    if (state.keys.left)  turnDir -= 1;
    if (state.keys.right) turnDir += 1;
    if (turnDir !== 0) {
      player.angle += turnDir * config.ROT_SPEED * dt;
      if (env.onFuelUse) env.onFuelUse(config.FUEL_ROT_PER_SEC * dt);
    }
  }
}

function tryBoost(player, sceneState, env, dt) {
  if (!BOOST.ENABLED || !state.keys.boost) return;

  // per-player cooldown
  if (player._boostCd == null) player._boostCd = 0;
  player._boostCd = Math.max(0, player._boostCd - dt);
  if (player._boostCd > 0) return;

  // Prefer charge system if present; otherwise fall back to fuel (legacy)
  if (typeof sceneState.boost === 'number') {
    if (sceneState.boost < 1) return;           // need at least one pip
    sceneState.boost -= 1;
  } else {
    if (sceneState.fuel <= (config.LAUNCH_FUEL_COST ?? 5)) return;
    if (env.onFuelUse) env.onFuelUse(config.LAUNCH_FUEL_COST ?? 5);
  }

  // Fire the boost
  player.vx += Math.cos(player.angle) * BOOST.IMPULSE;
  player.vy += Math.sin(player.angle) * BOOST.IMPULSE;
  player._boostCd = BOOST.COOLDOWN;
}

export function handlePlayerMovement(dt, sceneState, player, env = {}) {
  applyRotation(dt, player, env);

  // LAUNCH: one-time impulse as you leave pad (restores "boost button" feel at start)
  if (state.keys.launch && sceneState.lockedInStart && !state.ui.countdownActive) {
    sceneState.lockedInStart = false;
    sceneState.launched = true;
    // Apply configured launch impulse
    player.vx += Math.cos(player.angle) * (config.LAUNCH_IMPULSE ?? 3.5);
    player.vy += Math.sin(player.angle) * (config.LAUNCH_IMPULSE ?? 3.5);
    if (env.onLaunch) env.onLaunch();
    state.keys.launch = false;
  }

  if (sceneState.lockedInStart) {
    player.vx = 0; player.vy = 0;
    return;
  }

  // OPTIONAL mid-combat boost (tap Shift or map to your pad input)
  tryBoost(player, sceneState, env, dt);

  let fuelUse = 0;
  const thrustStrength = state.keys.thrustStrength || 0.0;     // 0..1
  const backStrength   = state.keys.backStrength   || 0.0;     // 0..0.3
  const strafeStrength = state.keys.strafeStrength || 0.0;     // 0..0.3
  const thrustAccel = config.THRUST_ACCEL * thrustStrength;
  const backAccel   = config.THRUST_ACCEL * backStrength;
  const strafeAccel = config.THRUST_ACCEL * strafeStrength;

  if (thrustStrength > 0 && sceneState.fuel > 0) {
    player.vx += Math.cos(player.angle) * thrustAccel * dt;
    player.vy += Math.sin(player.angle) * thrustAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * thrustStrength;
    // Strong exhaust when moving forward
    spawnExhaust(player, { intensity: Math.max(0.5, thrustStrength) });
  }
  if (backStrength > 0 && sceneState.fuel > 0) {
    player.vx += -Math.cos(player.angle) * backAccel * dt;
    player.vy += -Math.sin(player.angle) * backAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * backStrength;
    // Much lighter exhaust on reverse
    spawnExhaust(player, { intensity: 0.35 * backStrength / 0.3 });
  }

  if (state.keys.strafeRight && strafeStrength > 0 && sceneState.fuel > 0) {
    player.vx += Math.cos(player.angle + Math.PI / 2) * strafeAccel * dt;
    player.vy += Math.sin(player.angle + Math.PI / 2) * strafeAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * strafeStrength;
    spawnExhaust(player, { intensity: 0.35 * strafeStrength / 0.3 });
  }
  if (state.keys.strafeLeft && strafeStrength > 0 && sceneState.fuel > 0) {
    player.vx += Math.cos(player.angle - Math.PI / 2) * strafeAccel * dt;
    player.vy += Math.sin(player.angle - Math.PI / 2) * strafeAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * strafeStrength;
    spawnExhaust(player, { intensity: 0.35 * strafeStrength / 0.3 });
  }

  if (fuelUse > 0 && env.onFuelUse) env.onFuelUse(fuelUse);

  // friction + speed cap
  player.vx *= Math.pow(config.FRICTION, dt);
  player.vy *= Math.pow(config.FRICTION, dt);
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > config.MAX_SPEED) {
    const s = config.MAX_SPEED / speed;
    player.vx *= s; player.vy *= s;
  }

  const wasOnPad = onPad(player.x, player.y, sceneState.startPos, config.START_PAD_RADIUS);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  const nowOnPad = onPad(player.x, player.y, sceneState.startPos, config.START_PAD_RADIUS);

  if (!sceneState.launched && wasOnPad && !nowOnPad) {
    sceneState.launched = true;
    if (env.onLeavePad) env.onLeavePad();
  }

  // roadmap bounds (arena is handled by walls)
  if (state.mode === 'roadmap') {
    if (player.x < config.WORLD_PADDING) { player.x = config.WORLD_PADDING; player.vx *= config.WALL_BOUNCE_DAMPENING; }
    if (player.y < config.WORLD_PADDING) { player.y = config.WORLD_PADDING; player.vy *= config.WALL_BOUNCE_DAMPENING; }
    if (player.x > config.GRID_W - config.WORLD_PADDING) { player.x = config.GRID_W - config.WORLD_PADDING; player.vx *= config.WALL_BOUNCE_DAMPENING; }
    if (player.y > config.GRID_H - config.WORLD_PADDING) { player.y = config.GRID_H - config.WORLD_PADDING; player.vy *= config.WALL_BOUNCE_DAMPENING; }
  }
}