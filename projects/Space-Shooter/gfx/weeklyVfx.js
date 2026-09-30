/** Weekly time-trial visuals: mines, sentries, shots, ghosts, stun and the speed warning. Never mutates simulation. */
import { drawCourier, drawExplosion } from './stardustVfx.js';
import { state } from '../state.js';
import { WEEKLY_RULES } from '../engine/weekly/layout.js';
import { WEEKLY_CONFIG } from '../engine/weekly/sim.js';

const TAU = Math.PI * 2;
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); }

export function drawWeeklyWorld(ctx, scene, unit, time, { ghosts = [], shipImg = null, reducedMotion = false } = {}) {
  if (!scene?.weekly) return;
  ctx.save();
  // Mines: a hot core, a spiked shell, a slow warning pulse.
  for (const m of scene.mines) {
    const x = m.x * unit, y = m.y * unit, r = m.radius * unit;
    const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 5 + m.x);
    ctx.save(); ctx.translate(x, y);
    // The halo is the kill radius (mine + ship), so what glows is what kills.
    // Hull physics: the ship's body touching the mine kills, so the halo is the mine itself.
    const kill = (m.radius + (scene.physics === 1 ? WEEKLY_CONFIG.PLAYER_RADIUS : 0.06)) * unit;
    ctx.fillStyle = `rgba(255,70,55,${0.10 + pulse * 0.12})`; circle(ctx, 0, 0, kill); ctx.fill();
    ctx.strokeStyle = '#ff7a66'; ctx.lineWidth = Math.max(1, unit * 0.035);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + time * 0.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.stroke(); }
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffd0c4'); g.addColorStop(0.35, '#ff4b3a'); g.addColorStop(1, '#5a0d0b');
    ctx.fillStyle = g; circle(ctx, 0, 0, r * 0.82); ctx.fill();
    ctx.fillStyle = `rgba(255,240,220,${0.5 + pulse * 0.5})`; circle(ctx, 0, 0, r * 0.18); ctx.fill();
    ctx.restore();
  }
  // Bouncer lanes: a faint track across the lane so the sweep reads before it arrives.
  for (const b of scene.hazards) {
    if (!b.bouncing || b.hp <= 0) continue;
    ctx.save(); ctx.strokeStyle = 'rgba(154,171,183,.16)'; ctx.lineWidth = b.radius * 2 * unit; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo((b.originX - b.nx * b.span) * unit, (b.originY - b.ny * b.span) * unit); ctx.lineTo((b.originX + b.nx * b.span) * unit, (b.originY + b.ny * b.span) * unit); ctx.stroke(); ctx.restore();
  }
  // Sentries: turret on the outside rail, its range, and its aim when locking on.
  for (const s of scene.sentries) {
    const x = s.x * unit, y = s.y * unit, r = s.radius * unit;
    const hot = s.state === 'telegraph' || s.slow;
    ctx.save();
    ctx.strokeStyle = hot ? 'rgba(255,110,80,.45)' : 'rgba(255,173,114,.12)';
    ctx.lineWidth = 1; ctx.setLineDash([6, 10]);
    circle(ctx, x, y, WEEKLY_RULES.SENTRY_RANGE * unit); ctx.stroke(); ctx.setLineDash([]);
    if (s.state === 'telegraph' && Number.isFinite(s.aimX)) {
      ctx.strokeStyle = 'rgba(255,120,72,.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(s.aimX * unit, s.aimY * unit); ctx.stroke(); ctx.setLineDash([]);
      circle(ctx, s.aimX * unit, s.aimY * unit, unit * 0.3); ctx.stroke();
    }
    ctx.translate(x, y);
    ctx.fillStyle = '#26313a'; ctx.strokeStyle = hot ? '#ff8a5c' : '#b1a293'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; const px = Math.cos(a) * r, py = Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(s.angle);
    ctx.fillStyle = hot ? '#ffb38a' : '#8b99a3'; ctx.fillRect(0, -r * 0.18, r * 1.35, r * 0.36);
    ctx.fillStyle = hot ? '#fff1a4' : '#ff9447'; circle(ctx, 0, 0, r * 0.3); ctx.fill();
    ctx.restore();
  }
  // Shots, interpolated between steps like the ship (scene.alpha).
  const a = scene.alpha ?? 1;
  const at = (s) => ({ x: s.prevX == null ? s.x : s.prevX + (s.x - s.prevX) * a, y: s.prevY == null ? s.y : s.prevY + (s.y - s.prevY) * a });
  for (const s of scene.enemyShots) {
    const q = at(s);
    ctx.save(); ctx.strokeStyle = '#ff8a3d'; ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 10; ctx.lineWidth = unit * 0.14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo((q.x - s.vx * 0.03) * unit, (q.y - s.vy * 0.03) * unit); ctx.lineTo(q.x * unit, q.y * unit); ctx.stroke(); ctx.restore();
  }
  for (const s of scene.playerShots) {
    const q = at(s);
    ctx.save(); ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10; circle(ctx, q.x * unit, q.y * unit, 0.15 * unit); ctx.fill(); ctx.restore();
  }
  // Ghosts: translucent ships with a name tag.
  for (const g of ghosts) {
    ctx.save(); ctx.globalAlpha = 0.34;
    drawCourier(ctx, { x: g.x, y: g.y, angle: g.angle, vx: 0, vy: 0, hp: 100, maxHp: 100 }, { paused: true }, {}, unit, shipImg, time, 0.66);
    ctx.globalAlpha = 0.8; ctx.fillStyle = g.color; ctx.font = `${Math.max(10, unit * 0.32)}px Consolas, monospace`; ctx.textAlign = 'center';
    const turn = state.gfx?.camera?.viewRot || 0;
    ctx.translate(g.x * unit, g.y * unit); ctx.rotate(-turn);
    ctx.fillText(g.label, 0, -0.9 * unit);
    ctx.restore();
  }
  // Stun: a flickering ring around the ship.
  const p = scene.viewPlayer || scene.player;
  if (p?.stunTimer > 0) {
    ctx.save(); ctx.strokeStyle = `rgba(255,214,120,${0.5 + 0.4 * Math.sin(time * 40) ** 2})`; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    circle(ctx, p.x * unit, p.y * unit, unit * 0.75); ctx.stroke(); ctx.restore();
  }
  if (scene.wreck) drawExplosion(ctx, scene.wreck.x * unit, scene.wreck.y * unit, unit, scene.wreck.t, 0.75, reducedMotion);
  ctx.restore();
}

