/** Deterministic fixed-step authority for casual 1v1. No DOM or network dependencies. */
export const RULES = Object.freeze({
  width: 40,
  height: 24,
  step: 1 / 60,
  shipRadius: 0.3,
  maxSpeed: 10,
  maxBoostSpeed: 14,
  boostImpulse: 6,
  boostCooldown: 2,
  bulletSpeed: 30,
  damage: 20,
  fireCooldown: 0.24,
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
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function createMatch(seed = 1, round = 1) {
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
    ships: [
      {
        id: 0,
        x: 6,
        y: 12,
        vx: 0,
        vy: 0,
        angle: 0,
        hp: 100,
        cooldown: 0,
        boostCooldown: 0,
        boostHeld: false,
        hit: 0,
        collisionCooldown: 0,
      },
      {
        id: 1,
        x: 34,
        y: 12,
        vx: 0,
        vy: 0,
        angle: Math.PI,
        hp: 100,
        cooldown: 0,
        boostCooldown: 0,
        boostHeld: false,
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
  ship.cooldown = Math.max(0, ship.cooldown - dt);
  ship.boostCooldown = Math.max(0, ship.boostCooldown - dt);
  ship.collisionCooldown = Math.max(0, ship.collisionCooldown - dt);
  if (ship.hp <= 0) return;
  ship.angle = (ship.angle + input.turn * 2.8 * dt) % (Math.PI * 2);
  const beforeSpeed = Math.hypot(ship.vx, ship.vy);
  const acceleration = (input.thrust ? 13 : 0) - (input.reverse ? 9 : 0);
  ship.vx += Math.cos(ship.angle) * acceleration * dt;
  ship.vy += Math.sin(ship.angle) * acceleration * dt;
  const boosting = !!input.boost && !ship.boostHeld && ship.boostCooldown <= 0;
  ship.boostHeld = !!input.boost;
  if (boosting) {
    ship.vx += Math.cos(ship.angle) * RULES.boostImpulse;
    ship.vy += Math.sin(ship.angle) * RULES.boostImpulse;
    ship.boostCooldown = RULES.boostCooldown;
  }
  const drag = Math.exp(-(input.brake ? 6 : 0.045) * dt);
  ship.vx *= drag;
  ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  // Ordinary thrust cannot build boost speed; momentum above cruise speed decays.
  const limit = boosting
    ? RULES.maxBoostSpeed
    : Math.max(RULES.maxSpeed, beforeSpeed * Math.exp(-0.9 * dt));
  if (speed > limit) {
    ship.vx *= limit / speed;
    ship.vy *= limit / speed;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  const r = RULES.shipRadius;
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
  if (input.fire && ship.cooldown <= 0 && match.bullets.length < 80) {
    ship.cooldown = RULES.fireCooldown;
    match.bullets.push({
      id: match.nextBullet++,
      owner: ship.id,
      x: ship.x + Math.cos(ship.angle) * 0.6,
      y: ship.y + Math.sin(ship.angle) * 0.6,
      vx: Math.cos(ship.angle) * RULES.bulletSpeed + ship.vx * 0.35,
      vy: Math.sin(ship.angle) * RULES.bulletSpeed + ship.vy * 0.35,
      life: 1.8,
    });
  }
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
  for (let i = 0; i < 2; i++)
    advanceShip(match, match.ships[i], inputs[i] || NEUTRAL, dt);
  // Separate overlapping ships without inventing damage; hull collisions are navigation pressure.
  const [a, b] = match.ships,
    dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy),
    min = RULES.shipRadius * 2;
  if (d < min && d > 0.0001) {
    const push = (min - d) / 2,
      nx = dx / d,
      ny = dy / d;
    a.x = clamp(a.x - nx * push, RULES.shipRadius, 40 - RULES.shipRadius);
    a.y = clamp(a.y - ny * push, RULES.shipRadius, 24 - RULES.shipRadius);
    b.x = clamp(b.x + nx * push, RULES.shipRadius, 40 - RULES.shipRadius);
    b.y = clamp(b.y + ny * push, RULES.shipRadius, 24 - RULES.shipRadius);
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
        RULES.shipRadius + 0.1,
      )
    ) {
      damage(target, RULES.damage);
      return false;
    }
    return true;
  });
  if (match.ships.some((ship) => ship.hp <= 0) || match.remaining <= 0) {
    match.phase = "finished";
    match.reason = match.remaining <= 0 ? "time" : "hull";
    const [hp0, hp1] = match.ships.map((s) => s.hp);
    match.winner = hp0 === hp1 ? null : hp0 > hp1 ? 0 : 1;
    match.bullets = [];
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
    ships: match.ships.map(({ id, x, y, angle, hp, hit, boostCooldown }) => ({
      id,
      x,
      y,
      angle,
      hp,
      hit,
      boostCooldown,
    })),
    bullets: match.bullets.map(({ id, owner, x, y }) => ({ id, owner, x, y })),
  };
}
