// A planner for the live-stealth yard: finds a route from `from` to `to` that no guard cone ever touches, as a timeline.
// The guards walk the same way whether or not you are there (until they notice you), so their cones are known ahead of time:
// run them forward once, then search (cell, time) for a way through, waiting behind cover when a cone sweeps by.
// Used by the tests (a careful player gets through) and by the proof bot (it walks the timeline in the real page).
import { walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { createStealth, coneSees, STEALTH } from '../projects/Space-Shooter/voyage/onfoot/rules/stealth.js';

/** Returns [{ x, y, t }] (world px, seconds) from `from` to `to`, one entry per cell step, or null when no clean route exists. */
export function planStealthRoute(map, { from, to, horizon = 240, gait = 'sneak', cell = 24, margin = 8, tuning } = {}) {
  const sim = createStealth({ map, ...(tuning ? { tuning } : {}) });
  const dtStep = cell / STEALTH.speed[gait];
  const N = Math.ceil(horizon / dtStep);
  const away = { x: -9999, y: -9999, gait: 'sneak', moving: false };
  const traj = [];
  for (let k = 0; k <= N; k++) {
    traj.push(sim.guards.map((g) => ({ x: g.x, y: g.y, angle: g.angle })));
    for (let s = 0; s < 10; s++) sim.step(dtStep / 10, away);
  }
  const cone = sim.coneOf({ state: 'patrol' });
  const cols = Math.ceil(map.w / cell), rows = Math.ceil(map.h / cell);
  const open = new Map();
  const okCell = (cx, cy) => { const k = cy * cols + cx; if (!open.has(k)) open.set(k, walkable(map, (cx + 0.5) * cell, (cy + 0.5) * cell, 11.5)); return open.get(k); };
  const seenAt = (cx, cy, k) => {
    const p = { x: (cx + 0.5) * cell, y: (cy + 0.5) * cell };
    for (const g of traj[k]) {
      if (Math.hypot(g.x - p.x, g.y - p.y) < 0.95 * map.tile) return true; // inside the sneak noise ring, or touching
      if (coneSees(map.solids, g, p, { len: cone.len + margin, half: cone.half + 0.08 })) return true;
    }
    return false;
  };
  const start = [Math.floor(from.x / cell), Math.floor(from.y / cell)], goal = [Math.floor(to.x / cell), Math.floor(to.y / cell)];
  const key = (x, y, k) => (k * rows + y) * cols + x;
  const prev = new Map([[key(...start, 0), -1]]);
  const q = [[...start, 0]];
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let h = 0; h < q.length; h++) {
    const [x, y, k] = q[h];
    if (x === goal[0] && y === goal[1]) {
      const out = [];
      for (let n = key(x, y, k); n !== -1; n = prev.get(n)) { const r = n % (rows * cols); out.push({ x: ((r % cols) + 0.5) * cell, y: (Math.floor(r / cols) + 0.5) * cell, t: Math.floor(n / (rows * cols)) * dtStep }); }
      return out.reverse();
    }
    if (k >= N) continue;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !okCell(nx, ny)) continue;
      if (dx && dy && (!okCell(x + dx, y) || !okCell(x, y + dy))) continue;
      const kk = key(nx, ny, k + 1);
      if (prev.has(kk) || seenAt(nx, ny, k + 1)) continue;
      prev.set(kk, key(x, y, k));
      q.push([nx, ny, k + 1]);
    }
  }
  return null;
}

/** Where the timeline puts you at time t (linear between steps; holds the last point). */
export function routeAt(route, t) {
  if (t <= route[0].t) return { x: route[0].x, y: route[0].y };
  for (let i = 1; i < route.length; i++) {
    if (t <= route[i].t) { const a = route[i - 1], b = route[i], f = (t - a.t) / (b.t - a.t || 1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
  }
  const e = route[route.length - 1];
  return { x: e.x, y: e.y };
}
