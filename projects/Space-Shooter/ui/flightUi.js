// The flight UI layer: HUD widgets, touch controls, the race intro and the
// layout editor, plus the flight settings in the pause panel (minimap, auto
// fire, edit layout). The renderer calls updateFlightUi(dt) every frame.
//
// Touch controls show on touch screens during flight. When a gamepad is being
// used (on a phone too) they hide; touching the screen brings them back.
import { state } from '../state.js';
import { initFlightHud, updateFlightHud, setMinimapVisible } from './flightHud.js';
import { initTouchPad, updateTouchPad, setWheelHidden, releaseTouchPad, touchInput } from './touchPad.js';
import { initRaceIntro, updateRaceIntro } from './raceIntro.js';
import { initLayout, applyLayout, startEditing, isEditingLayout } from './layoutEditor.js';
import { flightSettings, updateFlightSettings, MINIMAP_ZOOMS, ICON_SCALES, TILT_DEAD_ZONES, TILT_MAX_TILTS, TILT_EXPOS, TILT_DEFAULTS, tiltTuning, isTouchDevice, encodeSettingsCode, applySettingsCode } from '../systems/flightSettings.js';
import { subscribeTilt, calibrateTiltControls, getTiltState } from '../systems/tilt.js';
import { openPauseOverlay, closePauseOverlay } from './overlays.js';
import { toast } from './hud.js';
import { initPadMenu } from './padMenu.js';

let root = null;
let lastPadUse = -Infinity, lastTouch = -Infinity, padNotified = false;

const driving = () => !state.ui.paused && !state.ui.showStartOverlay && !state.ui.showSettingsOverlay && !state.ui.showEndOverlay && !state.ui.showDefeatOverlay && !isEditingLayout();

export function initFlightUi() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'flight-ui';
  root.className = 'flight-ui';
  document.body.append(root);
  initFlightHud(root, { onSettings: () => { if (state.mode !== 'arena') openPauseOverlay(); } });
  initTouchPad(root, {
    driveAllowed: driving,
    onStartLine: () => { const s = state.mode === 'arena' ? state.arena : state.run?.current; return !!s?.lockedInStart; },
  });
  initRaceIntro(root);
  initLayout(root);
  document.body.classList.toggle('fx-touch-device', isTouchDevice());
  buildFlightSettings();
  initPadMenu();
  subscribeTilt((tilt) => setWheelHidden(tilt.enabled));
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') lastTouch = performance.now(); }, { capture: true, passive: true });
  window.addEventListener('stardust:clear-input', releaseTouchPad);
  window.addEventListener('stardust:layoutEdited', () => openPauseOverlay());
  applyMinimapSetting();
}

// The minimap setting and state.ui.showMinimap (toggled by M or the gamepad) stay in step.
let shownMinimap = null;
function applyMinimapSetting() {
  const on = flightSettings().minimap.show;
  state.ui.showMinimap = on;
  shownMinimap = on;
  setMinimapVisible(on);
}
function syncMinimapToggle() {
  if (shownMinimap === null || state.ui.showMinimap === shownMinimap) return;
  const on = !!state.ui.showMinimap;
  shownMinimap = on;
  updateFlightSettings((s) => { s.minimap.show = on; });
  setMinimapVisible(on);
}

