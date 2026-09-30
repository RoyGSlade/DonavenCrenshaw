// src/roadmap/input.js
import { state, config } from "./state.js";
import { openPauseOverlay, closePauseOverlay } from "./ui/overlays.js";
import { toggleFullscreen } from "./ui/graphics.js";
import { getTiltAxis } from "./systems/tilt.js";
import { createGamepadReader, gamepadMapping } from "./systems/gamepad.js";
import { toast } from "./ui/hud.js";
import { touchInput } from "./ui/touchPad.js";
import { wantsAutoFire } from "./systems/autofire.js";
import { flightSettings } from "./systems/flightSettings.js";
export { gamepadMapping };
const gamepad = createGamepadReader({
  stickDeadzone: config.GAMEPAD?.STICK_DEADZONE ?? 0.2,
  triggerDeadzone: config.GAMEPAD?.TRIGGER_DEADZONE ?? 0.08,
});
let inputFocused = true;
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

export async function bindInput() {
  if (isBound) return;
  isBound = true;

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp, { passive: true });
  window.addEventListener("mousedown", onMouseDown, { passive: true });
  window.addEventListener("mouseup", onMouseUp, { passive: true });
  window.addEventListener(
    "blur",
    () => {
      inputFocused = false;
      clearKeys();
    },
    { passive: true },
  );
  window.addEventListener("focus", () => {
    inputFocused = true;
  });
  window.addEventListener("stardust:clear-input", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearKeys();
  });

  window.addEventListener(
    "gamepaddisconnected",
    (event) => gamepad.disconnect(event.gamepad.index),
    { passive: true },
  );
  await bindTouchControls();
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
  if (e.repeat) return;
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

function clearKeys(resetGamepad = true) {
  if (resetGamepad !== false) gamepad.suspend();
  for (const key of Object.keys(touch)) touch[key] = false;
  touchPointers.clear();
  touchLaunchEdge = false;
  boostLaunchPointer = null;
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
  const gp = gamepad.poll(navigator.getGamepads?.() || [], {
    active: inputFocused && !document.hidden,
    gameplayActive: !state.ui.paused,
  });
  if (gp.pauseEdge && state.mode !== "arena") {
    if (!state.ui.paused) openPauseOverlay();
    else closePauseOverlay();
  }
  if (gp.fullscreenEdge)
    toggleFullscreen().then((result) => {
      if (result && !result.ok) toast(result.message);
    });
  if (gp.minimapEdge && state.mode !== "arena")
    state.ui.showMinimap = !state.ui.showMinimap;
  return gp;
}

export function pumpInput() {
  if (!inputFocused || document.hidden) {
    clearKeys();
    return;
  }
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
    clearKeys(false);
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

  // The touch joystick, wheel, Brake and Boost (ui/touchPad.js), merged with the rest.
  if (state.input.touch.active) {
    const t = touchInput;
    if (t.thrust > out.thrustStrength) out.thrustStrength = t.thrust;
    if (t.back > (out.backStrength || 0)) out.backStrength = t.back;
    out.thrust = out.thrust || t.thrust > 0;
    out.thrustBack = out.thrustBack || t.back > 0;
    if (Math.abs(t.strafe) > 0.01) {
      out.strafeLeft = t.strafe < 0;
      out.strafeRight = t.strafe > 0;
      out.strafeStrength = Math.abs(t.strafe);
    }
    if (Math.abs(t.turn) > 0.001 && !state.input.touch.useTilt) out.turnStrength = t.turn;
    out.brake = out.brake || t.brake;
    out.boost = out.boost || t.boost;
  }

  // Auto fire (Settings): hold fire while something breakable is ahead of the nose.
  if (!out.shoot && flightSettings().autoFire && state.mode === "roadmap") {
    const scene = state.run?.current;
    out.shoot = wantsAutoFire(scene, scene?.player);
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
  out.launch = kb._launchEdge || touchLaunchEdge || touchInput.launchEdge || !!gp?.launchEdge;
  touchLaunchEdge = false;
  touchInput.launchEdge = false;
  kb._launchEdge = false; // consume edge
}
