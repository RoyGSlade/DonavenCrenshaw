// The hangar's seam to the story lane (ROUND2-CONTRACT.md sections 3, 4 and 6).
// Round 2 integration: these are story's own modules now. The hangar imports
// from here so the seam stays one file.
import { storyOf as storyBlock } from './story/progress.js';
import { STATS } from './data.js';
import { statCard, chance as storyChance, optionTag } from './story/stats.js';

export { storyBus as bus, createBus } from './story/bus.js';
export { isUnlocked } from './story/progress.js';

/** The save's story block (story's storyOf: legacy saves count as finished). */
export const storyOf = (save) => storyBlock(save);

/** Is the tutorial running for this save? (respec is free while it is) */
export function tutorialOn(save) {
  const s = storyBlock(save);
  return !s.finished && !s.skipped;
}

// What each stat is for, in plain words, built from story's stat cards (one source of truth).
export const STAT_TEXT = Object.freeze(Object.fromEntries(STATS.map((s) => {
  const card = statCard(s.id, 3);
  return [s.id, Object.freeze({ short: card?.line || s.blurb, rolls: card?.rolls || '', options: optionTag(s.id), six: card?.six || '' })];
})));

/** The chance an attempt passes (0..1): 2d6 + (stat - 3) + bonus vs dc, a double six always works. */
export const chance = (stat, dc, bonus = 0) => storyChance(stat, dc, bonus);
