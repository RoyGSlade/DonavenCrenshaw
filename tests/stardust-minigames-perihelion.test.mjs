// Navigation v2, PERIHELION: setup numbers, determinism, prediction = execution, trim, marks, gates, results, the trainer's five
// sectors, and a search bot that must clear the Steady field sectors (the real rate is printed). Pure: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupPerihelion } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createPerihelion, setPlan, launch, advance, runBurn, predict, trim, pressMark, tick, planCosts, maxThrust, cloneSim, abandon, periXp, TICKS, BURN } from '../projects/Space-Shooter/voyage/minigames/perihelion.js';
import { buildFieldSector } from '../projects/Space-Shooter/voyage/minigames/perihelionField.js';
import { TRAINER_SECTORS } from '../projects/Space-Shooter/voyage/minigames/perihelionData.js';
import { solve } from '../projects/Space-Shooter/voyage/minigames/perihelionBot.js';
import { createNavField, createNavTrainer, trainerSettle, setupNavTrainer } from '../projects/Space-Shooter/voyage/minigames/perihelionEntry.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { rollPreview } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';

const steady = setupPerihelion({});
const field = (seed, setup = steady) => createPerihelion({ seed, setup });

test('setup: base numbers and the exact per-point tables (each path changes something visible)', () => {
  assert.deepEqual(setupPerihelion({}), { turns: 5, window: 1.4, fuelFactor: 1, arc: 0.6, warn: 0.5, scan: false, wells: 1, asteroids: 2, flares: 0, meteorEvery: 2, tier: 0, points: { time: 0, fuel: 0, warning: 0 }, label: 'Steady' });
  const at = (c, n) => setupPerihelion({ points: { [c]: n }, level: 9 });
  assert.deepEqual([0, 1, 5, 9].map((n) => at('time', n).window), [1.4, 1.5, 1.9, 2.3]);
  assert.deepEqual([0, 2, 3, 6, 9].map((n) => at('time', n).turns), [5, 5, 6, 7, 8]);
  assert.deepEqual([0, 1, 5, 9].map((n) => at('fuel', n).fuelFactor), [1, 0.96, 0.8, 0.64]);
  assert.deepEqual([0, 1, 5, 9].map((n) => at('warning', n).arc), [0.6, 0.645, 0.825, 1]);
  assert.deepEqual([0, 1, 5, 9].map((n) => at('warning', n).warn), [0.5, 0.62, 1.1, 1.58]);
  assert.deepEqual([5, 6].map((n) => at('warning', n).scan), [false, true]);
  assert.equal(setupPerihelion({ points: { time: 9 }, level: 2 }).window, 1.6, 'never more points than the level');
});
test('setup: the roll makes a bad roll busier and a good roll calmer', () => {
  const t = (k) => setupPerihelion({ tier: k });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).turns), [4, 5, 5, 6, 6]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).wells), [2, 1, 1, 1, 1]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).asteroids), [4, 3, 2, 1, 1]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).meteorEvery), [1, 2, 2, 0, 0]);
  const rp = rollPreview('perihelion', { total: 18, dc: 10 }, { level: 7 });
  assert.match(rp.line, /Good roll: 1 more turn, 1 fewer rock, no shards/);
});
test('picker: navigation is built and its words come from the same setup', () => {
  assert.equal(CATEGORIES.navigation.built, true);
  const w = (id, n) => CATEGORIES.navigation.cats.find((c) => c.id === id).words(n);
  assert.match(w('time', 3), /1\.7 s.*1 spare turn$/); assert.match(w('time', 6), /2 spare turns/);
  assert.equal(w('fuel', 5), 'burns and trims cost 20% less fuel');
  assert.match(w('warning', 9), /100% of the burn, shards flagged 1\.6 s ahead, fog scanned/);
});

