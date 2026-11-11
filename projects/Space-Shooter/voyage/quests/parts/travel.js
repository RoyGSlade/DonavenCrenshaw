// Travel and random events (P8), the simplest version: pick a destination on
// the sector map, pick a lane (fast or safe), then each jump is one short beat
// where a random event card may turn up. Cards offer a choice, a check, or a
// fight hook. Everything rolls from the run's seed.
import { SECTORS, LANES } from '../data/sectors.js';
import { EVENTS } from '../data/events.js';
import { check, meets, missing, skillBonus } from '../core.js';
import { rollEnemy } from '../rolls.js';
import { createSkirmish, viewSkirmish, actSkirmish, hullAfter } from './skirmish.js';

const neighbours = id => LANES.filter(lane => lane.includes(id)).map(lane => (lane[0] === id ? lane[1] : lane[0]));

// Cheapest path by a cost per sector entered.
function cheapest(from, to, cost) {
  const best = new Map([[from, { total: 0, path: [from] }]]);
  const open = [from];
  while (open.length) {
    open.sort((a, b) => best.get(a).total - best.get(b).total);
    const here = open.shift();
    for (const next of neighbours(here)) {
      const total = best.get(here).total + cost(next);
      if (!best.has(next) || total < best.get(next).total - 1e-9) {
        best.set(next, { total, path: [...best.get(here).path, next] });
        open.push(next);
      }
    }
  }
  return best.get(to)?.path || null;
}

export function routes(from, to) {
  if (!SECTORS[from] || !SECTORS[to]) return [];
  if (from === to) return [{ id: 'here', label: 'Already here', path: [from], risk: 0 }];
  const risk = path => path.slice(1).reduce((sum, id) => sum + SECTORS[id].danger, 0);
  const fast = cheapest(from, to, id => 1 + SECTORS[id].danger / 10);
  const safe = cheapest(from, to, id => SECTORS[id].danger + 0.05);
  const out = [{ id: 'fast', label: `Fast lane: ${fast.length - 1} jump${fast.length > 2 ? 's' : ''}`, path: fast, risk: risk(fast) }];
  if (safe.join() !== fast.join()) out.push({ id: 'safe', label: `Safe lane: ${safe.length - 1} jumps`, path: safe, risk: risk(safe) });
  return out;
}

// ---- Event cards -------------------------------------------------------

export function createCard(cardId) {
  if (!EVENTS[cardId]) throw new Error(`Unknown event card: ${cardId}`);
  return { kind: 'card', id: cardId, phase: 'choose', text: '', fight: null, fightOutcomes: null, done: false, outcome: null };
}

function applyOutcome(state, outcome, ctx) {
  state.text = outcome.text || '';
  if (outcome.reward) ctx.grant(outcome.reward);
  if (outcome.hull) ctx.run.hull = Math.max(1, Math.min(ctx.run.hullMax, ctx.run.hull + outcome.hull));
  if (outcome.fight) {
    const enemy = rollEnemy(outcome.fight.enemy, ctx.rng, outcome.fight);
    state.fight = createSkirmish({ enemy }, ctx);
    state.fightOutcomes = { win: outcome.win, lose: outcome.lose, flee: outcome.flee, parley: outcome.parley };
    state.phase = 'fight';
  } else state.phase = 'after';
}

export function viewCard(state, ctx) {
  const card = EVENTS[state.id];
  return {
    title: card.title,
    text: card.text,
    phase: state.phase,
    result: state.text,
    choices: card.choices.map((choice, index) => {
      const req = choice.requires || {};
      const reasons = [...missing(ctx.save, req)];
      if (choice.cost && !meets(ctx.save, { money: choice.cost.money, items: choice.cost.items })) reasons.push(...missing(ctx.save, { money: choice.cost.money, items: choice.cost.items }));
      return { index, label: choice.label, locked: reasons.length > 0, reasons };
    }),
    fight: state.fight ? viewSkirmish(state.fight) : null,
    done: state.done,
  };
}

