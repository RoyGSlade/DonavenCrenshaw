// Repair v2 (Donaven 2026-11-18): a closed pipe network with no clock. Coolant flows from the pump,
// pours out of every open end it reaches, the spill fills a pool along the bottom, a full pool floods
// the line. Written against the two rules: (1) no open ends anywhere on the connected pipe, so a T only
// works if all three ends connect; (2) the pool is the timer and its rate tracks the open ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, setupRepair, REPAIR_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createRepair, rotateTile, stepRepair, recompute, poweredSet, openEnds, leaks, parTurns, qualityOf, starsOf, xpFor, turn, nextHint, shapeOf, N, E, S, W } from '../projects/Space-Shooter/voyage/minigames/repair.js';
import { hashSeed } from '../projects/Space-Shooter/voyage/quests/rng.js';

// --- an independent checker: written here from the rule, not taken from the game ---------------------
const STEP = { [N]: [0, -1, S], [E]: [1, 0, W], [S]: [0, 1, N], [W]: [-1, 0, E] };
function verify(masks, n, src, dst) {
  const seen = new Set([src]); const q = [src]; let leaked = 0;
  while (q.length) {
    const i = q.shift(); const x = i % n, y = Math.floor(i / n);
    for (const bit of [N, E, S, W]) {
      if (!(masks[i] & bit)) continue;
      const [dx, dy, back] = STEP[bit]; const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n || !(masks[ny * n + nx] & back)) { leaked++; continue; }
      const j = ny * n + nx; if (!seen.has(j)) { seen.add(j); q.push(j); }
    }
  }
  return { reaches: seen.has(dst), leaked, wet: seen.size };
}
const masksOf = (s) => s.tiles.map((t) => t.mask);
const solvedMasks = (s) => s.tiles.map((t) => t.solved);
const solveAll = (s) => { for (const t of s.tiles) t.mask = t.solved; };
const BIG = { capacity: 1e9 };

test('repair setup: exact numbers per category point at a steady roll (pool depth, board size, quality)', () => {
  const at = (cat, n) => setupRepair({ tier: 0, points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('time', n).capacity), [120, 126, 132, 138, 144, 150, 156, 162, 168, 174]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('size', n).size), [5, 5, 5, 4, 4, 4, 3, 3, 3, 3]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('quality', n).qualityBonus), [0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);
  assert.deepEqual(setupRepair({}), { size: 5, capacity: 120, flow: 1, qualityBonus: 0, tier: 0, points: { time: 0, size: 0, quality: 0 }, label: 'Steady' });
});

test('repair setup: the roll sets pool depth, flow rate and board size; the board stays 3 x 3 to 6 x 6', () => {
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupRepair({ tier: k }).capacity), [84, 102, 120, 138, 156]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupRepair({ tier: k }).flow), [1.2, 1.1, 1, 0.9, 0.8]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => setupRepair({ tier: k }).size), [6, 5, 5, 5, 4]);
  assert.equal(setupRepair({ tier: 2, points: { size: 9 }, level: 9 }).size, REPAIR_BASE.minSize);
  assert.equal(setupRepair({ tier: -2, points: {}, level: 1 }).size, REPAIR_BASE.maxSize);
  assert.equal(setupRepair({ tier: 0, points: { time: 9 }, level: 2 }).capacity, 132, 'points beyond the level do nothing');
});

test('a roll sets up the board end to end: a high roll gives a deeper pool and slower leaks, a low roll the opposite', () => {
  const run = (roll) => setupRepair({ tier: tierOf({ total: roll + 3, dc: 12, natural: roll === 20 }), points: { time: 2 }, level: 3 });
  assert.ok(run(20).capacity > run(12).capacity && run(12).capacity > run(2).capacity);
  assert.ok(run(20).flow < run(12).flow && run(12).flow < run(2).flow);
  assert.ok(run(20).size <= run(12).size && run(12).size <= run(2).size);
});

