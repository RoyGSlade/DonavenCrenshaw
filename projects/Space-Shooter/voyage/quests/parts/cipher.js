// Cipher lock: the hacking minigame. Find a code of distinct symbols. After each
// full guess the lock says how many symbols are in the right slot and how many
// are in the code but in another slot. Turn based, so it plays the same with a
// keyboard (1-6, Backspace, Enter) or by tapping, and it is fully testable.
import { skillBonus } from '../core.js';

export const CIPHER_SYMBOLS = Object.freeze([
  { id: 0, symbol: '△', label: 'Delta', key: '1' },
  { id: 1, symbol: '◇', label: 'Diamond', key: '2' },
  { id: 2, symbol: '○', label: 'Ring', key: '3' },
  { id: 3, symbol: '□', label: 'Block', key: '4' },
  { id: 4, symbol: '✕', label: 'Cross', key: '5' },
  { id: 5, symbol: '☆', label: 'Star', key: '6' },
]);

export function scoreGuess(code, guess) {
  let exact = 0;
  const leftCode = new Map();
  const leftGuess = new Map();
  code.forEach((symbol, i) => {
    if (guess[i] === symbol) exact++;
    else {
      leftCode.set(symbol, (leftCode.get(symbol) || 0) + 1);
      leftGuess.set(guess[i], (leftGuess.get(guess[i]) || 0) + 1);
    }
  });
  let near = 0;
  for (const [symbol, n] of leftGuess) near += Math.min(n, leftCode.get(symbol) || 0);
  return { exact, near };
}

export function createCipher(params, ctx) {
  const length = params.length || 4;
  const symbols = Math.min(CIPHER_SYMBOLS.length, Math.max(length, params.symbols || 5));
  const c = ctx.save.character;
  const attempts = (params.attempts || 6) + Math.max(0, Math.floor(skillBonus(c, 'hack')));
  const code = ctx.rng.pickN([...Array(symbols).keys()], length);
  // A sharp eye (Wisdom 5+) reads the wear on one key: that slot starts known.
  const reveal = (c?.stats?.wis || 0) >= (params.revealAtWis || 5) ? ctx.rng.int(0, length - 1) : null;
  return {
    kind: 'cipher',
    title: params.title || 'Cipher lock',
    length, symbols, code,
    attemptsLeft: attempts, attempts,
    reveal: reveal === null ? null : { slot: reveal, symbol: code[reveal] },
    guesses: [],
    done: false,
    outcome: null,
  };
}

export function viewCipher(state) {
  return {
    title: state.title,
    length: state.length,
    symbols: CIPHER_SYMBOLS.slice(0, state.symbols),
    attemptsLeft: state.attemptsLeft,
    attempts: state.attempts,
    reveal: state.reveal,
    guesses: state.guesses.map(g => ({ ...g })),
    done: state.done,
    outcome: state.outcome,
    rules: `Find the ${state.length}-symbol code. No symbol repeats. After each try: "in place" counts symbols in the right slot, "elsewhere" counts symbols in the code but in another slot.`,
  };
}

export function actCipher(state, action) {
  if (state.done) return { state };
  if (action?.type === 'giveUp') {
    state.done = true; state.outcome = 'failed';
    return { state };
  }
  if (action?.type !== 'guess') return { state, error: 'Unknown action' };
  const guess = action.code;
  if (!Array.isArray(guess) || guess.length !== state.length || guess.some(s => !Number.isInteger(s) || s < 0 || s >= state.symbols)) {
    return { state, error: `Enter ${state.length} symbols.` };
  }
  const { exact, near } = scoreGuess(state.code, guess);
  state.guesses.push({ code: [...guess], exact, near });
  state.attemptsLeft--;
  if (exact === state.length) { state.done = true; state.outcome = 'solved'; }
  else if (state.attemptsLeft <= 0) { state.done = true; state.outcome = 'failed'; }
  return { state };
}
