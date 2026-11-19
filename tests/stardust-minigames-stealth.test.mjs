// Minigames lane piece 7: stealth, SHADOW SLIP (verb: spend beats). Numbers from PLAN.md section 2.4;
// rules in minigames/stealth.js. Turn-based: each action is a beat; guards walk their patrol lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStealth, STEALTH_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createStealth, act, guardAt, coneOf, watched, gainAt, bestRoute, safeRoute, neighbours, starsFor, stealthXp, CELL } from '../projects/Space-Shooter/voyage/minigames/stealth.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('stealth setup: base numbers and the exact per-point tables', () => {
  assert.deepEqual(setupStealth({}), { guards: 2, beats: 28, noiseFactor: 1, rangeFactor: 1, decay: 8, tier: 0, points: { quiet: 0, range: 0, decay: 0 }, label: 'Steady' });
  const at = (cat, n) => setupStealth({ points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 5, 9].map((n) => at('quiet', n).noiseFactor), [1, 0.93, 0.86, 0.65, 0.37]);
  assert.deepEqual([0, 1, 2, 5, 9].map((n) => at('range', n).rangeFactor), [1, 0.94, 0.88, 0.7, 0.46]);
  assert.deepEqual([0, 1, 2, 5, 9].map((n) => at('decay', n).decay), [8, 10, 12, 18, 26]);
  assert.equal(setupStealth({ points: { decay: 9 }, level: 3 }).decay, 14);
});

test('stealth setup: the roll scales guards and the shift', () => {
  const t = (k) => setupStealth({ tier: k });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).guards), [3, 2, 2, 2, 1]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).beats), [20, 24, 28, 32, 36]);
});

const mk = (seed = 1, setup = {}) => createStealth({ seed, setup: setupStealth(setup) });
const walk = (s, path = s.safe) => { for (const c of path.slice(1)) act(s, c); return s; };

test('the board: deterministic, start bottom-left, exit top-right, a heat-free route inside the shift at Steady and above, a near-free one at Rough', () => {
  for (const tier of [-2, -1, 0, 1, 2]) for (let seed = 1; seed <= 40; seed++) {
    const a = mk(seed, { tier }), b = mk(seed, { tier });
    assert.deepEqual([a.cells, a.guards, a.safe], [b.cells, b.guards, b.safe]);
    assert.equal(a.start, 30); assert.equal(a.exit, 5);
    assert.equal(a.guards.length, setupStealth({ tier }).guards);
    assert.ok(a.cells[a.start] !== CELL.wall && a.cells[a.exit] !== CELL.wall);
    assert.ok(a.safe[0] === a.start && a.safe.at(-1) === a.exit && a.safe.length - 1 <= a.beats, `tier ${tier} seed ${seed}`);
    if (tier >= -1) assert.equal(a.safeGain, 0, `tier ${tier} seed ${seed} needs a heat-free route`);
    else assert.ok(a.safeGain < STEALTH_BASE.seen, `rough seed ${seed} best route adds ${a.safeGain}`);
  }
});

test('guards walk their lines to and fro, one step a beat, facing the way they walk', () => {
  const s = mk(2);
  for (const g of s.guards) {
    const L = g.line.length, seen = [];
    for (let t = 0; t < 4 * L; t++) {
      const a = guardAt(s, g, t), b = guardAt(s, g, t + 1);
      seen.push(a.cell); assert.ok(g.line.includes(a.cell));
      const dx = (b.cell % 6) - (a.cell % 6), dy = Math.floor(b.cell / 6) - Math.floor(a.cell / 6);
      assert.equal(Math.abs(dx) + Math.abs(dy), 1, 'one step a beat'); assert.deepEqual(a.dir, [dx, dy]);
    }
    assert.deepEqual(new Set(seen), new Set(g.line)); // visits its whole line
    assert.deepEqual(seen.slice(0, 2 * (L - 1)), seen.slice(2 * (L - 1), 4 * (L - 1))); // period 2 x (L - 1)
  }
});

test('cones: a wedge ahead of the guard (1, 3, 3, 5 cells wide), stopped by walls, shorter with range points, the last cell fades', () => {
  const s = mk(1); s.cells.fill(CELL.floor);
  s.guards = [{ line: [12, 13, 14, 15], phase: 0 }]; // row 2, walking east from column 0
  const c0 = coneOf(s, s.guards[0], 0);
  // The guard stands on 12 (column 0, row 2) facing east: 1 cell wide at distance 1, 3 at 2, 3 at 3, 5 at 4.
  assert.deepEqual([...c0.keys()].sort((x, y) => x - y), [4, 8, 9, 10, 13, 14, 15, 16, 20, 21, 22, 28]);
  assert.ok([...c0.values()].every((v) => v === 1)); assert.equal(c0.has(12), false);
  s.cells[14] = CELL.wall; assert.deepEqual([...coneOf(s, s.guards[0], 0).keys()].sort((a, b) => a - b), [13]);
  s.cells[14] = CELL.floor;
  s.rangeFactor = 0.7; // 2.8 cells: the third column fades to 0.8, the fourth is gone
  const c1 = coneOf(s, s.guards[0], 0);
  assert.equal(c1.get(13), 1); assert.ok(Math.abs(c1.get(14) - 1) < 1e-9); assert.ok(Math.abs(c1.get(15) - 0.8) < 1e-9); assert.equal(c1.has(16), false);
});

