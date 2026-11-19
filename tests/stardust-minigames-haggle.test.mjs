// Minigames lane piece 4: social haggle (the Tull share in the-eighth-gunner).
// Numbers from PLAN.md section 2.6; rules in minigames/haggle.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHaggle } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createHaggle, stepHaggle, ask, takeOffer, needleAt, priceAt, bandPrices, outcomeOf, haggleXp } from '../projects/Space-Shooter/voyage/minigames/haggle.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('haggle setup: base numbers and the exact haggle points (band +0.4% of the range, price +1.5% each)', () => {
  assert.deepEqual(setupHaggle({}), { band: 0.12, speed: 0.9, patience: 3, rounds: 3, priceBonus: 0, tier: 0, points: { persuade: 0, intimidate: 0, haggle: 0 }, label: 'Steady' });
  const at = (n) => setupHaggle({ points: { haggle: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 5, 9].map((n) => at(n).band), [0.12, 0.124, 0.128, 0.132, 0.14, 0.156]);
  assert.deepEqual([0, 1, 2, 3, 5, 9].map((n) => at(n).priceBonus), [0, 0.015, 0.03, 0.045, 0.075, 0.135]);
  // Other categories do nothing here; points are capped by level.
  assert.equal(setupHaggle({ points: { persuade: 5 }, level: 9 }).band, 0.12);
  assert.equal(setupHaggle({ points: { haggle: 9 }, level: 2 }).priceBonus, 0.03);
});

test('haggle setup: the roll scales band, needle, patience and rounds', () => {
  const t = (k) => setupHaggle({ tier: k });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).band), [0.084, 0.102, 0.12, 0.138, 0.156]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).speed), [1.008, 0.954, 0.9, 0.846, 0.792]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).patience), [2, 3, 3, 4, 4]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).rounds), [2, 3, 3, 3, 4]);
});

const g = (seed = 1, setup = {}) => createHaggle({ seed, open: 20, best: 30, setup: setupHaggle(setup) });
// Advance until the needle's price is in a wanted window.
function waitFor(s, ok) { for (let i = 0; i < 6000; i++) { if (ok(priceAt(s))) return true; stepHaggle(s, 1 / 120); } return false; }

test('the board: deterministic, limit between 60% and 75% of the way, band just under the limit', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const a = g(seed), b = g(seed);
    assert.deepEqual([a.limit, a.phase], [b.limit, b.phase]);
    assert.equal(a.cap, 36);
    assert.ok(a.limit >= 28 && a.limit <= 32, `limit ${a.limit}`);
    const [lo, hi] = bandPrices(a);
    assert.equal(hi, a.limit); assert.ok(lo < hi && lo >= 26);
  }
  assert.notEqual(g(1).limit + g(1).phase, g(2).limit + g(2).phase);
});

test('the needle sweeps open to cap and back', () => {
  const s = g(3);
  const seen = []; for (let i = 0; i < 1200; i++) { stepHaggle(s, 1 / 120); seen.push(needleAt(s)); }
  assert.ok(Math.min(...seen) < 0.02 && Math.max(...seen) > 0.98);
  assert.ok(seen.every((p) => p >= 0 && p <= 1));
  assert.ok(priceAt(s, 0) === 20 && priceAt(s, 1) === 36);
});

test('asking in the band closes a great deal at that price', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = g(seed); const [lo, hi] = bandPrices(s);
    assert.ok(waitFor(s, (p) => p >= lo && p <= hi));
    assert.equal(ask(s), 'deal');
    assert.equal(s.result.how, 'sweet'); assert.equal(s.result.outcome, 'well'); assert.equal(s.result.success, true);
    assert.ok(s.result.price >= lo && s.result.price <= hi);
    assert.equal(s.result.xp, 4);
  }
});

test('asking low is a deal at that price (fair), no bonus XP', () => {
  const s = g(2); assert.ok(waitFor(s, (p) => p >= 21 && p <= 22));
  assert.equal(ask(s), 'deal');
  assert.deepEqual([s.result.outcome, s.result.how, s.result.xp], ['fair', 'low-ask', 3]);
});

test('too rich: they counter a quarter of the way to their limit, you lose a patience and a round', () => {
  const s = g(2); // limit 29
  assert.ok(waitFor(s, (p) => p >= 35));
  assert.equal(ask(s), 'counter');
  assert.deepEqual([s.offer, s.patience, s.asks, s.done], [22, 2, 1, false]);
  assert.ok(waitFor(s, (p) => p >= 35));
  assert.equal(ask(s), 'counter');
  assert.equal(s.offer, 24); // 22 + (29 - 22) / 4, rounded
});

test('greedy three times: they walk, half the opening offer, no XP', () => {
  const s = g(2);
  for (let i = 0; i < 3; i++) { assert.ok(waitFor(s, (p) => p >= 35)); ask(s); }
  assert.equal(s.done, true);
  assert.deepEqual([s.result.outcome, s.result.price, s.result.how, s.result.xp, s.result.success], ['walked', 10, 'walked', 0, false]);
});

test('with a roll that adds patience, rounds run out first and they close at their final offer', () => {
  const s = g(2, { tier: 1 }); // patience 4, rounds 3
  for (let i = 0; i < 3; i++) { assert.ok(waitFor(s, (p) => p >= 35)); ask(s); }
  assert.equal(s.result.how, 'final'); assert.equal(s.result.outcome, 'fair'); // offer 22 -> 24 -> 25: greed alone does not win
  assert.equal(s.result.price, 25);
});

test('Take their offer: closes at the current offer, fair at the opening', () => {
  const s = g(4); assert.equal(takeOffer(s), 'close');
  assert.deepEqual([s.result.price, s.result.outcome, s.result.how], [20, 'fair', 'took']);
  assert.equal(ask(s), null); assert.equal(takeOffer(s), null);
});

test('haggle points raise the closing price, never above the cap', () => {
  const s = g(1, { points: { haggle: 9 }, level: 9 });
  const [lo, hi] = bandPrices(s); assert.ok(waitFor(s, (p) => p >= lo && p <= hi)); const asked = priceAt(s); ask(s);
  assert.equal(s.result.price, Math.min(36, Math.round(asked * 1.135)));
});

test('outcomeOf and xp', () => {
  const sc = { open: 20, best: 30 };
  assert.deepEqual([[19, 'x'], [20, 'x'], [28, 'x'], [29, 'x'], [10, 'walked']].map(([p, h]) => outcomeOf(p, h, sc)), ['walked', 'fair', 'fair', 'well', 'walked']);
  assert.equal(haggleXp({ outcome: 'walked' }), 0);
});

test('a perfect-timing player wins a great deal at every tier and seed; skill matters (Rough band is narrower)', () => {
  for (const tier of [-2, -1, 0, 1, 2]) for (let seed = 1; seed <= 30; seed++) {
    const s = g(seed, { tier }); const [lo, hi] = bandPrices(s);
    assert.ok(waitFor(s, (p) => p >= lo && p <= hi), `tier ${tier} seed ${seed}`); ask(s);
    assert.equal(s.result.outcome, 'well', `tier ${tier} seed ${seed}`);
  }
});

test('the picker words match the game: haggle points', () => {
  assert.equal(CATEGORIES.social.cats[2].words(5), '+7.5% better final price, comfort band +2% wider');
});
