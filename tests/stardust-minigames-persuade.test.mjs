// Minigames lane piece 8: social persuade, read the room. Numbers from PLAN.md section 2.6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupPersuade, tierOf } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createPersuade, play, kindOf, tellLines, VALUES, CARD_TEXT, TELL_CARE, TELL_DISLIKE } from '../projects/Space-Shooter/voyage/minigames/persuade.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('persuade setup: base, tier and the exact persuade points', () => {
  assert.deepEqual(setupPersuade({}), { goal: 22, patience: 3, tells: 1, tier: 0, points: { persuade: 0, intimidate: 0, haggle: 0 }, label: 'Steady' });
  assert.deepEqual([-2, -1, 0, 1, 2].map((t) => setupPersuade({ tier: t }).goal), [24, 23, 22, 21, 19]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((t) => setupPersuade({ tier: t }).tells), [0, 1, 1, 2, 2]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((t) => setupPersuade({ tier: t }).patience), [2, 3, 3, 4, 4]);
  const at = (n) => setupPersuade({ points: { persuade: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9].map((n) => at(n).goal), [22, 21, 20, 19, 17, 16, 13]);
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9].map((n) => at(n).tells), [1, 1, 1, 2, 2, 3, 4]);
  assert.equal(setupPersuade({ points: { haggle: 9 }, level: 9 }).goal, 22, 'haggle points do nothing here');
  assert.equal(setupPersuade({ points: { persuade: 9 }, level: 2 }).goal, 20, 'points are capped by level');
  assert.equal(setupPersuade({ tier: 2, points: { persuade: 9 }, level: 9 }).goal, 10, 'never under 10');
});

test('the picker words are the setup numbers', () => {
  for (const n of [0, 1, 3, 6, 9]) {
    const u = setupPersuade({ points: { persuade: n }, level: 9 });
    assert.match(CATEGORIES.social.cats[0].words(n), new RegExp(`trust needed ${u.goal} at a steady roll, you notice ${u.tells} thing`));
  }
});

const mk = (seed, setup = {}) => createPersuade({ seed, setup: setupPersuade(setup) });

test('the person and the hand: deterministic, 3 cares, 1 dislike, 8 cards, every care present', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const a = mk(seed), b = mk(seed);
    assert.deepEqual([a.cares, a.dislike, a.hand], [b.cares, b.dislike, b.hand]);
    assert.equal(new Set([...a.cares, a.dislike, a.neutral]).size, 5);
    assert.equal(a.hand.length, 8);
    const kinds = a.hand.map((c) => kindOf(a, c));
    assert.deepEqual([kinds.filter((k) => k === 'care').length, kinds.filter((k) => k === 'dislike').length, kinds.filter((k) => k === 'neutral').length], [5, 2, 1]);
    for (const c of a.cares) assert.ok(a.hand.some((x) => x.value === c));
    assert.equal(new Set(a.hand.map((c) => c.text)).size, 8, 'no two cards say the same thing');
    assert.ok(a.hand.every((c) => c.worth >= 3 && c.worth <= 5 && CARD_TEXT[c.value].includes(c.text)));
  }
  assert.notDeepEqual(mk(1).cares, mk(2).cares);
});

test('tells: the count shown is from the setup, and each tell is true', () => {
  for (const [tells, n] of [[0, 0], [1, 1], [2, 2], [4, 4]]) {
    const s = createPersuade({ seed: 5, setup: { tells } });
    assert.equal(s.shown.length, n); assert.equal(tellLines(s).length, n);
    for (const t of s.shown) assert.equal(t.kind === 'care', s.cares.includes(t.value));
    s.shown.forEach((t, i) => assert.equal(tellLines(s)[i], t.kind === 'care' ? TELL_CARE[t.value] : TELL_DISLIKE[t.value]));
  }
  // The tells you get are a prefix of the same order: more points only add.
  const a = createPersuade({ seed: 9, setup: { tells: 1 } }), b = createPersuade({ seed: 9, setup: { tells: 3 } });
  assert.deepEqual(b.shown.slice(0, 1), a.shown);
});

test('rules: care lands with a streak, miss costs 1, dislike costs 2, streak resets', () => {
  const s = createPersuade({ seed: 4, setup: { goal: 99, patience: 6, tells: 0 } });
  const by = (k) => s.hand.filter((c) => kindOf(s, c) === k && !s.played.includes(c.id));
  const c1 = by('care')[0], c2 = by('care')[1], c3 = by('care')[2];
  assert.equal(play(s, c1.id), 'landed'); assert.equal(s.trust, c1.worth);
  assert.equal(play(s, c2.id), 'landed'); assert.equal(s.trust, c1.worth + c2.worth + 1);
  assert.equal(play(s, c3.id), 'landed'); assert.equal(s.trust, c1.worth + c2.worth + c3.worth + 1 + 2);
  const m = by('neutral')[0];
  assert.equal(play(s, m.id), 'miss'); assert.equal(s.patience, 5); assert.equal(s.streak, 0);
  const d = by('dislike')[0];
  assert.equal(play(s, d.id), 'hurt'); assert.equal(s.patience, 3);
  assert.equal(play(s, d.id), null, 'a card plays once');
  assert.equal(play(s, 99), null);
  const c4 = by('care')[0];
  const before = s.trust; play(s, c4.id); assert.equal(s.trust, before + c4.worth, 'streak started again from 0');
});

