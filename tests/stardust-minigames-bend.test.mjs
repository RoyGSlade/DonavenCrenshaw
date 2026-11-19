// Bend, the third game of the crafting chain (v2/PLAN.md section 4.3): every rule of the spec as an exact test (good, slow and
// rushed presses, strain falling, the kink at 100, the same key twice, the grade, the over-10 ruin, 1 to 3 bends), the roll and the
// Speed path as tables, the chain wiring, and a bot sweep (perfect, slow-handed and lazy hands at every roll). Pure: no DOM.
//   BEND_TABLE=1 node --test tests/stardust-minigames-bend.test.mjs     prints the pass-rate table the sweep measured
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../projects/Space-Shooter/voyage/minigames/bend.js';
import * as G from '../projects/Space-Shooter/voyage/minigames/craftChain.js';
import { setupBend, BEND_BASE, tierOf } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { rollPreview, CHAIN_SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { startStation, settleStation, stationById } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
const TIERS = [-2, -1, 0, 1, 2];
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const flip = (k) => (k === 'a' ? 'd' : 'a');
/** A fresh game at a Steady roll unless said otherwise. */
const game = (o = {}, seed = 1) => B.createBend({ seed, setup: setupBend({ level: 9, ...o }) });
/** One bend by hand: presses alternate every `dt` seconds from time t0 until `n` presses are in. Returns the time of the last one. */
function pressN(s, n, dt = 0.3, t0 = 0, first = 'a') { let t = t0, k = first; for (let i = 0; i < n; i++) { B.bendPress(s, k, t); k = flip(k); t += dt; } return t - dt; }

// ---- bots (human speed: every action has a time) ----------------------------------------------------------------------------------
/** Bend with a hand. `gapSd` is the wobble of the rhythm (seconds), `stopSd` how wrong the eye is about the angle (degrees), `think` the pause before Set. */
function playHand(setup, seed, { gap = null, gapSd = 0, stopSd = 0, bias = 0, maxPresses = 600 } = {}) {
  const s = B.createBend({ seed, setup }), r = lcg(seed * 11 + 3);
  const mid = gap ?? (s.lo + s.hi) / 2;
  let t = 0, key = 'a', n = 0;
  while (!s.done && n++ < maxPresses) {
    const seen = s.angle + stopSd * gauss(r) + bias;
    if (seen >= B.targetOf(s)) { t += 0.4; B.bendSet(s, t); t += 0.6; key = 'a'; continue; }
    const out = B.bendPress(s, key, t); if (out !== 'ignored') key = flip(key);
    if (out === 'kink') { key = 'a'; t += 0.5; }
    t += Math.max(0.04, mid + gapSd * gauss(r));
  }
  return s;
}
const perfect = (setup, seed) => playHand(setup, seed);
const sweep = (fn, n = 200) => { let pass = 0, sum = 0; for (let i = 1; i <= n; i++) { const s = fn(i); if (s.done && s.result.success) pass++; sum += s.done ? s.result.grade : 0; } return { rate: pass / n, avg: sum / n }; };

// ---- setup tables -----------------------------------------------------------------------------------------------------------------
test('Bend setup: the rhythm window and the stop tolerance by roll, the strain by Speed points, exact tables', () => {
  assert.deepEqual([BEND_BASE.lo, BEND_BASE.hi, BEND_BASE.stop, BEND_BASE.press, BEND_BASE.rush, BEND_BASE.fall, BEND_BASE.over], [0.18, 0.45, 3, 2, 25, 10, 10]);
  const base = setupBend({ level: 9 });
  assert.equal(base.lo, 0.18); assert.equal(base.hi, 0.45); assert.equal(base.stop, 3);
  for (const t of TIERS) {
    const u = setupBend({ tier: t, level: 9 });
    const half = 0.135 * (1 + 0.15 * t);
    assert.equal(u.lo, r4(0.315 - half), `window start at ${t}`); assert.equal(u.hi, r4(0.315 + half), `window end at ${t}`);
    assert.equal(r4(u.hi - u.lo), r4(0.27 * (1 + 0.15 * t)), `the window is x(1 + 0.15 t) wide at ${t}`);
    assert.equal(u.stop, r4(3 + 0.5 * t), `stop within at ${t}`);
    assert.equal(u.label, ['Rough', 'Rough', 'Steady', 'Smooth', 'Smooth'].length && u.label);
  }
  assert.equal(setupBend({ tier: 2 }).stop, 4); assert.equal(setupBend({ tier: -2 }).stop, 2);
  for (let p = 0; p <= 9; p++) {
    const u = setupBend({ points: { speed: p }, level: 9 });
    assert.equal(u.rush, 25 - 2 * p, `strain per rushed press at ${p} points`);
    assert.equal(setupBend({ points: { quality: p }, level: 9 }).qualityBonus, 4 * p);
    assert.equal(setupBend({ points: { material: p }, level: 9 }).materialFactor, r4(1 - 0.04 * p));
    assert.equal(u.buildFactor, r4(1 - 0.05 * p));
  }
  assert.equal(setupBend({ points: { speed: 9 }, level: 9 }).rush, 7, 'nine points: 25 down to 7');
  assert.equal(setupBend({ points: { speed: 9 }, level: 3 }).rush, 19, 'points never pass the level');
  assert.equal(setupBend({ bends: 9 }).bends, 3); assert.equal(setupBend({ bends: 0 }).bends, 1);
});

// ---- the model: every rule in the spec -----------------------------------------------------------------------------------------
test('determinism: the same seed gives the same targets and the same game; targets are even, 30 to 120', () => {
  assert.deepEqual(B.targetsFor(7, 3), B.targetsFor(7, 3));
  const play = (seed) => { const s = game({ bends: 3 }, seed); for (let i = 0; i < 40; i++) B.bendPress(s, i % 2 ? 'd' : 'a', i * 0.3); return JSON.stringify([s.targets, s.angle, s.events]); };
  assert.equal(play(5), play(5)); assert.notEqual(play(5), play(6));
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) for (const a of B.targetsFor(seed, 3)) { assert.ok(a >= 30 && a <= 120 && a % 2 === 0, String(a)); seen.add(a); }
  assert.equal(Math.min(...seen), 30); assert.equal(Math.max(...seen), 120, 'the whole range is used');
  assert.equal(B.createBend({ seed: 3, setup: setupBend({ bends: 2 }) }).targets.length, 2);
});

