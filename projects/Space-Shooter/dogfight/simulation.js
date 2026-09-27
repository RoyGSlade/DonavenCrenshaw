import { FLIGHT_CONFIG, advanceFlight, rechargeBoost } from '../engine/systems/flight.js';
import { WEAPON_CONFIG, fireWeapon, coolWeapon, projectileFrom } from '../engine/systems/weapons.js';
/** Deterministic fixed-step authority for casual 1v1. No DOM or network dependencies. */
import { trapShipState, prepareLaserTraps, advanceLaserTraps, clearLaserTraps, trapSnapshot } from "./laserTraps.js";
import { cleanLoadout, defaultLoadout, shipStats, shipFlightConfig } from "./ships.js";
export const RULES = Object.freeze({
  width: 40,
  height: 24,
  step: 1 / 60,
  shipRadius: FLIGHT_CONFIG.PLAYER_RADIUS,
  maxSpeed: FLIGHT_CONFIG.MAX_SPEED,
  maxBoostSpeed: FLIGHT_CONFIG.MAX_SPEED,
  boostImpulse: FLIGHT_CONFIG.BOOST_IMPULSE,
  boostCooldown: .25,
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
export function createMatch(seed = 1, round = 1, loadouts = []) {
  const selected = [0, 1].map(id => cleanLoadout(loadouts?.[id]) || defaultLoadout(id));
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const obstacles = [];
  for (const [x, y] of [
    [12, 5],
    [12, 19],
    [19, 5.5],
    [19, 18.5],
  ]) {
    const radius = 0.75 + random() * 0.5;
    const dy = (random() - 0.5) * 1.3;
    obstacles.push(
      { x, y: y + dy, radius },
      { x: 40 - x, y: 24 - y - dy, radius },
    );
  }
  return {
    seed: seed >>> 0,
    round,
    tick: 0,
    phase: "countdown",
    countdown: RULES.countdown,
    remaining: RULES.roundSeconds,
    winner: null,
    reason: "",
    obstacles,
    bullets: [],
    nextBullet: 1,
    traps: [],
    nextTrap: 1,
    ships: [
      {
        id: 0,
        ...trapShipState(),
        x: 6,
        y: 12,
        vx: 0,
        vy: 0,
        angle: 0,
        loadout: selected[0],
        hp: shipStats({ loadout: selected[0] }).hp,
        heat: 0, maxHeat: WEAPON_CONFIG.PLAYER_MAX_HEAT, isOverheated: false,
        shootCooldown: 0, angVel: 0, _boostCd: 0, flux: 30, boost: 3,
        boostCooldown: 0,
        hit: 0,
        collisionCooldown: 0,
      },
      {
        id: 1,
        ...trapShipState(),
        x: 34,
        y: 12,
        vx: 0,
        vy: 0,
        angle: Math.PI,
        loadout: selected[1],
        hp: shipStats({ loadout: selected[1] }).hp,
        heat: 0, maxHeat: WEAPON_CONFIG.PLAYER_MAX_HEAT, isOverheated: false,
        shootCooldown: 0, angVel: 0, _boostCd: 0, flux: 30, boost: 3,
        boostCooldown: 0,
        hit: 0,
        collisionCooldown: 0,
      },
    ],
  };
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
    backStrength: input.backStrength ?? (input.reverse ? .6 : 0),
    strafeStrength: Math.abs(input.strafe || 0),
    strafeLeft: input.strafe < 0, strafeRight: input.strafe > 0,
    boost: !!input.boost, brake: !!input.brake,
  };
  // Arena combat has unlimited propulsion fuel, like the solo boss arena.
  const scene = { flux: ship.flux, boost: ship.boost, fuel: 100, launched: true };
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
  const firing = !!input.fire;
  fireWeapon(dt, ship, firing, WEAPON_CONFIG, () => {
    if (match.bullets.length < 80) match.bullets.push({
      id: match.nextBullet++, owner: ship.id, ...projectileFrom(ship),
    });
  });
  coolWeapon(dt, ship, firing);
}

function segmentHits(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax,
    dy = by - ay;
  const t = clamp(
    ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return (ax + dx * t - cx) ** 2 + (ay + dy * t - cy) ** 2 <= r * r;
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
  inputs = prepareLaserTraps(match, inputs, dt);
  // Match the solo modes: two 120 Hz substeps per network tick.
  for (let substep = 0; substep < 2; substep++) {
    const dt = RULES.step / 2;
    for (let i = 0; i < 2; i++)
      advanceShip(match, match.ships[i], inputs[i] || NEUTRAL, dt);
    // Separate overlapping ships without inventing damage; hull collisions are navigation pressure.
    const [a, b] = match.ships,
      dx = b.x - a.x,
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
      if (
        match.obstacles.some((o) =>
          segmentHits(oldX, oldY, bullet.x, bullet.y, o.x, o.y, o.radius),
        )
      )
        return false;
      const target = match.ships[1 - bullet.owner];
      if (
        target.hp > 0 &&
        segmentHits(
          oldX,
          oldY,
          bullet.x,
          bullet.y,
          target.x,
          target.y,
          shipStats(target).radius + 0.1,
        )
      ) {
        damage(target, RULES.damage);
        return false;
      }
      return true;
    });
  }
  advanceLaserTraps(match, RULES, dt);
  if (match.ships.some((ship) => ship.hp <= 0) || match.remaining <= 0) {
    match.phase = "finished";
    match.reason = match.remaining <= 0 ? "time" : "hull";
    const [hp0, hp1] = match.ships.map((s) => s.hp / shipStats(s).hp);
    match.winner = Math.abs(hp0 - hp1) < 1e-9 ? null : hp0 > hp1 ? 0 : 1;
    match.bullets = [];
    clearLaserTraps(match);
  }
  return match;
}
export function snapshot(match) {
  return {
    round: match.round,
    tick: match.tick,
    phase: match.phase,
    countdown: match.countdown,
    remaining: match.remaining,
    winner: match.winner,
    reason: match.reason,
    traps: match.traps.map(({ id, owner, x, y, angle }) => ({ id, owner, x, y, angle })),
    ships: match.ships.map(({ id, x, y, angle, hp, hit, boostCooldown, flux, boost, heat, isOverheated }) => ({
      id,
      x,
      y,
      angle: angle % (Math.PI * 2),
      hp,
      maxHp: shipStats(match.ships[id]).hp,
      loadout: { ...match.ships[id].loadout },
      hit,
      boostCooldown, flux, boost, heat, isOverheated,
      ...trapSnapshot(match.ships[id]),
    })),
    bullets: match.bullets.map(({ id, owner, x, y }) => ({ id, owner, x, y })),
  };
}
