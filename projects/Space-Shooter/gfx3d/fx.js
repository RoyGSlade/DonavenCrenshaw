// Exhaust, pickups, boosts, rail sparks and explosions in 3D. Rendering only.
//
// Everything is particles in two pooled batches (typed arrays, drawn as camera
// facing quads in one instanced draw call each): an additive one for glow and
// sparks, a normal-blended one for smoke. Nothing is allocated per frame. The
// moments that trigger effects are spotted by watching the scene and pose
// (motion/fxWatch.js): a shard collected, the wreck appearing, a rail hit
// (stun onset), a boost firing, the launch.
//
// Contract (gfx3d/index.js):
//   createFx(THREE) -> { group, update(lv, pose, keys, time, dt), burst(kind, x, y, opts), dispose() }
// burst kinds: 'explosion', 'shard', 'sparks', 'boost', 'launch', 'puff'.
// x, y are sim cells; opts: { scale, dx, dy (a direction), color: [r, g, b] }.
import { createPool, spawn, stepPool, clearPool, ageFrac, lifeAlpha } from './motion/particlePool.js';
import { createWatch, watchFrame } from './motion/fxWatch.js';
import { shipInfo, portWorld } from './motion/shipInfo.js';
import { reducedMotion } from './motion/prefs.js';
import { clamp } from './motion/spring.js';

