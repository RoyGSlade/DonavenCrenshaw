// Canvas sizing and the camera, shared by the walk, fight and flight views.
// Every canvas uses renderDpr (INTERFACES section 8: capped at 2, the player's
// render-scale setting can take it to 1 on phones).
import { renderDpr, readRenderScale } from '../renderScale.js';

/** Sizes the canvas to its box at the render scale. Returns { w, h, dpr } (CSS px). */
export function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  const dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  return { w, h, dpr };
}

/** World px per CSS px for a view: interiors read closer, exteriors wider. Phones zoom out a little. */
export function viewZoom(w, h, kind = 'interior') {
  // About 16 tiles across on a desktop, 9 on a portrait phone (bodies stay readable).
  const want = kind === 'exterior' ? 760 : 620;
  const across = w < 600 ? 440 : want;
  return Math.max(0.6, Math.min(1.35, Math.min(w, h * 1.5) / across));
}

/** Camera top-left in world px: follows (x, y), clamped so the map edge stays on screen (or centred if smaller). */
export function cameraFor(map, x, y, w, h, zoom) {
  const vw = w / zoom, vh = h / zoom;
  const cx = map.w <= vw ? (map.w - vw) / 2 : Math.max(0, Math.min(map.w - vw, x - vw / 2));
  const cy = map.h <= vh ? (map.h - vh) / 2 : Math.max(0, Math.min(map.h - vh, y - vh / 2));
  return { x: cx, y: cy, zoom, vw, vh };
}
