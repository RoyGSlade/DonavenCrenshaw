// Flight settings shared by the hangar and pause menu: Camera, Controls, Keys,
// Controller and HUD. Every value lives in systems/flightSettings.js (saved per
// device, carried in share codes); this file only draws and edits them.
import { state } from '../state.js';
import {
  flightSettings, updateFlightSettings, isTouchDevice, encodeSettingsCode, applySettingsCode,
  MINIMAP_ZOOMS, ICON_SCALES, TILT_DEAD_ZONES, TILT_MAX_TILTS, TILT_EXPOS, TILT_DEFAULTS,
  CAMERA_FOVS, CAMERA_DISTANCES, CAMERA_STIFFNESS, CAMERA_SWIVELS, CAMERA_TRANSITIONS, CAMERA_DEFAULTS,
} from '../systems/flightSettings.js';
import {
  KEY_ACTIONS, PAD_ACTIONS, KEYS_PER_ACTION, PAD_BUTTON_COUNT, keyToken, mouseToken, keyLabel, padLabel, isKeyToken,
  bindKey, clearKey, bindPad, defaultBinds, actionName, keyHint,
} from '../systems/keybinds.js';
import { toast } from './hud.js';
import { setPadMenuSuspended } from './padMenu.js';
import { getSyncStatus, syncStatusText } from '../systems/hubSyncLive.js';

const TABS = [['camera', 'Camera'], ['controls', 'Controls'], ['keys', 'Keys'], ['pad', 'Controller'], ['hud', 'HUD']];

// Stepped settings: [tab, id, label, hint, list, group, key, defaults, format, touchOnly]
const STEPPERS = [
  ['camera', 'fov', 'Field of view', 'how much track fits on screen', CAMERA_FOVS, 'camera', 'fovIndex', CAMERA_DEFAULTS, (v) => `${Math.round(v * 100)}`],
  ['camera', 'dist', 'Distance', 'behind ship: how far down the screen you sit', CAMERA_DISTANCES, 'camera', 'distanceIndex', CAMERA_DEFAULTS, (v) => `${Math.round(v * 100)}%`],
  ['camera', 'stiff', 'Stiffness', 'lower pulls back and widens with speed', CAMERA_STIFFNESS, 'camera', 'stiffnessIndex', CAMERA_DEFAULTS, (v) => v.toFixed(2)],
  ['camera', 'swivel', 'Swivel speed', 'behind ship: how fast the view turns', CAMERA_SWIVELS, 'camera', 'swivelIndex', CAMERA_DEFAULTS, (v, i, list) => `${i + 1} / ${list.length}`],
  ['camera', 'trans', 'Transition speed', 'switching between cameras', CAMERA_TRANSITIONS, 'camera', 'transitionIndex', CAMERA_DEFAULTS, (v, i, list) => `${i + 1} / ${list.length}`],
  ['controls', 'sens', 'Tilt sensitivity', 'higher is quicker off centre', TILT_EXPOS, 'tilt', 'sensIndex', TILT_DEFAULTS, (v, i, list) => `${i + 1} / ${list.length}`, true],
  ['controls', 'max', 'Max tilt', 'tilt for a full turn', TILT_MAX_TILTS, 'tilt', 'maxIndex', TILT_DEFAULTS, (v) => `${v}°`, true],
  ['controls', 'dead', 'Tilt dead zone', 'tilt ignored around centre', TILT_DEAD_ZONES, 'tilt', 'deadIndex', TILT_DEFAULTS, (v) => `${v}°`, true],
  ['hud', 'zoom', 'Minimap zoom', '', MINIMAP_ZOOMS, 'minimap', 'zoomIndex', { zoomIndex: 0 }, (v) => `${v}×`],
  ['hud', 'icon', 'Map icon size', '', ICON_SCALES, 'minimap', 'iconIndex', { iconIndex: 2 }, (v) => `${Math.round(v * 100)}%`],
];

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const row = (label, hint, control, cls = '') => `<div class="fx-set-row ${cls}"><span>${label}${hint ? ` <small>(${hint})</small>` : ''}</span>${control}</div>`;
const stepper = ([, id, label, hint, , , , , , touchOnly]) => row(label, hint,
  `<div class="fx-stepper"><button type="button" data-fx="${id}-" aria-label="${esc(label)}: lower">−</button><output data-fx-out="${id}"></output><button type="button" data-fx="${id}+" aria-label="${esc(label)}: higher">+</button></div>`, touchOnly ? 'fx-tilt-row' : '');

