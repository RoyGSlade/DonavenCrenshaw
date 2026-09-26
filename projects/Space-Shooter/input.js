// src/roadmap/input.js
import { state, config } from "./state.js";
import { openPauseOverlay, closePauseOverlay } from "./ui/overlays.js";
import { toggleFullscreen } from "./ui/graphics.js";
import { getTiltAxis } from "./systems/tilt.js";
// Inline gamepad mapping (import-assert not supported in browsers)
const gamepadMapping = {
  BUTTONS: {
    LAUNCH: 0,
    PAUSE: 8,
    FULLSCREEN: 9,
    MINIMAP_TOGGLE: [13],
    BOOST_HOLD: 4,
    SHOOT: 7,
    BOOST_TOGGLE: 3,
  },
};

export { gamepadMapping };

let isBound = false;

const touch = {};
const touchPointers = new Map();
let touchLaunchEdge = false;
let boostLaunchPointer = null;

const kb = {
  left: false,
  right: false,
  thrust: false,
  thrustBack: false,
  strafeLeft: false,
  strafeRight: false,
  shoot: false,
  boost: false,
  brake: false,
  _launchEdge: false,
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
  boostToggle: false,
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

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp, { passive: true });
  window.addEventListener("mousedown", onMouseDown, { passive: true });
  window.addEventListener("mouseup", onMouseUp, { passive: true });
  window.addEventListener("blur", clearKeys, { passive: true });
  window.addEventListener("stardust:clear-input", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });

  window.addEventListener("gamepadconnected", onGamepadConnected, {
    passive: true,
  });
  window.addEventListener("gamepaddisconnected", onGamepadDisconnected, {
    passive: true,
  });

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
  if (
    e.button === 0 &&
    e.target?.id === "starmap-canvas" &&
    !state.ui.showStartOverlay &&
    !state.ui.paused
  )
    kb.shoot = true;
}
function onMouseUp(e) {
  if (e.button === 0) kb.shoot = false;
}

function onKeyDown(e) {
  const k = e.key;
  if (
    state.ui.showStartOverlay ||
    state.ui.showSettingsOverlay ||
    state.ui.showEndOverlay ||
    state.ui.showDefeatOverlay ||
    state.arena?.victoryPresented
  )
    return;
  if (e.target?.matches?.("input, textarea, select, button")) return;
  if (
    [
      " ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Control",
    ].includes(k)
  )
    e.preventDefault();
  if (k === "Escape") {
    if (state.mode === "arena") return; // no pausing in arena
    if (!state.ui.paused) openPauseOverlay();
    else closePauseOverlay();
    return;
  }
  if (k === "f" || k === "F") {
    toggleFullscreen();
    return;
  }
  if (k === "m" || k === "M") {
    if (state.mode !== "arena") state.ui.showMinimap = !state.ui.showMinimap;
    return;
  }

  if (k === "ArrowLeft" || k === "a" || k === "A") kb.left = true;
  if (k === "ArrowRight" || k === "d" || k === "D") kb.right = true;
  if (k === "ArrowUp" || k === "w" || k === "W") kb.thrust = true;
  if (k === "ArrowDown" || k === "s" || k === "S") kb.thrustBack = true;

  if (k === "q" || k === "Q") kb.strafeLeft = true;
  if (k === "e" || k === "E") kb.strafeRight = true;

  if (k === " ") kb._launchEdge = true;
  if (k === "Shift") kb.boost = true;
  if (k === "Control") kb.shoot = true;
  if (k === "x" || k === "X") kb.brake = true;
}
function onKeyUp(e) {
  const k = e.key;
  if (k === "ArrowLeft" || k === "a" || k === "A") kb.left = false;
  if (k === "ArrowRight" || k === "d" || k === "D") kb.right = false;
  if (k === "ArrowUp" || k === "w" || k === "W") kb.thrust = false;
  if (k === "ArrowDown" || k === "s" || k === "S") kb.thrustBack = false;

  if (k === "q" || k === "Q") kb.strafeLeft = false;
  if (k === "e" || k === "E") kb.strafeRight = false;

  if (k === "Shift") kb.boost = false;
  if (k === "Control") kb.shoot = false;
  if (k === "x" || k === "X") kb.brake = false;
}