test('a press 0.18 to 0.45 s after the last one is good: +2 degrees (both ends included, the first press counts)', () => {
  const s = game();
  assert.equal(B.bendPress(s, 'a', 0), 'good'); assert.equal(s.angle, 2, 'the first press has no press before it: good');
  assert.equal(B.bendPress(s, 'd', 0.18), 'good'); assert.equal(s.angle, 4);
  assert.equal(B.bendPress(s, 'a', 0.18 + 0.45), 'good'); assert.equal(s.angle, 6);
  assert.equal(s.strain, 0);
});

test('a slower press is not enough pressure: +0 degrees, no strain, and it is still the last press', () => {
  const s = game();
  B.bendPress(s, 'a', 0);
  assert.equal(B.bendPress(s, 'd', 0.46), 'slow'); assert.equal(s.angle, 2); assert.equal(s.strain, 0);
  assert.equal(B.bendPress(s, 'a', 0.46 + 0.3), 'good'); assert.equal(s.angle, 4, 'the rhythm picks up from the slow press');
  assert.equal(B.bendPress(s, 'd', 5), 'slow'); assert.equal(s.slow, 2);
});

test('a faster press is rushed: +0 degrees and the strain goes up by 25', () => {
  const s = game();
  B.bendPress(s, 'a', 0);
  assert.equal(B.bendPress(s, 'd', 0.17), 'rushed'); assert.equal(s.angle, 2); assert.equal(s.strain, 25);
  assert.equal(B.bendPress(s, 'a', 0.17 + 0.05), 'rushed'); assert.equal(s.strain, 25 - 0.5 + 25, 'a little strain fell between the two presses');
});