test('heat: seen = 34 x visibility per beat; cover hides you; a step near a guard is heard; a quiet beat cools', () => {
  const s = mk(1); s.cells.fill(CELL.floor); s._w = undefined;
  s.guards = [{ line: [12, 13, 14, 15], phase: 0 }];
  // At beat 1 the guard is on 13 facing east: cell 15 is two ahead (visible).
  assert.equal(gainAt(s, 15, 1, false).seen, 34); assert.equal(gainAt(s, 15, 1, true).heard, 12);
  assert.deepEqual([gainAt(s, 30, 1, false).total], [0]);
  s.cells[15] = CELL.cover; assert.equal(gainAt(s, 15, 1, false).seen, 0);
  s.quiet = 0.5; assert.equal(gainAt(s, 15, 1, true).heard, 6);
});

test('a heat-free walker slips out at every tier and seed with no heat and 3 stars; a bot that waits never moves ends late', () => {
  for (const tier of [-1, 0, 1, 2]) for (let seed = 1; seed <= 40; seed++) {
    const s = walk(mk(seed, { tier }));
    assert.equal(s.result.success, true, `tier ${tier} seed ${seed}`);
    assert.deepEqual([s.result.maxHeat, s.result.stars, s.result.seenBeats, s.result.heardBeats], [0, 3, 0, 0]);
  }
  const w = mk(3); for (let k = 0; k < 60 && !w.done; k++) act(w, w.pos);
  assert.deepEqual([w.result.how, w.result.success, w.result.xp], ['late', false, 0]);
});

test('a rushing player who ignores the cones is caught or hot; heat accumulates and cools only on a quiet beat', () => {
  let caught = 0, ok = 0, stars3 = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const s = mk(seed);
    // straight line: up the left column then along the top row, ignoring cones
    const path = []; for (let y = 5; y >= 0; y--) path.push(y * 6); for (let x = 1; x < 6; x++) path.push(x);
    for (const c of path) { if (s.done) break; if (c !== s.pos) act(s, c); }
    if (s.result?.how === 'caught') caught++; else if (s.result?.success) { ok++; if (s.result.stars === 3) stars3++; }
  }
  assert.ok(caught + (100 - caught - ok) > 30, `rushers failed ${caught}`); assert.ok(stars3 < 40, `rushers 3 stars ${stars3}`);
  const s = mk(5); s.heat = 50; s.cells.fill(CELL.floor); s.guards = []; s._w = undefined; // nobody about
  act(s, s.pos); assert.equal(s.heat, 42);
});

test('moves: only to a neighbour that is not a wall; wait is your own cell; nothing after the end', () => {
  const s = mk(4);
  const bad = s.cells.findIndex((c, i) => i !== s.pos && !neighbours(s, s.pos).includes(i));
  assert.equal(act(s, bad), null);
  const w = s.cells.findIndex((c) => c === CELL.wall); assert.equal(act(s, w), null);
  walk(s); assert.equal(s.done, true); assert.equal(act(s, s.pos), null);
});

test('every Quiet, Range and Decay point is visible in the same run', () => {
  const heat = (points) => { const s = mk(6, { points, level: 9 }); s.cells.fill(CELL.floor); s._w = undefined; s.guards = [{ line: [12, 13, 14, 15], phase: 0 }]; s.pos = 20; act(s, 14); return s.heat; };
  // Ending the beat on cell 14 (the guard stands on 13 facing east): seen 34 x visibility, plus a heard step.
  const h0 = heat({}), q = [1, 3, 5, 9].map((n) => heat({ quiet: n })), r = [1, 3, 5, 9].map((n) => heat({ range: n }));
  assert.ok(q.every((v, i) => v < (i ? q[i - 1] : h0)), `quiet ${h0} ${q}`);
  assert.ok(r.every((v, i) => v <= (i ? r[i - 1] : h0)), `range ${h0} ${r}`);
  const cool = (n) => { const s = mk(6, { points: { decay: n }, level: 9 }); s.guards = []; s._w = undefined; s.heat = 60; act(s, s.pos); return s.heat; };
  assert.deepEqual([0, 1, 4, 9].map(cool), [52, 50, 44, 34]);
});

test('stars by hottest heat (under 30: 3, under 60: 2) and XP 3 + stars', () => {
  assert.deepEqual([0, 29, 30, 59, 60, 99].map(starsFor), [3, 3, 2, 2, 1, 1]);
  assert.deepEqual([1, 2, 3].map((n) => stealthXp({ success: true, stars: n })), [4, 5, 6]); assert.equal(stealthXp({ success: false, stars: 0 }), 0);
});

test('the picker words match the game: quiet, range, decay', () => {
  for (let n = 1; n <= 9; n++) {
    const q = setupStealth({ points: { quiet: n }, level: 9 }), r = setupStealth({ points: { range: n }, level: 9 }), d = setupStealth({ points: { decay: n }, level: 9 });
    assert.ok(CATEGORIES.stealth.cats[0].words(n).startsWith(`a heard step adds ${Math.round(12 * q.noiseFactor * 10) / 10} heat; live: `));
    assert.ok(CATEGORIES.stealth.cats[1].words(n).startsWith(`guard view cones ${Math.round(4 * r.rangeFactor * 10) / 10} cells long; live: `));
    assert.ok(CATEGORIES.stealth.cats[2].words(n).startsWith(`cools ${d.decay} heat on a quiet beat; live: `));
  }
});
