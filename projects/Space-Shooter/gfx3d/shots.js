// Sentry and player shots in 3D, interpolated between steps like the 2D renderer
// (gfx/weeklyVfx.js): sentry shots are orange streaks, the player's are cyan dots.
// Gameplay-critical (a sentry hit slows you), so they ride above the lane and glow.
const MAX = 96;
const HEIGHT = 0.45;

export function createShots(THREE) {
  const group = new THREE.Group();
  group.name = 'shots';
  const enemyGeo = new THREE.CapsuleGeometry(0.09, 0.42, 4, 8);
  enemyGeo.rotateZ(Math.PI / 2); // long axis along +X, the direction of travel
  const enemyMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const playerGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const playerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const enemy = new THREE.InstancedMesh(enemyGeo, enemyMat, MAX);
  const player = new THREE.InstancedMesh(playerGeo, playerMat, MAX);
  for (const m of [enemy, player]) { m.count = 0; m.frustumCulled = false; group.add(m); }
  const tmp = new THREE.Object3D();

  function place(mesh, shots, alpha, oriented) {
    let n = 0;
    for (const s of shots || []) {
      if (n >= MAX) break;
      const x = s.prevX == null ? s.x : s.prevX + (s.x - s.prevX) * alpha;
      const y = s.prevY == null ? s.y : s.prevY + (s.y - s.prevY) * alpha;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      tmp.position.set(x, HEIGHT, y);
      tmp.rotation.set(0, oriented ? -Math.atan2(s.vy || 0, s.vx || 0) : 0, 0);
      tmp.updateMatrix();
      mesh.setMatrixAt(n++, tmp.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    update(lv) {
      const alpha = Number.isFinite(lv?.alpha) ? lv.alpha : 1;
      place(enemy, lv?.enemyShots, alpha, true);
      place(player, lv?.playerShots, alpha, false);
    },
    dispose() { enemyGeo.dispose(); enemyMat.dispose(); playerGeo.dispose(); playerMat.dispose(); enemy.dispose(); player.dispose(); },
  };
}