test('strain falls 10 a second, and never below zero', () => {
  const s = game();
  B.bendPress(s, 'a', 0); B.bendPress(s, 'd', 0.1);
  assert.equal(s.strain, 25);
  B.bendTick(s, 0.1 + 1); assert.equal(s.strain, 15);
  B.bendTick(s, 0.1 + 1.5); assert.equal(s.strain, 10);
  B.bendTick(s, 0.1 + 9); assert.equal(s.strain, 0);
  B.bendTick(s, 0.5); assert.equal(s.strain, 0, 'time does not run backwards');
  // a press lets the strain fall first, then adds
  const u = game(); B.bendPress(u, 'a', 0); B.bendPress(u, 'd', 0.1); B.bendPress(u, 'a', 0.6);
  assert.equal(u.strain, 20, '25 less half a second of falling, and the slow press adds nothing');
  B.bendPress(u, 'd', 0.65); assert.equal(u.strain, 20 - 0.5 + 25, 'a rushed press: it falls first, then adds');
});

test('at 100 strain the bar kinks and the bend is redone from straight; a kink costs 10; the third kink cracks the piece', () => {
  const s = game();
  pressN(s, 3); assert.equal(s.angle, 6);
  // rushed presses 0.05 s apart: 25, 49.5, 74, 98.5, then the fifth passes 100
  let t = 0.6, k = 'd', outs = [];
  for (let i = 0; i < 5; i++) { t += 0.05; outs.push(B.bendPress(s, k, t)); k = flip(k); }
  assert.deepEqual(outs, ['rushed', 'rushed', 'rushed', 'rushed', 'kink']);
  assert.equal(s.kinks, 1); assert.equal(s.angle, 0, 'redone from a straight bar'); assert.equal(s.strain, 0); assert.equal(s.lastKey, null); assert.ok(!s.done);
  const set = B.bendSet(s, t + 1);
  assert.equal(set.kinks, 1);
  assert.equal(set.grade, Math.max(0, 100 - 10 * set.target - 10), 'a kink costs 10 off that bend (and a straight bar is far off)');
  const m = game(); let kt = 0, key = 'a';
  for (let i = 0; i < 60 && !m.done; i++) { kt += 0.02; B.bendPress(m, key, kt); key = flip(key); }
  assert.ok(m.done && m.result.how === 'kinks' && m.result.grade === 0 && m.kinks === 3, 'mashing cracks the piece on the third kink');
  // a kink then a clean bend: 10 off the grade, not more
  const c = game(); B.bendPress(c, 'a', 0); let tt = 0, kk = 'd'; while (!c.kinks) { tt += 0.1; B.bendPress(c, kk, tt); kk = flip(kk); }
  const T = B.targetOf(c); pressN(c, T / 2, 0.3, tt + 1); assert.equal(B.bendSet(c, tt + 99).grade, 90);
});

test('at exactly 100 it kinks, at 99 it does not', () => {
  const at = (rush) => { const s = B.createBend({ seed: 1, setup: { ...setupBend({ level: 9 }), rush } }); B.bendPress(s, 'a', 0); for (let i = 0; i < 3; i++) B.bendPress(s, i % 2 ? 'a' : 'd', 0.01 * (i + 1)); return s; };
  const four = at(25); assert.ok(four.strain < 100 || four.kinks);
  const s = B.createBend({ seed: 1, setup: { ...setupBend({ level: 9 }), rush: 50 } });
  B.bendPress(s, 'a', 0); assert.equal(B.bendPress(s, 'd', 0), 'rushed'); assert.equal(s.strain, 50);
  assert.equal(B.bendPress(s, 'a', 0), 'kink', '50 + 50 = 100 kinks');
  const u = B.createBend({ seed: 1, setup: { ...setupBend({ level: 9 }), rush: 49.5 } });
  B.bendPress(u, 'a', 0); B.bendPress(u, 'd', 0); assert.equal(B.bendPress(u, 'a', 0), 'rushed', '99 does not');
});

