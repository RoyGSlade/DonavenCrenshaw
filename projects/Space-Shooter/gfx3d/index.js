// The 3D look for the weekly races. Rendering only: the simulation, physics,
// replays and hub verification are untouched (engine/weekly/*). The 2D canvas
// keeps the HUD and overlays; in 3D mode it stops drawing the world and a WebGL
// canvas underneath draws it instead.
//
// Turn it on with ?render=3d (or ?render=2d to force the old look), or the
// "3D view" setting. Anything that fails (no WebGL, an asset that won't load)
// falls back to the 2D renderer for the rest of the session.
//
// World mapping (one sim cell = one unit): sim x -> three.js X, sim y -> three.js Z,
// up is +Y. A sim angle a (0 = +x, increasing toward +y) is a rotation of -a about Y.
//
// Module contracts (each lives in its own file so they can be built in parallel):
//   world.js   createWorld(THREE, layout)            -> { group, update(scene, time, opts), dispose() }
//   ship.js    createShipRig(THREE, assets)          -> { group, update(pose, keys, scene, time, dt), setVisible(bool), dispose() }
//              createGhostRig(THREE, assets, color)  -> { group, update(pose, time), dispose() }
//   camera.js  createCameraRig(THREE)                -> { camera, update(scene, pose, cam2d, viewport, dt), resize(w, h) }
//   fx.js      createFx(THREE)                       -> { group, update(scene, pose, keys, time, dt), burst(kind, x, y), dispose() }
//   assets.js  loadAssets(THREE, manifestUrl)        -> Promise<{ ships, props, manifest }>
import { readRenderMode } from './mode.js';

let state3d = null;   // { THREE, renderer, scene, camera rig, world, ship, ghosts, fx, layout } once running
let failed = false;   // a failure turns 3D off until reload
let starting = null;

/** True when this frame should be drawn in 3D (the 2D renderer then skips the world). */
export function render3dActive(lv) {
  return !failed && !!lv?.weekly && readRenderMode() === '3d' && !!state3d?.ready;
}

/** Start the 3D renderer in the background if the mode asks for it. Safe to call every frame. */
export function ensure3d(host = document.body) {
  if (failed || state3d || starting || readRenderMode() !== '3d') return;
  starting = start(host).catch((error) => {
    failed = true;
    console.warn('[3d] falling back to 2D:', error?.message || error);
    teardown();
  }).finally(() => { starting = null; });
}

async function start(host) {
  const THREE = await import('../vendor/three/three.module.js');
  const canvas = document.createElement('canvas');
  canvas.id = 'starmap-canvas-3d';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'stardust-3d';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const front = host.querySelector?.('#starmap-canvas');
  host.insertBefore(canvas, front || null);
  const [{ loadAssets }, { createCameraRig }, { createShipRig, createGhostRig }, { createFx }, { createWorld }] = await Promise.all([
    import('./assets.js'), import('./camera.js'), import('./ship.js'), import('./fx.js'), import('./world.js'),
  ]);
  const assets = await loadAssets(THREE, new URL('../art/3d/manifest.json', import.meta.url).href);
  const scene = new THREE.Scene();
  const rig = createCameraRig(THREE);
  const ship = createShipRig(THREE, assets);
  const fx = createFx(THREE);
  scene.add(ship.group, fx.group);
  state3d = { THREE, renderer, canvas, scene, rig, ship, fx, assets, world: null, layout: null, ghosts: new Map(), createGhostRig, createWorld, ready: true };
}

/**
 * Draw one frame. lv is the weekly scene (engine/modes/weekly.js), pose the
 * interpolated player pose (lv.viewPlayer || lv.player), cam2d the 2D camera
 * (state.gfx.camera), ghosts the ghost poses for this instant.
 */
export function draw3d({ lv, pose, keys, cam2d, ghosts = [], time = 0, dt = 0, width, height }) {
  const s = state3d;
  if (!s?.ready) return;
  try {
    // Synchronous on purpose: world.js is imported once at start, so a new layout
    // builds exactly one world (an awaited import here stacked several).
    if (s.layout !== lv.layout) {
      if (s.world) { s.scene.remove(s.world.group); s.world.dispose(); }
      s.layout = lv.layout;
      s.world = s.createWorld(s.THREE, lv.layout, s.assets);
      s.scene.add(s.world.group);
    }
    // Browser zoom or a move to another monitor changes the pixel ratio at runtime.
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const size = s.renderer.getSize(new s.THREE.Vector2());
    if (s.renderer.getPixelRatio() !== dpr || size.x !== width || size.y !== height) {
      s.renderer.setPixelRatio(dpr);
      s.renderer.setSize(width, height, false); s.canvas.style.width = width + 'px'; s.canvas.style.height = height + 'px'; s.rig.resize(width, height);
    }
    s.world.update(lv, time, { reducedMotion: !!lv.reducedMotion });
    s.ship.setVisible(!lv.wreck);
    if (!lv.wreck) s.ship.update(pose, keys, lv, time, dt);
    s.fx.update(lv, pose, keys, time, dt);
    syncGhosts(s, ghosts, time);
    s.rig.update(lv, pose, cam2d, { width, height }, dt);
    s.renderer.render(s.scene, s.rig.camera);
  } catch (error) {
    failed = true;
    console.warn('[3d] falling back to 2D:', error?.message || error);
    teardown();
  }
}

function syncGhosts(s, poses, time) {
  const seen = new Set();
  for (const pose of poses) {
    const key = pose.ghost?.label || pose.label || 'ghost';
    seen.add(key);
    let g = s.ghosts.get(key);
    if (!g) { g = s.createGhostRig(s.THREE, s.assets, pose.color || '#9fe8ff'); s.ghosts.set(key, g); s.scene.add(g.group); }
    g.update(pose, time);
  }
  for (const [key, g] of s.ghosts) if (!seen.has(key)) { s.scene.remove(g.group); g.dispose(); s.ghosts.delete(key); }
}

export function teardown() {
  const s = state3d;
  state3d = null;
  if (!s) return;
  try { s.world?.dispose(); s.ship?.dispose(); s.fx?.dispose(); for (const g of s.ghosts.values()) g.dispose(); s.renderer?.dispose(); s.canvas?.remove(); } catch { /* best effort */ }
}

/** For tests and the debug overlay. */
export function render3dStatus() {
  return { mode: readRenderMode(), running: !!state3d?.ready, failed };
}
