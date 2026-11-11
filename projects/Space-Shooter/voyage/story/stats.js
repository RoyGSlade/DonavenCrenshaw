// What the five stats mean, in play and in words (story/STATS.md). The numbers
// live in data.js (STATS, CHECK); every sentence here is built from them, so
// retuning data.js (or the Stardust Studio) retunes the explanations. Pure: no DOM.
//
// The rules (Donaven, 2026-11-11):
//   Stats are rolled once (1d6 each) and are the BONUS on attempts.
//   An attempt is a fresh roll: 2d6 + (stat - 3) vs a target. A double six
//   always works, whatever the bonus or target ("a natural 6 always passes").
//   Each point over 3 also adds the stat's small passive effects.
//   Skills never add to rolls; they unlock access, activity upgrades and
//   abilities (data.js SKILLS, character.js skillUnlocks).
import { STATS, STAT_BASELINE, STAT_DIE, CHECK } from '../data.js';
import { attemptChance, statMod } from '../character.js';
import { STAT_TEXT_DATA } from './data/stat-text.js';

const STAT = new Map(STATS.map((s) => [s.id, s]));
const pct = (v) => `${Math.round(Math.abs(v) * 100)}%`;
const n = (v) => Math.round(Math.abs(v) * 100) / 100;
const signed = (v) => (v < 0 ? `-${-v}` : `+${v}`);

/** Chance (0..1) that an attempt with this stat (and any extra bonus) meets dc. Never 0: a double six always works. */
export const chance = (stat, dc, extra = 0) => attemptChance(statMod(stat) + extra, dc);

/** "72%" style text for a chance. */
export const chanceText = (p) => `${Math.round(p * 100)}%`;

/** The bonus a stat value adds to attempts, as text: "+2", "-1", "+0". */
export const bonusText = (value) => signed(statMod(value));

/** The label put in front of a stat attempt in a talk: "[Charisma]". */
export const optionTag = (statId) => `[${STAT.get(statId)?.name || statId}]`;

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

const oddsAt = (value) => {
  const { easy, normal, hard } = CHECK.levels;
  return `easy ${chanceText(chance(value, easy))}, normal ${chanceText(chance(value, normal))}, hard ${chanceText(chance(value, hard))}`;
};

/** "What a 6 gets you", built from the data. */
export function sixText(statId) {
  const parts = passiveWords(statId, STAT_DIE);
  return `A 6: ${signed(statMod(STAT_DIE))} on every roll (${oddsAt(STAT_DIE)})${parts.length ? `, plus ${join(parts)}` : ''}.`;
}

/** What a 1 costs you, built from the data. Still never hopeless: a double six always works. */
export function oneText(statId) {
  const parts = passiveWords(statId, 1);
  return `A 1: ${signed(statMod(1))} on every roll (${oddsAt(1)})${parts.length ? `, and ${join(parts)}` : ''}. A double six still always works.`;
}

/** The whole card for one stat at a value: everything a stats screen or the dice roller shows. */
export function statCard(statId, value) {
  const s = STAT.get(statId);
  if (!s) return null;
  const now = passiveWords(statId, value);
  return {
    id: s.id,
    name: s.name,
    line: STAT_LINES[s.id] || s.blurb,
    rolls: s.rolls ? `${cap(s.rolls)}.` : '',
    bonus: signed(statMod(value)),
    odds: `Your odds: ${oddsAt(value)}.`,
    now: now.length ? `${cap(join(now))}.` : 'Average: no extra effects.',
    six: sixText(s.id),
    one: oneText(s.id),
  };
}

const fillHow = (t) => t
  .replaceAll('{baseline}', String(STAT_BASELINE))
  .replaceAll('{dice}', `${CHECK.dice}d${CHECK.sides}`)
  .replaceAll('{pass}', String(CHECK.alwaysPass))
  .replaceAll('{fail}', String(CHECK.alwaysFail))
  .replaceAll('{easy}', String(CHECK.levels.easy))
  .replaceAll('{normal}', String(CHECK.levels.normal))
  .replaceAll('{hard}', String(CHECK.levels.hard));
/** How rolls work, for the stats screen and the dice. */
export const HOW_CHECKS_WORK = Object.freeze(STAT_TEXT_DATA.how.map((t) => fillHow(t)));

/** Odds table rows for docs and the Studio: [{ dc, name, byStat: [p at 1..6] }]. */
export function oddsTable() {
  return Object.entries(CHECK.levels).map(([name, dc]) => ({ name, dc, byStat: [1, 2, 3, 4, 5, 6].map((v) => chance(v, dc)) }));
}
