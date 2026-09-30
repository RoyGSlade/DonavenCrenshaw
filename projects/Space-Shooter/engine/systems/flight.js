/** Shared solo/Dogfight flight. No DOM, renderer or global game state. */
import movementConfig from './movement-config.json' with { type: 'json' };
export const FLIGHT_CONFIG = Object.freeze({
  ROT_SPEED: Math.PI * 1.2, ROTATION_SCALE: movementConfig.ROTATION_SCALE ?? .35,
  THRUST_ACCEL: 5, FRICTION: .92, MAX_SPEED: 15, LAUNCH_IMPULSE: 3.5,
  PLAYER_RADIUS: .32 * .66, FUEL_ROT_PER_SEC: .3, FUEL_THRUST_PER_SEC: 1.5,
  LAUNCH_FUEL_COST: 5, START_PAD_RADIUS: .9,
  BOOST_MAX_PIPS: 3, BOOST_REGEN_PER_SEC: .22, BOOST_IMPULSE: 4,
});
const onPad = (x, y, start, radius) => start && Math.hypot(x - start.x, y - start.y) <= radius;
export function rechargeBoost(scene, dt, config = FLIGHT_CONFIG) {
  scene.boost = Math.min(config.BOOST_MAX_PIPS, (scene.boost ?? config.BOOST_MAX_PIPS) + config.BOOST_REGEN_PER_SEC * dt);
}
// Shared angular response, including inertia after releasing steering.
const ANGULAR = {
  USE_INERTIA: true, // keyboard-only fallback
  ACCEL: Math.PI * 6.0,
  DAMPING: 5.0,
  MAX_VEL: Math.PI * 2.5,
};

// Holding boost repeats while charge or flux remains.
const BOOST = {
  ENABLED: true,
  COOLDOWN: 0.25,
};

function applyRotation(dt, player, keys, env, config) {
  if (!player) return;

  const t = keys.turnStrength || 0; // signed -1..1
  if (Math.abs(t) > 0.01) {
    // Slow down max rotation using configurable scale factor
    const rate = ANGULAR.MAX_VEL * config.ROTATION_SCALE * t;
    player.angVel = rate;
    player.angle += rate * dt;
    if (env.onFuelUse)
      env.onFuelUse(config.FUEL_ROT_PER_SEC * Math.abs(t) * dt);
    return;
  }

  // Keyboard/inertia fallback (unchanged feel)
  if (ANGULAR.USE_INERTIA) {
    if (player.angVel == null) player.angVel = 0;

    let turnAccel = 0;
    if (keys.left) turnAccel -= ANGULAR.ACCEL;
    if (keys.right) turnAccel += ANGULAR.ACCEL;

    // integrate, clamp, damp
    player.angVel += turnAccel * dt;
    player.angVel -= player.angVel * Math.min(1, ANGULAR.DAMPING * dt);
    player.angVel = Math.max(
      -ANGULAR.MAX_VEL,
      Math.min(ANGULAR.MAX_VEL, player.angVel),
    );
    player.angle += player.angVel * dt;

    if ((keys.left || keys.right) && env.onFuelUse) {
      env.onFuelUse(config.FUEL_ROT_PER_SEC * dt);
    }
  } else {
    let turnDir = 0;
    if (keys.left) turnDir -= 1;
    if (keys.right) turnDir += 1;
    if (turnDir !== 0) {
      player.angle += turnDir * config.ROT_SPEED * dt;
      if (env.onFuelUse) env.onFuelUse(config.FUEL_ROT_PER_SEC * dt);
    }
  }
}

// Playtest-lab boost models (systems/lab.js). Solo only: Dogfight's ship
// config never sets BOOST_MODEL, so it always takes the current model.
// Charge: hold to build a push, release to fire it; a tap does nothing.
export const CHARGE_BOOST = Object.freeze({ MIN: 0.15, FULL: 0.7, LOW: 0.5, HIGH: 1.6, COOLDOWN: 0.6 });
// Heat: no charges; every boost heats the drive and a hot drive pushes weaker.
export const HEAT_BOOST = Object.freeze({ PER_BOOST: 34, COOL_PER_SEC: 26, COOLDOWN: 0.25, MIN_SCALE: 0.35, BONUS: 1.15 });

function spendBoost(sceneState) {
  if ((sceneState.flux || 0) >= 20) { sceneState.flux -= 20; return true; }
  if (typeof sceneState.boost === "number" && sceneState.boost >= 1) { sceneState.boost -= 1; return true; }
  return false;
}

