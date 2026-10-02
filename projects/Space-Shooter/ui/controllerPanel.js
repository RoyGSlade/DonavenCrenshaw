import { controllerSnapshot, selectedController, selectController, standardController, controllerRevision } from '../systems/controllerDevices.js';
import { updateFlightSettings, controllerTuning, binds, CONTROLLER_DEFAULTS, CONTROLLER_LIMITS } from '../systems/flightSettings.js';
import { controllerAxis } from '../systems/controllerTuning.js';
import { createGamepadReader } from '../systems/gamepad.js';
import { padLabel } from '../systems/keybinds.js';
import { state } from '../state.js';
import { setPadMenuSuspended } from './padMenu.js';

const TUNING = [
  ['stickDeadzone', 'Stick deadzone', 'Ignores small stick drift. Raise this if a released stick still moves the ship.'],
  ['triggerDeadzone', 'Trigger deadzone', 'Ignores resting trigger pressure. Applies to fire, trap and trigger bindings.'],
  ['sensitivity', 'Stick sensitivity', 'Lower feels gentler; higher responds faster. Applies to movement and turning. Full travel stays at 100%.'],
];
export function controllerMarkup() {
  return `<section class="controller-card" aria-labelledby="controller-setup-title">
    <div class="controller-heading"><div><p class="eyebrow">CONNECTION CHECK</p><h3 id="controller-setup-title">Your controller</h3></div><span class="controller-badge" data-controller-badge>No device</span></div>
    <p data-controller-name class="controller-name"></p>
    <p data-controller-status class="controller-status" role="status" aria-live="polite"></p>
    <label class="controller-device-label" for="controller-device">Controller to use <small>· D-pad left/right to choose</small></label>
    <select id="controller-device" aria-describedby="controller-activation"></select>
    <p id="controller-activation" class="fx-pane-note">Connect by USB or Bluetooth, click this game, then press a controller button. Automatic chooses the first controller you activate; choose a device below if another one is in the way.</p>
    <div class="controller-test-head"><h4>Live input test</h4><button type="button" data-controller-test aria-pressed="false">Start input test</button></div>
    <div data-controller-live hidden>
    <p class="fx-pane-note" data-controller-test-help>Buttons won't select menu items during this test. Hold B / Circle for one second to end it, or use the End input test button.</p>
    <div class="controller-sticks">${['left', 'right'].map(side => `<div class="controller-stick"><div class="controller-stick-face" data-stick-face="${side}" aria-hidden="true"><i class="controller-dead-ring"></i><i class="controller-stick-dot"></i></div><div><strong>${side === 'left' ? 'Left' : 'Right'} stick</strong><output data-stick-raw="${side}">X 0% / Y 0%</output><small data-stick-applied="${side}">Response X 0% / Y 0%</small></div></div>`).join('')}</div>
    <div class="controller-triggers">${[['left', 6], ['right', 7]].map(([side, index]) => `<label><span data-trigger-label="${index}">${side === 'left' ? 'Left' : 'Right'} trigger</span><output data-trigger-value="${index}">0%</output><meter data-trigger="${index}" min="0" max="1" value="0" aria-label="${side} trigger"></meter></label>`).join('')}</div>
    <div class="controller-buttons" data-controller-buttons aria-label="Controller buttons; highlighted while pressed"></div>
    </div>
  </section>
  <section class="controller-tuning" aria-labelledby="controller-tuning-title"><div class="controller-test-head"><h3 id="controller-tuning-title">Make it feel right</h3><button type="button" data-controller-reset>Reset tuning</button></div>
    ${TUNING.map(([key, label, hint]) => { const [min, max, step] = CONTROLLER_LIMITS[key]; return `<div class="controller-range"><label for="controller-${key}">${label}</label><output for="controller-${key}" data-controller-out="${key}"></output><p id="controller-hint-${key}">${hint}</p><input id="controller-${key}" data-controller-tuning="${key}" type="range" min="${min}" max="${max}" step="${step}" aria-describedby="controller-hint-${key}"></div>`; }).join('')}
    <p class="fx-pane-note">Changes save automatically in this browser and are included in settings codes. Device choice stays on this browser.</p>
  </section>`;
}

