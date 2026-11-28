// The page side of real-time stealth: runs rules/stealth.js for a map that has a `stealth` block, and draws it on the walk canvas:
//   cones on the floor (clipped by walls and props), a meter over every guard you can see, a ring showing how far your steps carry,
//   the guards themselves (hidden when they stand in the fog), the fog of war (what you cannot see now is dark; what you saw is dim),
//   and a small readout (gait, who is watching) with the keys.
// world.js owns the loop; it calls moveOf, step, interacts, takedown, drawFloor, guardBodies, drawOver, drawFog and destroy.
// Nothing here runs unless the map has a stealth block (only the workbench yard does).
import { createStealth, liveTuning, viewPolygon, STEALTH } from './rules/stealth.js';
import { drawBody } from './draw.js';
import { sprite, playerArt } from './assets.js';
import { createEl } from './dom.js';

const GAIT_WORD = { sneak: 'SNEAK', walk: 'WALK', run: 'RUN' };
const CONE = { patrol: [255, 226, 120], look: [255, 196, 90], inspect: [255, 150, 60], return: [255, 226, 120], alert: [255, 70, 56] };
const GUARD_LIFT = 'brightness(2.1) saturate(2.2) contrast(1.1)';

export function createStealthLayer({ map, root, setup = null, def = null, reducedMotion = () => false, touch = false, onEvent = () => {} }) {
  const tuning = liveTuning(setup || {});
  const sim = createStealth({ map, def: def || map.def?.stealth, tuning, seed: 7 }); // opening B: `def` lets a scene run stealth in a room that has no stealth block
  const T = map.tile;
  // ---- the readout ----
  const hud = createEl('div', { class: 'of-stealth', role: 'status', 'aria-live': 'polite' });
  const gaitPill = createEl('b', { class: 'of-st-gait', text: 'WALK' });
  const statePill = createEl('b', { class: 'of-st-state', text: 'HIDDEN' });
  const help = createEl('p', { class: 'of-st-help', text: touch ? 'Stick: gentle sneaks, full runs. Use takes a guard from behind.' : 'Ctrl sneaks · Shift runs · E takes a guard down from behind' });
  hud.append(createEl('div', { class: 'of-st-row' }, createEl('span', { class: 'of-st-title', text: 'STEALTH' }), gaitPill, statePill), help);
  root.append(hud);

  let gait = 'walk', lockT = 0, bursts = [], fogCanvas = null, fogCtx = null, mem = null, memCtx = null, memScale = 1 / 4, flash = 0;
  const cache = new Map(); // guard id -> cone polygon this frame

  /** Stealth walking: your gait sets the speed (the stick's strength picks it on a phone) and a takedown holds you a moment. */
  function moveOf(mv, wantGait = 'walk') {
    gait = STEALTH.speed[wantGait] ? wantGait : 'walk';
    const mag = Math.hypot(mv.x, mv.y);
    if (lockT > 0 || mag < 0.05) return { mv: { x: 0, y: 0 }, opts: { speed: STEALTH.speed[gait] } };
    return { mv: { x: mv.x / mag, y: mv.y / mag }, opts: { speed: STEALTH.speed[gait] } };
  }

  function step(dt, walker) {
    lockT = Math.max(0, lockT - dt);
    flash = Math.max(0, flash - dt);
    for (const b of bursts) b.life -= dt;
    bursts = bursts.filter((b) => b.life > 0);
    const events = sim.step(dt, { x: walker.x, y: walker.y, gait, moving: Boolean(walker.moving) });
    for (const e of events) {
      if (e.type === 'takedown') bursts.push({ x: e.at.x, y: e.at.y, life: 0.5, kind: 'takedown' });
      if (e.type === 'alarm') flash = 0.5;
      if (e.type === 'heard') bursts.push({ x: e.at.x, y: e.at.y, life: 0.7, kind: 'noise' });
      onEvent(e);
    }
    paintHud();
    return events;
  }

  function paintHud() {
    if (gaitPill.textContent !== GAIT_WORD[gait]) { gaitPill.textContent = GAIT_WORD[gait]; gaitPill.dataset.gait = gait; }
    const watching = sim.guards.some((g) => g.seen);
    const word = sim.alarm.on ? 'ALARM' : sim.guards.some((g) => g.state === 'inspect') ? 'SUSPICIOUS' : watching ? 'SEEN' : 'HIDDEN';
    if (statePill.textContent !== word) { statePill.textContent = word; statePill.dataset.state = word.toLowerCase(); }
  }

  const interacts = (walker) => {
    const g = lockT > 0 ? null : sim.canTakedown({ x: walker.x, y: walker.y });
    return g ? [{ kind: 'takedown', id: g.id, label: 'Silent takedown', x: g.x, y: g.y, reach: 64 }] : [];
  };
  function takedown(id, walker) {
    const ok = sim.takedown(id, { x: walker.x, y: walker.y });
    if (ok) { lockT = STEALTH.takedownLock; const g = sim.guards.find((x) => x.id === id); walker.angle = Math.atan2(g.y - walker.y, g.x - walker.x); }
    return ok;
  }

  // ---- drawing (world space unless it says screen) ----
  function conePoly(g) {
    const c = sim.coneOf(g);
    return viewPolygon(map.solids, g.x, g.y, { angle: g.angle, half: c.half, radius: c.len, step: 0.04 });
  }
  /** Under the bodies: the cones, and your noise ring. */
  function drawFloor(ctx, t) {
    cache.clear();
    const vision = sim.vision();
    for (const g of sim.guards) {
      if (g.state === 'down') continue;
      const poly = conePoly(g);
      cache.set(g.id, poly);
      if (poly.length < 3) continue;
      const seen = sim.isVisible(g.x, g.y);
      const [r, gr, b] = CONE[g.state] || CONE.patrol, c = sim.coneOf(g);
      ctx.save();
      if (!seen && vision.length) { ctx.beginPath(); vision.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.clip(); }
      const k = 1 + Math.min(1, g.meter / STEALTH.alertAt) * 0.7;
      const grad = ctx.createRadialGradient(g.x, g.y, 6, g.x, g.y, c.len);
      grad.addColorStop(0, `rgba(${r},${gr},${b},${Math.min(0.6, 0.34 * k)})`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},${Math.min(0.28, 0.07 * k)})`);
      ctx.fillStyle = grad;
      ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${r},${gr},${b},${0.5 * Math.min(1.4, k)})`; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    // How far your steps carry right now.
    const p = sim.player;
    if (p?.moving) {
      const rad = tuning.noise[gait] * T;
      const pulse = reducedMotion() ? 1 : 0.85 + Math.sin(t * 9) * 0.15;
      ctx.save();
      ctx.strokeStyle = gait === 'run' ? 'rgba(255,140,90,0.75)' : 'rgba(129,230,223,0.55)';
      ctx.lineWidth = 1.8; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(p.x, p.y, rad * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /** The guards as drawable bodies for world.js's depth sort (hidden in the fog; a downed guard lies where it fell). */
  function guardBodies(ctx, t) {
    const img = sprite('marauder-grunt-a');
    const size = 46 * playerArt().scale;
    const out = [];
    for (const g of sim.guards) {
      if (!sim.isVisible(g.x, g.y) && g.state !== 'down') continue;
      if (g.state === 'down' && !sim.isVisible(g.x, g.y)) continue;
      out.push({
        y: g.y,
        draw: () => {
          if (g.state === 'down') { ctx.save(); ctx.globalAlpha = 0.8; drawBody(ctx, g.x, g.y, g.angle + Math.PI / 2, img, { size: size * 0.95, lift: 'brightness(0.9) saturate(0.6)', t }); ctx.restore(); return; }
          drawBody(ctx, g.x, g.y, g.angle, img, { size, lift: GUARD_LIFT, t: t + g.phase, moving: g.route.length > 0 || g.state === 'patrol', stride: (t * 2.2 + g.phase) % 4, tint: '#ffad72' });
        },
      });
    }
    return out;
  }

  /** Over the bodies: each visible guard's meter, a ? or !, and short bursts (a heard step, a takedown). */
  function drawOver(ctx, t) {
    for (const g of sim.guards) {
      if (!sim.isVisible(g.x, g.y)) continue;
      const x = g.x, y = g.y - 36;
      if (g.state === 'down') { ctx.font = '700 11px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fe870'; ctx.fillText('DOWN', g.x, g.y - 24); continue; }
      const f = Math.min(1, g.meter / STEALTH.alertAt);
      const showBar = g.meter > 0.02 || g.state === 'alert';
      if (showBar) {
        const w = 44, h = 7, x0 = x - w / 2;
        ctx.fillStyle = 'rgba(7,13,23,0.85)'; ctx.fillRect(x0 - 1.5, y - 1.5, w + 3, h + 3);
        ctx.fillStyle = g.state === 'alert' || f >= 1 ? '#ff4638' : g.meter >= STEALTH.inspectAt - 1e-6 ? '#ff9a3c' : '#ffe27a';
        ctx.fillRect(x0, y, w * f, h);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x0 + w * (STEALTH.inspectAt / STEALTH.alertAt) - 0.5, y - 2, 1.5, h + 4); // the 1.5 s line
      }
      const mark = g.state === 'alert' ? '!' : g.state === 'inspect' || g.reason === 'body' ? '?' : g.state === 'look' ? '·' : '';
      if (mark) { ctx.font = '800 17px Consolas, monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#070d17'; ctx.strokeText(mark, x, y - 6); ctx.fillStyle = g.state === 'alert' ? '#ff4638' : '#ffd166'; ctx.fillText(mark, x, y - 6); }
    }
    for (const b of bursts) {
      const a = Math.max(0, b.life / (b.kind === 'takedown' ? 0.5 : 0.7));
      ctx.save(); ctx.globalAlpha = a;
      if (b.kind === 'takedown') { ctx.strokeStyle = '#9fe870'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, 14 + (1 - a) * 26, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#eaffd6'; ctx.font = '800 12px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText('SILENT', b.x, b.y - 44 - (1 - a) * 10); }
      else { ctx.strokeStyle = '#ffad72'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 10 + (1 - a) * 34, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }

  /**
   * The fog of war, in screen space after everything else: dark where you cannot see now, dim where you have been, clear in your sight.
   * `cam` is the camera ({ x, y, zoom }), `view` { w, h, dpr } in CSS px.
   */
  function drawFog(ctx, cam, view) {
    const vision = sim.vision();
    if (!vision.length) return;
    const W = Math.max(1, Math.round(view.w * view.dpr * 0.5)), H = Math.max(1, Math.round(view.h * view.dpr * 0.5));
    if (!fogCanvas) { fogCanvas = document.createElement('canvas'); fogCtx = fogCanvas.getContext('2d'); mem = document.createElement('canvas'); mem.width = Math.ceil(map.w * memScale); mem.height = Math.ceil(map.h * memScale); memCtx = mem.getContext('2d'); }
    if (fogCanvas.width !== W || fogCanvas.height !== H) { fogCanvas.width = W; fogCanvas.height = H; }
    // Remember what you have seen (the room as a small mask).
    memCtx.fillStyle = '#fff'; memCtx.beginPath(); vision.forEach((p, i) => (i ? memCtx.lineTo(p.x * memScale, p.y * memScale) : memCtx.moveTo(p.x * memScale, p.y * memScale))); memCtx.closePath(); memCtx.fill();
    const s = cam.zoom * view.dpr * 0.5; // world px -> fog canvas px
    const f = fogCtx;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over'; f.filter = 'none';
    f.clearRect(0, 0, W, H);
    f.fillStyle = 'rgba(2,5,10,0.93)'; f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = 'destination-out';
    // Where you have been: lifted to a dim.
    f.globalAlpha = 0.52; f.imageSmoothingEnabled = true; f.imageSmoothingQuality = 'high';
    try { f.filter = `blur(${Math.max(2, Math.round(9 * view.dpr * 0.5))}px)`; } catch { /* no filter support */ }
    f.drawImage(mem, 0, 0, mem.width, mem.height, -cam.x * s, -cam.y * s, map.w * s, map.h * s);
    f.filter = 'none'; f.globalAlpha = 1;
    // What you can see now: clear, with a soft edge.
    f.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
    try { f.filter = `blur(${Math.max(2, Math.round(7 * view.dpr * 0.5))}px)`; } catch { /* no filter support: a hard edge */ }
    f.fillStyle = '#000'; f.beginPath(); vision.forEach((p, i) => (i ? f.lineTo(p.x, p.y) : f.moveTo(p.x, p.y))); f.closePath(); f.fill();
    f.filter = 'none'; f.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCanvas, 0, 0, W, H, 0, 0, ctx.canvas.width, ctx.canvas.height);
    if (sim.alarm.on || flash > 0) {
      // A pulsing red edge only: the middle of the screen stays clear so the floor is readable.
      const cw = ctx.canvas.width, ch = ctx.canvas.height, pulse = reducedMotion() ? 0.8 : 0.65 + Math.sin(sim.time * 5) * 0.35;
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.42, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
      g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, `rgba(255,40,30,${0.5 * pulse})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
    ctx.restore();
  }

  return {
    sim, moveOf, step, interacts, takedown, drawFloor, guardBodies, drawOver, drawFog,
    get gait() { return gait; },
    get locked() { return lockT > 0; },
    stats: () => ({ ...sim.stats }),
    reset() { sim.reset(); lockT = 0; bursts = []; mem?.getContext('2d').clearRect(0, 0, mem.width, mem.height); },
    destroy() { hud.remove(); },
  };
}
