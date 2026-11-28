// The intimidate minigame (social): push your luck. Each beat you choose Push or Stand.
//   Push  -> they may snap (a seeded roll against that push's chance). No snap: what you have won
//            goes up to the next step. Snap: you lose it all, unless you have a save, which shrugs
//            the snap off (you keep what you had and may Push or Stand again, the push is not spent).
//   Stand -> take what you have. At the goal or more you win; a stand under it is a loss.
// Six pushes at most; the sixth ends the talk. Pure and seeded: the snap rolls are fixed when the
// state is made, so a replay with the same seed and choices is the same.
import { step as rngStep, hashSeed } from '../quests/rng.js';

/** setup: from setupIntimidate. */
export function createIntimidate({ seed = 1, setup = {} } = {}) {
  let rng = hashSeed('intimidate', seed);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const chances = setup.chances ?? [8, 14, 22, 32, 44, 58];
  const wins = setup.wins ?? [3, 6, 10, 15, 21, 28];
  return {
    chances, wins, goal: setup.goal ?? 10, stars: setup.stars ?? [10, 15, 21], readsOdds: setup.readsOdds ?? true,
    saves: setup.saves ?? 0, savesLeft: setup.saves ?? 0,
    rolls: chances.map(() => rand()), extra: Array.from({ length: 12 }, rand), // extra rolls for pushes retried after a save
    pushes: 0, won: 0, tries: 0, log: [], done: false, result: null, events: [],
  };
}

/** The chance (percent) that the next Push makes them snap. null when there is no next push. */
export const nextChance = (s) => (s.pushes < s.chances.length ? s.chances[s.pushes] : null);
/** What you would have after the next push. */
export const nextWin = (s) => (s.pushes < s.wins.length ? s.wins[s.pushes] : null);
/** A plain word for how close to the edge they are, from the chance. */
export const mood = (chance) => (chance <= 10 ? 'calm' : chance <= 25 ? 'uneasy' : chance <= 45 ? 'rattled' : 'about to break');
export const starsOf = (s, won) => s.stars.filter((x) => won >= x).length;
/** Placeholder XP: 3, plus one per star above the first. None when you lose. */
export const intimidateXp = (r) => (r?.success ? 3 + Math.max(0, r.stars - 1) : 0);

/** Push. Returns 'rose', 'saved' (a snap shrugged off), 'snapped', or null when done. */
export function push(s) {
  if (s.done || s.pushes >= s.chances.length) return null;
  s.events = [];
  const roll = s.tries === 0 ? s.rolls[s.pushes] : s.extra[(s.tries - 1) % s.extra.length];
  const snap = roll * 100 < s.chances[s.pushes];
  if (snap) {
    if (s.savesLeft > 0) {
      s.savesLeft--; s.tries++;
      s.log.push({ push: s.pushes + 1, outcome: 'saved' }); s.events.push({ type: 'saved' });
      return 'saved';
    }
    s.log.push({ push: s.pushes + 1, outcome: 'snapped' });
    finish(s, 'snapped'); return 'snapped';
  }
  s.won = s.wins[s.pushes]; s.pushes++; s.tries = 0;
  s.log.push({ push: s.pushes, outcome: 'rose', won: s.won });
  s.events.push({ type: 'rose', won: s.won });
  if (s.pushes >= s.chances.length) finish(s, 'stood');
  return 'rose';
}

/** Stand: take what you have. */
export function stand(s) {
  if (s.done) return null;
  finish(s, 'stood');
  return 'stood';
}

function finish(s, how) {
  s.done = true;
  const won = how === 'snapped' ? 0 : s.won;
  const success = how === 'stood' && won >= s.goal;
  const stars = success ? starsOf(s, won) : 0;
  s.result = { how, success, won, goal: s.goal, stars, pushes: s.pushes, savesUsed: s.saves - s.savesLeft, outcome: success ? 'won' : how === 'snapped' ? 'snapped' : 'short', xp: 0 };
  s.result.xp = intimidateXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
