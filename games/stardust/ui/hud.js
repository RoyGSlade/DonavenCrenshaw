// src/roadmap/ui/hud.js
/**
 * HUD: global timer (top-center), HP/Fuel bars (top-right),
 * minimap (bottom-left). Also keeps mission text updated and hides the old DOM fuel gauge.
 */
import { state, config, MAX_LEVEL, SHARDS_PER_LEVEL } from '../state.js';

// ---------------------------- DOM HUD --------------------------------
const missionEl = document.getElementById('mission-tracker');
const fuelDomContainer = document.getElementById('fuel-bar-container'); // hidden HUD

// Toast (DOM) — exported for engine.js
const toastEl = document.getElementById('roadmap-toast');
let toastTimeoutId = 0;
export function toast(message, durationMs = 3000) {
  if (!toastEl) { console.log('[Toast]', message); return; }
  toastEl.textContent = message;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => { toastEl.style.opacity = '0'; }, durationMs);
}

// Back-compat: engine may call this; DOM fuel bar is gone now.
export function blinkFuel() {}

export function updateHUD() {
  // This function is for the DOM mission tracker, which is hidden in arena mode.
  if (state.mode === 'arena') {
      if (missionEl) missionEl.classList.add('hidden');
      if (fuelDomContainer) fuelDomContainer.classList.add('hidden');
      return;
  }

  if (missionEl) missionEl.classList.remove('hidden');

  const lv = state.run?.current;
  if (!lv) {
    if (missionEl) missionEl.textContent = 'Data Shards: -/-';
    if (fuelDomContainer) fuelDomContainer.classList.add('hidden');
    return;
  }

  const typeOf = (n) => n?.type ?? n?.kind; // tolerate both "type" and "kind"
  const totalPlanets = Array.isArray(lv.nodes) ? lv.nodes.filter(n => typeOf(n) === 'planet').length : 0;
  const required = Math.min(SHARDS_PER_LEVEL, totalPlanets || SHARDS_PER_LEVEL);

  if (missionEl) {
    const got = lv.shards?.size ?? 0;
    const level = lv.level ?? (state.run?.levelIndex ?? 1);
    missionEl.textContent = `Data Shards: ${got}/${required} — Level ${level}/${MAX_LEVEL}`;
  }
  if (fuelDomContainer) fuelDomContainer.classList.add('hidden');
}

// --------------------------- Canvas HUD ------------------------------
export function drawHUD(W, H) {
  const ctx = state.gfx.ctx;
  if (!ctx) return;

  if (state.mode === 'roadmap') {
    drawGlobalTimerTopCenter(ctx, W, H);
    const lv = state.run?.current;
    if (lv) {
        drawResourcesTopRight(ctx, W, H, lv.player, lv.fuel, lv.maxFuel);
        if (state.ui.showMinimap) drawMinimapBottomLeft(ctx, W, H);
    }
  } else if (state.mode === 'arena') {
    const arenaState = state.arena;
    if (arenaState) {
        drawBossHUD(ctx, W, H, arenaState.boss);
  drawGeneratorStatus(ctx, W, H, arenaState.generators || arenaState.generator);
        drawResourcesTopRight(ctx, W, H, arenaState.player, null, null); // Hide fuel bar in arena
        drawOverheatMeter(ctx, W, H, arenaState.player);
  drawArenaObjectives(ctx, W, H, arenaState);
  drawArenaMinimapBottomLeft(ctx, W, H);
    }
  }
}

/** Top-center, shows OVERALL run time: run.totalActiveMs + current slice if running */
function drawGlobalTimerTopCenter(ctx, W, H) {
  const run = state.run;
  const lv  = run?.current;
  if (!run || !lv || !state.ui.showTimer) return;

  let ms = run.totalActiveMs || 0;
  if (lv.timerRunning) ms += performance.now() - lv.t0;

  const text = msToClock(ms);
  ctx.save();
  ctx.font = '600 18px Saira, sans-serif';
  const padX = 12, h = 30;
  const w = ctx.measureText(text).width + padX * 2;
  const x = (W - w) / 2, y = 16;

  roundedRectPath(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2);
  ctx.restore();
}

function drawResourcesTopRight(ctx, W, H, player, fuel, maxFuel) {
  const p = player ?? {};
  const maxHp = p.maxHp ?? config.MAX_HP ?? 100;
  const hp    = clamp(p.hp ?? maxHp, 0, maxHp);
  const hpPct = maxHp ? hp / maxHp : 1;
  
  const margin = 16;
  const w = Math.max(220, Math.min(320, W * 0.28));
  const h = 18;
  let x = W - w - margin;
  let y = margin;

  drawNeonBar(ctx, x, y, w, h, hpPct,   '#19ff8c', '#0b8f52', 'HP');
  
  // Replace fuel bar with boost pips
  y += h + 10;
  const boostVal = state.mode === 'arena'
    ? (state.arena?.boost ?? 0)
    : (state.run?.current?.boost ?? 0);
  drawBoostPips(ctx, x, y, w, h, boostVal);
}

