// Canvas sizing and the camera, shared by the walk, fight and flight views.
// Every canvas uses renderDpr (INTERFACES section 8: capped at 2, the player's
// render-scale setting can take it to 1 on phones).
import { renderDpr, readRenderScale } from '../renderScale.js';
import { lookFor } from './look/look.js';

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
  const look = lookFor(map);
  if (look?.camera) return lookCamera(map, look.camera, x, y, w, h, zoom);
  const vw = w / zoom, vh = h / zoom;
  const cx = map.w <= vw ? (map.w - vw) / 2 : Math.max(0, Math.min(map.w - vw, x - vw / 2));
  const cy = map.h <= vh ? (map.h - vh) / 2 : Math.max(0, Math.min(map.h - vh, y - vh / 2));
  return { x: cx, y: cy, zoom, vw, vh };
}

/**
 * The camera for a map with a look block (look.camera in looks.json or the map):
 * on a wide screen the whole room fits with a thin margin of outside hull, under
 * a strip kept for the header (`top`, CSS px); where that would make a tile
 * smaller than `minTilePx` (phones) it follows the captain at `tilePx` per tile.
 * world.js asks for zoom * 0.9 in a fight; that ratio carries over.
 */
function lookCamera(map, lc, x, y, w, h, zoom) {
  const T = map.tile, m = (lc.margin ?? 0.5) * T, top = lc.top ?? 0;
  const ratio = zoom / viewZoom(w, h, map.kind);
  // launch doors hook: a room with vestibule stubs (map.def.roomBox, tiles [x0, y0, x1, y1]) is framed by the room alone, so
  // adding entries never shrinks a room's approved view; the view widens only while you stand out in a stub.
  const rb = map.def?.roomBox, bx0 = rb ? rb[0] * T : 0, by0 = rb ? rb[1] * T : 0, bx1 = rb ? rb[2] * T : map.w, by1 = rb ? rb[3] * T : map.h;
  const fit = Math.min(w / (bx1 - bx0 + m * 2), (h - top) / (by1 - by0 + m * 2));
  // maxTilePx (optional): a small room is not blown up past the art's own size; it sits centred in its hull.
  const z = Math.min(fit * T >= (lc.minTilePx ?? 40) ? fit : (lc.tilePx ?? 46) / T, (lc.maxTilePx ?? Infinity) / T) * Math.min(1, ratio);
  const vw = w / z, vh = h / z, topW = top / z;
  const span = (lo, hi, v, p) => (hi - lo <= v ? (lo + hi - v) / 2 : Math.max(lo, Math.min(hi - v, p - v / 2)));
  const out = rb ? 1.6 * T : 0;
  return { x: span(Math.min(bx0 - m, x - out), Math.max(bx1 + m, x + out), vw, x), y: span(Math.min(by0 - m - topW, y - out), Math.max(by1 + m, y + out), vh, y), zoom: z, vw, vh };
}
