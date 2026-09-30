// Key and controller bindings. Pure data and helpers (no DOM): input.js reads
// them, ui/settingsPanel.js edits them, systems/flightSettings.js stores them
// per device and carries them in share codes.
//
// A keyboard or mouse input is a token: a letter or digit in lower case ("w"),
// a named key as the browser reports it ("Shift", "ArrowUp"), "Space", or a
// mouse button ("Mouse0" left, "Mouse1" middle, "Mouse2" right, "Mouse3/4" side).
// The mouse can fire, boost and so on; it never steers.

/** Keyboard and mouse actions, in the order the settings list shows them. */
export const KEY_ACTIONS = Object.freeze([
  ['thrust', 'Thrust'],
  ['thrustBack', 'Reverse'],
  ['left', 'Turn left'],
  ['right', 'Turn right'],
  ['strafeLeft', 'Strafe left'],
  ['strafeRight', 'Strafe right'],
  ['boost', 'Boost'],
  ['brake', 'Brake'],
  ['shoot', 'Fire'],
  ['launch', 'Launch'],
  ['camera', 'Switch camera'],
  ['minimap', 'Minimap'],
  ['fullscreen', 'Fullscreen'],
]);
export const KEYS_PER_ACTION = 2;
export const DEFAULT_KEYS = Object.freeze({
  thrust: ['w', 'ArrowUp'],
  thrustBack: ['s', 'ArrowDown'],
  left: ['a', 'ArrowLeft'],
  right: ['d', 'ArrowRight'],
  strafeLeft: ['q'],
  strafeRight: ['e'],
  boost: ['Shift'],
  brake: ['x'],
  shoot: ['Control', 'Mouse0'],
  launch: ['Space'],
  camera: ['c'],
  minimap: ['m'],
  fullscreen: ['f'],
});
// Escape always pauses and cancels a rebind, so it can never be bound away.
export const RESERVED_KEYS = Object.freeze(['Escape']);

/** Controller actions: a button index on the standard gamepad layout, or null for unbound. */
export const PAD_ACTIONS = Object.freeze([
  ['launch', 'Launch'],
  ['boostHold', 'Boost (hold)'],
  ['boostToggle', 'Boost (toggle)'],
  ['brake', 'Brake'],
  ['shoot', 'Fire'],
  ['thrust', 'Thrust (button or trigger)'],
  ['thrustBack', 'Reverse (button or trigger)'],
  ['camera', 'Switch camera'],
  ['minimap', 'Minimap'],
  ['pause', 'Pause'],
  ['fullscreen', 'Fullscreen'],
]);
export const DEFAULT_PAD = Object.freeze({
  launch: 0, boostToggle: 3, boostHold: 4, brake: 5, shoot: 7,
  thrust: null, thrustBack: null, camera: 2, minimap: 13, pause: 8, fullscreen: 9,
});
// 'split': left stick thrust/reverse and strafe, right stick turns (the original).
// 'left-turn': left stick turns and thrusts, right stick strafes.
export const STICK_LAYOUTS = Object.freeze(['split', 'left-turn']);
export const PAD_BUTTON_COUNT = 17;
const PAD_NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'Back / Share', 'Start / Options', 'Left stick click', 'Right stick click', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];

