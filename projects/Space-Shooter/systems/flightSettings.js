// Per-device flight preferences: the minimap (shown, zoom, icon size), auto
// fire, which tracks' intro flythrough this browser has already seen, and the
// HUD/controls layout for touch and for desktop. Stored in this browser only;
// phone and desktop keep their own.
const KEY = 'stardust.flight.v1';

export const MINIMAP_ZOOMS = Object.freeze([1, 1.5, 2, 3, 4]);
export const ICON_SCALES = Object.freeze([0.6, 0.8, 1, 1.3, 1.7]);

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

export const minimapZoom = () => MINIMAP_ZOOMS[Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, flightSettings().minimap.zoomIndex | 0))];
export const minimapIconScale = () => ICON_SCALES[Math.max(0, Math.min(ICON_SCALES.length - 1, flightSettings().minimap.iconIndex | 0))];
