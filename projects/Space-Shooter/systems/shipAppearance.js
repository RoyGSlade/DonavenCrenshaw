import { ZONES, PART_SLOTS, SHIP_STYLES, cleanAppearance, sayingText, presetAppearance } from './shipLivery.js';
export { ZONES, PART_SLOTS, SHIP_STYLES, cleanAppearance, presetAppearance } from './shipLivery.js';
export const APPEARANCE_KEY = 'stardust.courier.appearance.v1';
const canvas = (size = 512) =>
  Object.assign(document.createElement('canvas'), { width: size, height: size });
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const clamp = (v) => Math.max(0, Math.min(1, v));
export function loadAppearanceImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Ship image could not load.'));
    i.src = src;
  });
}
let kitsPromise,
  kits,
  readyPromise,
  equipped = null,
  equippedCanvas = null;
const sourcePixels = new Map(),
  painted = new Map();
const decalTextures = new Map();
const contactShadows = new WeakMap();
const partBounds = new WeakMap();
const assemblyLayouts = new Map();
function pixels(image) {
  if (!sourcePixels.has(image)) {
    const c = canvas(image.naturalWidth);
    c.getContext('2d').drawImage(image, 0, 0);
    sourcePixels.set(image, c.getContext('2d').getImageData(0, 0, c.width, c.height));
    // Meshy renders carry a full megapixel of detail. Retain only the recent
    // source buffers rather than another decoded copy of every ship option.
    if (sourcePixels.size > 8) sourcePixels.delete(sourcePixels.keys().next().value);
  }
  const value = sourcePixels.get(image);
  sourcePixels.delete(image);
  sourcePixels.set(image, value);
  return value;
}
function visibleBounds(image) {
  if (partBounds.has(image)) return partBounds.get(image);
  const p = pixels(image);
  let left = p.width, top = p.height, right = -1, bottom = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] < 16) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const result = right < 0 ? null : {
    left: left / p.width, right: (right + 1) / p.width,
    top: top / p.height, bottom: (bottom + 1) / p.height,
  };
  partBounds.set(image, result);
  return result;
}
function assemblyLayout(a) {
  const parts = PART_SLOTS.map((slot) => kits[a.family][slot][a.parts[slot]]);
  if (!parts.some((p) => p.surface?.layout === 'fit')) return null;
  const key = parts.map((p) => p.image.src).join('|');
  if (assemblyLayouts.has(key)) return assemblyLayouts.get(key);
  const bounds = parts.map((p) => visibleBounds(p.image)).filter(Boolean);
  if (!bounds.length) return null;
  const left = Math.min(...bounds.map((b) => b.left)),
    right = Math.max(...bounds.map((b) => b.right)),
    top = Math.min(...bounds.map((b) => b.top)),
    bottom = Math.max(...bounds.map((b) => b.bottom)),
    scale = 0.91 / Math.max(right - left, bottom - top);
  const layout = {
    scale,
    x: 0.5 - ((left + right) / 2) * scale,
    y: 0.5 - ((top + bottom) / 2) * scale,
  };
  assemblyLayouts.set(key, layout);
  if (assemblyLayouts.size > 48) assemblyLayouts.delete(assemblyLayouts.keys().next().value);
  return layout;
}
function applyAssemblyLayout(ctx, layout, size) {
  if (!layout) return;
  ctx.translate(layout.x * size, layout.y * size);
  ctx.scale(layout.scale, layout.scale);
}
export function loadShipKits() {
  if (!kitsPromise)
    kitsPromise = (async () => {
      const result = {};
      const response = await fetch(new URL('../art/garage/families/sockets.json', import.meta.url));
      if (!response.ok) throw new Error('Ship engine sockets could not load.');
      const sockets = await response.json();
      const surfacesResponse = await fetch(
        new URL('../art/garage/families/surface-models.json', import.meta.url),
      );
      if (!surfacesResponse.ok) throw new Error('Ship surface materials could not load.');
      const surfaces = await surfacesResponse.json();
      await Promise.all(
        SHIP_STYLES.map(async ({ id: family }) => {
          result[family] = {};
          await Promise.all(
            PART_SLOTS.map(async (slot) => {
              const count = family === 'courier' ? (['body', 'engines'].includes(slot) ? 1 : 3) : 3;
              const reviewedKit = surfaces[`${family}-${slot}-0`]?.detail === 'pbr-render';
              const approved = (index) => !reviewedKit || index === 0 ||
                surfaces[`${family}-${slot}-${index}`]?.detail === 'pbr-render';
              const baseline = {};
              result[family][slot] = await Promise.all(
                Array.from({ length: count }, async (_, index) => {
                  if (!approved(index)) return { available: false };
                  const path =
                    family === 'courier'
                      ? `${slot}-${['courier', 'vector', 'bulwark'][index]}`
                      : `families/${family}-${slot}-${index}`;
                  const image = await loadAppearanceImage(
                    new URL(`../art/garage/${path}.png`, import.meta.url).href,
                  );
                  let mask = null;
                  if (family !== 'courier') {
                    const m = await loadAppearanceImage(
                        new URL(`../art/garage/${path}-mask.png`, import.meta.url).href,
                      ),
                      c = canvas(m.naturalWidth),
                      q = c.getContext('2d');
                    q.drawImage(m, 0, 0);
                    const data = q.getImageData(0, 0, c.width, c.height).data;
                    mask = new Uint8Array(c.width * c.height);
                    for (let i = 0; i < mask.length; i++)
                      mask[i] =
                        (data[i * 4] > 100 ? 4 : 0) +
                        (data[i * 4 + 1] > 100 ? 2 : 0) +
                        (data[i * 4 + 2] > 100 ? 1 : 0);
                  }
                  const ports =
                    slot === 'engines' && family !== 'courier'
                      ? sockets[`${family}-engines-${index}`]
                      : null;
                  if (
                    slot === 'engines' &&
                    family !== 'courier' &&
                    (!Array.isArray(ports) ||
                      !ports.length ||
                      ports.length > 4 ||
                      ports.some((p) => ![p.x, p.y, p.width].every(Number.isFinite)))
                  )
                    throw new Error('Invalid engine sockets.');
                  return { image, mask, ports, available: true, surface: surfaces[`${family}-${slot}-${index}`] };
                }),
              );
              Object.assign(baseline, result[family][slot][0]);
              result[family][slot] = result[family][slot].map((part) =>
                part.available ? part : { ...baseline, available: false });
            }),
          );
        }),
      );
      kits = result;
      return kits;
    })().catch((e) => {
      kitsPromise = null;
      throw e;
    });
  return kitsPromise;
}
export function availablePartIndices(family, slot) {
  return (kits?.[family]?.[slot] || []).flatMap((part, index) => part.available ? [index] : []);
}
export function resolveAvailableAppearance(value) {
  const appearance = cleanAppearance(value);
  if (!appearance || !kits) return appearance;
  for (const slot of PART_SLOTS)
    if (!kits[appearance.family][slot][appearance.parts[slot]].available)
      appearance.parts[slot] = 0;
  return appearance;
}
const idZones = { 4: 'hull', 2: 'wings', 3: 'nose', 1: 'trim', 6: 'glass', 5: 'engines' };
const albedoReference = { hull: 0.72, wings: 0.76, nose: 0.65, trim: 0.30, glass: 0.70, engines: 0.55 };
function paintPart(part, paint, size, slot) {
  const key = `${part.image.src}|${ZONES.map((z) => paint[z]).join()}`;
  if (painted.has(key)) return painted.get(key);
  const source = pixels(part.image),
    mask = part.mask,
    c = canvas(source.width),
    ctx = c.getContext('2d'),
    output = ctx.createImageData(source.width, source.height),
    colors = Object.fromEntries(ZONES.map((z) => [z, rgb(paint[z])]));
  for (let i = 0; i < source.data.length; i += 4) {
    const a = source.data[i + 3];
    if (!a) continue;
    const r = source.data[i],
      g = source.data[i + 1],
      b = source.data[i + 2];
    if (part.surface?.paint === 'albedo' && mask[i / 4] === 7) {
      output.data.set(source.data.subarray(i, i + 4), i);
      continue;
    }
    const zone = mask
      ? idZones[mask[i / 4]] || slot
      : g > r * 1.18 && b > r * 1.18 && Math.max(g, b) - r > 24
        ? 'glass'
        : slot === 'body'
          ? 'hull'
          : slot === 'cockpit'
            ? 'trim'
            : slot;
    const color = colors[zone] || colors.hull,
      light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // Keep the authored cast-shell shadows. A high ambient floor made every
    // painted face bright and erased the bevels, even on actual 3D geometry.
    const albedo = part.surface?.paint === 'albedo';
    const shade = albedo ? light / albedoReference[zone] : mask ? 0.16 + light * 1.08 : 0.28 + light * 0.88,
      highlight = albedo ? 0 : mask
        ? Math.pow(clamp((light - 0.68) / 0.32), 2) * 0.16
        : clamp((light - 0.8) / 0.2) * 0.18;
    for (let k = 0; k < 3; k++)
      output.data[i + k] = Math.min(255, color[k] * shade + 255 * highlight);
    output.data[i + 3] = a;
  }
  ctx.putImageData(output, 0, 0);
  painted.set(key, c);
  if (painted.size > 12) painted.delete(painted.keys().next().value);
  return c;
}
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function decalTexture(d) {
  const key = JSON.stringify([d.kind, d.color, d.saying]);
  if (decalTextures.has(key)) return decalTextures.get(key);
  const c = canvas(384);
  drawDecal(
    c.getContext('2d'),
    { ...d, x: 0, y: 0, width: 1, height: 1, angle: 0, opacity: 1, flipX: false, flipY: false },
    384,
  );
  decalTextures.set(key, c);
  if (decalTextures.size > 64) decalTextures.delete(decalTextures.keys().next().value);
  return c;
}
export function drawDecal(ctx, d, size) {
  ctx.save();
  ctx.translate(size * (0.5 + d.x), size * (0.5 + d.y));
  ctx.rotate((d.angle * Math.PI) / 180);
  ctx.scale(size * d.width * (d.flipX ? -1 : 1), size * d.height * (d.flipY ? -1 : 1));
  ctx.globalAlpha = d.opacity;
  ctx.fillStyle = d.color;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 0.09;
  if (d.kind === 'text') {
    ctx.font = '900 0.8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sayingText(d.saying) ?? '', 0, 0, 0.95);
  } else if (['circle', 'ring'].includes(d.kind)) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.43, 0, Math.PI * 2);
    d.kind === 'ring' ? ctx.stroke() : ctx.fill();
  } else if (d.kind === 'triangle')
    polygon(ctx, [
      [0, -0.48],
      [0.48, 0.45],
      [-0.48, 0.45],
    ]);
  else if (d.kind === 'chevron')
    polygon(ctx, [
      [-0.48, -0.3],
      [0, 0.05],
      [0.48, -0.3],
      [0.48, -0.05],
      [0, 0.35],
      [-0.48, -0.05],
    ]);
  else if (d.kind === 'bolt')
    polygon(ctx, [
      [0.08, -0.5],
      [-0.42, 0.08],
      [-0.06, 0.08],
      [-0.2, 0.5],
      [0.42, -0.12],
      [0.07, -0.12],
    ]);
  else if (d.kind === 'slash')
    polygon(ctx, [
      [0.15, -0.5],
      [0.49, -0.5],
      [-0.15, 0.5],
      [-0.49, 0.5],
    ]);
  else if (d.kind === 'star' || d.kind === 'hex') {
    const count = d.kind === 'star' ? 10 : 6;
    polygon(
      ctx,
      Array.from({ length: count }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / count,
          r = d.kind === 'star' && i % 2 ? 0.21 : 0.48;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }),
    );
  } else if (d.kind === 'flame') {
    ctx.beginPath();
    ctx.moveTo(0, 0.49);
    ctx.bezierCurveTo(-0.7, 0.1, -0.25, -0.2, -0.28, -0.48);
    ctx.bezierCurveTo(-0.06, -0.3, -0.08, -0.1, 0.12, -0.5);
    ctx.bezierCurveTo(0.1, -0.08, 0.75, 0.22, 0, 0.49);
    ctx.fill();
  } else if (d.kind === 'skull') {
    ctx.beginPath();
    ctx.ellipse(0, -0.08, 0.4, 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-0.24, 0.05, 0.48, 0.4);
    ctx.globalCompositeOperation = 'destination-out';
    for (const x of [-0.16, 0.16]) {
      ctx.beginPath();
      ctx.ellipse(x, -0.07, 0.1, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const x of [-0.13, 0, 0.13]) ctx.fillRect(x - 0.026, 0.27, 0.052, 0.19);
  }
  ctx.restore();
}
function drawRaisedPart(ctx, image, size) {
  // Each modular part is rendered separately in Blender. Restore the contact
  // shadow on existing surfaces only, so parts feel stacked without casting
  // a fake drop shadow into empty space around the ship.
  let shadow = contactShadows.get(image);
  if (!shadow) {
    const nativeSize = image.naturalWidth || image.width;
    shadow = canvas(nativeSize);
    const s = shadow.getContext('2d');
    s.shadowColor = 'rgba(0,0,0,0.65)';
    s.shadowBlur = nativeSize * 0.006;
    s.shadowOffsetX = nativeSize * 0.005;
    s.shadowOffsetY = nativeSize * 0.008;
    s.drawImage(image, 0, 0);
    s.shadowColor = 'transparent';
    s.globalCompositeOperation = 'destination-out';
    s.drawImage(image, 0, 0);
    contactShadows.set(image, shadow);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(shadow, 0, 0, size, size);
  ctx.restore();
  ctx.drawImage(image, 0, 0, size, size);
}
export function renderAppearance(value, unused = null, size = 768) {
  const a = cleanAppearance(value);
  if (!a || !kits) throw new Error('Ship appearance is not ready.');
  const c = canvas(size),
    ctx = c.getContext('2d'),
    armor = canvas(size),
    q = armor.getContext('2d'),
    layout = assemblyLayout(a),
    enginePart = kits[a.family].engines[a.parts.engines],
    engineUnderWing = enginePart.surface?.layer === 'under-wing';
  ctx.save();
  q.save();
  applyAssemblyLayout(ctx, layout, size);
  applyAssemblyLayout(q, layout, size);
  if (engineUnderWing)
    ctx.drawImage(paintPart(enginePart, a.paint, size, 'engines'), 0, 0, size, size);
  for (const slot of ['wings', 'body']) {
    const p = kits[a.family][slot][a.parts[slot]];
    const paintedPart = paintPart(p, a.paint, size, slot);
    if (slot === 'body' && a.family !== 'courier' && p.surface?.contactShadow !== false) {
      drawRaisedPart(q, p.image, size);
      drawRaisedPart(ctx, paintedPart, size);
    } else {
      q.drawImage(p.image, 0, 0, size, size);
      ctx.drawImage(paintedPart, 0, 0, size, size);
    }
  }
  ctx.restore();
  q.restore();
  if (a.layers.length) {
    const decal = canvas(size),
      dctx = decal.getContext('2d');
    for (const d of a.layers) {
      if (!d.visible || d.opacity === 0) continue;
      dctx.save();
      dctx.translate(size * (0.5 + d.x), size * (0.5 + d.y));
      dctx.rotate((d.angle * Math.PI) / 180);
      dctx.scale(d.flipX ? -1 : 1, d.flipY ? -1 : 1);
      dctx.globalAlpha = d.opacity;
      dctx.drawImage(
        decalTexture(d),
        (-size * d.width) / 2,
        (-size * d.height) / 2,
        size * d.width,
        size * d.height,
      );
      dctx.restore();
    }
    dctx.globalCompositeOperation = 'destination-in';
    // Clip to the exact painted armor coverage. Resampling the original PBR
    // image separately can round a translucent edge differently by one alpha.
    let coverage = c;
    if (engineUnderWing) {
      coverage = canvas(size);
      const mask = coverage.getContext('2d');
      applyAssemblyLayout(mask, layout, size);
      for (const slot of ['wings', 'body']) {
        const part = kits[a.family][slot][a.parts[slot]];
        mask.drawImage(paintPart(part, a.paint, size, slot), 0, 0, size, size);
      }
    }
    dctx.drawImage(coverage, 0, 0);
    const print = dctx.getImageData(0, 0, size, size),
      surface = q.getImageData(0, 0, size, size).data;
    for (let i = 0; i < print.data.length; i += 4) {
      if (!print.data[i + 3]) continue;
      const shade = Math.min(
        1,
        (a.family === 'courier' ? 0.35 : 0.16) +
          ((surface[i] + surface[i + 1] + surface[i + 2]) / 765) *
            (a.family === 'courier' ? 1 : 1.08),
      );
      for (let k = 0; k < 3; k++) print.data[i + k] *= shade;
    }
    dctx.putImageData(print, 0, 0);
    ctx.drawImage(decal, 0, 0);
  }
  ctx.save();
  applyAssemblyLayout(ctx, layout, size);
  for (const slot of ['engines', 'cockpit']) {
    if (slot === 'engines' && engineUnderWing) continue;
    const part = kits[a.family][slot][a.parts[slot]];
    const p = paintPart(part, a.paint, size, slot);
    if (a.family !== 'courier' && part.surface?.contactShadow !== false) drawRaisedPart(ctx, p, size);
    else ctx.drawImage(p, 0, 0, size, size);
  }
  ctx.restore();
  return c;
}
// A test build flown on a preview (?ship=needle:2-0-0-1) is drawn as that
// build without touching the saved, equipped ship: same paint and decals when
// it is the equipped family, the family's preset otherwise.
let flight = null, flightCanvas = null;
export async function setFlightBuild(family, parts) {
  await loadShipKits();
  const base = equipped && equipped.family === family ? structuredClone(equipped) : presetAppearance(family);
  base.parts = { ...parts };
  const a = resolveAvailableAppearance(base);
  flightCanvas = renderAppearance(a);
  flight = a;
}
export function clearFlightBuild() {
  flight = null;
  flightCanvas = null;
}
export function getCourierAppearance() {
  return flightCanvas || equippedCanvas;
}
const courierPorts = [
  { x: -0.13, y: 0.38, width: 0.13 },
  { x: 0.13, y: 0.38, width: 0.13 },
];
export function getCourierExhaustPorts() {
  const ship = flight || equipped;
  const ports = (ship && kits?.[ship.family]?.engines[ship.parts.engines]?.ports) || courierPorts;
  const layout = ship && kits ? assemblyLayout(ship) : null;
  if (!layout) return ports;
  // Decals use the fitted ship canvas, and exhaust must follow the same transform.
  return ports.map((p) => ({
    x: (p.x + 0.5) * layout.scale + layout.x - 0.5,
    y: (p.y + 0.5) * layout.scale + layout.y - 0.5,
    width: p.width * layout.scale,
  }));
}
export function getEquippedAppearance() {
  return equipped ? structuredClone(equipped) : null;
}
function updateHangar() {
  const image = document.querySelector('#hangar-ship img');
  if (image && equippedCanvas) image.src = equippedCanvas.toDataURL('image/png');
}
export function initCourierAppearance() {
  if (!readyPromise)
    readyPromise = (async () => {
      let saved;
      try {
        saved = cleanAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY)));
      } catch {}
      await loadShipKits();
      saved = resolveAvailableAppearance(saved);
      if (saved) {
        try {
          equippedCanvas = renderAppearance(saved);
          equipped = saved;
          updateHangar();
        } catch {}
      }
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  return readyPromise;
}
export function equipAppearance(value) {
  const a = resolveAvailableAppearance(value);
  if (!a) throw new Error('Invalid appearance.');
  const c = renderAppearance(a);
  let saved = true;
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    saved = false;
  }
  equipped = a;
  equippedCanvas = c;
  updateHangar();
  window.dispatchEvent(new CustomEvent('stardust:appearance-changed'));
  return saved;
}
