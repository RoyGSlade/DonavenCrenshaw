// Per-device flight preferences: the minimap (shown, zoom, icon size), auto
// fire, which tracks' intro flythrough this browser has already seen, and the
// HUD/controls layout for touch and for desktop. Stored in this browser only;
// phone and desktop keep their own.
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
export const minimapZoom = () => MINIMAP_ZOOMS[Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, flightSettings().minimap.zoomIndex | 0))];
export const minimapIconScale = () => ICON_SCALES[Math.max(0, Math.min(ICON_SCALES.length - 1, flightSettings().minimap.iconIndex | 0))];