function push(player, config, scale) {
  player.vx += Math.cos(player.angle) * config.BOOST_IMPULSE * scale;
  player.vy += Math.sin(player.angle) * config.BOOST_IMPULSE * scale;
}

function chargeBoost(player, sceneState, keys, env, dt, config) {
  player._boostCd = Math.max(0, (player._boostCd || 0) - dt);
  if (keys.boost) {
    const ready = player._boostCd <= 0 && ((sceneState.flux || 0) >= 20 || (sceneState.boost ?? 0) >= 1);
    player._boostCharge = ready ? Math.min(CHARGE_BOOST.FULL, (player._boostCharge || 0) + dt) : 0;
    return;
  }
  const held = player._boostCharge || 0;
  player._boostCharge = 0;
  if (held < CHARGE_BOOST.MIN || !spendBoost(sceneState)) return;
  const t = (held - CHARGE_BOOST.MIN) / (CHARGE_BOOST.FULL - CHARGE_BOOST.MIN);
  const scale = CHARGE_BOOST.LOW + (CHARGE_BOOST.HIGH - CHARGE_BOOST.LOW) * t;
  push(player, config, scale);
  player._boostCd = CHARGE_BOOST.COOLDOWN;
  env.onBoost?.(scale);
}

function heatBoost(player, sceneState, keys, env, dt, config) {
  player._boostCd = Math.max(0, (player._boostCd || 0) - dt);
  player._boostHeat = Math.max(0, (player._boostHeat || 0) - HEAT_BOOST.COOL_PER_SEC * dt);
  if (keys.boost && player._boostCd <= 0) {
    const scale = HEAT_BOOST.BONUS * Math.max(HEAT_BOOST.MIN_SCALE, 1 - player._boostHeat / 100);
    push(player, config, scale);
    player._boostHeat = Math.min(100, player._boostHeat + HEAT_BOOST.PER_BOOST);
    player._boostCd = HEAT_BOOST.COOLDOWN;
    env.onBoost?.(scale);
  }
  // The pips meter shows how cool the drive is, so the HUD still reads true.
  sceneState.boost = (config.BOOST_MAX_PIPS ?? 3) * (1 - player._boostHeat / 100);
}

function tryBoost(player, sceneState, keys, env, dt, config) {
  if (config.BOOST_MODEL === "charge") return chargeBoost(player, sceneState, keys, env, dt, config);
  if (config.BOOST_MODEL === "heat") return heatBoost(player, sceneState, keys, env, dt, config);
  player._boostCd = Math.max(0, (player._boostCd || 0) - dt);
  if (!BOOST.ENABLED || !keys.boost) return;
  if (player._boostCd > 0) return;

  // Prefer charge system if present; otherwise fall back to fuel (legacy)
  if ((sceneState.flux || 0) >= 20) {
    sceneState.flux -= 20;
  } else if (typeof sceneState.boost === "number") {
    if (sceneState.boost < 1) return; // need at least one pip
    sceneState.boost -= 1;
  } else {
    if (sceneState.fuel <= (config.LAUNCH_FUEL_COST ?? 5)) return;
    if (env.onFuelUse) env.onFuelUse(config.LAUNCH_FUEL_COST ?? 5);
  }

  // Fire the boost
  player.vx += Math.cos(player.angle) * config.BOOST_IMPULSE;
  player.vy += Math.sin(player.angle) * config.BOOST_IMPULSE;
  player._boostCd = BOOST.COOLDOWN;
  env.onBoost?.(1);
}

export function advanceFlight(dt, sceneState, player, keys, env = {}, config = FLIGHT_CONFIG) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, 0.1);
  while (remaining > 1e-8) {
    const step = Math.min(1 / 120, remaining);
    flightStep(step, sceneState, player, keys, env, config);
    remaining -= step;
  }
}

