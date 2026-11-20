// The crafting chain's first two games, Cut and Screw, the shared grade/redo/spoil rules and the two-game recipe runner
// (v2/PLAN.md section 4.5): exact tables for tier and points 0..9, a perfect bot passes at every tier, lazy bots score under 70,
// a slow-handed bot slopes up with points and roll (no cliff), the three cutters give three grades for one hand path, and a
// failed step costs exactly the spoil. Pure: no DOM. (The browser test plays them on screen, by mouse and by touch.)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../projects/Space-Shooter/voyage/minigames/cut.js';
import * as W from '../projects/Space-Shooter/voyage/minigames/screw.js';
import * as G from '../projects/Space-Shooter/voyage/minigames/craftChain.js';
import { setupCut, setupScrew, CUT_TOOLS, tierOf } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { settleMaterials } from '../projects/Space-Shooter/voyage/minigames/craft.js';
import { rollPreview, CHAIN_SPECS, SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { startStation, settleStation, stationById } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';
import * as MODS from '../projects/Space-Shooter/voyage/modules/registry.js';
const modulesReady = MODS.ready;
await modulesReady(); // every game is a module: load the registry once

const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
const TIERS = [-2, -1, 0, 1, 2];
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const mean = (f, n = 24) => { let a = 0; for (let i = 1; i <= n; i++) a += f(i); return a / n; };

// ---- bots -----------------------------------------------------------------------------------------------------------------
/** A hand that walks the outline from the start mark. speed and offset (a perpendicular wobble) are functions of time. */
function trace(s, { speed = () => 250, offset = () => 0, dt = 1 / 120, lap = 1.02 } = {}) {
  let arc = 0, t = 0;
  const p0 = C.pointAt(s, 0); C.cutDown(s, p0.x, p0.y, t);
  while (arc < s.perimeter * lap && !s.done) {
    arc += speed(t) * dt; t += dt;
    const p = C.pointAt(s, arc), q = C.pointAt(s, arc + 1), o = C.pointAt(s, arc - 1);
    let tx = q.x - o.x, ty = q.y - o.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    const d = offset(t, arc);
    C.cutMove(s, p.x - ty * d, p.y + tx * d, t);
  }
  return C.cutFinish(s, 'done');
}
const perfectCut = (setup, seed) => trace(C.createCut({ seed, setup }), { speed: () => Math.min(250, setup.feed * 0.8) });
/** Slow hands: a speed that drifts about a mean, and a correlated wander off the line. */
function slowHand(setup, seed, { speed = 280, amp = 0.25, sd = 3 } = {}) {
  const r = lcg(seed * 7 + 3); let off = 0; const ph = r() * 6;
  return trace(C.createCut({ seed, setup }), { speed: (t) => speed * (1 + amp * Math.sin(t * 3 + ph)), offset: () => { off = off * 0.9 + sd * gauss(r) * 0.44; return off; } }).grade;
}

/** A finger circling the bolt head: radius wander `rSd`, then lets go when it believes the torque is in the green. */
function circle(setup, seed, { rSd = 0, stopSd = 0, dTh = 0.1, stop = true, maxEvents = 6000, backOut = true } = {}) {
  const s = W.createScrew({ setup }), r = lcg(seed * 13 + 5);
  let th = 0, dev = 0;
  const at = (rad, a) => [s.cx + rad * Math.cos(a), s.cy + rad * Math.sin(a)];
  W.screwDown(s, ...at(75, th));
  for (let i = 0; i < maxEvents && !s.done; i++) {
    th += dTh; dev = dev * 0.85 + gauss(r) * rSd * 0.5;
    W.screwMove(s, ...at(75 + dev, th));
    if (s.status === 'stripped' && backOut) for (let k = 0; k < 3000 && s.status === 'stripped' && !s.done; k++) { th -= dTh; W.screwMove(s, ...at(75, th)); }
    if (stop && s.status === 'turning' && s.turns + gauss(r) * stopSd >= s.T - s.zone / 2) { W.screwUp(s); if (!s.done) W.screwDown(s, ...at(75, th)); }
  }
  return s;
}

// ---- setup tables ---------------------------------------------------------------------------------------------------------
test('Cut setup: line by cutter and roll, feed by Speed points, guide at Good and Smooth, exact tables', () => {
  for (const tool of Object.keys(CUT_TOOLS)) for (const t of TIERS) {
    const u = setupCut({ tier: t, tool, level: 9 });
    assert.equal(u.width, r4(CUT_TOOLS[tool] * (1 + 0.1 * t)), `${tool} tier ${t}`);
    assert.equal(u.guide, t >= 1);
    assert.equal(u.corners, 6);
  }
  assert.deepEqual(Object.values(CUT_TOOLS), [9, 12, 15]);
  assert.equal(setupCut({}).width, 12, 'the shop cutter at a Steady roll is the base 12');
  for (let p = 0; p <= 9; p++) {
    const u = setupCut({ tier: 0, points: { speed: p }, level: 9 });
    assert.equal(u.feed, r4(300 * (1 + 0.05 * p)));
    assert.equal(setupCut({ tier: 0, points: { quality: p }, level: 9 }).qualityBonus, 4 * p);
    assert.equal(setupCut({ tier: 0, points: { material: p }, level: 9 }).materialFactor, r4(1 - 0.04 * p));
    assert.equal(u.buildFactor, r4(1 - 0.05 * p));
  }
  assert.equal(setupCut({ points: { speed: 9 }, level: 9 }).feed, 435, 'nine points: 300 up to 435');
  assert.equal(setupCut({ points: { speed: 9 }, level: 3 }).feed, 300 * 1.15, 'points never pass the level');
});

test('Screw setup: turns by roll and Speed points, snug zone by roll, exact tables', () => {
  for (const t of TIERS) for (let p = 0; p <= 9; p++) {
    const u = setupScrew({ tier: t, points: { speed: p }, level: 9 });
    assert.equal(u.turns, r4((4 - 0.5 * t) / (1 + 0.05 * p)), `tier ${t} points ${p}`);
    assert.equal(u.zone, r4(0.15 + 0.025 * t));
  }
  assert.equal(setupScrew({ tier: 2 }).turns, 3, 'Smooth: 3 turns');
  assert.equal(setupScrew({ tier: -2 }).turns, 5, 'Rough: 5 turns');
  assert.equal(setupScrew({ tier: 0, points: { speed: 9 }, level: 9 }).turns, r4(4 / 1.45), 'nine points: 4 turns down to 2.76');
  assert.equal(r4(4 / 1.45), 2.7586);
  assert.equal(setupScrew({ tier: 0, level: 9 }).zone, 0.15);
  assert.equal(setupScrew({ tier: 0, points: { quality: 5 }, level: 9 }).qualityBonus, 20);
});

test('tierOf still maps the d20 the way every game does', () => {
  assert.deepEqual([tierOf({ total: 25, dc: 10 }), tierOf({ total: 17, dc: 10 }), tierOf({ total: 11, dc: 10 }), tierOf({ total: 7, dc: 10 }), tierOf({ total: 2, dc: 10 })], [2, 1, 0, -1, -2]);
});

// ---- shared grade, redo and spoil rules ----------------------------------------------------------------------------------------
test('grade words, quality, stars and XP follow the plan', () => {
  assert.deepEqual([0, 69.9, 70, 84.9, 85, 94.9, 95, 100].map(G.gradeWord), ['too rough', 'too rough', 'passes', 'passes', 'clean', 'clean', 'perfect', 'perfect']);
  assert.equal(G.itemQuality([90, 80], 0), 85);
  assert.equal(G.itemQuality([90, 80], 8), 93);
  assert.equal(G.itemQuality([98, 99], 36), 100, '100 at most');
  assert.equal(G.itemQuality([], 4), 0);
  assert.deepEqual([64, 65, 89, 90].map(G.starsOf), [1, 2, 2, 3]);
  assert.equal(G.chainXp({ ruined: true, passed: 1, stars: 0 }), 0);
  assert.equal(G.chainXp({ ruined: false, passed: 1, stars: 1 }), 3);
  assert.equal(G.chainXp({ ruined: false, passed: 2, stars: 3 }), 2 + 2 + 2);
  assert.equal(G.chainXp({ ruined: false, passed: 9, stars: 3 }), 10, 'the engine cap');
});

test('a recipe: passes in order, a failed game spoils and is redone, the third fail ruins it', () => {
  let s = G.createRecipe({ recipe: G.RECIPES['bolt-plate'], tier: 0, points: {}, level: 1 });
  assert.equal(G.current(s).kind, 'cut');
  assert.equal(G.submit(s, 92), 'passed'); assert.equal(G.current(s).kind, 'screw'); assert.equal(s.spoils, 0);
  assert.equal(G.submit(s, 40), 'redo'); assert.equal(s.spoils, 1); assert.equal(G.current(s).redosLeft, 1);
  const seedA = G.current(s).seed; assert.equal(G.submit(s, 69.9), 'redo'); assert.notEqual(G.current(s).seed, seedA, 'a fresh sheet every redo');
  assert.equal(G.current(s).redosLeft, 0);
  assert.equal(G.submit(s, 10), 'ruined'); assert.equal(s.done, true); assert.equal(s.result.ruined, true);
  assert.equal(s.result.xp, 0); assert.equal(s.result.stars, 0); assert.equal(s.result.quality, 0);
  assert.equal(G.current(s), null);
  // a pass after a redo
  s = G.createRecipe({ recipe: G.RECIPES.cut, tier: 0 });
  assert.equal(G.submit(s, 50), 'redo'); assert.equal(G.submit(s, 70), 'passed');
  assert.equal(s.result.success, true); assert.equal(s.result.grades[0].attempts, 2); assert.equal(s.result.spoils, 1);
});

test('the chain costs exactly the spoil: one failed step is +10% material, nothing else', () => {
  const make = (fails, points = {}) => {
    const s = G.createRecipe({ recipe: G.RECIPES['bolt-plate'], tier: 0, points, level: 9, bank: 0 });
    G.submit(s, 90); for (let i = 0; i < fails; i++) G.submit(s, 30); G.submit(s, 90); return s.result;
  };
  const clean = make(0), one = make(1), two = make(2);
  assert.equal(clean.materialsExact, 4); assert.equal(clean.materials, 4); assert.equal(clean.spoils, 0);
  assert.equal(one.materialsExact, 4.4); assert.equal(one.materials, 5); assert.equal(one.spoils, 1);
  assert.equal(two.materialsExact, 4.8); assert.equal(two.spoils, 2);
  assert.equal(clean.quality, one.quality, 'a redo does not change the grades kept');
  assert.equal(clean.xp, one.xp);
  const p = make(1, { material: 5 });
  assert.equal(p.materialsExact, r4(4 * 0.8 * 1.1), 'Material points apply to the plain recipe, then the spoil');
  const ruined = (() => { const s = G.createRecipe({ recipe: G.RECIPES.cut, tier: 0 }); G.submit(s, 1); G.submit(s, 1); G.submit(s, 1); return s.result; })();
  assert.equal(ruined.materialsExact, 3, 'a ruined craft eats the recipe, not the spoil extra (the built rule)');
});

test('quality: the average of the grades plus 4 a Quality point, stars at 65 and 90', () => {
  const run = (grades, qp) => { const s = G.createRecipe({ recipe: G.RECIPES['bolt-plate'], tier: 0, points: { quality: qp }, level: 9 }); grades.forEach((g) => G.submit(s, g)); return s.result; };
  assert.equal(run([80, 70], 0).quality, 75); assert.equal(run([80, 70], 0).stars, 2);
  assert.equal(run([80, 70], 4).quality, 91); assert.equal(run([80, 70], 4).stars, 3);
  assert.equal(run([70, 70], 0).stars, 2); assert.equal(run([70, 70], 0).quality, 70);
  const low = G.createRecipe({ recipe: G.RECIPES.cut, tier: 0 }); G.submit(low, 70); assert.equal(low.result.quality, 70);
  for (let q = 0; q <= 9; q++) assert.equal(run([80, 80], q).quality, Math.min(100, 80 + 4 * q), `Quality ${q}`);
});

test('100 crafts: the Material points save their share of scrap (the bank carries the fraction)', () => {
  for (const m of [0, 3, 9]) {
    let bank = 0, used = 0;
    for (let i = 0; i < 100; i++) { const s = G.createRecipe({ recipe: G.RECIPES['bolt-plate'], tier: 0, points: { material: m }, level: 9, bank }); G.submit(s, 90); G.submit(s, 90); used += s.result.materials; bank = s.result.bank; }
    const exact = 100 * 4 * r4(1 - 0.04 * m);
    assert.ok(Math.abs(used - exact) <= 1, `Material ${m}: used ${used}, exact ${exact}`);
  }
  assert.deepEqual(settleMaterials({ recipe: { materials: 4 }, spoils: 0, factor: 1, bank: 0 }).used, 4);
});

test('a recipe is plain JSON: it can be saved between games and picked up', () => {
  const s = G.createRecipe({ recipe: G.RECIPES['bolt-plate'], tier: 1, points: { speed: 2 }, level: 3 });
  G.submit(s, 88);
  const back = JSON.parse(JSON.stringify(s));
  assert.deepEqual(G.current(back), G.current(s));
  assert.equal(G.partLine(back), 'Bolt plate: Cut 88, next Screw.');
  G.submit(back, 91); assert.equal(back.done, true); assert.equal(back.result.grades.length, 2);
});

// ---- Cut ---------------------------------------------------------------------------------------------------------------------
test('Cut: the outline has 6 corners, is seeded, and fits the 1000 x 680 board', () => {
  const a = C.outlineOf(5), b = C.outlineOf(5), c = C.outlineOf(6);
  assert.equal(a.length, 6); assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  for (let seed = 1; seed <= 200; seed++) for (const p of C.outlineOf(seed)) assert.ok(p.x > 60 && p.x < 940 && p.y > 40 && p.y < 640, `seed ${seed} ${p.x},${p.y}`);
});

test('Cut: a perfect hand passes at every roll with every cutter (and is clean to perfect with the shop cutter)', () => {
  for (const tool of Object.keys(CUT_TOOLS)) for (const t of TIERS) for (let seed = 1; seed <= 6; seed++) {
    const r = perfectCut(setupCut({ tier: t, tool, level: 9 }), seed);
    assert.ok(r.success && r.grade >= 95, `${tool} tier ${t} seed ${seed}: ${r.grade}`);
  }
});

test('Cut: lazy hands score under 70 (a straight line, a scribble, standing still, rushing, never starting)', () => {
  const setup = setupCut({ tier: 2, tool: 'good', level: 9, points: { speed: 9 } });
  const straight = C.createCut({ seed: 3, setup }); C.cutDown(straight, straight.start.x, straight.start.y, 0);
  for (let i = 1; i <= 100; i++) C.cutMove(straight, straight.start.x + i * 6, straight.start.y, i / 100);
  assert.ok(C.cutFinish(straight).grade < 70, `straight line ${straight.result.grade}`);
  const scribble = C.createCut({ seed: 3, setup }); C.cutDown(scribble, scribble.start.x, scribble.start.y, 0);
  const r = lcg(9); for (let i = 1; i <= 400; i++) C.cutMove(scribble, 40 + r() * 920, 40 + r() * 600, i / 100);
  assert.ok(C.cutFinish(scribble).grade < 30, `scribble ${scribble.result.grade}`);
  const rush = trace(C.createCut({ seed: 3, setup }), { speed: () => 900 }); // all torn
  assert.ok(rush.grade < 20 && rush.torn > 0, `rushed ${rush.grade}`);
  const still = C.createCut({ seed: 3, setup }); C.cutDown(still, still.start.x, still.start.y, 0); for (let i = 1; i < 50; i++) C.cutMove(still, still.start.x, still.start.y, i / 10);
  assert.equal(C.cutFinish(still).grade, 0);
  const never = C.createCut({ seed: 3, setup }); assert.equal(C.cutFinish(never).grade, 0);
});

test('Cut: the worn, shop and good cutter give three different grades for the same hand path', () => {
  const grades = Object.keys(CUT_TOOLS).map((tool) => mean((i) => trace(C.createCut({ seed: i, setup: setupCut({ tier: 0, tool }) }), { offset: (t) => 8 * Math.sin(t * 9) }).grade, 12));
  assert.ok(grades[0] + 8 < grades[1] && grades[1] + 8 < grades[2], `worn ${grades[0]} shop ${grades[1]} good ${grades[2]}`);
  assert.ok(grades[2] < 95 && grades[0] > 5);
  // and exactly: the same offset is inside one half-width and outside another
  const one = (tool, off) => { const s = C.createCut({ seed: 2, setup: setupCut({ tool }) }); return trace(s, { offset: () => off }).grade; };
  assert.ok(one('worn', 5) < 10 && one('shop', 5) > 90, 'a 5 unit offset: outside the worn 4.5, inside the shop 6');
  assert.ok(one('shop', 7) < 10 && one('good', 7) > 90, 'a 7 unit offset: outside the shop 6, inside the good 7.5');
});

test('Cut: feed speed over the limit tears, under it cuts; Speed points raise the limit', () => {
  const at = (v, pts) => trace(C.createCut({ seed: 2, setup: setupCut({ points: { speed: pts }, level: 9 }) }), { speed: () => v });
  assert.ok(at(290, 0).grade > 95, 'just under 300');
  assert.ok(at(330, 0).grade < 10 && at(330, 0).torn > 100, 'over 300 tears every sample');
  assert.ok(at(328, 2).grade > 95 && at(335, 2).grade < 10, 'two Speed points: limit 330');
  assert.ok(at(430, 9).grade > 95 && at(445, 9).grade < 10, '435 with nine points');
});

test('Cut: gouges cost 5 each, lifting and resuming works only near where you stopped', () => {
  const s = C.createCut({ seed: 4, setup: setupCut({}) });
  assert.equal(C.cutDown(s, s.start.x + 40, s.start.y, 0), false, 'must press on the start mark');
  assert.equal(C.cutDown(s, s.start.x + 10, s.start.y, 0), true);
  // trace a quarter, lift, press far away (refused), press near (taken)
  let arc = 0, t = 0;
  while (arc < s.perimeter * 0.25) { arc += 2; t += 0.01; const p = C.pointAt(s, arc); C.cutMove(s, p.x, p.y, t); }
  const stop = { x: s.last.x, y: s.last.y }; C.cutUp(s);
  assert.equal(C.cutDown(s, stop.x + 200, stop.y, t), false); assert.equal(C.cutDown(s, stop.x + 12, stop.y, t + 1), true);
  const before = C.gradeOf(s);
  // go three line-widths off and back: one gouge
  const g0 = s.gouges; for (let i = 1; i <= 40; i++) { t += 0.01; C.cutMove(s, stop.x + i * 3, stop.y + i * 3, t); }
  assert.equal(s.gouges, g0 + 1, 'one gouge per excursion, not per sample');
  assert.ok(C.gradeOf(s) <= before - 5 + 1e-9);
  // after a gouge is closed by returning, a second excursion is a second gouge
  for (let i = 40; i >= 0; i--) { t += 0.01; C.cutMove(s, stop.x + i * 3, stop.y + i * 3, t); }
  for (let i = 1; i <= 40; i++) { t += 0.01; C.cutMove(s, stop.x - i * 3, stop.y - i * 3, t); }
  assert.equal(s.gouges, g0 + 2);
  // a straight cut of the whole outline with the odd gouge keeps grade = share - 5 per gouge
  const r = C.cutFinish(s); assert.equal(r.gouges, g0 + 2);
});

test('Cut: the loop closing ends the cut by itself (the part drops free), the Done button ends it early', () => {
  const closed = trace(C.createCut({ seed: 8, setup: setupCut({}) }), { speed: () => 250, lap: 1.5 });
  assert.equal(closed.how, 'closed'); assert.ok(closed.success);
  const early = C.createCut({ seed: 8, setup: setupCut({}) }); C.cutDown(early, early.start.x, early.start.y, 0);
  assert.equal(C.cutFinish(early).how, 'done'); assert.equal(early.done, true);
  assert.equal(C.cutMove(early, 1, 1, 1), early, 'nothing moves once it is over');
});

test('Cut: a slow-handed bot does better with Speed points and with a better roll, as a slope and not a cliff', () => {
  const g = (tier, speedPts) => mean((i) => slowHand(setupCut({ tier, points: { speed: speedPts }, level: 9 }), i, { speed: 300, amp: 0.25, sd: 3 }));
  const byPoints = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => g(0, p));
  for (let i = 1; i < byPoints.length; i++) { assert.ok(byPoints[i] >= byPoints[i - 1] - 1.5, `points ${i}: ${byPoints[i]} vs ${byPoints[i - 1]}`); assert.ok(byPoints[i] - byPoints[i - 1] < 20, `no cliff at point ${i}: ${byPoints[i] - byPoints[i - 1]}`); }
  assert.ok(byPoints[9] > byPoints[0] + 15, `nine points beat none: ${byPoints[9]} vs ${byPoints[0]}`);
  const byTier = TIERS.map((t) => g(t, 4));
  for (let i = 1; i < byTier.length; i++) { assert.ok(byTier[i] >= byTier[i - 1] - 1.5, `tier ${TIERS[i]}: ${byTier[i]} vs ${byTier[i - 1]}`); assert.ok(byTier[i] - byTier[i - 1] < 20, 'no cliff in the roll'); }
  assert.ok(byTier[4] > byTier[0] + 1, `a Smooth roll beats a Rough one: ${byTier[4]} vs ${byTier[0]}`);
});