export function actCard(state, action, ctx) {
  if (state.done) return { state };
  const card = EVENTS[state.id];
  if (state.phase === 'choose') {
    if (action?.type !== 'choose') return { state, error: 'Choose an option' };
    const choice = card.choices[action.index];
    if (!choice) return { state, error: 'No such option' };
    if (choice.requires && !meets(ctx.save, choice.requires)) return { state, error: missing(ctx.save, choice.requires)[0] };
    if (choice.cost && !ctx.spend(choice.cost)) return { state, error: 'Cannot afford that' };
    if (choice.check) {
      const r = check(ctx.save.character, choice.check, ctx.rng.next);
      ctx.log(`${choice.check.stat.toUpperCase()} check: ${r.roll}+${r.bonus} vs ${r.dc}, ${r.pass ? 'pass' : 'fail'}`);
      applyOutcome(state, r.pass ? choice.pass : choice.fail, ctx);
    } else applyOutcome(state, choice.outcome || {}, ctx);
    return { state };
  }
  if (state.phase === 'fight') {
    const result = actSkirmish(state.fight, action, ctx);
    if (result.error) return { state, error: result.error };
    if (state.fight.done) {
      ctx.run.hull = hullAfter(state.fight);
      const after = state.fightOutcomes[state.fight.outcome] || state.fightOutcomes.win || {};
      state.text = after.text || '';
      if (after.reward) ctx.grant(after.reward);
      state.phase = 'after';
    }
    return { state };
  }
  if (state.phase === 'after') {
    if (action?.type !== 'continue') return { state, error: 'Continue' };
    state.done = true;
    state.outcome = 'resolved';
  }
  return { state };
}

// ---- Trips -------------------------------------------------------------

export function eventChance(sectorId, params, ctx) {
  const base = SECTORS[sectorId]?.danger || 0;
  const nav = skillBonus(ctx.save.character, 'nav') * 0.05;
  return Math.max(0, Math.min(0.9, base + (params.risk || 0) - nav));
}

export function createTrip(params, ctx) {
  const from = ctx.run.location;
  const to = params.to;
  const options = routes(from, to);
  const state = { kind: 'trip', from, to, phase: 'plan', routes: options, path: null, leg: 0, card: null, seen: [], log: [], done: false, outcome: null, risk: params.risk || 0 };
  if (from === to) { state.done = true; state.outcome = 'arrived'; }
  return state;
}

export function viewTrip(state, ctx) {
  return {
    from: state.from,
    to: state.to,
    phase: state.phase,
    routes: state.routes.map(r => ({ ...r, path: [...r.path] })),
    path: state.path ? [...state.path] : null,
    at: state.path ? state.path[state.leg] : state.from,
    next: state.path && state.leg < state.path.length - 1 ? state.path[state.leg + 1] : null,
    card: state.card ? viewCard(state.card, ctx) : null,
    log: [...state.log],
    done: state.done,
  };
}

function arrive(state, ctx) {
  state.leg++;
  const here = state.path[state.leg];
  ctx.run.location = here;
  const sector = SECTORS[here];
  state.log.push(`Jumped to ${sector.name}.`);
  const roll = ctx.rng.next();
  if (roll < eventChance(here, state, ctx)) {
    const deck = sector.deck.filter(id => !state.seen.includes(id));
    const cardId = ctx.rng.pick(deck.length ? deck : sector.deck);
    state.seen.push(cardId);
    state.card = createCard(cardId);
    state.phase = 'card';
    state.log.push(`Event: ${EVENTS[cardId].title}.`);
  } else state.phase = state.leg >= state.path.length - 1 ? 'arrived' : 'leg';
}

export function actTrip(state, action, ctx) {
  if (state.done) return { state };
  if (state.phase === 'plan') {
    const route = state.routes.find(r => r.id === action?.route);
    if (action?.type !== 'route' || !route) return { state, error: 'Pick a lane' };
    state.path = [...route.path];
    state.leg = 0;
    state.log.push(`Plotted the ${route.id} lane.`);
    arrive(state, ctx);
    return { state };
  }
  if (state.phase === 'card') {
    const result = actCard(state.card, action, ctx);
    if (result.error) return { state, error: result.error };
    if (state.card.done) {
      state.card = null;
      state.phase = state.leg >= state.path.length - 1 ? 'arrived' : 'leg';
    }
    return { state };
  }
  if (action?.type !== 'continue') return { state, error: 'Continue' };
  if (state.phase === 'leg') arrive(state, ctx);
  else if (state.phase === 'arrived') { state.done = true; state.outcome = 'arrived'; }
  return { state };
}

// A quest "event" step: maybe draw one card from a deck, then carry on.
export function createEventStep(params, ctx) {
  const deck = params.deck || SECTORS[ctx.run.location]?.deck || [];
  const chance = params.chance ?? 1;
  const state = { kind: 'event', card: null, done: false, outcome: null };
  if (!deck.length || ctx.rng.next() >= chance) { state.done = true; state.outcome = 'none'; return state; }
  state.card = createCard(ctx.rng.pick(deck));
  return state;
}

export function viewEventStep(state, ctx) { return { card: state.card ? viewCard(state.card, ctx) : null, done: state.done }; }

export function actEventStep(state, action, ctx) {
  if (state.done) return { state };
  const result = actCard(state.card, action, ctx);
  if (result.error) return { state, error: result.error };
  if (state.card.done) { state.done = true; state.outcome = 'resolved'; }
  return { state };
}
