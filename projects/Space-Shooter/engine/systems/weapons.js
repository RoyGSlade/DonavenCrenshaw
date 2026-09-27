/** Shared solo/Dogfight weapon rules. Mutates only the supplied player. */
export const WEAPON_CONFIG = Object.freeze({
  PLAYER_PROJECTILE_SPEED: 16,
  PLAYER_PROJECTILE_LIFE: 1.2,
  PLAYER_PROJECTILE_DAMAGE: 50,
  PLAYER_FIRE_RATE: 0.16,
  PLAYER_MAX_HEAT: 100,
  PLAYER_HEAT_PER_SHOT: 8,
  PLAYER_COOL_RATE: 28,
  PLAYER_OVERHEAT_COOL_RATE: 14,
});

/** Run before coolWeapon each step, preserving solo's one-shot-per-step cadence. */
export function fireWeapon(dt, player, firing, config = WEAPON_CONFIG, onShot = () => {}) {
  player.shootCooldown = Math.max(0, (player.shootCooldown || 0) - dt);
  if (!(firing && player.shootCooldown <= 0 && !player.isOverheated)) return false;
  // Spawn before mutating heat/cooldown, matching the original solo ordering.
  onShot();
  player.shootCooldown = config.PLAYER_FIRE_RATE;
  player.heat = Math.min(player.maxHeat, player.heat + config.PLAYER_HEAT_PER_SHOT);
  return true;
}

/** Returns only a state transition; callers own notifications and other effects. */
export function coolWeapon(dt, player, firing, config = WEAPON_CONFIG) {
  if (player.isOverheated) {
    player.heat = Math.max(0, player.heat - config.PLAYER_OVERHEAT_COOL_RATE * dt);
    if (player.heat <= 0) {
      player.isOverheated = false;
      return 'cooled';
    }
  } else {
    if (!firing) {
      player.heat = Math.max(0, player.heat - config.PLAYER_COOL_RATE * dt);
    }
    if (player.heat >= player.maxHeat) {
      player.isOverheated = true;
      return 'overheated';
    }
  }
  return null;
}

export function projectileFrom(player, config = WEAPON_CONFIG) {
  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  return {
    x: player.x + cos * 0.5,
    y: player.y + sin * 0.5,
    vx: player.vx + cos * config.PLAYER_PROJECTILE_SPEED,
    vy: player.vy + sin * config.PLAYER_PROJECTILE_SPEED,
    life: config.PLAYER_PROJECTILE_LIFE,
  };
}
