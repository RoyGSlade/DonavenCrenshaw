// Free-aim top-down shooter basics (S47). Pure and deterministic: a fight is
// plain state, stepped at a fixed rate with the player's input. Walls and
// blocking props (crates, consoles) stop shots both ways, so cover is real.
//
//   const f = createFight({ map, spawn, enemies, player, seed, exit })
//   stepFight(f, { move: {x,y}, aim: angle|null, fire, dash }, dt)
//   fightResult(f) -> null | { outcome: 'win' | 'lose' | 'flee', hp }
//
// The quest engine's on-foot step (quests/parts/foot.js) gives the same three
// outcomes, so a live fight can stand in for the placeholder roll.
import { step as rngStep, hashSeed } from '../../quests/rng.js';
import { moveCircle, segRect, lineOfSight, clamp, wrapAngle, pointInRect } from './geom.js';
import { WALK } from './walk.js';
import TUNING from '../tuning.json' with { type: 'json' };

export const STEP = 1 / 60;

// Numbers live in ../tuning.json (Stardust Studio edits them); brains are code.
export const PLAYER_GUN = Object.freeze({ ...TUNING.sidearm });
export const DASH = Object.freeze({ ...TUNING.dash });

// Enemy kinds. art names a sprite in ../assets.js (the approved enemies pack).
// Brains: still (a practice target), rush (charges, hurts on contact),
// gunner (keeps a range band, strafes, shoots bursts, falls back to cover when
// hurt or reloading), turret (fixed, turns to track, fires when lined up).
export const BRAINS = Object.freeze(['still', 'rush', 'gunner', 'turret']);
export const ENEMY_TYPES = Object.freeze(TUNING.enemies);

const MAX_BULLETS = 120;

function rand(f) { const [v, next] = rngStep(f.rng >>> 0); f.rng = next; return v; }

/**
 * map: a compiled map (rules/mapdata.js). spawn: a spawn name or {x,y,angle}.
 * enemies: [{ type, x, y } | { type, at: [tx, ty] }]. player: { hp, damage, dashCooldown }.
 * exit: a zone id (or rect) the player can leave by (outcome flee), or null.
 */
export function createFight({ map, spawn = 'default', enemies = [], player = {}, seed = 1, exit = null }) {
  const s = typeof spawn === 'string' ? (map.spawns[spawn] || map.spawns.default) : spawn;
  const exitRect = typeof exit === 'string' ? map.zones.find(z => z.id === exit) || null : exit;
  const hp = Math.max(1, Math.round(player.hp ?? 60));
  return {
    map, t: 0, rng: hashSeed('foot', seed), exit: exitRect, exitHold: 0,
    player: { x: s.x, y: s.y, vx: 0, vy: 0, angle: s.angle ?? 0, hp, maxHp: hp, cool: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, iframes: 0, hit: 0,
      gun: { ...PLAYER_GUN, damage: player.damage ?? PLAYER_GUN.damage, spread: PLAYER_GUN.spread * (player.spreadScale ?? 1), rate: PLAYER_GUN.rate * (player.rateScale ?? 1) }, dashCooldown: player.dashCooldown ?? DASH.cooldown,
      speed: TUNING.footSpeed * (player.speedScale ?? 1), guard: player.guard ? 1 : 0, assist: Boolean(player.assist), shots: 0, hits: 0 },
    enemies: enemies.map((e, i) => spawnEnemy(e, i, map)),
    bullets: [], events: [], ended: null, kills: 0,
  };
}

function spawnEnemy(e, i, map) {
  const kind = ENEMY_TYPES[e.type];
  if (!kind) throw new Error(`Unknown enemy type ${e.type}`);
  const x = e.at ? (e.at[0] + 0.5) * map.tile : e.x, y = e.at ? (e.at[1] + 0.5) * map.tile : e.y;
  const hp = e.hp ?? kind.hp;
  return { id: i, type: e.type, kind, x, y, vx: 0, vy: 0, angle: e.angle ?? Math.PI / 2, hp, maxHp: hp, cool: 0.6 + i * 0.35, burst: 0, burstT: 0,
    state: 'engage', stateT: 0, hit: 0, touchCd: 0, strafe: i % 2 ? 1 : -1, alive: true, awake: kind.brain === 'still' || Boolean(e.awake) };
}

const solidsFor = f => f.map.solids;

