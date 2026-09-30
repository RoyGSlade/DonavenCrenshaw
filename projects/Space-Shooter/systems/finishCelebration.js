// Presentation only. A leaderboard move requires an accepted server verdict;
// a browser best never invents an online placement.
const time = (v) => Number.isFinite(v) && v > 0 ? v : null;
const rank = (v) => Number.isInteger(v) && v > 0 ? v : null;

export function finishCelebration({ timeMs, previousMs = null, result = null, kind = 'weekly' } = {}) {
  const elapsed = time(timeMs);
  const previous = time(previousMs);
  const accepted = result?.status === 'accepted';
  const ranked = accepted && !result.staff;
  const currentRank = ranked ? rank(result.best?.rank) : null;
  const rankBefore = ranked ? rank(result.rankBefore) : null;
  const browserBest = elapsed !== null && previous !== null && elapsed < previous;
  const personalBest = accepted && result.personalBest === true;
  const improved = personalBest || browserBest;
  const climbed = personalBest && currentRank !== null && rankBefore !== null && currentRank < rankBefore;
  return {
    timeMs: elapsed,
    previousMs: previous,
    improved,
    deltaMs: browserBest ? previous - elapsed : null,
    title: personalBest ? 'PERSONAL BEST' : browserBest ? 'NEW LOCAL BEST' : previous === null ? 'FIRST FINISH' : kind === 'network' ? 'NETWORK COMPLETE' : 'LAP COMPLETE',
    rank: currentRank,
    rankBefore,
    climbed,
    places: climbed ? rankBefore - currentRank : 0,
    accepted,
  };
}
