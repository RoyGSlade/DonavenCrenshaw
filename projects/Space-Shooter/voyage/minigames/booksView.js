// A training book page on screen: crafting reads like a blueprint sheet, repair like a stained service manual, hacking like an ops
// terminal manual (its look is in trainer.css, keyed by data-skill). It draws one page and its question; the caller (the trainer) keeps the
// state: which page, the shuffled order, and the answer so far. Nothing here pays anything: it calls onAnswer(position) and onNext().
import { lineParts, shelf as shelfOf, pageXp, PAGES } from './books.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); } el.append(...kids.filter(Boolean)); return el; };

/** The look and the names of each book. */
export const BOOKS = Object.freeze({
  crafting: { look: 'craft', name: 'Fabrication sheets', stamp: 'FAB-12', tag: 'BLUEPRINT SHEET' },
  repair: { look: 'repair', name: 'Coolant line service manual', stamp: 'SERVICE COPY', tag: 'SERVICE MANUAL' },
  hacking: { look: 'hack', name: 'Ops terminal manual', stamp: 'CLEARANCE 3', tag: 'OPS TERMINAL' },
});

/**
 * ctx: { skill, page (or null), order, learned (the page is learned), answered: null | { position, right, said, reread }, level, learnedMap, canAnswer: { ok, reason } }.
 * handlers: { onAnswer(position), onNext() }.
 */
export function renderBook(root, ctx, { onAnswer, onNext }) {
  const { skill, page, order, answered, level, learnedMap = {}, canAnswer = { ok: true, reason: '' } } = ctx;
  const book = BOOKS[skill];
  const sh = shelfOf(skill, level, learnedMap);
  const shelfLine = `${sh.learned} of ${sh.unlocked} open pages learned${sh.nextUnlock ? ` · ${sh.nextCount} more at level ${sh.nextUnlock}` : ''}`;
  const wrap = h('section', { class: `bk-book bk-${book.look}`, 'data-skill': skill, 'data-look': book.look, 'aria-label': book.name });
  const head = h('header', { class: 'bk-head' }, h('b', { class: 'bk-tag', text: book.tag }), h('span', { class: 'bk-shelf', text: shelfLine }));
  wrap.append(head);
  if (!page) {
    wrap.append(h('div', { class: 'bk-paper bk-empty' },
      h('h3', { class: 'bk-title', text: 'Every open page is learned' }),
      h('p', { text: sh.nextUnlock ? `You have read everything this book has open to your level. ${sh.nextCount} more page${sh.nextCount === 1 ? '' : 's'} open at level ${sh.nextUnlock}. Level up in the field and come back.` : 'You have read the whole book. Pages pay once, so there is no more XP in it.' })));
    root.append(wrap); return wrap;
  }
  const n = PAGES.filter((p) => p.skill === skill).findIndex((p) => p.id === page.id) + 1;
  const total = PAGES.filter((p) => p.skill === skill).length;
  const refs = new Set(answered && !answered.right ? answered.reread || [] : []);
  const para = h('p', { class: 'bk-text' });
  page.lines.forEach((text, i) => {
    const num = i + 1;
    const line = h('span', { class: `bk-l${refs.has(num) ? ' is-ref' : ''}`, 'data-line': String(num) }, h('sup', { class: 'bk-n', text: String(num) }));
    for (const part of lineParts(text)) line.append(part.redacted ? h('span', { class: 'bk-redact', 'aria-label': 'redacted', title: 'redacted', text: part.text }) : document.createTextNode(part.text));
    para.append(line, ' ');
  });
  const pays = ctx.learned ? 'Learned: pays no more XP' : `Pays ${pageXp(page)} XP the first time you answer it right`;
  const paper = h('div', { class: 'bk-paper' },
    h('p', { class: 'bk-sheet', text: `${book.stamp} · page ${n} of ${total} · level ${page.level}` }),
    h('h3', { class: 'bk-title', text: page.title }), para, h('p', { class: 'bk-pays', text: pays }));
  const q = h('div', { class: 'bk-ask' }, h('h4', { class: 'bk-q', text: page.question }));
  const list = h('div', { class: 'bk-choices', role: 'group', 'aria-label': 'Choices' });
  order.forEach((orig, position) => {
    const state = answered ? (orig === page.answer ? 'is-right' : answered.position === position ? 'is-wrong' : '') : '';
    const b = h('button', { type: 'button', class: `bk-choice ${state}`, 'data-pos': String(position), 'data-right': orig === page.answer ? '1' : null, disabled: Boolean(answered) || !canAnswer.ok, title: !canAnswer.ok ? canAnswer.reason : null },
      h('i', { class: 'bk-key', text: String.fromCharCode(65 + position) }), h('span', { text: page.choices[orig] }));
    b.addEventListener('click', () => onAnswer(position));
    list.append(b);
  });
  q.append(list);
  wrap.append(paper, q);
  if (!canAnswer.ok && !answered) wrap.append(h('p', { class: 'bk-note is-warn', role: 'status', text: canAnswer.reason }));
  if (answered) {
    const out = h('div', { class: `bk-out ${answered.right ? 'is-right' : 'is-wrong'}`, role: 'status', 'data-right': answered.right ? '1' : '0' }, h('p', { text: answered.said }));
    const next = h('button', { type: 'button', class: 'primary ui-btn bk-next', text: answered.right ? 'Next page' : 'Back in the pile: next page' });
    next.disabled = true; setTimeout(() => { next.disabled = false; }, 450); // a phone tap on a choice must not click through to the button that replaces it
    next.addEventListener('click', onNext);
    out.append(next); wrap.append(out);
  }
  root.append(wrap);
  return wrap;
}
