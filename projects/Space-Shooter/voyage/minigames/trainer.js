// The trainer, pure (Donaven 2026-11-19: "for the trainer each one should be a specific skill ... you get XP, not a skill point").
// What each skill trains with, and how a training result is paid. Training pays XP into the skill: it never pays or spends a skill point
// (points still come from levels, and the picker spends them). Three kinds of training:
//   gallery  shooting: the shooting gallery (gallery.js)
//   book     crafting, repair, hacking: read a page, answer a question (books.js)
//   replay   stealth, piloting, social: the gym's replay of the mini-game at a Steady roll (gym.js), as before
//   coming   navigation: a slot for the Perihelion lane game that another lane is building (NAV2-LANE.md); the replay stays until it lands
// The entry fee (GYM.cost) and the hour's cap per skill (GYM.capXp) are the gym's, unchanged: placeholders for the economy tune.
import { GYM, gymGamesFor, leftThisHour, trainRun } from './gym.js';
import { setupShooting, SHOOTING_LESSONS } from './setup.js';
import { pageById, pageXp, isLearned, rereadWords, isRight } from './books.js';

/** The kind of training a skill has. */
export const TRAINING = Object.freeze({
  shooting: 'gallery', crafting: 'book', repair: 'book', hacking: 'book',
  stealth: 'replay', piloting: 'replay', social: 'replay', navigation: 'coming',
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

/** Can a run (a gallery round or a new page's answer) be started now? */
export function canStart(skill, { credits = 0, log = {}, now = 0 } = {}) {
  if (credits < GYM.cost) return { ok: false, reason: `The gym costs ${GYM.cost} credits and you have ${credits}.` };
  if (leftThisHour(log, skill, now) <= 0) return { ok: false, reason: `The gym has paid all it will for ${skill} this hour. Come back later.` };
  return { ok: true, reason: '' };
}

const record = (log, skill, now, paid) => (paid > 0 ? { ...log, [skill]: [...(log[skill] || []).filter((e) => e.at > now - GYM.windowMs), { at: now, xp: paid }] } : log);

/**
 * Settle a gallery round: the fee is taken for the round, the XP is the result's, up to the hour's cap. Never mutates its inputs.
 * Returns { ok, credits, paid, log, said }. XP only: no skill point is ever paid.
 */
export function settleGallery({ credits, log = {}, now = 0, result }) {
  const can = canStart('shooting', { credits, log, now });
  if (!can.ok) return { ok: false, credits, paid: 0, log, said: can.reason };
  const left = leftThisHour(log, 'shooting', now);
  const want = Math.max(0, Math.trunc(result?.xp) || 0), paid = Math.min(want, left);
  const said = want === 0 ? `No XP this time. The range took ${GYM.cost} credits.` : paid < want ? `+${paid} shooting XP: that is the hour's limit.` : `+${paid} shooting XP.`;
  return { ok: true, credits: credits - GYM.cost, paid, log: record(log, 'shooting', now, paid), said };
}

/**
 * Answer a page. `order` is the shuffled order the choices were shown in and `position` the one picked.
 * A new page costs the entry fee when answered (right or wrong, as a failed gym run does), pays its XP once if right, and is then learned.
 * A learned page is free and pays nothing; a wrong answer pays nothing and says which line to reread; the hour's cap can stop a new page
 * from paying (then nothing is charged and the page stays in the pile). Never mutates its inputs.
 * Returns { ok, right, paid, credits, log, learned, said, reread }.
 */
export function answerPage({ pageId, order, position, credits, log = {}, learned = {}, now = 0 }) {
  const page = pageById(pageId);
  const stay = { ok: false, right: false, paid: 0, credits, log, learned, said: '', reread: null };
  if (!page) return { ...stay, said: 'No such page in the book.' };
  const right = isRight(page, order, position);
  if (isLearned(learned, page.id)) return { ...stay, ok: true, right, said: right ? 'Right again. You have learned this page, so it pays no more XP.' : `Not this time. ${rereadWords(page)}`, reread: right ? null : page.line };
  const can = canStart(page.skill, { credits, log, now });
  if (!can.ok) return { ...stay, said: can.reason };
  const spent = credits - GYM.cost;
  if (!right) return { ok: true, right: false, paid: 0, credits: spent, log, learned, said: `Not quite: no XP, and the page goes back in the pile. ${rereadWords(page)}`, reread: page.line };
  const left = leftThisHour(log, page.skill, now), want = pageXp(page), paid = Math.min(want, left);
  return {
    ok: true, right: true, paid, credits: spent, log: record(log, page.skill, now, paid), learned: { ...learned, [page.id]: true }, reread: null,
    said: paid < want ? `Right. +${paid} ${page.skill} XP: that is the hour's limit. The page is learned.` : `Right. +${paid} ${page.skill} XP. The page is learned.`,
  };
}

export { GYM, gymGamesFor, leftThisHour, trainRun };
