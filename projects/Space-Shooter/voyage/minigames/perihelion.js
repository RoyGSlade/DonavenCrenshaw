// The navigation minigame v2: PERIHELION (field verb: plot a burn). Donaven's Gemini AI Studio concept, rebuilt as a pure
// seeded model (see perihelionView.js for the canvas). A turn-based orbital puzzle on a 1000 x 680 arena:
//   PLAN   aim and thrust; the predicted arc is a dry run of the very same engine, so it is exact until you trim.
//   BURN   3.5 s live: the engine fires for the first `window` seconds; tap left or right to micro-trim (fuel and heat);
//          a ring closes on every gate and slingshot, and pressing it in the sweet spot pays a bonus.
// Gravity wells pull you in: their slingshot rings are the sweet ground and their cores hurt. Waypoints (standard, refuel,
// slipstream, unstable) come first, then the exit. Fuel, heat and hull are the three meters.
// Pure: no DOM, no clock, no Math.random. Every roll comes from the seed. The view sends setPlan(), launch(), advance(),
// trim(), pressMark(); the same calls drive the bot and the tests. Numbers come from setup.js (setupPerihelion).
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { buildFieldSector } from './perihelionField.js';

export const ARENA = Object.freeze({ w: 1000, h: 680 });
export const SHIP_R = 10;
export const BURN = 3.5;               // seconds per turn
export const DT = 1 / 60;
export const TICKS = Math.round(BURN / DT);
export const PHYS = Object.freeze({ accel: 105, trimImpulse: 42, trimFuel: 2, trimHeat: 5, trimGap: 0.18, fuelPerThrust: 0.22, slip: 1.55, wall: 8, overheatCap: 60, markTime: 0.85, sweet: [0.52, 0.94], markFuel: 5, refuel: 18, coastCool: 28 });
export const MARK_REACH = 54;          // a gate asks for the ring when the ship is this far outside its edge

const r1 = (n) => Math.round(n * 10) / 10;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Where a gate is at sector time t (a sine rail when it moves). */
export function gatePos(g, t) {
  if (!g.motion) return { x: g.x, y: g.y };
  const m = g.motion, a = (t / m.period) * Math.PI * 2 + (m.phase || 0), sn = Math.sin(a);
  return { x: m.ox + m.ax * sn, y: m.oy + m.ay * sn };
}
/** Is a pulsing gate open at sector time t (always when it does not pulse; never once collapsed)? */
export function gateOpen(g, t) {
  if (g.collapsed) return false;
  if (!g.pulse) return true;
  return (t % g.pulse) / g.pulse <= (g.open ?? 0.55);
}

/** The costs of a plan from the ship's state: effective thrust (hot engines are capped), fuel, heat, acceleration. */
export function planCosts(s, plan = s.plan) {
  const sh = s.ship;
  const thrust = Math.max(0, Math.min(100, plan.thrust, sh.overheated ? PHYS.overheatCap : 100));
  const fuel = r1(thrust * PHYS.fuelPerThrust * s.fuelFactor);
  const heat = thrust === 0 ? -PHYS.coastCool : Math.round(thrust * 0.14) - 6;
  const accel = (thrust / 100) * PHYS.accel * (sh.slip && thrust > 0 ? PHYS.slip : 1);
  return { thrust, fuel, heat, endHeat: Math.max(0, Math.min(100, sh.heat + heat)), accel, afford: fuel <= sh.fuel + 1e-9 };
}
/** The most thrust (a multiple of 5) the fuel in the tank pays for. */
export function maxThrust(s) {
  let t = s.ship.overheated ? PHYS.overheatCap : 100;
  while (t > 0 && planCosts(s, { thrust: t }).fuel > s.ship.fuel + 1e-9) t -= 5;
  return t;
}

/**
 * Build a game. `sector` is a trainer sector (perihelionData.js) or a field sector (perihelionField.js); without one a field
 * sector is drawn from the seed (no solvability check here: perihelionEntry.js adds it). `setup` is setupPerihelion().
 */
