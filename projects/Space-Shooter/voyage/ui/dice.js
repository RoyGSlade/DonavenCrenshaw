// The dice tray: draws diceSim's cube on a 2D canvas, seen from above and a
// little to the front, with real perspective, shading, a contact shadow and
// pips on every face. The number the player gets is the face that ends up on
// top (diceSim.topFace), read when the cube has settled.
//
// Fallbacks: reduced motion settles the throw at once and draws the result;
// a "lite" mode (render scale Fast, or a weak device) drops the shadow blur
// and glow; with no 2D canvas at all the throw is still simulated and the
// caller shows the number as text. No libraries; works offline.
import { DIE, FACES, CORNERS, throwDie, step, topFace, restingOn, settle, rotate, labelFor, turn } from './diceSim.js';
import { renderDpr, readRenderScale } from '../renderScale.js';

const H = DIE.size / 2;
const TILT = 0.62; // camera tilt from straight down (radians)
const DIST = 12;
const CAM = [0, -DIST * Math.sin(TILT), DIST * Math.cos(TILT)];
const FWD = [0, Math.sin(TILT), -Math.cos(TILT)];
const RIGHT = [1, 0, 0];
const UP = [0, Math.cos(TILT), Math.sin(TILT)];
const LIGHT = (() => { const l = [-0.45, 0.35, 0.82]; const n = Math.hypot(...l); return l.map((c) => c / n); })();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const PIP = 0.25;
const PIPS = {
  1: [[0, 0]],
  2: [[-PIP, -PIP], [PIP, PIP]],
  3: [[-PIP, -PIP], [0, 0], [PIP, PIP]],
  4: [[-PIP, -PIP], [PIP, -PIP], [-PIP, PIP], [PIP, PIP]],
  5: [[-PIP, -PIP], [PIP, -PIP], [0, 0], [-PIP, PIP], [PIP, PIP]],
  6: [[-PIP, -PIP], [-PIP, 0], [-PIP, PIP], [PIP, -PIP], [PIP, 0], [PIP, PIP]],
};
// The two in-face axes for each face normal.
function faceAxes(n) {
  if (n[0]) return [[0, 1, 0], [0, 0, 1]];
  if (n[1]) return [[1, 0, 0], [0, 0, 1]];
  return [[1, 0, 0], [0, 1, 0]];
}

function liteDevice() {
  if (readRenderScale() === 'fast') return true;
  const cores = globalThis.navigator?.hardwareConcurrency;
  return Number.isFinite(cores) && cores > 0 && cores <= 2;
}

/**
 * canvas: the tray. rng: () => [0,1) for the throw (crypto-backed by the caller).
 * reducedMotion(): true settles at once. onSettle(value) after each roll.
 * Returns { roll(aim?) -> Promise<value>, show(value), rolling, destroy() }.
 */
