// Owner-supplied model overrides (Meshy .glb files loaded by assets.js into
// assets.props). world.js looks for these keys and falls back to procedural
// props when one is missing:
//
//   fuelStation   the start/finish gate. Forward +X (the way the lap runs), up +Y.
//                 Scaled so its width across the lane (its Z extent) is the lane
//                 width plus a little, centred on the lane at point 0, base on the floor.
//   fuelDock      the mid-lane refuel docks (layout.stations). Optional; procedural ring otherwise.
//   mine          a mine, any orientation; scaled so its largest dimension is ~2.6x the mine radius.
//   asteroid      a bouncer rock; scaled so its bounding sphere matches the bouncer radius.
//   shard         a collectible crystal; scaled to ~1.1 cells tall, floats and spins.
//   sentry        a corner turret; scaled to its footprint, barrel toward +X (it is turned to aim).
//
// Loaded props are cloned per use and their geometry and materials are shared
// with assets.props, so world.dispose() never frees them: assets owns them.

/** Resolve a prop object from assets, accepting an Object3D or a glTF result ({ scene }). */
export function propFrom(assets, key) {
  const v = assets?.props?.[key];
  if (!v) return null;
  if (v.isObject3D) return v;
  if (v.scene?.isObject3D) return v.scene;
  return null;
}

/**
 * A scaled, centred clone of `source` inside a holder group.
 *   by: 'x' | 'y' | 'z' | 'max' | 'sphere'   what `target` measures
 *   base: 'center' | 'floor'                  where the model sits vertically in the holder
 */
export function fitProp(THREE, source, { target = 1, by = 'max', base = 'center' } = {}) {
  const clone = source.clone(true);
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  let ref;
  if (by === 'sphere') ref = box.getBoundingSphere(new THREE.Sphere()).radius;
  else ref = by === 'x' ? size.x : by === 'y' ? size.y : by === 'z' ? size.z : Math.max(size.x, size.y, size.z);
  const scale = ref > 1e-6 ? target / ref : 1;
  const holder = new THREE.Group();
  clone.position.set(-center.x, base === 'floor' ? -box.min.y : -center.y, -center.z);
  holder.add(clone);
  holder.scale.setScalar(scale);
  holder.userData.fit = { scale, size: size.clone().multiplyScalar(scale) };
  return holder;
}