export function createPerihelion({ seed = 1, setup = {}, sector = null, mode } = {}) {
  const sec = sector || buildFieldSector(seed, setup, 0);
  const m = mode || (sector && sector.number ? 'trainer' : 'field');
  const sh = sec.ship;
  const s = {
    seed, mode: m, sector: sec, name: sec.name, briefing: sec.briefing,
    // Points change these; the trainer reads the sector's own turn limit, plus the same spare turns.
    maxTurns: sec.maxTurns != null ? sec.maxTurns + ((setup.turns ?? 5) - 5) : setup.turns ?? 5,
    parTurns: sec.parTurns ?? 3, parFuel: sec.parFuel ?? 46,
    window: setup.window ?? 1.4, fuelFactor: setup.fuelFactor ?? 1, arc: setup.arc ?? 0.6, warn: setup.warn ?? 0.5, scan: !!setup.scan,
    meteorEvery: sec.meteorEvery ?? setup.meteorEvery ?? 0,
    setup,
    turn: 1, clock: 0, phase: 'plan',
    ship: { x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy, fuel: sh.fuel, maxFuel: sh.maxFuel, heat: 10, hull: sh.hull, maxHull: sh.hull, overheated: false, slip: false },
    startFuel: sh.fuel, fuelSpent: 0, perfect: 0, trims: 0, trimFuel: 0,
    wells: sec.wells, fog: sec.fog.map((f) => ({ ...f, revealed: !!setup.scan })),
    gates: sec.gates.map((g) => ({ ...g, ...gatePos(g, 0), cleared: false, collapsed: false })),
    asteroids: sec.asteroids.map((a) => ({ ...a })),
    flares: sec.flares.map((f) => ({ ...f })),
    meteors: [], burn: null, trail: [], events: [], done: false, result: null,
    plan: { angle: 0, thrust: 50 },
  };
  s.plan.angle = aimAtNext(s);
  s.plan.thrust = Math.min(50, maxThrust(s));
  return s;
}

/** The angle from the ship to the next thing to clear (a required waypoint, else the exit). */
export function aimAtNext(s) {
  const g = nextGate(s, 1.75);
  return g ? Math.atan2(g.y - s.ship.y, g.x - s.ship.x) : 0;
}
/** The gate the ship should go for now, positioned `ahead` seconds from now. Required waypoints come first. */
export function nextGate(s, ahead = 0) {
  const need = s.gates.filter((g) => g.kind === 'waypoint' && g.required !== false && !g.cleared && !g.collapsed);
  const pool = need.length ? need : s.gates.filter((g) => g.kind === 'exit');
  const g = pool[0];
  return g ? { ...g, ...gatePos(g, s.clock + ahead) } : null;
}
/** Hidden things (in the fog) are optional waypoints and asteroids inside an unrevealed fog zone. */
export function hiddenBy(s, e) {
  if (e.kind === 'exit' || e.required !== false && e.kind === 'waypoint') return null;
  return s.fog.find((f) => !f.revealed && dist(e.x, e.y, f.x, f.y) <= f.r) || null;
}
export function isHidden(s, e) { return !!hiddenBy(s, e); }

/** Copy the parts a burn changes (the wells and fog never change during a burn). */
export function cloneSim(s) {
  return {
    ...s, ship: { ...s.ship }, plan: { ...s.plan },
    gates: s.gates.map((g) => ({ ...g })), asteroids: s.asteroids.map((a) => ({ ...a })), flares: s.flares.map((f) => ({ ...f })),
    meteors: s.meteors.map((m) => ({ ...m })), fog: s.fog.map((f) => ({ ...f })),
    burn: s.burn ? { ...s.burn, markKeys: new Set(s.burn.markKeys), mark: s.burn.mark ? { ...s.burn.mark } : null } : null,
    trail: [], events: [], result: null,
  };
}

export function setPlan(s, { angle = s.plan.angle, thrust = s.plan.thrust } = {}) {
  if (s.phase !== 'plan') return false;
  let a = Number(angle); if (!Number.isFinite(a)) a = s.plan.angle;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  const t = Math.max(0, Math.min(maxThrust(s), Math.round((Number(thrust) || 0) / 5) * 5));
  s.plan = { angle: a, thrust: t };
  return true;
}

