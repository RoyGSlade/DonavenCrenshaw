// Minigames lane piece 6: navigation, PLOT THE LANE (verb: draw a route). Numbers from PLAN.md
// section 2.3; rules in minigames/nav.js. Planning game: no clock, budgets of time and fuel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupNav } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createNav, enter, backUp, head, spare, starsFor, navXp, costOf, isRevealed, bestRoute, manhattan, TERRAIN } from '../projects/Space-Shooter/voyage/minigames/nav.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('nav setup: base numbers and the exact per-point tables', () => {
  assert.deepEqual(setupNav({}), { size: 6, hazards: 5, reveal: 1, timeFactor: 1, fuelFactor: 1, budgetFactor: 1, tier: 0, points: { time: 0, fuel: 0, warning: 0 }, label: 'Steady' });
  const at = (cat, n) => setupNav({ points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 5, 9].map((n) => at('time', n).timeFactor), [1, 0.96, 0.92, 0.8, 0.64]);
  assert.deepEqual([0, 1, 2, 5, 9].map((n) => at('fuel', n).fuelFactor), [1, 0.96, 0.92, 0.8, 0.64]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('warning', n).reveal), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
  assert.equal(setupNav({ points: { time: 9 }, level: 2 }).timeFactor, 0.92);
});

test('nav setup: the roll scales the map, hazards and the time budget', () => {
  const t = (k) => setupNav({ tier: k });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).size), [7, 6, 6, 6, 5]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).hazards), [6, 5, 5, 5, 4]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).budgetFactor), [0.7, 0.85, 1, 1.15, 1.3]);
});

const mk = (seed = 1, setup = {}) => createNav({ seed, setup: setupNav(setup) });
const fly = (s, path = s.solution) => { for (const i of path.slice(1)) enter(s, i); return s; };

test('the board: deterministic, start top-left, port bottom-right, hazards off the ends, a hazard-free route always exists', () => {
  for (const tier of [-2, 0, 2]) for (let seed = 1; seed <= 100; seed++) {
    const a = mk(seed, { tier }), b = mk(seed, { tier });
    assert.deepEqual([a.cells, [...a.hazards], a.budgetTime, a.budgetFuel], [b.cells, [...b.hazards], b.budgetTime, b.budgetFuel]);
    assert.equal(a.start, 0); assert.equal(a.port, a.size * a.size - 1);
    assert.ok(!a.hazards.has(a.start) && !a.hazards.has(a.port));
    assert.equal(a.hazards.size, setupNav({ tier }).hazards);
    const route = bestRoute(a.size, a.cells, a.hazards);
    assert.ok(route && route[0] === 0 && route.at(-1) === a.port);
    assert.ok(route.every((i) => !a.hazards.has(i)));
    assert.ok(route.every((i, k) => !k || manhattan(a.size, route[k - 1], i) === 1));
  }
});

test('budgets: 1.5 x the best route, so a perfect player passes at every tier and seed (time budget x tier)', () => {
  for (const tier of [-2, -1, 0, 1, 2]) for (let seed = 1; seed <= 100; seed++) {
    const s = fly(mk(seed, { tier }));
    assert.equal(s.result.success, true, `tier ${tier} seed ${seed}`);
    assert.equal(s.result.hits, 0); assert.ok(spare(s).time >= 0 && spare(s).fuel >= 0);
    if (tier === 0) assert.equal(s.result.stars, 3);
  }
});

test('costs: lane 1/1, nebula 2/1, rubble 1/2, scaled by the points; a hazard adds 3/3 and counts once', () => {
  assert.deepEqual([TERRAIN.lane, TERRAIN.nebula, TERRAIN.rubble].map((t) => [t.time, t.fuel]), [[1, 1], [2, 1], [1, 2]]);
  const s = mk(2, { points: { time: 5, fuel: 4 }, level: 9 });
  const i = s.cells.findIndex((c) => c === 'nebula');
  assert.deepEqual([costOf(s, i).time, costOf(s, i).fuel], [1.6, 0.84]);
  for (let seed = 1; seed <= 200; seed++) {
    const g = mk(seed); const hz2 = [...g.hazards].find((x) => manhattan(g.size, 0, x) === 1); if (hz2 === undefined) continue;
    const c = costOf(g, hz2); assert.equal(enter(g, hz2), 'hit');
    assert.deepEqual([g.time, g.fuel, g.hits], [c.time + 3, c.fuel + 3, 1]);
    backUp(g); assert.equal(enter(g, hz2), 'moved'); assert.equal(g.hits, 1, 'a hazard hits once');
    return;
  }
  assert.fail('no board with a hazard beside the start in 200 seeds');
});

test('route rules: only the sector next to the head can be entered; the port ends the run; backing up costs the sector you leave', () => {
  const s = mk(4);
  assert.equal(enter(s, s.port), null); assert.equal(enter(s, 0), null);
  assert.equal(backUp(s), null);
  const first = s.solution[1]; enter(s, first);
  const c = costOf(s, first); assert.deepEqual([s.time, s.fuel], [c.time, c.fuel]);
  assert.equal(backUp(s), 'back'); assert.deepEqual([s.time, s.fuel, s.backups, head(s)], [c.time * 2, c.fuel * 2, 1, 0]);
  fly(s); assert.equal(s.result.how, 'port'); assert.equal(enter(s, 1), null); assert.equal(backUp(s), null);
});

