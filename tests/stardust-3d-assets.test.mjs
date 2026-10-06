// Stardust 3D models: the manifest schema, every listed .glb exists and is within budget, the
// measurements in the manifest match the files, ships are the size of the game's hulls, the vendored
// loader and the viewer's imports resolve, and the loader degrades quietly (all without WebGL).
// The Blender exporter itself is not run here (it needs the read-only sources and Blender);
// `npm run assets:3d:check` re-verifies the files and manifest.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../projects/Space-Shooter/vendor/three/three.module.js';
import { BUDGETS, budgetProblems, buildManifest } from '../tools/3d/build.mjs';
import { inspectGlb, parseGlb, sha256File } from '../tools/3d/glb.mjs';
import { PLAYER_HULL, hullForBuild } from '../projects/Space-Shooter/engine/hull.js';
import * as assetsModule from '../projects/Space-Shooter/gfx3d/assets.js';

// three's FileLoader reports download progress with a browser-only event class.
globalThis.ProgressEvent ??= class ProgressEvent extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
const firstMesh = (o) => { let m = null; o.traverse((c) => { if (!m && c.isMesh) m = c; }); return m; };

const { DEFAULT_FIT, PROP_NAMES, SHIP_NAMES, loadAssets, normalizeManifest, prepareModel, resolveEntry, scaleToFootprintRadius } = assetsModule;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(root, 'projects', 'Space-Shooter');
const art = path.join(game, 'art', '3d');
const manifest = JSON.parse(readFileSync(path.join(art, 'manifest.json'), 'utf8'));
const entries = (kind) => Object.entries(manifest[kind]).filter(([, e]) => !e.alias);
const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

// ---------------------------------------------------------------------------------------------
test('the manifest has the documented shape', () => {
  assert.equal(manifest.version, 1);
  assert.match(manifest.units, /\+X/);
  assert.deepEqual(manifest.budgets, JSON.parse(JSON.stringify(BUDGETS)), 'budgets in the manifest are the ones tools/3d/build.mjs enforces');
  assert.equal(typeof manifest.ships, 'object');
  assert.equal(typeof manifest.props, 'object');
  for (const kind of ['ships', 'props']) {
    for (const [name, e] of Object.entries(manifest[kind])) {
      const label = `${kind}/${name}`;
      if (e.alias) {
        assert.ok(manifest[kind][e.alias] && !manifest[kind][e.alias].alias, `${label} aliases a real entry`);
        continue;
      }
      assert.match(e.file, new RegExp(`^${kind}/[A-Za-z0-9._-]+\\.glb$`), `${label} file path`);
      assert.ok(finite3(e.rotation), `${label} rotation is [x, y, z] degrees`);
      assert.ok(finite3(e.offset), `${label} offset is [x, y, z]`);
      assert.ok(Number.isFinite(e.scale) && e.scale > 0, `${label} scale`);
      assert.ok(['none', 'center', 'bottom'].includes(e.pivot), `${label} pivot`);
      const fit = Object.entries(e.fit || {});
      assert.equal(fit.length, 1, `${label} fit has exactly one rule`);
      assert.ok(['radius', 'length', 'width', 'height'].includes(fit[0][0]) && fit[0][1] > 0, `${label} fit rule`);
      assert.ok(e.provenance && typeof e.provenance.source === 'string', `${label} has provenance`);
      for (const f of ['bytes', 'triangles', 'vertices', 'materials']) assert.ok(Number.isInteger(e[f]) && e[f] > 0, `${label} ${f}`);
      assert.match(e.sha256, /^[0-9a-f]{64}$/);
    }
  }
  for (const n of SHIP_NAMES.filter((x) => x !== 'default')) assert.ok(manifest.ships[n], `ships.${n} is listed`);
});

test('ships.default resolves to a real model (the Courier unless a real default exists)', () => {
  const r = resolveEntry(manifest, 'ships', 'default');
  assert.ok(r, 'default ship resolves');
  assert.equal(manifest.ships.default.alias, 'courier');
  assert.equal(r.file, 'ships/courier.glb');
  for (const family of ['needle', 'manta', 'wisp']) assert.ok(manifest.ships[family]?.file, `${family} is exported`);
});