/** Shards for this burn, aimed at where the planned path will be (a dry run without shards), with a lateral miss of +/-30. */
function spawnMeteors(s, plan) {
  s.meteors = [];
  const ev = s.meteorEvery;
  if (!ev || s.turn < 2 || s.turn % ev !== 0) return;
  const ghost = cloneSim(s); ghost.meteors = []; ghost.noTrail = true;
  const path = dryPath(ghost, plan);
  let rng = hashSeed('peri-shard', s.seed, s.turn);
  const rand = () => { const [v, n] = rngStep(rng); rng = n; return v; };
  const t0 = 0.15 + rand() * 0.9, hit = t0 + s.warn + 0.9;
  const k = Math.min(path.length - 1, Math.round(hit / DT));
  const target = path[k] || path[path.length - 1];
  const a = rand() * Math.PI * 2, speed = 260 + rand() * 60;
  const dx = Math.cos(a), dy = Math.sin(a), miss = (rand() * 2 - 1) * 30;
  const tx = target.x - dy * miss, ty = target.y + dx * miss;
  s.meteors.push({ id: `shard-${s.turn}`, x0: tx - dx * speed * 0.9, y0: ty - dy * speed * 0.9, x: tx - dx * speed * 0.9, y: ty - dy * speed * 0.9, vx: dx * speed, vy: dy * speed, r: 8, t0, warn: s.warn, active: false, spent: false });
}
function dryPath(c, plan) {
  begin(c, plan, true);
  const pts = [{ x: c.ship.x, y: c.ship.y }];
  while (c.phase === 'burn') { tick(c); pts.push({ x: c.ship.x, y: c.ship.y }); }
  return pts;
}

function begin(s, plan, quiet) {
  if (!quiet) spawnMeteors(s, { angle: plan.angle, thrust: planCosts(s, plan).thrust });
  const c = planCosts(s, plan);
  s.plan = { angle: plan.angle, thrust: c.thrust };
  s.ship.fuel = Math.max(0, s.ship.fuel - c.fuel);
  s.fuelSpent += c.fuel;
  s.burn = { t: 0, acc: 0, accel: c.accel, heat: c.heat, window: s.window, lastTrim: -1, hitCd: 0, mark: null, markKeys: new Set(), markGate: null, fuel: c.fuel };
  if (s.ship.slip && c.thrust > 0) s.ship.slip = false;
  s.phase = 'burn';
  if (!quiet) { s.trail = [{ x: s.ship.x, y: s.ship.y }]; s.events.push({ type: 'launch', x: s.ship.x, y: s.ship.y, t: 0 }); }
  return c;
}

/** Start the live burn with the current plan. Returns false when it cannot start. */
export function launch(s) {
  if (s.done || s.phase !== 'plan') return false;
  if (!planCosts(s).afford) return false;
  begin(s, s.plan, false);
  return true;
}

function emit(s, type, extra) { s.events.push({ type, t: s.burn ? s.burn.t : 0, ...extra }); }

function hurt(s, amount, label, x, y) {
  s.ship.hull -= amount;
  emit(s, 'hurt', { label, hull: s.ship.hull, x, y });
}

