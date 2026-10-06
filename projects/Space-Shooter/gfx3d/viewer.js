// viewer3d.html: check a .glb ship or prop at game scale before it goes into Stardust.
// Local only: files are read with FileReader/fetch from this origin, never uploaded.
// Same conventions as the game: nose +X, up +Y, one unit = one sim cell, hull circle at the lane plane.
import * as THREE from '../vendor/three/three.module.js';
import { DEFAULT_FIT, PROP_NAMES, SHIP_NAMES, footprintRadius, loadModelFromBuffer, normalizeManifest, resolveEntry } from './assets.js';

const $ = (id) => document.getElementById(id);
const SHIP_HOVER = 0.3;            // gfx3d/ship.js lifts the ship this far above the lane
const BUDGETS = { ship: { bytes: 1_500_000, tris: 60_000 }, prop: { bytes: 1_000_000, tris: 30_000 }, textureSide: 1024 };
const HULL_CHOICES = [
  ['courier:0-0-0-0', 'Courier (garage build)'], [null, 'Standard ship (PLAYER_HULL)'],
  ['needle:0-0-0-0', 'Needle'], ['manta:0-0-0-0', 'Manta'], ['wisp:0-0-0-0', 'Wisp'], ['none', 'none'],
];
const SLOT_HULL = { default: 'courier:0-0-0-0', courier: 'courier:0-0-0-0', needle: 'needle:0-0-0-0', manta: 'manta:0-0-0-0', wisp: 'wisp:0-0-0-0' };

const state = {
  manifest: normalizeManifest(null), manifestUrl: new URL('../art/3d/manifest.json', import.meta.url).href,
  fileName: '', bytes: 0, glbInfo: null, buffer: null, parsedScene: null, model: null, kind: 'ship', name: 'default',
  hulls: null, dirty: true, loadToken: 0,
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
} catch (error) {
  $('stage').outerHTML = `<div class="v-fail">This viewer needs WebGL, which this browser or device does not provide (${String(error.message || error)}).</div>`;
  throw error;
}
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x050a12, 1);
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a2230, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 6, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0x81e6df, 0.9); rim.position.set(4, 2, -5); scene.add(rim);

const stage = new THREE.Group(); scene.add(stage);      // the model sits here
const refs = new THREE.Group(); scene.add(refs);         // lane, grid, hull circle, arrow
const lane = new THREE.Group(), circle = new THREE.Group(), arrow = new THREE.Group(), bounds = new THREE.Group();
refs.add(lane, circle, arrow, bounds);

// ---------------------------------------------------------------------------------------------
// Orbit camera (no OrbitControls is vendored): drag = orbit, wheel/pinch = zoom, right/shift-drag or two fingers = pan.
const cam = new THREE.PerspectiveCamera(40, 1, 0.02, 200);
const orbit = { target: new THREE.Vector3(), yaw: Math.PI + 0.7, pitch: 0.5, dist: 3.2 };   // starts behind the ship, looking along +X
function applyOrbit() {
  const cp = Math.cos(orbit.pitch);
  cam.position.set(orbit.target.x + orbit.dist * cp * Math.cos(orbit.yaw), orbit.target.y + orbit.dist * Math.sin(orbit.pitch), orbit.target.z + orbit.dist * cp * Math.sin(orbit.yaw));
  cam.lookAt(orbit.target);
  state.dirty = true;
}
const pointers = new Map();
const view = $('view');
view.addEventListener('contextmenu', (e) => e.preventDefault());
view.addEventListener('pointerdown', (e) => { view.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey }); });
view.addEventListener('pointerup', (e) => pointers.delete(e.pointerId));
view.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
view.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  const before = [...pointers.values()];
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const [pa, pb] = before;
    const d0 = Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1, d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    orbit.dist = clamp(orbit.dist * (d0 / d1), 0.4, 60);
    pan(dx * 0.5, dy * 0.5);
  } else if (p.button === 2 || p.shift || e.shiftKey) pan(dx, dy);
  else { orbit.yaw -= dx * 0.008; orbit.pitch = clamp(orbit.pitch + dy * 0.008, -1.5, 1.5); }
  applyOrbit();
});
view.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0012), 0.4, 60); applyOrbit(); }, { passive: false });
view.addEventListener('dblclick', () => frameModel());
view.addEventListener('keydown', (e) => {
  const step = 0.08;
  if (e.key === 'ArrowLeft') orbit.yaw += step; else if (e.key === 'ArrowRight') orbit.yaw -= step;
  else if (e.key === 'ArrowUp') orbit.pitch = clamp(orbit.pitch + step, -1.5, 1.5); else if (e.key === 'ArrowDown') orbit.pitch = clamp(orbit.pitch - step, -1.5, 1.5);
  else if (e.key === '+' || e.key === '=') orbit.dist = clamp(orbit.dist * 0.9, 0.4, 60); else if (e.key === '-') orbit.dist = clamp(orbit.dist / 0.9, 0.4, 60);
  else if (e.key === '0') frameModel(); else return;
  e.preventDefault(); applyOrbit();
});
function pan(dx, dy) {
  const k = orbit.dist * 0.0016;
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
  orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------------------------------------------------------------------------------------------
// Reference geometry

const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, side: THREE.DoubleSide });
function line(points, color, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false }));
}
function clearGroup(g) { for (const c of [...g.children]) { g.remove(c); c.traverse?.((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); }); } }

