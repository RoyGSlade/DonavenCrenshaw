// Engine flames, nozzle halos and the small strafe / brake thrusters, shared
// by the player's ship and the ghosts. All in the ship's unit-length space
// (x forward, z starboard), so the owner scales the group to the ship's size.
// Additive and unlit: they cost almost nothing and read from above.
const flameGeometry = (THREE, radius, segments = 8) => {
  const g = new THREE.ConeGeometry(radius, 1, segments, 1, true);
  g.translate(0, 0.5, 0);   // base at the origin, tip up the +Y axis...
  g.rotateZ(Math.PI / 2);   // ...then turned to point down -X, out of the tail
  return g;
};

export function createEngineRig(THREE, texture, { alpha = 1, outer = 0x2f8fff, inner = 0xd8ffff, halo = 0x4fd8ff, maxPorts = 4 } = {}) {
  const group = new THREE.Group();
  group.name = 'engines';
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const outerMat = new THREE.MeshBasicMaterial({ color: outer, opacity: 0.7, side: THREE.DoubleSide, ...additive });
  const innerMat = new THREE.MeshBasicMaterial({ color: inner, opacity: 0.9, side: THREE.DoubleSide, ...additive });
  const haloMat = new THREE.MeshBasicMaterial({ color: halo, map: texture, opacity: 0.6, ...additive });
  const jetMat = new THREE.MeshBasicMaterial({ color: halo, opacity: 0.8, side: THREE.DoubleSide, ...additive });
  const outerGeo = flameGeometry(THREE, 0.05), innerGeo = flameGeometry(THREE, 0.028), jetGeo = flameGeometry(THREE, 0.022, 6);
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  haloGeo.rotateX(-Math.PI / 2);

  const engines = [];
  for (let i = 0; i < maxPorts; i++) {
    const o = new THREE.Mesh(outerGeo, outerMat), n = new THREE.Mesh(innerGeo, innerMat), h = new THREE.Mesh(haloGeo, haloMat);
    o.visible = n.visible = h.visible = false;
    o.renderOrder = n.renderOrder = h.renderOrder = 5;
    group.add(h, o, n);
    engines.push({ o, n, h });
  }
  // Side thrusters (strafe) and nose thrusters (brake / reverse): [x, z, direction angle about Y].
  const jetSpec = [[-0.16, -0.17, Math.atan2(-1, 0)], [-0.16, 0.17, Math.atan2(1, 0)], [0.22, -0.1, Math.PI], [0.22, 0.1, Math.PI]];
  const jets = jetSpec.map(([x, z, a]) => {
    const m = new THREE.Mesh(jetGeo, jetMat);
    m.position.set(x, 0.05, z);
    // jetGeo points -X; rotation.y = a points it at (-cos a, sin a) in (x, z).
    m.rotation.y = a;
    m.visible = false;
    m.renderOrder = 5;
    group.add(m);
    return m;
  });
  // The single shared jet material gets one opacity; per-jet fades go through scale.

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    group,
    /**
     * ports: [{x, z, y?}] in unit-length space. v: { glow, boost, strafe (-1..1), brake (0..1) }.
     * flicker: false (reduced motion) holds the flames steady.
     */
    update(ports, v, time, flicker = true) {
      const glow = clamp01(v.glow), boost = clamp01(v.boost);
      outerMat.opacity = alpha * clamp01(0.3 + 0.55 * glow + 0.3 * boost);
      innerMat.opacity = alpha * clamp01(0.4 + 0.55 * glow);
      haloMat.opacity = alpha * clamp01(0.22 + 0.5 * glow + 0.6 * boost);
      for (let i = 0; i < engines.length; i++) {
        const e = engines[i], p = ports[i];
        const on = !!p;
        e.o.visible = e.n.visible = e.h.visible = on;
        if (!on) continue;
        const y = p.y ?? 0.045;
        const f = flicker ? 1 + Math.sin(time * 53 + i * 1.7) * 0.06 : 1;
        const len = (0.07 + 0.3 * glow + 0.6 * boost) * f;
        const w = 1 + glow * 0.25 + boost * 0.6;
        e.o.position.set(p.x, y, p.z); e.n.position.set(p.x, y, p.z);
        e.o.scale.set(len, w, w);
        e.n.scale.set(len * 0.55, w, w);
        const hs = 0.26 + 0.34 * glow + 0.55 * boost;
        e.h.position.set(p.x - 0.04 - len * 0.2, y + 0.03, p.z);
        e.h.scale.set(hs * 1.3, 1, hs);
      }
      const side = v.strafe || 0, brake = clamp01(v.brake || 0);
      // Strafing starboard (+) fires the port-side thruster, and the other way round.
      setJet(jets[0], Math.max(0, side));
      setJet(jets[1], Math.max(0, -side));
      setJet(jets[2], brake);
      setJet(jets[3], brake);
    },
    dispose() {
      for (const g of [outerGeo, innerGeo, jetGeo, haloGeo]) g.dispose();
      for (const m of [outerMat, innerMat, haloMat, jetMat]) m.dispose();
    },
  };
}

function setJet(mesh, level) {
  mesh.visible = level > 0.04;
  if (mesh.visible) mesh.scale.set(0.05 + 0.2 * level, 1, 1);
}
