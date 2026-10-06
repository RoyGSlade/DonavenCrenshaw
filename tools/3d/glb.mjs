// Tiny dependency-free .glb reader: enough to measure a model (triangles, bounds, textures,
// extensions) without WebGL. Used by build.mjs (manifest stats) and tests/stardust-3d-assets.test.mjs.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const COMPONENT = { 5120: [1, true], 5121: [1, false], 5122: [2, true], 5123: [2, false], 5125: [4, false], 5126: [4, false] };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function sha256File(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

/** Splits a .glb into { json, bin }. Throws on a malformed file. */
export function parseGlb(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a binary glTF (missing glTF magic)');
  if (b.readUInt32LE(4) !== 2) throw new Error('only glTF 2.0 is supported');
  if (b.readUInt32LE(8) !== b.length) throw new Error('glb length field does not match the file size');
  let json = null, bin = null;
  for (let o = 12; o + 8 <= b.length;) {
    const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4), data = b.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942 && !bin) bin = data;
    o += 8 + len;
  }
  if (!json) throw new Error('glb has no JSON chunk');
  return { json, bin };
}

function imageSize(bytes, mime) {
  try {
    if (mime === 'image/png') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    if (mime === 'image/webp') {
      const kind = bytes.toString('ascii', 12, 16);
      if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
      if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
      if (kind === 'VP8L') { const v = bytes.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    }
    if (mime === 'image/jpeg') {
      for (let o = 2; o + 9 < bytes.length;) {
        if (bytes[o] !== 0xff) { o++; continue; }
        const marker = bytes[o + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [bytes.readUInt16BE(o + 7), bytes.readUInt16BE(o + 5)];
        o += 2 + bytes.readUInt16BE(o + 2);
      }
    }
  } catch { /* fall through */ }
  return null;
}

function mat4(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function mul(a, b) { // column-major a * b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function readVec3(json, bin, accessorIndex) {
  const a = json.accessors[accessorIndex], bv = json.bufferViews[a.bufferView];
  const [size, signedNorm] = COMPONENT[a.componentType], n = TYPE_SIZE[a.type], stride = bv.byteStride || size * n;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const v = [];
    for (let c = 0; c < 3; c++) {
      const o = base + i * stride + c * size;
      let x = size === 4 ? bin.readFloatLE(o) : size === 2 ? (signedNorm ? bin.readInt16LE(o) : bin.readUInt16LE(o)) : (signedNorm ? bin.readInt8(o) : bin.readUInt8(o));
      if (a.normalized) x = signedNorm ? Math.max(x / NORM[a.componentType], -1) : x / NORM[a.componentType];
      v.push(x);
    }
    out.push(v);
  }
  return out;
}

/**
 * Measures a .glb: triangles, vertex/material/texture counts, extensions, and the bounds / footprint radius in
 * three.js space (the nose is +X, up +Y, as the game loads it). `exact` reads every vertex (fast enough for 30k tris).
 */
export function inspectGlb(path) {
  const buf = readFileSync(path);
  const { json, bin } = parseGlb(buf);
  const nodes = json.nodes || [], scene = (json.scenes || [])[json.scene ?? 0] || { nodes: [] };
  let triangles = 0, vertices = 0, primitives = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let r2 = 0;
  const walk = (index, parent) => {
    const node = nodes[index];
    const local = node.matrix ? node.matrix : mat4(node.translation, node.rotation, node.scale);
    const world = mul(parent, local);
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        primitives++;
        const pos = json.accessors[prim.attributes.POSITION];
        vertices += pos.count;
        const count = prim.indices !== undefined ? json.accessors[prim.indices].count : pos.count;
        if ((prim.mode ?? 4) === 4) triangles += count / 3;
        if (bin) {
          for (const p of readVec3(json, bin, prim.attributes.POSITION)) {
            const w = apply(world, p);
            for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
            r2 = Math.max(r2, w[0] * w[0] + w[2] * w[2]);
          }
        }
      }
    }
    for (const child of node.children || []) walk(child, world);
  };
  for (const root of scene.nodes || []) walk(root, mat4());
  const images = (json.images || []).map((im) => {
    const bv = im.bufferView !== undefined ? json.bufferViews[im.bufferView] : null;
    const bytes = bv && bin ? bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength) : null;
    const dim = bytes ? imageSize(bytes, im.mimeType) : null;
    return { mime: im.mimeType || (im.uri ? 'external' : 'unknown'), bytes: bv ? bv.byteLength : 0, width: dim?.[0] ?? null, height: dim?.[1] ?? null, external: !!im.uri };
  });
  const finite = min.every(Number.isFinite);
  return {
    bytes: buf.length,
    triangles,
    vertices,
    primitives,
    materials: (json.materials || []).length,
    images,
    extensionsUsed: json.extensionsUsed || [],
    extensionsRequired: json.extensionsRequired || [],
    animations: (json.animations || []).length,
    bounds: finite ? { min, max, size: max.map((v, i) => v - min[i]) } : null,
    footprintRadius: finite ? Math.sqrt(r2) : null,
    generator: json.asset?.generator || null,
  };
}
