// The weekly time trial's simulation: one fixed step at a time, driven only by
// a quantised input frame. No DOM, no clock, no Math.random, no global game
// state, so the live game, the ghost replayer and node tests run the very same
// steps and a recorded run replays to the same finish time.
//
// The race clock is the step count: the first step is the launch, and a
// finish is timed to the fraction of the step where the ship crossed the line.
import { FLIGHT_CONFIG, advanceFlight, rechargeBoost } from "../systems/flight.js";
import { WEAPON_CONFIG, fireWeapon, coolWeapon, projectileFrom } from "../systems/weapons.js";
import { constrainToTrack, createTrackProgress, updateTrackProgress, isLapReady, isInsideTrack, portalCoordinates } from "../track.js";
import { damagePlayer, predictAim, segmentHitsCircle } from "../systems/environment.js";
import { PLAYER_HULL, shipTouchesCircle, pushShipOutOfCircle, shotHitsShip } from "../hull.js";
import { WEEKLY_LEVEL, WEEKLY_RULES as R, bouncerPosition } from "./layout.js";

// Frozen rules: the playtest lab never changes a weekly run.
export const WEEKLY_CONFIG = Object.freeze({ ...FLIGHT_CONFIG, ...WEAPON_CONFIG, MAX_HP: 100, MAX_TANK: 100 });

// Physics versions. A recorded run replays under the rules it was flown with
// (replay.js picks the version from the log's prefix), so changing how the
// ship collides never changes a time already on the board.
//  1 (SDW1 logs): the ship is a circle of WEEKLY_CONFIG.PLAYER_RADIUS for
//    rails, rocks, mines and shots; shards within SHARD_PICKUP of its centre.
//  2 (SDW2 logs): the ship is its real body (engine/shipHull.js) for rails,
//    rocks, mines and shots; a shard is collected when the body touches the
//    drawn shard (SHARD_TOUCH) or, as before, within SHARD_PICKUP of centre.
export const WEEKLY_PHYSICS = Object.freeze({ CIRCLE: 1, HULL: 2, CURRENT: 2 });
const physicsOf = (scene) => (scene.physics === WEEKLY_PHYSICS.CIRCLE ? WEEKLY_PHYSICS.CIRCLE : WEEKLY_PHYSICS.HULL);

// Input frame bits.
export const BIT = Object.freeze({ LEFT: 1, RIGHT: 2, BOOST: 4, BRAKE: 8, SHOOT: 16, STRAFE_L: 32, STRAFE_R: 64, LAUNCH: 128 });
const NEUTRAL = Object.freeze({ turn: 0, thrust: 0, back: 0, strafe: 0, bits: 0 });

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
// Analog inputs are quantised (steering to 2%, throttles to 5%) before they
// reach the physics, live and in replays alike, which keeps logs small.
const snap = (v, step, lo, hi) => clampInt(Math.round((Number(v) || 0) / step) * step, lo, hi);

/** Any frame to its canonical quantised form. */
export function quantizeFrame(f) {
  return { turn: snap(f.turn, 2, -100, 100), thrust: snap(f.thrust, 5, 0, 100), back: snap(f.back, 5, 0, 100), strafe: snap(f.strafe, 5, 0, 100), bits: (f.bits | 0) & 255 };
}

/** The game's live key state to a quantised frame (the only thing a step reads). */
export function frameFromKeys(keys) {
  let bits = 0;
  if (keys.left) bits |= BIT.LEFT;
  if (keys.right) bits |= BIT.RIGHT;
  if (keys.boost) bits |= BIT.BOOST;
  if (keys.brake) bits |= BIT.BRAKE;
  if (keys.shoot) bits |= BIT.SHOOT;
  if (keys.strafeLeft) bits |= BIT.STRAFE_L;
  if (keys.strafeRight) bits |= BIT.STRAFE_R;
  if (keys.launch) bits |= BIT.LAUNCH;
  return quantizeFrame({
    turn: (keys.turnStrength || 0) * 100,
    thrust: (keys.thrustStrength || 0) * 100,
    back: (keys.backStrength || 0) * 100,
    strafe: (keys.strafeStrength ?? 0) * 100,
    bits,
  });
}

export function keysFromFrame(f) {
  return {
    turnStrength: f.turn / 100,
    thrustStrength: f.thrust / 100,
    backStrength: f.back / 100,
    strafeStrength: f.strafe / 100,
    left: !!(f.bits & BIT.LEFT),
    right: !!(f.bits & BIT.RIGHT),
    boost: !!(f.bits & BIT.BOOST),
    brake: !!(f.bits & BIT.BRAKE),
    strafeLeft: !!(f.bits & BIT.STRAFE_L),
    strafeRight: !!(f.bits & BIT.STRAFE_R),
    launch: false,
  };
}

