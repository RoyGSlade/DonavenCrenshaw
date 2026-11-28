// Minigames lane piece 9: social intimidate, push your luck. Numbers from PLAN.md section 2.6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupIntimidate } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createIntimidate, push, stand, nextChance, nextWin, mood, starsOf, intimidateXp } from '../projects/Space-Shooter/voyage/minigames/intimidate.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('intimidate setup: base, the roll and the exact intimidate points', () => {
  const b = setupIntimidate({});
  assert.deepEqual([b.chances, b.wins, b.goal, b.stars, b.saves, b.readsOdds], [[8, 14, 22, 32, 44, 58], [3, 6, 10, 15, 21, 28], 10, [10, 15, 21], 0, true]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((t) => setupIntimidate({ tier: t }).chances[0]), [14, 11, 8, 5, 2]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((t) => setupIntimidate({ tier: t }).readsOdds), [false, false, true, true, true]);
  const at = (n) => setupIntimidate({ points: { intimidate: n }, level: 9 });
  assert.deepEqual([0, 1, 4, 9].map((n) => at(n).chances), [[8, 14, 22, 32, 44, 58], [7, 13, 21, 31, 43, 57], [4, 10, 18, 28, 40, 54], [2, 5, 13, 23, 35, 49]]);
  assert.deepEqual([0, 3, 4, 7, 8, 9].map((n) => at(n).saves), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual(setupIntimidate({ tier: 2, points: { intimidate: 9 }, level: 9 }).chances[0], 2, 'never under 2 percent');
  assert.equal(setupIntimidate({ points: { haggle: 9 }, level: 9 }).chances[0], 8, 'haggle points do nothing here');
  assert.equal(setupIntimidate({ points: { intimidate: 9 }, level: 2 }).chances[0], 6, 'points are capped by level');
});

test('the picker words are the setup numbers', () => {
  for (const n of [0, 2, 4, 8, 9]) {
    const u = setupIntimidate({ points: { intimidate: n }, level: 9 });
    assert.equal(CATEGORIES.social.cats[1].words(n), `snap risk on the first push ${u.chances[0]}%, the sixth ${u.chances[5]}%, ${u.saves} save${u.saves === 1 ? '' : 's'}`);
  }
});

const mk = (seed, o = {}) => createIntimidate({ seed, setup: setupIntimidate(o) });
// A state whose snap rolls we choose (percent values: a roll of 99 never snaps, 0 always does).
const rigged = (rolls, o = {}) => { const s = mk(1, o); s.rolls = rolls.map((r) => r / 100); s.extra = Array(12).fill(0.99); return s; };

test('rules: pushing climbs the ladder, a snap loses all, standing takes it', () => {
  let s = rigged([99, 99, 99, 99, 99, 99]);
  assert.equal(nextChance(s), 8); assert.equal(nextWin(s), 3);
  assert.equal(push(s), 'rose'); assert.equal(s.won, 3); assert.equal(nextChance(s), 14);
  assert.equal(push(s), 'rose'); assert.equal(push(s), 'rose'); assert.equal(s.won, 10);
  assert.equal(stand(s), 'stood');
  assert.deepEqual([s.result.success, s.result.stars, s.result.xp, s.result.outcome], [true, 1, 3, 'won']);
  assert.equal(push(s), null); assert.equal(stand(s), null);
  // a snap after three pushes loses it all
  s = rigged([99, 99, 99, 0]);
  push(s); push(s); push(s); assert.equal(push(s), 'snapped');
  assert.deepEqual([s.result.won, s.result.success, s.result.xp, s.result.outcome], [0, false, 0, 'snapped']);
  // standing short loses
  s = rigged([99, 99]); push(s); push(s); stand(s);
  assert.deepEqual([s.result.won, s.result.success, s.result.outcome, s.result.xp], [6, false, 'short', 0]);
  // a roll equal to the chance does not snap (strictly under)
  s = rigged([8]); assert.equal(push(s), 'rose');
  s = rigged([7.9]); assert.equal(push(s), 'snapped');
});

