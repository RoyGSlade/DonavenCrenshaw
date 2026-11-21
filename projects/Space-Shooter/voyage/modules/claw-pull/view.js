// Claw: the screen. The rock in the dark, lit only by the claw's own work lamp, drawn on a canvas that follows the claw, with a hangar-kit HUD
// around it (plain words and drawn state, no digits on the live screen). The model is stepped here from real input; the view only reads it.
// Everything on the canvas is drawn in code.
import { createGame, step, grab, goBack, done, giveUp, resultOf, words, gripWord, gripFrac, drain, pathAt, BASE } from './model.js';
import { probe, graspCheck } from './board.js';
import { makeAudio } from './audio.js';

/** Handling's colour: a work-lamp amber. Not taken by another skill (shooting #FF7A59, crafting #FFB547, navigation #C8E06B, perception #F4E3A1). */
export const HANDLING = '#ffc36b';

const el = (tag, cls, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; e.setAttribute(k, v === true ? '' : v); }
  for (const k of [].concat(kids)) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const SVGNS = 'http://www.w3.org/2000/svg';
const mkSvg = (n, a = {}) => { const e = document.createElementNS(SVGNS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

/** The words under a find in the side panel and the result card. */
const CRACK_WORD = ['whole', 'cracked once', 'cracked twice', 'shards'];

export function mountGame(stage, ctx, { result, items, fixtures, quick, onDone }) {
  const audio = makeAudio();
  const reduced = !!ctx.reducedMotion?.();
  const root = el('div', 'm-claw-pull', { 'data-phase': 'in' });
  root.tabIndex = 0;
  stage.replaceChildren(root);
  const say = (id) => { try { ctx.sound?.(id); } catch { /* the host's sound is optional */ } };

  // --- the game ----------------------------------------------------------------------------------------------------
  const g = createGame({ seed: ctx.seed ?? 1, tier: ctx.tier ?? 0, points: ctx.points || {}, quick, result, items, fixtures });
  const B = g.board;
  const itemOf = (f) => B.items?.[f.item] || {};
  const iconUrl = (f) => (f.icon ? new URL(f.icon, import.meta.url).href : null);

  // --- DOM ---------------------------------------------------------------------------------------------------------
  const gripWordEl = el('b', '', {}, 'good grip');
  const gripChip = el('div', 'cp-grip', { 'aria-live': 'polite', hidden: true }, [el('i', 'cp-grip-dot'), gripWordEl]);
  const top = el('div', 'cp-top', {}, [el('div', 'cp-title ui-nameplate', {}, [el('b', '', {}, 'Claw'), el('span', '', {}, quick ? 'quick' : '')]), gripChip]);
  const canvas = el('canvas', 'cp-canvas', { 'aria-label': 'Your tunnel, lit by the claw. Drag to steer. Tap the find to close the jaws.' });
  const introTitle = el('b', '', {}, 'Bring the claw');
  const introText = el('span', '', {}, 'Drag to steer the claw down your own tunnel. Close the jaws on the find, then hold Reel, and nudge the load off the walls.');
  const intro = el('div', 'cp-intro', {}, [introTitle, introText]);
  const status = el('div', 'cp-status', { 'aria-live': 'polite' }, 'steer down the tunnel');
  const hint = el('div', 'cp-hint', { hidden: true }, 'Drag beside the load to nudge it off a wall');
  const boardEl = el('div', 'cp-board', {}, [canvas, intro, hint, status]);
  const scope = el('div', 'cp-scope', {}, [boardEl]);

  const findWord = el('div', 'cp-find-word', {}, 'down in the rock');
  const pips = el('div', 'cp-pips');
  const glyph = mkSvg('svg', { viewBox: '0 0 80 80', class: 'cp-glyph' });
  const ringBg = mkSvg('circle', { cx: 40, cy: 40, r: 33, class: 'cp-ring-bg' });
  const ringFg = mkSvg('circle', { cx: 40, cy: 40, r: 33, class: 'cp-ring-fg', 'stroke-dasharray': '207.3', 'stroke-dashoffset': '207.3', transform: 'rotate(-90 40 40)' });
  const gem = mkSvg('path', { d: 'M40 20 L54 34 L40 62 L26 34 Z M26 34 H54 M40 20 L34 34 L40 62 L46 34 Z', class: 'cp-gem' });
  glyph.append(ringBg, ringFg, gem);
  const findName = el('small', '', {}, 'The find');
  const findBox = el('div', 'cp-find', {}, [findName, glyph, findWord, pips]);

  // the winch drum on the Reel pad turns with the winch; three lamps show how far it has wound up
  const drum = mkSvg('svg', { viewBox: '0 0 48 48', class: 'cp-drum' });
  const drumG = mkSvg('g', { transform: 'translate(24 24)' });
  drumG.append(mkSvg('circle', { r: 17, class: 'cp-drum-rim' }), mkSvg('circle', { r: 4, class: 'cp-drum-hub' }));
  for (let i = 0; i < 6; i++) drumG.append(mkSvg('line', { x1: 0, y1: 0, x2: Math.cos(i * Math.PI / 3) * 16, y2: Math.sin(i * Math.PI / 3) * 16, class: 'cp-drum-spoke' }));
  drum.append(drumG);
  const lamps = [el('i'), el('i'), el('i')];
  const reelLabel = el('span', 'cp-reel-label', {}, 'Reel');
  const btnB = el('button', 'cp-reel ui-btn', { type: 'button', 'aria-label': 'Reel: hold to pull the load out' }, [drum, el('span', 'cp-reel-text', {}, [reelLabel, el('span', 'cp-lamps', {}, lamps)])]);
  const btnA = el('button', 'cp-grab ui-btn primary', { type: 'button' }, 'Close the jaws');
  const actions = el('div', 'cp-actions', {}, [btnA, btnB]);
  const side = el('div', 'cp-side', {}, [findBox, actions]);
  const card = el('div', 'cp-card-wrap', { hidden: true });
  root.append(top, scope, side, card);

  // --- sizing ------------------------------------------------------------------------------------------------------
  const wideNow = () => stage.clientWidth >= 860 && stage.clientWidth > stage.clientHeight * 1.1;
  root.classList.toggle('is-wide', wideNow());
  let cssW = 0, cssH = 0, dpr = 1;
  const resize = () => {
    const r = scope.getBoundingClientRect();
    dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
    cssW = Math.max(120, Math.floor(r.width)); cssH = Math.max(120, Math.floor(r.height));
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
    lit.width = canvas.width; lit.height = canvas.height;
    root.classList.toggle('is-wide', wideNow());
    miniDirty = true;
  };
  const lit = document.createElement('canvas');
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;

  // --- the rock, drawn once ----------------------------------------------------------------------------------------
  const TS = 0.8;   // texture pixels per board unit
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  let rockDim, rockLit, tunDim, tunLit, halo, builtRev = -1, miniBase = null, miniDirty = true;
  const noise2 = (() => {
    const L = (ix, iy, s) => hash(ix * 374761393 + iy * 668265263 + s * 1274126177 + g.seed);
    return (x, y, cs, s) => { const fx = x / cs, fy = y / cs, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return mix(mix(L(ix, iy, s), L(ix + 1, iy, s), sx), mix(L(ix, iy + 1, s), L(ix + 1, iy + 1, s), sx), sy); };
  })();
  const buildRock = () => {
    const w = B.W * TS, h = B.H * TS;
    rockDim = mkCanvas(w, h); rockLit = mkCanvas(w, h);
    const cd = rockDim.getContext('2d'), cl = rockLit.getContext('2d');
    const id = cd.createImageData(rockDim.width, rockDim.height), il = cl.createImageData(rockLit.width, rockLit.height);
    for (let y = 0; y < rockDim.height; y++) {
      for (let x = 0; x < rockDim.width; x++) {
        const wx = x / TS, wy = y / TS;
        const n = noise2(wx, wy, 70, 1) * 0.5 + noise2(wx, wy, 22, 2) * 0.3 + noise2(wx, wy, 7, 3) * 0.2;
        const speck = hash((x * 7919) ^ (y * 104729) ^ g.seed) > 0.985 ? 1 : 0;
        const strata = 0.5 + 0.5 * Math.sin((wy * 0.045 + noise2(wx, wy, 120, 4) * 3.2));
        const o = (y * rockDim.width + x) * 4, v = 0.55 * n + 0.25 * strata + 0.2 * speck;
        id.data[o] = 16 + v * 26; id.data[o + 1] = 24 + v * 30; id.data[o + 2] = 33 + v * 34; id.data[o + 3] = 255;
        il.data[o] = 128 + v * 110; il.data[o + 1] = 108 + v * 92; il.data[o + 2] = 86 + v * 70; il.data[o + 3] = 255;
      }
    }
    cd.putImageData(id, 0, 0); cl.putImageData(il, 0, 0);
  };
  const buildTunnel = () => {
    const w = B.W * TS, h = B.H * TS, cs = B.cell * TS;
    const mask = mkCanvas(w, h), mc = mask.getContext('2d');
    mc.fillStyle = '#fff';
    for (let gy = 0; gy < B.gh; gy++) for (let gx = 0; gx < B.gw; gx++) if (B.open[gy * B.gw + gx]) mc.fillRect(gx * cs - 0.4, gy * cs - 0.4, cs + 0.8, cs + 0.8);
    const soft = mkCanvas(w, h), sc = soft.getContext('2d');
    if ('filter' in sc) sc.filter = `blur(${(B.cell * TS * 0.62).toFixed(1)}px)`;
    sc.drawImage(mask, 0, 0); sc.filter = 'none';
    const tint = (col, base) => {
      const c = mkCanvas(w, h), x = c.getContext('2d');
      x.drawImage(soft, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, w, h);
      if (base) { x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.5; x.drawImage(base, 0, 0); }
      return c;
    };
    tunDim = tint('#05090d', null);
    tunLit = tint('#17120f', null);
    // the rim light: a halo of the rock face round the tunnel
    halo = mkCanvas(w, h);
    const hc = halo.getContext('2d');
    if ('filter' in hc) hc.filter = `blur(${(11 * TS).toFixed(1)}px)`;
    hc.drawImage(mask, 0, 0); hc.filter = 'none';
    hc.globalCompositeOperation = 'destination-out'; hc.drawImage(soft, 0, 0);
    hc.globalCompositeOperation = 'source-in'; hc.fillStyle = '#ffd9a0'; hc.fillRect(0, 0, w, h);
    builtRev = B.rev ?? 0;
  };
  buildRock(); buildTunnel();

  // --- input -------------------------------------------------------------------------------------------------------
  const ptr = { down: false, x: 0, y: 0, id: null, type: 'mouse' };
  const kb = { dx: 0, dy: 0, space: false, keys: new Set() };
  let reelPad = false, touched = false, phaseT = 0, cardT = 0, destroyed = false, finished = false;
  const LIFT = 48;   // a finger covers the claw: a touch aims a little above the fingertip
  const cam = { x: B.start.x, y: B.start.y, z: 1, tz: 1, tx: B.start.x, ty: B.start.y };
  const toWorld = (cx, cy, lift = 0) => { const r = canvas.getBoundingClientRect(); return { x: cam.x + (cx - r.left - cssW / 2) / cam.z, y: cam.y + (cy - r.top - lift - cssH / 2) / cam.z }; };
  const wake = () => { if (!touched) { touched = true; intro.classList.add('is-gone'); say('music:duck'); } audio.unlock(); };
  const grabNow = () => {
    if (g.phase !== 'in') return;
    const r = grab(g);
    if (!r.ok) { lastGrabFail = g.t; pulseBtn(btnA, 'is-no'); }
  };
  let lastGrabFail = -9;
  const pulseBtn = (b, cls) => { b.classList.remove(cls); void b.offsetWidth; b.classList.add(cls); setTimeout(() => b.classList.remove(cls), 450); };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (g.over) return;
    e.preventDefault(); wake();
    ptr.down = true; ptr.id = e.pointerId; ptr.type = e.pointerType || 'mouse';
    const w = toWorld(e.clientX, e.clientY, ptr.type === 'touch' && g.phase === 'in' ? LIFT : 0); ptr.x = w.x; ptr.y = w.y;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    ptr.t0 = performance.now(); ptr.cx = e.clientX; ptr.cy = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => { if (!ptr.down || e.pointerId !== ptr.id) return; const w = toWorld(e.clientX, e.clientY, ptr.type === 'touch' && g.phase === 'in' ? LIFT : 0); ptr.x = w.x; ptr.y = w.y; });
  const up = (e) => {
    audio.unlock();
    if (e.pointerId !== ptr.id) return;
    // a quick tap on a find, with the claw close, closes the jaws (a press that drags is steering, never a grab)
    if (e.type === 'pointerup' && g.phase === 'in' && !g.over && performance.now() - (ptr.t0 || 0) < 320 && Math.hypot(e.clientX - ptr.cx, e.clientY - ptr.cy) < 12) {
      const tw = toWorld(e.clientX, e.clientY, 0);
      for (const f of g.finds) {
        if (f.state !== 'rock' && f.state !== 'lying') continue;
        if (Math.hypot(tw.x - f.x, tw.y - f.y) < f.r + 16 && Math.hypot(g.head.x - f.x, g.head.y - f.y) < f.r + BASE.reach + 40) { grabNow(); break; }
      }
    }
    ptr.down = false; ptr.id = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  const holdReel = (v) => { reelPad = v; btnB.classList.toggle('is-held', v); };
  btnB.addEventListener('pointerdown', (e) => {
    e.preventDefault(); wake();
    if (btnB.dataset.mode === 'done') { done(g); return; }
    if (g.phase !== 'reel') { pulseBtn(btnB, 'is-no'); return; }
    holdReel(true); try { btnB.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btnB.addEventListener(ev, () => holdReel(false));
  btnB.addEventListener('contextmenu', (e) => e.preventDefault());
  btnA.addEventListener('click', () => { wake(); if (btnA.dataset.mode === 'back') { goBack(g); } else grabNow(); });
  btnA.addEventListener('pointerdown', () => wake());

  const KEYMAP = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0] };
  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) { down ? kb.keys.add(k) : kb.keys.delete(k); let dx = 0, dy = 0; for (const q of kb.keys) { dx += KEYMAP[q][0]; dy += KEYMAP[q][1]; } kb.dx = Math.sign(dx); kb.dy = Math.sign(dy); e.preventDefault(); if (down) wake(); }
    else if (k === ' ') { e.preventDefault(); if (down) wake(); if (g.phase === 'reel') holdReel(down); else if (!down) holdReel(false); }
    else if (down && (k === 'enter' || k === 'g' || k === 'c')) { e.preventDefault(); wake(); if (g.phase === 'bay') goBack(g); else grabNow(); }
  };
  // keys are heard on the whole page: a disabled button that had focus must not swallow the Space bar
  const kd = (e) => { if (!destroyed && !g.over && root.isConnected && !/^(input|textarea|select)$/i.test(e.target?.tagName || '')) onKey(e, true); };
  const ku = (e) => { if (!destroyed && root.isConnected) onKey(e, false); };
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  setTimeout(() => root.focus({ preventScroll: true }), 0);

  // --- state for drawing -------------------------------------------------------------------------------------------
  let rs = (g.seed * 2654435761) >>> 0;
  const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
  const parts = [];
  const burst = (x, y, n, { kind = 'grit', col = null, sp = 60, up = 0, life = 0.7 } = {}) => {
    if (reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, v = sp * (0.3 + rnd()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: life * (0.6 + rnd() * 0.7), age: 0, kind, col, s: 0.9 + rnd() * 1.6 }); }
  };
  let nudgeVec = { x: 0, y: 0 }, hintT = 0, buriedHint = null, lastPhaseSeen = 'in';
  let shake = 0, flash = 0, facing = 0, ang = 0, drumA = 0, lastDraw = 0, raf = 0, frame = 0, tension = 0, grabAnim = 1, landFlare = 0;
  const crackAnim = new Map();
  const jaw = { open: 0.35 };
  const bayPos = (k) => {
    const o = B.out, lx = -o.y, ly = o.x;
    const slot = (k - (g.finds.length - 1) / 2) * 92;
    return { x: B.mouth.x + o.x * 128 + lx * slot, y: B.mouth.y + o.y * 128 + ly * slot };
  };
  const bayOrder = []; // the finds that have landed, in the order they landed
  const toScreen = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + cssW / 2 + (x - cam.x) * cam.z, y: r.top + cssH / 2 + (y - cam.y) * cam.z }; };
  const view = { g, root, canvas, cam, toWorld, toScreen, ptr, kb, audio, B, get cssW() { return cssW; }, get cssH() { return cssH; }, bayPos, parts };
  root.__view = view; root.__game = g;

  const onEvent = (ev) => {
    say(`claw:${ev.type}`);
    switch (ev.type) {
      case 'grab': { buriedHint = null;
        audio.clamp(); if (ev.tear) audio.tear(); const f = g.finds[ev.find]; grabAnim = 0; flash = Math.max(flash, 0.35); shake = Math.max(shake, 0.5);
        burst(f.x, f.y, ev.tear ? 22 : 10, { kind: 'chip', col: hex(f.colour), sp: 90, life: 0.9 }); burst(f.x, f.y, 10, { kind: 'grit', sp: 50 }); navigator.vibrate?.(22); break;
      }
      case 'warn': audio.warn(); break;
      case 'buried': { const f = g.finds[ev.find], angs = []; for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2, x = f.x + Math.cos(a) * (f.r + 13), y = f.y + Math.sin(a) * (f.r + 13); if (B.open[Math.floor(y / B.cell) * B.gw + Math.floor(x / B.cell)] && graspCheck(B, f, x, y, BASE.reach, ev.find).ok) angs.push(a); } buriedHint = { f, angs, t: 3 }; audio.buried(); shake = Math.max(shake, 0.25); burst(g.head.x, g.head.y, 6, { kind: 'grit', sp: 40 }); break; }
      case 'miss': audio.miss(); break;
      case 'scrape': audio.scrape(ev.loaded); if (!reduced) burst(ev.x, ev.y, 2, { kind: 'grit', sp: 26, up: -10 }); break;
      case 'knock': audio.knock(ev.sev); shake = Math.max(shake, 0.5 + 0.7 * ev.sev); flash = Math.max(flash, 0.12); burst(ev.x, ev.y, 10 + Math.round(8 * ev.sev), { kind: 'spark', sp: 120 }); burst(ev.x, ev.y, 8, { kind: 'grit', sp: 60 }); navigator.vibrate?.(18 + 22 * ev.sev); break;
      case 'slip': audio.slip(ev.level); break;
      case 'drop': audio.drop(); shake = Math.max(shake, 0.8); break;
      case 'crack': { audio.crack(); const f = g.finds[ev.find]; flash = Math.max(flash, 0.5); crackAnim.set(`${ev.find}:${ev.cracks}`, 0); burst(ev.x, ev.y, 16, { kind: 'chip', col: hex(f.colour), sp: 110 }); navigator.vibrate?.(35); break; }
      case 'shatter': audio.shatter(); shake = 1.3; burst(ev.x, ev.y, 30, { kind: 'chip', col: hex(g.finds[ev.find].colour), sp: 150, life: 1.2 }); break;
      case 'mouth': audio.light(); break;
      case 'landed': { audio.land(); const k = bayOrder.length; bayOrder.push(ev.find); const p = bayPos(k); landFlare = 1; burst(p.x, p.y, 26, { kind: 'glint', col: hex(g.finds[ev.find].colour), sp: 90, life: 1.1 }); shake = Math.max(shake, 0.5); navigator.vibrate?.([20, 30, 20]); break; }
      case 'over': if (finished) break; (g.passed ? audio.win : audio.lose)(); break;
      default: break;
    }
  };

  // --- the result card ---------------------------------------------------------------------------------------------
  const finish = (res) => { if (finished) return; finished = true; audio.destroy(); say('music:unduck'); onDone(res); };
  const showCard = () => {
    root.dataset.phase = 'card';
    const res = resultOf(g);
    card.hidden = false; card.replaceChildren();
    const ok = res.success, why = g.over.why;
    const head = ok ? (res.perfect ? 'Clean pull' : 'It is out') : why === 'shattered' ? 'It shattered' : 'Not this time';
    const sub = ok ? (res.dropped ? 'You got it out after a drop.' : res.knocks ? (res.knocks === 1 ? 'Out, with a knock on the way.' : 'Out, with a few knocks on the way.') : 'No knocks, no drops.') : why === 'shattered' ? 'It came out as shards: you keep what is left of it.' : 'You let it go. The find is still down there.';
    const rows = g.finds.map((f, i) => {
      const out = f.state === 'out', gone = f.state === 'shattered';
      const state = gone ? 'shards' : out ? CRACK_WORD[Math.min(2, f.cracks)] : f.state === 'lying' ? 'left lying in the tunnel' : f.canGrab ? 'left in the rock' : 'still buried';
      const icon = iconUrl(f) ? el('img', 'cp-row-img', { src: iconUrl(f), alt: '', draggable: false }) : el('i', 'cp-row-dot');
      const q = el('span', 'cp-q'); const qv = clamp((100 - 28 * f.cracks - 4 * f.knocks) / 100, 0.08, 1); q.append(el('i', '', { style: `width:${Math.round(qv * 100)}%` }));
      return el('li', `cp-row ${out ? 'is-out' : gone ? 'is-lost' : ''}`, {}, [icon, el('span', 'cp-row-name', {}, [el('b', '', {}, f.name), el('small', '', {}, `${i === 0 ? 'main find' : 'bonus'} · ${state}`)]), out ? q : null]);
    });
    const lines = [];
    if (ok) lines.push(el('div', 'cp-line', {}, `+${res.xp} Handling XP`));
    if (res.shattered?.shards) lines.push(el('div', 'cp-line', {}, `+1 ${B.items?.[res.shattered.shards]?.name || 'shards'}`));
    const go = el('button', 'ui-btn primary cp-go', { type: 'button' }, 'Done');
    go.addEventListener('click', () => finish(res));
    card.append(el('div', `cp-card ui-card ${ok ? 'is-ok' : 'is-bad'}`, { role: 'dialog', 'aria-label': head }, [el('div', 'cp-card-head', {}, [el('b', '', {}, head), el('span', '', {}, sub)]), el('ul', 'cp-rows', {}, rows), ...lines, el('div', 'cp-card-btns', {}, [go])]));
    go.focus?.();
  };

  // --- drawing -----------------------------------------------------------------------------------------------------
  const c2 = canvas.getContext('2d'), lc = lit.getContext('2d');
  const R_LAMP = 128;
  const lampAt = () => ({ x: g.head.x + Math.cos(facing) * 12, y: g.head.y + Math.sin(facing) * 12 });
  const rockPath = (c) => { const r = B.rock; c.beginPath(); c.ellipse(r.cx, r.cy, r.rx, r.ry, 0, 0, Math.PI * 2); };

  const setCam = (dt) => {
    // the camera follows the claw and comes in as it nears a find, and again as the load nears the mouth
    const short = Math.min(cssW, cssH), longer = Math.max(cssW, cssH);
    const base = clamp(Math.min(cssW / 300, cssH / 330), 0.9, 2.1) * (cssW > cssH * 1.05 ? 1.0 : 1.0);
    void short; void longer;
    let tx = g.head.x, ty = g.head.y, tz = base;
    if (g.phase === 'in') {
      let nd = 1e9;
      for (const f of g.finds) if (f.state === 'rock' || f.state === 'lying') nd = Math.min(nd, Math.hypot(f.x - g.head.x, f.y - g.head.y) - f.r);
      const near = 1 - clamp((nd - 20) / 180, 0, 1);
      tz = base * (1 + 0.55 * near);
      if (ptr.down) { tx += (ptr.x - g.head.x) * 0.2; ty += (ptr.y - g.head.y) * 0.2; }
    } else if (g.phase === 'reel') {
      const dm = Math.hypot(g.head.x - B.start.x, g.head.y - B.start.y);
      const near = 1 - clamp((dm - 40) / 260, 0, 1);
      tz = base * (1.18 + 0.5 * near);
      // look toward the mouth a little: that is where the load is going
      const mx = B.start.x - g.head.x, my = B.start.y - g.head.y, ml = Math.hypot(mx, my) || 1;
      tx += mx / ml * Math.min(30, ml * 0.15) * (1 - near * 0.4); ty += my / ml * Math.min(30, ml * 0.15) * (1 - near * 0.4);
    } else if (g.phase === 'land' || g.phase === 'bay' || g.phase === 'over') {
      const p = bayPos(Math.max(0, bayOrder.length - 1)), landing = g.phase === 'land';
      tx = (B.start.x + p.x) / 2; ty = (B.start.y + p.y) / 2; tz = base * (landing ? 1.7 : 1.35);
    }
    const k = 1 - Math.exp(-dt * (g.phase === 'in' ? 5 : 4));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * (1 - Math.exp(-dt * 3));
    cam.tx = tx; cam.ty = ty; cam.tz = tz;
  };

  const FIND_SHAPE = (c, f, r, i, fi, t, rot) => {
    const col = hex(f.colour);
    c.save(); c.rotate(rot);
    const body = c.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, rgba(col.map((v) => Math.min(255, v + 70)), fi)); body.addColorStop(1, rgba(col.map((v) => Math.round(v * 0.55)), fi));
    c.fillStyle = body; c.strokeStyle = rgba(col.map((v) => Math.min(255, v + 110)), fi); c.lineWidth = Math.max(1, r * 0.06); c.lineJoin = 'round';
    if (f.kind === 'gem') {
      const n = 5 + Math.floor(hash(i * 13 + g.seed) * 3);
      c.beginPath(); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = r * (k % 2 ? 0.86 : 1); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = rgba([255, 255, 255], 0.35 * fi); c.beginPath(); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); } c.stroke();
    } else if (f.kind === 'ore') {
      c.beginPath(); const n = 9; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rr = r * (0.82 + 0.28 * hash(i * 97 + k * 13 + g.seed)); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke();
      c.fillStyle = rgba([255, 240, 200], 0.55 * fi); for (let k = 0; k < 6; k++) { c.beginPath(); c.arc((hash(k * 5 + i) - 0.5) * r, (hash(k * 7 + i + 3) - 0.5) * r, r * 0.07, 0, 7); c.fill(); }
    } else if (f.kind === 'relic') {
      const s2 = r * 0.84; c.beginPath(); c.rect(-s2, -s2, s2 * 2, s2 * 2); c.fill(); c.stroke();
      c.strokeStyle = rgba([255, 255, 255], 0.5 * fi); c.beginPath(); c.rect(-s2 * 0.55, -s2 * 0.55, s2 * 1.1, s2 * 1.1); c.moveTo(-s2, 0); c.lineTo(-s2 * 0.55, 0); c.moveTo(s2, 0); c.lineTo(s2 * 0.55, 0); c.moveTo(0, -s2); c.lineTo(0, -s2 * 0.55); c.stroke();
    } else {
      c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = rgba([255, 255, 255], 0.5 * fi); c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; c.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); } c.closePath(); c.stroke();
      c.fillStyle = rgba([255, 255, 255], 0.7 * fi); c.beginPath(); c.arc(0, 0, r * 0.12, 0, 7); c.fill();
    }
    c.restore();
  };
  const drawFind = (c, f, i, x, y, r, fi, t, o = {}) => {
    c.save(); c.translate(x, y);
    const col = hex(f.colour);
    if (!o.noGlow) { const glow = c.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.6); glow.addColorStop(0, rgba(col, 0.45 * fi)); glow.addColorStop(1, rgba(col, 0)); c.fillStyle = glow; c.beginPath(); c.arc(0, 0, r * 2.6, 0, 7); c.fill(); }
    const rot = (hash(i * 31 + g.seed) * 6.28) + (o.spin || 0);
    FIND_SHAPE(c, f, r, i, fi, t, rot);
    // the cracks lie on the find's own body
    c.strokeStyle = `rgba(255,255,255,${0.9 * Math.max(fi, 0.5)})`; c.lineWidth = Math.max(1, r * 0.075); c.lineCap = 'round';
    for (let k = 0; k < Math.min(3, f.cracks); k++) {
      const grow = Math.min(1, (crackAnim.get(`${i}:${k + 1}`) ?? 1) * 4), a0 = rot + k * 2.1 + 0.4;
      c.beginPath(); c.moveTo(0, 0);
      for (let s = 1; s <= 5; s++) { const a = a0 + (hash(i * 31 + k * 11 + s) - 0.5) * 0.9, d = r * 1.05 * (s / 5) * grow; c.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
      c.stroke();
    }
    if (f.state === 'shattered') { c.fillStyle = 'rgba(4,8,13,.5)'; c.beginPath(); c.arc(0, 0, r * 1.02, 0, 7); c.fill(); }
    else if (!o.noGlint) { const tw = Math.max(0, Math.sin(t * 3.2 + i * 2)), gs = r * (0.25 + 0.6 * tw) * Math.min(1, fi * 1.4); c.strokeStyle = rgba([255, 255, 255], 0.75 * fi * tw); c.lineWidth = Math.max(0.7, r * 0.04); c.beginPath(); c.moveTo(-gs, 0); c.lineTo(gs, 0); c.moveTo(0, -gs); c.lineTo(0, gs); c.stroke(); }
    c.restore();
  };

  // the claw: body, work lamp, two jaws that fold in the tunnel, open near a find and clamp the load
  const drawClaw = (c, t, cs) => {
    const h = g.head, loaded = g.carry >= 0 && g.phase === 'reel', frac = gripFrac(g);
    const strain = loaded ? clamp((0.6 - frac) / 0.6, 0, 1) : 0, slip = loaded ? clamp((0.3 - frac) / 0.3, 0, 1) : 0;
    const jx = (reduced ? 0 : (rnd() - 0.5)) * strain * 1.4, jy = (reduced ? 0 : (rnd() - 0.5)) * strain * 1.4;
    c.save(); c.translate(h.x + jx, h.y + jy); c.rotate(ang); c.scale(cs, cs);
    // the cable end
    c.strokeStyle = '#d7e6ee'; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-9, 0); c.lineTo(-13, 0); c.stroke();
    const target = loaded ? 0 : g.phase === 'in' ? (jaw.near ? 1.0 : 0.42) : 0.42;
    jaw.open += (target - jaw.open) * Math.min(1, 0.2);
    const op = loaded ? 0 : jaw.open;
    // the load in the jaws (a piece of the find, drawn at its carried size)
    const carry = loaded ? g.finds[g.carry] : null;
    if (carry) {
      const scale = mix(clamp(carry.r / carry.carriedR, 1, 5), 1, easeOut(clamp(grabAnim, 0, 1)));
      const sag = slip * 2.8 + (frac < 0.6 ? 0.6 : 0);
      c.save(); c.translate(10 + (1 - clamp(grabAnim, 0, 1)) * 2, sag); c.rotate(-ang + 0.3 * Math.sin(t * 2));
      drawFind(c, carry, g.carry, 0, 0, carry.carriedR * 1.05 * Math.min(scale, 1 + 3 * (1 - clamp(grabAnim * 3, 0, 1))), 1, t, { noGlow: false, noGlint: false });
      c.restore();
    }
    // body
    const bodyG = c.createLinearGradient(0, -6, 0, 6); bodyG.addColorStop(0, '#9fb3c1'); bodyG.addColorStop(1, '#3d4f5d');
    c.fillStyle = bodyG; c.strokeStyle = '#0b141c'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-9, -4.2); c.lineTo(1, -5.6); c.lineTo(3.5, -2.4); c.lineTo(3.5, 2.4); c.lineTo(1, 5.6); c.lineTo(-9, 4.2); c.closePath(); c.fill(); c.stroke();
    // the work lamp
    const lampCol = loaded && strain > 0 ? [255, 130, 90] : [255, 214, 150];
    c.fillStyle = rgba(lampCol, 1); c.beginPath(); c.arc(3.2, 0, 2.3, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(3.9, -0.5, 0.9, 0, 7); c.fill();
    // jaws
    const gap = loaded ? slip * 0.55 + strain * 0.12 : 0;
    for (const s of [-1, 1]) {
      c.strokeStyle = loaded && strain > 0.2 ? '#ffb07a' : '#c9d8e2'; c.lineWidth = 2.5; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(1, s * 4.2);
      if (loaded && carry) { const rr = carry.carriedR * 1.05; c.quadraticCurveTo(9, s * (rr + 3.2 + gap * 5), 15.5 + rr * 0.3, s * (rr * (0.45 + gap))); }
      else c.quadraticCurveTo(7 + 4 * op, s * (6 + 9 * op), 11 + 3 * op - 2 * (1 - op), s * (8 * op + 2.4 * (1 - op)));
      c.stroke();
      c.strokeStyle = '#0b141c'; c.lineWidth = 0.8; c.stroke();
    }
    c.restore();
  };

  const drawCable = (c, t) => {
    const h = g.head;
    const upto = g.phase === 'reel' ? g.s : 1e9;
    c.save();
    // the cable runs from the winch out in the bay, to the mouth, along the way in, to the claw
    const P = g.path; if (!P.length) { c.restore(); return; }
    const winch = { x: B.mouth.x + B.out.x * 150, y: B.mouth.y + B.out.y * 150 };
    const taut = clamp(g.v / 140, 0, 1) * (g.phase === 'reel' ? 1 : 0);
    const pts = [winch, { x: B.mouth.x, y: B.mouth.y }];
    for (const p of P) { if (p.s > upto) break; pts.push(p); }
    pts.push({ x: g.phase === 'reel' ? g.anchor.x : h.x, y: g.phase === 'reel' ? g.anchor.y : h.y });
    if (g.phase === 'reel') pts.push({ x: h.x, y: h.y });
    c.lineCap = 'round'; c.lineJoin = 'round';
    const path = () => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); };
    path(); c.strokeStyle = `rgba(255,205,130,${0.12 + 0.16 * taut})`; c.lineWidth = 6 + 3 * taut; c.stroke();
    path(); c.strokeStyle = taut > 0.05 ? `rgb(${255},${Math.round(mix(236, 250, taut))},${Math.round(mix(214, 240, taut))})` : '#cfe3ee'; c.lineWidth = 2.1 - 0.5 * taut; c.stroke();
    if (g.phase === 'reel' && g.v > 4) { path(); c.setLineDash([5, 13]); c.lineDashOffset = t * g.v * 0.5; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.2; c.stroke(); c.setLineDash([]); }
    c.restore();
  };

  const drawWinch = (c, t) => {
    const w = { x: B.mouth.x + B.out.x * 150, y: B.mouth.y + B.out.y * 150 }, a = Math.atan2(B.out.y, B.out.x);
    c.save(); c.translate(w.x, w.y); c.rotate(a);
    c.fillStyle = '#26323d'; c.strokeStyle = '#0a1117'; c.lineWidth = 1.5;
    c.beginPath(); c.rect(-12, -26, 24, 52); c.fill(); c.stroke();
    c.fillStyle = '#3d4f5d'; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill(); c.stroke();
    c.save(); c.rotate(drumA);
    c.strokeStyle = '#8fa6b6'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i * Math.PI / 3) * 13, Math.sin(i * Math.PI / 3) * 13); c.stroke(); }
    c.restore();
    c.fillStyle = '#ffd9a0'; c.beginPath(); c.arc(0, 0, 3.2, 0, 7); c.fill();
    c.restore();
  };

  const drawDeck = (c, t, W, H, k) => {
    // the bay deck: dark steel plates, lit by the bay lamps near the mouth
    c.fillStyle = '#070c12'; c.fillRect(-4000, -4000, 9000, 9000);
    c.save(); c.strokeStyle = 'rgba(70,100,125,.16)'; c.lineWidth = 1.2 / cam.z;
    const gs = 64, x0 = Math.floor((cam.x - W / 2 / cam.z) / gs) * gs, y0 = Math.floor((cam.y - H / 2 / cam.z) / gs) * gs;
    c.beginPath(); for (let x = x0; x < cam.x + W / 2 / cam.z + gs; x += gs) { c.moveTo(x, y0); c.lineTo(x, cam.y + H / 2 / cam.z + gs); } for (let y = y0; y < cam.y + H / 2 / cam.z + gs; y += gs) { c.moveTo(x0, y); c.lineTo(cam.x + W / 2 / cam.z + gs, y); } c.stroke();
    c.restore();
    const lx = B.mouth.x + B.out.x * 120, ly = B.mouth.y + B.out.y * 120;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.2) + landFlare * 0.4;
    const gl = c.createRadialGradient(lx, ly, 10, lx, ly, 330);
    gl.addColorStop(0, `rgba(255,236,196,${0.34 * pulse})`); gl.addColorStop(0.35, `rgba(255,210,150,${0.16 * pulse})`); gl.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(lx, ly, 330, 0, 7); c.fill();
    void k;
  };

  const drawScene = (t, dt) => {
    const W = canvas.width, H = canvas.height, k = cam.z * dpr;
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.fillStyle = '#04070b'; c2.fillRect(0, 0, W, H);
    const sx = reduced ? 0 : (rnd() - 0.5) * shake * 4 * dpr, sy = reduced ? 0 : (rnd() - 0.5) * shake * 4 * dpr;
    const T = (c) => c.setTransform(k, 0, 0, k, W / 2 - cam.x * k + sx, H / 2 - cam.y * k + sy);
    T(c2);
    drawDeck(c2, t, cssW, cssH, k);
    // the rock, dark
    rockPath(c2); c2.fillStyle = '#080e15'; c2.fill();
    c2.save(); rockPath(c2); c2.clip(); c2.imageSmoothingEnabled = true; c2.drawImage(rockDim, 0, 0, B.W, B.H); c2.drawImage(tunDim, 0, 0, B.W, B.H); c2.globalAlpha = 0.2; c2.drawImage(halo, 0, 0, B.W, B.H); c2.globalAlpha = 1; c2.restore();
    rockPath(c2); c2.strokeStyle = 'rgba(80,116,140,.5)'; c2.lineWidth = 2.5 / cam.z; c2.stroke(); c2.strokeStyle = 'rgba(60,92,115,.16)'; c2.lineWidth = 12 / cam.z; c2.stroke();
    // the seats the finds still sit in
    for (const f of g.finds) if (f.state === 'rock') { c2.fillStyle = 'rgba(2,5,9,.55)'; c2.beginPath(); c2.arc(f.x, f.y, f.r + 3, 0, 7); c2.fill(); }

    // what the work lamp lights: the rock face, the tunnel floor and the rim light, cut to a soft pool round the claw
    const lp = lampAt(), Rl = Math.max(R_LAMP, 96 / cam.z * 1.1);
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, W, H);
    T(lc);
    lc.save(); rockPath(lc); lc.clip(); lc.imageSmoothingEnabled = true; lc.drawImage(rockLit, 0, 0, B.W, B.H); lc.drawImage(tunLit, 0, 0, B.W, B.H); lc.restore();
    lc.globalAlpha = 1; lc.drawImage(halo, 0, 0, B.W, B.H); lc.globalAlpha = 1;
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'destination-in';
    const lx = (lp.x - cam.x) * k + W / 2 + sx, ly = (lp.y - cam.y) * k + H / 2 + sy;
    const gr = lc.createRadialGradient(lx, ly, 4 * k, lx, ly, Rl * k);
    const flick = 1 - 0.04 * Math.sin(t * 17) - (g.touching ? 0.06 : 0);
    gr.addColorStop(0, `rgba(0,0,0,${0.95 * flick})`); gr.addColorStop(0.4, `rgba(0,0,0,${0.62 * flick})`); gr.addColorStop(0.75, `rgba(0,0,0,${0.2 * flick})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = gr; lc.fillRect(0, 0, W, H); lc.globalCompositeOperation = 'source-over';
    // tint it warm: the lamp is amber
    lc.globalCompositeOperation = 'source-atop'; const tint = lc.createRadialGradient(lx, ly, 0, lx, ly, Rl * k); tint.addColorStop(0, 'rgba(255,196,120,.42)'); tint.addColorStop(1, 'rgba(255,190,120,.0)'); lc.fillStyle = tint; lc.fillRect(0, 0, W, H); lc.globalCompositeOperation = 'source-over';
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.drawImage(lit, 0, 0);
    T(c2);

    // the finds that are still in the rock (and the loose ones in the tunnel): dim until the lamp reaches them, with a faint pulse so they can be found
    g.finds.forEach((f, i) => {
      if (f.state !== 'rock' && f.state !== 'lying' && f.state !== 'shattered') return;
      const d = Math.hypot(f.x - lp.x, f.y - lp.y), lamp = clamp(1 - (d - Rl * 0.35) / (Rl * 0.7), 0, 1);
      const fi = clamp(0.3 + 0.7 * lamp + (f.state === 'lying' ? 0.25 : 0), 0, 1) * (f.state === 'shattered' ? 0.7 : 1);
      let x = f.x, y = f.y;
      if (f.state === 'lying' && f.lieFrom && f.rollT < 1) { const u = easeOut(f.rollT); x = mix(f.lieFrom.x, f.x, u); y = mix(f.lieFrom.y, f.y, u); }
      const rr = f.state === 'lying' || f.state === 'shattered' ? f.carriedR * 1.1 : f.r;
      drawFind(c2, f, i, x, y, rr, fi, t, { spin: f.state === 'lying' && f.rollT < 1 ? f.rollT * 9 : 0 });
    });

    drawWinch(c2, t);
    drawCable(c2, t);

    // finds in the bay
    bayOrder.forEach((fi2, k2) => {
      const f = g.finds[fi2], p = bayPos(k2);
      const plate = c2; plate.save(); plate.translate(p.x, p.y);
      plate.fillStyle = 'rgba(20,30,40,.85)'; plate.strokeStyle = 'rgba(160,190,210,.4)'; plate.lineWidth = 1.4; plate.beginPath(); plate.ellipse(0, 0, 40, 32, 0, 0, 7); plate.fill(); plate.stroke(); plate.restore();
      drawFind(c2, f, fi2, p.x, p.y, 16 + Math.min(8, f.r * 0.2), 1, t, {});
    });
    // the load rising into the light
    if (g.phase === 'land') {
      const f = g.finds[g.landFind], u = clamp(g.landT / BASE.landT, 0, 1), tgt = bayPos(bayOrder.length), from = B.start;
      const e = easeOut(u), x = mix(from.x, tgt.x, e), y = mix(from.y, tgt.y, e) - Math.sin(u * Math.PI) * 14;
      drawFind(c2, f, g.landFind, x, y, mix(f.carriedR, 16 + Math.min(8, f.r * 0.2), e), 1, t, { spin: (1 - u) * 1.4 });
      if (!reduced && frame % 3 === 0) burst(x, y, 1, { kind: 'glint', col: hex(f.colour), sp: 24, life: 0.8 });
    }

    // particles
    for (const d of parts) {
      const a = Math.max(0, 1 - d.age / d.life);
      if (d.kind === 'spark') { c2.fillStyle = `rgba(255,${150 + Math.floor(a * 90)},90,${a})`; c2.beginPath(); c2.arc(d.x, d.y, d.s * 0.9 / Math.sqrt(cam.z) * (0.6 + 0.6 * a), 0, 7); c2.fill(); }
      else if (d.kind === 'chip') { c2.fillStyle = rgba(d.col || [200, 200, 200], a); c2.fillRect(d.x - d.s / 2, d.y - d.s / 2, d.s * 1.3, d.s); }
      else if (d.kind === 'glint') { c2.strokeStyle = rgba(d.col || [255, 255, 255], a); c2.lineWidth = 1 / cam.z + 0.4; const s2 = d.s * 2.2 * a; c2.beginPath(); c2.moveTo(d.x - s2, d.y); c2.lineTo(d.x + s2, d.y); c2.moveTo(d.x, d.y - s2); c2.lineTo(d.x, d.y + s2); c2.stroke(); }
      else { c2.fillStyle = `rgba(170,185,198,${a * 0.6})`; c2.beginPath(); c2.arc(d.x, d.y, d.s * 0.8 * (0.6 + 0.4 * a), 0, 7); c2.fill(); }
    }

    // which side is clear: faint arcs on the find's open side after a refused grab
    if (buriedHint && buriedHint.t > 0) {
      const f = buriedHint.f, al = Math.min(1, buriedHint.t) * (0.55 + 0.35 * Math.sin(t * 8));
      c2.save(); c2.strokeStyle = `rgba(150,245,170,${al})`; c2.lineWidth = 3.2; c2.lineCap = 'round';
      for (const a of buriedHint.angs) { c2.beginPath(); c2.arc(f.x, f.y, f.r + 9, a - 0.09, a + 0.09); c2.stroke(); }
      c2.restore();
    }
    // the wall warning: the wall and the load's near edge glow before the knock
    if (g.phase === 'reel' && g.warn.level > 0.04) {
      const w = g.warn, L = w.level, hot = [255, Math.round(mix(190, 90, L)), Math.round(mix(110, 70, L))];
      const gl = c2.createRadialGradient(w.x, w.y, 0, w.x, w.y, 16 + 14 * L); gl.addColorStop(0, rgba(hot, 0.75 * L)); gl.addColorStop(1, rgba(hot, 0));
      c2.fillStyle = gl; c2.beginPath(); c2.arc(w.x, w.y, 16 + 14 * L, 0, 7); c2.fill();
      c2.strokeStyle = rgba(hot, 0.5 + 0.5 * L); c2.lineWidth = 2.2; c2.lineCap = 'round'; c2.beginPath(); c2.moveTo(w.x - w.ny * 9, w.y + w.nx * 9); c2.lineTo(w.x + w.ny * 9, w.y - w.nx * 9); c2.stroke();
      const ea = Math.atan2(-w.ny, -w.nx); c2.lineWidth = 2.6; c2.beginPath(); c2.arc(g.head.x, g.head.y, g.head.r + 4, ea - 0.8, ea + 0.8); c2.stroke();
    }
    // the first reel of a visit shows how to nudge, before any knock
    if (g.phase === 'reel' && hintT > 0 && !(nudgeVec.x || nudgeVec.y)) {
      const p = 0.6 + 0.4 * Math.sin(t * 6);
      c2.save(); c2.strokeStyle = `rgba(129,230,223,${0.8 * p})`; c2.fillStyle = `rgba(129,230,223,${0.8 * p})`; c2.lineWidth = 1.6; c2.lineCap = 'round';
      for (const sgn of [-1, 1]) { const x0 = g.head.x + sgn * 22; c2.beginPath(); c2.moveTo(x0, g.head.y); c2.lineTo(x0 + sgn * 12, g.head.y); c2.stroke(); c2.beginPath(); c2.moveTo(x0 + sgn * 17, g.head.y); c2.lineTo(x0 + sgn * 10, g.head.y - 4); c2.lineTo(x0 + sgn * 10, g.head.y + 4); c2.closePath(); c2.fill(); }
      c2.restore();
    }
    // a clean line winds the head up: faint streaks behind it
    if (g.phase === 'in' && g.cruise > 0.25 && !reduced) {
      c2.save(); c2.translate(g.head.x, g.head.y); c2.rotate(ang); c2.strokeStyle = `rgba(255,224,170,${0.35 * g.cruise})`; c2.lineWidth = 1.2;
      for (const yy of [-5, 0, 5]) { c2.beginPath(); c2.moveTo(-14, yy); c2.lineTo(-14 - 26 * g.cruise, yy); c2.stroke(); }
      c2.restore();
    }
    // the nudge: an arrow from the load toward where you are pushing it
    if (g.phase === 'reel' && (nudgeVec.x || nudgeVec.y)) {
      const l = Math.hypot(nudgeVec.x, nudgeVec.y), ux = nudgeVec.x / l, uy = nudgeVec.y / l, len = 14 + 16 * Math.min(1, l), a = Math.atan2(uy, ux);
      c2.save(); c2.translate(g.head.x, g.head.y); c2.rotate(a); c2.strokeStyle = 'rgba(129,230,223,.9)'; c2.fillStyle = 'rgba(129,230,223,.9)'; c2.lineWidth = 1.6; c2.lineCap = 'round';
      c2.beginPath(); c2.moveTo(10, 0); c2.lineTo(10 + len, 0); c2.stroke(); c2.beginPath(); c2.moveTo(12 + len, 0); c2.lineTo(5 + len, -4); c2.lineTo(5 + len, 4); c2.closePath(); c2.fill(); c2.restore();
    }
    // the lamp's own bloom, then the claw on top of it (never smaller than a thumbnail on a small screen)
    c2.save(); c2.globalCompositeOperation = 'lighter';
    const bl = c2.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 40); bl.addColorStop(0, 'rgba(255,214,150,.34)'); bl.addColorStop(1, 'rgba(255,190,120,0)');
    c2.fillStyle = bl; c2.beginPath(); c2.arc(lp.x, lp.y, 40, 0, 7); c2.fill(); c2.restore();
    if (g.phase !== 'land') drawClaw(c2, t, Math.max(1.12, 1.6 / cam.z));

    // screen space: vignette, the little map, the beacon, brackets
    c2.setTransform(1, 0, 0, 1, 0, 0);
    const vg = c2.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(2,4,7,0)'); vg.addColorStop(1, 'rgba(2,4,7,.66)'); c2.fillStyle = vg; c2.fillRect(0, 0, W, H);
    if (flash > 0.01) { c2.fillStyle = `rgba(255,236,200,${flash * 0.18})`; c2.fillRect(0, 0, W, H); }
    drawBeacon(c2, W, H, k, t);
    drawMini(c2, W, H, t);
    c2.strokeStyle = 'rgba(255,195,107,.32)'; c2.lineWidth = 2 * dpr; const bl2 = 18 * dpr, bo = 8 * dpr;
    for (const [x0, y0, dx, dy] of [[bo, bo, 1, 1], [W - bo, bo, -1, 1], [bo, H - bo, 1, -1], [W - bo, H - bo, -1, -1]]) { c2.beginPath(); c2.moveTo(x0 + dx * bl2, y0); c2.lineTo(x0, y0); c2.lineTo(x0, y0 + dy * bl2); c2.stroke(); }
  };

  /** An arrow at the edge of the screen when the find you are after is out of view. */
  const drawBeacon = (c, W, H, k, t) => {
    let tgt = null, bd = 1e9, col = null;
    if (g.phase === 'in') {
      g.finds.forEach((f) => { if ((f.state === 'rock' && f.canGrab) || f.state === 'lying') { const d = Math.hypot(f.x - g.head.x, f.y - g.head.y) - (f.main ? 200 : 0); if (d < bd) { bd = d; tgt = f; } } });
      if (tgt) col = hex(tgt.colour);
    } else if (g.phase === 'reel') { tgt = { x: B.start.x, y: B.start.y }; col = [255, 224, 170]; }
    if (!tgt) return;
    const px = (tgt.x - cam.x) * k + W / 2, py = (tgt.y - cam.y) * k + H / 2, m = 30 * dpr, mb = 92 * dpr, mt = 30 * dpr;
    if (px > m && px < W - m && py > mt && py < H - mb) return;
    const cx = W / 2, cy = (H - mb + mt) / 2, hh = (H - mb - mt) / 2, dx = px - cx, dy = py - cy, sc = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6)), ex = cx + dx * sc, ey = cy + dy * sc, a = Math.atan2(dy, dx);
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    c.save(); c.translate(ex, ey); c.rotate(a);
    c.fillStyle = rgba(col, 0.25 + 0.3 * pulse); c.beginPath(); c.arc(0, 0, 17 * dpr, 0, 7); c.fill();
    c.fillStyle = rgba(col, 0.95); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.5 * dpr; c.beginPath(); c.moveTo(11 * dpr, 0); c.lineTo(-7 * dpr, -9 * dpr); c.lineTo(-3 * dpr, 0); c.lineTo(-7 * dpr, 9 * dpr); c.closePath(); c.fill(); c.stroke();
    c.restore();
  };

  /** The little map: the whole tunnel, the cable, the finds and where you are. */
  const miniSize = () => { const mw = cssW > 700 ? 128 : 78; return { mw, mh: Math.round(mw * B.H / B.W) }; };
  const drawMini = (c, W, H, t) => {
    const { mw, mh } = miniSize(), pad = 10 * dpr, mx = W - mw * dpr - pad, my = pad + 0;
    if (miniDirty || !miniBase || miniBase.width !== Math.round(mw * dpr)) {
      miniBase = mkCanvas(mw * dpr, mh * dpr); const x = miniBase.getContext('2d'); const sc = mw * dpr / B.W;
      x.fillStyle = 'rgba(5,10,16,.78)'; x.fillRect(0, 0, miniBase.width, miniBase.height);
      x.strokeStyle = 'rgba(120,160,185,.5)'; x.lineWidth = 1 * dpr; x.beginPath(); x.ellipse(B.rock.cx * sc, B.rock.cy * sc, B.rock.rx * sc, B.rock.ry * sc, 0, 0, 7); x.stroke();
      x.imageSmoothingEnabled = true; x.globalAlpha = 0.95; x.drawImage(tunLit, 0, 0, miniBase.width, miniBase.height); x.globalAlpha = 1;
      x.strokeStyle = 'rgba(255,195,107,.5)'; x.lineWidth = 1 * dpr; x.strokeRect(0.5, 0.5, miniBase.width - 1, miniBase.height - 1);
      miniDirty = false; miniRev = B.rev ?? 0;
    }
    c.drawImage(miniBase, mx, my);
    const sc = mw * dpr / B.W;
    c.save(); c.translate(mx, my);
    // the cable: the way back
    if (g.path.length > 1) { c.strokeStyle = 'rgba(255,236,206,.85)'; c.lineWidth = 1.2 * dpr; c.beginPath(); let first = true; for (const p of g.path) { if (g.phase === 'reel' && p.s > g.s) break; first ? c.moveTo(p.x * sc, p.y * sc) : c.lineTo(p.x * sc, p.y * sc); first = false; } c.lineTo(g.head.x * sc, g.head.y * sc); c.stroke(); }
    g.finds.forEach((f, i) => {
      if (f.state === 'out' || f.state === 'carried') return;
      const col = hex(f.colour), pulse = 0.65 + 0.35 * Math.sin(t * 4 + i);
      c.fillStyle = f.state === 'shattered' ? 'rgba(120,120,120,.8)' : rgba(col, f.main ? 0.5 + 0.5 * pulse : 0.8); c.beginPath(); c.arc(f.x * sc, f.y * sc, (f.main ? 3.6 : 2.6) * dpr, 0, 7); c.fill();
      if (f.main && f.state !== 'shattered') { c.strokeStyle = rgba(col, 0.6 * pulse); c.lineWidth = 1 * dpr; c.beginPath(); c.arc(f.x * sc, f.y * sc, 6 * dpr, 0, 7); c.stroke(); }
    });
    c.fillStyle = '#ffd9a0'; c.beginPath(); c.arc(g.head.x * sc, g.head.y * sc, 2.6 * dpr, 0, 7); c.fill();
    // what the screen shows right now
    const vw = cssW / cam.z * sc, vh = cssH / cam.z * sc;
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1 * dpr; c.strokeRect((cam.x * sc - vw / 2), (cam.y * sc - vh / 2), vw, vh);
    c.restore();
  };
  let miniRev = 0;

  // --- HUD update --------------------------------------------------------------------------------------------------
  let lastWord = '', lastBtn = '';
  const setLamps = (ramp) => lamps.forEach((l, i) => l.classList.toggle('on', ramp > 0.12 + i * 0.3));
  const updateHud = () => {
    const w = words(g);
    if (w !== lastWord) { lastWord = w; status.textContent = w; status.dataset.tone = /knock|slip|going|buried|scrap|dropp|shatter|closer|nothing|let it/.test(w) ? 'warn' : /got it|out|light|reach/.test(w) ? 'good' : ''; }
    // the grip: a word and a dot on the claw's own chip
    const loaded = g.phase === 'reel';
    gripChip.hidden = !loaded;
    if (loaded) { const gw = gripWord(g); if (gripWordEl.textContent !== gw) gripWordEl.textContent = gw; gripChip.dataset.level = gripFrac(g) > 0.6 ? 'good' : gripFrac(g) > 0.3 ? 'mid' : 'low'; }
    // the find panel
    const main = g.finds[0];
    const stateWord = main.state === 'out' ? 'out in the bay' : main.state === 'carried' ? 'in the jaws' : main.state === 'lying' ? 'dropped: lying in the tunnel' : main.state === 'shattered' ? 'shattered' : (g.nearest && g.nearest.f === main && g.nearest.d < BASE.reach + 6 && g.phase === 'in') ? 'right here' : 'down in the rock';
    findWord.textContent = stateWord;
    const share = main.state === 'out' ? 1 : main.state === 'carried' ? 0.55 + 0.4 * (1 - g.s / Math.max(1, g.deepPath ? g.deepPath[g.deepPath.length - 1].s : 1)) : main.state === 'lying' ? 0.2 : main.state === 'shattered' ? 0 : 0.1;
    ringFg.setAttribute('stroke-dashoffset', String(207.3 * (1 - share)));
    glyph.style.setProperty('--find', main.colour);
    findName.textContent = main.name;
    findBox.classList.toggle('is-free', main.state === 'out');
    findBox.dataset.cracks = String(Math.min(3, main.cracks));
    if (g.finds.length > 1 && pips.childElementCount !== g.finds.length - 1) pips.replaceChildren(...g.finds.slice(1).map(() => el('i', 'cp-pip')));
    g.finds.slice(1).forEach((f, i) => { const p = pips.children[i]; if (p) { p.classList.toggle('is-ready', f.canGrab && f.state === 'rock'); p.classList.toggle('is-out', f.state === 'out'); p.classList.toggle('is-lost', f.state === 'shattered'); p.classList.toggle('is-lying', f.state === 'lying' || f.state === 'carried'); p.style.setProperty('--c', f.colour); } });
    // the pads
    let mode;
    if (g.phase === 'bay') mode = 'bay'; else if (g.phase === 'reel') mode = 'reel'; else mode = 'in';
    const inReach = !!(g.nearest && g.phase === 'in' && g.nearest.d < BASE.reach + 6);
    if (mode + inReach !== lastBtn) {
      lastBtn = mode + inReach;
      btnA.dataset.mode = mode === 'bay' ? 'back' : 'grab'; btnB.dataset.mode = mode === 'bay' ? 'done' : 'reel';
      btnA.textContent = mode === 'bay' ? 'Go back in' : mode === 'reel' ? 'Jaws closed' : 'Close the jaws';
      reelLabel.textContent = mode === 'bay' ? 'That is enough' : 'Reel';
      btnB.classList.toggle('is-bay', mode === 'bay'); btnA.disabled = mode === 'reel'; btnB.disabled = false;
      btnB.classList.toggle('is-off', mode === 'in');
    }
    btnA.classList.toggle('is-ready', inReach);
    btnB.classList.toggle('is-ready', mode === 'reel' && !reelPad);
    btnB.classList.toggle('is-warn', mode === 'reel' && g.warn.level > 0.35);
    root.dataset.phase = g.phase === 'over' ? (cardT > 1.1 ? 'card' : 'over') : g.phase;
    setLamps(mode === 'reel' ? g.ramp : 0);
    for (const l of lamps) l.style.setProperty('--w', String(mode === 'reel' ? g.warn.level : 0));
    drum.style.setProperty('--spin', `${drumA}rad`);
    drumG.setAttribute('transform', `translate(24 24) rotate(${(drumA * 57.3).toFixed(1)})`);
    btnB.style.setProperty('--glow', String(clamp(g.v / BASE.full, 0, 1)));
  };

  // --- the loop ----------------------------------------------------------------------------------------------------
  let acc = 0;
  const loop = (ts) => {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, lastDraw ? (ts - lastDraw) / 1000 : 0.016); lastDraw = ts; frame++;
    phaseT += dt;
    if (g.over) cardT += dt;
    if (!g.over) {
      acc += dt;
      while (acc >= 1 / 60 && !g.over) {
        acc -= 1 / 60;
        let inp;
        if (g.phase === 'reel') {
          let nx = 0, ny = 0;
          if (ptr.down) { nx = clamp((ptr.x - g.head.x) / 34, -1, 1); ny = clamp((ptr.y - g.head.y) / 34, -1, 1); }
          else if (kb.dx || kb.dy) { const l = Math.hypot(kb.dx, kb.dy) || 1; nx = kb.dx / l; ny = kb.dy / l; }
          inp = { reel: reelPad, nx, ny }; nudgeVec = { x: nx, y: ny };
        } else if (ptr.down) inp = { x: ptr.x, y: ptr.y, down: true };
        else if (kb.dx || kb.dy) { const l = Math.hypot(kb.dx, kb.dy) || 1; inp = { x: g.head.x + kb.dx / l * 90, y: g.head.y + kb.dy / l * 90, down: true }; }
        else inp = { down: false };
        step(g, 1 / 60, inp);
      }
    }
    for (const ev of drain(g)) onEvent(ev);
    if (g.phase !== 'reel' && reelPad) holdReel(false);
    // rebuild the rock if a find was lifted out of its seat
    if ((B.rev ?? 0) !== builtRev) { buildTunnel(); miniDirty = true; }
    // facing: the way the claw points. Going in it points where it goes; reeling, away from the mouth along the cable.
    {
      let want = facing;
      if (g.phase === 'reel') { const q = pathAt(g.path, Math.min(g.s + 14, g.path[g.path.length - 1].s)); const q0 = pathAt(g.path, g.s); want = Math.atan2(q.y - q0.y, q.x - q0.x); if (Math.hypot(q.x - q0.x, q.y - q0.y) < 0.5) want = facing; }
      else if (g.phase === 'in') { const sp = Math.hypot(g.anchor.vx, g.anchor.vy); if (sp > 12) want = Math.atan2(g.anchor.vy, g.anchor.vx); else if (ptr.down) want = Math.atan2(ptr.y - g.head.y, ptr.x - g.head.x); }
      else if (g.phase === 'land' || g.phase === 'bay') want = Math.atan2(-B.out.y, -B.out.x);
      facing += wrapA(want - facing) * Math.min(1, dt * 8);
      ang += wrapA(facing + (g.phase === 'reel' ? 0.05 * Math.sin(frame * 0.2) * clamp(g.v / 200, 0, 1) : 0) - ang) * Math.min(1, dt * 12);
    }
    // is the head near a find (the jaws open)?
    jaw.near = !!(g.nearest && g.phase === 'in' && g.nearest.d < 70);
    drumA += (g.v * 0.05 + (g.phase === 'land' ? 2.2 : 0)) * dt * (g.phase === 'reel' || g.phase === 'land' ? 1 : 0);
    tension = clamp(g.v / 140, 0, 1);
    // winch sound follows the reel
    audio.winch(g.phase === 'reel' ? clamp(g.v / BASE.full, 0, 1) : g.phase === 'land' ? 0.35 : 0, g.phase === 'reel' ? tension : 0);
    grabAnim = Math.min(1, grabAnim + dt / 0.35);
    for (const [kk, v] of crackAnim) crackAnim.set(kk, v + dt);
    if (g.phase === 'reel' && lastPhaseSeen !== 'reel') hintT = 7;
    lastPhaseSeen = g.phase;
    if (nudgeVec.x || nudgeVec.y) hintT = Math.min(hintT, 0.2);
    hintT = Math.max(0, hintT - dt);
    if (buriedHint) buriedHint.t -= dt;
    hint.hidden = !(g.phase === 'reel' && hintT > 0);
    for (let i = parts.length - 1; i >= 0; i--) { const d = parts[i]; d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += (d.kind === 'glint' ? -10 : 90) * dt; d.vx *= 1 - dt * 1.5; if (d.age > d.life) parts.splice(i, 1); }
    shake = Math.max(0, shake - dt * 2.4); flash = Math.max(0, flash - dt * 4); landFlare = Math.max(0, landFlare - dt * 1.2);
    if (g.over && cardT > 1.2 && card.hidden && !finished) showCard();
    setCam(dt);
    drawScene(g.t + phaseT * 0.3, dt);
    updateHud();
  };

  const startUp = () => {
    ro?.observe(scope); resize();
    cam.x = B.start.x; cam.y = B.start.y;
    cam.z = clamp(Math.min(cssW / 300, cssH / 330), 0.9, 2.1) * 1.4; // start a little close, then ease out to the working view
    raf = requestAnimationFrame(loop);
  };
  startUp();

  return {
    root, g, view,
    destroy() { destroyed = true; cancelAnimationFrame(raf); ro?.disconnect(); audio.destroy(); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); },
    leave() { destroyed = true; cancelAnimationFrame(raf); audio.destroy(); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); finish({ done: true, success: false, grade: 0, left: true, effects: {} }); },
    giveUp() { giveUp(g); },
    muteSound: (v) => audio.mute(v),
  };
}