function fire(f, x, y, angle, owner, { damage, speed, spread = 0, life = 1.2 }) {
  if (f.bullets.length >= MAX_BULLETS) return;
  const a = angle + (rand(f) - 0.5) * 2 * spread;
  f.bullets.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, owner, damage, life });
  f.events.push({ type: 'shot', owner, x, y, angle: a });
}

function hurtPlayer(f, amount, fromX, fromY) {
  const p = f.player;
  if (p.iframes > 0 || f.ended) return;
  if (p.guard > 0) { p.guard--; p.iframes = 0.3; f.events.push({ type: 'guard', x: p.x, y: p.y }); return; } // Constitution 6: the first hit is shrugged off
  p.hp = Math.max(0, p.hp - amount);
  p.hit = 0.15;
  const dx = p.x - fromX, dy = p.y - fromY, d = Math.hypot(dx, dy) || 1;
  p.vx += (dx / d) * 120; p.vy += (dy / d) * 120;
  f.events.push({ type: 'hit', target: 'player', x: p.x, y: p.y, amount });
}

function hurtEnemy(f, e, amount) {
  e.hp = Math.max(0, e.hp - amount);
  e.hit = 0.12;
  e.awake = true;
  f.player.hits++;
  f.events.push({ type: 'hit', target: 'enemy', id: e.id, x: e.x, y: e.y, amount });
  if (e.hp <= 0) { e.alive = false; f.kills++; f.events.push({ type: 'kill', id: e.id, enemy: e.type, x: e.x, y: e.y }); }
  else if (e.kind.brain === 'gunner' && e.hp < e.maxHp * 0.5 && e.state === 'engage') { e.state = 'cover'; e.stateT = 0; }
}

// The far side of the nearest cover piece from the player, or null.
function coverSpot(f, e) {
  const p = f.player;
  let best = null, bestD = Infinity;
  for (const s of solidsFor(f)) {
    if (s.wall && s.w > 4 * f.map.tile && s.h > 4 * f.map.tile) continue;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const d = Math.hypot(cx - e.x, cy - e.y);
    if (d > 320 || d >= bestD) continue;
    const ax = cx - p.x, ay = cy - p.y, al = Math.hypot(ax, ay) || 1;
    const off = Math.max(s.w, s.h) / 2 + e.kind.radius + 8;
    best = { x: cx + (ax / al) * off, y: cy + (ay / al) * off };
    bestD = d;
  }
  return best;
}

function seek(f, e, tx, ty, speed, dt) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 2) return d;
  const s = Math.min(speed * dt, d);
  moveCircle(e, (dx / d) * s, (dy / d) * s, e.kind.radius, solidsFor(f), f.map);
  return d;
}