test('every listed file exists, nothing in art/3d is unlisted, and the hashes and counts match', () => {
  const listed = new Set();
  for (const kind of ['ships', 'props']) {
    for (const [name, e] of entries(kind)) {
      const abs = path.join(art, e.file);
      assert.ok(existsSync(abs), `${e.file} exists`);
      listed.add(e.file);
      assert.equal(sha256File(abs), e.sha256, `${e.file} sha256 (run npm run assets:3d:manifest after replacing a model)`);
      const info = inspectGlb(abs);
      assert.equal(info.bytes, e.bytes, `${e.file} bytes`);
      assert.equal(Math.round(info.triangles), e.triangles, `${e.file} triangles`);
      assert.equal(info.vertices, e.vertices, `${e.file} vertices`);
      assert.equal(info.materials, e.materials, `${e.file} materials`);
      assert.equal(info.images.length, e.textures.length, `${e.file} textures`);
      assert.ok(name);
    }
    const dir = path.join(art, kind);
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (/\.(glb|gltf|bin)$/i.test(f)) assert.ok(listed.has(`${kind}/${f}`), `${kind}/${f} is not in the manifest`);
  }
  assert.ok(listed.size >= 4, 'at least the four ships');
});

test('size budgets: file bytes, triangles and texture sizes', () => {
  assert.deepEqual(budgetProblems(manifest), []);
  for (const [kind, table, maxBytes, maxTris] of [['ship', entries('ships'), BUDGETS.shipBytes, BUDGETS.shipTriangles], ['prop', entries('props'), BUDGETS.propBytes, BUDGETS.propTriangles]]) {
    for (const [name, e] of table) {
      assert.ok(e.bytes <= maxBytes, `${kind} ${name} is ${e.bytes} bytes, budget ${maxBytes}`);
      assert.ok(e.triangles <= maxTris, `${kind} ${name} has ${e.triangles} triangles, budget ${maxTris}`);
      const info = inspectGlb(path.join(art, e.file));
      assert.ok(info.images.every((i) => !i.external), `${e.file} embeds its textures`);
      for (const i of info.images) assert.ok(Math.max(i.width, i.height) <= BUDGETS.textureSide, `${e.file} has a ${i.width}x${i.height} texture`);
    }
  }
  assert.ok(BUDGETS.shipBytes <= 1_500_000, 'ship budget stays at 1.5 MB');
});

test('every .glb only needs extensions the vendored loader can decode without extra files', () => {
  const loaderSource = readFileSync(path.join(game, 'vendor', 'three', 'addons', 'GLTFLoader.js'), 'utf8');
  const known = new Set([...loaderSource.matchAll(/^\t[A-Z0-9_]+: '((?:KHR|EXT)_[a-z0-9_]+)'/gm)].map((m) => m[1]));
  assert.ok(known.has('KHR_mesh_quantization') && known.has('EXT_texture_webp'));
  // These need a decoder or transcoder that is not vendored (draco, meshopt, basis).
  const needsDecoder = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_texture_basisu', 'EXT_texture_avif']);
  for (const [, e] of [...entries('ships'), ...entries('props')]) {
    const info = inspectGlb(path.join(art, e.file));
    for (const ext of info.extensionsRequired) {
      assert.ok(known.has(ext), `${e.file} requires ${ext}, which the vendored GLTFLoader does not know`);
      assert.ok(!needsDecoder.has(ext), `${e.file} requires ${ext}, which needs a decoder that is not vendored`);
    }
    assert.equal(info.animations, 0, `${e.file} has no animations (ignored by the game)`);
  }
});

