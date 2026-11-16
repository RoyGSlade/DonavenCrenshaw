// What the five stats mean, in play and in words (story/STATS.md), and how a
// roll works. The numbers live in data.js (STATS, CHECK, ROLL_SKILLS); every
// sentence here is built from them, so retuning data.js (or the Stardust
// Studio) retunes the explanations. Pure: no DOM.
//
// The rules (design doc Section 5, Nov 15; launch tech lane outcome 1):
//   An attempt is a fresh d20 + the level of the skill it uses (1..9) vs a
//   target. Advantage rolls two and keeps the higher. A natural 20 always
//   works, whatever the bonus or target.
//   Stats are rolled once (1d6 each). Each point over 3 adds the stat's small
//   passive effects. They add to rolls only when CHECK.addStat is on, and then
//   the stat card shows their odds again.
//   Tree skills never add to rolls; they unlock access, activity upgrades and
//   abilities (data.js SKILLS, character.js skillUnlocks).
import { STATS, STAT_BASELINE, STAT_DIE, CHECK, ROLL_SKILLS, LEVEL_MIN, LEVEL_MAX } from '../data.js';
import { attemptChance, statMod, checkSkill } from '../character.js';
import { STAT_TEXT_DATA } from './data/stat-text.js';

const STAT = new Map(STATS.map((s) => [s.id, s]));
const pct = (v) => `${Math.round(Math.abs(v) * 100)}%`;
const n = (v) => Math.round(Math.abs(v) * 100) / 100;
const signed = (v) => (v < 0 ? `-${-v}` : `+${v}`);

/** Chance (0..1) that an attempt at skill level `level` (and any extra bonus) meets dc. Never 0: a natural 20 always works. */
export const chance = (level, dc, extra = 0) => attemptChance(level + extra, dc);

/** "72%" style text for a chance. */
export const chanceText = (p) => `${Math.round(p * 100)}%`;

/** The bonus a stat value would add to attempts with CHECK.addStat, as text: "+2", "-1", "+0". */
export const bonusText = (value) => signed(statMod(value));

const SKILL_NAME = new Map(ROLL_SKILLS.map((s) => [s.id, s.name]));
/** The label put in front of an attempt in a talk: the skill it rolls, "[Social]"; '' for a bare d20 (its stat with CHECK.addStat). */
export function optionTag(statId, skillId) {
  const skill = SKILL_NAME.get(checkSkill({ skill: skillId, stat: statId }));
  if (skill) return `[${skill}]`;
  return CHECK.addStat && STAT.get(statId) ? `[${STAT.get(statId).name}]` : '';
}

// The plain words for each passive tag: how a change of `v` reads.
const TAG_WORDS = {
  price: (v) => `prices ${pct(v / 100)} ${v >= 0 ? 'lower' : 'higher'}`,
  rep: (v) => `rep ${pct(v / 100)} ${v >= 0 ? 'faster' : 'slower'}`,
  melee: (v) => `punches ${v >= 0 ? '+' : '-'}${n(v)} damage`,
  'ship.hp': (v) => `${v >= 0 ? '+' : '-'}${n(v)} hull`,
  'foot.hp': (v) => `${v >= 0 ? '+' : '-'}${n(v)} health on foot`,
  'repair.speed': (v) => `repairs ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`,
  'mine.speed': (v) => `mining ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`,
  'ship.turn': (v) => `handling ${v >= 0 ? '+' : '-'}${pct(v)}`,
  aim: (v) => `aim ${pct(v)} ${v >= 0 ? 'steadier' : 'shakier'}`,
  'foot.speed': (v) => `walk ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`,
  'scan.range': (v) => `scanner reach ${v >= 0 ? '+' : '-'}${pct(v)}`,
  hint: (v) => `puzzle hints ${n(v)} miss${n(v) === 1 ? '' : 'es'} ${v >= 0 ? 'sooner' : 'later'}`,
};

/** The passive effects of a stat value as phrases: ["prices 6% lower", ...]. */
export function passiveWords(statId, value) {
  const s = STAT.get(statId);
  if (!s) return [];
  const d = value - STAT_BASELINE;
  if (!d) return [];
  return Object.entries(s.effects || {}).map(([tag, per]) => TAG_WORDS[tag]?.(per * d)).filter(Boolean);
}

