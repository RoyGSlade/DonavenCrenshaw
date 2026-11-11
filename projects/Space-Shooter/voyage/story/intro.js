// The opening: what is going on, before the captain is made. It replaces the
// empty captain picture with a short told-and-drawn sequence: the late-night
// lane radio ("Relay Night") tells the Drift's story over drawn scenes, then
// Chibby wakes you in his hangar and hands you a licence to sign. About 40
// seconds, skippable at any moment, and it reads the same with or without
// voice. Scenes are drawn on a canvas in code (no art files), sized with
// renderDpr. Text goes in with textContent.
import { renderDpr, readRenderScale } from '../renderScale.js';
import { lineById, fillLine } from './lines.js';
import { CAST } from './cast.js';
import { INTRO_DATA } from './data/intro.js';

export const INTRO = Object.freeze(INTRO_DATA.beats.map((b) => Object.freeze({ ...b })));

const TAU = Math.PI * 2;
const CYAN = '#81e6df';
const AMBER = '#ffad72';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// A small seeded random so the stars sit in the same place every time.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Three taps and a pause, twice: the Knock. WebAudio, no file. Returns a stop(). */
export function playKnock(ctx) {
  if (!ctx) return () => {};
  const t0 = ctx.currentTime + 0.05;
  const nodes = [];
  for (let rep = 0; rep < 2; rep++) {
    for (let i = 0; i < 3; i++) {
      const at = t0 + rep * 1.9 + i * 0.32;
      const len = Math.floor(ctx.sampleRate * 0.09);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (len * 0.12));
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 820;
      band.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.value = 0.55;
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(at);
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.frequency.setValueAtTime(140, at);
      thump.frequency.exponentialRampToValueAtTime(60, at + 0.12);
      tg.gain.setValueAtTime(0.35, at);
      tg.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      thump.connect(tg).connect(ctx.destination);
      thump.start(at);
      thump.stop(at + 0.16);
      nodes.push(src, thump);
    }
  }
  return () => { for (const n of nodes) { try { n.stop(); } catch { /* already done */ } } };
}

// --- The scenes ------------------------------------------------------------------------

function gatePoints(w, h) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = w * (0.1 + i * 0.133);
    const y = h * (0.46 + Math.sin(i * 1.3) * 0.12);
    out.push({ x, y, r: Math.max(9, Math.min(w, h) * 0.035) });
  }
  return out;
}

function drawStars(g, w, h, t, stars, dim = 1) {
  g.fillStyle = '#070d17';
  g.fillRect(0, 0, w, h);
  for (const s of stars) {
    const x = (s.x * w - t * s.z * 8 + w * 4) % w;
    const tw = 0.6 + 0.4 * Math.sin(t * 1.7 + s.x * 40);
    g.globalAlpha = s.z * tw * dim;
    g.fillStyle = s.z > 0.8 ? '#cfe8ff' : '#7b93ad';
    g.fillRect(x, s.y * h, s.z > 0.8 ? 2 : 1, s.z > 0.8 ? 2 : 1);
  }
  g.globalAlpha = 1;
}

function drawGate(g, p, lit, eye = 0) {
  g.save();
  g.lineWidth = 3;
  g.strokeStyle = lit > 0 ? CYAN : '#2a4152';
  g.globalAlpha = 0.35 + 0.65 * Math.max(lit, 0.2);
  g.shadowColor = CYAN;
  g.shadowBlur = 18 * lit;
  g.beginPath();
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    const x = p.x + Math.cos(a) * p.r;
    const y = p.y + Math.sin(a) * p.r;
    if (k) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  if (eye > 0) {
    g.shadowColor = AMBER;
    g.shadowBlur = 12 * eye;
    g.globalAlpha = eye;
    g.fillStyle = AMBER;
    g.beginPath();
    g.arc(p.x, p.y, p.r * 0.28, 0, TAU);
    g.fill();
  }
  g.restore();
}

function drawLane(g, a, b, alpha) {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha * 0.7;
  g.strokeStyle = CYAN;
  g.setLineDash([6, 8]);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
  g.restore();
}

