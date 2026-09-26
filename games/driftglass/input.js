// src/roadmap/input.js
import { state, config } from './state.js';
import { openPauseOverlay, closePauseOverlay } from './ui/overlays.js';
import { toggleFullscreen } from './ui/graphics.js';
// Inline gamepad mapping (import-assert not supported in browsers)
const gamepadMapping = {
  BUTTONS: {
    LAUNCH: 0,
    PAUSE: 8,
    FULLSCREEN: 9,
    MINIMAP_TOGGLE: [13],
    BOOST_HOLD: 4,
    SHOOT: 7,
    BOOST_TOGGLE: 3
  }
};

export { gamepadMapping };

let isBound = false;

const kb = {
  left: false, right: false, thrust: false, thrustBack: false,
  strafeLeft: false, strafeRight: false, shoot: false, boost: false, _launchEdge: false
};

const gpState = {
  index: null,
  dz: config.GAMEPAD?.STICK_DEADZONE ?? 0.15,
  tdz: config.GAMEPAD?.TRIGGER_DEADZONE ?? 0.1,
  aWas: false,
  pauseWas: false,
  selectWas: false,
  minimapWas: false,
  yWas: false,
  boostToggle: false
};

const gamepadButtons = gamepadMapping.BUTTONS;

function resetGamepadState() {
  gpState.aWas = false;
  gpState.pauseWas = false;
  gpState.selectWas = false;
  gpState.minimapWas = false;
  gpState.yWas = false;
  gpState.boostToggle = false;
}

export async function bindInput() {
  if (isBound) return;
  isBound = true;

  window.addEventListener('keydown', onKeyDown, { passive: true });
  window.addEventListener('keyup', onKeyUp, { passive: true });
  window.addEventListener('mousedown', onMouseDown, { passive: true });
  window.addEventListener('mouseup', onMouseUp, { passive: true });
  window.addEventListener('blur', clearKeys, { passive: true });

  window.addEventListener('gamepadconnected', onGamepadConnected, { passive: true });
  window.addEventListener('gamepaddisconnected', onGamepadDisconnected, { passive: true });

  // Touch UI for mobile
  await bindTouchControls();

  // If a pad is already connected at load, grab the first active one
  if (navigator.getGamepads) {
    const pads = Array.from(navigator.getGamepads()).filter(Boolean);
    if (pads.length) {
      gpState.index = pads[0].index;
      resetGamepadState();
    }
  }
}

function onGamepadConnected(event) {
  gpState.index = event.gamepad.index;
  resetGamepadState();
}

function onGamepadDisconnected(event) {
  if (gpState.index === event.gamepad.index) {
    gpState.index = null;
    resetGamepadState();
  }
}

function onMouseDown(e) {
  if (e.button === 0 && state.mode === 'arena') kb.shoot = true;
}
function onMouseUp(e) {
  if (e.button === 0) kb.shoot = false;
}

function onKeyDown(e) {
  const k = e.key;
  if (k === 'Escape') {
    if (state.mode === 'arena') return; // no pausing in arena
    if (!state.ui.paused) openPauseOverlay(); else closePauseOverlay();
    return;
  }
  if (k === 'f' || k === 'F') { toggleFullscreen(); return; }
  if (k === 'm' || k === 'M') {
    if (state.mode !== 'arena') state.ui.showMinimap = !state.ui.showMinimap;
    return;
  }

  if (k === 'ArrowLeft' || k === 'a' || k === 'A') kb.left = true;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') kb.right = true;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') kb.thrust = true;
  if (k === 'ArrowDown' || k === 's' || k === 'S') kb.thrustBack = true;

  if (k === 'q' || k === 'Q') kb.strafeLeft = true;
  if (k === 'e' || k === 'E') kb.strafeRight = true;

  if (k === ' ') kb._launchEdge = true;
  if (k === 'Shift') kb.boost = true;
  if (k === 'Control') kb.shoot = true;
}
function onKeyUp(e) {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') kb.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') kb.right = false;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') kb.thrust = false;
  if (k === 'ArrowDown' || k === 's' || k === 'S') kb.thrustBack = false;

  if (k === 'q' || k === 'Q') kb.strafeLeft = false;
  if (k === 'e' || k === 'E') kb.strafeRight = false;

  if (k === 'Shift') kb.boost = false;
  if (k === 'Control') kb.shoot = false;
}

function clearKeys() {
  for (const k of Object.keys(kb)) kb[k] = false;
}

