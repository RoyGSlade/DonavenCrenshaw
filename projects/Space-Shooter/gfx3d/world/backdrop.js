// Deep-space backdrop data: stars, dust and where the planet and nebulae sit.
// Pure and seeded (no Math.random), so a given track always gets the same sky
// and node tests can check it. world.js turns these into Points and meshes.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Star colours (linear-ish): mostly white-blue, a few warm.
const STAR_TINTS = [[0.75, 0.85, 1], [0.9, 0.95, 1], [1, 1, 1], [1, 0.93, 0.8], [1, 0.82, 0.7], [0.7, 0.8, 1]];

/** A deep slab of stars below the lane, spread over the track's bounds plus a margin. Seen past the lane edges. */
export function starSlab({ seed = 1, count = 3200, bounds, margin = 260, depth = [12, 190], size = [0.18, 0.7] }) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
  const w = bounds.maxX - bounds.minX + margin * 2, h = bounds.maxY - bounds.minY + margin * 2;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = bounds.minX - margin + rand() * w;
    positions[i * 3 + 1] = -(depth[0] + rand() * (depth[1] - depth[0]));
    positions[i * 3 + 2] = bounds.minY - margin + rand() * h;
    const tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)], bright = 0.45 + rand() * 0.55;
    colors[i * 3] = tint[0] * bright; colors[i * 3 + 1] = tint[1] * bright; colors[i * 3 + 2] = tint[2] * bright;
    sizes[i] = size[0] + (size[1] - size[0]) * rand() ** 3;
  }
  return { positions, colors, sizes, count };
}

/** Stars on a sphere of `radius` around the origin (the world moves it with the ship). */
export function skyStars({ seed = 2, count = 1400, radius = 850 }) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    positions[i * 3] = Math.cos(a) * r * radius; positions[i * 3 + 1] = z * radius; positions[i * 3 + 2] = Math.sin(a) * r * radius;
    const tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)], bright = 0.35 + rand() * 0.65;
    colors[i * 3] = tint[0] * bright; colors[i * 3 + 1] = tint[1] * bright; colors[i * 3 + 2] = tint[2] * bright;
  }
  return { positions, colors, count };
}

/** Drifting dust motes hovering around the lane, so speed over the track reads (parallax). */
export function laneMotes(frames, { seed = 3, count = 1600, spread = 11, height = [0.6, 6] }) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const along = rand() * frames.length;
    let s = frames.segments[frames.segments.length - 1];
    for (const c of frames.segments) if (along <= c.start + c.length) { s = c; break; }
    const t = (along - s.start) / s.length, off = (rand() * 2 - 1) * spread;
    positions[i * 3] = s.x + s.dx * t + s.nx * off;
    positions[i * 3 + 1] = height[0] + rand() * (height[1] - height[0]);
    positions[i * 3 + 2] = s.y + s.dy * t + s.ny * off;
  }
  return { positions, count };
}

/**
 * Where the big things sit, from the track's bounds. The planet hangs below the
 * lane so the camera, looking down, sees it as the world the gantry is over.
 */
export function backdropPlan(bounds) {
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 60);
  return {
    center: { x: cx, y: cy },
    planet: { x: cx + span * 0.55, y: -(span * 0.55 + 90), z: cy - span * 0.2, radius: Math.max(70, span * 0.5) },
    moon: { x: cx - span * 0.9, y: -(span * 0.4 + 120), z: cy + span * 0.45, radius: Math.max(14, span * 0.05) },
    nebulae: [
      { x: cx - span * 0.35, y: -70, z: cy - span * 0.25, size: span * 1.1, color: [0.35, 0.18, 0.7], opacity: 0.12 },
      { x: cx + span * 0.3, y: -95, z: cy + span * 0.2, size: span * 1.3, color: [0.1, 0.45, 0.65], opacity: 0.1 },
      { x: cx, y: -120, z: cy + span * 0.55, size: span * 1.0, color: [0.7, 0.2, 0.45], opacity: 0.08 },
    ],
  };
}
