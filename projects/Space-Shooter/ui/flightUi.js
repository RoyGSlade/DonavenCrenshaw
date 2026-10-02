// The flight UI layer: HUD widgets, touch controls, the race intro and the
// layout editor. The flight settings in the pause panel are ui/settingsPanel.js. The renderer calls updateFlightUi(dt) every frame.
//
// Touch controls show on touch screens during flight. When a gamepad is being
// used (on a phone too) they hide; touching the screen brings them back.
import { state } from '../state.js';
import { initFlightHud, updateFlightHud, setMinimapVisible } from './flightHud.js';
import { initTouchPad, updateTouchPad, setWheelHidden, releaseTouchPad, touchInput } from './touchPad.js';
import { initRaceIntro, updateRaceIntro } from './raceIntro.js';
import { initLayout, applyLayout, startEditing, isEditingLayout } from './layoutEditor.js';
import { flightSettings, updateFlightSettings, isTouchDevice } from '../systems/flightSettings.js';
import { buildFlightSettings } from './settingsPanel.js';
import { subscribeTilt, calibrateTiltControls, getTiltState } from '../systems/tilt.js';
import { openPauseOverlay, closePauseOverlay, closeSettingsOverlay } from './overlays.js';
import { toast } from './hud.js';
import { initPadMenu } from './padMenu.js';
import { selectedController, standardController } from '../systems/controllerDevices.js';
import { controllerTuning } from '../systems/flightSettings.js';

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
  buildFlightSettings({
    onChange: applyMinimapSetting,
    // Stay paused, hide the panel, edit over the frozen flight.
    onEditLayout: () => { closeSettingsOverlay(); document.getElementById('starmap-pause')?.classList.add('hidden'); startEditing(); },
  });
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

// --- Per frame -----------------------------------------------------------------
let lastWord = '';
export function updateFlightUi(dt) {
  if (!root) return;
  // A gamepad in use hides the touch controls; a touch brings them back.
  const pad = selectedController();
  if (standardController(pad)) {
    if (pad.axes?.some((a) => Math.abs(a) > Math.max(0.35, controllerTuning().stickDeadzone)) || pad.buttons?.some((b) => b?.pressed)) {
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
