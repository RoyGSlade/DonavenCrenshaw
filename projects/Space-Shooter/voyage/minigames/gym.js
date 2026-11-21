// Holodeck gym trainer: replay any minigame at a Steady roll to learn it without risking a job.
// You pay credits to enter; a win pays a quarter of the XP the real thing would, and the gym
// pays at most GYM_CAP_XP per skill in any hour. A loss costs only the credits. Your skill
// points count (you train with what you have) but the roll is always Steady, tier 0.
// Pure: the wallet and the hour log belong to the caller. Numbers are PLACEHOLDERS for the economy tune.
import { cleanSkillPoints } from './picker.js';
import { setupRepair, setupHack, setupHaggle, setupPersuade, setupIntimidate, setupCraft, setupNav, setupStealth, setupPilot, REPAIR_CATEGORIES, HACK_CATEGORIES, SOCIAL_CATEGORIES, CRAFT_CATEGORIES, NAV_CATEGORIES, STEALTH_CATEGORIES, PILOT_CATEGORIES } from './setup.js';

/** Where skill points are spent (design doc: "Spend skill points in the holodeck gym"): spending and training are one place. */
export const SPEND_AT = 'gym';

export const GYM = Object.freeze({ cost: 10, share: 0.25, capXp: 6, windowMs: 3600000 });

/** The games the gym offers: id, skill, name, the dev-page id, and how to set it up at Steady. */
export const GYM_GAMES = Object.freeze([
  { id: 'repair', skill: 'repair', name: 'Coolant pipes', setup: (o) => setupRepair(o), cats: REPAIR_CATEGORIES },
  { id: 'hack', skill: 'hacking', name: 'Mirrors and firewalls', setup: (o) => setupHack(o), cats: HACK_CATEGORIES },
  { id: 'haggle', skill: 'social', name: 'Haggle', setup: (o) => setupHaggle(o), cats: SOCIAL_CATEGORIES },
  { id: 'persuade', skill: 'social', name: 'Persuade', setup: (o) => setupPersuade(o), cats: SOCIAL_CATEGORIES },
  { id: 'intimidate', skill: 'social', name: 'Intimidate', setup: (o) => setupIntimidate(o), cats: SOCIAL_CATEGORIES },
  { id: 'craft', skill: 'crafting', name: 'Heat and shape', setup: (o) => setupCraft(o), cats: CRAFT_CATEGORIES },
  { id: 'nav', skill: 'navigation', name: 'Plot the lane', setup: (o) => setupNav(o), cats: NAV_CATEGORIES },
  { id: 'stealth', skill: 'stealth', name: 'Shadow slip', setup: (o) => setupStealth(o), cats: STEALTH_CATEGORIES },
  { id: 'pilot', skill: 'piloting', name: 'Touchdown', setup: (o) => setupPilot(o), cats: PILOT_CATEGORIES },
]);
/** The games the gym has for a skill (shooting has none). */
export const gymGamesFor = (skill) => GYM_GAMES.filter((g) => g.skill === skill);
/** What you train with: the skill's level and the points you have actually spent in it (never more than the level). */
export function gymLoadout(progress, skill) {
  const level = progress?.levels?.[skill] ?? 1;
  return { level, points: cleanSkillPoints(skill, progress?.points?.[skill], level) };
}
export const gymGame = (id) => GYM_GAMES.find((g) => g.id === id) || null;

/** The setup for a gym run: always a Steady roll (tier 0), with the player's level and points. */
export function gymSetup(id, { level = 1, points = {} } = {}) {
  const g = gymGame(id);
  return g ? g.setup({ tier: 0, level, points }) : null;
}

/** XP the gym pays for a win that the real thing pays `xp` for: a quarter, rounded down, at least 1 for any win. */
export const gymXp = (xp) => (xp > 0 ? Math.max(1, Math.floor(xp * GYM.share)) : 0);

/** A fresh log: { [skill]: [{ at, xp }] } of what the gym paid. */
export const newGymLog = () => ({});
/** XP the gym has paid for a skill in the hour before `now`. */
export const paidThisHour = (log, skill, now) => (log[skill] || []).filter((e) => e.at > now - GYM.windowMs).reduce((a, e) => a + e.xp, 0);
/** XP the gym will still pay for a skill this hour. */
export const leftThisHour = (log, skill, now) => Math.max(0, GYM.capXp - paidThisHour(log, skill, now));

/** Can this player train now? `credits` is their wallet. */
export function canTrain(id, { credits = 0 } = {}) {
  if (!gymGame(id)) return { ok: false, reason: 'No such game in the gym.' };
  if (credits < GYM.cost) return { ok: false, reason: `The gym costs ${GYM.cost} credits and you have ${credits}.` };
  return { ok: true, reason: '' };
}

/**
 * Pay for a run and settle it. `result` is what the minigame resolved with ({ success, xp }); `real` the XP it pays in the field.
 * Returns { credits, paid, log, said } and never mutates its inputs. A run that fails or pays nothing still costs the credits.
 */
export function trainRun(id, { credits, log = {}, now = 0, result }) {
  const can = canTrain(id, { credits });
  if (!can.ok) return { ok: false, credits, paid: 0, log, said: can.reason };
  const g = gymGame(id);
  const spent = credits - GYM.cost;
  const want = result?.success ? gymXp(result.xp) : 0;
  const left = leftThisHour(log, g.skill, now);
  const paid = Math.min(want, left);
  const nextLog = paid > 0 ? { ...log, [g.skill]: [...(log[g.skill] || []).filter((e) => e.at > now - GYM.windowMs), { at: now, xp: paid }] } : log;
  const said = !result?.success ? `No XP this time. The gym took ${GYM.cost} credits.` : paid === 0 ? `You have had all the gym will pay for ${g.skill} this hour. Try again later.` : paid < want ? `+${paid} ${g.skill} XP: that is the hour's limit.` : `+${paid} ${g.skill} XP.`;
  return { ok: true, credits: spent, paid, log: nextLog, said };
}
