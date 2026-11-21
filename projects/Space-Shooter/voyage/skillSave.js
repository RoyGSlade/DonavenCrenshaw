// Skill category points and mini-game XP that count (Stardust skill-save lane,
// 2026-11-18; minigames/PLAN.md section 7, tech/PLAN.md outcome 2).
//
// The captain holds, next to `levels`: `points` (category points per skill), `xp`
// (total XP per skill) and `scan` (the snapshot a death goes back to). With the
// home server on (voyage/account.js) the hub owns all three: a spend, an XP claim,
// a scan and a restore are hub calls, and the save takes the hub's answer. With
// it off, the same rules run here on the save, so play feels the same.
//
// The numbers below are copies of the hub's games/stardust/rules.json "voyage"
// block (placeholders until playtesting). Only the hub's copy counts in server mode.
import { ROLL_SKILL_IDS, LEVEL_MIN, LEVEL_MAX, SKILL_CATEGORY_IDS, POINT_MAX } from './data.js';
import { cleanCharacter, cleanPoints, cleanXp } from './character.js';

/** Total XP to reach each level from level 1 (rules.json "voyage".xpPerLevel). */
export const XP_CURVE = Object.freeze([0, 100, 250, 450, 700, 1000, 1400, 1900, 2500]);
/** rules.json "voyage": caps.levelsPerSkillPerHour, caps.minigameXpPerSkillPerHour, minigames.*.maxXp. */
export const LIMITS = Object.freeze({ levelsPerSkillPerHour: 1, xpPerSkillPerHour: 30, maxXp: 8 });
/** The skill each mini-game's XP goes to (rules.json "voyage".minigames; the browser never names it). */
export const GAME_SKILL = Object.freeze({
  repair: 'repair', hack: 'hacking', haggle: 'social', persuade: 'social', intimidate: 'social', craft: 'crafting', nav: 'navigation', stealth: 'stealth', pilot: 'piloting',
});
const HOUR = 60 * 60 * 1000;
const RUN_ID = /^[A-Za-z0-9-]{6,64}$/;

export const levelFromXp = (xp, curve = XP_CURVE) => {
  let level = LEVEL_MIN;
  for (let i = 1; i < curve.length; i++) if (xp >= curve[i]) level = LEVEL_MIN + i;
  return Math.min(LEVEL_MAX, level);
};

const sum = (row) => Object.values(row || {}).reduce((a, b) => a + b, 0);
const levelOf = (c, skill) => (Number.isFinite(c?.levels?.[skill]) ? c.levels[skill] : LEVEL_MIN);
/** Points still to spend in a skill: its level minus what is spent. */
export const pointsLeft = (c, skill) => Math.max(0, levelOf(c, skill) - sum(c?.points?.[skill]));

/** Plain words for every refusal (the hub's `reason` and the local rules use the same ones). */
export const WORDS = Object.freeze({
  unknown_skill: 'There is no such skill.',
  unknown_category: 'That skill has no such category.',
  bad_points: 'Points are whole numbers from 0 to 9 in a category.',
  over_level: 'That is more points than that skill\'s level gives you.',
  cannot_take_back: 'Spent points stay spent. A respec has its own rules.',
  no_change: 'Nothing new to spend.',
  unknown_game: 'That game does not pay XP.',
  bad_run: 'That win could not be told apart from another.',
  bad_xp: 'That is not an amount of XP.',
  over_max: 'That is more XP than one win can give.',
  already_claimed: 'That win has already paid out.',
  hour_cap: 'You have had all the XP this skill pays out for now. Try again in a while.',
  no_scan: 'There is no scan to go back to.',
  off: 'The Guild bank is not answering.',
});
const refuse = (reason, extra = {}) => ({ ok: false, reason, words: WORDS[reason] || 'That did not work.', ...extra });

