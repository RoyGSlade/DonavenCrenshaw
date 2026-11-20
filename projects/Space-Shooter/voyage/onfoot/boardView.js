// The crew board close-up (playtest 1, item 8): a full-screen view drawn in code (no picture needed). The names with red crosses, the last
// in pencil, and a few small notes tucked into the corners: tap one to read it. Resolves when the player goes back.
import { createEl } from './dom.js';
import { BOARD, noteFlag } from '../slice/board.js';

/**
 * root: the floor. flags(): the save's flags (which notes were already found). onFound(note): called the first time a note is read.
 */
export function playBoard(root, { flags = () => ({}), onFound = () => {}, board = BOARD } = {}) {
  return new Promise((resolve) => {
    const seen = new Set(board.notes.filter((n) => flags()[noteFlag(n.id)]).map((n) => n.id));
    const plates = board.names.map((n) => createEl('li', { class: `of-board-plate${n.crossed ? ' is-crossed' : ''}${n.pencil ? ' is-pencil' : ''}`, dataset: { name: n.name } },
      createEl('span', { text: n.name }), n.crossed ? createEl('i', { class: 'of-board-x', 'aria-hidden': 'true' }) : null));
    const reading = createEl('p', { class: 'of-board-reading', role: 'status', 'aria-live': 'polite', hidden: true });
    const count = createEl('p', { class: 'of-board-count', hidden: true });
    const refresh = () => { count.hidden = !seen.size; count.textContent = board.words.found(seen.size, board.notes.length); };
    const scraps = board.notes.map((n) => {
      const b = createEl('button', { type: 'button', class: `of-board-note${seen.has(n.id) ? ' is-read' : ''}`, dataset: { note: n.id }, 'aria-label': `A note from ${n.from}`, style: `left:${n.at[0]}%;top:${n.at[1]}%` });
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