// --- Flight settings inside the pause panel ---------------------------------
function buildFlightSettings() {
  const panel = document.querySelector('#starmap-pause .panel');
  if (!panel || panel.querySelector('.fx-settings-panel')) return;
  const box = document.createElement('div');
  box.className = 'fx-settings-panel';
  box.innerHTML = `
    <p class="eyebrow">FLIGHT SETTINGS</p>
    <div class="fx-set-row"><span>Minimap</span><button type="button" data-fx="map-toggle"></button></div>
    <div class="fx-set-row"><span>Minimap zoom</span><div class="fx-stepper"><button type="button" data-fx="zoom-" aria-label="Zoom out">−</button><output data-fx-out="zoom"></output><button type="button" data-fx="zoom+" aria-label="Zoom in">+</button></div></div>
    <div class="fx-set-row"><span>Map icon size</span><div class="fx-stepper"><button type="button" data-fx="icon-" aria-label="Smaller icons">−</button><output data-fx-out="icon"></output><button type="button" data-fx="icon+" aria-label="Bigger icons">+</button></div></div>
    <div class="fx-set-row"><span>Auto fire <small>(shoots breakable targets ahead)</small></span><button type="button" data-fx="autofire"></button></div>
    <div class="fx-set-row fx-tilt-row"><span>Tilt sensitivity <small>(higher is quicker off centre)</small></span><div class="fx-stepper"><button type="button" data-fx="sens-" aria-label="Lower tilt sensitivity">−</button><output data-fx-out="sens"></output><button type="button" data-fx="sens+" aria-label="Higher tilt sensitivity">+</button></div></div>
    <div class="fx-set-row fx-tilt-row"><span>Max tilt <small>(tilt for a full turn)</small></span><div class="fx-stepper"><button type="button" data-fx="max-" aria-label="Less tilt for a full turn">−</button><output data-fx-out="max"></output><button type="button" data-fx="max+" aria-label="More tilt for a full turn">+</button></div></div>
    <div class="fx-set-row fx-tilt-row"><span>Tilt dead zone <small>(tilt ignored around centre)</small></span><div class="fx-stepper"><button type="button" data-fx="dead-" aria-label="Smaller tilt dead zone">−</button><output data-fx-out="dead"></output><button type="button" data-fx="dead+" aria-label="Bigger tilt dead zone">+</button></div></div>
    <div class="fx-set-row"><span>HUD &amp; controls layout</span><button type="button" data-fx="edit">Edit layout</button></div>
    <div class="fx-set-row"><span>Share settings <small>(layout, tilt, minimap)</small></span><div class="fx-stepper"><button type="button" data-fx="copy-code">Copy code</button><button type="button" data-fx="paste-code">Paste code</button></div></div>`;
  panel.insertBefore(box, panel.querySelector('.actions'));
  const paint = () => {
    const s = flightSettings();
    box.querySelector('[data-fx="map-toggle"]').textContent = s.minimap.show ? 'On' : 'Off';
    box.querySelector('[data-fx="map-toggle"]').setAttribute('aria-pressed', String(s.minimap.show));
    box.querySelector('[data-fx-out="zoom"]').textContent = `${MINIMAP_ZOOMS[s.minimap.zoomIndex] ?? 1}×`;
    box.querySelector('[data-fx-out="icon"]').textContent = `${Math.round((ICON_SCALES[s.minimap.iconIndex] ?? 1) * 100)}%`;
    const tilt = tiltTuning(s);
    box.querySelector('[data-fx-out="sens"]').textContent = `${TILT_EXPOS.indexOf(tilt.expo) + 1} / ${TILT_EXPOS.length}`;
    box.querySelector('[data-fx-out="max"]').textContent = `${tilt.fullLockDeg}°`;
    box.querySelector('[data-fx-out="dead"]').textContent = `${tilt.deadZoneDeg}°`;
    // Tilt only exists on touch devices.
    for (const row of box.querySelectorAll('.fx-tilt-row')) row.hidden = !isTouchDevice();
    box.querySelector('[data-fx="autofire"]').textContent = s.autoFire ? 'On' : 'Off';
    box.querySelector('[data-fx="autofire"]').setAttribute('aria-pressed', String(s.autoFire));
  };
  box.addEventListener('click', (event) => {
    const action = event.target.closest('[data-fx]')?.dataset.fx;
    if (!action) return;
    const step = (key, list, d) => updateFlightSettings((s) => { s.minimap[key] = Math.max(0, Math.min(list.length - 1, (s.minimap[key] | 0) + d)); });
    if (action === 'map-toggle') updateFlightSettings((s) => { s.minimap.show = !s.minimap.show; });
    else if (action === 'zoom-') step('zoomIndex', MINIMAP_ZOOMS, -1);
    else if (action === 'zoom+') step('zoomIndex', MINIMAP_ZOOMS, 1);
    else if (action === 'icon-') step('iconIndex', ICON_SCALES, -1);
    else if (action === 'icon+') step('iconIndex', ICON_SCALES, 1);
    else if (/^(sens|max|dead)[-+]$/.test(action)) {
      const [key, list] = { sens: ['sensIndex', TILT_EXPOS], max: ['maxIndex', TILT_MAX_TILTS], dead: ['deadIndex', TILT_DEAD_ZONES] }[action.slice(0, -1)];
      const d = action.endsWith('+') ? 1 : -1;
      updateFlightSettings((s) => { s.tilt = { ...TILT_DEFAULTS, ...s.tilt }; s.tilt[key] = Math.max(0, Math.min(list.length - 1, (s.tilt[key] | 0) + d)); });
    }
    else if (action === 'copy-code') { copySettingsCode(); return; }
    else if (action === 'paste-code') { pasteSettingsCode().then(() => { applyMinimapSetting(); paint(); }); return; }
    else if (action === 'autofire') updateFlightSettings((s) => { s.autoFire = !s.autoFire; });
    else if (action === 'edit') {
      // Stay paused, hide the panel, edit over the frozen flight.
      document.getElementById('starmap-pause')?.classList.add('hidden');
      startEditing();
      return;
    }
    applyMinimapSetting();
    paint();
  });
  window.addEventListener('stardust:flightSettings', paint);
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

// --- Per frame -----------------------------------------------------------------
let lastWord = '';
export function updateFlightUi(dt) {
  if (!root) return;
  // A gamepad in use hides the touch controls; a touch brings them back.
  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.axes?.some((a) => Math.abs(a) > 0.35) || pad.buttons?.some((b) => b?.pressed)) {
      lastPadUse = performance.now();
      if (!padNotified && isTouchDevice()) {
        padNotified = true;
        toast('Controller connected: touch controls hidden. Tap the screen to bring them back.', 3500);
      }
    }
  }
  const padMode = lastPadUse > lastTouch;
  const touchOn = !!state.input.touch.active && !padMode && state.mode !== 'arena';
  document.body.classList.toggle('fx-touch-on', touchOn || (isEditingLayout() && isTouchDevice()));
  document.body.classList.toggle('fx-pad', padMode);
  if (!touchOn && touchInput.active) releaseTouchPad();
  syncMinimapToggle();
  updateTouchPad(dt);
  updateFlightHud();
  const intro = updateRaceIntro();
  // Tilt re-centres on the start line, while the pilot holds still.
  const word = intro ? document.querySelector('.fx-intro-call')?.dataset.word || '' : '';
  if (word !== lastWord) {
    lastWord = word;
    if (word === 'set' && getTiltState().enabled) calibrateTiltControls();
  }
}

export { applyLayout, closePauseOverlay };
