// Walking on foot, straight down. Pure: the page passes the input each step.
import { moveCircle, clamp } from './geom.js';

export const WALK = Object.freeze({ speed: 175, accel: 1500, decel: 1900, radius: 13, reachBonus: 0 });

export function createWalker(spawn) {
  return { x: spawn.x, y: spawn.y, vx: 0, vy: 0, angle: spawn.angle ?? -Math.PI / 2, moving: false, stride: 0, walked: 0 };
}

/**
 * One step. input: { x, y } move vector (length up to 1; keyboard gives unit
 * vectors, the thumbstick gives analog). aim (optional): an angle to face while
 * moving (the shooter aims independently of walking). solids from compileMap.
 */
export function stepWalker(w, input, map, dt, { speed = WALK.speed, aim = null } = {}) {
  let ix = input?.x || 0, iy = input?.y || 0;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }
  const tx = ix * speed, ty = iy * speed;
  const rate = (mag > 0.05 ? WALK.accel : WALK.decel) * dt;
  const dvx = tx - w.vx, dvy = ty - w.vy, dv = Math.hypot(dvx, dvy);
  if (dv <= rate) { w.vx = tx; w.vy = ty; } else { w.vx += (dvx / dv) * rate; w.vy += (dvy / dv) * rate; }
  const before = { x: w.x, y: w.y };
  moveCircle(w, w.vx * dt, w.vy * dt, WALK.radius, map.solids, map);
  const moved = Math.hypot(w.x - before.x, w.y - before.y);
  w.walked += moved;
  w.moving = moved > speed * dt * 0.15;
  w.stride = w.moving ? (w.stride + moved / 34) % 4 : w.stride;
  if (aim != null) w.angle = aim;
  else if (mag > 0.2) {
    // Turn toward the walk direction quickly but not instantly (reads as a body, not a cursor).
    const want = Math.atan2(iy, ix);
    const diff = Math.atan2(Math.sin(want - w.angle), Math.cos(want - w.angle));
    w.angle += clamp(diff, -14 * dt, 14 * dt);
  }
  return w;
}

/** The interact point in reach, preferring the one in front of the walker. */
export function nearestInteract(w, map, extra = []) {
  let best = null, bestScore = Infinity;
  for (const it of [...map.interacts, ...extra]) {
    if (it.hidden) continue;
    const dx = it.x - w.x, dy = it.y - w.y;
    const d = Math.hypot(dx, dy);
    if (d > it.reach + WALK.reachBonus) continue;
    const facing = Math.cos(Math.atan2(dy, dx) - w.angle); // 1 ahead, -1 behind
    const score = d - facing * 18;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}

/** NPC idle: a slow wander around home (Ralph roams more). Deterministic from time. */
export function stepNpc(npc, t, dt, map, target = null) {
  const range = (npc.wander ?? 0) * map.tile;
  if (target && npc.follow) {
    // A follower (Ralph) trots after a target, stopping a little short.
    const dx = target.x - npc.x, dy = target.y - npc.y, d = Math.hypot(dx, dy);
    if (d > 60) {
      const s = Math.min(150, d * 1.6) * dt;
      npc.vx = (dx / d) * s / dt; npc.vy = (dy / d) * s / dt;
      moveCircle(npc, (dx / d) * s, (dy / d) * s, 11, map.solids, map);
      npc.angle = Math.atan2(dy, dx);
      npc.moving = true;
      return npc;
    }
  }
  if (range <= 0) { npc.moving = false; return npc; }
  const phase = (npc.seed ?? npc.home.x * 0.013 + npc.home.y * 0.007);
  const gx = npc.home.x + Math.cos(t * 0.31 + phase) * range * Math.sin(t * 0.13 + phase * 2);
  const gy = npc.home.y + Math.sin(t * 0.23 + phase) * range * 0.7;
  const dx = gx - npc.x, dy = gy - npc.y, d = Math.hypot(dx, dy);
  npc.moving = d > 4;
  if (npc.moving) {
    const s = Math.min(60, d * 2) * dt;
    npc.vx = 0; npc.vy = 0;
    moveCircle(npc, (dx / d) * s, (dy / d) * s, 11, map.solids, map);
    npc.angle += clamp(Math.atan2(Math.sin(Math.atan2(dy, dx) - npc.angle), Math.cos(Math.atan2(dy, dx) - npc.angle)), -4 * dt, 4 * dt);
  }
  return npc;
}
