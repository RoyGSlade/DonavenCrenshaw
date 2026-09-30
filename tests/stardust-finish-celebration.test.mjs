import test from 'node:test';
import assert from 'node:assert/strict';
import { finishCelebration } from '../projects/Space-Shooter/systems/finishCelebration.js';

const accepted = { status: 'accepted', personalBest: true, rankBefore: 5, best: { rank: 3, timeMs: 103370 } };
test('accepted PB celebrates a real 5th to 3rd climb and the measured gain', () => {
  const out = finishCelebration({ timeMs: 103370, previousMs: 113200, result: accepted });
  assert.equal(out.title, 'PERSONAL BEST');
  assert.equal(out.deltaMs, 9830);
  assert.equal(out.climbed, true);
  assert.equal(out.places, 2);
});
test('local best, offline and rejected results never invent leaderboard ranks', () => {
  for (const result of [null, { ...accepted, status: 'flagged' }, { ...accepted, status: 'error' }]) {
    const out = finishCelebration({ timeMs: 103370, previousMs: 113200, result });
    assert.equal(out.title, 'NEW LOCAL BEST');
    assert.equal(out.rank, null);
    assert.equal(out.climbed, false);
  }
});
test('first placement, unchanged rank and slower lap are distinct outcomes', () => {
  assert.equal(finishCelebration({ timeMs: 103370 }).title, 'FIRST FINISH');
  assert.equal(finishCelebration({ timeMs: 103370, result: { ...accepted, rankBefore: null } }).climbed, false);
  assert.equal(finishCelebration({ timeMs: 103370, result: { ...accepted, rankBefore: 3 } }).climbed, false);
  const slower = finishCelebration({ timeMs: 115000, previousMs: 103370, result: { ...accepted, personalBest: false } });
  assert.equal(slower.improved, false);
  assert.equal(slower.climbed, false);
  assert.equal(slower.deltaMs, null);
});
test('staff, invalid ranks and inconsistent non-PB verdicts cannot animate a climb', () => {
  for (const result of [{ ...accepted, staff: true }, { ...accepted, rankBefore: -5 }, { ...accepted, best: { rank: '3' } }, { ...accepted, personalBest: false }]) {
    assert.equal(finishCelebration({ timeMs: 103370, result }).climbed, false);
  }
  assert.equal(finishCelebration({ timeMs: NaN, previousMs: 113200 }).improved, false);
});
