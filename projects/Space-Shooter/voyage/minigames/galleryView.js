// The shooting gallery on screen: a holodeck range drawn on a canvas (160 x 100 range units), with the reload, the magazine and the
// crosshair bloom drawn where you can see them, so each of shooting's three paths visibly changes the range. Click or tap to shoot,
// R (or the Reload button) to reload. Fixed 60 Hz steps. DOM and canvas only. Resolves with the rules' result when the player
// presses Continue on the results card. The pure rules are gallery.js; the entry fee and the hour's cap belong to the caller.
import { stepGallery, shoot, reload, bloomOf, bloomMax, targetAt, hittable, canShoot, RANGE, LANES, FLIP_SECONDS, POP, scoreLines } from './gallery.js';
import { SHOOTING_BASE, shootingLesson } from './setup.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const DT = 1 / 60;
const ACCENT = '#ff7a59'; // shooting's colour in the skills kit
const WORDS = { cleared: 'RANGE CLEARED', time: 'TIME UP' };
const TICK_ORDER = ['targets', 'bullseye', 'accuracy', 'time'];

export function playGallery(root, { state, xpLeft = Infinity, sound = () => {}, reducedMotion = () => false, begin = true } = {}) {
  const s = state, lesson = shootingLesson(s.lesson);
  const canvas = h('canvas', { class: 'ga-canvas', width: 640, height: 400, role: 'img', 'aria-label': 'The shooting range: targets sliding left and right' });
  const ctx = canvas.getContext('2d');
  const ticker = { targets: h('b', { text: '0' }), bull: h('b', { text: '0' }), acc: h('b', { text: '--' }), time: h('b', { text: '0.0' }) };
  const stat = (label, el, extra) => h('p', { class: 'ga-stat' }, h('span', { text: label }), el, extra);
  const clockFill = h('u'), pips = h('div', { class: 'ga-pips', role: 'img' });
  const reloadFill = h('u'), reloadWords = h('b', { text: '' });
  const reloadTrack = h('i', { class: 'ga-reload-track', style: `width:${Math.round((100 * s.setup.reloadSeconds) / SHOOTING_BASE.reload)}%` }, reloadFill);
  const sprayRing = h('span', { class: 'ga-spray-dot' });
  const hud = h('div', { class: 'ga-hud' },
    h('div', { class: 'ga-ticker' }, stat('Targets', ticker.targets, h('small', { text: ` of ${s.targets.length}` })), stat('Bullseyes', ticker.bull), stat('Accuracy', ticker.acc), stat('Time', ticker.time, h('small', { text: ` s · par ${lesson.par}` }))),
    h('div', { class: 'ga-clock', role: 'img', 'aria-label': 'Time left' }, clockFill),
    h('div', { class: 'ga-rig' },
      h('div', { class: 'ga-mag' }, h('span', { text: 'Magazine' }), pips),
      h('div', { class: 'ga-reload' }, h('span', { text: 'Reload' }), reloadTrack, reloadWords),
      h('div', { class: 'ga-spray' }, h('span', { text: 'Spread' }), sprayRing, h('b', { text: `${s.setup.spread}` }))));
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `Lesson ${lesson.id}, ${lesson.name}: hit all ${s.targets.length} targets in ${lesson.time} seconds.` });
  const startBtn = h('button', { type: 'button', class: 'primary ui-btn ga-begin', text: 'Begin the round' });
  const loadout = h('div', { class: 'ga-intro' },
    h('p', { class: 'ga-intro-title', text: `Range ${lesson.id}: ${lesson.name}` }),
    h('p', { text: `${s.targets.length} targets, ${lesson.time} s, par ${lesson.par} s. Click or tap to shoot, R to reload.` }),
    h('p', { class: 'ga-intro-kit', text: `Your kit: ${s.setup.magazine} rounds, ${s.setup.reloadSeconds} s reload, bloom ${s.setup.spread} at rest (+${s.setup.kick} a shot).` }), startBtn);
  const range = h('div', { class: 'ga-range' }, canvas, loadout);
  const reloadBtn = h('button', { type: 'button', class: 'ui-btn ga-reload-btn', 'aria-label': 'Reload', text: 'Reload (R)' });
  const panel = h('section', { class: 'rp-panel ga-panel mg-skin ui-panel', role: 'group', 'aria-label': 'Shooting gallery', style: `--sk:${ACCENT}` },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `SHOOTING GALLERY · ${lesson.name.toUpperCase()}` }), hud, range, status, h('div', { class: 'ga-row' }, reloadBtn),
    h('p', { class: 'rp-help', text: 'Targets slide on rails or pop up. The ring is where a shot may land: it kicks wider with every shot and settles. Bullseyes pay most.' }));
  panel.__state = s;
  root.append(panel);

  // ---- the range's pictures (kept here, not in the rules) ------------------------------------------------------------
  const fx = { sparks: [], labels: [], decals: [], pulse: 0 };
  const aim = { x: RANGE.w / 2, y: RANGE.h * 0.55, seen: false };
  let started = false, raf = 0, last = 0, acc = 0, finished = false, finish, shown = null;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;
  const size = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(160, Math.round(r.width * dpr)), hh = Math.round((w * RANGE.h) / RANGE.w);
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    return canvas.width / RANGE.w;
  };
  /** Client pixels -> range units, and back (the browser tests aim with it). */
  const toRange = (cx, cy) => { const r = canvas.getBoundingClientRect(); return [((cx - r.left) / r.width) * RANGE.w, ((cy - r.top) / r.height) * RANGE.h]; };
  panel.__aim = (x, y) => { const r = canvas.getBoundingClientRect(); return [r.left + (x / RANGE.w) * r.width, r.top + (y / RANGE.h) * r.height]; };
  panel.__begin = () => startBtn.click();

  function burst(x, y, ring) {
    const n = reducedMotion() ? 0 : ring === 'bull' ? 16 : 9;
    const col = ring === 'bull' ? '#ffe08a' : ring === 'inner' ? ACCENT : '#cfe8f0';
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = 24 + Math.random() * 40; fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: 0.45, max: 0.45, col }); }
    fx.labels.push({ x, y: y - 6, text: ring === 'bull' ? 'BULLSEYE' : ring === 'inner' ? 'HIT' : 'edge', life: 0.9, max: 0.9, col });
  }

  function shot(cx, cy) {
    if (!started || s.done) return;
    const [x, y] = toRange(cx, cy);
    aim.x = x; aim.y = y; aim.seen = true;
    const r = shoot(s, x, y);
    if (!r.ok) {
      if (r.why === 'empty') { status.textContent = 'Click. Empty: reloading.'; sound('hurt'); }
      else if (r.why === 'reloading') status.textContent = 'Reloading. Wait for the bar.';
      return;
    }
    fx.pulse = 1;
    if (r.target != null) {
      const tg = s.targets[r.target]; const at = targetAt(tg, s.t);
      burst(at.x, at.y, r.ring); sound('power');
      status.textContent = r.ring === 'bull' ? 'Bullseye!' : r.ring === 'inner' ? 'Hit.' : 'Hit, on the edge. Aim for the middle.';
    } else {
      fx.decals.push({ x: r.x, y: r.y, life: 1.6 });
      status.textContent = `Miss. The shot can land anywhere in the ring (${bloomOf(s).toFixed(1)}).`;
    }
    if (s.ammo === 0 && s.reloading > 0) status.textContent += ' Magazine empty: reloading.';
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointermove', (e) => { const [x, y] = toRange(e.clientX, e.clientY); aim.x = x; aim.y = y; aim.seen = true; });
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); shot(e.clientX, e.clientY); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const doReload = () => { if (!started || s.done) return; if (reload(s)) { status.textContent = `Reloading: ${s.setup.reloadSeconds} s.`; } };
  reloadBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doReload(); });
  const kd = (e) => { if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); doReload(); } };
  addEventListener('keydown', kd);
  startBtn.addEventListener('click', () => {
    if (started) return; started = true; loadout.hidden = true; range.classList.add('is-live');
    status.textContent = 'Go. Click or tap the targets.';
  });
  if (!begin) startBtn.click();

  // ---- drawing -----------------------------------------------------------------------------------------------------------
  const wallY = (lane) => lane.y + lane.r + 3.5;
  function drawBack(k) {
    const g = ctx.createLinearGradient(0, 0, 0, RANGE.h * k);
    g.addColorStop(0, '#0a1422'); g.addColorStop(0.6, '#10202f'); g.addColorStop(1, '#0b1520');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // the back wall's panel grid and a lit strip
    ctx.strokeStyle = 'rgba(129,230,223,.07)'; ctx.lineWidth = 1;
    for (let x = 0; x <= RANGE.w; x += 16) { ctx.beginPath(); ctx.moveTo(x * k, 0); ctx.lineTo(x * k, 16 * k); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,122,89,.35)'; ctx.fillRect(0, 2.2 * k, canvas.width, 0.8 * k);
    ctx.fillStyle = 'rgba(255,122,89,.12)'; ctx.fillRect(0, 3 * k, canvas.width, 4 * k);
    // the floor, in perspective
    ctx.strokeStyle = 'rgba(129,230,223,.10)';
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo((RANGE.w / 2 + i * 6) * k, 70 * k); ctx.lineTo((RANGE.w / 2 + i * 22) * k, RANGE.h * k); ctx.stroke(); }
    for (const y of [78, 86, 94]) { ctx.beginPath(); ctx.moveTo(0, y * k); ctx.lineTo(canvas.width, y * k); ctx.stroke(); }
  }
  function drawRail(lane, k) {
    const y = wallY(lane) * k;
    ctx.fillStyle = '#16293a'; ctx.fillRect(0, y, canvas.width, 2.6 * k);
    ctx.fillStyle = 'rgba(129,230,223,.55)'; ctx.fillRect(0, y, canvas.width, 0.5 * k);
    ctx.fillStyle = '#0a121c'; ctx.fillRect(0, y + 2.6 * k, canvas.width, 1.4 * k);
  }
  function drawTarget(tg, at, k) {
    const r = tg.r * k, x = at.x * k;
    const lane = LANES.find((l) => l.id === tg.lane);
    let y = at.y * k;
    ctx.save();
    if (tg.kind === 'popup') {
      ctx.beginPath(); ctx.rect(0, 0, canvas.width, wallY(lane) * k); ctx.clip();
      y += (1 - at.up) * (tg.r * 2 + 6) * k;
    }
    let sy = 1;
    if (tg.hit) { const p = tg.flip / FLIP_SECONDS; sy = Math.max(0.02, p); }
    ctx.translate(x, y); ctx.scale(1, sy);
    // a stand
    ctx.fillStyle = '#25394b'; ctx.fillRect(-0.5 * k, 0, 1 * k, (tg.r + 4) * k);
    // the rings, painted from the edge in
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = tg.hit ? '#6b7b86' : '#e8f0f4'; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.5 * k); ctx.strokeStyle = '#0b1520'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, tg.innerR * k, 0, Math.PI * 2); ctx.fillStyle = tg.hit ? '#7e5a52' : ACCENT; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, tg.bullR * k, 0, Math.PI * 2); ctx.fillStyle = tg.hit ? '#8a8466' : '#ffe08a'; ctx.fill();
    ctx.restore();
  }
  function drawCrosshair(k) {
    const x = aim.x * k, y = aim.y * k, now = bloomOf(s), rest = s.setup.spread, top = bloomMax(s);
    const heat = Math.max(0, Math.min(1, (now - rest) / Math.max(0.01, top - rest)));
    const col = heat > 0.5 ? '#ffad72' : '#81e6df';
    ctx.save(); ctx.lineWidth = Math.max(1, 0.45 * k);
    ctx.strokeStyle = 'rgba(207,232,240,.35)'; ctx.setLineDash([2 * k, 2 * k]); ctx.beginPath(); ctx.arc(x, y, top * k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(207,232,240,.6)'; ctx.beginPath(); ctx.arc(x, y, rest * k, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.4, 0.7 * k); ctx.beginPath(); ctx.arc(x, y, now * k, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.5 * k); ctx.strokeStyle = '#fff'; const a = 3 * k, b = 1.2 * k;
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
    }
    // decals, sparks and labels
    for (const d of fx.decals) { ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, d.life / 1.6) * 0.5})`; ctx.lineWidth = Math.max(1, 0.4 * k); ctx.beginPath(); ctx.moveTo((d.x - 1) * k, (d.y - 1) * k); ctx.lineTo((d.x + 1) * k, (d.y + 1) * k); ctx.moveTo((d.x + 1) * k, (d.y - 1) * k); ctx.lineTo((d.x - 1) * k, (d.y + 1) * k); ctx.stroke(); d.life -= dt; }
    for (const p of fx.sparks) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; ctx.fillRect(p.x * k - 1, p.y * k - 1, 2.4, 2.4); p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(9, 3.4 * k)}px Consolas, monospace`;
    for (const l of fx.labels) { ctx.globalAlpha = Math.max(0, l.life / l.max); ctx.fillStyle = l.col; ctx.fillText(l.text, l.x * k, (l.y - (1 - l.life / l.max) * 8) * k); l.life -= dt; }
    ctx.globalAlpha = 1;
    fx.sparks = fx.sparks.filter((p) => p.life > 0); fx.labels = fx.labels.filter((l) => l.life > 0); fx.decals = fx.decals.filter((d) => d.life > 0);
    if (started && !s.done) drawCrosshair(k);
    else if (!started) drawCrosshair(k);
    if (s.reloading > 0) { ctx.fillStyle = 'rgba(8,16,26,.35)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#ffad72'; ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(11, 5 * k)}px Consolas, monospace`; ctx.fillText('RELOADING', canvas.width / 2, canvas.height * 0.5); }
  }
  function hudPaint() {
    const sc = scoreLines(s);
    const set = (el, text) => { if (el.textContent !== text) { el.textContent = text; if (!reducedMotion()) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } } };
    set(ticker.targets, String(s.hits)); set(ticker.bull, String(s.rings.bull));
    set(ticker.acc, s.shots ? `${Math.round(sc.accuracy * 100)}%` : '--');
    ticker.time.textContent = s.t.toFixed(1);
    clockFill.style.width = `${(100 * s.left) / s.total}%`; clockFill.parentElement.classList.toggle('is-low', s.left < 6);
    const mag = s.setup.magazine;
    if (pips.children.length !== mag) { pips.replaceChildren(...Array.from({ length: mag }, () => h('i'))); }
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < s.ammo));
    pips.setAttribute('aria-label', `${s.ammo} of ${mag} rounds`);
    const frac = s.reloading > 0 ? 1 - s.reloading / s.setup.reloadSeconds : 0;
    reloadFill.style.width = `${Math.round(frac * 100)}%`; reloadWords.textContent = s.reloading > 0 ? `${s.reloading.toFixed(1)} s` : `${s.setup.reloadSeconds} s`;
    reloadBtn.disabled = s.done || s.ammo >= mag || s.reloading > 0;
    // the spray dot is the current bloom against the largest the kit can reach
    const top = bloomMax(s) || 1;
    sprayRing.style.setProperty('--b', String(Math.max(0.2, bloomOf(s) / (SHOOTING_BASE.spread + SHOOTING_BASE.kick * SHOOTING_BASE.heatMax))));
    sprayRing.style.setProperty('--rest', String(Math.max(0.1, s.setup.spread / (SHOOTING_BASE.spread + SHOOTING_BASE.kick * SHOOTING_BASE.heatMax))));
    sprayRing.title = `Bloom ${bloomOf(s).toFixed(1)} of at most ${top.toFixed(1)}`;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (started && !s.done) {
      acc = Math.min(0.1, acc + real);
      while (acc >= DT && !s.done) { stepGallery(s, DT); acc -= DT; }
    }
    paint(real); hudPaint();
    if (s.done && !finished) end();
  }
  function end() {
    finished = true;
    removeEventListener('keydown', kd);
    reloadBtn.disabled = true;
    const r = s.result;
    status.textContent = `${WORDS[r.how] || 'DONE'}: ${r.hits} of ${r.targets} targets.`;
    const rows = r.lines.map((l) => h('li', { class: l.xp > 0 ? 'is-paid' : '', 'data-line': l.id }, h('b', { text: l.label }), h('span', { text: l.detail }), h('em', { text: `+${l.xp} XP` })));
    const payable = Math.min(r.xp, xpLeft);
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: 'Continue' });
    go.disabled = true; setTimeout(() => { go.disabled = false; }, 450); // a phone tap on the range must not click through to Continue
    const card = h('div', { class: `rp-result ui-card ga-result ${r.xp > 0 ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-how': r.how },
      h('b', { class: 'rp-stars', text: WORDS[r.how] || 'DONE' }),
      h('ul', { class: 'ga-lines' }, ...rows),
      h('p', { class: 'ga-total', text: r.xp > 0 ? `Total +${r.xp} Shooting XP${payable < r.xp ? `, but the hour's limit counts +${payable}` : ''}` : 'No XP this time. Hit more targets.' }),
      h('p', { class: 'ga-note', text: `${r.reloads} reload${r.reloads === 1 ? '' : 's'} · ${r.shots} shot${r.shots === 1 ? '' : 's'}. Training pays XP, never skill points.` }), go);
    go.addEventListener('click', () => { cancelAnimationFrame(raf); panel.remove(); finish(r); });
    panel.append(card); card.scrollIntoView({ block: 'nearest' });
  }
  new ResizeObserver(() => size()).observe(canvas);
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}
