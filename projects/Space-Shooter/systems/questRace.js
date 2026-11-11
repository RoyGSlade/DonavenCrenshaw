// Quest race mode: today's racing page flying a race for the new game (a
// quest's race leg, or the hangar's practice circuit) with the upgraded ship.
//
// The one rule: a quest race keeps NOTHING in today's game. No leaderboard
// run, no ghost, no personal best, no weekly entry. The mode is set once, at
// boot, from ?questrace=<token> (voyage/races/questRace.js has the ticket
// rules). A quest race flies in its own mode (engine/modes/questRace.js),
// beside today's weekly mode, which is left byte-identical. The writes today's
// racing page could make around it ask allowPersistentWrite(kind) first:
//   'best' 'ghost' 'weekly'  engine/modes/questRace.js, at the finish: today's
//                            weekly finish keeps a best and a ghost and sends
//                            run-saving events; a quest race asks about each
//   'saving'                 systems/runSaving.js initRunSaving (hub board runs,
//                            hub sync); boot.js also never starts it
//   'settings'               ui/raceIntro.js, "intro seen" for the layout
// In quest race mode each of these returns false and is noted in
// blockedWrites() (and on <html data-questrace-blocked>, for the browser tests).
// Outside the mode it always returns true, so today's racing is unchanged.
let mode = null;
const blocked = [];

/** Sets the mode for this page (once, at boot). info: the resolved race, or null. */
export function setQuestRaceMode(info) {
  mode = info ? Object.freeze({ ...info }) : null;
  try { if (mode) globalThis.document.documentElement.dataset.questrace = mode.kind || 'quest'; } catch { /* no DOM in tests */ }
}

/** The race being flown in quest race mode, or null. */
export const questRaceMode = () => mode;
export const isQuestRace = () => mode !== null;

/**
 * May the racing code keep this? true outside quest race mode. Inside it,
 * false, and the attempt is noted so tests can prove nothing was written.
 */
export function allowPersistentWrite(kind) {
  if (!mode) return true;
  blocked.push(String(kind));
  try { globalThis.document.documentElement.dataset.questraceBlocked = [...new Set(blocked)].join(' '); } catch { /* no DOM in tests */ }
  return false;
}

export const blockedWrites = () => [...blocked];

/** For tests only: back to normal racing. */
export function resetQuestRaceMode() {
  mode = null;
  blocked.length = 0;
}
