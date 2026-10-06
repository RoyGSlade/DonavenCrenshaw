// Lane mesh data as plain typed arrays (no three.js), so tests can count
// vertices and check bounds without WebGL. world.js wraps them in BufferGeometry.
//
// Mapping: sim (x, y) -> world (x, height, y). Floor triangles are wound so
// the surface faces +Y whatever order a caller builds them in.
import { trackFrames, laneBoundaryRuns, runLength } from './laneMath.js';

const TAU = Math.PI * 2;

/** A tiny indexed mesh builder with attribute columns of any width. */
export class MeshData {
  constructor(attributes) {
    this.cols = Object.fromEntries(Object.entries(attributes).map(([k, size]) => [k, { size, data: [] }]));
    this.index = [];
    this.count = 0;
  }
  vertex(values) {
    for (const [k, col] of Object.entries(this.cols)) {
      const v = values[k];
      for (let i = 0; i < col.size; i++) col.data.push(v[i]);
    }
    return this.count++;
  }
  /** Add a triangle; flips it if needed so its normal points up (+Y). */
  tri(a, b, c) {
    const p = this.cols.position.data;
    const ax = p[b * 3] - p[a * 3], az = p[b * 3 + 2] - p[a * 3 + 2];
    const bx = p[c * 3] - p[a * 3], bz = p[c * 3 + 2] - p[a * 3 + 2];
    // y component of (b-a) x (c-a) = az*bx - ax*bz
    if (az * bx - ax * bz >= 0) this.index.push(a, b, c); else this.index.push(a, c, b);
  }
  /** A triangle with the given winding kept as is (for vertical faces). */
  triRaw(a, b, c) { this.index.push(a, b, c); }
  /** A triangle wound to face the same way as vertex a's stored normal. */
  triFacing(a, b, c) {
    const P = this.cols.position.data, N = this.cols.normal.data;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    if (cx * N[a * 3] + cy * N[a * 3 + 1] + cz * N[a * 3 + 2] >= 0) this.index.push(a, b, c); else this.index.push(a, c, b);
  }
  toArrays() {
    const out = { index: this.count > 65535 ? new Uint32Array(this.index) : new Uint16Array(this.index), vertexCount: this.count, triangleCount: this.index.length / 3 };
    for (const [k, col] of Object.entries(this.cols)) out[k] = new Float32Array(col.data);
    return out;
  }
}

export const LANE_COLORS = { edge: [0.012, 0.03, 0.055], center: [0.03, 0.07, 0.115] };

/**
 * The opaque dark surface: a three-column ribbon (edge, centre, edge) along
 * every segment plus a full disc at every point, which fills the round outer
 * corners. Sits at y = 0. Colours are linear RGB.
 */
export function buildLaneSurface(points, width, { discSteps = 28, colors = LANE_COLORS } = {}) {
  const { segments, points: pts } = trackFrames(points);
  const half = width / 2;
  const m = new MeshData({ position: 3, normal: 3, color: 3 });
  const up = [0, 1, 0];
  const v = (x, y, c) => m.vertex({ position: [x, 0, y], normal: up, color: c });
  for (const s of segments) {
    const grid = [];
    for (const end of [0, 1]) {
      const cx = s.x + s.dx * end, cy = s.y + s.dy * end;
      grid.push([v(cx + s.nx * half, cy + s.ny * half, colors.edge), v(cx, cy, colors.center), v(cx - s.nx * half, cy - s.ny * half, colors.edge)]);
    }
    for (let col = 0; col < 2; col++) { m.tri(grid[0][col], grid[1][col], grid[0][col + 1]); m.tri(grid[0][col + 1], grid[1][col], grid[1][col + 1]); }
  }
  for (const p of pts) {
    const c = v(p.x, p.y, colors.center);
    const ring = [];
    for (let i = 0; i < discSteps; i++) { const a = (i / discSteps) * TAU; ring.push(v(p.x + Math.cos(a) * half, p.y + Math.sin(a) * half, colors.edge)); }
    for (let i = 0; i < discSteps; i++) m.tri(c, ring[i], ring[(i + 1) % discSteps]);
  }
  return m.toArrays();
}

