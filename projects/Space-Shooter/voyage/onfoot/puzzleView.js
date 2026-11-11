// The power-routing puzzle on screen: a grid of conduit tiles as buttons.
// Click or tap a tile to turn it; arrow keys move between tiles and Enter or
// Space turns. Resolves { solved, moves, par } (solved false if you step away).
import { createPuzzle, rotateTile, parMoves, N, E, S, W } from './rules/puzzle.js';
import { createEl } from './dom.js';

export function playPuzzle(root, { id = 'lockbox', title = null, hintBonus = 0, freeHint = false, sound = () => {} } = {}) {
  const state = createPuzzle(id, { hintBonus, freeHint });
  const par = parMoves(id);
  const grid = createEl('div', { class: 'of-grid', role: 'grid', 'aria-label': 'Conduit tiles', style: `grid-template-columns: repeat(${state.cols}, 1fr)` });
  const status = createEl('p', { class: 'of-mine-status', role: 'status', 'aria-live': 'polite', text: 'Turn the tiles until power runs from the cell to the door.' });
  const leave = createEl('button', { type: 'button', text: 'Step away' });
  const panel = createEl('section', { class: 'of-panel of-puzzle', role: 'dialog', 'aria-label': title || state.name },
    createEl('p', { class: 'of-eyebrow', text: `PUZZLE · ${(title || state.name).toUpperCase()}` }),
    state.blurb ? createEl('p', { class: 'of-help', text: state.blurb }) : null, grid, status, leave);
  panel.__state = state;
  root.append(panel);
  let finish, focus = state.tiles.findIndex(t => !t.fixed && t.role !== 'empty');
  const buttons = state.tiles.map((t, i) => {
    const b = createEl('button', { type: 'button', class: `of-tile is-${t.role}`, role: 'gridcell', tabindex: i === focus ? '0' : '-1', dataset: { i: String(i) } },
      createEl('span', { class: 'of-arm of-arm-n' }), createEl('span', { class: 'of-arm of-arm-e' }), createEl('span', { class: 'of-arm of-arm-s' }), createEl('span', { class: 'of-arm of-arm-w' }), createEl('span', { class: 'of-hub' }));
    b.addEventListener('click', () => turnTile(i));
    b.addEventListener('keydown', (e) => move(e, i));
    grid.append(b);
    return b;
  });
  function label(t, i) {
    const open = [[N, 'up'], [E, 'right'], [S, 'down'], [W, 'left']].filter(([bit]) => t.mask & bit).map(([, n]) => n).join(', ');
    const role = t.role === 'source' ? 'Power cell' : t.role === 'sink' ? 'Door' : t.role === 'empty' ? 'Empty socket' : 'Conduit';
    return `${role}, row ${Math.floor(i / state.cols) + 1}, column ${(i % state.cols) + 1}${open ? `, open ${open}` : ''}${state.powered.includes(i) ? ', powered' : ''}`;
  }
  function paint() {
    state.tiles.forEach((t, i) => {
      const b = buttons[i];
      b.classList.toggle('on-n', Boolean(t.mask & N)); b.classList.toggle('on-e', Boolean(t.mask & E));
      b.classList.toggle('on-s', Boolean(t.mask & S)); b.classList.toggle('on-w', Boolean(t.mask & W));
      b.classList.toggle('is-powered', state.powered.includes(i));
      b.classList.toggle('is-hint', state.hint === i);
      b.setAttribute('aria-label', label(t, i));
      b.disabled = t.fixed || t.role === 'empty' || state.solved;
    });
  }
  function turnTile(i) {
    const before = state.powered.length;
    const hadHint = state.hint;
    const r = rotateTile(state, i);
    if (!r.ok) return;
    buttons[i].classList.remove('spin'); void buttons[i].offsetWidth; buttons[i].classList.add('spin');
    paint();
    sound(state.powered.length > before ? 'power' : 'turn');
    if (r.hint != null && r.hint !== hadHint && !r.solvedNow) status.textContent = 'Stuck? The glowing tile is the next one to turn.';
    if (r.solvedNow) {
      sound('unlock');
      panel.classList.add('is-solved');
      status.textContent = `${state.solvedText} ${state.moves} turns (par ${par}).`;
      leave.textContent = 'Continue';
      leave.classList.add('primary');
      leave.focus({ preventScroll: true });
    }
  }
  function move(e, i) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -state.cols, ArrowDown: state.cols }[e.key];
    if (!step) return;
    e.preventDefault();
    let j = i + step;
    if (j < 0 || j >= state.tiles.length) return;
    buttons[i].tabIndex = -1; buttons[j].tabIndex = 0; buttons[j].focus();
  }
  leave.addEventListener('click', () => { panel.remove(); finish({ solved: state.solved, moves: state.moves, par, id }); });
  paint();
  if (state.hint != null) status.textContent = 'Edna leaves one tile glowing: start there.';
  buttons[focus]?.focus({ preventScroll: true });
  const promise = new Promise((resolve) => { finish = resolve; });
  promise.state = state;
  promise.turn = turnTile;
  return promise;
}