/** One 1/60 s step of the live burn. The only place the world changes; prediction and the bot call it too. */
export function tick(s) {
  const b = s.burn, sh = s.ship;
  b.t += DT; s.clock += DT;
  if (b.hitCd > 0) b.hitCd -= DT;
  // 1. gravity and thrust
  let ax = 0, ay = 0, inCore = null, sling = null;
  for (const w of s.wells) {
    const dx = w.x - sh.x, dy = w.y - sh.y, d = Math.hypot(dx, dy);
    if (d <= w.core + SHIP_R) inCore = w;
    if (d <= w.sling && d > w.core + SHIP_R) sling = w;
    if (d < w.reach && d > 1) { const f = w.strength / Math.max(d * d, (w.core * 0.95) ** 2); ax += (dx / d) * f; ay += (dy / d) * f; }
  }
  if (b.t <= b.window) { ax += Math.cos(s.plan.angle) * b.accel; ay += Math.sin(s.plan.angle) * b.accel; }
  sh.vx += ax * DT; sh.vy += ay * DT; sh.x += sh.vx * DT; sh.y += sh.vy * DT;
  if (!s.noTrail && Math.round(b.t * 60) % 4 === 0) { s.trail.push({ x: sh.x, y: sh.y }); if (s.trail.length > 260) s.trail.shift(); }
  // fog gives up what it hides when you fly into it
  for (const f of s.fog) if (!f.revealed && dist(sh.x, sh.y, f.x, f.y) < f.r * 0.55) { f.revealed = true; emit(s, 'scan', { x: f.x, y: f.y, label: f.hint }); }
  // 2. the world moves
  for (const a of s.asteroids) {
    a.x += a.vx * DT; a.y += a.vy * DT;
    const m = 24 + a.r;
    if (a.x < m) { a.x = m; a.vx = Math.abs(a.vx); } else if (a.x > ARENA.w - m) { a.x = ARENA.w - m; a.vx = -Math.abs(a.vx); }
    if (a.y < m) { a.y = m; a.vy = Math.abs(a.vy); } else if (a.y > ARENA.h - m) { a.y = ARENA.h - m; a.vy = -Math.abs(a.vy); }
  }
  for (const f of s.flares) f.angle += f.spin * DT;
  for (const g of s.gates) if (g.motion) { const p = gatePos(g, s.clock); g.x = p.x; g.y = p.y; }
  for (const m of s.meteors) {
    if (!m.active && b.t >= m.t0 + m.warn) { m.active = true; emit(s, 'shard', { x: m.x, y: m.y }); }
    if (m.active && !m.spent) { m.x += m.vx * DT; m.y += m.vy * DT; }
  }
  // 3. the wall: a bounce that costs hull
  let grazed = false;
  const lo = SHIP_R + PHYS.wall, hiX = ARENA.w - lo, hiY = ARENA.h - lo;
  if (sh.x < lo) { sh.x = lo; sh.vx = Math.abs(sh.vx) * 0.65; grazed = true; } else if (sh.x > hiX) { sh.x = hiX; sh.vx = -Math.abs(sh.vx) * 0.65; grazed = true; }
  if (sh.y < lo) { sh.y = lo; sh.vy = Math.abs(sh.vy) * 0.65; grazed = true; } else if (sh.y > hiY) { sh.y = hiY; sh.vy = -Math.abs(sh.vy) * 0.65; grazed = true; }
  if (grazed && b.hitCd <= 0) { b.hitCd = 0.65; hurt(s, 1, 'WALL', sh.x, sh.y); }
  // 4. hazards
  if (b.hitCd <= 0) {
    if (inCore) {
      b.hitCd = 0.85;
      const w = inCore, a = Math.atan2(sh.y - w.y, sh.x - w.x);
      sh.x = w.x + Math.cos(a) * (w.core + SHIP_R + 8); sh.y = w.y + Math.sin(a) * (w.core + SHIP_R + 8);
      sh.vx = Math.cos(a) * 85; sh.vy = Math.sin(a) * 85;
      hurt(s, 2, 'CORE', sh.x, sh.y);
    } else {
      let label = null;
      for (const a of s.asteroids) if (dist(sh.x, sh.y, a.x, a.y) <= a.r + SHIP_R) { label = 'ROCK'; break; }
      if (!label) for (const f of s.flares) if (flareHits(sh.x, sh.y, f)) { label = 'FLARE'; sh.heat = Math.min(100, sh.heat + 20); break; }
      if (label) { b.hitCd = 0.75; hurt(s, 1, label, sh.x, sh.y); }
    }
  }
  // Shards have their own cooldown, so they can cost hull but never change where the ship goes (the arc stays exact).
  for (const m of s.meteors) if (m.active && !m.spent && dist(sh.x, sh.y, m.x, m.y) <= m.r + SHIP_R) { m.spent = true; hurt(s, 1, 'SHARD', sh.x, sh.y); break; }
  if (sh.hull <= 0) return finish(s, 'hull');
  // 5. the ring
  if (b.mark) {
    b.mark.progress += DT / PHYS.markTime;
    if (b.mark.progress >= 1) { emit(s, 'mark-lost', { x: sh.x, y: sh.y }); b.mark = null; }
  } else {
    const need = s.gates.some((g) => g.kind === 'waypoint' && g.required !== false && !g.cleared && !g.collapsed);
    for (const g of s.gates) {
      if (g.cleared || g.collapsed || (g.kind === 'exit' && need)) continue;
      const key = `gate-${g.id}`;
      if (!b.markKeys.has(key) && dist(sh.x, sh.y, g.x, g.y) <= g.r + MARK_REACH) {
        b.markKeys.add(key); b.mark = { type: 'gate', id: g.id, label: g.label, progress: 0 };
        emit(s, 'mark', { x: g.x, y: g.y, label: g.label }); break;
      }
    }
    if (!b.mark && sling) {
      const key = `sling-${sling.id}`;
      if (!b.markKeys.has(key)) { b.markKeys.add(key); b.mark = { type: 'sling', id: sling.id, label: 'SLINGSHOT APEX', progress: 0 }; emit(s, 'mark', { x: sling.x, y: sling.y, label: 'SLINGSHOT APEX' }); }
    }
  }
  // 6. gates
  const speed = Math.hypot(sh.vx, sh.vy);
  const waiting = s.gates.some((g) => g.kind === 'waypoint' && g.required !== false && !g.cleared && !g.collapsed);
  let won = false;
  for (const g of s.gates) {
    if (g.cleared || g.collapsed || (g.kind === 'exit' && waiting)) continue;
    const reach = g.r + (b.markGate === g.id ? 10 : 0);
    if (dist(sh.x, sh.y, g.x, g.y) <= reach && gateOpen(g, s.clock)) {
      g.cleared = true;
      if (g.kind === 'exit') { won = true; emit(s, 'gate', { id: g.id, label: g.label, x: g.x, y: g.y, mod: g.mod }); break; }
      if (g.mod === 'refuel') {
        const cap = (g.cap ?? 170) + (b.markGate === g.id ? 25 : 0);
        if (speed <= cap) { sh.fuel = Math.min(sh.maxFuel, sh.fuel + PHYS.refuel); emit(s, 'gate', { id: g.id, label: g.label, x: g.x, y: g.y, mod: 'refuel', note: `+${PHYS.refuel} FUEL` }); }
        else emit(s, 'gate', { id: g.id, label: g.label, x: g.x, y: g.y, mod: 'refuel', note: 'TOO FAST FOR THE TANKER' });
      } else if (g.mod === 'unstable') { sh.fuel = Math.min(sh.maxFuel, sh.fuel + PHYS.refuel); emit(s, 'gate', { id: g.id, label: g.label, x: g.x, y: g.y, mod: 'unstable', note: `+${PHYS.refuel} FUEL` }); }
      else if (g.mod === 'slipstream') { sh.slip = true; emit(s, 'gate', { id: g.id, label: g.label, x: g.x, y: g.y, mod: 'slipstream', note: 'SLIPSTREAM +55%' }); }
      else emit(s, 'gate', { id: g.id, label: g.label, x: g.x, y: g.y, mod: g.mod });
    }
  }
  if (won) return finish(s, 'exit');
  if (b.t >= BURN - 1e-9) endBurn(s);
}

