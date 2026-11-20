// The opening is sealed (opening track A, outcome 2). Pure: no DOM.
//
// Donaven flew the Duchess to a station, docked, and popped up in Hask's office; he also "broke out" into the old hangar.
// Until the last scene of the opening ends, nothing leads off the Tin Duchess: not the helm, not the cargo ramp, not the pad's
// berth door, not the links back to the classic game. Each says why in the ship's own voice.
//
//   sealed(save)                          true while the opening is running
//   sealReason(save, { kind, id, to, map })   the in-world reason a door or thing is shut, or null
//   EXITS                                 every way out found, with how it is sealed (checked by tests/stardust-opening-a.test.mjs)
import { sliceStarted, activeScene } from './rules.js';
import { ROOMS } from './presence.js';

export const WHY = Object.freeze({
  stay: "Tull's orders: stay aboard.",
  helm: "Tull's orders: stay aboard. Nobody flies the Duchess but Nessa.",
  ramp: "Tull's orders: nobody leaves the ship.",
  classic: "Tull's orders: stay aboard. The old hangar can wait.",
});

/** Has the opening's last scene ended? (Scene 6 sets day-five-over in every ending.) */
export const openingOver = (save) => Boolean(save?.flags?.['day-five-over'] || save?.quests?.done?.['day-five']);
/** The opening is running: begun and not over. */
export const sealed = (save) => sliceStarted(save) && !openingOver(save);

/**
 * Why a door or a thing is shut right now, or null when it is not our business.
 * { kind: 'door' | 'ship' | 'console'..., id, to (a door's far room), map (the room it is in) }
 */
export function sealReason(save, { kind, id, to = null, map = null } = {}) {
  if (!sealed(save)) return null;
  if (kind === 'ship' && id === 'helm') return WHY.helm;
  if (kind === 'door' || to) {
    if (to && !ROOMS.includes(to)) return WHY.stay; // anything that leaves the ship's rooms: the hangar, a station
    // The cargo ramp down to the landing pad: the pad is where scene 6 starts, so it opens with that scene.
    if (map === 'duchess-cargo' && id === 'ramp' && activeScene(save) !== 'day-five') return WHY.ramp;
  }
  return null;
}

/** Links to the old game while the opening runs. */
export const classicBlocked = (save) => sealed(save);

/** Every way out of the opening that exists in the build, and how each is sealed. Tests walk this list. */
export const EXITS = Object.freeze([
  { id: 'helm', where: 'duchess-bridge', how: 'interact gate (sealReason): the helm shows its lock and the reason; the course list never opens' },
  { id: 'cargo-ramp', where: 'duchess-cargo', how: 'door gate (sealReason) until scene 6 is the scene in progress' },
  { id: 'pad-berth-door', where: 'duchess-pad', how: "map state berth-door 'shut' until day-five-over, plus the gate (sealReason)" },
  { id: 'classic-link-header', where: 'page', how: 'boot.js sealClassicLinks: click shows the reason' },
  { id: 'classic-link-pause', where: 'page', how: 'boot.js sealClassicLinks: click shows the reason' },
  { id: 'hangar-launch-hatch', where: 'hangar', how: 'not reachable: it lives in the hangar, which the opening never enters' },
  { id: 'studio-links', where: 'url', how: 'a ?map= / ?explore= / ?quest= link plays a throwaway save, never a real captain; left as they are' },
]);