test('the same key twice does nothing (no degrees, no strain, and it does not restart the rhythm)', () => {
  const s = game();
  B.bendPress(s, 'a', 0);
  assert.equal(B.bendPress(s, 'a', 0.3), 'ignored'); assert.equal(s.angle, 2); assert.equal(s.strain, 0); assert.equal(s.ignored, 1);
  assert.equal(B.bendPress(s, 'd', 0.4), 'good', 'timed from the first A: 0.4 s, in the window');
  assert.equal(B.bendPress(s, 'd', 0.5), 'ignored');
  assert.equal(B.bendPress(s, 'a', 0.4 + 0.05), 'rushed', 'timed from the D at 0.4, not the ignored one at 0.5');
  assert.equal(B.bendPress(s, 'x', 5), 'ignored', 'other keys are not presses');
  assert.equal(B.bendPress(s, 'A', 5.5), 'ignored', 'capital letters are the same keys: A twice');
  assert.equal(B.bendPress(s, 'D', 6), 'slow');
});

test('the grade: 100 minus 10 a degree off at a Steady roll (30 over the stop zone), clamped, and the stop zone edge is the pass line', () => {
  const s = game({ tier: 0 });
  const T = B.targetOf(s);
  assert.equal(B.bendGrade(s, T, T), 100);
  assert.equal(B.bendGrade(s, T - 1, T), 90); assert.equal(B.bendGrade(s, T + 2, T), 80);
  assert.equal(B.bendGrade(s, T - 3, T), 70, 'within 3 degrees is what passes at a Steady roll');
  assert.equal(B.bendGrade(s, T - 4, T), 60); assert.equal(B.bendGrade(s, 0, 120), 0);
  for (const t of TIERS) { const u = game({ tier: t }); assert.ok(Math.abs(B.bendGrade(u, 50 + u.stop, 50) - 70) < 1e-9, `the stop zone edge is 70 at ${t}`); assert.ok(Math.abs(B.slope(u) * u.stop - 30) < 1e-9); }
  assert.equal(B.slope(game({ tier: 0 })), 10);
  // square on the line with a clean rhythm
  const g = game(); pressN(g, B.targetOf(g) / 2); const set = B.bendSet(g, 99);
  assert.equal(set.grade, 100); assert.ok(g.done && g.result.success && g.result.grade === 100 && g.result.word === 'perfect');
  // two degrees short and then over by two
  const h = game(); pressN(h, B.targetOf(h) / 2 - 1); assert.equal(B.bendSet(h, 99).grade, 80);
  const o = game(); pressN(o, B.targetOf(o) / 2 + 1); assert.equal(B.bendSet(o, 99).grade, 80);
});

test('over by more than 10 degrees cannot be saved: the press that does it cracks the piece (grade 0), 10 over can still be set', () => {
  const s = game(); const T = B.targetOf(s);
  const t = pressN(s, T / 2 + 5); // 10 over
  assert.equal(s.angle, T + 10); assert.ok(!s.done);
  assert.equal(B.bendSet(s, t + 1).grade, 0, '10 over is a grade of 0 at 10 a degree... clamped');
  const u = game(); const U = B.targetOf(u);
  pressN(u, U / 2 + 6);
  assert.ok(u.done && u.result.how === 'over' && u.result.grade === 0 && !u.result.success, '12 over cracks');
  assert.equal(B.bendPress(u, 'a', 99), 'ignored', 'a cracked piece takes no more presses');
  assert.match(B.bendWhy(u.result), /cracked/);
});