function drawShip(g, x, y, size, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = '#d7e6ee';
  g.strokeStyle = CYAN;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(size, 0);
  g.lineTo(-size * 0.8, size * 0.62);
  g.lineTo(-size * 0.45, 0);
  g.lineTo(-size * 0.8, -size * 0.62);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = AMBER;
  g.globalAlpha = 0.8;
  g.fillRect(-size * 0.95, -size * 0.12, size * 0.35, size * 0.24);
  g.restore();
}

function drawHangar(g, w, h, t) {
  const rise = Math.min(1, t / 2.2);
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, `rgba(255,173,114,${0.55 * rise})`);
  grad.addColorStop(0.45, `rgba(64,48,40,${0.6 * rise})`);
  grad.addColorStop(1, 'rgba(7,13,23,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // The door rolling up, then the pad and the ship.
  const doorY = h * 0.18 - rise * h * 0.16;
  g.fillStyle = '#1a2533';
  g.fillRect(w * 0.12, 0, w * 0.76, doorY);
  g.strokeStyle = '#3d5568';
  for (let y = 8; y < doorY; y += 14) { g.beginPath(); g.moveTo(w * 0.12, y); g.lineTo(w * 0.88, y); g.stroke(); }
  g.strokeStyle = `rgba(244,211,94,${0.5 * rise})`;
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(w / 2, h * 0.68, w * 0.2, h * 0.07, 0, 0, TAU);
  g.stroke();
  drawShip(g, w / 2, h * 0.62, Math.min(w, h) * 0.09, -Math.PI / 2);
  // A lamp swinging a little, because hangars should feel lived in.
  const sway = Math.sin(t * 1.4) * 0.08;
  g.save();
  g.translate(w * 0.75, 0);
  g.rotate(sway);
  g.strokeStyle = '#5b6f80';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, h * 0.22); g.stroke();
  g.fillStyle = '#ffc46b';
  g.shadowColor = '#ffc46b';
  g.shadowBlur = 24;
  g.beginPath(); g.arc(0, h * 0.23, 6, 0, TAU); g.fill();
  g.restore();
}

function drawLicence(g, w, h, t) {
  drawHangar(g, w, h, 10);
  const k = Math.min(1, t / 0.8);
  const cw = Math.min(w * 0.72, 420);
  const ch = cw * 0.6;
  const x = (w - cw) / 2;
  const y = h * 0.3 + (1 - k) * 40;
  g.save();
  g.globalAlpha = k;
  g.fillStyle = '#e9e1cf';
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = 30;
  g.fillRect(x, y, cw, ch);
  g.shadowBlur = 0;
  g.strokeStyle = '#8a7a5c';
  g.lineWidth = 2;
  g.strokeRect(x + 8, y + 8, cw - 16, ch - 16);
  drawGate(g, { x: x + cw * 0.18, y: y + ch * 0.42, r: ch * 0.16 }, 0, 0.9);
  g.fillStyle = '#3a3226';
  g.font = `700 ${Math.round(cw * 0.05)}px Consolas, monospace`;
  g.fillText('WARDEN OFFICE', x + cw * 0.36, y + ch * 0.3);
  g.font = `${Math.round(cw * 0.04)}px Consolas, monospace`;
  g.fillText('COURIER LICENCE', x + cw * 0.36, y + ch * 0.42);
  g.fillText('LAST ISSUE', x + cw * 0.36, y + ch * 0.54);
  g.strokeStyle = '#3a3226';
  g.beginPath(); g.moveTo(x + cw * 0.12, y + ch * 0.8); g.lineTo(x + cw * 0.88, y + ch * 0.8); g.stroke();
  g.font = `${Math.round(cw * 0.032)}px Consolas, monospace`;
  g.fillText('SIGN HERE', x + cw * 0.12, y + ch * 0.88);
  g.restore();
}

