// Loads the 3D models listed in art/3d/manifest.json and hands them to the renderer as
// ready-to-clone Object3Ds. Rendering only; nothing here touches the simulation.
//
//   const { manifest, ships, props, failed } = await loadAssets(THREE, manifestUrl);
//   ships:  { default, courier, needle, manta, wisp, ... }   (whatever the manifest lists and loaded)
//   props:  { fuelStation, mine, asteroid, shard, sentry, ... }
//   obj.clone(true) per use (geometry, materials and textures are shared between clones).
//
// Model convention (docs/stardust/3D-ASSETS.md): the nose points +X, up is +Y, origin at the
// hull centre, one unit = one sim cell. Every object carries userData.asset =
// { kind, name, file, triangles, size: [x, y, z], footprintRadius, length, width, height, hull, source }
// so the ship rig can rescale to any build's hull radius (scaleToFootprintRadius).
//
// A missing, broken or slow file never throws: it is skipped with a console warning and the
// caller falls back to whatever stand-in it has. The manifest itself failing yields empty sets.
//
// Manifest entry fields (all optional except `file` or `alias`):
//   file      path relative to the manifest, e.g. "ships/needle.glb"
//   alias     use another entry of the same kind ("default": {"alias": "courier"})
//   rotation  [x, y, z] degrees, applied first: bring a raw model so the nose points +X (what the viewer shows)
//   pivot     "none" (keep the file's origin, default), "center" (centre the bounds), "bottom" (centre XZ, base on y = 0)
//   fit       {"radius": r} | {"length": l} | {"width": w} | {"height": h}: scale so the footprint radius
//             (about the origin after the pivot) or the X / Z / Y extent equals r / l / w / h cells
//   scale     extra multiplier after the fit (default 1)
//   offset    [x, y, z] added last, in cells (default 0)
// The renderer-independent parts (entry resolution, defaults) are exported for tests.

export const MANIFEST_VERSION = 1;
export const SHIP_NAMES = ['default', 'courier', 'needle', 'manta', 'wisp'];
export const PROP_NAMES = ['fuelStation', 'mine', 'asteroid', 'shard', 'sentry'];

/** Footprint sizes the game draws things at (sim cells), used when an entry has no `fit`. */
export const DEFAULT_FIT = Object.freeze({
  ships: Object.freeze({ default: { radius: 0.5161 }, courier: { radius: 0.5161 }, needle: { radius: 0.7265 }, manta: { radius: 0.7829 }, wisp: { radius: 0.6968 } }),
  props: Object.freeze({ fuelStation: { radius: 1 }, mine: { radius: 0.42 }, asteroid: { radius: 1 }, shard: { length: 0.95 }, sentry: { radius: 0.5 } }),
});
const DEFAULT_PIVOT = Object.freeze({ fuelStation: 'bottom', sentry: 'bottom' });

/** How the models are lit. No environment map is used, so full metal would render black. */
export const LOOK = { metalnessMax: 0.45, roughnessMin: 0.35, anisotropy: 4, envMapIntensity: 0 };

const LOAD_TIMEOUT_MS = 20000;
const warn = (...a) => console.warn('[3d]', ...a);
const num3 = (v, d) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v : d);

/** The manifest with every section present and shaped. Never throws. */
export function normalizeManifest(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  return { ...m, version: m.version ?? MANIFEST_VERSION, ships: m.ships && typeof m.ships === 'object' ? m.ships : {}, props: m.props && typeof m.props === 'object' ? m.props : {} };
}

/**
 * One manifest entry with aliases followed and defaults filled in:
 * { file, rotation, pivot, fit, scale, offset, entry } or null when it has no file.
 */
export function resolveEntry(manifest, kind, name) {
  const table = manifest?.[kind] || {};
  let entry = table[name], hops = 0, finalName = name;
  while (entry && typeof entry.alias === 'string' && hops++ < 4) { finalName = entry.alias; entry = table[entry.alias]; }
  if (!entry || typeof entry.file !== 'string' || !entry.file) return null;
  const fitDefault = DEFAULT_FIT[kind]?.[finalName];
  const fit = entry.fit && typeof entry.fit === 'object' ? entry.fit : fitDefault || null;
  return {
    file: entry.file,
    rotation: num3(entry.rotation, [0, 0, 0]),
    pivot: ['none', 'center', 'bottom'].includes(entry.pivot) ? entry.pivot : (entry.fit ? 'none' : DEFAULT_PIVOT[finalName] || 'center'),
    fit,
    scale: Number.isFinite(entry.scale) && entry.scale > 0 ? entry.scale : 1,
    offset: num3(entry.offset, [0, 0, 0]),
    entry,
  };
}

