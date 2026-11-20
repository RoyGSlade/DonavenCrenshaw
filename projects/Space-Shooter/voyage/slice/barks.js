// Barks (opening B, outcome 1): short lines over a head. Two kinds:
//   - talk lines: what a speaker says when you walk off mid-talk ("Hey, I'm not done"), come back, or leave for good;
//   - passing lines: ambient chatter as you walk by (once in a while, never the same line twice in a row).
// ALL LINES HERE ARE DRAFTS for Donaven: they are data so they are easy to change, and READY lists them. Keep them short.
// Pure: the picker takes an injected clock and rng.
export const TALK_LINES = Object.freeze({
  pause: {
    tull: ["Hey, I'm not done.", 'Where are you going? I was mid-sentence.', 'Janitor! Rude. I was talking.'],
    nessa: ['I was not finished.', 'Stay put. Two more seconds.', 'Walking off mid-order. Bold.'],
    reck: ["Hey, I'm not done, janitor.", 'Hold on, best bit coming up.', 'Oi! Listen to the end.'],
    pip: ["Wait wait, I'm not done!", 'Stay! This part matters!', 'Where are you going?'],
    reaver: ["Where d'you think you're going?", 'Oi. Cleaner. Stay.', 'We are talking, cleaner.'],
    default: ["Hey, I'm not done.", 'Where are you going?'],
  },
  resume: {
    tull: ['Right. Where was I?', 'Good. Sit. Stand. Listen.'],
    nessa: ['Thank you. Now.', 'Where was I.'],
    reck: ['There you are.', 'Right, so.'],
    pip: ['Oh good, you came back.', 'Right! Okay!'],
    reaver: ["That's better.", 'Stay where I can see you.'],
    default: ['Right. Where was I?'],
  },
  end: {
    tull: ["Fine. Find me when you're ready.", 'Off you go, then. I will be here. Probably.'],
    nessa: ['Fine. Come back when you are ready.', 'Your loss, janitor.'],
    reck: ["Fine. I'll be right here.", 'Catch me later, then.'],
    pip: ["Okay! Okay. Come find me!", 'Fine! I will be over here!'],
    reaver: ['Run, then.', 'Not for long.'],
    default: ["Fine. Find me when you're ready."],
  },
});

// Passing chatter, by person. Each is an NPC id on the Duchess. Add rooms or scene flags later without code changes.
export const PASSING_LINES = Object.freeze({
  tull: ['Mind the floor, janitor.', 'If anyone asks, I was working.', 'Do not touch the urn.'],
  nessa: ['Keep your mop off the helm.', 'Lane is quiet. Too quiet.', 'Boots off the console.'],
  reck: ['Seventh time lucky, I reckon.', 'Nice mop. Has a future.', 'Morning, janitor.'],
  pip: ['If it hisses, tell me.', 'Do not lick the coolant. Long story.', 'Everything is fine. Probably.'],
});

/** Every draft line, flat, for the READY list: [{ speaker, kind, text }]. */
export function draftLines() {
  const out = [];
  for (const [kind, by] of Object.entries(TALK_LINES)) for (const [speaker, lines] of Object.entries(by)) for (const text of lines) out.push({ speaker, kind: `bark-${kind}`, text });
  for (const [speaker, lines] of Object.entries(PASSING_LINES)) for (const text of lines) out.push({ speaker, kind: 'bark-passing', text });
  return out;
}

/**
 * createBarker({ rand, passCooldownMs, passRange }) -> { talkLine(kind, speaker), passing(id, distTiles, nowMs) }.
 * passing returns a line or null: only inside passRange tiles, once per cooldown per person, never the same line twice in a row.
 */
export function createBarker({ rand = Math.random, passCooldownMs = 22000, passRange = 3, chance = 0.7 } = {}) {
  const last = new Map(); // person -> last line
  const when = new Map(); // person -> the time they last barked in passing
  const pickFrom = (list, key) => {
    if (!list?.length) return null;
    const pool = list.length > 1 ? list.filter((l) => l !== last.get(key)) : list;
    const line = pool[Math.floor(rand() * pool.length) % pool.length];
    last.set(key, line);
    return line;
  };
  return {
    talkLine(kind, speaker) { const by = TALK_LINES[kind] || {}; return pickFrom(by[speaker] || by.default, `${kind}:${speaker}`); },
    passing(id, dist, nowMs) {
      const lines = PASSING_LINES[id];
      if (!lines || dist == null || dist > passRange) return null;
      if (nowMs - (when.get(id) ?? -Infinity) < passCooldownMs) return null;
      if (rand() > chance) { when.set(id, nowMs - passCooldownMs * 0.9); return null; } // a miss: try again a little sooner
      when.set(id, nowMs);
      return pickFrom(lines, `pass:${id}`);
    },
  };
}