function enemyThink(f, e, dt) {
  const p = f.player;
  const k = e.kind;
  e.hit = Math.max(0, e.hit - dt);
  e.touchCd = Math.max(0, e.touchCd - dt);
  e.stateT += dt;
  if (k.brain === 'still') return;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const sees = lineOfSight(e.x, e.y, p.x, p.y, solidsFor(f));
  if (!e.awake) { if ((sees && d < 420) || d < 160) e.awake = true; else return; }
  const aim = Math.atan2(dy, dx);

  if (k.brain === 'rush') {
    e.angle = aim;
    const weave = Math.sin(f.t * 5 + e.id) * 0.5;
    const nx = dx / d, ny = dy / d;
    seek(f, e, e.x + (nx - ny * weave) * 40, e.y + (ny + nx * weave) * 40, k.speed, dt);
    if (d < k.radius + WALK.radius + 3 && e.touchCd <= 0) { hurtPlayer(f, k.touch, e.x, e.y); e.touchCd = 0.7; const l = d; e.x -= (dx / l) * 18; e.y -= (dy / l) * 18; }
    return;
  }

  if (k.brain === 'turret') {
    e.angle += clamp(wrapAngle(aim - e.angle), -k.turn * dt, k.turn * dt);
    e.cool -= dt;
    if (sees && d < 520 && Math.abs(wrapAngle(aim - e.angle)) < 0.14 && e.cool <= 0) {
      fire(f, e.x + Math.cos(e.angle) * k.radius, e.y + Math.sin(e.angle) * k.radius, e.angle, 'enemy', { ...k.shot, life: 1.6 });
      e.cool = k.shot.rate;
    }
    return;
  }

  // gunner
  e.angle += clamp(wrapAngle(aim - e.angle), -6 * dt, 6 * dt);
  if (e.state === 'cover') {
    const spot = coverSpot(f, e);
    if (spot) seek(f, e, spot.x, spot.y, k.speed * 1.3, dt);
    if (e.stateT > 1.8) { e.state = 'engage'; e.stateT = 0; e.cool = Math.min(e.cool, 0.25); }
  } else {
    const [near, far] = k.range;
    const nx = dx / d, ny = dy / d;
    let mx = 0, my = 0;
    if (d > far || !sees) { mx = nx; my = ny; } else if (d < near) { mx = -nx; my = -ny; }
    if (e.stateT > 1.4 + (e.id % 3) * 0.4) { e.strafe *= -1; e.stateT = 0; }
    mx += -ny * e.strafe * 0.8; my += nx * e.strafe * 0.8;
    const ml = Math.hypot(mx, my) || 1;
    const before = { x: e.x, y: e.y };
    moveCircle(e, (mx / ml) * k.speed * dt, (my / ml) * k.speed * dt, k.radius, solidsFor(f), f.map);
    if (Math.hypot(e.x - before.x, e.y - before.y) < k.speed * dt * 0.2) e.strafe *= -1; // bumped into something
  }
  // Shooting: bursts with a gap, then a reload; reloading sends it to cover now and then.
  e.cool -= dt;
  if (e.burst > 0) {
    e.burstT -= dt;
    if (e.burstT <= 0) {
      if (sees) for (let i = 0; i < (k.shot.pellets || 1); i++) fire(f, e.x + Math.cos(e.angle) * k.radius, e.y + Math.sin(e.angle) * k.radius, e.angle, 'enemy', k.shot);
      e.burst--; e.burstT = k.shot.gap || 0;
      if (e.burst === 0) { e.cool = k.shot.rate; if (rand(f) < 0.35 && e.state === 'engage') { e.state = 'cover'; e.stateT = 0.6; } }
    }
  } else if (e.cool <= 0 && sees && d < k.range[1] + 120 && e.state === 'engage' && Math.abs(wrapAngle(aim - e.angle)) < 0.3) {
    e.burst = k.shot.burst; e.burstT = 0.18; // a short tell before the first shot
  }
}

function stepBullets(f, dt) {
  const p = f.player;
  const solids = solidsFor(f);
  for (const b of f.bullets) {
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    let tHit = 1, hitSolid = false;
    for (const s of solids) { const t = segRect(b.px, b.py, b.x, b.y, s); if (t !== null && t < tHit) { tHit = t; hitSolid = true; } }
    const targets = b.owner === 'player' ? f.enemies.filter(e => e.alive) : [p];
    let victim = null;
    for (const v of targets) {
      const r = v === p ? WALK.radius : v.kind.radius;
      const t = segCircle(b.px, b.py, b.x, b.y, v.x, v.y, r + 2);
      if (t !== null && t <= tHit) { tHit = t; victim = v; }
    }
    if (victim || hitSolid) {
      b.x = b.px + (b.x - b.px) * tHit; b.y = b.py + (b.y - b.py) * tHit;
      b.life = 0;
      if (victim === p) hurtPlayer(f, b.damage, b.px, b.py);
      else if (victim) hurtEnemy(f, victim, b.damage);
      else f.events.push({ type: 'spark', x: b.x, y: b.y });
    }
  }
  f.bullets = f.bullets.filter(b => b.life > 0);
}

function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return fx * fx + fy * fy <= r * r ? 0 : null;
  const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** One fixed step. input: { move: {x,y}, aim: angle | null, fire: bool, dash: bool (pressed this step) }. */
