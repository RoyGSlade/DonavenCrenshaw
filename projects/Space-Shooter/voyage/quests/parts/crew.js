// Player two's jobs inside a running quest (P11): the crew aboard the pilot's
// ship. Pure rules on the run's step state, called by the engine for actions
// of type 'crew'. The crew's own stats and skills come in as ctx.crew (a card
// from voyage/crew/card.js), and every roll uses the run's seed, so a crew run
// replays like any other. Solo play never reaches this file (S57).
//
//   turret  { hit }     the turret the crew aims (S54): one shot a round
//   repair  { system }  hold-to-repair (S53): a knocked-out system, or 'hull'; one a round
//   scan    {}          scan the next jump (S56): Wisdom check, pass halves its odds
//   mark    { route }   tell the pilot which lane the navigator would take
// The dialogue checks and the minigames (S55) go through the engine itself.
import { check, skillBonus } from '../core.js';
import { SYSTEMS, damageEnemy } from './skirmish.js';
import { settleCardFight } from './travel.js';

export const CREW_RULES = Object.freeze({
  turret: { base: 4, spread: 3 },   // 4-7 damage, plus the crew's fight bonus
  patch: { base: 5, perRank: 2 },   // hull per patch: 5, +2 per repair skill rank, +1 per Constitution over 3
  scan: { stat: 'wis', tag: 'scan', dc: 6 },
  holdMs: 1200,                     // how long the crew holds to repair (the crew's page times it)
});

/** The fight the crew can work on now: { fight, card } (card when it is a travel event's fight), or null. */
export function crewFight(run) {
  const part = run.part;
  if (!part) return null;
  if (part.kind === 'skirmish') return part.state.done ? null : { fight: part.state, card: null };
  const card = part.kind === 'trip' || part.kind === 'event' ? part.state.card : null;
  return card?.phase === 'fight' && !card.fight.done ? { fight: card.fight, card } : null;
}

/** The trip the navigator can work on now, or null. */
export function crewTrip(run) {
  const trip = run.part?.kind === 'trip' ? run.part.state : null;
  return trip && !trip.done && ['plan', 'leg'].includes(trip.phase) ? trip : null;
}

const used = (fight, job) => fight.crew?.[job] === fight.round;
const mark = (fight, job) => { fight.crew = { ...(fight.crew || {}), [job]: fight.round }; };
const crewName = ctx => ctx.crew?.name || 'Your crew';

function turret(action, ctx) {
  const on = crewFight(ctx.run);
  if (!on) return 'Nothing in the turret sights.';
  const { fight } = on;
  if (used(fight, 'turret')) return 'The turret is recharging. One shot a round.';
  mark(fight, 'turret');
  const say = line => fight.log.push(line);
  if (!action.hit) { say(`${crewName(ctx)}'s turret shot goes wide.`); return null; }
  if (fight.enemy.cloaked) {
    fight.enemy.cloaked = false;
    say(`${crewName(ctx)}'s turret lights up a shimmer. ${fight.enemy.name} decloaks.`);
    return null;
  }
  const dmg = CREW_RULES.turret.base + ctx.rng.int(0, CREW_RULES.turret.spread) + skillBonus(ctx.crew, 'fight');
  const soaked = damageEnemy(fight, dmg);
  say(`${crewName(ctx)}'s turret hits for ${dmg}${soaked ? ` (${soaked} into the shield)` : ''}.`);
  if (fight.enemy.hp <= 0) {
    say(`${fight.enemy.name} breaks apart.`);
    fight.done = true;
    fight.outcome = 'win';
    if (on.card) settleCardFight(on.card, ctx);
  }
  return null;
}

/** Hull one patch gives with this crew. */
export function patchAmount(crew) {
  const con = Math.max(0, (crew?.stats?.con ?? 3) - 3);
  return CREW_RULES.patch.base + CREW_RULES.patch.perRank * skillBonus(crew, 'repair') + con;
}

function repair(action, ctx) {
  const on = crewFight(ctx.run);
  if (!on) return 'Nothing to repair mid-fight right now.';
  const { fight } = on;
  if (used(fight, 'repair')) return 'Already repairing this round.';
  const system = action.system;
  const say = line => fight.log.push(line);
  if (Object.hasOwn(SYSTEMS, system)) {
    if (!fight.systems?.[system]) return `The ${SYSTEMS[system].name.toLowerCase()} are working.`;
    mark(fight, 'repair');
    fight.systems = { ...fight.systems, [system]: false };
    say(`${crewName(ctx)} gets the ${SYSTEMS[system].name.toLowerCase()} back online.`);
    return null;
  }
  if (system !== 'hull') return 'Repair what?';
  if (fight.ship.hp >= fight.ship.hpMax) return 'The hull is whole.';
  mark(fight, 'repair');
  const before = fight.ship.hp;
  fight.ship.hp = Math.min(fight.ship.hpMax, fight.ship.hp + patchAmount(ctx.crew));
  say(`${crewName(ctx)} patches the hull (+${fight.ship.hp - before}).`);
  return null;
}

function scan(ctx) {
  const trip = crewTrip(ctx.run);
  if (!trip) return 'Nothing to scan right now.';
  const target = trip.leg + 1; // the next jump (the first one, while the lane is still being picked)
  if ((trip.scans || []).includes(target)) return 'You already scanned that jump.';
  trip.scans = [...(trip.scans || []), target];
  const r = check(ctx.crew, CREW_RULES.scan, ctx.rng.next);
  if (r.pass) trip.scanned = target;
  trip.log.push(r.pass
    ? `${crewName(ctx)} scans ahead (${r.roll}+${r.bonus} vs ${r.dc}): trouble spotted early, the next jump is safer.`
    : `${crewName(ctx)} scans ahead (${r.roll}+${r.bonus} vs ${r.dc}): nothing but static.`);
  return null;
}

function markRoute(action, ctx) {
  const trip = crewTrip(ctx.run);
  if (!trip || trip.phase !== 'plan') return 'The lane is already picked.';
  const route = trip.routes.find(r => r.id === action.route);
  if (!route) return 'No such lane.';
  trip.crewMark = route.id;
  return null;
}

/** Applies a crew action to the run's step. Returns an error string, or null when it worked. */
export function actCrew(action, ctx) {
  if (!ctx.crew) return 'No crew aboard.';
  switch (action?.job) {
    case 'turret': return turret(action, ctx);
    case 'repair': return repair(action, ctx);
    case 'scan': return scan(ctx);
    case 'mark': return markRoute(action, ctx);
    default: return 'Unknown crew job.';
  }
}
