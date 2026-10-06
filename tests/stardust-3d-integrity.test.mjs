// The 3D look is rendering only. These guards prove it stays that way:
//   1. the weekly sim, replay, pilot, hull and hub-submission modules are byte-identical to the base branch
//   2. nothing under gfx3d/ imports code that can change the game (static import scan)
//   3. nothing under gfx3d/ writes to sim state, input, storage or the network (static scan)
//   4. at runtime, every 3D module can run a real race's frames against a read-only view of the scene
//      (any write throws) and leaves the scene byte-for-byte as it found it
// If one of these fails, the 3D change touched gameplay. Fix the 3D code, not the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = path.join(repo, 'projects', 'Space-Shooter');
const gfx3d = path.join(game, 'gfx3d');
const rel = (p) => path.relative(repo, p).split(path.sep).join('/');

// ---------------------------------------------------------------- 1. gameplay files unchanged
// Everything that decides how the ship flies, what a lap is worth, how a run replays and what is sent to the hub.
const PROTECTED = [
  'projects/Space-Shooter/engine/weekly',            // layout, sim, replay, pilot, local best
  'projects/Space-Shooter/engine/modes/weekly.js',   // the weekly mode loop (fixed-step sim driver)
  'projects/Space-Shooter/engine/shipMovement.js',
  'projects/Space-Shooter/engine/hull.js',
  'projects/Space-Shooter/engine/shipHull.js',
  'projects/Space-Shooter/engine/shipHulls.js',
  'projects/Space-Shooter/engine/shipStats.js',
  'projects/Space-Shooter/engine/track.js',
  'projects/Space-Shooter/engine/trackChecks.js',
  'projects/Space-Shooter/engine/collisions',
  'projects/Space-Shooter/tracks/weekly.js',
  'projects/Space-Shooter/systems/weekly.js',
  'projects/Space-Shooter/systems/hubRuns.js',
  'projects/Space-Shooter/systems/hubSync.js',
  'projects/Space-Shooter/systems/runClient.js',
  'projects/Space-Shooter/input.js',
];

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** The commit the 3D work branched from: the merge-base with main, so a branch behind main is not blamed for main's own changes. */
function baseCommit() {
  for (const ref of ['origin/main', 'main']) {
    try { return { ref, sha: git('merge-base', 'HEAD', ref) }; } catch { /* try the next */ }
  }
  return null;
}

function filesUnder(p) {
  const full = path.join(repo, p);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [p];
  return readdirSync(full, { withFileTypes: true }).flatMap((e) => filesUnder(`${p}/${e.name}`));
}

test('weekly sim, replay, pilot, hull and hub modules are byte-identical to main', (t) => {
  const base = baseCommit();
  if (!base) return t.skip('no git history with an origin/main or main ref in this checkout');
  let compared = 0;
  for (const p of PROTECTED) {
    const atBase = git('ls-tree', '-r', '--name-only', base.sha, '--', p).split('\n').filter(Boolean);
    const now = filesUnder(p);
    assert.deepEqual(now.sort(), atBase.sort(), `${p}: files added or removed since ${base.ref}`);
    for (const file of atBase) {
      const was = git('rev-parse', `${base.sha}:${file}`);
      const is = git('hash-object', '--', file);
      assert.equal(is, was, `${file} differs from ${base.ref} (${base.sha.slice(0, 9)}); the 3D view must not change gameplay code`);
      compared++;
    }
  }
  assert.ok(compared >= 12, `compared ${compared} files; the protected list should match real files`);
});

test('the protected list names real files (a rename cannot quietly drop the guard)', (t) => {
  const base = baseCommit();
  if (!base) return t.skip('no git history');
  for (const p of PROTECTED) assert.ok(git('ls-tree', '-r', '--name-only', base.sha, '--', p).length > 0, `${p} does not exist at ${base.ref}`);
});

// ---------------------------------------------------------------- source helpers
const sources = filesUnder(rel(gfx3d)).filter((f) => f.endsWith('.js')).map((f) => ({ file: f, text: readFileSync(path.join(repo, f), 'utf8') }));