// ---------------------------------------------------------------------------------------------
test('exported ships have the game hull size, nose +X, and origin on the hull', () => {
  const targets = JSON.parse(readFileSync(path.join(root, 'tools', '3d', 'hull-targets.json'), 'utf8')).targets;
  for (const [key, build] of [['courier', 'courier:0-0-0-0'], ['needle', 'needle:0-0-0-0'], ['manta', 'manta:0-0-0-0'], ['wisp', 'wisp:0-0-0-0']]) {
    const live = hullForBuild(build);
    assert.ok(Math.abs(targets[key].radius - live.radius) < 1e-3, `tools/3d/hull-targets.json is stale for ${key}: run npm run assets:3d`);
    const e = manifest.ships[key];
    const info = inspectGlb(path.join(art, e.file));
    assert.ok(Math.abs(info.footprintRadius - live.radius) / live.radius < 0.01, `${key} footprint radius ${info.footprintRadius} vs hull ${live.radius}`);
    const length = info.bounds.size[0], width = info.bounds.size[2];
    // Owner remakes (tools/3d/incoming) keep their own proportions: the footprint radius is fitted
    // exactly, length/width may differ from the hit box by up to 20% (recorded in hullFit for review).
    const owner = /incoming/.test(e.provenance?.source || '');
    const shape = owner ? 0.2 : 0.1, ends = owner ? 0.2 : 0.06;
    assert.ok(Math.abs(length / (live.nose + live.tail) - 1) < shape, `${key} length ${length} vs hull ${live.nose + live.tail}`);
    assert.ok(width > 0 && Math.abs(width / (live.halfSpan * 2) - 1) < shape, `${key} width ${width} vs hull ${live.halfSpan * 2}`);
    // nose +X: the model's forward extent is about the hull's (nose ahead of the origin by about hull.nose)
    assert.ok(Math.abs(info.bounds.max[0] - live.nose) < ends * (live.nose + live.tail), `${key} nose at x=${info.bounds.max[0]}, hull nose ${live.nose}`);
    assert.ok(Math.abs(info.bounds.min[0] + live.tail) < ends * (live.nose + live.tail), `${key} tail at x=${info.bounds.min[0]}, hull tail ${live.tail}`);
    assert.ok(info.bounds.size[1] < Math.min(length, width), `${key} is flat (up is +Y)`);
    assert.ok(Math.abs(e.hullFit.radiusRatio - 1) < 0.01 && e.hull.build === build);
  }
  assert.ok(PLAYER_HULL.radius > 0.5, 'the standard hull is larger than the Courier garage hull; ship.js rescales via scaleToFootprintRadius when it wants it');
});

test('the manifest on disk is what tools/3d/build.mjs would write now (not stale)', () => {
  const report = JSON.parse(readFileSync(path.join(root, 'tools', '3d', 'export-report.json'), 'utf8'));
  const rebuilt = buildManifest({ previous: manifest, report });
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilt)), manifest);
  for (const m of report.models) {
    assert.ok(!m.error, `${m.name} exported without error`);
    assert.match(m.sourceSha256, /^[0-9a-f]{64}$/);
    assert.ok(!/^[A-Za-z]:|^\//.test(m.source), `${m.name} provenance has no absolute path: ${m.source}`);
  }
  for (const [name, e] of entries('ships')) {
    assert.ok(!JSON.stringify(e).match(/[A-Za-z]:[\\/]/), `${name} has no absolute Windows path in the manifest`);
  }
});