const TOKEN = /^(?:[a-z0-9]|[A-Z][A-Za-z0-9]{1,19}|Mouse[0-4]|[`\-=[\]\\;',./])$/;
export const isKeyToken = (token) => typeof token === 'string' && TOKEN.test(token) && !RESERVED_KEYS.includes(token);

/** A keydown event → its token, or null for keys that cannot be bound. */
export function keyToken(event) {
  const key = event?.key;
  if (typeof key !== 'string' || !key || key === 'Dead' || key === 'Unidentified') return null;
  const token = key === ' ' ? 'Space' : key.length === 1 ? key.toLowerCase() : key;
  return TOKEN.test(token) ? token : null;
}
export const mouseToken = (button) => (Number.isInteger(button) && button >= 0 && button <= 4 ? `Mouse${button}` : null);

const KEY_LABELS = { Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Control: 'Ctrl', Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };
export const keyLabel = (token) => (token == null ? '—' : KEY_LABELS[token] || (token.length === 1 ? token.toUpperCase() : token));
export const padLabel = (index) => (index == null ? '—' : PAD_NAMES[index] || `Button ${index}`);

/** Saved bindings (possibly partial or hand-edited) → a complete, valid set. */
export function normalizeBinds(raw) {
  const keys = {}, pad = {};
  for (const [action] of KEY_ACTIONS) {
    const saved = raw?.keys?.[action];
    keys[action] = Array.isArray(saved) ? [...new Set(saved.filter(isKeyToken))].slice(0, KEYS_PER_ACTION) : [...DEFAULT_KEYS[action]];
  }
  for (const [action] of PAD_ACTIONS) {
    const saved = raw?.pad?.[action];
    pad[action] = saved === null ? null : Number.isInteger(saved) && saved >= 0 && saved < PAD_BUTTON_COUNT ? saved : DEFAULT_PAD[action];
  }
  // One button, one action: a hand-edited duplicate keeps its first use.
  const used = new Set();
  for (const [action] of PAD_ACTIONS) {
    if (pad[action] === null) continue;
    if (used.has(pad[action])) pad[action] = null; else used.add(pad[action]);
  }
  return { keys, pad, sticks: STICK_LAYOUTS.includes(raw?.sticks) ? raw.sticks : 'split' };
}
export const defaultBinds = () => normalizeBinds(null);

/**
 * Bind a key or mouse button to a slot of an action. The token is taken from
 * whatever else used it. Returns { binds, took } where took names the action
 * that lost it (or null). slot past the end appends.
 */
export function bindKey(binds, action, slot, token) {
  const next = normalizeBinds(binds);
  if (!isKeyToken(token) || !(action in next.keys)) return { binds: next, took: null };
  let took = null;
  for (const [other, list] of Object.entries(next.keys)) {
    const at = list.indexOf(token);
    if (at < 0) continue;
    if (other !== action) took = other;
    list.splice(at, 1);
  }
  const list = next.keys[action];
  if (slot >= 0 && slot < list.length) list[slot] = token; else list.push(token);
  next.keys[action] = list.slice(0, KEYS_PER_ACTION);
  return { binds: next, took };
}
export function clearKey(binds, action, slot) {
  const next = normalizeBinds(binds);
  next.keys[action]?.splice(slot, 1);
  return next;
}
/** Bind a controller button (or null to unbind). The button leaves any other action. */
export function bindPad(binds, action, button) {
  const next = normalizeBinds(binds);
  if (!(action in next.pad)) return { binds: next, took: null };
  let took = null;
  if (button !== null) {
    if (!Number.isInteger(button) || button < 0 || button >= PAD_BUTTON_COUNT) return { binds: next, took: null };
    for (const other of Object.keys(next.pad)) if (other !== action && next.pad[other] === button) { next.pad[other] = null; took = other; }
  }
  next.pad[action] = button;
  return { binds: next, took };
}

export const actionName = (action, list = KEY_ACTIONS) => list.find(([id]) => id === action)?.[1] || action;

/** "W/↑ thrust · A/← turn left · …" for the on-screen hint line. */
export function keyHint(binds, actions = ['thrust', 'thrustBack', 'left', 'right', 'strafeLeft', 'strafeRight', 'launch', 'boost', 'brake', 'shoot']) {
  const b = normalizeBinds(binds);
  const parts = actions.filter((a) => b.keys[a]?.length).map((a) => `${keyLabel(b.keys[a][0])} ${actionName(a).toLowerCase()}`);
  return `${parts.join(' · ')} · Esc pause`;
}