/** Code with comments and string-free lines kept, comments removed, so a header that mentions "localStorage" is not a hit. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead);
}

// ---------------------------------------------------------------- 2. imports
// The 3D code may import itself and the vendored three.js. Nothing else. If a module truly needs a read-only
// constant from the game, add the exact file here with the reason; never anything from engine/ that steps the sim.
const ALLOWED_OUTSIDE = new Map([
  // ['projects/Space-Shooter/engine/weekly/layout.js', 'why a read-only constant is needed'],
  ['projects/Space-Shooter/engine/weekly/sim.js', 'WEEKLY_CONFIG.PLAYER_RADIUS: the mine kill-halo radius must match the sim exactly (read-only constant)'],
  ['projects/Space-Shooter/engine/weekly/layout.js', 'WEEKLY_RULES: pickup/dock radii drawn at the exact sim sizes (read-only constants)'],
  ['projects/Space-Shooter/engine/shipStats.js', 'buildScale(): pure function, the 3D hull is drawn at the same scale the sim uses'],
  ['projects/Space-Shooter/state.js', 'gfx3d/motion/prefs.js reads settings.reducedMotion and VIEW_CELLS_H only; the runtime read-only test guards the scene'],
]);

function importsOf(code) {
  const found = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g)) found.push({ spec: m[1], kind: 'static' });
  for (const m of code.matchAll(/\bimport\(\s*(['"`])([^'"`]+)\1\s*\)/g)) found.push({ spec: m[2], kind: 'dynamic' });
  for (const m of code.matchAll(/\bimport\(\s*(?!['"`])/g)) found.push({ spec: '<non-literal>', kind: 'dynamic-computed' });
  for (const m of code.matchAll(/\brequire\(/g)) found.push({ spec: 'require', kind: 'require' });
  return found;
}

test('gfx3d has code to scan (the scan is not passing on an empty folder)', () => {
  assert.ok(sources.length >= 6, `found ${sources.length} files`);
  for (const name of ['index.js', 'mode.js', 'world.js', 'ship.js', 'camera.js', 'fx.js', 'assets.js']) assert.ok(sources.some((s) => s.file.endsWith(`/${name}`)), `${name} exists`);
});

test('3D modules import only each other and the vendored three.js: never engine, state, systems, input or hub code', () => {
  const offences = [];
  for (const { file, text } of sources) {
    for (const { spec, kind } of importsOf(stripComments(text))) {
      if (kind === 'dynamic-computed' || kind === 'require') { offences.push(`${file}: ${kind} import is not allowed`); continue; }
      if (!spec.startsWith('.')) { offences.push(`${file}: bare or remote import '${spec}' (use the vendored copy by relative path)`); continue; }
      const target = rel(path.resolve(path.dirname(path.join(repo, file)), spec));
      const ok = target.startsWith('projects/Space-Shooter/gfx3d/') || target.startsWith('projects/Space-Shooter/vendor/three/') || ALLOWED_OUTSIDE.has(target);
      if (!ok) offences.push(`${file}: imports ${target}`);
    }
  }
  assert.deepEqual(offences, [], 'the 3D view must not import code that can change the game');
});

test('the vendored three.js and its addons import only each other (no CDN, no import map needed)', () => {
  const vendor = filesUnder('projects/Space-Shooter/vendor/three').filter((f) => f.endsWith('.js'));
  assert.ok(vendor.length >= 4);
  for (const file of vendor) {
    const code = readFileSync(path.join(repo, file), 'utf8');
    for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(m[1].startsWith('.'), `${file} imports '${m[1]}'; vendored files must use relative paths`);
      assert.ok(existsSync(path.resolve(path.dirname(path.join(repo, file)), m[1])), `${file} imports ${m[1]} which is not vendored`);
    }
  }
});

// ---------------------------------------------------------------- 3. what the 3D code may touch
// Append `// 3d-local` to a line that assigns to a local object that merely shares a sim-ish name.
const SIM_NAMES = ['lv', 'layout', 'pose', 'keys', 'cam2d', 'state', 'ghosts', 'viewport'];
const MUTATORS = '(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set|add|delete|clear|assign)';

test('3D code never assigns into the scene, pose, keys, camera or layout it is handed', () => {
  const offences = [];
  for (const { file, text } of sources) {
    // index.js owns a three.js Scene it calls `scene`; elsewhere `scene` is the weekly scene (contract in index.js).
    const names = [...SIM_NAMES, ...(file.endsWith('/index.js') ? [] : ['scene'])].join('|');
    const assign = new RegExp(`(?<![.\\w$])(?:${names})\\s*(?:\\.\\s*[A-Za-z_$][\\w$]*|\\[[^\\]\\n]+\\])+\\s*(?:=(?!=)|\\+=|-=|\\*=|/=|%=|\\*\\*=|\\|\\|=|&&=|\\?\\?=|\\+\\+|--)`);
    const prefix = new RegExp(`(?:\\+\\+|--)\\s*(?<![.\\w$])(?:${names})\\s*[.\\[]`);
    const mutate = new RegExp(`(?<![.\\w$])(?:${names})(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*|\\[[^\\]\\n]+\\])*\\s*\\.\\s*${MUTATORS}\\s*\\(`);
    const objectAssign = new RegExp(`Object\\.(?:assign|defineProperty|defineProperties|setPrototypeOf)\\(\\s*(?:${names})\\b`);
    const del = new RegExp(`\\bdelete\\s+(?:${names})\\b`);
    const lines = stripComments(text).split('\n');
    const original = text.split('\n');
    lines.forEach((line, i) => {
      if (/\/\/\s*3d-local/.test(original[i])) return;
      for (const [label, re] of [['assigns into', assign], ['assigns into', prefix], ['calls a mutating method on', mutate], ['rewrites', objectAssign], ['deletes from', del]]) {
        const hit = line.match(re);
        if (hit) offences.push(`${file}:${i + 1} ${label} sim data: ${hit[0].trim()}`);
      }
    });
  }
  assert.deepEqual(offences, [], 'render code must treat the scene, pose, keys and layout as read-only (append "// 3d-local" for a local object that only shares the name)');
});

test('3D code never reads input, writes storage or opens the network by itself', () => {
  const BANNED = [
    [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\s*\.\s*cookie/, 'storage'],
    [/\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b|\bpostMessage\b/, 'network'],
    [/addEventListener\(\s*['"](?:key|pointer|mouse|touch|gamepad|wheel|click|contextmenu)/, 'input listeners'],
    [/\bnavigator\s*\.\s*(?:getGamepads|sendBeacon)\b/, 'gamepad/beacon'],
    [/\bdispatchEvent\b/, 'synthetic events'],
    [/\beval\(|new\s+Function\(/, 'eval'],
    [/https?:\/\//, 'a hard-coded URL'],
  ];
  const offences = [];
  for (const { file, text } of sources) {
    const code = stripComments(text);
    for (const [re, label] of BANNED) {
      // mode.js is the one place that reads the saved render mode and announces a change.
      if (file.endsWith('/mode.js') && /storage|synthetic/.test(label)) continue;
      const hit = code.match(re);
      if (hit) offences.push(`${file}: ${label}: ${hit[0]}`);
    }
    // fetch is for the model manifest and .glb files only, via assets.js.
    if (!file.endsWith('/assets.js') && /\bfetch\(/.test(code)) offences.push(`${file}: fetch outside assets.js`);
  }
  assert.deepEqual(offences, []);
});

test('mode.js is the only 3D file that touches storage, and it only touches the render-mode key', () => {
  const mode = sources.find((s) => s.file.endsWith('/mode.js'));
  const keys = [...stripComments(mode.text).matchAll(/(?:getItem|setItem)\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(keys.length > 0);
  assert.deepEqual([...new Set(keys)], ['RENDER_KEY']);
  assert.match(mode.text, /RENDER_KEY = 'stardust\.render'/);
});

// ---------------------------------------------------------------- 4. run it for real against a read-only scene
/** A value that accepts any use: property reads, calls, `new`, arithmetic. Stands in for DOM and canvas APIs in node. */
function anything() {
  const cache = new Map();
  const self = new Proxy(function stub() {}, {
    get(_t, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined;
      if (key === 'length') return 0;
      if (!cache.has(key)) cache.set(key, anything());
      return cache.get(key);
    },
    apply: () => anything(),
    construct: () => anything(),
    set: () => true,
  });
  return self;
}

