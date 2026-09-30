// Per-device flight preferences: the minimap (shown, zoom, icon size), auto
// fire, which tracks' intro flythrough this browser has already seen, and the
// HUD/controls layout for touch and for desktop. Stored in this browser only;
// phone and desktop keep their own.
import { normalizeBinds, defaultBinds, KEY_ACTIONS, PAD_ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, STICK_LAYOUTS } from './keybinds.js';

const KEY = 'stardust.flight.v1';

export const MINIMAP_ZOOMS = Object.freeze([1, 1.5, 2, 3, 4]);
export const ICON_SCALES = Object.freeze([0.6, 0.8, 1, 1.3, 1.7]);
// Tilt steering. Dead zone: degrees of tilt ignored around centre. Max tilt:
// degrees of tilt for a full-lock turn. Sensitivity: the curve between the two
// (low = gentle near centre, high = quick off centre), as the EXPO value.
export const TILT_DEAD_ZONES = Object.freeze([0, 1, 2, 3, 4, 6, 8, 10, 12]);
export const TILT_MAX_TILTS = Object.freeze([15, 20, 25, 30, 35, 40, 45, 50, 60]);
export const TILT_EXPOS = Object.freeze([0.9, 0.65, 0.35, 0.15, 0, -0.3, -0.6]);
export const TILT_DEFAULTS = Object.freeze({ deadIndex: 3, maxIndex: 5, sensIndex: 2 });
// Camera tuning, named after the settings racing-game players already know.
// - Field of view: how much of the track fits on screen (both camera modes).
// - Distance: how far down the screen the ship sits in the behind-ship view,
//   so how much of the view is ahead of it.
// - Stiffness: 1 keeps the camera fixed; lower lets it pull back and widen as
//   the ship speeds up.
// - Swivel speed: how fast the behind-ship view turns to follow the ship.
// - Transition speed: how fast the view moves when switching camera modes.
export const CAMERA_FOVS = Object.freeze([0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5]);
export const CAMERA_DISTANCES = Object.freeze([0.55, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9]);
export const CAMERA_STIFFNESS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
export const CAMERA_SWIVELS = Object.freeze([4, 6, 9, 13, 20, 40]);
export const CAMERA_TRANSITIONS = Object.freeze([0.8, 1.6, 3, 6]);
export const CAMERA_DEFAULTS = Object.freeze({ fovIndex: 2, distanceIndex: 2, stiffnessIndex: 1, swivelIndex: 2, transitionIndex: 1 });

export function isTouchDevice(win = globalThis) {
  try {
    return !!(win.matchMedia?.('(any-pointer: coarse)').matches) || (win.navigator?.maxTouchPoints || 0) > 0 && !win.matchMedia?.('(any-pointer: fine)').matches;
  } catch { return false; }
}

function defaults(touch) {
  return {
    minimap: { show: !touch, zoomIndex: 0, iconIndex: 2 },
    // Auto fire replaces the fire button on phones; desktop keeps its fire key.
    autoFire: touch,
    // 'track': the screen keeps the track's orientation. 'behind': the view
    // turns with the ship, so it always points up the screen.
    cameraMode: 'track',
    camera: { ...CAMERA_DEFAULTS },
    binds: defaultBinds(),
    tilt: { ...TILT_DEFAULTS },
    introSeen: {},
    layouts: { touch: null, desktop: null },
  };
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

let cached = null;
export function flightSettings() {
  if (cached) return cached;
  const base = defaults(isTouchDevice());
  try {
    const raw = storage()?.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object') {
      cached = {
        ...base,
        ...saved,
        minimap: { ...base.minimap, ...(saved.minimap || {}) },
        tilt: { ...base.tilt, ...(saved.tilt || {}) },
        camera: { ...base.camera, ...(saved.camera || {}) },
        binds: normalizeBinds(saved.binds),
        introSeen: { ...(saved.introSeen || {}) },
        layouts: { ...base.layouts, ...(saved.layouts || {}) },
      };
      return cached;
    }
  } catch { /* fall through to defaults */ }
  cached = base;
  return cached;
}

export function saveFlightSettings() {
  try { storage()?.setItem(KEY, JSON.stringify(flightSettings())); } catch { /* private window */ }
}

