// Minigames lane piece 2: hacking on the existing bypass ring, set up by the d20
// tier and the Time / Puzzle size / Retries points (setup.js). The ring's own
// rules (onfoot/rules/hack.js) run it; these check the wiring and the numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHack, stepHack, splice, cursorInWindow } from '../projects/Space-Shooter/voyage/onfoot/rules/hack.js';
import { lockFor, hackSetup, createSetupHack, hackXp } from '../projects/Space-Shooter/voyage/minigames/hack.js';

test('lockFor: the base numbers of lock levels 1 to 4 come from the ring tuning', () => {
  assert.deepEqual([1, 2, 3, 4].map((l) => lockFor(l).tumblers), [3, 4, 5, 6]);
  assert.deepEqual([1, 2, 3, 4].map((l) => lockFor(l).time), [16, 14.5, 13, 11.5]);
  assert.equal(lockFor(1).misses, 2);
  assert.equal(lockFor(99).level, 4);
});

test('a steady setup with no points is the plain lock: same ring as createHack', () => {
  for (const lock of [1, 2, 3, 4]) for (const seed of [1, 7, 42]) {
    const a = createHack({ difficulty: lock, seed });
    const { setup, ...b } = createSetupHack({ seed, lock });
    assert.deepEqual(b, a, `lock ${lock} seed ${seed}`);
  }
});

test('hack setup on a level-4 lock: points change the tumblers, clock and misses by the plan numbers', () => {
  const at = (cat, n, tier = 0) => hackSetup({ tier, lock: 4, level: 9, points: { [cat]: n } });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('size', n).tumblers), [6, 6, 5, 5, 4, 4, 3, 3, 2, 2]);
  assert.deepEqual([0, 3, 6, 9].map((n) => at('time', n).time), [11.5, 16, 20.5, 25]);
  assert.deepEqual([0, 2, 9].map((n) => at('retries', n).misses), [2, 3, 6]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((t) => hackSetup({ tier: t, lock: 1 }).time), [11.2, 13.6, 16, 18.4, 20.8]);
});

test('the state carries the setup: the ring has that many tumblers and allowed misses', () => {
  const s = createSetupHack({ seed: 3, lock: 3, setup: hackSetup({ tier: 2, lock: 3, level: 6, points: { size: 2, retries: 4 } }) });
  assert.equal(s.tumblers.length, 5 - 1 - 1);
  assert.equal(s.allowed, 2 + 2 + 1);
  assert.equal(s.time, Math.round(13 * 1.3 * 10) / 10);
});

function bot(state, { missFirst = 0 } = {}) {
  let missed = 0;
  for (let i = 0; i < 60 * 120 && !state.done; i++) {
    stepHack(state, 1 / 120);
    if (missed < missFirst && !cursorInWindow(state)) { splice(state); missed++; continue; }
    if (cursorInWindow(state) && missed >= missFirst) splice(state);
  }
  return state;
}

test('a patient player opens every lock at every tier', () => {
  for (const lock of [1, 2, 3, 4]) for (const tier of [-2, 0, 2]) for (let seed = 1; seed <= 6; seed++) {
    const s = bot(createSetupHack({ seed, lock, setup: hackSetup({ tier, lock }) }));
    assert.equal(s.result.success, true, `lock ${lock} tier ${tier} seed ${seed}: ${s.result.how}`);
  }
});

test('retries: allowed misses are survivable, one more trips the trace', () => {
  const setup = hackSetup({ tier: 0, lock: 1, level: 4, points: { retries: 4 } }); // 2 + 2 = 4 spare
  assert.equal(setup.misses, 4);
  const ok = bot(createSetupHack({ seed: 2, lock: 1, setup }), { missFirst: 4 });
  assert.equal(ok.result.success, true);
  assert.equal(ok.result.misses, 4);
  const bad = bot(createSetupHack({ seed: 2, lock: 1, setup }), { missFirst: 5 });
  assert.deepEqual({ ok: bad.result.success, how: bad.result.how }, { ok: false, how: 'trace' });
});

