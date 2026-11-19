// Screw on screen: a close-up of a bolt in a steel plate. Press in the ring round the head and circle clockwise (a finger or the
// mouse button held); the head turns and visibly sinks, a side view shows the shaft going down, and on the last turn a torque
// bar wakes and shakes as you near the green. Let go in the green. Canvas 500 x 500 board units; resolves with the pure result.
import { screwDown, screwMove, screwUp, screwGiveUp, SIZE, torque, inLastTurn, inGreen, gradeOf, greenFrom } from './screw.js';
import { h, ensureStyle, loop, lcg, fitCanvas } from './craftChainView.js';
import { gradeWord } from './craftChain.js';

const K = 1.5;
const TAU = Math.PI * 2;

function makePlate() {
  const c = document.createElement('canvas'); c.width = c.height = SIZE * K;
  const g = c.getContext('2d'); g.scale(K, K);
  const r = lcg(11);
  const grad = g.createLinearGradient(0, 0, SIZE, SIZE); grad.addColorStop(0, '#5d6872'); grad.addColorStop(0.5, '#8b97a1'); grad.addColorStop(1, '#4e5964');
  g.fillStyle = grad; g.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 300; i++) { const y = r() * SIZE, x = r() * SIZE; g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(10,18,26,.07)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + r() * 200, y); g.stroke(); }
  const vg = g.createRadialGradient(SIZE / 2, SIZE / 2, 140, SIZE / 2, SIZE / 2, 360); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,12,20,.55)'); g.fillStyle = vg; g.fillRect(0, 0, SIZE, SIZE);
  return c;
}