export function sameFrame(a, b) {
  return a.turn === b.turn && a.thrust === b.thrust && a.back === b.back && a.strafe === b.strafe && a.bits === b.bits;
}

/**
 * A fresh attempt on a layout: the ship on the grid, nothing started.
 * physics: WEEKLY_PHYSICS.CURRENT (the hull) unless replaying an older log.
 */
export function createWeeklyScene(layout, { physics = WEEKLY_PHYSICS.CURRENT } = {}) {
  const C = WEEKLY_CONFIG;
  const { start } = layout;
  if (physics !== WEEKLY_PHYSICS.CIRCLE && physics !== WEEKLY_PHYSICS.HULL) throw new RangeError(`Unknown weekly physics: ${physics}`);
  return {
    physics,
    level: WEEKLY_LEVEL,
    weekly: layout.event,
    layout,
    levelInfo: { title: layout.title, landmark: layout.landmark, lesson: layout.lesson, briefing: layout.briefing },
    track: layout.track,
    nodes: layout.nodes.map((n) => ({ ...n })),
    hazards: layout.bouncers.map((b) => ({ ...b })),
    mines: layout.mines,
    sentries: layout.sentries.map((s) => ({ ...s })),
    stations: layout.stations,
    shardList: layout.shards,
    drones: [],
    gravityWells: [],
    enemyShots: [],
    playerShots: [],
    shards: new Set(),
    trackProgress: createTrackProgress(),
    player: {
      x: start.x, y: start.y, vx: 0, vy: 0, angle: start.angle, angVel: 0,
      hp: C.MAX_HP, maxHp: C.MAX_HP, invulnTimer: 0,
      heat: 0, maxHeat: C.PLAYER_MAX_HEAT, isOverheated: false, shootCooldown: 0,
      stunTimer: 0, boundaryContact: 0,
    },
    startPos: { x: start.x, y: start.y },
    lockedInStart: true,
    launched: false,
    fuel: C.MAX_TANK,
    maxFuel: C.MAX_TANK,
    boost: C.BOOST_MAX_PIPS,
    flux: 30,
    step: 0,
    elapsed: 0,
    wallHits: 0,
    finished: false,
    finishMs: null,
    dead: null,
  };
}

/** The race clock in ms for the steps flown so far. */
export const sceneMs = (scene) => (scene.finishMs ?? scene.step * R.STEP * 1000);

function launch(scene) {
  const C = WEEKLY_CONFIG, p = scene.player;
  scene.lockedInStart = false;
  scene.launched = true;
  p.vx += Math.cos(p.angle) * C.LAUNCH_IMPULSE;
  p.vy += Math.sin(p.angle) * C.LAUNCH_IMPULSE;
}

function resolveBouncers(scene, p, events) {
  if (physicsOf(scene) === WEEKLY_PHYSICS.HULL) return resolveBouncersHull(scene, p, events);
  const r = WEEKLY_CONFIG.PLAYER_RADIUS;
  for (const b of scene.hazards) {
    if (b.hp <= 0) continue;
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), min = b.radius + r;
    if (d >= min) continue;
    const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
    p.x = b.x + nx * (min + 0.001);
    p.y = b.y + ny * (min + 0.001);
    const dot = (p.vx - (b.vx || 0)) * nx + (p.vy - (b.vy || 0)) * ny;
    if (dot < 0) { p.vx -= 1.35 * dot * nx; p.vy -= 1.35 * dot * ny; }
    const hurt = Math.max(Math.abs(dot), 2);
    if (damagePlayer(p, Math.min(20, 6 + hurt * 1.4))) events.push({ type: "rock" });
  }
}

// Physics 2: the same bounce and damage, pushing the real body clear of the
// rock with the normal at the contact point.
function resolveBouncersHull(scene, p, events) {
  for (const b of scene.hazards) {
    if (b.hp <= 0) continue;
    const c = pushShipOutOfCircle(p, b.x, b.y, b.radius);
    if (!c) continue;
    const dot = (p.vx - (b.vx || 0)) * c.nx + (p.vy - (b.vy || 0)) * c.ny;
    if (dot < 0) { p.vx -= 1.35 * dot * c.nx; p.vy -= 1.35 * dot * c.ny; }
    const hurt = Math.max(Math.abs(dot), 2);
    if (damagePlayer(p, Math.min(20, 6 + hurt * 1.4))) events.push({ type: "rock" });
  }
}

