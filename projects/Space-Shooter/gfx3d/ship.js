// The player's ship and ghosts in 3D. Placeholder: a cone pointing +X.
function cone(THREE, color, opacity = 1) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 12), new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity }));
  mesh.rotation.z = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, mesh };
}
export function createShipRig(THREE) {
  const { group, mesh } = cone(THREE, 0xeaf4f5);
  return {
    group,
    update(pose) { group.position.set(pose.x, 0.3, pose.y); group.rotation.y = -pose.angle; },
    setVisible(v) { group.visible = v; },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
  };
}
export function createGhostRig(THREE, _assets, color) {
  const { group, mesh } = cone(THREE, color, 0.45);
  return {
    group,
    update(pose) { group.position.set(pose.x, 0.3, pose.y); group.rotation.y = -pose.angle; },
    dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
  };
}
