// The exploration hop, on screen: fly from your hangar to a giver's place.
// Arrows or WASD (turn and thrust, as in Dogfight), Shift to boost, S to brake;
// on phones the stick points where to fly. Points of interest scan when you
// slow down beside them (or press E). Arriving resolves the promise; the page
// (or onfoot.js) emits met:<giver>.
//
//   flyHop(root, { to: 'beacon', shipArt, onPoi, visited }) -> Promise<{ arrived, place, giver, seen, pois }>
import { createHop, stepHop, steerToward, PLACES, POIS, ROCKS, SECTOR, STEP } from './rules.js';
import { sprite } from '../onfoot/assets.js';
import { fitCanvas } from '../onfoot/viewport.js';
import { createInput } from '../onfoot/input.js';
import { createEl } from '../onfoot/dom.js';

const UNIT = 22; // CSS px per Dogfight unit at zoom 1

export function flyHop(root, { to, from = 'home', shipArt = null, onPoi = () => {}, visited = [], reducedMotion = () => false, sound = () => {}, scanRange = 1 } = {}) {
  const hop = createHop({ from, to, visited, scanRange });
  let boostWas = 3, shake = 0;
  const dest = PLACES[hop.to];
  const el = createEl('div', { class: 'of-hop', role: 'region', 'aria-label': `Flying to ${dest.name}` });
  const canvas = createEl('canvas', { class: 'of-canvas', 'aria-label': `Space. Fly to ${dest.name}. Arrows or WASD to steer and thrust, Shift to boost.` });
  const hud = createEl('div', { class: 'of-hop-hud' });
  const toast = createEl('div', { class: 'of-hop-toast', role: 'status', 'aria-live': 'polite' });
  const help = createEl('p', { class: 'of-hud-help' });
  el.append(canvas, hud, toast, help);
  el.__hop = hop;
  root.append(el);
  const input = createInput(el, { mode: 'fly', canvas });
  help.textContent = input.touch ? 'Point the stick where you want to fly. Boost for speed. Slow down beside a marker to scan it.' : 'Left/right turn · Up thrusts · Shift boosts · S brakes · slow down beside a marker to scan (or E)';
  const ctx = canvas.getContext('2d');
  let view = fitCanvas(canvas), stars = null, raf = 0, last = 0, acc = 0, t = 0, toastT = 0;
  const trail = [];
  const pois = [];

  function buildStars() {
    const c = document.createElement('canvas');
    const size = 512;
    c.width = c.height = size;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      const b = rnd();
      g.fillStyle = b > 0.92 ? '#cfe8f0' : b > 0.7 ? '#7f97a8' : '#3c4c5a';
      g.fillRect(rnd() * size, rnd() * size, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1);
    }
    return c;
  }
  stars = buildStars();
  const ro = new ResizeObserver(() => { view = fitCanvas(canvas); });
  ro.observe(canvas);

  function say(text) { toast.textContent = text; toast.classList.add('show'); toastT = 4.5; }
  say(`Course laid in: ${dest.name}. Follow the marker.`);

  function inputNow() {
    const st = input.stick();
    if (st) { const s = steerToward(hop.ship, st); return { ...s, boost: input.take('boost'), scan: input.take('scan') }; }
    const left = input.held('ArrowLeft') || input.held('KeyA'), right = input.held('ArrowRight') || input.held('KeyD');
    return { turn: (right ? 1 : 0) - (left ? 1 : 0), thrust: input.held('ArrowUp') || input.held('KeyW') ? 1 : 0, brake: input.held('ArrowDown') || input.held('KeyS'), boost: input.held('ShiftLeft') || input.held('ShiftRight') || input.take('boost'), scan: input.held('KeyE') || input.take('scan') };
  }

  let finish;
  const done = new Promise(resolve => { finish = resolve; });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (document.hidden) return;
    t += dt; acc = Math.min(0.2, acc + dt);
    while (acc >= STEP && !hop.arrived) {
      stepHop(hop, inputNow(), STEP);
      acc -= STEP;
      for (const e of hop.events) {
        if (e.type === 'poi') { pois.push(e.id); say(`${e.poi.name}: ${e.poi.text}`); onPoi(e.poi); sound('scan'); }
        if (e.type === 'docking') { say(`Docking at ${dest.name}…`); sound('dock'); }
        if (e.type === 'bump') { sound('bump'); shake = 0.3; }
        if (e.type === 'arrived') setTimeout(() => close(true), 250);
      }
    }
    if (Math.floor(hop.scene.boost) < Math.floor(boostWas)) sound('boost');
    boostWas = hop.scene.boost;
    shake = Math.max(0, shake - dt);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('show'); }
    if (!reducedMotion() && (trail.length === 0 || Math.hypot(trail.at(-1).x - hop.ship.x, trail.at(-1).y - hop.ship.y) > 0.6)) { trail.push({ x: hop.ship.x, y: hop.ship.y }); if (trail.length > 40) trail.shift(); }
    draw();
  }

  function draw() {
    const { w, h, dpr } = view;
    const zoom = Math.max(0.6, Math.min(1.2, Math.min(w, h * 1.6) / 900));
    const k = UNIT * zoom;
    const s = hop.ship;
    const jolt = reducedMotion() ? 0 : shake * 0.6;
    const camX = s.x - w / 2 / k + (Math.random() - 0.5) * jolt, camY = s.y - h / 2 / k + (Math.random() - 0.5) * jolt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04070d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Two star layers drifting at different depths (one pattern fill each).
    for (const [depth, alpha] of [[0.15, 0.6], [0.4, 1]]) {
      const pattern = ctx.createPattern(stars, 'repeat');
      const ox = -(camX * k * depth * dpr) % 512, oy = -(camY * k * depth * dpr) % 512;
      pattern.setTransform?.(new DOMMatrix([1, 0, 0, 1, ox, oy]));
      ctx.globalAlpha = alpha; ctx.fillStyle = pattern; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(k * dpr, 0, 0, k * dpr, -camX * k * dpr, -camY * k * dpr);
    // Sector edge.
    ctx.strokeStyle = '#2a415266'; ctx.lineWidth = 0.15; ctx.strokeRect(0, 0, SECTOR.w, SECTOR.h);
    // Course line to the destination.
    ctx.strokeStyle = '#81e6df33'; ctx.setLineDash([0.8, 0.8]); ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(dest.x, dest.y); ctx.stroke(); ctx.setLineDash([]);
    // Ion drift and POIs.
    for (const p of POIS) {
      const seen = hop.seen.includes(p.id);
      if (p.kind === 'cloud') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        g.addColorStop(0, '#5fa8ff33'); g.addColorStop(1, '#5fa8ff00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = seen ? '#8fa6b766' : '#f4d35e'; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1 + Math.sin(t * 3) * 0.1, 0, Math.PI * 2); ctx.stroke();
      const prog = hop.scans[p.id] || 0;
      if (prog > 0 && !seen) { ctx.strokeStyle = '#f4d35e'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke(); }
      if (p.kind === 'derelict' || p.kind === 'wreck') {
        // A small tumbling hull piece.
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 0.3 + p.x);
        ctx.fillStyle = p.kind === 'wreck' ? '#4a3a2e' : '#4b5a68';
        ctx.fillRect(-0.7, -0.35, 1.4, 0.7); ctx.fillStyle = p.kind === 'wreck' ? '#ffad72' : '#81e6df'; ctx.fillRect(-0.15, -0.12, 0.3, 0.24);
        ctx.restore();
      } else if (p.kind === 'buoy') {
        ctx.fillStyle = '#f4d35e'; ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // Rocks.
    const rock = sprite('asteroid');
    for (const o of ROCKS) {
      if (Math.abs(o.x - s.x) > w / k && Math.abs(o.y - s.y) > h / k) continue;
      if (rock) { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.x * 0.7 + t * 0.05); ctx.drawImage(rock, -o.radius * 1.15, -o.radius * 1.15, o.radius * 2.3, o.radius * 2.3); ctx.restore(); }
      else { ctx.fillStyle = '#3a3f47'; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill(); }
    }
    // Places.
    for (const p of Object.values(PLACES)) {
      const img = sprite(p.art);
      const target = p.id === dest.id;
      if (target) { ctx.strokeStyle = '#81e6df'; ctx.globalAlpha = 0.5 + Math.sin(t * 4) * 0.25; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5 + 2.2, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      if (img) { const sz = p.size; ctx.drawImage(img, p.x - sz / 2, p.y - (sz * img.height / img.width) / 2, sz, sz * img.height / img.width); }
      else { ctx.fillStyle = '#2b3a48'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    // Speed lines when fast.
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 11 && !reducedMotion()) {
      ctx.strokeStyle = '#cfe8f033'; ctx.lineWidth = 0.08; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const ox = s.x + Math.sin(i * 12.9 + t * 3) * 6, oy = s.y + Math.cos(i * 7.3 + t * 2) * 4; ctx.moveTo(ox, oy); ctx.lineTo(ox - s.vx * 0.12, oy - s.vy * 0.12); }
      ctx.stroke();
    }
    // Trail and ship.
    if (trail.length > 1) { ctx.strokeStyle = '#81e6df44'; ctx.lineWidth = 0.18; ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y); for (const p of trail) ctx.lineTo(p.x, p.y); ctx.stroke(); }
    const ship = shipArt?.();
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle + Math.PI / 2);
    if (s.hit > 0) ctx.globalAlpha = 0.6;
    if (ship) ctx.drawImage(ship, -1.7, -1.7, 3.4, 3.4);
    else { ctx.fillStyle = '#81e6df'; ctx.beginPath(); ctx.moveTo(0, -0.9); ctx.lineTo(0.6, 0.7); ctx.lineTo(-0.6, 0.7); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // Labels in screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 12px Inter, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    for (const p of [...Object.values(PLACES), ...POIS]) {
      const x = (p.x - camX) * k, y = (p.y - camY) * k;
      if (x < -50 || y < -50 || x > w + 50 || y > h + 50) continue;
      const big = p.size || 0;
      ctx.fillStyle = p.size ? (p.id === dest.id ? '#81e6df' : '#b5c8d5') : hop.seen.includes(p.id) ? '#8fa6b7' : '#f4d35e';
      ctx.fillText(p.name, x, y + (big ? big * k * 0.6 + 16 : 2.6 * k));
    }
    // Edge marker toward the destination when it is off screen.
    const dx = (dest.x - camX) * k, dy = (dest.y - camY) * k;
    if (dx < 20 || dy < 20 || dx > w - 20 || dy > h - 20) {
      const a = Math.atan2(dy - h / 2, dx - w / 2);
      const r = Math.min(w, h) / 2 - 34;
      const mx = w / 2 + Math.cos(a) * r, my = h / 2 + Math.sin(a) * r;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
      ctx.fillStyle = '#81e6df'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#81e6df'; ctx.fillText(`${Math.round(hop.distance)} km`, mx - Math.cos(a) * 26, my - Math.sin(a) * 22 + 4);
    }
    const pips = Math.floor(hop.scene.boost);
    const text = `${dest.name.toUpperCase()} · ${Math.round(hop.distance)} km · BOOST ${'●'.repeat(pips)}${'○'.repeat(3 - pips)}`;
    if (hud.textContent !== text) hud.textContent = text;
  }

  function close(arrived) {
    cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); el.remove();
    finish({ arrived, place: dest.id, giver: dest.giver || null, seen: [...hop.seen], pois });
  }

  raf = requestAnimationFrame(now => { last = now; frame(now); });
  done.hop = hop;
  done.abort = () => close(false);
  return done;
}
