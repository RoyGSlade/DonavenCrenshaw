// Live ship fights on today's Dogfight combat. Dogfight's simulation
// (dogfight/simulation.js) is pure and deterministic; this bridge only builds a
// match from a quest's rolled enemy, drives the enemy seat with a small brain
// that follows the rolled movement, and reads the result back. Dogfight's own
// code, rules and records are not changed (and quest fights write no board).
//
// Scale: Dogfight shots all do RULES.damage. To keep the quest's numbers
// (enemy hp, your gun damage, their damage, your hull) meaningful, each side's
// Dogfight hp is set to "hits it can take" x RULES.damage.
import { createMatch, stepMatch, RULES, NEUTRAL } from '../../../dogfight/simulation.js';

const CLASS_FOR_MOVEMENT = Object.freeze({ strafe: 'light', orbit: 'medium', charge: 'heavy', hold: 'heavy' });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const avg = range => (Array.isArray(range) ? (range[0] + range[1]) / 2 : range || 8);

export function liveFightSetup(enemy, { hull, damage }, seed = 1) {
  const enemyHits = Math.max(1, (enemy.hp + ((enemy.abilities || []).includes('shield') ? 15 : 0)) / Math.max(1, damage));
  const playerHits = Math.max(1, hull / avg(enemy.damage));
  return {
    seed: seed >>> 0,
    map: 'classic',
    classes: ['medium', CLASS_FOR_MOVEMENT[enemy.movement] || 'medium'],
    hp: [Math.round(playerHits * RULES.damage), Math.round(enemyHits * RULES.damage)],
    hitValue: [avg(enemy.damage), damage],
    movement: enemy.movement,
    hull,
  };
}

export function createLiveFight(setup) {
  const loadouts = [
    { classId: setup.classes[0], bodyColor: '#53687d', accentColor: '#81e6df' },
    { classId: setup.classes[1], bodyColor: '#4a3a2e', accentColor: '#ffad72' },
  ];
  const match = createMatch(setup.seed, 1, loadouts, setup.map, 'duel');
  match.ships[0].hp = setup.hp[0];
  match.ships[1].hp = setup.hp[1];
  match.ships.forEach((ship, i) => { ship.hpMax = setup.hp[i]; });
  return match;
}

// The enemy pilot. Movement styles from the quest roll:
//   charge: nose on you, full thrust, fire when lined up
//   strafe: keep a middle range and slide sideways
//   orbit:  circle at range, turning in to shoot
//   hold:   sit still and turret
export function enemyInput(match, movement, seat = 1) {
  const me = match.ships[seat];
  const you = match.ships[seat === 1 ? 0 : 1];
  if (!me || !you || me.hp <= 0) return NEUTRAL;
  const dx = you.x - me.x, dy = you.y - me.y;
  const range = Math.hypot(dx, dy) || 1;
  const lead = range / RULES.bulletSpeed;
  const aim = Math.atan2(dy + (you.vy || 0) * lead, dx + (you.vx || 0) * lead);
  let want = aim;
  let thrust = false;
  let strafe = 0;
  const t = match.tick / 60;
  if (movement === 'charge') thrust = range > 3;
  else if (movement === 'strafe') { thrust = range > 9; strafe = Math.sin(t * 1.3) > 0 ? 1 : -1; }
  else if (movement === 'orbit') { want = range > 7 ? aim : aim + Math.PI / 2.4; thrust = true; }
  const error = wrap(want - me.angle);
  const aimError = Math.abs(wrap(aim - me.angle));
  return {
    ...NEUTRAL,
    turn: Math.max(-1, Math.min(1, error * 3)),
    thrust,
    strafe,
    brake: movement === 'hold' || (movement === 'strafe' && range < 5),
    fire: aimError < 0.18 && range < 16,
  };
}

export function stepLiveFight(match, playerInput, setup) {
  return stepMatch(match, [playerInput || NEUTRAL, enemyInput(match, setup.movement)], RULES.step);
}

// null while the fight is on; then { outcome, hull } for the quest.
export function liveFightResult(match, setup) {
  if (match.phase !== 'finished') return null;
  const [player, enemy] = match.ships;
  const hull = Math.max(1, Math.round((player.hp / RULES.damage) * setup.hitValue[0]));
  if (player.hp <= 0) return { outcome: 'lose', hull: 1 };
  if (enemy.hp <= 0) return { outcome: 'win', hull: Math.min(setup.hull, hull) };
  return { outcome: 'flee', hull: Math.min(setup.hull, hull) }; // time ran out: they break off
}
