// Repair v3 (Donaven 2026-11-18): "water fills repair area, if it makes it above your repair you lose and it stays
// broken, maybe later you have to shut off the valve and lose whatever system that coolant protects."
// The spill is water that rises up the board from the bottom row. A piece with the water over all of it cannot turn.
// The water reaching the valve (the repair) loses the line; the line stays broken and keeps flooding until the valve is shut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupRepair } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createRepair, rotateTile, stepRepair, recompute, leaks, waterLevel, isSubmerged, winnable, shutValve, worldOf, nextHint, turn, SYSTEMS, N, E, S, W } from '../projects/Space-Shooter/voyage/minigames/repair.js';

const STEP = { [N]: [0, -1, S], [E]: [1, 0, W], [S]: [0, 1, N], [W]: [-1, 0, E] };
// An independent checker written here from the rule.
function closed(masks, n, src, dst) {
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
  return seen.has(dst) && leaked === 0;
}
const run = (s, secs) => { for (let t = 0; t < secs * 60 && !s.done; t++) stepRepair(s, 1 / 60); return s; };
const rowOf = (s, i) => Math.floor(i / s.cols);

test('the valve is in the top half and the water has room to rise: reach is the valve wheel, at least 1.5 rows', () => {
  for (const size of [3, 4, 5, 6]) for (let seed = 1; seed <= 120; seed++) {
    const s = createRepair({ seed, size });
    assert.ok(s.valveRow < Math.ceil(size / 2), `size ${size} seed ${seed}: valve row ${s.valveRow}`);
    assert.equal(s.dst, s.valveRow * size + size - 1);
    assert.equal(s.reach, size - s.valveRow - 0.5);
    assert.ok(s.reach >= 1.5);
    assert.notEqual(rowOf(s, s.src), s.valveRow, 'pump and valve are on different rows');
  }
});

test('the bottom row starts in place: its pieces are the first the water takes and are never scrambled', () => {
  for (const size of [3, 4, 5, 6]) for (let seed = 1; seed <= 80; seed++) {
    const s = createRepair({ seed, size });
    for (let i = size * (size - 1); i < size * size; i++) assert.equal(s.tiles[i].mask, s.tiles[i].solved, `size ${size} seed ${seed} tile ${i}`);
  }
});

test('the water level: zero with no leak, rises with the spill to the valve wheel when the pool is full', () => {
  const s = createRepair({ seed: 3, size: 5, capacity: 100 });
  assert.equal(waterLevel(s), 0);
  s.pool = 25; assert.equal(waterLevel(s), s.reach * 0.25);
  s.pool = 100; assert.equal(waterLevel(s), s.reach);
  s.pool = 500; assert.equal(waterLevel(s), s.reach, 'never above the valve');
  // it only rises while an end pours
  const t = createRepair({ seed: 3, size: 5, capacity: 1e6 });
  run(t, 10);
  const before = waterLevel(t); const k = leaks(t).length;
  assert.ok(k > 0, 'a scrambled board pours');
  run(t, 10);
  assert.ok(waterLevel(t) > before);
  const solved = createRepair({ seed: 4, size: 4, capacity: 1e6 }); for (const x of solved.tiles) if (!x.fixed) x.mask = x.solved; recompute(solved);
  run(solved, 5); assert.equal(waterLevel(solved), 0);
});

test('submerged pieces cannot be turned: a piece is under when the water is over all of it; the pump and valve never are', () => {
  const s = createRepair({ seed: 6, size: 5, capacity: 100 });
  const n = 5;
  s.pool = 0; assert.equal(isSubmerged(s, 20), false);
  s.pool = (100 / s.reach) * 0.99; assert.equal(isSubmerged(s, 20), false, 'water just under the top of the bottom row');
  s.pool = (100 / s.reach) * 1.0; assert.equal(isSubmerged(s, 20), true, 'bottom row under at 1 row');
  assert.equal(isSubmerged(s, 15), false);
  s.pool = (100 / s.reach) * 2.0; assert.equal(isSubmerged(s, 15), true, 'second row from the bottom under at 2 rows');
  assert.equal(isSubmerged(s, s.src), false); assert.equal(isSubmerged(s, s.dst), false);
  // a turn on a submerged piece does nothing and says so
  const target = [...Array(n * n).keys()].find((i) => !s.tiles[i].fixed && isSubmerged(s, i));
  const m0 = s.tiles[target].mask, moves = s.moves;
  assert.equal(rotateTile(s, target), false);
  assert.deepEqual([s.tiles[target].mask, s.moves, s.events[0]?.type], [m0, moves, 'locked']);
  // a piece above the water turns
  const dry = [...Array(n * n).keys()].find((i) => !s.tiles[i].fixed && !isSubmerged(s, i) && s.tiles[i].mask);
  assert.equal(rotateTile(s, dry), true);
});