/** Spend category points in one skill. `points` is the skill's whole new spread. Pure: returns { ok, character } or { ok: false, reason, words }. */
export function spendPoints(c, skill, points) {
  const cats = SKILL_CATEGORY_IDS[skill];
  if (!cats) return refuse('unknown_skill');
  if (!points || typeof points !== 'object' || Array.isArray(points)) return refuse('bad_points');
  const next = {};
  for (const [cat, n] of Object.entries(points)) {
    if (!cats.includes(cat)) return refuse('unknown_category');
    if (!Number.isInteger(n) || n < 0 || n > POINT_MAX) return refuse('bad_points');
    if (n > 0) next[cat] = n;
  }
  const have = c.points?.[skill] || {};
  for (const cat of Object.keys(have)) if ((next[cat] || 0) < have[cat]) return refuse('cannot_take_back');
  if (sum(next) > levelOf(c, skill)) return refuse('over_level');
  if (sum(next) === sum(have)) return refuse('no_change');
  return { ok: true, character: { ...c, points: { ...c.points, [skill]: next } } };
}

/**
 * A mini-game win's XP claim, on the save (server mode off). Same rules as the hub: the skill
 * is the game's, a claim over LIMITS.maxXp is refused, a run pays once, a skill takes at most
 * LIMITS.xpPerSkillPerHour an hour (the last claim is trimmed, a full hour refuses), and levels
 * follow XP at most LIMITS.levelsPerSkillPerHour an hour. Returns { ok, character, paid, flags }.
 */
export function claimXp(c, { game, runId, xp } = {}, now = Date.now()) {
  const skill = GAME_SKILL[game];
  if (!skill) return refuse('unknown_game');
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) return refuse('bad_run');
  if (!Number.isInteger(xp) || xp < 1) return refuse('bad_xp');
  if (xp > LIMITS.maxXp) return refuse('over_max');
  const track = { log: { ...c.xpTrack?.log }, ups: { ...c.xpTrack?.ups }, runs: [...(c.xpTrack?.runs || [])] };
  if (track.runs.includes(runId)) return refuse('already_claimed');
  const recent = (track.log[skill] || []).filter(([at]) => at > now - HOUR);
  const left = Math.max(0, LIMITS.xpPerSkillPerHour - recent.reduce((n, [, v]) => n + v, 0));
  if (left <= 0) return refuse('hour_cap');
  const paid = Math.min(xp, left);
  track.log[skill] = [...recent, [now, paid]];
  track.runs = [...track.runs, runId].slice(-64);
  const total = (c.xp?.[skill] || 0) + paid;
  const target = levelFromXp(total);
  const ups = (track.ups[skill] || []).filter((at) => at > now - HOUR);
  let level = levelOf(c, skill);
  while (level < target && ups.length < LIMITS.levelsPerSkillPerHour) { level++; ups.push(now); }
  track.ups[skill] = ups;
  return {
    ok: true, paid: { [skill]: paid }, flags: paid < xp ? ['hour-cap'] : [],
    character: { ...c, xp: { ...c.xp, [skill]: total }, levels: { ...c.levels, [skill]: level }, xpTrack: track },
  };
}

/** Level-ups the hour cap held back (XP says level 4, the level is still 2) land when the hour turns. */
export function catchUp(c, now = Date.now()) {
  let changed = false;
  const levels = { ...c.levels };
  const ups = { ...c.xpTrack?.ups };
  for (const skill of ROLL_SKILL_IDS) {
    const target = levelFromXp(c.xp?.[skill] || 0);
    const recent = (ups[skill] || []).filter((at) => at > now - HOUR);
    while (levels[skill] < target && recent.length < LIMITS.levelsPerSkillPerHour) { levels[skill]++; recent.push(now); changed = true; }
    ups[skill] = recent;
  }
  return changed ? { ...c, levels, xpTrack: { ...(c.xpTrack || { log: {}, runs: [] }), ups } } : c;
}

/** A scan: the snapshot a death goes back to. */
export const scan = (c, now = Date.now()) => ({
  ...c, scan: { levels: { ...c.levels }, xp: { ...c.xp }, points: structuredClone(c.points || {}), at: Math.floor(now) },
});