function markup() {
  const steppers = (tab) => STEPPERS.filter((s) => s[0] === tab).map(stepper).join('');
  const keyRows = KEY_ACTIONS.map(([action, label]) => row(label, '',
    `<div class="fx-binds">${Array.from({ length: KEYS_PER_ACTION }, (_, slot) => `<button type="button" class="fx-bind" data-bind-key="${action}" data-slot="${slot}"></button>`).join('')}</div>`)).join('');
  const padRows = PAD_ACTIONS.map(([action, label]) => row(label, '',
    `<div class="fx-binds"><button type="button" class="fx-bind" data-bind-pad="${action}"></button><button type="button" class="fx-bind-clear" data-clear-pad="${action}" aria-label="Unbind ${esc(label)}">×</button></div>`)).join('');
  return `
    <p class="eyebrow">FLIGHT SETTINGS</p>
    <div class="fx-tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}">${label}</button>`).join('')}</div>
    <div class="fx-pane" data-pane="camera">
      ${row('Camera', 'behind ship: the view turns with you', '<button type="button" data-fx="camera"></button>')}
      ${steppers('camera')}
      ${row('Camera defaults', '', '<button type="button" data-fx="camera-reset">Reset</button>')}
    </div>
    <div class="fx-pane" data-pane="controls">
      ${row('Auto fire', 'shoots breakable targets ahead', '<button type="button" data-fx="autofire"></button>')}
      ${steppers('controls')}
      <p class="fx-pane-note">Keys and controller buttons have their own tabs. The mouse can fire or boost, never steer.</p>
    </div>
    <div class="fx-pane" data-pane="keys">
      <p class="fx-pane-note">Pick a slot, then press a key or mouse button. Esc cancels, Backspace clears. Esc always pauses.</p>
      ${keyRows}
      ${row('Key defaults', '', '<button type="button" data-fx="keys-reset">Reset</button>')}
    </div>
    <div class="fx-pane" data-pane="pad">
      ${row('Sticks', '', '<button type="button" data-fx="sticks"></button>')}
      <p class="fx-pane-note">Pick an action, then press a controller button. Menus always use the D-pad or left stick, A and B.</p>
      ${padRows}
      ${row('Controller defaults', '', '<button type="button" data-fx="pad-reset">Reset</button>')}
    </div>
    <div class="fx-pane" data-pane="hud">
      ${row('Minimap', '', '<button type="button" data-fx="map-toggle"></button>')}
      ${steppers('hud')}
      ${row('HUD &amp; controls layout', '', '<button type="button" data-fx="edit">Edit layout</button>')}
      ${row('Share settings', 'camera, controls, keys, layout', '<div class="fx-stepper"><button type="button" data-fx="copy-code">Copy code</button><button type="button" data-fx="paste-code">Paste code</button></div>')}
      <p class="fx-pane-note" data-fx-sync role="status"></p>
    </div>`;
}

let box = null;
let tab = 'camera';
let capture = null;   // { kind: 'key' | 'pad', action, slot, button, stop }

function paint() {
  if (!box) return;
  const s = flightSettings();
  const layoutButton = box.querySelector('[data-fx="edit"]');
  layoutButton.disabled = !state.run;
  layoutButton.title = state.run ? 'Arrange the HUD over your paused flight' : 'Start a flight to arrange its HUD and touch controls';
  for (const b of box.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  for (const p of box.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== tab;
  for (const [, id, , , list, group, key, defaults, format] of STEPPERS) {
    const index = Number.isInteger(s[group]?.[key]) && s[group][key] >= 0 && s[group][key] < list.length ? s[group][key] : defaults[key];
    box.querySelector(`[data-fx-out="${id}"]`).textContent = format(list[index], index, list);
  }
  const toggle = (id, on, text) => { const b = box.querySelector(`[data-fx="${id}"]`); b.textContent = text; b.setAttribute('aria-pressed', String(on)); };
  toggle('camera', s.cameraMode === 'behind', s.cameraMode === 'behind' ? 'Behind ship' : 'Track view');
  toggle('autofire', s.autoFire, s.autoFire ? 'On' : 'Off');
  toggle('map-toggle', s.minimap.show, s.minimap.show ? 'On' : 'Off');
  toggle('sticks', s.binds.sticks === 'left-turn', s.binds.sticks === 'left-turn' ? 'Left turns · right strafes' : 'Left moves · right turns');
  // Whether these settings (and your ship and designs) are kept on your account.
  const syncLine = box.querySelector('[data-fx-sync]');
  if (syncLine) { const status = getSyncStatus(); syncLine.textContent = syncStatusText(status); syncLine.dataset.status = status; }
  // Tilt only exists on touch devices.
  for (const r of box.querySelectorAll('.fx-tilt-row')) r.hidden = !isTouchDevice();
  for (const b of box.querySelectorAll('[data-bind-key]')) {
    const waiting = capture?.button === b;
    b.textContent = waiting ? 'Press a key…' : keyLabel(s.binds.keys[b.dataset.bindKey][Number(b.dataset.slot)]);
    b.classList.toggle('is-waiting', waiting);
  }
  for (const b of box.querySelectorAll('[data-bind-pad]')) {
    const waiting = capture?.button === b;
    b.textContent = waiting ? 'Press a button…' : padLabel(s.binds.pad[b.dataset.bindPad]);
    b.classList.toggle('is-waiting', waiting);
  }
  // The on-screen key hints follow the bindings.
  const hint = document.getElementById('flight-controls');
  if (hint) hint.textContent = keyHint(s.binds);
  const pauseHint = document.querySelector('#starmap-pause .panel > p:not(.eyebrow):not(.fx-pane-note)');
  if (pauseHint) pauseHint.textContent = keyHint(s.binds, KEY_ACTIONS.map(([a]) => a));
}

// --- Rebinding -------------------------------------------------------------------
function endCapture() {
  if (!capture) return;
  capture.stop();
  capture = null;
  state.ui.bindCapture = false;
  paint();
}

function captureKey(button) {
  endCapture();
  const action = button.dataset.bindKey, slot = Number(button.dataset.slot);
  const commit = (token) => {
    if (!isKeyToken(token)) { toast('That key cannot be bound.', 1800); return endCapture(); }
    let took = null;
    updateFlightSettings((s) => { const r = bindKey(s.binds, action, slot, token); s.binds = r.binds; took = r.took; });
    if (took) toast(`${keyLabel(token)} moved from ${actionName(took)} to ${actionName(action)}.`, 2600);
    endCapture();
  };
  const onKey = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') return endCapture();
    if (e.key === 'Backspace' || e.key === 'Delete') { updateFlightSettings((s) => { s.binds = clearKey(s.binds, action, slot); }); return endCapture(); }
    if (e.repeat) return;
    const token = keyToken(e);
    if (token) commit(token);
  };
  const onMouse = (e) => {
    e.preventDefault(); e.stopPropagation();
    // The click that follows this press must not land on whatever is under the pointer.
    const swallow = (c) => { c.preventDefault(); c.stopPropagation(); };
    if (e.button === 0) { window.addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', swallow, true), 400); }
    const menu = (c) => { c.preventDefault(); };
    window.addEventListener('contextmenu', menu, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('contextmenu', menu, true), 400);
    commit(mouseToken(e.button));
  };
  window.addEventListener('keydown', onKey, true);
  // A beat later, so the click that opened the capture is not taken as the binding.
  const arm = setTimeout(() => window.addEventListener('mousedown', onMouse, true), 150);
  capture = { kind: 'key', button, stop() { clearTimeout(arm); window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', onMouse, true); } };
  state.ui.bindCapture = true;
  paint();
}

function capturePad(button) {
  endCapture();
  const action = button.dataset.bindPad;
  let raf = 0, released = false;
  const started = performance.now();
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endCapture(); } };
  const poll = () => {
    raf = requestAnimationFrame(poll);
    const pad = [...(navigator.getGamepads?.() || [])].find((p) => p?.connected);
    if (performance.now() - started > 10000) { toast(pad ? 'No button pressed.' : 'No controller found. Press a button on it first.', 2400); return endCapture(); }
    if (!pad) return;
    const down = [];
    for (let i = 0; i < Math.min(pad.buttons.length, PAD_BUTTON_COUNT); i++) if (pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5) down.push(i);
    // Wait for the button that opened the capture to come up, then take the next press.
    if (!released) { released = down.length === 0; return; }
    if (!down.length) return;
    let took = null;
    updateFlightSettings((s) => { const r = bindPad(s.binds, action, down[0]); s.binds = r.binds; took = r.took; });
    if (took) toast(`${padLabel(down[0])} moved from ${actionName(took, PAD_ACTIONS)} to ${actionName(action, PAD_ACTIONS)}.`, 2600);
    endCapture();
  };
  window.addEventListener('keydown', onKey, true);
  setPadMenuSuspended(true);
  raf = requestAnimationFrame(poll);
  capture = { kind: 'pad', button, stop() { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); setPadMenuSuspended(false); } };
  state.ui.bindCapture = true;
  paint();
}

// Clipboard when the browser allows it; a text prompt otherwise (some phones).
async function copySettingsCode() {
  const code = encodeSettingsCode();
  try { await navigator.clipboard.writeText(code); toast('Settings code copied. Paste it anywhere to share your setup.', 3000); }
  catch { window.prompt('Copy your settings code:', code); }
}
async function pasteSettingsCode() {
  let code = null;
  try { code = await navigator.clipboard.readText(); } catch { /* blocked: ask instead */ }
  if (!code || !code.trim().startsWith('SD1-')) code = window.prompt('Paste a settings code:', '');
  if (code == null || !code.trim()) return;
  toast(applySettingsCode(code) ? 'Settings applied from the code.' : 'That is not a Stardust settings code.', 3000);
}

/** Build the panel into the pause overlay. onEditLayout starts the layout editor; onChange runs after any edit. */
export function buildFlightSettings({ onEditLayout, onChange }) {
  const panel = document.getElementById('flight-settings-slot');
  if (!panel || panel.querySelector('.fx-settings-panel')) return;
  box = document.createElement('div');
  box.className = 'fx-settings-panel';
  box.innerHTML = markup();
  panel.append(box);
  box.querySelector('.fx-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    endCapture();
    const index = TABS.findIndex(([id]) => id === tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    tab = TABS[next][0];
    paint();
    box.querySelector(`[data-tab="${tab}"]`).focus();
  });
  box.addEventListener('click', (event) => {
    const t = event.target;
    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) { endCapture(); tab = tabBtn.dataset.tab; return paint(); }
    const keyBtn = t.closest('[data-bind-key]');
    if (keyBtn) return capture?.button === keyBtn ? endCapture() : captureKey(keyBtn);
    const padBtn = t.closest('[data-bind-pad]');
    if (padBtn) return capture?.button === padBtn ? endCapture() : capturePad(padBtn);
    const clear = t.closest('[data-clear-pad]');
    if (clear) { endCapture(); updateFlightSettings((s) => { s.binds = bindPad(s.binds, clear.dataset.clearPad, null).binds; }); return; }
    const action = t.closest('[data-fx]')?.dataset.fx;
    if (!action) return;
    endCapture();
    const step = STEPPERS.find(([, id]) => action === `${id}-` || action === `${id}+`);
    if (step) {
      const [, , , , list, group, key, defaults] = step;
      const d = action.endsWith('+') ? 1 : -1;
      updateFlightSettings((s) => {
        s[group] = { ...defaults, ...s[group] };
        const now = Number.isInteger(s[group][key]) ? s[group][key] : defaults[key];
        s[group][key] = Math.max(0, Math.min(list.length - 1, now + d));
      });
    }
    else if (action === 'camera') updateFlightSettings((s) => { s.cameraMode = s.cameraMode === 'behind' ? 'track' : 'behind'; });
    else if (action === 'camera-reset') updateFlightSettings((s) => { s.camera = { ...CAMERA_DEFAULTS }; });
    else if (action === 'autofire') updateFlightSettings((s) => { s.autoFire = !s.autoFire; });
    else if (action === 'map-toggle') updateFlightSettings((s) => { s.minimap.show = !s.minimap.show; });
    else if (action === 'sticks') updateFlightSettings((s) => { s.binds = { ...s.binds, sticks: s.binds.sticks === 'left-turn' ? 'split' : 'left-turn' }; });
    else if (action === 'keys-reset') updateFlightSettings((s) => { s.binds = { ...s.binds, keys: defaultBinds().keys }; });
    else if (action === 'pad-reset') updateFlightSettings((s) => { const d = defaultBinds(); s.binds = { ...s.binds, pad: d.pad, sticks: d.sticks }; });
    else if (action === 'copy-code') { copySettingsCode(); return; }
    else if (action === 'paste-code') { pasteSettingsCode().then(() => onChange?.()); return; }
    else if (action === 'edit') { if (state.run) onEditLayout?.(); return; }
    onChange?.();
  });
  // Closing settings drops a half-finished rebind; reopening refreshes layout availability.
  new MutationObserver(() => { if (document.getElementById('starmap-settings')?.classList.contains('hidden')) endCapture(); else paint(); })
    .observe(document.getElementById('starmap-settings'), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('stardust:flightSettings', paint);
  window.addEventListener('stardust:syncStatus', paint);
  paint();
}