function installDom() {
  const saved = new Map();
  const set = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  if (typeof document === 'undefined') {
    set('document', { createElement: () => anything(), createElementNS: () => anything(), body: anything(), documentElement: anything() });
  }
  if (typeof OffscreenCanvas === 'undefined') set('OffscreenCanvas', class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return anything(); } });
  if (typeof window === 'undefined') set('window', globalThis);
  if (typeof self === 'undefined') set('self', globalThis);
  return () => { for (const [key, desc] of saved) { if (desc) Object.defineProperty(globalThis, key, desc); else delete globalThis[key]; } };
}

/** A deep read-only view: any write, delete or define anywhere under it throws and names the path. */
function readonly(root, label = 'scene') {
  const cache = new WeakMap();
  const deny = (op, where, key) => { throw new TypeError(`3D code tried to ${op} ${where}.${String(key)} (sim data is read-only for rendering)`); };
  const wrap = (value, where) => {
    if (value === null || typeof value !== 'object') return value;
    if (cache.has(value)) return cache.get(value);
    const proxy = new Proxy(value, {
      get(target, key) {
        if (value instanceof Set || value instanceof Map) {
          const v = Reflect.get(target, key, target);
          if (typeof v !== 'function') return v;
          if (['add', 'delete', 'clear', 'set'].includes(key)) return () => deny('call ' + key + ' on', where, '');
          return v.bind(target);
        }
        const v = Reflect.get(target, key);
        const desc = Reflect.getOwnPropertyDescriptor(target, key);
        if (desc && !desc.configurable && !desc.writable) return v; // frozen: already read-only, and a proxy would break the invariant
        return wrap(v, `${where}.${String(key)}`);
      },
      set: (_t, key) => deny('write', where, key),
      defineProperty: (_t, key) => deny('define', where, key),
      deleteProperty: (_t, key) => deny('delete', where, key),
      setPrototypeOf: () => deny('re-prototype', where, ''),
    });
    cache.set(value, proxy);
    return proxy;
  };
  return wrap(root, label);
}

