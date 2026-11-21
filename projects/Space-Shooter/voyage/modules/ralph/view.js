// Ralph's view: one canvas for the hangar corner seen from above, DOM for the words, the face and the tray.
// Ralph is the game's own top-down picture, bent like a bar in slices (head follows your finger, rear lags a turn),
// with a tail drawn in code. No raw numbers on screen: mood is a face and a tail, bond is how he greets you.
import { tick, press, move, release, dropItem, dragTo, dragEnd, sayKey, previewThrow, nudge, pocket } from './model.js';
import { WORDS, FOUND } from './words.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TOP = 84, BOT = 100;

// How big the yard is for a screen: fixed shorter side, as much of the other as fits. Pure, so index.js and tests share it.
export function fitYard(W, H) {
  const hav = Math.max(200, H - TOP - BOT);
  if (W >= hav * 1.05) { const ppu = hav / 10; return { w: clamp(Math.floor((W - 24) / ppu * 2) / 2, 12, 20), h: 10 }; }
  const ppu = (W - 16) / 9; return { w: 9, h: clamp(Math.floor(hav / ppu * 2) / 2, 10, 17) };
}

function loadImg(src) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }

export async function mount(stage, state, o) {
  const { ctx: host = {}, base, onLeave } = o;
  const lines = { ...WORDS, ...(host.context?.lines || {}) };
  const names = state.rec.names;
  const reduced = !!host.reducedMotion?.();
  const snd = (id) => { try { host.sound?.(id); } catch { /* never worth a crash */ } };

  stage.innerHTML = '';
  const root = document.createElement('div'); root.className = 'm-ralph';
  root.innerHTML = `
    <canvas class="rl-canvas" aria-label="Ralph's corner of the hangar"></canvas>
    <header class="rl-head">
      <div class="rl-face" data-mood="mid"><img alt="" draggable="false"></div>
      <div class="rl-title"><h1 class="rl-sign">Ralph</h1><p class="rl-say" aria-live="polite"></p></div>
    </header>
    <div class="rl-tray">
      <button class="rl-pad" type="button" data-item="bone" aria-label="Bone: drag it to Ralph"><span class="rl-icon rl-bone"></span><span class="rl-label">Bone</span></button>
      <p class="rl-hand" aria-hidden="true"></p>
      <button class="rl-pad" type="button" data-item="kibble" aria-label="Kibble: drag it to his bowl"><span class="rl-icon rl-kibble"></span><span class="rl-label">Kibble</span><span class="rl-pips"></span></button>
    </div>`;
  stage.append(root);
  const cv = root.querySelector('canvas'), cx = cv.getContext('2d');
  const sayEl = root.querySelector('.rl-say'), faceEl = root.querySelector('.rl-face'), faceImg = faceEl.querySelector('img');
  const pads = { bone: root.querySelector('[data-item=bone]'), kibble: root.querySelector('[data-item=kibble]') };
  const pipsEl = pads.kibble.querySelector('.rl-pips');

  // ----- pictures -----
  const A = (n) => new URL(`art/${n}`, base).href;
  const [imgDog, imgBall, imgBed, imgKennel] = await Promise.all([loadImg(A('ralph-top.webp')), loadImg(A('prop-ralph-ball.webp')), loadImg(A('dog-bed.png')), loadImg(A('prop-kennel.webp'))]);
  const faces = { happy: A('ralph-happy.webp'), mid: A('ralph-neutral.webp'), low: A('ralph-annoyed.webp') };

  // ----- geometry -----
  let W = 0, H = 0, dpr = 1, ppu = 40, offX = 0, offY = 0, deck = null;
  const L = state.L;
  const sx = (x) => offX + x * ppu, sy = (y) => offY + y * ppu;
  const wx = (px) => (px - offX) / ppu, wy = (py) => (py - offY) / ppu;
  function layoutSize() {
    const r = stage.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(300, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const hav = H - TOP - BOT; ppu = Math.max(14, Math.min((W - 12) / L.w, hav / L.h));
    offX = (W - L.w * ppu) / 2; offY = TOP + (hav - L.h * ppu) / 2;
    deck = buildDeck();
  }

  // ----- the deck (drawn once per size) -----
  function buildDeck() {
    const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = '#070c12'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(129,230,223,${0.03 + hash(i) * 0.05})`; g.fillRect(hash(i + 9) * W, hash(i + 31) * H, 1.5, 1.5); }
    const x0 = sx(0), y0 = sy(0), w = L.w * ppu, h = L.h * ppu;
    const fl = g.createLinearGradient(0, y0, 0, y0 + h); fl.addColorStop(0, '#1f2d3a'); fl.addColorStop(1, '#17232e'); g.fillStyle = fl; g.fillRect(x0, y0, w, h);
    // plates
    const pl = 1.6 * ppu; g.lineWidth = 1;
    for (let i = 0; i * pl < w + pl; i++) for (let j = 0; j * pl < h + pl; j++) {
      const px = x0 + i * pl, py = y0 + j * pl, tone = (hash(i * 13 + j * 7) - 0.5) * 0.05;
      g.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(0,0,0,${-tone * 2})`; g.fillRect(px, py, Math.min(pl, x0 + w - px), Math.min(pl, y0 + h - py));
      g.strokeStyle = '#0d151c'; g.strokeRect(px + 0.5, py + 0.5, pl, pl);
      g.strokeStyle = 'rgba(160,190,210,.07)'; g.beginPath(); g.moveTo(px + 1.5, py + pl); g.lineTo(px + 1.5, py + 1.5); g.lineTo(px + pl, py + 1.5); g.stroke();
      g.fillStyle = 'rgba(170,190,205,.16)'; for (const [ax, ay] of [[4, 4], [pl - 4, 4], [4, pl - 4], [pl - 4, pl - 4]]) { g.beginPath(); g.arc(px + ax, py + ay, 1.2, 0, TAU); g.fill(); }
    }
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    // stains and the lamp over the kennel
    for (let i = 0; i < 9; i++) { const r = ppu * (0.3 + hash(i + 70) * 0.7); g.fillStyle = `rgba(5,8,10,${0.12 + hash(i + 5) * 0.12})`; g.beginPath(); g.ellipse(x0 + hash(i + 40) * w, y0 + hash(i + 50) * h, r, r * 0.7, hash(i) * 3, 0, TAU); g.fill(); }
    let rg = g.createRadialGradient(sx(L.bed.x), sy(L.bed.y), 0, sx(L.bed.x), sy(L.bed.y), ppu * 7); rg.addColorStop(0, 'rgba(255,190,120,.20)'); rg.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = rg; g.fillRect(x0, y0, w, h);
    rg = g.createRadialGradient(sx(L.hand.x), sy(L.hand.y), 0, sx(L.hand.x), sy(L.hand.y), ppu * 6); rg.addColorStop(0, 'rgba(129,230,223,.13)'); rg.addColorStop(1, 'rgba(129,230,223,0)'); g.fillStyle = rg; g.fillRect(x0, y0, w, h);
    // painted marks: his bed square, the line you stand behind
    g.strokeStyle = 'rgba(255,200,110,.35)'; g.setLineDash([ppu * 0.35, ppu * 0.22]); g.lineWidth = 2; g.strokeRect(sx(L.bed.x - 1.35), sy(L.bed.y - 1.3), ppu * 2.7, ppu * 2.6); g.setLineDash([]);
    g.strokeStyle = 'rgba(129,230,223,.28)'; g.lineWidth = 2; g.beginPath(); g.arc(sx(L.hand.x), sy(L.hand.y + 0.1), ppu * 0.9, 0, TAU); g.stroke();
    g.restore();
    // the rail round the yard: steel with a cyan inlay, and a hazard lip on the side nearest you
    const rail = Math.max(8, ppu * 0.3);
    const rl = g.createLinearGradient(0, y0 - rail, 0, y0); rl.addColorStop(0, '#4a5d6c'); rl.addColorStop(1, '#25333f'); g.fillStyle = rl; g.fillRect(x0 - rail, y0 - rail, w + rail * 2, rail);
    g.fillStyle = '#2a3945'; g.fillRect(x0 - rail, y0, rail, h); g.fillRect(x0 + w, y0, rail, h);
    g.fillStyle = '#2f3f4c'; g.fillRect(x0 - rail, y0 + h, w + rail * 2, rail);
    g.save(); g.beginPath(); g.rect(x0 - rail, y0 + h, w + rail * 2, rail); g.clip();
    for (let i = -2; i < (w + rail * 2) / rail + 2; i++) { g.fillStyle = i % 2 ? '#e8b24a' : '#1b242c'; g.beginPath(); const px = x0 - rail + i * rail; g.moveTo(px, y0 + h + rail); g.lineTo(px + rail, y0 + h); g.lineTo(px + rail * 2, y0 + h); g.lineTo(px + rail, y0 + h + rail); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(129,230,223,.5)'; g.fillRect(x0, y0 - rail * 0.45, w, 2); g.fillRect(x0 - rail * 0.45, y0, 2, h); g.fillRect(x0 + w + rail * 0.45 - 2, y0, 2, h);
    return c;
  }

  // ----- Ralph's body: a bar of slices, so the head can turn and the rear can lag -----
  const SH = 4, PIV = 60, NUP = Math.floor(PIV / SH), NDOWN = Math.floor((102 - PIV) / SH);
  const V = { sy: 1, sx: 1, hb: 0, rb: 0, lean: 0, tailAmp: 0.2, tailF: 3, tailLen: 1, front: 1, rear: 1, curl: 0, tilt: 0, shake: 0, prevHeading: 0, angVel: 0, skid: 0, phase: 0, rollA: 0, breathe: 0, lastPant: -9, lastChew: -9, lastClaw: 0, faceKey: '', say: '', sayAt: 0, tailPhase: 0 };
  const FUR = '#55616f', FURHI = '#aaa597', CREAM = '#ddd4bd';

  function drawTail(g, amp, ph, len, curl) {
    // origin: the rump, pointing down the screen of the body frame
    const segs = 6, step = 5.2 * len; let x = 0, y = -1, a = 0; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < segs; i++) {
      a = Math.sin(ph - i * 0.55) * amp * (0.3 + i / segs) + curl * (i / segs);
      const nx = x + Math.sin(a) * step, ny = y + Math.cos(a) * step;
      g.strokeStyle = i > segs - 3 ? CREAM : (i > segs - 4 ? '#8d8b82' : FUR); g.lineWidth = 8.5 - i * 0.95;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); x = nx; y = ny;
    }
  }
  function drawBone(g, size = 1) {
    g.fillStyle = '#efe6cc'; g.strokeStyle = '#a99a78'; g.lineWidth = 0.8; g.beginPath(); g.roundRect(-15 * size, -2.2 * size, 30 * size, 4.4 * size, 2); g.fill(); g.stroke();
    for (const sgn of [-1, 1]) for (const dy of [-3.2, 3.2]) { g.beginPath(); g.arc(sgn * 15 * size, dy * size, 3.2 * size, 0, TAU); g.fill(); g.stroke(); }
  }
  function drawNut(g, r = 9) {
    g.fillStyle = '#9fb0bd'; g.strokeStyle = '#3d4a55'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#26323c'; g.beginPath(); g.arc(0, 0, r * 0.38, 0, TAU); g.fill();
  }

  function drawDog(g, r, dt) {
    const t = state.t, sp = Math.hypot(r.vx, r.vy);
    // heading rate, for the rear that lags a turn
    const av = angDiff(V.prevHeading, r.heading) / Math.max(dt, 0.001); V.prevHeading = r.heading; V.angVel = lerp(V.angVel, clamp(av, -9, 9), 1 - Math.exp(-14 * dt));
    V.phase = r.stride * TAU * 0.5;
    const k = (rate) => 1 - Math.exp(-rate * dt);
    const pose = r.pose, mode = r.mode;
    let tsy = 1, tsx = 1, thb = 0, trb = 0, tlean = 0, tfront = 1, trear = 1, tcurl = 0, ttilt = 0, tAmp = 0.15 + r.tail * 0.7, tF = 2 + r.tail * 9, tLen = 1;
    const gait = sp > 5.3 ? 3 : sp > 2.6 ? 2 : sp > 0.4 ? 1 : 0;
    if (gait === 3) { tsy = 1.09; tsx = 0.95; } else if (gait === 2) { tsy = 1.04; tsx = 0.98; }
    if (pose === 'sit') { tsy = 0.82; tsx = 1.04; tcurl = 0.9; tLen = 0.7; trear = 0.9; }
    if (pose === 'lie') { tsy = 0.74; tsx = 1.07; tcurl = 1.2; tLen = 0.65; trear = 0.92; }
    if (mode === 'sleep') { tsy = 0.7; tsx = 1.08; thb = -0.55; trb = 0.45; tAmp = 0; tcurl = 1.5; tLen = 0.6; }
    if (pose === 'bow') { tsy = 0.9; tfront = 0.84; trear = 1.1; tF = 11; tAmp = 0.8; }
    if (r.panting) { tsy *= 1 + Math.sin(t * 11) * 0.012; }
    const heading = r.heading;
    // head: follows what he is looking at; otherwise looks where he is going, with small fidgets
    let look = r.rubbing && r.rubLook ? r.rubLook : r.lookAt;
    if (mode === 'sleep') look = null;
    if (look && gait < 3) { const rel = angDiff(heading, Math.atan2(look.y - r.y, look.x - r.x)); thb += clamp(rel, -1.0, 1.0) * 0.95; }
    else if (gait === 0 && mode !== 'sleep') thb += Math.sin(t * 0.8 + 1) * 0.12 + Math.sin(t * 2.3) * 0.05;
    if (state.flash?.key === 'nowhere' || state.flash?.key === 'notnow') ttilt = Math.sin(t * 3) * 0.18 + 0.28;
    if (r.pose === 'kick') { trb = Math.sin(t * 34) * 0.06; tAmp = 1; tF = 14; }
    if (r.pose === 'shake') { V.shake = 1; }
    if (mode === 'lean') tlean = 1;
    if (mode === 'frenzy') { tAmp = 1; tF = 14; }
    if (mode === 'chew') { thb = Math.sin(t * 7) * 0.08 + (look ? thb : 0); tAmp = r.rubbing ? 0.9 : 0.35; }
    if (r.mode === 'eat') { thb = Math.sin(t * 9) * 0.09; tfront = 0.9; }
    if (gait > 0) { trb += clamp(-V.angVel * 0.07, -0.45, 0.45) + Math.sin(V.phase * TAU * 0.5) * (0.05 + gait * 0.03); }
    if (r.leap > 0) { tsy = 1.12; }
    V.skid = Math.max(0, V.skid - dt * 2.2);
    if (V.skid > 0) { tsy *= 1 - 0.1 * V.skid; tsx *= 1 + 0.07 * V.skid; trb += 0.18 * V.skid; }
    V.sy = lerp(V.sy, tsy, k(11)); V.sx = lerp(V.sx, tsx, k(11)); V.hb = lerp(V.hb, thb, k(r.rubbing ? 9 : 7)); V.rb = lerp(V.rb, trb, k(10));
    V.lean = lerp(V.lean, tlean, k(6)); V.front = lerp(V.front, tfront, k(10)); V.rear = lerp(V.rear, trear, k(10)); V.curl = lerp(V.curl, tcurl, k(7)); V.tilt = lerp(V.tilt, ttilt, k(8));
    V.tailAmp = lerp(V.tailAmp, tAmp, k(6)); V.tailF = lerp(V.tailF, tF, k(6)); V.tailLen = lerp(V.tailLen, tLen, k(7));
    V.tailPhase += dt * V.tailF * TAU * 0.5;
    V.shake = Math.max(0, V.shake - dt * 1.0);
    const bob = gait === 0 ? 0 : Math.sin(V.phase * TAU) * (gait === 3 ? 0.035 : 0.022) * ppu;
    const K = (2.6 * ppu) / 128;
    const px = sx(r.x), py = sy(r.y) + bob - (r.leap ? Math.sin((r.leap / 0.35) * Math.PI) * ppu * 0.5 : 0);
    // shadow
    g.save(); g.translate(sx(r.x), sy(r.y) + ppu * 0.1); g.rotate(heading + Math.PI / 2); g.fillStyle = 'rgba(0,0,0,.32)'; g.beginPath(); g.ellipse(0, 0, ppu * 0.62 * V.sx, ppu * 0.88 * V.sy, 0, 0, TAU); g.fill(); g.restore();
    g.save(); g.translate(px, py);
    const sw = V.shake > 0 ? Math.sin(t * 52) * 0.28 * V.shake : 0;
    g.rotate(heading + Math.PI / 2 + sw + V.lean * 0.25); g.transform(1, 0, V.lean * -0.28, 1, 0, 0); g.scale(K * V.sx, K * V.sy);
    if (mode === 'sleep') g.scale(1 + Math.sin(t * 1.6) * 0.012, 1 + Math.sin(t * 1.6) * 0.02);
    // body pivot at the middle
    const hb = V.hb, up = hb / NUP, down = V.rb / NDOWN;
    // paws that kick: drawn first so the body overlaps them
    if (r.pose === 'kick') { g.fillStyle = CREAM; g.beginPath(); g.ellipse(-30 + Math.sin(t * 34) * 3, 36 + Math.abs(Math.sin(t * 34)) * 6, 8, 11, 0.4, 0, TAU); g.fill(); }
    g.save();
    // upward chain (back to the head)
    for (let i = 0; i < NUP; i++) { g.drawImage(imgDog, 0, PIV - (i + 1) * SH, 128, SH, -64, -SH * V.front, 128, SH * V.front + 0.7); g.translate(0, -SH * V.front); g.rotate(up + (i === NUP - 1 ? V.tilt * 0.3 : 0)); }
    // the head's end: what is in his mouth
    g.save(); g.translate(0, -2);
    if (r.carry === 'ball') { g.rotate(Math.sin(t * 9) * 0.05 * Math.min(1, sp)); if (imgBall) g.drawImage(imgBall, -11, -17, 22, 22); }
    else if (r.carry === 'bone') drawBone(g, 1.05);
    else if (r.carry === 'find' || r.mode === 'showoff') { g.translate(0, -8); drawNut(g, 8); }
    g.restore();
    g.restore();
    // downward chain (to the rump)
    g.save();
    for (let i = 0; i < NDOWN; i++) { g.drawImage(imgDog, 0, PIV + i * SH, 128, SH, -64, 0, 128, SH * V.rear + 0.7); g.translate(0, SH * V.rear); g.rotate(down); }
    drawTail(g, V.tailAmp * (mode === 'sleep' ? 0 : 1), V.tailPhase, V.tailLen, V.curl * (V.rb < 0 ? -1 : 1) + V.rb * 0.8);
    g.restore();
    g.restore();
  }

  // ----- the rest of the yard -----
  function drawShadowRect(g, rc, dx = 5, dy = 7) { g.fillStyle = 'rgba(0,0,0,.30)'; g.beginPath(); g.roundRect(sx(rc.x) + dx, sy(rc.y) + dy, rc.w * ppu, rc.h * ppu, 6); g.fill(); }
  function drawCrate(g, rc) {
    drawShadowRect(g, rc); const x = sx(rc.x), y = sy(rc.y), w = rc.w * ppu, h = rc.h * ppu;
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#5b6e7d'); gr.addColorStop(1, '#3b4a57'); g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, w, h, 5); g.fill();
    g.strokeStyle = '#1b252d'; g.lineWidth = 2; g.stroke(); g.strokeStyle = 'rgba(190,215,230,.25)'; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#e0a94a'; g.fillRect(x + w * 0.46, y, w * 0.08, h); g.fillRect(x, y + h * 0.46, w, h * 0.08);
    g.fillStyle = '#2b3640'; for (const [ax, ay] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) { g.beginPath(); g.arc(x + w * ax, y + h * ay, 2.4, 0, TAU); g.fill(); }
    g.fillStyle = '#81e6df'; g.fillRect(x + w * 0.1, y + h * 0.9, w * 0.14, 2);
  }
  function drawScrap(g, rc) {
    drawShadowRect(g, rc, 6, 9); const x = sx(rc.x), y = sy(rc.y), w = rc.w * ppu, h = rc.h * ppu;
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, 12); g.clip();
    g.fillStyle = '#221c18'; g.fillRect(x, y, w, h);
    const cols = ['#6f4a38', '#55616c', '#7d6a4f', '#3f4a55', '#8a5a3a', '#4c3b33', '#68767f'];
    for (let i = 0; i < 26; i++) {
      const cxp = x + hash(i * 3 + 1) * w, cyp = y + hash(i * 3 + 2) * h, sz = ppu * (0.35 + hash(i * 3 + 3) * 0.8), a = hash(i + 90) * TAU;
      g.save(); g.translate(cxp, cyp); g.rotate(a); g.fillStyle = cols[i % cols.length]; g.beginPath();
      if (i % 4 === 0) { g.ellipse(0, 0, sz * 0.5, sz * 0.5, 0, 0, TAU); } else { g.roundRect(-sz * 0.6, -sz * 0.25, sz * 1.2, sz * 0.5, 3); }
      g.fill(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(-sz * 0.55, -sz * 0.22, sz * 1.1, 2); g.restore();
    }
    const mound = g.createRadialGradient(x + w * 0.5, y + h * 0.42, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.62); mound.addColorStop(0, 'rgba(255,230,190,.16)'); mound.addColorStop(0.55, 'rgba(0,0,0,0)'); mound.addColorStop(1, 'rgba(0,0,0,.62)'); g.fillStyle = mound; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,170,90,.25)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + hash(i + 200) * w, y + hash(i + 210) * h, 3, 0, TAU); g.fill(); }
    g.restore(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, w, h, 12); g.stroke();
  }
  function drawKennel(g) {
    const k = L.kennel; g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(sx(k.x + k.w / 2) + 4, sy(k.y + k.h / 2) + 8, k.w * ppu * 0.42, k.h * ppu * 0.4, 0, 0, TAU); g.fill();
    if (imgKennel) g.drawImage(imgKennel, sx(k.x), sy(k.y), k.w * ppu, k.h * ppu);
  }
  function drawBedBowl(g) {
    const b = L.bed; if (imgBed) { g.save(); g.globalAlpha = 0.98; g.drawImage(imgBed, sx(b.x) - ppu * 1.05, sy(b.y) - ppu * 1.12, ppu * 2.1, ppu * 2.24); g.restore(); }
    const bw = L.bowl, bx = sx(bw.x), by = sy(bw.y), R = ppu * 0.56; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(bx + 3, by + 5, R, R * 0.9, 0, 0, TAU); g.fill();
    let gr = g.createRadialGradient(bx - R * 0.3, by - R * 0.3, R * 0.2, bx, by, R); gr.addColorStop(0, '#d9e3ea'); gr.addColorStop(1, '#6c7d8b'); g.fillStyle = gr; g.beginPath(); g.arc(bx, by, R, 0, TAU); g.fill();
    g.strokeStyle = '#27323b'; g.lineWidth = 2; g.stroke();
    gr = g.createRadialGradient(bx, by, R * 0.1, bx, by, R * 0.78); gr.addColorStop(0, '#7c2f2b'); gr.addColorStop(1, '#b4463a'); g.fillStyle = gr; g.beginPath(); g.arc(bx, by, R * 0.6, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(bx, by, R * 0.6, 3.6, 4.7); g.stroke();
    if (state.bowlFull) { g.fillStyle = '#b3743c'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(sx(bw.x) + (hash(i) - 0.5) * ppu * 0.6, sy(bw.y) + (hash(i + 20) - 0.5) * ppu * 0.6, Math.max(2.4, ppu * 0.075), 0, TAU); g.fill(); } }
  }
  function drawBall(g) {
    const b = state.ball; if (b.state === 'carried') return;
    const x = sx(b.x), y = sy(b.y), z = b.z, sz = ppu * 0.5 * (1 + z * 0.13);
    g.fillStyle = `rgba(0,0,0,${0.35 - Math.min(0.2, z * 0.06)})`; g.beginPath(); g.ellipse(x + 2 + z * 2, y + 3 + z * 4, sz * 0.5 * (1 - Math.min(0.3, z * 0.06)), sz * 0.36, 0, 0, TAU); g.fill();
    g.save(); g.translate(x, y - z * ppu * 0.5);
    const squash = z < 0.05 && Math.abs(b.vz) > 0 ? 0.88 : 1; g.rotate(b.spin = (b.spin || 0) + (b.vx + b.vy) * 0.004); g.scale(1 / squash, squash);
    if (imgBall) g.drawImage(imgBall, -sz / 2, -sz / 2, sz, sz); else { g.fillStyle = '#e87a2d'; g.beginPath(); g.arc(0, 0, sz / 2, 0, TAU); g.fill(); }
    if (b.state === 'rest' && !state.fetchDone && !state.touch) { g.restore(); g.save(); g.translate(x, y); const pulse = 0.5 + 0.5 * Math.sin(state.t * 3); g.strokeStyle = `rgba(255,173,114,${0.25 + 0.3 * pulse})`; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, sz * (0.62 + pulse * 0.1), 0, TAU); g.stroke(); }
    g.restore();
  }

  // ----- particles, paw prints -----
  const parts = [], prints = [], sparks = [];
  const puff = (x, y, n = 5, big = 1) => { if (reduced) n = 2; for (let i = 0; i < n; i++) parts.push({ k: 'dust', x, y, vx: (hash(parts.length + i) - 0.5) * 1.6, vy: (hash(parts.length + i * 3) - 0.5) * 1.2, life: 0.5, max: 0.5 + hash(i) * 0.3, s: 0.14 * big }); };
  const hearts = (x, y, n = 4) => { for (let i = 0; i < n; i++) parts.push({ k: 'heart', x: x + (hash(i + state.t) - 0.5) * 0.8, y, vx: (hash(i * 5 + state.t) - 0.5) * 0.6, vy: -1.2 - hash(i) * 0.6, life: 1.4, max: 1.4, s: 0.2 }); };
  const flecks = (x, y, c, n = 8) => { for (let i = 0; i < n; i++) parts.push({ k: 'fleck', x, y, vx: (hash(i + state.t * 7) - 0.5) * 4, vy: -hash(i + 3) * 3, life: 0.6, max: 0.6, s: 0.07, c }); };
  function drawFloat(g, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'fleck') p.vy += 9 * dt; const a = p.life / p.max;
      if (p.k === 'dust') { g.fillStyle = `rgba(170,185,195,${a * 0.35})`; g.beginPath(); g.arc(sx(p.x), sy(p.y), ppu * p.s * (2 - a), 0, TAU); g.fill(); }
      else if (p.k === 'heart') { g.save(); g.translate(sx(p.x), sy(p.y)); g.globalAlpha = Math.min(1, a * 1.6); g.fillStyle = '#ff8fa3'; const s = ppu * p.s; g.beginPath(); g.moveTo(0, s * 0.9); g.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.6, -s * 1.4, 0, -s * 0.4); g.bezierCurveTo(s * 0.6, -s * 1.4, s * 1.6, -s * 0.2, 0, s * 0.9); g.fill(); g.restore(); }
      else if (p.k === 'fleck') { g.fillStyle = p.c; g.globalAlpha = a; g.fillRect(sx(p.x), sy(p.y), ppu * p.s, ppu * p.s); g.globalAlpha = 1; }
      else if (p.k === 'z') { g.fillStyle = `rgba(190,215,235,${a * 0.8})`; g.font = `700 ${Math.round(ppu * (0.32 + (1 - a) * 0.2))}px Inter, sans-serif`; g.fillText('z', sx(p.x), sy(p.y)); }
      else if (p.k === 'spark') { g.fillStyle = `rgba(255,236,170,${a})`; g.beginPath(); g.arc(sx(p.x), sy(p.y), ppu * p.s * a, 0, TAU); g.fill(); }
    }
  }
  function drawGround(g, dt) {
    for (let i = prints.length - 1; i >= 0; i--) {
      const p = prints[i]; p.age += dt; if (p.age > 6) { prints.splice(i, 1); continue; }
      g.save(); g.translate(sx(p.x), sy(p.y)); g.rotate(p.a + Math.PI / 2); g.fillStyle = `rgba(8,12,16,${0.38 * (1 - p.age / 6)})`;
      g.beginPath(); g.ellipse(0, 0, ppu * 0.1, ppu * 0.12, 0, 0, TAU); g.fill(); for (const [dx, dy] of [[-0.12, -0.14], [-0.04, -0.2], [0.04, -0.2], [0.12, -0.14]]) { g.beginPath(); g.arc(dx * ppu, dy * ppu, ppu * 0.04, 0, TAU); g.fill(); } g.restore();
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.age += dt; if (p.age > 5) { sparks.splice(i, 1); continue; } g.strokeStyle = `rgba(8,12,16,${0.4 * (1 - p.age / 5)})`; g.lineWidth = ppu * 0.09; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx(p.x), sy(p.y)); g.lineTo(sx(p.x2), sy(p.y2)); g.stroke(); }
  }

  // ----- aiming and dragging -----
  let ptr = null, dragPx = null, dragItem = null, dragHome = null, snapBack = null;
  function drawAim(g) {
    const t = state.touch; if (!t || t.kind !== 'ball') return;
    const b = state.ball, pv = previewThrow(state, t.x, t.y);
    const bx = sx(b.x), by = sy(b.y), fx = sx(t.x), fy = sy(t.y);
    const pw = pv ? pv.power : 0;
    g.lineCap = 'round'; g.strokeStyle = `rgba(${Math.round(129 + pw * 126)},${Math.round(230 - pw * 60)},${Math.round(223 - pw * 110)},.9)`; g.lineWidth = 4 + pw * 4;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(fx, fy); g.stroke(); g.fillStyle = 'rgba(234,244,245,.9)'; g.beginPath(); g.arc(fx, fy, ppu * 0.3, 0, TAU); g.fill(); g.strokeStyle = 'rgba(129,230,223,.8)'; g.lineWidth = 2; g.stroke();
    if (pv) {
      for (let i = 1; i < pv.pts.length; i++) { const p = pv.pts[i]; g.fillStyle = `rgba(255,236,190,${0.9 - i * 0.07})`; g.beginPath(); g.arc(sx(p.x), sy(p.y) - p.z * ppu * 0.5, Math.max(2, ppu * 0.075 * (1.2 - i * 0.07)), 0, TAU); g.fill(); }
      const l = pv.land, pulse = 0.5 + 0.5 * Math.sin(state.t * 8); g.strokeStyle = 'rgba(255,200,120,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(sx(l.x), sy(l.y), ppu * (0.42 + pulse * 0.08), 0, TAU); g.stroke();
    }
  }
  function drawDrag(g) {
    if (!dragPx || !dragItem) return; g.save(); g.translate(dragPx.x, dragPx.y - ppu * 0.35); g.rotate(-0.4); g.shadowColor = '#000a'; g.shadowBlur = 10; g.scale(ppu / 34, ppu / 34);
    if (dragItem === 'bone') drawBone(g, 1.5); else { g.fillStyle = '#b3743c'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((hash(i) - 0.5) * 22, (hash(i + 9) - 0.5) * 16, 4.2, 0, TAU); g.fill(); } g.strokeStyle = 'rgba(255,255,255,.3)'; g.stroke(); }
    g.restore();
  }

  // ----- events -> sounds and flourishes -----
  let clawN = 0, lastRoll = 0;
  let flashOverride = null;
  function onEvent(e) {
    const r = state.ralph;
    switch (e.type) {
      case 'throw': snd('throw'); break;
      case 'bounce': snd(e.power > 0.6 ? 'bounce1' : e.power > 0.3 ? 'bounce2' : 'bounce3'); puff(e.x, e.y, e.power > 0.5 ? 4 : 2); break;
      case 'knock': snd('knock'); flecks(e.x, e.y, '#9fb0bd', 4); break;
      case 'roll': if (state.t - lastRoll > 0.25) { snd('roll'); lastRoll = state.t; } break;
      case 'claw': clawN++; if (clawN % 2 === 0) snd('claw'); { const a = r.heading, side = clawN % 2 ? 1 : -1; prints.push({ x: r.x - Math.cos(a) * 0.35 + Math.cos(a + 1.57) * 0.22 * side, y: r.y - Math.sin(a) * 0.35 + Math.sin(a + 1.57) * 0.22 * side, a, age: 0 }); if (prints.length > 70) prints.shift(); } break;
      case 'skid': snd('skid'); V.skid = 1; puff(r.x, r.y, 9, 1.5); sparks.push({ x: r.x - Math.cos(e.dir) * 0.2, y: r.y - Math.sin(e.dir) * 0.2, x2: r.x + Math.cos(e.dir) * 1.1, y2: r.y + Math.sin(e.dir) * 1.1, age: 0 }); break;
      case 'pickup': snd('pickup'); break;
      case 'catch': snd('pickup'); parts.push({ k: 'spark', x: r.x, y: r.y - 0.4, vx: 0, vy: -1, life: 0.4, max: 0.4, s: 0.5 }); break;
      case 'drop': snd('drop'); break;
      case 'give': snd('give'); hearts(r.x, r.y - 0.5, 2); break;
      case 'crunch': snd('crunch'); break;
      case 'pour': snd('pour'); setTimeout(() => snd('bowl'), 260); flecks(L.bowl.x, L.bowl.y - 0.6, '#b3743c', 10); break;
      case 'kick': snd('kick'); hearts(r.x, r.y - 0.4, 5); break;
      case 'shake': snd('shake'); puff(r.x, r.y, 6); break;
      case 'found': snd('found'); for (let i = 0; i < 8; i++) parts.push({ k: 'spark', x: r.x + (hash(i) - 0.5) * 1.2, y: r.y - 0.6 - hash(i + 4) * 0.6, vx: 0, vy: -0.6, life: 0.9, max: 0.9, s: 0.2 }); flashOverride = { text: FOUND(names[e.item]?.name || e.item), until: state.t + 4 }; break;
      case 'pocket': snd('pocket'); trayGlow(); break;
      case 'bond': snd('bond'); hearts(r.x, r.y - 0.5, 8); break;
      case 'dig': snd('dig'); flecks(L.scrapMouth.x, L.scrapMouth.y - 0.4, '#6f4a38', 10); break;
      case 'unearth': snd('dig'); break;
      case 'pet': snd('pet'); break;
      case 'thump': snd('thump'); break;
      case 'wake': snd('wake'); break;
      case 'opinion': if (e.kind === 'loves') for (let i = 0; i < 6; i++) parts.push({ k: 'spark', x: r.x + (hash(i) - 0.5), y: r.y - 0.5, vx: (hash(i + 2) - 0.5) * 2, vy: -1, life: 0.7, max: 0.7, s: 0.18 }); break;
      default: break;
    }
  }
  function trayGlow() { pads.bone.classList.add('is-glow'); pads.kibble.classList.add('is-glow'); setTimeout(() => { pads.bone.classList.remove('is-glow'); pads.kibble.classList.remove('is-glow'); }, 700); }

  // ----- the pointer on the yard -----
  const world = (ev) => { const r = cv.getBoundingClientRect(); return { x: wx(ev.clientX - r.left), y: wy(ev.clientY - r.top), px: ev.clientX - r.left, py: ev.clientY - r.top }; };
  let lastMoveAt = 0;
  cv.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return; ev.preventDefault(); try { cv.setPointerCapture(ev.pointerId); } catch { /* fine */ }
    ptr = ev.pointerId; const w = world(ev); lastMoveAt = performance.now(); press(state, w.x, w.y);
  });
  cv.addEventListener('pointermove', (ev) => { if (ev.pointerId !== ptr) return; const w = world(ev), now = performance.now(); move(state, w.x, w.y, Math.max(0.008, (now - lastMoveAt) / 1000)); lastMoveAt = now; });
  const up = (ev) => { if (ev.pointerId !== ptr) return; ptr = null; const w = world(ev); release(state, w.x, w.y); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (ev) => { if (ev.pointerId !== ptr) return; ptr = null; release(state, state.touch ? state.touch.x : 0, state.touch ? state.touch.y : 0); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ----- the tray: drag an item out to Ralph or his bowl -----
  for (const [item, pad] of Object.entries(pads)) {
    let pid = null, sxp = 0, syp = 0, moved = 0;
    pad.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0 || pad.classList.contains('is-empty')) { if (pad.classList.contains('is-empty')) { nudge(state, item === 'bone' ? 'nobone' : 'nokibble'); snd('tray'); } return; }
      ev.preventDefault(); pid = ev.pointerId; try { pad.setPointerCapture(pid); } catch { /* fine */ }
      const r = cv.getBoundingClientRect(); sxp = ev.clientX; syp = ev.clientY; moved = 0; dragItem = item; dragPx = { x: ev.clientX - r.left, y: ev.clientY - r.top }; snd('tray'); pad.classList.add('is-held');
      dragTo(state, item, wx(dragPx.x), wy(dragPx.y));
    });
    pad.addEventListener('pointermove', (ev) => { if (ev.pointerId !== pid) return; const r = cv.getBoundingClientRect(); dragPx = { x: ev.clientX - r.left, y: ev.clientY - r.top }; moved = Math.max(moved, Math.hypot(ev.clientX - sxp, ev.clientY - syp)); dragTo(state, item, wx(dragPx.x), wy(dragPx.y)); });
    const end = (ev, cancelled) => {
      if (ev.pointerId !== pid) return; pid = null; pad.classList.remove('is-held');
      const r = cv.getBoundingClientRect(), x = wx(ev.clientX - r.left), y = wy(ev.clientY - r.top);
      if (cancelled || moved < 12) { dragEnd(state); nudge(state, 'fetchtray'); if (item === 'kibble') nudge(state, 'draggingKibble'); }
      else {
        const res = dropItem(state, item, x, y);
        if (res === 'bone' || res === 'kibble' || res === 'queued') snd('tray');
      }
      dragItem = null; dragPx = null; dragEnd(state);
    };
    pad.addEventListener('pointerup', (ev) => end(ev, false)); pad.addEventListener('pointercancel', (ev) => end(ev, true));
  }
  const onKey = (ev) => { if (ev.key === 'Escape') onLeave?.(); };
  window.addEventListener('keydown', onKey);

  // ----- the loop -----
  let raf = 0, lastTs = 0, alive = true;
  function frame(ts) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const dt = clamp((ts - (lastTs || ts)) / 1000, 0, 0.05); lastTs = ts;
    tick(state, dt);
    for (const e of state.events.splice(0)) onEvent(e);
    const r = state.ralph;
    if (r.panting && state.t - V.lastPant > 1.4) { V.lastPant = state.t; snd('pant'); }
    if (r.mode === 'chew' && state.t - V.lastChew > 1.7) { V.lastChew = state.t; snd('chew'); }
    if (r.mode === 'sleep' && Math.floor(state.t * 0.6) !== Math.floor((state.t - dt) * 0.6)) parts.push({ k: 'z', x: r.x + 0.5, y: r.y - 0.5, vx: 0.2, vy: -0.5, life: 1.8, max: 1.8 });
    if (r.rubbing && Math.floor(state.t * 4) !== Math.floor((state.t - dt) * 4) && r.warm > 0.6) hearts(r.x, r.y - 0.4, 1);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H); cx.drawImage(deck, 0, 0, W, H);
    drawGround(cx, dt);
    drawBedBowl(cx);
    for (const c of L.crates) drawCrate(cx, c);
    drawScrap(cx, L.scrap); drawKennel(cx);
    drawBall(cx);
    if (imgDog) drawDog(cx, r, dt);
    drawAim(cx); drawDrag(cx);
    drawFloat(cx, dt);
    hud();
  }
  // ----- words, face, tray (DOM) -----
  let lastSay = '', lastFace = '', lastPips = -1, lastBone = null;
  function hud() {
    const key = sayKey(state);
    let text = (flashOverride && flashOverride.until > state.t) ? flashOverride.text : (lines[key] || '');
    if (state.quick && key === 'mode-idle' && state.stat.throws === 0 && state.stat.rubTotal < 0.1) text = lines.quick;
    if (text !== lastSay) { lastSay = text; sayEl.textContent = text; sayEl.classList.remove('is-new'); void sayEl.offsetWidth; sayEl.classList.add('is-new'); }
    const m = state.ralph.mood, fk = state.flash && (state.flash.key === 'enough' || state.flash.key === 'notnow') ? 'low' : (m >= 62 || state.flash?.key === 'spot' || state.flash?.key === 'loves' ? 'happy' : m < 30 ? 'low' : 'mid');
    if (fk !== lastFace) { lastFace = fk; faceImg.src = faces[fk]; faceEl.dataset.mood = fk; }
    const kl = state.rec.have.kibble - state.stat.usedKibble, bl = state.rec.have.bone - state.stat.usedBone;
    if (kl !== lastPips) { lastPips = kl; pipsEl.innerHTML = '<i></i>'.repeat(Math.min(5, Math.max(0, kl))); pads.kibble.classList.toggle('is-empty', kl <= 0); pads.kibble.querySelector('.rl-label').textContent = kl <= 0 ? 'No kibble' : 'Kibble'; }
    if (bl !== lastBone) { lastBone = bl; pads.bone.classList.toggle('is-empty', bl <= 0); pads.bone.querySelector('.rl-label').textContent = bl <= 0 ? 'No bone' : 'Bone'; }
    pads.bone.classList.toggle('is-used', state.chewing);
    root.classList.toggle('is-sleep', state.ralph.mode === 'sleep');
  }

  // ----- go -----
  layoutSize();
  const ro = new ResizeObserver(() => { layoutSize(); }); ro.observe(stage);
  faceImg.src = faces.mid;
  const hint = root.querySelector('.rl-hand'); hint.textContent = '';
  raf = requestAnimationFrame(frame);
  // test hook: where things are on screen
  const hook = { state, get ppu() { return ppu; }, toScreen: (x, y) => { const r = cv.getBoundingClientRect(); return { x: r.left + sx(x), y: r.top + sy(y) }; }, toWorld: (cx2, cy2) => { const r = cv.getBoundingClientRect(); return { x: wx(cx2 - r.left), y: wy(cy2 - r.top) }; }, pocket: () => pocket(state) };
  stage.__ralph = hook; window.__ralph = hook;
  return {
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKey); if (window.__ralph === hook) delete window.__ralph; delete stage.__ralph; stage.innerHTML = ''; },
  };
}
