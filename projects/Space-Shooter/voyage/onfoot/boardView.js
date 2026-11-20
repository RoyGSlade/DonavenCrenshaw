// The crew board close-up (playtest 1, item 8): a full-screen view drawn in code (no picture needed). The names with red crosses, the last
// in pencil, and a few small notes tucked into the corners: tap one to read it. Resolves when the player goes back.
import { createEl } from './dom.js';
import { BOARD, noteFlag } from '../slice/board.js';

// Hand-drawn marker crosses: three wobbly variants (static strings, no player text).
const X_PATHS = [
  '<path d="M6 8 C 40 22, 90 40, 196 30 M10 34 C 60 24, 110 14, 190 6" />',
  '<path d="M4 6 C 50 12, 100 36, 198 34 M8 36 C 70 30, 120 12, 194 8 M30 10 C 80 22, 120 30, 170 36" />',
  '<path d="M8 10 C 56 20, 96 30, 192 36 M6 32 C 52 30, 118 18, 198 4" />',
];
const xSvg = (i) => `<svg viewBox="0 0 204 42" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g fill="none" stroke="#c4271c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".88">${X_PATHS[i % X_PATHS.length]}</g></svg>`;
const SCRIBBLE = '<svg viewBox="0 0 48 34" aria-hidden="true" focusable="false"><g fill="none" stroke="#3a3228" stroke-width="1.5" stroke-linecap="round" opacity=".7"><path d="M5 9 q4 -4 7 0 t7 0 t7 0 t8 0"/><path d="M5 16 q5 -4 8 0 t8 0 t9 0 t6 0"/><path d="M5 23 q4 -4 7 0 t9 0 t8 0"/></g></svg>';
const PIN_COLOURS = ['#e0463a', '#3aa0e0', '#f1c232', '#58c26b', '#d46ad8'];
const pin = (i) => createEl('i', { class: 'of-board-pin', style: `--pin:${PIN_COLOURS[i % PIN_COLOURS.length]}`, 'aria-hidden': 'true' });

/**
 * root: the floor. flags(): the save's flags (which notes were already found). onFound(note): called the first time a note is read.
 */
export function playBoard(root, { flags = () => ({}), onFound = () => {}, board = BOARD } = {}) {
  return new Promise((resolve) => {
    const seen = new Set(board.notes.filter((n) => flags()[noteFlag(n.id)]).map((n) => n.id));
    const plates = board.names.map((n, i) => createEl('li', { class: `of-board-plate${n.crossed ? ' is-crossed' : ''}${n.pencil ? ' is-pencil' : ''}`, dataset: { name: n.name } },
      pin(i + 1), createEl('span', { text: n.name }), n.crossed ? Object.assign(createEl('i', { class: 'of-board-x', 'aria-hidden': 'true' }), { innerHTML: xSvg(i) }) : null));
    const reading = createEl('p', { class: 'of-board-reading', role: 'status', 'aria-live': 'polite', hidden: true });
    const count = createEl('p', { class: 'of-board-count', hidden: true });
    const refresh = () => {
      count.hidden = !seen.size;
      count.replaceChildren(createEl('span', { text: board.words.found(seen.size) }), createEl('span', { class: 'of-board-pips', 'aria-hidden': 'true' }, ...board.notes.map((n) => createEl('i', { class: seen.has(n.id) ? 'is-on' : '' }))));
    };
    const scraps = board.notes.map((n, i) => {
      const b = createEl('button', { type: 'button', class: `of-board-note${seen.has(n.id) ? ' is-read' : ''}`, dataset: { note: n.id }, 'aria-label': `A note from ${n.from}`, style: `left:${n.at[0]}%;top:${n.at[1]}%;--tilt:${(i % 2 ? 1 : -1) * (4 + (i * 3) % 7)}deg` }, pin(i + 3));
      b.insertAdjacentHTML('beforeend', SCRIBBLE);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!seen.has(n.id)) { seen.add(n.id); b.classList.add('is-read'); onFound(n); }
        reading.hidden = false;
        reading.replaceChildren(createEl('b', { text: n.from }), createEl('span', { text: n.text }));
        refresh();
      });
      return b;
    });
    const back = createEl('button', { type: 'button', class: 'primary of-board-back', text: board.words.close });
    const panel = createEl('section', { class: 'of-board of-overlay', role: 'dialog', 'aria-label': board.words.label },
      createEl('div', { class: 'of-board-face' },
        createEl('p', { class: 'of-board-title', text: board.title }),
        createEl('ul', { class: 'of-board-plates' }, plates),
        createEl('i', { class: 'of-board-ring', 'aria-hidden': 'true' }), createEl('i', { class: 'of-board-scuff of-board-scuff-a', 'aria-hidden': 'true' }), createEl('i', { class: 'of-board-scuff of-board-scuff-b', 'aria-hidden': 'true' }),
        ...scraps),
      createEl('p', { class: 'of-board-hint', text: board.words.hint }), count, reading, back);
    const onKey = (e) => { if (['Escape', 'KeyE', 'Enter'].includes(e.code) && !e.target.closest?.('.of-board-note')) { e.preventDefault(); e.stopPropagation(); close(); } };
    function close() { removeEventListener('keydown', onKey, true); panel.remove(); resolve(); }
    back.addEventListener('click', close);
    panel.addEventListener('click', (e) => { if (e.target === panel) { if (!reading.hidden) reading.hidden = true; else close(); } });
    root.append(panel);
    refresh();
    setTimeout(() => addEventListener('keydown', onKey, true), 150);
    back.focus({ preventScroll: true });
  });
}
