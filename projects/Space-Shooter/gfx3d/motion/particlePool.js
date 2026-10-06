// A fixed-size particle pool in typed arrays: no allocation after creation,
// no per-particle objects. The renderer (fx.js) reads the arrays directly.
// Pure (no three.js), so it tests in node.
export const POOL_FIELDS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'maxLife', 'size0', 'size1', 'r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'alpha', 'drag', 'grav', 'stretch'];

export function createPool(capacity) {
  const pool = { capacity, next: 0, alive: 0 };
  for (const f of POOL_FIELDS) pool[f] = new Float32Array(capacity);
  return pool;
}

/**
 * Spawn one particle. `d` is a scratch descriptor the caller reuses; any
 * missing field takes a default. When the pool is full the oldest slot in
 * ring order is overwritten, so a flood of effects never throws or grows.
 */
export function spawn(pool, d) {
  const i = pool.next;
  pool.next = (i + 1) % pool.capacity;
  const life = d.life > 0 ? d.life : 0.5;
  pool.px[i] = d.x || 0; pool.py[i] = d.y || 0; pool.pz[i] = d.z || 0;
  pool.vx[i] = d.vx || 0; pool.vy[i] = d.vy || 0; pool.vz[i] = d.vz || 0;
  pool.life[i] = life; pool.maxLife[i] = life;
  pool.size0[i] = d.size0 ?? 0.1; pool.size1[i] = d.size1 ?? 0;
  pool.r0[i] = d.r0 ?? 1; pool.g0[i] = d.g0 ?? 1; pool.b0[i] = d.b0 ?? 1;
  pool.r1[i] = d.r1 ?? pool.r0[i]; pool.g1[i] = d.g1 ?? pool.g0[i]; pool.b1[i] = d.b1 ?? pool.b0[i];
  pool.alpha[i] = d.alpha ?? 1;
  pool.drag[i] = d.drag ?? 0;       // 1/s velocity damping
  pool.grav[i] = d.grav ?? 0;       // world +Y acceleration (negative falls)
  pool.stretch[i] = d.stretch ?? 0; // >0: draw as a streak this many times the speed-length
  return i;
}

/** Age and move every live particle. Returns the live count. */
export function stepPool(pool, dt) {
  if (!(dt > 0)) return pool.alive;
  let alive = 0;
  for (let i = 0; i < pool.capacity; i++) {
    const life = pool.life[i];
    if (life <= 0) continue;
    const left = life - dt;
    pool.life[i] = left;
    if (left <= 0) continue;
    const k = pool.drag[i] > 0 ? Math.exp(-pool.drag[i] * dt) : 1;
    pool.vx[i] *= k; pool.vy[i] = (pool.vy[i] + pool.grav[i] * dt) * k; pool.vz[i] *= k;
    pool.px[i] += pool.vx[i] * dt; pool.py[i] += pool.vy[i] * dt; pool.pz[i] += pool.vz[i] * dt;
    alive++;
  }
  pool.alive = alive;
  return alive;
}

export function clearPool(pool) {
  pool.life.fill(0);
  pool.alive = 0;
  pool.next = 0;
}

/** 0 at birth, 1 at death. */
export const ageFrac = (pool, i) => 1 - pool.life[i] / pool.maxLife[i];

/** Opacity over a particle's life: a very short fade-in, then an ease-out to nothing. */
export function lifeAlpha(t, alpha = 1) {
  const fadeIn = t < 0.06 ? t / 0.06 : 1;
  const out = 1 - t;
  return alpha * fadeIn * out * out;
}
