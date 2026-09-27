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
});
export function createGamepadReader({
  stickDeadzone = 0.2,
  triggerDeadzone = 0.08,
} = {}) {
  const dz = finite(stickDeadzone, 0, 1),
    tdz = finite(triggerDeadzone, 0, 1),
    buttons = gamepadMapping.BUTTONS;
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
    const axis = (i) => {
      const v = finite(pad.axes?.[i], -1, 1);
      return Math.abs(v) < dz ? 0 : v;
    };
    const value = (i) =>
      finite(
        pad.buttons?.[i]?.value ?? (pad.buttons?.[i]?.pressed ? 1 : 0),
        0,
        1,
      );
    const pressed = (i) => !!pad.buttons?.[i]?.pressed || value(i) > 0.5;
    const lx = axis(0),
      ly = axis(1),
      rx = axis(2);
    const now = {
      launch: pressed(buttons.LAUNCH),
      pause: pressed(buttons.PAUSE),
      fullscreen: pressed(buttons.FULLSCREEN),
      minimap: buttons.MINIMAP_TOGGLE.some(pressed),
      y: pressed(buttons.BOOST_TOGGLE),
    };
    const anyHeld =
      lx !== 0 ||
      ly !== 0 ||
      rx !== 0 ||
      value(buttons.SHOOT) > tdz ||
      value(buttons.TRAP) > tdz ||
      pressed(buttons.BRAKE) ||
      pressed(buttons.BOOST_HOLD) ||
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
    const result = {
      thrust: ly < 0,
      thrustBack: ly > 0,
      strafeLeft: lx < -dz,
      strafeRight: lx > dz,
      turnLeft: rx < -dz,
      turnRight: rx > dz,
      thrustStrength: Math.max(0, -ly),
      backStrength: Math.max(0, ly) * 0.6,
      strafeStrength: Math.abs(lx) * 0.6,
      strafe: Math.abs(lx) > dz ? lx * 0.6 : 0,
      turnStrength: rx,
      boost: pressed(buttons.BOOST_HOLD) || boostToggle,
      shoot: value(buttons.SHOOT) > tdz,
      trap: value(buttons.TRAP) > tdz,
      brake: pressed(buttons.BRAKE),
      launchEdge: edge("launch"),
      pauseEdge: edge("pause"),
      fullscreenEdge: edge("fullscreen"),
      minimapEdge: edge("minimap"),
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