function planeY() { return state.kind === 'ship' ? -SHIP_HOVER : (state.model ? lowestY() : 0); }
function lowestY() { return new THREE.Box3().setFromObject(state.model, true).min.y; }

function rebuildReferences() {
  clearGroup(lane); clearGroup(circle); clearGroup(arrow); clearGroup(bounds);
  const y = planeY();
  const w = Number($('lane').value) || 6, len = 16;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat(0x1c4a58, 0.35)); strip.rotation.x = -Math.PI / 2; strip.position.set(len / 2 - 3, y - 0.002, 0);
  lane.add(strip);
  for (const z of [-w / 2, w / 2]) lane.add(line([new THREE.Vector3(-3, y, z), new THREE.Vector3(len - 3, y, z)], 0x81e6df));
  const grid = new THREE.GridHelper(len, len, 0x2a4152, 0x16283a); grid.position.set(len / 2 - 3, y - 0.004, 0); lane.add(grid);
  // one-cell square for scale, in front of the nose
  const sq = [[3.5, -0.5], [4.5, -0.5], [4.5, 0.5], [3.5, 0.5], [3.5, -0.5]].map(([x, z]) => new THREE.Vector3(x, y, z));
  lane.add(line(sq, 0xffffff, 0.45));
  lane.visible = $('t-lane').checked;

  const hullKey = $('hullsel').value;
  const hull = hullFor(hullKey);
  const r = hull ? hull.radius : (state.model?.userData.asset?.footprintRadius ?? 0);
  if (r > 0) {
    const ring = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; ring.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
    circle.add(line(ring, 0xff6fa5));
  }
  if (hull) {   // ship-local [x right, y forward] -> three (x forward, z right); the hull is ship-relative at the lane plane
    const pts = hull.points.map(([x, f]) => new THREE.Vector3(f, y, x));
    pts.push(pts[0].clone());
    circle.add(line(pts, 0xffd166));
  }
  circle.visible = $('t-circle').checked;

  const dir = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, y + 0.01, 0), Math.max(0.9, r * 2.0), 0xffad72, 0.14, 0.08);
  dir.line.material.depthTest = false; dir.cone.material.depthTest = false; dir.renderOrder = 5;
  arrow.add(dir);
  arrow.visible = $('t-arrow').checked;

  if (state.model) {
    const box = new THREE.Box3().setFromObject(state.model, true);
    bounds.add(new THREE.Box3Helper(box, 0x7ee2b8));
  }
  bounds.visible = $('t-bounds').checked;
  state.dirty = true;
}

function hullFor(key) {
  if (key === 'none' || !state.hulls) return null;
  const k = key === 'null' ? null : key;
  try { return state.hulls.hullForBuild(k); } catch { return null; }
}

// ---------------------------------------------------------------------------------------------
// Model loading and the manifest-field controls

