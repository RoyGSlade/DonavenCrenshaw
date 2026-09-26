// src/roadmap/ui/graphics.js
/**
 * Canvas rendering for the Starmap world (grid, nodes, particles, ship).
 * HUD (timer/minimap/bars) is drawn separately via hud.js.
 */
import { state, config } from '../state.js';
import { assets } from '../assets.js';
import { withRun, hasRun } from '../engine/runGuard.js';
import { makeSpriteSheet } from '../engine/sprites/spriteSheet.js';
import { makeAnimator } from '../engine/sprites/animator.js';
import { ensureCamera } from '../engine/systems/camera.js';
import { drawHUD } from './hud.js';

// drawArena/drawRoadmap are defined locally below to avoid missing module imports.

// ------------------------- Sprite/anim config -------------------------
const SPRITE = {
  SHIP_FW: 240,  // Raumschiff.png frame width
  SHIP_FH: 144,  // Raumschiff.png frame height
  GATE_FPS: 10,
  SHARD_FPS: 8
};

// --- Off-screen buffer for static background ---
const bufferCanvas = document.createElement('canvas');
const bufferCtx = bufferCanvas.getContext('2d');
let isBufferDirty = true; // Flag to trigger a redraw of the buffer

// ---------------------------- Helpers --------------------------------
function drawSheetFrame(ctx, img, fw, fh, frameIndex, dx, dy, dw, dh, rot = 0) {
  if (!img) return;
  const cols = Math.max(1, Math.floor(img.width / fw));
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const sx = col * fw, sy = row * fh;

  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(rot);
  ctx.drawImage(img, sx, sy, fw, fh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function roundedPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

export function markBufferDirty() {
  isBufferDirty = true;
}

function drawStaticBackgroundToBuffer() {
  const { gfx } = state;
  const { canvas, dpr } = gfx;
  if (!canvas || !bufferCtx) return;

  bufferCanvas.width = canvas.width;
  bufferCanvas.height = canvas.height;
  bufferCtx.scale(dpr, dpr);

  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  bufferCtx.clearRect(0, 0, W, H);
  bufferCtx.fillStyle = '#000000';
  bufferCtx.fillRect(0, 0, W, H);

  bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
  isBufferDirty = false;
}

// --------------------------- Resizing --------------------------------
export function resizeCanvas() {
  const { gfx } = state;
  const canvas = gfx.canvas;
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    gfx.dpr = dpr;
    gfx.ctx = canvas.getContext('2d');
    markBufferDirty();
    return true;
  }
  return false;
}

// Guarded resize: only trigger expensive resize when CSS size or DPR changed
let _lastCanvasBox = { w: 0, h: 0, dpr: 0 };
function maybeResizeCanvas() {
  const gfx = state.gfx || {};
  const canvas = gfx.canvas;
  if (!canvas) return;

  // Round DPR to 2 decimals to avoid thrashing on tiny fractional changes
  const rawDpr = window.devicePixelRatio || 1;
  const dpr = Math.max(1, Math.floor((rawDpr) * 100) / 100);
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.floor(rect.width);
  const cssH = Math.floor(rect.height);

  if (cssW !== _lastCanvasBox.w || cssH !== _lastCanvasBox.h || dpr !== _lastCanvasBox.dpr) {
    resizeCanvas();
    _lastCanvasBox = { w: cssW, h: cssH, dpr };
  }
}

// ------------------------- Startup/Crash Hints -------------------------
export function drawStartupHint(ctx) {
  ctx.save();
  ctx.font = '14px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`mode=${state.mode} run=${hasRun() ? 'yes' : 'no'}`, 16, 24);
  ctx.restore();
}

export function drawCrashOverlay(ctx, e) {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'white'; ctx.font = '16px monospace'; ctx.textBaseline = 'top';
  const msg = e.stack || e.toString();
  const lines = String(msg).split('\n');
  lines.forEach((line, i) => ctx.fillText(line, 8, 8 + i * 18));
  ctx.restore();
}

// ----------------------------- Render --------------------------------
export function render() {
  // Only resize when DPR or element size actually changes
  maybeResizeCanvas();

  const { gfx, mode } = state;
  const { ctx, canvas, dpr } = gfx;
  if (!ctx || !canvas) return;

  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  // Derive world cell size from height (square cells)
  state.gfx.cellH = H / config.GRID_H;
  state.gfx.cellW = state.gfx.cellH;
  const { cellW, cellH } = state.gfx;

  // Anim tickers
  const dt = state.gfx.lastDt || 0;
  if (!state.gfx.anim) state.gfx.anim = { gate: 0, shard: 0 };
  state.gfx.anim.gate += (SPRITE.GATE_FPS / 60) * (dt * 60);
  state.gfx.anim.shard += (SPRITE.SHARD_FPS / 60) * (dt * 60);

  // Static buffer refresh
  if (isBufferDirty) drawStaticBackgroundToBuffer();

  // Clear and draw static bg
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bufferCanvas, 0, 0);

  // World-space
  ctx.save();
  ctx.scale(dpr, dpr);

  const cam = ensureCamera();
  const viewCenterX = W / 2;
  const viewCenterY = H / 2;

  ctx.translate(viewCenterX, viewCenterY);
  ctx.scale(cam.zoom || 1, cam.zoom || 1);
  ctx.translate(-cam.x * cellW, -cam.y * cellH);

  if (mode === 'roadmap') {
    if (hasRun()) drawRoadmap(ctx);
  } else if (mode === 'arena') {
    if (hasRun()) drawArena(ctx);
  }

  ctx.restore();

  // Screen-space UI
  drawHUD(W, H);

  if (mode === 'roadmap') {
    drawShardIndicator(W, H);
    if (state.run?.current?.showLaunchHint) drawLaunchHint(W, H);
    drawCountdown(W, H, state.run?.current);
  } else if (mode === 'arena') {
    drawCountdown(W, H, state.arena);
  }

  // Optional starfield
  if (config.STARFIELD?.ENABLED) {
    const player = state.arena?.player || state.run?.current?.player || null;
    let vxPx = 0, vyPx = 0;
    if (player) {
      vxPx = player.vx * cellW;
      vyPx = player.vy * cellH;
    }
    drawParallaxStars(ctx, W, H, vxPx, vyPx);
  }

  // Startup hint if there’s no active run
  if (!hasRun()) {
    ctx.save();
    ctx.scale(dpr, dpr);
    drawStartupHint(ctx);
    ctx.restore();
  }
}