export function stepFight(f, input = {}, dt = STEP) {
  if (f.ended) return f;
  f.t += dt;
  const p = f.player;
  p.cool = Math.max(0, p.cool - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.hit = Math.max(0, p.hit - dt);
  const mv = input.move || { x: 0, y: 0 };
  if (input.dash && p.dashCd <= 0) {
    const ml = Math.hypot(mv.x, mv.y);
    const a = ml > 0.1 ? Math.atan2(mv.y, mv.x) : p.angle;
    p.dashX = Math.cos(a); p.dashY = Math.sin(a);
    p.dashT = DASH.time; p.dashCd = p.dashCooldown; p.iframes = DASH.iframes;
    f.events.push({ type: 'dash', x: p.x, y: p.y });
  }
  if (input.aim != null) p.angle = input.aim;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashX * DASH.speed; p.vy = p.dashY * DASH.speed;
    moveCircle(p, p.vx * dt, p.vy * dt, WALK.radius, solidsFor(f), f.map);
  } else {
    let ix = mv.x || 0, iy = mv.y || 0; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const speed = p.speed;
    const rate = 1600 * dt;
    const dvx = ix * speed - p.vx, dvy = iy * speed - p.vy, dv = Math.hypot(dvx, dvy);
    if (dv <= rate) { p.vx = ix * speed; p.vy = iy * speed; } else { p.vx += (dvx / dv) * rate; p.vy += (dvy / dv) * rate; }
    moveCircle(p, p.vx * dt, p.vy * dt, WALK.radius, solidsFor(f), f.map);
    if (input.aim == null && m > 0.2) p.angle = Math.atan2(iy, ix);
  }
  if (input.fire && p.cool <= 0) {
    let a = p.angle;
    if (p.assist) {
      // Dexterity 6: the sidearm pulls onto a target near the reticle (within about 9 degrees).
      let best = 0.16;
      for (const e of f.enemies) {
        if (!e.alive) continue;
        const d = Math.abs(wrapAngle(Math.atan2(e.y - p.y, e.x - p.x) - p.angle));
        if (d < best) { best = d; a = Math.atan2(e.y - p.y, e.x - p.x); }
      }
    }
    fire(f, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, 'player', p.gun);
    p.cool = p.gun.rate; p.shots++;
  }
  for (const e of f.enemies) if (e.alive) enemyThink(f, e, dt);
  stepBullets(f, dt);
  if (f.exit && pointInRect(p.x, p.y, f.exit)) f.exitHold += dt; else f.exitHold = 0;
  if (p.hp <= 0) f.ended = { outcome: 'lose', hp: 0 };
  else if (f.enemies.length && f.enemies.every(e => !e.alive)) f.ended = { outcome: 'win', hp: p.hp };
  else if (f.exit && f.exitHold >= 0.6) f.ended = { outcome: 'flee', hp: p.hp };
  return f;
}

export const fightResult = f => f.ended;

/**
 * The captain's on-foot numbers, from the stat effects table (ROUND2-CONTRACT
 * section 6): hp from foot.hp (Constitution, skills), damage from the fight
 * tag, dash cooldown from dodge, move speed from foot.speed and spread from
 * aim (Dexterity; multipliers clamp at 0.5). A 6 in Constitution adds the guard
 * boon (first hit shrugged off), a 6 in Dexterity the aim assist.
 */
export function footStats(character, { effect, skillBonus, mods = {} } = {}) {
  const fx = tag => (effect ? effect(character, tag) : 0);
  const hp = TUNING.footHp + fx('foot.hp');
  const fightBonus = skillBonus ? skillBonus(character, 'fight') : 0;
  const dodge = fx('dodge');
  return {
    hp: Math.max(30, Math.round(hp)),
    damage: PLAYER_GUN.damage + fightBonus * 2,
    // Skill levels change the sidearm itself (activityMods(c, 'foot')): steadier aim, faster follow-ups, quicker dashes.
    dashCooldown: Math.max(0.45, (DASH.cooldown - dodge * 0.12) * (1 + (mods.dash || 0))),
    rateScale: Math.max(0.5, 1 + (mods.rate || 0)),
    speedScale: Math.max(0.5, 1 + fx('foot.speed')),
    spreadScale: Math.max(0.2, (1 - fx('aim')) * (1 + (mods.spread || 0))),
    guard: character?.stats?.con === 6,
    assist: character?.stats?.dex === 6,
  };
}

/**
 * A live fight for a quest's on-foot step: turns the quest's rolled enemy
 * ({ name, hp }) into a few bodies on a map. Bigger hp means more of them.
 */
export function questFightSetup(enemy = {}, seed = 1) {
  const hp = Math.max(10, enemy.hp || 20);
  const name = String(enemy.name || '').toLowerCase();
  const pick = /drone|bot|machine/.test(name) ? ['drone', 'gundrone', 'drone', 'turret'] : /bug|crawler|swarm|creature/.test(name) ? ['bug', 'bug', 'bug', 'bug', 'bug'] : ['grunt', 'grunt', 'heavy', 'grunt'];
  const count = clamp(Math.round(hp / 15), 1, 4);
  const spots = [[13, 3], [15, 7], [12, 9], [16, 4], [14, 10]];
  return { map: 'moon-outpost', spawn: 'fight', exit: 'exit', seed, enemies: pick.slice(0, count).map((type, i) => ({ type, at: spots[i] })) };
}
