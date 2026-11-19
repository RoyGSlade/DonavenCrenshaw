// Minigames lane (side lane, Erik 2026-11-18). Written against the outcome in
// launch/minigames/PLAN.md: a d20 roll sets a minigame's tier, a skill's three
// category points change its numbers exactly as the plan's tables say, and the
// repair board is always solvable, never starts solved, and is the same for the
// same seed. Pure modules, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, tierInfo, cleanPoints, setupHack } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { runtimeConfig } from '../projects/Space-Shooter/runtime-config.js';

test('the new game stays off', () => assert.equal(runtimeConfig.newGame, false));

test('tierOf: natural 20 always +2, margins cut at -6/-1/0/5/10', () => {
  assert.equal(tierOf({ total: 1, dc: 18, natural: true }), 2);
  const t = (m) => tierOf({ total: 12 + m, dc: 12, natural: false });
  assert.deepEqual([-20, -6, -5, -1, 0, 4, 5, 9, 10, 30].map(t), [-2, -2, -1, -1, 0, 0, 1, 1, 2, 2]);
});

test('tierInfo: time grows with the tier, size shifts only at the ends, spare try at +1/+2 and -2', () => {
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => tierInfo(k).time), [0.7, 0.85, 1, 1.15, 1.3]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => tierInfo(k).size), [1, 0, 0, 0, -1]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => tierInfo(k).extra), [-1, 0, 0, 1, 1]);
  assert.equal(tierInfo(99).label, 'Smooth');
});

test('cleanPoints: whole numbers, 0..9, never more than the level in total', () => {
  assert.deepEqual(cleanPoints({ a: 2.9, b: -4, c: 'x' }, ['a', 'b', 'c'], 9), { a: 2, b: 0, c: 0 });
  assert.deepEqual(cleanPoints({ a: 9, b: 9, c: 9 }, ['a', 'b', 'c'], 9), { a: 9, b: 0, c: 0 });
  assert.deepEqual(cleanPoints({ a: 3, b: 3, c: 3 }, ['a', 'b', 'c'], 5), { a: 3, b: 2, c: 0 });
  assert.deepEqual(cleanPoints(null, ['a'], 4), { a: 0 });
});

test('hack setup: the exact numbers per category point against the base lock (16 s, 3 tumblers, 2 misses)', () => {
  const at = (cat, n, tier = 0) => setupHack({ tier, points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('time', n).time), [16, 17.5, 19, 20.5, 22, 23.5, 25, 26.5, 28, 29.5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('size', n).tumblers), [3, 3, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('retries', n).misses), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  assert.equal(setupHack({ tier: 2, lock: { time: 16, tumblers: 5, misses: 2 } }).tumblers, 4);
  assert.equal(setupHack({ tier: -2, lock: { time: 16, tumblers: 5, misses: 0 } }).misses, 0);
  assert.equal(setupHack({ tier: -2, lock: { time: 16, tumblers: 3, misses: 2 } }).tumblers, 4);
});

