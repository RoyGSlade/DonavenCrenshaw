// Minigames lane piece 5, v2: crafting is HEAT AND SHAPE (hold to heat, release in the band,
// then tap the shaping tools in order before the stock cools). Numbers from PLAN.md section 2.5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupCraft } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createCraft, stepCraft, heatStart, release, shape, bandOf, heatVerdict, workSecondsFor, settleMaterials, qualityOf, starsOf, craftXp, TOOLS } from '../projects/Space-Shooter/voyage/minigames/craft.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('craft setup: base numbers and the exact per-point tables', () => {
  assert.deepEqual(setupCraft({}), { zone: 0.22, speed: 1.1, strikes: 5, qualityBonus: 0, workFactor: 1, buildFactor: 1, materialFactor: 1, tier: 0, points: { quality: 0, speed: 0, material: 0 }, label: 'Steady' });
  const at = (cat, n) => setupCraft({ points: { [cat]: n }, level: 9 });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('quality', n).qualityBonus), [0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at('speed', n).strikes), [5, 5, 5, 4, 4, 4, 3, 3, 3, 2]);
  assert.deepEqual([0, 1, 3, 9].map((n) => at('speed', n).buildFactor), [1, 0.95, 0.85, 0.55]);
  assert.deepEqual([0, 1, 5, 9].map((n) => at('material', n).materialFactor), [1, 0.96, 0.8, 0.64]);
  assert.equal(setupCraft({ points: { quality: 9 }, level: 3 }).qualityBonus, 12);
});

test('craft setup: the roll scales band, heat rate, steps and work time', () => {
  const t = (k, p = {}) => setupCraft({ tier: k, points: p, level: 9 });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).zone), [0.154, 0.187, 0.22, 0.253, 0.286]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).speed), [1.232, 1.166, 1.1, 1.034, 0.968]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).strikes), [6, 5, 5, 5, 4]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).workFactor), [0.7, 0.85, 1, 1.15, 1.3]);
  assert.equal(t(2, { speed: 9 }).strikes, 2);
});

const mk = (seed = 1, setup = {}, recipe, bank = 0) => createCraft({ seed, recipe, setup: setupCraft(setup), bank });
function heatTo(s, target) { heatStart(s); for (let i = 0; i < 40000 && s.temp < target && s.phase === 'heat'; i++) stepCraft(s, 1 / 240); }
const centreHeat = (s) => { heatTo(s, s.centre); return release(s); };
const doOrder = (s) => { for (const id of s.order) shape(s, id); };

test('the board: deterministic; band fits the gauge; tiles shuffled but the same tools as the order; steps never over 6', () => {
  for (let seed = 1; seed <= 80; seed++) for (const tier of [-2, 0, 2]) for (const sp of [0, 9]) {
    const a = mk(seed, { tier, points: { speed: sp }, level: 9 }), b = mk(seed, { tier, points: { speed: sp }, level: 9 });
    assert.deepEqual([a.centre, a.order, a.tiles], [b.centre, b.order, b.tiles]);
    const [lo, hi] = bandOf(a); assert.ok(lo > 0.4 && hi < 0.9, `band ${lo}-${hi}`);
    assert.deepEqual([...a.tiles].sort(), [...a.order].sort());
    assert.notDeepEqual(a.tiles, a.order, 'tiles must not start in order');
    assert.equal(a.order.length, a.strikes);
    const idx = a.order.map((id) => TOOLS.findIndex((t) => t.id === id));
    assert.deepEqual(idx, [...idx].sort((x, y) => x - y), 'order is rough to fine');
  }
});

