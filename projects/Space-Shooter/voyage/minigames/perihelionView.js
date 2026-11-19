// Perihelion on screen: a canvas tactical map with a DOM HUD. Phone first: on a narrow screen the arena turns on its side
// (fly up the screen); drag from the ship to aim and set thrust, tap BURN, then tap the left or right half of the map to
// trim and press the MARK button when the ring is in its sweet spot. Keys: arrows aim (plan) or trim (burn), Enter burns,
// Space presses the mark. Draws everything with the canvas 2D API, no images. Resolves with the rules' result.
import { hashSeed, step as rngStep } from '../quests/rng.js';
import { ARENA, SHIP_R, BURN, PHYS, MARK_REACH, setPlan, launch, advance, trim, pressMark, predict, predictRemaining, planCosts, maxThrust, abandon, isHidden, gatePos, WHY } from './perihelion.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const TAU = Math.PI * 2;
const COL = { cyan: '#81e6df', amber: '#ffad72', silver: '#d6e2ec', violet: '#b9a4ff', red: '#ff6b5a', green: '#7ff0a8', glass: '#0b1724', deep: '#070d17', muted: '#9db3c2' };
const MOD = { standard: COL.cyan, refuel: COL.green, slipstream: COL.violet, unstable: COL.amber };
const MAX_DRAG = 200; // world units of drag for 100% thrust

