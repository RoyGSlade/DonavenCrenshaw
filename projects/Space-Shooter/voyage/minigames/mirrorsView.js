// Hacking v2 on screen (mirrors.js has the rules). A field with an emitter, mirrors in boxes, decoys that look the same, a
// firewall, and the dashed beam as it would go now. Click or tap a mirror's box to select it; hold it (or hold Turn left / Turn right,
// or the arrow keys) to rotate. Below the field: the portal catch (a marker sweeps a bar; press Catch while it is in the lit window) and
// Fire. Each firewall has its own clock; out of time resets the board on the same seed and spends a retry. DOM + inline SVG, no art files.
// Resolves with the rules' result: { success, how, firewalls, broken, retriesUsed, security, context, terminal | port | section, world, xp }.
import { clockWord, stageWord, retryWord } from './hudWords.js';
import { createMirrorHack, stepMirrors, holdMirror, releaseMirror, rotateStep, select, catchPortal, fire, preview, marker, projectileAt, mirrorEnds, FIELD, MIRROR, STEP_RAD, CONSEQUENCES } from './mirrors.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * root: where the panel goes. opts: { state (from createMirrorHack) or seed + setup + context, title, reducedMotion, sound }.
 * Returns a promise (with .state).
 */
export function playMirrors(root, { state = null, seed = 1, setup = null, context = 'foot', title = 'Terminal', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state || createMirrorHack({ seed, setup, context });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: 'Turn the mirrors until the dashed beam ends on the firewall. Catch the portal, then fire.' });
  const clockFill = h('i');
  const clock = h('div', { class: 'rp-clock mh-clock', role: 'progressbar', 'aria-label': 'Time on this firewall', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '100' }, clockFill);
  const stageText = h('span', { class: 'mh-stage', text: '' });
  const clockText = h('span', { class: 'rp-time', text: '' });
  const pips = h('span', { class: 'mh-pips', 'aria-label': 'Retries left' });

  // the field: drawn parts under, the mirror boxes (real buttons) over
  const beam = svg('polyline', { class: 'mh-beam', points: '' });
  const beamEnd = svg('circle', { class: 'mh-beam-end', r: 2.2, cx: 0, cy: 0 });
  const shot = svg('circle', { class: 'mh-shot', r: 2.6, cx: 0, cy: 0 });
  const grid = svg('g', { class: 'mh-grid' });
  for (let x = 20; x < FIELD.w; x += 20) grid.append(svg('line', { x1: x, y1: 0, x2: x, y2: FIELD.h }));
  for (let y = 20; y < FIELD.h; y += 20) grid.append(svg('line', { x1: 0, y1: y, x2: FIELD.w, y2: y }));
  const portalRing = svg('circle', { class: 'mh-portal', r: 8 });
  const emitterDot = svg('circle', { class: 'mh-emitter', r: 3.2 });
  const emitterArrow = svg('path', { class: 'mh-emitter-arrow', d: 'M0 0 L9 0 M6 -3 L9 0 L6 3' });
  const wall = svg('g', { class: 'mh-firewall' });
  const field = svg('svg', { class: 'mh-svg', viewBox: `0 0 ${FIELD.w} ${FIELD.h}`, 'aria-hidden': 'true', focusable: 'false' }, grid, portalRing, emitterDot, emitterArrow, wall, beam, beamEnd, shot);
  const fieldBox = h('div', { class: 'mh-field', style: `--aspect:${FIELD.w} / ${FIELD.h}` }, field);
  let buttons = [];

  // the catch
  const win = h('i', { class: 'mh-win' });
  const mark = h('b', { class: 'mh-mark' });
  const catchTrack = h('div', { class: 'mh-track', 'aria-hidden': 'true' }, win, mark);
  const catchBtn = h('button', { type: 'button', class: 'mh-catch ui-btn', text: 'Catch the portal' });
  const fireBtn = h('button', { type: 'button', class: 'mh-fire primary ui-btn', text: 'Fire', disabled: 'true' });
  const leftBtn = h('button', { type: 'button', class: 'mh-turn ui-btn', 'aria-label': 'Turn the selected mirror left, hold', text: '⟲ Turn' });
  const rightBtn = h('button', { type: 'button', class: 'mh-turn ui-btn', 'aria-label': 'Turn the selected mirror right, hold', text: 'Turn ⟳' });
  const portalState = h('span', { class: 'mh-portal-state', text: 'Portal closed' });
  const panel = h('section', { class: 'rp-panel mh-panel mg-skin ui-panel', role: 'group', 'aria-label': `Hack: ${title}`, 'data-context': s.context },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `HACK · ${title.toUpperCase()} · ${(s.setup.label || 'Steady').toUpperCase()}` }),
    h('div', { class: 'rp-hud' }, stageText, clockText), clock, fieldBox,
    h('div', { class: 'mh-catchrow' }, h('div', { class: 'mh-catchhead' }, portalState, pips), catchTrack),
    h('div', { class: 'mh-actions' }, leftBtn, rightBtn, catchBtn, fireBtn), status,
    h('p', { class: 'rp-help', text: 'Click a mirror, then hold it (or hold Turn, or the arrow keys) to rotate. Space catches the portal when the marker is in the lit window. F fires. The beam bounces off every mirror, decoys too. Out of time resets the board and costs a retry.' }));
  panel.__state = s;
  root.append(panel);
  let raf = 0, last = 0, finish, holding = null, holdTimer = 0, builtStage = -1, builtBoard = '';
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function build() {
    builtStage = s.stage; builtBoard = JSON.stringify(s.layout.start);
    const l = s.layout;
    buttons.forEach((b) => b.remove()); buttons = [];
    wall.replaceChildren();
    const { x, y, r } = l.target;
    wall.append(svg('circle', { class: 'mh-fw-core', cx: x, cy: y, r }), svg('circle', { class: 'mh-fw-ring', cx: x, cy: y, r: r + 3 }));
    for (let k = -1; k <= 1; k++) wall.append(svg('line', { class: 'mh-fw-bar', x1: x - r * 0.9, y1: y + k * r * 0.5, x2: x + r * 0.9, y2: y + k * r * 0.5 }));
    emitterDot.setAttribute('cx', l.emitter.x); emitterDot.setAttribute('cy', l.emitter.y);
    portalRing.setAttribute('cx', l.emitter.x); portalRing.setAttribute('cy', l.emitter.y);
    emitterArrow.setAttribute('transform', `translate(${l.emitter.x} ${l.emitter.y}) rotate(${(l.emitter.dir * 180) / Math.PI})`);
    l.mirrors.forEach((m, i) => {
      const hint = `Mirror ${i + 1}`;
      const line = svg('line', { class: 'mh-mline', x1: 10 - MIRROR.half, y1: 10, x2: 10 + MIRROR.half, y2: 10 });
      const box = svg('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' }, svg('rect', { class: 'mh-mbox', x: 1, y: 1, width: 18, height: 18, rx: 2 }), line, svg('circle', { class: 'mh-mpin', cx: 10, cy: 10, r: 1.6 }));
      const b = h('button', { type: 'button', class: 'mh-mirror', 'data-i': i, 'aria-label': hint, style: `left:${((m.x - MIRROR.box / 2) / FIELD.w) * 100}%;top:${((m.y - MIRROR.box / 2) / FIELD.h) * 100}%;width:${(MIRROR.box / FIELD.w) * 100}%;height:${(MIRROR.box / FIELD.h) * 100}%` }, box);
      b.__line = line;
      b.addEventListener('pointerdown', (e) => { if (s.done) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} pick(i); startHold(i, 1, 170); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, stopHold);
      b.addEventListener('keydown', (e) => keyOn(e, i));
      fieldBox.append(b); buttons.push(b);
    });
    win.style.left = `${(s.portal.centre - s.portal.width / 2) * 100}%`; win.style.width = `${s.portal.width * 100}%`;
  }
  function pick(i) { if (select(s, i)) { sound('power'); } paint(); }
  function startHold(i, dir, delay = 0) {
    stopHold();
    holdTimer = setTimeout(() => { holding = { id: i, dir }; }, delay);
  }
  function stopHold() { clearTimeout(holdTimer); holding = null; releaseMirror(s); }
  function keyOn(e, i) {
    if (s.done) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); select(s, i); rotateStep(s, i, -1); sound('power'); paint(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); select(s, i); rotateStep(s, i, 1); sound('power'); paint(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); }
  }
  const holdBtn = (btn, dir) => {
    btn.addEventListener('pointerdown', (e) => { if (s.done || s.selected == null) return; e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch {} rotateStep(s, s.selected, dir); startHold(s.selected, dir, 220); paint(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stopHold);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (s.selected != null) rotateStep(s, s.selected, dir); paint(); } });
  };
  holdBtn(leftBtn, -1); holdBtn(rightBtn, 1);

  function doCatch() {
    if (s.done) return;
    const r = catchPortal(s);
    if (r === 'open') { sound('power'); status.textContent = 'Portal open. Fire when the beam is on the firewall.'; }
    else if (r === 'miss') { sound('hurt'); status.textContent = 'Missed the window. The portal flickers: wait for the next sweep.'; }
    paint();
  }
  function doFire() {
    if (s.done) return;
    const t = fire(s);
    if (!t) { sound('hurt'); return; }
    sound('power'); status.textContent = t.hit ? 'Shot away. Following the mirrors.' : 'Shot away, but the beam is not on the firewall.';
    paint();
  }
  catchBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doCatch(); });
  catchBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) doCatch(); } });
  fireBtn.addEventListener('click', doFire);
  const kd = (e) => {
    if (s.done || !panel.isConnected) return;
    if (e.code === 'Space' && document.activeElement?.classList?.contains('mh-mirror') === false && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); if (!e.repeat) doCatch(); }
    else if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); doFire(); }
    else if (e.code === 'KeyC' && !e.repeat) { e.preventDefault(); doCatch(); }
  };
  addEventListener('keydown', kd);

  function paint() {
    if (builtStage !== s.stage || builtBoard !== JSON.stringify(s.layout.start)) build();
    const tr = preview(s);
    beam.setAttribute('points', pts(tr.pts));
    beam.classList.toggle('is-hit', tr.hit);
    const end = tr.pts[tr.pts.length - 1];
    beamEnd.setAttribute('cx', end[0]); beamEnd.setAttribute('cy', end[1]); beamEnd.classList.toggle('is-hit', tr.hit);
    const p = projectileAt(s);
    shot.style.display = p ? '' : 'none'; if (p) { shot.setAttribute('cx', p[0]); shot.setAttribute('cy', p[1]); }
    buttons.forEach((b, i) => {
      b.__line.setAttribute('transform', `rotate(${((s.angles[i] * STEP_RAD) * 180) / Math.PI} 10 10)`);
      b.classList.toggle('is-selected', s.selected === i);
      b.setAttribute('aria-pressed', s.selected === i ? 'true' : 'false');
      b.disabled = s.done;
    });
    const left = Math.max(0, s.left);
    clockFill.style.width = `${(100 * left) / s.total}%`;
    clock.classList.toggle('is-low', left < 6);
    clock.setAttribute('aria-valuenow', String(Math.round((100 * left) / s.total)));
    clockText.textContent = clockWord(left, s.total);
    stageText.textContent = stageWord(s.stage, s.stages);
    pips.replaceChildren(...Array.from({ length: s.setup.retries }, (_, i) => h('span', { class: i < s.retriesLeft ? 'on' : '' })), h('em', { text: ` ${retryWord(s.retriesLeft, s.setup.retries)}` }));
    mark.style.left = `${100 * marker(s)}%`;
    const open = s.portal.open;
    panel.classList.toggle('portal-open', open); panel.classList.toggle('portal-cool', s.portal.cooldown > 0);
    portalRing.classList.toggle('is-open', open);
    portalState.textContent = open ? 'PORTAL OPEN' : s.portal.cooldown > 0 ? 'Portal flickered' : 'Portal closed';
    fireBtn.disabled = s.done || !open || !!s.projectile; catchBtn.disabled = s.done || open || !!s.projectile || s.portal.cooldown > 0;
    leftBtn.disabled = rightBtn.disabled = s.done || !!s.projectile;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (holding) { if (holdMirror(s, holding.id, holding.dir, dt)) sound('power'); }
    stepMirrors(s, dt);
    for (const ev of s.events) {
      if (ev.type === 'stage-clear') { sound('power'); status.textContent = `Firewall ${ev.stage + 1} broken.`; }
      else if (ev.type === 'reset') { sound('hurt'); status.textContent = `Out of time. The mirrors and the portal reset. ${ev.retriesLeft} ${ev.retriesLeft === 1 ? 'retry' : 'retries'} left.`; panel.classList.add('is-reset'); setTimeout(() => panel.classList.remove('is-reset'), 500); }
      else if (ev.type === 'fizzle') { sound('hurt'); status.textContent = 'The shot missed the firewall. The portal is spent: catch it again.'; }
    }
    paint();
    if (s.done) end();
  }
  function end() {
    cancelAnimationFrame(raf); stopHold(); removeEventListener('keydown', kd);
    paint();
    const r = s.result;
    const c = CONSEQUENCES[s.context];
    status.textContent = r.success ? 'Every firewall is down. You are in.' : c.line;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status' },
      h('b', { class: 'rp-stars', text: r.success ? 'IN' : 'LOCKED OUT' }),
      h('span', { text: r.success ? `${r.firewalls} firewall${r.firewalls === 1 ? '' : 's'} down · ${r.retriesUsed} ${r.retriesUsed === 1 ? 'retry' : 'retries'} used · ${r.time} s · +${r.xp} Hacking XP` : `${r.broken} of ${r.firewalls} firewalls broken. ${c.line}` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  build(); paint();
  if (reducedMotion()) panel.classList.add('is-still');
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}
