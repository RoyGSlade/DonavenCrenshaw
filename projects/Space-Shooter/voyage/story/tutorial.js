// The tutorial that flows (ROUND2.md item 11). The steps are data in
// ./data/tutorial.js (strict JSON, editable from the Stardust Studio); this
// file reads them and holds the two bits of logic data cannot: PICKS and SKIP_IF. Chibby sets you up and
// hands you the ship; then three hangar people each run a little tutorial and
// send you out to meet one quest giver; once all three are met, jobs open.
//
//   setup  Chibby   walking around, the ship                 (no giver)
//   ralph  Ralph    mining                                   -> Garrity at Dustfall
//   mel    Mel      shooting                                 -> Hask at Alpha Relay
//   edna   Edna     talking (stat options), then a puzzle    -> Vey at Beacon Prime
//   wrap   Chibby   quests open
//
// Each step: { id, leg, objective, station, target, enter: [lines], wait:
// { type, match }, also: [{ type, match, lines, once }], after: [lines],
// reward, unlocks, talk, skipIf }. A line is a line id, or { pick } (a line
// chosen from what happened, PICKS below). Events and ids are
// ROUND2-CONTRACT.md section 4; the director (director.js) runs this.

import { TUTORIAL_DATA } from './data/tutorial.js';

const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
export const LEGS = freeze(structuredClone(TUTORIAL_DATA.legs));
export const STEPS = freeze(structuredClone(TUTORIAL_DATA.steps));

export const STEP_IDS = Object.freeze(STEPS.map((s) => s.id));
export const STEP_BY_ID = new Map(STEPS.map((s) => [s.id, s]));

/** Every unlock the tutorial hands out (a skip hands them all over). */
export const ALL_UNLOCKS = Object.freeze([...new Set(STEPS.flatMap((s) => s.unlocks || []))]);
/** What an unlock is called on screen ("Mel's fitting bay"). */
export const UNLOCK_NAMES = Object.freeze({ ...(TUTORIAL_DATA.unlockNames || {}) });
export const unlockName = (id) => UNLOCK_NAMES[id] || id;
export const UNLOCK_ID = /^(ship|jobs|(station|explore|giver):[a-z0-9][a-z0-9-]{0,31})$/;

// Talks the director runs itself (data: ./data/tutorial.js "talks"). An option
// with `stat` needs that stat at STAT_OPTION_MIN (data.js) and is shown locked
// with its reason otherwise, so the player learns that stats open options.
// Every option works here: the tutorial talk teaches, it does not fail you.
export const TALKS = freeze(structuredClone(TUTORIAL_DATA.talks));

const ORDER = ['cha', 'con', 'dex', 'wis'];
// Lines chosen from what happened: (event detail, save) -> line id.
export const PICKS = Object.freeze({
  /** Chibby reacts to the captain's best stat (the first of a tie), or kindly to a low roll. */
  roll(detail, save) {
    const stats = detail?.character?.stats || save?.character?.stats || {};
    let best = null;
    for (const id of ORDER) if (best === null || (stats[id] || 0) > (stats[best] || 0)) best = id;
    return (stats[best] || 0) <= 3 ? 'chibby.roll.low' : `chibby.roll.${best}`;
  },
  /** Mel: a clean sheet, or "took you long enough". */
  shot(detail) {
    const hits = Number(detail?.hits) || 0;
    const shots = Number(detail?.shots) || 0;
    return shots > 0 && hits >= shots ? 'mel.shoot.clean' : 'mel.shoot.done';
  },
});

// Conditions that let a step pass silently (no lines), e.g. a replay with a captain already made.
export const SKIP_IF = Object.freeze({
  hasCaptain: (save) => Boolean(save?.character),
});