test('determinism: the same seed and setup draw the same sector and play out the same', () => {
  for (let seed = 1; seed <= 30; seed++) {
    assert.deepEqual(buildFieldSector(seed, steady, 0), buildFieldSector(seed, steady, 0));
    const a = field(seed), b = field(seed);
    for (const s of [a, b]) { setPlan(s, { angle: 0.4, thrust: 80 }); launch(s); runBurn(s); }
    assert.deepEqual(a.ship, b.ship);
  }
  assert.notDeepEqual(buildFieldSector(1, steady, 0), buildFieldSector(2, steady, 0));
});
test('prediction = execution: with no trim the predicted arc is the flown arc (field and trainer, with shards)', () => {
  const games = [...Array(40)].map((_, i) => field(i + 1)).concat(TRAINER_SECTORS.map((sec) => createPerihelion({ seed: 3, setup: steady, sector: sec })));
  let n = 0;
  for (const s of games) {
    s.turn = 2; // shards fly on even turns: prove they never bend the path
    for (const [a, th] of [[0.2, 100], [-0.9, 60], [2.1, 35]]) {
      const c = cloneSim(s); setPlan(c, { angle: a, thrust: th });
      const pr = predict(c);
      launch(c);
      const flown = [{ x: c.ship.x, y: c.ship.y }];
      while (c.phase === 'burn') { tick(c); flown.push({ x: c.ship.x, y: c.ship.y }); }
      const last = pr.points[pr.points.length - 1];
      // A shard can end the burn early by taking the last hull (it never bends the path); every flown tick must match.
      if (flown.length > TICKS || !c.done) assert.ok(Math.hypot(last.x - flown[flown.length - 1].x, last.y - flown[flown.length - 1].y) < 1e-6, 'same end point');
      for (const p of pr.points) { const f = flown[Math.round(p.t / (1 / 60))]; if (f) assert.ok(Math.hypot(p.x - f.x, p.y - f.y) < 1e-6, `tick ${p.t}`); }
      n++;
    }
  }
  assert.ok(n === 135);
});
test('prediction: the arc is cut at the warning path and the dry run costs nothing', () => {
  const s = field(4); const before = JSON.stringify(s.ship);
  setPlan(s, { angle: 0.3, thrust: 70 });
  const p = predict(s);
  assert.equal(JSON.stringify(s.ship), before, 'predicting never moves the real ship');
  assert.equal(p.fuel, planCosts(s).fuel);
  assert.ok(p.points.length >= TICKS / 3);
});

test('fuel path: burns and trims cost less, and the saving is reported', () => {
  const cheap = setupPerihelion({ points: { fuel: 9 }, level: 9 });
  const a = createPerihelion({ seed: 2, setup: steady }), b = createPerihelion({ seed: 2, setup: cheap });
  for (const s of [a, b]) setPlan(s, { angle: 0, thrust: 100 });
  assert.equal(planCosts(a).fuel, 22); assert.equal(planCosts(b).fuel, 14.1);
  for (const s of [a, b]) { launch(s); advance(s, 0.3); trim(s, 1); }
  assert.equal(a.fuelSpent, 24); assert.equal(+b.fuelSpent.toFixed(2), 15.38);
  runBurn(b); abandon(b);
  assert.ok(b.result.fuelSaved > 7);
});
test('time path: a longer window flies farther for the same plan, extra turns raise the limit', () => {
  const long = setupPerihelion({ points: { time: 9 }, level: 9 });
  const a = createPerihelion({ seed: 2, setup: steady }), b = createPerihelion({ seed: 2, setup: long });
  for (const s of [a, b]) { setPlan(s, { angle: 0, thrust: 60 }); launch(s); runBurn(s); }
  assert.ok(Math.hypot(b.ship.vx, b.ship.vy) > Math.hypot(a.ship.vx, a.ship.vy) + 30);
  assert.equal(b.maxTurns, a.maxTurns + 3);
});
test('warning path: shards are flagged earlier, and the arc shows more of the burn', () => {
  const s = field(1); s.turn = 2; setPlan(s, { angle: 0.3, thrust: 70 }); launch(s);
  assert.equal(s.meteors.length, 1); assert.equal(s.meteors[0].warn, 0.5);
  const w = createPerihelion({ seed: 1, setup: setupPerihelion({ points: { warning: 9 }, level: 9 }) }); w.turn = 2; setPlan(w, { angle: 0.3, thrust: 70 }); launch(w);
  assert.equal(w.meteors[0].warn, 1.58); assert.equal(w.arc, 1);
  assert.equal(s.meteors[0].t0, w.meteors[0].t0, 'same seed, same shard, only the warning differs');
});