/**
 * Flow-line overlay: one quad per segment, UV u = distance along the lap / period
 * (so a repeating texture reads as one continuous lane in the race direction),
 * v across 0..1. Round corners are not covered; the plain surface shows there.
 */
export function buildLaneOverlay(points, width, { period = 8, height = 0.012 } = {}) {
  const { segments } = trackFrames(points);
  const half = width / 2;
  const m = new MeshData({ position: 3, uv: 2 });
  for (const s of segments) {
    const q = [];
    for (const end of [0, 1]) {
      const cx = s.x + s.dx * end, cy = s.y + s.dy * end, u = (s.start + s.length * end) / period;
      q.push(m.vertex({ position: [cx + s.nx * half, height, cy + s.ny * half], uv: [u, 0] }));
      q.push(m.vertex({ position: [cx - s.nx * half, height, cy - s.ny * half], uv: [u, 1] }));
    }
    m.tri(q[0], q[2], q[1]); m.tri(q[1], q[2], q[3]);
  }
  return m.toArrays();
}

/**
 * The rails: a solid low wall along the lane edge (inner face + top) and a neon
 * trim (top-edge strip, a glow curtain rising off the inner face, a glow on
 * the floor) that reads as "do not touch". Both follow laneBoundaryRuns.
 */
export function buildRails(points, width, { wallHeight = 0.55, wallThickness = 0.38, curtainHeight = 1.1, floorGlow = 0.5, trim = 0.16 } = {}) {
  const runs = laneBoundaryRuns(points, width);
  const body = new MeshData({ position: 3, normal: 3 });
  const glow = new MeshData({ position: 3, color: 4 });
  let total = 0;
  for (const run of runs) {
    total += runLength(run);
    const n = run.length;
    const lowIn = [], highIn = [], top = [], trimIn = [], trimOut = [], curtain = [], floor = [];
    for (let i = 0; i < n; i++) {
      const p = run[i], nx = p.nx, ny = p.ny;
      lowIn.push(body.vertex({ position: [p.x, 0, p.y], normal: [-nx, 0, -ny] }));
      highIn.push(body.vertex({ position: [p.x, wallHeight, p.y], normal: [-nx, 0, -ny] }));
      top.push([
        body.vertex({ position: [p.x, wallHeight, p.y], normal: [0, 1, 0] }),
        body.vertex({ position: [p.x + nx * wallThickness, wallHeight, p.y + ny * wallThickness], normal: [0, 1, 0] }),
      ]);
      trimIn.push(glow.vertex({ position: [p.x - nx * 0.02, wallHeight + 0.015, p.y - ny * 0.02], color: [1, 1, 1, 1] }));
      trimOut.push(glow.vertex({ position: [p.x + nx * trim, wallHeight + 0.015, p.y + ny * trim], color: [1, 1, 1, 0.85] }));
      curtain.push([
        glow.vertex({ position: [p.x - nx * 0.03, wallHeight, p.y - ny * 0.03], color: [1, 1, 1, 0.22] }),
        glow.vertex({ position: [p.x - nx * 0.03, wallHeight + curtainHeight, p.y - ny * 0.03], color: [1, 1, 1, 0] }),
      ]);
      floor.push([
        glow.vertex({ position: [p.x - nx * 0.03, 0.02, p.y - ny * 0.03], color: [1, 1, 1, 0.45] }),
        glow.vertex({ position: [p.x - nx * floorGlow, 0.02, p.y - ny * floorGlow], color: [1, 1, 1, 0] }),
      ]);
    }
    for (let i = 0; i + 1 < n; i++) {
      body.triFacing(lowIn[i], lowIn[i + 1], highIn[i]); body.triFacing(highIn[i], lowIn[i + 1], highIn[i + 1]);
      body.tri(top[i][0], top[i][1], top[i + 1][0]); body.tri(top[i + 1][0], top[i][1], top[i + 1][1]);
      glow.tri(trimIn[i], trimOut[i], trimIn[i + 1]); glow.tri(trimIn[i + 1], trimOut[i], trimOut[i + 1]);
      // The curtain is vertical; the glow material is double sided so the winding does not matter.
      glow.triRaw(curtain[i][0], curtain[i][1], curtain[i + 1][0]); glow.triRaw(curtain[i + 1][0], curtain[i][1], curtain[i + 1][1]);
      glow.tri(floor[i][0], floor[i][1], floor[i + 1][0]); glow.tri(floor[i + 1][0], floor[i][1], floor[i + 1][1]);
    }
  }
  return { body: body.toArrays(), glow: glow.toArrays(), runs, railLength: total };
}