function flightStep(dt, sceneState, player, keys, env, config) {
  const previous = { x: player.x, y: player.y };
  player.boundaryContact = Math.max(0, (player.boundaryContact || 0) - dt);
  applyRotation(dt, player, keys, env, config);

  // LAUNCH: one-time impulse as you leave pad (restores "boost button" feel at start)
  if (
    keys.launch &&
    sceneState.lockedInStart &&
    !env.countdownActive
  ) {
    sceneState.lockedInStart = false;
    sceneState.launched = true;
    // Apply configured launch impulse
    player.vx += Math.cos(player.angle) * (config.LAUNCH_IMPULSE ?? 3.5);
    player.vy += Math.sin(player.angle) * (config.LAUNCH_IMPULSE ?? 3.5);
    if (env.onLaunch) env.onLaunch();
    keys.launch = false;
  }

  if (sceneState.lockedInStart) {
    player.vx = 0;
    player.vy = 0;
    return;
  }

  // Shared held boost (Shift/LB or controller toggle).
  tryBoost(player, sceneState, keys, env, dt, config);

  let fuelUse = 0;
  const thrustStrength = keys.thrustStrength || 0.0; // 0..1
  const backStrength = keys.backStrength || 0.0; // 0..0.6
  const strafeStrength = keys.strafeStrength || 0.0; // 0..0.6
  const thrustAccel = config.THRUST_ACCEL * thrustStrength;
  const backAccel = config.THRUST_ACCEL * backStrength;
  const strafeAccel = config.THRUST_ACCEL * strafeStrength;

  if (thrustStrength > 0 && sceneState.fuel > 0) {
    player.vx += Math.cos(player.angle) * thrustAccel * dt;
    player.vy += Math.sin(player.angle) * thrustAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * thrustStrength;
    // Strong exhaust when moving forward
    env.spawnExhaust?.(player, { intensity: Math.max(0.5, thrustStrength) });
  }
  if (backStrength > 0 && sceneState.fuel > 0) {
    player.vx += -Math.cos(player.angle) * backAccel * dt;
    player.vy += -Math.sin(player.angle) * backAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * backStrength;
    // Much lighter exhaust on reverse
    env.spawnExhaust?.(player, { intensity: (0.35 * backStrength) / 0.3 });
  }

  if (keys.strafeRight && strafeStrength > 0 && sceneState.fuel > 0) {
    player.vx += Math.cos(player.angle + Math.PI / 2) * strafeAccel * dt;
    player.vy += Math.sin(player.angle + Math.PI / 2) * strafeAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * strafeStrength;
    env.spawnExhaust?.(player, { intensity: (0.35 * strafeStrength) / 0.3 });
  }
  if (keys.strafeLeft && strafeStrength > 0 && sceneState.fuel > 0) {
    player.vx += Math.cos(player.angle - Math.PI / 2) * strafeAccel * dt;
    player.vy += Math.sin(player.angle - Math.PI / 2) * strafeAccel * dt;
    fuelUse += config.FUEL_THRUST_PER_SEC * dt * strafeStrength;
    env.spawnExhaust?.(player, { intensity: (0.35 * strafeStrength) / 0.3 });
  }

  if (fuelUse > 0 && env.onFuelUse) env.onFuelUse(fuelUse);

  updateFlux(sceneState, player, dt, !!keys.brake, config.BRAKE_SCALE ?? 1);

  // friction + speed cap
  player.vx *= Math.pow(config.FRICTION, dt);
  player.vy *= Math.pow(config.FRICTION, dt);
  // Ship builds (engine/shipStats.js): inertial dampeners bleed off sideways
  // slide relative to the nose. Configs without LATERAL_DAMP skip this, so the
  // standard ship's arithmetic is untouched.
  if (config.LATERAL_DAMP > 0) {
    const c = Math.cos(player.angle), s = Math.sin(player.angle);
    const forward = player.vx * c + player.vy * s;
    const lateral = (-player.vx * s + player.vy * c) * Math.exp(-config.LATERAL_DAMP * dt);
    player.vx = forward * c - lateral * s;
    player.vy = forward * s + lateral * c;
  }
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > config.MAX_SPEED) {
    const s = config.MAX_SPEED / speed;
    player.vx *= s;
    player.vy *= s;
  }

  const wasOnPad = onPad(
    player.x,
    player.y,
    sceneState.startPos,
    config.START_PAD_RADIUS,
  );
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  const nowOnPad = onPad(
    player.x,
    player.y,
    sceneState.startPos,
    config.START_PAD_RADIUS,
  );

  if (!sceneState.launched && wasOnPad && !nowOnPad) {
    sceneState.launched = true;
    if (env.onLeavePad) env.onLeavePad();
  }

  env.constrain?.(player, previous);
}

export function updateFlux(scene, player, dt, braking = false, brakeScale = 1) {
  let flux = scene.flux || 0;
  const speed = Math.hypot(player.vx, player.vy);
  if (braking && flux > 0 && speed > 0.1) {
    const powered = Math.min(dt, flux / 25);
    const retention = Math.exp(-5 * powered * brakeScale);
    player.vx *= retention;
    player.vy *= retention;
    flux -= powered * 25;
  } else if (!braking && speed > 3) {
    const cross =
      Math.abs(
        Math.cos(player.angle) * player.vy - Math.sin(player.angle) * player.vx,
      ) / speed;
    flux += dt * (speed - 3) * (0.7 + cross * 1.4);
  }
  scene.flux = Math.max(0, Math.min(100, flux));
}