// ---- Screw -------------------------------------------------------------------------------------------------------------------
test('Screw: a perfect hand (circles, stops in the green) passes at every roll and every Speed point', () => {
  for (const t of TIERS) for (const p of [0, 4, 9]) {
    const s = circle(setupScrew({ tier: t, points: { speed: p }, level: 9 }), 1);
    assert.ok(s.result.success && s.result.grade === 100 && s.result.how === 'snug', `tier ${t} points ${p}: ${JSON.stringify(s.result)}`);
    assert.ok(s.result.turns >= s.T - s.zone - 1e-6 && s.result.turns <= s.T + 1e-6, 'it stopped inside the green');
  }
});

test('Screw: clockwise tightens, counter-clockwise loosens, never below zero', () => {
  const s = W.createScrew({ setup: setupScrew({}) });
  const at = (a, r = 75) => [s.cx + r * Math.cos(a), s.cy + r * Math.sin(a)];
  W.screwDown(s, ...at(0));
  for (let a = 0.1; a <= Math.PI * 2 + 1e-9; a += 0.1) W.screwMove(s, ...at(a));
  assert.ok(Math.abs(s.turns - 1) < 0.02, `one turn: ${s.turns}`);
  for (let a = Math.PI * 2; a >= -1e-9; a -= 0.1) W.screwMove(s, ...at(a));
  assert.ok(s.turns < 0.02);
  for (let a = 0; a > -3; a -= 0.1) W.screwMove(s, ...at(a));
  assert.equal(s.turns, 0, 'loosening stops at zero');
});

