// Traces the Stardust player ship's collision hull from its sprite's alpha
// channel and writes projects/Space-Shooter/engine/shipHull.js.
//
//   node scripts/generate-stardust-ship-hull.mjs            (writes the module)
//   node scripts/generate-stardust-ship-hull.mjs --check    (prints, writes nothing)
//
// Steps: decode art/player-ship.png (8-bit RGBA, non-interlaced) with zlib,
// threshold alpha > ALPHA, keep the largest opaque blob, walk its outer pixel
// boundary, then Douglas-Peucker it down to TARGET vertices (the tolerance is
// searched so wing tips and the nose survive as vertices). Pixels become ship
// cells the way drawCourier (gfx/stardustVfx.js) draws the sprite: a square
// SPRITE_CELLS wide, centred on the ship, rotated so the sprite's up is the
// nose. Output: x = ship right, y = forward (nose), origin = sprite centre.
//
// Re-run it whenever the sprite, its draw size (1.6 * 0.66) or the threshold
// changes, then run the stardust tests: tests/stardust-hitbox.test.mjs checks
// the extents against the sprite.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRITE = path.join(root, "projects/Space-Shooter/art/player-ship.png");
const OUT = path.join(root, "projects/Space-Shooter/engine/shipHull.js");
const ALPHA = 40;
const SPRITE_CELLS = 1.6 * 0.66; // drawCourier: s = unit * 1.6 * scale, scale 0.66
const TARGET = 28; // vertices (16..28 wanted): the most detail the budget allows

