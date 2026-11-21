// The stage: what the world shows on top of the map during a talk or a staged scene (opening B lane, 2026-11-19).
// Nothing here knows the quest rules. world.js owns one stage, steps it and draws it; slice/ drives it with a timeline.
//   - speech bubbles over a body (barks, "Hey, I'm not done") and a ring on whoever is talking to you
//   - an approach's hint ring on its target, and the use-key capture while it runs
//   - actors (the Reavers): bodies that are not people of the map, walk a path, fire, duck, leave
//   - effects: the torch seam crawling round a hatch, sparks, flashes, bullet traces, smoke, scorch decals, the blown hatch
//   - screen: a red alarm pulse, a white flash, a banner strip, and an "airlock cam" inset
//   - the camera target (pan to what matters, then back) and a shake request
// The caller passes `where(id)` -> { x, y, scale } | null (an npc, or an actor) so the stage never reaches into world state.
import { rr, drawBody } from './draw.js';
import { sprite, playerArt } from './assets.js';

export const BUBBLE = Object.freeze({ maxChars: 70, lineMs: 2600, perChar: 38 });
/** How long a bubble stays: a floor plus reading time, so a long line is not gone before it is read. */
export const bubbleMs = (text) => Math.max(BUBBLE.lineMs, 1100 + BUBBLE.perChar * String(text || '').length);

const TAU = Math.PI * 2;