function updateSentries(scene, p, events) {
  const speed = Math.hypot(p.vx, p.vy);
  for (const s of scene.sentries) {
    s.cooldown = Math.max(0, s.cooldown - R.STEP);
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    s.engaged = dist <= R.SENTRY_RANGE;
    s.slow = s.engaged && speed < R.SENTRY_MIN_SPEED;
    if (s.state === "telegraph") {
      s.telegraph -= R.STEP;
      if (s.telegraph <= 0) {
        const a = Math.atan2(s.aimY - s.y, s.aimX - s.x);
        scene.enemyShots.push({ owner: "enemy", x: s.x, y: s.y, prevX: s.x, prevY: s.y, vx: Math.cos(a) * R.SENTRY_SHOT_SPEED, vy: Math.sin(a) * R.SENTRY_SHOT_SPEED, life: R.SENTRY_SHOT_LIFE, damage: R.SENTRY_DAMAGE });
        s.state = "idle";
        s.cooldown = R.SENTRY_COOLDOWN;
        events.push({ type: "sentry-fire", id: s.id });
      }
    } else if (s.slow && s.cooldown <= 0) {
      const aim = predictAim(s, p, R.SENTRY_SHOT_SPEED);
      s.aimX = aim.x; s.aimY = aim.y;
      s.angle = Math.atan2(aim.y - s.y, aim.x - s.x);
      s.state = "telegraph";
      s.telegraph = R.SENTRY_TELEGRAPH;
      events.push({ type: "sentry-lock", id: s.id });
    }
  }
}

function updateShots(scene, p, events) {
  const pr = WEEKLY_CONFIG.PLAYER_RADIUS;
  const hull = physicsOf(scene) === WEEKLY_PHYSICS.HULL;
  const live = scene.hazards.filter((b) => b.hp > 0);
  for (let i = scene.enemyShots.length - 1; i >= 0; i--) {
    const s = scene.enemyShots[i];
    s.prevX = s.x; s.prevY = s.y;
    s.x += s.vx * R.STEP; s.y += s.vy * R.STEP; s.life -= R.STEP;
    let gone = s.life <= 0;
    if (!gone && live.some((b) => segmentHitsCircle(s.prevX, s.prevY, s.x, s.y, b.x, b.y, b.radius))) gone = true;
    if (!gone && (hull ? shotHitsShip(p, s.prevX, s.prevY, s.x, s.y) : segmentHitsCircle(s.prevX, s.prevY, s.x, s.y, p.x, p.y, pr))) {
      if (damagePlayer(p, s.damage)) events.push({ type: "shot" });
      gone = true;
    }
    if (gone) scene.enemyShots.splice(i, 1);
  }
  for (let i = scene.playerShots.length - 1; i >= 0; i--) {
    const s = scene.playerShots[i];
    s.prevX = s.x; s.prevY = s.y;
    s.x += s.vx * R.STEP; s.y += s.vy * R.STEP; s.life -= R.STEP;
    let gone = s.life <= 0 || !isInsideTrack(scene.track, s.x, s.y);
    const rock = !gone && live.find((b) => segmentHitsCircle(s.prevX, s.prevY, s.x, s.y, b.x, b.y, b.radius));
    if (rock) {
      rock.hp = Math.max(0, rock.hp - WEEKLY_CONFIG.PLAYER_PROJECTILE_DAMAGE);
      if (rock.hp === 0) { rock.destroyedAt = scene.elapsed; events.push({ type: "rock-destroyed", id: rock.id }); }
      gone = true;
    }
    if (!gone && scene.mines.some((m) => segmentHitsCircle(s.prevX, s.prevY, s.x, s.y, m.x, m.y, m.radius))) gone = true;
    if (gone) scene.playerShots.splice(i, 1);
  }
}

/**
 * Advance one fixed step with one input frame. Returns this step's events:
 * launch, wall, shard, station, rock, rock-destroyed, sentry-lock, sentry-fire,
 * shot, missing-shards, finish, dead (with cause mine | hull | fuel).
 */
