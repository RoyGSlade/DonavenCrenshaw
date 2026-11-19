// The trainer, pure (Donaven 2026-11-19: "for the trainer each one should be a specific skill ... you get XP, not a skill point").
// What each skill trains with, and how a training result is paid. Training pays XP into the skill: it never pays or spends a skill point
// (points still come from levels, and the picker spends them). Three kinds of training:
//   gallery  shooting: the shooting gallery (gallery.js)
//   book     crafting, repair, hacking: read a page, answer a question (books.js)
//   replay   stealth, piloting, social: the gym's replay of the mini-game at a Steady roll (gym.js), as before
//   sectors  navigation: Perihelion's five trainer sectors, unlocked in order; stars pay 2 XP each, once (perihelionEntry.js trainerSettle)
// The entry fee (GYM.cost) is the gym's, unchanged, for a gallery round or a replay. The hour's cap is GYM.capXp for replays and GALLERY_CAP_XP for the
// gallery. Book pages are free and exempt from the cap (they pay once). All placeholders for the economy tune.
import { GYM, gymGamesFor, leftThisHour, paidThisHour, trainRun } from './gym.js';
import { setupShooting, SHOOTING_LESSONS } from './setup.js';
import { TRAINER_SECTORS, trainerSettle } from './perihelionEntry.js';
import { pageById, pageXp, isLearned, rereadWords, isRight } from './books.js';

/** The kind of training a skill has. */
export const TRAINING = Object.freeze({
  shooting: 'gallery', crafting: 'book', repair: 'book', hacking: 'book',
  stealth: 'replay', piloting: 'replay', social: 'replay', navigation: 'sectors',
});
export const trainingOf = (skill) => TRAINING[skill] || 'replay';
/** The skills in the rail, in the order the skills menu shows them. */
export const RAIL = Object.freeze(['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation']);
/** Each skill's colour, from the skills UI kit (launch/skillkit/HANDOFF.md). */
export const SKILL_COLOURS = Object.freeze({ shooting: '#ff7a59', piloting: '#4fc3f7', stealth: '#9c8cff', hacking: '#3ddc97', repair: '#5ee6e6', crafting: '#ffb547', social: '#ff8ac4', navigation: '#c8e06b' });

/** The gallery lessons a level has unlocked: [{ ...lesson, open }]. */
export const lessonsFor = (level) => SHOOTING_LESSONS.map((l) => ({ ...l, open: level >= l.unlockLevel }));
/** The gallery setup for a level, the points spent and a lesson (never a lesson the level has not opened). */
export function gallerySetup({ level = 1, points = {}, lesson = 1 } = {}) {
  const open = lessonsFor(level).filter((l) => l.open).map((l) => l.id);
  return setupShooting({ level, points, lesson: open.includes(lesson) ? lesson : 1 });
}

/** The gallery's own cap (Erik 2026-11-19): 30 XP per hour, about three good rounds. The replay gym keeps GYM.capXp. Placeholder for the economy tune. */
export const GALLERY_CAP_XP = 30;
/** XP the gallery will still pay this hour. */
export const galleryLeft = (log = {}, now = 0) => Math.max(0, GALLERY_CAP_XP - paidThisHour(log, 'shooting', now));

/** Can a gallery round or a gym replay be started now? Book pages are free and uncapped, so they never ask. */
export function canStart(skill, { credits = 0, log = {}, now = 0 } = {}) {
  if (credits < GYM.cost) return { ok: false, reason: `The gym costs ${GYM.cost} credits and you have ${credits}.` };
  const left = skill === 'shooting' ? galleryLeft(log, now) : leftThisHour(log, skill, now);
  if (left <= 0) return { ok: false, reason: `The gym has paid all it will for ${skill} this hour. Come back later.` };
  return { ok: true, reason: '' };
}

