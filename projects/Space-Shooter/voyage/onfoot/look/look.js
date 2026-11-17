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
import { lookImage } from './lookArt.js';
import { gridOf, paintOutside, paintFloor, paintDecals, paintWallShadows, paintWalls, paintDoors, paintMounts, paintClutter, paintLightmap, paintFixtures, paintPools, lightsPx } from './paint.js';
export { lightsPx, shadowOffset } from './paint.js';

// Lights on (the game) unless a dev check turns them off for a before/after picture: globalThis.__stardustLookLights = false.
const lightsOn = () => globalThis.__stardustLookLights !== false;
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
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
  paintPools(ctx, map, g, lights);
  paintWalls(ctx, map, g);
  paintDoors(ctx, map, g, isLocked);
  paintMounts(ctx, map, g);
  drawProps(ctx);
  paintClutter(ctx, map, g);
  if (lightsOn()) paintLightmap(ctx, map, g, lights, { floorOnly: true });
  paintFixtures(ctx, map, g, lights);
  const doorSprites = bakeDoorSprites(map, look, g, s);
  const doorOpen = new Map(); let doorT = null;
  const flickers = lights.filter(l => l.flicker);
  const overheads = lights.filter(l => l.kind === 'lamp');

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
    /**
     * Doors with art (look.doorArt, e.g. "ship-door": ship-door-closed/-open/-locked): drawn each frame over the
     * baked passage, lit like the room. shown(door) -> 'locked' | 'open' | 'closed'; an opening door slides its
     * leaves apart over the open picture (about 0.15 s; at once under reduced motion).
     */
    drawDoors(c, cam, view, shown, t = 0) {
      if (!doorSprites.length) return;
      const dt = doorT == null ? 1 : Math.max(0, t - doorT); doorT = t;
      const k = cam.zoom * view.dpr, step = stillPlease() ? 1 : dt * 7;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      for (const ds of doorSprites) {
        const d = ds.door, want = shown(d);
        const x = (d.x - cam.x) * k, y = (d.y - cam.y) * k, w = d.w * k, h = d.h * k;
        if (x > c.canvas.width || y > c.canvas.height || x + w < 0 || y + h < 0) continue;
        if (want === 'locked') { doorOpen.set(d.id, 0); c.drawImage(ds.locked, x, y, w, h); continue; }
        const o0 = doorOpen.get(d.id) ?? (want === 'open' ? 1 : 0);
        const o = want === 'open' ? Math.min(1, o0 + step) : Math.max(0, o0 - step);
        doorOpen.set(d.id, o);
        if (o <= 0) { c.drawImage(ds.closed, x, y, w, h); continue; }
        // Opening: the closed leaves slide apart into the jambs (along the wall) over the baked passage, which shows
        // the next room's light. Fully open, the open picture's frame stays faint so the doorway keeps its shape.
        if (o >= 1) { c.globalAlpha = 0.35; c.drawImage(ds.open, x, y, w, h); c.globalAlpha = 1; }
        c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
        const turn = ds.turn, sw = ds.closed.width, sh = ds.closed.height, slide = 0.42 * o;
        if (!turn) {
          c.drawImage(ds.closed, 0, 0, sw / 2, sh, x - w * slide, y, w / 2, h);
          c.drawImage(ds.closed, sw / 2, 0, sw / 2, sh, x + w / 2 + w * slide, y, w / 2, h);
        } else {
          c.drawImage(ds.closed, 0, 0, sw, sh / 2, x, y - h * slide, w, h / 2);
          c.drawImage(ds.closed, 0, sh / 2, sw, sh / 2, x, y + h / 2 + h * slide, w, h / 2);
        }
        c.restore();
      }
      c.restore();
    },
    /** After the bodies: a gentle flicker on the odd faulty lamp (never under reduced motion), then the look's own vignette. */
    overlay(c, cam, view, t = 0, carrier = null) {
      const k0 = cam.zoom * view.dpr;
      // The captain carries a small soft light, so the floor under them never sinks into the dark between lamps.
      const pl = look.carryLight;
      if (pl && carrier && lightsOn()) {
        const x = (carrier.x - cam.x) * k0, y = (carrier.y - cam.y) * k0, r = pl.r * T * k0;
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter';
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        const cc = pl.color || '#ffc98a'; gr.addColorStop(0, hexA(cc, pl.strength)); gr.addColorStop(0.5, hexA(cc, pl.strength * 0.4)); gr.addColorStop(1, hexA(cc, 0));
        c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
      }
      // Overhead work lamps, above the people: a soft-edged lamp head (no ring outline), a small bright core tinted
      // in the lamp's colour (only its very centre near white), and a halo in that colour.
      if (overheads.length) {
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        for (const l of overheads) {
          const x = (l.fx - cam.x) * k0, y = (l.fy - cam.y) * k0, s2 = (l.size?.[0] || 0.7) * T * k0;
          if (x < -s2 * 2 || y < -s2 * 2 || x > c.canvas.width + s2 * 2 || y > c.canvas.height + s2 * 2) continue;
          const on = lightsOn();
          // The housing: a dark disc that fades out at its edge.
          c.globalCompositeOperation = 'source-over';
          const hg = c.createRadialGradient(x, y, 0, x, y, s2 * 0.42);
          hg.addColorStop(0, 'rgba(22,25,29,0.85)'); hg.addColorStop(0.65, 'rgba(22,25,29,0.6)'); hg.addColorStop(1, 'rgba(22,25,29,0)');
          c.fillStyle = hg; c.fillRect(x - s2 * 0.42, y - s2 * 0.42, s2 * 0.84, s2 * 0.84);
          if (!on) { c.fillStyle = 'rgba(120,126,134,0.9)'; c.beginPath(); c.arc(x, y, s2 * 0.12, 0, Math.PI * 2); c.fill(); continue; }
          c.globalCompositeOperation = 'lighter';
          const halo = c.createRadialGradient(x, y, 0, x, y, s2 * 1.5);
          halo.addColorStop(0, hexA(l.color, 0.36)); halo.addColorStop(0.5, hexA(l.color, 0.17)); halo.addColorStop(1, hexA(l.color, 0));
          c.fillStyle = halo; c.fillRect(x - s2 * 1.5, y - s2 * 1.5, s2 * 3, s2 * 3);
          c.globalCompositeOperation = 'source-over';
          const core = c.createRadialGradient(x, y, 0, x, y, s2 * 0.22);
          core.addColorStop(0, 'rgba(255,255,250,0.95)'); core.addColorStop(0.35, hexA(l.color, 0.95)); core.addColorStop(1, hexA(l.color, 0));
          c.fillStyle = core; c.fillRect(x - s2 * 0.22, y - s2 * 0.22, s2 * 0.44, s2 * 0.44);
        }
        c.restore();
      }
      if (flickers.length && lightsOn() && !stillPlease()) {
        const k = cam.zoom * view.dpr;
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter';
        for (const l of flickers) {
          const f = Math.max(0, Math.sin(t * 13.1 + l.x) * Math.sin(t * 7.3) * Math.sin(t * 2.9 + l.y)); // mostly steady, the odd stutter
          if (f < 0.05) continue;
          const x = (l.fx - cam.x) * k, y = (l.fy - cam.y) * k, r = Math.min(l.r * 0.5, T * 2) * k;
          const gr = c.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, hexA(l.color, 0.12 * f)); gr.addColorStop(1, hexA(l.color, 0));
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

// ---- door pictures: each door's closed, open and locked art, lit like the room, baked once per layer -------
function bakeDoorSprites(map, look, g, s) {
  if (!look.doorArt) return [];
  const T = map.tile, out = [];
  for (const d of map.doors) {
    const side = d.y <= 0 ? 'n' : d.y + d.h >= map.h ? 's' : d.x <= 0 ? 'w' : d.x + d.w >= map.w ? 'e' : null;
    if (!side || d.look === 'ramp') continue;
    const base = d.art || look.doorArt;
    const imgs = ['closed', 'open', 'locked'].map(st => lookImage('prop', `${base}-${st}`));
    if (imgs.some(i => !i)) continue; // not loaded yet: the layer is rebuilt when art lands
    const turn = side === 'w' || side === 'e';
    const sprites = imgs.map(img => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(d.w * s)); c.height = Math.max(1, Math.ceil(d.h * s));
      const x = c.getContext('2d');
      x.setTransform(s, 0, 0, s, -d.x * s, -d.y * s);
      // One picture per tile along the door; doors in the side walls are the same picture turned a quarter.
      const n = Math.max(1, Math.round(Math.max(d.w, d.h) / T));
      for (let i = 0; i < n; i++) {
        const cx = d.x + (turn ? d.w / 2 : (i + 0.5) * T), cy = d.y + (turn ? (i + 0.5) * T : d.h / 2);
        x.save(); x.translate(cx, cy); if (turn) x.rotate(Math.PI / 2); x.drawImage(img, -T / 2, -T / 2, T, T); x.restore();
      }
      if (lightsOn() && g.lightmap) {
        // Light it like the room, then cut back to the art's own shape (one mask for all its tiles: a two-tile door
        // masked tile by tile would erase itself).
        const mask = document.createElement('canvas'); mask.width = c.width; mask.height = c.height;
        mask.getContext('2d').drawImage(c, 0, 0);
        x.globalCompositeOperation = 'multiply'; x.drawImage(g.lightmap, 0, 0, map.w, map.h);
        x.globalCompositeOperation = 'destination-in'; x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(mask, 0, 0);
      }
      return c;
    });
    out.push({ door: d, closed: sprites[0], open: sprites[1], locked: sprites[2], turn });
  }
  return out;
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