test('trim: a sideways kick that costs fuel and heat, is rate limited, and locks when hot or dry', () => {
  const s = field(3); setPlan(s, { angle: 0, thrust: 0 }); launch(s); advance(s, 0.2);
  const vy0 = s.ship.vy, f0 = s.ship.fuel, h0 = s.ship.heat;
  assert.equal(trim(s, 1), 'ok');
  assert.ok(Math.abs(s.ship.vy - vy0) > 30); assert.equal(s.ship.fuel, f0 - 2); assert.equal(s.ship.heat, h0 + 5);
  assert.equal(trim(s, 1), 'wait'); advance(s, 0.2); assert.equal(trim(s, -1), 'ok');
  s.ship.heat = 100; s.ship.overheated = true; advance(s, 0.2); assert.equal(trim(s, 1), 'hot');
  s.ship.overheated = false; s.ship.fuel = 1; advance(s, 0.2); assert.equal(trim(s, 1), 'dry');
});
test('overheated engines are capped; coasting cools', () => {
  const s = field(3); s.ship.overheated = true;
  assert.equal(planCosts(s, { thrust: 100 }).thrust, 60); assert.equal(maxThrust(s), 60);
  assert.equal(planCosts(s, { thrust: 0 }).heat, -28);
});

test('marks: a ring closes on a gate or a slingshot; the sweet spot pays fuel, heat and speed', () => {
  const sec = TRAINER_SECTORS[0];
  const s = createPerihelion({ seed: 1, setup: steady, sector: sec });
  // park the ship inside the slingshot ring and start the burn: the ring opens at once
  s.ship.x = 470; s.ship.y = 300; s.ship.vx = 60; s.ship.vy = 0;
  setPlan(s, { angle: 0, thrust: 0 }); launch(s); tick(s);
  assert.equal(s.burn.mark.type, 'sling');
  const fuel = s.ship.fuel; const heat = s.ship.heat, speed = Math.hypot(s.ship.vx, s.ship.vy);
  while (s.burn.mark && s.burn.mark.progress < 0.6) tick(s);
  assert.equal(pressMark(s), 'perfect');
  assert.equal(s.ship.fuel, fuel + 5); assert.equal(s.ship.heat, Math.max(0, heat - 8)); assert.ok(Math.hypot(s.ship.vx, s.ship.vy) > speed * 1.1);
  assert.equal(s.perfect, 1);
  const m = createPerihelion({ seed: 1, setup: steady, sector: sec });
  m.ship.x = 470; m.ship.y = 300; m.ship.vx = 60; m.ship.vy = 0; setPlan(m, { angle: 0, thrust: 0 }); launch(m); tick(m);
  assert.equal(pressMark(m), 'miss', 'too early is off the mark');
});

test('gates: required waypoints come first; slipstream charges the next burn; unstable relays collapse', () => {
  const s = createPerihelion({ seed: 1, setup: steady, sector: TRAINER_SECTORS[3] });
  const exit = s.gates.find((g) => g.kind === 'exit'), slip = s.gates.find((g) => g.mod === 'slipstream');
  s.ship.x = exit.x; s.ship.y = exit.y; setPlan(s, { angle: 0, thrust: 0 }); launch(s); tick(s);
  assert.equal(exit.cleared, false, 'the exit is locked until the required waypoint is done');
  s.ship.x = slip.x; s.ship.y = slip.y; tick(s);
  assert.equal(slip.cleared, true); assert.equal(s.ship.slip, true);
  runBurn(s);
  assert.ok(planCosts(s, { thrust: 100 }).accel > 105 * 1.5, 'the next burn is +55%');
  const u = createPerihelion({ seed: 1, setup: steady, sector: TRAINER_SECTORS[1] });
  const g = u.gates.find((x) => x.mod === 'unstable');
  for (let i = 0; i < 2; i++) { setPlan(u, { angle: 3, thrust: 0 }); launch(u); runBurn(u); }
  assert.equal(g.collapsed, true);
});

