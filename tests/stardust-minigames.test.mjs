// Minigames lane (side lane, Erik 2026-11-18). Written against the outcome in
// launch/minigames/PLAN.md: a d20 roll sets a minigame's tier, a skill's three
// category points change its numbers exactly as the plan's tables say, and the
// repair board is always solvable, never starts solved, and is the same for the
// same seed. Pure modules, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, tierInfo, cleanPoints, setupRepair, setupHack, REPAIR_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createRepair, rotateTile, stepRepair, poweredSet, parTurns, qualityOf, starsOf, xpFor, turn } from '../projects/Space-Shooter/voyage/minigames/repair.js';
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

test('repair setup: the exact numbers per category point at a steady roll (tier 0)', () => {
  const at = (cat, n) => setupRepair({ tier: 0, points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('time', n).seconds), [50, 53, 56, 59, 62, 65, 68, 71, 74, 77]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('size', n).size), [5, 5, 5, 4, 4, 4, 3, 3, 3, 3]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('quality', n).qualityBonus), [0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);
  assert.deepEqual(setupRepair({}), { size: 5, seconds: 50, qualityBonus: 0, tier: 0, points: { time: 0, size: 0, quality: 0 }, label: 'Steady' });
});

test('repair setup: the roll scales it, and the board stays between 3 x 3 and 6 x 6', () => {
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupRepair({ tier: k }).seconds), [35, 43, 50, 58, 65]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupRepair({ tier: k }).size), [6, 5, 5, 5, 4]);
  assert.equal(setupRepair({ tier: 2, points: { size: 9 }, level: 9 }).size, REPAIR_BASE.minSize);
  assert.equal(setupRepair({ tier: -2, points: {}, level: 1 }).size, REPAIR_BASE.maxSize);
  // Points beyond the level do nothing.
  assert.equal(setupRepair({ tier: 0, points: { time: 9 }, level: 2 }).seconds, 56);
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

const solveAll = (st) => { for (const t of st.tiles) t.mask = t.solved; };

test('repair boards: every seed and size is solvable, starts unsolved, and is deterministic', () => {
  for (const size of [3, 4, 5, 6]) {
    for (let seed = 1; seed <= 150; seed++) {
      const a = createRepair({ seed, size });
      assert.equal(a.size, size);
      assert.equal(a.solved, false, `size ${size} seed ${seed} starts solved`);
      assert.ok(a.par >= 1, 'par at least one turn');
      const b = createRepair({ seed, size });
      assert.deepEqual(b.tiles.map((t) => t.mask), a.tiles.map((t) => t.mask), 'same seed, same board');
      solveAll(a);
      assert.ok(poweredSet(a).has(a.dst), `size ${size} seed ${seed}: pipe from pump to valve is unbroken`);
    }
  }
  assert.notDeepEqual(createRepair({ seed: 1 }).tiles.map((t) => t.mask), createRepair({ seed: 2 }).tiles.map((t) => t.mask));
});

test('repair boards: the pump is on the left edge, the valve on the right, both fixed', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = createRepair({ seed, size: 5 });
    assert.equal(s.src % 5, 0); assert.equal(s.dst % 5, 4);
    assert.ok(s.tiles[s.src].fixed && s.tiles[s.dst].fixed);
    const before = s.tiles[s.src].mask;
    assert.equal(rotateTile(s, s.src), false);
    assert.equal(s.tiles[s.src].mask, before);
  }
});

test('turning: a quarter clockwise, counted, and four turns come back', () => {
  const s = createRepair({ seed: 3, size: 5 });
  const i = s.path.find((k) => !s.tiles[k].fixed);
  const m0 = s.tiles[i].mask;
  for (let k = 0; k < 4; k++) assert.equal(rotateTile(s, i) !== false, true);
  assert.equal(s.tiles[i].mask, m0);
  assert.equal(s.moves, 4);
  assert.equal(turn(1), 2); assert.equal(turn(8), 1);
});

test('par is reachable: turning each wrong pipe piece to its drawn pipe seals the board in exactly par turns', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = createRepair({ seed, size: 4 });
    const par = s.par;
    for (const i of s.path) { while (s.tiles[i].mask !== s.tiles[i].solved) { if (s.done) break; rotateTile(s, i); } }
    assert.ok(s.solved && s.done, `seed ${seed}`);
    assert.ok(s.moves <= par, `seed ${seed}: ${s.moves} turns vs par ${par}`);
    assert.equal(s.result.success, true);
  }
});

test('the clock: out of time floods the line, no quality, no XP; nothing moves after the end', () => {
  const s = createRepair({ seed: 5, size: 5, seconds: 20 });
  for (let t = 0; t < 19; t++) stepRepair(s, 1);
  assert.equal(s.done, false);
  stepRepair(s, 1.5);
  assert.equal(s.done, true);
  assert.deepEqual({ ok: s.result.success, how: s.result.how, q: s.result.quality, xp: s.result.xp, stars: s.result.stars }, { ok: false, how: 'timeout', q: 0, xp: 0, stars: 0 });
  assert.equal(rotateTile(s, s.path.find((k) => !s.tiles[k].fixed)), false);
});

test('quality: 40 base, up to 30 for few turns, up to 30 for time left, plus the quality points; stars 90 / 65', () => {
  const q = (o) => qualityOf({ success: true, moves: 10, par: 10, t: 0, seconds: 50, qualityBonus: 0, ...o });
  assert.equal(q({}), 100);
  assert.equal(q({ moves: 20 }), 85);
  assert.equal(q({ t: 50 }), 70);
  assert.equal(q({ t: 50, moves: 40 }), 48);
  assert.equal(q({ t: 50, moves: 40, qualityBonus: 36 }), 84);
  assert.equal(q({ qualityBonus: 36 }), 100);
  assert.equal(qualityOf({ success: false, moves: 1, par: 1, t: 1, seconds: 50 }), 0);
  assert.deepEqual([100, 90, 89, 65, 64, 1].map(starsOf), [3, 3, 2, 2, 1, 1]);
});

test('XP: 4 on a 3 x 3, +2 per board step, +1 per star above one; none for a flood', () => {
  assert.equal(xpFor({ success: true, stars: 1 }, 3), 4);
  assert.equal(xpFor({ success: true, stars: 3 }, 6), 4 + 6 + 2);
  assert.equal(xpFor({ success: false, stars: 0 }, 6), 0);
});

test('a roll sets up the board end to end: a high roll gives a bigger clock, a low roll a smaller one', () => {
  const run = (roll) => setupRepair({ tier: tierOf({ total: roll + 3, dc: 12, natural: roll === 20 }), points: { time: 2 }, level: 3 });
  assert.ok(run(20).seconds > run(12).seconds && run(12).seconds > run(2).seconds);
  assert.ok(run(20).size <= run(12).size && run(12).size <= run(2).size);
});

test('parTurns of a solved board is zero', () => {
  const s = createRepair({ seed: 9, size: 4 }); solveAll(s);
  assert.equal(parTurns(s.tiles), 0);
});