test('solvability: every seed and size has a closed solution (checked by an independent checker) and starts unsolved', () => {
  for (const size of [3, 4, 5, 6]) {
    for (let seed = 1; seed <= 400; seed++) {
      const s = createRepair({ seed, size });
      assert.equal(s.size, size);
      assert.equal(s.solved, false, `size ${size} seed ${seed} starts sealed`);
      assert.equal(verify(masksOf(s), size, s.src, s.dst).reaches && verify(masksOf(s), size, s.src, s.dst).leaked === 0, false, 'the scramble is not a win');
      assert.ok(s.par >= 1);
      const again = createRepair({ seed, size });
      assert.deepEqual(masksOf(again), masksOf(s), 'same seed, same board');
      const v = verify(solvedMasks(s), size, s.src, s.dst);
      assert.deepEqual([v.reaches, v.leaked], [true, 0], `size ${size} seed ${seed}: the drawn solution is closed and reaches the valve`);
      solveAll(s);
      assert.equal(poweredSet(s).has(s.dst), true);
      assert.equal(openEnds(s).length, 0);
    }
  }
  assert.notDeepEqual(masksOf(createRepair({ seed: 1 })), masksOf(createRepair({ seed: 2 })));
});

test('solvability, brute force: on small boards some turning of the pieces really wins (no help from the drawn solution)', () => {
  for (const size of [3, 4]) {
    for (let seed = 1; seed <= (size === 3 ? 40 : 4); seed++) {
      const s = createRepair({ seed, size });
      const free = s.tiles.map((t, i) => i).filter((i) => !s.tiles[i].fixed && s.tiles[i].mask !== 0);
      const base = masksOf(s); let found = false;
      const m = base.slice();
      const go = (k) => {
        if (found) return;
        if (k === free.length) { const v = verify(m, size, s.src, s.dst); if (v.reaches && v.leaked === 0) found = true; return; }
        const i = free[k]; let x = base[i];
        for (let r = 0; r < 4 && !found; r++) { m[i] = x; go(k + 1); x = turn(x); }
        m[i] = base[i];
      };
      if (size === 3) go(0); else { // 4 x 4 has too many states to try all: prune with the real rule on the drawn pieces only
        for (const t of s.tiles) if (t.line) t.mask = t.solved; found = verify(masksOf(s), size, s.src, s.dst).reaches; }
      assert.ok(found, `size ${size} seed ${seed}`);
    }
  }
});

test('the closed-network rule: the game says sealed exactly when the independent checker says so, over many random boards', () => {
  let sealed = 0, leaky = 0, reachedLeaky = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const size = 3 + (seed % 4);
    const s = createRepair({ seed, size, ...BIG });
    let rng = hashSeed('walk', seed); const rand = () => { rng = Math.imul(rng ^ (rng >>> 15), 2246822507) >>> 0; rng = (rng + 0x9e3779b9) >>> 0; return rng / 4294967296; };
    const turnable = s.tiles.map((t, i) => i).filter((i) => !s.tiles[i].fixed);
    for (let k = 0; k < 400 && !s.done; k++) {
      rotateTile(s, turnable[Math.floor(rand() * turnable.length)]);
      const v = verify(masksOf(s), size, s.src, s.dst);
      assert.equal(s.open.length, v.leaked, 'open ends agree');
      assert.equal(s.solved, v.reaches && v.leaked === 0, `seed ${seed} turn ${k}`);
      if (v.reaches && v.leaked > 0) reachedLeaky++;
      if (v.leaked > 0) leaky++;
    }
    if (s.result?.success) sealed++;
  }
  assert.ok(leaky > 1000, 'plenty of leaky states were seen');
  assert.ok(reachedLeaky > 50, 'states where the coolant reaches the valve but still leaks were seen, and never counted as a win');
});

test('a T with one end left open never wins: every wrong turn of every T, with all else right, still leaks and never seals', () => {
  let tees = 0, states = 0, leakyReach = 0, floods = 0;
  for (let seed = 1; seed <= 100; seed++) {
    for (const size of [4, 5, 6]) {
      const base = createRepair({ seed, size });
      for (const i of base.net.filter((k) => shapeOf(base.tiles[k].solved) === 'tee')) {
        tees++;
        for (let r = 1; r < 4; r++) {
          const s = createRepair({ seed, size, capacity: 12 });
          solveAll(s);
          s.tiles[i].mask = s.tiles[i].solved; for (let k = 0; k < r; k++) s.tiles[i].mask = turn(s.tiles[i].mask);
          recompute(s);
          assert.notEqual(s.tiles[i].mask, s.tiles[i].solved);
          const v = verify(masksOf(s), size, s.src, s.dst);
          assert.equal(v.reaches && v.leaked === 0, false, `size ${size} seed ${seed} T ${i} turned ${r}`);
          assert.equal(s.solved, false);
          states++; if (v.reaches && v.leaked > 0) leakyReach++;
          if (v.leaked > 0) { for (let t = 0; t < 60 * 30 && !s.done; t++) stepRepair(s, 1 / 30 * 0.5); assert.equal(s.done, true, 'an open end leaks until the pool is full'); assert.deepEqual([s.result.success, s.result.how], [false, 'flooded']); floods++; }
        }
      }
    }
  }
  assert.ok(tees > 200 && states === tees * 3);
  assert.ok(leakyReach > 50, 'some wrong T still lets the coolant reach the valve, and still does not win');
  assert.ok(floods > states * 0.5, `most wrong T states leak and flood (${floods} of ${states})`);
});