export function updateFlightSettings(mutate) {
  mutate(flightSettings());
  saveFlightSettings();
  globalThis.dispatchEvent?.(new CustomEvent('stardust:flightSettings'));
}

const pick = (list, index, fallback) => list[Number.isInteger(index) && index >= 0 && index < list.length ? index : fallback];
/** The player's tilt tuning: { deadZoneDeg, fullLockDeg, expo }. */
export const tiltTuning = (settings = flightSettings()) => ({
  deadZoneDeg: pick(TILT_DEAD_ZONES, settings.tilt?.deadIndex, TILT_DEFAULTS.deadIndex),
  fullLockDeg: pick(TILT_MAX_TILTS, settings.tilt?.maxIndex, TILT_DEFAULTS.maxIndex),
  expo: pick(TILT_EXPOS, settings.tilt?.sensIndex, TILT_DEFAULTS.sensIndex),
});
export const cameraBehind = () => flightSettings().cameraMode === 'behind';
/** The player's camera tuning: { fov, distance, stiffness, swivel, transition }. */
export const cameraTuning = (settings = flightSettings()) => ({
  fov: pick(CAMERA_FOVS, settings.camera?.fovIndex, CAMERA_DEFAULTS.fovIndex),
  distance: pick(CAMERA_DISTANCES, settings.camera?.distanceIndex, CAMERA_DEFAULTS.distanceIndex),
  stiffness: pick(CAMERA_STIFFNESS, settings.camera?.stiffnessIndex, CAMERA_DEFAULTS.stiffnessIndex),
  swivel: pick(CAMERA_SWIVELS, settings.camera?.swivelIndex, CAMERA_DEFAULTS.swivelIndex),
  transition: pick(CAMERA_TRANSITIONS, settings.camera?.transitionIndex, CAMERA_DEFAULTS.transitionIndex),
});
/** The player's key and controller bindings (always complete and valid). */
export const binds = () => flightSettings().binds;
export const minimapZoom = () => MINIMAP_ZOOMS[Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, flightSettings().minimap.zoomIndex | 0))];
export const minimapIconScale = () => ICON_SCALES[Math.max(0, Math.min(ICON_SCALES.length - 1, flightSettings().minimap.iconIndex | 0))];

// --- Share code ---------------------------------------------------------------
// Flight settings as a short text code a player can post and another can paste:
// minimap, auto fire, tilt tuning and every saved layout. "SD1-" + base64url of
// compact JSON. Layout numbers are thousandths.
const CODE_PREFIX = 'SD1-';
const LAYOUT_KEYS = { d: 'desktop', l: 'touch-landscape', p: 'touch-portrait' };
const WIDGET_ID = /^[a-z][a-z0-9-]{0,23}$/;
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