/** Chevron decals (flat arrowheads pointing along the bisector tangent) on tight corners. */
export function buildCornerChevrons(corners, width, { size = 1.2, thickness = 0.28, spacing = 1.6, height = 0.02 } = {}) {
  const m = new MeshData({ position: 3, uv: 2 });
  const marks = [];
  for (const c of corners) {
    const count = c.kind === 'hairpin' ? 5 : 3;
    // On the outside half of the lane around the apex, pointing the way the lap goes through it.
    const reach = Math.min(width * 0.2, width / 2 - size * 0.9);
    const ox = c.x - c.insideX * reach, oy = c.y - c.insideY * reach;
    const ang = Math.atan2(c.ty, c.tx);
    const fx = Math.cos(ang), fy = Math.sin(ang), sx = -fy, sy = fx;
    for (let k = 0; k < count; k++) {
      const along = (k - (count - 1) / 2) * spacing;
      const x = ox + c.tx * along, y = oy + c.ty * along;
      marks.push({ x, y, angle: ang, corner: c.index, k, count });
      const t = k / Math.max(1, count - 1);
      const pt = (f, s, u) => m.vertex({ position: [x + fx * f + sx * s, height, y + fy * f + sy * s], uv: [u, t] });
      const tip = size * 0.55, arm = size * 0.55, wing = size * 0.9;
      const a = pt(tip, 0, 0), b = pt(tip - thickness * 1.4, 0, 0);
      const l1 = pt(tip - arm, -wing, 1), l2 = pt(tip - arm - thickness * 1.4, -wing, 1);
      const r1 = pt(tip - arm, wing, 1), r2 = pt(tip - arm - thickness * 1.4, wing, 1);
      m.tri(a, l1, b); m.tri(b, l1, l2); m.tri(a, b, r1); m.tri(b, r2, r1);
    }
  }
  return { ...m.toArrays(), marks };
}

/** A start/finish checker strip across the lane at the portal. Linear RGB vertex colours. */
export function buildCheckerStrip(portal, width, { rows = 2, cells = 12, depth = 0.9, height = 0.016 } = {}) {
  const m = new MeshData({ position: 3, color: 3 });
  const half = width / 2, across = width / cells, d = depth / rows;
  const light = [0.3, 0.75, 0.72], dark = [0.004, 0.012, 0.02];
  const nx = -portal.ty, ny = portal.tx;
  for (let r = 0; r < rows; r++) for (let i = 0; i < cells; i++) {
    const col = (i + r) % 2 ? light : dark;
    const corner = (f, s) => m.vertex({ position: [portal.x + portal.tx * f + nx * s, height, portal.y + portal.ty * f + ny * s], color: col });
    const f0 = (r - rows / 2) * d, f1 = f0 + d, s0 = -half + i * across, s1 = s0 + across;
    const a = corner(f0, s0), b = corner(f1, s0), c = corner(f1, s1), e = corner(f0, s1);
    m.tri(a, b, c); m.tri(a, c, e);
  }
  return m.toArrays();
}

/** Bounds [minX, minY, maxX, maxY] of interleaved xyz positions, in sim coordinates (world x, z). */
export function positionBounds(positions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 2]); maxY = Math.max(maxY, positions[i + 2]);
  }
  return [minX, minY, maxX, maxY];
}