// ---------------------------------------------------------------------------------------------
test('vendored loader and the viewer/loader imports resolve (no WebGL needed)', async () => {
  assert.equal(readFileSync(path.join(game, 'vendor', 'three', 'VERSION'), 'utf8').trim(), '0.186.0');
  assert.equal(THREE.REVISION, '186');
  const { GLTFLoader } = await import('../projects/Space-Shooter/vendor/three/addons/GLTFLoader.js');
  assert.equal(typeof GLTFLoader, 'function');
  assert.equal(typeof new GLTFLoader().parse, 'function');
  const specs = (file) => {
    const src = readFileSync(file, 'utf8');
    return [...src.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
  };
  for (const file of [path.join(game, 'gfx3d', 'assets.js'), path.join(game, 'gfx3d', 'viewer.js')]) {
    for (const spec of specs(file)) {
      assert.ok(spec.startsWith('.'), `${path.basename(file)} imports ${spec}: relative paths only (no CDN, no bare specifiers)`);
      assert.ok(existsSync(path.resolve(path.dirname(file), spec)), `${path.basename(file)} imports ${spec}, which does not exist`);
    }
  }
  const html = readFileSync(path.join(game, 'viewer3d.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /src="\.\/gfx3d\/viewer\.js"/);
  assert.ok(!/https?:\/\//.test(html.replace(/xmlns='http:\/\/www\.w3\.org\/2000\/svg'/g, '')), 'viewer3d.html makes no third-party requests');
  assert.ok(!/https?:\/\/(?!127\.|localhost)/.test(readFileSync(path.join(game, 'gfx3d', 'viewer.js'), 'utf8')), 'viewer.js makes no external requests');
});

test('the viewer page is unlisted: not linked from the site, not in a sitemap source', () => {
  for (const dir of ['src', 'content', 'templates', 'scripts']) {
    const base = path.join(root, dir);
    if (!existsSync(base)) continue;
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]));
    for (const f of walk(base)) {
      if (!/\.(ejs|md|html|js|mjs|json|xml)$/.test(f) || /stardust-3d-assets\.test/.test(f)) continue;
      assert.ok(!readFileSync(f, 'utf8').includes('viewer3d'), `${path.relative(root, f)} mentions viewer3d`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
test('resolveEntry follows aliases, fills defaults and rejects entries without a file', () => {
  const m = normalizeManifest({ ships: { courier: { file: 'ships/c.glb' }, default: { alias: 'courier' }, loop: { alias: 'loop' } }, props: { mine: { file: 'props/m.glb', rotation: [0, 90, 0], fit: { radius: 0.42 }, scale: 2 }, shard: {} } });
  const d = resolveEntry(m, 'ships', 'default');
  assert.equal(d.file, 'ships/c.glb');
  assert.deepEqual(d.fit, DEFAULT_FIT.ships.courier, 'the default fit follows the aliased ship, not the alias name');
  assert.equal(d.pivot, 'center');
  const mine = resolveEntry(m, 'props', 'mine');
  assert.deepEqual(mine.rotation, [0, 90, 0]);
  assert.equal(mine.scale, 2);
  assert.equal(mine.pivot, 'none', 'an explicit fit means the file is already placed');
  assert.equal(resolveEntry(m, 'props', 'shard'), null);
  assert.equal(resolveEntry(m, 'ships', 'loop'), null, 'an alias loop does not hang');
  assert.equal(resolveEntry(m, 'ships', 'missing'), null);
  assert.deepEqual(normalizeManifest(null).ships, {});
  assert.deepEqual(normalizeManifest('nope').props, {});
  for (const n of PROP_NAMES) assert.ok(DEFAULT_FIT.props[n], `${n} has a default size`);
});

test('prepareModel applies rotation, pivot, fit, scale and offset', () => {
  const make = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1), new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0 }))); // long axis X
    g.children[0].position.set(5, 3, 1); // an arbitrary origin
    return g;
  };
  const place = (resolved) => prepareModel(THREE, make(), { rotation: [0, 0, 0], pivot: 'none', fit: null, scale: 1, offset: [0, 0, 0], ...resolved });
  const box = (m) => new THREE.Box3().setFromObject(m, true);

  const centred = place({ pivot: 'center' });
  assert.ok(box(centred).getCenter(new THREE.Vector3()).length() < 1e-6, 'pivot center puts the bounds on the origin');
  const bottom = place({ pivot: 'bottom' });
  assert.ok(Math.abs(box(bottom).min.y) < 1e-6 && Math.abs(box(bottom).getCenter(new THREE.Vector3()).x) < 1e-6, 'pivot bottom stands on y = 0');
  const kept = place({ pivot: 'none' });
  assert.ok(Math.abs(box(kept).getCenter(new THREE.Vector3()).x - 5) < 1e-6, 'pivot none keeps the file origin');

  const byLength = place({ pivot: 'center', fit: { length: 1 } });
  assert.ok(Math.abs(byLength.userData.asset.length - 1) < 1e-6);
  const byRadius = place({ pivot: 'center', fit: { radius: 0.4 } });
  assert.ok(Math.abs(byRadius.userData.asset.footprintRadius - 0.4) < 1e-6);
  const scaled = place({ pivot: 'center', fit: { length: 1 }, scale: 2, offset: [0, 0, 0.5] });
  assert.ok(Math.abs(scaled.userData.asset.length - 2) < 1e-6);
  assert.ok(Math.abs(box(scaled).getCenter(new THREE.Vector3()).z - 0.5) < 1e-6, 'offset moves it');

  const turned = place({ pivot: 'center', rotation: [0, 90, 0] }); // long X axis -> Z
  assert.ok(turned.userData.asset.width > turned.userData.asset.length, 'rotation Y 90 turns the long axis from X to Z');

  const mat = firstMesh(centred).material;
  assert.ok(mat.metalness <= assetsModule.LOOK.metalnessMax && mat.roughness >= assetsModule.LOOK.roughnessMin, 'metal is capped so it is not black without an environment map');
  assert.equal(mat.envMapIntensity, 0);

  const resized = scaleToFootprintRadius(THREE, byRadius, 0.8);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(resized, true).getSize(new THREE.Vector3()).x - byRadius.userData.asset.length * 2) < 1e-6, 'a clone rescaled to a bigger hull radius');
  assert.equal(firstMesh(resized).geometry, firstMesh(byRadius).geometry, 'clones share geometry');
});

