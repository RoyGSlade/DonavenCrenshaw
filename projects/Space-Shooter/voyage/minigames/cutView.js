// Cut on screen: a brushed steel sheet with the part scribed on it, a cutting wheel under your finger or mouse that throws
// sparks and leaves a kerf, a feed gauge that goes red when you tear the cut, and the line's width drawn as a lane round the
// scribe so the skill points are things you can see. Press on START and drag round; lift and press near where you stopped to
// carry on. Draws on a canvas (1000 x 680 board units) and resolves with the pure result when the cut is over.
import { cutDown, cutMove, cutUp, cutFinish, gradeOf, pointAt, BOARD, START_R, SAMPLE } from './cut.js';
import { h, ensureStyle, meter, loop, lcg } from './craftChainView.js';

const K = 1.5; // canvas pixels per board unit

function makeSheet(seed) {
  const c = document.createElement('canvas'); c.width = BOARD.w * K; c.height = BOARD.h * K;
  const g = c.getContext('2d'); g.scale(K, K);
  const r = lcg(seed * 31 + 7);
  const grad = g.createLinearGradient(0, 0, BOARD.w, BOARD.h);
  grad.addColorStop(0, '#7e8a95'); grad.addColorStop(0.45, '#b9c4cd'); grad.addColorStop(1, '#6f7b86');
  g.fillStyle = grad; g.fillRect(0, 0, BOARD.w, BOARD.h);
  for (let i = 0; i < 520; i++) { // brushed grain
    const y = r() * BOARD.h, x = r() * BOARD.w, len = 60 + r() * 380;
    g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(20,30,40,.06)'; g.lineWidth = 0.6 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 2); g.stroke();
  }
  const vg = g.createRadialGradient(BOARD.w / 2, BOARD.h / 2, 260, BOARD.w / 2, BOARD.h / 2, 640);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,14,22,.5)'); g.fillStyle = vg; g.fillRect(0, 0, BOARD.w, BOARD.h);
  for (const [x, y] of [[26, 26], [BOARD.w - 26, 26], [26, BOARD.h - 26], [BOARD.w - 26, BOARD.h - 26]]) { // rivets
    g.fillStyle = '#4c5864'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.fillStyle = '#c9d3db'; g.beginPath(); g.arc(x - 1.5, y - 1.5, 5, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(10,18,26,.55)'; g.lineWidth = 6; g.strokeRect(3, 3, BOARD.w - 6, BOARD.h - 6);
  return c;
}

export function playCut(root, { state, what = 'plate', reducedMotion = () => false, zoom = null } = {}) {
  ensureStyle();
  const s = state;
  const sheet = makeSheet(s.seed || 1);
  const canvas = h('canvas', { class: 'cc-canvas', width: String(BOARD.w * K), height: String(BOARD.h * K), 'aria-label': 'Sheet of metal with the part scribed on it. Press on START and drag round the outline.' });
  const ctx = canvas.getContext('2d');
  const feed = meter({ label: 'Feed speed', limit: s.feed, max: s.feed * 1.6 });
  const live = h('em', { class: 'cc-live', text: '0' });
  const hud = h('div', { class: 'cc-hud' }, feed.root, h('div', { class: 'cc-stat' }, h('span', { text: `${s.tool} cutter` }), h('em', { text: ({ worn: 'thin line', shop: 'normal line', good: 'wide line' })[s.tool] || 'normal line' })), h('div', { class: 'cc-stat' }, h('span', { text: 'Grade so far' }), live));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: `Press on START and drag round the ${what}. Stay on the line, and not too fast.` });
  const done = h('button', { type: 'button', class: 'ui-btn cc-done', text: 'Done cutting' });
  const panel = h('section', { class: 'rp-panel cc-panel mg-skin ui-panel', role: 'group', 'aria-label': `Cut the ${what}`, 'data-game': 'cut' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `CUT · ${what.toUpperCase()}` }), hud, h('div', { class: 'cc-boardwrap' }, canvas), status,
    h('div', { class: 'cc-row' }, done), h('p', { class: 'rp-help', text: 'Hold and drag along the scribed line. Too fast tears the cut, straying gouges the sheet. Lift and press near where you stopped to carry on.' }));
  panel.__state = s;
  root.append(panel);

  // On a touch screen the sheet is zoomed so the line is a finger's width; the view pans when the blade nears its edge.
  let Z = zoom ?? (matchMedia('(pointer: coarse)').matches ? 1.6 : 1);
  const camera = { x: 0, y: 0 };
  const visW = () => BOARD.w / Z, visH = () => (BOARD.w / Z) * (canvas.height / canvas.width);
  const clampCam = () => { camera.x = BOARD.w <= visW() ? (BOARD.w - visW()) / 2 : Math.max(0, Math.min(BOARD.w - visW(), camera.x)); camera.y = BOARD.h <= visH() ? (BOARD.h - visH()) / 2 : Math.max(0, Math.min(BOARD.h - visH(), camera.y)); };
  camera.x = s.start.x - visW() / 2; camera.y = s.start.y - visH() / 2; clampCam();
  const follow = () => { if (!s.last || Z <= 1) return; const mx = visW() * 0.22, my = visH() * 0.22; const { x, y } = s.last; if (x < camera.x + mx) camera.x = x - mx; else if (x > camera.x + visW() - mx) camera.x = x - visW() + mx; if (y < camera.y + my) camera.y = y - my; else if (y > camera.y + visH() - my) camera.y = y - visH() + my; clampCam(); };
  // Full screen: the canvas fills its space. Zoomed (touch) it takes the whole box so the window shows as much sheet as the screen allows;
  // otherwise it keeps the sheet's own shape.
  const wrapEl = panel.querySelector('.cc-boardwrap'), dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const refit = () => {
    if (!wrapEl.closest('.wb-full')) return;
    const aw = wrapEl.clientWidth, ah = wrapEl.clientHeight; if (!aw || !ah) return;
    let w = aw, hh = ah;
    if (Z <= 1) { w = Math.floor(Math.min(aw, ah * (BOARD.w / BOARD.h))); hh = Math.floor(w / (BOARD.w / BOARD.h)); }
    canvas.style.width = `${w}px`; canvas.style.height = `${hh}px`;
    const cw = Z > 1 ? Math.round(w * dpr) : BOARD.w * K, ch = Z > 1 ? Math.round(hh * dpr) : BOARD.h * K;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; clampCam(); }
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refit).observe(wrapEl);
  requestAnimationFrame(refit);
  panel.__view = () => ({ zoom: Z, pxPerUnit: canvas.getBoundingClientRect().width / visW(), cx: camera.x, cy: camera.y });
  const sparks = [];
  let shake = 0, tornFlash = 0, endAt = 0, smooth = 0, heads = false;
  // On touch the blade rides 48 px above the fingertip (so the finger does not cover the line) and the cut is sampled from the blade.
  const LIFT_PX = 48;
  let touchMode = false, finger = null;
  const toBoard = (e, lift = 0) => { const r = canvas.getBoundingClientRect(); return { x: camera.x + ((e.clientX - r.left) * visW()) / r.width, y: camera.y + ((e.clientY - lift - r.top) * visH()) / r.height }; };
  const fingerBoard = () => { if (!finger) return null; const r = canvas.getBoundingClientRect(); return { x: camera.x + ((finger.x - r.left) * visW()) / r.width, y: camera.y + ((finger.y - r.top) * visH()) / r.height }; };
  const tOf = (e) => e.timeStamp / 1000;
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;

  canvas.addEventListener('pointerdown', (e) => {
    if (s.done) return; e.preventDefault();
    const touch = e.pointerType === 'touch'; touchMode = touch; finger = touch ? { x: e.clientX, y: e.clientY } : null;
    const p = toBoard(e, touch ? LIFT_PX : 0);
    if (cutDown(s, p.x, p.y, tOf(e), { radius: touch ? START_R * 3 : START_R })) { canvas.setPointerCapture?.(e.pointerId); status.textContent = s.strokes.length > 1 ? 'Carrying on.' : 'Drag round the outline.'; }
    else { status.textContent = touch ? 'Touch just below the START mark: the blade rides above your finger.' : s.started ? 'Press close to where you stopped to carry on.' : 'Press on the START mark.'; tornFlash = 0.3; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (s.done || !s.down) return; e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) { if (touchMode) finger = { x: ev.clientX, y: ev.clientY }; const p = toBoard(ev, touchMode ? LIFT_PX : 0); cutMove(s, p.x, p.y, tOf(ev)); follow(); if (s.done) break; }
    heads = true;
  });
  const up = (e) => { finger = null; if (s.down) { cutUp(s); canvas.releasePointerCapture?.(e.pointerId); } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  done.addEventListener('click', () => { if (!s.done) cutFinish(s, 'done'); });

  // ---- drawing ----------------------------------------------------------------------------------------------------
  const path = (g) => { g.beginPath(); s.poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  function draw(dt) {
    const g = ctx, sc = canvas.width / visW(); g.setTransform(sc, 0, 0, sc, -camera.x * sc, -camera.y * sc);
    g.fillStyle = '#07101a'; g.fillRect(camera.x, camera.y, visW(), visH());
    const sh = shake > 0 && !reducedMotion() ? (Math.random() - 0.5) * 6 * shake / 0.3 : 0;
    g.save(); g.translate(sh, sh * 0.6);
    g.drawImage(sheet, 0, 0, BOARD.w, BOARD.h);
    // the lane: the line's width, so the cutter and the roll are visible
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(g); g.strokeStyle = 'rgba(40,210,195,.20)'; g.lineWidth = s.width; g.stroke();
    path(g); g.strokeStyle = 'rgba(15,24,34,.8)'; g.lineWidth = 1.6; g.stroke();            // the scribe
    path(g); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.8; g.translate(0.8, 0.8); g.stroke(); g.translate(-0.8, -0.8);
    if (s.guide) { g.fillStyle = 'rgba(255,255,255,.95)'; for (let a = 0; a < s.perimeter; a += 22) { const p = pointAt(s, a); g.beginPath(); g.arc(p.x, p.y, 2.2, 0, 7); g.fill(); } }
    // cut so far on the line
    g.fillStyle = 'rgba(120,255,225,.9)';
    for (let i = 0; i < s.N; i++) if (s.covered[i]) { const p = s.targets[i]; g.beginPath(); g.arc(p.x, p.y, 2.4, 0, 7); g.fill(); }
    // the kerf: a bright lip under a dark groove
    for (const stroke of s.strokes) {
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1], b = stroke[i];
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        if (b.k === 'good') { g.strokeStyle = 'rgba(235,243,248,.85)'; g.lineWidth = 5.2; g.stroke(); g.strokeStyle = '#0c1219'; g.lineWidth = 3.2; g.stroke(); }
        else if (b.k === 'torn') { g.strokeStyle = '#ff7a2f'; g.lineWidth = 4.4; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); g.strokeStyle = '#2a0f08'; g.lineWidth = 1.6; g.stroke(); }
        else if (b.k === 'gouge') { g.strokeStyle = '#7a1b14'; g.lineWidth = 6; g.stroke(); g.strokeStyle = '#ff5a45'; g.lineWidth = 1.5; g.stroke(); }
        else { g.strokeStyle = 'rgba(40,50,60,.7)'; g.lineWidth = 1.8; g.stroke(); }
      }
    }
    // start mark
    const st = s.start;
    g.setLineDash([5, 4]); g.strokeStyle = s.started ? 'rgba(255,200,90,.55)' : '#ffc857'; g.lineWidth = 2.2;
    g.beginPath(); g.arc(st.x, st.y, START_R, 0, 7); g.stroke(); g.setLineDash([]);
    if (!s.started) { g.fillStyle = '#3a2a05'; g.font = '700 15px Consolas, monospace'; g.textAlign = 'center'; g.fillText('START', st.x, st.y - START_R - 8); }
    // the part comes free (or is marked rough)
    if (s.done) {
      const k = Math.min(1, (performance.now() - endAt) / 520), ok = s.result.success;
      g.save(); path(g);
      if (ok) { g.translate(0, -5 * k); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 24 * k; g.shadowOffsetY = 10 * k; path(g); g.fillStyle = `rgba(205,218,228,${0.35 + 0.35 * k})`; g.fill(); }
      else { g.fillStyle = 'rgba(190,40,30,.16)'; g.fill(); g.clip(); g.strokeStyle = 'rgba(190,40,30,.5)'; g.lineWidth = 3; for (let x = -BOARD.h; x < BOARD.w; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + BOARD.h, BOARD.h); g.stroke(); } }
      g.restore();
    }
    // touch: the fingertip and a guide up to the blade
    const fb = touchMode && s.down ? fingerBoard() : null;
    if (fb && s.last) {
      g.save(); g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(fb.x, fb.y); g.lineTo(s.last.x, s.last.y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(fb.x, fb.y, 13, 0, 7); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.stroke(); g.restore();
    }
    // the cutting wheel and its sparks
    if (s.down && s.last) {
      const { x, y } = s.last, torn = s.speed > s.feed;
      g.beginPath(); g.arc(x, y, Math.max(6, s.half), 0, 7); g.strokeStyle = torn ? 'rgba(255,90,60,.9)' : 'rgba(255,255,255,.7)'; g.lineWidth = 1.4; g.stroke();
      g.save(); g.translate(x, y); g.rotate((s.travel / 9) % 6.283);
      g.fillStyle = '#20303c'; g.beginPath(); g.arc(0, 0, 8.5, 0, 7); g.fill(); g.strokeStyle = torn ? '#ff7a2f' : '#e5eef4'; g.lineWidth = 2; g.setLineDash([3.2, 2.6]); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#d9e6ee'; g.beginPath(); g.arc(0, 0, 2.6, 0, 7); g.fill(); g.restore();
    }
    for (const p of sparks) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    if (tornFlash > 0 && s.last) { g.globalAlpha = Math.min(1, tornFlash / 0.3); g.fillStyle = '#ff5a45'; g.font = '700 22px Consolas, monospace'; g.textAlign = 'center'; g.fillText(s.down ? 'TEARING' : 'START HERE', s.last.x, s.last.y - 22); g.globalAlpha = 1; }
    g.restore();
    void dt;
  }
  function step(dt) {
    for (const ev of s.events.splice(0)) {
      if (ev.type === 'gouge') { shake = 0.3; status.textContent = 'Gouged the sheet: -5.'; }
      else if (ev.type === 'torn') { tornFlash = 0.3; }
      else if (ev.type === 'up') status.textContent = 'Lifted. Press near where you stopped to carry on.';
    }
    if (s.down && !reducedMotion()) {
      const n = Math.min(9, Math.floor(s.speed / 45)), torn = s.speed > s.feed;
      for (let i = 0; i < n && sparks.length < 160; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 120; sparks.push({ x: s.last.x, y: s.last.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.35 + Math.random() * 0.3, max: 0.65, r: torn ? 2.6 : 1.6, c: torn ? '#ff5a3a' : Math.random() > 0.4 ? '#ffd166' : '#fff4d6' }); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; if (p.life <= 0) sparks.splice(i, 1); }
    shake = Math.max(0, shake - dt); tornFlash = Math.max(0, tornFlash - dt);
    if (s.done) { Z += (1 - Z) * Math.min(1, dt * 7); camera.x += (0 - camera.x) * Math.min(1, dt * 7); camera.y += (0 - camera.y) * Math.min(1, dt * 7); if (Z < 1.005) { Z = 1; camera.x = camera.y = 0; } else clampCam(); }
    smooth += ((s.down ? s.speed : 0) - smooth) * Math.min(1, dt * 14);
    feed.update(smooth);
    live.textContent = String(Math.round(gradeOf(s)));
    done.disabled = s.done || !s.started;
    if (s.done && !endAt) {
      endAt = performance.now();
      status.textContent = s.result.success ? `Cut free: ${s.result.word}.` : 'Too rough.';
      canvas.style.touchAction = 'auto';
    }
  }
  let ended = false;
  const stop = loop((dt) => {
    step(dt); draw(dt);
    if (s.done && !ended && performance.now() - endAt > 650) { ended = true; stop(); finish(s.result); }
  });
  void heads;
  return promise;
}
