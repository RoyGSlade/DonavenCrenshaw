// src/roadmap/engine/modes/arena.js
import { state, config } from '../../state.js';
import { playMusic, playSoundEffect } from '../../audio.js';
import { resizeCanvas } from '../../ui/graphics.js';
import { updateHUD, toast } from '../../ui/hud.js';
import { clamp } from '../utils.js';
import { exitArena, startCountdown } from '../modeManager.js';
import { recordArenaVictory, recordArenaDefeat } from '../api.js';
import { openVictoryOverlay, openDefeatOverlay, openStartOverlay } from '../../ui/overlays.js';
import { updateParticles } from '../systems/particles.js';
import { handlePlayerMovement } from '../systems/movement.js';
import { handleShooting, handleOverheat, updateProjectiles, spawnEnemyProjectile } from '../systems/projectiles.js';
import { checkArenaCollisions } from '../collisions/arena.js';
import { beginCameraPanTo, clearCameraPan } from '../systems/camera.js';

let _victoryHandled = false; // Gate victory trigger to once
let _defeatHandled = false;  // Gate defeat trigger to once

async function finishArenaWinToMenu() {
  exitArena('win');
  setTimeout(() => {
    openStartOverlay();
  }, 50);
}

export function updateArena(dt) {
  const A = state.arena;
  if (!A) return;

  // Lazy init cinematic holder
  if (!A.cine) A.cine = null;

  // Recharge, heat, etc (kept)
  A.boost = Math.min(config.BOOST_MAX_PIPS, (A.boost ?? config.BOOST_MAX_PIPS) + (config.BOOST_REGEN_PER_SEC ?? 0.22) * dt);
  A.player.invulnTimer = Math.max(0, A.player.invulnTimer - dt);


  // If boss is dead, kick off the cinematic and allow movement after it
  if (A.boss.state === 'dead') {
    // Start the death cinematic exactly once
    if (!A._cinematicStarted && !A.cine) {
      // Focus on boss, ring wipe, boom, pan to gate, return
      startBossCinematic();
    }
    // Do not early-return; let the cinematic handler below manage control lock/unlock.
  }

  // Cinematic flow: lock controls and manage effects
  if (A.cine) {
    A.player.vx = 0; A.player.vy = 0; // hard stop during cinematic
    A.cine.t += dt;

    if (A.cine.phase === 'ring') {
      // grow ring and delete projectiles inside it
      A.cine.ringR += (A.cine.ringSpeed ?? 36) * dt; // cells/s
      const bx = A.cine.bx, by = A.cine.by, r2 = A.cine.ringR * A.cine.ringR;
      const projs = state.gfx.projectiles || [];
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        const d2 = (p.x - bx) ** 2 + (p.y - by) ** 2;
        if (d2 <= r2) projs.splice(i, 1);
      }
      if (A.cine.t >= 0.6) { // ring duration
        A.cine.phase = 'boom';
        A.cine.t = 0;
        A.cine.explFrameIdx = 0;
      }
    } else if (A.cine.phase === 'boom') {
      // advance explosion frames ~12 fps
      A.cine.explFrameIdx = (A.cine.explFrameIdx ?? 0) + 12 * dt;
      if (A.cine.t >= 0.8) {
        // Hide boss sprite after boom
        A._bossGone = true;

        // Spawn exit gate if not present
        if (!A.exitGate) {
          spawnArenaExitGateAtCenter();
        }

        // Pan to gate and then back
        const g = A.exitGate;
        beginCameraPanTo(g.x, g.y, 0.9, true);
        A.cine.phase = 'gate';
        A.cine.t = 0;
      }
    } else if (A.cine.phase === 'gate') {
      if (A.cine.t >= 0.95) {
        // Pan back to player, then release control
        beginCameraPanTo(A.player.x, A.player.y, 0.9, false);
        A.cine.phase = 'return';
        A.cine.t = 0;
      }
    } else if (A.cine.phase === 'return') {
      if (A.cine.t >= 0.95) {
        clearCameraPan();
        A.cine = null;
        A.controlsLocked = false;
        // After cinematic, allow movement and shard pickup
      }
    }

    // During cinematic, skip the usual sim except particles for visuals
    updateParticles(dt);
    updateProjectiles(dt);
    updateBossDeadIdle(dt); // maintain boss timer for any UI that peers at it
    return;
  }

  // Pre-launch countdown freeze
  if (state.ui.countdownActive) {
    A.countdownT -= dt;
    A.player.x = A.startPos.x;
    A.player.y = A.startPos.y;
    A.player.vx = 0; A.player.vy = 0;
    if (A.countdownT <= 0) state.ui.countdownActive = false;
  } else {
    const movementEnv = {
      onLaunch: () => { A.combatActive = true; },
      onLeavePad: () => { A.combatActive = true; }
    };
    if (!A.controlsLocked) {
      handlePlayerMovement(dt, A, A.player, movementEnv);
    } else {
      A.player.vx = 0; A.player.vy = 0;
    }

    handleShooting(dt, A.player);
    handleOverheat(dt, A.player);
    updateParticles(dt);
    updateProjectiles(dt);

    const status = checkArenaCollisions();
    if (status.playerDied && !_defeatHandled) {
      _defeatHandled = true;
      handleArenaDefeat();
      return;
    }
  }

  updateBoss(dt);

  // Post-victory finish: if we have the encrypted shard and hit the gate, end the run
  if (A.hasEncryptedShard && A.exitGate && !_victoryHandled) {
    const dx = A.player.x - A.exitGate.x;
    const dy = A.player.y - A.exitGate.y;
    if (dx * dx + dy * dy < (config.GATE_TRIGGER_RADIUS ?? 1.2) ** 2) {
      _victoryHandled = true; // ensure overlay opens only once
      completeArenaVictory();
      return;
    }
  }

  updateHUD();
}