function flareHits(x, y, f) {
  const ex = f.x + Math.cos(f.angle) * f.length, ey = f.y + Math.sin(f.angle) * f.length;
  const dx = ex - f.x, dy = ey - f.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - f.x) * dx + (y - f.y) * dy) / l2)) : 0;
  return dist(x, y, f.x + t * dx, f.y + t * dy) <= f.width * 0.5 + SHIP_R;
}

function endBurn(s) {
  const sh = s.ship, b = s.burn;
  sh.heat = Math.max(0, Math.min(100, sh.heat + b.heat));
  if (sh.heat >= 100) sh.overheated = true; else if (sh.heat <= 75) sh.overheated = false;
  for (const g of s.gates) if (g.mod === 'unstable' && !g.cleared && !g.collapsed && g.expires != null && s.turn >= g.expires) { g.collapsed = true; emit(s, 'collapse', { id: g.id, x: g.x, y: g.y, label: g.label }); }
  s.meteors = []; s.burn = null;
  emit(s, 'turn', { turn: s.turn });
  if (s.turn >= s.maxTurns) { s.turn++; return finish(s, 'turns'); }
  s.turn++; s.phase = 'plan';
  s.plan.thrust = Math.min(s.plan.thrust, maxThrust(s));
  s.plan.angle = aimAtNext(s);
}