// ---------------------------------------------------------------------------------------------
// Model preparation (needs three.js, not WebGL)

function eachMesh(root, fn) { root.traverse((o) => { if (o.isMesh && o.geometry) fn(o); }); }

export function countTriangles(root) {
  let t = 0;
  eachMesh(root, (m) => { const g = m.geometry; t += Math.floor((g.index ? g.index.count : g.attributes.position?.count || 0) / 3); });
  return t;
}

/** Largest distance from the origin to any vertex in the XZ plane (the "hull radius" of a model). */
export function footprintRadius(THREE, root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let r2 = 0;
  eachMesh(root, (m) => {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); r2 = Math.max(r2, v.x * v.x + v.z * v.z); }
  });
  return Math.sqrt(r2);
}

/** Sets sRGB, envMap-free metal look and anisotropy on a loaded material (in place). */
export function tuneMaterial(THREE, mat, look = LOOK) {
  if (!mat) return mat;
  for (const key of ['map', 'emissiveMap']) if (mat[key]) { mat[key].colorSpace = THREE.SRGBColorSpace; mat[key].anisotropy = look.anisotropy; }
  for (const key of ['normalMap', 'metalnessMap', 'roughnessMap', 'aoMap']) if (mat[key]) mat[key].anisotropy = look.anisotropy;
  if ('envMapIntensity' in mat) mat.envMapIntensity = look.envMapIntensity;
  if (typeof mat.metalness === 'number') mat.metalness = Math.min(mat.metalness, look.metalnessMax);
  if (typeof mat.roughness === 'number') mat.roughness = Math.max(mat.roughness, look.roughnessMin);
  mat.side = THREE.FrontSide;
  return mat;
}

/**
 * Wraps a freshly loaded glTF scene: applies the entry's rotation, pivot, fit, scale and offset,
 * tunes the materials and records the final size. Returns a Group that is safe to clone().
 */
export function prepareModel(THREE, scene, resolved, meta = {}) {
  const inner = scene;
  inner.rotation.set(...resolved.rotation.map((d) => (d * Math.PI) / 180), 'XYZ');
  inner.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.add(inner);

  const box = new THREE.Box3().setFromObject(root, true);
  const centre = box.getCenter(new THREE.Vector3());
  const shift = new THREE.Vector3();
  if (resolved.pivot === 'center') shift.copy(centre).negate();
  else if (resolved.pivot === 'bottom') shift.set(-centre.x, -box.min.y, -centre.z);
  inner.position.add(shift);
  inner.updateMatrixWorld(true);

  let k = 1;
  const fit = resolved.fit;
  if (fit) {
    const size = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3());
    if (Number.isFinite(fit.radius) && fit.radius > 0) { const r = footprintRadius(THREE, root); if (r > 1e-9) k = fit.radius / r; }
    else if (Number.isFinite(fit.length) && size.x > 1e-9) k = fit.length / size.x;
    else if (Number.isFinite(fit.width) && size.z > 1e-9) k = fit.width / size.z;
    else if (Number.isFinite(fit.height) && size.y > 1e-9) k = fit.height / size.y;
  }
  k *= resolved.scale;
  inner.scale.multiplyScalar(k);
  inner.position.multiplyScalar(k);
  inner.position.add(new THREE.Vector3(...resolved.offset));
  root.updateMatrixWorld(true);

  const materials = new Set();
  eachMesh(root, (m) => {
    m.frustumCulled = true;
    for (const mat of [].concat(m.material)) { tuneMaterial(THREE, mat); materials.add(mat); }
  });
  const final = new THREE.Box3().setFromObject(root, true);
  const size = final.getSize(new THREE.Vector3());
  root.userData.asset = {
    ...meta,
    triangles: countTriangles(root),
    materials: materials.size,
    size: [size.x, size.y, size.z],
    length: size.x, height: size.y, width: size.z,
    footprintRadius: footprintRadius(THREE, root),
    scaleApplied: k,
  };
  return root;
}

