// The standard Courier as low-poly geometry, used until the real .glb ships
// arrive (assets.ships.default / assets.ships.<family>). Proportions are read
// off art/player-ship.png: a dark delta wing with silver wing plates, a long
// cyan canopy and two nacelles with cyan nozzles. Normalised to 1 cell long,
// facing +X (nose), +Z to starboard, origin at the hull centre.
export const COURIER = Object.freeze({
  LENGTH: 1,
  NOSE: 0.5,
  TAIL: -0.5,
  PORTS: Object.freeze([{ x: -0.42, z: -0.135 }, { x: -0.42, z: 0.135 }]),
  PALETTE: Object.freeze({ hull: 0x262b33, plate: 0x8d959b, glass: 0x23d6ff, glow: 0x66efff }),
});

const mirror = (pts) => pts.map(([x, z]) => [x, -z]);

/**
 * A faceted prism from a convex-ish outline [[x, z], ...] (any winding): the
 * top is scaled toward the centroid to give a bevel. Flat shaded.
 */
export function loftPrism(THREE, outline, y0, y1, topScale = 1) {
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const [x, z] of outline) { cx += x; cz += z; }
  cx /= n; cz /= n;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, z1] = outline[i], [x2, z2] = outline[(i + 1) % n]; area += x1 * z2 - x2 * z1; }
  const flip = area > 0;
  const pos = [];
  const tri = (a, b, c) => { if (flip) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c); };
  const top = outline.map(([x, z]) => [cx + (x - cx) * topScale, y1, cz + (z - cz) * topScale]);
  const bot = outline.map(([x, z]) => [x, y0, z]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri([cx, y1, cz], top[i], top[j]);
    tri(bot[i], bot[j], top[j]);
    tri(bot[i], top[j], top[i]);
    tri([cx, y0, cz], bot[j], bot[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Build the Courier. Returns { root, materials, geometries, glowMaterials }. */
export function buildCourier(THREE, palette = COURIER.PALETTE) {
  const root = new THREE.Group();
  root.name = 'courier-procedural';
  const geometries = [];
  const hull = new THREE.MeshStandardMaterial({ color: palette.hull, metalness: 0.55, roughness: 0.5, flatShading: true, emissive: 0x070a0d });
  const plate = new THREE.MeshStandardMaterial({ color: palette.plate, metalness: 0.6, roughness: 0.42, flatShading: true, emissive: 0x0d0f10 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b3c4c, metalness: 0.2, roughness: 0.15, emissive: palette.glass, emissiveIntensity: 1.1, flatShading: true });
  const light = new THREE.MeshBasicMaterial({ color: palette.glow });
  const materials = [hull, plate, glass, light];
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  // Fuselage: a long faceted wedge, nose forward.
  const half = [[0.5, 0], [0.30, 0.05], [0.12, 0.095], [-0.05, 0.135], [-0.25, 0.15], [-0.40, 0.135], [-0.48, 0.06]];
  const fuselage = [...half, ...mirror(half).reverse()];
  add(loftPrism(THREE, fuselage, -0.015, 0.085, 0.7), hull);

  // Delta wings (slab) with the silver leading plates on top.
  const wingS = [[0.13, 0.1], [-0.246, 0.4275], [-0.30, 0.42], [-0.34, 0.19], [-0.30, 0.1]];
  const plateS = [[0.07, 0.135], [-0.17, 0.35], [-0.235, 0.34], [-0.265, 0.19], [-0.22, 0.14]];
  add(loftPrism(THREE, wingS, -0.012, 0.03, 0.82), hull);
  add(loftPrism(THREE, mirror(wingS), -0.012, 0.03, 0.82), hull);
  add(loftPrism(THREE, plateS, 0.026, 0.044, 0.9), plate);
  add(loftPrism(THREE, mirror(plateS), 0.026, 0.044, 0.9), plate);

  // Canopy: the long cyan glass, and silver strakes beside it.
  const canopy = [[0.40, 0], [0.30, 0.04], [0.12, 0.052], [0.02, 0.04], [0.02, -0.04], [0.12, -0.052], [0.30, -0.04]];
  add(loftPrism(THREE, canopy, 0.06, 0.105, 0.55), glass);
  const strake = [[0.30, 0.06], [0.04, 0.095], [0.0, 0.1], [0.0, 0.075], [0.28, 0.045]];
  add(loftPrism(THREE, strake, 0.07, 0.092, 0.85), plate);
  add(loftPrism(THREE, mirror(strake), 0.07, 0.092, 0.85), plate);
  // Spine plate along the back.
  add(loftPrism(THREE, [[-0.02, 0.035], [-0.34, 0.05], [-0.34, -0.05], [-0.02, -0.035]], 0.07, 0.092, 0.8), plate);

  // Nacelles with a dark intake ring and a lit nozzle.
  for (const side of [-1, 1]) {
    const nac = new THREE.CylinderGeometry(0.064, 0.07, 0.36, 10);
    nac.rotateZ(Math.PI / 2);
    add(nac, plate, -0.27, 0.045, side * 0.135);
    const ring = new THREE.CylinderGeometry(0.058, 0.058, 0.03, 10);
    ring.rotateZ(Math.PI / 2);
    add(ring, hull, -0.46, 0.045, side * 0.135);
    const nozzle = new THREE.CircleGeometry(0.046, 12);
    nozzle.rotateY(-Math.PI / 2);
    add(nozzle, light, -0.476, 0.045, side * 0.135);
    // Wingtip lights.
    add(new THREE.BoxGeometry(0.05, 0.02, 0.016), light, -0.27, 0.03, side * 0.425);
  }
  return { root, materials, geometries, glowMaterials: [light] };
}
