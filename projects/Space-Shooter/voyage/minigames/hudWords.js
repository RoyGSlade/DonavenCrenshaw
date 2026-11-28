// Plain words for live HUD readouts that used to show raw numbers (house rule: state shows as drawn bars and words). Pure; every
// threshold is a share of what the model gives (total time, caught level, beats), so nothing is copied from the rules.

/** Time left on a clock as a word. */
export const clockWord = (left, total) => { const f = total > 0 ? left / total : 0; return f > 0.5 ? 'plenty of time' : f > 0.25 ? 'time is moving' : f > 0.1 ? 'hurry' : 'almost out'; };

/** Which firewall: First, Second, ... Last. */
export function stageWord(stage, stages) {
  const i = Math.min(stage, stages - 1);
  if (stages <= 1) return 'The firewall';
  return i === stages - 1 ? 'Last firewall' : `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][i] || 'Next'} firewall`;
}

/** Retries left as words (the drawn pips carry the count). */
export const retryWord = (left, total) => (!total ? 'no retries' : left <= 0 ? 'no retries left' : left === 1 && total > 1 ? 'last retry' : left >= total ? 'retries ready' : 'retries left');

/** Stealth heat against the level where you are caught. */
export function heatLevelWord(heat, caught) {
  const f = caught > 0 ? heat / caught : 0;
  return f < 0.1 ? 'unseen' : f < 0.4 ? 'warm' : f < 0.75 ? 'hot' : 'nearly caught';
}

/** Stealth beats left as a word. */
export function beatsWord(left, beats) {
  const f = beats > 0 ? left / beats : 0;
  return f > 0.5 ? 'plenty of time' : f > 0.15 ? 'time is moving' : 'running out';
}