const GLOW_CAPACITY = 1800;
const SMOKE_CAPACITY = 320;
const RING_SLOTS = 6;

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec3 iParams;   // size, stretch, alpha
attribute vec3 iColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = position.xy;
  vColor = iColor;
  vAlpha = iParams.z;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float size = iParams.x;
  vec2 off = position.xy * size;
  if (iParams.y > 0.0) {
    vec2 dir = (viewMatrix * vec4(iVel, 0.0)).xy;
    float l = length(dir);
    if (l > 1e-4) {
      dir /= l;
      vec2 perp = vec2(-dir.y, dir.x);
      float along = size + iParams.y * length(iVel);
      off = dir * (position.x * along) + perp * (position.y * size);
    }
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(vUv);
  if (d >= 1.0) discard;
  float soft = 1.0 - d;
  float a = soft * soft + 0.35 * soft * soft * soft * soft;
  gl_FragColor = vec4(vColor, clamp(a * vAlpha, 0.0, 1.0));
}`;

/** One instanced batch of billboard particles over a pool. */
function createBatch(THREE, capacity, blending, renderOrder) {
  const pool = createPool(capacity);
  const base = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  const attrs = {
    pos: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    vel: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    params: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    color: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
  };
  for (const a of Object.values(attrs)) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', attrs.pos);
  geo.setAttribute('iVel', attrs.vel);
  geo.setAttribute('iParams', attrs.params);
  geo.setAttribute('iColor', attrs.color);
  geo.instanceCount = 0;
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending, toneMapped: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return {
    pool, mesh, geo, base,
    /** Copy the live particles into the instance buffers. */
    upload() {
      let n = 0;
      const p = pool, ap = attrs.pos.array, av = attrs.vel.array, aq = attrs.params.array, ac = attrs.color.array;
      for (let i = 0; i < capacity; i++) {
        if (p.life[i] <= 0) continue;
        const t = ageFrac(p, i);
        const o = n * 3;
        ap[o] = p.px[i]; ap[o + 1] = p.py[i]; ap[o + 2] = p.pz[i];
        av[o] = p.vx[i]; av[o + 1] = p.vy[i]; av[o + 2] = p.vz[i];
        aq[o] = p.size0[i] + (p.size1[i] - p.size0[i]) * t;
        aq[o + 1] = p.stretch[i];
        aq[o + 2] = lifeAlpha(t, p.alpha[i]);
        ac[o] = p.r0[i] + (p.r1[i] - p.r0[i]) * t;
        ac[o + 1] = p.g0[i] + (p.g1[i] - p.g0[i]) * t;
        ac[o + 2] = p.b0[i] + (p.b1[i] - p.b0[i]) * t;
        n++;
      }
      geo.instanceCount = n;
      for (const a of Object.values(attrs)) { a.clearUpdateRanges(); if (n) a.addUpdateRange(0, n * 3); a.needsUpdate = n > 0; }
      mesh.visible = n > 0;
      return n;
    },
    dispose() { geo.dispose(); base.dispose(); material.dispose(); },
  };
}

// Colours (display values, not linear).
const C = {
  white: [1, 1, 1],
  hot: [1, 0.93, 0.7],
  orange: [1, 0.55, 0.14],
  ember: [0.9, 0.2, 0.05],
  cyan: [0.5, 0.95, 1],
  blue: [0.1, 0.4, 1],
  teal: [0.2, 0.85, 0.8],
  smoke: [0.16, 0.17, 0.19],
  smokeEnd: [0.28, 0.29, 0.31],
};

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

export function createFx(THREE) {
  const group = new THREE.Group();
  group.name = 'stardust-fx';
  const glow = createBatch(THREE, GLOW_CAPACITY, THREE.AdditiveBlending, 20);
  const smoke = createBatch(THREE, SMOKE_CAPACITY, THREE.NormalBlending, 19);
  group.add(smoke.mesh, glow.mesh);

  // Expanding shock rings (flat on the track), a few reusable slots.
  const ringGeo = new THREE.RingGeometry(0.9, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < RING_SLOTS; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(ringGeo, material);
    mesh.visible = false;
    mesh.renderOrder = 18;
    group.add(mesh);
    rings.push({ mesh, t: 0, dur: 1, radius: 1, alpha: 1, live: false });
  }
  let ringNext = 0;
  function ring(x, y, height, color, radius, dur, alpha = 0.9) {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % RING_SLOTS;
    r.live = true; r.t = 0; r.dur = dur; r.radius = radius; r.alpha = alpha;
    r.mesh.position.set(x, height, y);
    r.mesh.material.color.setRGB(color[0], color[1], color[2]);
    r.mesh.scale.setScalar(0.05);
    r.mesh.material.opacity = alpha;
    r.mesh.visible = true;
  }
  function stepRings(dt) {
    for (const r of rings) {
      if (!r.live) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.live = false; r.mesh.visible = false; continue; }
      const e = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(Math.max(0.05, r.radius * e));
      r.mesh.material.opacity = r.alpha * (1 - k) * (1 - k);
    }
  }

  // --- spawning helpers (positional so nothing is allocated) ---------------
  const D = {};
  function put(batch, x, y, z, vx, vy, vz, life, s0, s1, c0, c1, alpha, drag, grav, stretch) {
    D.x = x; D.y = y; D.z = z; D.vx = vx; D.vy = vy; D.vz = vz; D.life = life;
    D.size0 = s0; D.size1 = s1;
    D.r0 = c0[0]; D.g0 = c0[1]; D.b0 = c0[2]; D.r1 = c1[0]; D.g1 = c1[1]; D.b1 = c1[2];
    D.alpha = alpha; D.drag = drag; D.grav = grav; D.stretch = stretch;
    spawn(batch.pool, D);
  }
  const hover = () => shipInfo.hover || 0.3;

  let reduced = false;
  const scaleN = (n) => Math.max(1, Math.round(n * (reduced ? 0.4 : 1)));

  function explosion(x, y, scale = 1, dx = 0, dy = 0) {
    const h = 0.25;
    put(glow, x, h, y, 0, 0, 0, 0.2, 1.4 * scale, 3.4 * scale, C.white, C.hot, 1, 0, 0, 0);
    put(glow, x, h, y, 0, 0, 0, 0.5, 1.0 * scale, 2.6 * scale, C.hot, C.ember, 0.8, 0, 0, 0);
    for (let i = 0; i < scaleN(26); i++) {
      const a = rand(0, TAU), s = rand(0.6, 5) * scale;
      put(glow, x, h, y, Math.cos(a) * s, rand(0.2, 2.2), Math.sin(a) * s, rand(0.5, 1.15), rand(0.35, 0.65) * scale, rand(0.9, 1.6) * scale, C.hot, C.ember, 0.75, 2.2, 0, 0);
    }
    for (let i = 0; i < scaleN(46); i++) {
      const a = rand(0, TAU), s = rand(4, 13) * scale;
      put(glow, x, h, y, Math.cos(a) * s, rand(0.5, 4), Math.sin(a) * s, rand(0.35, 0.95), 0.05 * scale, 0.02, C.white, C.orange, 1, 1.4, -3, 0.07);
    }
    for (let i = 0; i < scaleN(14); i++) {
      const a = rand(0, TAU), s = rand(3, 9) * scale;
      put(glow, x, h, y, Math.cos(a) * s, rand(1, 5), Math.sin(a) * s, rand(0.9, 1.5), 0.045 * scale, 0.03, C.hot, C.ember, 0.9, 0.8, -9, 0.05);
    }
    for (let i = 0; i < scaleN(18); i++) {
      const a = rand(0, TAU), s = rand(0.3, 2.2) * scale;
      put(smoke, x, h, y, Math.cos(a) * s, rand(0.3, 1.2), Math.sin(a) * s, rand(1.2, 2.3), rand(0.4, 0.7) * scale, rand(1.4, 2.2) * scale, C.smoke, C.smokeEnd, 0.5, 1.3, 0.3, 0);
    }
    ring(x, y, 0.06, C.hot, 5.5 * scale, 0.7, 0.9);
    ring(x, y, 0.07, C.orange, 3.2 * scale, 0.5, 0.7);
  }

  function shard(x, y) {
    const h = 0.3;
    put(glow, x, h, y, 0, 0, 0, 0.22, 0.5, 1.1, C.white, C.cyan, 1, 0, 0, 0);
    for (let i = 0; i < scaleN(20); i++) {
      const a = rand(0, TAU), s = rand(1.8, 5.5);
      put(glow, x, h, y, Math.cos(a) * s, rand(0, 1.5), Math.sin(a) * s, rand(0.4, 0.8), 0.07, 0.015, C.white, C.teal, 1, 2.4, 0, 0.09);
    }
    ring(x, y, 0.08, C.cyan, 1.7, 0.45, 0.85);
  }

  function sparks(x, y, dx, dy, scale = 1) {
    const base = Math.atan2(dy || 0, dx || 1);
    const h = shipInfo.hover || 0.3;
    for (let i = 0; i < scaleN(24); i++) {
      // A fan thrown back along where the ship is going now (it has just bounced off the rail), plus a few strays.
      const a = Math.random() < 0.8 ? base + rand(-1.1, 1.1) : rand(0, TAU), s = rand(2.5, 9) * scale;
      put(glow, x + Math.cos(a) * 0.2, h * 0.6, y + Math.sin(a) * 0.2, Math.cos(a) * s, rand(0, 1.2), Math.sin(a) * s, rand(0.22, 0.55), 0.045, 0.015, C.white, C.orange, 1, 2.2, -2, 0.06);
    }
    put(glow, x, h * 0.6, y, 0, 0, 0, 0.14, 0.4, 0.8, C.hot, C.orange, 0.9, 0, 0, 0);
  }

  function boost(x, y, dx, dy) {
    const h = hover();
    const hx = dx || 1, hy = dy || 0;
    const len = Math.hypot(hx, hy) || 1;
    const fx = hx / len, fy = hy / len, sx = -fy, sy = fx;
    put(glow, x - fx * 0.4, h, y - fy * 0.4, 0, 0, 0, 0.18, 0.5, 1.3, C.white, C.cyan, 0.9, 0, 0, 0);
    if (!reduced) {
      for (let i = 0; i < 18; i++) {
        const lateral = rand(-1.1, 1.1), back = rand(-0.1, -1.6);
        const s = rand(3, 7);
        put(glow, x + sx * lateral + fx * back, h * rand(0.3, 1), y + sy * lateral + fy * back, -fx * s, 0, -fy * s, rand(0.3, 0.6), 0.045, 0.02, C.white, C.blue, 0.9, 0.6, 0, 0.1);
      }
    }
    ring(x - fx * 0.5, y - fy * 0.5, 0.1, C.cyan, 2.1, 0.35, 0.7);
  }

  function puff(x, y, scale = 1, color = C.cyan) {
    for (let i = 0; i < scaleN(10); i++) {
      const a = rand(0, TAU), s = rand(0.5, 2) * scale;
      put(glow, x, hover(), y, Math.cos(a) * s, rand(0, 0.8), Math.sin(a) * s, rand(0.3, 0.6), 0.1 * scale, 0.02, C.white, color, 0.9, 2, 0, 0.04);
    }
  }

  function burstKind(kind, x, y, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const k = opts.scale ?? 1;
    switch (kind) {
      case 'explosion': explosion(x, y, k, opts.dx, opts.dy); break;
      case 'shard': shard(x, y); break;
      case 'sparks': sparks(x, y, opts.dx ?? 1, opts.dy ?? 0, k); break;
      case 'boost': boost(x, y, opts.dx ?? 1, opts.dy ?? 0); break;
      case 'launch': boost(x, y, opts.dx ?? 1, opts.dy ?? 0); puff(x, y, 1.4, C.orange); break;
      case 'puff': puff(x, y, k, opts.color || C.cyan); break;
      default: puff(x, y, k);
    }
  }

  // --- per-frame ----------------------------------------------------------
  const watch = createWatch();
  const portPos = { x: 0, y: 0 };
  const acc = { exhaust: 0, sparks: 0, wind: 0 };

  function emitExhaust(pose, dt) {
    const g = shipInfo.glow, b = shipInfo.boost;
    const rate = (g > 0.04 ? 60 * g : 0) + 200 * b;
    if (rate <= 0 || !shipInfo.active) { acc.exhaust = 0; return; }
    acc.exhaust += rate * dt * (reduced ? 0.5 : 1);
    const ports = shipInfo.ports.length;
    const vx = pose.vx || 0, vy = pose.vy || 0;
    const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
    const h = hover() + 0.045;
    while (acc.exhaust >= 1) {
      acc.exhaust -= 1;
      const i = Math.floor(Math.random() * ports);
      portWorld(pose, i, portPos);
      // Spread this frame's emissions along the path the ship just travelled.
      const back = Math.random() * dt;
      const speed = rand(2, 4.2) + 3.5 * g + 5 * b;
      const jx = rand(-0.25, 0.25), jz = rand(-0.25, 0.25);
      const boosting = b > 0.15;
      put(glow, portPos.x - vx * back, h + rand(-0.02, 0.03), portPos.y - vy * back,
        vx * 0.3 - c * speed + jx, rand(0, 0.25), vy * 0.3 - s * speed + jz,
        rand(0.28, 0.5) + (boosting ? 0.15 : 0), boosting ? 0.1 : 0.075, 0.02,
        boosting ? C.white : C.cyan, boosting ? C.cyan : C.blue, 0.8, 2.2, 0, 0.05);
    }
  }

  function emitStun(pose, dt) {
    if (!shipInfo.stunned || reduced) { acc.sparks = 0; return; }
    acc.sparks += 22 * dt;
    while (acc.sparks >= 1) {
      acc.sparks -= 1;
      const a = rand(0, TAU), s = rand(1, 3.5);
      put(glow, pose.x + Math.cos(a) * 0.3, hover() * 0.8, pose.y + Math.sin(a) * 0.3, Math.cos(a) * s, rand(0.2, 1), Math.sin(a) * s, rand(0.15, 0.35), 0.04, 0.01, C.hot, C.orange, 1, 2, 0, 0.05);
    }
  }

  function emitWind(pose, dt) {
    const speed = Math.hypot(pose.vx || 0, pose.vy || 0);
    if (reduced || speed < 8 || !shipInfo.active) { acc.wind = 0; return; }
    acc.wind += (speed - 7) * 2.6 * dt;
    const ux = pose.vx / speed, uy = pose.vy / speed;
    while (acc.wind >= 1) {
      acc.wind -= 1;
      const ahead = rand(-1, 7), side = rand(-4, 4);
      put(glow, pose.x + ux * ahead - uy * side, rand(0.05, 0.5), pose.y + uy * ahead + ux * side, -pose.vx * 0.55, 0, -pose.vy * 0.55, rand(0.25, 0.45), 0.03, 0.012, C.white, C.cyan, 0.22, 0.2, 0, 0.12);
    }
  }

  return {
    group,
    update(lv, pose, keys, time, dt) {
      if (!lv || !pose) return;
      reduced = reducedMotion(lv);
      const step = clamp(dt || 0, 0, 0.05);
      const n = watchFrame(watch, lv, pose);
      for (let i = 0; i < n; i++) {
        const e = watch.events[i];
        if (e.kind === 'explosion') burstKind('explosion', e.x, e.y, { scale: lv.wreck?.cause === 'fuel' ? 0.5 : 1 });
        else burstKind(e.kind, e.x, e.y, { dx: e.dx, dy: e.dy });
      }
      if (step > 0) {
        if (!lv.wreck) { emitExhaust(pose, step); emitStun(pose, step); emitWind(pose, step); }
        stepPool(glow.pool, step);
        stepPool(smoke.pool, step);
        stepRings(step);
      }
      glow.upload();
      smoke.upload();
    },
    burst(kind, x, y, opts) { reduced = reducedMotion(); burstKind(kind, x, y, opts); },
    /** Live particle counts, for the debug overlay and tests. */
    stats() { return { glow: glow.pool.alive, smoke: smoke.pool.alive, glowCapacity: GLOW_CAPACITY, smokeCapacity: SMOKE_CAPACITY }; },
    clear() { clearPool(glow.pool); clearPool(smoke.pool); for (const r of rings) { r.live = false; r.mesh.visible = false; } },
    dispose() {
      glow.dispose(); smoke.dispose(); ringGeo.dispose();
      for (const r of rings) r.mesh.material.dispose();
      group.removeFromParent();
    },
  };
}
