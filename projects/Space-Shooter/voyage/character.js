// The Voyage captain: name, look, four 1d6 stats, skill points in three trees,
// and death. Pure rules: no DOM, no clock or randomness of their own (rng and
// now are handed in), and every change returns a new character.
import {
  NAME_MAX, STAT_DIE, STAT_BASELINE, START_POINTS, STATS, STAT_IDS, TREES, SKILLS, DEATH, PORTRAITS, COLORS,
} from './data.js';

const SKILL = new Map(SKILLS.map((s) => [s.id, s]));
const TREE_IDS = new Set(TREES.map((t) => t.id));
export const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const int = (v, lo, hi, fallback) => (Number.isInteger(v) && v >= lo && v <= hi ? v : fallback);

export const skillById = (id) => SKILL.get(id) || null;

/** One die, 1..sides, from rng() in [0, 1). */
export function rollDie(rng, sides = STAT_DIE) {
  const r = Number(rng());
  const v = Number.isFinite(r) ? Math.floor(Math.min(0.999999, Math.max(0, r)) * sides) + 1 : 1;
  return v;
}

export function rollStats(rng) {
  const out = {};
  for (const id of STAT_IDS) out[id] = rollDie(rng);
  return out;
}

/** A name as the game keeps it: plain text, single spaces, at most NAME_MAX characters. */
export function cleanName(value) {
  if (typeof value !== 'string') return '';
  // Control characters and angle brackets never reach a save; names are shown with textContent anyway.
  return value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

function cleanLook(look) {
  return {
    portrait: PORTRAITS.some((p) => p.id === look?.portrait) ? look.portrait : PORTRAITS[0].id,
    color: typeof look?.color === 'string' && HEX.test(look.color) ? look.color.toLowerCase() : COLORS[0],
  };
}

function makeId(rng) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = 'c-';
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.min(0.999999, Math.max(0, Number(rng()) || 0)) * abc.length)];
  return s;
}

/** A new captain with rolled stats. Returns null when the name is empty. */
export function createCharacter({ name, look } = {}, rng = Math.random, now = Date.now) {
  const clean = cleanName(name);
  if (!clean) return null;
  return {
    id: makeId(rng),
    name: clean,
    look: cleanLook(look),
    stats: rollStats(rng),
    earned: START_POINTS,
    permanent: 0,
    skills: {},
    deaths: 0,
    createdAt: Math.floor(now()),
  };
}

// --- Points ---------------------------------------------------------------------

export function spentPoints(c) {
  let n = 0;
  for (const rank of Object.values(c?.skills || {})) n += rank;
  return n;
}
export const totalPoints = (c) => (c ? c.earned + c.permanent : 0);
export const unspentPoints = (c) => Math.max(0, totalPoints(c) - spentPoints(c));

/** Points in a tree: ranks of every skill listed under it (overlap skills count for both trees). */
export function treePoints(c, treeId) {
  let n = 0;
  for (const [id, rank] of Object.entries(c?.skills || {})) if (SKILL.get(id)?.trees.includes(treeId)) n += rank;
  return n;
}

const TREE_NAME = Object.fromEntries(TREES.map((t) => [t.id, t.name]));

/** Can this captain take the next rank of a skill? { ok, reason } with a plain-words reason. */
export function canLearn(c, skillId) {
  const skill = SKILL.get(skillId);
  if (!c) return { ok: false, reason: 'Make a captain first.' };
  if (!skill) return { ok: false, reason: 'Unknown skill.' };
  const rank = c.skills[skillId] || 0;
  if (rank >= skill.max) return { ok: false, reason: 'Already at the top rank.' };
  if (unspentPoints(c) < 1) return { ok: false, reason: 'No skill points left.' };
  for (const [tree, need] of Object.entries(skill.needs || {})) {
    // An overlap skill's own ranks do not count toward unlocking it.
    const have = treePoints(c, tree) - (skill.trees.includes(tree) ? rank : 0);
    if (have < need) return { ok: false, reason: `Needs ${need} point${need === 1 ? '' : 's'} in ${TREE_NAME[tree] || tree}.` };
  }
  return { ok: true, reason: '' };
}

