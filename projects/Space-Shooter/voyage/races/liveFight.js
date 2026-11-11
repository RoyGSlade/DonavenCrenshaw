// The new game's layer over a live quest fight on Dogfight's simulation:
// the crew's free-aim turret and repairs (player two, P11), knocked-out
// systems while a crew is aboard, and skill abilities (hack-jam, overcharge,
// field repair, drift; data in ./data.js ABILITIES).
//
// Dogfight's own code is not changed: dogfight/simulation.js steps the match as
// always, and this layer works around each step (it masks inputs going in and
// adjusts hp coming out). It is only used by quest fights in the new game
// (voyage/quests/live/dogfight.js matches); today's Dogfight PvP never loads it.
// Pure and seeded: no DOM, no clock; tests drive it step by step.
import { stepMatch, RULES, NEUTRAL } from '../../dogfight/simulation.js';
import { shipStats } from '../../dogfight/ships.js';
import { enemyInput } from '../quests/live/dogfight.js';
import * as character from '../character.js';
import { SKILLS } from '../data.js';
import { ABILITIES, LIVE_CREW, TURRET_AIM_RING } from './data.js';

// Skill levels that unlock things (ROUND2-CONTRACT.md section 9) when the
// save's skill list has them; the slice's older list otherwise (`legacy`).
const LEVELLED = SKILLS.some((s) => Array.isArray(s.levels));
const skillBonus = (who, tag) => (character.skillBonus ? character.skillBonus(who, tag) : 0);
const activity = (who, id) => (LEVELLED && character.activityValue ? character.activityValue(who, id) || 0 : 0);
/** A frame key for an ability id (the crew room allows no dots in keys). */
export const cdKey = (id) => id.replace(/\./g, '_');

export const ABILITY = new Map(ABILITIES.map((a) => [a.id, a]));
const SYSTEMS = ['guns', 'engine'];
const r2 = (v) => Math.round(v * 100) / 100;

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rank of a skill on a character or crew card (0 when untrained). */
export const skillLevel = (who, skill) => Math.max(0, Math.trunc(who?.skills?.[skill] || 0));

/** 0 when `who` lacks the ability; else 1 at the granting level, +1 per level above it. */
export function abilityRank(who, a) {
  if (!who || !a) return 0;
  const g = LEVELLED ? a.grant : a.legacy;
  if (LEVELLED && character.hasUnlock && !character.hasUnlock(who, 'ability', a.id)) return 0;
  const level = skillLevel(who, g.skill);
  return level >= g.level ? level - g.level + 1 : 0;
}

/** Abilities a seat can use: [{ id, rank, ...data }]. seat: 'pilot' or 'crew'. */
export function abilitiesFor(who, seat = 'pilot') {
  return ABILITIES.filter((a) => (seat === 'pilot' || a.seat === 'any') && abilityRank(who, a) > 0)
    .map((a) => ({ ...a, rank: abilityRank(who, a) }));
}

const per = (spec, rank) => spec.base + spec.perLevel * Math.max(0, rank - 1);
/** How wide the hack's hit window is (0..1 of the sweep) at a rank; Hacker's hack.time widens it. */
export function hackWindow(rank, who = null) {
  const w = ABILITY.get('ship.hack-jam').window;
  return Math.min(0.5, per(w, rank) + activity(who, 'hack.time') * w.perHackSecond);
}

/**
 * setup: liveFightSetup(...). pilot: the pilot's character; crew: the crew's
 * card (voyage/crew/card.js) or null.
 */
export function createLiveLayer(setup, { pilot = null, crew = null } = {}) {
  return {
    t: 0,
    rand: rng((setup.seed || 1) ^ 0x5eed),
    pilot, crew,
    bolts: [],
    turretReadyAt: 0,
    repairReadyAt: 0,
    systems: { guns: false, engine: false },
    fx: { jam: 0, overcharge: 0, guard: 0 },
    ready: {},          // ability id -> time it is ready again
    log: [],
    events: [],         // since the last drain: { type, ... } for the page's juice
  };
}