/** Give up the sector (a stranded ship, or a player who has had enough). */
export function abandon(s) { if (!s.done) finish(s, 'gave-up'); }

/** Advance the live burn by real seconds (the view calls this each frame). Returns the events since the last call. */
export function advance(s, seconds) {
  if (s.phase !== 'burn') return drain(s);
  s.burn.acc += seconds;
  while (s.burn && s.burn.acc >= DT && s.phase === 'burn') { s.burn.acc -= DT; tick(s); }
  return drain(s);
}
/** Run the whole burn at once (tests and the bot; no trims, no marks). */
export function runBurn(s) { while (s.phase === 'burn') tick(s); return drain(s); }
function drain(s) { const e = s.events; s.events = []; return e; }

/** Micro-trim: a sideways kick relative to the heading. dir -1 steers left of the heading, +1 right. */
export function trim(s, dir) {
  const b = s.burn, sh = s.ship;
  if (s.phase !== 'burn' || !b) return 'no';
  if (sh.overheated) { emit(s, 'locked', { x: sh.x, y: sh.y, label: 'THERMAL LOCKOUT' }); return 'hot'; }
  if (b.t - b.lastTrim < PHYS.trimGap) return 'wait';
  const cost = PHYS.trimFuel * s.fuelFactor;
  if (sh.fuel < cost - 1e-9) { emit(s, 'locked', { x: sh.x, y: sh.y, label: 'NO TRIM FUEL' }); return 'dry'; }
  const spd = Math.hypot(sh.vx, sh.vy), head = spd > 2 ? Math.atan2(sh.vy, sh.vx) : s.plan.angle;
  const a = head + (dir < 0 ? -Math.PI / 2 : Math.PI / 2);
  sh.vx += Math.cos(a) * PHYS.trimImpulse; sh.vy += Math.sin(a) * PHYS.trimImpulse;
  sh.fuel -= cost; s.fuelSpent += cost; s.trimFuel += cost; s.trims++;
  sh.heat = Math.min(100, sh.heat + PHYS.trimHeat);
  if (sh.heat >= 100) sh.overheated = true;
  b.lastTrim = b.t;
  emit(s, 'trim', { dir: dir < 0 ? -1 : 1, x: sh.x, y: sh.y });
  return 'ok';
}

/** Press the closing ring. In the sweet spot it pays fuel and cools you; a slingshot also adds 20% speed, a gate gets wider. */
export function pressMark(s) {
  const b = s.burn, sh = s.ship;
  if (s.phase !== 'burn' || !b || !b.mark) return 'no';
  const m = b.mark, p = m.progress, good = p >= PHYS.sweet[0] && p <= PHYS.sweet[1];
  b.mark = null;
  if (!good) { emit(s, 'mark-miss', { x: sh.x, y: sh.y, label: 'OFF THE MARK' }); return 'miss'; }
  s.perfect++;
  sh.fuel = Math.min(sh.maxFuel, sh.fuel + PHYS.markFuel); s.fuelSpent = Math.max(0, s.fuelSpent - PHYS.markFuel);
  sh.heat = Math.max(0, sh.heat - 8);
  if (m.type === 'sling') { sh.vx *= 1.2; sh.vy *= 1.2; } else b.markGate = m.id;
  emit(s, 'mark-perfect', { x: sh.x, y: sh.y, kind: m.type, label: m.type === 'sling' ? 'SLINGSHOT +20% SPEED' : 'ON THE MARK' });
  return 'perfect';
}