test('warning radius: hazards show only within the radius of the route head, and stay shown; more points see further', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const lo = mk(seed), hi = mk(seed, { points: { warning: 9 }, level: 9 });
    const seenLo = [...lo.hazards].filter((h) => isRevealed(lo, h)), seenHi = [...hi.hazards].filter((h) => isRevealed(hi, h));
    for (const h of seenLo) assert.ok(manhattan(lo.size, 0, h) <= 1);
    for (const h of [...hi.hazards]) assert.equal(isRevealed(hi, h), manhattan(hi.size, 0, h) <= 4);
    assert.ok(seenHi.length >= seenLo.length);
  }
  const s = mk(5, { points: { warning: 3 }, level: 9 });
  fly(s, s.solution.slice(0, 4));
  const seen = [...s.hazards].filter((h) => isRevealed(s, h)).length;
  backUp(s); backUp(s); assert.equal([...s.hazards].filter((h) => isRevealed(s, h)).length, seen, 'revealed hazards stay revealed');
});

test('running out of either budget strands you: no XP', () => {
  const s = mk(6, { tier: -2 }); // a short time budget
  for (let k = 0; k < 40 && !s.done; k++) { const h = head(s); const nb = [h + 1, h + s.size].filter((i) => i < s.size * s.size && !(i === h + 1 && h % s.size === s.size - 1)); enter(s, nb[k % nb.length]); }
  if (!s.done) for (let k = 0; k < 100 && !s.done; k++) backUp(s) || enter(s, s.solution[1]);
  assert.ok(s.done);
  if (!s.result.success) assert.deepEqual([s.result.xp, s.result.stars], [0, 0]);
});

test('stars: 3 at 30% of both budgets left, 2 at 15%, else 1; XP 4 + extra stars + 1 for no hazard', () => {
  const s = mk(7); s.time = s.budgetTime * 0.7; s.fuel = 0; assert.equal(starsFor(s), 3);
  s.time = s.budgetTime * 0.72; assert.equal(starsFor(s), 2);
  s.time = s.budgetTime * 0.9; assert.equal(starsFor(s), 1);
  s.time = 0; s.fuel = s.budgetFuel * 0.85; assert.equal(starsFor(s), 2);
  assert.deepEqual([[1, 1], [2, 0], [3, 0], [3, 2]].map(([stars, hits]) => navXp({ success: true, stars, hits })), [4, 6, 7, 6]);
  assert.equal(navXp({ success: false, stars: 0, hits: 0 }), 0);
});

test('every Time and Fuel point is visible: the same route costs exactly 4% less per point', () => {
  const base = fly(mk(8)); const baseCost = { t: base.time, f: base.fuel };
  for (let p = 1; p <= 9; p++) {
    const t = fly(mk(8, { points: { time: p }, level: 9 })), f = fly(mk(8, { points: { fuel: p }, level: 9 }));
    assert.ok(Math.abs(t.time - baseCost.t * (1 - 0.04 * p)) < 1e-9 && Math.abs(t.fuel - baseCost.f) < 1e-9, `time point ${p}`);
    assert.ok(Math.abs(f.fuel - baseCost.f * (1 - 0.04 * p)) < 1e-9 && Math.abs(f.time - baseCost.t) < 1e-9, `fuel point ${p}`);
    assert.equal(t.budgetTime, base.budgetTime); assert.equal(f.budgetFuel, base.budgetFuel); // budgets never shrink with points
  }
});

test('a straight-line player is not a master; a wanderer almost never arrives', () => {
  const greedy = (s, seed) => { for (let k = 0; !s.done && k < 200; k++) { const n = s.size, h = head(s); const o = [h + 1, h + n].filter((i) => i < n * n && !(i === h + 1 && h % n === n - 1)); enter(s, o[(seed + k) % o.length]); } };
  const wander = (s, seed) => { let r = seed; for (let k = 0; !s.done && k < 300; k++) { r = (r * 1103515245 + 12345) & 0x7fffffff; const n = s.size, h = head(s); const nb = [h + 1, h - 1, h + n, h - n].filter((i) => i >= 0 && i < n * n && Math.abs((i % n) - (h % n)) <= 1); enter(s, nb[r % nb.length]); } };
  let g3 = 0, gfail = 0, wins = 0;
  for (let seed = 1; seed <= 200; seed++) { const a = mk(seed); greedy(a, seed); if (!a.result?.success) gfail++; else if (a.result.stars === 3) g3++; const b = mk(seed); wander(b, seed); if (b.result?.success) wins++; }
  assert.ok(g3 < 30, `greedy 3-star ${g3} of 200`); assert.ok(gfail > 20, `greedy failures ${gfail}`); assert.ok(wins < 20, `wanderer arrived ${wins}`);
});

test('the picker words now describe Perihelion (the new navigation game); the old lane plotter keeps its own setup until Donaven picks', () => {
  assert.equal(CATEGORIES.navigation.built, true);
  assert.equal(CATEGORIES.navigation.cats[1].words(5), 'burns and trims cost 20% less fuel');
  assert.match(CATEGORIES.navigation.cats[2].words(0), /^the arc shows 60% of the burn, shards flagged 0\.5 s ahead$/);
  assert.equal(setupNav({ points: { warning: 3 } }).reveal, 2, 'the old game still reads its own numbers');
});