async function bindTouchControls() {
  const container = document.getElementById('starmap-touch-controls');
  if (!container) return;

  // Inline touch control config — no server fetch needed
  const configData = {
    buttons: [
      { id: 'touch-left', label: '◀', action: 'left', container: 'dpad', area: 'dpad-left' },
      { id: 'touch-right', label: '▶', action: 'right', container: 'dpad', area: 'dpad-right' },
      { id: 'touch-up', label: '▲', action: 'thrust', container: 'dpad', area: 'dpad-up' },
      { id: 'touch-down', label: '▼', action: 'thrustBack', container: 'dpad', area: 'dpad-down' },
      { id: 'touch-boost', label: '⚡', action: 'boost', container: 'main', area: 'action-boost' },
      { id: 'touch-pause', label: '⏸', action: 'pause', container: 'main', area: 'action-pause' },
      { id: 'touch-map', label: '🗺', action: 'minimap', container: 'main', area: 'action-map' },
    ]
  };

  const handleStart = (action) => () => { kb[action] = true; };
  const handleEnd = (action) => () => { kb[action] = false; };

  const dpad = document.createElement('div');
  dpad.className = 'dpad';
  container.appendChild(dpad);

  (configData.buttons || []).forEach((def) => {
    const button = document.createElement('button');
    button.id = def.id;
    button.textContent = def.label;
    button.className = 'touch-btn';

    if (def.container === 'dpad') {
      button.classList.add(def.area);
      dpad.appendChild(button);
    } else {
      button.classList.add(def.area);
      container.appendChild(button);
    }

    if (['left', 'right', 'thrust', 'thrustBack', 'boost'].includes(def.action)) {
      button.addEventListener('touchstart', handleStart(def.action), { passive: true });
      button.addEventListener('touchend', handleEnd(def.action), { passive: true });
      button.addEventListener('touchcancel', handleEnd(def.action), { passive: true });
    } else if (def.action === 'pause') {
      button.addEventListener('touchstart', () => {
        if (state.mode === 'arena') return;
        if (!state.ui.paused) openPauseOverlay(); else closePauseOverlay();
      }, { passive: true });
    } else if (def.action === 'minimap') {
      button.addEventListener('touchstart', () => {
        if (state.mode !== 'arena') state.ui.showMinimap = !state.ui.showMinimap;
      }, { passive: true });
    }
  });
}

