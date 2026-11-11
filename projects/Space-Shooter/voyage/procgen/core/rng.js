// Seeded randomness for every procgen layer. Pure, no Math.random anywhere:
// the same seed and labels always give the same stream, on every machine.
//
// Streams are forked by label (makeRng(seed, 'room', 'cantina', 'rule:bar')),
// so adding or editing one rule never changes what an unrelated rule rolls.
// That keeps a Studio reroll of "the rest" stable for the parts you locked.

/** 32-bit string hash (cyrb53 folded to 32 bits). */
export function hash32(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** mulberry32: small, fast, good enough for layout. Returns floats in [0, 1). */
function mulberry32(a) {
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded random stream. `seed` may be a number or string; labels fork it.
 * The object has helpers so callers never reach for Math.random.
 */
export function makeRng(seed, ...labels) {
  const key = [String(seed), ...labels.map(String)].join('␟');
  const next = mulberry32(hash32(key));
  const rng = {
    key,
    next,
    /** float in [a, b) */
    range: (a, b) => a + (b - a) * next(),
    /** integer in [a, b] inclusive */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** weighted pick: items [{ w }] or a weight function */
    weighted(list, weightOf = (x) => x.w ?? 1) {
      let total = 0;
      for (const item of list) total += Math.max(0, weightOf(item));
      if (total <= 0) return list[0];
      let r = next() * total;
      for (const item of list) { r -= Math.max(0, weightOf(item)); if (r < 0) return item; }
      return list[list.length - 1];
    },
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    },
    /** a child stream; same labels give the same child */
    fork: (...more) => makeRng(seed, ...labels, ...more),
  };
  return rng;
}

/** Count from a spec: n, [min, max] or { min, max }. */
export function rollCount(rng, spec, scale = 1) {
  if (spec == null) return 1;
  if (typeof spec === 'number') return Math.max(0, Math.round(spec * scale));
  const [a, b] = Array.isArray(spec) ? spec : [spec.min ?? 0, spec.max ?? spec.min ?? 0];
  const lo = a * scale, hi = b * scale;
  // stochastic rounding keeps fractional scaled counts fair across seeds
  const v = lo + (hi - lo) * rng.next();
  const base = Math.floor(v);
  return Math.max(0, base + (rng.next() < v - base ? 1 : 0));
}

/** Smooth 2D value noise in [0, 1], seeded (for outdoor patches and density). */
export function makeNoise(seed, ...labels) {
  const base = hash32([String(seed), ...labels].join('␟'));
  const lattice = (ix, iy) => {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + base;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const one = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth(x - ix), fy = smooth(y - iy);
    const a = lattice(ix, iy), b = lattice(ix + 1, iy), c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  /** fractal noise: scale = feature size in tiles */
  return (x, y, scale = 6, octaves = 2) => {
    let sum = 0, amp = 1, norm = 0, f = 1 / scale;
    for (let o = 0; o < octaves; o++) { sum += one(x * f + o * 17.3, y * f - o * 9.1) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
}