export function createStage({ reducedMotion = () => false } = {}) {
  const bubbles = []; // { id, text, until, born }
  let clock = 0;
  let talking = null;
  let marked = null; // an approach's hint: { x, y, label } ringed on the floor
  let captured = false; // an approach is running: the use key is for working, not for starting a talk
  const actors = new Map(); // id -> { id, x, y, angle, art, speed, path, moving, hit, alive, down, hidden, scale }
  let fx = []; // { kind, ... , born, life }
  const decals = []; // lasting marks on the floor: { kind, ... }
  let camTarget = null; // { x, y } the camera looks at instead of the player, or null
  let shakeReq = 0;
  const screen = { pulse: null, flash: null, banner: null, inset: null }; // pulse { color, hz, until|null }, flash { until, life, color }, banner { text, until }, inset { until|null, born, p }
  const hatch = { rect: null, p: 0, blown: false, blownAt: 0 }; // the door being cut: { x, y, w, h }

  /** A bubble over a body. A newer bubble over the same body replaces the older one. */
  function bark(id, text, ms = null) {
    const words = String(text || '').trim();
    if (!id || !words) return false;
    const i = bubbles.findIndex((b) => b.id === id);
    if (i >= 0) bubbles.splice(i, 1);
    bubbles.push({ id, text: words, born: clock, until: clock + (ms ?? bubbleMs(words)) / 1000 });
    return true;
  }

  // ---- actors ----
  function spawn(id, { x, y, angle = 0, art = 'marauder-grunt-a', speed = 95, scale = 1 } = {}) {
    actors.set(id, { id, x, y, angle, art, speed, scale, path: [], moving: false, hit: 0, alive: true, down: false, hidden: false, phase: actors.size * 1.7 });
    return actors.get(id);
  }
  /** Walk an actor along points [{x, y}]; it faces the way it goes. */
  function walk(id, points, speed = null) {
    const a = actors.get(id);
    if (!a) return false;
    a.path = points.map((p) => ({ x: p.x, y: p.y }));
    if (speed) a.speed = speed;
    return true;
  }
  const face = (id, angle) => { const a = actors.get(id); if (a) a.angle = angle; };
  const remove = (id) => { actors.delete(id); };
  const actorAt = (id) => { const a = actors.get(id); return a && !a.hidden ? { x: a.x, y: a.y, scale: a.scale } : null; };

  // ---- effects ----
  /** A burst of sparks at a point (a torch, a hit). */
  function sparks(x, y, { count = 14, life = 0.55, color = '#ffb347', speed = 150 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, v = speed * (0.35 + Math.random() * 0.65);
      fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, born: clock, life: life * (0.6 + Math.random() * 0.6), color });
    }
  }
  /** A bullet trace from a point to a point that takes `ms` to arrive. */
  function bolt(x0, y0, x1, y1, { ms = 140, color = '#ffb27a' } = {}) { fx.push({ kind: 'bolt', x0, y0, x1, y1, born: clock, life: ms / 1000, color }); fx.push({ kind: 'flash', x: x0, y: y0, born: clock, life: 0.08, r: 9, color: '#fff3d4' }); }
  const flashAt = (x, y, { r = 18, life = 0.18, color = '#ffe9c4' } = {}) => fx.push({ kind: 'flash', x, y, born: clock, life, r, color });
  const smoke = (x, y, { count = 8, life = 1.6 } = {}) => { for (let i = 0; i < count; i++) fx.push({ kind: 'smoke', x: x + (Math.random() - 0.5) * 22, y: y + (Math.random() - 0.5) * 22, vx: (Math.random() - 0.5) * 14, vy: -10 - Math.random() * 16, born: clock + i * 0.05, life: life * (0.7 + Math.random() * 0.6) }); };
  /** A hit on a body: a red flash, a number-less spark burst. */
  const hurtAt = (x, y) => { flashAt(x, y, { r: 20, life: 0.22, color: '#ff6b5a' }); sparks(x, y, { count: 7, color: '#ff8f80', life: 0.35, speed: 110 }); };
  const decal = (d) => { decals.push({ ...d, born: clock }); };

  /** The hatch being cut: a torch seam crawls round `rect` as p goes 0..1. blow() ends it. */
  function seam(rect, p) { hatch.rect = rect; hatch.p = Math.max(0, Math.min(1, p)); }
  function blow(rect, { color = '#fff3d4' } = {}) {
    hatch.rect = rect; hatch.p = 1; hatch.blown = true; hatch.blownAt = clock;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    flashAt(cx, cy, { r: 70, life: 0.35, color });
    sparks(cx, cy, { count: 34, speed: 260, life: 0.8 });
    smoke(cx, cy, { count: 14, life: 2.4 });
    shakeReq = Math.max(shakeReq, 0.5);
  }
  const clearHatch = () => { hatch.rect = null; hatch.p = 0; hatch.blown = false; };
  const clearFx = () => { fx = []; decals.length = 0; clearHatch(); };
  /** Everything staged goes: a new room, a new scene. Bubbles and the talk ring stay (a bark can cross a door). */
  function reset() { clearFx(); actors.clear(); camTarget = null; screen.pulse = screen.inset = screen.banner = screen.flash = null; marked = null; shakeReq = 0; }

  // ---- screen ----
  const pulse = (on, { color = '255,40,30', hz = 1.4 } = {}) => { screen.pulse = on ? { color, hz } : null; };
  const flash = (ms = 140, color = '255,255,255') => { screen.flash = { born: clock, life: ms / 1000, color }; };
  const banner = (text, ms = 3200) => { screen.banner = text ? { text, born: clock, until: clock + ms / 1000 } : null; };
  /** The airlock camera inset: a small framed picture of the outer door being cut. p 0..1 is how far the cut has got. */
  const inset = (on, p = 0) => { screen.inset = on ? { born: screen.inset?.born ?? clock, p } : null; };
  const shake = (amount) => { shakeReq = Math.max(shakeReq, amount); };

  function step(dt, where = null) {
    clock += dt;
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].until <= clock) bubbles.splice(i, 1);
    for (const a of actors.values()) {
      a.hit = Math.max(0, a.hit - dt);
      if (!a.path.length) { a.moving = false; continue; }
      const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      if (d < 3) { a.path.shift(); continue; }
      const s = Math.min(d, a.speed * dt);
      a.x += (dx / d) * s; a.y += (dy / d) * s; a.angle = Math.atan2(dy, dx); a.moving = true;
    }
    fx = fx.filter((f) => clock - f.born < f.life);
    for (const f of fx) if (f.kind === 'spark' || f.kind === 'smoke') { f.x += f.vx * dt; f.y += f.vy * dt; if (f.kind === 'spark') f.vy += 260 * dt; }
    if (screen.banner && clock > screen.banner.until) screen.banner = null;
    if (screen.flash && clock - screen.flash.born > screen.flash.life) screen.flash = null;
    // the torch drops sparks at the head of the seam while it is being cut
    if (hatch.rect && !hatch.blown && hatch.p > 0 && hatch.p < 1 && !reducedMotion() && Math.random() < dt * 22) { const h = seamHead(hatch.rect, hatch.p); sparks(h.x, h.y, { count: 3, life: 0.4, speed: 120 }); }
    if (screen.inset && screen.inset.p > 0 && screen.inset.p < 1 && Math.random() < dt * 16) screen.inset.spark = clock;
  }

  /** Where the torch is on a rectangle's outline at progress p (the outline is walked from the top-left, clockwise). */
  function seamHead(r, p) {
    const per = 2 * (r.w + r.h), at = p * per;
    if (at <= r.w) return { x: r.x + at, y: r.y };
    if (at <= r.w + r.h) return { x: r.x + r.w, y: r.y + (at - r.w) };
    if (at <= 2 * r.w + r.h) return { x: r.x + r.w - (at - r.w - r.h), y: r.y + r.h };
    return { x: r.x, y: r.y + r.h - (at - 2 * r.w - r.h) };
  }

  // ---- drawing ----
  /** World space, under the bodies: the hint ring, scorch decals, the torch seam, the blown hatch. */
  function drawFloor(ctx, t) {
    if (marked) {
      const bob = reducedMotion() ? 0 : Math.sin(t * 4) * 5, pulseK = reducedMotion() ? 1 : 0.85 + Math.sin(t * 5) * 0.15;
      ctx.save();
      ctx.strokeStyle = 'rgba(244,211,94,0.95)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(marked.x, marked.y + 22, 30 * pulseK, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#f4d35e'; ctx.strokeStyle = '#2a1d05'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(marked.x - 11, marked.y - 40 + bob); ctx.lineTo(marked.x + 11, marked.y - 40 + bob); ctx.lineTo(marked.x, marked.y - 22 + bob); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
    for (const d of decals) {
      if (d.kind === 'scorch') { ctx.save(); const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r); g.addColorStop(0, 'rgba(10,6,4,0.85)'); g.addColorStop(1, 'rgba(10,6,4,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    if (hatch.rect) drawHatch(ctx, t);
  }

  function drawHatch(ctx, t) {
    const r = hatch.rect;
    ctx.save();
    if (!hatch.blown) {
      // The cut so far: a hot seam with a glow, the cooling line behind the torch, a scorch growing round the door.
      const per = 2 * (r.w + r.h), len = hatch.p * per;
      const scorch = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 4, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * (0.8 + hatch.p * 0.6));
      scorch.addColorStop(0, `rgba(20,10,4,${0.55 * hatch.p})`); scorch.addColorStop(1, 'rgba(20,10,4,0)');
      ctx.fillStyle = scorch; ctx.fillRect(r.x - r.w, r.y - r.h, r.w * 3, r.h * 3);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash([len, per]);
      ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(255,120,40,0.95)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.setLineDash([]);
      if (hatch.p > 0 && hatch.p < 1) { const h = seamHead(r, hatch.p); const g = ctx.createRadialGradient(h.x, h.y, 1, h.x, h.y, 18); g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(1, 'rgba(255,140,50,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, 18, 0, TAU); ctx.fill(); }
    } else {
      // Blown: a black opening, the plates bent out into the room, a scorch and a little glow that cools.
      const age = clock - hatch.blownAt, cool = Math.max(0, 1 - age / 4);
      ctx.fillStyle = '#05080d'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#39434d'; ctx.strokeStyle = '#161c22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(r.x - 4, r.y + 4); ctx.lineTo(r.x - 26, r.y - 10); ctx.lineTo(r.x - 14, r.y + r.h * 0.45); ctx.lineTo(r.x - 4, r.y + r.h * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r.x - 4, r.y + r.h - 4); ctx.lineTo(r.x - 30, r.y + r.h + 12); ctx.lineTo(r.x - 12, r.y + r.h * 0.55); ctx.lineTo(r.x - 4, r.y + r.h * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowColor = '#ff7a2a'; ctx.shadowBlur = 10 * cool; ctx.strokeStyle = `rgba(255,120,40,${0.8 * cool})`; ctx.lineWidth = 3;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
    ctx.restore();
  }

  /** The Reavers (and anyone else the stage spawned) as drawable bodies for the world's depth sort. */
  function bodies(ctx, t) {
    const out = [];
    for (const a of actors.values()) {
      if (a.hidden) continue;
      out.push({ y: a.y, draw: () => { ctx.save(); if (a.down) ctx.globalAlpha = 0.8; drawBody(ctx, a.x, a.y, a.angle, sprite(a.art), { size: 46 * playerArt().scale * a.scale, lift: null, t: t + a.phase, moving: a.moving, stride: (t * 2.2 + a.phase) % 4, hit: a.hit, tint: '#ffad72' }); ctx.restore(); } });
    }
    return out;
  }

  /** World space, over the bodies: sparks, flashes, bullet traces, smoke. */
  function drawOver(ctx) {
    for (const f of fx) {
      const k = (clock - f.born) / f.life;
      if (k < 0) continue;
      ctx.save();
      if (f.kind === 'spark') { ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.035, f.y - f.vy * 0.035); ctx.stroke(); }
      else if (f.kind === 'flash') { ctx.globalAlpha = (1 - k) * 0.9; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + k * 0.8), 0, TAU); ctx.fill(); }
      else if (f.kind === 'bolt') { const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k, tx = f.x0 + (f.x1 - f.x0) * Math.max(0, k - 0.25), ty = f.y0 + (f.y1 - f.y0) * Math.max(0, k - 0.25); ctx.strokeStyle = f.color; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke(); }
      else if (f.kind === 'smoke') { ctx.globalAlpha = (1 - k) * 0.4; ctx.fillStyle = '#6d7680'; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 22, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }

  const wrap = (ctx, text, maxW) => {
    const out = [];
    let line = '';
    for (const word of String(text).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    return out.slice(0, 4);
  };

  /** Screen space, after the world pass: the red pulse, the flash, the talk ring, the bubbles, the banner and the inset. cam = { x, y, zoom }, view = { w, h, dpr } (CSS px). */
  function drawScreen(ctx, cam, view, where) {
    const k = cam.zoom * view.dpr;
    const at = (p, up) => ({ x: (p.x - cam.x) * k, y: (p.y - cam.y) * k - up * k });
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (screen.pulse) {
      const wave = reducedMotion() ? 0.8 : 0.55 + Math.sin(clock * screen.pulse.hz * TAU) * 0.45;
      ctx.save();
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.32, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
      g.addColorStop(0, `rgba(${screen.pulse.color},0)`); g.addColorStop(1, `rgba(${screen.pulse.color},${0.55 * wave})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    if (talking) {
      const p = where(talking);
      if (p) {
        const c = at(p, 0), r = 24 * (p.scale || 1) * k, pulseK = reducedMotion() ? 1 : 0.9 + Math.sin(clock * 5) * 0.1;
        ctx.save();
        ctx.strokeStyle = 'rgba(244,211,94,0.9)'; ctx.lineWidth = 2.5 * view.dpr; ctx.setLineDash([6 * view.dpr, 5 * view.dpr]);
        ctx.beginPath(); ctx.ellipse(c.x, c.y + 14 * k * (p.scale || 1), r * pulseK, r * 0.45 * pulseK, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
    for (const b of bubbles) {
      const p = where(b.id);
      if (!p) continue;
      const age = clock - b.born, left = b.until - clock;
      const alpha = Math.min(1, age * 6, left * 3);
      const rise = reducedMotion() ? 0 : Math.min(8, age * 40);
      const head = at(p, 30 * (p.scale || 1) + 12 + rise);
      const px = Math.max(10, 13 * view.dpr * Math.min(1.25, cam.zoom + 0.15));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${px}px Inter, "Segoe UI", sans-serif`;
      const maxW = Math.min(view.w * view.dpr * 0.5, 230 * view.dpr);
      const lines = wrap(ctx, b.text, maxW);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18 * view.dpr;
      const lh = px * 1.28, h = lines.length * lh + 12 * view.dpr;
      const x = Math.max(6, Math.min(cw - w - 6, head.x - w / 2));
      const y = Math.max(6, head.y - h - 9 * view.dpr);
      ctx.fillStyle = 'rgba(8,18,29,0.94)'; ctx.strokeStyle = 'rgba(244,211,94,0.85)'; ctx.lineWidth = 1.6 * view.dpr;
      rr(ctx, x, y, w, h, 9 * view.dpr); ctx.fill(); ctx.stroke();
      const tx = Math.max(x + 12 * view.dpr, Math.min(x + w - 12 * view.dpr, head.x));
      ctx.beginPath(); ctx.moveTo(tx - 6 * view.dpr, y + h - 0.5); ctx.lineTo(tx, y + h + 8 * view.dpr); ctx.lineTo(tx + 6 * view.dpr, y + h - 0.5); ctx.closePath();
      ctx.fillStyle = 'rgba(8,18,29,0.94)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 6 * view.dpr, y + h); ctx.lineTo(tx, y + h + 8 * view.dpr); ctx.lineTo(tx + 6 * view.dpr, y + h); ctx.stroke();
      ctx.fillStyle = '#f4fbfc'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      lines.forEach((l, i) => ctx.fillText(l, x + 9 * view.dpr, y + 6 * view.dpr + i * lh));
      ctx.restore();
    }
    if (screen.banner) {
      const b = screen.banner, a = Math.min(1, (clock - b.born) * 8, (b.until - clock) * 3), blink = reducedMotion() ? 1 : 0.75 + Math.sin(clock * 9) * 0.25;
      ctx.save(); ctx.globalAlpha = a;
      const px = 15 * view.dpr * Math.min(1.2, cam.zoom + 0.2); ctx.font = `800 ${px}px Consolas, monospace`;
      const w = ctx.measureText(b.text).width + 36 * view.dpr, h = px * 2.1, x = (cw - w) / 2, y = 62 * view.dpr;
      ctx.fillStyle = `rgba(150,20,16,${0.88 * blink})`; ctx.strokeStyle = 'rgba(255,200,190,0.9)'; ctx.lineWidth = 2 * view.dpr; rr(ctx, x, y, w, h, 6 * view.dpr); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff2ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, cw / 2, y + h / 2 + 1);
      ctx.restore();
    }
    if (screen.inset) drawInset(ctx, view, cw, ch);
    if (screen.flash) { const f = screen.flash; ctx.save(); ctx.fillStyle = `rgba(${f.color},${Math.max(0, 1 - (clock - f.born) / f.life) * 0.85})`; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }
  }

  /** The airlock camera: a framed picture of the outer door, its torch glow, a crawling cut and a REC dot. */
  function drawInset(ctx, view, cw) {
    const d = view.dpr, iw = Math.min(230, view.w * 0.42) * d, ih = iw * 0.62, x = cw - iw - 14 * d, y = 62 * d + (screen.banner ? 46 * d : 0);
    const p = screen.inset.p;
    ctx.save();
    ctx.fillStyle = '#04070b'; ctx.fillRect(x, y, iw, ih);
    ctx.beginPath(); ctx.rect(x, y, iw, ih); ctx.clip();
    // the door: two plates with a seam, a hazard band, bolts
    const dx = x + iw * 0.22, dy = y + ih * 0.16, dw = iw * 0.56, dh = ih * 0.7;
    ctx.fillStyle = '#2d3843'; ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = '#1b232b'; ctx.fillRect(dx + dw / 2 - 1.5 * d, dy, 3 * d, dh);
    ctx.fillStyle = '#7a6420'; for (let i = 0; i < 6; i++) ctx.fillRect(dx + i * dw / 6, dy + dh - 8 * d, dw / 12, 8 * d);
    // the cut: a bright line crawling round the plate
    const per = 2 * (dw + dh), len = p * per;
    ctx.setLineDash([len, per]); ctx.lineWidth = 3 * d; ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 12 * d; ctx.strokeStyle = '#ff8a3c';
    ctx.strokeRect(dx + 2 * d, dy + 2 * d, dw - 4 * d, dh - 4 * d); ctx.setLineDash([]); ctx.shadowBlur = 0;
    if (p > 0 && p < 1) { const hh = seamHead({ x: dx, y: dy, w: dw, h: dh }, p); const g = ctx.createRadialGradient(hh.x, hh.y, 1, hh.x, hh.y, 22 * d); g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(1, 'rgba(255,140,50,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hh.x, hh.y, 22 * d, 0, TAU); ctx.fill(); }
    // scanlines, noise, label
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (let yy = y; yy < y + ih; yy += 4 * d) ctx.fillRect(x, yy, iw, d);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,90,70,0.9)'; ctx.lineWidth = 2 * d; ctx.strokeRect(x, y, iw, ih);
    ctx.font = `800 ${10 * d}px Consolas, monospace`; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffd7cf'; ctx.fillText('AIRLOCK 2', x + 7 * d, y + 6 * d);
    if (reducedMotion() || Math.floor(clock * 2) % 2 === 0) { ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(x + iw - 14 * d, y + 11 * d, 4 * d, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  return {
    bark, step, drawScreen, drawFloor, drawOver, bodies,
    spawn, walk, face, remove, actorAt, sparks, bolt, flashAt, smoke, hurtAt, decal, seam, blow, clearHatch, clearFx, reset,
    pulse, flash, banner, inset, shake,
    actor: (id) => actors.get(id) || null,
    get actorIds() { return [...actors.keys()]; },
    /** The camera looks here instead of at the player (null puts it back). */
    camera: (p) => { camTarget = p ? { x: p.x, y: p.y } : null; },
    get camTarget() { return camTarget; },
    /** A shake the world should add this frame (consumed). */
    takeShake: () => { const s = shakeReq; shakeReq = 0; return s; },
    talking: (id) => { talking = id || null; },
    /** An approach's hint ring (null clears it). */
    mark: (m) => { marked = m || null; },
    /** While an approach runs, the use key works the job instead of using what is in reach. */
    capture: (on) => { captured = Boolean(on); },
    get captured() { return captured; },
    get markedAt() { return marked; },
    /** For tests and the proof: the bubbles up now, and what the staging is showing. */
    bubbles: () => bubbles.map((b) => ({ id: b.id, text: b.text })),
    snapshot: () => ({ actors: [...actors.values()].map((a) => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), down: a.down, moving: a.moving })), fx: fx.length, decals: decals.length, hatch: { ...hatch, rect: hatch.rect && { ...hatch.rect } }, pulse: Boolean(screen.pulse), banner: screen.banner?.text || null, inset: Boolean(screen.inset), flash: Boolean(screen.flash), camera: camTarget }),
    get talkingTo() { return talking; },
    get time() { return clock; },
  };
}