export function playScrew(root, { state, what = 'bolt', reducedMotion = () => false } = {}) {
  ensureStyle();
  const s = state;
  const plate = makePlate();
  const canvas = h('canvas', { class: 'cc-canvas cc-screwcanvas', width: String(SIZE * K), height: String(SIZE * K), 'aria-label': 'A bolt in a steel plate. Circle round the head clockwise to tighten it.' });
  const ctx = canvas.getContext('2d');
  const needle = h('i', { class: 'cc-needle' });
  const zoneEl = h('s', { class: 'cc-zone' });
  const overEl = h('u', { class: 'cc-over' });
  const total = 1 + s.strip;
  zoneEl.style.left = `${(100 * (1 - s.zone)) / total}%`; zoneEl.style.width = `${(100 * s.zone) / total}%`;
  overEl.style.left = `${100 / total}%`; overEl.style.width = `${(100 * s.strip) / total}%`;
  const bar = h('div', { class: 'cc-torque', role: 'img', 'aria-label': 'Torque on the last turn. Let go in the green.' }, zoneEl, overEl, needle);
  const torqueNote = h('span', { class: 'cc-tnote', text: 'Torque wakes on the last turn' });
  const torqueBox = h('div', { class: 'cc-torquebox' }, h('div', { class: 'cc-thead' }, h('span', { text: 'Torque' }), torqueNote), bar,
    h('div', { class: 'cc-tscale' }, h('span', { text: 'loose' }), h('span', { text: 'snug' }), h('span', { text: 'over' })));
  const pipRow = (n, cls) => Array.from({ length: n }, () => h('i', { class: cls }));
  const depthFill = h('i'), depthEl = h('em', { text: 'start' }), slipsEl = h('em', { text: 'none' }), stripEl = h('em', { text: 'none' }), liveEl = h('em', { class: 'cc-live', text: 'perfect' });
  const slipPips = pipRow(6, 'cc-pip'), stripPips = pipRow(3, 'cc-pip'), gradeFill = h('i');
  const hud = h('div', { class: 'cc-hud cc-hud4' },
    h('div', { class: 'cc-stat cc-depthstat' }, h('span', { text: 'Bolt depth' }), h('div', { class: 'cc-meter cc-depth', role: 'img', 'aria-label': 'How far the bolt is in' }, depthFill), depthEl),
    h('div', { class: 'cc-stat' }, h('span', { text: 'Slips' }), h('span', { class: 'cc-pips', role: 'img', 'aria-label': 'Slips so far' }, ...slipPips), slipsEl),
    h('div', { class: 'cc-stat' }, h('span', { text: 'Stripped' }), h('span', { class: 'cc-pips', role: 'img', 'aria-label': 'Stripped heads so far' }, ...stripPips), stripEl),
    h('div', { class: 'cc-stat' }, h('span', { text: 'How it is going' }), h('div', { class: 'cc-meter cc-gradebar', role: 'img', 'aria-label': 'How clean the bolt is so far' }, gradeFill), liveEl));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: `Press in the ring and circle clockwise to drive the ${what}. Let go when the torque is in the green.` });
  const giveUp = h('button', { type: 'button', class: 'ui-btn cc-done', text: 'Give up this bolt' });
  const panel = h('section', { class: 'rp-panel cc-panel mg-skin ui-panel', role: 'group', 'aria-label': `Screw: drive the ${what}`, 'data-game': 'screw' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `SCREW · ${what.toUpperCase()}` }), hud, torqueBox, h('div', { class: 'cc-boardwrap cc-square' }, canvas), status,
    h('div', { class: 'cc-row' }, giveUp), h('p', { class: 'rp-help', text: `Clockwise tightens, counter-clockwise loosens. Stay inside the ring or the driver slips and a quarter turn is lost. Keep turning past the end and the head strips.` }));
  panel.__state = s;
  root.append(panel);
  fitCanvas(panel.querySelector('.cc-boardwrap'), canvas, 1);

  const toBoard = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) * SIZE) / r.width, y: ((e.clientY - r.top) * SIZE) / r.height }; };
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;
  let ptr = null, trail = [], endAt = 0, ended = false, shakeX = 0, slipT = 0, stripT = 0;
  canvas.addEventListener('pointerdown', (e) => { if (s.done) return; e.preventDefault(); const p = toBoard(e); canvas.setPointerCapture?.(e.pointerId); ptr = p; screwDown(s, p.x, p.y); if (!s.engaged) status.textContent = 'Press inside the ring round the head.'; });
  canvas.addEventListener('pointermove', (e) => {
    if (s.done || !s.down) return; e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    for (const ev of list && list.length ? list : [e]) { const p = toBoard(ev); ptr = p; screwMove(s, p.x, p.y); trail.push(p); if (trail.length > 14) trail.shift(); if (s.done) break; }
  });
  const up = (e) => { if (s.down) { canvas.releasePointerCapture?.(e.pointerId); screwUp(s); ptr = null; trail = []; } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  giveUp.addEventListener('click', () => { if (!s.done) screwGiveUp(s); });

  function draw(dt) {
    const g = ctx; g.setTransform(K, 0, 0, K, 0, 0);
    g.drawImage(plate, 0, 0, SIZE, SIZE);
    const cx = s.cx, cy = s.cy; // the side view takes the strip to the right of the ring
    const prog = Math.min(1, s.turns / s.T), sink = Math.max(0, Math.min(1, s.status === 'stripped' ? 1 : prog));
    // the ring: where the driver must stay
    g.save(); g.translate(cx, cy);
    const hot = s.slipFlash > 0;
    g.beginPath(); g.arc(0, 0, s.ringOut, 0, TAU); g.arc(0, 0, s.ringIn, 0, TAU, true);
    g.fillStyle = hot ? 'rgba(255,90,70,.28)' : s.engaged ? 'rgba(60,230,210,.26)' : 'rgba(60,210,200,.12)'; g.fill('evenodd');
    g.lineWidth = 1.5; g.strokeStyle = hot ? '#ff6b5a' : 'rgba(150,245,235,.85)'; g.beginPath(); g.arc(0, 0, s.ringOut, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, s.ringIn, 0, TAU); g.stroke();
    const mid = (s.ringIn + s.ringOut) / 2;
    g.fillStyle = 'rgba(230,255,252,.55)'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + s.turns * TAU * 0.5; g.save(); g.rotate(a); g.translate(mid, 0); g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 4); g.lineTo(-6, 4); g.closePath(); g.fill(); g.restore(); }
    // the head: a hex bolt that turns and sinks (smaller, lower shadow as it seats)
    const scale = 1 - 0.16 * sink, lift = 1 - sink;
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4 + 18 * lift; g.shadowOffsetY = 2 + 12 * lift; g.shadowOffsetX = 0;
    g.rotate(s.turns * TAU); g.scale(scale, scale);
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.lineTo(Math.cos(a) * 33, Math.sin(a) * 33); } g.closePath();
    const hg = g.createLinearGradient(-30, -30, 30, 30); hg.addColorStop(0, '#d7dee4'); hg.addColorStop(1, '#77848f'); g.fillStyle = hg; g.fill();
    g.shadowColor = 'transparent'; g.lineWidth = 2; g.strokeStyle = '#2b3640'; g.stroke();
    g.beginPath(); g.arc(0, 0, 21, 0, TAU); g.strokeStyle = 'rgba(30,42,52,.6)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#26323c'; g.fillRect(-14, -3, 28, 6); g.fillRect(-3, -14, 6, 28); // the cross drive
    if (s.status === 'stripped') { g.strokeStyle = '#d24c3a'; g.lineWidth = 2.2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-18 + i * 8, -12); g.lineTo(-10 + i * 8, 12); g.stroke(); } }
    g.restore();
    // the finger / mouse and its recent circle
    if (trail.length > 1) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    if (ptr && s.down) { g.beginPath(); g.arc(ptr.x, ptr.y, 11, 0, TAU); g.fillStyle = s.engaged ? 'rgba(255,255,255,.9)' : 'rgba(255,120,100,.9)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#102030'; g.stroke(); }
    // the side view: the shaft going into the plate; the head comes down as the bolt turns in
    const sx = 432, surface = 250, headY = surface - 16 - 56 * (1 - sink);
    g.fillStyle = 'rgba(8,16,24,.55)'; g.fillRect(sx - 42, 110, 84, 250);
    g.fillStyle = '#b9c5cd'; g.fillRect(sx - 9, headY + 12, 18, surface + 56 - headY - 12);
    g.strokeStyle = 'rgba(20,30,40,.75)'; g.lineWidth = 1.5;
    for (let y = headY + 18 + ((s.turns * 16) % 8); y < surface + 54; y += 8) { g.beginPath(); g.moveTo(sx - 9, y); g.lineTo(sx + 9, y - 4); g.stroke(); }
    g.fillStyle = 'rgba(110,124,136,.82)'; g.fillRect(sx - 42, surface, 84, 62); g.fillStyle = 'rgba(30,40,50,.8)'; g.fillRect(sx - 42, surface, 84, 3);
    g.fillStyle = '#d7dee4'; g.fillRect(sx - 22, headY, 44, 16); g.strokeStyle = '#2b3640'; g.lineWidth = 1.5; g.strokeRect(sx - 22, headY, 44, 16);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '700 11px Consolas, monospace'; g.textAlign = 'center'; g.fillText('SIDE', sx, 126);
    if (s.slipFlash > 0) { g.globalAlpha = s.slipFlash; g.fillStyle = '#ff6b5a'; g.font = '700 26px Consolas, monospace'; g.fillText('SLIP', cx, cy - s.ringOut - 14); g.globalAlpha = 1; }
    if (s.status === 'stripped') { g.fillStyle = '#ff6b5a'; g.font = '700 20px Consolas, monospace'; g.fillText('STRIPPED: turn it back out', cx, cy + s.ringOut + 28); }
    void dt;
  }
  function step(dt) {
    for (const ev of s.events.splice(0)) {
      if (ev.type === 'slip') { slipT = 1; status.textContent = 'Slipped out of the ring: a quarter turn lost (-5).'; }
      else if (ev.type === 'strip') { stripT = 1; status.textContent = 'The head stripped (-15). Turn it all the way back out, counter-clockwise.'; }
      else if (ev.type === 'backed-out') status.textContent = 'Out. A fresh bolt: start again.';
      else if (ev.type === 'loose') status.textContent = 'Loose, not done: press in the ring and carry on to the green.';
      else if (ev.type === 'over') status.textContent = 'Over-tight, but it holds (-5).';
    }
    s.slipFlash = Math.max(0, s.slipFlash - dt * 2.2); void slipT; void stripT;
    const last = inLastTurn(s) || s.status === 'stripped';
    bar.classList.toggle('is-awake', inLastTurn(s));
    bar.classList.toggle('is-green', inGreen(s));
    torqueNote.textContent = s.status === 'stripped' ? 'stripped: back it out' : inLastTurn(s) ? (inGreen(s) ? 'IN THE GREEN: let go' : 'last turn: nearly there') : 'wakes on the last turn';
    const q = Math.max(0, Math.min(total, torque(s)));
    const near = inLastTurn(s) ? Math.max(0, 1 - Math.abs(s.turns - greenFrom(s)) / 0.3) : 0;
    shakeX = inLastTurn(s) && !reducedMotion() ? (Math.random() - 0.5) * (inGreen(s) ? 6 : 2 + 6 * near) : 0;
    needle.style.left = `${(100 * (last ? q : 0)) / total}%`; needle.style.transform = `translateX(calc(-50% + ${shakeX}px))`;
    const dp = s.status === 'stripped' ? 1 : Math.min(1, s.turns / s.T);
    depthFill.style.width = `${100 * dp}%`;
    depthEl.textContent = s.status === 'stripped' ? 'stripped' : dp < 0.05 ? 'start' : dp < 0.5 ? 'going in' : inGreen(s) ? 'home: let go' : inLastTurn(s) ? 'nearly home' : 'halfway';
    const said = (n) => (n <= 0 ? 'none' : n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : 'many');
    slipsEl.textContent = said(s.slips); stripEl.textContent = said(s.stripped);
    slipPips.forEach((p, i) => { p.className = `cc-pip${i < s.slips ? ' on' : ''}`; }); stripPips.forEach((p, i) => { p.className = `cc-pip${i < s.stripped ? ' on' : ''}`; });
    const gr = gradeOf(s); gradeFill.style.width = `${gr}%`; gradeFill.dataset.low = gr < 70 ? '1' : '0'; liveEl.textContent = gradeWord(gr);
    giveUp.disabled = s.done;
    if (s.done && !endAt) { endAt = performance.now(); status.textContent = s.result.success ? 'Snug.' : s.result.how === 'gave-up' ? 'Given up.' : 'Too rough.'; }
  }
  const stop = loop((dt) => { step(dt); draw(dt); if (s.done && !ended && performance.now() - endAt > 500) { ended = true; stop(); finish(s.result); } });
  return promise;
}