test('Screw: leaving the ring slips (no progress, a quarter turn lost, -5), and the ring is 40 to 110 units out', () => {
  const s = W.createScrew({ setup: setupScrew({}) });
  const at = (a, r) => [s.cx + r * Math.cos(a), s.cy + r * Math.sin(a)];
  W.screwDown(s, ...at(0, 75));
  for (let a = 0.1; a <= Math.PI * 2 * 1.5; a += 0.1) W.screwMove(s, ...at(a, 75));
  const turns = s.turns;
  W.screwMove(s, ...at(4.8, 111)); assert.equal(s.slips, 1); assert.ok(Math.abs(s.turns - (turns - 0.25)) < 1e-9);
  const t2 = s.turns; for (let a = 4.9; a < 7; a += 0.1) W.screwMove(s, ...at(a, 140)); assert.equal(s.turns, t2, 'turning outside the ring does nothing'); assert.equal(s.slips, 1, 'one slip per exit');
  W.screwMove(s, ...at(7, 39)); // re-enter from outside, then fall inside the head
  for (let a = 7.1; a < 8; a += 0.1) W.screwMove(s, ...at(a, 75));
  W.screwMove(s, ...at(8.1, 39)); assert.equal(s.slips, 2, 'the head side of the ring slips too');
  assert.equal(W.gradeOf(s), 90);
  const g = W.createScrew({ setup: setupScrew({}) }); W.screwDown(g, g.cx + 200, g.cy); assert.equal(g.engaged, false); W.screwMove(g, g.cx + 200, g.cy + 20); assert.equal(g.slips, 0, 'pressing outside never gripped: no slip');
});

