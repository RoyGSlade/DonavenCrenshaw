// The hangar bay behind the Voyage menu (S13: a menu with a scene behind it).
// Straight top-down like the ships: a landing pad, deck plating, guide lights
// and the equipped ship nose-up on the pad. Drawn on one canvas; it only
// animates the lights, and not at all with reduced motion.
import { renderDpr, readRenderScale } from './renderScale.js';

const TAU = Math.PI * 2;

export function createHangarScene(canvas, { reducedMotion = () => false } = {}) {
  const ctx = canvas.getContext('2d');
  let ship = null; // an image or canvas
  let shipScale = 1; // tier art carries more margin than a garage picture
  let tier = 0;
  let frame = 0;
  let dpr = 1;
  let visible = true;

  function size() {
    dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }

  // Where the pad sits: right of the menu on wide screens, above it on narrow ones.
  function pad() {
    const w = innerWidth, h = innerHeight;
    if (w > 700) {
      const left = Math.min(580, w * 0.5);
      return { x: left + (w - left) / 2, y: h * 0.52, r: Math.min((w - left) * 0.36, h * 0.36) };
    }
    return { x: w / 2, y: h * 0.2, r: Math.min(w * 0.34, h * 0.16) };
  }

  function draw(t) {
    const w = innerWidth, h = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070d17';
    ctx.fillRect(0, 0, w, h);
    // Deck plating.
    ctx.strokeStyle = '#13243299';
    ctx.lineWidth = 1;
    const cell = 64;
    for (let x = (w / 2) % cell; x < w; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = (h / 2) % cell; y < h; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const p = pad();
    // Bay floor glow.
    const glow = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r * 2.2);
    glow.addColorStop(0, '#16304088');
    glow.addColorStop(1, '#070d1700');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Pad: hazard ring, inner disc, guide lights.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#0c1724';
    ctx.beginPath(); ctx.arc(0, 0, p.r * 1.12, 0, TAU); ctx.fill();
    const stripes = 36;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#2a221a' : '#a3713f55';
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 1.12, (i / stripes) * TAU, ((i + 1) / stripes) * TAU);
      ctx.arc(0, 0, p.r * 1.03, ((i + 1) / stripes) * TAU, (i / stripes) * TAU, true);
      ctx.fill();
    }
    ctx.strokeStyle = '#81e6df33';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.8, 0, TAU); ctx.stroke();
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.55, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    const lights = 12;
    for (let i = 0; i < lights; i++) {
      const a = (i / lights) * TAU - Math.PI / 2;
      const on = reducedMotion() ? 0.8 : 0.35 + 0.65 * Math.max(0, Math.sin(t / 600 - i * 0.5));
      ctx.fillStyle = `rgba(129,230,223,${on.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * p.r * 0.95, Math.sin(a) * p.r * 0.95, 3, 0, TAU); ctx.fill();
    }
    // Upgrade tier: amber marks at the top of the pad.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < tier ? '#ffad72' : '#ffad7222';
      ctx.fillRect(-30 + i * 22, -p.r * 1.24, 16, 5);
    }
    // The ship, nose up.
    if (ship) {
      const s = p.r * 1.45 * shipScale;
      ctx.shadowColor = '#000c';
      ctx.shadowBlur = 24;
      ctx.drawImage(ship, -s / 2, -s / 2, s, s);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function loop(t) {
    frame = 0;
    draw(t);
    if (!reducedMotion() && visible) frame = requestAnimationFrame(loop);
  }
  function start() { if (!frame) frame = requestAnimationFrame(loop); }

  size();
  addEventListener('resize', () => { size(); draw(performance.now()); });
  addEventListener('stardust:render-scale', () => { size(); draw(performance.now()); });
  document.addEventListener('visibilitychange', () => { visible = document.visibilityState === 'visible'; if (visible) start(); });
  start();
  return {
    setShip(image, scale = 1) { ship = image; shipScale = scale; draw(performance.now()); start(); },
    get ship() { return ship; },
    setTier(n) { tier = n; draw(performance.now()); },
    get dpr() { return dpr; },
  };
}
