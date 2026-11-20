// The holodeck power lever on screen (opening track C, scene 1): a big lever in a slot. Press it and pull it DOWN, keep holding:
// the power goes off, the jungle on the little screen flickers out, and the hum meter runs down. Let go once the hum is dead.
// Let go too soon and the power comes back into a live projector (a surge). Keyboard: hold Space or the Down arrow.
// Pointer: drag the lever handle. Resolves with the rules' result ({ success, how: 'reset' | 'fried' }).
import { createLever, leverGrab, leverMove, leverRelease, leverTick, DOWN_AT, HUM_OK, STRIKES } from './lever.js';
import { h, loop, ensureStyle } from './craftChainView.js';
import { ensureHandsOnStyle } from './handsOnKit.js';

export const LEVER_WORDS = Object.freeze({
  start: 'Pull the lever down and hold it. Wait for the hum to die. Then let go.',
  off: 'Power off. Keep holding. Listen for the hum.',
  dead: 'The hum is dead. Let go.',
  surge: 'Too soon: a surge went through the projector. Again, and hold longer.',
  pass: 'Reset. The jungle is coming back.',
  fried: 'The surge went through the projector.',
});

/** opts: { state, words, sound, reducedMotion, onEvent }. Resolves with the result. */
export function playLeverGame(root, { state, words = LEVER_WORDS, sound = () => {}, reducedMotion = () => false, onEvent = () => {} } = {}) {
  ensureStyle(); ensureHandsOnStyle();
  const s = state || createLever();
  const handle = h('div', { class: 'ho-handle', 'aria-hidden': 'true' }, h('b', { class: 'ho-grip' }, h('i'), h('i'), h('i')));
  const shaft = h('div', { class: 'ho-shaft', 'aria-hidden': 'true' });
  const sparks = h('div', { class: 'ho-sparks', 'aria-hidden': 'true' });
  const slot = h('div', { class: 'ho-slot', role: 'slider', tabindex: '0', 'aria-label': 'Power lever. Drag it down and hold, or hold Space.', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-orientation': 'vertical' },
    h('span', { class: 'ho-tag ho-tag-on', text: 'ON' }), h('span', { class: 'ho-tag ho-tag-off', text: 'OFF' }), h('div', { class: 'ho-rail', 'aria-hidden': 'true' }), h('div', { class: 'ho-ticks', 'aria-hidden': 'true' }, ...Array.from({ length: 9 }, () => h('i'))), shaft, handle, sparks);
  const humFill = h('i');
  const hum = h('div', { class: 'cc-meter ho-hum', role: 'progressbar', 'aria-label': 'Hum', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, humFill, h('b', { class: 'ho-mark', style: `left:${HUM_OK * 100}%` }));
  const screen = h('div', { class: 'ho-screen', 'aria-hidden': 'true' }, h('div', { class: 'ho-jungle' }, h('i'), h('i'), h('i'), h('i'), h('i')), h('p', { class: 'ho-screentext', text: 'JUNGLE WELLNESS' }));
  const powerEl = h('em', { class: 'ho-power', text: 'POWER ON' });
  const strikesEl = h('span', { class: 'ho-pips ho-strikes', 'aria-label': 'Warnings used' }, ...Array.from({ length: STRIKES - 1 }, () => h('i')));
  const status = h('p', { class: 'rp-status cc-status', role: 'status', 'aria-live': 'polite', text: words.start });
  const panel = h('section', { class: 'rp-panel cc-panel ho-panel ho-lever mg-skin ui-panel', role: 'group', 'aria-label': 'Holodeck power', 'data-game': 'lever' },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: 'POWER · HOLODECK RESET' }),
    h('div', { class: 'cc-hud ho-hud' }, h('div', { class: 'cc-stat' }, h('span', { text: 'Power' }), powerEl), h('div', { class: 'cc-stat cc-depthstat' }, h('span', { text: 'Hum' }), hum), h('div', { class: 'cc-stat' }, h('span', { text: 'Warning' }), strikesEl)),
    h('div', { class: 'ho-rig' }, screen, slot), status,
    h('p', { class: 'rp-help', text: 'Press the lever and pull it all the way down, then keep holding. The hum on the meter runs down while power is off. When it is dead, let go. Let go early and the power surges through the projector. A second surge fries it. Keyboard: hold Space.' }));
  panel.__state = s;
  root.append(panel);
  let finish; const promise = new Promise((res) => { finish = res; }); promise.state = s;

  const posFrom = (e) => { const r = slot.getBoundingClientRect(); return (e.clientY - r.top - 24) / Math.max(1, r.height - 48); };
  slot.addEventListener('pointerdown', (e) => { if (s.done) return; e.preventDefault(); slot.setPointerCapture?.(e.pointerId); leverGrab(s); leverMove(s, posFrom(e)); });
  slot.addEventListener('pointermove', (e) => { if (s.done || !s.grabbed) return; e.preventDefault(); leverMove(s, posFrom(e)); });
  const up = (e) => { if (s.grabbed) { slot.releasePointerCapture?.(e.pointerId); leverRelease(s); } };
  slot.addEventListener('pointerup', up); slot.addEventListener('pointercancel', up);
  slot.addEventListener('contextmenu', (e) => e.preventDefault());
  let keyHeld = false, target = 0;
  const pullKeys = new Set([' ', 'ArrowDown', 'Enter']);
  slot.addEventListener('keydown', (e) => { if (!pullKeys.has(e.key) || e.repeat || s.done) return; e.preventDefault(); keyHeld = true; leverGrab(s); target = 1; });
  slot.addEventListener('keyup', (e) => { if (!pullKeys.has(e.key) || !keyHeld) return; e.preventDefault(); keyHeld = false; leverRelease(s); });

  let ended = false, endAt = 0, flash = 0;
  /** Sparks off the lever when the power comes back into a live projector. */
  function spark(n) {
    if (reducedMotion()) return;
    const y = slot.clientHeight - 60;
    for (let i = 0; i < n; i++) {
      const p = h('u', { class: 'ho-spark' });
      p.style.setProperty('--dx', `${((Math.random() - 0.5) * 220).toFixed(0)}px`); p.style.setProperty('--dy', `${(-30 - Math.random() * 150).toFixed(0)}px`);
      p.style.left = '50%'; p.style.top = `${y}px`;
      sparks.append(p); setTimeout(() => p.remove(), 700);
    }
  }
  const stop = loop((dt) => {
    if (keyHeld && s.grabbed) leverMove(s, Math.min(1, s.pos + dt / 0.25)); // a keyboard pull takes a quarter second
    leverTick(s, dt);
    for (const ev of s.events.splice(0)) {
      onEvent(ev);
      if (ev.type === 'off') { sound('jam'); status.textContent = words.off; }
      else if (ev.type === 'dead') { sound('power'); status.textContent = words.dead; }
      else if (ev.type === 'surge') { sound('hurt'); flash = 1; spark(26); status.textContent = words.surge; if (keyHeld) keyHeld = false; }
      else if (ev.type === 'done') { sound(ev.success ? 'power' : 'hurt'); if (!ev.success) spark(40); status.textContent = ev.success ? words.pass : words.fried; flash = ev.success ? 0 : 1; }
    }
    if (!s.grabbed && !keyHeld && s.pos > 0) s.pos = Math.max(0, s.pos - dt * 5); // the spring
    // paint
    const ty = s.pos * Math.max(0, slot.clientHeight - 76);
    handle.style.transform = `translateY(${ty.toFixed(1)}px)`;
    shaft.style.height = `${(ty + 34).toFixed(1)}px`;
    slot.setAttribute('aria-valuenow', String(Math.round(s.pos * 100)));
    slot.classList.toggle('is-down', s.pos >= DOWN_AT);
    const off = s.phase === 'off' || s.phase === 'dead';
    panel.classList.toggle('is-off', off);
    panel.classList.toggle('is-dead', s.phase === 'dead');
    powerEl.textContent = s.done && !s.result.success ? 'FRIED' : off ? 'POWER OFF' : 'POWER ON';
    humFill.style.width = `${Math.round(s.hum * 100)}%`; hum.setAttribute('aria-valuenow', String(Math.round(s.hum * 100)));
    [...strikesEl.children].forEach((p, i) => p.classList.toggle('is-on', s.strikes > i));
    flash = Math.max(0, flash - dt * 2.4);
    const flick = off && !reducedMotion() ? (Math.sin(s.t * 31) > 0.2 ? 1 : 0.35) : 1;
    screen.style.opacity = String(s.done && !s.result.success ? 0.18 : off ? Math.max(0.12, s.hum * 0.9) * flick : 1);
    screen.style.setProperty('--flash', flash.toFixed(2));
    screen.classList.toggle('is-flash', flash > 0.05);
    if (s.done && !ended) {
      if (!endAt) endAt = performance.now();
      if (performance.now() - endAt > (reducedMotion() ? 100 : 900)) { ended = true; stop(); card(); }
    }
  });
  function card() {
    const r = s.result;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: 'Continue' });
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    const c = h('div', { class: `rp-result ui-card ho-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status' }, h('b', { class: 'rp-stars', text: r.success ? 'HOLODECK RESET' : 'PROJECTOR FRIED' }),
      h('span', { text: r.success ? 'The program restarts clean.' : 'The surge went through the projector. The jungle is frozen mid-splash.' }), go);
    panel.append(c); go.focus({ preventScroll: true });
  }
  return promise;
}
