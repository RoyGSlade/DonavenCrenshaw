// Assembly repair on screen (v2/PLAN.md section 5). One canvas draws the housing (a glowing socket outline, the parts already bolted in) and
// the tray (loose parts, then the bolts while a part is being bolted). Drag a part, turn it with the two thumb buttons (Q and E or the wheel on
// a desktop), let go over the glowing outline: it settles in with a click, or a wrong part bounces back with a red flash. Then drag each bolt
// to a glowing hole and tap it: the real Screw game (screw.js, screwView.js) runs full screen in the same overlay, with the clock still running.
// The HUD is drawn bars and plain words. Rules live in assembly.js; nothing here decides anything.
import * as A from './assembly.js';
import { createScrew, screwGiveUp } from './screw.js';
import { playScrew } from './screwView.js';
import { setupScrew } from './setup.js';
import { h, loop, ensureStyle as chainStyle } from './craftChainView.js';

const TAU = Math.PI * 2;
const TEAL = '#4fd6cc', TEAL_SOFT = 'rgba(79,214,204,';
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numWord = (n) => NUM[n] ?? String(n);

function ensureStyle() {
  if (typeof document === 'undefined' || document.querySelector('link[data-assembly]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./assembly.css', import.meta.url).href; link.dataset.assembly = '';
  document.head.append(link);
}

/** The outer edges of a set of cells (unit squares), for drawing an outline round the whole shape. Cached by the cells. */
const EDGES = new Map();
function edgesOf(cells) {
  const key = A.keyOf(cells);
  if (EDGES.has(key)) return EDGES.get(key);
  const has = new Set(cells.map((c) => `${c[0]},${c[1]}`)), out = [];
  for (const [x, y] of cells) {
    if (!has.has(`${x},${y - 1}`)) out.push([x, y, x + 1, y]);
    if (!has.has(`${x},${y + 1}`)) out.push([x, y + 1, x + 1, y + 1]);
    if (!has.has(`${x - 1},${y}`)) out.push([x, y, x, y + 1]);
    if (!has.has(`${x + 1},${y}`)) out.push([x + 1, y, x + 1, y + 1]);
  }
  EDGES.set(key, out);
  return out;
}

export function playAssembly(root, { state, title = 'Rebuild the unit', reducedMotion = () => false } = {}) {
  ensureStyle(); chainStyle();
  const s = state;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  // A thumb is not a mouse: the drop radii are the plan's 12 and 6 units for the rules, wider for the hand (a board 1000 units wide is 390 px on a phone).
  s.snap = Math.max(s.snap, coarse ? 40 : 24); s.boltSnap = Math.max(s.boltSnap, coarse ? 30 : 14);

  // ---- the HUD: drawn bars and pips, plain words ----------------------------------------------------------------------------------
  const clockFill = h('i'), clockWord = h('em', { text: 'plenty of time' });
  const pips = (n, cls) => Array.from({ length: n }, () => h('i', { class: cls }));
  const partPips = pips(s.sockets.length, 'asm-pip'), partWord = h('em', { text: '' });
  const boltPips = h('span', { class: 'asm-pips', role: 'img', 'aria-label': 'Bolts of this part' }), boltWord = h('em', { text: 'none to place yet' });
  const wrongPips = pips(A.WRONG_MAX, 'asm-pip asm-wrong'), wrongWord = h('em', { text: 'none yet' });
  const stat = (label, ...kids) => h('div', { class: 'cc-stat asm-stat' }, h('span', { text: label }), ...kids);
  const hud = h('div', { class: 'cc-hud asm-hud' },
    stat('Time', h('div', { class: 'cc-meter asm-clock', role: 'img', 'aria-label': 'Time left on the clock' }, clockFill), clockWord),
    stat('Parts', h('span', { class: 'asm-pips', role: 'img', 'aria-label': 'Parts fitted' }, ...partPips), partWord),
    stat('Bolts', boltPips, boltWord),
    stat('Wrong fits', h('span', { class: 'asm-pips', role: 'img', 'aria-label': 'Wrong fits so far' }, ...wrongPips), wrongWord));

  const canvas = h('canvas', { class: 'cc-canvas asm-canvas', 'aria-label': 'A broken unit with a glowing socket, and a tray of parts. Drag a part into the socket.' });
  const ctx = canvas.getContext('2d');
  const host = h('div', { class: 'asm-screwhost', hidden: true });
  const wrap = h('div', { class: 'cc-boardwrap asm-board' }, canvas, host);
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'Pick the part that fits the glowing outline. Turn it until the shape matches, then drag it in.' });
  const left = h('button', { type: 'button', class: 'ui-btn asm-turn', 'data-turn': 'left', 'aria-label': 'Turn the part left', text: '↺ Turn left' });
  const right = h('button', { type: 'button', class: 'ui-btn asm-turn', 'data-turn': 'right', 'aria-label': 'Turn the part right', text: 'Turn right ↻' });
  const hint = h('span', { class: 'asm-keys', text: 'Q and E, or the wheel, turn it too' });
  const foot = h('div', { class: 'rp-foot cc-row asm-actions' }, left, right, hint);
  const panel = h('section', { class: 'rp-panel cc-panel asm-panel mg-skin ui-panel', role: 'group', 'aria-label': `Assembly: ${title}`, 'data-game': 'assembly' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `ASSEMBLY · ${String(title).toUpperCase()}` }), hud, wrap, status, foot);
  panel.__state = s;
  root.append(panel);

  // ---- the board's size and the wide or tall layout --------------------------------------------------------------------------------
  let scale = 1, dpr = 1;
  function fit() {
    const aw = wrap.clientWidth, ah = wrap.clientHeight;
    if (!aw || !ah) return;
    const w = Math.min(aw / 1000, ah / 620), t = Math.min(aw / 620, ah / 1000);
    const kind = t > w * 1.0001 ? 'tall' : 'wide';
    if (kind !== s.layoutKind) A.relayout(s, kind);
    scale = kind === 'tall' ? t : w;
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const cw = Math.max(120, Math.floor(s.layout.W * scale)), ch = Math.floor(s.layout.H * scale);
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);
  requestAnimationFrame(fit);

  const toBoard = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * s.layout.W) / r.width, y: ((e.clientY - r.top) * s.layout.H) / r.height }; };
  panel.__view = () => { const r = canvas.getBoundingClientRect(); return { kind: s.layoutKind, scale, left: r.left, top: r.top, width: r.width, height: r.height, k: r.width / s.layout.W, screw: Boolean(screwLive), card: Boolean(card) }; };

  // ---- animation bits the rules do not know about ---------------------------------------------------------------------------------------
  const vis = new Map(); // piece id -> { ox, oy, flash, pop }
  const fx = [];         // sparks and rings
  const vOf = (id) => { let v = vis.get(id); if (!v) { v = { ox: 0, oy: 0, flash: 0, pop: 0 }; vis.set(id, v); } return v; };
  let shake = 0, now = 0;

  // ---- input -----------------------------------------------------------------------------------------------------------------------
  let drag = null; // { kind: 'piece'|'bolt'|'tap', id, dx, dy, moved, sx, sy }
  const pieceHit = (p, x, y, pad) => {
    const cells = A.pieceCells(p), c = s.layout.cell;
    return cells.some(([cx, cy]) => x >= p.x + cx * c - pad && x <= p.x + (cx + 1) * c + pad && y >= p.y + cy * c - pad && y <= p.y + (cy + 1) * c + pad);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (s.done || screwLive || card) return;
    e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
    const { x, y } = toBoard(e);
    if (s.phase === 'fit') {
      const loose = A.trayPieces(s).slice().reverse();
      const p = loose.find((q) => pieceHit(q, x, y, 0)) || loose.find((q) => pieceHit(q, x, y, coarse ? 14 : 6));
      if (!p) return;
      const c = { x: p.x + A.pieceSize(s, p).w / 2, y: p.y + A.pieceSize(s, p).h / 2 };
      A.grab(s, p.id);
      // the piece comes under the finger and lifts a little (a phone finger hides what it holds, so the middle sits above the touch)
      drag = { kind: 'piece', id: p.id, dx: c.x - x, dy: c.y - y - (coarse ? 40 : 0), moved: false, sx: x, sy: y };
      A.carry(s, x + drag.dx, y + drag.dy);
      refresh(); return;
    }
    if (s.phase === 'bolt') {
      const seated = s.bolts.find((b) => b.seated && !b.tight && Math.hypot(b.x - x, b.y - y) <= 34);
      if (seated) { drag = { kind: 'tap', id: seated.id, sx: x, sy: y, moved: false }; return; }
      const free = s.bolts.find((b) => !b.seated && !b.tight && Math.hypot(b.x - x, b.y - y) <= (coarse ? 40 : 30));
      if (free) { A.grabBolt(s, free.id); drag = { kind: 'bolt', id: free.id, dx: free.x - x, dy: free.y - y - (coarse ? 30 : 0), moved: false, sx: x, sy: y }; A.carryBolt(s, x + drag.dx, y + drag.dy); }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return; e.preventDefault();
    const { x, y } = toBoard(e);
    if (Math.hypot(x - drag.sx, y - drag.sy) > 6) drag.moved = true;
    if (drag.kind === 'piece') A.carry(s, x + drag.dx, y + drag.dy);
    else if (drag.kind === 'bolt') A.carryBolt(s, x + drag.dx, y + drag.dy);
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag; drag = null; canvas.releasePointerCapture?.(e.pointerId);
    if (d.kind === 'piece') {
      const p = A.pieceOf(s, d.id), at = { x: p.x, y: p.y };
      const out = A.drop(s);
      if (out && out !== 'snapped') { const v = vOf(p.id); v.ox = at.x - p.x; v.oy = at.y - p.y; if (out === 'wrong') { v.flash = 1; shake = 1; } else if (out === 'turn') v.flash = 0.6; }
      if (out === 'snapped') { vOf(p.id).pop = 1; burst(p.x, p.y, A.pieceSize(s, p)); }
      else if (!d.moved) { /* a tap: it is selected, ready to turn */ }
    } else if (d.kind === 'bolt') {
      const b = A.boltOf(s, d.id), at = { x: b.x, y: b.y };
      const out = A.dropBolt(s);
      if (out === 'seated') ring(b.x, b.y); else if (out === 'miss') { const v = vOf(b.id); v.ox = at.x - b.x; v.oy = at.y - b.y; }
    } else if (d.kind === 'tap' && !d.moved) runScrew(A.boltOf(s, d.id));
    refresh();
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (s.phase !== 'fit' || s.done || screwLive || card) return; e.preventDefault(); turnNow(e.deltaY > 0 ? 1 : -1); }, { passive: false });

  function turnNow(dir) {
    if (s.done || screwLive || card || s.phase !== 'fit' || !s.selected) return;
    A.turn(s, dir);
    refresh();
  }
  left.addEventListener('click', () => turnNow(-1)); right.addEventListener('click', () => turnNow(1));
  const onKey = (e) => {
    if (!panel.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'q' || e.key === 'Q') { turnNow(-1); e.preventDefault(); } else if (e.key === 'e' || e.key === 'E') { turnNow(1); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);

  // ---- the Screw close-up, in the same overlay ----------------------------------------------------------------------------------------------
  let screwLive = null;
  async function runScrew(b) {
    if (!b || screwLive || s.done) return;
    const gs = createScrew({ setup: setupScrew({ tier: 0, level: 1 }) });
    screwLive = gs; host.hidden = false; canvas.hidden = true; foot.hidden = true; status.hidden = true;
    const result = await playScrew(host, { state: gs, what: 'bolt', reducedMotion });
    host.replaceChildren(); host.hidden = true; canvas.hidden = false; foot.hidden = false; status.hidden = false;
    screwLive = null;
    if (s.done) return;
    const how = A.screwed(s, b.id, result);
    if (how === 'stripped') status.textContent = 'That head stripped. The bolt is back in the tray: set it in again.';
    else if (s.phase === 'bolt') status.textContent = 'Snug. Tap the next bolt to drive it in, or drag the rest to their holes.';
    refresh();
    requestAnimationFrame(fit);
  }

  // ---- effects -------------------------------------------------------------------------------------------------------------------------------
  function burst(x, y, z) { if (reducedMotion()) return; for (let i = 0; i < 14; i++) fx.push({ kind: 'spark', x: x + Math.random() * z.w, y: y + Math.random() * z.h, vx: (Math.random() - 0.5) * 160, vy: -30 - Math.random() * 120, t: 0.5 }); fx.push({ kind: 'ring', x: x + z.w / 2, y: y + z.h / 2, r: 10, t: 0.4 }); }
  function ring(x, y) { if (!reducedMotion()) fx.push({ kind: 'ring', x, y, r: 6, t: 0.3 }); }

  // ---- events -> plain words ------------------------------------------------------------------------------------------------------------------
  let card = null, finishAt = 0, finished = false;
  function onEvents() {
    for (const ev of s.events.splice(0)) {
      if (ev.type === 'snapped') status.textContent = 'In. Now the bolts: drag each one to a glowing hole, then tap it to drive it down.';
      else if (ev.type === 'wrong') status.textContent = 'That one is the wrong part. It bounced off. Look at the outline again.';
      else if (ev.type === 'bounce' && ev.why === 'turn') status.textContent = 'Right part, wrong way round. Turn it until the shape matches.';
      else if (ev.type === 'bounce' && ev.why === 'close') status.textContent = 'Close. Bring it right onto the outline.';
      else if (ev.type === 'part-done') status.textContent = `The ${A.ordinal(ev.index)} part is bolted down.`;
      else if (ev.type === 'next-socket') status.textContent = `The ${A.ordinal(ev.index)} socket is open. Pick the part that fits it.`;
      else if (ev.type === 'bolt-miss') status.textContent = 'Not on a hole. Drop the bolt right on a glowing ring.';
      else if (ev.type === 'seated') status.textContent = 'The bolt sits loose. Tap it to drive it in with the screwdriver.';
      else if (ev.type === 'tight') { const b = A.boltOf(s, ev.id); if (b) ring(b.x, b.y); }
      else if (ev.type === 'done') status.textContent = ev.success ? 'The unit is back together.' : 'Out of time.';
    }
  }
  function refresh() {
    onEvents();
    const f = A.clockShare(s);
    clockFill.style.width = `${100 * f}%`; clockFill.dataset.low = f < 0.33 ? '1' : '0';
    clockWord.textContent = A.clockWords(s);
    const doneN = s.sockets.filter((k) => k.done).length;
    partPips.forEach((p, i) => { p.className = `asm-pip${i < doneN ? ' on' : i === s.active && !s.done ? ' now' : ''}`; });
    partWord.textContent = s.done ? (s.result.success ? 'all fitted' : `${numWord(doneN)} fitted`) : s.phase === 'bolt' ? `bolt the ${A.ordinal(s.active)} part` : `fit the ${A.ordinal(s.active)} part`;
    const nb = s.bolts ? s.bolts.length : A.socketOf(s)?.bolts || 0;
    if (boltPips.children.length !== nb) boltPips.replaceChildren(...pips(nb, 'asm-pip'));
    [...boltPips.children].forEach((p, i) => { const b = s.bolts?.[i]; p.className = `asm-pip${b?.tight ? ' on' : b?.seated ? ' half' : ''}`; });
    const tight = A.boltsTight(s);
    boltWord.textContent = !s.bolts ? (s.phase === 'fit' ? 'fit the part first' : '') : tight >= s.bolts.length ? 'all snug' : tight ? `${numWord(tight)} snug` : 'none snug yet';
    wrongPips.forEach((p, i) => { p.className = `asm-pip asm-wrong${i < s.wrongFits ? ' on' : ''}`; });
    wrongWord.textContent = A.wrongWords(s.wrongFits);
    left.disabled = right.disabled = s.phase !== 'fit' || !s.selected || s.done;
    panel.dataset.phase = s.phase;
    if (s.done && !finishAt) finishAt = now || performance.now();
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------------------------------------
  const rr = (g, x, y, w, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  function outline(g, cells, ox, oy, c) { g.beginPath(); for (const [x1, y1, x2, y2] of edgesOf(cells)) { g.moveTo(ox + x1 * c, oy + y1 * c); g.lineTo(ox + x2 * c, oy + y2 * c); } g.stroke(); }
  function drawPiece(g, p, { x, y, alpha = 1, lift = 0, glow = null, flash = 0, pop = 0, dim = false } = {}) {
    const cells = A.pieceCells(p), c = s.layout.cell, sc = 1 + pop * 0.07 + lift * 0.04;
    const z = A.pieceSize(s, p);
    g.save(); g.globalAlpha = alpha * (dim ? 0.4 : 1);
    g.translate(x + z.w / 2, y + z.h / 2); g.scale(sc, sc); g.translate(-z.w / 2, -z.h / 2);
    if (lift) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 16; g.shadowOffsetY = 10; }
    const grad = g.createLinearGradient(0, 0, z.w, z.h); grad.addColorStop(0, p.color); grad.addColorStop(1, '#2a3b4a');
    g.fillStyle = grad; for (const [cx, cy] of cells) g.fillRect(cx * c - 0.4, cy * c - 0.4, c + 0.8, c + 0.8);
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,255,255,.10)'; for (const [cx, cy] of cells) g.fillRect(cx * c + 3, cy * c + 3, c - 6, 5);
    g.strokeStyle = 'rgba(10,20,30,.28)'; g.lineWidth = 1; for (const [cx, cy] of cells) g.strokeRect(cx * c + 0.5, cy * c + 0.5, c - 1, c - 1);
    g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = glow || '#0c1824'; outline(g, cells, 0, 0, c);
    if (flash > 0) { g.globalAlpha = flash * 0.6; g.fillStyle = '#ff4d3d'; for (const [cx, cy] of cells) g.fillRect(cx * c, cy * c, c, c); }
    g.restore();
  }
  function drawBolt(g, x, y, { tight = false, loose = false, lift = 0, pulse = 0 } = {}) {
    g.save(); g.translate(x, y);
    if (lift) { g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10; g.shadowOffsetY = 7; }
    const r = tight ? 12 : 15;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
    const bg = g.createLinearGradient(-r, -r, r, r); bg.addColorStop(0, tight ? '#7e8c97' : '#e2e9ee'); bg.addColorStop(1, tight ? '#3b4852' : '#7f8d98');
    g.fillStyle = bg; g.fill(); g.shadowColor = 'transparent'; g.lineWidth = 2; g.strokeStyle = '#1c2832'; g.stroke();
    g.fillStyle = '#26323c'; g.fillRect(-r * 0.55, -1.6, r * 1.1, 3.2); g.fillRect(-1.6, -r * 0.55, 3.2, r * 1.1);
    if (loose) { g.strokeStyle = `rgba(255,190,110,${0.55 + 0.4 * pulse})`; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 24 + 2 * pulse, 0, TAU); g.stroke(); }
    g.restore();
  }
  function draw(dt) {
    const L = s.layout, k = scale * dpr, g = ctx;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    g.save(); if (shake > 0 && !reducedMotion()) g.translate(Math.sin(now / 18) * 5 * shake, 0);
    // the housing: a steel bay with rivets, and the unit's name
    const H = L.housing, T = L.tray;
    const panelFill = (a, label, hot) => {
      const gr = g.createLinearGradient(a.x, a.y, a.x, a.y + a.h); gr.addColorStop(0, '#16222f'); gr.addColorStop(1, '#0c141d');
      rr(g, a.x, a.y, a.w, a.h, 14); g.fillStyle = gr; g.fill(); g.lineWidth = 2; g.strokeStyle = hot ? '#3f6a72' : '#2a4152'; g.stroke();
      g.fillStyle = '#3a5163'; for (const [rx, ry] of [[a.x + 12, a.y + 12], [a.x + a.w - 12, a.y + 12], [a.x + 12, a.y + a.h - 12], [a.x + a.w - 12, a.y + a.h - 12]]) { g.beginPath(); g.arc(rx, ry, 3.2, 0, TAU); g.fill(); }
      g.fillStyle = '#7f98aa'; g.font = '700 14px Consolas, monospace'; g.textAlign = 'left'; g.fillText(label, a.x + 26, a.y + 24);
    };
    panelFill(H, `BROKEN UNIT · ${String(A.worldOf({ system: s.system }).systemName).toUpperCase()}`, true);
    // faint wiring across the housing
    g.strokeStyle = 'rgba(79,214,204,.07)'; g.lineWidth = 2; for (let i = 1; i < H.cols; i++) { g.beginPath(); g.moveTo(H.x + (H.w / H.cols) * i, H.y + 34); g.lineTo(H.x + (H.w / H.cols) * i, H.y + H.h - 14); g.stroke(); }
    g.beginPath(); g.moveTo(H.x + 14, H.y + H.h / 2 + 10); g.lineTo(H.x + H.w - 14, H.y + H.h / 2 + 10); g.stroke();
    panelFill(T, s.phase === 'bolt' ? 'BOLTS' : 'PARTS TRAY', false);
    // bays still to open: a dim empty plate each (the next socket shows when this part is bolted)
    s.sockets.forEach((q, i) => { if (i > s.active && !s.done) { const z = { w: q.w * L.cell, h: q.h * L.cell }; g.fillStyle = 'rgba(30,48,62,.5)'; rr(g, q.x - 6, q.y - 6, z.w + 12, z.h + 12, 8); g.fill(); g.fillStyle = 'rgba(127,152,170,.35)'; g.font = '700 13px Consolas, monospace'; g.textAlign = 'center'; g.fillText('NEXT BAY', q.x + z.w / 2, q.y + z.h / 2 + 4); } });
    // the open socket: a glowing outline, brighter when the held part would fit
    const act = A.socketOf(s);
    if (act && !s.done && s.phase === 'fit') {
      const held = s.held ? A.pieceOf(s, s.held) : null;
      const would = held && Math.hypot(held.x - act.x, held.y - act.y) <= s.snap && A.fitsSocket(A.outlineOfPiece(held), held.rot, A.outlineById(act.outline));
      g.save(); g.shadowColor = would ? '#9fe870' : TEAL; g.shadowBlur = 14 + 10 * pulse;
      g.fillStyle = would ? 'rgba(159,232,112,.20)' : `${TEAL_SOFT}${0.10 + 0.06 * pulse})`; for (const [cx, cy] of act.cells) g.fillRect(act.x + cx * L.cell, act.y + cy * L.cell, L.cell, L.cell);
      g.lineWidth = 3; g.setLineDash([9, 6]); g.lineDashOffset = -now / 60; g.strokeStyle = would ? '#b9f58f' : '#7bece3'; outline(g, act.cells, act.x, act.y, L.cell);
      g.restore();
    }
    // parts already fitted, with their bolts
    s.pieces.forEach((p) => { if (p.placed) { drawPiece(g, p, { x: p.x, y: p.y, pop: vOf(p.id).pop }); } });
    s.sockets.forEach((q, i) => {
      if (!q.done && !(i === s.active && s.phase === 'bolt')) return;
      q.holes.forEach((c, hi) => {
        const hx = q.x + (c[0] + 0.5) * L.cell, hy = q.y + (c[1] + 0.5) * L.cell, b = i === s.active && s.bolts ? s.bolts.find((o) => o.hx === hx && o.hy === hy) : null;
        if (q.done) { drawBolt(g, hx, hy, { tight: true }); return; }
        if (!b || (!b.seated && !b.tight)) { g.save(); g.lineWidth = 3; g.strokeStyle = `${TEAL_SOFT}${0.65 + 0.3 * pulse})`; g.shadowColor = TEAL; g.shadowBlur = 10; g.beginPath(); g.arc(hx, hy, 13 + pulse * 2, 0, TAU); g.stroke(); g.fillStyle = 'rgba(5,12,18,.8)'; g.beginPath(); g.arc(hx, hy, 9, 0, TAU); g.fill(); g.restore(); }
      });
    });
    // the tray: loose parts (or, while a part is being bolted, its bolts)
    if (s.phase === 'bolt' && s.bolts) {
      s.bolts.forEach((b) => {
        const v = vOf(b.id);
        if (b.seated || b.tight) { drawBolt(g, b.x, b.y, { tight: b.tight, loose: !b.tight, pulse }); return; }
        drawBolt(g, b.x + v.ox, b.y + v.oy, { lift: s.held === b.id ? 1 : 0 });
      });
    } else {
      for (const p of A.trayPieces(s)) {
        if (s.held === p.id) continue;
        const v = vOf(p.id);
        drawPiece(g, p, { x: p.x + v.ox, y: p.y + v.oy, flash: v.flash, glow: s.selected === p.id ? '#ffe08a' : null, dim: s.done });
      }
      if (s.held) { const p = A.pieceOf(s, s.held); drawPiece(g, p, { x: p.x, y: p.y, lift: 1, glow: '#ffe08a' }); }
    }
    // bolts that went home or stripped fly back
    for (const f of fx) {
      if (f.kind === 'spark') { g.globalAlpha = Math.max(0, f.t * 2); g.fillStyle = '#ffe9a8'; g.fillRect(f.x - 2, f.y - 2, 4, 4); g.globalAlpha = 1; }
      else { g.globalAlpha = Math.max(0, f.t * 2.4); g.strokeStyle = '#bff7f1'; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    }
    g.restore();
    void dt;
  }

  // ---- the loop: the clock, the animations, the drawing, the end ------------------------------------------------------------------------------
  let paused = false, lastNow = 0;
  panel.__pause = (on) => { paused = !!on; };
  const stop = loop((dt, t) => {
    now = t;
    const real = lastNow ? Math.min(0.5, (t - lastNow) / 1000) : 0; lastNow = t;
    if (!paused && !s.done && !card) A.tick(s, real);
    if (s.done && screwLive && !screwLive.done) screwGiveUp(screwLive);
    for (const v of vis.values()) { v.ox *= Math.pow(0.0006, dt); v.oy *= Math.pow(0.0006, dt); if (Math.abs(v.ox) < 0.3) v.ox = 0; if (Math.abs(v.oy) < 0.3) v.oy = 0; v.flash = Math.max(0, v.flash - dt * 2); v.pop = Math.max(0, v.pop - dt * 4); }
    shake = Math.max(0, shake - dt * 3.5);
    for (const f of fx) { f.t -= dt; if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; } else f.r += 90 * dt; }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t <= 0) fx.splice(i, 1);
    refresh();
    draw(dt);
    if (s.done && !card && !screwLive && now - finishAt > (reducedMotion() ? 300 : 700)) showCard();
  });

  // ---- the end: a card over the board ---------------------------------------------------------------------------------------------------------------
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  function showCard() {
    const r = s.result;
    const stars = r.success ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : 'STILL BROKEN';
    const go = h('button', { type: 'button', class: 'primary ui-btn cc-go', text: r.success ? 'Continue' : 'Step back' });
    const share = r.timeLeft / r.clock;
    const clockLine = share > 0.6 ? 'plenty of the clock left' : share > 0.35 ? 'about half the clock left' : share > 0.1 ? 'not much clock left' : 'the clock nearly ran out';
    const lines = r.success ? [
      `The ${r.systemName.toLowerCase()} is back together: ${numWord(r.parts)} parts, ${r.bolts === 1 ? 'one bolt' : `${numWord(r.bolts)} bolts`}.`,
      `Quality ${r.quality}. Stars at 65 and 90.`,
      `Wrong fits: ${A.wrongWords(r.wrongFits)}. ${clockLine[0].toUpperCase()}${clockLine.slice(1)}.${s.setup.qualityBonus ? ` Your Repair quality points add ${s.setup.qualityBonus}.` : ''}`,
      r.stripped ? `${numWord(r.stripped)} stripped bolt${r.stripped === 1 ? '' : 's'} on the way.` : 'Every bolt went in clean.',
      `+${r.xp} Repair XP.`,
    ] : [
      `Out of time. The ${r.systemName} stays broken.`,
      `${numWord(r.done)} of ${numWord(r.parts)} parts were bolted down.`,
      'Try again at the bench for one scrap (a spoiled gasket), or take the other way.',
    ];
    card = h('div', { class: `rp-result ui-card asm-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'fixed' : 'broken', 'data-stars': String(r.stars) },
      h('b', { class: 'rp-stars', text: stars }), ...lines.map((t, i) => h('span', { class: 'cc-line', 'data-line': ['summary', 'quality', 'detail', 'bolts', 'xp'][i] || 'detail', text: t })), go);
    wrap.append(card); canvas.classList.add('is-dim');
    go.addEventListener('click', () => { stop(); document.removeEventListener('keydown', onKey); panel.remove(); finish(s.result); });
    go.focus({ preventScroll: true });
  }
  refresh();
  return promise;
}