function drawOverheatMeter(ctx, W, H, player) {
    if (!player) return;
    const heatPct = player.maxHeat ? clamp(player.heat / player.maxHeat, 0, 1) : 0;
    
    const margin = 16;
    const w = Math.max(220, Math.min(320, W * 0.28));
    const h = 18;
    let x = W - w - margin;
    let y = margin + (h + 10) * 2;

    const color = player.isOverheated ? '#ff4d4d' : '#ff9d4d';
    const backColor = player.isOverheated ? '#6e1e1e' : '#6e4a1e';
    const label = player.isOverheated ? 'OVERHEATED' : 'Heat';

    drawNeonBar(ctx, x, y, w, h, heatPct, color, backColor, label);
}


function drawNeonBar(ctx, x, y, w, h, pct, colorMain, colorBack, label, ticks=false) {
  pct = clamp(pct, 0, 1);
  ctx.save();

  roundedRectPath(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();

  const fw = Math.max(0, Math.floor((w - 2) * pct));
  if (fw > 0) {
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, colorMain); grad.addColorStop(1, colorBack);
    roundedRectPath(ctx, x + 1, y + 1, fw, h - 2, 7);
    ctx.fillStyle = grad; ctx.fill();
    // glow stroke over the fill
    ctx.shadowColor = colorMain; ctx.shadowBlur = 12; ctx.globalAlpha = 0.25;
    ctx.strokeStyle = colorMain; ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  if (ticks) {
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const tx = x + Math.floor((w * i) / 10);
      ctx.beginPath(); ctx.moveTo(tx, y + 2); ctx.lineTo(tx, y + h - 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 12px Saira, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 8, y + h / 2);
  const pctTxt = `${Math.round(pct * 100)}%`;
  const tw = ctx.measureText(pctTxt).width;
  ctx.fillText(pctTxt, x + w - tw - 8, y + h / 2);

  ctx.restore();
}

function drawBoostPips(ctx, x, y, w, h, boost) {
  const pips = config.BOOST_MAX_PIPS ?? 3;
  const gap = 8;
  const pipW = (w - gap * (pips - 1)) / pips;
  const full = Math.floor(boost);
  const frac = boost - full;

  for (let i = 0; i < pips; i++) {
    const px = x + i * (pipW + gap);
    // Back
    roundedRectPath(ctx, px, y, pipW, h, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();

    // Fill
    let pct = 0;
    if (i < full) pct = 1;
    else if (i === full) pct = Math.max(0, Math.min(1, frac));
    if (pct > 0) {
      roundedRectPath(ctx, px + 1, y + 1, (pipW - 2) * pct, h - 2, 7);
      const grad = ctx.createLinearGradient(px, y, px + pipW, y);
      grad.addColorStop(0, '#4dc3ff');
      grad.addColorStop(1, '#1aa3ff');
      ctx.fillStyle = grad; ctx.fill();
    }
  }

  // Label
  ctx.font = 'bold 12px Saira, sans-serif';
  ctx.fillStyle = '#bfe9ff';
  const tw = ctx.measureText('BOOST').width;
  ctx.fillText('BOOST', x + w - tw, y - 6);
}

function drawBossHUD(ctx, W, H, boss) {
    if (!boss) return;
    
    // FIX C: Lazy init for damage lag
    if (boss.displayedHp === undefined) boss.displayedHp = boss.hp;
    boss.displayedHp += (boss.hp - boss.displayedHp) * 0.1;

    const hpPct = boss.maxHp ? boss.hp / boss.maxHp : 1;
    const displayedHpPct = boss.maxHp ? boss.displayedHp / boss.maxHp : 1;
    
    const w = W * 0.6;
    const h = 24;
    const x = (W - w) / 2;
    const y = 16;

    ctx.save();
    
    roundedRectPath(ctx, x, y, w, h, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();

    // FIX C: Damage lag bar (darker red)
    if (displayedHpPct > 0) {
        roundedRectPath(ctx, x + 1, y + 1, (w - 2) * displayedHpPct, h - 2, 7);
        ctx.fillStyle = 'rgba(139, 0, 0, 0.6)';
        ctx.fill();
    }

    if (hpPct > 0) {
        roundedRectPath(ctx, x + 1, y + 1, (w - 2) * hpPct, h - 2, 7);
        const grad = ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, '#ff3838'); grad.addColorStop(1, '#a31d1d');
        ctx.fillStyle = grad;
        ctx.fill();
    }
    
    // FIX C: Health thresholds
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    [0.75, 0.40, 0.10].forEach(threshold => {
        const tx = x + w * threshold;
        ctx.beginPath();
        ctx.moveTo(tx, y);
        ctx.lineTo(tx, y + h);
        ctx.stroke();
    });

    if (boss.shielded) {
        roundedRectPath(ctx, x, y, w, h, 8);
        ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
        ctx.fill();
        ctx.font = 'bold 16px Saira, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
        ctx.fillText('SHIELDED', x + w/2, y + h/2);
    }
    
    ctx.restore();
}

function drawGeneratorStatus(ctx, W, H, genOrArray) {
  if (!genOrArray) return;
  const gens = Array.isArray(genOrArray) ? genOrArray : [genOrArray];

  ctx.save();
  ctx.font = '600 18px Saira, sans-serif';
  const padX = 12, h = 30, gap = 6;
  let y = 16;

  for (let i = 0; i < gens.length; i++) {
    const g = gens[i];
    if (!g) continue;
    const text = (g.id ? `${g.id}` : `GEN`) + `: ${g.shardsDeposited ?? 0} / 2`;
    const w = ctx.measureText(text).width + padX * 2;
    const x = 16;
    
    roundedRectPath(ctx, x, y, w, h, 8);
    ctx.fillStyle = (g.shardsDeposited ?? 0) >= 2 ? 'rgba(0, 150, 0, 0.7)' : 'rgba(0,0,0,0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX, y + h / 2);

    y += h + gap;
  }

  ctx.restore();
}

// ---------------------------- Minimap --------------------------------
export function drawMinimapBottomLeft(ctx, W, H) {
  const MM = config.MINIMAP;
  const lv = state.run?.current;
  const r = getMinimapRect(W, H);

  // Panel + clipping to keep drawing inside the panel (prevents fullscreen edge bleed)
  ctx.save();
  drawMinimapPanel(ctx, r);
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();

  if (!lv) {
    drawCenteredText(ctx, r, '— no data —');
    ctx.restore();
    return;
  }

  const sx = r.w / config.GRID_W;
  const sy = r.h / config.GRID_H;
  const icon = Math.max(3, r.w * MM.ICON_BASE);

  // world → minimap coords
  const toMini = (gx, gy) => ({
    x: Math.floor(r.x + gx * sx),
    y: Math.floor(r.y + gy * sy),
  });

  // Nodes (stations under, then planets, then gate on top)
  drawMinimapNodes(ctx, lv, toMini, icon);

  // Player dot
  if (lv.player) {
    const p = toMini(lv.player.gridX ?? lv.player.x ?? 0, lv.player.gridY ?? lv.player.y ?? 0);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2, icon * 0.9), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();
  }

  ctx.restore();
}

/** Bottom-left rect that never gets cut off, even in fullscreen. */
export function getMinimapRect(W, H) {
  const MM = config.MINIMAP;
  const shortSide = Math.min(W, H);
  const margin = clampInt(shortSide * MM.MARGIN_PCT, 10, 24);

  // Slightly narrower & shorter (per your request); clamp against screen size + margin
  let w = clampInt(W * MM.WIDTH_PCT, 200, W - 2 * margin);
  let h = clampInt(w * MM.ASPECT,   120, H - 2 * margin);

  // If height hit its clamp, recompute width to preserve aspect
  if (h < w * MM.ASPECT) {
    w = Math.min(w, Math.floor((H - 2 * margin) / MM.ASPECT));
  }

  // Bottom-left placement with a top clamp so it never runs off-screen
  const x = margin;
  const y = Math.max(H - h - margin, margin);

  return { x: Math.floor(x), y: Math.floor(y), w: Math.floor(w), h: Math.floor(h) };
}

function drawMinimapPanel(ctx, r) {
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Border
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  // Subtle inner grid (optional)
  const step = Math.max(16, Math.floor(r.w / 16));
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  for (let gx = r.x + step; gx < r.x + r.w; gx += step) {
    ctx.moveTo(gx + 0.5, r.y + 1);
    ctx.lineTo(gx + 0.5, r.y + r.h - 1);
  }
  for (let gy = r.y + step; gy < r.y + r.h; gy += step) {
    ctx.moveTo(r.x + 1, gy + 0.5);
    ctx.lineTo(r.x + r.w - 1, gy + 0.5);
  }
  ctx.stroke();
}

function drawMinimapNodes(ctx, lv, toMini, icon) {
  const MM = config.MINIMAP;
  const typeOf = (n) => n?.type ?? n?.kind;
  const nodes = Array.isArray(lv.nodes) ? lv.nodes : [];

  // Stations (squares)
  for (const n of nodes) {
    if (typeOf(n) !== 'station') continue;
    const { x, y } = toMini(n.gridX ?? n.x ?? 0, n.gridY ?? n.y ?? 0);
    const s = icon * MM.STATION_SCALE;
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(Math.floor(x - s / 2), Math.floor(y - s / 2), Math.floor(s), Math.floor(s));
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(Math.floor(x - s / 2), Math.floor(y - s / 2), Math.floor(s), Math.floor(s));
  }

  // Planets (shards) — only show if not collected
  for (const n of nodes) {
    if (typeOf(n) !== 'planet') continue;
    const collected = lv.shards?.has?.(n.id) || n.collected;
    if (collected) continue;
    const { x, y } = toMini(n.gridX ?? n.x ?? 0, n.gridY ?? n.y ?? 0);
    ctx.beginPath();
    ctx.arc(x, y, icon * MM.PLANET_SCALE, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();
  }

  // Gate (ring)
  for (const n of nodes) {
    if (typeOf(n) !== 'gate') continue;
    const { x, y } = toMini(n.gridX ?? n.x ?? 0, n.gridY ?? n.y ?? 0);
    ctx.lineWidth = Math.max(1, icon * MM.GATE_THICKNESS);
    ctx.strokeStyle = 'gold';
    ctx.beginPath();
    ctx.arc(x, y, icon * MM.GATE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCenteredText(ctx, r, text) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2));
}


function getArenaMiniRect(W, H) {
  const MM = config.MINIMAP;
  const margin = Math.floor(Math.min(W, H) * MM.MARGIN_PCT);
  const w = Math.floor(W * MM.WIDTH_PCT);
  const h = Math.floor(w * MM.ASPECT);
  return { x: margin, y: H - h - margin, w, h };
}

function drawArenaMinimapBottomLeft(ctx, W, H) {
  const A = state.arena;
  if (!A) return;
  const r = getArenaMiniRect(W, H);
  const size = config.ARENA_SIZE;

  // Panel
  ctx.save();
  roundedRectPath(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();

  // clip
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();

  const sx = r.w / size;
  const sy = r.h / size;
  const toMini = (gx, gy) => ({ x: Math.floor(r.x + gx * sx), y: Math.floor(r.y + gy * sy) });

  // Walls (segments)
  if (Array.isArray(A.walls)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(147,197,253,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const w of A.walls) {
      const a = toMini(w.x1, w.y1), b = toMini(w.x2, w.y2);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Cover (AABB)
  if (Array.isArray(A.cover)) {
    ctx.save();
    ctx.fillStyle = 'rgba(147,197,253,0.18)';
    ctx.strokeStyle = 'rgba(147,197,253,0.45)';
    for (const c of A.cover) {
      const x = toMini(c.x - c.w/2, c.y - c.h/2).x;
      const y = toMini(c.x - c.w/2, c.y - c.h/2).y;
      const ww = Math.max(1, Math.floor(c.w * sx));
      const hh = Math.max(1, Math.floor(c.h * sy));
      ctx.fillRect(x, y, ww, hh);
      ctx.strokeRect(x, y, ww, hh);
    }
    ctx.restore();
  }

  // Generators
  const gens = Array.isArray(A.generators) ? A.generators : (A.generator ? [A.generator] : []);
  ctx.save();
  for (const g of gens) {
    const p = toMini(g.x, g.y);
    const s = Math.max(3, Math.floor(r.w * 0.04));
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
  }
  ctx.restore();

  // Boss
  if (A.boss && A.boss.state !== 'dead') {
    const p = toMini(A.boss.x, A.boss.y);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, Math.floor(r.w * 0.03)), 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.restore();
  }

  // Exit gate
  if (A.exitGate) {
    const p = toMini(A.exitGate.x, A.exitGate.y);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, Math.floor(r.w * 0.03)), 0, Math.PI * 2);
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // Player
  if (A.player) {
    const p = toMini(A.player.x, A.player.y);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, Math.floor(r.w * 0.025)), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}


// ----------------------------- utils ---------------------------------
function msToClock(ms) {
  const t = Math.max(0, Math.floor(ms));
  const s = Math.floor(t / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const cs = Math.floor((t % 1000) / 10);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampInt(v, min, max) { return Math.floor(Math.max(min, Math.min(max, v))); }


function drawArenaObjectives(ctx, W, H, arena) {
  if (!arena) return;
  const pad = 16, h = 24;
  const text = [
    `Carry: ${arena.player?.shardsCarried ?? 0} / 2`,
    `Gen A: ${arena.generators?.[0]?.shardsDeposited ?? 0} / 2`,
    `Gen B: ${arena.generators?.[1]?.shardsDeposited ?? 0} / 2`,
    `${arena.boss?.shielded ? 'Shielded' : 'Vulnerable'}`
  ].join('   •   ');

  ctx.save();
  ctx.font = '600 14px Saira, sans-serif';
  const w = ctx.measureText(text).width + pad*2;
  const x = Math.max(12, (W - w) / 2);
  const y = H - h - 14;

  roundedRectPath(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + h/2);
  ctx.restore();
}