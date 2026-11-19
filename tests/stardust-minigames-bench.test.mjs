// Little extra 4: the daily bench board. Numbers from PLAN.md section 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, benchSeed, benchBoard, createBench, submit, crewBest, standing, overPar, DAY_MS, BENCH_SETUP } from '../projects/Space-Shooter/voyage/minigames/bench.js';
import { nextHint, rotateTile } from '../projects/Space-Shooter/voyage/minigames/repair.js';

test('the day number: UTC days, the same for everyone', () => {
  assert.equal(dayNumber(0), 0);
  assert.equal(dayNumber(DAY_MS - 1), 0); assert.equal(dayNumber(DAY_MS), 1);
  const d = Date.UTC(2026, 10, 18, 23, 59, 59); assert.equal(dayNumber(d), dayNumber(Date.UTC(2026, 10, 18, 0, 0, 1)));
  assert.equal(dayNumber(Date.UTC(2026, 10, 19, 0, 0, 0)), dayNumber(d) + 1);
});

test('one board a day: the same every time, different on different days, always fair (Steady, no points)', () => {
  const sig = (day) => JSON.stringify(benchBoard(day).tiles.map((t) => t.mask));
  for (const day of [0, 1, 20500, 20776]) { assert.equal(sig(day), sig(day)); assert.equal(benchBoard(day).size, 5); assert.equal(benchBoard(day).capacity, 120); }
  assert.deepEqual(BENCH_SETUP, { size: 5, capacity: 120, flow: 1, qualityBonus: 0 });
  assert.equal(new Set(Array.from({ length: 60 }, (_, i) => sig(20700 + i))).size >= 55, true, 'a month and more of different boards');
  assert.equal(benchSeed(7), benchSeed(7)); assert.notEqual(benchSeed(7), benchSeed(8));
  // every board has a way through, and a bot that follows the hints seals it
  for (let day = 20700; day < 20720; day++) {
    const s = benchBoard(day);
    for (let i = 0; i < 80 && !s.done; i++) { const h = nextHint(s); if (h == null) break; rotateTile(s, h); }
    assert.equal(s.result?.success, true, `day ${day} can be sealed`);
    assert.ok(s.moves >= 1);
  }
});

test('the crew board: best per person, ranked by turns then time, failures ignored', () => {
  const b = createBench(20700);
  assert.equal(b.entries.length, 0); assert.ok(b.par > 0);
  assert.equal(submit(b, { name: 'Ada', success: false, moves: 3, time: 5 }), null);
  assert.deepEqual(submit(b, { name: 'Ada', success: true, moves: 12, time: 30 }), { rank: 1, best: { name: 'Ada', moves: 12, time: 30 }, improved: true });
  assert.equal(submit(b, { name: 'Bo', success: true, moves: 10, time: 40 }).rank, 1);
  assert.equal(submit(b, { name: 'Cy', success: true, moves: 10, time: 35 }).rank, 1, 'same turns, less time ranks higher');
  assert.deepEqual(b.entries.map((e) => e.name), ['Cy', 'Bo', 'Ada']);
  const worse = submit(b, { name: 'Cy', success: true, moves: 15, time: 10 });
  assert.deepEqual([worse.rank, worse.improved, worse.best.moves], [1, false, 10], 'a worse try never replaces your best');
  const better = submit(b, { name: 'Ada', success: true, moves: 9, time: 50 });
  assert.deepEqual([better.rank, better.improved], [1, true]);
  assert.equal(b.entries.length, 3); assert.equal(crewBest(b).name, 'Ada');
  assert.equal(submit(b, { name: '', success: true, moves: 1, time: 1 }), null);
});

test('plain words: par and where you stand', () => {
  assert.deepEqual([overPar(9, 9), overPar(11, 9), overPar(8, 9)], ['par', '2 over par', '1 under par']);
  const b = createBench(20700);
  assert.match(standing(b, 'Ada'), new RegExp(`Par is ${b.par} turns\\. You have not sealed`));
  submit(b, { name: 'Ada', success: true, moves: b.par + 2, time: 20 }); submit(b, { name: 'Bo', success: true, moves: b.par, time: 20 });
  assert.equal(standing(b, 'Ada'), `You are 2 of 2 with ${b.par + 2} turns (2 over par).`);
  assert.equal(standing(b, 'Bo'), `You are 1 of 2 with ${b.par} turns (par).`);
});
