// The weekly track in 3D. Placeholder: the centreline as a line.
export function createWorld(THREE, layout) {
  const group = new THREE.Group();
  group.add(new THREE.AmbientLight(0xffffff, 1.2));
  const pts = layout.track.points.map((p) => new THREE.Vector3(p.x, 0, p.y));
  pts.push(pts[0].clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x81e6df }));
  group.add(line);
  return { group, update() {}, dispose() { line.geometry.dispose(); line.material.dispose(); } };
}
