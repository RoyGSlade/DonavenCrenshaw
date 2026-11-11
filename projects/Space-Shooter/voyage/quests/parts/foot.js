// On-foot fight: a placeholder hook. The on-foot layer is a later package (P9).
// Until then the fight resolves with one Constitution check, so quests that
// call for it can already be played and tested. A real on-foot fight replaces
// this by returning the same outcomes: win, lose or flee.
import { check } from '../core.js';

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

export function viewFoot(state) {
  return {
    title: state.title,
    enemy: { ...state.enemy },
    dc: state.dc,
    note: 'On-foot fights are not built yet. For now one Constitution roll decides it.',
    moves: [{ id: 'fight', label: 'Fight it out (Constitution)' }, { id: 'retreat', label: 'Back away' }],
    log: [...state.log],
    done: state.done,
    outcome: state.outcome,
  };
}

export function actFoot(state, action, ctx) {
  if (state.done) return { state };
  if (action?.move === 'retreat') { state.done = true; state.outcome = 'flee'; state.log.push('You back out the way you came.'); return { state }; }
  if (action?.move !== 'fight') return { state, error: 'Unknown move' };
  const r = check(ctx.save.character, { stat: 'con', tag: 'fight', dc: state.dc }, ctx.rng.next);
  state.log.push(`Roll ${r.roll}+${r.bonus} vs ${r.dc}: ${r.pass ? 'you come out on top' : 'you are beaten back'}.`);
  state.done = true;
  state.outcome = r.pass ? 'win' : 'lose';
  return { state };
}