function clearKeys() {
  for (const key of Object.keys(touch)) touch[key] = false;
  touchPointers.clear();
  touchLaunchEdge = false;
  boostLaunchPointer = null;
  gpState.boostToggle = false;
  for (const k of Object.keys(kb)) kb[k] = false;
  for (const k of Object.keys(state.keys))
    state.keys[k] = typeof state.keys[k] === "number" ? 0 : false;
}

async function bindTouchControls() {
  const container = document.getElementById("starmap-touch-controls");
  if (!container) return;
  const buttons = [
    { id: "touch-up", label: "GAS", action: "thrust", group: "touch-drive" },
    {
      id: "touch-down",
      label: "REVERSE",
      action: "thrustBack",
      group: "touch-drive",
    },
    {
      id: "touch-left",
      label: "◀",
      name: "Steer left",
      action: "left",
      group: "touch-steering",
    },
    {
      id: "touch-right",
      label: "▶",
      name: "Steer right",
      action: "right",
      group: "touch-steering",
    },
    {
      id: "touch-fire",
      label: "FIRE",
      action: "shoot",
      group: "touch-actions",
    },
    {
      id: "touch-brake",
      label: "BRAKE",
      action: "brake",
      group: "touch-actions",
    },
    {
      id: "touch-boost",
      label: "BOOST",
      name: "Boost; launch from portal",
      action: "boost",
      group: "touch-actions",
    },
  ];
  const groups = {};
  for (const name of ["touch-drive", "touch-steering", "touch-actions"]) {
    const group = document.createElement("div");
    group.className = name;
    if (name === "touch-steering") group.id = "touch-steering-fallback";
    groups[name] = group;
    container.appendChild(group);
  }
  const canDrive = () =>
    !state.ui.paused &&
    !state.ui.showStartOverlay &&
    !state.ui.showSettingsOverlay &&
    !state.ui.showEndOverlay &&
    !state.ui.showDefeatOverlay &&
    !state.arena?.victoryPresented;
  for (const def of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = def.id;
    button.textContent = def.label;
    button.className = "touch-btn";
    button.setAttribute("aria-label", def.name || def.label);
    groups[def.group].appendChild(button);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!canDrive()) return;
      button.setPointerCapture?.(event.pointerId);
      touchPointers.set(event.pointerId, def.action);
      if (def.action === "boost") {
        const scene = state.mode === "arena" ? state.arena : state.run?.current;
        if (scene?.lockedInStart) {
          boostLaunchPointer = event.pointerId;
          touchLaunchEdge = true;
          return; // This press launches; a fresh press can boost once airborne.
        }
      }
      touch[def.action] = true;
    });
    const release = (event) => {
      const action = touchPointers.get(event.pointerId);
      touchPointers.delete(event.pointerId);
      if (boostLaunchPointer === event.pointerId) boostLaunchPointer = null;
      if (action)
        touch[action] = [...touchPointers.entries()].some(
          ([id, held]) => held === action && id !== boostLaunchPointer,
        );
      if (event.type === "pointercancel") touchLaunchEdge = false;
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, release);
  }
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
  const axLXraw = gp.axes?.[0] ?? 0; // left stick X
  const axLYraw = gp.axes?.[1] ?? 0; // left stick Y
  const axRXraw = gp.axes?.[2] ?? 0; // right stick X (common mapping)
  const axLX = applyDZ(axLXraw, gpState.dz);
  const axLY = applyDZ(axLYraw, gpState.dz);
  const axRX = applyDZ(axRXraw, gpState.dz);
  const forwardStrength = Math.max(0, -axLY); // push up to move forward
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
    (gp.buttons?.[shootButton]?.value ??
      (gp.buttons?.[shootButton]?.pressed ? 1 : 0)) ||
    0;
  const shoot = shootTriggerValue > gpState.tdz;
  const brake = !!gp.buttons?.[5]?.pressed;

  // A/Cross launch edge
  const launchNow = !!gp.buttons?.[gamepadButtons.LAUNCH]?.pressed;
  const launchEdge = launchNow && !gpState.aWas;
  gpState.aWas = launchNow;

  // Select/Back => pause (roadmap only) per new mapping
  const pauseNow = !!gp.buttons?.[gamepadButtons.PAUSE]?.pressed;
  const pauseEdge = pauseNow && !gpState.pauseWas;
  gpState.pauseWas = pauseNow;
  if (pauseEdge && state.mode !== "arena") {
    if (!state.ui.paused) openPauseOverlay();
    else closePauseOverlay();
  }

  // Start => fullscreen toggle (swapped)
  const selectNow = !!gp.buttons?.[gamepadButtons.FULLSCREEN]?.pressed;
  const selectEdge = selectNow && !gpState.selectWas;
  gpState.selectWas = selectNow;
  if (selectEdge) toggleFullscreen();

  // Minimap toggle (roadmap only)
  const minimapButtons = gamepadButtons.MINIMAP_TOGGLE || [];
  const minimapNow = minimapButtons.some((id) => !!gp.buttons?.[id]?.pressed);
  const minimapEdge = minimapNow && !gpState.minimapWas;
  gpState.minimapWas = minimapNow;
  if (minimapEdge && state.mode !== "arena") {
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
    boost,
    shoot,
    brake,
    launchEdge,
  };
}