let testing = false, testButton = null, live = null;
export function endControllerTest() {
  testing = false; setPadMenuSuspended(false, 'test');
  if (testButton) { testButton.textContent = 'Start input test'; testButton.setAttribute('aria-pressed', 'false'); }
  if (live) live.hidden = true;
}
const percent = v => `${Math.round((Number.isFinite(v) ? v : 0) * 100)}%`;
export function initControllerPanel(box) {
  const overlay = document.getElementById('starmap-settings');
  const device = box.querySelector('#controller-device');
  const status = box.querySelector('[data-controller-status]');
  const badge = box.querySelector('[data-controller-badge]');
  const diagnostic = createGamepadReader({ getPad: selectedController, getRevision: controllerRevision, getBindings: binds, getTuning: controllerTuning });
  testButton = box.querySelector('[data-controller-test]');
  live = box.querySelector('[data-controller-live]');
  device.addEventListener('change', () => { endControllerTest(); selectController(device.value === 'auto' ? null : Number(device.value)); diagnostic.suspend(); });
  testButton.addEventListener('click', () => {
    testing = !testing; setPadMenuSuspended(testing, 'test');
    testButton.textContent = testing ? 'End input test' : 'Start input test';
    testButton.setAttribute('aria-pressed', String(testing));
    live.hidden = !testing;
  });
  box.querySelector('[data-controller-reset]').addEventListener('click', () => updateFlightSettings(s => { s.controller = { ...CONTROLLER_DEFAULTS }; }));
  box.addEventListener('input', e => {
    const key = e.target.dataset.controllerTuning;
    if (key) updateFlightSettings(s => { s.controller = { ...s.controller, [key]: Number(e.target.value) }; });
  });
  const paintTuning = () => {
    const tuning = controllerTuning();
    for (const [key] of TUNING) {
      const input = box.querySelector(`[data-controller-tuning="${key}"]`);
      input.value = tuning[key];
      const text = key === 'sensitivity' ? `${tuning[key].toFixed(2)}×` : percent(tuning[key]);
      input.setAttribute('aria-valuetext', text);
      box.querySelector(`[data-controller-out="${key}"]`).textContent = text;
    }
  };
  window.addEventListener('stardust:flightSettings', paintTuning);
  window.addEventListener('stardust:controller-selected', () => { endControllerTest(); diagnostic.suspend(); });
  window.addEventListener('blur', () => { endControllerTest(); diagnostic.suspend(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { endControllerTest(); diagnostic.suspend(); } });
  new MutationObserver(() => { endControllerTest(); diagnostic.suspend(); paintTuning(); })
    .observe(overlay, { attributes: true, attributeFilter: ['class'] });
  paintTuning();
  const hangar = document.createElement('p');
  hangar.className = 'hangar-controller-status'; hangar.setAttribute('role', 'status');
  document.querySelector('.hangar-tools')?.after(hangar);
  const warning = document.createElement('div');
  warning.className = 'controller-flight-warning'; warning.setAttribute('role', 'status'); warning.hidden = true;
  document.body.append(warning);
  let topology = '', buttonSignature = '', last = 0, backSince = null;
  function tick(now) {
    requestAnimationFrame(tick);
    if (now - last < 100) return;
    last = now;
    const snapshot = controllerSnapshot(), pad = snapshot.pad;
    if (testing && standardController(pad) && pad.buttons?.[1]?.pressed) {
      if (backSince === null) backSince = now;
      if (now - backSince >= 1000) { endControllerTest(); backSince = null; }
    } else backSince = null;
    const open = !overlay.classList.contains('hidden');
    if (open) diagnostic.poll([], { active: snapshot.active });
    const guard = open ? diagnostic.getState() : snapshot.flightState;
    let title = 'No controller detected', message = 'Connect by USB or Bluetooth, click the game, then press a button on your controller.';
    if (!snapshot.available) { title = 'Controller access unavailable'; message = 'This browser cannot read controllers. Try an up-to-date browser on HTTPS or localhost. Keyboard and touch still work.'; }
    else if (!snapshot.active) { title = 'Game needs focus'; message = 'Click or tap the game, then release the sticks and buttons to continue.'; }
    else if (!pad && snapshot.preference) { title = 'Selected controller disconnected'; message = 'Reconnect your chosen controller, or choose Automatic / another detected device below.'; }
    else if (pad && !standardController(pad)) { title = 'Standard mapping unavailable'; message = 'The browser exposes this device without a standard mapping. The raw test still works; flight and controller menus need standard mode. Try USB or the controller’s standard mode, or use keyboard / touch.'; }
    else if (pad && guard?.awaitingNeutral && guard.index === pad.index) { title = 'Waiting for neutral'; message = guard.blocking?.length ? `Release: ${guard.blocking.join(', ')}. If a released control still registers, raise its deadzone below.` : 'Release sticks, triggers and buttons to enable flight safely.'; }
    else if (pad) { title = snapshot.activated ? 'Controller ready' : 'Controller detected'; message = snapshot.activated ? 'Input is reaching the game. Move the sticks to check response, or start the button test.' : 'Press a button on the controller you want to use, or choose it explicitly below.'; }
    const text = `${title}. ${message}`;
    if (status.textContent !== text) status.textContent = text;
    badge.textContent = title; badge.dataset.state = title === 'Controller ready' ? 'ready' : 'waiting';
    box.querySelector('[data-controller-name]').textContent = pad ? `${pad.id || 'Unnamed controller'} · device ${pad.index + 1}` : snapshot.preference ? snapshot.preference.id : 'No device exposed by the browser yet';
    const summary = pad ? `${title} · ${pad.id || `Controller ${pad.index + 1}`}` : title;
    if (hangar.textContent !== summary) hangar.textContent = summary;
    const warn = !!state.run && !state.ui.paused && !state.ui.showStartOverlay && (!snapshot.active || (!pad && snapshot.preference) || (pad && (!standardController(pad) || guard?.awaitingNeutral)));
    warning.hidden = !warn;
    if (warn && warning.textContent !== text) warning.textContent = `${text} Open Settings → Controller for the input test.`;
    if (!open) return;
    const signature = JSON.stringify([snapshot.connected.map(p => [p.index, p.id]), snapshot.preference]);
    if (signature !== topology) {
      topology = signature;
      device.replaceChildren(new Option('Automatic · press a button to activate', 'auto'));
      for (const p of snapshot.connected) device.add(new Option(`${p.index + 1} · ${p.id || 'Controller'}${standardController(p) ? '' : ' · nonstandard'}`, String(p.index)));
      if (snapshot.preference && !snapshot.connected.some(p => p.id === snapshot.preference.id)) device.add(new Option(`Disconnected · ${snapshot.preference.id}`, String(snapshot.preference.index)));
      device.value = snapshot.preference ? String(pad?.index ?? snapshot.preference.index) : 'auto';
    }
    device.disabled = !snapshot.available;
    testButton.disabled = !pad;
    if (!pad) endControllerTest();
    const tuning = controllerTuning();
    for (const [side, start] of [['left', 0], ['right', 2]]) {
      const x = Math.max(-1, Math.min(1, Number.isFinite(pad?.axes?.[start]) ? pad.axes[start] : 0));
      const y = Math.max(-1, Math.min(1, Number.isFinite(pad?.axes?.[start + 1]) ? pad.axes[start + 1] : 0));
      const face = box.querySelector(`[data-stick-face="${side}"]`);
      face.parentElement.querySelector('strong').textContent = pad && !standardController(pad) ? `Axes ${start} / ${start + 1}` : `${side === 'left' ? 'Left' : 'Right'} stick`;
      face.style.setProperty('--stick-x', `${x * 30}px`); face.style.setProperty('--stick-y', `${y * 30}px`); face.style.setProperty('--deadzone', `${tuning.stickDeadzone * 100}%`);
      box.querySelector(`[data-stick-raw="${side}"]`).textContent = `Raw X ${percent(x)} / Y ${percent(y)}`;
      box.querySelector(`[data-stick-applied="${side}"]`).textContent = `Response X ${percent(controllerAxis(x, tuning))} / Y ${percent(controllerAxis(y, tuning))}`;
    }
    for (const i of [6, 7]) {
      const value = Math.max(0, Math.min(1, Number.isFinite(pad?.buttons?.[i]?.value) ? pad.buttons[i].value : 0));
      box.querySelector(`[data-trigger="${i}"]`).value = value;
      const label = pad && !standardController(pad) ? `Button ${i}` : `${i === 6 ? 'Left' : 'Right'} trigger`;
      box.querySelector(`[data-trigger-label="${i}"]`).textContent = label;
      box.querySelector(`[data-trigger="${i}"]`).setAttribute('aria-label', label);
      box.querySelector(`[data-trigger-value="${i}"]`).textContent = `${percent(value)}${value <= tuning.triggerDeadzone ? ' · idle' : ' · active'}`;
    }
    const count = Math.min(pad?.buttons?.length || 0, 32), buttons = box.querySelector('[data-controller-buttons]');
    const signatureButtons = `${count}:${standardController(pad)}`;
    if (buttonSignature !== signatureButtons) {
      buttonSignature = signatureButtons; buttons.replaceChildren(...Array.from({ length: count }, (_, i) => { const n = document.createElement('span'); n.textContent = standardController(pad) ? padLabel(i) : `Button ${i}`; return n; }));
    }
    [...buttons.children].forEach((n, i) => { const down = pad.buttons[i]?.pressed || pad.buttons[i]?.value > tuning.triggerDeadzone; n.classList.toggle('is-down', !!down); n.setAttribute('aria-label', `${n.textContent}: ${down ? 'pressed' : 'released'}`); });
  }
  requestAnimationFrame(tick);
}