function entryFromControls() {
  const rot = ['rx', 'ry', 'rz'].map((id) => Number($(id).value) || 0);
  const mode = $('fitmode').value;
  return {
    rotation: rot,
    pivot: $('pivot').value,
    fit: mode === 'none' ? null : { [mode]: Number($('fitval').value) || 1 },
    scale: Number($('scale').value) || 1,
    offset: [Number($('ox').value) || 0, 0, Number($('oz').value) || 0],
  };
}
function writeControls(e) {
  ['rx', 'ry', 'rz'].forEach((id, i) => { $(id).value = String(e.rotation[i] ?? 0); });
  $('pivot').value = e.pivot || 'none';
  const fit = e.fit || {};
  const mode = ['radius', 'length', 'width', 'height'].find((m) => Number.isFinite(fit[m]));
  $('fitmode').value = mode || 'none';
  $('fitval').value = String(mode ? fit[mode] : 1);
  $('scale').value = String(e.scale ?? 1);
  $('ox').value = String(e.offset?.[0] ?? 0); $('oz').value = String(e.offset?.[2] ?? 0);
}

/** The entry the game would use for the selected slot: manifest values if the slot exists there, else the defaults. */
function slotEntry() {
  const kind = state.kind === 'ship' ? 'ships' : 'props';
  const r = resolveEntry({ ...state.manifest, [kind]: { ...state.manifest[kind], [state.name]: { ...(state.manifest[kind]?.[state.name] || {}), file: 'x.glb' } } }, kind, state.name);
  return r ? { rotation: r.rotation, pivot: r.pivot, fit: r.fit, scale: r.scale, offset: r.offset } : { rotation: [0, 0, 0], pivot: 'center', fit: { radius: 0.5 }, scale: 1, offset: [0, 0, 0] };
}

async function setBuffer(buffer, fileName, { useSlotEntry = true } = {}) {
  const token = ++state.loadToken;
  setStatus(`Reading ${fileName}…`);
  try {
    const { parseGlb } = await import('./assets.js');
    const gltf = await parseGlb(THREE, buffer);
    if (token !== state.loadToken) return;
    state.buffer = buffer; state.fileName = fileName; state.bytes = buffer.byteLength; state.parsedScene = gltf.scene;
    state.glbInfo = await readGlbInfo(buffer);
    if (useSlotEntry) writeControls(slotEntry());
    $('drop').hidden = true;
    rebuildModel();
    frameModel();
    setStatus(`${fileName} loaded (${(buffer.byteLength / 1e6).toFixed(2)} MB). Drag to orbit, wheel to zoom, double-click to reframe.`);
  } catch (error) {
    setStatus(`Could not read ${fileName}: ${error?.message || error}`, true);
  }
}

function rebuildModel() {
  if (!state.parsedScene) return;
  if (state.model) { stage.remove(state.model); state.model = null; }
  const entry = entryFromControls();
  const resolved = { file: state.fileName, rotation: entry.rotation, pivot: entry.pivot, fit: entry.fit, scale: entry.scale, offset: entry.offset };
  // prepareModel mutates the scene it is given, so work on a clone (geometry and textures stay shared).
  import('./assets.js').then(({ prepareModel }) => {
    const model = prepareModel(THREE, state.parsedScene.clone(true), resolved, { kind: state.kind, name: state.name, file: state.fileName });
    model.position.y = state.kind === 'ship' ? 0 : 0;
    state.model = model;
    stage.add(model);
    applyWire();
    rebuildReferences();
    updateReadout();
    state.dirty = true;
  }).catch((error) => setStatus(`Could not place the model: ${error?.message || error}`, true));
}
function applyWire() { state.model?.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => { m.wireframe = $('t-wire').checked; }); }); state.dirty = true; }

function frameModel() {
  const r = state.model?.userData.asset?.footprintRadius || 0.6;
  orbit.target.set(0, planeY() * 0.2, 0);
  orbit.dist = clamp(r * 4.6 + 0.8, 1.2, 40);
  applyOrbit();
}

async function readGlbInfo(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) return { error: 'not a binary glTF (.glb)' };
  let json = null, bin = 0, binLen = 0;
  for (let o = 12; o + 8 <= buffer.byteLength;) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, o + 8, len)));
    else if (type === 0x004e4942 && !binLen) { bin = o + 8; binLen = len; }
    o += 8 + len;
  }
  if (!json) return { error: 'no JSON chunk' };
  const textures = [];
  for (const im of json.images || []) {
    const bv = im.bufferView !== undefined ? json.bufferViews[im.bufferView] : null;
    let w = null, h = null;
    if (bv) {
      try { const blob = new Blob([new Uint8Array(buffer, bin + (bv.byteOffset || 0), bv.byteLength)], { type: im.mimeType }); const bmp = await createImageBitmap(blob); w = bmp.width; h = bmp.height; bmp.close?.(); } catch { /* unsupported type */ }
    }
    textures.push({ mime: im.mimeType || (im.uri ? 'external file' : '?'), bytes: bv?.byteLength ?? 0, width: w, height: h, external: !!im.uri });
  }
  return { textures, extensionsRequired: json.extensionsRequired || [], extensionsUsed: json.extensionsUsed || [], materials: (json.materials || []).length, animations: (json.animations || []).length, generator: json.asset?.generator || '' };
}

