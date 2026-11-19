// Minigames lane piece 5: crafting forge strikes. Numbers from PLAN.md section 2.5; rules in minigames/craft.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupCraft } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createCraft, stepCraft, strike, needleAt, zoneOf, inZone, qualityOf, starsOf, materialsUsed, craftXp } from '../projects/Space-Shooter/voyage/minigames/craft.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('craft setup: base numbers and the exact per-point tables', () => {
  assert.deepEqual(setupCraft({}), { zone: 0.22, speed: 1.1, strikes: 5, qualityBonus: 0, buildFactor: 1, materialFactor: 1, tier: 0, points: { quality: 0, speed: 0, material: 0 }, label: 'Steady' });
  const at = (cat, n) => setupCraft({ points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('quality', n).qualityBonus), [0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('speed', n).strikes), [5, 5, 5, 4, 4, 4, 3, 3, 3, 2]);
  assert.deepEqual([0, 1, 3, 9].map((n) => at('speed', n).buildFactor), [1, 0.95, 0.85, 0.55]);
  assert.deepEqual([0, 1, 5, 9].map((n) => at('material', n).materialFactor), [1, 0.96, 0.8, 0.64]);
  assert.equal(setupCraft({ points: { quality: 9 }, level: 3 }).qualityBonus, 12);
});

test('craft setup: the roll scales zone, needle and strike count (never under 2)', () => {
  const t = (k, p = {}) => setupCraft({ tier: k, points: p, level: 9 });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).zone), [0.154, 0.187, 0.22, 0.253, 0.286]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).speed), [1.232, 1.166, 1.1, 1.034, 0.968]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).strikes), [6, 5, 5, 5, 4]);
  assert.equal(t(2, { speed: 9 }).strikes, 2);
});

const mk = (seed = 1, setup = {}, recipe) => createCraft({ seed, recipe, setup: setupCraft(setup) });
function until(s, want) { for (let i = 0; i < 20000; i++) { if (inZone(s) === want) return true; stepCraft(s, 1 / 120); } return false; }

test('the board: deterministic, zones fit the gauge and move between strikes', () => {
  for (let seed = 1; seed <= 80; seed++) for (const tier of [-2, 0, 2]) {
    const a = mk(seed, { tier }), b = mk(seed, { tier });
    assert.deepEqual(a.centres, b.centres); assert.equal(a.phase, b.phase);
    a.centres.forEach((c, i) => { const [lo, hi] = zoneOf(a, i); assert.ok(lo >= 0 && hi <= 1, `zone ${lo}-${hi}`); if (i) assert.ok(Math.abs(c - a.centres[i - 1]) >= a.zone - 1e-9, 'zone moved'); });
  }
});

test('the needle sweeps the whole gauge and back', () => {
  const s = mk(2); const seen = [];
  for (let i = 0; i < 1500; i++) { stepCraft(s, 1 / 120); seen.push(needleAt(s)); }
  assert.ok(Math.min(...seen) < 0.02 && Math.max(...seen) > 0.98);
});

test('a perfect player makes a 3-star part at every tier and seed, with no spoiled material', () => {
  for (const tier of [-2, -1, 0, 1, 2]) for (let seed = 1; seed <= 40; seed++) {
    const s = mk(seed, { tier });
    while (!s.done) { assert.ok(until(s, true), `tier ${tier} seed ${seed}`); strike(s); }
    assert.equal(s.result.success, true); assert.equal(s.result.good, s.result.strikes); assert.equal(s.result.spoils, 0);
    assert.equal(s.result.stars, 3); assert.equal(s.result.quality, 100);
  }
});

test('a player who always misses ruins the part and loses the materials; no XP', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = mk(seed, {}, { materials: 10, build: 30 });
    while (!s.done) { assert.ok(until(s, false)); strike(s); }
    assert.deepEqual([s.result.success, s.result.good, s.result.spoils, s.result.quality, s.result.stars, s.result.xp, s.result.materials], [false, 0, 5, 0, 0, 0, 10]);
  }
});

test('a lazy player who strikes the instant they start is not a master: most are ruined or poor', () => {
  let made = 0, stars3 = 0;
  for (let seed = 1; seed <= 200; seed++) { const s = mk(seed); while (!s.done) strike(s); if (s.result.success) made++; if (s.result.stars === 3) stars3++; }
  assert.ok(made < 100, `lazy strikes made ${made} of 200`); assert.ok(stars3 < 10);
});

test('exactly half good is the line: fewer than ceil(strikes / 2) good ruins it', () => {
  const run = (goods) => { const s = mk(3); for (let i = 0; i < s.strikes; i++) { until(s, i < goods); strike(s); } return s.result; };
  assert.equal(run(2).success, false); assert.equal(run(3).success, true);
  assert.equal(run(3).quality, 64); assert.equal(run(4).quality, 82); assert.equal(run(5).quality, 100);
});

test('quality: 10 + 90 x good / strikes + quality points, clamped; stars at 65 and 90', () => {
  assert.equal(qualityOf({ good: 3, strikes: 5 }), 64);
  assert.equal(qualityOf({ good: 3, strikes: 5, qualityBonus: 12 }), 76);
  assert.equal(qualityOf({ good: 5, strikes: 5, qualityBonus: 36 }), 100);
  assert.equal(qualityOf({ good: 0, strikes: 5 }), 10);
  assert.deepEqual([100, 90, 89, 65, 64].map(starsOf), [3, 3, 2, 2, 1]);
  assert.deepEqual([1, 2, 3].map((n) => craftXp({ success: true, stars: n })), [4, 5, 6]);
  assert.equal(craftXp({ success: false, stars: 0 }), 0);
});

test('material use: points cut it, each bad strike spoils 10% more, never under 1, a ruined part costs the lot', () => {
  const r = { materials: 10 };
  assert.deepEqual([0, 1, 2].map((m) => materialsUsed(r, m)), [10, 11, 12]);
  assert.equal(materialsUsed(r, 0, 0.64), 6);
  assert.equal(materialsUsed(r, 2, 0.64), 7);
  assert.equal(materialsUsed({ materials: 1 }, 0, 0.64), 1);
  assert.equal(materialsUsed(r, 3, 1, true), 10);
});

test('the result carries build time from the speed points and materials from the material points', () => {
  const s = mk(5, { points: { speed: 3, material: 5 }, level: 9 }, { materials: 10, build: 30 });
  while (!s.done) { until(s, true); strike(s); }
  assert.equal(s.result.strikes, 4); assert.equal(s.result.buildSeconds, 26); assert.equal(s.result.materials, 8);
});

test('the picker words match the game: speed and material', () => {
  assert.equal(CATEGORIES.crafting.cats[1].words(3), `builds 15% faster, ${setupCraft({ points: { speed: 3 } }).strikes} strikes`);
  assert.equal(CATEGORIES.crafting.cats[2].words(5), `20% less material`);
});
