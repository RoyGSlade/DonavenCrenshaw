// Procedural structures: the start/finish gate, mid-lane fuel docks and sentry
// turrets. Local frame for the gate and docks: +X is the way the lap runs,
// +Z across the lane, +Y up, origin on the floor at the centre of the line.
// Every GPU resource goes through the Registry R so dispose() can free it.

const PI = Math.PI;

export const GATE_COLORS = { locked: 0xff8a3c, ready: 0x6dffb4 };

/** The start/finish gate: a twin-ring arch over the lane with plinths, cross-bars and a light strip. */
export function buildGate(THREE, R, laneWidth) {
  const group = new THREE.Group();
  group.name = 'finish-gate';
  const half = laneWidth / 2, radius = half + 0.9;
  const steel = R.mat(new THREE.MeshStandardMaterial({ color: 0x3a5772, metalness: 0.45, roughness: 0.4, emissive: 0x0b2236 }));
  const lightMat = R.mat(new THREE.MeshBasicMaterial({ color: GATE_COLORS.locked, toneMapped: false }));
  const archGeo = R.geo(new THREE.TorusGeometry(radius, 0.3, 10, 56, PI));
  const stripGeo = R.geo(new THREE.TorusGeometry(radius - 0.34, 0.07, 6, 56, PI));
  const barGeo = R.geo(new THREE.BoxGeometry(1.0, 0.26, 0.5));
  const plinthGeo = R.geo(new THREE.BoxGeometry(1.7, 0.5, 1.5));
  const lampGeo = R.geo(new THREE.BoxGeometry(0.2, 1.7, 0.2));
  for (const x of [-0.5, 0.5]) {
    const arch = new THREE.Mesh(archGeo, steel); arch.rotation.y = PI / 2; arch.position.set(x, 0, 0); group.add(arch);
    const strip = new THREE.Mesh(stripGeo, lightMat); strip.rotation.y = PI / 2; strip.position.set(x * 1.05, 0, 0); group.add(strip);
  }
  for (const deg of [45, 67.5, 90, 112.5, 135]) {
    const a = (deg * PI) / 180, bar = new THREE.Mesh(barGeo, steel);
    bar.position.set(0, Math.sin(a) * radius, Math.cos(a) * radius); group.add(bar);
  }
  for (const side of [-1, 1]) {
    const plinth = new THREE.Mesh(plinthGeo, steel); plinth.position.set(0, 0.25, side * radius); group.add(plinth);
    const lamp = new THREE.Mesh(lampGeo, lightMat); lamp.position.set(0.62, 1.35, side * radius); group.add(lamp);
    const lamp2 = new THREE.Mesh(lampGeo, lightMat); lamp2.position.set(-0.62, 1.35, side * radius); group.add(lamp2);
  }
  return { group, lightMat, radius };
}

/** A mid-lane fuel dock: a floor ring at the pickup radius and a small arch over it. */
export function buildDock(THREE, R, { haloTexture, pickupRadius = 1.2 }) {
  const group = new THREE.Group();
  group.name = 'fuel-dock';
  const lightMat = R.mat(new THREE.MeshBasicMaterial({ color: 0x57ffa8, toneMapped: false }));
  const steel = R.mat(new THREE.MeshStandardMaterial({ color: 0x24384d, metalness: 0.5, roughness: 0.4, emissive: 0x06131e }));
  const haloMat = R.mat(new THREE.MeshBasicMaterial({ color: 0x57ffa8, map: haloTexture, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const halo = new THREE.Mesh(R.geo(new THREE.PlaneGeometry(pickupRadius * 2, pickupRadius * 2).rotateX(-PI / 2)), haloMat);
  halo.position.y = 0.04; group.add(halo);
  const arch = new THREE.Mesh(R.geo(new THREE.TorusGeometry(pickupRadius + 0.25, 0.1, 8, 32, PI)), steel);
  arch.rotation.y = PI / 2; group.add(arch);
  const strip = new THREE.Mesh(R.geo(new THREE.TorusGeometry(pickupRadius + 0.12, 0.045, 6, 32, PI)), lightMat);
  strip.rotation.y = PI / 2; group.add(strip);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(R.geo(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8)), steel);
    post.position.set(0, 0.275, side * (pickupRadius + 0.25)); group.add(post);
  }
  return { group, lightMat, haloMat };
}

/** A sentry: a hexagonal pedestal, a dome and a turret that turns to aim. */
export function buildSentry(THREE, R, radius = 0.55) {
  const root = new THREE.Group();
  root.name = 'sentry';
  const baseMat = R.mat(new THREE.MeshStandardMaterial({ color: 0x2a3844, metalness: 0.5, roughness: 0.5, emissive: 0x0a0f14 }));
  const barrelMat = R.mat(new THREE.MeshStandardMaterial({ color: 0x8b99a3, metalness: 0.5, roughness: 0.35, emissive: 0x000000 }));
  const coreMat = R.mat(new THREE.MeshBasicMaterial({ color: 0xff9447, toneMapped: false }));
  const base = new THREE.Mesh(R.geo(new THREE.CylinderGeometry(radius, radius * 1.18, 0.5, 6)), baseMat);
  base.position.y = 0.25; root.add(base);
  const turret = new THREE.Group(); turret.position.y = 0.5; root.add(turret);
  const dome = new THREE.Mesh(R.geo(new THREE.SphereGeometry(radius * 0.68, 14, 8, 0, PI * 2, 0, PI / 2)), baseMat);
  turret.add(dome);
  const barrel = new THREE.Mesh(R.geo(new THREE.BoxGeometry(radius * 1.55, radius * 0.34, radius * 0.34)), barrelMat);
  barrel.position.set(radius * 0.85, radius * 0.38, 0); turret.add(barrel);
  const core = new THREE.Mesh(R.geo(new THREE.SphereGeometry(radius * 0.26, 12, 8)), coreMat);
  core.position.set(0, radius * 0.72, 0); turret.add(core);
  return { root, turret, baseMat, barrelMat, coreMat };
}