export function playPerihelion(root, { state, title: title0 = 'Perihelion', sound = () => {}, reducedMotion = () => false, xpFor = null, embedded = false, onLeave = null } = {}) {
  const s = state;
  // On a desktop the game owns the screen like the trainer's gallery: a fixed overlay on <body>, HUD across the top, map as big as fits.
  const full = embedded || (typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches); // embedded: the shared workbench full-screen helper owns the screen, so the panel mounts in its stage
  const still = () => reducedMotion();
  // ---- DOM ------------------------------------------------------------------------------------------------------------------
  const meter = (cls, label) => h('div', { class: `pr-meter ${cls}` }, h('span', { text: label }), h('i', {}, h('u'), h('s'), h('em'), h('b')));
  const fuelM = meter('is-fuel', 'Fuel'), heatM = meter('is-heat', 'Heat');
  const hullM = h('div', { class: 'pr-meter is-hull', 'aria-label': 'Hull' }, h('span', { text: 'Hull' }), h('div', { class: 'pr-pips' }, ...Array.from({ length: s.ship.maxHull }, () => h('i'))));
  const turnM = h('span', { class: 'pr-turn' });
  const helpBtn = h('button', { type: 'button', class: 'pr-help-btn', 'aria-label': 'What is this sector?', 'aria-expanded': 'true', text: '?' });
  const title = h('p', { class: 'rp-eyebrow pr-title', text: `PERIHELION · ${(title0 || '').toUpperCase()}` });
  const pts = s.setup.points || {};
  const mine = [pts.time > 0 && 'longer burns', pts.fuel > 0 && 'cheaper fuel', pts.warning > 0 && 'a longer arc and earlier shard warnings'].filter(Boolean);
  const briefText = h('p', {}, `${s.briefing} Par: ${s.parTurns} turns, ${s.parFuel} fuel.${mine.length ? ` Your points: ${mine.join(', ')}.` : ''}`);
  const brief = h('div', { class: 'pr-brief is-open' }, briefText);
  const beginBtn = h('button', { type: 'button', class: 'primary ui-btn pr-begin', text: 'Begin' });
  const intro = h('div', { class: 'pr-intro', hidden: '' }, h('p', { class: 'pr-intro-title', text: title0 }), h('p', { text: s.briefing }), h('p', { text: `Par: ${s.parTurns} turns, ${s.parFuel} fuel. Three stars wants both.` }), mine.length ? h('p', { class: 'pr-intro-kit', text: `Your points: ${mine.join(', ')}.` }) : null, beginBtn);
  const leaveBtn = h('button', { type: 'button', class: 'pr-leave ui-btn', text: 'Leave' });
  const canvas = h('canvas', { class: 'pr-canvas', 'aria-label': 'Sector map: drag from the ship to aim a burn' });
  const stage = h('div', { class: 'pr-stage' }, canvas, brief);
  const wrap = h('div', { class: 'pr-wrap' }, intro, stage);
  const status = h('p', { class: 'rp-status pr-status', role: 'status', 'aria-live': 'polite' });
  const burnBtn = h('button', { type: 'button', class: 'pr-burn primary ui-btn', text: 'BURN' });
  const markBtn = h('button', { type: 'button', class: 'pr-mark ui-btn', text: 'MARK', hidden: '' });
  const coastBtn = h('button', { type: 'button', class: 'pr-coast ui-btn', text: 'Coast' });
  const quitBtn = h('button', { type: 'button', class: 'pr-quit ui-btn danger', text: 'Quit' });
  const angleIn = h('input', { type: 'range', min: '-180', max: '180', step: '1', 'aria-label': 'Aim angle in degrees' });
  const thrustIn = h('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Thrust percent' });
  const fine = h('details', { class: 'pr-fine' }, h('summary', { text: 'Fine tune' }), h('label', {}, h('span', { text: 'Aim' }), angleIn), h('label', {}, h('span', { text: 'Thrust' }), thrustIn));
  const panel = h('section', { class: `rp-panel pr-panel mg-skin ${full ? 'pr-full' : 'ui-panel'}`, role: full ? 'dialog' : 'group', 'aria-label': `Navigation: ${title0}` },
    h('div', { class: 'pr-top' }, title, turnM, helpBtn, leaveBtn),
    h('div', { class: 'pr-hud' }, fuelM, heatM, hullM), wrap, status,
    h('div', { class: 'pr-foot' }, burnBtn, markBtn, coastBtn, quitBtn), fine,
    h('p', { class: 'rp-help pr-tip', text: 'Drag from the ship to aim; a longer drag is a harder burn. BURN, then tap the left or right half of the map to trim, and press MARK when the ring is lit.' }));
  panel.__state = s;
  // The stage keeps a small stand-in so the sheet behind still reads as "this game is open".
  const behind = full && !embedded ? h('div', { class: 'rp-panel mg-skin ui-panel pr-behind', text: 'Perihelion is open full screen.' }) : null;
  if (embedded) root.append(panel); else if (full) { root.append(behind); document.body.append(panel); } else root.append(panel);
  let finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;
  if (s.mode === 'trainer') panel.dataset.mode = 'trainer';

  // ---- geometry -------------------------------------------------------------------------------------------------------------
  const ctx = canvas.getContext('2d');
  let rot = false, k = 1, W = 1, H = 1, dpr = 1;
  const P = (x, y) => (rot ? [y * k, (ARENA.w - x) * k] : [x * k, y * k]);
  const U = (sx, sy) => (rot ? [ARENA.w - sy / k, sx / k] : [sx / k, sy / k]);
  function resize() {
    canvas.style.width = '1px'; stage.style.width = '1px'; // measure the room, not our own last size
    const avail = Math.max(240, wrap.clientWidth || panel.clientWidth || 360);
    rot = !full && avail < 640 && innerHeight >= innerWidth * 0.9;
    const top = Math.max(0, Math.min(wrap.getBoundingClientRect().top, 170));
    // Full screen: the map takes the room the wrap has. Phone: what is left above the pinned buttons. Narrow desktop window: 62% of it.
    const maxH = full ? Math.max(260, wrap.clientHeight - 4) : rot ? Math.max(300, innerHeight - top - 112) : Math.max(300, innerHeight * 0.62);
    if (rot) { const hh = Math.min(avail * (ARENA.w / ARENA.h), maxH); W = Math.round(hh * (ARENA.h / ARENA.w)); H = Math.round(hh); k = W / ARENA.h; }
    else { W = Math.round(Math.min(avail, maxH * (ARENA.w / ARENA.h))); H = Math.round(W * (ARENA.h / ARENA.w)); k = W / ARENA.w; }
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    stage.style.width = `${W}px`;
    panel.classList.toggle('is-rot', rot);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); }) : null;
  ro?.observe(wrap);
  addEventListener('resize', resize);
  resize();
  setTimeout(() => { if (!closed) resize(); }, 350); // a page that scrolls the game into view settles after the first layout

  // ---- scenery (seeded, so the same sector always looks the same) -----------------------------------------------------------
  let rng = hashSeed('peri-sky', s.seed, s.sector.id);
  const rand = () => { const [v, n] = rngStep(rng); rng = n; return v; };
  const stars = Array.from({ length: 90 }, () => ({ x: rand() * ARENA.w, y: rand() * ARENA.h, r: 0.4 + rand() * 1.2, ph: rand() * TAU, sp: 0.6 + rand() * 1.6 }));
  const rockShape = new Map();
  const shapeOf = (a) => {
    if (!rockShape.has(a.id)) { let g = hashSeed('rock', a.id); const r = () => { const [v, n] = rngStep(g); g = n; return v; }; rockShape.set(a.id, Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * TAU, m: 0.72 + r() * 0.38 }))); }
    return rockShape.get(a.id);
  };

  // ---- view state -----------------------------------------------------------------------------------------------------------
  const fx = { particles: [], callouts: [], shake: 0, flash: 0, flashColor: COL.red, trimFlash: 0, trimDir: 0, markFlash: 0, shot: 0 };
  let pred = null, predKey = '', live = [], liveAt = 0, pointer = null, dragging = false, lastT = performance.now(), T = 0, raf = 0, closed = false, ended = false;
  const view = { speed: 1 };
  const say = (t) => { if (status.textContent !== t) status.textContent = t; };
  const tone = { emerald: COL.green, amber: COL.amber, sky: COL.cyan, rose: COL.red, violet: COL.violet };
  const callout = (x, y, text, c = 'sky') => { fx.callouts.push({ x, y, text, c: tone[c] || c, life: 1.6, max: 1.6 }); if (fx.callouts.length > 8) fx.callouts.shift(); };
  const burst = (x, y, color, n, speed = 90) => {
    if (still()) return;
    for (let i = 0; i < n; i++) { const a = rand() * TAU, v = speed * (0.3 + rand()); fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + rand() * 0.5, max: 1, color, size: 1 + rand() * 2 }); }
    if (fx.particles.length > 220) fx.particles.splice(0, fx.particles.length - 220);
  };

  // ---- plan helpers ---------------------------------------------------------------------------------------------------------
  const keyOf = () => `${s.turn}|${s.phase}|${s.plan.angle.toFixed(4)}|${s.plan.thrust}|${s.ship.fuel}|${s.ship.heat}`;
  function refreshPred() { const k2 = keyOf(); if (k2 !== predKey) { predKey = k2; pred = s.phase === 'plan' ? predict(s) : null; } }
  function aimFromPointer(sx, sy) {
    const [wx, wy] = U(sx, sy);
    const dx = wx - s.ship.x, dy = wy - s.ship.y, d = Math.hypot(dx, dy);
    const thrust = d < 14 ? 0 : Math.max(0, Math.min(100, ((d - 14) / (MAX_DRAG - 14)) * 100));
    setPlan(s, { angle: d < 14 ? s.plan.angle : Math.atan2(dy, dx), thrust });
  }
  const evPos = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };

  function doLaunch() {
    if (s.phase !== 'plan' || ended) return;
    if (!launch(s)) { say('Not enough fuel for that burn. Pull back the thrust.'); sound('hurt'); return; }
    sound('talk'); fx.shot = 0; live = []; liveAt = 0; briefOpen = false; introOpen = false;
    say('Burning. Tap the left or right half of the map to trim.');
    paintHud();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (ended) return;
    const [sx, sy] = evPos(e);
    if (s.phase === 'plan') { dragging = true; pointer = [sx, sy]; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not a real pointer */ } aimFromPointer(sx, sy); e.preventDefault(); }
    else if (s.phase === 'burn') { doTrim(sx < W / 2 ? -1 : 1); e.preventDefault(); }
  });
  canvas.addEventListener('pointermove', (e) => { if (dragging && s.phase === 'plan') { const [sx, sy] = evPos(e); pointer = [sx, sy]; aimFromPointer(sx, sy); } });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  markBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); doMark(); });
  markBtn.addEventListener('click', (e) => { if (e.detail === 0) doMark(); });
  burnBtn.addEventListener('click', doLaunch);
  coastBtn.addEventListener('click', () => { setPlan(s, { thrust: 0 }); sound('talk'); });
  quitBtn.addEventListener('click', () => { if (!s.done) { abandon(s); handle([]); } });
  angleIn.addEventListener('input', () => setPlan(s, { angle: (Number(angleIn.value) * Math.PI) / 180 }));
  thrustIn.addEventListener('input', () => setPlan(s, { thrust: Number(thrustIn.value) }));
  function doTrim(dir) { const r = trim(s, dir); if (r === 'ok') { fx.trimFlash = 0.18; fx.trimDir = dir; sound('power'); } handle([]); }
  function doMark() { const r = pressMark(s); if (r === 'perfect') { fx.markFlash = 0.5; sound('power'); } else if (r === 'miss') sound('hurt'); handle([]); }
  const kd = (e) => {
    if (ended || e.target?.closest?.('input,textarea,select')) return;
    const k2 = e.key;
    if (introOpen && full) return; // the card has its own Begin button (focused)
    if (s.phase === 'plan') {
      const step = e.shiftKey ? 0.2 : 0.05;
      if (k2 === 'ArrowLeft') { setPlan(s, { angle: s.plan.angle - step }); e.preventDefault(); }
      else if (k2 === 'ArrowRight') { setPlan(s, { angle: s.plan.angle + step }); e.preventDefault(); }
      else if (k2 === 'ArrowUp') { setPlan(s, { thrust: s.plan.thrust + 5 }); e.preventDefault(); }
      else if (k2 === 'ArrowDown') { setPlan(s, { thrust: s.plan.thrust - 5 }); e.preventDefault(); }
      else if (k2 === 'Enter') { doLaunch(); e.preventDefault(); }
    } else if (s.phase === 'burn') {
      if (k2 === 'ArrowLeft' || k2 === 'a' || k2 === 'A') { doTrim(-1); e.preventDefault(); }
      else if (k2 === 'ArrowRight' || k2 === 'd' || k2 === 'D') { doTrim(1); e.preventDefault(); }
      else if (k2 === ' ' || k2 === 'Enter') { doMark(); e.preventDefault(); }
    }
  };
  addEventListener('keydown', kd);

  // ---- events from the rules -> sound, particles and words ------------------------------------------------------------------
  function handle(evs) {
    evs = evs.concat(s.events.splice(0));
    for (const e of evs) {
      if (e.type === 'hurt') { callout(e.x, e.y, `${e.label} -${e.label === 'CORE' ? 2 : 1} HULL`, 'rose'); burst(e.x, e.y, COL.red, 14, 140); fx.shake = still() ? 0 : 0.3; fx.flash = 0.35; fx.flashColor = COL.red; sound('hurt'); }
      else if (e.type === 'gate') { callout(e.x, e.y, e.note || `${(e.label || 'GATE').toUpperCase()} CLEARED`, e.mod === 'unstable' ? 'amber' : e.mod === 'slipstream' ? 'violet' : 'emerald'); burst(e.x, e.y, MOD[e.mod] || COL.cyan, 22, 160); sound('power'); }
      else if (e.type === 'mark') { say(`${e.label}: press MARK when the ring is in the bright band.`); }
      else if (e.type === 'mark-perfect') { callout(e.x, e.y, e.label, 'emerald'); burst(e.x, e.y, COL.green, 24, 170); }
      else if (e.type === 'mark-miss' || e.type === 'locked') { callout(e.x, e.y, e.label, 'amber'); sound('hurt'); }
      else if (e.type === 'scan') { callout(e.x, e.y, 'FOG SCANNED', 'sky'); }
      else if (e.type === 'collapse') { callout(e.x, e.y, 'RELAY COLLAPSED', 'amber'); burst(e.x, e.y, COL.amber, 16, 110); }
      else if (e.type === 'shard') { sound('jam'); }
      else if (e.type === 'trim') { burst(e.x, e.y, COL.silver, 6, 70); }
    }
    if (s.done) return end();
    if (s.phase === 'plan' && prevPhase === 'burn') {
      const n = s.maxTurns - s.turn + 1;
      say(`Turn ${s.turn} of ${s.maxTurns}. ${n === 1 ? 'Last burn.' : `${n} burns left.`} Drag from the ship to aim.`);
    }
    prevPhase = s.phase;
    paintHud();
  }
  let prevPhase = s.phase;

  // ---- HUD ------------------------------------------------------------------------------------------------------------------
  const cache = new Map();
  const setT = (el, t) => { if (cache.get(el) !== t) { cache.set(el, t); el.textContent = t; } };
  const whole = (n) => String(Math.max(0, Math.round(n)));
  function paintHud() {
    const sh = s.ship, c = planCosts(s), planning = s.phase === 'plan', burning = s.phase === 'burn';
    // Fuel: the bar shows what is left; the striped block is this burn's price; the dotted outline is what it would cost at full price.
    const mf = sh.maxFuel;
    fuelM.querySelector('u').style.width = `${Math.max(0, (sh.fuel / mf) * 100)}%`;
    const paying = planning ? c.fuel : 0;
    const cost = fuelM.querySelector('s'), ghost = fuelM.querySelector('em');
    cost.style.left = `${Math.max(0, ((sh.fuel - paying) / mf) * 100)}%`; cost.style.width = `${(paying / mf) * 100}%`;
    const fullCost = s.fuelFactor < 1 && paying > 0 ? paying / s.fuelFactor : 0;
    ghost.style.left = `${Math.max(0, ((sh.fuel - fullCost) / mf) * 100)}%`; ghost.style.width = `${(fullCost / mf) * 100}%`; ghost.hidden = !fullCost;
    const saved = fullCost ? fullCost - paying : 0;
    setT(fuelM.querySelector('b'), whole(sh.fuel));
    fuelM.classList.toggle('is-low', sh.fuel / mf < 0.2);
    heatM.querySelector('u').style.width = `${sh.heat}%`;
    const ph = heatM.querySelector('s'); const end = planning ? c.endHeat : sh.heat;
    ph.style.left = `${Math.min(sh.heat, end)}%`; ph.style.width = `${Math.abs(end - sh.heat)}%`; ph.classList.toggle('is-cool', end < sh.heat);
    setT(heatM.querySelector('b'), sh.overheated ? 'HOT' : whole(sh.heat));
    heatM.classList.toggle('is-hot', sh.overheated || sh.heat >= 75);
    [...hullM.querySelectorAll('.pr-pips i')].forEach((el, i) => el.classList.toggle('on', i < sh.hull));
    setT(turnM, `Turn ${Math.min(s.turn, s.maxTurns)}/${s.maxTurns}`);
    turnM.dataset.turn = String(Math.min(s.turn, s.maxTurns));
    burnBtn.disabled = !planning || s.done || !c.afford; burnBtn.hidden = !planning;
    coastBtn.hidden = !planning; quitBtn.hidden = !planning || s.done;
    setT(burnBtn, `BURN ${c.thrust}% · ${whole(c.fuel)} fuel`);
    // MARK takes the burn button's place in the thumb zone while the burn is live; it lights when a ring is closing.
    const live = Boolean(s.burn?.mark);
    markBtn.hidden = !burning; markBtn.classList.toggle('is-live', live); markBtn.setAttribute('aria-disabled', live ? 'false' : 'true');
    setT(markBtn, live ? 'MARK' : 'MARK · wait for a ring');
    intro.hidden = !(introOpen && full); stage.hidden = introOpen && full;
    brief.classList.toggle('is-open', briefOpen && !burning && !full);
    helpBtn.setAttribute('aria-expanded', String(full ? introOpen : briefOpen && !burning));
    if (angleIn !== document.activeElement) angleIn.value = String(Math.round((s.plan.angle * 180) / Math.PI));
    if (thrustIn !== document.activeElement) { thrustIn.max = String(maxThrust(s)); thrustIn.value = String(s.plan.thrust); }
    thrustIn.disabled = angleIn.disabled = !planning;
    panel.dataset.phase = s.phase;
    if (planning && pred) {
      const hit = pred.hits[0];
      const base = `Aim ${Math.round((s.plan.angle * 180) / Math.PI)}°, thrust ${c.thrust}%.`;
      if (!c.afford) say('Not enough fuel for that burn. Pull back the thrust.');
      else if (hit && hit.t <= s.arc * BURN) say(`${base} Warning: ${pred.unknown ? 'an unknown contact' : hit.label.toLowerCase()} at ${f1(hit.t)} s.`);
      else if (pred.win) say(`${base} This burn reaches the exit.`);
      else say(`${base} The dashed arc is where this burn takes you.${saved >= 0.5 ? ` Your points save ${whole(saved)} fuel.` : ''}`);
    }
  }
  let briefOpen = !full; // desktop shows a card before turn 1 instead of an overlay on the live map
  let introOpen = full;
  helpBtn.addEventListener('click', () => { if (full) introOpen = !introOpen && s.phase === 'plan'; else briefOpen = !briefOpen; paintHud(); if (full) resize(); });
  beginBtn.addEventListener('click', () => { introOpen = false; paintHud(); resize(); });
  leaveBtn.addEventListener('click', () => { const wl = document.querySelector('.wb-leave'); if (onLeave) onLeave(); else if (wl) wl.click(); else if (!s.done) { abandon(s); handle([]); } });

  // ---- drawing --------------------------------------------------------------------------------------------------------------
  const glow = (color, blur) => { if (!still()) { ctx.shadowColor = color; ctx.shadowBlur = blur * dpr; } };
  const noGlow = () => { ctx.shadowBlur = 0; };
  function path(points, close = false) { ctx.beginPath(); points.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); if (close) ctx.closePath(); }
  function circle(x, y, r) { const [sx, sy] = P(x, y); ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.5, r * k), 0, TAU); }
  const text = (t, x, y, size, color, align = 'center', alpha = 1) => { const [sx, sy] = P(x, y); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = `700 ${size}px Consolas, monospace`; ctx.textAlign = align; ctx.fillText(t, sx, sy); ctx.globalAlpha = 1; };

  // Labels are queued while the map draws and placed at the end of the frame, so none sits on another label or on a ring.
  let labelQ = [], obst = [];
  const queue = (t, wx, wy, wr, color, prio, o = {}) => labelQ.push({ t, wx, wy, wr, color, prio, ...o });
  const solid = (wx, wy, wr, own) => obst.push({ wx, wy, wr, own });
  function placeLabels() {
    const size = Math.max(9, 10 * k * 2), rects = [];
    const hits = (r, ox) => rects.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)
      || obst.some((o) => { if (o === ox) return false; const [cx, cy] = P(o.wx, o.wy), rr = o.wr * k + 3, nx = Math.max(r.x0, Math.min(cx, r.x1)), ny = Math.max(r.y0, Math.min(cy, r.y1)); return (nx - cx) ** 2 + (ny - cy) ** 2 < rr * rr; });
    labelQ.sort((a, b) => a.prio - b.prio);
    for (const L of labelQ) {
      const sz = L.size || size; ctx.font = `700 ${sz}px Consolas, monospace`;
      const w = ctx.measureText(L.t).width, [sx, sy] = P(L.wx, L.wy), rr = L.wr * k, own = obst.find((o) => o.own === L.own && L.own);
      const spots = L.center ? [[0, 0]] : [];
      spots.push([0, -(rr + 8)], [0, rr + sz + 6], [rr + w / 2 + 8, sz / 3], [-(rr + w / 2 + 8), sz / 3], [0, -(rr + sz + 20)], [0, rr + 2 * sz + 22], [rr + w / 2 + 8, -(sz + 6)], [-(rr + w / 2 + 8), sz + 10]);
      let pick = null;
      for (const [dx, dy] of spots) {
        let cx = sx + dx, by = sy + dy;
        cx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, cx)); by = Math.max(sz + 4, Math.min(H - 6, by));
        const r = { x0: cx - w / 2 - 2, x1: cx + w / 2 + 2, y0: by - sz, y1: by + 3, cx, by };
        if (!hits(r, own)) { pick = r; break; }
        if (!pick && !L.drop) pick = r;
      }
      if (!pick || (L.drop && hits(pick, own))) continue;
      rects.push(pick);
      ctx.globalAlpha = L.alpha ?? 1; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,13,23,0.85)'; ctx.strokeText(L.t, pick.cx, pick.by); ctx.fillStyle = L.color; ctx.fillText(L.t, pick.cx, pick.by); ctx.globalAlpha = 1;
    }
    labelQ = []; obst = [];
  }

  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1724'); g.addColorStop(1, '#070d17');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // tactical grid
    ctx.strokeStyle = 'rgba(129,230,223,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= ARENA.w; x += 50) { const [a, b] = P(x, 0), [c2, d] = P(x, ARENA.h); ctx.moveTo(a, b); ctx.lineTo(c2, d); }
    for (let y = 0; y <= ARENA.h; y += 50) { const [a, b] = P(0, y), [c2, d] = P(ARENA.w, y); ctx.moveTo(a, b); ctx.lineTo(c2, d); }
    ctx.stroke();
    for (const st of stars) { const [x, y] = P(st.x, st.y); ctx.globalAlpha = still() ? 0.5 : 0.35 + 0.35 * Math.sin(T * st.sp + st.ph); ctx.fillStyle = COL.silver; ctx.fillRect(x, y, st.r, st.r); }
    ctx.globalAlpha = 1;
    // the wall: touching it costs hull, so it reads as a hazard strip
    const lo = SHIP_R + PHYS.wall;
    ctx.strokeStyle = 'rgba(255,107,90,0.45)'; ctx.setLineDash([10 * k * 2, 8 * k * 2]); ctx.lineDashOffset = -T * 14; ctx.lineWidth = 1.5;
    const [a, b] = P(lo, lo), [c2, d] = P(ARENA.w - lo, ARENA.h - lo);
    ctx.strokeRect(Math.min(a, c2), Math.min(b, d), Math.abs(c2 - a), Math.abs(d - b)); ctx.setLineDash([]);
  }
  function drawFog() {
    for (const f of s.fog) {
      if (f.revealed) { circle(f.x, f.y, f.r); ctx.strokeStyle = 'rgba(185,164,255,0.25)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); continue; }
      const [x, y] = P(f.x, f.y), r = f.r * k;
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(120,110,170,0.62)'); g.addColorStop(0.7, 'rgba(90,80,140,0.4)'); g.addColorStop(1, 'rgba(80,70,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = T * 0.15 * (i % 2 ? 1 : -1) + i * 1.7; ctx.fillStyle = 'rgba(185,164,255,0.07)'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.4, r * 0.38, 0, TAU); ctx.fill(); }
      queue(f.hint.toUpperCase(), f.x, f.y, 0, 'rgba(214,226,236,0.85)', 9, { center: true, drop: true });
    }
  }
  function drawWell(w) {
    const [x, y] = P(w.x, w.y), r = w.reach * k, col = w.color;
    const g = ctx.createRadialGradient(x, y, w.core * k, x, y, r);
    g.addColorStop(0, `${col}66`); g.addColorStop(0.45, `${col}1c`); g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // the slingshot ring: the sweet ground, always turning
    ctx.save(); ctx.translate(x, y); ctx.rotate(still() ? 0 : T * 0.35); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([14 * k * 2, 10 * k * 2]); glow(col, 10);
    ctx.beginPath(); ctx.arc(0, 0, w.sling * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]); noGlow(); ctx.restore();
    ctx.strokeStyle = `${col}33`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    // the core: black, with a swirl
    ctx.fillStyle = '#02050a'; ctx.beginPath(); ctx.arc(x, y, w.core * k, 0, TAU); ctx.fill();
    ctx.strokeStyle = COL.red; ctx.lineWidth = 2; glow(COL.red, 8); ctx.beginPath(); ctx.arc(x, y, w.core * k, 0, TAU); ctx.stroke(); noGlow();
    for (let i = 0; i < 3; i++) { const a = (still() ? 0 : T * (1.4 + i * 0.5)) + i * 2.1; ctx.strokeStyle = `${col}aa`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, (w.core * (0.45 + i * 0.17)) * k, a, a + 1.6); ctx.stroke(); }
    queue(w.label.toUpperCase(), w.x, w.y, w.sling, col, 2, { alpha: 0.9 }); solid(w.x, w.y, w.core + 4);
  }
  function drawFlare(f) {
    const a = P(f.x, f.y), b = P(f.x + Math.cos(f.angle) * f.length, f.y + Math.sin(f.angle) * f.length);
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, 'rgba(255,173,114,0.95)'); g.addColorStop(1, 'rgba(255,107,90,0.05)');
    ctx.strokeStyle = g; ctx.lineWidth = Math.max(3, f.width * k); glow(COL.amber, 14); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); noGlow(); ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, f.width * k * 0.25); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  function drawRock(a, ghostOnly = false) {
    const [x, y] = P(a.x, a.y); const shape = shapeOf(a), spin = still() ? 0 : T * 0.25 * (a.vx >= 0 ? 1 : -1);
    ctx.beginPath(); shape.forEach((v, i) => { const ang = v.a + spin, px = x + Math.cos(ang) * a.r * k * v.m, py = y + Math.sin(ang) * a.r * k * v.m; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath();
    if (ghostOnly) { ctx.strokeStyle = 'rgba(255,173,114,0.45)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); return; }
    const g = ctx.createLinearGradient(x - a.r * k, y - a.r * k, x + a.r * k, y + a.r * k); g.addColorStop(0, '#5b6c7b'); g.addColorStop(1, '#27323d');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(214,226,236,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  function drawGate(g) {
    if (isHidden(s, g)) return;
    const [x, y] = P(g.x, g.y), r = g.r * k;
    const waiting = g.kind === 'exit' && s.gates.some((o) => o.kind === 'waypoint' && o.required !== false && !o.cleared && !o.collapsed);
    const open = !g.collapsed && (!g.pulse || (s.clock % g.pulse) / g.pulse <= (g.open ?? 0.55));
    const col = g.cleared ? 'rgba(157,179,194,0.4)' : g.collapsed ? 'rgba(255,107,90,0.45)' : g.kind === 'exit' ? COL.silver : MOD[g.mod] || COL.cyan;
    if (g.motion) { const a = P(g.motion.ox - g.motion.ax, g.motion.oy - g.motion.ay), b = P(g.motion.ox + g.motion.ax, g.motion.oy + g.motion.ay); ctx.strokeStyle = 'rgba(129,230,223,0.18)'; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = (waiting || !open) && !g.cleared ? 0.55 : 1;
    ctx.strokeStyle = col; ctx.lineWidth = g.kind === 'exit' ? 3 : 2.2; glow(col, g.cleared ? 0 : 14);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(still() ? 0 : T * (g.kind === 'exit' ? 1.2 : -0.9)); ctx.lineWidth = 3; ctx.setLineDash([r * 0.5, r * 0.55]); ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    noGlow();
    if (g.kind === 'exit') { ctx.fillStyle = col; ctx.globalAlpha *= 0.9; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - r * 0.18 + i * r * 0.2 - r * 0.2, y - r * 0.22); ctx.lineTo(x + i * r * 0.2 - r * 0.02 - r * 0.2, y); ctx.lineTo(x - r * 0.18 + i * r * 0.2 - r * 0.2, y + r * 0.22); ctx.fill(); } }
    ctx.globalAlpha = 1;
    const mod = { refuel: 'REFUEL', slipstream: 'SLIPSTREAM', unstable: 'RELAY', standard: 'GATE' }[g.mod];
    const word = g.kind === 'exit' ? 'EXIT' : mod;
    const state = g.cleared ? 'CLEARED' : g.collapsed ? 'COLLAPSED' : waiting ? 'LOCKED' : !open ? 'CLOSED' : '';
    const tag = [word, state, g.mod === 'unstable' && !g.cleared && !g.collapsed && g.expires != null ? `gone after turn ${g.expires}` : ''].filter(Boolean).join(' · ');
    queue(tag, g.x, g.y, g.r, col, 1, { own: g.id }); solid(g.x, g.y, g.r + 2);
  }
  function drawMeteors() {
    for (const m of s.meteors) {
      const b = s.burn; if (!b || m.spent) continue;
      if (!m.active) {
        if (b.t < m.t0) continue; // the warning starts at t0 and lasts `warn` seconds
        const f = (b.t - m.t0) / m.warn, [x0, y0] = P(m.x0, m.y0), blink = still() ? 1 : 0.5 + 0.5 * Math.sin(T * 18);
        const len = 0.9 * Math.hypot(m.vx, m.vy), a = Math.atan2(m.vy, m.vx), [x1, y1] = P(m.x0 + Math.cos(a) * len, m.y0 + Math.sin(a) * len);
        ctx.strokeStyle = COL.red; ctx.globalAlpha = 0.3 + 0.5 * blink; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(x0, y0, (6 + 8 * (1 - f)) * k * 2, 0, TAU); ctx.globalAlpha = 0.5 * blink; ctx.fill(); ctx.globalAlpha = 1;
        text('SHARD', m.x0, m.y0 - 16, Math.max(8, 9 * k * 2), COL.red);
      } else {
        const [x, y] = P(m.x, m.y), [tx, ty] = P(m.x - m.vx * 0.09, m.y - m.vy * 0.09);
        ctx.strokeStyle = COL.amber; ctx.lineWidth = 3; glow(COL.amber, 10); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke(); noGlow();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, m.r * k * 0.8, 0, TAU); ctx.fill();
      }
    }
  }
  function drawArc() {
    if (!pred) return;
    const shown = Math.floor(pred.points.length * s.arc) + 1, pts = pred.points.slice(0, Math.min(pred.points.length, shown));
    if (pts.length < 2) return;
    const last = pts[pts.length - 1];
    // the burn: bright while the engine fires (the first `window` s), thinner while it coasts
    const split = Math.max(1, pts.findIndex((p) => p.t > s.window));
    const a = split > 0 ? pts.slice(0, split + 1) : pts, b = pts.slice(Math.max(0, split));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(b); ctx.strokeStyle = 'rgba(129,230,223,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([7, 7]); ctx.lineDashOffset = still() ? 0 : -T * 24; glow(COL.cyan, 8); ctx.stroke(); ctx.setLineDash([]);
    path(a); ctx.strokeStyle = COL.cyan; ctx.lineWidth = 4; ctx.stroke(); noGlow();
    for (let i = 1; i < pts.length; i++) if (pts[i].risk) { const [x, y] = P(pts[i].x, pts[i].y); ctx.strokeStyle = COL.red; ctx.lineWidth = 2; glow(COL.red, 8); ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); noGlow(); }
    // half-second ticks
    for (const p of pts) { const q = Math.round(p.t / 0.5) * 0.5; if (p.t > 0 && Math.abs(p.t - q) < 0.026) { const [x, y] = P(p.x, p.y); ctx.fillStyle = COL.silver; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } }
    // the arc's end: a ring, and a question mark where the scanner stops
    const [ex, ey] = P(last.x, last.y);
    ctx.strokeStyle = COL.silver; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, TAU); ctx.stroke();
    if (s.arc < 0.999) text('?', last.x + 14, last.y - 10, 13, COL.amber);
    for (const g of pred.gates) { if (g.t <= s.arc * BURN) text('✓', g.x, g.y - 6, 16, COL.green); }
    if (s.arc >= 0.999) { for (const gh of pred.ghosts.gates) { circle(gh.x, gh.y, gh.r); ctx.strokeStyle = 'rgba(129,230,223,0.35)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); } for (const ra of pred.ghosts.asteroids) if (!isHidden(s, ra)) drawRock(ra, true); }
    ctx.lineCap = 'butt';
  }
  function drawLive() {
    if (s.phase !== 'burn') return;
    if (s.trail.length > 1) { path(s.trail); ctx.strokeStyle = 'rgba(214,226,236,0.55)'; ctx.lineWidth = 2; ctx.stroke(); }
    const now = performance.now(); if (now - liveAt > 90) { live = predictRemaining(s); liveAt = now; }
    if (live.length > 1) { path(live); ctx.strokeStyle = 'rgba(129,230,223,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.lineDashOffset = still() ? 0 : -T * 30; ctx.stroke(); ctx.setLineDash([]); }
  }
  function drawShip() {
    const sh = s.ship, sp = Math.hypot(sh.vx, sh.vy);
    const worldAng = s.phase === 'plan' ? s.plan.angle : sp > 2 ? Math.atan2(sh.vy, sh.vx) : s.plan.angle;
    const [x, y] = P(sh.x, sh.y), ang = rot ? worldAng - Math.PI / 2 : worldAng, sc = Math.max(0.8, k * 1.6);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const firing = s.phase === 'burn' && s.burn.t <= s.burn.window && s.burn.accel > 0;
    if (firing) { const fl = (still() ? 1 : 0.7 + 0.3 * Math.sin(T * 60)) * (14 + (s.burn.accel / PHYS.accel) * 14) * sc; const g = ctx.createLinearGradient(-8 * sc, 0, -8 * sc - fl, 0); g.addColorStop(0, 'rgba(255,200,140,0.95)'); g.addColorStop(1, 'rgba(255,107,90,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8 * sc, -4 * sc); ctx.lineTo(-8 * sc - fl, 0); ctx.lineTo(-8 * sc, 4 * sc); ctx.fill(); }
    if (sh.slip) { ctx.strokeStyle = COL.violet; ctx.lineWidth = 2; glow(COL.violet, 12); ctx.beginPath(); ctx.arc(0, 0, 15 * sc, 0, TAU); ctx.stroke(); noGlow(); }
    ctx.fillStyle = COL.silver; glow(COL.cyan, 10);
    ctx.beginPath(); ctx.moveTo(12 * sc, 0); ctx.lineTo(-9 * sc, -8 * sc); ctx.lineTo(-4 * sc, 0); ctx.lineTo(-9 * sc, 8 * sc); ctx.closePath(); ctx.fill(); noGlow();
    ctx.fillStyle = COL.cyan; ctx.beginPath(); ctx.moveTo(8 * sc, 0); ctx.lineTo(-3 * sc, -3 * sc); ctx.lineTo(-3 * sc, 3 * sc); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (fx.trimFlash > 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = COL.cyan; ctx.lineWidth = 3; ctx.globalAlpha = fx.trimFlash / 0.18; const sd = fx.trimDir * 22 * sc; ctx.beginPath(); ctx.moveTo(0, sd); ctx.lineTo(0, sd + fx.trimDir * 12 * sc); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; }
  }
  function drawAim() {
    if (s.phase !== 'plan' || ended) return;
    const sh = s.ship, c = planCosts(s), [x, y] = P(sh.x, sh.y);
    const len = (14 + (c.thrust / 100) * (MAX_DRAG - 14)) * k, a = rot ? s.plan.angle - Math.PI / 2 : s.plan.angle;
    // thrust rings at 25, 50, 75, 100%
    ctx.strokeStyle = 'rgba(129,230,223,0.16)'; ctx.lineWidth = 1;
    for (const q of [0.25, 0.5, 0.75, 1]) { ctx.beginPath(); ctx.arc(x, y, (14 + q * (MAX_DRAG - 14)) * k, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 3; glow(COL.amber, 10); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 14 * k, y + Math.sin(a) * 14 * k); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    ctx.fillStyle = COL.amber; ctx.beginPath(); const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len; ctx.moveTo(ex + Math.cos(a) * 10, ey + Math.sin(a) * 10); ctx.lineTo(ex + Math.cos(a + 2.5) * 9, ey + Math.sin(a + 2.5) * 9); ctx.lineTo(ex + Math.cos(a - 2.5) * 9, ey + Math.sin(a - 2.5) * 9); ctx.fill(); noGlow();
    ctx.fillStyle = COL.amber; ctx.font = '700 12px Consolas, monospace'; ctx.textAlign = 'left'; ctx.fillText(`${c.thrust}%`, ex + Math.cos(a) * 16 + 4, ey + Math.sin(a) * 16 + 4);
  }
  function drawMark() {
    const m = s.burn?.mark; if (!m) return;
    const tgt = m.type === 'gate' ? s.gates.find((g) => g.id === m.id) : s.wells.find((w) => w.id === m.id);
    if (!tgt) return;
    const base = m.type === 'gate' ? tgt.r : tgt.sling, reach = m.type === 'gate' ? MARK_REACH : 60;
    const rAt = (p) => base + (1 - p) * reach * 1.6;
    const p = m.progress, good = p >= PHYS.sweet[0] && p <= PHYS.sweet[1];
    const [x, y] = P(tgt.x, tgt.y);
    // the bright band is the sweet spot: pressing while the closing ring is inside it pays
    ctx.strokeStyle = 'rgba(127,240,168,0.28)'; ctx.lineWidth = Math.max(4, (rAt(PHYS.sweet[0]) - rAt(PHYS.sweet[1])) * k); ctx.beginPath(); ctx.arc(x, y, ((rAt(PHYS.sweet[0]) + rAt(PHYS.sweet[1])) / 2) * k, 0, TAU); ctx.stroke();
    ctx.strokeStyle = good ? COL.green : COL.amber; ctx.lineWidth = good ? 5 : 3; glow(good ? COL.green : COL.amber, 16); ctx.beginPath(); ctx.arc(x, y, rAt(p) * k, 0, TAU); ctx.stroke(); noGlow();
    queue(good ? 'NOW' : m.label, tgt.x, tgt.y, rAt(0), good ? COL.green : COL.amber, 0, { size: Math.max(10, 11 * k * 2) });
  }
  function drawTrimHint() {
    if (s.phase !== 'burn') return;
    ctx.fillStyle = 'rgba(129,230,223,0.28)'; ctx.font = '700 11px Consolas, monospace'; ctx.textAlign = 'center';
    for (const [x, dir] of [[18, -1], [W - 18, 1]]) { ctx.beginPath(); ctx.moveTo(x + dir * 7, H / 2 - 12); ctx.lineTo(x - dir * 7, H / 2); ctx.lineTo(x + dir * 7, H / 2 + 12); ctx.closePath(); ctx.fill(); ctx.fillText('TRIM', x, H / 2 + 28); }
  }
  function drawFx(dt) {
    for (const p of fx.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
    fx.particles = fx.particles.filter((p) => p.life > 0);
    for (const p of fx.particles) { const [x, y] = P(p.x, p.y); ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); ctx.fillStyle = p.color; ctx.fillRect(x, y, p.size, p.size); }
    ctx.globalAlpha = 1;
    for (const c of fx.callouts) {
      c.life -= dt; const al = Math.min(1, c.life / 0.6), size = Math.max(11, 12 * k * 2);
      let [sx, sy] = P(c.x, c.y); sy -= 26 + (1 - c.life / c.max) * 36;
      ctx.font = `700 ${size}px Consolas, monospace`; const w = ctx.measureText(c.text).width / 2 + 8;
      sx = Math.max(w, Math.min(W - w, sx)); sy = Math.max(size + 4, Math.min(H - 6, sy));
      ctx.globalAlpha = al; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,13,23,0.85)'; ctx.strokeText(c.text, sx, sy); ctx.fillStyle = c.c; ctx.fillText(c.text, sx, sy); ctx.globalAlpha = 1;
    }
    fx.callouts = fx.callouts.filter((c) => c.life > 0);
    if (fx.flash > 0) { ctx.fillStyle = fx.flashColor; ctx.globalAlpha = Math.min(0.28, fx.flash * 0.7); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }
  function drawFrame() {
    ctx.strokeStyle = 'rgba(129,230,223,0.55)'; ctx.lineWidth = 2; const L = 22;
    for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [W - 1, 1, -1, 1], [1, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx, cy + sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * L, cy); ctx.stroke(); }
  }

  function frame(now) {
    if (closed) return;
    if (behind && !behind.isConnected) return teardown();
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; T += dt;
    if (s.phase === 'burn' && !s.done) handle(advance(s, dt * view.speed));
    else if (s.events.length) handle([]);
    fx.shake = Math.max(0, fx.shake - dt); fx.flash = Math.max(0, fx.flash - dt); fx.trimFlash = Math.max(0, fx.trimFlash - dt); fx.markFlash = Math.max(0, fx.markFlash - dt);
    if (s.phase === 'plan') refreshPred();
    paintHud();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * fx.shake * 3, (Math.random() - 0.5) * 8 * fx.shake * 3);
    drawBackdrop(); drawFog();
    for (const w of s.wells) drawWell(w);
    for (const f of s.flares) drawFlare(f);
    for (const g of s.gates) drawGate(g);
    for (const a of s.asteroids) if (!isHidden(s, a)) drawRock(a);
    drawArc(); drawLive(); drawMeteors(); drawMark(); drawShip(); drawAim(); placeLabels(); drawTrimHint(); drawFx(dt); drawFrame();
    ctx.restore();
    raf = requestAnimationFrame(frame);
  }

  function teardown() {
    closed = true; cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('resize', resize); ro?.disconnect(); panel.remove(); behind?.remove(); finish(s.result || null);
  }

  // ---- the result -----------------------------------------------------------------------------------------------------------
  function end() {
    if (ended) return; ended = true;
    removeEventListener('keydown', kd); removeEventListener('resize', resize); ro?.disconnect();
    const r = s.result;
    paintHud();
    say(WHY[r.how] || '');
    burnBtn.hidden = coastBtn.hidden = quitBtn.hidden = markBtn.hidden = true;
    const goBtn = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const pays = r.success ? (xpFor ? xpFor(r) : r.xp) : 0;
    // The same card as the shooting gallery's results: big stars, then one line each for turns, fuel, hull, marks and XP.
    const row = (id, label, detail, tag, paid) => h('li', { class: paid ? 'is-paid' : '', 'data-line': id }, h('b', { text: label }), h('span', { text: detail }), h('em', { text: tag }));
    const lines = r.success ? [
      row('turns', 'Turns', `${r.turns} of ${r.maxTurns} (par ${r.parTurns})`, r.turns <= r.parTurns ? 'par met' : 'over par', r.turns <= r.parTurns),
      row('fuel', 'Fuel', `${whole(r.fuelUsed)} used (par ${r.parFuel})${r.fuelSaved >= 0.5 ? `, your points saved ${whole(r.fuelSaved)}` : ''}`, r.fuelUsed <= r.parFuel ? 'par met' : 'over par', r.fuelUsed <= r.parFuel),
      row('hull', 'Hull', `${r.hullLeft} of ${s.ship.maxHull} left`, r.hullLeft >= s.ship.maxHull ? 'whole' : 'hit', r.hullLeft >= s.ship.maxHull),
      row('marks', 'Marks', `${r.marks} ring${r.marks === 1 ? '' : 's'} pressed`, r.marks > 0 ? 'good' : '--', r.marks > 0),
    ] : [
      row('turns', 'Turns', `${r.turns} of ${r.maxTurns}`, '--', false),
      row('fuel', 'Fuel', `${whole(r.fuelUsed)} used`, '--', false),
      row('hull', 'Hull', `${r.hullLeft} of ${s.ship.maxHull} left`, '--', false),
    ];
    const title = r.success ? 'SECTOR CLEARED' : r.how === 'hull' ? 'HULL LOST' : 'OUT OF TURNS';
    const card = h('div', { class: `rp-result ui-card ga-result pr-result ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.success ? 'arrived' : 'lost' },
      h('b', { class: 'rp-stars', text: title }),
      r.success ? h('p', { class: 'pr-bigstars', 'aria-label': `${r.stars} of 3 stars` }, ...[1, 2, 3].map((n) => h('i', { class: n <= r.stars ? 'on' : '', text: '★' }))) : null,
      h('ul', { class: 'ga-lines' }, ...lines),
      h('p', { class: 'ga-total', text: r.success ? (pays > 0 ? `Total +${pays} Navigation XP` : 'No new XP: you have these stars already.') : `${WHY[r.how] || ''} No XP.` }),
      h('p', { class: 'ga-note', text: r.success ? 'Three stars wants par turns and par fuel. Training pays XP, never skill points.' : 'Step back and try again.' }), goBtn);
    setTimeout(() => {
      panel.append(card); card.scrollIntoView({ block: 'nearest' });
      let armed = false; setTimeout(() => { armed = true; goBtn.focus({ preventScroll: true }); }, 450);
      goBtn.addEventListener('click', () => { if (!armed) return; closed = true; cancelAnimationFrame(raf); panel.remove(); behind?.remove(); finish(r); });
    }, still() ? 0 : 650);
  }

  panel.__view = {
    get speed() { return view.speed; }, set speed(v) { view.speed = v; },
    plan: (angle, thrust) => { setPlan(s, { angle, thrust }); paintHud(); },
    launch: doLaunch, trim: doTrim, mark: doMark,
    get arcShown() { return pred ? Math.floor(pred.points.length * s.arc) + 1 : 0; },
    get pred() { return pred; }, get rot() { return rot; }, get fx() { return fx; }, P, U,
  };
  paintHud();
  if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
  if (full) setTimeout(() => { if (introOpen && !closed) beginBtn.focus({ preventScroll: true }); }, 50);
  return promise;
}
