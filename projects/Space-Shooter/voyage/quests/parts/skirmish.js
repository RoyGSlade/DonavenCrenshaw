// Ship fight, turn based. This is the quest engine's stand-in for a real-time
// fight: it takes the rolled enemy (hp, movement, abilities) and resolves with
// win / lose / flee / parley. A real-time fight can replace it later by
// returning the same outcomes.
import { check, rollText } from '../core.js';
import { liveFightSetup } from '../live/dogfight.js';

export const MOVEMENTS = Object.freeze({
  strafe: { label: 'strafes side to side', evade: 1, damage: 0 },
  charge: { label: 'charges straight in', evade: -1, damage: 3 },
  orbit: { label: 'circles you', evade: 0, damage: 0, alternating: true },
  hold: { label: 'holds position like a turret', evade: -2, damage: 2 },
});

export const ABILITIES = Object.freeze({
  shield: 'A shield soaks the first 15 damage.',
  emp: 'An EMP knocks your guns out for one round, early in the fight.',
  mines: 'It drops mines: evading costs you 4 hull.',
  repair: 'Once, when badly hurt, it patches itself up.',
  missiles: 'Every third round it fires a missile volley for double damage.',
  cloak: 'Its first moment in the fight it is cloaked: your first shot misses.',
});

// Ship systems an enemy hit can knock out, only while a crew is aboard to fix
// them (P11, S53). Solo fights never break a system, so they play as before.
export const SYSTEMS = Object.freeze({
  guns: { name: 'Guns', effect: 'half damage' },
  engine: { name: 'Engine', effect: 'evading and breaking off are harder' },
});
export const SYSTEM_BREAK_CHANCE = 0.35;
const ENGINE_PENALTY = 2;
const broken = (state, id) => Boolean(state.systems?.[id]);

const MOVES = Object.freeze({
  fire: 'Fire',
  evade: 'Evade',
  hail: 'Hail them',
  flee: 'Break off',
});

function evasion(state) {
  const move = MOVEMENTS[state.enemy.movement] || MOVEMENTS.hold;
  if (move.alternating) return state.round % 2 ? 1 : -1;
  return move.evade;
}

export function createSkirmish(params, ctx) {
  const enemy = structuredClone(params.enemy);
  enemy.hpMax = enemy.hp;
  enemy.shield = (enemy.abilities || []).includes('shield') ? 15 : 0;
  enemy.cloaked = (enemy.abilities || []).includes('cloak');
  enemy.repaired = false;
  return {
    kind: 'skirmish',
    enemy,
    ship: { hp: ctx.run.hull, hpMax: ctx.run.hullMax, damage: ctx.ship.damage },
    liveSeed: ctx.rng.int(1, 0x7fffffff),
    round: 1,
    gunsOut: false,
    log: [`${enemy.name} ${MOVEMENTS[enemy.movement]?.label || 'waits'}.`],
    done: false,
    outcome: null,
  };
}

export function viewSkirmish(state) {
  const parley = Boolean(state.enemy.parley);
  return {
    title: state.enemy.name,
    enemy: { name: state.enemy.name, hp: state.enemy.hp, hpMax: state.enemy.hpMax, shield: state.enemy.shield, movement: state.enemy.movement, movementText: MOVEMENTS[state.enemy.movement]?.label || '', abilities: (state.enemy.abilities || []).map(id => ({ id, text: ABILITIES[id] || id })) },
    ship: { ...state.ship },
    round: state.round,
    log: state.log.slice(-6),
    live: { kind: 'dogfight', activity: 'ship-fight', setup: liveFightSetup(state.enemy, { hull: state.ship.hp, damage: state.ship.damage }, state.liveSeed) },
    moves: Object.entries(MOVES).map(([id, label]) => ({ id, label: id === 'hail' && !parley ? `${label} (they may not answer)` : label })),
    systems: Object.fromEntries(Object.keys(SYSTEMS).map(id => [id, broken(state, id)])),
    crewUsed: { turret: state.crew?.turret === state.round, repair: state.crew?.repair === state.round },
    done: state.done,
    outcome: state.outcome,
  };
}

export function damageEnemy(state, amount) {
  const e = state.enemy;
  const soaked = Math.min(e.shield, amount);
  e.shield -= soaked;
  e.hp = Math.max(0, e.hp - (amount - soaked));
  return soaked;
}

