// Mop the goo on screen (opening track C, scene 1): a floor of white goo and a mop you drag with a finger or the mouse.
// Wipe strokes lift the goo; the head you fitted decides how much each pass lifts (mop.js). Canvas 24 x 14 cells.
// Keyboard: the arrow keys sweep the mop one cell at a time. Resolves with the rules' result.
import { createMop, mopDown, mopMove, mopUp, cleared, headOf, COLS, ROWS, CLEAR_AT } from './mop.js';
import { h, loop, fitCanvas } from './craftChainView.js';
import { ensureHandsOnStyle } from './handsOnKit.js';

const K = 30; // pixels per cell on the canvas; CSS scales it
const W = COLS * K, H = ROWS * K;
const TAU = Math.PI * 2;

function makeFloor() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#26343e'); grad.addColorStop(1, '#1b262e');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(160,200,210,.09)'; g.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 3) { g.beginPath(); g.moveTo(x * K, 0); g.lineTo(x * K, H); g.stroke(); }
  for (let y = 0; y <= ROWS; y += 3) { g.beginPath(); g.moveTo(0, y * K); g.lineTo(W, y * K); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.03)'; for (let i = 0; i < 90; i++) g.fillRect((i * 97) % W, (i * 53) % H, 26, 2);
  return c;
}