function pollGamepad() {
  const index = gpState.index ?? 0;
  const pads = navigator.getGamepads ? navigator.getGamepads() : null;
  const gp = pads && pads[index] ? pads[index] : null;
  if (!gp) return null;

  // New scheme:
  // Left stick Y: forward/back thrust
  // Left stick X: strafe left/right (digital strength 0.6 scaled by magnitude)
  // Right stick X: turn (rotate) left/right
  const axLXraw = gp.axes?.[0] ?? 0;   // left stick X
  const axLYraw = gp.axes?.[1] ?? 0;   // left stick Y
  const axRXraw = gp.axes?.[2] ?? 0;   // right stick X (common mapping)
  const axLX = applyDZ(axLXraw, gpState.dz);
  const axLY = applyDZ(axLYraw, gpState.dz);
  const axRX = applyDZ(axRXraw, gpState.dz);
  const forwardStrength = Math.max(0, -axLY);   // push up to move forward
  const reverseStrengthRaw = Math.max(0, axLY); // push down to reverse (thrustBack)

  // Strafing derived from left stick X
  const strafeLeft = axLX < -gpState.dz;
  const strafeRight = axLX > gpState.dz;
  const strafeStrength = Math.min(Math.abs(axLX), 1) * 0.6; // cap at 0.6 like keyboard

  // Turning from right stick X
  const turnLeft = axRX < -gpState.dz;
  const turnRight = axRX > gpState.dz;
  // Signed turn strength (negative = left, positive = right)
  const turnStrength = axRX;


  // RT shoot in arena only
  const shootButton = gamepadButtons.SHOOT;
  const shootTriggerValue =
    (gp.buttons?.[shootButton]?.value ?? (gp.buttons?.[shootButton]?.pressed ? 1 : 0)) || 0;
  const shoot = state.mode === 'arena' && shootTriggerValue > gpState.tdz;

  // A/Cross launch edge
  const launchNow = !!gp.buttons?.[gamepadButtons.LAUNCH]?.pressed;
  const launchEdge = launchNow && !gpState.aWas;
  gpState.aWas = launchNow;

  // Select/Back => pause (roadmap only) per new mapping
  const pauseNow = !!gp.buttons?.[gamepadButtons.PAUSE]?.pressed;
  const pauseEdge = pauseNow && !gpState.pauseWas;
  gpState.pauseWas = pauseNow;
  if (pauseEdge && state.mode !== 'arena') {
    if (!state.ui.paused) openPauseOverlay(); else closePauseOverlay();
  }

  // Start => fullscreen toggle (swapped)
  const selectNow = !!gp.buttons?.[gamepadButtons.FULLSCREEN]?.pressed;
  const selectEdge = selectNow && !gpState.selectWas;
  gpState.selectWas = selectNow;
  if (selectEdge) toggleFullscreen();

  // Minimap toggle (roadmap only)
  const minimapButtons = gamepadButtons.MINIMAP_TOGGLE || [];
  const minimapNow = minimapButtons.some(id => !!gp.buttons?.[id]?.pressed);
  const minimapEdge = minimapNow && !gpState.minimapWas;
  gpState.minimapWas = minimapNow;
  if (minimapEdge && state.mode !== 'arena') {
    state.ui.showMinimap = !state.ui.showMinimap;
  }

  // Boost hold/toggle (left bumper hold, optional Y toggle retained)
  const boostHold = !!gp.buttons?.[gamepadButtons.BOOST_HOLD]?.pressed;
  const boostToggleNow = !!gp.buttons?.[gamepadButtons.BOOST_TOGGLE]?.pressed;
  const boostToggleEdge = boostToggleNow && !gpState.yWas;
  gpState.yWas = boostToggleNow;
  if (boostToggleEdge) gpState.boostToggle = !gpState.boostToggle;
  const boost = boostHold || gpState.boostToggle;

  return {
    // Movement booleans
    thrust: forwardStrength > 0,
    thrustBack: reverseStrengthRaw > 0,
    strafeLeft,
    strafeRight,
    turnLeft,
    turnRight,
    // Analog strengths (turnStrength signed)
    thrustStrength: forwardStrength,
    backStrength: reverseStrengthRaw * 0.6,
    strafeStrength,
    turnStrength,
    // Actions
    boost, shoot, launchEdge
  };
}

export function pumpInput() {
  const gp = pollGamepad();

  const out = state.keys;
  // Keyboard fallbacks merged with gamepad
  out.left = kb.left || !!gp?.turnLeft;
  out.right = kb.right || !!gp?.turnRight;
  out.thrust = kb.thrust || !!gp?.thrust;
  out.thrustBack = kb.thrustBack || !!gp?.thrustBack;
  out.strafeLeft = kb.strafeLeft || !!gp?.strafeLeft;
  out.strafeRight = kb.strafeRight || !!gp?.strafeRight;
  out.boost = kb.boost || !!gp?.boost;
  out.shoot = kb.shoot || !!gp?.shoot;

  // Analog strengths (keyboard defaults keep existing feel)
  out.thrustStrength = gp?.thrustStrength ?? (kb.thrust ? 1.0 : 0.0);
  out.backStrength = gp?.backStrength ?? (kb.thrustBack ? 0.6 : 0.0);
  out.strafeStrength = gp?.strafeStrength ?? ((kb.strafeLeft || kb.strafeRight) ? 0.6 : 0.0);
  // Analog turn strength: prefer gamepad, else A/D = full turn
  if (gp && typeof gp.turnStrength === 'number') {
    out.turnStrength = gp.turnStrength; // signed -1..1 from stick
  } else {
    // Keyboard gives discrete full-speed turns; left = -1, right = +1
    out.turnStrength = kb.left === kb.right ? 0 : (kb.right ? 1 : -1);
  }

  // Right-stick aim (used by movement/steering)
  out.aimActive = !!(gp?.aimActive);
  out.aimAngle = gp?.aimAngle ?? out.aimAngle;
  out.aimStrength = gp?.aimStrength ?? 0.0;

  // Optional tilt-based turning
  if (state.input.touch.useTilt) {
    const axis = state.input.touch.turnAxis;
    if (axis !== 0) {
      out.turnStrength = axis;
      out.left = axis < 0;
      out.right = axis > 0;
    }
  }

  // Launch edge
  out.launch = kb._launchEdge || !!gp?.launchEdge;
  kb._launchEdge = false; // consume edge
}

function applyDZ(v, dz) {
  return Math.abs(v) < dz ? 0 : v;
}