test('Screw: a slip at turn zero loses nothing below zero; seven slips end the game (the grade cannot reach 70)', () => {
  const s = W.createScrew({ setup: setupScrew({}) });
  for (let i = 0; i < 7 && !s.done; i++) { W.screwDown(s, s.cx + 75, s.cy); W.screwMove(s, s.cx + 200, s.cy); W.screwUp(s); }
  assert.equal(s.turns, 0); assert.equal(s.slips, 7); assert.equal(s.done, true); assert.equal(s.result.grade, 65); assert.equal(s.result.success, false);
});

test('Screw: letting go short of the green is loose, in the green is snug, a little over is over-tight (-5), far over strips (-15)', () => {
  const play = (stopTurns, { more = false } = {}) => {
    const setup = setupScrew({ tier: 0 }); const s = W.createScrew({ setup }); let th = 0;
    W.screwDown(s, s.cx + 75, s.cy);
    while (s.turns < stopTurns && !s.done && s.status === 'turning') { th += 0.05; W.screwMove(s, s.cx + 75 * Math.cos(th), s.cy + 75 * Math.sin(th)); }
    if (more) return s;
    W.screwUp(s); return s;
  };
  const T = 4, z = 0.15;
  let s = play(T - 1 - 0.5); assert.equal(s.done, false, 'before the last turn a lift is a rest'); assert.equal(s.loose, false);
  s = play(T - z - 0.1); assert.equal(s.done, false); assert.equal(s.loose, true, 'short of the green: loose, not done');
  s = play(T - z + 0.02); assert.equal(s.done, true); assert.equal(s.result.grade, 100); assert.equal(s.result.how, 'snug');
  s = play(T + 0.1); assert.equal(s.done, true); assert.equal(s.result.over, 1); assert.equal(s.result.grade, 95, 'over-tight but holds');
  s = play(T + 0.2, { more: true }); assert.equal(s.status, 'turning');
  s = play(T + 0.4, { more: true }); assert.equal(s.status, 'stripped'); assert.equal(s.stripped, 1); assert.equal(W.gradeOf(s), 85);
});

