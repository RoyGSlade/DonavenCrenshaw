// Procedural stand-ins for the world's props: geometry factories only. They
// take THREE, make fresh geometry each call and own nothing; world.js tracks
// what it created so dispose() can free it. Each can be replaced by a GLB from
// assets.props (see glb.js).
import { MeshData } from './laneGeometry.js';

const TAU = Math.PI * 2;

/** Merge geometries (positions, normals, per-vertex colours) into one non-indexed geometry. */
export function mergeGeometries(THREE, parts) {
  const pos = [], nor = [], col = [];
  for (const { geometry, color, tip } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      // Optional gradient base -> tip along the part's local Y (before it was transformed by its matrix).
      const t = tip ? (p.getY(i) - minY) / Math.max(1e-6, maxY - minY) : 0;
      const c = tip ? [color[0] + (tip[0] - color[0]) * t, color[1] + (tip[1] - color[1]) * t, color[2] + (tip[2] - color[2]) * t] : color;
      col.push(c[0], c[1], c[2]);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Icosahedron directions (12 unit vectors). */
function icoDirections(THREE) {
  const g = new THREE.IcosahedronGeometry(1, 0), p = g.getAttribute('position'), seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    seen.set(`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`, v);
  }
  g.dispose();
  return [...seen.values()];
}

/** A spiked mine of unit radius: a dark red body with twelve spikes that glow toward their tips. */
export function mineGeometry(THREE) {
  const parts = [];
  const body = new THREE.IcosahedronGeometry(0.8, 1);
  parts.push({ geometry: body, color: [0.16, 0.012, 0.01] });
  const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const d of icoDirections(THREE)) {
    const cone = new THREE.ConeGeometry(0.13, 0.62, 6, 1);
    q.setFromUnitVectors(up, d);
    m.compose(d.clone().multiplyScalar(0.8 + 0.2), q, new THREE.Vector3(1, 1, 1));
    cone.applyMatrix4(m);
    // Gradient base -> tip: measured on the cone before the transform would be ideal; approximate with distance from centre.
    parts.push({ geometry: cone, color: [0.2, 0.02, 0.015] });
  }
  const merged = mergeGeometries(THREE, parts);
  // Re-colour spike vertices by their distance from the centre: dark at the body, hot at the tip.
  const p = merged.getAttribute('position'), c = merged.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    if (r > 0.84) { const t = Math.min(1, (r - 0.84) / 0.5); c.setXYZ(i, 0.2 + 1.9 * t, 0.02 + 0.55 * t, 0.015 + 0.25 * t); }
  }
  return merged;
}

/** A lumpy rock of unit radius (flat shaded). Deterministic. */
export function asteroidGeometry(THREE, seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + 0.16 * Math.sin(3.1 * x + seed) * Math.sin(2.7 * y + 1.3 * seed) + 0.1 * Math.sin(6.3 * z + 2 * seed) * Math.cos(4.9 * x) + 0.05 * Math.sin(11 * (x + y + z));
    p.setXYZ(i, x * bump, y * bump * 0.82, z * bump);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A tall crystal of unit height: an elongated octahedron. */
export function shardGeometry(THREE) {
  const g = new THREE.OctahedronGeometry(0.5, 0);
  g.scale(0.6, 1.35, 0.6);
  g.computeBoundingSphere();
  return g;
}

/** An open glow beam of unit height, bright at the base and fading up (vertex alpha). */
export function beamGeometry(THREE, radius = 0.1) {
  const g = new THREE.CylinderGeometry(radius, radius * 2.2, 1, 12, 1, true);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position'), colors = [];
  for (let i = 0; i < p.count; i++) colors.push(1, 1, 1, 1 - p.getY(i));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  return g;
}

/** Dashed ring of `dashes` flat arcs at `radius`, `thickness` wide, lying on y = 0. */
export function dashedRingGeometry(THREE, radius, { dashes = 64, fill = 0.55, thickness = 0.14 } = {}) {
  const m = new MeshData({ position: 3 });
  const step = TAU / dashes, span = step * fill, r0 = radius - thickness / 2, r1 = radius + thickness / 2;
  for (let i = 0; i < dashes; i++) {
    const a0 = i * step, a1 = a0 + span;
    const v = (a, r) => m.vertex({ position: [Math.cos(a) * r, 0, Math.sin(a) * r] });
    const a = v(a0, r0), b = v(a0, r1), c = v(a1, r1), d = v(a1, r0);
    m.tri(a, b, c); m.tri(a, c, d);
  }
  const arr = m.toArrays();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr.position, 3));
  g.setIndex(new THREE.BufferAttribute(arr.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** A flat disc of the given radius lying on y = 0 facing up, UV 0..1 across (for halo/ring textures). */
export function flatDiscGeometry(THREE, size = 1) {
  const g = new THREE.PlaneGeometry(size * 2, size * 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The sky: a big inverted sphere shaded top to bottom with vertex colours (linear RGB). */
export function skyGeometry(THREE, radius, stops) {
  const g = new THREE.SphereGeometry(radius, 24, 16);
  const p = g.getAttribute('position'), colors = [];
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / radius;                 // -1 below ... +1 above
    let c = stops[0][1];
    for (let k = 1; k < stops.length; k++) {
      if (t >= stops[k - 1][0]) {
        const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
        const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
        c = [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
      }
    }
    colors.push(c[0], c[1], c[2]);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
