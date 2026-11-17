// The d20: a real icosahedron, drawn on a 2D canvas with perspective, shading
// and its numbers, that tumbles and lands with the decided face toward you.
// The game's seeded rules decide the number (character.js check); this only
// shows it, like the d6 tray's relabel does for the stat dice (ui/dice.js).
// Opposite faces add up to 21, as on a real d20; 6 and 9 carry a dot.
//
// Fallbacks: reduced motion draws the result at once; with no 2D canvas the
// caller's words carry the number. No libraries; works offline.
import { renderDpr, readRenderScale } from '../renderScale.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const V = Object.freeze([
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map((p) => { const n = Math.hypot(...p); return p.map((c) => c / n); }));

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const n = Math.hypot(...a) || 1; return a.map((c) => c / n); };

// The 20 faces: every triple of mutually adjacent vertices, wound outward.
const EDGE = Math.min(...V.slice(1).map((p) => Math.hypot(...sub(p, V[0])))) + 1e-6;
const near = (i, j) => Math.hypot(...sub(V[i], V[j])) <= EDGE;
const RAW = [];
for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
  if (!near(i, j) || !near(j, k) || !near(i, k)) continue;
  const c = norm(add(add(V[i], V[j]), V[k]));
  const n = cross(sub(V[j], V[i]), sub(V[k], V[i]));
  RAW.push({ v: dot(n, c) > 0 ? [i, j, k] : [i, k, j], n: c });
}
// Numbers: pair each face with its opposite (n and 21 - n), in a fixed order.
const order = [...RAW.keys()].sort((a, b) => RAW[b].n[1] - RAW[a].n[1] || RAW[b].n[0] - RAW[a].n[0] || RAW[b].n[2] - RAW[a].n[2]);
const used = new Set();
let next = 1;
for (const i of order) {
  if (used.has(i)) continue;
  const opp = RAW.findIndex((f, j) => j !== i && dot(f.n, RAW[i].n) < -0.999);
  RAW[i].value = next;
  RAW[opp].value = 21 - next;
  used.add(i); used.add(opp);
  next++;
}
/** The faces: { v: [vertex indices], n: unit outward normal, value: 1..20 }. */
export const FACES = Object.freeze(RAW.map((f) => Object.freeze({ ...f })));
export const VERTICES = V;

// Quaternions [w, x, y, z].
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qaxis = (axis, angle) => { const s = Math.sin(angle / 2); const a = norm(axis); return [Math.cos(angle / 2), a[0] * s, a[1] * s, a[2] * s]; };
/** v rotated by unit quaternion q. */
export function rotate(q, v) {
  const [w, x, y, z] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}
// The shortest rotation taking unit a onto unit b.
function between(a, b) {
  const d = dot(a, b);
  if (d < -0.999999) return qaxis(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]), Math.PI);
  const c = cross(a, b);
  const q = [1 + d, c[0], c[1], c[2]];
  const n = Math.hypot(...q);
  return q.map((k) => k / n);
}

const TOWARD = [0, 0.28, 0.96]; // the resting face looks at the camera, tipped a little up
/** The orientation that shows `value` facing the viewer, with a twist (radians) about the view axis. */
export function orientFor(value, twist = 0) {
  const face = FACES.find((f) => f.value === value) || FACES[0];
  const to = norm(TOWARD);
  return qmul(qaxis(to, twist), between(face.n, to));
}
/** The face most toward the viewer for orientation q (what a player reads as the result). */
export function frontFace(q) {
  let best = FACES[0], bz = -Infinity;
  for (const f of FACES) { const z = dot(rotate(q, f.n), norm(TOWARD)); if (z > bz) { bz = z; best = f; } }
  return best.value;
}

const LIGHT = norm([-0.5, 0.65, 0.75]);
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * canvas: where the die is drawn. rng: () => [0,1) for the tumble's look only.
 * Returns { rollTo(value) -> Promise, show(value), skip(), dim(on), rolling, destroy() }.
 */