test('Screw: a stripped head is backed out the other way, then a fresh bolt; three strips end it under 70', () => {
  const s = W.createScrew({ setup: setupScrew({}) }); let th = 0;
  const at = (a) => [s.cx + 75 * Math.cos(a), s.cy + 75 * Math.sin(a)];
  W.screwDown(s, ...at(0));
  while (s.status === 'turning') { th += 0.05; W.screwMove(s, ...at(th)); }
  assert.equal(s.status, 'stripped');
  const t0 = s.turns; for (let i = 0; i < 20; i++) { th += 0.05; W.screwMove(s, ...at(th)); } assert.equal(s.turns, t0, 'forward does nothing on a stripped head');
  while (s.status === 'stripped') { th -= 0.05; W.screwMove(s, ...at(th)); }
  assert.equal(s.turns, 0); assert.equal(s.status, 'turning'); assert.equal(s.stripped, 1);
  for (let k = 0; k < 2; k++) { while (s.status === 'turning' && !s.done) { th += 0.05; W.screwMove(s, ...at(th)); } while (s.status === 'stripped' && !s.done) { th -= 0.05; W.screwMove(s, ...at(th)); } }
  assert.equal(s.done, true); assert.equal(s.result.stripped, 3); assert.equal(s.result.grade, 55); assert.equal(s.result.success, false);
});

