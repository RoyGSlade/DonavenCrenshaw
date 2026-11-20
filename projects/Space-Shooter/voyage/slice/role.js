// Who the player is, and what people call them (opening track A, outcome 3). Pure: no DOM.
//
// Donaven: "i pop up in a random room with hask who despite me being in a janitor outfit calls me captain". The player starts the
// opening as the janitor, becomes the gunner when Tull hires them (scene 4) and the captain when Tull hands over the Duchess
// (scene 6). A line that assumes a role checks it.
//
//   roleOf(save)                 'janitor' | 'gunner' | 'captain'
//   addressOf(role)              the word people use: "Janitor", "Gunner", "Captain"
//   roleSay(text, role)          a line written for a captain, said to this role: the address word swapped
//   ROLE_LINES                   lines that assume a role, with the line to use instead (drafts, listed in READY)
import { sliceStarted } from './rules.js';
import { ROLES, addressOf, roleSay } from './roleSay.js';

export { ROLES, addressOf, roleSay };

/** A save outside the opening is a captain (the licence made one). Inside it: janitor until hired, gunner until handed the ship. */
export function roleOf(save) {
  if (!sliceStarted(save)) return 'captain';
  const flags = save?.flags || {};
  const done = save?.quests?.done || {};
  if (flags['duchess-busted'] || flags['day-five-over'] || done['day-five']) return 'captain';
  if (done['the-eighth-gunner']) return 'gunner';
  return 'janitor';
}

/**
 * Lines that name the player's role by hand and what to say to someone who is not that role yet. id: a story or content line id,
 * or a data path (the datapad's page name). `for`: the role the original line is right for.
 */
export const ROLE_LINES = Object.freeze([
  { id: 'hangarData:locked', for: 'captain', note: "Chibby's 'Paperwork first, Captain'" },
  { id: 'standIn:chibby', for: 'captain', note: "'There's my captain!'" },
  { id: 'standIn:vey', for: 'captain', note: "'for a favour, captain'" },
  { id: 'offers:noJobs', for: 'captain', note: "'Nothing for you right now, Captain.'" },
  { id: 'givers:greeting', for: 'captain', note: "Hask and Vey's greetings open with 'Captain'" },
  { id: 'story:lines', for: 'captain', note: 'the tutorial lines that say Captain (hask.greet, chibby.*, garrity.*)' },
]);