test('the clock: no splice runs out the time', () => {
  const s = createSetupHack({ seed: 1, lock: 1, setup: hackSetup({ tier: -2, lock: 1 }) });
  for (let t = 0; t < 12 && !s.done; t++) stepHack(s, 1);
  assert.deepEqual({ ok: s.result.success, how: s.result.how }, { ok: false, how: 'timeout' });
});

test('XP: 3 + lock level, +1 clean; none for a failed hack', () => {
  assert.equal(hackXp({ success: true, misses: 0 }, 1), 5);
  assert.equal(hackXp({ success: true, misses: 2 }, 4), 7);
  assert.equal(hackXp({ success: false, misses: 0 }, 4), 0);
});

test('floor: a Rough level-4 lock still gets 1.8 s per tumbler, and a perfect run clears it with room', () => {
  const setup = hackSetup({ tier: -2, lock: 4 });
  assert.equal(setup.tumblers, 7);
  assert.equal(setup.time, 12.6);
  for (let seed = 1; seed <= 30; seed++) {
    const s = createSetupHack({ seed, lock: 4, setup });
    for (let i = 0; i < 7200 && !s.done; i++) { stepHack(s, 1 / 120); if (cursorInWindow(s)) splice(s); }
    assert.equal(s.result.success, true, `seed ${seed}`);
  }
});

import { createPracticeHack } from '../projects/Space-Shooter/voyage/minigames/hack.js';
test('the practice dummy lock never trips: no clock, any number of misses, opens only when every tumbler is set, pays no XP', () => {
  const s = createPracticeHack({ seed: 4 });
  assert.equal(s.practice, true); assert.equal(s.tumblers.length, 3);
  // A wild player: 500 splices at the worst moments and 100 simulated minutes of waiting.
  for (let i = 0; i < 6000 * 10; i++) stepHack(s, 1 / 60);
  assert.equal(s.done, false, 'the clock never runs out');
  let misses = 0;
  for (let i = 0; i < 500 && !s.done; i++) { stepHack(s, 1 / 7); if (!cursorInWindow(s) && splice(s) === 'miss') misses++; }
  assert.ok(misses >= 300, `many misses: ${misses}`); assert.equal(s.done, false, 'misses never trip it');
  assert.equal(s.index, 0);
  // Set every tumbler: the lock opens.
  for (let i = 0; i < 30000 && !s.done; i++) { stepHack(s, 1 / 120); if (cursorInWindow(s)) splice(s); }
  assert.deepEqual([s.done, s.result.success, s.result.how, s.result.set], [true, true, 'open', 3]);
  assert.ok(s.result.misses >= 300);
  assert.equal(hackXp(s.result, 1) > 0, true, 'the rules would pay; the view pays 0 for a practice lock');
  assert.deepEqual([2, 3, 5, 9].map((n) => createPracticeHack({ seed: 1, tumblers: n }).tumblers.length), [2, 3, 5, 5]);
});

test('every Puzzle size point changes something on a basic lock: odd points widen the lit window, even points also drop a tumbler until the floor of 2', () => {
  const at = (n) => hackSetup({ tier: 0, lock: 1, level: 9, points: { size: n } });
  let prev = at(0);
  for (let n = 1; n <= 9; n++) {
    const cur = at(n);
    assert.ok(cur.window > prev.window || cur.tumblers < prev.tumblers, `point ${n} changed nothing`);
    assert.ok(cur.window > prev.window, `point ${n} must widen the window`);
    const w = (x) => createSetupHack({ seed: 4, lock: 1, setup: x }).tumblers[0].width;
    assert.ok(w(cur) > w(prev), `point ${n}: the first tumbler's lit window is not wider in the game`);
    prev = cur;
  }
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at(n).tumblers), [3, 3, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual([0, 1, 2, 9].map((n) => at(n).window), [1, 1.05, 1.1, 1.45]);
});