const replacer = (_k, v) => (v instanceof Set ? { set: [...v] } : v instanceof Map ? { map: [...v] } : typeof v === 'number' && !Number.isFinite(v) ? String(v) : v);
const snapshot = (value) => JSON.stringify(value, replacer);

function checkFinite(root, where) {
  const bad = [];
  root.updateMatrixWorld?.(true);
  root.traverse?.((o) => {
    for (const key of ['position', 'scale']) { const v = o[key]; if (v && !(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) bad.push(`${o.name || o.type}.${key}`); }
    const r = o.rotation; if (r && !(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z))) bad.push(`${o.name || o.type}.rotation`);
  });
  assert.deepEqual(bad, [], `${where}: non-finite transforms`);
}

async function loadSim() {
  const base = pathToFileURL(path.join(game, 'engine', 'weekly')).href;
  const [{ WEEKLY_EVENTS }, { createWeeklyLayout }, sim] = await Promise.all([
    import(pathToFileURL(path.join(game, 'tracks', 'weekly.js')).href),
    import(`${base}/layout.js`),
    import(`${base}/sim.js`),
  ]);
  return { layout: createWeeklyLayout(WEEKLY_EVENTS[0]), ...sim };
}

/** The scene as engine/modes/weekly.js hands it to the renderer: sim scene plus the view fields. */
function raceScene(sim, layout, frames) {
  const lv = sim.createWeeklyScene(layout);
  Object.assign(lv, { activeMs: 0, countdownT: 0, completed: false, wreck: null, reducedMotion: false, alpha: 0.5 });
  const { BIT } = sim;
  sim.stepWeekly(lv, { turn: 0, thrust: 0, back: 0, strafe: 0, bits: BIT.LAUNCH });
  return { lv, advance(i) {
    const turn = Math.sin(i / 17) * 0.8;
    sim.stepWeekly(lv, { turn, thrust: 1, back: 0, strafe: 0, bits: i % 90 < 8 ? BIT.BOOST : 0 });
    lv.activeMs = sim.sceneMs(lv);
    const p = lv.player, prev = { x: p.x - p.vx / 60, y: p.y - p.vy / 60, angle: p.angle - p.angVel / 60 };
    lv.viewPlayer = { ...p, x: prev.x + (p.x - prev.x) * lv.alpha, y: prev.y + (p.y - prev.y) * lv.alpha };
    lv.viewHazards = lv.hazards.map((h) => ({ ...h }));
  } };
}

