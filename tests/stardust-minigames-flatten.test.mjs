// Flatten, the fourth game of the crafting chain (v2/PLAN.md section 4.3): every rule of the spec as an exact test (flat within the
// band, soft shrinks by what you gave, hard leaves a dimple, a lean past 35% lands beside the bubble, the grade, done when no
// bubbles are left), the roll and the Speed path as tables, the chain wiring, and a bot sweep (perfect, slow-handed and lazy hands
// at every roll). Pure: no DOM. FLATTEN_TABLE=1 node --test tests/stardust-minigames-flatten.test.mjs prints the pass-rate table.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../projects/Space-Shooter/voyage/minigames/flatten.js';
import * as G from '../projects/Space-Shooter/voyage/minigames/craftChain.js';
import { setupFlatten, FLATTEN_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { rollPreview, CHAIN_SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { startStation, settleStation, stationById } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
const TIERS = [-2, -1, 0, 1, 2];
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const game = (o = {}, seed = 1) => F.createFlatten({ seed, setup: setupFlatten({ level: 9, ...o }) });
/** One swing at the selected bubble: charge for `power` (0..100) of the charge time, steering `steer` the whole time, then let go. */
function swing(s, id, power, { steer = 0, t0 = 0 } = {}) {
  F.flattenSelect(s, id); F.flattenCharge(s, t0); F.flattenSteer(s, steer);
  return F.flattenRelease(s, t0 + (power / 100) * s.chargeTime);
}
/** A steer that cancels the drift at time tau exactly. */
const against = (s, tau) => -F.wander(s, tau) / F.STEER_GAIN;
/** A swing with a perfect hand on the lean: the steer follows the drift to the instant of release. */
function trueSwing(s, id, power, t0 = 0) {
  F.flattenSelect(s, id); F.flattenCharge(s, t0);
  const end = t0 + (power / 100) * s.chargeTime;
  F.flattenSteer(s, against(s, end - t0));
  return F.flattenRelease(s, end);
}

// ---- setup tables -----------------------------------------------------------------------------------------------------------
test('Flatten setup: bubbles, power band, lean drift by roll and the hammer charge time by Speed points, exact tables', () => {
  assert.deepEqual([FLATTEN_BASE.bubbles, FLATTEN_BASE.band, FLATTEN_BASE.charge], [5, 10, 1.2]);
  for (const t of TIERS) {
    const u = setupFlatten({ tier: t, level: 9 });
    assert.equal(u.band, r4(10 + 1.5 * t), `band at ${t}`); assert.equal(u.drift, r4(1 - 0.1 * t), `drift at ${t}`);
    assert.equal(u.bubbles, 5 - Math.trunc(t / 2), `bubbles at ${t}`);
  }
  assert.equal(setupFlatten({ tier: 2 }).bubbles, 4, '4 bubbles at Smooth'); assert.equal(setupFlatten({ tier: -2 }).bubbles, 6, '6 at Rough');
  assert.equal(setupFlatten({ tier: 2 }).band, 13); assert.equal(setupFlatten({ tier: -2 }).band, 7);
  for (let p = 0; p <= 9; p++) {
    const u = setupFlatten({ points: { speed: p }, level: 9 });
    assert.equal(u.charge, r4(1.2 / (1 + 0.05 * p)), `charge time at ${p} points`);
    assert.equal(setupFlatten({ points: { quality: p }, level: 9 }).qualityBonus, 4 * p);
    assert.equal(setupFlatten({ points: { material: p }, level: 9 }).materialFactor, r4(1 - 0.04 * p));
    assert.equal(u.buildFactor, r4(1 - 0.05 * p));
  }
  assert.equal(setupFlatten({ points: { speed: 9 }, level: 9 }).charge, 0.8276, 'nine points: 1.20 s down to 0.83 s');
  assert.equal(setupFlatten({ points: { speed: 9 }, level: 3 }).charge, r4(1.2 / 1.15), 'points never pass the level');
});

// ---- the model ------------------------------------------------------------------------------------------------------------------
test('determinism: the same seed gives the same sheet; needs are 30 to 80, bubbles are apart and inside the sheet', () => {
  assert.deepEqual(F.bubblesFor(7, 5), F.bubblesFor(7, 5)); assert.notDeepEqual(F.bubblesFor(7, 5), F.bubblesFor(8, 5));
  const needs = new Set();
  for (let seed = 1; seed <= 300; seed++) for (const n of [4, 5, 6]) {
    const list = F.bubblesFor(seed, n); assert.equal(list.length, n);
    for (const b of list) { assert.ok(b.need >= 30 && b.need <= 80 && Number.isInteger(b.need)); assert.ok(b.x >= 0.1 && b.x <= 0.9 && b.y >= 0.15 && b.y <= 0.85); needs.add(b.need); }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(list[i].x - list[j].x, (list[i].y - list[j].y) * 0.75) > 0.15, `bubbles ${i} and ${j} apart (seed ${seed})`);
  }
  assert.equal(Math.min(...needs), 30); assert.equal(Math.max(...needs), 80);
  const s = game({}, 5), u = game({}, 5);
  assert.deepEqual(s.bubbles, u.bubbles); assert.equal(F.wander(s, 0.4), F.wander(u, 0.4));
});

test('the charge runs 0 to 100 in 1.2 s (0.83 s at nine Speed points) and needs a bubble picked first', () => {
  const s = game(); assert.equal(F.flattenCharge(s, 0), false, 'no bubble picked: nothing charges');
  F.flattenSelect(s, 1); assert.equal(F.flattenCharge(s, 2), true);
  assert.equal(F.powerOf(s, 2), 0); assert.ok(Math.abs(F.powerOf(s, 2.6) - 50) < 1e-9); assert.equal(F.powerOf(s, 3.2), 100); assert.equal(F.powerOf(s, 9), 100, 'it stops at 100');
  assert.equal(F.flattenCharge(s, 2.5), false, 'already charging');
  F.flattenSelect(s, 2); assert.equal(s.selected, 1, 'the hammer does not move while charging');
  const f = game({ points: { speed: 9 } }); F.flattenSelect(f, 1); F.flattenCharge(f, 0);
  assert.ok(Math.abs(F.powerOf(f, 0.8276) - 100) < 0.01);
  const none = game(); assert.equal(F.flattenRelease(none, 1), null, 'no charge, nothing to let go of');
  F.flattenSelect(none, 99); assert.equal(none.selected, null, 'not a bubble');
});

test('within the band of the right power is flat: the bubble is gone (both edges count)', () => {
  const s = game({}, 3), b = s.bubbles[1], id = b.id, need = b.need;
  assert.equal(trueSwing(s, id, need - 10).outcome, 'flat');
  assert.ok(!F.bubbleOf(s, id)); assert.equal(s.bubbles.length, 4); assert.equal(s.dimples.length, 0); assert.equal(s.swings, 1);
  const u = game({}, 3), c = u.bubbles[2];
  assert.equal(trueSwing(u, c.id, c.need + 10).outcome, 'flat', 'the upper edge');
  assert.equal(trueSwing(game({}, 3), 1, game({}, 3).bubbles[0].need).outcome, 'flat', 'dead on');
  // the band follows the roll: 13 at Smooth, 7 at Rough
  const sm = game({ tier: 2 }, 3), r = sm.bubbles[0];
  assert.equal(trueSwing(sm, r.id, r.need + 13).outcome, 'flat'); const ro = game({ tier: -2 }, 3), q = ro.bubbles[0];
  assert.equal(trueSwing(ro, q.id, q.need + 8).outcome, 'hard'); assert.equal(trueSwing(game({ tier: -2 }, 3), 1, game({ tier: -2 }, 3).bubbles[0].need + 7).outcome, 'flat');
});

test('too soft: the bubble shrinks by what you gave and needs another hit (never under 20 to find), no dimple', () => {
  const s = game({}, 3), b = s.bubbles[1], need = b.need;
  const out = trueSwing(s, b.id, 25);
  assert.equal(out.outcome, 'soft'); assert.equal(F.bubbleOf(s, b.id).need, Math.max(20, need - 25), 'shrunk by the 25 given');
  assert.equal(s.dimples.length, 0); assert.equal(s.bubbles.length, 5); assert.equal(s.selected, b.id, 'the hammer stays over it');
  const t = game({}, 3), c = t.bubbles[1]; c.need = 60;
  trueSwing(t, c.id, 45); assert.equal(c.need, 20, '60 - 45 = 15 is raised to 20, a charge you can hit');
  const z = game({}, 3), d = z.bubbles[0], n0 = d.need; trueSwing(z, d.id, 0); assert.equal(d.need, n0, 'a tap gives nothing'); assert.equal(z.swings, 1);
  // then the second hit finishes it
  const u = game({}, 3), e = u.bubbles[1]; e.need = 70; trueSwing(u, e.id, 40); assert.equal(e.need, 30); assert.equal(trueSwing(u, e.id, 30, 5).outcome, 'flat');
});

test('too hard: a dimple that stays (-8), the bubble is gone', () => {
  const s = game({}, 3), b = s.bubbles[1];
  const out = trueSwing(s, b.id, b.need + 11);
  assert.equal(out.outcome, 'hard'); assert.ok(!F.bubbleOf(s, b.id)); assert.equal(s.dimples.length, 1); assert.deepEqual(s.dimples[0], { x: b.x, y: b.y });
  assert.equal(F.gradeOf(s), 92); assert.equal(s.bubbles.length, 4);
});

test('a lean past 35% when you let go lands beside the bubble: soft makes a small new bubble, hard a dimple (35% itself is fine)', () => {
  const at = 0.6; // power 50
  const setLean = (seed, lean, need) => { const g = game({}, seed); F.flattenSelect(g, 1); F.flattenCharge(g, 0); F.flattenSteer(g, (lean - F.wander(g, at)) / F.STEER_GAIN); assert.ok(Math.abs(F.leanOf(g, at) - lean) < 1e-9); g.bubbles[0].need = need; return g; };
  const sa = setLean(11, 0.36, 70), miss = F.flattenRelease(sa, at); // 50 against 70: soft
  assert.equal(miss.outcome, 'miss-soft'); assert.equal(sa.bubbles.length, 6, 'a new bubble'); assert.equal(sa.bubbles[5].need, 30, 'a small one'); assert.equal(sa.bubbles[0].need, 70, 'the old one untouched');
  assert.equal(sa.dimples.length, 0); assert.ok(sa.bubbles[5].x > sa.bubbles[0].x, 'a right lean lands to the right');
  const sh = setLean(11, -0.36, 40), miss2 = F.flattenRelease(sh, at); // 50 against 40: at least the right power: hard
  assert.equal(miss2.outcome, 'miss-hard'); assert.equal(sh.dimples.length, 1); assert.equal(sh.bubbles.length, 5, 'the bubble is still there'); assert.ok(sh.dimples[0].x < sh.bubbles[0].x, 'a left lean lands to the left');
  assert.equal(F.flattenRelease(setLean(11, 0.35, 50), at).outcome, 'flat', 'exactly 35% is not a miss');
  assert.equal(F.flattenRelease(setLean(11, -0.35, 50), at).outcome, 'flat');
});

test('the lean is the drift plus where the hand is: a hand against it cancels it, and the roll scales the drift', () => {
  const s = game({}, 4); F.flattenSelect(s, 1); F.flattenCharge(s, 10);
  for (const tau of [0.1, 0.4, 0.9]) { F.flattenSteer(s, 0); assert.ok(Math.abs(F.leanOf(s, 10 + tau) - F.wander(s, tau)) < 1e-9); F.flattenSteer(s, against(s, tau)); assert.ok(Math.abs(F.leanOf(s, 10 + tau)) < 1e-12); }
  assert.ok(F.wander(s, 0) === 0, 'it starts level'); assert.ok(Math.abs(F.wander(s, 5)) <= 1.0001);
  const steady = game({ tier: 0 }, 4), smooth = game({ tier: 2 }, 4), rough = game({ tier: -2 }, 4);
  for (const tau of [0.3, 0.7]) { assert.ok(Math.abs(F.wander(smooth, tau) - 0.8 * F.wander(steady, tau)) < 1e-9); assert.ok(Math.abs(F.wander(rough, tau) - 1.2 * F.wander(steady, tau)) < 1e-9); }
  F.flattenSteer(s, 5); assert.equal(s.steer, 1, 'the steer is clamped'); F.flattenSteer(s, NaN); assert.equal(s.steer, 0);
  assert.equal(F.leanOf(game(), 1), 0, 'not charging: no lean');
  // the lean builds over the hold: a longer hold leans more
  let early = 0, late = 0; for (let seed = 1; seed <= 200; seed++) { const g = game({}, seed); early += Math.abs(F.wander(g, 0.15)); late += Math.abs(F.wander(g, 0.8)); }
  assert.ok(late > early * 1.5, 'a longer hold leans more');
});

test('the words: too soft / just right / too hard against the picked bubble, and the lean in words (no number)', () => {
  const s = game({}, 3), b = s.bubbles[0]; b.need = 50;
  assert.equal(F.powerWord(s, 0), 'pick a bubble');
  F.flattenSelect(s, b.id); F.flattenCharge(s, 0);
  assert.equal(F.powerWord(s, 0.3 * 1.2), 'too soft'); // 30
  assert.equal(F.powerWord(s, 0.4 * 1.2), 'just right'); // 40: the edge
  assert.equal(F.powerWord(s, 0.5 * 1.2), 'just right'); assert.equal(F.powerWord(s, 0.6 * 1.2), 'just right'); assert.equal(F.powerWord(s, 0.62 * 1.2), 'too hard');
  assert.equal(F.leanWord(0), 'steady'); assert.equal(F.leanWord(-0.2), 'leaning left'); assert.equal(F.leanWord(0.3), 'leaning right');
  assert.equal(F.leanWord(-0.5), 'too far left'); assert.equal(F.leanWord(0.35), 'leaning right'); assert.equal(F.leanWord(0.36), 'too far right');
  assert.equal(F.powerWord(game(), 0), 'pick a bubble');
});

test('the grade: 100 minus 8 a dimple minus 3 a swing over one a bubble; done when no bubbles are left', () => {
  const s = game({}, 3); let t = 0;
  for (const b of [...s.bubbles]) { trueSwing(s, b.id, b.need, t); t += 5; }
  assert.ok(s.done && s.result.success && s.result.grade === 100 && s.result.how === 'flat' && s.result.swings === 5 && s.result.word === 'perfect');
  // one soft hit first: two swings on one bubble: one over: -3
  const u = game({}, 3); t = 0; const first = u.bubbles[0]; first.need = 70; trueSwing(u, first.id, 40, t); t += 5; trueSwing(u, first.id, 30, t); t += 5;
  for (const b of [...u.bubbles]) { trueSwing(u, b.id, b.need, t); t += 5; }
  assert.equal(u.result.grade, 97); assert.equal(u.result.extra, 1);
  // a dimple: -8
  const v = game({}, 3); t = 0; trueSwing(v, v.bubbles[0].id, v.bubbles[0].need + 12, t); t += 5;
  for (const b of [...v.bubbles]) { trueSwing(v, b.id, b.need, t); t += 5; }
  assert.equal(v.result.grade, 92); assert.match(F.flattenWhy(v.result), /1 dimple \(-8\)/);
  assert.equal(F.gradeOf(game()), 100);
});

test('the game ends by itself once the grade cannot reach 70 (four dimples), and Give up is a grade 0', () => {
  const s = game({}, 3); let t = 0;
  for (let i = 0; i < 3; i++) { const b = s.bubbles[0]; trueSwing(s, b.id, 100, t); t += 5; }
  assert.ok(!s.done || s.result.grade < 70);
  const u = game({}, 3); t = 0; for (let i = 0; i < 4 && !u.done; i++) { const b = u.bubbles[0]; trueSwing(u, b.id, 100, t); t += 5; }
  assert.ok(u.done && u.result.how === 'rough' && !u.result.success && u.result.grade === 68, 'four dimples: 68');
  const g = game(); assert.equal(F.flattenGiveUp(g).grade, 0); assert.ok(g.done);
  const w = game({}, 3); trueSwing(w, 1, 20); F.flattenGiveUp(w); assert.equal(F.flattenRelease(w, 99), null);
});

test('tap-tap-tap with no charge (swings add up, -3 each over one a bubble) ends under 70', () => {
  const s = game({}, 3); let t = 0, n = 0;
  while (!s.done && n++ < 100) { F.flattenSelect(s, s.bubbles[0].id); F.flattenCharge(s, t); F.flattenRelease(s, t); t += 1; }
  assert.ok(s.done && !s.result.success && s.result.how === 'rough' && s.result.extra >= 11);
});

// ---- the chain ------------------------------------------------------------------------------------------------------------------------
test('the chain: a Flatten recipe runs through the shared rules (pass, redo and spoil, ruin)', () => {
  const rec = G.createRecipe({ recipe: G.RECIPES.flatten, tier: 0, level: 9, seed: 3 }), cur = G.current(rec);
  assert.equal(cur.kind, 'flatten'); assert.equal(cur.setup.kind, 'flatten'); assert.equal(cur.setup.bubbles, 5);
  assert.equal(G.RECIPES.flatten.name, 'Flatten a plate'); assert.equal(G.RECIPES.flatten.materials, 3); assert.equal(G.RECIPES.flatten.build, 20); assert.equal(G.KIND_NAME.flatten, 'Flatten');
  assert.equal(G.submit(rec, 60), 'redo'); assert.equal(rec.spoils, 1); assert.equal(G.submit(rec, 60), 'redo'); assert.equal(G.submit(rec, 60), 'ruined');
  const ok = G.createRecipe({ recipe: G.RECIPES.flatten, level: 9, seed: 3 }); assert.equal(G.submit(ok, 100), 'passed'); assert.equal(ok.result.grades[0].kind, 'flatten');
  const mixed = G.createRecipe({ recipe: { id: 'x', name: 'x', what: 'x', materials: 4, build: 30, steps: [{ name: 'Shape', games: [{ kind: 'bend', bends: 1 }, { kind: 'flatten' }] }] }, level: 9 });
  assert.equal(G.submit(mixed, 90), 'passed'); assert.equal(G.current(mixed).kind, 'flatten'); assert.match(G.partLine(mixed), /next Flatten/);
  assert.equal(JSON.parse(JSON.stringify(mixed)).list[1].kind, 'flatten');
});

test('the point picker, the roll preview and the bench say what Flatten does', () => {
  assert.match(CATEGORIES.crafting.cats[1].words(3), /Flatten: the hammer charges 15% faster/);
  const smooth = rollPreview('flatten', { total: 25, dc: 10 }, { level: 9 }), rough = rollPreview('flatten', { total: 1, dc: 10 }, { level: 9 });
  assert.match(smooth.line, /power band wider/); assert.match(smooth.line, /leans 20% less/); assert.match(smooth.line, /1 fewer bubble/);
  assert.match(rough.line, /power band narrower/); assert.match(rough.line, /1 more bubble/); assert.equal(rollPreview('flatten', { total: 12, dc: 10 }, { level: 9 }).phrases.length, 0);
  assert.ok(Object.keys(CHAIN_SPECS).includes('flatten'));
  const state = freshState(), st = { ...stationById('craft'), id: 'flatten', label: 'flatten' }, start = startStation(state, st, { total: 15, dc: 10, natural: false });
  assert.equal(start.setup.kind, 'flatten'); assert.match(start.preview.line, /Good roll/);
  assert.match(settleStation(state, st, { success: true, xp: 5 }).said, /you did it[\s\S]*\+5 Crafting XP/);
});

// ---- the bots: perfect, slow-handed and lazy, at every roll -----------------------------------------------------------------------------
const TABLE = {};
/** A hand: picks a bubble, holds for the time its power needs (timing wobble in seconds), steers against the drift with a lag and a wobble. */
function hand(setup, seed, { timeSd = 0, lag = 0, steerSd = 0, track = true, full = false, maxSwings = 90 } = {}) {
  const s = F.createFlatten({ seed, setup }), r = lcg(seed * 7 + 1); let t = 0;
  for (let i = 0; i < maxSwings && !s.done; i++) {
    const b = s.bubbles[0]; F.flattenSelect(s, b.id); t += 0.5; F.flattenCharge(s, t);
    const hold = full ? s.chargeTime : Math.max(0.02, (b.need / 100) * s.chargeTime + timeSd * gauss(r)), end = t + hold;
    for (let tt = t; tt < end; tt += 1 / 60) F.flattenSteer(s, track ? against(s, tt - t - lag) + steerSd * gauss(r) : 0);
    F.flattenSteer(s, track ? against(s, end - t - lag) + steerSd * gauss(r) : 0);
    F.flattenRelease(s, end); t = end;
  }
  return s;
}
const sweep = (fn, n = 300) => { let pass = 0, sum = 0; for (let i = 1; i <= n; i++) { const s = fn(i); if (s.done && s.result.success) pass++; sum += s.done ? s.result.grade : 0; } return { rate: pass / n, avg: sum / n }; };

test('perfect bot: flattens every sheet clean at every roll and with every Speed point (grade 100)', () => {
  for (const t of TIERS) for (const sp of [0, 9]) {
    const r = sweep((i) => hand(setupFlatten({ tier: t, level: 9, points: { speed: sp } }), i), 150);
    TABLE[`perfect t${t} speed${sp}`] = r.rate; assert.equal(r.rate, 1, `perfect, tier ${t}, speed ${sp}`); assert.equal(r.avg, 100);
  }
});

test('lazy hands never pass: full power every time, a tap with no charge, never swinging, even a right-power hand that never steers is far below a steering one', () => {
  for (const t of TIERS) {
    const full = sweep((i) => hand(setupFlatten({ tier: t, level: 9 }), i, { full: true }), 120);
    assert.equal(full.rate, 0, `full power at tier ${t}`); TABLE[`lazy full t${t}`] = full.rate;
    const tap = sweep((i) => { const s = F.createFlatten({ seed: i, setup: setupFlatten({ tier: t, level: 9 }) }); for (let k = 0; k < 120 && !s.done; k++) { F.flattenSelect(s, s.bubbles[0].id); F.flattenCharge(s, k); F.flattenRelease(s, k); } return s; }, 60);
    assert.equal(tap.rate, 0, `taps at tier ${t}`);
    const never = F.createFlatten({ seed: 1, setup: setupFlatten({ tier: t, level: 9 }) }); assert.ok(!never.done);
    const still = sweep((i) => hand(setupFlatten({ tier: t, level: 9 }), i, { track: false }), 200); TABLE[`no-steer exact power t${t}`] = still.rate;
    assert.ok(still.rate <= 0.6, `a hand that never steers: ${still.rate} at tier ${t}`);
    assert.ok(still.avg < 80, `and scores low on average: ${still.avg}`);
  }
});

test('slow-handed bot (wobbly release, laggy steering): a slope, not a cliff, with the roll; Speed points never hurt', () => {
  const h = { timeSd: 0.06, lag: 0.18, steerSd: 0.08 };
  const at = (tier, points = {}) => sweep((i) => hand(setupFlatten({ tier, points, level: 9 }), i, h), 400).rate;
  const byTier = TIERS.map((t) => at(t)); TIERS.forEach((t, i) => { TABLE[`slow t${t}`] = byTier[i]; });
  for (let i = 1; i < byTier.length; i++) { assert.ok(byTier[i] >= byTier[i - 1] - 0.03, `roll: ${byTier}`); assert.ok(byTier[i] - byTier[i - 1] < 0.3, `no cliff in the roll: ${byTier}`); }
  assert.ok(byTier[4] > byTier[0] + 0.2, `Smooth beats Rough: ${byTier}`);
  const h2 = { timeSd: 0.085, lag: 0.25, steerSd: 0.12 }, byPts = [0, 3, 6, 9].map((p) => sweep((i) => hand(setupFlatten({ tier: 0, points: { speed: p }, level: 9 }), i, h2), 400).rate);
  [0, 3, 6, 9].forEach((p, i) => { TABLE[`slow2 steady speed${p}`] = byPts[i]; });
  for (let i = 1; i < byPts.length; i++) assert.ok(byPts[i] >= byPts[i - 1] - 0.05, `Speed points do not hurt: ${byPts}`);
  assert.ok(byPts[3] >= byPts[0] - 0.02, `nine points are no worse than none: ${byPts}`);
});

test.after(() => { if (process.env.FLATTEN_TABLE) console.log(JSON.stringify(TABLE, null, 1)); });
