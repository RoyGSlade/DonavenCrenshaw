// On-foot fight. Two ways to play it, both ending in the same outcomes (win,
// lose or flee): one Constitution check, or live, on the on-foot layer's
// free-aim shooter (voyage/onfoot): the view carries `live: { kind: 'foot',
// setup }` and the page reports { type: 'live', outcome, hp } when the fight
// is over. The roll stays, so a quest plays without the live layer (tests,
// crew, a phone that would rather not).
import { check, rollText } from '../core.js';
import { questFightSetup } from '../../onfoot/rules/shooter.js';

const LIVE_OUTCOMES = ['win', 'lose', 'flee'];

export function createFoot(params) {
  return {
    kind: 'foot',
    title: params.title || 'On foot',
    enemy: structuredClone(params.enemy || { name: 'Guards', hp: 20 }),
    dc: params.dc || 7,
    log: [],
    done: false,
    outcome: null,
  };
}

export function viewFoot(state, ctx = {}) {
  return {
    title: state.title,
    enemy: { ...state.enemy },
    dc: state.dc,
    note: 'Fight it live on foot, or let one Constitution roll decide it.',
    live: { kind: 'foot', setup: questFightSetup(state.enemy, (ctx.run?.seed ?? 1) + (ctx.run?.steps ?? 0)) },
    moves: [{ id: 'fight', label: 'Fight it out (Constitution)' }, { id: 'retreat', label: 'Back away' }],
    log: [...state.log],
    done: state.done,
    outcome: state.outcome,
  };
}

export function actFoot(state, action, ctx) {
  if (state.done) return { state };
  if (action?.type === 'live') {
    if (!LIVE_OUTCOMES.includes(action.outcome)) return { state, error: 'Unknown fight result' };
    state.done = true;
    state.outcome = action.outcome;
    state.log.push(action.outcome === 'win' ? 'You fight it out on foot and walk away.' : action.outcome === 'flee' ? 'You get out the way you came.' : 'They put you on the floor.');
    return { state };
  }
  if (action?.move === 'retreat') { state.done = true; state.outcome = 'flee'; state.log.push('You back out the way you came.'); return { state }; }
  if (action?.move !== 'fight') return { state, error: 'Unknown move' };
  const r = check(ctx.save.character, { stat: 'con', tag: 'fight', dc: state.dc }, ctx.rng.next);
  state.log.push(`Roll ${rollText(r)}: ${r.pass ? 'you come out on top' : 'you are beaten back'}.`);
  state.done = true;
  state.outcome = r.pass ? 'win' : 'lose';
  return { state };
}