// ---------------------------------------------------------------------------------------------
// Readout

function row(dt, dd, cls = '') { return `<dt>${dt}</dt><dd class="${cls}">${dd}</dd>`; }
function updateReadout() {
  const a = state.model?.userData.asset;
  const info = state.glbInfo;
  if (!a) { $('stats').innerHTML = ''; $('notes').innerHTML = ''; $('out').value = ''; return; }
  const b = BUDGETS[state.kind];
  const notes = [];
  const f = (v) => v.toFixed(3);
  let html = '';
  html += row('File', `${state.fileName} (${(state.bytes / 1e6).toFixed(2)} MB)`, state.bytes > b.bytes ? 'bad' : 'ok');
  html += row('Triangles', a.triangles.toLocaleString(), a.triangles > b.tris ? 'bad' : 'ok');
  html += row('Materials', String(a.materials));
  if (info?.textures) {
    const big = info.textures.filter((t) => Math.max(t.width || 0, t.height || 0) > BUDGETS.textureSide);
    html += row('Textures', info.textures.length ? info.textures.map((t) => `${t.width || '?'}×${t.height || '?'} ${t.mime.replace('image/', '')} ${(t.bytes / 1000).toFixed(0)}KB`).join('<br>') : 'none', big.length ? 'bad' : '');
    if (big.length) notes.push(`<span class="bad">${big.length} texture(s) are larger than ${BUDGETS.textureSide}px. Run the optimiser (npm run assets:3d:incoming).</span>`);
    if (info.textures.some((t) => t.external)) notes.push('<span class="bad">Textures are separate files. Use a single .glb with textures inside.</span>');
  }
  html += row('Size in game', `${f(a.length)} long × ${f(a.width)} wide × ${f(a.height)} tall cells`);
  html += row('Footprint radius', `${f(a.footprintRadius)} cells`);
  const hull = hullFor($('hullsel').value);
  if (hull) {
    const dr = a.footprintRadius / hull.radius;
    html += row('Hull radius', `${f(hull.radius)} cells (${(dr * 100).toFixed(0)}% of it)`, Math.abs(dr - 1) > 0.12 ? 'warn' : 'ok');
    const hl = hull.nose + hull.tail, hw = Math.max(...hull.points.map((p) => p[0])) - Math.min(...hull.points.map((p) => p[0]));
    html += row('Hull outline', `${f(hl)} long × ${f(hw)} wide`);
    if (state.kind === 'ship' && Math.abs(a.length / hl - 1) > 0.2) notes.push(`<span class="warn">Length is ${(a.length / hl * 100).toFixed(0)}% of the hull's: players will feel the hit box does not match the picture.</span>`);
    if (state.kind === 'ship' && Math.abs(a.width / hw - 1) > 0.2) notes.push(`<span class="warn">Width is ${(a.width / hw * 100).toFixed(0)}% of the hull's.</span>`);
  }
  if (info?.extensionsRequired?.length) html += row('Needs', info.extensionsRequired.join(', '));
  if (info?.animations) notes.push(`${info.animations} animation(s) in the file are ignored by the game.`);
  // Orientation hints
  if (state.kind === 'ship') {
    if (a.width > a.length * 1.2) notes.push('<span class="warn">It is wider than long: the nose may point along Z. Try Rotate Y 90° or -90°.</span>');
    if (a.height > Math.max(a.length, a.width) * 0.85) notes.push('<span class="warn">It is as tall as it is long: it may be lying on its side. Try Rotate X or Z 90°.</span>');
  }
  if (a.triangles > b.tris) notes.push(`<span class="bad">Over the ${b.tris.toLocaleString()} triangle budget. Run the optimiser (npm run assets:3d:incoming).</span>`);
  if (state.bytes > b.bytes) notes.push(`<span class="bad">Over the ${(b.bytes / 1e6).toFixed(1)} MB file budget. Run the optimiser (npm run assets:3d:incoming).</span>`);
  if (!notes.length) notes.push('<span class="ok">Within budget. Check the nose points along the orange arrow in the in-game view.</span>');
  $('stats').innerHTML = html;
  $('notes').innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
  const entry = entryFromControls();
  const kind = state.kind === 'ship' ? 'ships' : 'props';
  const snippet = { file: `${kind}/${state.name}.glb`, rotation: entry.rotation, pivot: entry.pivot, ...(entry.fit ? { fit: entry.fit } : {}), scale: entry.scale, offset: entry.offset };
  $('out').value = JSON.stringify({ [state.name]: snippet }, null, 2);
  $('hud').textContent = `${state.name} · ${a.triangles.toLocaleString()} tris · ${f(a.length)}×${f(a.width)}×${f(a.height)} cells`;
}

