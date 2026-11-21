// The training books, pure (Donaven 2026-11-19): read a page, answer a question, get XP. Crafting, repair and hacking each have a book of
// pages (bookPages.js), grouped by the level that unlocks them. A page pays its XP once, the first time it is answered right, and is then
// "learned" and pays nothing; a wrong answer pays nothing, says which line held the answer, and the page goes back into the pile. The choices
// are shuffled every time. The hour's cap and the entry fee belong to trainer.js; this module only knows pages, orders and what a page is worth.
import { PAGES, BOOK_SKILLS } from './bookPages.js';

export { PAGES, BOOK_SKILLS };
/** XP a page pays the first time it is answered right, by the level that unlocks it (placeholders for the economy tune). */
export const PAGE_XP = Object.freeze({ 1: 2, 3: 3, 6: 4 });
export const pageXp = (page) => PAGE_XP[page.level] ?? 2;
export const pageById = (id) => PAGES.find((p) => p.id === id) || null;
export const pagesOf = (skill) => PAGES.filter((p) => p.skill === skill);
/** The pages of a skill that its level has unlocked. */
export const unlockedPages = (skill, level) => pagesOf(skill).filter((p) => p.level <= level);
export const isLearned = (learned, id) => Boolean(learned?.[id]);
/** { total, unlocked, learned, next: the level that unlocks more pages (or null) } for the book's shelf. */
export function shelf(skill, level, learned = {}) {
  const all = pagesOf(skill), open = unlockedPages(skill, level);
  const later = all.filter((p) => p.level > level).map((p) => p.level);
  return { total: all.length, unlocked: open.length, learned: open.filter((p) => isLearned(learned, p.id)).length, nextUnlock: later.length ? Math.min(...later) : null, nextCount: later.length ? later.filter((l) => l === Math.min(...later)).length : 0 };
}

/**
 * The next page to read: the next unlocked page you have not learned, after `after` (a page id) in book order, going round to the start.
 * A page answered wrong therefore comes back after the others. Returns null when every unlocked page is learned.
 */
export function nextPage(skill, level, learned = {}, after = null) {
  const open = unlockedPages(skill, level);
  const todo = open.filter((p) => !isLearned(learned, p.id));
  if (!todo.length) return null;
  const at = open.findIndex((p) => p.id === after);
  for (let k = 1; k <= open.length; k++) {
    const p = open[(((at < 0 ? -1 : at) + k) % open.length + open.length) % open.length];
    if (!isLearned(learned, p.id)) return p;
  }
  return todo[0];
}

/**
 * A shuffled order of the page's choices, as the indexes into page.choices. Never the written order and never `avoid` (the last order shown),
 * so the same page reads differently each time. `rng()` is in [0, 1).
 */
export function shuffledOrder(page, rng = Math.random, avoid = null) {
  const n = page.choices.length, same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const ident = Array.from({ length: n }, (_, i) => i);
  let order = ident;
  for (let tries = 0; tries < 50; tries++) {
    order = ident.slice();
    for (let i = n - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [order[i], order[j]] = [order[j], order[i]]; }
    if (!same(order, ident) && !same(order, avoid)) return order;
  }
  return ident.slice().reverse(); // a rng that never moves (a stuck test double) still gets a different order
}

/** Is the choice shown at `position` (in `order`) the right one? */
export const isRight = (page, order, position) => order[position] === page.answer;
/** The line numbers a wrong answer points at: "Reread line 2." / "Reread lines 2 and 3." */
export function rereadWords(page) {
  const l = page.line;
  return l.length === 1 ? `Reread line ${l[0]}.` : `Reread lines ${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}.`;
}
/** Split `[[redacted]]` flavour out of a line: [{ text, redacted }]. */
export function lineParts(text) {
  const out = []; let last = 0;
  for (const m of text.matchAll(/\[\[(.*?)\]\]/g)) { if (m.index > last) out.push({ text: text.slice(last, m.index), redacted: false }); out.push({ text: m[1], redacted: true }); last = m.index + m[0].length; }
  if (last < text.length) out.push({ text: text.slice(last), redacted: false });
  return out;
}
/** The page's words with the redactions removed (what a test counts and a screen reader would not skip). */
export const pageWords = (page) => page.lines.join(' ').replace(/\[\[.*?\]\]/g, '').replace(/\s+/g, ' ').trim();
