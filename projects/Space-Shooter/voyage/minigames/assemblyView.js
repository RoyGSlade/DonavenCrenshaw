// Assembly repair on screen (v2/PLAN.md section 5). One canvas draws a dark machined casing with ONE large recessed socket (the open one) and a
// tray of machined parts; the other bays are a strip of small icons (done, open, locked). Drag a part (it grows to full size in the hand), turn it
// with the two thumb buttons (Q and E or the wheel on a desktop), let go over the glowing outline: it settles in with a click, or a wrong part
// bounces back with a red flash. Then the tray shrinks to a slim strip of bolts: drag each to a glowing ring and tap it, and the real Screw game
// (screw.js, screwView.js) runs full screen in the same overlay with the clock still running. The HUD is drawn bars and plain words.
// Rules live in assembly.js; nothing here decides anything.
import * as A from './assembly.js';
import { createScrew, screwGiveUp } from './screw.js';
import { playScrew } from './screwView.js';
import { setupScrew } from './setup.js';
import { h, loop, lcg, ensureStyle as chainStyle } from './craftChainView.js';

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

/** The outer edges of a set of cells with the side each faces: [x1, y1, x2, y2, 'n'|'s'|'w'|'e']. Cached by the cells. */
const EDGES = new Map();
function edgesOf(cells) {
  const key = A.keyOf(cells);
  if (EDGES.has(key)) return EDGES.get(key);
  const has = new Set(cells.map((c) => `${c[0]},${c[1]}`)), out = [];
  for (const [x, y] of cells) {
    if (!has.has(`${x},${y - 1}`)) out.push([x, y, x + 1, y, 'n']);
    if (!has.has(`${x},${y + 1}`)) out.push([x, y + 1, x + 1, y + 1, 's']);
    if (!has.has(`${x - 1},${y}`)) out.push([x, y, x, y + 1, 'w']);
    if (!has.has(`${x + 1},${y}`)) out.push([x + 1, y, x + 1, y + 1, 'e']);
  }
  EDGES.set(key, out);
  return out;
}

/** A brushed-metal tile: fine horizontal streaks on a mid grey, used as a pattern over every part and the casing. */
function brushed() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'), r = lcg(5);
  g.fillStyle = '#8a97a2'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { const y = r() * 128, x = r() * 128, w = 20 + r() * 90; g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.14)'; g.lineWidth = 0.6 + r() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (r() - 0.5) * 1.2); g.stroke(); if (x + w > 128) { g.beginPath(); g.moveTo(x - 128, y); g.lineTo(x + w - 128, y); g.stroke(); } }
  return c;
}

