// The shooting gallery on screen: a full-screen holodeck range (it owns the screen on desktop and phone: the HUD across the top, the range
// filling the rest, Leave in the corner), drawn on a canvas 160 range units wide. Targets are holo plates on lit rail tracks; pop-ups rise out
// of a slot. The reload, the magazine and the crosshair bloom are drawn where you can see them, in plain words, so each of shooting's three
// paths visibly changes the range. Click or tap to shoot, R to reload. Fixed 60 Hz steps. DOM and canvas only. Resolves with the rules' result
// when the player presses Continue on the results card, or null when they press Leave. The pure rules are gallery.js.
import { stepGallery, shoot, reload, bloomOf, bloomMax, targetAt, spreadWord, RANGE, LANES, FLIP_SECONDS, scoreLines } from './gallery.js';
import { shootingLesson } from './setup.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); } el.append(...kids.filter(Boolean)); return el; };
const DT = 1 / 60;
const ACCENT = '#ff7a59'; // shooting's colour in the skills kit
const HOLO = '#81e6df';
const WORDS = { cleared: 'RANGE CLEARED', time: 'TIME UP' };

export function playGallery(root, { state, xpLeft = Infinity, sound = () => {}, reducedMotion = () => false, begin = true } = {}) {
  const s = state, lesson = shootingLesson(s.lesson), H = s.h;
  const canvas = h('canvas', { class: 'ga-canvas', width: 640, height: Math.round((640 * H) / RANGE.w), role: 'img', 'aria-label': 'The shooting range: targets sliding left and right' });
  const ctx = canvas.getContext('2d');
  const ticker = { targets: h('b', { text: '0' }), bull: h('b', { text: '0' }), acc: h('b', { text: '--' }), time: h('b', { text: '0.0' }) };
  const stat = (label, el, extra) => h('p', { class: 'ga-stat' }, h('span', { text: label }), el, extra);
  const clockFill = h('u'), pips = h('div', { class: 'ga-pips', role: 'img' });
  const reloadFill = h('u'), reloadWords = h('b', { text: 'Ready' });
  const reloadTrack = h('i', { class: 'ga-reload-track', style: `width:${Math.round((120 * s.setup.reloadSeconds) / 1.8)}px` }, reloadFill);
  const sprayWords = h('b', { text: 'tight' }), sprayDot = h('span', { class: 'ga-spray-dot' });
  const hud = h('div', { class: 'ga-hud' },
    h('div', { class: 'ga-ticker' }, stat('Targets', ticker.targets, h('small', { text: ` of ${s.targets.length}` })), stat('Bullseyes', ticker.bull), stat('Accuracy', ticker.acc), stat('Time', ticker.time, h('small', { text: ` s · par ${lesson.par}` }))),
    h('div', { class: 'ga-clock', role: 'img', 'aria-label': 'Time left' }, clockFill),
    h('div', { class: 'ga-rig' },
      h('div', { class: 'ga-mag' }, h('span', { text: 'Rounds' }), pips),
      h('div', { class: 'ga-reload' }, h('span', { text: 'Reload' }), reloadTrack, reloadWords),
      h('div', { class: 'ga-spray' }, h('span', { text: 'Spread:' }), sprayDot, sprayWords)));
  const status = h('p', { class: 'rp-status ga-status', role: 'status', 'aria-live': 'polite', text: `Lesson ${lesson.id}, ${lesson.name}: hit all ${s.targets.length} targets in ${lesson.time} seconds.` });
  const startBtn = h('button', { type: 'button', class: 'primary ui-btn ga-begin', text: 'Begin the round' });
  const loadout = h('div', { class: 'ga-intro' },
    h('p', { class: 'ga-intro-title', text: `Range ${lesson.id}: ${lesson.name}` }),
    h('p', { text: `${s.targets.length} targets, ${lesson.time} seconds, par ${lesson.par}. Click or tap to shoot, R to reload.` }),
    h('p', { class: 'ga-intro-kit', text: `Your kit: ${s.setup.magazine} rounds, ${s.setup.reloadSeconds} second reload, spread ${spreadWord(s.setup.spread)} at rest.` }), startBtn);
  const box = h('div', { class: 'ga-box' }, canvas, loadout);
  const range = h('div', { class: 'ga-range' }, box);
  const reloadBtn = h('button', { type: 'button', class: 'ui-btn ga-reload-btn', 'aria-label': 'Reload', text: 'Reload (R)' });
  const leaveBtn = h('button', { type: 'button', class: 'ui-btn ga-leave', text: 'Leave' });
  const panel = h('section', { class: 'rp-panel ga-panel ga-full mg-skin', role: 'dialog', 'aria-label': 'Shooting gallery', style: `--sk:${ACCENT}` },
    h('div', { class: 'ga-top' }, h('p', { class: 'ga-eyebrow', text: `SHOOTING GALLERY · ${lesson.name.toUpperCase()}` }), leaveBtn), hud, range,
    h('div', { class: 'ga-bottom' }, status, reloadBtn));
  panel.__state = s;
  root.append(panel);
  document.body.classList.add('ga-open');

  // ---- the range's pictures (kept here, not in the rules) ------------------------------------------------------------
  const fx = { sparks: [], labels: [], decals: [] };
  const aim = { x: RANGE.w / 2, y: H * 0.55 };
  let started = false, raf = 0, last = 0, acc = 0, finished = false, finish, scale = 1;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;
  const size = () => {
    const bw = range.clientWidth, bh = range.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!bw || !bh) return scale;
    const cssW = Math.min(bw, bh * (RANGE.w / H)), cssH = cssW * (H / RANGE.w);
    box.style.width = `${Math.floor(cssW)}px`; box.style.height = `${Math.floor(cssH)}px`;
    const w = Math.round(cssW * dpr);
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round((w * H) / RANGE.w); }
    scale = canvas.width / RANGE.w;
    return scale;
  };
  /** Client pixels -> range units, and back (the browser tests aim with it). */
  const toRange = (cx, cy) => { const r = canvas.getBoundingClientRect(); return [((cx - r.left) / r.width) * RANGE.w, ((cy - r.top) / r.height) * H]; };
  panel.__aim = (x, y) => { const r = canvas.getBoundingClientRect(); return [r.left + (x / RANGE.w) * r.width, r.top + (y / H) * r.height]; };
  panel.__begin = () => startBtn.click();

  function burst(x, y, ring) {
    const n = reducedMotion() ? 0 : ring === 'bull' ? 18 : 10;
    const col = ring === 'bull' ? '#ffe08a' : ring === 'inner' ? ACCENT : '#cfe8f0';
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = 24 + Math.random() * 40; fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: 0.5, max: 0.5, col }); }
    fx.labels.push({ x, y: y - 8, text: ring === 'bull' ? 'BULLSEYE' : ring === 'inner' ? 'HIT' : 'edge', life: 0.9, max: 0.9, col });
  }

  function shot(cx, cy) {
    if (!started || s.done) return;
    const [x, y] = toRange(cx, cy);
    aim.x = x; aim.y = y;
    const r = shoot(s, x, y);
    if (!r.ok) {
      if (r.why === 'empty') { status.textContent = 'Click. Empty: reloading.'; sound('hurt'); }
      else if (r.why === 'reloading') status.textContent = 'Reloading. Wait for the bar to fill.';
      return;
    }
    if (r.target != null) {
      const tg = s.targets[r.target]; const at = targetAt(tg, s.t);
      burst(at.x, at.y, r.ring); sound('power');
      status.textContent = r.ring === 'bull' ? 'Bullseye!' : r.ring === 'inner' ? 'Hit.' : 'Hit, on the edge. Aim for the middle.';
    } else {
      fx.decals.push({ x: r.x, y: r.y, life: 1.6 });
      status.textContent = `Miss. The shot can land anywhere in the ring: spread is ${spreadWord(bloomOf(s))}.`;
    }
    if (s.ammo === 0 && s.reloading > 0) status.textContent += ' Magazine empty: reloading.';
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointermove', (e) => { const [x, y] = toRange(e.clientX, e.clientY); aim.x = x; aim.y = y; });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); shot(e.clientX, e.clientY); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const doReload = () => { if (!started || s.done) return; if (reload(s)) status.textContent = 'Reloading.'; };
  reloadBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doReload(); });
  const kd = (e) => { if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); doReload(); } else if (e.code === 'Escape') leave(); };
  addEventListener('keydown', kd);
  startBtn.addEventListener('click', () => {
    if (started) return; started = true; loadout.hidden = true; range.classList.add('is-live');
    status.textContent = 'Go. Click or tap the targets.';
  });
  if (!begin) startBtn.click();
  function close() { cancelAnimationFrame(raf); removeEventListener('keydown', kd); ro.disconnect(); panel.remove(); document.body.classList.remove('ga-open'); }
  function leave() { if (finished) return; finished = true; close(); finish(null); }
  leaveBtn.addEventListener('click', leave);

  // ---- drawing -----------------------------------------------------------------------------------------------------------
  const wallY = (lane) => lane.y * H + lane.r + 3.5;
  function drawBack(k) {
    const W = RANGE.w;
    const g = ctx.createLinearGradient(0, 0, 0, H * k);
    g.addColorStop(0, '#08111d'); g.addColorStop(0.55, '#0f1f30'); g.addColorStop(1, '#0a131e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // the back wall: panel seams and a lit strip along the top
    ctx.strokeStyle = 'rgba(129,230,223,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 16) { ctx.beginPath(); ctx.moveTo(x * k, 0); ctx.lineTo(x * k, H * 0.62 * k); ctx.stroke(); }
    for (let y = 8; y < H * 0.62; y += 16) { ctx.beginPath(); ctx.moveTo(0, y * k); ctx.lineTo(W * k, y * k); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,122,89,.45)'; ctx.fillRect(0, 2.2 * k, canvas.width, 0.9 * k);
    const glow = ctx.createLinearGradient(0, 3 * k, 0, 14 * k); glow.addColorStop(0, 'rgba(255,122,89,.18)'); glow.addColorStop(1, 'rgba(255,122,89,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 3 * k, canvas.width, 11 * k);
    // the floor, in perspective
    ctx.strokeStyle = 'rgba(129,230,223,.12)';
    const horizon = H * 0.72;
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo((W / 2 + i * 6) * k, horizon * k); ctx.lineTo((W / 2 + i * 26) * k, H * k); ctx.stroke(); }
    for (let f = 0.1; f <= 1; f += 0.22) { const y = horizon + (H - horizon) * f * f * 1.2; ctx.beginPath(); ctx.moveTo(0, y * k); ctx.lineTo(W * k, y * k); ctx.stroke(); }
  }
  /** A rail: a lit track with a groove, end brackets and tick marks, with the wall that hides a pop-up's slot. */
  function drawRail(lane, k) {
    const y = wallY(lane) * k, t = 4.2 * k;
    const g = ctx.createLinearGradient(0, y, 0, y + t); g.addColorStop(0, '#2a4258'); g.addColorStop(0.45, '#142636'); g.addColorStop(1, '#0a121c');
    ctx.fillStyle = g; ctx.fillRect(0, y, canvas.width, t);
    ctx.fillStyle = 'rgba(129,230,223,.75)'; ctx.fillRect(0, y, canvas.width, 0.55 * k);
    ctx.fillStyle = '#050a11'; ctx.fillRect(0, y + 1.7 * k, canvas.width, 0.9 * k); // the groove the carriages ride in
    ctx.fillStyle = 'rgba(129,230,223,.35)';
    for (let x = 4; x < RANGE.w; x += 8) ctx.fillRect(x * k, y + 3.4 * k, 0.4 * k, 0.8 * k);
    ctx.fillStyle = ACCENT; ctx.fillRect(0, y - 0.6 * k, 2.2 * k, 5 * k); ctx.fillRect(canvas.width - 2.2 * k, y - 0.6 * k, 2.2 * k, 5 * k);
  }
  function hexPath(r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
  /** A holo target plate: a glowing hex frame, a translucent plate and the scoring rings. */
  function drawTarget(tg, at, k) {
    const r = tg.r * k, x = at.x * k;
    const lane = LANES.find((l) => l.id === tg.lane);
    let y = at.y * k;
    ctx.save();
    if (tg.kind === 'popup') {
      ctx.beginPath(); ctx.rect(0, 0, canvas.width, wallY(lane) * k); ctx.clip();
      y += (1 - at.up) * (tg.r * 2 + 8) * k;
    }
    let sy = 1;
    if (tg.hit) sy = Math.max(0.02, tg.flip / FLIP_SECONDS);
    ctx.translate(x, y); ctx.scale(1, sy);
    // the carriage that rides the rail, and the stem up to the plate
    ctx.fillStyle = '#1d3347'; ctx.fillRect(-0.8 * k, 0, 1.6 * k, (tg.r + 4) * k);
    ctx.fillStyle = '#2a4258'; ctx.fillRect(-tg.r * 0.45 * k, (tg.r + 1.4) * k, tg.r * 0.9 * k, 2.4 * k);
    // the holo glow
    ctx.shadowColor = tg.hit ? 'rgba(120,130,140,.4)' : HOLO; ctx.shadowBlur = tg.hit ? 4 : 14 * (k / 4);
    hexPath(r * 1.08); ctx.fillStyle = tg.hit ? '#2b3640' : 'rgba(10,36,48,.92)'; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1.5, 0.7 * k); ctx.strokeStyle = tg.hit ? '#5d6c78' : HOLO; ctx.stroke();
    // corner ticks on the frame
    ctx.strokeStyle = tg.hit ? '#5d6c78' : '#d9fffb'; ctx.lineWidth = Math.max(1, 0.4 * k);
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08); ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); ctx.stroke(); }
    // the scoring rings, painted from the edge in
    ctx.lineWidth = Math.max(1, 0.45 * k); ctx.strokeStyle = '#08121c';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = tg.hit ? '#6b7b86' : '#e8f4f8'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, tg.innerR * k, 0, Math.PI * 2); ctx.fillStyle = tg.hit ? '#7e5a52' : ACCENT; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, tg.bullR * k, 0, Math.PI * 2); ctx.fillStyle = tg.hit ? '#8a8466' : '#ffe08a'; ctx.fill();
    ctx.restore();
  }
  /** The slot a pop-up rises out of: a dark mouth with a lit rim, drawn over the wall. */
  function drawSlot(tg, k) {
    const lane = LANES.find((l) => l.id === tg.lane), y = wallY(lane) * k, w = tg.r * 1.5 * k;
    ctx.fillStyle = '#02060b'; ctx.fillRect(tg.x0 * k - w / 2, y - 0.4 * k, w, 2.4 * k);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = Math.max(1, 0.5 * k); ctx.strokeRect(tg.x0 * k - w / 2, y - 0.4 * k, w, 2.4 * k);
  }
  function drawCrosshair(k) {
    const x = aim.x * k, y = aim.y * k, now = bloomOf(s), rest = s.setup.spread, top = bloomMax(s);
    const heat = Math.max(0, Math.min(1, (now - rest) / Math.max(0.01, top - rest)));
    const col = heat > 0.5 ? '#ffad72' : HOLO;
    ctx.save(); ctx.lineWidth = Math.max(1, 0.35 * k);
    ctx.strokeStyle = 'rgba(207,232,240,.3)'; ctx.setLineDash([1.6 * k, 1.6 * k]); ctx.beginPath(); ctx.arc(x, y, top * k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(207,232,240,.55)'; ctx.beginPath(); ctx.arc(x, y, rest * k, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6, 0.6 * k); ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x, y, now * k, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1.2, 0.4 * k); ctx.strokeStyle = '#fff'; const a = 2.6 * k, b = 1 * k;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(x + dx * b, y + dy * b); ctx.lineTo(x + dx * (b + a), y + dy * (b + a)); ctx.stroke(); }
    ctx.restore();
  }
  function paint(dt) {
    const k = size();
    drawBack(k);
    const order = s.targets.slice().sort((p, q) => p.y - q.y);
    for (const lane of LANES) {
      for (const tg of order) {
        if (tg.lane !== lane.id) continue;
        const at = targetAt(tg, s.t);
        if (tg.hit && tg.flip <= 0) continue;
        if (tg.kind === 'popup' && at.up <= 0.001 && !tg.hit) continue;
        drawTarget(tg, at, k);
      }
      drawRail(lane, k);
      for (const tg of s.targets) if (tg.lane === lane.id && tg.kind === 'popup') drawSlot(tg, k);
    }
    for (const d of fx.decals) { ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, d.life / 1.6) * 0.55})`; ctx.lineWidth = Math.max(1, 0.4 * k); ctx.beginPath(); ctx.moveTo((d.x - 1.2) * k, (d.y - 1.2) * k); ctx.lineTo((d.x + 1.2) * k, (d.y + 1.2) * k); ctx.moveTo((d.x + 1.2) * k, (d.y - 1.2) * k); ctx.lineTo((d.x - 1.2) * k, (d.y + 1.2) * k); ctx.stroke(); d.life -= dt; }
    for (const p of fx.sparks) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; ctx.fillRect(p.x * k - 1.5, p.y * k - 1.5, Math.max(3, 0.7 * k), Math.max(3, 0.7 * k)); p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(11, 3.2 * k)}px Consolas, monospace`;
    for (const l of fx.labels) { ctx.globalAlpha = Math.max(0, l.life / l.max); ctx.fillStyle = l.col; ctx.fillText(l.text, l.x * k, (l.y - (1 - l.life / l.max) * 8) * k); l.life -= dt; }
    ctx.globalAlpha = 1;
    fx.sparks = fx.sparks.filter((p) => p.life > 0); fx.labels = fx.labels.filter((l) => l.life > 0); fx.decals = fx.decals.filter((d) => d.life > 0);
    if (!s.done) drawCrosshair(k);
    if (s.reloading > 0) { ctx.fillStyle = 'rgba(8,16,26,.3)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#ffad72'; ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(13, 4 * k)}px Consolas, monospace`; ctx.fillText('RELOADING', canvas.width / 2, canvas.height * 0.5); }
  }
  function hudPaint() {
    const sc = scoreLines(s);
    const set = (el, text) => { if (el.textContent !== text) { el.textContent = text; if (!reducedMotion()) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } } };
    set(ticker.targets, String(s.hits)); set(ticker.bull, String(s.rings.bull));
    set(ticker.acc, s.shots ? `${Math.round(sc.accuracy * 100)}%` : '--');
    ticker.time.textContent = s.t.toFixed(1);
    clockFill.style.width = `${(100 * s.left) / s.total}%`; clockFill.parentElement.classList.toggle('is-low', s.left < 6);
    const mag = s.setup.magazine;
    if (pips.children.length !== mag) pips.replaceChildren(...Array.from({ length: mag }, () => h('i')));
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < s.ammo));
    pips.setAttribute('aria-label', `${s.ammo} of ${mag} rounds`);
    // the reload bar is empty until you reload, then fills over the reload time
    const frac = s.reloading > 0 ? 1 - s.reloading / s.setup.reloadSeconds : 0;
    reloadFill.style.width = `${Math.round(frac * 100)}%`; reloadWords.textContent = s.reloading > 0 ? 'Reloading' : 'Ready';
    reloadTrack.classList.toggle('is-going', s.reloading > 0);
    reloadBtn.disabled = s.done || s.ammo >= mag || s.reloading > 0;
    const word = spreadWord(bloomOf(s));
    if (sprayWords.textContent !== word) sprayWords.textContent = word;
    sprayDot.dataset.spread = word;
  }

  function frame(now) {
    if (finished) return;
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (started && !s.done) {
      acc = Math.min(0.1, acc + real);
      while (acc >= DT && !s.done) { stepGallery(s, DT); acc -= DT; }
    }
    paint(real); hudPaint();
    if (s.done && !panel.querySelector('.ga-result')) end();
  }
  function end() {
    const r = s.result;
    status.textContent = `${WORDS[r.how] || 'DONE'}: ${r.hits} of ${r.targets} targets.`;
    reloadBtn.disabled = true;
    const rows = r.lines.map((l) => h('li', { class: l.xp > 0 ? 'is-paid' : '', 'data-line': l.id }, h('b', { text: l.label }), h('span', { text: l.detail }), h('em', { text: `+${l.xp} XP` })));
    const payable = Math.min(r.xp, xpLeft);
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: 'Continue' });
    go.disabled = true; setTimeout(() => { go.disabled = false; }, 450); // a phone tap on the range must not click through to Continue
    const card = h('div', { class: `rp-result ui-card ga-result ${r.xp > 0 ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-how': r.how },
      h('b', { class: 'rp-stars', text: WORDS[r.how] || 'DONE' }),
      h('ul', { class: 'ga-lines' }, ...rows),
      h('p', { class: 'ga-total', text: r.xp > 0 ? `Total +${r.xp} Shooting XP${payable < r.xp ? `, but the hour's limit counts +${payable}` : ''}` : 'No XP this time. Hit more targets.' }),
      h('p', { class: 'ga-note', text: `${r.reloads} reload${r.reloads === 1 ? '' : 's'} · ${r.shots} shot${r.shots === 1 ? '' : 's'}. Training pays XP, never skill points.` }), go);
    go.addEventListener('click', () => { if (finished) return; finished = true; close(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true });
  }
  const ro = new ResizeObserver(() => size());
  ro.observe(range);
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}