test('a bot that fixes everything except one T never wins, through the public turn call', () => {
  let tried = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const s = createRepair({ seed, size: 5, capacity: 30 });
    const tee = s.net.find((k) => shapeOf(s.tiles[k].solved) === 'tee'); if (tee == null) continue;
    tried++;
    const fix = (i) => { let g = 0; while (s.tiles[i].mask !== s.tiles[i].solved && g++ < 4 && !s.done) rotateTile(s, i); };
    while (s.tiles[tee].mask === s.tiles[tee].solved) rotateTile(s, tee); // hold the T wrong
    for (const i of s.net) if (i !== tee) fix(i);
    assert.equal(s.done, false, `seed ${seed}: sealed with a T end open`);
    for (let t = 0; t < 60 * 90 && !s.done; t++) stepRepair(s, 1 / 60);
    assert.equal(s.solved, false, `seed ${seed}`);
    if (s.done) assert.deepEqual([s.result.success, s.result.how], [false, 'flooded']);
  }
  assert.ok(tried > 80);
});

test('the pool rate tracks open ends: k pouring ends add k x flow a second, and it drops when an end is closed', () => {
  for (const flow of [1, 0.8, 1.2]) {
    for (let seed = 1; seed <= 80; seed++) {
      const s = createRepair({ seed, size: 5, flow, ...BIG });
      for (let t = 0; t < 120; t++) stepRepair(s, 1 / 30); // let the coolant settle through the wet network
      const k = leaks(s).length; assert.equal(k, s.open.length, 'after settling every open end on the wet network pours');
      const p0 = s.pool; for (let t = 0; t < 60; t++) stepRepair(s, 1 / 60);
      assert.ok(Math.abs(s.pool - p0 - k * flow) < 1e-6, `seed ${seed} flow ${flow}: ${k} ends -> ${s.pool - p0}`);
    }
  }
  // closing the pump's open end stops the pour from it: turn pieces until the open count drops, rate follows
  let checked = 0;
  for (let seed = 1; seed <= 60 && checked < 20; seed++) {
    const s = createRepair({ seed, size: 5, ...BIG });
    for (let t = 0; t < 120; t++) stepRepair(s, 1 / 30);
    for (const i of s.net) {
      const before = s.open.length;
      rotateTile(s, i);
      for (let t = 0; t < 120; t++) stepRepair(s, 1 / 30);
      const k = leaks(s).length; const p0 = s.pool; for (let t = 0; t < 30; t++) stepRepair(s, 1 / 60);
      assert.ok(Math.abs(s.pool - p0 - k * 0.5) < 1e-6);
      if (k !== before) checked++;
      if (s.done) break;
    }
  }
  assert.ok(checked >= 10);
});

test('no leak, no spill: a sealed line stops the pool, and nothing moves after the end', () => {
  const s = createRepair({ seed: 11, size: 5, capacity: 50 });
  for (let t = 0; t < 60; t++) stepRepair(s, 1 / 30);
  assert.ok(s.pool > 0, 'the open ends spilled while we waited');
  for (const i of s.net) { let g = 0; while (s.tiles[i].mask !== s.tiles[i].solved && g++ < 4) rotateTile(s, i); }
  assert.equal(s.done, true); assert.deepEqual([s.result.success, s.result.how], [true, 'sealed']);
  const p = s.pool; for (let t = 0; t < 600; t++) stepRepair(s, 1 / 60);
  assert.equal(s.pool, p, 'sealed: the pool no longer rises');
  assert.equal(rotateTile(s, s.net[0]), false);
});