const say = (layer, line) => { layer.log.push(line); if (layer.log.length > 6) layer.log.shift(); };
const emit = (layer, e) => { layer.events.push(e); if (layer.events.length > 40) layer.events.shift(); };
/** The page takes the events once (hit flashes, shake, sounds). */
export function drainEvents(layer) { const out = layer.events; layer.events = []; return out; }

const crewName = (layer) => layer.crew?.name || 'Your crew';
// Quest numbers (hull points) to Dogfight hp and back, per the fight's scale.
const toHp = (setup, side, amount) => (amount / Math.max(1, setup.hitValue[side])) * RULES.damage;

/** The crew fires the turret at angle `aim` (radians, world). Returns an error or null. */
export function crewTurret(layer, match, aim) {
  if (!layer.crew) return 'No crew aboard.';
  if (match.phase !== 'playing') return 'Hold fire until the fight starts.';
  if (!Number.isFinite(aim)) return 'Aim first.';
  const me = match.ships[0];
  if (!me || me.hp <= 0) return 'The ship is gone.';
  const T = LIVE_CREW.turret;
  if (layer.t < layer.turretReadyAt) return 'The turret is cycling.';
  if (layer.bolts.length >= T.maxBolts) return 'The turret is cycling.';
  layer.turretReadyAt = layer.t + T.cooldown;
  layer.bolts.push({ x: me.x, y: me.y, vx: Math.cos(aim) * T.speed + (me.vx || 0), vy: Math.sin(aim) * T.speed + (me.vy || 0), life: T.life });
  emit(layer, { type: 'turret-fire' });
  return null;
}

/** The crew finished a hold-to-repair on a system or the hull. Returns an error or null. */
export function crewRepair(layer, match, setup, system) {
  if (!layer.crew) return 'No crew aboard.';
  if (layer.t < layer.repairReadyAt) return 'Still patching the last one.';
  const me = match.ships[0];
  if (SYSTEMS.includes(system)) {
    if (!layer.systems[system]) return `The ${system} ${system === 'guns' ? 'are' : 'is'} working.`;
    layer.systems[system] = false;
    layer.repairReadyAt = layer.t + LIVE_CREW.repair.cooldown;
    say(layer, `${crewName(layer)} gets the ${system} back online.`);
    emit(layer, { type: 'repair', system });
    return null;
  }
  if (system !== 'hull') return 'Repair what?';
  if (me.hp >= me.hpMax) return 'The hull is whole.';
  const con = Math.max(0, (layer.crew.stats?.con ?? 3) - 3);
  const patch = 5 + 2 * skillBonus(layer.crew, 'repair') + con;
  me.hp = Math.min(me.hpMax, me.hp + toHp(setup, 0, patch));
  layer.repairReadyAt = layer.t + LIVE_CREW.repair.cooldown;
  say(layer, `${crewName(layer)} patches the hull (+${patch}).`);
  emit(layer, { type: 'repair', system: 'hull', amount: patch });
  return null;
}

/**
 * Uses an ability. seat: 'pilot' or 'crew' (whose skills count). hit: for a
 * timed ability, whether the press landed in the window. Returns an error or null.
 */
