/** Ephemeral room formats. No rankings or persistent match history. */
export const MATCH_MODES = Object.freeze({
  duel: Object.freeze({ label: '1v1', seats: 2 }),
  ffa3: Object.freeze({ label: '1v1v1', seats: 3 }),
});
export const isMode = mode => typeof mode === 'string' && Object.hasOwn(MATCH_MODES, mode);
export const modeSeats = (mode = 'duel') => isMode(mode) ? MATCH_MODES[mode].seats : 0;
export const PILOT_COLORS = Object.freeze(['#81e6df', '#ffad72', '#c7a6ff']);
export const PILOT_NAMES = Object.freeze(['Cyan', 'Orange', 'Violet']);
export const voteKey = id => ['host', 'guest', 'guest2'][id];