export function createDiceTray(canvas, { rng, reducedMotion = () => false, onSettle = () => {}, lite = liteDevice(), timeScale = 1, framing = DIE.tray + 0.6, follow = false } = {}) {
  const ctx = canvas.getContext?.('2d') || null;
  let die = restingOn(1);
  let label = null; // attempt rolls: the relabel turn, found once the throw is simulated
  let speed = timeScale;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let dpr = 1;
  let w = 0, h = 0, fpx = 1, cx = 0, cy = 0;
  let glow = 0; // the result's glow after a settle
  let cam = [0, 0]; // with follow, the camera drifts after the die (small trays)
  let resolveRoll = null;
  let alive = true;

  function size() {
    const box = canvas.getBoundingClientRect();
    w = Math.max(120, box.width || canvas.clientWidth || 320);
    h = Math.max(100, box.height || canvas.clientHeight || 220);
    dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Fit the tray's far and near edges: the near edge is wider on screen.
    const span = framing;
    fpx = Math.min(w / (2 * span), h / (2 * span * 0.78)) * (DIST - span * Math.sin(TILT)) * 0.98;
    cx = w / 2;
    cy = h / 2 + h * 0.03;
  }

  function project(pw) {
    const d = sub([pw[0] - cam[0], pw[1] - cam[1], pw[2]], CAM);
    const z = dot(d, FWD);
    return [cx + (fpx * dot(d, RIGHT)) / z, cy - (fpx * dot(d, UP)) / z, z];
  }

  function poly(points) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }

  function drawTray() {
    const T = DIE.tray;
    const floor = [[-T, -T, 0], [T, -T, 0], [T, T, 0], [-T, T, 0]].map(project);
    const g = ctx.createLinearGradient(0, floor[2][1], 0, floor[0][1]);
    g.addColorStop(0, '#0b1726');
    g.addColorStop(1, '#13263a');
    ctx.fillStyle = g;
    poly(floor);
    ctx.fill();
    // Deck plate seams.
    ctx.strokeStyle = 'rgba(129,230,223,0.08)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const a = project([i * T / 3, -T, 0]), b = project([i * T / 3, T, 0]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const c = project([-T, i * T / 3, 0]), d = project([T, i * T / 3, 0]);
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    }
    // Walls: a low gunmetal rim, inner faces shaded, a cyan strip and amber corner lamps.
    const WH = 0.6;
    const C = [[-T, -T], [T, -T], [T, T], [-T, T]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = C[i], [bx, by] = C[(i + 1) % 4];
      const quad = [[ax, ay, 0], [bx, by, 0], [bx, by, WH], [ax, ay, WH]].map(project);
      const far = i === 2; // the wall at +y faces the camera
      ctx.fillStyle = far ? '#1f2c3a' : i === 0 ? '#0e1824' : '#17222f';
      poly(quad); ctx.fill();
    }
    const rim = C.map(([x, y]) => project([x, y, WH]));
    ctx.strokeStyle = '#8fa6b7';
    ctx.lineWidth = 2.5;
    poly(rim); ctx.stroke();
    ctx.strokeStyle = 'rgba(129,230,223,0.55)';
    ctx.lineWidth = 1.2;
    poly(floor); ctx.stroke();
    ctx.fillStyle = '#ffad72';
    for (const p of rim) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawShadow() {
    // The cube's corners dropped onto the floor; their hull, softer the higher it flies.
    const pts = CORNERS.map((c) => { const p = rotate(die.q, c); return [die.p[0] + p[0] + 0.25 * die.p[2], die.p[1] + p[1] + 0.2 * die.p[2], 0]; });
    const hull = convexHull(pts.map(project));
    const a = Math.max(0.12, 0.55 - die.p[2] * 0.1);
    ctx.save();
    if (!lite) { ctx.filter = `blur(${Math.min(10, 2 + die.p[2] * 2)}px)`; }
    ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
    poly(hull);
    ctx.fill();
    ctx.restore();
  }

  function drawDie() {
    const faces = [];
    const S = label; // relabel turn for an attempt roll (null for a stat roll)
    for (const f of FACES) {
      const n = rotate(die.q, turn(S, f.n));
      const centre = [die.p[0] + n[0] * H, die.p[1] + n[1] * H, die.p[2] + n[2] * H];
      if (dot(n, sub(CAM, centre)) <= 0) continue; // facing away
      faces.push({ f, n, depth: dot(sub(centre, CAM), FWD) });
    }
    faces.sort((a, b) => b.depth - a.depth);
    const top = die.settled ? topFace(die.q, S).value : 0;
    for (const { f, n } of faces) {
      const [ax, bx] = faceAxes(f.n);
      const local = (u, v) => turn(S, [f.n[0] * H + ax[0] * u + bx[0] * v, f.n[1] * H + ax[1] * u + bx[1] * v, f.n[2] * H + ax[2] * u + bx[2] * v]);
      const world = (l) => { const r = rotate(die.q, l); return [die.p[0] + r[0], die.p[1] + r[1], die.p[2] + r[2]]; };
      // Slightly rounded look: an inset face over a darker edge.
      const corners = [[-H, -H], [H, -H], [H, H], [-H, H]].map(([u, v]) => project(world(local(u, v))));
      const shade = 0.35 + 0.65 * Math.max(0, dot(n, LIGHT));
      ctx.fillStyle = `rgb(${Math.round(30 + 70 * shade)},${Math.round(40 + 82 * shade)},${Math.round(52 + 92 * shade)})`;
      poly(corners); ctx.fill();
      ctx.strokeStyle = `rgba(214,226,236,${(0.35 + 0.5 * shade).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      const inset = [[-H * 0.86, -H * 0.86], [H * 0.86, -H * 0.86], [H * 0.86, H * 0.86], [-H * 0.86, H * 0.86]].map(([u, v]) => project(world(local(u, v))));
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      poly(inset); ctx.stroke();
      // Pips, foreshortened with the face.
      const hot = top === f.value;
      const pipColour = hot ? `rgba(255,190,120,${(0.75 + 0.25 * glow).toFixed(3)})` : f.value === 1 ? '#ffad72' : '#81e6df';
      if (hot && !lite && glow > 0) { ctx.shadowColor = '#ffad72'; ctx.shadowBlur = 14 * glow; }
      for (const [u, v] of PIPS[f.value]) {
        const ring = [];
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          ring.push(project(world(local(u + Math.cos(a) * 0.085, v + Math.sin(a) * 0.085))));
        }
        ctx.fillStyle = pipColour;
        poly(ring); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }

  function draw() {
    if (!ctx) return;
    if (follow) {
      const k = reducedMotion() || die.settled ? 1 : 0.18;
      cam = [cam[0] + (die.p[0] - cam[0]) * k, cam[1] + (die.p[1] - cam[1]) * k];
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawTray();
    drawShadow();
    drawDie();
  }

  function finish() {
    const value = topFace(die.q, label).value;
    glow = 1;
    draw();
    const done = resolveRoll;
    resolveRoll = null;
    onSettle(value);
    done?.(value);
    // Let the glow fade (not with reduced motion).
    if (!reducedMotion() && ctx) {
      const start = performance.now();
      const fade = (t) => {
        if (!alive || resolveRoll) return;
        glow = Math.max(0.35, 1 - (t - start) / 900);
        draw();
        if (glow > 0.35) requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }
  }

  function loop(t) {
    frame = 0;
    if (!alive) return;
    const dt = Math.min(0.1, last ? (t - last) / 1000 : DIE.dt) * speed;
    last = t;
    acc += dt;
    while (acc >= DIE.dt && !die.settled) { step(die); acc -= DIE.dt; }
    draw();
    if (die.settled) { finish(); return; }
    frame = requestAnimationFrame(loop);
  }

  size();
  draw();
  const onResize = () => { size(); draw(); };
  addEventListener('resize', onResize);
  addEventListener('stardust:render-scale', onResize);

  return {
    /** Throw the die. Resolves with the face that lands on top (a STAT roll: the landed face is the roll). */
    roll(aim = null) {
      if (resolveRoll) return Promise.reject(new Error('already rolling'));
      die = throwDie(rng, aim);
      label = null;
      glow = 0;
      return new Promise((resolve) => {
        resolveRoll = resolve;
        if (reducedMotion() || !ctx) {
          settle(die);
          finish();
          return;
        }
        last = 0; acc = 0;
        frame = requestAnimationFrame(loop);
      });
    },
    /**
     * Show an ATTEMPT roll whose number is already decided (seeded game rules):
     * a real tumble, then the faces labelled so `value` lands on top. Resolves with value.
     */
    rollTo(value, aim = null) {
      if (resolveRoll) return Promise.reject(new Error('already rolling'));
      // Simulate the throw once on a recorded rng to see where it lands, label
      // the faces to match, then play the identical throw (same draws) on screen.
      const tape = [];
      const copy = throwDie(() => { const v = rng(); tape.push(v); return v; }, aim);
      settle(copy);
      label = labelFor(copy.q, value);
      let i = 0;
      die = throwDie(() => (i < tape.length ? tape[i++] : rng()), aim);
      glow = 0;
      return new Promise((resolve) => {
        resolveRoll = resolve;
        if (reducedMotion() || !ctx) { settle(die); finish(); return; }
        last = 0; acc = 0;
        frame = requestAnimationFrame(loop);
      });
    },
    /** Finish the current roll now (the player tapped to skip). */
    skip() { if (!resolveRoll) return; cancelAnimationFrame(frame); settle(die); finish(); },
    set timeScale(v) { speed = Math.max(0.25, Number(v) || 1); },
    /** Draw the die resting on a known face (a saved stat). */
    show(value) { die = restingOn(value); label = null; glow = 0.6; draw(); },
    get rolling() { return Boolean(resolveRoll); },
    get value() { return die.settled ? topFace(die.q, label).value : null; },
    get dpr() { return dpr; },
    get canDraw() { return Boolean(ctx); },
    destroy() {
      alive = false;
      cancelAnimationFrame(frame);
      removeEventListener('resize', onResize);
      removeEventListener('stardust:render-scale', onResize);
    },
  };
}

/** Andrew's monotone chain on screen points [x, y, ...]. */
function convexHull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** A crypto-backed rng for real throws (Math.random when crypto is missing). */
export function cryptoRng() {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) return Math.random;
  const buf = new Uint32Array(64);
  let i = buf.length;
  return () => {
    if (i >= buf.length) { c.getRandomValues(buf); i = 0; }
    return buf[i++] / 4294967296;
  };
}