test('ending: win at the goal, lose when patience runs out or cards run out', () => {
  let s = createPersuade({ seed: 4, setup: { goal: 3, patience: 3, tells: 0 } });
  play(s, s.hand.find((c) => kindOf(s, c) === 'care').id);
  assert.equal(s.done, true); assert.deepEqual([s.result.success, s.result.how, s.result.xp], [true, 'won', 4]);
  s = createPersuade({ seed: 4, setup: { goal: 99, patience: 3, tells: 0 } });
  const bad = s.hand.filter((c) => kindOf(s, c) === 'dislike');
  play(s, bad[0].id); play(s, s.hand.find((c) => kindOf(s, c) === 'neutral').id);
  assert.deepEqual([s.done, s.result.how, s.result.xp, s.result.success], [true, 'lost', 0, false]);
  s = createPersuade({ seed: 4, setup: { goal: 99, patience: 99, tells: 0 } });
  for (const c of s.hand) play(s, c.id);
  assert.equal(s.result.how, 'out'); assert.equal(s.result.success, false);
  assert.equal(play(s, 0), null);
  // XP: a win with patience to spare is 4; a narrow one (1 patience left) is 3.
  s = createPersuade({ seed: 4, setup: { goal: 3, patience: 3, tells: 0 } });
  play(s, s.hand.find((c) => kindOf(s, c) === 'dislike').id); // patience 1
  play(s, s.hand.find((c) => kindOf(s, c) === 'care').id);
  assert.deepEqual([s.result.success, s.result.patienceLeft, s.result.xp], [true, 1, 3]);
});

// Bots over many people. Perfect knows the hidden cares; the reader only uses the tells it is shown;
// lazy takes the first card.
const free = (s) => s.hand.filter((c) => !s.played.includes(c.id));
const BOTS = {
  perfect: (s) => free(s).filter((c) => kindOf(s, c) === 'care').sort((a, b) => b.worth - a.worth)[0] || free(s)[0],
  reader: (s) => { const know = new Map(s.shown.map((t) => [t.value, t.kind])); const score = (c) => (know.get(c.value) === 'care' ? 100 + c.worth : know.get(c.value) === 'dislike' ? -100 : c.worth * 0.01); return free(s).sort((a, b) => score(b) - score(a))[0]; },
  lazy: (s) => free(s)[0],
};
const rate = (bot, tier, persuade, level = 9, n = 300) => { let w = 0; for (let seed = 1; seed <= n; seed++) { const s = mk(seed, { tier, level, points: { persuade } }); while (!s.done) play(s, BOTS[bot](s).id); if (s.result.success) w++; } return w / n; };

test('bots: knowing the person always wins; reading tells beats lazy; points and the roll help everyone', () => {
  for (const tier of [-2, -1, 0, 1, 2]) for (const pts of [0, 4, 9]) assert.equal(rate('perfect', tier, pts), 1, `perfect tier ${tier} pts ${pts}`);
  for (const tier of [-2, 0, 2]) for (const pts of [0, 5, 9]) assert.ok(rate('reader', tier, pts) > rate('lazy', tier, pts), `reader beats lazy at tier ${tier}, ${pts} points`);
  assert.ok(rate('lazy', 0, 0) < 0.25, 'lazy at a steady roll with no points loses most of the time');
  assert.ok(rate('lazy', -2, 0) < 0.15);
  const r = [0, 3, 6, 9].map((p) => rate('reader', 0, p)); for (let i = 1; i < r.length; i++) assert.ok(r[i] >= r[i - 1], `points help: ${r}`);
  assert.ok(r[3] > r[0] + 0.3, `points matter: ${r}`);
  const t = [-2, -1, 0, 1, 2].map((k) => rate('reader', k, 0)); for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1] - 0.02, `the roll helps: ${t}`);
  assert.ok(t[4] > t[0] + 0.5, `the roll matters: ${t}`);
});

test('every persuade point visibly changes something (goal each point; a tell every 3rd)', () => {
  const goals = Array.from({ length: 10 }, (_, n) => setupPersuade({ points: { persuade: n }, level: 9 }).goal);
  for (let i = 1; i < goals.length; i++) assert.equal(goals[i], goals[i - 1] - 1);
  assert.deepEqual(Array.from({ length: 10 }, (_, n) => setupPersuade({ points: { persuade: n }, level: 9 }).tells), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
});

test('tierOf feeds persuade: a margin of 5 reads two things', () => {
  assert.equal(setupPersuade({ tier: tierOf({ total: 17, dc: 12 }) }).tells, 2);
});