export function pumpInput() {
  if (
    state.ui.showStartOverlay ||
    state.ui.showSettingsOverlay ||
    state.ui.showEndOverlay ||
    state.ui.showDefeatOverlay ||
    state.arena?.victoryPresented
  ) {
    clearKeys();
    return;
  }
  const gp = pollGamepad();
  if (state.ui.paused) {
    clearKeys();
    return;
  }

  const held = (action) => !!(kb[action] || touch[action]);
  const out = state.keys;
  // Keyboard fallbacks merged with gamepad
  out.left = held("left") || !!gp?.turnLeft;
  out.right = held("right") || !!gp?.turnRight;
  out.thrust = held("thrust") || !!gp?.thrust;
  out.thrustBack = held("thrustBack") || !!gp?.thrustBack;
  out.strafeLeft = held("strafeLeft") || !!gp?.strafeLeft;
  out.strafeRight = held("strafeRight") || !!gp?.strafeRight;
  out.boost = held("boost") || !!gp?.boost;
  out.shoot = held("shoot") || !!gp?.shoot;
  out.brake = held("brake") || !!gp?.brake;

  // Analog strengths (keyboard defaults keep existing feel)
  out.thrustStrength = held("thrust") ? 1 : (gp?.thrustStrength ?? 0);
  out.backStrength = held("thrustBack") ? 0.6 : (gp?.backStrength ?? 0);
  out.strafeStrength =
    held("strafeLeft") || held("strafeRight") ? 0.6 : (gp?.strafeStrength ?? 0);
  // Analog turn strength: prefer gamepad, else A/D = full turn
  if (
    !held("left") &&
    !held("right") &&
    gp &&
    typeof gp.turnStrength === "number"
  ) {
    out.turnStrength = gp.turnStrength; // signed -1..1 from stick
  } else {
    // Keyboard gives discrete full-speed turns; left = -1, right = +1
    out.turnStrength =
      held("left") === held("right") ? 0 : held("right") ? 1 : -1;
  }

  // Right-stick aim (used by movement/steering)
  out.aimActive = !!gp?.aimActive;
  out.aimAngle = gp?.aimAngle ?? out.aimAngle;
  out.aimStrength = gp?.aimStrength ?? 0.0;

  // Optional tilt-based turning
  if (state.input.touch.useTilt) {
    const axis = getTiltAxis();
    if (axis !== 0) {
      out.turnStrength = axis;
      out.left = axis < 0;
      out.right = axis > 0;
    }
  }

  // Launch edge
  if (state.settings.invertThrustAxis) {
    const thrust = out.thrust;
    out.thrust = out.thrustBack;
    out.thrustBack = thrust;
    const strength = out.thrustStrength;
    out.thrustStrength = out.backStrength;
    out.backStrength = strength;
  }
  out.launch = kb._launchEdge || touchLaunchEdge || !!gp?.launchEdge;
  touchLaunchEdge = false;
  kb._launchEdge = false; // consume edge
}

function applyDZ(v, dz) {
  return Math.abs(v) < dz ? 0 : v;
}