let gltfLoaderPromise = null;
function gltfLoaderClass() {
  gltfLoaderPromise ||= import('../vendor/three/addons/GLTFLoader.js').then((m) => m.GLTFLoader);
  return gltfLoaderPromise;
}

/** Parses a .glb/.gltf held in memory (used by the viewer for local files; nothing is uploaded). */
export async function parseGlb(THREE, buffer, resourcePath = '') {
  const GLTFLoader = await gltfLoaderClass();
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => loader.parse(buffer, resourcePath, resolve, reject));
}

/** Turns an in-memory .glb into a prepared model using a (possibly default) entry. */
export async function loadModelFromBuffer(THREE, buffer, resolved, meta = {}) {
  const gltf = await parseGlb(THREE, buffer);
  return prepareModel(THREE, gltf.scene, resolved, meta);
}

/** A clone scaled so its footprint radius equals `radius` (e.g. hullForBuild(key).radius). Shares geometry and materials. */
export function scaleToFootprintRadius(THREE, model, radius) {
  const wrap = new THREE.Group();
  const clone = model.clone(true);
  wrap.add(clone);
  const own = model.userData?.asset?.footprintRadius;
  if (own > 1e-9 && radius > 0) wrap.scale.setScalar(radius / own);
  wrap.userData.asset = { ...(model.userData?.asset || {}), footprintRadius: radius };
  return wrap;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadEntry(THREE, GLTFLoader, manifest, manifestUrl, kind, name, cache) {
  const resolved = resolveEntry(manifest, kind, name);
  if (!resolved) return null;
  const url = new URL(resolved.file, manifestUrl).href;
  const key = `${url}|${JSON.stringify([resolved.rotation, resolved.pivot, resolved.fit, resolved.scale, resolved.offset])}`;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    try {
      const gltf = await withTimeout(new GLTFLoader().loadAsync(url), LOAD_TIMEOUT_MS, resolved.file);
      const e = resolved.entry;
      return prepareModel(THREE, gltf.scene, resolved, { kind, name, file: resolved.file, bytes: e.bytes ?? null, hull: e.hull ?? null, source: e.provenance?.source ?? e.source ?? null });
    } catch (error) {
      warn(`skipping ${kind}/${name} (${resolved.file}):`, error?.message || error);
      return null;
    }
  })();
  cache.set(key, job);
  return job;
}

/**
 * Loads every model the manifest lists. Resolves to { manifest, ships, props, failed }; never rejects.
 * `ships.default` falls back to the first family that loaded so the rig always has something real when any model exists.
 * Optional third argument { only: { ships: ['default', 'needle'], props: [...] } } loads just those names (saves download
 * and texture memory when only the equipped ship is needed); omit it to load everything.
 */
export async function loadAssets(THREE, manifestUrl, options = {}) {
  const out = { manifest: normalizeManifest(null), ships: {}, props: {}, failed: [] };
  let url;
  try { url = new URL(manifestUrl, globalThis.location?.href || undefined).href; } catch { warn('bad manifest url', manifestUrl); return out; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    out.manifest = normalizeManifest(await res.json());
  } catch (error) {
    warn('no 3D manifest, using stand-ins:', error?.message || error);
    return out;
  }
  let GLTFLoader;
  try { GLTFLoader = await gltfLoaderClass(); } catch (error) { warn('GLTFLoader unavailable, using stand-ins:', error?.message || error); return out; }
  const cache = new Map();
  const jobs = [];
  for (const kind of ['ships', 'props']) {
    for (const name of Object.keys(out.manifest[kind])) {
      if (options?.only?.[kind] && !options.only[kind].includes(name)) continue;
      jobs.push(loadEntry(THREE, GLTFLoader, out.manifest, url, kind, name, cache).then((model) => {
        if (model) out[kind][name] = model; else if (resolveEntry(out.manifest, kind, name)) out.failed.push(`${kind}/${name}`);
      }));
    }
  }
  await Promise.all(jobs);
  if (!out.ships.default) {
    const any = SHIP_NAMES.find((n) => out.ships[n]);
    if (any) out.ships.default = out.ships[any];
  }
  return out;
}