function drawScene(g, w, h, scene, t, stars) {
  const gates = gatePoints(w, h);
  if (scene === 'stars') { drawStars(g, w, h, t, stars); return; }
  if (scene === 'hangar') { drawHangar(g, w, h, t); return; }
  if (scene === 'licence') { drawLicence(g, w, h, t); return; }
  drawStars(g, w, h, t, stars, scene === 'knock' ? 0.4 : 1);
  if (scene === 'gates') {
    gates.forEach((p, i) => {
      const lit = Math.max(0, Math.min(1, t * 2.4 - i * 0.55));
      if (i) drawLane(g, gates[i - 1], p, Math.min(lit, Math.max(0, Math.min(1, t * 2.4 - (i - 1) * 0.55))));
      drawGate(g, p, lit, lit * 0.8);
    });
  } else if (scene === 'dark') {
    gates.forEach((p, i) => {
      const off = Math.max(0, Math.min(1, t * 1.8 - i * 0.3));
      const flicker = off > 0 && off < 1 ? (Math.sin(t * 50 + i) > 0 ? 1 : 0.3) : 1;
      const lit = (1 - off) * flicker;
      if (i) drawLane(g, gates[i - 1], p, lit);
      drawGate(g, p, lit, lit * 0.8);
    });
  } else if (scene === 'courier') {
    gates.forEach((p, i) => { if (i) drawLane(g, gates[i - 1], p, 0.12); drawGate(g, p, 0, 0); });
    const u = Math.min(0.999, (t * 0.12) % 1);
    const f = u * (gates.length - 1);
    const i = Math.floor(f);
    const a = gates[i];
    const b = gates[i + 1];
    const k = f - i;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    g.save();
    g.strokeStyle = CYAN;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - (b.x - a.x) * 0.3, y - (b.y - a.y) * 0.3); g.stroke();
    g.restore();
    drawShip(g, x, y, Math.min(w, h) * 0.03, Math.atan2(b.y - a.y, b.x - a.x));
  } else if (scene === 'knock') {
    gates.forEach((p) => drawGate(g, p, 0, 0));
    // A dead channel's waveform: flat static, three spikes, a pause.
    g.save();
    g.strokeStyle = CYAN;
    g.lineWidth = 2;
    g.shadowColor = CYAN;
    g.shadowBlur = 8;
    g.beginPath();
    const mid = h * 0.5;
    const period = 1.9;
    for (let x = 0; x <= w; x += 3) {
      const time = ((x / w) * 3.8 + t) % period;
      let y = (Math.sin(x * 0.9 + t * 30) * 0.5 + Math.sin(x * 2.3) * 0.5) * 3;
      for (let i = 0; i < 3; i++) {
        const d = time - i * 0.32;
        if (d > 0 && d < 0.12) y -= Math.sin((d / 0.12) * Math.PI) * h * 0.14;
      }
      if (x) g.lineTo(x, mid + y); else g.moveTo(x, mid + y);
    }
    g.stroke();
    g.restore();
  }
}

/**
 * playIntro({ root, bus, speak, vars, reducedMotion, muted }) -> Promise<{ skipped, tutorial }>
 * (tutorial: the player asked to skip the whole tutorial from the title card).
 * speak: say.js's speak (lines are sent on the 'intro' channel, so the caption
 * leaves them to this overlay). Starts on a title card: the Begin tap is the
 * gesture browsers want before they play sound.
 */