// Spawn the exit gate at the center between generators, but never inside walls/cover.
function spawnArenaExitGateAtCenter() {
  const A = state.arena;
  if (!A || A.exitGate) return;

  const size = config.ARENA_SIZE;
  const center = size / 2;

  // Prefer the midpoint between the two generators if present
  let gx = center, gy = center;
  const gens = Array.isArray(A.generators) ? A.generators : [];
  if (gens.length >= 2) {
    gx = (gens[0].x + gens[1].x) / 2;
    gy = (gens[0].y + gens[1].y) / 2;
  }

  // Safety radius roughly matches gate’s use radius plus padding
  const gateR = (config.GATE_RADIUS ?? 0.9) * 1.2;

  // Collision helpers
  const circleIntersectsAABB = (x, y, r, c) => {
    const hw = c.w / 2, hh = c.h / 2;
    const cx = Math.max(c.x - hw, Math.min(x, c.x + hw));
    const cy = Math.max(c.y - hh, Math.min(y, c.y + hh));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  };
  const distSqToSegment = (px, py, x1, y1, x2, y2) => {
    const vx = x2 - x1, vy = y2 - y1;
    const len2 = vx * vx + vy * vy || 1e-6;
    let t = ((px - x1) * vx + (py - y1) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + vx * t, cy = y1 + vy * t;
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy;
  };
  const intersectsWalls = (x, y, r) => {
    const wth = (config.ARENA_WALL_THICKNESS ?? 0.24) * 0.5; // half-thickness pad
    const padR = r + wth;
    for (const w of (A.walls || [])) {
      const d2 = distSqToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
      if (d2 < padR * padR) return true;
    }
    return false;
  };
  const intersectsCover = (x, y, r) => {
    for (const c of (A.cover || [])) {
      if (circleIntersectsAABB(x, y, r, c)) return true;
    }
    return false;
  };
  const collides = (x, y) => intersectsWalls(x, y, gateR) || intersectsCover(x, y, gateR);

  // If center collides, spiral-sample nearby spots until one is clean
  if (collides(gx, gy)) {
    const dirs = 24;
    let found = false;
    for (let ring = 1; ring <= 12 && !found; ring++) {
      const step = 0.6 * ring;
      for (let i = 0; i < dirs; i++) {
        const a = (i / dirs) * Math.PI * 2;
        const x = gx + Math.cos(a) * step;
        const y = gy + Math.sin(a) * step;
        if (x > 1 && x < size - 1 && y > 1 && y < size - 1 && !collides(x, y)) {
          gx = x; gy = y; found = true; break;
        }
      }
    }
    // If nothing found, fine, the center will at least be clamped by bounds
  }

  A.exitGate = { x: gx, y: gy };
}

function startBossCinematic() {
  const A = state.arena;
  A._cinematicStarted = true;
  A.controlsLocked = true;

  const bx = A.boss.x, by = A.boss.y;
  A.cine = { phase: 'ring', t: 0, bx, by, ringR: 0, ringSpeed: 36, explFrameIdx: -1 };
  beginCameraPanTo(bx, by, 0.8, true); // focus boss first
}

function updateBossDeadIdle(dt) {
  const boss = state.arena?.boss;
  if (!boss) return;
  boss.deathTimer = (boss.deathTimer || 0) + dt;
}

export async function completeArenaVictory() {
  // Local-only: show victory overlay and return to start
  openVictoryOverlay({ message: 'You defeated the Warden.' });
  _victoryHandled = true;
}

export function buildArena() {
  // Reset the flag on build
  _victoryHandled = false;
  _defeatHandled = false;
  // Arena can use a different baseline if desired; default to config base zoom
  state.gfx.camera.zoom = (config.ARENA_CAMERA_ZOOM || config.CAMERA_BASE_ZOOM || state.gfx.camera.zoom);
  //... rest of the function is unchanged
  state.gfx.projectiles = [];
  resizeCanvas();

  const size = config.ARENA_SIZE;
  const center = size / 2;

  const walls = [];
  const vertices = 8;
  const radius = size / 2 - 1;
  for (let i = 0; i < vertices; i++) {
    const angle1 = (i / vertices) * Math.PI * 2;
    const angle2 = ((i + 1) / vertices) * Math.PI * 2;
    walls.push({
      x1: center + radius * Math.cos(angle1), y1: center + radius * Math.sin(angle1),
      x2: center + radius * Math.cos(angle2), y2: center + Math.sin(angle2) * radius,
    });
  }

  const cover = [
    { x: center - 12, y: center - 12, w: 6, h: 2 },
    { x: center + 12, y: center - 12, w: 6, h: 2 },
    { x: center - 12, y: center + 12, w: 6, h: 2 },
    { x: center + 12, y: center + 12, w: 6, h: 2 },
    { x: center, y: center + 10, w: 2, h: 5 },
    { x: center, y: center - 10, w: 2, h: 5 },
  ];

  state.arena = {
    walls, cover,
    startPos: { x: center, y: center + 13.5 },
    lockedInStart: true, launched: false, combatActive: false,
    fuel: Number.POSITIVE_INFINITY, maxFuel: Number.POSITIVE_INFINITY,
    boost: config.BOOST_MAX_PIPS,

    player: {
      x: center, y: center + 13.5, vx: 0, vy: 0, angle: -Math.PI / 2,
      hp: config.MAX_HP, maxHp: config.MAX_HP,
      invulnTimer: 0, shardsCarried: 0,
      heat: 0, maxHeat: config.PLAYER_MAX_HEAT, isOverheated: false, shootCooldown: 0,
    },

    boss: {
      x: center, y: -(config.ARENA_SIZE * 0.10), vx: 0, vy: 0,
      hp: config.BOSS_MAX_HP, maxHp: config.BOSS_MAX_HP,
      state: 'pre-entry', shielded: true, entryTimer: 0, deathTimer: 0,
      attackCooldown: config.BOSS_FIRE_COOLDOWN_BASE, telegraphTimer: 0,
    },

    generators: [
      { id: 'A', x: center - 8, y: center, shardsDeposited: 0 },
      { id: 'B', x: center + 8, y: center, shardsDeposited: 0 },
    ],

    shards: [
      { id: 'S1', x: center - 12, y: center - 2, collected: false },
      { id: 'S2', x: center - 12, y: center + 2, collected: false },
      { id: 'S3', x: center + 12, y: center - 2, collected: false },
      { id: 'S4', x: center + 12, y: center + 2, collected: false },
    ],

    exitGate: null,
    encryptedShard: null,
    hasEncryptedShard: false,
    countdownT: 0,
  };
  const aabbContains = (px, py, c) => {
    const hw = c.w / 2, hh = c.h / 2;
    return px > c.x - hw && px < c.x + hw && py > c.y - hh && py < c.y + hh;
  };
  if (cover.some(c => aabbContains(state.arena.startPos.x, state.arena.startPos.y, c))) {
    state.arena.startPos.y += 2;
    state.arena.player.y = state.arena.startPos.y;
  }
}

// This function is now deprecated in favor of finishArenaWinToMenu,
// but kept for now to avoid breaking other parts of the code.
// The new flow is driven by shard pickup.
async function handleArenaVictory() {
  // This function is now deprecated in favor of finishArenaWinToMenu,
  // but kept for now to avoid breaking other parts of the code.
  // The new flow is driven by shard pickup.
  console.log("handleArenaVictory called, but should be deprecated.");
}

// ... updateBoss function is unchanged ...
export function updateBoss(dt) {
  const arena = state.arena;
  const boss = arena.boss;
  const center = config.ARENA_SIZE / 2;

  switch (boss.state) {
    case 'pre-entry':
      playMusic('boss_theme', { volume: 0.4, loop: true });
      playSoundEffect('boss_intro', 0.45);
      boss.state = 'entering';
      break;
    case 'entering':
      boss.entryTimer += dt;
      const progress = clamp(boss.entryTimer / config.BOSS_ENTRY_DURATION, 0, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const startY = -(config.ARENA_SIZE * 0.10);
      const endY = center - 4;
      boss.y = startY + (endY - startY) * easedProgress;
      if (progress >= 1) boss.state = 'idle_shielded';
      break;
    case 'idle_shielded':
    case 'vulnerable':
      boss.x = center + Math.sin(performance.now() / 4000) * 8;
      boss.y = center - 4 + Math.cos(performance.now() / 5500) * 4;
      if (arena.combatActive) {
        boss.attackCooldown -= dt;
        if (boss.telegraphTimer > 0) boss.telegraphTimer -= dt;
        else if (boss.attackCooldown <= 0) boss.telegraphTimer = config.BOSS_TELEGRAPH_DURATION;

        if (boss.attackCooldown <= -config.BOSS_TELEGRAPH_DURATION) {
          const angleToPlayer = Math.atan2(arena.player.y - boss.y, arena.player.x - boss.x);
          for (let i = -1; i <= 1; i++) spawnEnemyProjectile(boss, angleToPlayer + i * 0.2);
          const healthPct = boss.hp / boss.maxHp;
          boss.attackCooldown = healthPct > 0.4 ? config.BOSS_FIRE_COOLDOWN_BASE : config.BOSS_FIRE_COOLDOWN_FAST;
        }
      }
      break;
    case 'dead':
      boss.deathTimer = (boss.deathTimer || 0) + dt;
      break;
  }
}

async function handleArenaDefeat() {
  // Local-only: exit arena and show defeat overlay (no lockout)
  exitArena('loss');
  openDefeatOverlay({ locked: false });
}