test('Screw: lazy hands never pass (circle forever, never stop; stop at once; a jittery hand; give up)', () => {
  const setup = setupScrew({ tier: 2, points: { speed: 9 }, level: 9 });
  const forever = circle(setup, 1, { stop: false, backOut: false, maxEvents: 4000 });
  assert.equal(forever.done, false, 'never stopping and never backing out never finishes');
  assert.equal(forever.status, 'stripped'); assert.equal(W.screwGiveUp(forever).grade, 0);
  const stopNow = W.createScrew({ setup }); W.screwDown(stopNow, stopNow.cx + 75, stopNow.cy); W.screwUp(stopNow); assert.equal(stopNow.done, false, 'a lift before the last turn is only a rest');
  const jitter = circle(setup, 4, { rSd: 70, stopSd: 0.3 });
  if (jitter.result) assert.ok(jitter.result.grade < 70, `jittery ${jitter.result.grade}`); else assert.equal(jitter.done, false);
  const lost = circle(setup, 2, { backOut: true, stop: false, maxEvents: 40000 });
  assert.ok(lost.done && lost.result.grade < 70 && lost.result.stripped === 3, 'stripping every bolt ends it under 70');
});

test('Screw: a slow-handed bot does better with Speed points and with a better roll, as a slope and not a cliff', () => {
  const g = (tier, p) => mean((i) => circle(setupScrew({ tier, points: { speed: p }, level: 9 }), i, { rSd: 18, stopSd: 0.15 }).result.grade, 40);
  const byPoints = [0, 3, 6, 9].map((p) => g(0, p));
  for (let i = 1; i < byPoints.length; i++) { assert.ok(byPoints[i] >= byPoints[i - 1] - 1, `points: ${byPoints}`); assert.ok(byPoints[i] - byPoints[i - 1] < 20, 'no cliff'); }
  assert.ok(byPoints[3] > byPoints[0] + 2, `nine points beat none: ${byPoints}`);
  const byTier = TIERS.map((t) => g(t, 3));
  for (let i = 1; i < byTier.length; i++) { assert.ok(byTier[i] >= byTier[i - 1] - 1, `tier: ${byTier}`); assert.ok(byTier[i] - byTier[i - 1] < 20, 'no cliff in the roll'); }
  assert.ok(byTier[4] > byTier[0] + 3, `Smooth beats Rough: ${byTier}`);
});

