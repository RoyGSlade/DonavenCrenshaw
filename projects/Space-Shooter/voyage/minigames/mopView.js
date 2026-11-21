// Mop the goo on screen (opening track C, scene 1): the holodeck gym floor seen from above, under the real goo (the gym's own goo art),
// and a mop that follows your finger or the mouse. Wipe strokes lift the goo, leave wet smears that dry, and the floor underneath shines.
// The head you fitted decides how much each pass lifts (mop.js). The floor fills the screen: a wide board on a landscape screen, a tall one
// on a phone held upright. Keyboard: the arrow keys sweep the mop one cell at a time. No digits: a bar and a word.
import { createMop, mopDown, mopMove, mopUp, cleared, headOf, CLEAR_AT } from './mop.js';
import { h, loop, ensureStyle } from './craftChainView.js';
import { ensureHandsOnStyle } from './handsOnKit.js';

const ART = (name) => new URL(`../onfoot/art/look/${name}.webp`, import.meta.url).href;
const imgs = {};
const img = (name) => {
  if (!imgs[name]) { const i = new Image(); i.src = ART(name); imgs[name] = i; }
  return imgs[name];
};
const ready = (i) => i.complete && i.naturalWidth > 0;
const SPLATS = ['prop-goo-splat-a', 'prop-goo-splat-b', 'prop-goo-splat-c', 'prop-goo-splat-d'];
const TAU = Math.PI * 2;
export const cleanWord = (c) => (c < 0.05 ? 'Slimy' : c < 0.4 ? 'Streaky' : c < 0.75 ? 'Getting there' : c < CLEAR_AT ? 'Nearly clean' : 'Clean');

/** Pick the grid that fills the screen: tall on a portrait phone, wide otherwise. */
export const gridFor = (w = innerWidth, hgt = innerHeight) => (hgt > w * 1.1 ? { cols: 14, rows: 22 } : { cols: 24, rows: 14 });