export function useAbility(layer, match, setup, id, { seat = 'pilot', hit = false } = {}) {
  const a = ABILITY.get(id);
  if (!a) return 'Unknown ability.';
  const who = seat === 'crew' ? layer.crew : layer.pilot;
  if (!who) return seat === 'crew' ? 'No crew aboard.' : 'No captain.';
  if (seat === 'crew' && a.seat !== 'any') return `${a.name} is the pilot's.`;
  const rank = abilityRank(who, a);
  if (!rank) return `${a.name} needs more training.`;
  if (match.phase !== 'playing') return 'Wait for the fight to start.';
  const key = `${seat}:${id}`;
  if (layer.t < (layer.ready[key] || 0)) return `${a.name} is cooling down.`;
  const me = match.ships[0];
  const name = seat === 'crew' ? crewName(layer) : 'You';
  layer.ready[key] = layer.t + a.cooldown;
  if (id === 'ship.hack-jam') {
    if (!hit) {
      layer.ready[key] = layer.t + a.cooldown / 2;
      say(layer, `${name} ${seat === 'crew' ? 'misses' : 'miss'} the window. The hack bounces.`);
      emit(layer, { type: 'ability', id, ok: false, seat });
      return null;
    }
    const seconds = per(a.jam, rank);
    layer.fx.jam = Math.max(layer.fx.jam, layer.t + seconds);
    say(layer, `${name} ${seat === 'crew' ? 'slices' : 'slice'} their fire control. Guns jammed for ${seconds.toFixed(1)} s.`);
  } else if (id === 'ship.overcharge') {
    layer.fx.overcharge = layer.t + per(a.armSeconds, rank);
    say(layer, 'Barrels charged. Your next hit lands big.');
  } else if (id === 'ship.field-repair') {
    if (me.hp >= me.hpMax) { layer.ready[key] = 0; return 'The hull is whole.'; }
    const patch = per(a.patch, rank);
    me.hp = Math.min(me.hpMax, me.hp + toHp(setup, 0, patch));
    say(layer, `${name} ${seat === 'crew' ? 'slaps' : 'slap'} on a field patch (+${patch}).`);
  } else if (id === 'ship.drift') {
    const foe = match.ships[1];
    if (foe) me.angle = Math.atan2(foe.y - me.y, foe.x - me.x);
    layer.fx.guard = Math.max(layer.fx.guard, layer.t + per(a.guard, rank));
    say(layer, 'You kick the tail out and swing onto them.');
  } else if (id === 'ship.afterburner') {
    if (layer.systems.engine) { layer.ready[key] = 0; return 'The engine is out: no afterburner until it is fixed.'; }
    const kick = per(a.impulse, rank);
    me.vx = (me.vx || 0) + Math.cos(me.angle) * kick;
    me.vy = (me.vy || 0) + Math.sin(me.angle) * kick;
    say(layer, 'Afterburner! Hold on to something.');
  }
  emit(layer, { type: 'ability', id, ok: true, seat });
  return null;
}

/** Seconds until an ability is ready for a seat (0 when ready). */
export const cooldownLeft = (layer, id, seat = 'pilot') => Math.max(0, (layer.ready[`${seat}:${id}`] || 0) - layer.t);

// What a knocked-out system does to the pilot's stick.
function maskPilot(layer, input) {
  const out = { ...NEUTRAL, ...(input || NEUTRAL) };
  if (layer.systems.guns) out.fire = false;
  if (layer.systems.engine) { out.thrust = false; out.boost = false; out.turn *= LIVE_CREW.engineTurn; }
  return out;
}

function stepBolts(layer, match, setup, dt) {
  const foe = match.ships[1];
  if (!layer.bolts.length) return;
  const T = LIVE_CREW.turret;
  const crewFight = skillBonus(layer.crew, 'fight');
  const radius = foe ? shipStats(foe).radius + 0.1 + activity(layer.crew, 'turret.aim') * TURRET_AIM_RING : 0;
  layer.bolts = layer.bolts.filter((b) => {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > RULES.width || b.y > RULES.height) return false;
    for (const o of match.obstacles || []) if (o.hp !== 0 && Math.hypot(b.x - o.x, b.y - o.y) < o.radius) return false;
    if (foe && foe.hp > 0 && Math.hypot(b.x - foe.x, b.y - foe.y) < radius) {
      const dmg = T.base + Math.floor(layer.rand() * (T.spread + 1)) + crewFight;
      foe.hp = Math.max(0, foe.hp - toHp(setup, 1, dmg));
      foe.hit = 0.15;
      say(layer, `${crewName(layer)}'s turret hits for ${dmg}.`);
      emit(layer, { type: 'turret-hit', dmg });
      return false;
    }
    return true;
  });
}

/**
 * One fixed step (RULES.step) of the fight with this layer around it.
 * playerInput: the pilot's stick. Returns the match.
 */
