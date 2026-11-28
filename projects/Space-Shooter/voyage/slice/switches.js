// Opening B switches: each outcome can be turned off by flipping one value here (or ?ob=off in the URL for all of them).
// If Donaven rejects one (say the roll mapping), set it false; the old behaviour returns. Pure data.
const off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('ob') === 'off';
export const SWITCHES = Object.freeze({
  talkRange: !off,      // outcome 1: a talk does not hold the player (false: the floor is held during talks, as before)
  timeSkipsOnly: !off,  // outcome 2: beats and cards play in place (false: not supported separately; use git revert of the cuts commit)
  approaches: !off,     // outcome 3: rolls buy help and time (false: the roll picks pass or fail as before)
  stagedScenes: !off,   // outcome 4: staged breach and stand (false: no staging, Reck flips at once as before)
  retryOnDeath: !off,   // outcome 4: death shows retry (false: a lost fight goes to the story's lose branch)
  stealthTaste: !off,   // outcome 5: live stealth for "slip behind them" (false: that choice is a plain approach)
  fireAssist: !off,     // outcome 6: fire key and tap aim
  moodMusic: !off,      // outcome 7: music reacts to danger
});