export function playIntro({ root = document.body, bus, speak, vars = {}, reducedMotion = () => false, muted = () => false } = {}) {
  return new Promise((resolve) => {
    const node = el('section', 'sy-intro');
    node.setAttribute('aria-label', 'Intro');
    const canvas = el('canvas', 'sy-intro-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const title = el('div', 'sy-intro-title');
    const begin = el('button', 'primary sy-begin', 'Begin');
    begin.type = 'button';
    const skipAll = el('button', 'sy-intro-skipall', 'I know the ropes: skip the tutorial');
    skipAll.type = 'button';
    title.append(el('p', 'sy-intro-mark', 'STARDUST'), el('p', 'sy-intro-sub', 'A courier. A borrowed ship. A dead channel that keeps knocking.'), begin, skipAll);
    const words = el('div', 'sy-intro-words');
    words.hidden = true;
    words.setAttribute('aria-live', 'polite');
    const who = el('p', 'sy-intro-who');
    const text = el('p', 'sy-intro-text');
    const tap = el('p', 'sy-intro-tap', 'Tap for next');
    words.append(who, text, tap);
    const skip = el('button', 'sy-intro-skip', 'Skip intro');
    skip.type = 'button';
    node.append(canvas, title, words, skip);
    root.append(node);

    const g = canvas.getContext('2d');
    const rand = seeded(7);
    const stars = Array.from({ length: 170 }, () => ({ x: rand(), y: rand(), z: 0.25 + rand() * 0.75 }));
    let scene = 'stars';
    let sceneAt = performance.now();
    let frame = 0;
    let current = null;
    let skipped = false;
    let tutorial = false; // the player chose to skip the whole tutorial
    let finished = false;
    let audioCtx = null;
    let stopKnock = () => {};

    function size() {
      const dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
      const w = Math.max(1, Math.floor(node.clientWidth * dpr));
      const h = Math.max(1, Math.floor(node.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: w / dpr, h: h / dpr };
    }
    function draw(now) {
      const { w, h } = size();
      const t = reducedMotion() ? 10 : (now - sceneAt) / 1000;
      drawScene(g, w, h, scene, t, stars);
      if (!reducedMotion() && !finished) frame = requestAnimationFrame(draw);
    }
    const redraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    addEventListener('resize', redraw);
    redraw();

    const off = bus.on('story:say', (d) => {
      if (d.channel !== 'intro') return;
      current = d;
      who.textContent = d.speaker === 'narrator' ? 'RELAY NIGHT' : d.name.toUpperCase();
      who.style.color = CAST[d.speaker]?.color || CYAN;
      text.textContent = d.text;
      words.classList.remove('sy-in');
      void words.offsetWidth; // restart the fade
      words.classList.add('sy-in');
    });
    const next = () => { if (current) bus.emit('story:said', { seq: current.seq }); };

    function end() {
      if (finished) return;
      finished = true;
      off();
      stopKnock();
      removeEventListener('resize', redraw);
      removeEventListener('keydown', onKey);
      cancelAnimationFrame(frame);
      node.classList.add('sy-out');
      setTimeout(() => node.remove(), reducedMotion() ? 0 : 450);
      resolve({ skipped, tutorial });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); skipped = true; next(); end(); }
      else if ((e.key === 'Enter' || e.key === ' ') && !title.hidden) { e.preventDefault(); begin.click(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
    }
    addEventListener('keydown', onKey);
    skip.addEventListener('click', () => { skipped = true; next(); end(); });
    skipAll.addEventListener('click', () => { skipped = true; tutorial = true; end(); });
    words.addEventListener('click', next);
    canvas.addEventListener('click', next);

    begin.addEventListener('click', async () => {
      title.hidden = true;
      words.hidden = false;
      try { if (!muted()) audioCtx = new (globalThis.AudioContext || globalThis.webkitAudioContext)(); } catch { audioCtx = null; }
      for (const beat of INTRO) {
        if (finished) break;
        if (beat.scene !== scene) { scene = beat.scene; sceneAt = performance.now(); redraw(); }
        if (beat.sound === 'knock' && audioCtx && !muted()) stopKnock = playKnock(audioCtx);
        if (!lineById(beat.line)) continue;
        await speak(beat.line, { vars, channel: 'intro' });
      }
      try { audioCtx?.close(); } catch { /* fine */ }
      end();
    });
    begin.focus();
  });
}

/** The intro's words as plain text (for a transcript, tests and the no-JS reader). */
export const introScript = (vars = {}) => INTRO.map((b) => {
  const l = lineById(b.line);
  return l ? `${CAST[l.speaker]?.name || l.speaker}: ${fillLine(l.text, vars)}` : '';
}).filter(Boolean);
