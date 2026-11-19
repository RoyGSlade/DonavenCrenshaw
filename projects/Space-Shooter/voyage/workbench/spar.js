// The sparring spot, pure: the marauder fight setup (the same enemy type and fight rules as scene 3's corridor fight, played
// in the workbench room) and the placeholder shooting XP. Nothing here runs the fight; the page calls onfoot.fight(sparSetup()).
export const SPAR_ENEMY = 'marauder';
export const SPAR_SPAWN = 'spar';
export const SPAR_EXIT = 'spar-exit';

/** A fight in the workbench room: `count` marauders (1 to 4) on the east side of the ring. */
export function sparSetup({ count = 2, seed = 1 } = {}) {
  const n = Math.max(1, Math.min(4, Math.trunc(count) || 2));
  const spots = [[25, 7], [25, 9], [24, 8], [26, 8]];
  return { map: 'workbench', spawn: SPAR_SPAWN, exit: SPAR_EXIT, seed, enemies: spots.slice(0, n).map((at) => ({ type: SPAR_ENEMY, at })) };
}

/** Placeholder Shooting XP (shooting has no minigame, so the sparring spot is where its XP is tried): 2 a kill, +2 for clearing the ring. */
export const sparXp = ({ outcome, kills = 0 } = {}) => Math.max(0, Math.min(10, (Math.trunc(kills) || 0) * 2 + (outcome === 'win' ? 2 : 0)));

/** One plain line for the result. */
export function sparSaid({ outcome, kills = 0 } = {}, xp = 0) {
  const k = `${kills} marauder${kills === 1 ? '' : 's'} down`;
  const head = outcome === 'win' ? `Ring clear, ${k}.` : outcome === 'lose' ? `You went down, ${k}. The ring resets.` : `You walked out, ${k}.`;
  return `${head} ${xp ? `+${xp} Shooting XP.` : 'No XP.'}`;
}