export function encodeSettingsCode(settings = flightSettings()) {
  const layouts = {};
  for (const [short, mode] of Object.entries(LAYOUT_KEYS)) {
    const saved = settings.layouts?.[mode];
    if (!saved || typeof saved !== 'object') continue;
    const out = {};
    for (const [id, spot] of Object.entries(saved))
      if (WIDGET_ID.test(id) && spot && [spot.x, spot.y, spot.s].every(Number.isFinite)) out[id] = [Math.round(spot.x * 1000), Math.round(spot.y * 1000), Math.round(spot.s * 1000)];
    if (Object.keys(out).length) layouts[short] = out;
  }
  const tilt = { ...TILT_DEFAULTS, ...settings.tilt };
  const cam = { ...CAMERA_DEFAULTS, ...settings.camera };
  const b = normalizeBinds(settings.binds);
  const keys = {}, pad = {};
  for (const [action] of KEY_ACTIONS) if (JSON.stringify(b.keys[action]) !== JSON.stringify(DEFAULT_KEYS[action])) keys[action] = b.keys[action];
  for (const [action] of PAD_ACTIONS) if (b.pad[action] !== DEFAULT_PAD[action]) pad[action] = b.pad[action];
  const data = { v: 1, m: [settings.minimap.show ? 1 : 0, settings.minimap.zoomIndex | 0, settings.minimap.iconIndex | 0], a: settings.autoFire ? 1 : 0, c: settings.cameraMode === 'behind' ? 1 : 0, t: [tilt.deadIndex | 0, tilt.maxIndex | 0, tilt.sensIndex | 0], l: layouts, cs: [cam.fovIndex | 0, cam.distanceIndex | 0, cam.stiffnessIndex | 0, cam.swivelIndex | 0, cam.transitionIndex | 0] };
  if (Object.keys(keys).length) data.k = keys;
  if (Object.keys(pad).length) data.g = pad;
  if (b.sticks !== 'split') data.s = STICK_LAYOUTS.indexOf(b.sticks);
  return CODE_PREFIX + btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A pasted code → the settings it holds, every value range-checked, or null if it is not a valid code. */
export function decodeSettingsCode(code) {
  try {
    const text = String(code ?? '').trim();
    if (!text.startsWith(CODE_PREFIX) || text.length > 6000) return null;
    const data = JSON.parse(atob(text.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')));
    if (!data || data.v !== 1 || !Array.isArray(data.m) || !Array.isArray(data.t)) return null;
    const zoomIndex = int(data.m[1], 0, MINIMAP_ZOOMS.length - 1), iconIndex = int(data.m[2], 0, ICON_SCALES.length - 1);
    const deadIndex = int(data.t[0], 0, TILT_DEAD_ZONES.length - 1), maxIndex = int(data.t[1], 0, TILT_MAX_TILTS.length - 1), sensIndex = int(data.t[2], 0, TILT_EXPOS.length - 1);
    if ([zoomIndex, iconIndex, deadIndex, maxIndex, sensIndex].includes(null)) return null;
    const layouts = {};
    for (const [short, mode] of Object.entries(LAYOUT_KEYS)) {
      const saved = data.l?.[short];
      if (!saved || typeof saved !== 'object') continue;
      const out = {};
      for (const [id, spot] of Object.entries(saved).slice(0, 24)) {
        if (!WIDGET_ID.test(id) || !Array.isArray(spot)) continue;
        const x = int(spot[0], 0, 1000), y = int(spot[1], 0, 1000), sc = int(spot[2], 100, 4000);
        if (x === null || y === null || sc === null) continue;
        out[id] = { x: x / 1000, y: y / 1000, s: sc / 1000 };
      }
      if (Object.keys(out).length) layouts[mode] = out;
    }
    // Codes made before the camera setting existed carry no "c": leave the camera alone.
    const cameraMode = data.c === 1 ? 'behind' : data.c === 0 ? 'track' : undefined;
    const out = { minimap: { show: data.m[0] === 1, zoomIndex, iconIndex }, autoFire: data.a === 1, tilt: { deadIndex, maxIndex, sensIndex }, layouts, ...(cameraMode ? { cameraMode } : {}) };
    // Camera tuning and bindings arrived later; a code without them leaves them alone.
    if (Array.isArray(data.cs)) {
      const lists = [CAMERA_FOVS, CAMERA_DISTANCES, CAMERA_STIFFNESS, CAMERA_SWIVELS, CAMERA_TRANSITIONS];
      const idx = lists.map((list, i) => int(data.cs[i], 0, list.length - 1));
      if (idx.includes(null)) return null;
      out.camera = { fovIndex: idx[0], distanceIndex: idx[1], stiffnessIndex: idx[2], swivelIndex: idx[3], transitionIndex: idx[4] };
      // normalizeBinds drops anything that is not a known action with valid keys or buttons.
      out.binds = normalizeBinds({
        keys: data.k && typeof data.k === 'object' ? data.k : {},
        pad: data.g && typeof data.g === 'object' ? data.g : {},
        sticks: STICK_LAYOUTS[data.s] ?? 'split',
      });
    }
    return out;
  } catch { return null; }
}

/** Apply a pasted code. Layouts the code does not carry are left as they are. Returns false for a bad code. */
export function applySettingsCode(code) {
  const next = decodeSettingsCode(code);
  if (!next) return false;
  updateFlightSettings((s) => {
    s.minimap = next.minimap;
    s.autoFire = next.autoFire;
    s.tilt = next.tilt;
    if (next.cameraMode) s.cameraMode = next.cameraMode;
    if (next.camera) s.camera = next.camera;
    if (next.binds) s.binds = next.binds;
    s.layouts = { ...(s.layouts || {}), ...next.layouts };
  });
  return true;
}
