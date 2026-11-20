// Sounding drill: the screen. A dark scope drawn on a canvas, with a hangar-kit HUD around it (no digits on the live screen).
// The model is stepped here from real input; the view only reads it. Everything on the canvas is drawn in code.
import { createGame, step, claw, drain, turn, resultOf, words, mainProgress, lightOf, findLight, isFreed, BASE, K, F, rimPoint, insideRock } from './model.js';
import { makeSound } from './sound.js';

/** Perception's colour: a pale sonar gold. Not taken by another skill (shooting #FF7A59, crafting #FFB547, navigation #C8E06B). */
export const PERCEPTION = '#f4e3a1';

const el = (tag, cls, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; e.setAttribute(k, v === true ? '' : v); }
  for (const k of [].concat(kids)) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const mix = (a, b, t) => a + (b - a) * t;
const HEAT_STOPS = [[0, [150, 246, 255]], [0.5, [255, 196, 114]], [1, [255, 84, 58]]];
const heatRGB = (h) => {
  h = Math.max(0, Math.min(1, h));
  for (let i = 1; i < HEAT_STOPS.length; i++) if (h <= HEAT_STOPS[i][0]) { const [h0, c0] = HEAT_STOPS[i - 1], [h1, c1] = HEAT_STOPS[i], t = (h - h0) / (h1 - h0); return c0.map((v, k) => Math.round(mix(v, c1[k], t))); }
  return HEAT_STOPS[2][1];
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

/** Pick a board that fits the play area: wide on a desktop, tall on a phone. */
export function boardFor(areaW, areaH) {
  if (areaW >= areaH * 1.05) return { w: 1000, h: Math.round(Math.max(700, Math.min(800, 1000 * areaH / areaW))) };
  return { w: 720, h: Math.round(Math.max(900, Math.min(1080, 720 * areaH / areaW))) };
}

export function mountGame(stage, ctx, { fixtures, items, rock, resume, quick, onDone }) {
  const sound = makeSound();
  const reduced = !!ctx.reducedMotion?.();
  const root = el('div', 'm-sounding-drill', { 'data-phase': 'play' });
  root.tabIndex = 0;
  stage.replaceChildren(root);

  // --- DOM ---------------------------------------------------------------------------------------------------------
  const cellSegs = Array.from({ length: 10 }, () => el('i'));
  const cell = el('div', 'sd-cell', { 'aria-label': 'Power cell' }, [el('div', 'sd-cell-body', {}, cellSegs), el('div', 'sd-cell-tip')]);
  const heatFill = el('i');
  const heat = el('div', 'sd-heat', { 'aria-label': 'Bit heat' }, [heatFill]);
  const top = el('div', 'sd-top', {}, [
    el('div', 'sd-title ui-nameplate', {}, [el('b', '', {}, 'Sounding drill'), el('span', '', {}, quick ? 'quick' : '')]),
    el('div', 'sd-gauges', {}, [el('div', 'sd-gauge', {}, [el('small', '', {}, 'Power cell'), cell]), el('div', 'sd-gauge sd-gauge-heat', {}, [el('small', '', {}, 'Bit'), heat])]),
  ]);
  const canvas = el('canvas', 'sd-canvas', { 'aria-label': 'The rock. Press and drag to drill.' });
  const intro = el('div', 'sd-intro', {}, [el('b', '', {}, 'Sound the rock'), el('span', '', {}, 'Press on the rock and drag to drill. Each ring shows what is inside for a moment. Find the glint, clear the rock around it without touching it, then bring the claw.')]);
  const status = el('div', 'sd-status', { 'aria-live': 'polite' }, 'press and drag');
  const boardEl = el('div', 'sd-board', {}, [canvas, intro, status]);
  const scope = el('div', 'sd-scope', {}, [boardEl]);
  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (n, a) => { const e = document.createElementNS(svgNS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const ringBg = mk('circle', { cx: 40, cy: 40, r: 33, class: 'sd-ring-bg' }), ringFg = mk('circle', { cx: 40, cy: 40, r: 33, class: 'sd-ring-fg', 'stroke-dasharray': '207.3', 'stroke-dashoffset': '207.3', transform: 'rotate(-90 40 40)' });
  const gem = mk('path', { d: 'M40 20 L54 34 L40 62 L26 34 Z M26 34 H54 M40 20 L34 34 L40 62 L46 34 Z', class: 'sd-gem' });
  const glyph = mk('svg', { viewBox: '0 0 80 80', class: 'sd-glyph' }); glyph.append(ringBg, ringFg, gem);
  const findWord = el('div', 'sd-find-word', {}, 'not found yet');
  const pips = el('div', 'sd-pips');
  const findBox = el('div', 'sd-find', {}, [el('small', '', {}, 'The find'), glyph, findWord, pips]);
  const clawBtn = el('button', 'sd-claw ui-btn primary', { type: 'button' }, 'Bring the claw');
  const actions = el('div', 'sd-actions', {}, [clawBtn]);
  const side = el('div', 'sd-side', {}, [findBox, actions]);
  const card = el('div', 'sd-card-wrap', { hidden: true });
  root.append(top, scope, side, card);

  // --- the game ----------------------------------------------------------------------------------------------------
  const wideNow = () => stage.clientWidth >= 860 && stage.clientWidth > stage.clientHeight * 1.1;
  root.classList.toggle('is-wide', wideNow());
  const area = scope.getBoundingClientRect();
  let board = boardFor(Math.max(200, area.width), Math.max(200, area.height));
  // On a small screen the rock is drawn small, so the bit runs faster in rock units: the same pace under the thumb.
  const estScale = Math.min(area.width / board.w, area.height / board.h) * 1.12;
  const speedK = Math.max(1, Math.min(1.9, 0.95 / Math.max(0.2, estScale)));
  const g = createGame({ seed: ctx.seed ?? 1, tier: ctx.tier ?? 0, points: ctx.points || {}, quick, board, rock, items, fixtures, resume, speedK });
  const R = g.rock;
  const itemOf = (f) => R.itemMap?.[f.item] || {};
  // The window onto the board: the rock and a margin, widened or heightened to the shape of the screen so the scope has no empty bands.
  const base = (() => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 90; i++) { const p = rimPoint(R, i / 90 * Math.PI * 2); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const m = 46;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  })();
  const win = { ...base };
  const fitWindow = (aw, ah) => {
    const ar = aw / Math.max(1, ah), cx = base.x + base.w / 2, cy = base.y + base.h / 2;
    let w = base.w, h = base.h;
    if (w / h < ar) w = h * ar; else h = w / ar;
    win.x = cx - w / 2; win.y = cy - h / 2; win.w = w; win.h = h;
  };
  fitWindow(area.width, area.height);

  // offscreen layers at grid resolution
  const mkLayer = () => { const c = document.createElement('canvas'); c.width = R.gw; c.height = R.gh; const x = c.getContext('2d'); return { c, x, img: x.createImageData(R.gw, R.gh) }; };
  const tunnelL = mkLayer(), litL = mkLayer(), soft = mkLayer();
  const rockPath = (() => {
    const pts = [];
    for (let i = 0; i < 120; i++) { const th = i / 120 * Math.PI * 2, p = rimPoint(R, th); pts.push(p); }
    return pts;
  })();
  // a fixed speckle texture inside the rock, drawn once
  const speckle = (() => {
    const c = document.createElement('canvas'); c.width = R.gw; c.height = R.gh; const x = c.getContext('2d'), img = x.createImageData(R.gw, R.gh);
    for (let i = 0; i < R.gw * R.gh; i++) { if (R.kind[i] === K.OUT) continue; const h = hash(i * 7919 + g.seed); const v = 10 + Math.floor(h * 14); img.data[i * 4] = v; img.data[i * 4 + 1] = v + 6; img.data[i * 4 + 2] = v + 12; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0); return c;
  })();

  // --- sizing ------------------------------------------------------------------------------------------------------
  let cssW = 0, cssH = 0, scale = 1, dpr = 1;
  const resize = () => {
    const r = scope.getBoundingClientRect();
    fitWindow(r.width, r.height);
    dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
    scale = Math.min(r.width / win.w, r.height / win.h);
    cssW = Math.floor(win.w * scale); cssH = Math.floor(win.h * scale);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
    root.classList.toggle('is-wide', wideNow());
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(scope); resize();
  const toWorld = (cx, cy, lift = 0) => { const r = canvas.getBoundingClientRect(); return { x: win.x + (cx - r.left) / scale, y: win.y + (cy - r.top - lift) / scale }; };

  // --- input -------------------------------------------------------------------------------------------------------
  const ptr = { down: false, x: 0, y: 0, id: null, type: 'mouse' };
  const kb = { dx: 0, dy: 0, space: false, keys: new Set() };
  let touched = false;
  const onDown = (e) => {
    if (g.over || phase !== 'play') return;
    e.preventDefault();
    sound.unlock();
    ptr.down = true; ptr.id = e.pointerId; ptr.type = e.pointerType || 'mouse';
    const w = toWorld(e.clientX, e.clientY, ptr.type === 'touch' ? BASE_LIFT : 0); ptr.x = w.x; ptr.y = w.y;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (!touched) { touched = true; intro.classList.add('is-gone'); ctx.sound?.('music:duck'); }
  };
  const BASE_LIFT = 48;
  const onMove = (e) => { if (!ptr.down || e.pointerId !== ptr.id) return; const w = toWorld(e.clientX, e.clientY, ptr.type === 'touch' ? BASE_LIFT : 0); ptr.x = w.x; ptr.y = w.y; };
  const onUp = (e) => { sound.unlock(); if (e.pointerId === ptr.id) { ptr.down = false; ptr.id = null; } };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.touchAction = 'none';
  const KEYMAP = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] };
  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) { down ? kb.keys.add(k) : kb.keys.delete(k); let dx = 0, dy = 0; for (const q of kb.keys) { dx += KEYMAP[q][0]; dy += KEYMAP[q][1]; } kb.dx = Math.sign(dx); kb.dy = Math.sign(dy); e.preventDefault(); if (down) { sound.unlock(); if (!touched) { touched = true; intro.classList.add('is-gone'); } } }
    else if (k === ' ') { kb.space = down; e.preventDefault(); if (down) { sound.unlock(); if (!touched) { touched = true; intro.classList.add('is-gone'); } } }
    else if (down && (k === 'enter' || k === 'c') && phase === 'play' && document.activeElement !== clawBtn) { e.preventDefault(); bringClaw(); }
  };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  root.addEventListener('keydown', kd); root.addEventListener('keyup', ku);
  setTimeout(() => root.focus({ preventScroll: true }), 0);

  // --- state for drawing -------------------------------------------------------------------------------------------
  let phase = 'play';      // play | claw | reveal | card
  let idleT = 0, listened = false;
  let phaseT = 0, shake = 0, flash = 0, lowSaid = false, chargeLow = false, bitAngle = -Math.PI / 2;
  let dustSeed = (g.seed * 2654435761) >>> 0;
  const rnd = () => { dustSeed = (Math.imul(dustSeed, 1664525) + 1013904223) >>> 0; return dustSeed / 4294967296; };
  const dust = [];
  const burst = (f, n, sp) => { if (reduced) return; const col = hex(f.colour); for (let i = 0; i < n; i++) { const a = rnd() * 6.283, v = sp * (0.4 + rnd()); dust.push({ x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 + rnd() * 0.6, age: 0, col, s: 1.6 + rnd() * 2 }); } };
  const freedBefore = R.finds.map(() => false);
  const crackFx = [];
  let lastDraw = 0, frame = 0, raf = 0, destroyed = false;
  const view = { win, get scale() { return scale; }, g, root, canvas, ptr, kb, toWorld, board };
  root.__view = view; root.__game = g;

  const onEvent = (ev) => {
    switch (ev.type) {
      case 'ping': sound.ping(ev.reach / 200); break;
      case 'listen': sound.listen(); listened = true; break;
      case 'tink': sound.tink(ev.kind, ev.d, g.rules.reach); break;
      case 'found': burst(R.finds[ev.find], 14, 70); navigator.vibrate?.(12); break;
      case 'grind': sound.grind(); if (!reduced) shake = Math.max(shake, 0.25); break;
      case 'seize': sound.clunk(); shake = 0.8; for (let i = 0; i < 14; i++) dust.push({ x: g.bit.x, y: g.bit.y, vx: (rnd() - 0.5) * 120, vy: -rnd() * 90, life: 0.9 + rnd() * 0.7, age: 0, hot: true, s: 2 + rnd() * 2 }); break;
      case 'crack': sound.crack(); shake = 1; flash = 1; navigator.vibrate?.(35); crackFx.push({ find: ev.find, n: ev.cracks, t: 0 }); break;
      case 'shatter': sound.shatter(); shake = 1.4; break;
      case 'over': if (ev.why === 'cell') sound.lose(); break;
      default: break;
    }
  };

  // --- finishing ---------------------------------------------------------------------------------------------------
  // Pressing the claw before the find is free ends the try for good, so the first press only asks: press again to mean it.
  let armed = 0;
  const bringClaw = () => {
    if (phase !== 'play' || g.over) return;
    if (!isFreed(R.finds[0]) && g.charge > g.chargeMax * 0.22 && !armed) {
      armed = 2.6; clawBtn.textContent = 'Press again to end'; clawBtn.classList.add('is-armed'); return;
    }
    armed = 0; claw(g);
  };
  clawBtn.addEventListener('click', bringClaw);

  let finished = false;
  const finish = (result) => { if (finished) return; finished = true; onDone(result); };
  const showCard = () => {
    phase = 'card'; root.dataset.phase = 'card';
    const res = resultOf(g);
    card.hidden = false; card.replaceChildren();
    const ok = res.success;
    const head = ok ? (res.perfect ? 'Clean pull' : 'The claw has it') : res.why === 'shattered' ? 'It shattered' : res.why === 'cell' ? "The cell's spent" : 'Not free yet';
    const sub = ok ? 'Your tunnel is the way out for the claw.' : res.why === 'shattered' ? 'The find came out as shards. You keep a scrap of gravel.' : res.canTurn ? 'You keep a scrap of gravel. Turn the rock and try from a new side: your tunnels and cracks stay.' : 'You keep a scrap of gravel.';
    const rows = res.finds.map((f, i) => {
      const it = R.itemMap?.[f.item] || {}, rec = R.finds[i];
      const state = rec.cracks >= BASE.shatter ? 'shattered' : f.isFreed ? (f.cracks ? 'freed, cracked' : 'freed clean') : f.seen ? (f.freed > 0.12 ? 'left half free' : 'left in the rock') : 'never seen';
      const icon = it.icon ? el('img', 'sd-row-img', { src: new URL(it.icon, import.meta.url).href, alt: '', draggable: false }) : el('i', 'sd-row-dot');
      return el('li', `sd-row ${f.isFreed ? 'is-free' : rec.cracks >= BASE.shatter ? 'is-lost' : ''}`, {}, [icon, el('span', 'sd-row-name', {}, [el('b', '', {}, it.name || f.item), el('small', '', {}, i === 0 ? `main find · ${state}` : `bonus · ${state}`)])]);
    });
    const lines = [];
    if (ok) lines.push(el('div', 'sd-line', {}, `+${res.xp} Perception XP`));
    if (!ok) lines.push(el('div', 'sd-line', {}, '+1 scrap'));
    const buttons = el('div', 'sd-card-btns');
    if (ok) {
      const go = el('button', 'ui-btn primary sd-go', { type: 'button' }, 'Done');
      go.addEventListener('click', () => { sound.destroy(); finish(res); });
      buttons.append(go);
    } else {
      if (res.canTurn) {
        const t = el('button', 'ui-btn primary sd-go', { type: 'button' }, 'Turn the rock');
        t.addEventListener('click', () => {
          turn(g); armed = 0; clawBtn.textContent = 'Bring the claw'; clawBtn.classList.remove('is-armed'); card.hidden = true; phase = 'play'; root.dataset.phase = 'play'; touched = false; intro.classList.remove('is-gone'); lowSaid = false;
          intro.querySelector('span').textContent = 'The rock is turned a quarter round. Your old tunnels and cracks are still there. A fresh cell is in.';
          dust.length = 0;
        });
        buttons.append(t);
      }
      const leave = el('button', 'ui-btn sd-go', { type: 'button' }, res.canTurn ? 'Leave it' : 'Done');
      leave.addEventListener('click', () => { sound.destroy(); finish(res); });
      buttons.append(leave);
    }
    card.append(el('div', `sd-card ui-card ${ok ? 'is-ok' : 'is-bad'}`, { role: 'dialog', 'aria-label': head }, [
      el('div', 'sd-card-head', {}, [el('b', '', {}, head), el('span', '', {}, sub)]), el('ul', 'sd-rows', {}, rows), ...lines, buttons,
    ]));
    (card.querySelector('.sd-go') || card).focus?.();
  };

  // --- drawing -----------------------------------------------------------------------------------------------------
  const cx2 = canvas.getContext('2d');
  const FEAT = { [F.VEIN]: [176, 150, 205], [F.HOLLOW]: [60, 130, 150], [F.EDGE]: [150, 238, 236], [F.SHELL]: [255, 205, 130] };
  const ringRGB = hex(PERCEPTION);
  const drawScene = (t) => {
    const W = canvas.width, H = canvas.height, k = scale * dpr;
    const c = cx2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#04080d'; c.fillRect(0, 0, W, H);
    // sonar backdrop: fine grid and a soft vignette
    c.save();
    c.globalAlpha = 0.5; c.strokeStyle = '#0c1a26'; c.lineWidth = 1;
    const gs = 50 * k;
    c.beginPath(); for (let x = (-win.x * k) % gs; x < W; x += gs) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = (-win.y * k) % gs; y < H; y += gs) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
    c.restore();
    const sx = (reduced ? 0 : (rnd() - 0.5)) * shake * 5 * dpr, sy = (reduced ? 0 : (rnd() - 0.5)) * shake * 5 * dpr;
    c.setTransform(k, 0, 0, k, -win.x * k + sx, -win.y * k + sy);
    // the rock silhouette
    c.beginPath(); rockPath.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
    c.fillStyle = '#07111a'; c.fill();
    c.save(); c.clip(); c.imageSmoothingEnabled = true; c.globalAlpha = 0.55; c.drawImage(speckle, 0, 0, R.W, R.H); c.restore();
    c.lineWidth = 2 / scale; c.strokeStyle = 'rgba(70,108,132,.55)'; c.stroke();
    c.lineWidth = 8 / scale; c.strokeStyle = 'rgba(40,70,90,.18)'; c.stroke();

    // the tunnel you have cut: a slightly lighter dark
    const td = tunnelL.img.data;
    for (let i = 0; i < R.gw * R.gh; i++) { const o = i * 4; if (g.cut[i]) { td[o] = 27; td[o + 1] = 48; td[o + 2] = 64; td[o + 3] = 255; } else { td[o + 3] = 0; } }
    tunnelL.x.putImageData(tunnelL.img, 0, 0);
    c.imageSmoothingEnabled = true; c.drawImage(tunnelL.c, 0, 0, R.W, R.H);

    // what the rings have lit
    const reveal = phase === 'reveal' || phase === 'card' ? Math.min(1, phaseT / 1.2) : 0;
    const ld = litL.img.data; ld.fill(0);
    const fr = Math.floor(t * 12);
    for (let i = 0; i < R.featCells.length; i++) {
      const cI = R.featCells[i], ft = R.feat[cI];
      if (ft === F.CORE) continue;
      if (ft === F.SHELL && !g.rules.shellShown && !reveal) continue;
      let lit = lightOf(g, cI);
      if (reveal) lit = Math.max(lit, reveal * (ft === F.SHELL ? 0.5 : 0.9));
      if (lit <= 0.01) continue;
      const col = FEAT[ft];
      let a = ft === F.VEIN ? 0.55 : ft === F.HOLLOW ? 0.22 : ft === F.EDGE ? 0.9 : 0;
      if (ft === F.SHELL) {
        // the rock still to clear round a find: what is cut is gone from the picture, and the rim of what is left is drawn bright
        if (g.cut[cI]) continue;
        const rem = (q) => R.feat[q] === F.SHELL && R.findAt[q] === R.findAt[cI] && !g.cut[q];
        a = (rem(cI - 1) && rem(cI + 1) && rem(cI - R.gw) && rem(cI + R.gw)) ? 0.16 : 1;
      }
      a *= lit * (0.78 + 0.22 * hash(cI * 31 + fr));
      const o = cI * 4;
      ld[o] = col[0]; ld[o + 1] = col[1]; ld[o + 2] = col[2]; ld[o + 3] = Math.min(255, Math.round(a * 255));
    }
    litL.x.putImageData(litL.img, 0, 0);
    // soften the cell edges once at grid size (cheap), then scale up smooth: it reads as an echo, not as blocks
    soft.x.clearRect(0, 0, R.gw, R.gh);
    if ('filter' in soft.x) soft.x.filter = 'blur(0.9px)';
    soft.x.drawImage(litL.c, 0, 0);
    c.save(); c.globalCompositeOperation = 'lighter'; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(soft.c, 0, 0, R.W, R.H); c.globalAlpha = 0.45; c.drawImage(soft.c, -3, -3, R.W + 6, R.H + 6); c.restore();

    // the entry: a small marker on the rim
    {
      const e = g.entry, a = e.angle, ux = Math.cos(a), uy = Math.sin(a), pulse = 0.6 + 0.4 * Math.sin(t * 3);
      const eb = Math.max(1, 0.85 / scale);
      c.save(); c.translate(e.x, e.y); c.rotate(Math.atan2(uy, ux) + Math.PI); c.scale(eb, eb);
      c.strokeStyle = `rgba(255,173,114,${0.55 + 0.35 * pulse})`; c.lineWidth = 3 / scale / eb; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-26, -13); c.lineTo(-8, 0); c.lineTo(-26, 13); c.stroke();
      c.restore();
    }

    // finds
    R.finds.forEach((f, i) => {
      let fi = findLight(g, f);
      if (reveal) fi = Math.max(fi, reveal);
      const freed = isFreed(f);
      if (freed && !reveal) fi = Math.max(fi, 0.5 + 0.2 * Math.sin(t * 4));
      if (f.cracks && !reveal) fi = Math.max(fi, 0.16);
      const lift = i === 0 && phase === 'claw' ? clawPose().lift : 0;
      if (fi > 0.02) { c.save(); c.translate(0, -lift); drawFind(c, f, i, fi, t, freed); c.restore(); }
      if (freed && fi > 0.02) {
        c.save(); c.strokeStyle = rgba(hex(f.colour), 0.5 * fi); c.setLineDash([6 / scale, 7 / scale]); c.lineDashOffset = -t * 18; c.lineWidth = 2 / scale;
        c.beginPath(); c.arc(f.x, f.y, f.r + 12, 0, 7); c.stroke(); c.restore();
      }
    });

    // rings
    for (const ring of g.rings) {
      const age = g.t - ring.t0, p = Math.min(1, age / ring.dur), rad = ring.reach * p;
      const a = Math.max(0, 1 - Math.max(0, age - ring.dur * 0.7) / (ring.dur * 0.6 + 0.25)) * (ring.kind === 'listen' ? 1 : 0.95) * (1 - p * 0.3);
      if (a <= 0.01 || rad < 2) continue;
      c.save(); c.strokeStyle = rgba(ringRGB, a); c.lineWidth = (ring.kind === 'listen' ? 4 : 3) / scale; c.shadowColor = rgba(ringRGB, a); c.shadowBlur = 12;
      c.beginPath(); c.arc(ring.x, ring.y, rad, 0, 7); c.stroke();
      c.strokeStyle = rgba(ringRGB, a * 0.28); c.lineWidth = 7 / scale; c.beginPath(); c.arc(ring.x, ring.y, Math.max(1, rad - 6), 0, 7); c.stroke();
      c.restore();
    }

    // pointer reticle and tether
    if (phase === 'play' && !g.over && (ptr.down || kb.dx || kb.dy)) {
      const tg = targetNow();
      c.save(); c.strokeStyle = 'rgba(244,227,161,.22)'; c.lineWidth = 1.5 / scale; c.setLineDash([5 / scale, 6 / scale]);
      c.beginPath(); c.moveTo(g.bit.x, g.bit.y); c.lineTo(tg.x, tg.y); c.stroke(); c.setLineDash([]);
      c.strokeStyle = 'rgba(244,227,161,.5)'; c.beginPath(); c.arc(tg.x, tg.y, 9 / scale, 0, 7); c.stroke(); c.restore();
    }

    // dust and sparks
    for (const d of dust) {
      const a = Math.max(0, 1 - d.age / d.life);
      c.fillStyle = d.col ? rgba(d.col, a * 0.95) : d.hot ? `rgba(255,${150 + Math.floor(a * 80)},90,${a * 0.9})` : `rgba(150,170,185,${a * 0.55})`;
      c.beginPath(); c.arc(d.x, d.y, d.s / scale * (0.6 + 0.4 * a) * 1.4, 0, 7); c.fill();
    }

    // the bit
    if (phase === 'play' || phase === 'claw') drawBit(c, t);

    // scope brackets and a faint sweep, so it reads as an instrument and not a picture
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = 'rgba(129,230,223,.35)'; c.lineWidth = 2 * dpr; const bl = 18 * dpr, bo = 8 * dpr;
    for (const [x0, y0, dx, dy] of [[bo, bo, 1, 1], [W - bo, bo, -1, 1], [bo, H - bo, 1, -1], [W - bo, H - bo, -1, -1]]) { c.beginPath(); c.moveTo(x0 + dx * bl, y0); c.lineTo(x0, y0); c.lineTo(x0, y0 + dy * bl); c.stroke(); }
    // flash on a crack
    if (flash > 0.01) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(255,236,200,${flash * 0.16})`; c.fillRect(0, 0, W, H); }

    // reveal labels
    if (reveal > 0.6) {
      c.setTransform(k, 0, 0, k, -win.x * k, -win.y * k);
      c.font = `700 ${Math.max(10, 11 / scale)}px Inter, "Segoe UI", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'top';
      R.finds.forEach((f) => {
        const tag = f.cracks >= BASE.shatter ? 'shattered' : isFreed(f) ? 'freed' : f.seen ? 'left behind' : 'never seen';
        c.fillStyle = isFreed(f) ? 'rgba(159,232,112,.95)' : f.cracks >= BASE.shatter ? 'rgba(255,120,100,.95)' : 'rgba(200,215,225,.9)';
        c.fillText(tag.toUpperCase(), f.x, f.y + f.r + 12);
      });
    }
    // the claw
    if (phase === 'claw') drawClaw(c);
  };

  const targetNow = () => {
    if (ptr.down) return { x: ptr.x, y: ptr.y };
    if (kb.dx || kb.dy) { const l = Math.hypot(kb.dx, kb.dy) || 1; return { x: g.bit.x + kb.dx / l * 90, y: g.bit.y + kb.dy / l * 90 }; }
    return { x: g.bit.x, y: g.bit.y };
  };

  function drawBit(c, t) {
    const hc = heatRGB(g.heat / 100), b = g.bit, seized = g.seizeLeft > 0;
    const li = g.lastInput;
    if (g.moving) { const a = Math.atan2(li.y - b.y, li.x - b.x); let d = a - bitAngle; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; bitAngle += d * 0.25; }
    const bs = Math.max(1, 0.85 / scale);   // the bit is never smaller than a thumbnail on a small screen
    const gl = (44 + (g.drilling ? 6 * Math.sin(t * 40) : 0) + g.heat * 0.25) * bs;
    const gr = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, gl);
    gr.addColorStop(0, rgba(hc, seized ? 0.55 + 0.3 * Math.sin(t * 30) : 0.7)); gr.addColorStop(0.35, rgba(hc, 0.22)); gr.addColorStop(1, rgba(hc, 0));
    c.fillStyle = gr; c.beginPath(); c.arc(b.x, b.y, gl, 0, 7); c.fill();
    c.save(); c.translate(b.x, b.y); c.rotate(bitAngle + Math.PI / 2); c.scale(bs, bs);
    const spin = g.drilling ? t * 30 : t * 2;
    c.fillStyle = '#c9d6df'; c.strokeStyle = rgba(hc, 0.9); c.lineWidth = 1.6 / scale;
    c.beginPath(); c.moveTo(0, -17); c.lineTo(8, 4); c.lineTo(-8, 4); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(30,45,58,.7)'; c.lineWidth = 1.6 / scale;
    for (let i = 0; i < 3; i++) { const yy = -10 + i * 5 + ((spin * 4) % 5) * (g.drilling ? 1 : 0); if (yy < 2 && yy > -15) { const hw = 3 + (yy + 15) * 0.32; c.beginPath(); c.moveTo(-hw, yy); c.lineTo(hw, yy + 2); c.stroke(); } }
    c.fillStyle = '#6b7b88'; c.fillRect(-6, 4, 12, 9);
    c.fillStyle = rgba(hc, 1); c.beginPath(); c.arc(0, -17, 2.8, 0, 7); c.fill();
    c.restore();
  }

  function drawFind(c, f, i, fi, t, freed) {
    const col = hex(f.colour), r = f.r;
    c.save(); c.translate(f.x, f.y);
    const glow = c.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.4);
    glow.addColorStop(0, rgba(col, 0.5 * fi)); glow.addColorStop(1, rgba(col, 0));
    c.fillStyle = glow; c.beginPath(); c.arc(0, 0, r * 2.4, 0, 7); c.fill();
    c.rotate(f.rot);
    const body = c.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, rgba(col.map((v) => Math.min(255, v + 70)), fi)); body.addColorStop(1, rgba(col.map((v) => Math.round(v * 0.55)), fi));
    c.fillStyle = body; c.strokeStyle = rgba(col.map((v) => Math.min(255, v + 110)), fi); c.lineWidth = 1.6 / scale; c.lineJoin = 'round';
    const shattered = f.cracks >= BASE.shatter;
    if (f.kind === 'gem') {
      const n = f.facets;
      c.beginPath(); for (let k2 = 0; k2 < n; k2++) { const a = k2 / n * Math.PI * 2, rr = r * (k2 % 2 ? 0.86 : 1); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = rgba([255, 255, 255], 0.35 * fi); c.beginPath(); for (let k2 = 0; k2 < n; k2++) { const a = k2 / n * Math.PI * 2; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); } c.stroke();
    } else if (f.kind === 'ore') {
      c.beginPath(); const n = 9; for (let k2 = 0; k2 < n; k2++) { const a = k2 / n * Math.PI * 2, rr = r * (0.82 + 0.28 * hash(i * 97 + k2 * 13 + g.seed)); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke();
      c.fillStyle = rgba([255, 240, 200], 0.55 * fi); for (let k2 = 0; k2 < 6; k2++) { c.beginPath(); c.arc((hash(k2 * 5 + i) - 0.5) * r, (hash(k2 * 7 + i + 3) - 0.5) * r, r * 0.07, 0, 7); c.fill(); }
    } else if (f.kind === 'relic') {
      const s2 = r * 0.84; c.beginPath(); c.rect(-s2, -s2, s2 * 2, s2 * 2); c.fill(); c.stroke();
      c.strokeStyle = rgba([255, 255, 255], 0.5 * fi); c.beginPath(); c.rect(-s2 * 0.55, -s2 * 0.55, s2 * 1.1, s2 * 1.1); c.moveTo(-s2, 0); c.lineTo(-s2 * 0.55, 0); c.moveTo(s2, 0); c.lineTo(s2 * 0.55, 0); c.moveTo(0, -s2); c.lineTo(0, -s2 * 0.55); c.stroke();
    } else {
      c.beginPath(); for (let k2 = 0; k2 < 6; k2++) { const a = k2 / 6 * Math.PI * 2 + Math.PI / 6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = rgba([255, 255, 255], 0.5 * fi); c.beginPath(); for (let k2 = 0; k2 < 6; k2++) { const a = k2 / 6 * Math.PI * 2 + Math.PI / 6; c.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); } c.closePath(); c.stroke();
      c.fillStyle = rgba([255, 255, 255], 0.7 * fi); c.beginPath(); c.arc(0, 0, r * 0.12, 0, 7); c.fill();
    }
    // cracks
    c.rotate(-f.rot);
    c.strokeStyle = `rgba(255,255,255,${0.85 * Math.max(fi, 0.5)})`; c.lineWidth = 1.8 / scale; c.lineCap = 'round';
    for (let k2 = 0; k2 < f.cracks; k2++) {
      const a0 = f.rot + k2 * 2.1 + 0.4, grow = Math.min(1, ((crackFx.find((x) => x.find === i && x.n === k2 + 1)?.t) ?? 1) * 4);
      c.beginPath(); let px = 0, py = 0; c.moveTo(0, 0);
      for (let s = 1; s <= 5; s++) { const a = a0 + (hash(i * 31 + k2 * 11 + s) - 0.5) * 0.9, d = r * 1.05 * (s / 5) * grow; px = Math.cos(a) * d; py = Math.sin(a) * d; c.lineTo(px, py); }
      c.stroke();
    }
    if (shattered) { c.fillStyle = 'rgba(4,8,13,.55)'; c.beginPath(); c.arc(0, 0, r * 1.02, 0, 7); c.fill(); }
    // glint
    if (!shattered) {
      const tw = 0.6 + 0.4 * Math.sin(t * 5 + i * 2), gs = r * (0.9 + 0.5 * tw) * Math.min(1, fi * 1.4);
      c.strokeStyle = rgba([255, 255, 255], 0.8 * fi); c.lineWidth = 1.4 / scale;
      c.beginPath(); c.moveTo(-gs, 0); c.lineTo(gs, 0); c.moveTo(0, -gs); c.lineTo(0, gs); c.stroke();
    }
    c.restore();
  }

  const easeOut = (x) => 1 - (1 - x) * (1 - x);
  function clawPose() {
    const f = R.finds[0], p = Math.min(1, phaseT / 1.9);
    const down = p < 0.45 ? p / 0.45 : 1, up = p > 0.6 ? (p - 0.6) / 0.4 : 0, top = win.y - 24;
    const lift = easeOut(up) * (f.y - top + f.r * 3);
    return { p, up, top, lift, y: mix(top, f.y - f.r * 0.2, easeOut(down)) - lift };
  }
  function drawClaw(c) {
    const f = R.finds[0], { p, top, y } = clawPose();
    const open = p < 0.45 ? 1 : p < 0.55 ? 1 - (p - 0.45) / 0.1 * 0.75 : 0.25;
    c.save(); c.strokeStyle = '#aebdc8'; c.lineWidth = 3 / scale; c.lineCap = 'round'; c.fillStyle = '#4b5d6b';
    c.beginPath(); c.moveTo(f.x, top); c.lineTo(f.x, y - 22); c.stroke();
    c.fillRect(f.x - 14, y - 26, 28, 12);
    for (const s2 of [-1, 1]) { c.beginPath(); c.moveTo(f.x + s2 * 10, y - 14); c.quadraticCurveTo(f.x + s2 * (24 * open + 8), y + 4, f.x + s2 * (f.r * 0.9 * open + f.r * 0.3), y + 24); c.stroke(); }
    c.restore();
  }

  // --- HUD update --------------------------------------------------------------------------------------------------
  const setSegs = (frac) => {
    const on = frac * 10;
    cellSegs.forEach((s, i) => { const v = Math.max(0, Math.min(1, on - i)); s.style.opacity = String(0.18 + 0.82 * v); s.classList.toggle('on', v > 0.02); });
    cell.classList.toggle('is-low', frac < 0.4 && frac >= 0.18); cell.classList.toggle('is-crit', frac < 0.18);
  };
  let lastWord = '';
  const updateHud = () => {
    const frac = g.charge / g.chargeMax;
    setSegs(frac);
    const hp = Math.round(g.heat);
    heatFill.style.width = `${hp}%`;
    const hc = heatRGB(g.heat / 100); heatFill.style.background = `linear-gradient(90deg, rgb(150,246,255), rgb(${hc.join(',')}))`;
    heat.classList.toggle('is-hot', g.heat > 72 || g.seizeLeft > 0);
    let w = words(g);
    // a quiet nudge if they have not found the listen pulse: lifted for a while, rings long gone
    if (phase === 'play' && touched && !listened && idleT > 4 && !g.over && g.charge > g.chargeMax * 0.2) w = 'hold still on the rock to listen';
    if (w !== lastWord) { lastWord = w; status.textContent = w; status.dataset.tone = /careful|hot|seized|low|vein|empty/.test(w) ? 'warn' : /something|listen/.test(w) ? 'find' : ''; }
    const pr = mainProgress(g), main = R.finds[0];
    ringFg.setAttribute('stroke-dashoffset', String(207.3 * (1 - pr.share)));
    findWord.textContent = pr.word;
    const mc = main.seen ? main.colour : '#6f8392';
    glyph.style.setProperty('--find', mc);
    findBox.classList.toggle('is-free', pr.share >= 1 && main.cracks < BASE.shatter);
    clawBtn.classList.toggle('is-ready', pr.share >= 1 && main.cracks < BASE.shatter);
    if (R.finds.length > 1 && pips.childElementCount !== R.finds.length - 1) { pips.replaceChildren(...R.finds.slice(1).map(() => el('i', 'sd-pip'))); }
    R.finds.slice(1).forEach((f, i) => { const p = pips.children[i]; if (p) { p.classList.toggle('is-seen', f.seen); p.classList.toggle('is-free', isFreed(f)); p.style.setProperty('--c', f.colour); } });
    root.dataset.low = frac < 0.18 ? '1' : '0';
  };

  // --- the loop ----------------------------------------------------------------------------------------------------
  let acc = 0;
  const loop = (ts) => {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, lastDraw ? (ts - lastDraw) / 1000 : 0.016); lastDraw = ts;
    frame++;
    phaseT += dt;
    if (armed > 0) { armed -= dt; if (armed <= 0 || isFreed(R.finds[0])) { armed = 0; clawBtn.textContent = 'Bring the claw'; clawBtn.classList.remove('is-armed'); } }
    idleT = (ptr.down || kb.space || kb.dx || kb.dy) ? 0 : idleT + dt;
    if (phase === 'play' && !g.over) {
      acc += dt;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        let inp;
        if (ptr.down) inp = { x: ptr.x, y: ptr.y, down: true };
        else if (kb.space || kb.dx || kb.dy) { const l = Math.hypot(kb.dx, kb.dy); inp = { x: l ? g.bit.x + kb.dx / l * 90 : g.bit.x, y: l ? g.bit.y + kb.dy / l * 90 : g.bit.y, down: kb.space }; }
        else inp = { x: g.bit.x, y: g.bit.y, down: false };
        step(g, 1 / 60, inp);
        if (g.over) break;
      }
      // dust
      if (g.drilling && !reduced && frame % 2 === 0) {
        const vein = g.frontKind === K.VEIN;
        dust.push({ x: g.bit.x + (rnd() - 0.5) * 8, y: g.bit.y + (rnd() - 0.5) * 8, vx: (rnd() - 0.5) * 36, vy: 14 + rnd() * 40, life: 0.5 + rnd() * 0.5, age: 0, hot: vein && rnd() < 0.5, s: 1 + rnd() * 1.6 });
      }
      // drill sound follows the rock
      if (g.drilling || g.moving) sound.drill(true, g.frontKind === K.VEIN ? 0.95 : g.drilling ? 0.35 : 0.05); else sound.drill(false);
      if (g.seizeLeft > 0) sound.drill(false);
      if (!lowSaid && g.charge < g.chargeMax * 0.18) { lowSaid = true; sound.low(); }
    } else sound.drill(false);
    for (const ev of drain(g)) onEvent(ev);
    R.finds.forEach((f, i) => { const fr = isFreed(f); if (fr && !freedBefore[i] && phase === 'play') { sound.freed(); burst(f, 22, 110); navigator.vibrate?.([20, 30, 20]); flash = Math.max(flash, 0.5); } freedBefore[i] = fr; });
    if (g.over && phase === 'play') {
      sound.drill(false);
      armed = 0; clawBtn.textContent = 'Bring the claw'; clawBtn.classList.remove('is-armed');
      const ok = resultOf(g).success;
      if (ok) { phase = 'claw'; phaseT = 0; sound.claw(); } else { phase = 'reveal'; phaseT = 0; }
      root.dataset.phase = phase;
    } else if (phase === 'claw' && phaseT > 2.1) { phase = 'reveal'; phaseT = 0; root.dataset.phase = phase; sound.win(); }
    else if (phase === 'reveal' && phaseT > 1.5) showCard();
    // particles and fx
    for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 40 * dt; if (d.age > d.life) dust.splice(i, 1); }
    for (const x of crackFx) x.t += dt;
    shake = Math.max(0, shake - dt * 2.2) + (g.drilling && g.frontKind === K.VEIN && !reduced ? Math.min(0.2, dt * 4) : 0); shake = Math.min(shake, 1.5);
    flash = Math.max(0, flash - dt * 4);
    drawScene(g.t + phaseT * (phase === 'play' ? 0 : 1));
    updateHud();
  };
  // each crack gets its own growth timer
  const origOnEvent = onEvent;
  raf = requestAnimationFrame(loop);

  return {
    root, g, view,
    destroy() { destroyed = true; cancelAnimationFrame(raf); ro?.disconnect(); sound.destroy(); root.removeEventListener('keydown', kd); root.removeEventListener('keyup', ku); },
    leave() { sound.destroy(); finish({ done: true, success: false, grade: 0, left: true, effects: {} }); },
    muteSound: (v) => sound.mute(v),
  };
}