const join = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// One line each: what the stat is for (data: ./data/stat-text.js).
export const STAT_LINES = Object.freeze({ ...STAT_TEXT_DATA.lines });

// Odds at the named targets for a total bonus.
const oddsAt = (bonus) => {
  const { easy, normal, hard } = CHECK.levels;
  return `easy ${chanceText(chance(bonus, easy))}, normal ${chanceText(chance(bonus, normal))}, hard ${chanceText(chance(bonus, hard))}`;
};

/** "What a 6 gets you", built from the data: its passives, plus its roll bonus only with CHECK.addStat. */
export function sixText(statId) {
  const parts = passiveWords(statId, STAT_DIE);
  const roll = CHECK.addStat ? `${signed(statMod(STAT_DIE))} on every roll that uses it` : '';
  const said = [roll, parts.length ? join(parts) : ''].filter(Boolean);
  return `A 6: ${said.length ? said.join(', plus ') : 'nothing extra'}.`;
}

/** What a 1 costs you, built from the data. Never hopeless: a natural 20 always works. */
export function oneText(statId) {
  const parts = passiveWords(statId, 1);
  const roll = CHECK.addStat ? `${signed(statMod(1))} on every roll that uses it` : '';
  const said = [roll, parts.length ? join(parts) : ''].filter(Boolean);
  return `A 1: ${said.length ? said.join(', and ') : 'nothing lost'}. A natural 20 still always works.`;
}

/** The whole card for one stat at a value: everything a stats screen or the licence shows. */
export function statCard(statId, value) {
  const s = STAT.get(statId);
  if (!s) return null;
  const now = passiveWords(statId, value);
  return {
    id: s.id,
    name: s.name,
    line: STAT_LINES[s.id] || s.blurb,
    rolls: s.rolls ? `${cap(s.rolls)}.` : '',
    bonus: CHECK.addStat ? signed(statMod(value)) : '',
    odds: CHECK.addStat ? `Your odds at skill level ${LEVEL_MIN}: ${oddsAt(LEVEL_MIN + statMod(value))}.` : '',
    now: now.length ? `${cap(join(now))}.` : 'Average: no extra effects.',
    six: sixText(s.id),
    one: oneText(s.id),
  };
}

/** The card for a roll skill at a level: what it is and the odds it gives. */
export function skillCard(skillId, level = LEVEL_MIN) {
  const s = ROLL_SKILLS.find((k) => k.id === skillId);
  if (!s) return null;
  const lv = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.trunc(level) || LEVEL_MIN));
  return { id: s.id, name: s.name, line: s.blurb, level: lv, bonus: signed(lv), odds: `Odds: ${oddsAt(lv)}.` };
}

const fillHow = (t) => t
  .replaceAll('{baseline}', String(STAT_BASELINE))
  .replaceAll('{die}', `d${CHECK.sides}`)
  .replaceAll('{pass}', String(CHECK.alwaysPass))
  .replaceAll('{min}', String(LEVEL_MIN))
  .replaceAll('{max}', String(LEVEL_MAX))
  .replaceAll('{easy}', String(CHECK.levels.easy))
  .replaceAll('{normal}', String(CHECK.levels.normal))
  .replaceAll('{hard}', String(CHECK.levels.hard))
  .replaceAll('{heroic}', String(CHECK.levels.heroic));
/** How rolls work, for the stats screen and the dice. */
export const HOW_CHECKS_WORK = Object.freeze(STAT_TEXT_DATA.how.filter((t) => CHECK.addStat || !t.includes('{statonly}')).map((t) => fillHow(t.replace('{statonly}', ''))));

/** Odds table rows for docs and the Studio: [{ dc, name, byLevel: [p at levels 1..9] }]. */
export function oddsTable() {
  const levels = Array.from({ length: LEVEL_MAX - LEVEL_MIN + 1 }, (_, i) => LEVEL_MIN + i);
  return Object.entries(CHECK.levels).map(([name, dc]) => ({ name, dc, byLevel: levels.map((v) => chance(v, dc)) }));
}
