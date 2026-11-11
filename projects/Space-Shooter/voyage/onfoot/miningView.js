// The mining minigame on screen: hold to drill, keep the heat in the green.
// Space, the mouse or a finger on the big button. Resolves { ore, clean, jams, reward }.
import { createMining, stepMining, bandAt, MINING } from './rules/mining.js';
import { fitCanvas } from './viewport.js';
import { createEl } from './dom.js';

export function playMining(root, { title = 'Ore seam', seed = 1, speed = 1, mods = {}, sound = () => {}, reducedMotion = () => false } = {}) {
  const state = createMining({ seed, speed, mods });
  let drillTick = 0;
  const canvas = createEl('canvas', { class: 'of-mine-canvas', 'aria-hidden': 'true' });
  const status = createEl('p', { class: 'of-mine-status', role: 'status', 'aria-live': 'polite', text: 'Hold to drill. Keep the heat in the green band.' });
  const drill = createEl('button', { type: 'button', class: 'of-drill-btn primary', text: 'Hold to drill' });
  const panel = createEl('section', { class: 'of-panel of-mine', role: 'dialog', 'aria-label': `Mining: ${title}` },
    createEl('p', { class: 'of-eyebrow', text: `MINING · ${title.toUpperCase()}` }),
    canvas, status, drill,
    mods.texts?.length ? createEl('p', { class: 'of-help of-perks', text: `Your skills: ${mods.texts.join(' · ')}` }) : null,
    createEl('p', { class: 'of-help', text: 'Space or hold the button. Under the band the bit only scratches; over it, it glows and jams at the top.' }));
  panel.__state = state;
  root.append(panel);
  drill.focus({ preventScroll: true });
  const ctx = canvas.getContext('2d');
  let holding = false, raf = 0, last = 0, shake = 0, sparks = [], finish;
  const down = (e) => { e.preventDefault?.(); holding = true; drill.classList.add('is-down'); };
  const up = () => { holding = false; drill.classList.remove('is-down'); };
  drill.addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  drill.addEventListener('pointercancel', up);
  const kd = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); if (!e.repeat) down(e); } };
  const ku = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') up(); };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  drill.addEventListener('keydown', (e) => { if (!state.done && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault(); });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    stepMining(state, { drill: holding }, dt);
    for (const e of state.events) {
      if (e.type === 'crack') { sound('crack'); shake = 0.25; status.textContent = `Chunk ${e.n} cracked loose!`; for (let i = 0; i < 10; i++) sparks.push({ a: Math.random() * Math.PI * 2, r: 0, life: 0.5, ore: true }); }
      if (e.type === 'jam') { sound('jam'); shake = 0.35; status.textContent = 'Jammed! Let it cool…'; }
      if (e.type === 'done') { if (state.result.ore) sound('ore'); finishUp(); return; }
    }
    if (state.drilling && (drillTick += dt) > 0.09) { drillTick = 0; sound('drill'); }
    if (state.drilling && Math.random() < 0.5) sparks.push({ a: -Math.PI / 2 + (Math.random() - 0.5) * 1.6, r: 0, life: 0.3, hot: state.zone === 'hot' });
    if (!state.jam && !state.events.length) {
      const hint = state.zone === 'green' ? 'In the green: biting deep.' : state.zone === 'hot' ? 'Too hot! Ease off.' : state.drilling ? 'Heating up…' : 'Hold to drill.';
      if (status.textContent !== hint && !/cracked|Jammed/.test(status.textContent)) status.textContent = hint;
      if (/cracked|Jammed/.test(status.textContent) && Math.random() < dt * 0.8) status.textContent = hint;
    }
    shake = Math.max(0, shake - dt);
    for (const s of sparks) { s.r += dt * 90; s.life -= dt; }
    sparks = sparks.filter(s => s.life > 0).slice(-60);
    draw();
  }

  function draw() {
    const { w, h, dpr } = fitCanvas(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const jx = reducedMotion() ? 0 : (Math.random() - 0.5) * shake * 16, jy = reducedMotion() ? 0 : (Math.random() - 0.5) * shake * 10;
    ctx.save(); ctx.translate(jx, jy);
    // Rock cross-section with ore seams; the drill bores down from the top.
    const rx = 18, ry = 14, rw = w - 90, rh = h - 28;
    ctx.fillStyle = '#2c3138'; ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = '#3a4048';
    for (let i = 0; i < 9; i++) ctx.fillRect(rx + ((i * 53) % rw), ry + ((i * 37) % rh), 26, 10);
    for (let c = 0; c < state.chunks; c++) {
      const y = ry + rh * ((c + 0.6) / state.chunks);
      const got = c < state.cracks;
      ctx.fillStyle = got ? '#ffad7233' : '#ffad72';
      ctx.beginPath(); ctx.ellipse(rx + rw / 2 + (c % 2 ? 22 : -18), y, 16, 7, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    const bitY = ry + rh * state.progress;
    ctx.fillStyle = '#0b1622'; ctx.fillRect(rx + rw / 2 - 9, ry, 18, bitY - ry);
    ctx.fillStyle = state.jam ? '#ff6b5a' : state.zone === 'hot' ? '#ffd2a8' : '#cfe8f0';
    ctx.beginPath(); ctx.moveTo(rx + rw / 2 - 12, bitY - 10); ctx.lineTo(rx + rw / 2 + 12, bitY - 10); ctx.lineTo(rx + rw / 2, bitY + 8); ctx.closePath(); ctx.fill();
    for (const s of sparks) {
      ctx.fillStyle = s.ore ? '#ffad72' : s.hot ? '#ffd2a8' : '#f4d35e';
      ctx.globalAlpha = Math.max(0, s.life * 2);
      ctx.fillRect(rx + rw / 2 + Math.cos(s.a) * s.r, bitY + Math.sin(s.a) * s.r, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Heat meter on the right with the drifting green band.
    const mx = w - 52, my = 14, mw = 30, mh = h - 28;
    ctx.fillStyle = '#0a1624'; ctx.fillRect(mx, my, mw, mh);
    const [lo, hi] = bandAt(state);
    ctx.fillStyle = '#9fe87055'; ctx.fillRect(mx, my + mh * (1 - hi), mw, mh * (hi - lo));
    ctx.strokeStyle = '#9fe870'; ctx.lineWidth = 2; ctx.strokeRect(mx + 1, my + mh * (1 - hi), mw - 2, mh * (hi - lo));
    ctx.fillStyle = '#ff6b5a55'; ctx.fillRect(mx, my, mw, mh * 0.06);
    const hy = my + mh * (1 - state.heat);
    ctx.fillStyle = state.zone === 'green' ? '#9fe870' : state.zone === 'hot' ? '#ff6b5a' : '#81e6df';
    ctx.fillRect(mx - 6, hy - 2, mw + 12, 4);
    ctx.fillStyle = '#8fa6b7'; ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('HEAT', mx + mw / 2, h - 2);
    // Time left.
    ctx.fillStyle = '#81e6df'; ctx.fillRect(rx, h - 6, rw * Math.max(0, 1 - state.t / state.duration), 3);
  }

  function finishUp() {
    cancelAnimationFrame(raf);
    const r = state.result;
    status.textContent = r.ore ? `${r.ore} ore${r.clean ? ' (clean core bonus)' : ''}. ${r.jams ? `${r.jams} jam${r.jams > 1 ? 's' : ''}.` : 'No jams.'}` : 'The vein closed before the bit got through.';
    drill.textContent = 'Done';
    drill.onclick = () => close();
    drill.removeEventListener('pointerdown', down);
    setTimeout(() => { drill.focus({ preventScroll: true }); }, 50);
    removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    const k2 = (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); removeEventListener('keydown', k2); close(); } };
    setTimeout(() => addEventListener('keydown', k2), 300);
  }
  function close() { removeEventListener('pointerup', up); panel.remove(); finish(state.result); }

  raf = requestAnimationFrame((now) => { last = now; frame(now); });
  const promise = new Promise((resolve) => { finish = resolve; });
  promise.state = state;
  return promise;
}