export function createD20(canvas, { rng = Math.random, reducedMotion = () => false, durationMs = 1100 } = {}) {
  const ctx = canvas.getContext?.('2d') || null;
  let q = orientFor(20);
  let value = 20;
  let frame = 0;
  let resolve = null;
  let start = 0;
  let from = { axis: [1, 0, 0], spin: 0, twist: 0 };
  let lift = 0;
  let dimmed = false;
  let glow = 0;
  let alive = true;

  function size() {
    const box = canvas.getBoundingClientRect?.() || { width: 76, height: 76 };
    const w = Math.max(40, box.width || 76), h = Math.max(40, box.height || 76);
    const dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    return { w, h, dpr };
  }
  let dims = ctx ? size() : { w: 76, h: 76, dpr: 1 };

  function draw() {
    if (!ctx) return;
    const { w, h, dpr } = dims;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.4;
    const cx = w / 2, cy = h / 2 - lift * h * 0.12;
    const f = 4.2; // camera distance in die radii: mild perspective
    const P = V.map((p) => { const s = rotate(q, p); const k = f / (f - s[2]); return [cx + s[0] * r * k, cy - s[1] * r * k, s[2]]; });
    // Contact shadow.
    ctx.globalAlpha = (dimmed ? 0.35 : 0.6) * (1 - lift * 0.5);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(w / 2, h / 2 + r * 0.98, r * (0.78 - lift * 0.2), r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = dimmed ? 0.42 : 1;
    const faces = FACES.map((face) => ({ face, n: rotate(q, face.n) })).filter((x) => x.n[2] > 0).sort((a, b) => a.n[2] - b.n[2]);
    for (const { face, n } of faces) {
      const light = Math.max(0, dot(n, LIGHT));
      const tone = 0.32 + 0.68 * light;
      const gold = glow > 0 ? glow : 0;
      const base = [18 + 30 * tone + 150 * gold * tone, 58 + 90 * tone + 90 * gold * tone, 74 + 96 * tone - 40 * gold];
      ctx.fillStyle = `rgb(${base.map((c) => Math.round(Math.min(255, Math.max(0, c)))).join(',')})`;
      ctx.strokeStyle = gold ? 'rgba(255,236,170,.9)' : 'rgba(190,255,250,.55)';
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      face.v.forEach((vi, i) => (i ? ctx.lineTo(P[vi][0], P[vi][1]) : ctx.moveTo(P[vi][0], P[vi][1])));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (n[2] < 0.3) continue;
      const mx = (P[face.v[0]][0] + P[face.v[1]][0] + P[face.v[2]][0]) / 3;
      const my = (P[face.v[0]][1] + P[face.v[1]][1] + P[face.v[2]][1]) / 3;
      const big = n[2] > 0.85;
      ctx.save();
      ctx.globalAlpha = (dimmed ? 0.42 : 1) * Math.min(1, (n[2] - 0.3) * 2.2);
      ctx.fillStyle = gold && big ? '#fff3c4' : '#f2fbfb';
      ctx.font = `800 ${Math.round(r * (big ? 0.5 : 0.3) * n[2])}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const t = String(face.value) + (face.value === 6 || face.value === 9 ? '.' : '');
      ctx.fillText(t, mx, my + r * 0.02);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    if (!alive) return;
    const t = Math.min(1, (now - start) / durationMs);
    const e = easeOut(t);
    const settle = orientFor(value, from.twist * (1 - e));
    q = qmul(settle, qaxis(from.axis, from.spin * (1 - e)));
    // Two hops that die away, then rest.
    lift = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) ** 1.6;
    draw();
    if (t < 1) frame = requestAnimationFrame(tick);
    else finish();
  }

  function finish() {
    cancelAnimationFrame(frame);
    q = orientFor(value);
    lift = 0;
    glow = value === 20 ? 1 : 0;
    draw();
    const done = resolve; resolve = null;
    done?.(value);
  }

  return {
    /** Tumble, then land with `value` facing the viewer. */
    rollTo(v) {
      value = Math.min(20, Math.max(1, Math.trunc(v) || 1));
      glow = 0;
      dims = ctx ? size() : dims;
      if (resolve) finish();
      return new Promise((res) => {
        resolve = res;
        if (!ctx || reducedMotion() || typeof requestAnimationFrame !== 'function') { finish(); return; }
        from = { axis: norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]), spin: Math.PI * (4 + rng() * 2), twist: Math.PI * (rng() - 0.5) };
        start = performance.now();
        frame = requestAnimationFrame(tick);
      });
    },
    /** Draw the die resting on a value, no tumble. */
    show(v) { value = Math.min(20, Math.max(1, Math.trunc(v) || 1)); dims = ctx ? size() : dims; finish(); },
    skip() { if (resolve) finish(); },
    /** The dropped die of an advantage roll reads dimmer. */
    dim(on) { dimmed = Boolean(on); draw(); },
    get rolling() { return Boolean(resolve); },
    get canDraw() { return Boolean(ctx); },
    destroy() { alive = false; cancelAnimationFrame(frame); },
  };
}