/** The captain with one more rank in a skill, or the same captain when it can't be learned. */
export function learn(c, skillId) {
  if (!canLearn(c, skillId).ok) return c;
  return { ...c, skills: { ...c.skills, [skillId]: (c.skills[skillId] || 0) + 1 } };
}

/** Points added from play (quest rewards). Negative takes points back, never below what is spent. */
export function addEarned(c, n) {
  if (!c || !Number.isInteger(n) || n === 0) return c;
  const earned = Math.max(0, c.earned + n);
  const out = { ...c, earned };
  return spentPoints(out) > totalPoints(out) ? { ...out, skills: {} } : out;
}

export function addPermanent(c, n) {
  if (!c || !Number.isInteger(n) || n <= 0) return c;
  return { ...c, permanent: c.permanent + n };
}

// --- Effects and checks --------------------------------------------------------

/** The sum of the captain's skill effects for one tag (section 6 of INTERFACES.md). */
export function skillBonus(c, tag) {
  let n = 0;
  for (const [id, rank] of Object.entries(c?.skills || {})) n += (SKILL.get(id)?.effects?.[tag] || 0) * rank;
  return n;
}

/** Stat effects for a tag: per point above STAT_BASELINE (negative below it). */
export function statBonus(c, tag) {
  if (!c) return 0;
  let n = 0;
  for (const stat of STATS) n += (stat.effects[tag] || 0) * ((c.stats[stat.id] || STAT_BASELINE) - STAT_BASELINE);
  return n;
}

/** Everything the captain adds to a passive tag: stats and skills. Rounded to 3 places. */
export const effect = (c, tag) => Math.round((statBonus(c, tag) + skillBonus(c, tag)) * 1000) / 1000;

/**
 * A stat check: 1d6 + the stat + the captain's skill bonus for the tag, against dc.
 * { roll, bonus, total, dc, pass }. Without a captain the stat counts as STAT_BASELINE.
 */
export function check(c, { stat, tag = null, dc = 7 } = {}, rng = Math.random) {
  const roll = rollDie(rng);
  const value = STAT_IDS.includes(stat) ? (c?.stats?.[stat] ?? STAT_BASELINE) : 0;
  const bonus = value + (tag ? skillBonus(c, tag) : 0);
  const total = roll + bonus;
  return { roll, bonus, total, dc, pass: total >= dc };
}

// --- Death ---------------------------------------------------------------------

/**
 * The captain dies: half the earned points (spent and unspent alike) are lost,
 * rounded down; every skill is refunded; stats are rolled fresh. Permanent
 * points, the name and the look stay. Returns { character, lost }.
 */
export function die(c, rng = Math.random) {
  if (!c) return { character: c, lost: 0 };
  const kept = Math.ceil(c.earned * DEATH.keepShare);
  const lost = c.earned - kept;
  return {
    character: {
      ...c,
      earned: kept,
      skills: DEATH.refundSkills ? {} : c.skills,
      stats: DEATH.rerollStats ? rollStats(rng) : c.stats,
      deaths: c.deaths + 1,
    },
    lost,
  };
}

// --- Cleaning ------------------------------------------------------------------

/** A character from a save or the network, repaired; null when it can't be. */
export function cleanCharacter(input) {
  if (!input || typeof input !== 'object') return null;
  const name = cleanName(input.name);
  if (!name) return null;
  const stats = {};
  for (const id of STAT_IDS) stats[id] = int(input.stats?.[id], 1, STAT_DIE, STAT_BASELINE);
  const skills = {};
  for (const [id, rank] of Object.entries(input.skills && typeof input.skills === 'object' ? input.skills : {})) {
    const skill = SKILL.get(id);
    if (skill && Number.isInteger(rank) && rank > 0) skills[id] = Math.min(rank, skill.max);
  }
  const out = {
    id: typeof input.id === 'string' && /^c-[a-z0-9]{1,16}$/.test(input.id) ? input.id : 'c-unknown',
    name,
    look: cleanLook(input.look),
    stats,
    earned: int(input.earned, 0, 9999, 0),
    permanent: int(input.permanent, 0, 9999, 0),
    skills,
    deaths: int(input.deaths, 0, 1e6, 0),
    createdAt: int(input.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  // Retuned data can leave a save with more ranks than points: refund them all.
  if (spentPoints(out) > totalPoints(out)) out.skills = {};
  return out;
}

export { TREE_IDS };