// A tiny .glb with no textures, so the full GLTFLoader path runs in node.
function boxGlb() {
  const v = [-1, -0.25, -0.5, 1, -0.25, -0.5, 1, 0.25, -0.5, -1, 0.25, -0.5, -1, -0.25, 0.5, 1, -0.25, 0.5, 1, 0.25, 0.5, -1, 0.25, 0.5];
  const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3, 1, 5, 6, 1, 6, 2, 0, 3, 7, 0, 7, 4];
  const pos = Buffer.from(new Float32Array(v).buffer);
  const ind = Buffer.from(new Uint16Array(idx).buffer);
  const bin = Buffer.concat([pos, ind, Buffer.alloc((4 - ind.length % 4) % 4)]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-1, -0.25, -0.5], max: [1, 0.25, 0.5] }, { bufferView: 1, componentType: 5123, count: idx.length, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: ind.length }],
    buffers: [{ byteLength: bin.length }],
  };
  let j = Buffer.from(JSON.stringify(json));
  j = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(j.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, c1, j, c2, bin]);
}

test('the glb reader understands a hand-made .glb', () => {
  const file = path.join(root, 'tools', '3d', 'glb.mjs');
  assert.ok(existsSync(file));
  const { json } = parseGlb(boxGlb());
  assert.equal(json.asset.version, '2.0');
  assert.throws(() => parseGlb(Buffer.from('not a glb at all, sorry')), /magic/);
});