test('1 to 3 bends: each has its own target and a fresh bar, and the grade is the average', () => {
  for (const n of [1, 2, 3]) {
    const s = game({ bends: n }, 4); assert.equal(s.bends, n);
    let t = 0;
    for (let i = 0; i < n; i++) {
      assert.equal(s.index, i); assert.equal(s.angle, 0, 'a fresh bar'); assert.equal(B.targetOf(s), s.targets[i]);
      t = pressN(s, s.targets[i] / 2, 0.3, t + 1); B.bendSet(s, t + 0.5); t += 0.5;
    }
    assert.ok(s.done && s.result.grade === 100 && s.result.sets.length === n);
  }
  const s = game({ bends: 2 }, 4);
  let t = pressN(s, s.targets[0] / 2); B.bendSet(s, t + 1);                  // 100
  t = pressN(s, s.targets[1] / 2 - 2, 0.3, t + 2); B.bendSet(s, t + 1);      // 4 short: 60
  assert.equal(s.result.grade, 80); assert.equal(s.result.success, true); assert.deepEqual(s.result.sets.map((x) => x.grade), [100, 60]);
  assert.match(B.bendWhy(s.result), /bend 2: short of the line by 4 degrees/);
  const u = game({ bends: 3 }, 9); B.bendSet(u, 1); B.bendSet(u, 2); B.bendSet(u, 3); assert.ok(u.done && u.result.grade === 0, 'three set straight bars: 0');
});

test('the words: keep going, close, on the line, over (no number)', () => {
  const s = game(); const T = B.targetOf(s);
  assert.equal(B.word(s), 'keep going');
  pressN(s, (T - 4) / 2); assert.equal(B.word(s), 'close');
  pressN(s, 1, 0.3, 50); assert.equal(B.word(s), 'close');
  const u = game(); pressN(u, T / 2); assert.equal(B.word(u), 'on the line: set it'); assert.equal(B.gap(u), 0);
  const v = game(); pressN(v, T / 2 + 1); assert.equal(B.word(v), 'over');
  const w = game(); pressN(w, T / 2 + 5); assert.equal(B.word(w), 'over');
});

test('Give up is a grade 0; setting at once is a grade 0', () => {
  const s = game(); assert.equal(B.bendGiveUp(s).grade, 0); assert.ok(s.done);
  const u = game(); B.bendSet(u, 0); assert.ok(u.done && u.result.grade === 0 && !u.result.success);
});

test('the path effects: Speed points take 2 off the strain of a rushed press, so a hand that rushes lasts longer', () => {
  const rushes = (p) => { const s = game({ points: { speed: p } }); B.bendPress(s, 'a', 0); let n = 0, t = 0, k = 'd'; while (!s.kinks && n < 200) { t += 0.05; B.bendPress(s, k, t); k = flip(k); n++; } return n; };
  const lasts = [0, 3, 6, 9].map(rushes);
  for (let i = 1; i < lasts.length; i++) assert.ok(lasts[i] > lasts[i - 1], `more Speed, more rushed presses before a kink: ${lasts}`);
  const s = game({ points: { speed: 9 } }); B.bendPress(s, 'a', 0); B.bendPress(s, 'd', 0.05); assert.equal(s.strain, 7, 'nine points: a rushed press is 7');
  const press = (x, dt) => { B.bendPress(x, 'a', 0); return B.bendPress(x, 'd', dt); };
  assert.equal(press(game({ tier: 2 }), 0.48), 'good', 'a Smooth window runs to 0.49'); assert.equal(press(game({ tier: -2 }), 0.48), 'slow', 'a Rough window ends at 0.41');
  assert.equal(press(game({ tier: 2 }), 0.15), 'good', 'a Smooth window starts at 0.14'); assert.equal(press(game({ tier: -2 }), 0.2), 'rushed', 'a Rough window starts at 0.22');
});