export function actSkirmish(state, action, ctx) {
  if (state.done) return { state };
  // The page flew the fight live on Dogfight's combat (../live/dogfight.js).
  if (action?.type === 'live') {
    if (!['win', 'lose', 'flee'].includes(action.outcome)) return { state, error: 'Unknown result' };
    state.ship.hp = action.outcome === 'lose' ? 0 : Math.max(1, Math.min(state.ship.hpMax, Math.round(action.hull || 1)));
    if (action.outcome === 'win') state.enemy.hp = 0;
    state.log.push(action.outcome === 'win' ? `${state.enemy.name} breaks apart.` : action.outcome === 'lose' ? 'Your hull gives out. Emergency thrusters drag you clear.' : 'You both break off.');
    state.done = true; state.outcome = action.outcome;
    return { state };
  }
  const move = action?.move;
  if (!MOVES[move]) return { state, error: 'Unknown move' };
  const c = ctx.save.character;
  const say = line => state.log.push(line);
  let evading = false;

  if (move === 'fire') {
    if (state.gunsOut) {
      say('Your guns are still rebooting from the EMP.');
      state.gunsOut = false;
    } else if (state.enemy.cloaked) {
      state.enemy.cloaked = false;
      say(`You fire at a shimmer. ${state.enemy.name} decloaks behind it.`);
    } else {
      const r = check(c, { stat: 'dex', tag: 'fight', dc: 6 + evasion(state) }, ctx.rng.next);
      if (r.pass) {
        let dmg = state.ship.damage + ctx.rng.d6();
        if (broken(state, 'guns')) dmg = Math.ceil(dmg / 2);
        const soaked = damageEnemy(state, dmg);
        say(`Hit for ${dmg}${broken(state, 'guns') ? ' (guns damaged)' : ''}${soaked ? ` (${soaked} into the shield)` : ''}. Roll ${rollText(r)}.`);
      } else say(`Miss. Roll ${rollText(r)}.`);
    }
  } else if (move === 'evade') {
    const dc = 6 + (broken(state, 'engine') ? ENGINE_PENALTY : 0);
    const r = check(c, { stat: 'dex', tag: 'dodge', dc }, ctx.rng.next);
    evading = r.pass;
    say(r.pass ? `You slip out of the line of fire. Roll ${rollText(r)}.` : `You jink, too slow. Roll ${rollText(r)}.`);
    if ((state.enemy.abilities || []).includes('mines')) {
      state.ship.hp = Math.max(0, state.ship.hp - 4);
      say('A mine clips you for 4.');
    }
  } else if (move === 'hail') {
    if (!state.enemy.parley) say('No answer on any channel.');
    else {
      const r = check(c, { stat: 'cha', tag: 'talk', dc: state.enemy.parleyDc || 8 }, ctx.rng.next);
      if (r.pass) {
        say(`They answer. Roll ${rollText(r)}. Weapons go cold.`);
        state.done = true; state.outcome = 'parley';
        return { state };
      }
      say(`They laugh you off the channel. Roll ${rollText(r)}.`);
    }
  } else if (move === 'flee') {
    const dc = 7 + (state.enemy.movement === 'charge' ? 1 : 0) + (broken(state, 'engine') ? ENGINE_PENALTY : 0);
    const r = check(c, { stat: 'dex', tag: 'nav', dc }, ctx.rng.next);
    if (r.pass) {
      say(`You burn clear. Roll ${rollText(r)}.`);
      state.done = true; state.outcome = 'flee';
      return { state };
    }
    say(`They stay on your tail. Roll ${rollText(r)}.`);
  }

  if (state.enemy.hp <= 0) {
    say(`${state.enemy.name} breaks apart.`);
    state.done = true; state.outcome = 'win';
    return { state };
  }

  // The enemy's turn.
  const abilities = state.enemy.abilities || [];
  if (abilities.includes('repair') && !state.enemy.repaired && state.enemy.hp <= state.enemy.hpMax / 2) {
    state.enemy.repaired = true;
    const heal = Math.round(state.enemy.hpMax * 0.3);
    state.enemy.hp = Math.min(state.enemy.hpMax, state.enemy.hp + heal);
    say(`${state.enemy.name} patches its hull (+${heal}).`);
  } else if (abilities.includes('emp') && state.round === 2) {
    state.gunsOut = true;
    say('An EMP pulse washes over you. Your guns go dark for a round.');
  } else if (evading) {
    say('Their shots go wide.');
  } else if (ctx.rng.chance(0.75)) {
    const [lo, hi] = state.enemy.damage || [6, 10];
    let dmg = ctx.rng.int(lo, hi) + (MOVEMENTS[state.enemy.movement]?.damage || 0);
    const volley = abilities.includes('missiles') && state.round % 3 === 0;
    if (volley) dmg *= 2;
    state.ship.hp = Math.max(0, state.ship.hp - dmg);
    say(volley ? `Missile volley: ${dmg} damage.` : `They hit you for ${dmg}.`);
    if (ctx.crew && state.ship.hp > 0) breakSystem(state, ctx, say);
  } else say('Their shots go wide.');

  if (state.ship.hp <= 0) {
    say('Your hull gives out. Emergency thrusters drag you clear.');
    state.done = true; state.outcome = 'lose';
    return { state };
  }
  state.round++;
  return { state };
}

// With a crew aboard, a hit may knock a system out until the crew repairs it.
function breakSystem(state, ctx, say) {
  if (!ctx.rng.chance(SYSTEM_BREAK_CHANCE)) return;
  const working = Object.keys(SYSTEMS).filter(id => !broken(state, id));
  if (!working.length) return;
  const id = ctx.rng.pick(working);
  state.systems = { ...(state.systems || {}), [id]: true };
  say(`${SYSTEMS[id].name} knocked out: ${SYSTEMS[id].effect} until your crew repairs them.`);
}

// Hull carried back to the run when the fight ends (a lost fight leaves 1).
export function hullAfter(state) { return Math.max(1, state.ship.hp); }
