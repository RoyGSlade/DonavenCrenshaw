import {
  FLIGHT_CONFIG,
  advanceFlight,
  rechargeBoost,
} from "../engine/systems/flight.js";
import {
  WEAPON_CONFIG,
  fireWeapon,
  coolWeapon,
  projectileFrom,
} from "../engine/systems/weapons.js";
/** Deterministic fixed-step authority for casual duels and free-for-all. No DOM or network dependencies. */
import {
  trapShipState,
  prepareLaserTraps,
  advanceLaserTraps,
  clearLaserTraps,
  trapSnapshot,
} from "./laserTraps.js";
import {
  cleanLoadout,
  defaultLoadout,
  shipStats,
  shipFlightConfig,
} from "./ships.js";
import { createArena, arenaSnapshot } from "./maps.js";
import { isMode, modeSeats } from "./modes.js";
import {
  advanceTerrain,
  resolveTerrain,
  damageTerrain,
  impactTime,
} from "./terrain.js";
export const RULES = Object.freeze({
  width: 40,
  height: 24,
  step: 1 / 60,
  shipRadius: FLIGHT_CONFIG.PLAYER_RADIUS,
  maxSpeed: FLIGHT_CONFIG.MAX_SPEED,
  maxBoostSpeed: FLIGHT_CONFIG.MAX_SPEED,
  boostImpulse: FLIGHT_CONFIG.BOOST_IMPULSE,
  boostCooldown: 0.25,
  bulletSpeed: WEAPON_CONFIG.PLAYER_PROJECTILE_SPEED,
  damage: WEAPON_CONFIG.PLAYER_PROJECTILE_DAMAGE,
  fireCooldown: WEAPON_CONFIG.PLAYER_FIRE_RATE,
  roundSeconds: 180,
  countdown: 2.5,
  inputTimeout: 0.35,
});
export const NEUTRAL = Object.freeze({
  turn: 0,
  thrust: false,
  reverse: false,
  boost: false,
  brake: false,
  fire: false,
  trap: false,
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function createMatch(
  seed = 1,
  round = 1,
  loadouts = [],
  mapId = "classic",
  mode = "duel",
) {
  if (!isMode(mode)) throw new RangeError("Unknown Dogfight mode.");
  const selected = Array.from(
    { length: modeSeats(mode) },
    (_, id) => cleanLoadout(loadouts?.[id]) || defaultLoadout(id),
  );
  // Safe playtest triangle. Authored maps are not claimed to be competitively three-way balanced.
  const spawns =
    mode === "ffa3"
      ? [
          [7, 12],
          [26, 2],
          [26, 22],
        ].map(([x, y]) => ({ x, y, angle: Math.atan2(12 - y, 20 - x) }))
      : [
          { x: 6, y: 12, angle: 0 },
          { x: 34, y: 12, angle: Math.PI },
        ];
  return {
    ...createArena(mapId, seed),
    mode,
    seed: seed >>> 0,
    round,
    tick: 0,
    phase: "countdown",
    countdown: RULES.countdown,
    remaining: RULES.roundSeconds,
    winner: null,
    reason: "",
    bullets: [],
    nextBullet: 1,
    traps: [],
    nextTrap: 1,
    ships: selected.map((loadout, id) => ({
      id,
      ...trapShipState(),
      ...spawns[id],
      vx: 0,
      vy: 0,
      loadout,
      hp: shipStats({ loadout }).hp,
      heat: 0,
      maxHeat: WEAPON_CONFIG.PLAYER_MAX_HEAT,
      isOverheated: false,
      shootCooldown: 0,
      angVel: 0,
      _boostCd: 0,
      flux: 30,
      boost: 3,
      boostCooldown: 0,
      hit: 0,
      collisionCooldown: 0,
    })),
  };
}
function clearEliminated(match) {
  for (const ship of match.ships) {
    if (ship.hp > 0) continue;
    ship.vx = ship.vy = ship.angVel = 0;
    ship.trapLock = ship.trapImmunity = 0;
    ship.trapAnchor = null;
    ship.trapHeld = false;
  }
  // Shots already in flight survive their owner; filtering here makes lethal trades order-dependent.
}

function damage(ship, amount) {
  ship.hp = Math.max(0, ship.hp - amount);
  ship.hit = 0.13;
}
function advanceShip(match, ship, input, dt) {
  ship.hit = Math.max(0, ship.hit - dt);
  ship.collisionCooldown = Math.max(0, ship.collisionCooldown - dt);
  if (ship.hp <= 0) return;
  const keys = {
    turnStrength: input.turn || 0,
    thrustStrength: input.thrustStrength ?? (input.thrust ? 1 : 0),
    backStrength: input.backStrength ?? (input.reverse ? 0.6 : 0),
    strafeStrength: Math.abs(input.strafe || 0),
    strafeLeft: input.strafe < 0,
    strafeRight: input.strafe > 0,
    boost: !!input.boost,
    brake: !!input.brake,
  };
  // Arena combat has unlimited propulsion fuel, like the solo boss arena.
  const scene = {
    flux: ship.flux,
    boost: ship.boost,
    fuel: 100,
    launched: true,
  };
  rechargeBoost(scene, dt);
  advanceFlight(dt, scene, ship, keys, {}, shipFlightConfig(ship));
  ship.flux = scene.flux;
  ship.boost = scene.boost;
  ship.boostCooldown = ship._boostCd;
  const r = shipStats(ship).radius;
  if (ship.x < r || ship.x > RULES.width - r) {
    ship.x = clamp(ship.x, r, RULES.width - r);
    ship.vx *= -0.55;
  }
  if (ship.y < r || ship.y > RULES.height - r) {
    ship.y = clamp(ship.y, r, RULES.height - r);
    ship.vy *= -0.55;
  }
  for (const obstacle of match.obstacles) {
    if (obstacle.hp === 0) continue;
    let dx = ship.x - obstacle.x,
      dy = ship.y - obstacle.y,
      d = Math.hypot(dx, dy),
      min = r + obstacle.radius;
    if (d >= min) continue;
    if (d < 0.0001) {
      dx = 1;
      dy = 0;
      d = 1;
    }
    const nx = dx / d,
      ny = dy / d;
    ship.x = obstacle.x + nx * min;
    ship.y = obstacle.y + ny * min;
    const inward = ship.vx * nx + ship.vy * ny;
    if (inward < 0) {
      ship.vx -= inward * 1.6 * nx;
      ship.vy -= inward * 1.6 * ny;
      if (inward < -4 && ship.collisionCooldown <= 0) {
        damage(ship, 5);
        ship.collisionCooldown = 0.6;
      }
    }
  }
  if (ship.hp <= 0) return;
  const firing = !!input.fire;
  fireWeapon(dt, ship, firing, WEAPON_CONFIG, () => {
    if (match.bullets.length < 80)
      match.bullets.push({
        id: match.nextBullet++,
        owner: ship.id,
        ...projectileFrom(ship),
      });
  });
  coolWeapon(dt, ship, firing);
}

export function stepMatch(match, inputs = [NEUTRAL, NEUTRAL], dt = RULES.step) {
  if (dt !== RULES.step)
    throw new RangeError("Dogfight requires a fixed 1/60 second step.");
  if (match.phase === "finished") return match;
  match.tick++;
  if (match.phase === "countdown") {
    match.countdown = Math.max(0, match.countdown - dt);
    if (match.countdown <= 0.000001) {
      match.countdown = 0;
      match.phase = "playing";
    }
    return match;
  }
  match.remaining = Math.max(0, match.remaining - dt);
  clearEliminated(match);
  inputs = prepareLaserTraps(match, inputs, dt);
  // Match the solo modes: two 120 Hz substeps per network tick.
  for (let substep = 0; substep < 2; substep++) {
    const dt = RULES.step / 2;
    advanceTerrain(match, dt);
    for (let i = 0; i < match.ships.length; i++)
      advanceShip(match, match.ships[i], inputs[i] || NEUTRAL, dt);
    // Separate every live pair; eliminated hulls cannot obstruct surviving pilots.
    for (let i = 0; i < match.ships.length; i++)
      for (let j = i + 1; j < match.ships.length; j++) {
        const a = match.ships[i],
          b = match.ships[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy),
          ar = shipStats(a).radius,
          br = shipStats(b).radius,
          min = ar + br;
        if (d < min && d > 0.0001) {
          const push = (min - d) / 2,
            nx = dx / d,
            ny = dy / d;
          a.x = clamp(a.x - nx * push, ar, 40 - ar);
          a.y = clamp(a.y - ny * push, ar, 24 - ar);
          b.x = clamp(b.x + nx * push, br, 40 - br);
          b.y = clamp(b.y + ny * push, br, 24 - br);
        }
      }

    resolveTerrain(match);
    match.bullets = match.bullets.filter((bullet) => {
      const oldX = bullet.x,
        oldY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (
        bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > 40 ||
        bullet.y < 0 ||
        bullet.y > 24
      )
        return false;
      let target = null,
        targetHit = Infinity;
      for (const candidate of match.ships) {
        if (candidate.id === bullet.owner || candidate.hp <= 0) continue;
        const at = impactTime(
          oldX,
          oldY,
          bullet.x,
          bullet.y,
          candidate.x,
          candidate.y,
          shipStats(candidate).radius + 0.1,
        );
        if (at < targetHit) {
          target = candidate;
          targetHit = at;
        }
      }
      let cover = null,
        coverHit = Infinity;
      for (const o of match.obstacles) {
        if (o.hp === 0) continue;
        const at = impactTime(
          oldX,
          oldY,
          bullet.x,
          bullet.y,
          o.x,
          o.y,
          o.radius,
        );
        if (at < coverHit) {
          coverHit = at;
          cover = o;
        }
      }
      if (cover && coverHit <= targetHit) {
        damageTerrain(match, cover, RULES.damage);
        return false;
      }
      if (targetHit !== Infinity) {
        damage(target, RULES.damage);
        return false;
      }
      return true;
    });
    clearEliminated(match);
  }
  advanceLaserTraps(match, RULES, dt);
  const alive = match.ships.filter((ship) => ship.hp > 0);
  if (alive.length <= 1 || match.remaining <= 0) {
    match.phase = "finished";
    match.reason = match.remaining <= 0 ? "time" : "hull";
    const highest = Math.max(
      0,
      ...alive.map((ship) => ship.hp / shipStats(ship).hp),
    );
    const leaders = alive.filter(
      (ship) => Math.abs(ship.hp / shipStats(ship).hp - highest) < 1e-9,
    );
    match.winner = leaders.length === 1 ? leaders[0].id : null;
    match.bullets = [];
    clearLaserTraps(match);
  }
  return match;
}
export function snapshot(match) {
  return {
    ...arenaSnapshot(match),
    mode: match.mode ?? "duel",
    round: match.round,
    tick: match.tick,
    phase: match.phase,
    countdown: match.countdown,
    remaining: match.remaining,
    winner: match.winner,
    reason: match.reason,
    traps: match.traps.map(({ id, owner, x, y, angle }) => ({
      id,
      owner,
      x,
      y,
      angle,
    })),
    ships: match.ships.map(
      ({
        id,
        x,
        y,
        angle,
        hp,
        hit,
        boostCooldown,
        flux,
        boost,
        heat,
        isOverheated,
      }) => ({
        id,
        x,
        y,
        angle: angle % (Math.PI * 2),
        hp,
        maxHp: shipStats(match.ships[id]).hp,
        loadout: { ...match.ships[id].loadout },
        hit,
        boostCooldown,
        flux,
        boost,
        heat,
        isOverheated,
        ...trapSnapshot(match.ships[id]),
      }),
    ),
    bullets: match.bullets.map(({ id, owner, x, y }) => ({ id, owner, x, y })),
  };
}
