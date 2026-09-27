import { TRAP_RULES } from "./laserTraps.js";

// A literal {-} silhouette, rotated across the direction of travel.
function clampShape(ctx, radius) {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * radius * 0.58, -radius * 0.7);
    ctx.lineTo(side * radius * 0.88, -radius * 0.55);
    ctx.lineTo(side * radius * 0.88, -radius * 0.18);
    ctx.lineTo(side * radius, 0);
    ctx.lineTo(side * radius * 0.88, radius * 0.18);
    ctx.lineTo(side * radius * 0.88, radius * 0.55);
    ctx.lineTo(side * radius * 0.58, radius * 0.7);
  }
  ctx.moveTo(-radius * 0.45, 0);
  ctx.lineTo(radius * 0.45, 0);
  ctx.stroke();
}

export function drawLaserTraps(ctx, display, unit) {
  ctx.save();
  ctx.strokeStyle = "#f3bdff";
  ctx.shadowColor = "#dc6bff";
  ctx.shadowBlur = 12;
  ctx.lineWidth = Math.max(0.055, 1.7 / unit);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const trap of display.traps || []) {
    ctx.save();
    ctx.translate(trap.x, trap.y);
    ctx.rotate(trap.angle + Math.PI / 2);
    clampShape(ctx, 0.65);
    ctx.restore();
  }
  ctx.restore();
}

export function drawTrapLock(ctx, ship, unit) {
  if (ship.trapLock <= 0 || ship.hp <= 0) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.strokeStyle = "#f3bdff";
  ctx.shadowColor = "#dc6bff";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2 / unit;
  clampShape(ctx, 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ship.trapLock / TRAP_RULES.lockSeconds);
  ctx.stroke();
  ctx.restore();
}

export function updateTrapHud(display, ownId, roundEnded) {
  const own = display.ships[ownId];
  const playing = display.phase === "playing" && !roundEnded;
  const ready = own.trapCooldown === 0;
  const text = own.hp <= 0 ? "ELIMINATED" : !playing ? (roundEnded ? "ROUND OVER" : "WAIT FOR GO") :
    ready ? "READY" : `${own.trapCooldown.toFixed(1)}s`;
  document.getElementById("trap-state").textContent = text;
  const button = document.getElementById("trap-button");
  button.classList.toggle("cooling", !ready || !playing);
  button.setAttribute("aria-label", `Laser trap: ${text}`);
  document.getElementById("trap-meter").value = 1 - own.trapCooldown / TRAP_RULES.recharge;
  document.getElementById("trap-hud-state").textContent = own.trapLock > 0 && playing
    ? `LOCKED ${own.trapLock.toFixed(1)}s · FIRE BACK` : `{-} TRAP · ${text}`;
  document.getElementById("trap-hud").classList.toggle("locked", own.trapLock > 0 && playing);
  for (const ship of display.ships) {
    document.getElementById(`lock${ship.id}`).textContent = ship.trapLock > 0 && playing ? "LOCKED" : "";
  }
}
