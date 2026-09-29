// A scripted test pilot for the weekly tracks. It proves a layout can be
// finished with real inputs (every shard, no mine, fuel and hull intact), and
// its recorded frames exercise the replay path in the tests. It is careful,
// not fast: a human should beat it comfortably.
import { pointOnTrack, nearestTrackPoint } from "../track.js";
import { WEEKLY_RULES as R } from "./layout.js";
import { createWeeklyScene, stepWeekly, quantizeFrame, BIT, WEEKLY_CONFIG } from "./sim.js";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The racing line as points every `spacing` cells: an elastic band pinned
 * through each shard and fuel dock, pushed clear of mines, kept inside the
 * lane, and relaxed so it cuts corners like a pilot would.
 */
export function pilotLine(layout, { spacing = 0.5, margin = 0.75, mineClear = 1.05, iterations = 900 } = {}) {
  const { track } = layout;
  const n = Math.ceil(track.length / spacing);
  const pts = Array.from({ length: n }, (_, i) => {
    const p = pointOnTrack(track, i * spacing);
    return { x: p.x, y: p.y, pinned: false };
  });
  const nearestIndex = (x, y) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i].x - x, pts[i].y - y); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  for (const s of [...layout.shards, ...layout.stations]) {
    const i = nearestIndex(s.x, s.y);
    pts[i] = { x: s.x, y: s.y, pinned: true };
  }
  const half = track.width / 2 - margin;
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (p.pinned) continue;
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      p.x += ((a.x + b.x) / 2 - p.x) * 0.5;
      p.y += ((a.y + b.y) / 2 - p.y) * 0.5;
      for (const m of layout.mines) {
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        const need = m.radius + mineClear;
        if (d < need) {
          const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0;
          p.x = m.x + ux * need; p.y = m.y + uy * need;
        }
      }
      const c = nearestTrackPoint(track, p.x, p.y);
      if (c.distance > half) {
        p.x = c.x + ((p.x - c.x) / c.distance) * half;
        p.y = c.y + ((p.y - c.y) / c.distance) * half;
      }
    }
  }
  return pts.map((p) => ({ x: p.x, y: p.y }));
}

/** Speed along the line: a lateral-grip limit from curvature, then accel/brake passes. */
export function pilotSpeeds(line, { cruise = 11, grip = 3.2, accel = 3, brake = 2.2, floor = 3.5 } = {}) {
  const n = line.length;
  const v = line.map((_, i) => {
    const a = line[(i - 4 + n) % n], b = line[i], c = line[(i + 4) % n];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ac = Math.hypot(c.x - a.x, c.y - a.y);
    const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const curvature = ab * bc * ac > 1e-9 ? (2 * cross) / (ab * bc * ac) : 0;
    return Math.max(floor, Math.min(cruise, curvature > 1e-6 ? Math.sqrt(grip / curvature) : cruise));
  });
  const ds = (i, j) => Math.hypot(line[j].x - line[i].x, line[j].y - line[i].y);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n; v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * brake * ds(i, j))); }
    for (let i = 0; i < n; i++) { const j = (i - 1 + n) % n; v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * accel * ds(j, i))); }
  }
  return v;
}

/**
 * Fly the layout with the scripted pilot. Returns { scene, frames, finished,
 * time, dead, events } — frames are exactly what a player's recording holds.
 */
export function flyWeeklyLap(layout, { maxSeconds = R.PILOT_SECONDS, speeds = {} } = {}) {
  const scene = createWeeklyScene(layout);
  const line = pilotLine(layout);
  const v = pilotSpeeds(line, speeds);
  const n = line.length;
  const frames = [];
  const counts = {};
  let idx = 0;
  for (let step = 0; step < maxSeconds * 120; step++) {
    const p = scene.player;
    // Nearest line point, searched a little way ahead of the last one.
    let best = idx, bd = Infinity;
    for (let k = -4; k <= 40; k++) {
      const i = (idx + k + n) % n, d = Math.hypot(line[i].x - p.x, line[i].y - p.y);
      if (d < bd) { bd = d; best = i; }
    }
    idx = best;
    const speed = Math.hypot(p.vx, p.vy);
    const ahead = Math.round((0.9 + speed * 0.22) / 0.5);
    const goal = line[(idx + ahead) % n];
    const want = v[(idx + 2) % n];
    const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy) || 1;
    // Steer the velocity, not the nose: point where thrust fixes the drift.
    const ax = (dx / d) * want - p.vx, ay = (dy / d) * want - p.vy;
    const need = Math.hypot(ax, ay);
    const error = wrap(Math.atan2(ay, ax) - p.angle);
    const frame = { turn: Math.max(-100, Math.min(100, Math.round(error * 300))), thrust: 0, back: 0, strafe: 0, bits: 0 };
    if (Math.abs(error) < 0.5 && need > 0.2) frame.thrust = Math.min(100, Math.round(need * 50));
    // Behind the nose? Reverse thrusters pull it back.
    if (Math.abs(error) > 2.4 && need > 0.6) frame.back = 60;
    if (speed > want + 0.8) frame.bits |= BIT.BRAKE;
    if (step === 0) frame.bits |= BIT.LAUNCH;
    const q = quantizeFrame(frame);
    frames.push(q);
    const events = stepWeekly(scene, q);
    for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
    if (scene.finished || scene.dead) break;
  }
  return { scene, frames, finished: scene.finished, time: scene.finishMs, dead: scene.dead, events: counts, line };
}

export { WEEKLY_CONFIG };
