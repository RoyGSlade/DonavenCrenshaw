// The hack on screen: a ring, a sweeping cursor, the lit window. Space, Enter,
// a click or a tap splices. Resolves { success, how, set, misses, time }.
import { createHack, stepHack, splice, speedOf } from './rules/hack.js';
import { fitCanvas } from './viewport.js';
import { createEl } from './dom.js';

export function playHack(root, { title = 'Lock', difficulty = 1, seed = 1, mods = {}, sound = () => {}, reducedMotion = () => false } = {}) {
  const state = createHack({ difficulty, seed, mods });
  const canvas = createEl('canvas', { class: 'of-hack-canvas', 'aria-hidden': 'true' });
  const status = createEl('p', { class: 'of-mine-status', role: 'status', 'aria-live': 'polite', text: `Set ${state.tumblers.length} tumblers. Splice when the sweep is in the lit window.` });
  const btn = createEl('button', { type: 'button', class: 'of-drill-btn primary', text: 'Splice' });
  const perks = mods.texts?.length ? createEl('p', { class: 'of-help of-perks', text: `Your skills: ${mods.texts.join(' · ')}` }) : null;
  const panel = createEl('section', { class: 'of-panel of-hack', role: 'dialog', 'aria-label': `Hack: ${title}` },
    createEl('p', { class: 'of-eyebrow', text: `BYPASS · ${title.toUpperCase()} · LEVEL ${state.difficulty}` }), canvas, status, btn, perks,
    createEl('p', { class: 'of-help', text: 'Space, Enter or tap. Each tumbler sets faster and the sweep turns back. Too many misses trips the trace.' }));
  panel.__state = state;
  root.append(panel);
  btn.focus({ preventScroll: true });
  const ctx = canvas.getContext('2d');
  let raf = 0, last = 0, finish, flash = 0, flashOk = true, shake = 0;
  const go = () => {
    const r = splice(state);
    if (!r) return;
    flash = 0.25; flashOk = r === 'set';
    sound(r === 'set' ? 'power' : 'hurt');
    if (r === 'miss') shake = 0.3;
    status.textContent = r === 'set' ? (state.done ? 'Lock open.' : `Tumbler ${state.index} set.`) : `Miss. Trace ${state.misses} of ${state.allowed + 1}.`;
    if (state.done) end();
  };
  const kd = (e) => { if (['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); if (!e.repeat && !state.done) go(); } };
  addEventListener('keydown', kd);
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!state.done) go(); });

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    stepHack(state, dt);
    for (const e of state.events) if (e.type === 'done' && !e.success) { status.textContent = e.how === 'timeout' ? 'Out of time. The lock resets.' : 'Trace tripped. The lock locks you out.'; sound('jam'); end(); }
    flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt);
    draw();
  }
  function draw() {
    const { w, h, dpr } = fitCanvas(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const j = reducedMotion() ? 0 : (Math.random() - 0.5) * shake * 12;
    const cx = w / 2 + j, cy = h / 2 - 6, R = Math.min(w, h) * 0.36;
    ctx.lineWidth = 10; ctx.strokeStyle = '#13222f'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    state.tumblers.forEach((tb, i) => {
      if (i < state.index) return;
      const active = i === state.index;
      ctx.strokeStyle = active ? '#81e6df' : '#2a4152'; ctx.lineWidth = active ? 12 : 6;
      ctx.beginPath(); ctx.arc(cx, cy, R, tb.at - tb.width / 2, tb.at + tb.width / 2); ctx.stroke();
    });
    // Set tumblers as pips in the middle.
    state.tumblers.forEach((tb, i) => { ctx.fillStyle = tb.set ? '#9fe870' : '#2a4152'; ctx.beginPath(); ctx.arc(cx - (state.tumblers.length - 1) * 9 + i * 18, cy, 6, 0, Math.PI * 2); ctx.fill(); });
    // The sweep.
    ctx.strokeStyle = flash > 0 ? (flashOk ? '#9fe870' : '#ff6b5a') : '#eaf4f5'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(state.cursor) * (R - 20), cy + Math.sin(state.cursor) * (R - 20)); ctx.lineTo(cx + Math.cos(state.cursor) * (R + 14), cy + Math.sin(state.cursor) * (R + 14)); ctx.stroke();
    // Timer and trace.
    ctx.fillStyle = '#2a4152'; ctx.fillRect(16, h - 10, w - 32, 4);
    ctx.fillStyle = state.time - state.t < 4 ? '#ff6b5a' : '#81e6df'; ctx.fillRect(16, h - 10, (w - 32) * Math.max(0, 1 - state.t / state.time), 4);
    for (let i = 0; i <= state.allowed; i++) { ctx.fillStyle = i < state.misses ? '#ff6b5a' : '#2a4152'; ctx.fillRect(w - 24 - i * 14, 10, 10, 10); }
    ctx.fillStyle = '#8fa6b7'; ctx.font = '10px Consolas, monospace'; ctx.fillText(`SWEEP ${speedOf(state).toFixed(1)}`, 16, 18);
  }
  function end() {
    cancelAnimationFrame(raf); draw();
    removeEventListener('keydown', kd);
    btn.textContent = state.result.success ? 'Continue' : 'Step back';
    btn.onclick = close;
    const k2 = (e) => { if (['Enter', 'Space', 'KeyE'].includes(e.code)) { e.preventDefault(); removeEventListener('keydown', k2); close(); } };
    setTimeout(() => addEventListener('keydown', k2), 350);
    function close() { removeEventListener('keydown', k2); panel.remove(); finish(state.result); }
  }
  raf = requestAnimationFrame(n => { last = n; frame(n); });
  const promise = new Promise(r => { finish = r; });
  promise.state = state;
  return promise;
}
