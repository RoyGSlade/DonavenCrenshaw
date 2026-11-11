// How many canvas pixels the new game draws per screen pixel. The bench lane
// measured today's racing at full device pixel ratio: about 12 fps at phone
// size and DPR 3, 38 fps at DPR 1 (bench/BENCH.md). So every canvas in the new
// game sizes itself with renderDpr(): capped at 2, and the player can choose
// lower, down to 1. Kept per device (a phone and a desktop want different ones).
export const RENDER_KEY = 'stardust.newgame.renderScale';
export const MAX_DPR = 2;
export const RENDER_SCALES = Object.freeze([
  { id: 'auto', name: 'Sharp', blurb: 'Up to 2x on high-density screens.', cap: MAX_DPR },
  { id: 'balanced', name: 'Balanced', blurb: 'Up to 1.5x.', cap: 1.5 },
  { id: 'fast', name: 'Fast', blurb: '1x: smoothest on older phones.', cap: 1 },
]);
const BY_ID = new Map(RENDER_SCALES.map((s) => [s.id, s]));

/** The scale for a device pixel ratio and a setting id: never above 2, never above the device. */
export function renderDpr(deviceDpr = 1, setting = 'auto') {
  const device = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  const cap = (BY_ID.get(setting) || BY_ID.get('auto')).cap;
  return Math.min(device, cap, MAX_DPR);
}

export function readRenderScale(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(RENDER_KEY); return BY_ID.has(v) ? v : 'auto'; } catch { return 'auto'; }
}

export function writeRenderScale(id, storage = globalThis.localStorage) {
  if (!BY_ID.has(id)) return false;
  try { storage?.setItem(RENDER_KEY, id); } catch { /* kept for this page only */ }
  globalThis.dispatchEvent?.(new CustomEvent('stardust:render-scale', { detail: { id } }));
  return true;
}