test('results: turns, fuel used, hull, stars and xp are right', () => {
  const s = createNavTrainer({ index: 1 });
  const r = solve(s);
  assert.ok(r.win);
  for (const p of r.plans) { setPlan(s, p); launch(s); advance(s, 10); }
  const res = s.result;
  assert.equal(res.success, true); assert.equal(res.turns, r.plans.length); assert.equal(res.how, 'exit');
  assert.equal(res.fuelUsed, +(s.fuelSpent).toFixed(1)); assert.equal(res.hullLeft, s.ship.hull);
  assert.equal(res.stars, 1 + (res.turns <= res.parTurns ? 1 : 0) + (res.fuelUsed <= res.parFuel ? 1 : 0));
  assert.equal(res.xp, 2 * res.stars);
  const lost = field(1); abandon(lost);
  assert.deepEqual([lost.result.success, lost.result.xp, lost.result.stars], [false, 0, 0]);
  assert.equal(periXp({ success: true, stars: 3, hullLost: 0, mode: 'field' }), 7); assert.equal(periXp({ success: true, stars: 1, hullLost: 2, mode: 'field' }), 4);
  const dead = field(2); dead.ship.hull = 1; dead.ship.x = 12; dead.ship.vx = -300; setPlan(dead, { angle: 0, thrust: 0 }); launch(dead); runBurn(dead);
  assert.equal(dead.result.how, 'hull');
  const slow = field(5); slow.maxTurns = 1; setPlan(slow, { angle: 3, thrust: 0 }); launch(slow); runBurn(slow);
  assert.equal(slow.result.how, 'turns'); assert.equal(slow.result.turns, 1);
});
test('trainer: five sectors in order, every one clearable, stars pay XP only for improvement', () => {
  assert.deepEqual(TRAINER_SECTORS.map((s) => s.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(TRAINER_SECTORS.map((s) => s.id), ['lagrange-approach', 'kepler-belt', 'binary-slingshot', 'shrouded-reef', 'aphelion-gauntlet']);
  const results = [];
  for (let i = 0; i < 5; i++) {
    const s = createNavTrainer({ index: i }); const r = solve(s);
    assert.ok(r.win, `sector ${i + 1} is clearable`);
    for (const p of r.plans) { setPlan(s, p); launch(s); advance(s, 10); }
    assert.equal(s.result.success, true, `sector ${i + 1} replays to a clear`); results.push(s.result);
  }
  let progress = {}, total = 0;
  const first = trainerSettle(progress, { ...results[0], stars: 2 }); assert.equal(first.xp, 4); progress = first.progress;
  const again = trainerSettle(progress, { ...results[0], stars: 2 }); assert.equal(again.xp, 0);
  const better = trainerSettle(progress, { ...results[0], stars: 3 }); assert.equal(better.xp, 2); assert.equal(better.progress[results[0].sector].stars, 3);
  assert.equal(trainerSettle(progress, { success: false }).xp, 0);
  const t = setupNavTrainer({ points: { time: 3 }, level: 3 }); assert.equal(createNavTrainer({ index: 0, setup: t }).maxTurns, 5);
});

const BOT = { angles: 48, beam: 6, thrusts: [30, 55, 80, 100] }; // a different (wider) search than the one the entry uses to re-draw
test('every field sector is solvable: a search bot clears the Steady roll over 500 seeds', { timeout: 600000 }, () => {
  let raw = 0, fixed = 0, turns = 0; const N = 500;
  for (let seed = 1; seed <= N; seed++) {
    const a = createNavField({ seed, setup: steady, verify: false });
    const r = solve(a, BOT);
    if (r.win) { raw++; turns += r.turns; }
    const b = createNavField({ seed, setup: steady });
    if (solve(b, BOT).win) fixed++;
  }
  console.log(`perihelion bot: raw draw ${raw}/${N} (${(raw / N * 100).toFixed(1)}%), after the entry re-draw ${fixed}/${N}, average ${(turns / raw).toFixed(2)} turns`);
  assert.ok(raw / N >= 0.95, `raw ${raw}`); assert.ok(fixed >= raw);
});