// ---- words, preview, station ---------------------------------------------------------------------------------------------------
test('the point picker and the roll preview say what the setups do', () => {
  const sp = CATEGORIES.crafting.cats[1].words(3);
  assert.match(sp, /builds 15% faster; Cut feed \+15%, Screw thread \+15% a turn/);
  assert.equal(setupCut({ points: { speed: 3 }, level: 9 }).feed, 345);
  const smooth = rollPreview('cut', { total: 25, dc: 10 }, { level: 9 }), rough = rollPreview('cut', { total: 1, dc: 10 }, { level: 9 });
  assert.match(smooth.line, /cutting line 20% wider/); assert.match(smooth.line, /dotted guide/); assert.match(rough.line, /cutting line 20% narrower/);
  assert.match(rollPreview('screw', { total: 25, dc: 10 }, { level: 9 }).line, /1 fewer turns?|1 fewer turn/);
  assert.match(rollPreview('bolt-plate', { total: 25, dc: 10 }, { level: 9 }).line, /cutting line[\s\S]*turns[\s\S]*snug zone/);
});

test('the bench: Cut, Screw and the recipe start at the roll and the character\'s points, and settle XP', () => {
  const state = freshState();
  const base = stationById('craft');
  for (const id of ['cut', 'screw', 'bolt-plate']) {
    const st = { ...base, id, label: id };
    const start = startStation(state, st, { total: 15, dc: 10, natural: false }, { tool: 'good' });
    assert.equal(start.tier, 1);
    assert.equal(start.setup.tier, 1);
    if (id === 'cut') assert.equal(start.setup.tool, 'good');
    assert.match(start.preview.line, /Good roll/);
    const res = settleStation(state, st, { success: true, xp: 5 });
    assert.equal(res.xp, 5); assert.match(res.said, /you did it[\s\S]*\+5 Crafting XP/);
  }
});

test('the chain\'s previews change at every tier but Steady, and the other games keep their own list', () => {
  for (const g of [...Object.keys(CHAIN_SPECS), ...Object.keys(SPECS)]) assert.ok(MODS.has(g), `${g} is a registered module`);
  const at = (m) => ({ total: 10 + m, dc: 10 });
  for (const g of Object.keys(CHAIN_SPECS)) {
    for (const m of [12, 6, -3, -9]) assert.ok(rollPreview(g, at(m), { level: 3 }).phrases.length >= 1, `${g} margin ${m}`);
    assert.deepEqual(rollPreview(g, at(2), { level: 3 }).phrases, []);
  }
});