function setStatus(text, bad = false) { const s = $('status'); s.textContent = text; s.className = 'v-small' + (bad ? ' bad' : ''); }

// ---------------------------------------------------------------------------------------------
// Rendering: the free orbit view plus the "in-game check" inset (chase camera or strict top-down).

const chase = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const top = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 50);
function setupInset(aspect) {
  if ($('insetmode').value === 'top') {
    const h = 3.6; top.left = -h * aspect; top.right = h * aspect; top.top = h; top.bottom = -h;
    top.position.set(1.5, 20, 0); top.up.set(1, 0, 0); top.lookAt(1.5, 0, 0); top.updateProjectionMatrix();
    return top;
  }
  chase.aspect = aspect;
  chase.position.set(-2.4, 4.4, 0); chase.lookAt(1.6, 0, 0); chase.updateProjectionMatrix();
  return chase;
}

function resize() {
  const el = $('stage'), w = el.clientWidth, h = el.clientHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  const iw = Math.round(Math.min(w * 0.42, 420)), ih = Math.round(iw * 0.6);
  const frame = $('inset-frame');
  frame.style.width = iw + 'px'; frame.style.height = ih + 'px';
  el.style.setProperty('--inset-h', ih + 'px');
  state.inset = { w: iw, h: ih };
  state.dirty = true;
}
new ResizeObserver(resize).observe($('stage'));

function render() {
  requestAnimationFrame(render);
  if (!state.dirty || document.hidden) return;
  state.dirty = false;
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);
  renderer.clear();
  renderer.render(scene, cam);
  // inset
  const { w, h } = state.inset || { w: 0, h: 0 };
  if (w && state.model) {
    const x = size.x - w - 10, y = 10;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
    renderer.clear();
    const prev = { arrow: arrow.visible, bounds: bounds.visible };
    bounds.visible = false;
    const ic = setupInset(w / h);
    renderer.render(scene, ic);
    arrow.visible = prev.arrow; bounds.visible = prev.bounds;
    renderer.setScissorTest(false);
  }
  void dpr;
}

// ---------------------------------------------------------------------------------------------
// Wiring

function populateSlots() {
  const slot = $('slot');
  slot.innerHTML = '';
  const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; slot.appendChild(o); };
  const g1 = document.createElement('optgroup'); g1.label = 'Ship'; slot.appendChild(g1);
  for (const n of SHIP_NAMES) { const o = document.createElement('option'); o.value = `ship:${n}`; o.textContent = n === 'default' ? 'default ship (Courier)' : `${n} ship`; g1.appendChild(o); }
  const g2 = document.createElement('optgroup'); g2.label = 'Prop'; slot.appendChild(g2);
  for (const n of PROP_NAMES) { const o = document.createElement('option'); o.value = `prop:${n}`; o.textContent = n === 'fuelStation' ? 'fuel station gate' : n; g2.appendChild(o); }
  void add;
  const hs = $('hullsel');
  for (const [k, label] of HULL_CHOICES) { const o = document.createElement('option'); o.value = k === null ? 'null' : k; o.textContent = label; hs.appendChild(o); }
}

function selectSlot(value, { reload = true } = {}) {
  const [kind, name] = value.split(':');
  state.kind = kind; state.name = name;
  $('slot').value = value;
  $('hullsel').value = kind === 'ship' ? (SLOT_HULL[name] || 'none') : 'none';
  if (reload) { writeControls(slotEntry()); }
  if (state.parsedScene) { rebuildModel(); frameModel(); }
}