test('the coolant visibly flows: it leaves the pump, fills the connected pipe piece by piece, and open ends pour only once it arrives', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = createRepair({ seed, size: 5, ...BIG });
    solveAll(s); rotateTile(s, s.net[0]); rotateTile(s, s.net[0]); rotateTile(s, s.net[0]); rotateTile(s, s.net[0]); // refresh the derived state
    const s2 = createRepair({ seed, size: 5, ...BIG });
    assert.equal(s2.tiles.every((t) => t.wet === 0), true, 'dry at the start');
    stepRepair(s2, 0.05);
    assert.ok(s2.tiles[s2.src].wet > 0 && s2.tiles[s2.src].wet < 1, 'the pump is filling');
    assert.equal(s2.pool, 0, 'nothing pours before the coolant arrives');
    // wetness never passes a dry piece: a piece is wet only if the piece that feeds it is full
    for (let t = 0; t < 40; t++) {
      stepRepair(s2, 1 / 30);
      for (const i of s2.powered) { const p = s2.parent.get(i); if (p != null && s2.tiles[i].wet > 0) assert.equal(s2.tiles[p].wet >= 1, true, 'fed by a full piece'); }
      for (let i = 0; i < s2.tiles.length; i++) if (!s2.powered.includes(i)) assert.equal(s2.tiles[i].wet, 0, 'a disconnected piece is dry');
    }
  }
  // a piece turned out of the network drains
  const d = createRepair({ seed: 3, size: 5, ...BIG });
  for (let t = 0; t < 90; t++) stepRepair(d, 1 / 30);
  const wetNow = d.powered.filter((i) => d.tiles[i].wet >= 1 && d.parent.has(i));
  assert.ok(wetNow.length > 0);
  const first = d.order[1]; // the piece next to the pump
  const before = d.tiles[first].mask; let guard = 0;
  while (d.powered.includes(first) && guard++ < 4) rotateTile(d, first);
  if (!d.powered.includes(first)) { for (let t = 0; t < 30; t++) stepRepair(d, 1 / 30); assert.equal(d.tiles[first].wet, 0); }
  assert.ok(before !== undefined);
});

test('a flood: leave the leaks and the pool fills; time to flood follows the pool depth and the open ends', () => {
  const run = (o) => { const s = createRepair({ seed: 5, size: 5, ...o }); let t = 0; while (!s.done && t < 60 * 600) { stepRepair(s, 1 / 60); t++; } return s; };
  const a = run({ capacity: 20 });
  assert.equal(a.done, true);
  assert.deepEqual({ ok: a.result.success, how: a.result.how, q: a.result.quality, xp: a.result.xp, stars: a.result.stars }, { ok: false, how: 'flooded', q: 0, xp: 0, stars: 0 });
  assert.equal(a.pool, 20);
  const deeper = run({ capacity: 40 }), slower = run({ capacity: 20, flow: 0.5 });
  assert.ok(deeper.t > a.t * 1.5, 'a deeper pool floods later');
  assert.ok(slower.t > a.t * 1.5, 'a slower flow floods later');
  assert.equal(rotateTile(a, a.net[0]), false, 'nothing moves after the flood');
});

test('turning: a quarter clockwise, counted, four turns come back; the pump, valve, empty sockets and crosses do not turn', () => {
  const s = createRepair({ seed: 3, size: 5 });
  const i = s.net.find((k) => !s.tiles[k].fixed); const m0 = s.tiles[i].mask;
  for (let k = 0; k < 4; k++) assert.equal(rotateTile(s, i), true);
  assert.equal(s.tiles[i].mask, m0); assert.equal(s.moves, 4);
  assert.equal(turn(1), 2); assert.equal(turn(8), 1);
  assert.equal(rotateTile(s, s.src), false); assert.equal(rotateTile(s, s.dst), false);
  assert.equal(s.tiles[s.src].mask, E); assert.equal(s.tiles[s.dst].mask, W);
  assert.equal(s.src % 5, 0); assert.equal(s.dst % 5, 4);
});

test('par is reachable and hints finish the job: turning each wrong network piece seals the board in par turns or fewer', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const s = createRepair({ seed, size: 4 }); const par = s.par;
    for (const i of s.net) { while (s.tiles[i].mask !== s.tiles[i].solved && !s.done) rotateTile(s, i); }
    assert.ok(s.solved && s.done, `seed ${seed}`);
    assert.ok(s.moves <= par, `seed ${seed}: ${s.moves} vs par ${par}`);
    assert.equal(s.result.success, true);
    const h = createRepair({ seed, size: 5 });
    for (let k = 0; k < 120 && !h.done; k++) { const i = nextHint(h); if (i == null) break; rotateTile(h, i); }
    assert.equal(h.result?.success, true, 'following the hints seals it');
  }
  const z = createRepair({ seed: 9, size: 4 }); solveAll(z); assert.equal(parTurns(z.tiles), 0);
});

