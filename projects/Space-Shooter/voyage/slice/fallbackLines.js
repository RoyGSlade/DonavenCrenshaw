// What someone says when you talk to them and nothing is scripted (opening track A, outcome 4). Pure: no DOM.
//
// Donaven: "should be able to start conversations with any npc if they dont have much or anything written at least an im busy".
// Everyone in the opening answers, in character, in a few words. They are DRAFT lines for Donaven (listed in READY): said to a
// janitor, a gunner or a captain, and a short one when they are on the move. Nobody is ever silent.
//
//   fallbackLine(npc, { role, moving, n })   { who, text } for the nth time you ask (they rotate); null for an unknown person
//   FALLBACK                                  the table, for the tests and the READY list
import { ROLES } from './role.js';

export const FALLBACK = Object.freeze({
  tull: {
    janitor: ['Busy, Janitor. Captain business. Very captain-ish.', 'Can it wait? I am in the middle of delegating.', "Not now, mop boy. The floor isn't going anywhere."],
    gunner: ['Gunner! Love the enthusiasm. Not now.', "Busy. Go aim at something, I'll bill you for it.", 'Ask me again on payday. Which is a legend.'],
    captain: ["You're the captain now. I just sit in the good chair and judge.", "Retired. Ask your captain. Oh, that's you.", 'No notes. Well. A few notes. Later.'],
    moving: ['Walk with me or get out of the way.', 'Bit busy walking, Janitor.'],
  },
  nessa: {
    janitor: ["Not now, mop boy. I'm flying.", 'Busy. If it is about the coffee, no.', "Mind the console. Don't touch the console."],
    gunner: ["Busy, gunner. Keep your hands off my console.", 'Later. I have a toll to argue with.', "If it's loud, tell me. If it's quiet, don't."],
    captain: ["Captain. I'm off the clock. Technically.", 'Busy, but for you, ten seconds. Go.', 'The ship flies. Good. Go away.'],
    moving: ["Walking here. Eyes up, janitor.", 'Not stopping. Come find me.'],
  },
  pip: {
    janitor: ["Can't talk, can't talk, something is ticking.", "Busy! Don't touch that. Or that.", 'If it hums, it is fine. If it stops humming, tell me.'],
    gunner: ['Gunner! Great, hold this. No, not that. Later, later.', "Can't, I'm holding a fitting together with hope.", "Don't lean on that. Or breathe near that."],
    captain: ["Captain! Everything's fine. Mostly. Ask me nothing.", 'She is running. Do not say that out loud.', 'Busy. Good busy. Probably.'],
    moving: ["Sorry, sorry, late for a leak!", "Walking! Don't stop me, I will forget why."],
  },
  reck: {
    janitor: ['Hm? Busy, mop boy. Practising my humming.', 'Not now. I am watching the scope. Mostly the scope.', 'Later! The turret and I are having a moment.'],
    gunner: ['Hm? Busy, rookie. Come find me when something explodes.', 'Not now. Humming.', "Later. I'm saving my good jokes for the Reavers."],
    captain: ['Captain! Busy. Humming. You know how it is.', 'Not now, sir. Cheerful at work.', 'Later. The turret sulks if I leave.'],
    moving: ['On my way somewhere!'],
  },
});

export const NPC_FALLBACK = Object.freeze(Object.keys(FALLBACK));

/** What they say the nth time you ask this role. They rotate so nobody repeats on the second tap. */
export function fallbackLine(npc, { role = 'janitor', moving = false, n = 0 } = {}) {
  const set = FALLBACK[npc];
  if (!set) return null;
  const pool = moving && set.moving?.length ? set.moving : set[ROLES.includes(role) ? role : 'janitor'];
  return { who: npc, text: pool[Math.abs(Math.trunc(n)) % pool.length] };
}