test('the water reaching the valve loses the line: it stays broken, the result names the system it protects', () => {
  const s = createRepair({ seed: 5, size: 5, capacity: 20 });
  run(s, 600);
  assert.equal(s.done, true);
  const r = s.result;
  assert.deepEqual({ success: r.success, how: r.how, broken: r.broken, flooding: r.flooding, valveShut: r.valveShut, offline: r.offline, system: r.system, systemName: r.systemName, xp: r.xp, quality: r.quality },
    { success: false, how: 'flooded', broken: true, flooding: true, valveShut: false, offline: null, system: 'engine-cooling', systemName: 'Engine cooling', xp: 0, quality: 0 });
  assert.ok(['level', 'locked'].includes(r.cause));
  const w = createRepair({ seed: 5, size: 5, capacity: 20, system: 'weapon-cooling' });
  run(w, 600); assert.equal(w.result.system, 'weapon-cooling'); assert.equal(w.result.systemName, 'Weapon cooling');
  assert.equal(createRepair({ seed: 5, size: 5, system: 'no-such' }).system, 'engine-cooling');
  assert.deepEqual(Object.keys(SYSTEMS), ['engine-cooling', 'weapon-cooling', 'reactor-loop', 'life-support']);
});

test('a pure level loss: with no piece locked wrong, a full pool is lost by the level alone (cause level)', () => {
  // hold every network piece in its place except one in the top row (above the water), then let it flood
  let seen = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = createRepair({ seed, size: 5, capacity: 60 });
    const top = s.net.find((i) => rowOf(s, i) <= s.valveRow && s.tiles[i].mask !== s.tiles[i].solved);
    if (top == null) continue;
    for (const i of s.net) if (i !== top && rowOf(s, i) > s.valveRow) s.tiles[i].mask = s.tiles[i].solved;
    recompute(s);
    run(s, 600);
    if (s.result.cause === 'level') { seen++; assert.equal(s.pool, 60); assert.equal(waterLevel(s), s.reach); }
  }
  assert.ok(seen > 10, `${seen} boards lost by the level`);
});

test('a piece the water locked wrong ends the line at once (cause locked): no clock is left to wait on', () => {
  let seen = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const s = createRepair({ seed, size: 5, capacity: 100 });
    // the lowest scrambled piece above the bottom row
    const low = s.net.filter((i) => rowOf(s, i) === 3 && s.tiles[i].mask !== s.tiles[i].solved && !s.tiles[i].fixed && s.tiles[i].solved !== 5 && s.tiles[i].solved !== 10);
    if (!low.length) continue;
    s.pool = (100 / s.reach) * 2.05; // row 3 is under
    assert.equal(isSubmerged(s, low[0]), true);
    stepRepair(s, 1 / 60);
    if (s.done) { seen++; assert.deepEqual([s.result.how, s.result.cause, s.result.broken], ['flooded', 'locked', true]); assert.ok(s.pool < 100, 'it did not wait for a full pool'); }
  }
  assert.ok(seen > 5, `${seen}`);
});

