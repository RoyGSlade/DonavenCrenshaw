// One selector for menus, binding capture, diagnostics and flight. Device IDs
// stay local to this browser; they are never included in shared flight settings.
const DEVICE_KEY = 'stardust.controller.device.v1';
import { standardController } from './controllerTuning.js';
export { standardController } from './controllerTuning.js';
const buttonDown = b => !!b?.pressed || (Number.isFinite(b?.value) && b.value > 0.5);

export function createControllerSelector({ preference = null, save = () => {} } = {}) {
  let selected = null, activated = false, revision = 0, previous = new Map();
  function choose(pad) {
    if (selected?.index !== pad?.index || selected?.id !== pad?.id) revision++;
    selected = pad || null;
  }
  function poll(pads = []) {
    const connected = Array.from(pads || []).filter(p => p && p.connected !== false);
    const same = connected.find(p => p.index === selected?.index && p.id === selected?.id);
    if (same) choose(same);
    if (selected && !same) { choose(null); activated = false; }
    if (preference) {
      const matches = connected.filter(p => String(p.id || '') === preference.id);
      choose(matches.find(p => p.index === preference.index) || matches[0] || null);
      activated = !!selected;
    } else {
      if (!same && !selected) choose(connected[0]);
      // A deliberate fresh button press wins over an idle/virtual first pad.
      // Once activated, other devices cannot steal flight or binding capture.
      if (!activated) {
        const active = connected.find(p => standardController(p) && Array.from(p.buttons || []).some((b, i) => buttonDown(b) && !previous.get(`${p.index}:${p.id}`)?.[i]));
        if (active) { choose(active); activated = true; }
      }
    }
    previous = new Map(connected.map(p => [`${p.index}:${p.id}`, Array.from(p.buttons || []).map(buttonDown)]));
    return { pad: selected, connected, preference, activated, revision };
  }
  function select(pad) {
    preference = pad ? { id: String(pad.id || ''), index: pad.index } : null;
    activated = !!pad; choose(pad); save(preference);
  }
  function disconnect(index) { if (selected?.index === index) { choose(null); activated = false; previous.clear(); } }
  return { poll, select, disconnect };
}

let preference = null;
try {
  const raw = JSON.parse(globalThis.localStorage?.getItem(DEVICE_KEY) || 'null');
  if (raw && typeof raw.id === 'string' && Number.isInteger(raw.index) && raw.index >= 0) preference = raw;
} catch { /* storage is optional */ }
const selector = createControllerSelector({ preference, save(value) {
  try { globalThis.localStorage?.setItem(DEVICE_KEY, JSON.stringify(value)); } catch { /* session only */ }
} });
let focused = true;
let available = typeof globalThis.navigator?.getGamepads === 'function';
let flightState = null;
let revision = 0;
export function controllerSnapshot() {
  let pads = [];
  available = typeof globalThis.navigator?.getGamepads === 'function';
  try { pads = globalThis.navigator?.getGamepads?.() || []; } catch { available = false; }
  const result = selector.poll(pads);
  revision = result.revision;
  return { ...result, available, active: focused && !globalThis.document?.hidden, flightState };
}
export function selectedController() { const snapshot = controllerSnapshot(); return snapshot.activated ? snapshot.pad : null; }
export function controllerRevision() { return revision; }
export function selectController(index) {
  const snapshot = controllerSnapshot();
  const pad = snapshot.connected.find(p => p.index === index);
  if (index !== null && !pad) return false;
  selector.select(pad || null); flightState = null;
  globalThis.dispatchEvent?.(new Event('stardust:controller-selected'));
  return true;
}
export function reportControllerState(value) { flightState = value; }
if (globalThis.window) {
  window.addEventListener('blur', () => { focused = false; });
  window.addEventListener('focus', () => { focused = true; });
  window.addEventListener('gamepaddisconnected', e => { selector.disconnect(e.gamepad.index); flightState = null; });
}