/** What the plan does, as a dry run of the real engine without shards (they are a surprise). Positions every 3 ticks. */
export function predict(s, plan = s.plan) {
  const c = cloneSim(s);
  c.noTrail = true; c.meteors = [];
  const hull0 = c.ship.hull, cost = begin(c, plan, true);
  const pts = [{ t: 0, x: c.ship.x, y: c.ship.y, vx: c.ship.vx, vy: c.ship.vy, risk: 0 }];
  const hits = [], gates = [], sling = new Set();
  let n = 0, risk = 0;
  while (c.phase === 'burn') {
    tick(c); n++;
    for (const w of c.wells) if (dist(c.ship.x, c.ship.y, w.x, w.y) <= w.sling && dist(c.ship.x, c.ship.y, w.x, w.y) > w.core + SHIP_R) sling.add(w.id);
    for (const e of c.events) { if (e.type === 'hurt') { hits.push({ t: n * DT, label: e.label, x: e.x, y: e.y }); risk = 1; } else if (e.type === 'gate') gates.push({ t: n * DT, id: e.id, mod: e.mod, x: e.x, y: e.y }); }
    c.events = [];
    if (n % 3 === 0 || c.phase !== 'burn') { pts.push({ t: n * DT, x: c.ship.x, y: c.ship.y, vx: c.ship.vx, vy: c.ship.vy, risk }); risk = 0; }
  }
  const unknown = hits.some((h) => h.label === 'ROCK' && c.asteroids.some((a) => isHiddenAst(s, a)));
  return {
    points: pts, fuel: cost.fuel, heat: cost.heat, endHeat: cost.endHeat, thrust: cost.thrust, afford: cost.afford,
    hullLoss: Math.max(0, hull0 - c.ship.hull), hits, gates, slingshots: [...sling], win: c.done && c.result?.success === true,
    end: { x: c.ship.x, y: c.ship.y, vx: c.ship.vx, vy: c.ship.vy },
    ghosts: { asteroids: c.asteroids.map((a) => ({ id: a.id, x: a.x, y: a.y, r: a.r })), gates: c.gates.filter((g) => g.motion && !g.cleared && !g.collapsed).map((g) => ({ id: g.id, x: g.x, y: g.y, r: g.r })) },
    unknown,
  };
}
/** The rest of a live burn if you stop trimming now (a dry run from this instant): positions every 4 ticks. Bends when you trim. */
export function predictRemaining(s) {
  if (s.phase !== 'burn') return [];
  const c = cloneSim(s); c.noTrail = true;
  const pts = [{ x: c.ship.x, y: c.ship.y }];
  let n = 0;
  while (c.phase === 'burn' && n < TICKS + 2) { tick(c); n++; if (n % 4 === 0 || c.phase !== 'burn') pts.push({ x: c.ship.x, y: c.ship.y }); }
  return pts;
}
function isHiddenAst(s, a) { const f = s.fog.find((z) => !z.revealed && dist(a.x, a.y, z.x, z.y) <= z.r); return !!f; }

/** Stars: 1 for getting through, +1 inside the par turns, +1 inside the par fuel. */
export const starsFor = (s) => 1 + (s.turn <= s.parTurns ? 1 : 0) + (s.fuelSpent <= s.parFuel ? 1 : 0);
/** Placeholder field XP, same shape as the old nav: 4, +1 per star above one, +1 with the hull whole; none for a lost run. */
export const periXp = (r) => (r?.success ? (r.mode === 'trainer' ? 2 * r.stars : 4 + (r.stars - 1) + (r.hullLost === 0 ? 1 : 0)) : 0);

const WORDS = { exit: 'Through the exit gate.', hull: 'The hull gave out.', turns: 'Out of turns before the exit.', 'gave-up': 'You called the burn off.' };
export const WHY = WORDS;

function finish(s, how) {
  if (s.done) return;
  const success = how === 'exit';
  s.done = true; s.phase = 'done'; s.burn = null;
  const turns = success ? s.turn : Math.min(s.turn, s.maxTurns);
  const res = {
    success, how, mode: s.mode, sector: s.sector.id, name: s.name,
    stars: success ? starsFor(s) : 0, turns, maxTurns: s.maxTurns, parTurns: s.parTurns, parFuel: s.parFuel,
    fuelUsed: r1(s.fuelSpent), fuelLeft: r1(s.ship.fuel), fuelStart: s.startFuel, fuelSaved: r1(s.fuelSpent / s.fuelFactor - s.fuelSpent),
    hullLeft: Math.max(0, s.ship.hull), hullLost: s.ship.maxHull - Math.max(0, s.ship.hull), heat: Math.round(s.ship.heat),
    marks: s.perfect, trims: s.trims, xp: 0,
  };
  res.xp = periXp(res);
  s.result = res;
  s.events.push({ type: 'done', ...res });
}
