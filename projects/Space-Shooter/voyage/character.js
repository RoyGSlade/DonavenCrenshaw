// The Voyage captain: name, look, five 1d6 stats (the bonus on attempt rolls),
// skill points in three trees (skills unlock things), and death. Pure rules: no DOM, no clock or randomness of their own (rng and
// now are handed in), and every change returns a new character.
import {
  NAME_MAX, STAT_DIE, STAT_BASELINE, START_POINTS, STATS, STAT_IDS, TREES, SKILLS, DEATH, PORTRAITS, COLORS, CHECK,
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

/** A stat's bonus to attempts: its distance from the baseline (-2 at a 1, +3 at a 6). */
export const statMod = (value) => (Number.isInteger(value) ? value : STAT_BASELINE) - STAT_BASELINE;

/**
 * An attempt (a "check"): a fresh roll of CHECK.dice x d{CHECK.sides}, plus the
 * stat's bonus and any `extra` (a ship's race bonus, say), against dc. Skills
 * never add to a roll (they unlock things); `tag` is kept for logs only. A
 * natural CHECK.alwaysPass always passes and a natural CHECK.alwaysFail always
 * fails, so the stat alone never decides it. Returns the attempt:
 * { kind: 'attempt', stat, tag, dc, dice, roll, statMod, extra, bonus, total,
 * pass, natural } (natural: 'pass' | 'fail' | null). Without a captain the
 * stat counts as STAT_BASELINE. Deterministic in rng (CHECK.dice draws).
 */
export function check(c, { stat = null, tag = null, dc = CHECK.levels.normal, extra = 0 } = {}, rng = Math.random) {
  const dice = [];
  for (let i = 0; i < CHECK.dice; i++) dice.push(rollDie(rng, CHECK.sides));
  const roll = dice.reduce((a, b) => a + b, 0);
  const mod = STAT_IDS.includes(stat) ? statMod(c?.stats?.[stat] ?? STAT_BASELINE) : 0;
  const more = Number.isFinite(extra) ? extra : 0;
  const bonus = mod + more;
  const total = roll + bonus;
  const natural = roll >= CHECK.alwaysPass ? 'pass' : roll <= CHECK.alwaysFail ? 'fail' : null;
  const pass = natural ? natural === 'pass' : total >= dc;
  return { kind: 'attempt', stat: STAT_IDS.includes(stat) ? stat : null, tag: tag || null, dc, dice, roll, statMod: mod, extra: more, bonus, total, pass, natural };
}
/** The same roll under the name the round-2 contract uses for it. */
export const rollAttempt = check;

// The chance of each total of the dice, built once.
const SUMS = (() => {
  let dist = new Map([[0, 1]]);
  for (let i = 0; i < CHECK.dice; i++) {
    const next = new Map();
    for (const [sum, n] of dist) for (let f = 1; f <= CHECK.sides; f++) next.set(sum + f, (next.get(sum + f) || 0) + n);
    dist = next;
  }
  const all = CHECK.sides ** CHECK.dice;
  return [...dist].map(([sum, n]) => [sum, n / all]);
})();

/** Chance (0..1) an attempt passes with this total bonus against dc. Never 0 or 1. */
export function attemptChance(bonus, dc) {
  let p = 0;
  for (const [roll, q] of SUMS) {
    const natural = roll >= CHECK.alwaysPass ? true : roll <= CHECK.alwaysFail ? false : null;
    if (natural === true || (natural === null && roll + bonus >= dc)) p += q;
  }
  return p;
}

/** The chance for a captain and a check spec (what a choice can show before it is taken). */
export function checkChance(c, { stat = null, dc = CHECK.levels.normal, extra = 0 } = {}) {
  const mod = STAT_IDS.includes(stat) ? statMod(c?.stats?.[stat] ?? STAT_BASELINE) : 0;
  return attemptChance(mod + (Number.isFinite(extra) ? extra : 0), dc);
}

const signed = (n) => (n < 0 ? `- ${-n}` : `+ ${n}`);
/** An attempt in words for logs: "4+3 + 2 = 9 vs 8" (with "double six!" / "snake eyes" on a natural). */
export function rollText(r) {
  const nat = r.natural === 'pass' ? ' (double six!)' : r.natural === 'fail' ? ' (snake eyes)' : '';
  return `${(r.dice || [r.roll]).join('+')} ${signed(r.bonus)} = ${r.total} vs ${r.dc}${nat}`;
}

// --- Skills unlock things (levels -> access, activity, ability) -----------------

/** Every skill level as { skill, level, unlocks: [{ type, id, value?, text }] } (ROUND2-CONTRACT.md section 9). */
export function skillLevels() {
  return SKILLS.flatMap((s) => (s.levels || []).map((l) => ({ skill: s.id, level: l.level, unlocks: l.unlocks || [] })));
}

/** The captain's level in a skill (0 = not learned). */
export const skillLevel = (c, skillId) => c?.skills?.[skillId] || 0;
/** Has the captain learned this skill (to at least `level`)? */
export const hasSkill = (c, skillId, level = 1) => skillLevel(c, skillId) >= level;

/** Everything the captain's learned levels unlock: [{ type, id, value, text, skill, level }]. */
export function skillUnlocks(c) {
  const out = [];
  for (const s of SKILLS) {
    const have = skillLevel(c, s.id);
    for (const l of s.levels || []) if (l.level <= have) for (const u of l.unlocks || []) out.push({ ...u, skill: s.id, level: l.level });
  }
  return out;
}

const splitToken = (type, id) => (id === undefined && typeof type === 'string' && type.includes(':') ? type.split(/:(.*)/s).slice(0, 2) : [type, id]);

/** Does the captain have this unlock? hasUnlock(c, 'ability', 'ship.hack-jam') or hasUnlock(c, 'ability:ship.hack-jam'). */
export function hasUnlock(c, type, id) {
  const [t, i] = splitToken(type, id);
  return skillUnlocks(c).some((u) => u.type === t && u.id === i);
}

/** The summed `value` of an activity upgrade (e.g. 'hack.time' -> 10 seconds at Hacker 3); 0 without it. */
export function activityValue(c, id) {
  return skillUnlocks(c).filter((u) => u.type === 'activity' && u.id === id).reduce((n, u) => n + (Number(u.value) || 0), 0);
}

/** Which skill levels give an unlock: [{ skill, level }] (for "needs Hacker 2" hints). */
export function skillsGranting(type, id) {
  const [t, i] = splitToken(type, id);
  return skillLevels().filter((l) => l.unlocks.some((u) => u.type === t && u.id === i)).map(({ skill, level }) => ({ skill, level }));
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
  const { toRoll, ...rest } = c; // fresh stats leave nothing to roll later
  return {
    character: {
      ...(DEATH.rerollStats ? rest : c),
      earned: kept,
      skills: DEATH.refundSkills ? {} : c.skills,
      stats: DEATH.rerollStats ? rollStats(rng) : c.stats,
      deaths: c.deaths + 1,
    },
    lost,
  };
}

/**
 * Rolls, once, each stat the captain is missing (old saves made before
 * Strength existed hold it at average until then). Returns { character, rolled:
 * { statId: value } }; the same captain when there is nothing to roll.
 */
export function rollMissingStats(c, rng = Math.random) {
  if (!c?.toRoll?.length) return { character: c, rolled: {} };
  const rolled = {};
  for (const id of c.toRoll) if (STAT_IDS.includes(id)) rolled[id] = rollDie(rng);
  const { toRoll, ...rest } = c;
  return { character: { ...rest, stats: { ...c.stats, ...rolled } }, rolled };
}

// --- Cleaning ------------------------------------------------------------------

/** A character from a save or the network, repaired; null when it can't be. */
export function cleanCharacter(input) {
  if (!input || typeof input !== 'object') return null;
  const name = cleanName(input.name);
  if (!name) return null;
  const stats = {};
  const toRoll = [];
  for (const id of STAT_IDS) {
    // A stat added after this captain was made (Strength, round 2) counts as
    // average until the player rolls it once (rollMissingStats).
    if (input.stats && typeof input.stats === 'object' && !(id in input.stats) && Object.keys(input.stats).length) toRoll.push(id);
    stats[id] = int(input.stats?.[id], 1, STAT_DIE, STAT_BASELINE);
  }
  for (const id of Array.isArray(input.toRoll) ? input.toRoll : []) if (STAT_IDS.includes(id) && !toRoll.includes(id)) toRoll.push(id);
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
  if (toRoll.length) out.toRoll = toRoll;
  // Retuned data can leave a save with more ranks than points: refund them all.
  if (spentPoints(out) > totalPoints(out)) out.skills = {};
  return out;
}

export { TREE_IDS };
