// Procedural textures built as raw pixel data (THREE.DataTexture), not canvas,
// so the world builds the same in a browser and in node tests, with no assets.
// Colour textures are tagged sRGB; the pixel functions are exported for tests.

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** 1 inside a line of half-thickness `half`, anti-aliased over one pixel. */
const line = (dist, half, px) => clamp01((half - dist) / px + 0.5);

function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise, periodic in x with period `wrap` cells. */
export function valueNoise(x, y, wrap = 0, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const wx = (i) => (wrap ? ((i % wrap) + wrap) % wrap : i);
  const a = hash2(wx(x0), y0, seed), b = hash2(wx(x0 + 1), y0, seed), c = hash2(wx(x0), y0 + 1, seed), d = hash2(wx(x0 + 1), y0 + 1, seed);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function build(THREE, width, height, fill, { srgb = true, repeat = false, mips = false } = {}) {
  const data = new Uint8Array(width * height * 4);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    fill((x + 0.5) / width, (y + 0.5) / height, out);
    const i = (y * width + x) * 4;
    data[i] = Math.round(clamp01(out[0]) * 255); data[i + 1] = Math.round(clamp01(out[1]) * 255);
    data[i + 2] = Math.round(clamp01(out[2]) * 255); data[i + 3] = Math.round(clamp01(out[3]) * 255);
  }
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  t.needsUpdate = true;
  return t;
}

/**
 * The lane's flow lines. u (along) repeats every `period` world units, v spans
 * the lane `width`. Faint lane lines, a dashed centre line and a forward
 * chevron every half period: the direction of the race at a glance.
 */
export function flowPixel(u, v, out, { period = 8, width = 6, pxAlong = 1 / 64, pxAcross = 1 / 21 } = {}) {
  const X = u * period, Z = (v - 0.5) * width;
  const teal = [0.35, 0.85, 0.82];
  let a = 0;
  // Lane lines a quarter of the way in from each rail.
  a = Math.max(a, 0.16 * line(Math.abs(Math.abs(Z) - width / 4), 0.03, pxAcross));
  // Dashed centre line, one dash per half period.
  const phase = X % (period / 2);
  if (phase > 0.5 && phase < period / 2 - 0.5) a = Math.max(a, 0.34 * line(Math.abs(Z), 0.04, pxAcross));
  // A fine cross line each period, the "grid".
  a = Math.max(a, 0.1 * line(Math.min(X, period - X), 0.03, pxAlong));
  // Chevrons (tip toward +u), one every half period, lines 0.09 thick.
  const cx = (X % (period / 2)) - period / 4;
  if (Math.abs(Z) < 0.95) a = Math.max(a, 0.62 * line(Math.abs(cx + Math.abs(Z) * 0.85 - 0.35), 0.075, pxAlong) * smooth(0.95, 0.7, Math.abs(Z)));
  out[0] = teal[0]; out[1] = teal[1]; out[2] = teal[2]; out[3] = a;
}
export function makeFlowTexture(THREE, opts = {}) {
  const o = { period: 8, width: 6, ...opts };
  const W = 512, H = 128;
  return build(THREE, W, H, (u, v, out) => flowPixel(u, v, out, { ...o, pxAlong: o.period / W, pxAcross: o.width / H }), { repeat: true, mips: true });
}

/** A soft round glow: white, alpha falls off from the centre. */
export function makeGlowTexture(THREE, size = 64, power = 2.2) {
  return build(THREE, size, size, (u, v, out) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    out[0] = out[1] = out[2] = 1; out[3] = (1 - smooth(0, 1, d)) ** power;
  });
}
/** A star/dust point: a hard core with a soft edge. */
export function makeDotTexture(THREE, size = 32) {
  return build(THREE, size, size, (u, v, out) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    out[0] = out[1] = out[2] = 1; out[3] = 1 - smooth(0.35, 1, d);
  });
}
/** The mine's kill halo: a faint fill with a bright rim. */
export function makeHaloTexture(THREE, size = 128) {
  return build(THREE, size, size, (u, v, out) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const rim = line(Math.abs(d - 0.95), 0.045, 2 / size);
    const fill = d < 0.97 ? 0.22 * (0.55 + 0.45 * d) : 0;
    out[0] = 1; out[1] = 1; out[2] = 1; out[3] = Math.max(rim * 0.95, fill);
  });
}
/** A ring of the given relative thickness, for target and pickup markers. */
export function makeRingTexture(THREE, size = 128, thickness = 0.08) {
  return build(THREE, size, size, (u, v, out) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    out[0] = out[1] = out[2] = 1; out[3] = line(Math.abs(d - (1 - thickness)), thickness / 2, 2 / size);
  });
}
/** A banded gas-giant, equirectangular, wraps in x. */
export function makePlanetTexture(THREE, w = 256, h = 128) {
  const palette = [[0.04, 0.09, 0.2], [0.09, 0.2, 0.38], [0.34, 0.27, 0.25], [0.18, 0.1, 0.24]];
  return build(THREE, w, h, (u, v, out) => {
    const pole = Math.sin(Math.PI * v);    // calm the swirls toward the poles so they do not pinch into a rosette
    const warp = (valueNoise(u * 8, v * 6, 8, 3) * 2 + valueNoise(u * 16, v * 12, 16, 5) * 0.9) * pole;
    const band = 0.5 + 0.5 * Math.sin(v * 38 + warp * 3.2);
    const k = clamp01(band * 1.25 - 0.1) * 3, i = Math.min(2, Math.floor(k)), f = k - i;
    const a = palette[i], b = palette[i + 1];
    const shade = 0.75 + 0.25 * valueNoise(u * 24, v * 18, 24, 9);
    out[0] = (a[0] + (b[0] - a[0]) * f) * shade; out[1] = (a[1] + (b[1] - a[1]) * f) * shade; out[2] = (a[2] + (b[2] - a[2]) * f) * shade; out[3] = 1;
  }, { mips: true, repeat: true });
}