// ---- the chain ---------------------------------------------------------------------------------------------------------------------
test('the chain: a Bend recipe runs through the shared rules (pass, redo and spoil, ruin), bends ride on the game spec', () => {
  const rec = G.createRecipe({ recipe: G.RECIPES.bend, tier: 0, level: 9, seed: 3 });
  const cur = G.current(rec);
  assert.equal(cur.kind, 'bend'); assert.equal(cur.setup.bends, 2); assert.equal(cur.setup.kind, 'bend');
  assert.equal(G.RECIPES.bend.name, 'Bend a bracket'); assert.equal(G.RECIPES.bend.materials, 3); assert.equal(G.RECIPES.bend.build, 20);
  assert.equal(G.KIND_NAME.bend, 'Bend');
  assert.equal(G.submit(rec, 40), 'redo'); assert.equal(rec.spoils, 1);
  assert.equal(G.submit(rec, 40), 'redo'); assert.equal(G.submit(rec, 40), 'ruined'); assert.equal(rec.result.ruined, true);
  const ok = G.createRecipe({ recipe: G.RECIPES.bend, level: 9, seed: 3 });
  assert.equal(G.submit(ok, 92), 'passed'); assert.ok(ok.done); assert.equal(ok.result.grades[0].kind, 'bend'); assert.equal(ok.result.quality, 92);
  assert.match(G.partLine(G.createRecipe({ recipe: { ...G.RECIPES['bolt-plate'], steps: [{ name: 'a', games: [{ kind: 'bend', bends: 1 }, { kind: 'cut' }] }] }, level: 9 })), /next Bend/);
  for (const n of [1, 2, 3]) {
    const r = G.createRecipe({ recipe: { id: 'x', name: 'x', what: 'x', materials: 3, build: 20, steps: [{ name: 's', games: [{ kind: 'bend', bends: n }] }] }, level: 9 });
    assert.equal(G.current(r).setup.bends, n);
    const copy = JSON.parse(JSON.stringify(r)); assert.equal(G.current(copy).setup.bends, n, 'plain JSON keeps the bends (a part in hand)');
  }
  // the 100-craft sum still holds with a Bend recipe
  const sums = Array.from({ length: 100 }, (_, i) => { const r = G.createRecipe({ recipe: G.RECIPES.bend, level: 9, points: { material: 5 }, seed: i }); G.submit(r, 90); return r.result.materialsExact; });
  const used = sums.reduce((a, b) => a + b, 0); assert.ok(Math.abs(used - 100 * 3 * 0.8) < 1e-6, String(used));
});

test('the point picker, the roll preview and the bench say what Bend does', () => {
  const sp = CATEGORIES.crafting.cats[1].words(3);
  assert.match(sp, /Bend/); assert.match(sp, /Cut feed \+15%/);
  const smooth = rollPreview('bend', { total: 25, dc: 10 }, { level: 9 }), rough = rollPreview('bend', { total: 1, dc: 10 }, { level: 9 });
  assert.match(smooth.line, /rhythm window 30% wider/); assert.match(smooth.line, /stop zone/); assert.match(rough.line, /rhythm window 30% narrower/);
  assert.equal(rollPreview('bend', { total: 12, dc: 10 }, { level: 9 }).phrases.length, 0, 'Steady changes nothing');
  assert.ok(Object.keys(CHAIN_SPECS).includes('bend'));
  const state = freshState(), st = { ...stationById('craft'), id: 'bend', label: 'bend' };
  const start = startStation(state, st, { total: 15, dc: 10, natural: false });
  assert.equal(start.tier, 1); assert.equal(start.setup.kind, 'bend'); assert.match(start.preview.line, /Good roll/);
  const res = settleStation(state, st, { success: true, xp: 5 });
  assert.equal(res.xp, 5); assert.match(res.said, /you did it[\s\S]*\+5 Crafting XP/);
  assert.equal(tierOf({ total: 15, dc: 10 }), 1);
});

// ---- the bots: perfect, slow-handed and lazy, at every roll ----------------------------------------------------------------------------
const TABLE = {};
test('perfect bot: passes every bend count at every roll with every seed, and sets square (grade 100)', () => {
  for (const bends of [1, 2, 3]) for (const t of TIERS) {
    const r = sweep((i) => perfect(setupBend({ tier: t, level: 9, bends }), i), 120);
    TABLE[`perfect t${t} x${bends}`] = r.rate;
    assert.equal(r.rate, 1, `perfect, tier ${t}, ${bends} bends`); assert.equal(r.avg, 100);
  }
  // also with a worn rhythm at the edge of the window
  for (const t of TIERS) { const u = setupBend({ tier: t, level: 9 }); const s = playHand(u, 3, { gap: u.lo + 0.01 }); assert.ok(s.done && s.result.grade === 100 && s.kinks === 0, `edge of the window at ${t}`); }
});

