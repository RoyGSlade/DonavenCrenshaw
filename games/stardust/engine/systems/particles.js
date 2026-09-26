// src/roadmap/engine/systems/particles.js
import { state, config } from '../../state.js';

// Rear-only exhaust. Accepts legacy string arg or options object.
// Usage: spawnExhaust(player, { intensity: 0..1 })
export function spawnExhaust(p, opts = { intensity: 1 }) {
  // Back-compat: if a string was supplied, ignore and use rear exhaust.
  let intensity = 1;
  if (typeof opts === 'string') {
    intensity = 1; // default if called with legacy direction
  } else if (typeof opts?.intensity === 'number') {
    intensity = Math.max(0.05, Math.min(1, opts.intensity));
  }

  const playerAngle = p.angle;
  const engineSeparation = 0.33 * config.SHIP_SCALE;
  const exhaustAngle = playerAngle + Math.PI;         // always behind the ship
  const sideAngle = playerAngle + Math.PI / 2;        // nozzle offset axis

  const nozzle1X = p.x - engineSeparation * Math.cos(sideAngle);
  const nozzle1Y = p.y - engineSeparation * Math.sin(sideAngle);
  const nozzle2X = p.x + engineSeparation * Math.cos(sideAngle);
  const nozzle2Y = p.y + engineSeparation * Math.sin(sideAngle);

  const baseSpeed = 1.3 + Math.random() * 0.5;
  const particleSpeed = baseSpeed * (0.6 + 0.8 * intensity);
  const vx = p.vx + Math.cos(exhaustAngle) * particleSpeed;
  const vy = p.vy + Math.sin(exhaustAngle) * particleSpeed;
  const particleSize = (0.05 + Math.random() * 0.04) * (0.7 + 0.6 * intensity);
  const particleColor = '80, 180, 255';

  // Scale count/life with intensity (fewer + shorter when strafing/reversing)
  const countPerNozzle = Math.max(1, Math.round(2 * intensity));
  const lifeBase = 0.35 + Math.random() * 0.25;
  const life = lifeBase * (0.6 + 0.7 * intensity);

  for (let i = 0; i < countPerNozzle; i++) {
    state.gfx.particles.push({
      x: nozzle1X, y: nozzle1Y, vx, vy,
      size: particleSize, life, color: particleColor
    });
    state.gfx.particles.push({
      x: nozzle2X, y: nozzle2Y, vx, vy,
      size: particleSize, life, color: particleColor
    });
  }
}

export function updateParticles(dt) {
  const particles = state.gfx.particles;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}