function populateShipped() {
  const sel = $('shipped');
  for (const kind of ['ships', 'props']) {
    for (const [name, e] of Object.entries(state.manifest[kind])) {
      const r = resolveEntry(state.manifest, kind, name);
      if (!r) continue;
      const o = document.createElement('option'); o.value = `${kind}/${name}`; o.textContent = `${kind}/${name}${e.alias ? ` (= ${e.alias})` : ''}`; sel.appendChild(o);
    }
  }
}
async function openShipped(id) {
  const [kind, name] = id.split('/');
  const r = resolveEntry(state.manifest, kind, name);
  if (!r) return;
  selectSlot(`${kind === 'ships' ? 'ship' : 'prop'}:${name}`, { reload: false });
  writeControls({ rotation: r.rotation, pivot: r.pivot, fit: r.fit, scale: r.scale, offset: r.offset });
  const url = new URL(r.file, state.manifestUrl).href;
  setStatus(`Fetching ${r.file}…`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await setBuffer(await res.arrayBuffer(), r.file.split('/').pop(), { useSlotEntry: false });
  } catch (error) { setStatus(`Could not load ${r.file}: ${error?.message || error}`, true); }
}

function readFile(file) {
  if (!/\.glb$/i.test(file.name)) { setStatus('Only .glb files (a single binary glTF with the textures inside) are supported.', true); return; }
  const reader = new FileReader();
  reader.onload = () => setBuffer(reader.result, file.name);
  reader.onerror = () => setStatus(`Could not read ${file.name}.`, true);
  reader.readAsArrayBuffer(file);
}

function wire() {
  populateSlots();
  $('file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) readFile(f); });
  const st = $('stage');
  for (const type of ['dragenter', 'dragover']) st.addEventListener(type, (e) => { e.preventDefault(); st.classList.add('dragging'); });
  for (const type of ['dragleave', 'drop']) st.addEventListener(type, (e) => { e.preventDefault(); st.classList.remove('dragging'); });
  st.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); });
  $('slot').addEventListener('change', (e) => selectSlot(e.target.value));
  $('shipped').addEventListener('change', (e) => { if (e.target.value) openShipped(e.target.value); });
  for (const id of ['rx', 'ry', 'rz', 'pivot', 'fitmode', 'fitval', 'scale', 'ox', 'oz']) $(id).addEventListener('input', () => { rebuildModel(); });
  for (const id of ['t-lane', 't-circle', 't-arrow', 't-bounds']) $(id).addEventListener('change', () => { rebuildReferences(); });
  $('t-wire').addEventListener('change', applyWire);
  $('lane').addEventListener('input', rebuildReferences);
  $('hullsel').addEventListener('change', () => { rebuildReferences(); updateReadout(); });
  $('insetmode').addEventListener('change', () => { state.dirty = true; });
  $('reset-view').addEventListener('click', frameModel);
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('out').value); setStatus('Copied the manifest entry.'); } catch { $('out').select(); setStatus('Select the text and copy it (clipboard blocked).'); }
  });
  const rot = $('rot-buttons');
  for (const [axis, d, label] of [['rx', 90, 'X +90°'], ['rx', -90, 'X −90°'], ['ry', 90, 'Y +90°'], ['ry', -90, 'Y −90°'], ['rz', 90, 'Z +90°'], ['rz', -90, 'Z −90°']]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => { const el = $(axis); el.value = String((((Number(el.value) || 0) + d) % 360 + 360) % 360); el.dispatchEvent(new Event('input')); });
    rot.appendChild(b);
  }
}

async function start() {
  wire();
  resize();
  applyOrbit();
  try { state.hulls = { ...(await import('../engine/hull.js')) }; } catch (error) { console.warn('[viewer] hull data unavailable:', error?.message || error); }
  try {
    const res = await fetch(state.manifestUrl);
    if (res.ok) state.manifest = normalizeManifest(await res.json());
  } catch { /* the viewer works without a manifest */ }
  populateShipped();
  selectSlot('ship:default');
  rebuildReferences();
  requestAnimationFrame(render);
  const q = new URLSearchParams(location.search).get('load');
  if (q) { $('shipped').value = q; await openShipped(q); }
  else setStatus('Ready. Drop a .glb, choose one, or open a shipped model.');
}
start();
globalThis.__viewer3d = { state, THREE, scene, renderer, orbit, applyOrbit };