export function stepLiveLayer(layer, match, setup, playerInput) {
  const dt = RULES.step;
  const me = match.ships[0], foe = match.ships[1];
  const before = { me: me?.hp ?? 0, foe: foe?.hp ?? 0 };
  let enemy = enemyInput(match, setup.movement);
  if (layer.t < layer.fx.jam) enemy = { ...enemy, fire: false };
  stepMatch(match, [maskPilot(layer, playerInput), enemy], dt);
  if (match.phase === 'playing' || match.phase === 'finished') layer.t += dt;
  // Overcharge: the pilot's next hit lands as one big shot.
  if (foe && foe.hp < before.foe && layer.t < layer.fx.overcharge) {
    const a = ABILITY.get('ship.overcharge');
    foe.hp = Math.max(0, foe.hp - (before.foe - foe.hp) * (a.factor - 1));
    layer.fx.overcharge = 0;
    say(layer, 'The charged shot lands. Big.');
    emit(layer, { type: 'overcharge-hit' });
  }
  // Drift: a hit that lands mid-slide glances off.
  if (me && me.hp < before.me && layer.t < layer.fx.guard && me.hp > 0) {
    me.hp = before.me;
    emit(layer, { type: 'glance' });
  } else if (me && me.hp < before.me) {
    emit(layer, { type: 'hit-taken' });
    // With a crew aboard a hit can knock out a system for them to fix (S53); never solo (S57).
    const up = SYSTEMS.filter((s) => !layer.systems[s]);
    if (layer.crew && up.length && layer.rand() < LIVE_CREW.knockChance) {
      const s = up[Math.floor(layer.rand() * up.length)];
      layer.systems[s] = true;
      say(layer, s === 'guns' ? 'Guns knocked out! Your crew can fix them.' : 'Engine knocked out! Your crew can fix it.');
      emit(layer, { type: 'knock', system: s });
    }
  }
  if (foe && foe.hp < before.foe) emit(layer, { type: 'foe-hit' });
  stepBolts(layer, match, setup, dt);
  return match;
}

/**
 * The frame the crew's scope draws: small plain data inside the crew room's
 * limits (voyage/crew/protocol.js: short arrays, short keys).
 */
export function liveFrame(layer, match, setup) {
  const ship = (s, i) => (s ? [r2(s.x), r2(s.y), r2(s.angle), Math.round((Math.max(0, s.hp) / RULES.damage) * setup.hitValue[i]), Math.round((s.hpMax / RULES.damage) * setup.hitValue[i])] : null);
  const cd = {};
  for (const a of abilitiesFor(layer.crew, 'crew')) cd[cdKey(a.id)] = r2(cooldownLeft(layer, a.id, 'crew'));
  return {
    t: r2(layer.t),
    phase: match.phase,
    count: r2(Math.max(0, match.countdown || 0)),
    me: ship(match.ships[0], 0),
    foe: ship(match.ships[1], 1),
    bolts: layer.bolts.slice(0, 12).map((b) => [r2(b.x), r2(b.y)]),
    shots: (match.bullets || []).slice(0, 30).map((b) => [r2(b.x), r2(b.y), b.owner === match.ships[0]?.id ? 1 : 0]),
    sys: { guns: layer.systems.guns ? 1 : 0, engine: layer.systems.engine ? 1 : 0 },
    fx: { jam: layer.t < layer.fx.jam ? 1 : 0, overcharge: layer.t < layer.fx.overcharge ? 1 : 0, guard: layer.t < layer.fx.guard ? 1 : 0 },
    turret: r2(Math.max(0, layer.turretReadyAt - layer.t)),
    repair: r2(Math.max(0, layer.repairReadyAt - layer.t)),
    cd,
    log: layer.log.slice(-3),
  };
}

/** A crew action during a live fight ({ job, ... } from the crew's scope). Returns an error or null. */
export function crewLiveAct(layer, match, setup, action) {
  switch (action?.job) {
    case 'live-turret': return crewTurret(layer, match, Number(action.aim));
    case 'live-repair': return crewRepair(layer, match, setup, action.system);
    case 'live-ability': return useAbility(layer, match, setup, String(action.id || ''), { seat: 'crew', hit: action.hit === true });
    default: return 'That only works in a turn-by-turn fight. The captain is flying this one live.';
  }
}