export function playAssembly(root, { state, title = 'Rebuild the unit', reducedMotion = () => false } = {}) {
  ensureStyle(); chainStyle();
  const s = state;
  const coarse = s.setup?.input === 'touch' || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && s.setup?.input !== 'mouse');

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

  const canvas = h('canvas', { class: 'cc-canvas asm-canvas', 'aria-label': 'A broken engine-cooling unit with one open socket and a tray of machined parts. Drag a part into the socket.' });
  const ctx = canvas.getContext('2d');
  const host = h('div', { class: 'asm-screwhost', hidden: true });
  const wrap = h('div', { class: 'cc-boardwrap asm-board' }, canvas, host);
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: 'Pick the part that fits the glowing outline. Turn it until the shape matches, then drag it in.' });
  const left = h('button', { type: 'button', class: 'ui-btn asm-turn', 'data-turn': 'left', 'aria-label': 'Turn the part left', text: '↺ Turn left' });
  const right = h('button', { type: 'button', class: 'ui-btn asm-turn', 'data-turn': 'right', 'aria-label': 'Turn the part right', text: 'Turn right ↻' });
  const hint = h('span', { class: 'asm-keys', text: 'Q and E, or the wheel, turn it too' });
  const boltLine = h('p', { class: 'asm-boltline', hidden: true, text: 'Drag each bolt onto a glowing ring, then tap it.' });
  const foot = h('div', { class: 'rp-foot cc-row asm-actions' }, left, right, hint, boltLine);
  const panel = h('section', { class: 'rp-panel cc-panel asm-panel mg-skin ui-panel', role: 'group', 'aria-label': `Assembly: ${title}`, 'data-game': 'assembly' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `ASSEMBLY · ${String(title).toUpperCase()}` }), hud, wrap, status, foot);
  panel.__state = s;
  root.append(panel);

  // ---- the board's size and the wide or tall layout --------------------------------------------------------------------------------
  let scale = 1, dpr = 1;
  function fit() {
    const aw = wrap.clientWidth, ah = wrap.clientHeight;
    if (!aw || !ah) return;
    const wd = A.LAYOUTS.wide, tl = A.LAYOUTS.tall;
    const w = Math.min(aw / wd.W, ah / wd.H), t = Math.min(aw / tl.W, ah / tl.H);
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

  const lift = () => (coarse ? Math.round(s.layout.cell * 0.5) : 0);       // a finger hides what it holds: the part rides above the touch
  const boltLift = () => (coarse ? 54 : 0);
  const toBoard = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * s.layout.W) / r.width, y: ((e.clientY - r.top) * s.layout.H) / r.height }; };
  panel.__view = () => { const r = canvas.getBoundingClientRect(); return { kind: s.layoutKind, scale, left: r.left, top: r.top, width: r.width, height: r.height, k: r.width / s.layout.W, lift: lift(), boltLift: boltLift(), screw: Boolean(screwLive), card: Boolean(card) }; };

  // ---- animation bits the rules do not know about ---------------------------------------------------------------------------------------
  const vis = new Map(); // piece id -> { ox, oy, flash, pop }
  const fx = [];         // sparks and rings
  const vOf = (id) => { let v = vis.get(id); if (!v) { v = { ox: 0, oy: 0, flash: 0, pop: 0 }; vis.set(id, v); } return v; };
  let shake = 0, now = 0, fadeBays = 0;
  const brush = brushed();
  let brushPat = null;

  // ---- input -----------------------------------------------------------------------------------------------------------------------
  let drag = null; // { kind: 'pending'|'piece'|'scroll'|'bolt'|'tap', id, sx, sy, lx, moved }
  const pieceHit = (p, x, y, pad) => {
    const cells = A.pieceCells(p), c = A.cellOf(s, p);
    return cells.some(([cx, cy]) => x >= p.x + cx * c - pad && x <= p.x + (cx + 1) * c + pad && y >= p.y + cy * c - pad && y <= p.y + (cy + 1) * c + pad);
  };
  const inTray = (x, y) => { const t = A.areasOf(s).tray; return x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h; };
  canvas.addEventListener('pointerdown', (e) => {
    if (s.done || screwLive || card) return;
    e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
    const { x, y } = toBoard(e);
    if (s.phase === 'fit') {
      if (!inTray(x, y)) return;
      const loose = A.trayPieces(s).slice().reverse();
      const p = loose.find((q) => pieceHit(q, x, y, 0)) || loose.find((q) => pieceHit(q, x, y, coarse ? 14 : 6));
      drag = p ? { kind: 'pending', id: p.id, sx: x, sy: y, lx: x, moved: false } : { kind: 'scroll', sx: x, sy: y, lx: x, moved: false };
      return;
    }
    if (s.phase === 'bolt') {
      const seated = s.bolts.find((b) => b.seated && !b.tight && Math.hypot(b.x - x, b.y - y) <= 44);
      if (seated) { drag = { kind: 'tap', id: seated.id, sx: x, sy: y, moved: false }; return; }
      const free = s.bolts.find((b) => !b.seated && !b.tight && Math.hypot(b.x - x, b.y - y) <= (coarse ? 56 : 40));
      if (free) { A.grabBolt(s, free.id); drag = { kind: 'bolt', id: free.id, sx: x, sy: y, moved: false }; A.carryBolt(s, x, y - boltLift()); }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return; e.preventDefault();
    const { x, y } = toBoard(e);
    if (Math.hypot(x - drag.sx, y - drag.sy) > 8) drag.moved = true;
    if (drag.kind === 'pending' && drag.moved) {
      const dx = x - drag.sx, dy = y - drag.sy;
      if (s.layout.scrolls && Math.abs(dx) > Math.abs(dy) * 1.2) drag.kind = 'scroll';
      else { A.grab(s, drag.id); drag.kind = 'piece'; }
    }
    if (drag.kind === 'scroll') { A.scrollTray(s, drag.lx - x); drag.lx = x; }
    else if (drag.kind === 'piece') A.carry(s, x, y - lift());
    else if (drag.kind === 'bolt') A.carryBolt(s, x, y - boltLift());
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag; drag = null; canvas.releasePointerCapture?.(e.pointerId);
    if (d.kind === 'pending') { A.select(s, d.id); }
    else if (d.kind === 'piece') {
      const p = A.pieceOf(s, d.id), at = { x: p.x, y: p.y };
      const out = A.drop(s);
      if (out && out !== 'snapped') { const v = vOf(p.id); v.ox = at.x - p.x; v.oy = at.y - p.y; if (out === 'wrong') { v.flash = 1; shake = 1; } else if (out === 'turn') v.flash = 0.6; }
      if (out === 'snapped') { vOf(p.id).pop = 1; burst(p.x, p.y, A.pieceSize(s, p)); }
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
    screwLive = gs; host.hidden = false; canvas.hidden = true; foot.hidden = true; status.hidden = true; panel.classList.add('is-screwing');
    const result = await playScrew(host, { state: gs, what: 'bolt', reducedMotion });
    host.replaceChildren(); host.hidden = true; canvas.hidden = false; foot.hidden = false; status.hidden = false; panel.classList.remove('is-screwing');
    screwLive = null;
    if (s.done) return;
    const how = A.screwed(s, b.id, result);
    if (how === 'stripped') status.textContent = 'That head stripped. The bolt is back in the strip: set it on its ring again.';
    else if (s.phase === 'bolt') status.textContent = 'Snug. Tap the next bolt to drive it in, or drag the rest onto their rings.';
    refresh();
    requestAnimationFrame(fit);
  }

  // ---- effects -------------------------------------------------------------------------------------------------------------------------------
  function burst(x, y, z) { if (reducedMotion()) return; for (let i = 0; i < 18; i++) fx.push({ kind: 'spark', x: x + Math.random() * z.w, y: y + Math.random() * z.h, vx: (Math.random() - 0.5) * 240, vy: -40 - Math.random() * 180, t: 0.5 }); fx.push({ kind: 'ring', x: x + z.w / 2, y: y + z.h / 2, r: 20, t: 0.4 }); }
  function ring(x, y) { if (!reducedMotion()) fx.push({ kind: 'ring', x, y, r: 10, t: 0.3 }); }

  // ---- events -> plain words ------------------------------------------------------------------------------------------------------------------
  let card = null, finishAt = 0;
  function onEvents() {
    for (const ev of s.events.splice(0)) {
      if (ev.type === 'snapped') status.textContent = 'It is in. Now the bolts.';
      else if (ev.type === 'wrong') status.textContent = 'That one is the wrong part. It bounced off. Look at the outline again.';
      else if (ev.type === 'bounce' && ev.why === 'turn') status.textContent = 'Right part, wrong way round. Turn it until the shape matches.';
      else if (ev.type === 'bounce' && ev.why === 'close') status.textContent = 'Close. Bring it right onto the outline.';
      else if (ev.type === 'part-done') { status.textContent = `The ${A.ordinal(ev.index)} part is bolted down.`; fadeBays = 1; }
      else if (ev.type === 'next-socket') status.textContent = `The ${A.ordinal(ev.index)} socket is open. Pick the part that fits it.`;
      else if (ev.type === 'bolt-miss') status.textContent = 'Not on a ring. Drop the bolt right on a glowing ring.';
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
    const bolting = s.phase === 'bolt';
    left.hidden = right.hidden = bolting; hint.hidden = bolting; boltLine.hidden = !bolting;
    left.disabled = right.disabled = s.phase !== 'fit' || !s.selected || s.done;
    panel.dataset.phase = s.phase;
    if (s.done && !finishAt) finishAt = now || performance.now();
  }

  // ---- drawing: a machined casing and machined parts ---------------------------------------------------------------------------------------------
  const rr = (g, x, y, w, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const unionPath = (cells, ox, oy, c, inset = 0) => { const p = new Path2D(); for (const [x, y] of cells) p.rect(ox + x * c + inset, oy + y * c + inset, c - 2 * inset, c - 2 * inset); return p; };
  /** Edges of the shape, drawn in one stroke style per facing (the bevel: light on the top and left, dark on the bottom and right). */
  function bevel(g, cells, ox, oy, c, w, light, dark, inset = 0) {
    g.lineCap = 'round';
    for (const [x1, y1, x2, y2, f] of edgesOf(cells)) {
      const o = w / 2 + inset, inx = f === 'w' ? o : f === 'e' ? -o : 0, iny = f === 'n' ? o : f === 's' ? -o : 0;
      g.strokeStyle = f === 'n' || f === 'w' ? light : dark; g.lineWidth = w;
      g.beginPath(); g.moveTo(ox + x1 * c + inx, oy + y1 * c + iny); g.lineTo(ox + x2 * c + inx, oy + y2 * c + iny); g.stroke();
    }
  }
  function outline(g, cells, ox, oy, c) { g.beginPath(); for (const [x1, y1, x2, y2] of edgesOf(cells)) { g.moveTo(ox + x1 * c, oy + y1 * c); g.lineTo(ox + x2 * c, oy + y2 * c); } g.stroke(); }
  function holeAt(g, x, y, r, live = 0) {
    g.save(); g.translate(x, y);
    const rg = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); rg.addColorStop(0, '#0a0f14'); rg.addColorStop(1, '#02050a');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.lineWidth = Math.max(1.5, r * 0.18); g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(0, 0, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.beginPath(); g.arc(0, 0, r, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
    if (live) { g.strokeStyle = `${TEAL_SOFT}${0.55 + 0.4 * live})`; g.lineWidth = Math.max(2.5, r * 0.28); g.shadowColor = TEAL; g.shadowBlur = 12; g.beginPath(); g.arc(0, 0, r * 1.45 + live * 2, 0, TAU); g.stroke(); }
    g.restore();
  }
  /** One machined part: a single brushed-metal piece with a faint anodised tint, bevelled edges, no seams, and its bolt holes. */
  function drawPart(g, p, { x, y, alpha = 1, lift: raise = 0, glow = null, flash = 0, pop = 0, dim = false, lit = false } = {}) {
    const cells = A.pieceCells(p), c = A.cellOf(s, p), z = A.pieceSize(s, p), sc = 1 + pop * 0.06 + raise * 0.03;
    g.save(); g.globalAlpha = alpha * (dim ? 0.45 : 1);
    g.translate(x + z.w / 2, y + z.h / 2); g.scale(sc, sc); g.translate(-z.w / 2, -z.h / 2);
    const path = unionPath(cells, 0, 0, c);
    if (raise || lit) { g.save(); g.shadowColor = lit ? TEAL : 'rgba(0,0,0,.6)'; g.shadowBlur = lit ? 26 : 18 * (c / 60 + 0.4); g.shadowOffsetY = lit ? 0 : 10; g.fillStyle = '#222'; g.fill(path); g.restore(); }
    g.save(); g.clip(path);
    const gr = g.createLinearGradient(0, 0, z.w, z.h); gr.addColorStop(0, '#d5dde3'); gr.addColorStop(0.45, '#8995a0'); gr.addColorStop(1, '#bcc6cd');
    g.fillStyle = gr; g.fillRect(-2, -2, z.w + 4, z.h + 4);
    if (!brushPat) brushPat = g.createPattern(brush, 'repeat');
    g.globalAlpha = 0.5 * alpha * (dim ? 0.45 : 1); g.fillStyle = brushPat; g.fillRect(-2, -2, z.w + 4, z.h + 4);
    g.globalAlpha = 0.34 * alpha * (dim ? 0.45 : 1); g.globalCompositeOperation = 'multiply'; g.fillStyle = p.tint; g.fillRect(-2, -2, z.w + 4, z.h + 4); g.globalCompositeOperation = 'source-over';
    const sh = g.createLinearGradient(0, 0, 0, z.h); sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.28)');
    g.globalAlpha = alpha * (dim ? 0.45 : 1); g.fillStyle = sh; g.fillRect(-2, -2, z.w + 4, z.h + 4);
    // a pressed-in machined face: a thin line inset from every edge
    g.restore(); g.save(); g.clip(path); bevel(g, cells, 0, 0, c, Math.max(1.2, c * 0.03), 'rgba(0,0,0,.2)', 'rgba(255,255,255,.2)', c * 0.2);
    g.restore();
    const bw = Math.max(3, c * 0.075);
    g.globalAlpha = alpha * (dim ? 0.45 : 1);
    bevel(g, cells, 0, 0, c, bw, 'rgba(255,255,255,.55)', 'rgba(20,28,36,.7)');
    g.lineWidth = Math.max(1.4, c * 0.03); g.strokeStyle = glow || '#0b1219'; g.lineJoin = 'round'; outline(g, cells, 0, 0, c);
    for (const [hx, hy] of A.pieceHoles(p)) holeAt(g, (hx + 0.5) * c, (hy + 0.5) * c, c * 0.14);
    if (flash > 0) { g.globalAlpha = flash * 0.6; g.fillStyle = '#ff4d3d'; g.fill(path); }
    g.restore();
  }
  function drawBolt(g, x, y, r, { tight = false, loose = false, lift: raise = 0, pulse = 0 } = {}) {
    g.save(); g.translate(x, y);
    if (raise) { g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12; g.shadowOffsetY = 8; }
    const rr0 = tight ? r * 0.8 : r;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * rr0, Math.sin(a) * rr0); } g.closePath();
    const bg = g.createLinearGradient(-rr0, -rr0, rr0, rr0); bg.addColorStop(0, tight ? '#8c9aa5' : '#edf2f5'); bg.addColorStop(1, tight ? '#46535d' : '#7f8d98');
    g.fillStyle = bg; g.fill(); g.shadowColor = 'transparent'; g.lineWidth = 2; g.strokeStyle = '#1c2832'; g.stroke();
    g.fillStyle = '#26323c'; g.fillRect(-rr0 * 0.55, -1.8, rr0 * 1.1, 3.6); g.fillRect(-1.8, -rr0 * 0.55, 3.6, rr0 * 1.1);
    if (loose) { g.strokeStyle = `rgba(255,190,110,${0.55 + 0.4 * pulse})`; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * 1.5 + 2 * pulse, 0, TAU); g.stroke(); }
    g.restore();
  }
  /** The strip of bay icons: done (lit and bolted), open (glowing), locked (dark). */
  function drawBays(g, H, pulse) {
    const n = s.sockets.length, sz = Math.min(44, s.layout.W * 0.06), gap = sz * 0.35, total = n * sz + (n - 1) * gap, x0 = H.x + H.w - total - 22, y0 = H.y + 14;
    s.sockets.forEach((k, i) => {
      const x = x0 + i * (sz + gap), st = k.done ? 'done' : i === s.active && !s.done ? 'open' : 'locked';
      g.save(); rr(g, x, y0, sz, sz, 7);
      g.fillStyle = st === 'done' ? '#12494a' : st === 'open' ? '#0a1c26' : '#0b121a'; g.fill();
      g.lineWidth = 2.4; g.strokeStyle = st === 'done' ? TEAL : st === 'open' ? `${TEAL_SOFT}${0.6 + 0.4 * pulse})` : '#2a3a48';
      if (st === 'open') { g.shadowColor = TEAL; g.shadowBlur = 10; } g.stroke(); g.shadowColor = 'transparent';
      g.strokeStyle = st === 'done' ? '#bff7f1' : '#56697a'; g.fillStyle = g.strokeStyle; g.lineWidth = 3; g.lineCap = 'round';
      const cx = x + sz / 2, cy = y0 + sz / 2;
      if (st === 'done') { g.beginPath(); g.moveTo(cx - sz * 0.22, cy); g.lineTo(cx - sz * 0.05, cy + sz * 0.18); g.lineTo(cx + sz * 0.25, cy - sz * 0.2); g.stroke(); }
      else if (st === 'locked') { g.fillRect(cx - sz * 0.17, cy - sz * 0.02, sz * 0.34, sz * 0.26); g.beginPath(); g.arc(cx, cy - sz * 0.02, sz * 0.12, Math.PI, 0); g.stroke(); }
      else { g.beginPath(); g.arc(cx, cy, sz * 0.14, 0, TAU); g.fill(); }
      g.restore();
    });
  }
  function draw(dt) {
    const L = s.layout, k = scale * dpr, g = ctx, AR = A.areasOf(s), H = AR.housing, T = AR.tray;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, L.W, L.H);
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    g.save(); if (shake > 0 && !reducedMotion()) g.translate(Math.sin(now / 18) * 5 * shake, 0);
    // the casing: a dark machined block with a bevelled frame and corner screws
    if (!brushPat) brushPat = g.createPattern(brush, 'repeat');
    const casing = (a, r) => {
      const gr = g.createLinearGradient(a.x, a.y, a.x + a.w * 0.4, a.y + a.h); gr.addColorStop(0, '#26323e'); gr.addColorStop(1, '#0e151c');
      rr(g, a.x, a.y, a.w, a.h, r); g.fillStyle = gr; g.fill();
      g.save(); g.clip(); g.globalAlpha = 0.09; g.fillStyle = brushPat; g.fillRect(a.x, a.y, a.w, a.h); g.restore();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.14)'; rr(g, a.x + 1.5, a.y + 1.5, a.w - 3, a.h - 3, r); g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#05090d'; rr(g, a.x, a.y, a.w, a.h, r); g.stroke();
      g.fillStyle = '#3c4f60'; for (const [rx, ry] of [[a.x + 14, a.y + 14], [a.x + a.w - 14, a.y + 14], [a.x + 14, a.y + a.h - 14], [a.x + a.w - 14, a.y + a.h - 14]]) { g.beginPath(); g.arc(rx, ry, 4, 0, TAU); g.fill(); g.strokeStyle = '#0a0f14'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(rx - 2.6, ry); g.lineTo(rx + 2.6, ry); g.stroke(); }
    };
    casing(H, 16);
    g.fillStyle = '#8aa1b3'; g.font = '700 15px Consolas, monospace'; g.textAlign = 'left'; g.fillText(`${String(A.worldOf({ system: s.system }).systemName).toUpperCase()} · BROKEN`, H.x + 26, H.y + 36);
    drawBays(g, H, pulse);
    // the open socket: a recessed pit with a glowing outline, brighter when the held part would fit
    const act = A.socketOf(s), cs = L.cell;
    if (act && !s.done) {
      const held = s.held && s.phase === 'fit' ? A.pieceOf(s, s.held) : null;
      const would = held && Math.hypot(held.x - act.x, held.y - act.y) <= s.snap && A.fitsSocket(A.outlineOfPiece(held), held.rot, A.outlineById(act.outline));
      if (s.phase === 'fit') {
        g.save();
        const pit = unionPath(act.cells, act.x, act.y, cs);
        g.fillStyle = '#04080c'; g.fill(pit);
        g.save(); g.clip(pit); g.shadowColor = '#000'; g.shadowBlur = 24; g.lineWidth = 12; g.strokeStyle = '#000'; outline(g, act.cells, act.x, act.y, cs); g.restore();
        bevel(g, act.cells, act.x, act.y, cs, 4, 'rgba(0,0,0,.7)', 'rgba(255,255,255,.18)');
        for (const [hx, hy] of act.holes) holeAt(g, act.x + (hx + 0.5) * cs, act.y + (hy + 0.5) * cs, cs * 0.1, 0);
        g.shadowColor = would ? '#9fe870' : TEAL; g.shadowBlur = 16 + 12 * pulse;
        g.fillStyle = would ? 'rgba(159,232,112,.18)' : `${TEAL_SOFT}${0.07 + 0.05 * pulse})`; g.fill(pit);
        g.lineWidth = 4; g.setLineDash([14, 9]); g.lineDashOffset = -now / 55; g.strokeStyle = would ? '#b9f58f' : '#7bece3'; g.lineJoin = 'round'; outline(g, act.cells, act.x, act.y, cs);
        g.restore();
      } else {
        const pl = s.pieces.find((q) => q.placed && q.socket === act.id);
        if (pl) drawPart(g, pl, { x: pl.x, y: pl.y, pop: vOf(pl.id).pop, lit: true });
      }
    }
    // the tray: a recessed rail with loose parts (a slim strip with the bolts while a part is being bolted)
    {
      g.save(); rr(g, T.x, T.y, T.w, T.h, 14); g.fillStyle = '#0a1118'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#243645'; g.stroke();
      g.fillStyle = '#5f7a8f'; g.font = '700 13px Consolas, monospace'; g.textAlign = 'left'; g.fillText(s.phase === 'bolt' ? 'BOLTS' : 'PARTS', T.x + 18, T.y + 22); g.restore();
    }
    if (s.phase === 'bolt' && s.bolts) {
      const act2 = A.socketOf(s), br = cs * 0.15;
      act2.holes.forEach((c, hi) => {
        const hx = act2.x + (c[0] + 0.5) * cs, hy = act2.y + (c[1] + 0.5) * cs, b = s.bolts.find((o) => o.hx === hx && o.hy === hy);
        if (!b || (!b.seated && !b.tight)) holeAt(g, hx, hy, cs * 0.14, pulse);
      });
      s.bolts.forEach((b) => {
        const v = vOf(b.id);
        if (b.seated || b.tight) { drawBolt(g, b.x, b.y, br, { tight: b.tight, loose: !b.tight, pulse }); return; }
        drawBolt(g, b.x + v.ox, b.y + v.oy, Math.min(26, br * 1.05), { lift: s.held === b.id ? 1 : 0 });
      });
    } else {
      g.save(); rr(g, T.x + 2, T.y + 2, T.w - 4, T.h - 4, 12); g.clip();
      for (const p of A.trayPieces(s)) {
        if (s.held === p.id) continue;
        const v = vOf(p.id);
        drawPart(g, p, { x: p.x + v.ox, y: p.y + v.oy, flash: v.flash, glow: s.selected === p.id ? '#ffe08a' : null, dim: s.done });
      }
      g.restore();
      if (L.scrolls && A.trayMax(s) > 0) {
        g.save(); g.fillStyle = 'rgba(190,225,235,.55)'; g.font = '700 22px Inter, sans-serif'; g.textAlign = 'center';
        if (s.trayScroll < A.trayMax(s) - 2) g.fillText('›', T.x + T.w - 14, T.y + T.h / 2 + 8);
        if (s.trayScroll > 2) g.fillText('‹', T.x + 14, T.y + T.h / 2 + 8);
        g.restore();
      }
      if (s.held) { const p = A.pieceOf(s, s.held); drawPart(g, p, { x: p.x, y: p.y, lift: 1, glow: '#ffe08a' }); }
    }
    for (const f of fx) {
      if (f.kind === 'spark') { g.globalAlpha = Math.max(0, f.t * 2); g.fillStyle = '#ffe9a8'; g.fillRect(f.x - 2.5, f.y - 2.5, 5, 5); g.globalAlpha = 1; }
      else { g.globalAlpha = Math.max(0, f.t * 2.4); g.strokeStyle = '#bff7f1'; g.lineWidth = 4; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    }
    g.restore();
    void dt; void fadeBays;
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
    shake = Math.max(0, shake - dt * 3.5); fadeBays = Math.max(0, fadeBays - dt);
    for (const f of fx) { f.t -= dt; if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; } else f.r += 120 * dt; }
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