test('every 3D module runs a real race against a read-only scene: nothing is written, the scene is unchanged, transforms stay finite', async (t) => {
  const restore = installDom();
  try {
    const THREE = await import(pathToFileURL(path.join(gfx3d, '..', 'vendor', 'three', 'three.module.js')).href);
    const mod = (name) => import(pathToFileURL(path.join(gfx3d, name)).href);
    const [{ createWorld }, { createShipRig, createGhostRig }, { createCameraRig }, { createFx }] = await Promise.all([mod('world.js'), mod('ship.js'), mod('camera.js'), mod('fx.js')]);
    const sim = await loadSim();
    const { lv, advance } = raceScene(sim, sim.layout);
    const assets = { manifest: { ships: {}, props: {} }, ships: {}, props: {} };
    const keysNow = (i) => Object.freeze({ left: false, right: false, thrust: true, thrustBack: false, launch: false, shoot: i % 40 < 5, brake: false, boost: i % 90 < 8, strafeLeft: false, strafeRight: false, turnStrength: Math.sin(i / 17), thrustStrength: 1, strafeStrength: 1 });
    const cam2d = Object.freeze({ x: 0, y: 0, rot: 0, zoom: 1, viewRot: 0, anchorY: 0.5 });
    const viewport = Object.freeze({ width: 1920, height: 1080 });

    const world = createWorld(THREE, readonly(lv.layout, 'layout'), assets);
    const ship = createShipRig(THREE, assets);
    const ghost = createGhostRig(THREE, assets, '#9fe8ff');
    const rig = createCameraRig(THREE);
    const fx = createFx(THREE);
    rig.resize(viewport.width, viewport.height);
    for (const [name, rigObject] of [['world', world], ['ship', ship], ['ghost', ghost], ['fx', fx]]) assert.ok(rigObject.group?.isObject3D, `${name} rig exposes a three.js group`);
    assert.ok(rig.camera?.isCamera, 'camera rig exposes a camera');

    const roots = new THREE.Group();
    roots.add(world.group, ship.group, ghost.group, fx.group);
    const frameCount = 240;
    for (let i = 0; i < frameCount; i++) {
      advance(i);
      // Scenarios along the way: a wreck, then the finish, then back to normal (the renderer must cope with each).
      if (i === 120) lv.wreck = { x: lv.player.x, y: lv.player.y, t: 0, cause: 'mine' };
      if (i > 120 && lv.wreck) lv.wreck.t += 1 / 60;
      if (i === 180) { lv.wreck = null; lv.finished = true; lv.finishMs = lv.activeMs; }
      if (i === 200) { lv.finished = false; lv.finishMs = null; lv.reducedMotion = true; }
      const before = snapshot(lv);
      const ro = readonly(lv);
      const pose = readonly(lv.viewPlayer, 'pose');
      const keys = keysNow(i);
      const time = i / 60, dt = 1 / 60;
      const ghostPose = readonly({ x: lv.player.x - 3, y: lv.player.y + 1, angle: lv.player.angle, vx: 0, vy: 0, label: 'best', color: '#9fe8ff' }, 'ghostPose');
      world.update(ro, time, { reducedMotion: !!lv.reducedMotion });
      ship.setVisible(!lv.wreck);
      if (!lv.wreck) ship.update(pose, keys, ro, time, dt);
      ghost.update(ghostPose, time);
      fx.update(ro, pose, keys, time, dt);
      if (i % 30 === 0) { fx.burst('shard', lv.player.x, lv.player.y); fx.burst('explosion', lv.player.x, lv.player.y); }
      rig.update(ro, pose, cam2d, viewport, dt);
      assert.equal(snapshot(lv), before, `frame ${i}: the scene changed while the 3D modules ran`);
      if (i % 40 === 0) { checkFinite(roots, `frame ${i}`); rig.camera.updateMatrixWorld(true); assert.ok(rig.camera.matrixWorld.elements.every(Number.isFinite), `frame ${i}: camera matrix is finite`); }
    }
    // Teardown is safe, twice.
    for (const r of [world, ship, ghost, fx]) { r.dispose(); r.dispose(); }
    t.diagnostic(`${frameCount} frames, ${sim.layout.track.points.length} track points, ${lv.layout.mines.length} mines, ${lv.layout.sentries.length} sentries`);
  } finally { restore(); }
});