test('heat: the glow climbs only while held; releasing inside the band is clean; below is cold; above is hot', () => {
  const s = mk(3); const t0 = s.temp;
  for (let i = 0; i < 120; i++) stepCraft(s, 1 / 60);
  assert.equal(s.temp, t0, 'no heat before you hold');
  heatStart(s); for (let i = 0; i < 60; i++) stepCraft(s, 1 / 60);
  assert.ok(Math.abs(s.temp - (t0 + 0.45 * 1.1)) < 0.01, `1 s heats ${s.temp}`);
  const [lo, hi] = bandOf(s);
  for (const [temp, want] of [[lo - 0.01, 'cold'], [lo, 'ok'], [s.centre, 'ok'], [hi, 'ok'], [hi + 0.01, 'hot'], [1, 'hot']]) assert.equal(heatVerdict(s, temp), want, `${temp}`);
});

test('heat effects: cold halves the work time, hot x1.25 and two spoils, clean x1', () => {
  const base = (verdict) => { const s = mk(4); return workSecondsFor(s, verdict); };
  assert.deepEqual([base('ok'), base('cold'), base('hot')], [15.5, 7.8, 19.4]);
  let s = mk(4); heatTo(s, bandOf(s)[0] - 0.05); assert.equal(release(s), 'cold'); assert.deepEqual([s.workMax, s.spoils], [7.8, 0]);
  s = mk(4); heatTo(s, bandOf(s)[1] + 0.05); assert.equal(release(s), 'hot'); assert.deepEqual([s.workMax, s.spoils], [19.4, 2]);
  s = mk(4); centreHeat(s); assert.deepEqual([s.workMax, s.spoils, s.phase], [15.5, 0, 'shape']);
});

test('holding to the top burns the stock: forced let-go, too hot', () => {
  const s = mk(2); heatStart(s);
  for (let i = 0; i < 600 && s.phase === 'heat'; i++) stepCraft(s, 1 / 60);
  assert.deepEqual([s.phase, s.heat, s.spoils, s.temp], ['shape', 'hot', 2, 1]);
});

test('shaping: tools must go in order; a wrong tap spoils and makes the step unclean; the right tool then completes it', () => {
  const s = mk(5); centreHeat(s);
  const wrong = s.tiles.find((id) => id !== s.order[0]);
  assert.equal(shape(s, wrong), 'wrong'); assert.deepEqual([s.wrong, s.spoils, s.index], [1, 1, 0]);
  assert.equal(shape(s, s.order[0]), 'fixed'); assert.deepEqual([s.good, s.index], [0, 1]);
  assert.equal(shape(s, s.order[1]), 'good'); assert.deepEqual([s.good, s.index], [1, 2]);
  assert.equal(shape(s, 'nope'), 'wrong');
  assert.equal(shape(mk(5), s.order[0]), null, 'no shaping before the heat');
});

test('a perfect player makes a 3-star part at every tier and seed with no spoils, and the bank settles', () => {
  for (const tier of [-2, -1, 0, 1, 2]) for (let seed = 1; seed <= 40; seed++) {
    const s = mk(seed, { tier }); assert.equal(centreHeat(s), 'ok'); doOrder(s);
    assert.equal(s.result.success, true, `tier ${tier} seed ${seed}`);
    assert.deepEqual([s.result.good, s.result.spoils, s.result.stars, s.result.quality, s.result.how], [s.strikes, 0, 3, 100, 'made']);
  }
});

test('a player who taps every wrong tool first: made but sloppy or ruined, and materials spoil; never a 3-star', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = mk(seed, {}, { materials: 10, build: 30 }); centreHeat(s);
    for (const id of s.order) { shape(s, s.tiles.find((t) => t !== id)); shape(s, id); }
    assert.equal(s.result.good, 0); assert.equal(s.result.success, false); assert.equal(s.result.how, 'sloppy');
    assert.equal(s.result.spoils, 5); assert.equal(s.result.xp, 0);
  }
});

test('a player who dithers lets the stock cool: ruined, went cold, no XP', () => {
  const s = mk(6); centreHeat(s);
  for (let i = 0; i < 60 * 20; i++) stepCraft(s, 1 / 60);
  assert.deepEqual([s.done, s.result.success, s.result.how, s.result.xp, s.result.quality], [true, false, 'cooled', 0, 0]);
});

