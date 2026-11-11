// Plays a quest down every path a player could take, using only real actions,
// and reports which nodes and endings were reached. Tests use it to prove every
// branch is reachable; a quest writer can use it to find dead ends.
// Fights are explored as whole-fight tactics (always fire, always break off,
// hail, evade then fire) rather than every move, which keeps the tree small.
import { startQuest, view, act } from './engine.js';

const FIGHT_TACTICS = ['fire', 'flee', 'hail', 'evade-fire'];

function partActions(part, run) {
  const state = run.part.state;
  switch (part.kind) {
    case 'skirmish': return FIGHT_TACTICS.map(tactic => ({ macro: 'fight', tactic }));
    case 'foot': return [{ move: 'fight' }, { move: 'retreat' }];
    case 'cipher': return [{ type: 'guess', code: [...state.code] }, { type: 'giveUp' }];
    case 'riddle': return [{ type: 'answer', order: [...state.answer] }, { type: 'giveUp' }];
    case 'race': return [
      { type: 'quick', style: 'clean' }, { type: 'quick', style: 'push' },
      { type: 'live', timeMs: state.targetMs - 500, finished: true }, { type: 'live', timeMs: state.targetMs + 500, finished: true },
    ];
    case 'trip': return tripActions(part);
    case 'event': return cardActions(part.card);
    default: return [];
  }
}

function cardActions(card) {
  if (!card) return [];
  if (card.phase === 'choose') return card.choices.filter(c => !c.locked).map(c => ({ type: 'choose', index: c.index }));
  if (card.phase === 'fight') return FIGHT_TACTICS.map(tactic => ({ macro: 'fight', tactic }));
  return [{ type: 'continue' }];
}

function tripActions(part) {
  if (part.phase === 'plan') return part.routes.map(r => ({ type: 'route', route: r.id }));
  if (part.phase === 'card') return cardActions(part.card);
  return [{ type: 'continue' }];
}

export function actionsFor(quest, run, save) {
  const v = view(quest, run, save);
  if (v.type === 'dialogue' && !run.part) return v.choices.filter(c => !c.locked).map(c => ({ type: 'choose', index: c.index }));
  if (v.part) return partActions(v.part, run);
  return [];
}

// One fight tactic, played round after round until the fight is over.
function tacticMove(tactic, round) {
  if (tactic === 'evade-fire') return { move: round < 2 ? 'evade' : 'fire' };
  return { move: tactic };
}

function inFight(run) {
  const p = run.part;
  if (!p) return false;
  if (p.kind === 'skirmish') return !p.state.done;
  const card = p.kind === 'trip' ? p.state.card : p.kind === 'event' ? p.state.card : null;
  return Boolean(card && card.phase === 'fight' && !card.fight.done);
}

export function apply(quest, run, save, action) {
  if (action.macro !== 'fight') return act(quest, run, save, action, { now: 1 });
  let state = { run, save, events: [] };
  for (let round = 0; round < 200 && inFight(state.run); round++) {
    const next = act(quest, state.run, state.save, tacticMove(action.tactic, round), { now: 1 });
    if (next.error) return next;
    state = next;
  }
  return state;
}

export function explore(quest, save, { seeds = [1], limit = 50000 } = {}) {
  const nodes = new Set();
  const ends = new Map();
  let leaves = 0;
  let errors = [];
  for (const seed of seeds) {
    const start = startQuest(quest, save, { seed });
    const stack = [{ run: start.run, save: start.save, path: [] }];
    while (stack.length && leaves < limit) {
      const { run, save: s, path } = stack.pop();
      nodes.add(run.node);
      for (const id of Object.keys(run.visits)) nodes.add(id);
      if (run.ended) {
        leaves++;
        const key = run.ended.node;
        if (!ends.has(key)) ends.set(key, { seed, path, result: run.ended.result, outcome: run.ended.outcome });
        continue;
      }
      const options = actionsFor(quest, run, s);
      if (!options.length) { errors.push(`${quest.id}: stuck at ${run.node} (seed ${seed})`); continue; }
      for (const action of options) {
        const next = apply(quest, run, s, action);
        if (next.error) { errors.push(`${quest.id}: ${next.error} at ${run.node}`); continue; }
        stack.push({ run: next.run, save: next.save, path: [...path, action] });
      }
    }
  }
  errors = [...new Set(errors)];
  return { nodes, ends, leaves, errors };
}