test('the weekly layout object is never mutated by building the world twice (layout swap between races)', async () => {
  const restore = installDom();
  try {
    const THREE = await import(pathToFileURL(path.join(gfx3d, '..', 'vendor', 'three', 'three.module.js')).href);
    const { createWorld } = await import(pathToFileURL(path.join(gfx3d, 'world.js')).href);
    const { layout } = await loadSim();
    const before = snapshot(layout);
    for (let i = 0; i < 2; i++) { const w = createWorld(THREE, readonly(layout, 'layout'), { manifest: {}, ships: {}, props: {} }); w.update(readonly(layout), 0, {}); w.dispose(); }
    assert.equal(snapshot(layout), before);
  } finally { restore(); }
});

test('missing or broken model files fall back to stand-ins without throwing', async () => {
  const restore = installDom();
  const realFetch = globalThis.fetch;
  try {
    const THREE = await import(pathToFileURL(path.join(gfx3d, '..', 'vendor', 'three', 'three.module.js')).href);
    const { loadAssets } = await import(pathToFileURL(path.join(gfx3d, 'assets.js')).href);
    for (const fake of [
      async () => ({ ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }),
      async () => { throw new TypeError('network down'); },
      async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); }, arrayBuffer: async () => new ArrayBuffer(0) }),
    ]) {
      globalThis.fetch = fake;
      const assets = await loadAssets(THREE, 'http://127.0.0.1/art/3d/manifest.json');
      assert.ok(assets && typeof assets === 'object' && assets.ships && assets.props, 'loadAssets always resolves to { ships, props, manifest }');
    }
  } finally { globalThis.fetch = realFetch; restore(); }
});

// The test above would also pass if "readonly" were broken; prove the harness itself catches writes.
test('harness self-check: the read-only view throws on every kind of write, and the scan regexes catch real offences', () => {
  const scene = { a: { b: [1, 2, 3] }, s: new Set([1]) };
  const ro = readonly(scene);
  assert.throws(() => { ro.a.b[0] = 9; }, /read-only/);
  assert.throws(() => { ro.a.b.push(4); }, /read-only/);
  assert.throws(() => { ro.a.c = 1; }, /read-only/);
  assert.throws(() => { delete ro.a.b; }, /read-only/);
  assert.throws(() => ro.s.add(2), /read-only/);
  assert.equal(ro.s.has(1), true);
  assert.equal(ro.a.b.map((x) => x * 2).join(), '2,4,6');
  assert.deepEqual(scene, { a: { b: [1, 2, 3] }, s: new Set([1]) });
  const names = 'lv|pose';
  const assign = new RegExp(`(?<![.\\w$])(?:${names})\\s*(?:\\.\\s*[A-Za-z_$][\\w$]*|\\[[^\\]\\n]+\\])+\\s*(?:=(?!=)|\\+=|-=|\\*=|/=|%=|\\*\\*=|\\|\\|=|&&=|\\?\\?=|\\+\\+|--)`);
  assert.ok(assign.test('lv.player.x += 1;'));
  assert.ok(assign.test('pose.angle = 0'));
  assert.ok(assign.test("lv['x'] = 1"));
  assert.ok(!assign.test('const a = lv.player.x === 1;'));
  assert.ok(!assign.test('s.pose.x = 1'), 'a property of something else that merely shares the name');
  assert.ok(!assign.test('mesh.position.x = pose.x;'));
  assert.ok(!assign.test('group.rotation.y = -pose.angle;'));
});