/** opts: { state, seed, mess, head, title, reducedMotion }. Resolves with the result. */
export function playMop(root, { state, seed = 1, mess = 0, head = 'plain', title = 'Mop the goo', reducedMotion = () => false } = {}) {
  ensureStyle(); ensureHandsOnStyle();
  const s = state || createMop({ seed, mess, head, ...gridFor() });
  const COLS = s.cols, ROWS = s.rows, K = 36;              // pixels per cell on the canvas; CSS scales it to the screen
  const W = COLS * K, H = ROWS * K;
  const canvas = h('canvas', { class: 'ho-canvas ho-mopcanvas', width: String(W), height: String(H), tabindex: '0', 'aria-label': 'The gym floor under white goo. Drag the mop over the goo to wipe it up, or use the arrow keys.' });
  const ctx = canvas.getContext('2d');
  const word = h('em', { class: 'ho-cleanword', text: 'Slimy' });
  const fill = h('i');
  const meter = h('div', { class: 'cc-meter ho-meter', role: 'progressbar', 'aria-label': 'Floor cleaned', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, fill, h('b', { class: 'ho-mark', style: `left:${CLEAR_AT * 100}%` }));
  const hd = headOf(s.head);
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: s.head === 'plain' ? 'Slime is sticky: a plain head lifts little on each pass. Keep scrubbing.' : `${hd.name}: it bites into the slime. Scrub it up.` });
  const hud = h('div', { class: 'cc-hud ho-hud ho-mophud' },
    h('div', { class: 'cc-stat cc-depthstat' }, h('span', { text: 'Floor' }), meter, word),
    h('div', { class: 'cc-stat' }, h('span', { text: 'Mop' }), h('em', { class: 'ho-head', 'data-head': hd.id, text: hd.name })));
  const wrap = h('div', { class: 'ho-wrap ho-mopwrap' }, canvas);
  const panel = h('section', { class: 'rp-panel cc-panel ho-panel ho-mop mg-skin ui-panel', role: 'group', 'aria-label': title, 'data-game': 'mop', 'data-cols': COLS },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `MOP · ${title.toUpperCase()}` }), hud, wrap, status,
    h('p', { class: 'rp-help', text: 'Press and drag over the white goo to scrub it up. Thick goo needs more than one pass. Arrow keys sweep the mop one cell at a time.' }));
  panel.__state = s;
  root.append(panel);

  // Size the board to the free space: the whole stage minus the HUD, never cropped (the aspect is the grid's).
  const fit = () => {
    const aw = wrap.clientWidth, ah = wrap.clientHeight;
    if (!aw || !ah) return;
    const wpx = Math.floor(Math.min(aw, ah * (W / H)));
    canvas.style.width = `${wpx}px`; canvas.style.height = `${Math.floor(wpx * H / W)}px`;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);

  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  const toCell = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * COLS) / r.width, y: ((e.clientY - r.top) * ROWS) / r.height }; };
  let ptr = null, ended = false, endAt = 0, kx = COLS / 2, ky = ROWS / 2, prev = null, angle = 0;
  canvas.addEventListener('pointerdown', (e) => { if (s.done) return; e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); const p = toCell(e); ptr = p; prev = p; mopDown(s, p.x, p.y); });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCell(e); if (!s.down) { ptr = p; return; }   // the mop follows the finger or the mouse, wiping only while pressed
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) { const q = toCell(ev); smear(prev, q); prev = q; ptr = q; mopMove(s, q.x, q.y); if (s.done) break; }
  });
  const up = (e) => { if (s.down) { canvas.releasePointerCapture?.(e.pointerId); mopUp(s); } prev = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || s.done) return;
    e.preventDefault();
    if (!s.down) { mopDown(s, kx, ky); prev = { x: kx, y: ky }; }
    kx = Math.max(0, Math.min(COLS, kx + d[0])); ky = Math.max(0, Math.min(ROWS, ky + d[1]));
    smear(prev, { x: kx, y: ky }); prev = { x: kx, y: ky };
    mopMove(s, kx, ky); ptr = { x: kx, y: ky };
  });
  canvas.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) { mopUp(s); prev = null; } });

  // ---- layers -------------------------------------------------------------------------------------------------
  const floor = document.createElement('canvas'); floor.width = W; floor.height = H;          // the deck, the holo grid: drawn once the art is in
  let floorDone = false;
  const gooArt = document.createElement('canvas'); gooArt.width = W; gooArt.height = H;       // the goo art at its puddles: drawn once
  let gooDone = false;
  const mask = document.createElement('canvas'); mask.width = s.cols; mask.height = s.rows;   // one pixel a cell: where goo is left
  const mctx = mask.getContext('2d');
  const comp = document.createElement('canvas'); comp.width = W; comp.height = H;
  const cctx = comp.getContext('2d');
  const wet = document.createElement('canvas'); wet.width = W; wet.height = H;                // wet smears and shine: they dry
  const wctx = wet.getContext('2d');
  function smear(a, b) {
    if (!a || !b) return;
    const gx = (x) => x * K, gy = (y) => y * K;
    wctx.save(); wctx.lineCap = 'round'; wctx.lineJoin = 'round';
    wctx.strokeStyle = 'rgba(190,235,255,.34)'; wctx.lineWidth = 2.2 * K; wctx.beginPath(); wctx.moveTo(gx(a.x), gy(a.y)); wctx.lineTo(gx(b.x), gy(b.y)); wctx.stroke();
    wctx.strokeStyle = 'rgba(255,255,255,.28)'; wctx.lineWidth = 0.55 * K; wctx.beginPath(); wctx.moveTo(gx(a.x) - 6, gy(a.y) - 6); wctx.lineTo(gx(b.x) - 6, gy(b.y) - 6); wctx.stroke();
    wctx.restore();
    const dx = b.x - a.x, dy = b.y - a.y; if (Math.hypot(dx, dy) > 0.05) angle = Math.atan2(dy, dx);
  }
  function drawFloor() {
    const g = floor.getContext('2d');
    const tile = img('floor-deck-a');
    if (ready(tile)) { for (let y = 0; y < H; y += 288) for (let x = 0; x < W; x += 288) g.drawImage(tile, x, y, 288, 288); }
    else { g.fillStyle = '#26343e'; g.fillRect(0, 0, W, H); }
    const grid = img('prop-holo-floor-grid');
    if (ready(grid)) {
      const gw = Math.min(W * 0.46, H * 0.4);
      for (const [fx, fy] of s.cols > s.rows ? [[0.27, 0.5], [0.73, 0.5]] : [[0.5, 0.27], [0.5, 0.73]]) { g.globalAlpha = 0.9; g.drawImage(grid, fx * W - gw / 2, fy * H - gw / 2, gw, gw); }
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, W, H);
    floorDone = ready(tile) && ready(grid);
  }
  function drawGooArt() {
    const g = gooArt.getContext('2d');
    g.clearRect(0, 0, W, H);
    const all = [img('prop-goo-puddle-big'), ...SPLATS.map(img)];
    if (!all.every(ready)) return;
    s.puddles.forEach((p, i) => {
      const art = i % 3 === 0 ? all[0] : all[1 + (i % 4)];
      const size = p.r * 2.9 * K;
      g.save(); g.translate(p.cx * K, p.cy * K); g.rotate((i * 2.17) % TAU); g.drawImage(art, -size / 2, -size / 2, size, size); g.restore();
    });
    gooDone = true;
  }
  function paintMask() {
    const d = mctx.createImageData(s.cols, s.rows);
    for (let i = 0; i < s.cols * s.rows; i++) { const v = s.goo[i]; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255; d.data[i * 4 + 3] = v <= 0.02 ? 0 : Math.min(255, 60 + v * 330); }
    mctx.putImageData(d, 0, 0);
  }
  function draw(dt) {
    if (!floorDone) drawFloor();
    if (!gooDone) drawGooArt();
    ctx.drawImage(floor, 0, 0);
    // the goo: its art, kept only where goo is left (a smooth mask); thicker goo is more opaque
    paintMask();
    cctx.globalCompositeOperation = 'copy'; cctx.drawImage(gooArt, 0, 0);
    cctx.globalCompositeOperation = 'destination-in'; cctx.imageSmoothingEnabled = true; cctx.imageSmoothingQuality = 'high'; cctx.drawImage(mask, 0, 0, W, H);
    cctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(comp, 0, 0);
    // wet smears: they dry (fade) a little every frame, then the floor shines through
    wctx.globalCompositeOperation = 'destination-out'; wctx.fillStyle = `rgba(0,0,0,${Math.min(0.5, dt * 0.5)})`; wctx.fillRect(0, 0, W, H); wctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(wet, 0, 0);
    // the mop: it follows the finger, handle up and to the right, the head along the stroke
    if (ptr) {
      const px = ptr.x * K, py = ptr.y * K;
      ctx.save(); ctx.translate(px, py); ctx.lineCap = 'round';
      ctx.strokeStyle = '#8c6b43'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(34, -170); ctx.lineTo(4, -8); ctx.stroke();
      ctx.strokeStyle = '#5b4328'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(38, -170); ctx.lineTo(8, -8); ctx.stroke();
      const absorber = s.head !== 'plain';
      const grad = ctx.createLinearGradient(-45, 0, 45, 0); grad.addColorStop(0, absorber ? '#3fc4b0' : '#b5ad94'); grad.addColorStop(1, absorber ? '#7ff0d6' : '#e0d9c0');
      ctx.fillStyle = grad; ctx.strokeStyle = '#1b262e'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect?.(-46, -9, 92, 26, 9); if (!ctx.roundRect) ctx.rect(-46, -9, 92, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.2)'; for (let i = -36; i <= 36; i += 9) ctx.fillRect(i, -3, 2.5, 14);
      ctx.restore();
    }
    if (s.done) { ctx.fillStyle = 'rgba(190,255,235,.1)'; ctx.fillRect(0, 0, W, H); }
  }
  function hudStep() {
    const c = cleared(s), pct = Math.round(c * 100);
    word.textContent = cleanWord(c); fill.style.width = `${pct}%`; meter.setAttribute('aria-valuenow', String(pct));
    if (!s.done) status.textContent = c >= 0.7 ? 'Nearly there. Get the last patches.' : c > 0 ? (s.head === 'plain' ? 'It is coming up, slowly. Keep scrubbing.' : 'It is lifting well. Keep scrubbing.') : status.textContent;
  }
  const stop = loop((dt) => {
    draw(dt); hudStep();
    if (s.done && !ended) {
      if (!endAt) { endAt = performance.now(); status.textContent = 'Clean. A real floor.'; }
      if (performance.now() - endAt > (reducedMotion() ? 100 : 900)) { ended = true; stop(); card(); }
    }
  });
  function card() {
    const r = s.result;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: 'Continue' });
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    const c = h('div', { class: 'rp-result ui-card is-ok ho-card', role: 'status' }, h('b', { class: 'rp-stars', text: 'FLOOR CLEAN' }),
      h('span', { text: `Done with the ${headOf(r.head).name.toLowerCase()}. The floor shines.` }), go);
    panel.append(c); go.focus({ preventScroll: true });
  }
  return promise;
}
