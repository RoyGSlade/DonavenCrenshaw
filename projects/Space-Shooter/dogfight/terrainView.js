import { MAPS, displayObstacles, ventPhase } from "./maps.js";

const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };
const label = (c, text, x, y, color = "#96b3bc") => {
  c.fillStyle = color; c.font = "0.32px monospace"; c.textAlign = "center"; c.fillText(text, x, y);
};
function poly(c, points) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
}

/** Same renderer powers the live arena and map-picker thumbnails. World units only. */
export function drawTerrain(c, arena, state, { rockImage, reducedMotion = false, thumbnail = false } = {}) {
  const map = MAPS[arena.mapId], elapsed = state ? 180 - state.remaining : 0;
  const motion = reducedMotion ? 0 : elapsed;
  c.save();
  c.beginPath(); c.rect(0, 0, 40, 24); c.clip();
  const wash = c.createRadialGradient(20, 12, 1, 20, 12, 24);
  wash.addColorStop(0, map.background); wash.addColorStop(1, "#070f1b");
  c.fillStyle = wash; c.fillRect(0, 0, 40, 24);
  c.strokeStyle = `${map.color}0d`; c.lineWidth = 0.025;
  for (let x = 0; x <= 40; x += 2) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 24); c.stroke(); }
  for (let y = 0; y <= 24; y += 2) { c.beginPath(); c.moveTo(0, y); c.lineTo(40, y); c.stroke(); }
  for (let i = 0; i < 130; i++) {
    c.fillStyle = i % 4 ? "#cadfff44" : "#ffffff88";
    circle(c, (i * 17.31 + 2) % 40, (i * 7.23 + 1) % 24, i % 4 ? 0.018 : 0.035); c.fill();
  }
  for (const f of arena.fields) {
    if (f.type === "gravity") {
      const glow = c.createRadialGradient(f.x, f.y, 0.5, f.x, f.y, f.radius);
      glow.addColorStop(0, "#a887ff55"); glow.addColorStop(1, "#a887ff03");
      c.fillStyle = glow; circle(c, f.x, f.y, f.radius); c.fill();
      c.strokeStyle = "#c6a8ff66"; c.lineWidth = 0.04; c.setLineDash([0.2, 0.22]);
      circle(c, f.x, f.y, f.radius); c.stroke(); c.setLineDash([]);
      for (let arm = 0; arm < 3; arm++) {
        c.beginPath(); c.strokeStyle = "#b791ef70"; c.lineWidth = 0.06;
        for (let j = 0; j <= 65; j++) {
          const r = 1.2 + j / 65 * 3.6, a = arm * Math.PI * 2 / 3 + j / 18 + motion * 0.3;
          const x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
          if (j) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.stroke();
      }
      if (!thumbnail) label(c, "GRAVITY WELL", f.x, f.y + f.radius + 0.5, "#c9abff");
    } else {
      c.fillStyle = "#ffc46c13"; c.fillRect(f.x, f.y, f.width, f.height);
      c.strokeStyle = "#ffd28c77"; c.lineWidth = 0.055; c.setLineDash([0.45, 0.3]);
      c.strokeRect(f.x, f.y, f.width, f.height); c.setLineDash([]);
      for (let x = 0; x < 27; x += 3) {
        const px = f.x + 1.5 + (x + motion * 2 % 3) * (f.direction > 0 ? 1 : -1) + (f.direction < 0 ? 27 : 0);
        c.strokeStyle = "#ffd59699"; c.lineWidth = 0.09;
        c.beginPath(); c.moveTo(px - f.direction * 0.4, f.y + 0.6);
        c.lineTo(px + f.direction * 0.3, f.y + f.height / 2); c.lineTo(px - f.direction * 0.4, f.y + f.height - 0.6); c.stroke();
      }
      if (!thumbnail) label(c, "BOOST STREAM", f.direction > 0 ? 12 : 28, f.y + f.height + 0.5, "#ffd08a");
    }
  }
  const phase = ventPhase(elapsed);
  for (const vent of arena.vents) {
    c.fillStyle = phase === "live" ? "#ff875099" : phase === "warning" ? "#ffb94944" : "#091217";
    c.fillRect(vent.x, vent.y, vent.width, vent.height);
    c.strokeStyle = phase === "safe" ? "#97764d" : "#ffce82"; c.lineWidth = phase === "live" ? 0.16 : 0.07;
    c.strokeRect(vent.x, vent.y, vent.width, vent.height);
    for (let y = vent.y + 0.3; y < vent.y + vent.height; y += 0.6) {
      c.beginPath(); c.moveTo(vent.x + 0.2, y); c.lineTo(vent.x + vent.width - 0.2, y); c.stroke();
    }
    if (phase === "live") {
      c.strokeStyle = "#fff3cf"; c.lineWidth = 0.2;
      c.beginPath(); c.moveTo(20, vent.y); c.lineTo(20, vent.y + vent.height); c.stroke();
    }
    if (!thumbnail) {
      c.fillStyle = "#15140fef"; c.fillRect(18.25, vent.y + vent.height / 2 - 0.4, 3.5, 0.6);
      label(c, phase === "live" ? "LIVE / DANGER" : phase === "warning" ? "!! CHARGING !!" : "VENT / SAFE", 20, vent.y + vent.height / 2, phase === "safe" ? "#dac5a5" : "#fff2d0");
    }
  }
  for (let i = 0; i < arena.gates.length; i++) {
    const g = arena.gates[i];
    c.fillStyle = "#161c45"; circle(c, g.x, g.y, 1.3); c.fill();
    c.strokeStyle = "#c9abff"; c.lineWidth = 0.14; c.stroke();
    c.strokeStyle = "#eee1ff88"; c.lineWidth = 0.06; circle(c, g.x, g.y, 0.85); c.stroke();
    c.save(); c.translate(g.x, g.y); c.rotate(motion * 0.8);
    for (let j = 0; j < 4; j++) { c.rotate(Math.PI / 2); c.fillStyle = "#e5d2ff"; c.fillRect(1.2, -0.15, 0.35, 0.3); }
    c.restore();
    if (!thumbnail) label(c, `JUMP ${i ? "B → A" : "A → B"}`, g.x, g.y + 2, "#dac4ff");
  }
  for (const o of displayObstacles(arena, state)) {
    c.save(); c.translate(o.x, o.y);
    const r = o.radius;
    if (o.type === "crystal") {
      const vertices = [[-r, 0.15], [-r * 0.55, -r * 0.75], [r * 0.18, -r], [r * 0.92, -r * 0.25], [r * 0.65, r * 0.75], [-r * 0.28, r]];
      poly(c, vertices); c.fillStyle = "#23555b"; c.fill(); c.strokeStyle = "#b5ffe7"; c.lineWidth = 0.07; c.stroke();
      poly(c, [vertices[0], vertices[2], [r * 0.18, r * 0.22]]); c.fillStyle = "#8effcc88"; c.fill();
      poly(c, [vertices[2], vertices[4], [r * 0.18, r * 0.22]]); c.fillStyle = "#95edc433"; c.fill();
      c.strokeStyle = "#d0fff3"; c.lineWidth = 0.04;
      if (o.hp < o.maxHp) { c.beginPath(); c.moveTo(-r * 0.6, -r * 0.4); c.lineTo(r * 0.3, r * 0.2); c.lineTo(-r * 0.2, r * 0.7); c.stroke(); }
      for (let i = 0; i < 3; i++) { c.fillStyle = o.hp > i * o.maxHp / 3 ? "#9effd9" : "#193c40"; c.fillRect(-0.3 + i * 0.23, r + 0.18, 0.17, 0.08); }
    } else if (o.type === "fuel") {
      c.strokeStyle = "#ffbc6888"; c.lineWidth = 0.035; c.setLineDash([0.08, 0.2]); circle(c, 0, 0, 3.4); c.stroke(); c.setLineDash([]);
      c.fillStyle = "#3e291d"; circle(c, 0, 0, r); c.fill(); c.strokeStyle = "#ffd894"; c.lineWidth = 0.09; c.stroke();
      c.fillStyle = o.hp < o.maxHp ? "#ff7059" : "#ffc778";
      poly(c, [[0, -0.4], [0.37, 0.3], [-0.37, 0.3]]); c.fill();
      c.fillStyle = "#492411"; c.fillRect(-0.035, -0.18, 0.07, 0.23);
      if (!thumbnail) label(c, "FUEL", 0, r + 0.55, "#ffd5a0");
    } else if (o.type === "core") {
      c.strokeStyle = "#ebc0ff"; c.lineWidth = 0.18; circle(c, 0, 0, r); c.stroke();
      c.fillStyle = "#060510"; c.fill(); circle(c, 0, 0, 1.9); c.strokeStyle = "#f095ec55"; c.lineWidth = 0.03; c.stroke();
    } else if (o.type === "wreck") {
      poly(c, [[-r, 0], [-r * 0.65, -r * 0.75], [r * 0.7, -r * 0.7], [r, 0], [r * 0.6, r * 0.76], [-r * 0.65, r * 0.75]]);
      c.fillStyle = "#323632"; c.fill(); c.strokeStyle = "#9b9580"; c.lineWidth = 0.05; c.stroke();
      c.strokeStyle = "#535f58"; c.strokeRect(-0.55, -0.45, 1.1, 0.9);
      c.fillStyle = "#e7b868"; c.fillRect(-0.6, -0.82, 0.45, 0.09);
      c.fillStyle = "#a5ad9b"; circle(c, -0.65, 0.25, 0.055); c.fill(); circle(c, 0.65, -0.2, 0.055); c.fill();
    } else {
      c.rotate(o.id * 1.9);
      if (rockImage?.complete && rockImage.naturalWidth) c.drawImage(rockImage, -r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
      else { poly(c, [[-r, 0], [-r * 0.6, -r * 0.8], [r * 0.2, -r], [r, -r * 0.1], [r * 0.6, r * 0.8], [-r * 0.5, r * 0.7]]); c.fillStyle = "#48595b"; c.fill(); c.strokeStyle = "#7e9996"; c.lineWidth = 0.06; c.stroke(); }
    }
    c.restore();
  }
  for (const b of state?.terrain?.bursts || []) {
    const progress = 1 - b.life / 0.7;
    c.globalAlpha = b.life / 0.7; c.strokeStyle = "#ffcc8b"; c.lineWidth = 0.14;
    circle(c, b.x, b.y, reducedMotion ? 3.4 : 0.6 + progress * 2.8); c.stroke();
    c.fillStyle = "#ffae6633"; c.fill(); c.globalAlpha = 1;
  }
  if (thumbnail) {
    for (const [x, color, direction] of [[6, "#81e6df", 1], [34, "#ffad72", -1]]) {
      c.fillStyle = color; poly(c, [[x + direction * 0.7, 12], [x - direction * 0.5, 11.55], [x - direction * 0.5, 12.45]]); c.fill();
    }
  }
  c.restore(); c.strokeStyle = `${map.color}66`; c.lineWidth = 0.04; c.strokeRect(0, 0, 40, 24);
}