/** Screen-space: speed, and a warning when a sentry has you in range and you're slow. */
export function drawWeeklyHud(ctx, W, H, scene) {
  if (!scene?.weekly || scene.lockedInStart || scene.completed) return;
  const p = scene.player;
  const speed = Math.hypot(p.vx, p.vy);
  const engaged = scene.sentries.some((s) => s.engaged);
  const danger = scene.sentries.some((s) => s.slow || s.state === 'telegraph');
  // Below the HUD's top bar; the speed itself is on the speed gauge.
  const y = H < 500 ? 96 : 118;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '12px Consolas, monospace';
  ctx.fillStyle = engaged ? (danger ? '#ff8a5c' : '#ffd39a') : 'rgba(200,225,235,.75)';
  const floor = WEEKLY_RULES.SENTRY_MIN_SPEED;
  if (engaged) ctx.fillText(`SENTRY RANGE · KEEP ${floor.toFixed(1)}+ (NOW ${speed.toFixed(1)})`, W / 2, y);
  if (danger) {
    ctx.font = 'bold 18px Saira, sans-serif';
    ctx.fillStyle = '#ff7a5c'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText('SENTRY LOCK — SPEED UP', W / 2, y + 24);
  }
  if (p.stunTimer > 0) {
    ctx.font = 'bold 16px Saira, sans-serif';
    ctx.fillStyle = '#ffd678'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText('STUNNED', W / 2, H / 2 + 64);
  }
  ctx.restore();
}
