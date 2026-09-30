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
import { flightSettings, updateFlightSettings, MINIMAP_ZOOMS, ICON_SCALES, isTouchDevice } from '../systems/flightSettings.js';
import { subscribeTilt, calibrateTiltControls, getTiltState } from '../systems/tilt.js';
import { openPauseOverlay, closePauseOverlay } from './overlays.js';
import { toast } from './hud.js';

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
    <div class="fx-set-row"><span>HUD &amp; controls layout</span><button type="button" data-fx="edit">Edit layout</button></div>`;
  panel.insertBefore(box, panel.querySelector('.actions'));
  const paint = () => {
    const s = flightSettings();
    box.querySelector('[data-fx="map-toggle"]').textContent = s.minimap.show ? 'On' : 'Off';
    box.querySelector('[data-fx="map-toggle"]').setAttribute('aria-pressed', String(s.minimap.show));
    box.querySelector('[data-fx-out="zoom"]').textContent = `${MINIMAP_ZOOMS[s.minimap.zoomIndex] ?? 1}×`;
    box.querySelector('[data-fx-out="icon"]').textContent = `${Math.round((ICON_SCALES[s.minimap.iconIndex] ?? 1) * 100)}%`;
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
