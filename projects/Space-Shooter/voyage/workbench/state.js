// The workbench room's test character, pure (no DOM, no clock of its own: `now` is handed in). It keeps what a
// real captain would keep once skill saving lands (levels, XP into the level, category points, the scan snapshot)
// plus a few test-only things (credits for the gym, the gym's hourly log, the check difficulty). It lives in its own
// storage key and never touches a real save. Every change returns a new state.
import { newProgress, addXp, scanSnapshot, reprint, unscanned } from '../minigames/progress.js';
import { cleanSkillPoints } from '../minigames/picker.js';
import { PAGES } from '../minigames/bookPages.js';
import { TRAINER_SECTORS } from '../minigames/perihelionData.js';
import { ROLL_SKILLS, STATS, STAT_BASELINE, LEVEL_MIN, LEVEL_MAX } from '../data.js';

export const STORAGE_KEY = 'stardust.workbench.v1';
export const START_CREDITS = 100;
export const DCS = Object.freeze([8, 12, 16]); // the check difficulty dial: easy, normal, hard
export const XP_CAP = 10; // one action pays at most this much (the quest engine's own cap, quests/engine.js)
const SKILL_IDS = ROLL_SKILLS.map((s) => s.id);

/** The social lane's part of the world: what you carry, who you have got to know, the wants pinned, the reputations. Test state: one clean circuit board in the bag. */
export const freshWorld = () => ({ people: {}, items: { 'circuit-board': 1 }, wants: [], rep: {} });

/** A fresh test state: every skill at level 1, nothing spent, scanned at the start, 100 credits. */
export function freshState() {
  const progress = newProgress();
  return { progress, snap: scanSnapshot(progress), credits: START_CREDITS, gymLog: {}, learned: {}, navProgress: {}, dc: 12, deaths: 0, scans: 0, xpPaid: 0, ...freshWorld(), said: 'A fresh test state.' };
}

/** What the d20 and the minigames read: the real character shape (levels, points) with stats at baseline, so only level and points move the roll. */
export function characterOf(state) {
  return {
    name: 'Workbench Tester',
    stats: Object.fromEntries(STATS.map((s) => [s.id, STAT_BASELINE])),
    levels: { ...state.progress.levels },
    points: JSON.parse(JSON.stringify(state.progress.points || {})),
  };
}

/** Pay XP into one skill. Returns { state, xp, gained }: xp is what was paid (capped), gained the levels climbed. */
export function earnXp(state, skill, xp) {
  const paid = Math.max(0, Math.min(XP_CAP, Math.trunc(xp) || 0));
  if (!SKILL_IDS.includes(skill) || paid <= 0) return { state, xp: 0, gained: 0 };
  const r = addXp(state.progress, skill, paid);
  return { state: { ...state, progress: r.progress, xpPaid: state.xpPaid + paid }, xp: paid, gained: r.gained };
}

/** Put points into one skill's categories (kept inside the rules: at most the level in total, 9 each). */
export function setPoints(state, skill, points) {
  if (!SKILL_IDS.includes(skill)) return state;
  const level = state.progress.levels[skill];
  const clean = cleanSkillPoints(skill, points, level);
  return { ...state, progress: { ...state.progress, points: { ...state.progress.points, [skill]: clean } } };
}

/** A scan: everything so far is safe. */
export const scan = (state) => ({ ...state, snap: scanSnapshot(state.progress), scans: state.scans + 1, said: 'Scanned. Everything so far is safe.' });

/** Death and reprint: skill progress goes back to the last scan; what was earned since is gone. */
export function die(state) {
  const lost = unscanned(state.progress, state.snap);
  const progress = reprint(state.progress, state.snap);
  const said = lost.safe ? 'You died with nothing unscanned, so nothing was lost.' : `You died. Reprinted from your last scan: ${lost.points ? `${lost.points} skill point${lost.points === 1 ? '' : 's'} and ` : ''}${lost.xp} XP gone.`;
  return { state: { ...state, progress, deaths: state.deaths + 1, said }, lost };
}

/** Back to a fresh test state (keeps nothing, not even the scan). */
export const reset = () => ({ ...freshState(), said: 'Reset. A fresh test state.' });

/** The check difficulty dial: the next of 8, 12, 16 and round again. */
export const nextDc = (state) => ({ ...state, dc: DCS[(DCS.indexOf(state.dc) + 1) % DCS.length] });

/** Test credits: a gift, a payment, or the gym's fee. Never below 0. */
export const withCredits = (state, credits, said = state.said) => ({ ...state, credits: Math.max(0, Math.trunc(credits) || 0), said });

/** A state from storage JSON (or anything), always whole: unknown or broken fields fall back to a fresh state's. */
export function cleanState(input) {
  const base = freshState();
  if (!input || typeof input !== 'object') return base;
  const fixProgress = (p) => {
    const out = newProgress();
    if (!p || typeof p !== 'object') return out;
    for (const id of SKILL_IDS) {
      const lv = p.levels?.[id];
      out.levels[id] = Number.isFinite(lv) ? Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.trunc(lv))) : LEVEL_MIN;
      const xp = p.xp?.[id];
      out.xp[id] = Number.isFinite(xp) && xp > 0 ? Math.trunc(xp) : 0;
      if (p.points?.[id]) out.points[id] = cleanSkillPoints(id, p.points[id], out.levels[id]);
    }
    return out;
  };
  const progress = fixProgress(input.progress);
  const snap = input.snap ? fixProgress(input.snap) : scanSnapshot(progress);
  const n = (v, d) => (Number.isFinite(v) && v >= 0 ? Math.trunc(v) : d);
  return { ...base, progress, snap: scanSnapshot(snap), credits: n(input.credits, base.credits), gymLog: input.gymLog && typeof input.gymLog === 'object' && !Array.isArray(input.gymLog) ? input.gymLog : {}, learned: Object.fromEntries(PAGES.filter((p) => input.learned?.[p.id] === true).map((p) => [p.id, true])), navProgress: Object.fromEntries(TRAINER_SECTORS.filter((x) => Number.isFinite(input.navProgress?.[x.id]?.stars)).map((x) => { const p = input.navProgress[x.id]; return [x.id, { stars: Math.max(0, Math.min(3, Math.trunc(p.stars))), bestFuel: Number.isFinite(p.bestFuel) ? p.bestFuel : null, bestTurns: Number.isFinite(p.bestTurns) ? p.bestTurns : null }]; })), dc: DCS.includes(input.dc) ? input.dc : 12, deaths: n(input.deaths, 0), scans: n(input.scans, 0), xpPaid: n(input.xpPaid, 0), ...cleanWorld(input), said: 'Welcome back to the workbench.' };
}

/** Load and save (storage is optional: a private window or a test just keeps it in memory). */
export function loadState(storage = globalThis.localStorage) {
  try { return cleanState(JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')); } catch { return freshState(); }
}
export function saveState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

/** The social part of a state from storage JSON: plain objects only, items as whole counts, wants as ids. */
function cleanWorld(input) {
  const base = freshWorld();
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  const items = obj(input.items) ? Object.fromEntries(Object.entries(input.items).filter(([, v]) => Number.isInteger(v) && v > 0 && v <= 99)) : base.items;
  const rep = obj(input.rep) ? Object.fromEntries(Object.entries(input.rep).filter(([, v]) => Number.isInteger(v))) : {};
  const people = obj(input.people) ? JSON.parse(JSON.stringify(input.people)) : {};
  return { people, items, rep, wants: Array.isArray(input.wants) ? input.wants.filter((w) => typeof w === 'string').slice(0, 12) : [] };
}
