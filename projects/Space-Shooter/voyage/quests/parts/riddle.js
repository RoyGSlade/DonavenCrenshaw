// The four-glyph seal riddle, brought back for quests. It reuses the parked
// riddle's glyphs (systems/progression.js: ids, symbols and labels) and its
// rules from docs/stardust/RIDDLE-DESIGN.md: the four echoes say the order
// they were sealed in, the player returns them, the lock checks only a full
// answer and never says which slot was wrong. The parked post-Warden seal
// itself is untouched; here the order is rolled per quest, so the public
// answer to the old seal is not the answer here.
import { GLYPHS } from '../../../systems/progression.js';

const ORDINALS = ['first', 'second', 'third', 'last'];

export function createRiddle(params, ctx) {
  const order = ctx.rng.shuffle(GLYPHS.map(g => g.id));
  const mode = params.mode === 'same' ? 'same' : 'reverse';
  const answer = mode === 'reverse' ? [...order].reverse() : [...order];
  // The fragments are shown out of order, so the player has to read them.
  const shown = ctx.rng.shuffle(order);
  const fragments = shown.map(id => {
    const glyph = GLYPHS.find(g => g.id === id);
    return { id, symbol: glyph.symbol, label: glyph.label, text: `${glyph.label.toUpperCase()}: "I was sealed ${ORDINALS[order.indexOf(id)]}."` };
  });
  return {
    kind: 'riddle',
    title: params.title || 'The four echoes',
    instruction: mode === 'reverse'
      ? 'THE FOUR ECHOES REMEMBER THE OUTBOUND JOURNEY. RETURN THEM IN REVERSE ORDER.'
      : 'THE FOUR ECHOES REMEMBER THE OUTBOUND JOURNEY. RETURN THEM AS THEY WERE SEALED.',
    fragments,
    answer,
    attemptsLeft: params.attempts || 3,
    hintAtWis: params.hintAtWis || 5,
    hint: null,
    wrong: 0,
    done: false,
    outcome: null,
  };
}

export function viewRiddle(state) {
  return {
    title: state.title,
    instruction: state.instruction,
    fragments: state.fragments.map(f => ({ ...f })),
    pads: GLYPHS.map(g => ({ id: g.id, symbol: g.symbol, label: g.label })),
    attemptsLeft: state.attemptsLeft,
    hint: state.hint,
    wrong: state.wrong,
    done: state.done,
    outcome: state.outcome,
  };
}

export function actRiddle(state, action, ctx) {
  if (state.done) return { state };
  if (action?.type === 'giveUp') { state.done = true; state.outcome = 'failed'; return { state }; }
  if (action?.type !== 'answer') return { state, error: 'Unknown action' };
  const order = action.order;
  if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4 || order.some(id => !GLYPHS.some(g => g.id === id))) {
    return { state, error: 'Choose all four glyphs, each once.' };
  }
  if (order.every((id, i) => id === state.answer[i])) {
    state.done = true; state.outcome = 'solved';
    return { state };
  }
  state.wrong++;
  state.attemptsLeft--;
  if ((ctx.save.character?.stats?.wis || 0) >= state.hintAtWis && !state.hint) {
    const first = GLYPHS.find(g => g.id === state.answer[0]);
    state.hint = `Something in you is sure the first echo to return is ${first.label}.`;
  }
  if (state.attemptsLeft <= 0) { state.done = true; state.outcome = 'failed'; }
  return { state };
}