/** Death and reprint, on the save: levels, XP and points go back to the scan; { ok, character, lost }. */
export function restore(c) {
  if (!c?.scan) return refuse('no_scan');
  const lost = { levels: {}, xp: {}, points: {} };
  for (const id of ROLL_SKILL_IDS) {
    if (c.levels[id] > c.scan.levels[id]) lost.levels[id] = c.levels[id] - c.scan.levels[id];
    if ((c.xp[id] || 0) > (c.scan.xp[id] || 0)) lost.xp[id] = c.xp[id] - (c.scan.xp[id] || 0);
    const gone = sum(c.points?.[id]) - sum(c.scan.points?.[id]);
    if (gone > 0) lost.points[id] = gone;
  }
  return { ok: true, lost, character: { ...c, levels: { ...c.scan.levels }, xp: { ...c.scan.xp }, points: structuredClone(c.scan.points), xpTrack: undefined } };
}

// ---- what the meter and picker read ----------------------------------------------------

function progressOf(levels, xp, points) {
  const outLevels = {}; const into = {};
  for (const id of ROLL_SKILL_IDS) {
    const level = Number.isFinite(levels?.[id]) ? levels[id] : LEVEL_MIN;
    outLevels[id] = level;
    into[id] = level >= LEVEL_MAX ? 0 : Math.max(0, (xp?.[id] || 0) - XP_CURVE[level - 1]);
  }
  return { levels: outLevels, xp: into, points: structuredClone(points || {}), curve: XP_CURVE };
}
/** The captain as the picker, the meter and the gym read it: levels, XP into the level, points. */
export const toProgress = (c) => progressOf(c?.levels, c?.xp, c?.points);
/** The last scan in the same shape; with no scan, the captain as they are (nothing known to lose). */
export const scanProgress = (c) => (c?.scan ? progressOf(c.scan.levels, c.scan.xp, c.scan.points) : toProgress(c));

// ---- the one thing a page calls -------------------------------------------------------

const makeRunId = (rng = Math.random) => `r-${Date.now().toString(36)}-${Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0')}`;

/**
 * store: the Voyage store (get/update). economy: voyage/account.js (on when the home server is).
 * Every method resolves to { ok, ... } and never throws; a refusal has `reason` and plain `words`.
 */
export function createSkillSave({ store, economy, now = Date.now, rng = Math.random } = {}) {
  const hub = () => Boolean(economy?.on);
  const char = () => store.get().character;
  const edit = (fn) => store.update((s) => (s.character ? { ...s, character: fn(s.character) } : s));
  const hubOut = (out) => (out && out.ok !== false ? { ok: true, ...out } : refuse(out?.reason || 'off', out || {}));
  return {
    get hub() { return hub(); },
    /** The captain as { levels, xp, points, curve } for the picker and meter, and the last scan the same way. */
    view() { const c = char(); return c ? { progress: toProgress(c), scan: scanProgress(c), hub: hub() } : null; },
    async spend(skill, points) {
      if (!char()) return refuse('off');
      if (hub()) return hubOut(await economy.spendPoints(skill, points));
      const out = spendPoints(char(), skill, points);
      if (out.ok) edit(() => out.character);
      return out;
    },
    async claim(game, xp, runId = makeRunId(rng)) {
      if (!char()) return refuse('off');
      if (hub()) return hubOut(await economy.claimXp(game, runId, xp));
      const c = catchUp(char(), now());
      const out = claimXp(c, { game, runId, xp }, now());
      if (out.ok) edit(() => out.character);
      return out;
    },
    async scan() {
      if (!char()) return refuse('off');
      if (hub()) return hubOut(await economy.scan());
      edit((c) => scan(c, now()));
      return { ok: true };
    },
    async restore() {
      if (!char()) return refuse('off');
      if (hub()) return hubOut(await economy.restore());
      const out = restore(char());
      if (out.ok) edit(() => out.character);
      return out;
    },
  };
}

export { cleanCharacter, cleanPoints, cleanXp };
