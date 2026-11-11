// What the four stats mean, in play and in words (story/STATS.md). The numbers
// live in data.js STATS; every sentence here is built from them, so retuning
// data.js retunes the explanations. Pure: no DOM.
//
// The rules (core, character.js; unchanged):
//   check:   1d6 + stat + skill bonus for the tag >= dc passes.
//   passive: each point over 3 adds the stat's effects; each point under 3 takes them away.
// Added in round 2 (data.js): a stat of 5+ opens that stat's dialogue options,
// a 6 adds the stat's boon.
import { STATS, STAT_BASELINE, STAT_DIE, STAT_OPTION_MIN, STAT_BOON_AT } from '../data.js';
import { STAT_TEXT_DATA } from './data/stat-text.js';

const STAT = new Map(STATS.map((s) => [s.id, s]));
const pct = (v) => `${Math.round(Math.abs(v) * 100)}%`;
const n = (v) => Math.round(Math.abs(v) * 100) / 100;

/** Chance (0..1) that 1d6 + stat + bonus meets dc. */
export function chance(stat, dc, bonus = 0) {
  const need = dc - stat - bonus; // the die must show at least this
  if (need <= 1) return 1;
  if (need > STAT_DIE) return 0;
  return (STAT_DIE - need + 1) / STAT_DIE;
}

/** "50%" style text for a chance. */
export const chanceText = (p) => `${Math.round(p * 100)}%`;

/** The boon value a stat at STAT_BOON_AT gives for `tag`, else 0. Lanes read it like effect(). */
export function boonFor(c, tag) {
  let v = 0;
  for (const s of STATS) if (s.boon?.tag === tag && (c?.stats?.[s.id] || 0) >= STAT_BOON_AT) v += s.boon.value;
  return v;
}

/** The label put in front of a gated dialogue option: "[Charm]". */
export const optionTag = (statId) => `[${STAT.get(statId)?.options || statId}]`;

/** Does this captain open a stat's dialogue options? */
export const opensOptions = (c, statId) => (c?.stats?.[statId] || 0) >= STAT_OPTION_MIN;

// The plain words for each passive tag: how a change of `v` reads.
const TAG_WORDS = {
  price: (v) => `prices ${pct(v / 100)} ${v >= 0 ? 'lower' : 'higher'}`,
  rep: (v) => `rep ${pct(v / 100)} ${v >= 0 ? 'faster' : 'slower'}`,
  'ship.hp': (v) => `${v >= 0 ? '+' : '-'}${n(v)} hull`,
  'foot.hp': (v) => `${v >= 0 ? '+' : '-'}${n(v)} health on foot`,
  'repair.speed': (v) => `repairs ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`,
  'mine.speed': (v) => `mining ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`,
  'ship.turn': (v) => `handling ${v >= 0 ? '+' : '-'}${pct(v)}`,
  dodge: null, // folded into checks; not worth a word
  aim: (v) => `aim ${pct(v)} ${v >= 0 ? 'steadier' : 'shakier'}`,
  'foot.speed': (v) => `walk ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`,
  nav: null,
  scan: null,
  puzzle: null,
  'scan.range': (v) => `scanner reach ${v >= 0 ? '+' : '-'}${pct(v)}`,
  hint: (v) => `puzzle hints ${n(v)} miss${n(v) === 1 ? '' : 'es'} ${v >= 0 ? 'sooner' : 'later'}`,
};

// What each boon does, in words.
const BOON_WORDS = {
  'black-market': (v) => `Edna's prices ${v}% lower`,
  'foot.guard': () => 'the first hit in every on-foot fight bounces off',
  'aim.assist': () => 'your turret and sidearm pull onto a target near the sights',
  'hint.free': () => 'every puzzle starts with a hint showing',
};

/** The passive effects of a stat value as phrases: ["prices 6% lower", ...]. */
export function passiveWords(statId, value) {
  const s = STAT.get(statId);
  if (!s) return [];
  const d = value - STAT_BASELINE;
  if (!d) return [];
  return Object.entries(s.effects).map(([tag, per]) => TAG_WORDS[tag]?.(per * d)).filter(Boolean);
}

const join = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// One line each: what the stat is for and what rolls it (data: ./data/stat-text.js).
export const STAT_LINES = Object.freeze({ ...STAT_TEXT_DATA.lines });

/** "What a 6 gets you", built from the data. */
export function sixText(statId) {
  const s = STAT.get(statId);
  if (!s) return '';
  const parts = [...passiveWords(statId, STAT_DIE)];
  parts.push(`${s.options} options open in talks`);
  if (s.boon) parts.push(BOON_WORDS[s.boon.tag]?.(s.boon.value) || s.boon.tag);
  return `A 6: ${join(parts)}. A normal check (7) always passes.`;
}

/** What a 1 costs you, built from the data. */
export function oneText(statId) {
  const parts = passiveWords(statId, 1);
  return `A 1: ${join(parts) || 'nothing extra'}, and hard checks need a skill to have a chance.`;
}

/** The whole card for one stat at a value: { id, name, line, now, six, one, options, boon }. */
export function statCard(statId, value) {
  const s = STAT.get(statId);
  if (!s) return null;
  const now = passiveWords(statId, value);
  return {
    id: s.id,
    name: s.name,
    line: STAT_LINES[s.id] || s.blurb,
    now: now.length ? `${cap(join(now))}.` : 'Average: no bonus, no penalty.',
    odds: `A normal check (7): ${chanceText(chance(value, 7))}. A hard one (9): ${chanceText(chance(value, 9))}.`,
    options: value >= STAT_OPTION_MIN ? `${s.options} options open.` : `${s.options} options open at ${STAT_OPTION_MIN}.`,
    boon: value >= STAT_BOON_AT && s.boon ? cap(`${BOON_WORDS[s.boon.tag]?.(s.boon.value) || s.boon.tag}.`) : null,
    six: sixText(s.id),
    one: oneText(s.id),
  };
}

const fillHow = (t) => t.replaceAll('{baseline}', String(STAT_BASELINE)).replaceAll('{optionMin}', String(STAT_OPTION_MIN));
/** How rolls work, for the stats screen and the dice. */
export const HOW_CHECKS_WORK = Object.freeze(STAT_TEXT_DATA.how.map((t) => fillHow(t)));