test('lazy hands never pass, at any roll or any points: mash, one key, never press, too slow, never stop', () => {
  const lazy = {
    mash: (setup, seed) => { const s = B.createBend({ seed, setup }); let t = 0, k = 'a'; for (let i = 0; i < 300 && !s.done; i++) { t += 0.05; B.bendPress(s, k, t); k = flip(k); } return s; },
    oneKey: (setup, seed) => { const s = B.createBend({ seed, setup }); for (let i = 0; i < 300; i++) B.bendPress(s, 'a', i * 0.3); B.bendSet(s, 100); return s; },
    never: (setup, seed) => { const s = B.createBend({ seed, setup }); for (let i = 0; i < setup.bends; i++) B.bendSet(s, i); return s; },
    tooSlow: (setup, seed) => { const s = B.createBend({ seed, setup }); let k = 'a'; for (let i = 0; i < 300; i++) { B.bendPress(s, k, i * 1.2); k = flip(k); } for (let i = 0; i < setup.bends; i++) B.bendSet(s, 999 + i); return s; },
    neverStop: (setup, seed) => { const s = B.createBend({ seed, setup }); let k = 'a'; for (let i = 0; i < 400 && !s.done; i++) { B.bendPress(s, k, i * 0.3); k = flip(k); } return s; },
  };
  for (const [name, bot] of Object.entries(lazy)) for (const t of TIERS) for (const sp of [0, 9]) {
    const r = sweep((i) => bot(setupBend({ tier: t, level: 9, points: { speed: sp }, bends: 1 + (i % 3) }), i), 60);
    assert.equal(r.rate, 0, `${name} at tier ${t}, speed ${sp}`); TABLE[`lazy ${name} t${t}`] = r.rate;
  }
  const m = lazy.mash(setupBend({ level: 9 }), 1); assert.ok(m.done && m.result.how === 'kinks', 'a mash cracks on kinks, so it always ends');
  const n = lazy.neverStop(setupBend({ level: 9 }), 1); assert.ok(n.done && n.result.how === 'over', 'pressing past the line always ends in a crack');
});

test('slow-handed bot (wobbly rhythm, wobbly eye): a slope, not a cliff, with the roll and with Speed points', () => {
  const hand = { gapSd: 0.1, stopSd: 3.5 };
  const at = (tier, points = {}, bends = 1) => sweep((i) => playHand(setupBend({ tier, points, level: 9, bends }), i, hand), 400);
  const byTier = TIERS.map((t) => at(t).rate);
  TIERS.forEach((t, i) => { TABLE[`slow t${t}`] = byTier[i]; });
  for (let i = 1; i < byTier.length; i++) { assert.ok(byTier[i] >= byTier[i - 1] - 0.03, `roll: ${byTier}`); assert.ok(byTier[i] - byTier[i - 1] < 0.3, `no cliff in the roll: ${byTier}`); }
  assert.ok(byTier[4] > byTier[0] + 0.1, `Smooth beats Rough: ${byTier}`);
  const wild = { gapSd: 0.14, stopSd: 3 };
  const wAt = (p) => sweep((i) => playHand(setupBend({ tier: 0, points: { speed: p }, level: 9 }), i, wild), 400).rate;
  const byPts = [0, 3, 6, 9].map(wAt);
  [0, 3, 6, 9].forEach((p, i) => { TABLE[`wild steady speed${p}`] = byPts[i]; });
  for (let i = 1; i < byPts.length; i++) { assert.ok(byPts[i] >= byPts[i - 1] - 0.03, `points: ${byPts}`); assert.ok(byPts[i] - byPts[i - 1] < 0.3, `no cliff in points: ${byPts}`); }
  assert.ok(byPts[3] > byPts[0], `nine Speed points beat none for a hand that rushes: ${byPts}`);
  for (const b of [1, 2, 3]) { TABLE[`slow steady x${b}`] = at(0, {}, b).rate; TABLE[`wild steady x${b}`] = sweep((i) => playHand(setupBend({ tier: 0, level: 9, bends: b }), i, wild), 400).rate; }
});

test.after(() => { if (process.env.BEND_TABLE) console.log(JSON.stringify(TABLE, null, 1)); });
