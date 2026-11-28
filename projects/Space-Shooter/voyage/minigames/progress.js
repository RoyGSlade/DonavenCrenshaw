// Unscanned progress: what a death would cost right now (design doc Section 4:
// "Skills grow by doing things related to them, so skill progress is exactly
// what an unscanned death costs you... show unscanned progress on screen").
// Pure: it compares a character's progress with the snapshot taken at the last
// scan. The XP curve is a PLACEHOLDER (the doc: "XP speed and level cost will be
// tuned by playing"; the server owns real XP): xpToNext(level) = XP_STEP x level.
import { ROLL_SKILLS, LEVEL_MIN, LEVEL_MAX } from '../data.js';

export const XP_STEP = 20;
export const xpToNext = (level) => (level >= LEVEL_MAX ? Infinity : XP_STEP * level);
const NAME = Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, s.name]));
const clampLevel = (n) => Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.trunc(n) || LEVEL_MIN));

/** A fresh progress record: every skill at level 1 with no XP, no points spent. */
export const newProgress = () => ({
  levels: Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, LEVEL_MIN])),
  xp: Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, 0])), // XP into the current level
  points: {}, // { skill: { category: n } }
});

/** Total XP ever earned at (level, xpInto): the sum of the levels below plus the part-way XP. */
export function totalXp(level, into = 0) {
  let sum = 0;
  for (let l = LEVEL_MIN; l < clampLevel(level); l++) sum += xpToNext(l);
  return sum + Math.max(0, into);
}

/** Add XP to one skill. Returns the new progress and which levels were gained. Level 9 keeps no extra XP. */
export function addXp(progress, skill, amount) {
  if (!(skill in progress.levels) || !(amount > 0)) return { progress, gained: 0 };
  let level = progress.levels[skill], into = progress.xp[skill] + Math.trunc(amount), gained = 0;
  while (level < LEVEL_MAX && into >= xpToNext(level)) { into -= xpToNext(level); level++; gained++; }
  if (level >= LEVEL_MAX) into = 0;
  return { progress: { ...progress, levels: { ...progress.levels, [skill]: level }, xp: { ...progress.xp, [skill]: into } }, gained };
}

/** A scan: the snapshot a reprint goes back to. Deep enough that later play cannot change it. */
export const scanSnapshot = (p) => ({ levels: { ...p.levels }, xp: { ...p.xp }, points: JSON.parse(JSON.stringify(p.points || {})) });

/** Death and reprint: skill progress goes back to the snapshot (everything earned since the scan is gone). */
export const reprint = (_p, snap) => scanSnapshot(snap);

/**
 * What a death would cost now: [{ skill, name, fromLevel, toLevel, levelsGained, xpGained, pointsAtRisk }]
 * for every skill that moved since the scan (biggest XP first), plus totals.
 * pointsAtRisk = category points spent in this skill beyond what the scan had spent, or at least the levels gained.
 */
export function unscanned(now, snap) {
  const rows = [];
  for (const s of ROLL_SKILLS) {
    const id = s.id;
    const xpGained = totalXp(now.levels[id], now.xp[id]) - totalXp(snap.levels[id], snap.xp[id]);
    if (xpGained <= 0) continue;
    const levelsGained = now.levels[id] - snap.levels[id];
    rows.push({ skill: id, name: NAME[id], fromLevel: snap.levels[id], toLevel: now.levels[id], levelsGained, xpGained, pointsAtRisk: levelsGained });
  }
  rows.sort((a, b) => b.xpGained - a.xpGained || a.skill.localeCompare(b.skill));
  return { rows, xp: rows.reduce((n, r) => n + r.xpGained, 0), points: rows.reduce((n, r) => n + r.pointsAtRisk, 0), safe: rows.length === 0 };
}

/** One plain line for a chip: "Safe: nothing unscanned." / "3 skill points and 46 XP at risk since your last scan." */
export function riskLine(u) {
  if (u.safe) return 'Safe. Nothing unscanned.';
  const pts = u.points ? `${u.points} skill point${u.points === 1 ? '' : 's'} and ` : '';
  return `${pts}${u.xp} XP at risk since your last scan.`;
}

/** The risk level for colouring the chip: 'safe', 'low' (under one level of XP), 'high' (a level or more gained). */
export const riskTone = (u) => (u.safe ? 'safe' : u.points > 0 ? 'high' : 'low');