const record = (log, skill, now, paid) => (paid > 0 ? { ...log, [skill]: [...(log[skill] || []).filter((e) => e.at > now - GYM.windowMs), { at: now, xp: paid }] } : log);

/**
 * Settle a gallery round: the fee is taken for the round, the XP is the result's, up to the gallery's hourly cap. Never mutates its inputs.
 * Returns { ok, credits, paid, log, said }. XP only: no skill point is ever paid.
 */
export function settleGallery({ credits, log = {}, now = 0, result }) {
  const can = canStart('shooting', { credits, log, now });
  if (!can.ok) return { ok: false, credits, paid: 0, log, said: can.reason };
  const left = galleryLeft(log, now);
  const want = Math.max(0, Math.trunc(result?.xp) || 0), paid = Math.min(want, left);
  const said = want === 0 ? `No XP this time. The range took ${GYM.cost} credits.` : paid < want ? `+${paid} shooting XP: that is the hour's limit.` : `+${paid} shooting XP.`;
  return { ok: true, credits: credits - GYM.cost, paid, log: record(log, 'shooting', now, paid), said };
}

/**
 * Answer a page. `order` is the shuffled order the choices were shown in and `position` the one picked.
 * Pages are free and are not under the hour's cap (a page pays once, so it cannot be farmed): a right answer to a new page pays its XP and
 * the page is learned; a learned page pays nothing; a wrong answer pays nothing, says which line to reread, and the page goes back in the pile.
 * Credits and the hour log are never touched. Returns { ok, right, paid, credits, log, learned, said, reread }.
 */
export function answerPage({ pageId, order, position, credits, log = {}, learned = {} }) {
  const page = pageById(pageId);
  const stay = { ok: false, right: false, paid: 0, credits, log, learned, said: '', reread: null };
  if (!page) return { ...stay, said: 'No such page in the book.' };
  const right = isRight(page, order, position);
  if (isLearned(learned, page.id)) return { ...stay, ok: true, right, said: right ? 'Right again. You have learned this page, so it pays no more XP.' : `Not this time. ${rereadWords(page)}`, reread: right ? null : page.line };
  if (!right) return { ...stay, ok: true, said: `Not quite: no XP, and the page goes back in the pile. ${rereadWords(page)}`, reread: page.line };
  const paid = pageXp(page);
  return { ...stay, ok: true, right: true, paid, learned: { ...learned, [page.id]: true }, said: `Right. +${paid} ${page.skill} XP. The page is learned.` };
}

export { GYM, gymGamesFor, leftThisHour, trainRun };

/** The five Perihelion trainer sectors for the screen: [{ index, id, name, number, stars, bestTurns, bestFuel, unlocked }]. A sector opens when the one before has a star. */
export function sectorStatus(navProgress = {}) {
  return TRAINER_SECTORS.map((x, index) => {
    const mine = navProgress[x.id] || { stars: 0, bestFuel: null, bestTurns: null };
    const before = index === 0 ? null : navProgress[TRAINER_SECTORS[index - 1].id];
    return { index, id: x.id, name: x.name, number: x.number, stars: mine.stars || 0, bestTurns: mine.bestTurns, bestFuel: mine.bestFuel, unlocked: index === 0 || (before?.stars || 0) >= 1 };
  });
}
/**
 * Settle a finished sector: stars pay 2 XP each once (a replay pays only for stars above the best), free and uncapped like a book page.
 * Returns { ok, navProgress, paid, newStars, said }. Never mutates.
 */
export function settleSector({ navProgress = {}, result }) {
  const r = trainerSettle(navProgress, result);
  const said = !result?.success ? 'Sector lost. No XP.' : r.xp > 0 ? `+${r.xp} navigation XP for ${r.newStars} new star${r.newStars === 1 ? '' : 's'}.` : 'Cleared again: you already have these stars, so no new XP.';
  return { ok: true, navProgress: r.progress, paid: r.xp, newStars: r.newStars, said };
}