test('loadAssets: loads what it can, skips what it cannot, never throws', async () => {
  const glb = boxGlb();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  const files = {
    '/art/3d/manifest.json': JSON.stringify({
      version: 1,
      ships: {
        courier: { file: 'ships/box.glb', pivot: 'center', fit: { radius: 0.5 } },
        default: { alias: 'courier' },
        needle: { file: 'ships/box.glb', rotation: [0, 90, 0], pivot: 'center', fit: { length: 1.4 } },
        ghost: { file: 'ships/missing.glb' },
        broken: { file: 'ships/garbage.glb' },
      },
      props: { fuelStation: { file: 'props/box.glb' }, mine: { file: 'props/missing.glb' }, shard: 'nonsense' },
    }),
    '/art/3d/ships/box.glb': glb, '/art/3d/props/box.glb': glb, '/art/3d/ships/garbage.glb': Buffer.from('this is not a model'),
  };
  const server = http.createServer((req, res) => {
    const body = files[req.url.split('?')[0]];
    if (!body) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'content-type': req.url.endsWith('.json') ? 'application/json' : 'model/gltf-binary' }); res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/art/3d/`;
  try {
    const a = await loadAssets(THREE, base + 'manifest.json');
    assert.deepEqual(Object.keys(a.ships).sort(), ['courier', 'default', 'needle']);
    assert.equal(a.ships.default, a.ships.courier, 'an alias is the same object');
    assert.ok(Math.abs(a.ships.courier.userData.asset.footprintRadius - 0.5) < 1e-3, 'courier fitted to radius 0.5');
    const needle = a.ships.needle.userData.asset;
    assert.ok(Math.abs(needle.length - 1.4) < 1e-3 && Math.abs(needle.width - 2.8) < 1e-3, 'rotation Y 90 turns the 2 x 1 box to 1 x 2, then fit by length makes X 1.4 (so Z is 2.8)');
    assert.deepEqual(Object.keys(a.props), ['fuelStation']);
    const station = a.props.fuelStation.userData.asset;
    assert.ok(Math.abs(station.footprintRadius - 1) < 1e-3, 'the fuel station defaults to radius 1');
    assert.ok(Math.abs(new THREE.Box3().setFromObject(a.props.fuelStation, true).min.y) < 1e-6, 'the fuel station stands on y = 0');
    assert.deepEqual(a.failed.sort(), ['props/mine', 'ships/broken', 'ships/ghost']);
    assert.ok(warnings.some((w) => /ships\/ghost/.test(w)) && warnings.some((w) => /ships\/broken/.test(w)), 'each skip is warned about');
    const copy = a.ships.courier.clone(true);
    assert.notEqual(copy, a.ships.courier);
    assert.equal(copy.userData.asset.triangles, 12);

    const some = await loadAssets(THREE, base + 'manifest.json', { only: { ships: ['needle'], props: [] } });
    assert.deepEqual([Object.keys(some.ships).sort(), Object.keys(some.props)], [['default', 'needle'], []], 'only loads the names asked for (default falls back to what did load)');
    assert.equal(some.ships.default, some.ships.needle);

    const none = await loadAssets(THREE, base + 'nope.json');
    assert.deepEqual([none.ships, none.props, none.failed], [{}, {}, []], 'a missing manifest gives empty sets');
    const bad = await loadAssets(THREE, 'not a url at all');
    assert.deepEqual(bad.ships, {});
  } finally {
    console.warn = origWarn;
    await new Promise((r) => server.close(r));
  }
});

test('the exporter and docs are in place and agree with package.json', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const s of ['assets:3d', 'assets:3d:incoming', 'assets:3d:manifest', 'assets:3d:check']) assert.ok(pkg.scripts[s], `npm script ${s}`);
  for (const dep of ['core', 'extensions', 'functions']) assert.match(pkg.devDependencies[`@gltf-transform/${dep}`], /^\d+\.\d+\.\d+$/, `@gltf-transform/${dep} is pinned exactly`);
  const doc = readFileSync(path.join(root, 'docs', 'stardust', '3D-ASSETS.md'), 'utf8');
  for (const needle of ['npm run assets:3d', 'viewer3d.html', 'fuelStation', '+X', '1.5 MB', 'tools/3d/incoming']) assert.ok(doc.includes(needle), `3D-ASSETS.md mentions ${needle}`);
  for (const f of ['export_ships.py', 'build.mjs', 'optimize.mjs', 'hull-targets.mjs', 'glb.mjs']) assert.ok(existsSync(path.join(root, 'tools', '3d', f)), f);
  const py = spawnSync('python', ['-c', `import ast,sys;ast.parse(open(${JSON.stringify(path.join(root, 'tools', '3d', 'export_ships.py'))},encoding='utf-8').read())`], { encoding: 'utf8' });
  if (py.error) return; // no python on this machine: skip the syntax check
  assert.equal(py.status, 0, `export_ships.py does not parse: ${py.stderr}`);
});

test('the same loader entry point is what gfx3d/index.js calls', () => {
  const index = readFileSync(path.join(game, 'gfx3d', 'index.js'), 'utf8');
  assert.match(index, /loadAssets\(THREE, new URL\('\.\.\/art\/3d\/manifest\.json', import\.meta\.url\)\.href\)/);
  assert.equal(typeof assetsModule.loadAssets, 'function');
});
