// The round-3 look for maps that opt in with a `look` block in their JSON
// (maps without one draw exactly as before, in draw.js). A look block names a
// set in looks.json (the values that hold the value ladder) and places the
// map's own dressing: decals, lights, the lit parts of usable things, wall
// pieces and clutter. Everything still is baked once into one padded layer
// (the outside hull shows around the room); world.js blits it each frame.
//
//   "look": { "set": "hangar", "accents": { "board": "#6fe3ff" }, "decals": [...], "lights": [...],
//             "emitters": [...], "mounts": [...], "clutter": [...], "doorColors": { "workshop": "pad" } }
import LOOKS from './looks.json' with { type: 'json' };
import { gridOf, paintOutside, paintFloor, paintDecals, paintWallShadows, paintWalls, paintDoors, paintMounts, paintClutter, paintLightmap, paintFixtures, lightsPx } from './paint.js';
export { lightsPx, shadowOffset } from './paint.js';

// Lights on (the game) unless a dev check turns them off for a before/after picture: globalThis.__stardustLookLights = false.
const lightsOn = () => globalThis.__stardustLookLights !== false;
const stillPlease = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const merge = (a, b) => {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? merge(out[k], v) : v;
  return out;
};

const cache = new WeakMap();
/** The full look for a map: its set from looks.json with the map's own block on top. Null for maps without one. */
export function lookFor(map) {
  const block = map?.def?.look;
  if (!block) return null;
  if (cache.has(block)) return cache.get(block);
  const look = merge(LOOKS.sets[block.set] || LOOKS.sets.hangar, block);
  cache.set(block, look);
  return look;
}

/**
 * Builds the static layer for a look map at `scale` (layer px per world px):
 * the outside, floor, decals, shadows, light pools, walls, doors, wall pieces,
 * props (drawProps from draw.js, so the art and repeat rules stay one), clutter
 * and the lit parts of usable things. Returns the layer with blit/overlay for world.js.
 */
export function buildLookLayer(map, scale, { drawProps, isLocked = () => false }) {
  const look = lookFor(map);
  const T = map.tile, M = (look.margin ?? 4) * T;
  const W = map.w + M * 2, H = map.h + M * 2;
  let s = Math.min(scale, 4096 / W, 4096 / H);
  if (W * H * s * s > 9e6) s = Math.sqrt(9e6 / (W * H));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(W * s); canvas.height = Math.ceil(H * s);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(s, 0, 0, s, M * s, M * s);
  const g = gridOf(map, look);
  const lights = lightsPx(map, look);
  g.lights = lights;
  // Baked once per map: floor, paint, the lightmap and the wall shadows, walls, doors, wall pieces, props with
  // their soft shadows, clutter, then the fixtures and their hot glow. Only people and flicker are per frame.
  paintOutside(ctx, map, look, M);
  paintFloor(ctx, map, g);
  paintDecals(ctx, map, g);
  if (lightsOn()) paintLightmap(ctx, map, g, lights);
  paintWallShadows(ctx, map, g);
  paintWalls(ctx, map, g);
  paintDoors(ctx, map, g, isLocked);
  paintMounts(ctx, map, g);
  drawProps(ctx);
  paintClutter(ctx, map, g);
  if (lightsOn()) paintLightmap(ctx, map, g, lights, { floorOnly: true });
  paintFixtures(ctx, map, g, lights);
  const flickers = lights.filter(l => l.flicker);

  let vig = null, vigKey = '';
  return {
    canvas, scale: s, margin: M, look, lights,
    /** Draws the view: the outside colour, then the padded layer cropped to the camera. */
    blit(c, cam, view) {
      const k = cam.zoom * view.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = look.outside.base; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      const sx = (cam.x + M) * s, sy = (cam.y + M) * s, sw = cam.vw * s, sh = cam.vh * s;
      const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(canvas.width, sx + sw), y1 = Math.min(canvas.height, sy + sh);
      if (x1 > x0 && y1 > y0) c.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, ((x0 - sx) / s) * k, ((y0 - sy) / s) * k, ((x1 - x0) / s) * k, ((y1 - y0) / s) * k);
    },
    /** After the bodies: a gentle flicker on the odd faulty lamp (never under reduced motion), then the look's own vignette. */
    overlay(c, cam, view, t = 0) {
      if (flickers.length && lightsOn() && !stillPlease()) {
        const k = cam.zoom * view.dpr;
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter';
        for (const l of flickers) {
          const f = Math.max(0, Math.sin(t * 13.1 + l.x) * Math.sin(t * 7.3) * Math.sin(t * 2.9 + l.y)); // mostly steady, the odd stutter
          if (f < 0.05) continue;
          const x = (l.fx - cam.x) * k, y = (l.fy - cam.y) * k, r = Math.min(l.r * 0.5, T * 2) * k;
          const gr = c.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, `rgba(255,220,170,${0.12 * f})`); gr.addColorStop(1, 'rgba(255,220,170,0)');
          c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        c.restore();
      }
      const key = `${c.canvas.width}x${c.canvas.height}`;
      if (key !== vigKey) {
        vigKey = key;
        vig = document.createElement('canvas');
        vig.width = Math.max(1, Math.round(c.canvas.width / 2)); vig.height = Math.max(1, Math.round(c.canvas.height / 2));
        const v = vig.getContext('2d');
        const gr = v.createRadialGradient(vig.width / 2, vig.height / 2, Math.min(vig.width, vig.height) * 0.42, vig.width / 2, vig.height / 2, Math.hypot(vig.width, vig.height) * 0.62);
        gr.addColorStop(0, 'rgba(6,8,11,0)'); gr.addColorStop(1, `rgba(6,8,11,${look.vignette ?? 0.4})`);
        v.fillStyle = gr; v.fillRect(0, 0, vig.width, vig.height);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(vig, 0, 0, c.canvas.width, c.canvas.height);
    },
  };
}

// ---- lit copies: props and people brightened once (not per frame) -------------------------
const lit = new Map(); // filter -> WeakMap(img -> canvas)
let filterOk = null;
/** A copy of an image with a canvas filter applied once (falls back to the image where filters are missing). */
export function litCopy(img, filter) {
  if (!img || !filter) return img;
  if (filterOk === null) { const t = document.createElement('canvas').getContext('2d'); filterOk = Boolean(t && 'filter' in t); }
  if (!filterOk) return img;
  if (!lit.has(filter)) lit.set(filter, new WeakMap());
  const m = lit.get(filter);
  let c = m.get(img);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const x = c.getContext('2d'); x.filter = filter; x.drawImage(img, 0, 0); x.filter = 'none';
    m.set(img, c);
  }
  return c;
}
const sil = new WeakMap();
/** A soft dark silhouette of an image with room for the blur: { canvas, pad } in image px (shadows that follow the shape). */
export function silhouette(img, blurPx) {
  const b = Math.max(1, Math.round(blurPx));
  if (!sil.has(img)) sil.set(img, new Map());
  const m = sil.get(img);
  if (m.has(b)) return m.get(b);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, pad = b * 2;
  const c = document.createElement('canvas');
  c.width = w + pad * 2; c.height = h + pad * 2;
  const x = c.getContext('2d');
  if ('filter' in x) { x.filter = `brightness(0) blur(${b}px)`; x.drawImage(img, pad, pad); x.filter = 'none'; }
  else { x.drawImage(img, pad, pad); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); }
  const out = { canvas: c, pad };
  m.set(b, out);
  return out;
}