export function decodePng(buffer) {
  const sig = buffer.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let off = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off), type = buffer.toString("latin1", off + 4, off + 8);
    const data = buffer.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8 || color !== 6 || interlace !== 0) throw new Error(`need 8-bit RGBA non-interlaced (depth ${depth}, color ${color}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + i] = v & 255;
    }
  }
  return { width, height, pixels: px };
}

/** Largest 4-connected blob of alpha > threshold, holes filled. */
function bodyMask({ width, height, pixels }, threshold) {
  const on = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) on[i] = pixels[i * 4 + 3] > threshold ? 1 : 0;
  const label = new Int32Array(width * height);
  let best = 0, bestSize = 0, next = 0;
  const stack = [];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || label[s]) continue;
    next++; let size = 0;
    stack.push(s); label[s] = next;
    while (stack.length) {
      const i = stack.pop(); size++;
      const x = i % width, y = (i / width) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1])
        if (j >= 0 && on[j] && !label[j]) { label[j] = next; stack.push(j); }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = label[i] === best ? 1 : 0;
  return mask;
}

/** The outer boundary as pixel-corner points, walking with the body on the right (image coordinates). */
function outerBoundary(mask, width, height) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  // Directed crack edges, keyed by start corner.
  const edges = new Map();
  const add = (x0, y0, x1, y1) => {
    const k = y0 * (width + 1) + x0;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push([x1, y1]);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  const loops = [];
  while (edges.size) {
    const [startKey, list] = edges.entries().next().value;
    let cx = startKey % (width + 1), cy = Math.floor(startKey / (width + 1));
    const loop = [[cx, cy]];
    let [nx, ny] = list.pop();
    if (!list.length) edges.delete(startKey);
    let px = cx, py = cy;
    for (;;) {
      loop.push([nx, ny]);
      const k = ny * (width + 1) + nx;
      const out = edges.get(k);
      if (!out) break;
      // At a saddle corner prefer the right turn, which keeps diagonal blobs apart.
      const dx = nx - px, dy = ny - py;
      out.sort((a, b) => turn(dx, dy, a[0] - nx, a[1] - ny) - turn(dx, dy, b[0] - nx, b[1] - ny));
      const [qx, qy] = out.shift();
      if (!out.length) edges.delete(k);
      px = nx; py = ny; nx = qx; ny = qy;
    }
    loop.pop();
    loops.push(loop);
  }
  const area = (l) => l.reduce((s, [x, y], i) => { const [u, v] = l[(i + 1) % l.length]; return s + x * v - u * y; }, 0) / 2;
  return loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
}
const turn = (dx, dy, ex, ey) => -(dx * ey - dy * ex); // right turn first (image y down)

/** Douglas-Peucker on a closed loop, split at the two farthest points. */
function simplifyClosed(points, epsilon) {
  let a = 0, b = 0, far = -1;
  for (let i = 0; i < points.length; i += 7) for (let j = i + 1; j < points.length; j += 7) {
    const d = (points[i][0] - points[j][0]) ** 2 + (points[i][1] - points[j][1]) ** 2;
    if (d > far) { far = d; a = i; b = j; }
  }
  const first = points.slice(a, b + 1), second = points.slice(b).concat(points.slice(0, a + 1));
  return dp(first, epsilon).slice(0, -1).concat(dp(second, epsilon).slice(0, -1));
}
function dp(points, epsilon) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0], [bx, by] = points.at(-1);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / len;
    if (d > worst) { worst = d; index = i; }
  }
  if (worst <= epsilon) return [points[0], points.at(-1)];
  return dp(points.slice(0, index + 1), epsilon).slice(0, -1).concat(dp(points.slice(index), epsilon));
}

export function traceHull({ threshold = ALPHA, target = TARGET } = {}) {
  const image = decodePng(readFileSync(SPRITE));
  const mask = bodyMask(image, threshold);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    const x = i % image.width, y = (i / image.width) | 0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1); minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1);
  }
  const boundary = outerBoundary(mask, image.width, image.height);
  // Smallest tolerance whose outline has at most `target` vertices.
  let lo = 0.5, hi = 200, poly = null;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2, s = simplifyClosed(boundary, mid);
    if (s.length > target) lo = mid; else { hi = mid; poly = s; }
  }
  const k = SPRITE_CELLS / image.width;
  const cx = image.width / 2, cy = image.height / 2;
  // Image y points down (toward the tail); ship y points forward.
  let verts = poly.map(([x, y]) => [+((x - cx) * k).toFixed(4), +((cy - y) * k).toFixed(4)]);
  // Counter-clockwise in ship coordinates (x right, y forward), nose first.
  const signed = verts.reduce((s, [x, y], i) => { const [u, v] = verts[(i + 1) % verts.length]; return s + x * v - u * y; }, 0);
  if (signed < 0) verts.reverse();
  let nose = 0;
  verts.forEach((v, i) => { if (v[1] > verts[nose][1]) nose = i; });
  verts = verts.slice(nose).concat(verts.slice(0, nose));
  const body = { width: (maxX - minX) * k, length: (maxY - minY) * k };
  return { verts, body, epsilonPx: hi, image: { width: image.width, height: image.height }, boundary: boundary.length };
}

function moduleText({ verts, body, epsilonPx }) {
  const rows = verts.map(([x, y]) => `  [${x.toFixed(4)}, ${y.toFixed(4)}],`).join("\n");
  return `// GENERATED by scripts/generate-stardust-ship-hull.mjs — do not edit by hand.
// Regenerate: node scripts/generate-stardust-ship-hull.mjs (after changing
// art/player-ship.png or drawCourier's size in gfx/stardustVfx.js).
//
// The player ship's collision hull: the outline of art/player-ship.png's
// opaque body (alpha > ${ALPHA}), simplified to ${verts.length} vertices (Douglas-Peucker,
// ${epsilonPx.toFixed(2)} px tolerance on the 1254 px sprite). Ship-local cells as drawn by
// drawCourier (a ${SPRITE_CELLS.toFixed(3)}-cell square): x = right, y = forward (the
// nose), origin = sprite centre. Counter-clockwise, nose first. Concave.
// Measured opaque body: ${body.width.toFixed(3)} wide x ${body.length.toFixed(3)} long.
export const SHIP_HULL = Object.freeze([
${rows}
].map((v) => Object.freeze(v)));

/** The sprite's opaque body (alpha > ${ALPHA}) as measured when the hull was traced. */
export const SHIP_BODY = Object.freeze({ width: ${body.width.toFixed(4)}, length: ${body.length.toFixed(4)}, alphaThreshold: ${ALPHA}, spriteCells: ${SPRITE_CELLS.toFixed(4)} });
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = traceHull();
  const xs = result.verts.map((v) => v[0]), ys = result.verts.map((v) => v[1]);
  console.log(`${result.verts.length} vertices from a ${result.boundary}-point boundary (${result.epsilonPx.toFixed(2)} px tolerance)`);
  console.log(`body ${result.body.width.toFixed(3)} x ${result.body.length.toFixed(3)} cells; hull x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}`);
  if (process.argv.includes("--check")) console.log(JSON.stringify(result.verts));
  else { writeFileSync(OUT, moduleText(result)); console.log(`wrote ${path.relative(root, OUT)}`); }
}
