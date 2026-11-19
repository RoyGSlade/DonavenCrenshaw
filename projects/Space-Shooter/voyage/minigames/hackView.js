// The bypass ring on screen for a set-up hack (see hack.js). Same look and
// controls as onfoot/hackView.js (Space, Enter, click or tap to splice); it
// takes a ready state instead of building one. Resolves { success, how, set, misses, time, xp }.
import { stepHack, splice, speedOf, hackXp } from './hack.js';
import { fitCanvas } from '../onfoot/viewport.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };

export function playRing(root, { state, title = 'Lock', sound = () => {}, reducedMotion = () => false } = {}) {
  const canvas = h('canvas', { class: 'hk-canvas', 'aria-hidden': 'true' });
  const s = state.setup || {};
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Set ${state.tumblers.length} tumblers. Splice when the sweep is in the lit window.` });
  const btn = h('button', { type: 'button', class: 'hk-btn primary ui-btn', text: 'Splice' });
  const facts = h('p', { class: 'rp-par', text: state.practice ? `Practice dummy · ${state.tumblers.length} tumblers · no clock, no trace, no XP` : `${s.label || 'Steady'} · ${state.tumblers.length} tumblers · ${state.time}s · ${state.allowed} spare ${state.allowed === 1 ? 'miss' : 'misses'}` });
  const panel = h('section', { class: 'rp-panel hk-panel mg-skin ui-panel', role: 'group', 'aria-label': `Hack: ${title}` },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `BYPASS · ${title.toUpperCase()} · LOCK GRADE ${state.difficulty} OF 4` }), canvas, btn, status, facts,
    h('p', { class: 'rp-help', text: 'Space, Enter or tap. Each tumbler sets faster and the sweep turns back. Too many misses trips the trace.' }));
  panel.__state = state;
  root.append(panel);
  const ctx = canvas.getContext('2d');
  let raf = 0, last = 0, finish, flash = 0, flashOk = true, shake = 0;
  const promise = new Promise((r) => { finish = r; });
  promise.state = state;
  const go = () => {
    const r = splice(state);
    if (!r) return;
    flash = 0.25; flashOk = r === 'set';
    sound(r === 'set' ? 'power' : 'hurt');
    if (r === 'miss') shake = 0.3;
    status.textContent = r === 'set' ? (state.done ? 'Lock open.' : `Tumbler ${state.index} set.`) : (state.practice ? `Miss. Nothing happens here: try again (${state.misses} so far).` : `Miss. Trace ${state.misses} of ${state.allowed + 1}.`);
    if (state.done) end();
  };
  const kd = (e) => { if (['Space', 'Enter', 'KeyE'].includes(e.code)) { e.preventDefault(); if (!e.repeat && !state.done) go(); } };
  addEventListener('keydown', kd);
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!state.done) go(); });
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    stepHack(state, dt);
    if (state.done && !panel.querySelector('.rp-result')) { status.textContent = state.result.how === 'timeout' ? 'Out of time. The lock resets.' : state.result.success ? 'Lock open.' : 'Trace tripped. The lock locks you out.'; sound('jam'); end(); return; }
    flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt);
    draw();
  }
  function draw() {
    const { w, h: ht, dpr } = fitCanvas(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, ht);
    const j = reducedMotion() ? 0 : (Math.random() - 0.5) * shake * 12;
    const cx = w / 2 + j, cy = ht / 2 - 6, R = Math.min(w, ht) * 0.36;
    ctx.lineWidth = 10; ctx.strokeStyle = '#13222f'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    state.tumblers.forEach((tb, i) => {
      if (i < state.index) return;
      const active = i === state.index;
      ctx.strokeStyle = active ? '#81e6df' : '#2a4152'; ctx.lineWidth = active ? 12 : 6;
      ctx.beginPath(); ctx.arc(cx, cy, R, tb.at - tb.width / 2, tb.at + tb.width / 2); ctx.stroke();
    });
    const n = state.tumblers.length, gap = Math.min(18, (R * 1.4) / n);
    state.tumblers.forEach((tb, i) => { ctx.fillStyle = tb.set ? '#9fe870' : '#2a4152'; ctx.beginPath(); ctx.arc(cx - (n - 1) * gap / 2 + i * gap, cy, 6, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = flash > 0 ? (flashOk ? '#9fe870' : '#ff6b5a') : '#eaf4f5'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(state.cursor) * (R - 20), cy + Math.sin(state.cursor) * (R - 20)); ctx.lineTo(cx + Math.cos(state.cursor) * (R + 14), cy + Math.sin(state.cursor) * (R + 14)); ctx.stroke();
    ctx.fillStyle = '#2a4152'; ctx.fillRect(16, ht - 10, w - 32, 4);
    ctx.fillStyle = state.time - state.t < 4 ? '#ff6b5a' : '#81e6df'; ctx.fillRect(16, ht - 10, (w - 32) * Math.max(0, 1 - state.t / state.time), 4);
    for (let i = 0; i <= (state.practice ? -1 : state.allowed); i++) { ctx.fillStyle = i < state.misses ? '#ff6b5a' : '#2a4152'; ctx.fillRect(w - 24 - i * 14, 10, 10, 10); }
    ctx.fillStyle = '#8fa6b7'; ctx.font = '10px Consolas, monospace'; ctx.fillText(`SWEEP ${speedOf(state).toFixed(1)}`, 16, 18);
  }
  function end() {
    cancelAnimationFrame(raf); draw(); removeEventListener('keydown', kd);
    const r = { ...state.result, xp: state.practice ? 0 : hackXp(state.result, state.difficulty), practice: !!state.practice };
    btn.hidden = true;
    const go2 = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status' },
      h('b', { class: 'rp-stars', text: r.success ? 'LOCK OPEN' : r.how === 'timeout' ? 'TIMED OUT' : 'TRACE TRIPPED' }),
      h('span', { text: r.success ? (r.practice ? `${r.misses} miss${r.misses === 1 ? '' : 'es'} · ${r.time}s · practice: no XP` : `${r.misses} miss${r.misses === 1 ? '' : 'es'} · ${r.time}s · +${r.xp} Hacking XP`) : 'No XP.' }), go2);
    go2.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); state.result = r; go2.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest' });
  }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}
