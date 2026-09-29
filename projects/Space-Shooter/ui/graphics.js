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
import { toggleMobileFullscreen, isFullscreen } from '../systems/mobileControls.js';
import { drawHUD } from './hud.js';
import { isLapReady } from '../engine/track.js';
import { drawCourier, drawRelayGate, drawShield, drawExplosion, drawFlightEnvironment, drawShard } from '../gfx/stardustVfx.js';
import { drawWeeklyWorld, drawWeeklyHud } from '../gfx/weeklyVfx.js';
import { ghostPosesNow } from '../engine/modes/weekly.js';

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
  const backdrop = bufferCtx.createLinearGradient(0, 0, W, H);
  backdrop.addColorStop(0, '#060f1d'); backdrop.addColorStop(.55, '#0b1825'); backdrop.addColorStop(1, '#050a12');
  bufferCtx.fillStyle = backdrop;
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
  state.gfx.cellH = H / (config.VIEW_CELLS_H || config.GRID_H);
  state.gfx.cellW = state.gfx.cellH;
  const { cellW, cellH } = state.gfx;

  // Anim tickers
  const dt = state.gfx.lastDt || 0;
  if (!state.gfx.anim) state.gfx.anim = { gate: 0, shard: 0 };
  state.gfx.visualTime = (state.gfx.visualTime || 0) + (state.ui.paused || state.settings?.reducedMotion ? 0 : Math.min(dt, .1));
  state.gfx.anim.gate += (SPRITE.GATE_FPS / 60) * (dt * 60);
  state.gfx.anim.shard += (SPRITE.SHARD_FPS / 60) * (dt * 60);

  // Static buffer refresh
  if (isBufferDirty) drawStaticBackgroundToBuffer();

  // Clear and draw static bg
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bufferCanvas, 0, 0);

  // Optional starfield
  if (config.STARFIELD?.ENABLED) {
    const player = state.arena?.player || state.run?.current?.player || null;
    let vxPx = 0, vyPx = 0;
    if (player) {
      vxPx = player.vx * cellW;
      vyPx = player.vy * cellH;
    }
    ctx.save(); ctx.scale(dpr, dpr);
    drawParallaxStars(ctx, W, H, vxPx, vyPx);
    ctx.restore();
  }

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
    if (state.run?.current?.weekly) drawWeeklyHud(ctx, W, H, state.run.current);
    if (state.run?.current?.showLaunchHint) drawLaunchHint(W, H);
    drawCountdown(W, H, state.run?.current);
  } else if (mode === 'arena') {
    drawCountdown(W, H, state.arena);
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
    const img = assets.fuelStation || assets.genA || assets.genB;
    if (img) {
      const s = Math.min(cellW, cellH) * 1.8;
      ctx.shadowBlur = inRange ? 25 : 10;
      ctx.shadowColor = inRange ? '#ffff80' : '#66ccff';
      const ratio = img.height / img.width;
      ctx.drawImage(img, genX - s/2, genY - s*ratio/2, s, s*ratio);
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

  if (A.exitGate) drawRelayGate(ctx, A.exitGate.x*cellW, A.exitGate.y*cellH, cellW*3, assets.relayGate, state.gfx.visualTime || 0);

  // --- Boss ---
  if (boss && Number.isFinite(boss.x) && Number.isFinite(boss.y)) {
    const bossX = boss.x * cellW;
    const bossY = boss.y * cellH;

    const clock = state.gfx.visualTime || 0;
    if (boss.state !== 'dead') {
      const size = Math.min(cellW, cellH) * (config.BOSS_DRAW_SCALE ?? 4.4);
      ctx.save();
      ctx.shadowColor = '#c56832'; ctx.shadowBlur = cellW*.15;
      if (assets.bossShip) ctx.drawImage(assets.bossShip, bossX-size/2, bossY-size/2,size,size);
      ctx.restore();
      if (boss.shielded) drawShield(ctx,bossX,bossY,size*.58,clock);
    } else {
      drawExplosion(ctx,bossX,bossY,cellW,boss.deathTimer || 0,config.BOSS_DEATH_DURATION ?? 2, !!state.settings?.reducedMotion);
    }
  }

  const es = state.arena?.encryptedShard;
  if (es && !es.picked) drawShard(ctx,es.x*cellW,es.y*cellH,cellW*.95,'#ffdf8a',state.gfx.visualTime || 0,config.SHARD_SCALE);
  for (const shard of shards) {
    if (!shard || shard.collected) continue;
    drawShard(ctx,shard.x*cellW,shard.y*cellH,cellW*.75,'#ffdf8a',state.gfx.visualTime || 0,config.SHARD_SCALE);
  }
}

function drawRoadmap(ctx) {
  const lv = state.run?.current;
  if (lv?.track) drawCircuit(ctx, lv);
  else { drawPlayfieldSlab(); drawGrid(); }
  drawFlightEnvironment(ctx, {...lv,reducedMotion:state.settings?.reducedMotion}, state.gfx.cellW, state.gfx.visualTime || 0, assets);
  drawNodes();
  if (lv?.weekly) drawWeeklyWorld(ctx, lv, state.gfx.cellW, state.gfx.visualTime || 0, { ghosts: ghostPosesNow(), shipImg: assets.playerShip, reducedMotion: !!state.settings?.reducedMotion });
  drawProjectiles();
  drawParticles();
  if (!lv?.wreck) drawShip(lv?.player);
}

function drawCircuit(ctx, scene) {
  const track = scene.track, unit = state.gfx.cellW;
  if (!track?.points?.length) return;
  const trace = () => {
    ctx.beginPath();
    track.points.forEach((point, i) => i ? ctx.lineTo(point.x * unit, point.y * unit) : ctx.moveTo(point.x * unit, point.y * unit));
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // The visible racing ribbon shares the same round-segment corridor as collisions.
  trace(); ctx.strokeStyle = '#142c3b'; ctx.lineWidth = (track.width + .7) * unit; ctx.stroke();
  ctx.strokeStyle = '#527b88'; ctx.lineWidth = (track.width + .16) * unit; ctx.stroke();
  ctx.setLineDash([.55 * unit, .55 * unit]); ctx.strokeStyle = '#97d7d0'; ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = track.width * unit; ctx.strokeStyle = '#10202e'; ctx.stroke();
  trace(); ctx.strokeStyle = '#182c3b'; ctx.lineWidth = (track.width - .4) * unit; ctx.stroke();
  // A faint broken guide gives speed and direction without covering apex pickups.
  trace(); ctx.lineWidth = .025 * unit; ctx.setLineDash([.22 * unit, .55 * unit]); ctx.strokeStyle = '#6095a13a'; ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < track.points.length; i++) {
    const a = track.points[i], b = track.points[(i + 1) % track.points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    for (let distance = 2; distance < length - 1; distance += 4) {
      const t = distance / length;
      ctx.save(); ctx.translate((a.x + (b.x - a.x) * t) * unit, (a.y + (b.y - a.y) * t) * unit); ctx.rotate(heading);
      ctx.strokeStyle = '#8de5dc48'; ctx.lineWidth = .035 * unit;
      ctx.beginPath(); ctx.moveTo(-.15 * unit, -.16 * unit); ctx.lineTo(.07 * unit, 0); ctx.lineTo(-.15 * unit, .16 * unit); ctx.stroke(); ctx.restore();
    }
  }
  // Checkpoints span the full lane: the outside rail to where the inner rails
  // meet (engine/track.js). The weekly tracks show every corner's line.
  const nextIndex = scene.trackProgress?.nextCheckpoint || 0;
  const crossLine = (c) => {
    const nx = -c.ty, ny = c.tx, inside = c.insideSide || 1;
    const out = track.width / 2, reach = c.insideReach ?? track.width / 2;
    ctx.beginPath();
    ctx.moveTo((c.x - nx * inside * out) * unit, (c.y - ny * inside * out) * unit);
    ctx.lineTo((c.x + nx * inside * reach) * unit, (c.y + ny * inside * reach) * unit);
    ctx.stroke();
  };
  if (scene.weekly) {
    ctx.lineWidth = .05 * unit; ctx.setLineDash([.2 * unit, .18 * unit]);
    track.checkpoints.forEach((c, i) => {
      if (i === nextIndex) return;
      ctx.strokeStyle = i < nextIndex ? '#5fd6a326' : '#ffd39a3a';
      crossLine(c);
    });
    ctx.setLineDash([]);
  }
  const next = track.checkpoints?.[nextIndex];
  if (next && !scene.lockedInStart) {
    ctx.strokeStyle = scene.weekly ? '#ffd39acc' : '#ffd39a66'; ctx.lineWidth = (scene.weekly ? .09 : .045) * unit; ctx.setLineDash([.15 * unit, .15 * unit]);
    crossLine(next); ctx.setLineDash([]);
  }
  const portal = track.portal;
  if (portal) {
    ctx.save(); ctx.translate(portal.x * unit, portal.y * unit); ctx.rotate(Math.atan2(portal.ty, portal.tx));
    const squares = 12, across = track.width / squares;
    for (let i = 0; i < squares; i++) for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (i + row) % 2 ? '#81ddd98a' : '#0a1b26';
      ctx.fillRect((row - 1) * .13 * unit, (i * across - track.width / 2) * unit, .13 * unit, across * unit);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawArena(ctx) {
  drawArenaColliders(ctx);
  for (const well of state.arena?.gravityWells || []) {
    ctx.save(); ctx.strokeStyle='rgba(255,158,88,.1)'; ctx.lineWidth=1; ctx.setLineDash([5,12]);
    ctx.beginPath(); ctx.arc(well.x*state.gfx.cellW,well.y*state.gfx.cellH,well.influence*state.gfx.cellW,0,Math.PI*2); ctx.stroke();ctx.restore();
  }
  drawArenaEntities();
  drawProjectiles();
  const player = state.arena?.player;
  drawParticles();
  drawShip(player);
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
    ctx.fillStyle = '#243340';
    ctx.strokeStyle = '#627785';
    for (const c of A.cover) {
      const x = px(c.x - c.w / 2), y = py(c.y - c.h / 2);
      const w = px(c.w), h = py(c.h);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle='#3a4c5a'; ctx.fillRect(x+2,y+2,Math.max(0,w-4),Math.min(5,h*.1));
      ctx.fillStyle='#17232e'; ctx.fillRect(x+2,y+h-Math.min(5,h*.1)-2,Math.max(0,w-4),Math.min(5,h*.1));
      ctx.fillStyle='#243340';
    }
    ctx.restore();
  }
}

function drawBossDeathCinematic(ctx) {
  if (state.settings?.reducedMotion) return;
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
    for (const p of state.gfx.projectiles || []) {
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
  const aMinor = Math.min(GRID?.MINOR_ALPHA ?? 0.08, 0.055);
  const aMajor = Math.min(GRID?.MAJOR_ALPHA ?? 0.14, 0.11);
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
  const lv=state.run?.current;
  if(!lv || !Array.isArray(lv.nodes)) return;
  const {ctx,cellW,cellH}=state.gfx, clock=state.gfx.visualTime || 0;
  const colors={blue:'#73d9ff',green:'#99e9b2',pink:'#ffa4ca',purple:'#bca5ff'};
  for(const n of lv.nodes) {
    const x=(n.x+.5)*cellW,y=(n.y+.5)*cellH;
    if(n.kind==='planet' && !lv.shards.has(n.id)) drawShard(ctx,x,y,cellW*.95,colors[n.color] || colors.blue,clock,config.SHARD_SCALE);
    if(n.kind==='gate') {
      const required=lv.nodes.filter(node=>node.kind==='planet').length;
      const lapReady=!lv.track || isLapReady(lv);
      const ready=lv.shards.size>=required && lapReady && lv.fuel >= config.GATE_MIN_FUEL;
      const angle=lv.track?.portal ? Math.atan2(lv.track.portal.ty,lv.track.portal.tx) : 0;
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
      drawRelayGate(ctx,0,0,cellW*3,assets.relayGate,clock,ready,!!lv.secretReady);
      ctx.restore();
    }
    if(n.kind==='station' && assets.fuelStation) {
      const size=cellW*2;
      ctx.save();ctx.shadowColor='#6ed2e3';ctx.shadowBlur=cellW*.1;
      const ratio=assets.fuelStation.height/assets.fuelStation.width;
      ctx.drawImage(assets.fuelStation,x-size/2,y-size*ratio/2,size,size*ratio);ctx.restore();
    }
  }
}

function drawShip(player) {
  if(!player) return;
  const scene=state.mode==='arena'?state.arena:state.run?.current;
  drawCourier(state.gfx.ctx,player,{...scene,paused:state.ui.paused || state.ui.countdownActive},state.keys,state.gfx.cellW,assets.playerShip,state.gfx.visualTime || 0,config.SHIP_VISUAL_SCALE);
}

function drawParticles() {
  const { ctx, cellW, cellH } = state.gfx;
  if (state.settings?.reducedMotion) return;
  const particles = state.gfx.particles || [];
  for (const p of particles) {
    const px = p.x * cellW, py = p.y * cellH;
    const size = Math.min(p.size, .12) * Math.min(cellW, cellH);
    const alpha = Math.max(0, Math.min(.5, p.life / 0.5));
    ctx.fillStyle = `rgba(${p.color ?? '80, 180, 255'}, ${alpha})`;
    ctx.beginPath(); ctx.arc(px, py, Math.max(.3, size / 2), 0, Math.PI*2); ctx.fill();
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
  const camXpx = state.settings?.reducedMotion ? 0 : state.gfx.camera.x * state.gfx.cellW;
  const camYpx = state.settings?.reducedMotion ? 0 : state.gfx.camera.y * state.gfx.cellH;
  ctx.save();
  ctx.globalAlpha = S.ALPHA ?? 0.25;
  ctx.lineCap = 'round';
  for (const layer of state.gfx._stars) {
    for (const s of layer) {
      let x = (s.u * W + (camXpx * s.p)) % W; if (x < 0) x += W;
      let y = (s.v * H + (camYpx * s.p)) % H; if (y < 0) y += H;
      const speed = Math.hypot(vxPx, vyPx);
      const streakLen = state.settings?.reducedMotion ? 0 : Math.min(14, speed * (S.STREAK_MULT ?? 0.018) * s.p);
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

export async function enterFullscreen() {
  if (isFullscreen()) return { ok: true, message: 'Fullscreen is already on.' };
  resetCameraFullscreenState();
  return toggleMobileFullscreen();
}

export async function exitFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement)
    return { ok: true, message: 'Fullscreen is off.' };
  return toggleMobileFullscreen();
}

export function toggleFullscreen() {
  return toggleMobileFullscreen();
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
  // Resize the view without snapping the flight camera to the entire circuit.
  markBufferDirty();
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