/** opts: { seed, mess, head, title, reducedMotion }. Resolves with the result ({ success, strokes, head, ... }). */
export function playMop(root, { state, seed = 1, mess = 0, head = 'plain', title = 'Mop the goo', reducedMotion = () => false } = {}) {
  ensureHandsOnStyle();
  const s = state || createMop({ seed, mess, head });
  const floor = makeFloor();
  const canvas = h('canvas', { class: 'cc-canvas ho-canvas ho-mopcanvas', width: String(W), height: String(H), tabindex: '0', 'aria-label': 'The gym floor under white goo. Drag the mop over the goo to wipe it up, or use the arrow keys.' });
  const ctx = canvas.getContext('2d');
  const pctEl = h('em', { class: 'ho-pct', text: '0%' });
  const fill = h('i');
  const meter = h('div', { class: 'cc-meter ho-meter', role: 'progressbar', 'aria-label': 'Floor cleaned', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, fill, h('b', { class: 'ho-mark', style: `left:${CLEAR_AT * 100}%` }));
  const hd = headOf(s.head);
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: s.head === 'plain' ? 'Slime is sticky: a plain head lifts little on each pass. Go over it again and again.' : `${hd.name}: it bites into the slime. Wipe the goo up.` });
  const hud = h('div', { class: 'cc-hud ho-hud' },
    h('div', { class: 'cc-stat cc-depthstat' }, h('span', { text: 'Floor cleaned' }), meter, pctEl),
    h('div', { class: 'cc-stat' }, h('span', { text: 'Mop' }), h('em', { class: 'ho-head', 'data-head': hd.id, text: hd.name })),
    h('div', { class: 'cc-stat' }, h('span', { text: 'Strokes' }), h('em', { class: 'ho-strokes', text: '0' })));
  const wrap = h('div', { class: 'cc-boardwrap cc-square ho-wrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel ho-panel mg-skin ui-panel', role: 'group', 'aria-label': title, 'data-game': 'mop' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `MOP · ${title.toUpperCase()}` }), hud, wrap, status,
    h('p', { class: 'rp-help', text: 'Press and drag over the white goo to wipe it up. Thick goo needs more than one pass. Arrow keys sweep the mop one cell at a time. The floor is done at 92%.' }));
  panel.__state = s;
  root.append(panel);
  fitCanvas(wrap, canvas, W / H);

  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  const toCell = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * COLS) / r.width, y: ((e.clientY - r.top) * ROWS) / r.height }; };
  let ptr = null, trail = [], ended = false, endAt = 0, kx = COLS / 2, ky = ROWS / 2;
  canvas.addEventListener('pointerdown', (e) => { if (s.done) return; e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); const p = toCell(e); ptr = p; mopDown(s, p.x, p.y); });
  canvas.addEventListener('pointermove', (e) => {
    if (s.done || !s.down) return; e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) { const p = toCell(ev); ptr = p; mopMove(s, p.x, p.y); trail.push(p); if (trail.length > 10) trail.shift(); if (s.done) break; }
  });
  const up = (e) => { if (s.down) { canvas.releasePointerCapture?.(e.pointerId); mopUp(s); } ptr = null; trail = []; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || s.done) return;
    e.preventDefault();
    if (!s.down) mopDown(s, kx, ky);
    kx = Math.max(0, Math.min(COLS, kx + d[0])); ky = Math.max(0, Math.min(ROWS, ky + d[1]));
    mopMove(s, kx, ky); ptr = { x: kx, y: ky };
  });
  canvas.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) { mopUp(s); } });

  const gooLayer = document.createElement('canvas'); gooLayer.width = COLS; gooLayer.height = ROWS;
  const gctx = gooLayer.getContext('2d');
  function draw() {
    ctx.drawImage(floor, 0, 0);
    // the goo: one pixel per cell on a small layer, scaled up smooth, so the puddles read as soft slime (thicker is whiter and more opaque)
    const img = gctx.createImageData(COLS, ROWS);
    for (let i = 0; i < COLS * ROWS; i++) {
      const v = s.goo[i];
      const a = v <= 0.02 ? 0 : Math.min(235, 70 + v * 190);
      img.data[i * 4] = 226; img.data[i * 4 + 1] = 248; img.data[i * 4 + 2] = 236; img.data[i * 4 + 3] = a;
    }
    gctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(gooLayer, 0, 0, W, H);
    // the mop: a handle going up out of the board and a head the width of its reach
    if (ptr) {
      const px = ptr.x * K, py = ptr.y * K;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = '#8c6b43'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(px + 26, py - 150); ctx.lineTo(px + 4, py - 6); ctx.stroke();
      const absorber = s.head !== 'plain';
      ctx.fillStyle = absorber ? '#4fd3c0' : '#c9c1a8'; ctx.strokeStyle = '#1b262e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect?.(px - 38, py - 10, 76, 22, 8); if (!ctx.roundRect) ctx.rect(px - 38, py - 10, 76, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let i = -30; i <= 30; i += 10) ctx.fillRect(px + i, py - 5, 2, 12);
      ctx.restore();
    }
    if (s.done) { ctx.fillStyle = 'rgba(160,255,230,.12)'; ctx.fillRect(0, 0, W, H); }
  }
  function hudStep() {
    const c = cleared(s);
    const pct = Math.round(c * 100);
    pctEl.textContent = `${pct}%`; fill.style.width = `${pct}%`; meter.setAttribute('aria-valuenow', String(pct));
    panel.querySelector('.ho-strokes').textContent = String(s.strokes);
    if (!s.done) status.textContent = c >= 0.7 ? 'Nearly there. Get the last patches.' : c > 0 ? (s.head === 'plain' ? 'It is coming up, slowly. Keep wiping.' : 'It is lifting well. Keep wiping.') : status.textContent;
  }
  const stop = loop(() => {
    draw(); hudStep();
    if (s.done && !ended) {
      if (!endAt) { endAt = performance.now(); status.textContent = 'Clean. A real floor.'; }
      if (performance.now() - endAt > (reducedMotion() ? 100 : 700)) { ended = true; stop(); card(); }
    }
  });
  function card() {
    const r = s.result;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: 'Continue' });
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    const c = h('div', { class: 'rp-result ui-card is-ok ho-card', role: 'status' }, h('b', { class: 'rp-stars', text: 'FLOOR CLEAN' }),
      h('span', { text: `${r.strokes} strokes with the ${headOf(r.head).name.toLowerCase()}.` }), go);
    panel.append(c); go.focus({ preventScroll: true });
  }
  canvas.focus({ preventScroll: true });
  return promise;
}
