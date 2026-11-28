// The persuade minigame (social): read the room. They care about 3 of 5 values and dislike one.
// You pick argument cards from a hand, one at a time.
//   a card on something they care about -> it lands: trust += its worth + streak (landed cards in a row, up to 3)
//   a card on something they do not care about -> a miss: patience -1, streak resets
//   a card on something they dislike -> hurts: patience -2, streak resets
// Trust at the goal wins at once; patience out or no cards left loses. Tells (shown from the d20
// roll and the persuade points) point at what they care about or dislike; the rest you read from the
// words. Pure and seeded.
import { step as rngStep, hashSeed } from '../quests/rng.js';

export const VALUES = Object.freeze(['pay', 'safety', 'honor', 'speed', 'family']);
export const VALUE_NAMES = Object.freeze({ pay: 'Pay', safety: 'Safety', honor: 'Honor', speed: 'Speed', family: 'Family' });
export const CARD_TEXT = Object.freeze({
  pay: ['"There is a bonus in it for you."', '"I can pay you on the spot."', '"Name a fair price and I will meet it."'],
  safety: ['"I will have the airlock checked first."', '"Nobody gets hurt on this one."', '"We go slow and by the book."'],
  honor: ['"My word is good, ask anyone."', '"You would be doing the right thing."', '"I will put my name on it."'],
  speed: ['"We can be done before the shift ends."', '"No waiting, no paperwork."', '"It is a quick job, in and out."'],
  family: ['"Think of the people waiting at home."', '"Somebody out there needs this."', '"I would do the same for your kin."'],
});
export const TELL_CARE = Object.freeze({
  pay: 'Their eyes keep going to the credit chit.', safety: 'They check the door seal twice.', honor: 'They stand straighter when you say "word".',
  speed: 'They tap a foot and watch the clock.', family: 'A child\'s drawing is pinned by their desk.',
});
export const TELL_DISLIKE = Object.freeze({
  pay: 'They wince whenever money comes up.', safety: 'They roll their eyes at the word "careful".', honor: 'They sneer at big promises.',
  speed: 'They scowl at anything that sounds rushed.', family: 'They go cold when home comes up.',
});
const HAND = 8; // 5 cards on cares, 2 on the dislike, 1 neutral
const STREAK_CAP = 3;

/** setup: from setupPersuade ({ goal, patience, tells }). */
export function createPersuade({ seed = 1, setup = {}, opening = null } = {}) {
  let rng = hashSeed('persuade', seed);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const shuffle = (a) => { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  const vals = shuffle(VALUES);
  // A person sheet (social lane) fixes who cares about what; the seeded shuffles above and below still run, so nothing else moves.
  const fixed = opening?.cares?.length === 3 && opening.dislike;
  const cares = fixed ? opening.cares.slice() : vals.slice(0, 3), dislike = fixed ? opening.dislike : vals[3], neutral = fixed ? VALUES.find((v) => !cares.includes(v) && v !== dislike) : vals[4];
  // Tells are revealed in a seeded order over the three cares and the dislike.
  const order = shuffle([...cares.map((v) => ({ value: v, kind: 'care' })), { value: dislike, kind: 'dislike' }]);
  const tells = (setup.tells ?? 1);
  // The hand: 5 cards on cares (each care at least once), 2 on the dislike, 1 on the neutral value.
  const kinds = [...cares, cares[Math.floor(rand() * 3)], cares[Math.floor(rand() * 3)], dislike, dislike, neutral];
  const lines = Object.fromEntries(VALUES.map((v) => [v, shuffle([0, 1, 2])])); // a value never shows the same line twice in a hand
  const used = {};
  const hand = shuffle(kinds.slice(0, HAND)).map((value, id) => {
    const n = used[value] = (used[value] || 0) + 1;
    return { id, value, text: CARD_TEXT[value][lines[value][n - 1]], worth: 3 + Math.floor(rand() * 3) };
  });
  // Head starts from facts you know: their tells are shown from the start, and one card on that care becomes a named card worth 5.
  const known = (opening?.tells || []).map((t) => order.find((o) => o.value === t.value && o.kind === t.kind)).filter(Boolean);
  const shown = [...new Set([...known, ...order.slice(0, Math.max(0, Math.min(4, tells)))])].slice(0, 4);
  const usedNamed = new Set();
  for (const n of opening?.named || []) {
    const card = hand.filter((c) => c.value === n.value && !usedNamed.has(c.id)).sort((a, b) => a.worth - b.worth)[0];
    if (card) { card.text = n.text; card.worth = Math.max(card.worth, 5); card.named = true; usedNamed.add(card.id); }
  }
  return {
    cares, dislike, neutral, order, shown,
    hand, played: [], trust: Math.max(0, opening?.startTrust || 0), goal: setup.goal ?? 18, patience: setup.patience ?? 3, patienceMax: setup.patience ?? 3, streak: 0,
    done: false, result: null, events: [],
  };
}

/** What a card would be to them right now: 'care', 'dislike' or 'neutral'. */
export const kindOf = (s, card) => (s.cares.includes(card.value) ? 'care' : card.value === s.dislike ? 'dislike' : 'neutral');
/** The tell lines to show. */
export const tellLines = (s) => s.shown.map((t) => (t.kind === 'care' ? TELL_CARE[t.value] : TELL_DISLIKE[t.value]));
/** What the next landed card would add: worth plus the streak so far. */
export const landing = (s, card) => card.worth + Math.min(STREAK_CAP, s.streak);

/** Play a card from the hand. Returns 'landed', 'miss', 'hurt', or null when it is not playable. */
export function play(s, id) {
  if (s.done) return null;
  const card = s.hand.find((c) => c.id === id && !s.played.includes(c.id));
  if (!card) return null;
  s.events = [];
  s.played.push(card.id);
  const kind = kindOf(s, card);
  let out;
  if (kind === 'care') {
    const gain = landing(s, card);
    s.trust += gain; s.streak++;
    s.events.push({ type: 'landed', id, gain, kind });
    out = 'landed';
  } else {
    const cost = kind === 'dislike' ? 2 : 1;
    s.patience = Math.max(0, s.patience - cost); s.streak = 0;
    s.events.push({ type: kind === 'dislike' ? 'hurt' : 'miss', id, cost, kind });
    out = kind === 'dislike' ? 'hurt' : 'miss';
  }
  if (s.trust >= s.goal) finish(s, 'won');
  else if (s.patience <= 0) finish(s, 'lost');
  else if (s.played.length >= s.hand.length) finish(s, 'out');
  return out;
}

/** Placeholder XP: 3, +1 if they were still patient (2 or more left) at the end. None on a loss. */
export const persuadeXp = (r) => (r?.success ? 3 + (r.patienceLeft >= 2 ? 1 : 0) : 0);

function finish(s, how) {
  s.done = true;
  const success = how === 'won';
  s.result = { how, success, trust: s.trust, goal: s.goal, cardsPlayed: s.played.length, patienceLeft: s.patience, outcome: success ? 'won' : 'lost', xp: 0 };
  s.result.xp = persuadeXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}