test('winnable agrees with a brute force: every arrangement of the pieces that can still turn (3 x 3 boards, random water)', () => {
  let agree = 0, yes = 0, no = 0;
  for (let seed = 1; seed <= 220; seed++) {
    const s = createRepair({ seed, size: 3, capacity: 100 });
    // random masks on the movable pieces, then random water height
    let r = seed * 7919;
    const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (const t of s.tiles) if (!t.fixed) { for (let k = Math.floor(rnd() * 4); k > 0; k--) t.mask = turn(t.mask); }
    recompute(s);
    s.pool = Math.round(rnd() * 100);
    const free = s.tiles.map((t, i) => (!t.fixed && !isSubmerged(s, i) ? i : -1)).filter((i) => i >= 0);
    let any = false;
    const base = s.tiles.map((t) => t.mask);
    const walk = (k, masks) => {
      if (any) return;
      if (k === free.length) { if (closed(masks, 3, s.src, s.dst)) any = true; return; }
      let m = base[free[k]];
      for (let q = 0; q < 4; q++) { const next = masks.slice(); next[free[k]] = m; walk(k + 1, next); m = turn(m); }
    };
    walk(0, base);
    assert.equal(winnable(s), any, `seed ${seed}: pool ${s.pool}`);
    agree++; any ? yes++ : no++;
  }
  assert.ok(yes > 20 && no > 20, `both answers occur (${yes} yes, ${no} no)`);
});

test('every fresh board is winnable', () => {
  for (const size of [3, 4, 5, 6]) for (let seed = 1; seed <= 150; seed++) assert.equal(winnable(createRepair({ seed, size })), true, `size ${size} seed ${seed}`);
});

test('shut the valve: only after a loss; it stops the flooding, takes the system offline, and the line stays broken', () => {
  const live = createRepair({ seed: 5, size: 5, capacity: 20 });
  assert.equal(shutValve(live), null, 'nothing to shut before the line is lost');
  run(live, 600);
  const level0 = waterLevel(live), pool0 = live.pool;
  const r = shutValve(live);
  assert.deepEqual({ how: r.how, valveShut: r.valveShut, flooding: r.flooding, offline: r.offline, broken: r.broken, success: r.success }, { how: 'valve-shut', valveShut: true, flooding: false, offline: 'engine-cooling', broken: true, success: false });
  assert.equal(shutValve(live), null, 'once only');
  assert.deepEqual(worldOf(live.result), { broken: true, flooding: false, offline: 'engine-cooling', system: 'engine-cooling', systemName: 'Engine cooling' });
  stepRepair(live, 5); assert.equal(live.pool, pool0); assert.equal(waterLevel(live), level0);
  // a sealed line has nothing to shut and breaks nothing
  const ok = createRepair({ seed: 8, size: 4 });
  for (const i of ok.net) while (ok.tiles[i].mask !== ok.tiles[i].solved && !ok.done) rotateTile(ok, i);
  assert.equal(ok.result.success, true); assert.equal(shutValve(ok), null);
  assert.deepEqual(worldOf(ok.result), { broken: false, flooding: false, offline: null, system: 'engine-cooling', systemName: 'Engine cooling' });
});

test('hints skip submerged pieces', () => {
  const s = createRepair({ seed: 2, size: 5, capacity: 100 });
  s.pool = (100 / s.reach) * 2.2;
  const i = nextHint(s);
  if (i != null) assert.equal(isSubmerged(s, i), false);
});

test('a steady hand still wins with the water rising: a bot that fixes the coolant frontier lowest first, 1.2 s a turn', () => {
  const rows = [];
  for (const [label, tier, floor] of [['rough', -2, 0.6], ['shaky', -1, 0.95], ['steady', 0, 1], ['smooth', 2, 1]]) {
    let wins = 0, boards = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const o = setupRepair({ tier });
      const s = createRepair({ seed, size: o.size, capacity: o.capacity, flow: o.flow });
      let clock = 0;
      while (!s.done && clock < 300) {
        const i = nextHint(s); if (i == null) break;
        rotateTile(s, i);
        for (let t = 0; t < 72 && !s.done; t++) stepRepair(s, 1 / 60);
        clock += 1.2;
      }
      boards++; if (s.result?.success) wins++;
    }
    rows.push(`${label} ${wins}/${boards}`);
    assert.ok(wins >= boards * floor, `${label}: ${wins} of ${boards}`);
  }
  console.log('bot at 1.2 s, water rising:', rows.join(', '));
});

test('a hand that never turns a piece loses every board and the line stays broken', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const o = setupRepair({ tier: 0 });
    const s = createRepair({ seed, size: o.size, capacity: o.capacity, flow: o.flow });
    run(s, 900);
    assert.equal(s.result.success, false, `seed ${seed}`);
    assert.equal(s.result.broken, true);
  }
});