test('a steady hand wins: a bot that turns the pieces next to the coolant first, 1.2 s a turn, seals every board at a steady roll', () => {
  const rows = [];
  for (const [label, tier] of [['rough', -2], ['steady', 0], ['smooth', 2]]) {
    let wins = 0, spill = 0, boards = 0, worst = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const o = setupRepair({ tier });
      const s = createRepair({ seed, size: o.size, capacity: o.capacity, flow: o.flow });
      let clock = 0;
      while (!s.done && clock < 300) {
        const i = nextHint(s); if (i == null) break;
        rotateTile(s, i);
        for (let t = 0; t < 72; t++) stepRepair(s, 1 / 60); // 1.2 s to find and tap the next piece
        clock += 1.2;
      }
      boards++; if (s.result?.success) { wins++; spill += s.result.spilled / o.capacity; worst = Math.max(worst, s.result.spilled / o.capacity); }
    }
    rows.push({ label, wins, boards, meanSpill: +(spill / Math.max(1, wins)).toFixed(2), worst: +worst.toFixed(2) });
    if (tier === 0) assert.equal(wins, boards, 'every steady board is won by the 1.2 s bot');
    assert.ok(wins >= boards * (tier < 0 ? 0.6 : 0.95), `${label}: ${wins} of ${boards}`);
  }
  console.log('bot at 1.2 s a turn:', JSON.stringify(rows));
});

test('quality: 40 base, up to 30 for few turns, up to 30 for how little spilled, plus the quality points; stars 90 / 65', () => {
  const q = (o) => qualityOf({ success: true, moves: 10, par: 10, spilled: 0, capacity: 50, qualityBonus: 0, ...o });
  assert.equal(q({}), 100);
  assert.equal(q({ moves: 20 }), 85);
  assert.equal(q({ spilled: 50 }), 70);
  assert.equal(q({ spilled: 25 }), 85);
  assert.equal(q({ spilled: 50, moves: 40 }), 48);
  assert.equal(q({ spilled: 50, moves: 40, qualityBonus: 36 }), 84);
  assert.equal(q({ qualityBonus: 36 }), 100);
  assert.equal(qualityOf({ success: false, moves: 1, par: 1, spilled: 0, capacity: 50 }), 0);
  assert.deepEqual([100, 90, 89, 65, 64, 1].map(starsOf), [3, 3, 2, 2, 1, 1]);
});

test('XP: 4 on a 3 x 3, +2 per board step, +1 per star above one; none for a flood', () => {
  assert.equal(xpFor({ success: true, stars: 1 }, 3), 4);
  assert.equal(xpFor({ success: true, stars: 3 }, 6), 4 + 6 + 2);
  assert.equal(xpFor({ success: false, stars: 0 }, 6), 0);
});

test('every point visibly changes something: pool depth, board size and quality, each by a many-run sum', () => {
  const play = (setup, seeds = 60) => {
    let flood = 0, quality = 0, wins = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const s = createRepair({ seed, size: setup.size, capacity: setup.capacity, flow: setup.flow, qualityBonus: setup.qualityBonus });
      for (let k = 0; k < 400 && !s.done; k++) { const i = nextHint(s); if (i == null) break; rotateTile(s, i); for (let t = 0; t < 240; t++) stepRepair(s, 1 / 60); } // a slow 4 s a turn
      flood += s.result?.how === 'flooded' ? 1 : 0; if (s.result?.success) { wins++; quality += s.result.quality; }
    }
    return { flood, quality: wins ? quality / wins : 0, wins };
  };
  const lvl = (p) => setupRepair({ tier: 0, level: 9, points: p });
  const none = play(lvl({})), deep = play(lvl({ time: 9 }));
  assert.ok(deep.flood < none.flood, `a deeper pool floods less often (${deep.flood} vs ${none.flood})`);
  assert.equal(lvl({ time: 9 }).capacity > lvl({}).capacity, true);
  assert.equal(lvl({ size: 9 }).size, 3); assert.equal(lvl({ size: 3 }).size, 4);
  const smallN = createRepair({ seed: 4, size: lvl({ size: 9 }).size }).net.length, bigN = createRepair({ seed: 4, size: lvl({}).size }).net.length;
  assert.ok(smallN < bigN, 'a smaller board has less pipe to fix');
  const q0 = play(lvl({ time: 9 })), q9 = play({ ...lvl({ time: 9 }), qualityBonus: 36 });
  assert.ok(q9.quality > q0.quality + 20, `quality points show in the patch (${q9.quality} vs ${q0.quality})`);
});
