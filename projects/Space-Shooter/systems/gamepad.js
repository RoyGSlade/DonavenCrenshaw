/** Standard Gamepad mapping shared by both flight modes; no DOM or navigator dependency. */
export const gamepadMapping = {
  BUTTONS: {
    LAUNCH: 0,
    BOOST_TOGGLE: 3,
    BOOST_HOLD: 4,
    BRAKE: 5,
    TRAP: 6,
    SHOOT: 7,
    PAUSE: 8,
    FULLSCREEN: 9,
    MINIMAP_TOGGLE: [13],
  },
};
const finite = (value, min, max) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
const neutral = () => ({
  thrust: false,
  thrustBack: false,
  strafeLeft: false,
  strafeRight: false,
  turnLeft: false,
  turnRight: false,
  thrustStrength: 0,
  backStrength: 0,
  strafeStrength: 0,
  strafe: 0,
  turnStrength: 0,
  boost: false,
  shoot: false,
  trap: false,
  brake: false,
  launchEdge: false,
  pauseEdge: false,
  fullscreenEdge: false,
  minimapEdge: false,
  cameraEdge: false,
});
// The player's bindings (systems/keybinds.js) laid over the standard mapping.
// A button taken by a player binding leaves the fixed trap button alone only
// if it is a different button.
function resolve(bindings) {
  const B = gamepadMapping.BUTTONS;
  if (!bindings?.pad) {
    return {
      launch: B.LAUNCH, boostToggle: B.BOOST_TOGGLE, boostHold: B.BOOST_HOLD, brake: B.BRAKE, trap: B.TRAP, shoot: B.SHOOT,
      pause: B.PAUSE, fullscreen: B.FULLSCREEN, minimap: B.MINIMAP_TOGGLE[0], camera: null, thrust: null, thrustBack: null, sticks: 'split',
    };
  }
  const pad = bindings.pad;
  const taken = new Set(Object.values(pad).filter((v) => v !== null));
  return { ...pad, trap: taken.has(B.TRAP) ? null : B.TRAP, sticks: bindings.sticks === 'left-turn' ? 'left-turn' : 'split' };
}
/**
 * getBindings: optional () => { pad: { action: buttonIndex | null }, sticks }.
 * Without it the reader uses the standard mapping above, unchanged.
 */
export function createGamepadReader({
  stickDeadzone = 0.2,
  triggerDeadzone = 0.08,
  getBindings = null,
} = {}) {
  const dz = finite(stickDeadzone, 0, 1),
    tdz = finite(triggerDeadzone, 0, 1);
  let index = null,
    awaitingNeutral = false,
    boostToggle = false,
    previous = {};
  function suspend() {
    awaitingNeutral = true;
    boostToggle = false;
    previous = {};
  }
  function disconnect(disconnectedIndex) {
    if (disconnectedIndex === index) {
      index = null;
      suspend();
    }
  }
  function poll(pads = [], { active = true, gameplayActive = true } = {}) {
    if (!gameplayActive) boostToggle = false;
    const connected = Array.from(pads || []).filter(
      (p) => p && p.connected !== false,
    );
    let pad = connected.find((p) => p.index === index);
    if (!pad) {
      if (index !== null) suspend();
      pad = connected[0];
      index = pad?.index ?? null;
    }
    if (!active) {
      suspend();
      return neutral();
    }
    if (!pad) return neutral();
    const buttons = resolve(getBindings?.());
    const axis = (i) => {
      const v = finite(pad.axes?.[i], -1, 1);
      return Math.abs(v) < dz ? 0 : v;
    };
    const value = (i) =>
      i == null ? 0 : finite(
        pad.buttons?.[i]?.value ?? (pad.buttons?.[i]?.pressed ? 1 : 0),
        0,
        1,
      );
    const pressed = (i) => i != null && (!!pad.buttons?.[i]?.pressed || value(i) > 0.5);
    const lx = axis(0),
      ly = axis(1),
      rx = axis(2);
    // Stick layout: which stick turns and which one strafes.
    const turnAxis = buttons.sticks === 'left-turn' ? lx : rx;
    const strafeAxis = buttons.sticks === 'left-turn' ? rx : lx;
    // Thrust and reverse can also sit on a button or an analog trigger.
    const gas = value(buttons.thrust) > tdz ? value(buttons.thrust) : 0;
    const reverse = value(buttons.thrustBack) > tdz ? value(buttons.thrustBack) : 0;
    const now = {
      launch: pressed(buttons.launch),
      pause: pressed(buttons.pause),
      fullscreen: pressed(buttons.fullscreen),
      minimap: pressed(buttons.minimap),
      camera: pressed(buttons.camera),
      y: pressed(buttons.boostToggle),
    };
    const anyHeld =
      lx !== 0 ||
      ly !== 0 ||
      rx !== 0 ||
      gas > 0 ||
      reverse > 0 ||
      value(buttons.shoot) > tdz ||
      value(buttons.trap) > tdz ||
      pressed(buttons.brake) ||
      pressed(buttons.boostHold) ||
      Object.values(now).some(Boolean);
    if (awaitingNeutral) {
      if (!anyHeld) {
        awaitingNeutral = false;
        previous = now;
      }
      return neutral();
    }
    const edge = (key) => now[key] && !previous[key];
    if (gameplayActive && edge("y")) boostToggle = !boostToggle;
    const thrustStrength = Math.max(Math.max(0, -ly), gas);
    const backStrength = Math.max(Math.max(0, ly), reverse) * 0.6;
    const result = {
      thrust: thrustStrength > 0,
      thrustBack: backStrength > 0,
      strafeLeft: strafeAxis < -dz,
      strafeRight: strafeAxis > dz,
      turnLeft: turnAxis < -dz,
      turnRight: turnAxis > dz,
      thrustStrength,
      backStrength,
      strafeStrength: Math.abs(strafeAxis) * 0.6,
      strafe: Math.abs(strafeAxis) > dz ? strafeAxis * 0.6 : 0,
      turnStrength: turnAxis,
      boost: pressed(buttons.boostHold) || boostToggle,
      shoot: value(buttons.shoot) > tdz,
      trap: value(buttons.trap) > tdz,
      brake: pressed(buttons.brake),
      launchEdge: edge("launch"),
      pauseEdge: edge("pause"),
      fullscreenEdge: edge("fullscreen"),
      minimapEdge: edge("minimap"),
      cameraEdge: edge("camera"),
    };
    previous = now;
    // Menus retain navigation edges, but cannot queue gameplay actions for resume.
    if (!gameplayActive) return {
      ...neutral(), pauseEdge: result.pauseEdge, fullscreenEdge: result.fullscreenEdge,
      minimapEdge: result.minimapEdge,
    };
    return result;
  }
  return {
    poll,
    suspend,
    disconnect,
    getState: () => ({ index, awaitingNeutral, boostToggle }),
  };
}
