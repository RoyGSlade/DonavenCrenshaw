// The tutorial puzzle: route power to a door. A grid of conduit tiles; tap a
// tile to turn it a quarter. When an unbroken line runs from the power cell to
// the door, the door opens. Pure: the page shows it and sends turns.

export const N = 1, E = 2, S = 4, W = 8;
import PUZZLES from '../../maps/puzzles.json' with { type: 'json' };
import TUNING from '../tuning.json' with { type: 'json' };

const DIRS = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
export const turn = m => ((m << 1) | (m >> 3)) & 15;

const LETTER = { N, E, S, W };
const mask = text => [...text].reduce((m, ch) => m | (LETTER[ch] || 0), 0);

// Layouts live in voyage/maps/puzzles.json in their SOLVED state: each cell
// lists its openings, '*' marks the power cell, '@' the lock (both fixed), '-'
// an empty socket. `turns` scrambles them, so a layout is solvable by construction.
export const LAYOUTS = Object.freeze(PUZZLES);

export function createPuzzle(id = 'lockbox', { hintBonus = 0 } = {}) {
  const layout = LAYOUTS[id];
  if (!layout) throw new Error(`Unknown puzzle ${id}`);
  const tiles = layout.cells.map((cell, i) => {
    const fixed = cell.startsWith('*') || cell.startsWith('@');
    const solved = mask(cell.replace(/[*@-]/g, ''));
    let m = solved;
    if (!fixed) for (let k = 0; k < (layout.turns[i] || 0); k++) m = turn(m);
    return { mask: m, solved, fixed, line: onLine(layout, i), role: cell.startsWith('*') ? 'source' : cell.startsWith('@') ? 'sink' : cell === '-' ? 'empty' : 'conduit' };
  });
  // Hints: after `hintAfter` turns that don't add power, one wrong tile on the
  // solution line glows. Wisdom's hint tag brings it one turn sooner per point
  // (contract section 6; the old "Wisdom 6 starts with a hint" boon is gone).
  const state = { id, name: layout.name, blurb: layout.blurb || '', solvedText: layout.solvedText || 'Power is through.', cols: layout.cols, rows: layout.rows, tiles, moves: 0, solved: false, powered: [],
    hintAfter: Math.max(2, TUNING.puzzleHintAfter - Math.round(hintBonus)), idle: 0, best: 0, hint: null };
  refresh(state);
  if (state.solved) throw new Error(`Puzzle ${id} starts solved`);
  state.best = state.powered.length;
  return state;
}

/** Indexes of tiles with power, by flood from the source along matching openings. */
export function poweredSet(state) {
  const { cols, rows, tiles } = state;
  const start = tiles.findIndex(t => t.role === 'source');
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift();
    const x = i % cols, y = Math.floor(i / cols);
    for (const [bit, dx, dy, back] of DIRS) {
      if (!(tiles[i].mask & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen.has(j) || !(tiles[j].mask & back)) continue;
      seen.add(j); queue.push(j);
    }
  }
  return seen;
}

function refresh(state) {
  const set = poweredSet(state);
  state.powered = [...set].sort((a, b) => a - b);
  state.solved = state.tiles.some((t, i) => t.role === 'sink' && set.has(i));
}

// A tile is right when it matches its solved openings (straights either way round).
const isRight = t => t.mask === t.solved;

/** The next tile to fix: on the line out from the power, the first one that's wrong. */
export function nextHint(state) {
  const wrong = state.tiles.map((t, i) => (!t.fixed && t.role === 'conduit' && t.line && !isRight(t) ? i : -1)).filter(i => i >= 0);
  if (!wrong.length) return null;
  const powered = new Set(state.powered);
  // Prefer a wrong tile next to the powered area, so the hint reads as "this one next".
  const { cols } = state;
  const near = wrong.find(i => [i - 1, i + 1, i - cols, i + cols].some(j => powered.has(j)));
  return near ?? wrong[0];
}

/** Turns tile i a quarter clockwise. Returns { ok, solvedNow, hint }. */
export function rotateTile(state, i) {
  const t = state.tiles[i];
  if (!t || t.fixed || t.role === 'empty' || state.solved) return { ok: false, solvedNow: false, hint: state.hint };
  t.mask = turn(t.mask);
  state.moves++;
  refresh(state);
  if (state.powered.length > state.best) { state.best = state.powered.length; state.idle = 0; } else state.idle++;
  if (state.hint === i && isRight(t)) state.hint = null;
  if (!state.solved && state.hint == null && state.idle >= state.hintAfter) { state.hint = nextHint(state); state.idle = 0; }
  if (state.solved) state.hint = null;
  return { ok: true, solvedNow: state.solved, hint: state.hint };
}

// Is cell i on the solved line from the power cell to the lock?
function onLine(layout, i) {
  const tiles = layout.cells.map(c => ({ mask: mask(c.replace(/[*@-]/g, '')), role: c.startsWith('*') ? 'source' : 'x' }));
  return poweredSet({ cols: layout.cols, rows: layout.rows, tiles }).has(i);
}

/** The fewest turns to solve from the start (each tile back to its solved openings). */
export function parMoves(id) {
  const layout = LAYOUTS[id];
  return layout.cells.reduce((n, cell, i) => {
    if (/[*@]/.test(cell) || cell === '-') return n;
    const solved = mask(cell);
    if (!onLine(layout, i)) return n;
    // Straight pieces repeat every half turn.
    const t = (layout.turns[i] || 0) % 4;
    const symmetric = solved === (N | S) || solved === (E | W);
    return n + (symmetric ? (4 - t) % 2 : (4 - t) % 4);
  }, 0);
}
