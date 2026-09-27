/** Dogfight secondary weapon. All hit/lock decisions belong to the host simulation. */
import { shipStats } from "./ships.js";
import { modeSeats } from "./modes.js";
export const TRAP_RULES = Object.freeze({
  recharge: 12,
  lockSeconds: 0.85,
  immunitySeconds: 1.5,
  speed: 18,
  life: 1.8,
  radius: 0.45,
  maxActive: 2,
});

export function trapShipState() {
  return { trapCooldown: 0, trapLock: 0, trapImmunity: 0, trapHeld: false };
}
const decay = (value, dt) => (value <= dt + 1e-9 ? 0 : value - dt);

export function prepareLaserTraps(match, inputs, dt) {
  return match.ships.map((ship, i) => {
    const input = inputs[i] || { turn: 0 };
    if (ship.hp <= 0) return { turn: 0 };
    ship.trapCooldown = decay(ship.trapCooldown, dt);
    ship.trapImmunity = decay(ship.trapImmunity, dt);
    const locked = ship.trapLock > 0;
    ship.trapLock = decay(ship.trapLock, dt);
    // Keep the anchor for this whole step, including hull separation.
    ship.trapAnchor = locked
      ? { x: ship.x, y: ship.y, angle: ship.angle }
      : null;
    if (locked) ship.vx = ship.vy = ship.angVel = 0;
    const fire = input.trap && !ship.trapHeld && ship.trapCooldown === 0;
    ship.trapHeld = !!input.trap;
    if (fire && ship.hp > 0 && match.traps.length < modeSeats(match.mode)) {
      ship.trapCooldown = TRAP_RULES.recharge;
      match.traps.push({
        id: match.nextTrap++,
        owner: ship.id,
        x: ship.x,
        y: ship.y,
        angle: ship.angle % (Math.PI * 2),
        vx: Math.cos(ship.angle) * TRAP_RULES.speed,
        vy: Math.sin(ship.angle) * TRAP_RULES.speed,
        life: TRAP_RULES.life,
      });
    }
    // A trapped pilot can still shoot back. Movement and boost cannot escape the clamp.
    return locked
      ? {
          ...input,
          turn: 0,
          thrust: false,
          reverse: false,
          boost: false,
          brake: false,
          thrustStrength: 0,
          backStrength: 0,
          strafe: 0,
        }
      : input;
  });
}

// Earliest intersection, so cover behind a target cannot swallow a valid hit.
function impact(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax,
    dy = by - ay,
    ox = ax - cx,
    oy = ay - cy;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy,
    b = 2 * (ox * dx + oy * dy);
  const discriminant = b * b - 4 * a * c;
  if (!a || discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : Infinity;
}

export function advanceLaserTraps(match, rules, dt) {
  for (const ship of match.ships) {
    if (ship.hp > 0 && ship.trapAnchor) {
      Object.assign(ship, ship.trapAnchor, { vx: 0, vy: 0, angVel: 0 });
      ship.trapAnchor = null;
    }
  }
  match.traps = match.traps.filter((trap) => {
    const oldX = trap.x,
      oldY = trap.y;
    trap.x += trap.vx * dt;
    trap.y += trap.vy * dt;
    trap.life = decay(trap.life, dt);
    let target = null,
      hit = Infinity;
    for (const candidate of match.ships) {
      if (candidate.id === trap.owner || candidate.hp <= 0) continue;
      const at = impact(
        oldX,
        oldY,
        trap.x,
        trap.y,
        candidate.x,
        candidate.y,
        shipStats(candidate).radius + TRAP_RULES.radius,
      );
      if (at < hit) {
        target = candidate;
        hit = at;
      }
    }
    const cover = Math.min(
      Infinity,
      ...match.obstacles
        .filter((o) => o.hp !== 0)
        .map((o) =>
          impact(
            oldX,
            oldY,
            trap.x,
            trap.y,
            o.x,
            o.y,
            o.radius + TRAP_RULES.radius,
          ),
        ),
    );
    if (cover <= hit && cover !== Infinity) return false;
    if (hit !== Infinity) {
      if (target.trapImmunity === 0) {
        target.trapLock = TRAP_RULES.lockSeconds;
        target.trapImmunity =
          TRAP_RULES.lockSeconds + TRAP_RULES.immunitySeconds;
        target.vx = target.vy = target.angVel = 0;
      }
      return false;
    }
    return (
      trap.life > 0 &&
      trap.x >= 0 &&
      trap.x <= rules.width &&
      trap.y >= 0 &&
      trap.y <= rules.height
    );
  });
}

export function clearLaserTraps(match) {
  match.traps = [];
  for (const ship of match.ships) {
    ship.trapLock = ship.trapImmunity = 0;
    ship.trapAnchor = null;
  }
}

export function trapSnapshot(ship) {
  return {
    trapCooldown: ship.trapCooldown,
    trapLock: ship.trapLock,
    trapImmunity: ship.trapImmunity,
  };
}
