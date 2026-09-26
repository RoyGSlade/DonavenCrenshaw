import { state, config } from '../../state.js';
import { playSoundEffect, playSoundEffectThrottled } from '../../audio.js';
import { toast } from '../../ui/hud.js';

export function checkArenaCollisions() {
  const A = state.arena;
  if (!A) return { playerDied: false, victory: false };
  const {
    player,
    boss,
    walls = [],
    cover: coverRects = [],
    generators = [],
    shards = []
  } = A;
  const projectiles = state.gfx.projectiles || [];
  const r = (config.SHIP_SCALE ?? 1) * 0.5;

  let playerDied = false;
  let victory = false;

  // --- Player vs walls (segment pushback) ---
  for (const wall of walls) {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const lenSq = dx*dx + dy*dy; if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((player.x - wall.x1) * dx + (player.y - wall.y1) * dy) / lenSq));
    const wx = wall.x1 + t * dx, wy = wall.y1 + t * dy;
    const distSq = (player.x - wx)**2 + (player.y - wy)**2;
    if (distSq < r*r) {
      const dist = Math.max(1e-6, Math.sqrt(distSq));
      const overlap = r - dist;
      const nx = (player.x - wx) / dist, ny = (player.y - wy) / dist;
      player.x += nx * overlap; player.y += ny * overlap;
      const dot = player.vx * nx + player.vy * ny;
      player.vx -= 2 * dot * nx; player.vy -= 2 * dot * ny;
      player.vx *= 0.8; player.vy *= 0.8;
    }
  }

  // --- Player vs cover (solid AABB) ---
  for (const c of coverRects) {
    const hw = c.w/2, hh = c.h/2;
    const cx = Math.max(c.x - hw, Math.min(player.x, c.x + hw));
    const cy = Math.max(c.y - hh, Math.min(player.y, c.y + hh));
    const dx = player.x - cx, dy = player.y - cy;
    if (dx*dx + dy*dy < r*r) {
      const dist = Math.max(1e-6, Math.hypot(dx, dy));
      const nx = dx / dist, ny = dy / dist;
      const push = r - dist;
      player.x += nx * push; player.y += ny * push;
      const dot = player.vx * nx + player.vy * ny;
      player.vx -= 2 * dot * nx; player.vy -= 2 * dot * ny;
    }
  }

  // --- Player drive-through vs boss (damage tick, no physical stop) ---
  {
    const rBoss = 2; // matches visual size
    const dx = state.arena.boss.x - player.x;
    const dy = state.arena.boss.y - player.y;
    if (dx*dx + dy*dy < rBoss*rBoss && state.arena.boss.state !== 'dead') {
      if (!state.arena.boss.shielded) {
        const now = performance.now() / 1000;
        const nextOk = state.arena._ramOkAt || 0;
        if (now >= nextOk) {
          state.arena._ramOkAt = now + (config.RAM_COOLDOWN ?? 0.25);
          boss.hp = Math.max(0, boss.hp - (config.RAM_DAMAGE ?? 90));
          playSoundEffectThrottled('boss_hit', 0.5, 100);
          if (boss.hp <= 0) {
            boss.state = 'dead';
            // handled in modes/arena.js after death sequence
            playSoundEffect('explosion');
            state.arena.encryptedShard = { x: boss.x, y: boss.y, picked: false };
          }
        }
      }
    }
  }

  // --- Projectiles ---
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    let hit = false;

    // arena bounds (fast kill)
    if (p.x < 1 || p.x > config.ARENA_SIZE - 1 || p.y < 1 || p.y > config.ARENA_SIZE - 1) hit = true;

    // cover absorb
    if (!hit) {
  for (const c of coverRects) {
        const hw = c.w/2, hh = c.h/2;
        if (p.x > c.x - hw && p.x < c.x + hw && p.y > c.y - hh && p.y < c.y + hh) { hit = true; break; }
      }
    }

    if (hit) { projectiles.splice(i, 1); continue; }

    // player bullets -> boss
    if (p.owner === 'player' && boss.state !== 'dead') {
      const d2 = (p.x - boss.x)**2 + (p.y - boss.y)**2;
      if (d2 < (2*2)) {
        if (boss.shielded) {
          playSoundEffectThrottled('shield_hit', 0.3, 120);
        } else {
          boss.hp = Math.max(0, boss.hp - (config.PLAYER_PROJECTILE_DAMAGE ?? 50));
          playSoundEffectThrottled('boss_hit', 0.5, 100);
          if (boss.hp <= 0 && boss.state !== 'dead') {
            boss.state = 'dead';
            victory = true; // handled in modes/arena.js
            playSoundEffect('explosion');
            // spawn encrypted shard at boss position
            A.encryptedShard = { x: boss.x, y: boss.y, picked: false };
          }
        }
        hit = true;
      }
    }

    // enemy bullets -> player
    if (p.owner === 'enemy' && player.invulnTimer <= 0) {
      const d2 = (p.x - player.x)**2 + (p.y - player.y)**2;
      if (d2 < r*r) {
        player.hp = Math.max(0, player.hp - (config.BOSS_DAMAGE ?? 10));
        player.invulnTimer = config.PLAYER_INVULN_DURATION ?? 0.4;
        state.ui.screenshake = 0.1;
        playSoundEffect('player_hit', 0.6);
        if (player.hp <= 0) playerDied = true;
        hit = true;
      }
    }

    if (hit) projectiles.splice(i, 1);
  }

  // --- Objective: shard pickup (carry up to 2) ---
  const carryCap = 2;
  for (const s of A.shards) {
    if (s.collected) continue;
    if (player.shardsCarried >= carryCap) break;
    const d2 = (player.x - s.x)**2 + (player.y - s.y)**2;
    if (d2 < (config.ARENA_SHARD_PICKUP_RADIUS ?? 1.0)**2) {
      s.collected = true;
      player.shardsCarried++;
      playSoundEffect('shard_pickup');
      toast(`Energy Shard Collected (${player.shardsCarried}/${carryCap})`);
    }
  }

  // --- Objective: deposit to nearest generator within radius ---
  const gens = A.generators ?? [];
  for (const g of gens) {
    const d2 = (player.x - g.x)**2 + (player.y - g.y)**2;
    if (player.shardsCarried > 0 && d2 < (config.GENERATOR_DEPOSIT_RADIUS ?? 1.5)**2) {
      g.shardsDeposited = Math.min(2, g.shardsDeposited + player.shardsCarried);
      toast(`Deposited ${player.shardsCarried}. Gen ${g.id}: ${g.shardsDeposited}/2`);
      player.shardsCarried = 0;
      playSoundEffect('shard_deposit');
      // Unshield when both gens reach 2/2
      const allReady = gens.length >= 2 && gens.every(gg => gg.shardsDeposited >= 2);
      if (allReady && boss.shielded) {
        boss.shielded = false;
        toast('Generator array online! Boss shield is DOWN.');
        playSoundEffect('shield_down');
      }
    }
  }

  // --- Post-victory: encrypted shard & exit gate flow ---
  if (A.encryptedShard && !A.encryptedShard.picked) {
    const d2 = (player.x - A.encryptedShard.x)**2 + (player.y - A.encryptedShard.y)**2;
    if (d2 < 1.2**2) {
      A.encryptedShard.picked = true;
      A.hasEncryptedShard = true;
      A._pendingVictoryPickup = true;
      toast('Encrypted Data Shard secured!');
    }
  }
  // Exit gate no longer triggers server calls here. Modes handle victory after boss death.

  return { playerDied, victory };
}
