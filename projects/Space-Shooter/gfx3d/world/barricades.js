// Barricade segments lining the outside of the rails (art/3d/props/barricade.glb).
// Decoration only: the rails are still the hard edge the sim uses, and the glowing
// rail trim stays visible in front of them. Drawn as one InstancedMesh per mesh in
// the model, so a full lap of segments costs a handful of draw calls.

/**
 * Where segments go: every `pitch` cells along each boundary run, pushed `offset`
 * cells outward along the run's normal, turned to follow the run. Pure.
 * runs: laneBoundaryRuns() output, arrays of { x, y, nx, ny }.
 */
export function barricadePlacements(runs, { pitch = 2.6, offset = 0.95, minRun = 1.2 } = {}) {
  const out = [];
  for (const run of runs) {
    let total = 0;
    const lengths = [];
    for (let i = 1; i < run.length; i++) {
      const l = Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
      lengths.push(l); total += l;
    }
    if (total < minRun) continue;
    const count = Math.max(1, Math.floor(total / pitch));
    const spacing = total / count;
    let seg = 0, acc = 0;
    for (let k = 0; k < count; k++) {
      const s = spacing * (k + 0.5);
      while (seg < lengths.length - 1 && acc + lengths[seg] < s) { acc += lengths[seg]; seg++; }
      const a = run[seg], b = run[seg + 1], t = lengths[seg] ? (s - acc) / lengths[seg] : 0;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, nl = Math.hypot(nx, ny) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      out.push({ x: x + (nx / nl) * offset, y: y + (ny / nl) * offset, angle, length: Math.min(spacing, pitch) });
    }
  }
  return out;
}

/** One InstancedMesh per mesh of the prop, all segments in one go. Returns { group, dispose }. */
export function buildBarricades(THREE, prop, placements, { length = 2.4 } = {}) {
  const group = new THREE.Group();
  group.name = 'barricades';
  if (!prop || !placements.length) return { group, count: 0, dispose() {} };
  // Measure the prop and scale its long side to `length` (it faces +X, base on the floor).
  prop.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(prop);
  const size = box.getSize(new THREE.Vector3());
  const scale = length / Math.max(size.x, size.z, 1e-6);
  const lift = -box.min.y * scale;
  const owned = [];
  const base = new THREE.Matrix4(), place = new THREE.Matrix4(), tmp = new THREE.Object3D();
  prop.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    owned.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, node.material, placements.length);
    placements.forEach((p, i) => {
      tmp.position.set(p.x, lift, p.y);
      tmp.rotation.set(0, -p.angle, 0);
      tmp.scale.setScalar(scale);
      tmp.updateMatrix();
      base.copy(tmp.matrix);
      mesh.setMatrixAt(i, place.copy(base));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  // Materials and textures belong to the loaded asset (shared, freed by the asset cache); geometry clones are ours.
  return { group, count: placements.length, dispose() { for (const g of owned) g.dispose(); for (const m of group.children) m.dispose?.(); } };
}
