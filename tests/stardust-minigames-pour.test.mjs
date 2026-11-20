// Pour, the first cooking game (v2/PLAN.md section 6): every rule of the spec as an exact test (25 a second, clean within 6 of the line, passes
// within 12 on a slope from 100 to 70, over is a spill, under can be topped up at -5), the roll and the Speed path as tables, the chain wiring,
// and a bot sweep (perfect, wobbly, lazy and mash hands at every roll). Pure: no DOM.
//   POUR_TABLE=1 node --test tests/stardust-minigames-pour.test.mjs   prints the pass-rate and time tables
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../projects/Space-Shooter/voyage/minigames/pour.js';
import * as G from '../projects/Space-Shooter/voyage/minigames/craftChain.js';
import { setupPour, POUR_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { rollPreview, CHAIN_SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { effectChips } from '../projects/Space-Shooter/voyage/minigames/craftChainView.js';
import { startStation, settleStation, stationById } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
const TIERS = [-2, -1, 0, 1, 2];
const SETTLE = 0.65, LOOK = 0.5; // the view rests the pad 0.65 s after a pour; a hand takes half a second to see the new glass and press
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const game = (o = {}, seed = 1, setupOnly = {}) => P.createPour({ seed, setup: { ...setupPour({ level: 9, ...o }), ...setupOnly } });
/** One press and release that fills the current glass from where it is to `to` at the plain 25 a second (Speed 0), starting at time t. */
function fillTo(s, to, t = 0) { P.pourDown(s, t); const rel = t + (to - s.level) / 25; return { out: P.pourUp(s, rel), t: rel }; }
const line0 = (s) => P.lineOf(s);

// ---- setup tables --------------------------------------------------------------------------------------------------------------
test('Pour setup: the bands by roll and the stream by Speed points, exact tables', () => {
  assert.deepEqual([POUR_BASE.clean, POUR_BASE.pass, POUR_BASE.rate, POUR_BASE.tierBand], [6, 12, 25, 0.15]);
  for (const t of TIERS) {
    const u = setupPour({ tier: t, level: 9 });
    assert.equal(u.clean, r4(6 * (1 + 0.15 * t)), `clean band at ${t}`); assert.equal(u.pass, r4(12 * (1 + 0.15 * t)), `pass band at ${t}`);
  }
  assert.equal(setupPour({ tier: 2 }).clean, 7.8); assert.equal(setupPour({ tier: 2 }).pass, 15.6); assert.equal(setupPour({ tier: -2 }).clean, 4.2); assert.equal(setupPour({ tier: -2 }).pass, 8.4);
  for (let p = 0; p <= 9; p++) {
    const u = setupPour({ points: { speed: p }, level: 9 });
    assert.equal(u.quick, r4(0.05 * p), `quicker stream at ${p} points`); assert.equal(u.fastRate, r4(25 * (1 + 0.05 * p)));
    assert.equal(setupPour({ points: { quality: p }, level: 9 }).qualityBonus, 4 * p);
    assert.equal(setupPour({ points: { material: p }, level: 9 }).materialFactor, r4(1 - 0.04 * p));
    assert.equal(u.buildFactor, r4(1 - 0.05 * p));
  }
  assert.equal(setupPour({ points: { speed: 9 }, level: 9 }).fastRate, 36.25, 'nine points: 25 up to 36.25');
  assert.equal(setupPour({ points: { speed: 9 }, level: 3 }).quick, 0.15, 'points never pass the level');
  assert.equal(setupPour({}).pours, 3); assert.equal(setupPour({ pours: 9 }).pours, 4); assert.equal(setupPour({ pours: 0 }).pours, 1);
});

// ---- the model ---------------------------------------------------------------------------------------------------------------------
test('determinism: the same seed gives the same plan; lines are 40 to 84 and apart; the named liquids keep their order', () => {
  assert.deepEqual(P.planFor(7, 3), P.planFor(7, 3)); assert.notDeepEqual(P.planFor(7, 3), P.planFor(8, 3));
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const plan = P.planFor(seed, 3); assert.equal(plan.length, 3);
    plan.forEach((p, i) => { assert.ok(Number.isInteger(p.line) && p.line >= 40 && p.line <= 84, `line ${p.line}`); assert.ok(p.color && p.name); seen.add(p.line); if (i) assert.ok(Math.abs(p.line - plan[i - 1].line) >= 8, `neighbours apart (seed ${seed})`); });
    assert.equal(new Set(plan.map((p) => p.id)).size, 3, 'three different liquids');
  }
  assert.ok(Math.min(...seen) <= 41 && Math.max(...seen) >= 83, 'the whole 40 to 84 range turns up');
  assert.deepEqual(P.planFor(3, 3, ['coolant', 'glycol', 'water']).map((p) => p.id), ['coolant', 'glycol', 'water']);
  assert.ok(Math.max(...P.planFor(1, 3).map((p) => p.line)) + 15.6 <= 100, 'a Smooth spill edge stays inside the glass');
  const a = game({}, 5), b = game({}, 5); assert.deepEqual(a.plan, b.plan);
});

test('the glass fills 25 a second while you hold, and not while you do not', () => {
  const s = game({ pours: 1 }, 3); assert.equal(s.level, 0);
  assert.equal(P.pourDown(s, 1), true); P.pourTick(s, 1.4); assert.ok(Math.abs(s.level - 10) < 1e-6, `0.4 s is 10: ${s.level}`);
  P.pourTick(s, 2); assert.ok(Math.abs(s.level - 25) < 1e-6);
  assert.equal(P.pourDown(s, 2.1), false, 'already pouring');
  const r = P.pourUp(s, 2); assert.equal(r.outcome, 'under'); P.pourTick(s, 9); assert.ok(Math.abs(s.level - 25) < 1e-6, 'letting go stops the stream');
  assert.equal(P.pourUp(s, 9), null, 'nothing held: nothing to let go of');
});

test('Speed: the stream is quicker only while far from the line; the last 22 always run at the base rate', () => {
  const s = game({ points: { speed: 9 }, pours: 1 }, 3), line = line0(s), base = 25;
  assert.ok(Math.abs(P.rateAt(s, 0) - 25 * 1.45) < 1e-9 || line - 22 - 0 < 8, 'quick at the start (unless the line is close)');
  for (const L of [line - 22, line - 15, line - 5, line, line + 5]) assert.equal(P.rateAt(s, L), base, `plain rate at ${L} (line ${line})`);
  assert.ok(P.rateAt(s, line - 40) > base, 'quicker far below the line'); assert.ok(P.rateAt(s, line - 40) <= base * 1.45 + 1e-9);
  const plain = game({ pours: 1 }, 3); assert.equal(P.rateAt(plain, 0), 25, 'no points: always 25');
  // the whole fill to the line is shorter with points, the last 22 take the same time
  const time = (g) => { P.pourDown(g, 0); let t = 0; while (g.level < line0(g) && t < 20) { t += 1 / 120; P.pourTick(g, t); } return t; };
  const t0 = time(game({ pours: 1 }, 3)), t9 = time(game({ points: { speed: 9 }, pours: 1 }, 3));
  assert.ok(t9 < t0, `Speed shortens the pour: ${t0} -> ${t9}`);
  const lastLeg = (g) => { P.pourDown(g, 0); let t = 0, at = null; while (g.level < line0(g) && t < 20) { t += 1 / 240; P.pourTick(g, t); if (at == null && g.level >= line0(g) - 22) at = t; } return t - at; };
  const l0 = lastLeg(game({ pours: 1 }, 3)), l9 = lastLeg(game({ points: { speed: 9 }, pours: 1 }, 3));
  assert.ok(Math.abs(l0 - l9) < 0.03, `the last 22 take the same time with or without points: ${l0} vs ${l9}`);
});

test('within 6 of the line is clean: grade 100, both edges count', () => {
  for (const d of [0, 3, 6, -6, -3]) {
    const s = game({}, 3), line = line0(s), { out } = fillTo(s, line + d);
    assert.equal(out.outcome, 'clean', `${d} off`); assert.equal(s.pours[0].grade, 100); assert.equal(s.idx, 1);
  }
  const s = game({}, 3), out = fillTo(s, line0(s) + 6.01).out; assert.equal(out.outcome, 'passes', 'just past 6');
});

test('within 12 passes on a slope: 100 at 6 down to 70 at 12, over or under', () => {
  const grade = (d) => { const s = game({}, 3), line = line0(s); fillTo(s, line + d); return s.pours[0]?.grade; };
  assert.equal(grade(9), 85); assert.equal(grade(-9), 85); assert.equal(grade(12), 70); assert.equal(grade(-12), 70); assert.equal(grade(7.2), 94); assert.equal(grade(10.8), 76);
  assert.equal(game({}, 3).pours.length, 0);
  const s = game({}, 3); fillTo(s, line0(s) + 9); assert.equal(s.pours[0].outcome, 'passes');
});

test('over by more than 12 is a spill: the ingredient is spoiled (-50), the glass is emptied, pour it again', () => {
  const s = game({ pours: 2 }, 3), line = line0(s);
  P.pourDown(s, 0); P.pourTick(s, (line + 13) / 25 + 0.2);
  assert.equal(s.spills, 1); assert.equal(s.level, 0, 'emptied'); assert.equal(s.holding, false); assert.equal(s.spillWait, true); assert.equal(P.pourWord(s), 'spilled');
  assert.equal(P.pourDown(s, 9), false, 'you have to let go of the spill first');
  const r = P.pourUp(s, 9); assert.equal(r.outcome, 'spill'); assert.equal(s.spillWait, false);
  assert.ok(s.events.some((e) => e.type === 'spill'));
  // pour it again on the line: the pour is spoiled once, so it grades 100 - 50
  const t = 10; P.pourDown(s, t); P.pourUp(s, t + line / 25);
  assert.equal(s.pours[0].grade, 50); assert.equal(s.pours[0].spills, 1); assert.equal(s.idx, 1);
  // the spill is not forgotten
  assert.equal(s.spills, 1);
});

test('under the amber band: stop short and top it up; the first press is free, each press after costs 5', () => {
  const s = game({}, 3), line = line0(s);
  let r = fillTo(s, line - 20); assert.equal(r.out.outcome, 'under'); assert.equal(s.pours.length, 0); assert.equal(s.presses, 1); assert.equal(s.topUps, 0); assert.equal(P.pourWord(s), 'top it up');
  r = fillTo(s, line - 14, 5); assert.equal(r.out.outcome, 'under'); assert.equal(s.topUps, 1);
  r = fillTo(s, line, 9); assert.equal(r.out.outcome, 'clean'); assert.equal(s.pours[0].topUps, 2, 'two presses after the first'); assert.equal(s.pours[0].grade, 90);
  // one top-up that lands clean
  const u = game({}, 3); fillTo(u, line0(u) - 30); fillTo(u, line0(u), 5); assert.equal(u.pours[0].grade, 95);
  // a top-up that lands in the pass band takes both penalties
  const v = game({}, 3); fillTo(v, line0(v) - 30); fillTo(v, line0(v) - 9, 5); assert.equal(v.pours[0].grade, 80, '85 on the slope, -5 for the top-up');
});

test('a press that pours nothing is not a pour (no top-up cost, nothing counted)', () => {
  const s = game({}, 3); P.pourDown(s, 0); const r = P.pourUp(s, 0.01); assert.equal(r.outcome, 'none'); assert.equal(s.presses, 0); assert.equal(s.topUps, 0);
});

test('the roll widens or narrows both bands by 15% a tier', () => {
  const tryAt = (tier, d) => { const s = game({ tier }, 3), line = line0(s); return fillTo(s, line + d).out.outcome; };
  assert.equal(tryAt(2, 7.8), 'clean'); assert.equal(tryAt(2, 7.9), 'passes'); assert.equal(tryAt(-2, 4.2), 'clean'); assert.equal(tryAt(-2, 4.3), 'passes');
  assert.equal(tryAt(0, 6), 'clean'); assert.equal(tryAt(1, 6.9), 'clean'); assert.equal(tryAt(-1, 5.1), 'clean'); assert.equal(tryAt(-1, 5.2), 'passes');
  // over the pass band: 15.6 at Smooth but 8.4 at Rough
  assert.equal(tryAt(2, 15), 'passes'); assert.equal(tryAt(-2, 9), 'spill'); assert.equal(tryAt(0, 11.9), 'passes');
  for (const t of TIERS) { const u = setupPour({ tier: t, level: 9 }); assert.ok(Math.abs(u.pass / u.clean - 2) < 1e-3, `pass band is twice the clean band at ${t}`); }
});

test('the words: hold to pour / keep pouring / nearly / on the line: stop / a bit much: stop / top it up / spilled, and no numbers', () => {
  const s = game({ pours: 2 }, 3), line = line0(s);
  assert.equal(P.pourWord(s), 'hold to pour');
  P.pourDown(s, 0);
  const at = (L) => { s.level = L; return P.pourWord(s); };
  assert.equal(at(line - 20), 'keep pouring'); assert.equal(at(line - 12), 'nearly'); assert.equal(at(line - 6.5), 'nearly'); assert.equal(at(line - 6), 'on the line: stop'); assert.equal(at(line + 6), 'on the line: stop'); assert.equal(at(line + 6.5), 'a bit much: stop');
  s.level = line - 30; P.pourUp(s, 0.2); assert.equal(P.pourWord(s), 'top it up');
  for (const w of ['hold to pour', 'keep pouring', 'nearly', 'on the line: stop', 'a bit much: stop', 'top it up', 'spilled', 'poured']) assert.doesNotMatch(w, /\d/);
});

test('the batch: grade is the average of the pours, the glass is swapped for a fresh one, done after the last', () => {
  const s = game({}, 3); let t = 0;
  for (let i = 0; i < 3; i++) { const r = fillTo(s, line0(s), t); t = r.t + 1; assert.equal(r.out.outcome, 'clean'); if (i < 2) { assert.equal(s.level, 0, 'a fresh glass'); assert.ok(s.events.some((e) => e.type === 'next' && e.idx === i + 1 && e.left.line)); } }
  assert.ok(s.done && s.result.success && s.result.grade === 100 && s.result.how === 'done' && s.result.word === 'perfect' && s.result.pours.length === 3);
  assert.equal(P.pourWord(s), 'poured'); assert.equal(P.pourUp(s, 99), null); assert.equal(P.pourDown(s, 99), false);
  const u = game({}, 3); t = 0; fillTo(u, line0(u) + 9, t); fillTo(u, line0(u), 5); fillTo(u, line0(u) - 12, 9); assert.equal(u.result.grade, Math.round(((85 + 100 + 70) / 3) * 100) / 100);
  assert.match(P.pourWhy(u.result), /2 pours not on the line/); assert.equal(P.pourWhy(game({}, 3).result), '');
});

test('the game ends by itself when the grade cannot reach 70: three spills ruin it, a pile of top-ups does too; Give up is a grade 0', () => {
  const spillOnce = (s, t) => { P.pourDown(s, t); P.pourUp(s, t + 4); return t + 5; };
  const s = game({}, 3); let t = 0; t = spillOnce(s, t); assert.ok(!s.done, 'one spill: 75 is still reachable'); t = spillOnce(s, t); assert.ok(s.done && s.result.how === 'rough' && !s.result.success, 'two spills: the best left is 66');
  assert.equal(s.result.spills, 2);
  const m = game({ pours: 1 }, 3); let tt = 0, n = 0;
  while (!m.done && n++ < 80) { P.pourDown(m, tt); P.pourUp(m, tt + 0.12); tt += 0.4; }
  assert.ok(m.done && !m.result.success && m.result.how === 'rough' && m.result.topUps >= 6, `mashing taps: ${JSON.stringify(m.result)}`);
  const g = game(); assert.equal(P.pourGiveUp(g).grade, 0); assert.ok(g.done); assert.equal(P.pourDown(g, 1), false);
  const w = game({}, 3); fillTo(w, line0(w)); P.pourGiveUp(w); assert.equal(w.result.grade, 0);
});

// ---- the chain ------------------------------------------------------------------------------------------------------------------------
test('the chain: the Mix a coolant flask recipe runs through the shared rules (pass, redo and spoil, ruin)', () => {
  const rec = G.createRecipe({ recipe: G.RECIPES.pour, tier: 0, level: 9, seed: 3 }), cur = G.current(rec);
  assert.equal(cur.kind, 'pour'); assert.equal(cur.setup.kind, 'pour'); assert.equal(cur.setup.pours, 3); assert.deepEqual(cur.liquids, ['coolant', 'glycol', 'water']);
  assert.equal(G.RECIPES.pour.name, 'Mix a coolant flask'); assert.equal(G.RECIPES.pour.materials, 3); assert.equal(G.RECIPES.pour.build, 15); assert.equal(G.KIND_NAME.pour, 'Pour');
  const state = P.createPour({ seed: cur.seed, setup: cur.setup }); assert.deepEqual(state.plan.map((p) => p.id), ['coolant', 'glycol', 'water']);
  assert.equal(G.submit(rec, 60), 'redo'); assert.equal(rec.spoils, 1); assert.equal(G.submit(rec, 60), 'redo'); assert.equal(G.submit(rec, 60), 'ruined');
  const ok = G.createRecipe({ recipe: G.RECIPES.pour, level: 9, seed: 3 }); assert.equal(G.submit(ok, 100), 'passed'); assert.equal(ok.result.grades[0].kind, 'pour');
  const mixed = G.createRecipe({ recipe: { id: 'x', name: 'x', what: 'x', materials: 4, build: 30, steps: [{ name: 'Cook', games: [{ kind: 'pour', pours: 2 }, { kind: 'cut' }] }] }, level: 9 });
  assert.equal(G.current(mixed).setup.pours, 2); assert.equal(G.submit(mixed, 90), 'passed'); assert.equal(G.current(mixed).kind, 'cut'); assert.match(G.partLine(mixed), /next Cut/);
  assert.equal(JSON.parse(JSON.stringify(mixed)).list[0].kind, 'pour');
});

test('the point picker, the roll preview, the chips and the bench say what Pour does', () => {
  assert.match(CATEGORIES.crafting.cats[1].words(3), /Pour: the stream runs 15% faster until it nears the line/);
  const smooth = rollPreview('pour', { total: 25, dc: 10 }, { level: 9 }), rough = rollPreview('pour', { total: 1, dc: 10 }, { level: 9 });
  assert.match(smooth.line, /clean band on the line 30% wider/); assert.match(smooth.line, /pass band 30% wider/); assert.match(rough.line, /30% narrower/);
  assert.equal(rollPreview('pour', { total: 12, dc: 10 }, { level: 9 }).phrases.length, 0); assert.ok(Object.keys(CHAIN_SPECS).includes('pour'));
  const chips = effectChips('pour', setupPour({ tier: 1, points: { speed: 4, quality: 2 }, level: 9 })).map((c) => c.text);
  assert.ok(chips.some((c) => /Good roll: wider clean and pass bands/.test(c)), chips.join('|')); assert.ok(chips.some((c) => /Speed 4: the stream runs 20% faster until it nears the line/.test(c)));
  assert.ok(effectChips('pour', setupPour({ level: 9 })).some((c) => /Speed 0: normal stream/.test(c.text)));
  const state = freshState(), st = { ...stationById('craft'), id: 'pour', label: 'pour' }, start = startStation(state, st, { total: 15, dc: 10, natural: false });
  assert.equal(start.setup.kind, 'pour'); assert.equal(start.setup.pours, 3); assert.match(start.preview.line, /Good roll/);
  assert.match(settleStation(state, st, { success: true, xp: 5 }).said, /you did it[\s\S]*\+5 Crafting XP/);
});

// ---- the bots: perfect, wobbly, lazy and mash, at every roll ---------------------------------------------------------------------------------
const TABLE = {};
/** Seconds from the glass being put in front of the hand until the liquid reaches its line, on a clone. */
function toLine(s, t) { const c = structuredClone(s), line = P.lineOf(c); let tt = t; while (c.level < line && tt < t + 20 && !c.spillWait) { tt += 1 / 240; P.pourTick(c, tt); } return tt; }
/**
 * A hand: looks at the glass (LOOK seconds), presses, and lets go a reaction time after the liquid reaches the line (mean `lag`, sd `sd`, seconds;
 * negative means it let go early and tops up). The clock includes the pad's rest after each settled pour. Returns the state and the seconds taken.
 */
function hand(setup, seed, { lag = 0, sd = 0, maxPresses = 80 } = {}) {
  const s = P.createPour({ seed, setup }), r = lcg(seed * 7 + 1); let t = 0, n = 0;
  while (!s.done && n++ < maxPresses) {
    t += LOOK; P.pourDown(s, t);
    const rel = Math.max(t + 0.03, toLine(s, t) + lag + sd * gauss(r)), idx = s.idx, spills = s.spills;
    P.pourUp(s, rel); t = rel;
    if (s.idx > idx || s.spills > spills) t += SETTLE;
  }
  return { s, t };
}
const sweep = (fn, n = 400) => { let pass = 0, sum = 0, time = 0; for (let i = 1; i <= n; i++) { const { s, t } = fn(i); if (s.done && s.result.success) pass++; sum += s.done ? s.result.grade : 0; time += t; } return { rate: pass / n, avg: sum / n, time: time / n }; };
const WOBBLY = { lag: 0.3, sd: 0.2 }; // lets go 0.3 s after the liquid reaches the line, give or take 0.2 s

test('perfect bot: every batch clean at every roll and with every Speed point (grade 100)', () => {
  for (const t of TIERS) for (const sp of [0, 9]) {
    const r = sweep((i) => hand(setupPour({ tier: t, level: 9, points: { speed: sp } }), i), 200);
    TABLE[`perfect t${t} speed${sp}`] = { rate: r.rate, time: +r.time.toFixed(1) }; assert.equal(r.rate, 1, `perfect, tier ${t}, speed ${sp}`); assert.equal(r.avg, 100);
  }
});

test('game length: a good hand takes 10 to 30 seconds (looking, pouring, the pad resting between glasses)', () => {
  const r = sweep((i) => hand(setupPour({ tier: 0, level: 9 }), i, { lag: 0.1, sd: 0.05 }), 300);
  TABLE['good hand seconds, steady, speed 0'] = +r.time.toFixed(1); assert.ok(r.time >= 10 && r.time <= 30, `average ${r.time}`);
  const fast = sweep((i) => hand(setupPour({ tier: 0, level: 9, points: { speed: 9 } }), i, { lag: 0.1, sd: 0.05 }), 300);
  TABLE['good hand seconds, steady, speed 9'] = +fast.time.toFixed(1); assert.ok(fast.time < r.time, 'Speed shortens it'); assert.ok(fast.time >= 9, `nine points: ${fast.time}`);
});

test('lazy hands never pass: hold forever, a tap of no pour, mashing, never pressing', () => {
  for (const t of TIERS) {
    const hold = sweep((i) => { const s = P.createPour({ seed: i, setup: setupPour({ tier: t, level: 9 }) }); let tt = 0; for (let k = 0; k < 30 && !s.done; k++) { P.pourDown(s, tt); P.pourUp(s, tt + 8); tt += 9; } return { s, t: tt }; }, 100);
    assert.equal(hold.rate, 0, `hold to the top at tier ${t}`); TABLE[`lazy hold t${t}`] = hold.rate;
    const mash = sweep((i) => { const s = P.createPour({ seed: i, setup: setupPour({ tier: t, level: 9 }) }); let tt = 0; for (let k = 0; k < 120 && !s.done; k++) { P.pourDown(s, tt); P.pourUp(s, tt + 0.1); tt += 0.25; } return { s, t: tt }; }, 100);
    assert.equal(mash.rate, 0, `mashing at tier ${t}`); TABLE[`mash t${t}`] = mash.rate;
    const tap = sweep((i) => { const s = P.createPour({ seed: i, setup: setupPour({ tier: t, level: 9 }) }); for (let k = 0; k < 60 && !s.done; k++) { P.pourDown(s, k); P.pourUp(s, k); } return { s, t: 0 }; }, 30);
    assert.ok(tap.rate === 0, 'taps with no pour never finish a batch');
    const never = P.createPour({ seed: 1, setup: setupPour({ tier: t, level: 9 }) }); assert.ok(!never.done);
  }
});

test('wobbly bot: about 35 to 50% at the worst roll, 70 to 80% at Steady, 90% or more at the best (a slope, not a cliff)', () => {
  const rates = TIERS.map((t) => sweep((i) => hand(setupPour({ tier: t, level: 9 }), i, WOBBLY), 600));
  TIERS.forEach((t, i) => { TABLE[`wobbly t${t}`] = { rate: +rates[i].rate.toFixed(3), avg: +rates[i].avg.toFixed(1), time: +rates[i].time.toFixed(1) }; });
  const r = rates.map((x) => x.rate);
  assert.ok(r[0] >= 0.3 && r[0] <= 0.55, `Rough: ${r}`); assert.ok(r[2] >= 0.7 && r[2] <= 0.82, `Steady: ${r}`); assert.ok(r[4] >= 0.9, `Smooth: ${r}`);
  for (let i = 1; i < r.length; i++) { assert.ok(r[i] >= r[i - 1] - 0.02, `roll never hurts: ${r}`); assert.ok(r[i] - r[i - 1] < 0.3, `no cliff in the roll: ${r}`); }
});

test('Speed never makes it worse: a wobbly hand at 9 points passes at least as often as at 0 (and an early hand, and a late one)', () => {
  for (const [name, h] of [['wobbly', WOBBLY], ['early', { lag: -0.15, sd: 0.25 }], ['late', { lag: 0.5, sd: 0.3 }]]) {
    const by = [0, 3, 6, 9].map((p) => sweep((i) => hand(setupPour({ tier: 0, points: { speed: p }, level: 9 }), i, h), 600));
    [0, 3, 6, 9].forEach((p, i) => { TABLE[`${name} steady speed${p}`] = { rate: +by[i].rate.toFixed(3), time: +by[i].time.toFixed(1) }; });
    for (let i = 1; i < by.length; i++) assert.ok(by[i].rate >= by[i - 1].rate - 0.005, `${name}: points do not hurt: ${by.map((x) => x.rate)}`);
    assert.ok(by[3].rate >= by[0].rate, `${name}: nine points are no worse than none`);
    assert.ok(by[3].time < by[0].time, `${name}: and the batch is quicker`);
  }
});

test('each crafting path visibly changes something: Quality (+4), Material (-4%), Speed (a quicker stream, a shorter build)', () => {
  const base = setupPour({ level: 9 }), q = setupPour({ level: 9, points: { quality: 5 } }), m = setupPour({ level: 9, points: { material: 5 } }), sp = setupPour({ level: 9, points: { speed: 5 } });
  assert.equal(q.qualityBonus - base.qualityBonus, 20); assert.ok(m.materialFactor < base.materialFactor); assert.ok(sp.quick > base.quick && sp.buildFactor < base.buildFactor);
  const rec = (points) => G.createRecipe({ recipe: G.RECIPES.pour, level: 9, points, seed: 1 });
  const a = rec({}), b = rec({ quality: 5 }); G.submit(a, 80); G.submit(b, 80); assert.equal(b.result.quality - a.result.quality, 20);
  const c = rec({ speed: 5 }); G.submit(c, 80); assert.ok(c.result.buildSeconds < a.result.buildSeconds);
});

test.after(() => { if (process.env.POUR_TABLE) console.log(JSON.stringify(TABLE, null, 1)); });
