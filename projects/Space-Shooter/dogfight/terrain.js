import { ventPhase } from "./maps.js";
import { shipStats } from "./ships.js";

const inRect = (s, r, padding = 0) => s.x >= r.x - padding && s.x <= r.x + r.width + padding &&
  s.y >= r.y - padding && s.y <= r.y + r.height + padding;
const hurt = (ship, amount) => { ship.hp = Math.max(0, ship.hp - amount); ship.hit = 0.13; };

export function advanceTerrain(match, dt) {
  match.bursts = match.bursts.filter(b => (b.life = Math.max(0, b.life - dt)) > 0);
  for (const ship of match.ships) {
    ship.gateCooldown = Math.max(0, (ship.gateCooldown || 0) - dt);
    ship.terrainCooldown = Math.max(0, (ship.terrainCooldown || 0) - dt);
    if (ship.hp <= 0 || ship.trapLock > 0 || ship.trapAnchor) continue;
    applyFields(match.fields, ship, dt);
  }
}

// Gravity wells and boost streams. Shared by the host and guest prediction.
export function applyFields(fields, ship, dt) {
  for (const field of fields) {
    if (field.type === "gravity") {
      const dx = field.x - ship.x, dy = field.y - ship.y, distance = Math.hypot(dx, dy);
      if (distance > field.radius || distance < 0.001) continue;
      const force = 10 * (1 - distance / field.radius);
      ship.vx += (dx - dy * 0.35) / distance * force * dt;
      ship.vy += (dy + dx * 0.35) / distance * force * dt;
    } else if (inRect(ship, field)) {
      ship.vx += field.direction * 12 * dt;
    }
  }
}

export function resolveTerrain(match) {
  for (const ship of match.ships) {
    if (ship.hp <= 0) continue;
    if (ship.terrainCooldown <= 0) {
      const core = match.fields.some(f => f.type === "gravity" && Math.hypot(ship.x - f.x, ship.y - f.y) < 1.9);
      const vent = ventPhase(180 - match.remaining) === "live" && match.vents.some(v => inRect(ship, v, shipStats(ship).radius));
      if (core || vent) { hurt(ship, vent ? 12 : 6); ship.terrainCooldown = 0.6; }
    }
    if (ship.hp <= 0) continue;
    if (ship.gateCooldown > 0 || ship.trapLock > 0 || ship.trapAnchor) continue;
    const entrance = match.gates.findIndex(g => Math.hypot(ship.x - g.x, ship.y - g.y) < 1.1);
    if (entrance < 0) continue;
    const exit = match.gates[1 - entrance];
    ship.x = exit.x + Math.cos(exit.angle) * 1.8;
    ship.y = exit.y + Math.sin(exit.angle) * 1.8;
    ship.gateCooldown = 1.2;
  }
}

/** Mark broken before blast recursion: each pod can explode only once. Friendly fire applies. */
export function damageTerrain(match, obstacle, amount) {
  if (obstacle.hp <= 0 || obstacle.hp === undefined) return;
  obstacle.hp = Math.max(0, obstacle.hp - amount);
  if (obstacle.hp || obstacle.type !== "fuel") return;
  const radius = 3.4;
  match.bursts.push({ id: obstacle.id, x: obstacle.x, y: obstacle.y, life: 0.7 });
  for (const ship of match.ships) {
    const dx = ship.x - obstacle.x, dy = ship.y - obstacle.y, d = Math.hypot(dx, dy);
    if (ship.hp <= 0 || d > radius) continue;
    hurt(ship, Math.round(12 + 18 * (1 - d / radius)));
    if (d > 0.001 && !ship.trapLock) { ship.vx += dx / d * 3; ship.vy += dy / d * 3; }
  }
  for (const other of match.obstacles) {
    if (other.hp > 0 && Math.hypot(other.x - obstacle.x, other.y - obstacle.y) < radius)
      damageTerrain(match, other, 100);
  }
}

/** Earliest segment/circle hit; cover behind a ship must not swallow a hit. */
export function impactTime(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax, dy = by - ay, ox = ax - cx, oy = ay - cy;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy, b = 2 * (ox * dx + oy * dy), disc = b * b - 4 * a * c;
  if (!a || disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : Infinity;
}
