// The 3D camera. Placeholder: straight down over the ship.
export function createCameraRig(THREE) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  return {
    camera,
    update(_lv, pose) { camera.position.set(pose.x, 30, pose.y + 0.001); camera.lookAt(pose.x, 0, pose.y); },
    resize(w, h) { camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); },
  };
}