test('too cold really is harder: half the time still lets a quick player finish, a slow one is ruined', () => {
  let s = mk(7); heatTo(s, bandOf(s)[0] - 0.05); release(s); doOrder(s); assert.equal(s.result.success, true);
  s = mk(7); heatTo(s, bandOf(s)[0] - 0.05); release(s); for (let i = 0; i < 60 * 9; i++) stepCraft(s, 1 / 60); assert.equal(s.result.how, 'cooled');
});

test('too hot costs material: two spoils on a clean craft', () => {
  const s = mk(8, {}, { materials: 10, build: 30 }); heatTo(s, bandOf(s)[1] + 0.05); release(s); doOrder(s);
  assert.equal(s.result.success, true); assert.equal(s.spoils, 2);
  assert.equal(s.result.materials, 12); // 10 x (1 + 0.1 x 2)
});

test('quality, stars and XP', () => {
  assert.equal(qualityOf({ good: 3, strikes: 5 }), 64);
  assert.equal(qualityOf({ good: 3, strikes: 5, qualityBonus: 12 }), 76);
  assert.equal(qualityOf({ good: 5, strikes: 5, qualityBonus: 36 }), 100);
  assert.deepEqual([100, 90, 89, 65, 64].map(starsOf), [3, 3, 2, 2, 1]);
  assert.deepEqual([1, 2, 3].map((n) => craftXp({ success: true, stars: n })), [4, 5, 6]);
  assert.equal(craftXp({ success: false, stars: 0 }), 0);
});

test('material points: every point saves real scrap, because the fraction is carried between crafts', () => {
  const run = (factor, n = 100, recipe = { materials: 4 }) => { let bank = 0, used = 0; for (let i = 0; i < n; i++) { const r = settleMaterials({ recipe, factor, bank }); used += r.used; bank = r.bank; } return used; };
  assert.equal(run(1), 400);
  const saved = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => 400 - run(1 - 0.04 * p));
  assert.deepEqual(saved, [16, 32, 48, 64, 80, 96, 112, 128, 144]); // 4% of 400 scrap per point, every point visible, none rounded away
});

test('material bank: exact cost, ceil, carried remainder, never under 1, spoils add 10% each, a ruined part eats the recipe', () => {
  let r = settleMaterials({ recipe: { materials: 4 }, factor: 0.96, bank: 0 });
  assert.deepEqual([r.used, r.exact, r.bank, r.saved], [4, 3.84, 0.16, 0]);
  r = settleMaterials({ recipe: { materials: 4 }, factor: 0.96, bank: 0.16 });
  assert.deepEqual([r.used, r.bank], [4, 0.32]); // 3.84 - 0.16 = 3.68 -> 4, bank 0.32
  r = settleMaterials({ recipe: { materials: 4 }, factor: 0.96, bank: 0.8 });
  assert.deepEqual([r.used, Math.round(r.bank * 100) / 100], [4, 0.96]); // 3.84 - 0.8 = 3.04 -> 4; the credit grows to 0.96
  r = settleMaterials({ recipe: { materials: 4 }, factor: 0.96, bank: 0.96 });
  assert.deepEqual([r.used, r.saved, Math.round(r.bank * 100) / 100], [3, 1, 0.12]); // 3.84 - 0.96 = 2.88 -> 3: one scrap saved
  assert.equal(settleMaterials({ recipe: { materials: 1 }, factor: 0.64, bank: 5 }).used, 1);
  assert.equal(settleMaterials({ recipe: { materials: 10 }, factor: 1, spoils: 3 }).used, 13);
  assert.equal(settleMaterials({ recipe: { materials: 10 }, factor: 1, spoils: 3, ruined: true }).used, 10);
});

test('picker words match the game: speed and material', () => {
  assert.equal(CATEGORIES.crafting.cats[1].words(3), `builds 15% faster; Cut feed +15%, Screw thread +15% a turn; the older heat game ${setupCraft({ points: { speed: 3 } }).strikes} shaping steps`);
  assert.match(CATEGORIES.crafting.cats[2].words(5), /^20% less scrap, the fraction saved/);
});
