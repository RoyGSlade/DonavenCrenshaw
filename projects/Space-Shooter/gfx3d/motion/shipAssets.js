// Picking and preparing a ship model from assets.ships (the loaded .glb
// scenes). Dropping a file into art/3d/ and naming it in manifest.json is all a
// new ship needs:
//   assets.ships["needle:0-1-2-0"]   an exact garage build, else
//   assets.ships.needle              its family (the part before ':'), else
//   assets.ships.courier / .default  the standard ship, else
//   (nothing)                        the procedural Courier stand-in.
// Models face +X, up is +Y. They are scaled to the ship's length in cells, so
// the .glb's own units do not matter; name two empty nodes "exhaust_L" and
// "exhaust_R" (or anything containing "exhaust") to place the engine nozzles.

export function familyOf(key) {
  return typeof key === 'string' && key.includes(':') ? key.slice(0, key.indexOf(':')) : (key || '');
}

/** The best model in assets.ships for a build key (or none): { key, object } or null. */
export function pickShipModel(assets, buildKey) {
  const ships = assets?.ships;
  if (!ships) return null;
  for (const key of [buildKey, familyOf(buildKey), 'courier', 'default']) {
    if (key && ships[key]) return { key, object: ships[key] };
  }
  return null;
}

const DEFAULT_PORTS = [{ x: -0.42, z: -0.135 }, { x: -0.42, z: 0.135 }];

// What a hull's mesh can't say for itself, by family, in the unit-length space
// fitModel returns (x forward from the box centre, y up, z starboard):
//   eye    the cockpit view's eye (gfx3d/camera.js); hulls without one use COCKPIT_3D.EYE
//   ports  engine nozzles, when the .glb has no "exhaust" nodes
//   glows  light painted into the texture (not emissive), drawn as additive sprites;
//          part "canopy" hides in the cockpit view, where the eye sits just above the glass
export const HULL_FEATURES = Object.freeze({
  // The owner's Needle remake (2026-10-05; exported 1.446 cells long). Eye measured in Blender
  // 0.13 m ahead of and 0.06 m above the canopy top of the 1.903 m raw ship, scaled 0.7597 into
  // the export (x -0.184, y 0.155): the canopy top is the mesh's highest point at x -0.285.
  // Glows found from the texture's painted cyan: one tail nozzle; canopy glass x -0.29..-0.08, top y 0.075.
  needle: Object.freeze({
    eye: Object.freeze({ x: -0.127, y: 0.107, z: 0.004 }),
    ports: Object.freeze([Object.freeze({ x: -0.478, y: -0.011, z: 0.008 })]),
    glows: Object.freeze([
      Object.freeze({ part: 'engine', x: -0.49, y: -0.011, z: 0.008, size: 0.12, color: 0x7fe9ff, opacity: 0.85 }),
      Object.freeze({ part: 'canopy', x: -0.19, y: 0.06, z: 0, size: 0.17, color: 0x6fdcff, opacity: 0.4 }),
    ]),
  }),
});

/** Features for a model key ("needle:0-1-2-0", "needle", ...) or null. */
export function hullFeatures(key) {
  return HULL_FEATURES[familyOf(key)] || null;
}

/**
 * Clone a loaded model into a wrapper scaled so it is 1 cell long along X and
 * centred on the origin (the caller scales the wrapper to the ship's length).
 * Returns { root, ports, box } with ports in that unit-length space.
 */
export function fitModel(THREE, source) {
  const clone = source.clone(true);
  const root = new THREE.Group();
  root.add(clone);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const k = size.x > 1e-6 ? 1 / size.x : 1;
  clone.scale.multiplyScalar(k);
  root.updateMatrixWorld(true);
  box.setFromObject(clone);
  const centre = box.getCenter(new THREE.Vector3());
  clone.position.sub(centre);
  root.updateMatrixWorld(true);
  box.setFromObject(clone);

  const ports = [];
  const v = new THREE.Vector3();
  clone.traverse((o) => {
    if (ports.length < 4 && /exhaust/i.test(o.name || '')) { v.setFromMatrixPosition(o.matrixWorld); ports.push({ x: v.x, z: v.z, y: v.y }); }
  });
  if (!ports.length) for (const p of DEFAULT_PORTS) ports.push({ x: box.min.x + 0.08, z: p.z, y: 0 });
  return { root, ports, box };
}

/**
 * Give a rig its own copies of a cloned model's materials so effects (stun
 * flash, ghost tint) never leak into the shared asset. Returns the list of
 * { material, emissive, intensity } to restore from.
 */
export function ownMaterials(root) {
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const own = mats.map((m) => m.clone());
    o.material = Array.isArray(o.material) ? own : own[0];
    for (const m of own) list.push({ material: m, emissive: m.emissive ? m.emissive.clone() : null, intensity: m.emissiveIntensity ?? 1 });
  });
  return list;
}