test('stars and XP: 10, 15 and 21 earn 1, 2 and 3 stars; XP 3, 4, 5; the sixth push ends the talk', () => {
  const s = mk(1);
  assert.deepEqual([9, 10, 14, 15, 20, 21, 28].map((w) => starsOf(s, w)), [0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([1, 2, 3].map((st) => intimidateXp({ success: true, stars: st })), [3, 4, 5]);
  const t = rigged([99, 99, 99, 99, 99, 99]);
  for (let i = 0; i < 6; i++) push(t);
  assert.deepEqual([t.done, t.result.won, t.result.stars, t.result.xp, t.result.how], [true, 28, 3, 5, 'stood']);
  assert.equal(nextChance(t), null);
});

test('a save shrugs a snap off once: you keep what you had and the push is retried', () => {
  const s = rigged([99, 0, 99], { points: { intimidate: 4 }, level: 4 });
  assert.equal(s.savesLeft, 1);
  push(s); assert.equal(s.won, 3);
  assert.equal(push(s), 'saved'); assert.equal(s.savesLeft, 0); assert.equal(s.won, 3); assert.equal(s.pushes, 1);
  assert.equal(push(s), 'rose'); assert.equal(s.won, 6);
  // without a save the same roll ends it
  const u = rigged([99, 0]); push(u); assert.equal(push(u), 'snapped');
});

test('moods are plain words', () => {
  assert.deepEqual([5, 10, 14, 25, 32, 45, 58].map(mood), ['calm', 'calm', 'uneasy', 'uneasy', 'rattled', 'rattled', 'about to break']);
});

// Bots over many seeds. goal: stand the moment you have enough. greedy: never stand (push to the end).
// timid: stand after one push. stand15: stand at 15 or more.
const BOTS = { goal: (s) => s.won >= s.goal, stand15: (s) => s.won >= 15, greedy: () => false, timid: (s) => s.pushes >= 1 };
const rate = (bot, tier, pts, n = 600) => { let w = 0, x = 0; for (let seed = 1; seed <= n; seed++) { const s = mk(seed, { tier, level: 9, points: { intimidate: pts } }); while (!s.done) { if (BOTS[bot](s)) stand(s); else push(s); } if (s.result.success) { w++; x += s.result.xp; } } return { win: w / n, xp: x / n }; };

test('bots: knowing when to stop wins; never stopping and stopping too soon lose; points and the roll help', () => {
  for (const tier of [-2, 0, 2]) {
    assert.equal(rate('timid', tier, 0).win, 0, 'one push is never enough');
    assert.ok(rate('goal', tier, 0).win > rate('greedy', tier, 0).win + 0.3, `stop at the goal beats greed at tier ${tier}`);
    assert.ok(rate('goal', tier, 0).win > rate('stand15', tier, 0).win, 'a later stop at no points risks the win');
  }
  assert.ok(rate('greedy', 0, 0).win < 0.15, 'greed at a steady roll with no points mostly snaps');
  const w = [0, 3, 6, 9].map((p) => rate('goal', 0, p).win); for (let i = 1; i < w.length; i++) assert.ok(w[i] >= w[i - 1], `points help: ${w}`);
  assert.ok(w[3] > w[0] + 0.25, `points matter: ${w}`);
  const t = [-2, -1, 0, 1, 2].map((k) => rate('goal', k, 0).win); for (let i = 1; i < t.length; i++) assert.ok(t[i] >= t[i - 1], `the roll helps: ${t}`);
  assert.ok(t[4] > t[0] + 0.2, `the roll matters: ${t}`);
  // With enough points, pushing on for the second star pays more XP than stopping at the goal.
  assert.ok(rate('stand15', 0, 9).xp > rate('goal', 0, 9).xp, 'at nine points, going for stars is worth it');
  assert.ok(rate('goal', 0, 0).xp > rate('stand15', 0, 0).xp, 'at no points, stopping at the goal is worth more');
});

test('every intimidate point visibly changes something: all six risks fall by 1 each point', () => {
  for (let n = 1; n <= 9; n++) {
    const a = setupIntimidate({ points: { intimidate: n - 1 }, level: 9 }).chances, b = setupIntimidate({ points: { intimidate: n }, level: 9 }).chances;
    a.forEach((c, i) => assert.equal(b[i], Math.max(2, c - 1)));
  }
});
