import { config } from "../../state.js";
import { isInsideTrack } from "../track.js";
/** Pure environmental simulation, shared by gameplay and deterministic tests. */
export function motionPosition(entity, time) {
  const m = entity.motion;
  if (!m) return { x: entity.x, y: entity.y };
  const offset =
    Math.sin((time * Math.PI * 2) / m.period + (m.phase || 0)) * m.amplitude;
  return {
    x: m.originX + (m.axis === "x" ? offset : 0),
    y: m.originY + (m.axis === "y" ? offset : 0),
  };
}
export function updateHazards(scene, dt) {
  scene.elapsed = (scene.elapsed || 0) + dt;
  for (const hazard of scene.hazards || []) {
    const pos = motionPosition(hazard, scene.elapsed);
    hazard.vx = (pos.x - hazard.x) / dt;
    hazard.vy = (pos.y - hazard.y) / dt;
    Object.assign(hazard, pos);
  }
}
export function applyGravity(player, wells, dt) {
  for (const well of wells || []) {
    const dx = well.x - player.x,
      dy = well.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001 || d >= well.influence) continue;
    // Softened, bounded attraction: strongest around the core, smooth at the field edge.
    const accel = Math.min(
      12,
      (well.strength / Math.max(1, d)) * (1 - d / well.influence),
    );
    player.vx += (dx / d) * accel * dt;
    player.vy += (dy / d) * accel * dt;
  }
}
export function damagePlayer(player, amount) {
  if ((player.invulnTimer || 0) > 0) return false;
  player.hp = Math.max(0, player.hp - amount);
  player.invulnTimer = 0.65;
  return true;
}
export function resolveHazards(scene, player) {
  let hit = false;
  for (const obstacle of [
    ...(scene.hazards || []),
    ...(scene.gravityWells || []),
  ]) {
    if (obstacle.hp <= 0) continue;
    let dx = player.x - obstacle.x,
      dy = player.y - obstacle.y;
    const distance = Math.hypot(dx, dy),
      minDistance = obstacle.radius + config.PLAYER_RADIUS;
    if (distance >= minDistance) continue;
    const nx = distance > 1e-6 ? dx / distance : 1,
      ny = distance > 1e-6 ? dy / distance : 0;
    player.x = obstacle.x + nx * (minDistance + 0.001);
    player.y = obstacle.y + ny * (minDistance + 0.001);
    const dot =
      (player.vx - (obstacle.vx || 0)) * nx +
      (player.vy - (obstacle.vy || 0)) * ny;
    if (dot < 0) {
      player.vx -= 1.35 * dot * nx;
      player.vy -= 1.35 * dot * ny;
    }
    if (Math.abs(dot) > 1.5)
      hit = damagePlayer(player, Math.min(18, 5 + Math.abs(dot) * 1.4)) || hit;
  }
  return hit;
}
export function segmentHitsCircle(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy || 1)),
  );
  return (ax + t * dx - cx) ** 2 + (ay + t * dy - cy) ** 2 <= radius ** 2;
}
export function hasLineOfSight(from, to, obstacles) {
  return !obstacles.some((o) =>
    segmentHitsCircle(from.x, from.y, to.x, to.y, o.x, o.y, o.radius),
  );
}
/** Solve intercept for a constant-velocity target; cap prediction so dodging remains viable. */
export function predictAim(from, player, speed = 6) {
  const dx = player.x - from.x,
    dy = player.y - from.y,
    vx = player.vx || 0,
    vy = player.vy || 0;
  const a = vx * vx + vy * vy - speed * speed,
    b = 2 * (dx * vx + dy * vy),
    c = dx * dx + dy * dy;
  let t = Math.hypot(dx, dy) / speed;
  const discriminant = b * b - 4 * a * c;
  if (Math.abs(a) < 1e-6) {
    if (b < 0) t = -c / b;
  } else if (discriminant >= 0) {
    const roots = [
      (-b - Math.sqrt(discriminant)) / (2 * a),
      (-b + Math.sqrt(discriminant)) / (2 * a),
    ].filter((v) => v > 0);
    if (roots.length) t = Math.min(...roots);
  }
  t = Math.min(1.5, Math.max(0, t));
  return { x: player.x + vx * t, y: player.y + vy * t };
}
export function updateDrones(scene, player, projectiles, dt) {
  const obstacles = [
    ...(scene.hazards || []),
    ...(scene.gravityWells || []),
  ].filter((o) => !(o.hp <= 0));
  for (const drone of scene.drones || []) {
    if (drone.hp <= 0) {
      drone.state = "dead";
      continue;
    }
    Object.assign(drone, motionPosition(drone, scene.elapsed || 0));
    drone.cooldown = Math.max(0, (drone.cooldown || 0) - dt);
    const sees =
      Math.hypot(player.x - drone.x, player.y - drone.y) < 8 &&
      hasLineOfSight(drone, player, obstacles) &&
      (!scene.track || trackLineClear(scene.track, drone, player));
    if (drone.state === "telegraph") {
      drone.telegraph -= dt;
      if (drone.telegraph <= 0) {
        const angle = Math.atan2(drone.aimY - drone.y, drone.aimX - drone.x);
        projectiles.push({
          owner: "enemy",
          x: drone.x,
          y: drone.y,
          vx: Math.cos(angle) * 6,
          vy: Math.sin(angle) * 6,
          life: 3,
          damage: 10,
        });
        drone.state = "patrol";
        drone.cooldown = 2.4;
      }
    } else if (sees && drone.cooldown <= 0) {
      const aim = predictAim(drone, player);
      drone.aimX = aim.x;
      drone.aimY = aim.y;
      drone.angle = Math.atan2(aim.y - drone.y, aim.x - drone.x);
      drone.state = "telegraph";
      drone.telegraph = 0.8;
    }
  }
}
export function resolveRoadmapProjectiles(scene, projectiles) {
  const obstacles = [
    ...(scene.hazards || []),
    ...(scene.gravityWells || []),
  ].filter((o) => !(o.hp <= 0));
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const shot = projectiles[i];
    const hits = (target) =>
      segmentHitsCircle(
        shot.prevX ?? shot.x,
        shot.prevY ?? shot.y,
        shot.x,
        shot.y,
        target.x,
        target.y,
        target === scene.player ? config.PLAYER_RADIUS : target.radius || 0.38,
      );
    const obstacle = obstacles.find(hits);
    let consumed =
      !!obstacle ||
      (!!scene.track &&
        !trackLineClear(
          scene.track,
          { x: shot.prevX ?? shot.x, y: shot.prevY ?? shot.y },
          shot,
        ));
    if (obstacle?.destructible && shot.owner === "player") {
      obstacle.hp = Math.max(0, obstacle.hp - 50);
      if (obstacle.hp === 0) obstacle.destroyedAt = scene.elapsed || 0;
    }
    if (!consumed && shot.owner === "player") {
      const drone = (scene.drones || []).find((d) => d.hp > 0 && hits(d));
      if (drone) {
        drone.hp = Math.max(0, drone.hp - 50);
        consumed = true;
      }
    }
    if (!consumed && shot.owner === "enemy" && hits(scene.player)) {
      damagePlayer(scene.player, shot.damage || 10);
      consumed = true;
    }
    if (consumed) projectiles.splice(i, 1);
  }
}
export { updateFlux } from "./flight.js";

function trackLineClear(track, from, to) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.25),
  );
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (
      !isInsideTrack(
        track,
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
      )
    )
      return false;
  }
  return true;
}