export function stepWeekly(scene, frame = NEUTRAL) {
  const events = [];
  if (scene.finished || scene.dead) return events;
  const C = WEEKLY_CONFIG, p = scene.player;
  if (scene.lockedInStart) {
    // Nothing moves and the clock doesn't run until the pilot launches.
    if (!(frame.bits & BIT.LAUNCH) && !(frame.thrust > 0) && !(frame.bits & BIT.BOOST)) return events;
    launch(scene);
    events.push({ type: "launch" });
  }
  scene.step++;
  scene.elapsed = scene.step * R.STEP;
  rechargeBoost(scene, R.STEP, C);
  p.invulnTimer = Math.max(0, (p.invulnTimer || 0) - R.STEP);
  for (const b of scene.hazards) {
    if (b.hp <= 0) continue;
    const pos = bouncerPosition(b, scene.elapsed);
    b.vx = (pos.x - b.x) / R.STEP; b.vy = (pos.y - b.y) / R.STEP;
    b.x = pos.x; b.y = pos.y;
  }
  const stunned = p.stunTimer > 0;
  p.stunTimer = Math.max(0, p.stunTimer - R.STEP);
  const keys = keysFromFrame(stunned ? NEUTRAL : frame);
  const previous = { x: p.x, y: p.y };
  const rails = {
    model: "stun",
    keep: R.WALL_KEEP,
    hits: (outward) => outward >= R.WALL_STUN_FROM && p.stunTimer <= 0,
    onImpact: () => { p.stunTimer = R.WALL_STUN; scene.wallHits++; events.push({ type: "wall" }); },
  };
  const hull = physicsOf(scene) === WEEKLY_PHYSICS.HULL;
  const body = hull ? PLAYER_HULL : C.PLAYER_RADIUS;
  advanceFlight(R.STEP, scene, p, keys, {
    onFuelUse: (amount) => { scene.fuel = Math.max(0, scene.fuel - amount); },
    constrain: (player, prev) => { constrainToTrack(scene.track, player, prev, body, rails); },
  }, C);
  // Stationary mines: contact is the end of the attempt.
  for (const m of scene.mines) {
    if (hull ? shipTouchesCircle(p, m.x, m.y, m.radius) : Math.hypot(p.x - m.x, p.y - m.y) < m.radius + C.PLAYER_RADIUS) {
      scene.dead = "mine";
      events.push({ type: "dead", cause: "mine", id: m.id });
      return events;
    }
  }
  resolveBouncers(scene, p, events);
  updateTrackProgress(scene, previous);
  for (const s of scene.shardList) {
    if (scene.shards.has(s.id)) continue;
    if (Math.hypot(p.x - s.x, p.y - s.y) <= R.SHARD_PICKUP || (hull && shipTouchesCircle(p, s.x, s.y, R.SHARD_TOUCH))) {
      scene.shards.add(s.id);
      scene.flux = Math.min(100, scene.flux + 8);
      events.push({ type: "shard", id: s.id, count: scene.shards.size, total: scene.shardList.length });
    }
  }
  for (const st of scene.stations) {
    if (Math.hypot(p.x - st.x, p.y - st.y) <= R.STATION_PICKUP && (scene.fuel < scene.maxFuel - 1 || p.hp < p.maxHp)) {
      scene.fuel = scene.maxFuel;
      p.hp = p.maxHp;
      events.push({ type: "station", id: st.id });
    }
  }
  // The finish line: a forward crossing of point 0's full-width line.
  const gate = scene.track.portal;
  const before = (previous.x - gate.x) * gate.tx + (previous.y - gate.y) * gate.ty;
  const after = (p.x - gate.x) * gate.tx + (p.y - gate.y) * gate.ty;
  if (before < 0 && after >= 0) {
    const t = after > before ? -before / (after - before) : 1;
    const x = previous.x + (p.x - previous.x) * t, y = previous.y + (p.y - previous.y) * t;
    const lateral = Math.abs((x - gate.x) * gate.nx + (y - gate.y) * gate.ny);
    if (lateral <= scene.track.width / 2 && isLapReady(scene)) {
      if (scene.shards.size === scene.shardList.length) {
        scene.finished = true;
        scene.finishMs = (scene.step - 1 + t) * R.STEP * 1000;
        events.push({ type: "finish", ms: scene.finishMs });
        return events;
      }
      events.push({ type: "missing-shards", missing: scene.shardList.length - scene.shards.size });
    }
  }
  updateSentries(scene, p, events);
  fireWeapon(R.STEP, p, !!(frame.bits & BIT.SHOOT) && !stunned, C, () => scene.playerShots.push({ owner: "player", ...projectileFrom(p, C) }));
  coolWeapon(R.STEP, p, !!(frame.bits & BIT.SHOOT) && !stunned, C);
  updateShots(scene, p, events);
  if (p.hp <= 0) {
    scene.dead = "hull";
    events.push({ type: "dead", cause: "hull" });
  } else if (scene.fuel <= 0) {
    scene.dead = "fuel";
    events.push({ type: "dead", cause: "fuel" });
  }
  return events;
}

/** Signed distance of the ship past the finish line (for HUD and tests). */
export function finishLineCoordinates(scene) {
  return portalCoordinates(scene.track, scene.player);
}