// (The rest of the drawing functions from the previous correct version follow)
// ... drawArenaEntities, drawRoadmap, drawArena, drawBoss, etc. ...
// ---------------------- World entity drawing -------------------------

function drawArenaEntities() {
  const { ctx, cellW, cellH, camera } = state.gfx;
  const A = state.arena;
  if (!A) return;
  const player = A.player;
  const boss = A.boss;
  const generators = Array.isArray(A.generators) ? A.generators : (A.generator ? [A.generator] : []);
  const shards = Array.isArray(A.shards) ? A.shards : [];


  for (const generator of generators) {
    if (!generator || !Number.isFinite(generator.x) || !Number.isFinite(generator.y)) continue;
    const genX = generator.x * cellW;
    const genY = generator.y * cellH;
    const hasPlayer = player && Number.isFinite(player.x) && Number.isFinite(player.y);
    const distToGenSq = hasPlayer ? (player.x - generator.x) ** 2 + (player.y - generator.y) ** 2 : Infinity;
    const inRange = distToGenSq < config.GENERATOR_DEPOSIT_RADIUS ** 2;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = inRange ? '#ffff00' : '#00ffff';
    ctx.lineWidth = (inRange ? 3 : 2) / (camera.zoom || 1);
    ctx.beginPath();
    ctx.arc(genX, genY, config.GENERATOR_DEPOSIT_RADIUS * Math.min(cellW, cellH), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const img = assets.genA || assets.genB;
    if (img) {
      const s = Math.min(cellW, cellH) * 1.8;
      ctx.shadowBlur = inRange ? 25 : 10;
      ctx.shadowColor = inRange ? '#ffff80' : '#66ccff';
      ctx.drawImage(img, genX - s/2, genY - s/2, s, s);
    } else {
      ctx.fillStyle = '#223d59';
      ctx.strokeStyle = '#6bbcff';
      ctx.lineWidth = 2 / (camera.zoom || 1);
      roundedPath(ctx, genX - cellW, genY - cellH, cellW * 2, cellH * 2, 6 / (camera.zoom || 1));
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Exit gate render (reuse roadmap gate frames)
  if (state.arena?.exitGate) {
    const { gateBaseFrames: base, gateOverlayFrames: over } = assets;
    if (base && over) {
      const anim = state.gfx.anim || { gate: 0 };
      const f = Math.floor(anim.gate) % Math.min(7, base.length);
      const s = state.gfx.cellW * 3;
      const gx = state.arena.exitGate.x * state.gfx.cellW;
      const gy = state.arena.exitGate.y * state.gfx.cellH;
      drawSheetFrame(ctx, base[f], base[f].width, base[f].height, 0, gx, gy, s, s, Math.PI / 2);
      drawSheetFrame(ctx, over[f], over[f].width, over[f].height, 0, gx, gy, s, s, Math.PI / 2);
    }
  }

  // --- Boss ---
  if (boss && Number.isFinite(boss.x) && Number.isFinite(boss.y)) {
    const bossX = boss.x * cellW;
    const bossY = boss.y * cellH;

    if (boss.state !== 'dead') {
      // Boss ship
      {
        const s = Math.min(cellW, cellH) * (config.BOSS_DRAW_SCALE ?? 4.4);
        const framesCount = (config.BOSS_SHIP_FRAMES ?? 1);
        if (!boss._anim) boss._anim = makeAnimator({ frames: Math.max(1, framesCount), fps: 8, loop: true });
        const idx = boss._anim.update(state.gfx?.lastDt || 0) | 0;

        // Prefer sequence frames if provided; else fall back to sheet
        const seq = state.gfx?.assets?.bossShipFrames || assets.bossShipFrames;
        if (Array.isArray(seq) && seq.length) {
          const img = seq[idx % seq.length];
          ctx.drawImage(img, bossX - s/2, bossY - s/2, s, s);
        } else if (assets.boss) {
          const img = assets.boss; // spritesheet
          const fw = Math.floor(img.width / Math.max(1, framesCount));
          const fh = img.height;
          drawSheetFrame(ctx, img, fw, fh, idx % framesCount, bossX, bossY, s, s, 0);
        } else {
          // Fallback debug rect if no art loaded
          ctx.fillStyle = 'red';
          ctx.fillRect(bossX - cellW * 2, bossY - cellH * 2, cellW * 4, cellH * 4);
        }

        // Shield effect (unchanged)
        if (boss.shielded && assets.boss_shield) {
          const shieldS = cellW * 5;
          const shield_scroll = (performance.now() / 30) % assets.boss_shield.height;
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(bossX, bossY, shieldS/2.2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(assets.boss_shield, 0, shield_scroll, assets.boss_shield.width, assets.boss_shield.height, bossX - shieldS/2, bossY - shieldS/2, shieldS, shieldS);
          ctx.drawImage(assets.boss_shield, 0, shield_scroll - assets.boss_shield.height, assets.boss_shield.width, assets.boss_shield.height, bossX - shieldS/2, bossY - shieldS/2, shieldS, shieldS);
          ctx.restore();
        }
      }
    } else {
      // DEAD: do NOT draw the ship. Play the boom sequence.
      const frames = assets.bossBoomFrames || null;
      const t = Math.min(boss.deathTimer || 0, (config.BOSS_DEATH_DURATION ?? 2.0));
      if (frames && frames.length) {
        const fps = 12; // ~12fps looks good
        const idx = Math.min(frames.length - 1, Math.floor(t * fps));
        const img = frames[idx];
        const s = Math.min(cellW, cellH) * 10; // nice big kaboom
        drawSheetFrame(ctx, img, img.width, img.height, 0, bossX, bossY, s, s);
      }

      // Keep the expanding ring you already had
      const alpha = Math.max(0, 1 - t / (config.BOSS_DEATH_DURATION ?? 2.0));
      const r = (t * 6 + 2) * Math.min(cellW, cellH);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffd580';
      ctx.lineWidth = 3 / (camera.zoom || 1);
      ctx.beginPath();
      ctx.arc(bossX, bossY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const es = state.arena?.encryptedShard;
  if (es && !es.picked) {
    const sx = es.x * cellW, sy = es.y * cellH;
    const rot = performance.now() / 500;
    const s = cellW * 0.9;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    if (assets.shard_gold) {
      ctx.drawImage(assets.shard_gold, -s/2, -s/2, s, s);
    } else {
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 18;
      roundedPath(ctx, -s/2, -s/2, s, s, 6/(camera.zoom||1));
      ctx.fill();
    }
    ctx.restore();
  }

  for (const shard of shards) {
    if (!shard || shard.collected) continue;
    const sX = shard.x * cellW;
    const sY = shard.y * cellH;
    ctx.save();
    ctx.translate(sX, sY);
    ctx.rotate(performance.now() / 500);
    const shardSize = cellW * 0.75;
    if (assets.shard) {
      ctx.drawImage(assets.shard, -shardSize/2, -shardSize/2, shardSize, shardSize);
    } else {
      ctx.fillStyle = '#ffdd00';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 20;
      roundedPath(ctx, -shardSize/2, -shardSize/2, shardSize, shardSize, 6/(camera.zoom||1));
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawRoadmap(ctx) {
  drawPlayfieldSlab();
  drawGrid();
  const lv = state.run?.current;
  drawNodes();
  drawShip(lv?.player);
  drawParticles();
}

function drawArena(ctx) {
  drawArenaColliders(ctx);
  drawArenaEntities();
  drawProjectiles();
  const player = state.arena?.player;
  drawShip(player);
  drawParticles();
  drawBossDeathCinematic(ctx); // new overlay effects drawn last
}


// Draw colliders exactly as simulated
function drawArenaColliders(ctx) {
  const A = state.arena;
  if (!A) return;

  const cellW = state.gfx.cellW, cellH = state.gfx.cellH;
  const zoom = state.gfx.camera?.zoom || 1;
  const px = v => v * cellW;
  const py = v => v * cellH;
  const lw = Math.max(1, 2 / zoom);

  // Walls: line segments
  if (Array.isArray(A.walls) && A.walls.length) {
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#93c5fd';
    ctx.beginPath();
    for (const w of A.walls) {
      ctx.moveTo(px(w.x1), py(w.y1));
      ctx.lineTo(px(w.x2), py(w.y2));
    }
    ctx.stroke();
    ctx.restore();
  }

  // Cover: centered AABB
  if (Array.isArray(A.cover) && A.cover.length) {
    ctx.save();
    ctx.lineWidth = lw;
    ctx.fillStyle = 'rgba(147,197,253,0.18)';
    ctx.strokeStyle = 'rgba(147,197,253,0.55)';
    for (const c of A.cover) {
      const x = px(c.x - c.w / 2), y = py(c.y - c.h / 2);
      const w = px(c.w), h = py(c.h);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
}

function drawBossDeathCinematic(ctx) {
  const A = state.arena;
  if (!A || !A.cine) return;
  const C = A.cine;

  const { cellW, cellH, camera } = state.gfx;
  const px = v => v * cellW, py = v => v * cellH;

  // Expanding ring that wipes bullets (visual only; removal happens in update)
  if (C.phase === 'ring' || C.ringR > 0) {
    ctx.save();
    ctx.lineWidth = Math.max(2 / (camera.zoom || 1), 1.5);
    ctx.strokeStyle = 'rgba(255,255,160,0.8)';
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(px(C.bx), py(C.by), Math.max(0.01, px(C.ringR)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Explosion sprite at boss position (frames provided in assets.bossBoomFrames)
  if (C.phase === 'boom' || (C.explFrameIdx ?? -1) >= 0) {
    const frames = state.gfx?.assets?.bossBoomFrames || (window.assets && window.assets.bossBoomFrames) || null;
    if (frames && frames.length) {
      const img = frames[Math.min(frames.length - 1, Math.max(0, Math.floor(C.explFrameIdx || 0)))];
      const s = Math.min(cellW, cellH) * 10;
      drawSheetFrame(ctx, img, img.width, img.height, 0, px(C.bx), py(C.by), s, s);
    }
  }
}



function drawProjectiles() {
    const { ctx, cellW, cellH } = state.gfx;
    ctx.save();
    for (const p of state.gfx.projectiles) {
        ctx.fillStyle = p.owner === 'player' ? '#00ffff' : '#ff8800';
        ctx.shadowColor = p.owner === 'player' ? '#00ffff' : '#ff8800';
        ctx.shadowBlur = 10;
        const x = p.x * cellW;
        const y = p.y * cellH;
        ctx.beginPath();
        ctx.arc(x, y, 0.15 * cellW, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawPlayfieldSlab() {
  const { ctx, cellW, cellH, camera } = state.gfx;
  const { GRID_W, GRID_H, PLAYFIELD } = config;
  const pad = (PLAYFIELD?.PADDING_CELLS ?? 0) * Math.min(cellW, cellH);
  const x = -pad, y = -pad;
  const w = GRID_W * cellW + pad * 2;
  const h = GRID_H * cellH + pad * 2;
  ctx.save();
  const rScreen = (PLAYFIELD?.RADIUS ?? 12);
  const rWorld = rScreen / (camera.zoom || 1);
  roundedPath(ctx, x, y, w, h, rWorld);
  ctx.fillStyle = PLAYFIELD?.FILL ?? 'rgba(10,12,16,0.65)';
  ctx.fill();
  ctx.restore();
}

function drawGrid() {
  const { ctx, cellW, cellH, camera } = state.gfx;
  const { GRID_W, GRID_H, GRID } = config;
  const totalW = GRID_W * cellW;
  const totalH = GRID_H * cellH;
  const every = Math.max(2, GRID?.MAJOR_EVERY ?? 4);
  const aMinor = GRID?.MINOR_ALPHA ?? 0.14;
  const aMajor = GRID?.MAJOR_ALPHA ?? 0.28;
  const minorPx = Math.max(1, GRID?.MINOR_PX ?? 1);
  const majorPx = Math.max(minorPx + 1, GRID?.MAJOR_PX ?? 2);
  ctx.save();
  ctx.lineWidth = minorPx / (camera.zoom || 1);
  ctx.strokeStyle = `rgba(255,255,255,${aMinor})`;
  for (let x = 0; x <= GRID_W; x++) {
    if (x % every === 0) continue;
    const px = x * cellW;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, totalH); ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    if (y % every === 0) continue;
    const py = y * cellH;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(totalW, py); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.lineWidth = majorPx / (camera.zoom || 1);
  ctx.strokeStyle = `rgba(255,255,255,${aMajor})`;
  for (let x = 0; x <= GRID_W; x += every) {
    const px = x * cellW;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, totalH); ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y += every) {
    const py = y * cellH;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(totalW, py); ctx.stroke();
  }
  ctx.restore();
  if (GRID?.DOTS) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    const r = Math.max(1, 1.5 / (camera.zoom || 1));
    for (let gx = 0; gx < GRID_W; gx++) {
      for (let gy = 0; gy < GRID_H; gy++) {
        const cx = (gx + 0.5) * cellW, cy = (gy + 0.5) * cellH;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawNodes() {
  const lv = state.run?.current;
  if (!lv || !Array.isArray(lv.nodes)) return;
  const { ctx, cellW, cellH } = state.gfx;
  const anim = state.gfx.anim || { gate: 0, shard: 0 };
  for (const n of lv.nodes) {
    const cx = (n.x + 0.5) * cellW;
    const cy = (n.y + 0.5) * cellH;
    switch (n.kind) {
      case 'planet': {
        const key = `shard${n.color.charAt(0).toUpperCase() + n.color.slice(1)}Frames`;
        const frames = assets[key];
        if (frames && frames.length && !lv.shards.has(n.id)) {
          const idx = Math.floor(anim.shard) % frames.length;
          const img = frames[idx];
          drawSheetFrame(ctx, img, img.width, img.height, 0, cx, cy, cellW * 1.2, cellH * 1.2);
        }
        break;
      }
      case 'gate': {
        const base = assets.gateBaseFrames;
        const over = assets.gateOverlayFrames;
        if (base && over) {
          const f = Math.floor(anim.gate) % Math.min(7, base.length);
          const s = cellW * 3;
          drawSheetFrame(ctx, base[f], base[f].width, base[f].height, 0, cx, cy, s, s, Math.PI / 2);
          drawSheetFrame(ctx, over[f], over[f].width, over[f].height, 0, cx, cy, s, s, Math.PI / 2);
        }
        break;
      }
      case 'station': {
        if (assets.fuelStation) {
          const img = assets.fuelStation;
          const w = cellW * 1.2, h = w * (img.height / img.width);
          drawSheetFrame(ctx, img, img.width, img.height, 0, cx, cy, w, h);
        } else {
          ctx.fillStyle = '#60a5fa';
          ctx.fillRect(cx - cellW * 0.4, cy - cellH * 0.4, cellW * 0.8, cellH * 0.8);
        }
        break;
      }
    }
  }
}

function drawShip(player) {
  if (!player) return;
  const { ctx, cellW, cellH } = state.gfx;
  const x = player.x * cellW;
  const y = player.y * cellH;
  const angle = player.angle + Math.PI / 2 + Math.PI;
  ctx.save();
  if (player.invulnTimer > 0) {
    ctx.globalAlpha = (Math.sin(performance.now() / 50) + 1) / 2 * 0.7 + 0.3;
  }
  if (assets.playerShip) {
    const frame = 49;
    const w = cellW * (config.SHIP_SCALE ?? 1);
    const h = w * (SPRITE.SHIP_FH / SPRITE.SHIP_FW);
    drawSheetFrame(ctx, assets.playerShip, SPRITE.SHIP_FW, SPRITE.SHIP_FH, frame, x, y, w, h, angle);
  }
  ctx.restore();
}

function drawParticles() {
  const { ctx, cellW, cellH } = state.gfx;
  const particles = state.gfx.particles || [];
  for (const p of particles) {
    const px = p.x * cellW, py = p.y * cellH;
    const size = p.size * Math.min(cellW, cellH);
    const alpha = Math.max(0, Math.min(1, p.life / 0.5));
    ctx.fillStyle = `rgba(${p.color ?? '80, 180, 255'}, ${alpha})`;
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
  }
}

function drawShardIndicator(W, H) {
  const lv = state.run?.current;
  if (!lv || !lv.nearestShardTarget) return;
  const { player } = lv;
  const t = lv.nearestShardTarget;
  const a = Math.atan2((t.y + 0.5) - player.y, (t.x + 0.5) - player.x);
  const r = Math.min(W, H) * 0.15;
  const x = W / 2 + r * Math.cos(a);
  const y = H / 2 + r * Math.sin(a);
  const { ctx } = state.gfx;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 15 * Math.cos(a - 0.3), y - 15 * Math.sin(a - 0.3));
  ctx.lineTo(x - 15 * Math.cos(a + 0.3), y - 15 * Math.sin(a + 0.3));
  ctx.closePath();
  ctx.fillStyle = t.kind === 'gate' ? 'gold' : 'cyan';
  ctx.fill();
  ctx.restore();
}

function drawLaunchHint(W, H) {
  const { ctx } = state.gfx;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '20px Saira, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 5;
  ctx.fillText('Press [SPACE] to launch!', W / 2, H - 50);
  ctx.restore();
}

function drawCountdown(W, H, currentScene) {
  if (!currentScene || !state.ui.countdownActive) return;
  const { ctx } = state.gfx;
  const count = Math.ceil(currentScene.countdownT);
  const text = count > 0 ? String(count) : 'GO!';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 80px Saira, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 10;
  ctx.fillText(text, W / 2, H / 2);
  ctx.restore();
}

function ensureStars(W, H) {
  if (!state.gfx._stars || state.gfx._starsW !== W || state.gfx._starsH !== H) {
    state.gfx._starsW = W;
    state.gfx._starsH = H;
    state.gfx._stars = [];
    const layers = config.STARFIELD?.LAYERS ?? [];
    for (const L of layers) {
      const layer = [];
      for (let i = 0; i < (L.count ?? 0); i++) {
        layer.push({ u: Math.random(), v: Math.random(), size: randInt(L.size?.[0] ?? 1, L.size?.[1] ?? 2), p: L.parallax ?? 1 });
      }
      state.gfx._stars.push(layer);
    }
  }
}

function drawParallaxStars(ctx, W, H, vxPx, vyPx) {
  ensureStars(W, H);
  const S = config.STARFIELD;
  const camXpx = state.gfx.camera.x * state.gfx.cellW;
  const camYpx = state.gfx.camera.y * state.gfx.cellH;
  ctx.save();
  ctx.globalAlpha = S.ALPHA ?? 0.25;
  ctx.lineCap = 'round';
  for (const layer of state.gfx._stars) {
    for (const s of layer) {
      let x = (s.u * W + (camXpx * s.p)) % W; if (x < 0) x += W;
      let y = (s.v * H + (camYpx * s.p)) % H; if (y < 0) y += H;
      const speed = Math.hypot(vxPx, vyPx);
      const streakLen = Math.min(14, speed * (S.STREAK_MULT ?? 0.018) * s.p);
      if (streakLen > 0.5) {
        const ang = Math.atan2(vyPx, vxPx) + Math.PI;
        ctx.lineWidth = Math.max(1, s.size - 0.5);
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * streakLen, y + Math.sin(ang) * streakLen); ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x | 0, y | 0, s.size, s.size);
      }
    }
  }
  ctx.restore();
}

// ---------------------- Fullscreen/UI sync ---------------------------
export function resetCameraFullscreenState() {
  const cam = ensureCamera();
  if (cam) {
    cam._preFsZoom = null;
  }
}

// iOS fallback state
let iosScrollLocked = false;

function lockIosScroll() {
  iosScrollLocked = true;
  document.documentElement.style.height = '100vh';
  document.body.style.height = '100vh';
  document.body.style.overflow = 'hidden';
  window.scrollTo(0, 1);
}

function unlockIosScroll() {
  if (!iosScrollLocked) return;
  iosScrollLocked = false;
  document.documentElement.style.height = '';
  document.body.style.height = '';
  document.body.style.overflow = '';
}

export async function enterFullscreen() {
  const canvas = state.gfx.canvas;
  if (!canvas) return;

  resetCameraFullscreenState();

  if (canvas.requestFullscreen) {
    try {
      await canvas.requestFullscreen();
    } catch (err) {
      console.log('Could not enter fullscreen mode:', err);
    }
  } else {
    lockIosScroll();
  }

  if (screen?.orientation?.lock) {
    try {
      await screen.orientation.lock('landscape');
    } catch (err) {
      console.log('Orientation lock failed:', err);
    }
  }
}

export async function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch (err) {
      console.log('Could not exit fullscreen mode:', err);
    }
  }
  if (screen?.orientation?.unlock) {
    try {
      screen.orientation.unlock();
    } catch (err) {
      console.log('Orientation unlock failed:', err);
    }
  }
  unlockIosScroll();
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') exitFullscreen();
}, { passive: true });


function syncFullscreenUI() {
  const fsEl =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement;

  document.body.classList.toggle('is-fs', !!fsEl);

  const cam = ensureCamera();
  const canvas = state.gfx.canvas;
  if (!canvas || !cam) return;

  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;

  // Entering fullscreen: apply once
  if (fsEl) {
    if (cam._fsApplied) return; // already handled this entry
    cam._fsApplied = true;
    cam._preFs = { x: cam.x, y: cam.y, zoom: cam.zoom ?? 1 };

    // Fit the full GRID into the viewport. Height is the baseline (zoom=1 shows full height).
    // Width fit factor:
    const zoomToFitWidth = (W * config.GRID_H) / (H * config.GRID_W);
    const targetZoom = Math.max(0.1, Math.min(1, zoomToFitWidth));

    cam.zoom = targetZoom;
    cam.x = config.GRID_W / 2;
    cam.y = config.GRID_H / 2;

    // Redraw static buffer at new size next frame
    markBufferDirty();
    return;
  }

  // Exiting fullscreen: restore once
  if (cam._fsApplied) {
    const pre = cam._preFs || { x: cam.x, y: cam.y, zoom: cam.zoom ?? 1 };
    cam.x = pre.x;
    cam.y = pre.y;
    cam.zoom = pre.zoom;
    cam._preFs = null;
    cam._fsApplied = false;
    markBufferDirty();
  }
}

// Event Listeners
document.addEventListener('fullscreenchange', syncFullscreenUI);
document.addEventListener('webkitfullscreenchange', syncFullscreenUI);
document.addEventListener('mozfullscreenchange', syncFullscreenUI);
document.addEventListener('MSFullscreenChange', syncFullscreenUI);

// When tab becomes visible again, force a one-time resize next frame
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return; // dt clamp is handled elsewhere
  _lastCanvasBox.dpr = 0; // invalidate cache to trigger maybeResizeCanvas()
});


// Initial sync on load
syncFullscreenUI();
