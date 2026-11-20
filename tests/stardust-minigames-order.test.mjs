// Order and timing, the second cooking game (v2/PLAN.md section 6): every rule as an exact test (the scripted heat curve, the four ingredients'
// heat bands and time windows, wrong order -15, outside the heat band -10, outside the time window -10, the words, the burn), the roll and the
// Speed path as tables, the chain wiring, and a bot sweep (perfect, wobbly, lazy, mash, backwards at every roll). Pure: no DOM.
//   ORDER_TABLE=1 node --test tests/stardust-minigames-order.test.mjs   prints the pass-rate and time tables
import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../projects/Space-Shooter/voyage/minigames/order.js';
import * as G from '../projects/Space-Shooter/voyage/minigames/craftChain.js';
import { setupOrder, ORDER_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { rollPreview, CHAIN_SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { effectChips } from '../projects/Space-Shooter/voyage/minigames/craftChainView.js';
import { startStation, settleStation, stationById } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
const TIERS = [-2, -1, 0, 1, 2];
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const game = (o = {}, seed = 1) => O.createOrder({ seed, setup: setupOrder({ level: 9, ...o }) });
/** Add the whole recipe at the middle of each combined window, so it is clean. */
function perfect(s) { for (let i = 0; i < s.steps.length && !s.done; i++) { const w = O.windowOf(s, i); O.orderAdd(s, (w.open + w.close) / 2, s.steps[i].id); } return s; }
const mid = (s, i) => { const w = O.windowOf(s, i); return (w.open + w.close) / 2; };

test('Order setup: the roll and the Speed path, exact tables', () => {
  assert.deepEqual([ORDER_BASE.tierBand, ORDER_BASE.warmPerPoint], [0.15, 0.05]);
  for (const t of TIERS) assert.equal(setupOrder({ tier: t, level: 9 }).f, r4(1 + 0.15 * t), `scale at ${t}`);
  assert.equal(setupOrder({ tier: 2 }).f, 1.3); assert.equal(setupOrder({ tier: -2 }).f, 0.7);
  for (let p = 0; p <= 9; p++) {
    assert.equal(setupOrder({ points: { speed: p }, level: 9 }).quick, r4(0.05 * p), `warm-up at ${p}`);
    assert.equal(setupOrder({ points: { quality: p }, level: 9 }).qualityBonus, 4 * p);
    assert.equal(setupOrder({ points: { material: p }, level: 9 }).materialFactor, r4(1 - 0.04 * p));
    assert.equal(setupOrder({ points: { speed: p }, level: 9 }).buildFactor, r4(1 - 0.05 * p));
  }
  assert.equal(setupOrder({ points: { speed: 9 }, level: 3 }).quick, 0.15, 'points never pass the level');
});

test('determinism: the same seed gives the same cold start and tile layout; starts are 18 to 24 and every layout turns up', () => {
  assert.deepEqual(game({}, 7).layout, game({}, 7).layout); assert.equal(game({}, 7).start, game({}, 7).start);
  const starts = new Set(), layouts = new Set();
  for (let seed = 1; seed <= 300; seed++) { const s = game({}, seed); starts.add(s.start); layouts.add(s.layout.join()); assert.deepEqual([...s.layout].sort(), ['butter', 'salt', 'steak', 'turn']); assert.ok(s.start >= 18 && s.start <= 24); }
  assert.equal(starts.size, 7); assert.ok(layouts.size >= 12, `${layouts.size} layouts`);
});

test('the heat curve: a cold start, 5 a second to 80, 1.5 a second to 100, then flat; the inverse agrees', () => {
  const s = game({}, 3), a = s.start; assert.equal(O.heatAt(s, 0), a);
  const tw = (40 - a) / 5; assert.ok(Math.abs(O.heatAt(s, tw) - 40) < 1e-9); assert.ok(Math.abs(O.heatAt(s, tw + 4) - 60) < 1e-9); assert.ok(Math.abs(O.heatAt(s, tw + 8) - 80) < 1e-9);
  assert.ok(Math.abs(O.heatAt(s, tw + 8 + 6) - 89) < 1e-9, '1.5 a second above 80');
  assert.equal(O.heatAt(s, 500), 100); assert.equal(O.heatAt(s, -3), a);
  let prev = -1; for (let t = 0; t < 40; t += 0.25) { const h = O.heatAt(s, t); assert.ok(h >= prev); prev = h; }
  for (const h of [25, 40, 55, 70, 80, 90, 100]) { if (h < a) continue; const t = O.timeAtHeat(s, h); assert.ok(Math.abs(O.heatAt(s, t) - h) < 1e-9, `inverse at ${h}`); }
  assert.equal(O.timeAtHeat(s, a - 5), 0); assert.equal(O.timeAtHeat(s, 101), Infinity);
});

test('Speed: the pan warms quicker only up to the butter heat; every window after that is the same length', () => {
  const base = game({}, 3), fast = game({ points: { speed: 9 } }, 3), a = base.start;
  assert.ok(O.timeAtHeat(fast, 40) < O.timeAtHeat(base, 40), 'it warms up quicker');
  assert.ok(Math.abs(O.timeAtHeat(base, 40) - (40 - a) / 5) < 1e-9); assert.ok(Math.abs(O.timeAtHeat(fast, 40) - (40 - a) / 7.25) < 1e-9);
  const shift = O.timeAtHeat(base, 40) - O.timeAtHeat(fast, 40);
  for (const h of [50, 60, 80, 90, 100]) assert.ok(Math.abs((O.timeAtHeat(base, h) - O.timeAtHeat(fast, h)) - shift) < 1e-9, `the same curve above 40, just earlier (${h})`);
  // so the butter window is as long, and the burn comes as many seconds after it
  const wb = O.windowOf(base, 0), wf = O.windowOf(fast, 0); assert.ok(Math.abs((wb.close - wb.open) - (wf.close - wf.open)) < 1e-9);
  assert.ok(Math.abs((O.burnAt(base) - O.burnAt(fast)) - shift) < 1e-9);
});

test('the windows: butter heat 40 to 60; steak heat 70 to 90 and 3 to 9 s after the butter; salt within 4 s of the steak; turn 8 to 10 s after the steak', () => {
  const s = game({}, 3);
  const wb = O.windowOf(s, 0); assert.deepEqual(wb.heat, [40, 60]); assert.equal(wb.time, null); assert.ok(Math.abs(wb.close - wb.open - 4) < 1e-9, 'a 4 s window at 5 a second');
  assert.equal(O.windowOf(s, 1), null, 'no window until the butter is in');
  const b = (wb.open + wb.close) / 2; O.orderAdd(s, b, 'butter');
  const wm = O.windowOf(s, 1); assert.deepEqual(wm.heat, [70, 90]); assert.deepEqual(wm.time, [b + 3, b + 9]); assert.equal(wm.open, Math.max(b + 3, O.timeAtHeat(s, 70))); assert.equal(wm.close, Math.min(b + 9, O.timeAtHeat(s, 90)));
  const m = (wm.open + wm.close) / 2; O.orderAdd(s, m, 'steak');
  const ws = O.windowOf(s, 2); assert.deepEqual(ws.time, [m, m + 4]); assert.deepEqual(ws.heat, [60, 100]);
  const wt = O.windowOf(s, 3); assert.deepEqual(wt.time, [m + 8, m + 10]); assert.deepEqual(wt.heat, [70, 100]);
});

test('a clean batch: every ingredient in its window gives 100', () => {
  for (let seed = 1; seed <= 40; seed++) { const s = perfect(game({}, seed)); assert.ok(s.done && s.result.success && s.result.grade === 100 && s.result.how === 'done' && s.result.added === 4, `seed ${seed}`); assert.equal(s.result.word, 'perfect'); }
  assert.equal(O.orderWhy(perfect(game({}, 3)).result), '');
});

test('outside the heat band costs 10; outside the time window costs 10; both is 20', () => {
  // the butter into a pan that is too cold, then too hot
  const cold = game({}, 3); O.orderAdd(cold, 0.5, 'butter'); assert.equal(cold.misses.length, 1); assert.deepEqual(cold.misses[0].what, 'heat'); assert.equal(O.gradeOf(cold), 90);
  const hot = game({}, 3); O.orderAdd(hot, O.timeAtHeat(hot, 61), 'butter'); assert.equal(O.gradeOf(hot), 90);
  const edge = game({}, 3); O.orderAdd(edge, O.timeAtHeat(edge, 60), 'butter'); assert.equal(O.gradeOf(edge), 100, 'the edge counts');
  // the steak at the right heat but too soon after the butter: a time miss only
  const probe = game({}, 3), b = O.timeAtHeat(probe, 60); O.orderAdd(probe, b, 'butter'); const early = O.timeAtHeat(probe, 70);
  assert.ok(early < b + 3, 'butter at the top of its band: the pan is hot 2 s later, before the butter has foamed');
  O.orderAdd(probe, early, 'steak'); assert.deepEqual(probe.misses.map((x) => x.what), ['time']); assert.equal(O.gradeOf(probe), 90);
  // the steak at the right time but into a cooler pan: a heat miss only (the butter went in late, so the foam window opens before the pan is hot)
  const w = game({}, 3); O.orderAdd(w, O.timeAtHeat(w, 41), 'butter'); const t = O.windowOf(w, 1).time[0] + 0.1; assert.ok(O.heatAt(w, t) < 70); O.orderAdd(w, t, 'steak');
  assert.deepEqual(w.misses.map((x) => x.what), ['heat']);
  // both
  const both = game({}, 3); O.orderAdd(both, 0.2, 'butter'); O.orderAdd(both, 0.7, 'steak'); assert.equal(O.gradeOf(both), 100 - 10 - 10 - 10, 'butter heat, steak heat and time');
  assert.match(O.orderWhy(both.result || { grade: 70, wrong: 0, heatMisses: 2, timeMisses: 1, how: 'done' }), /in the wrong heat \(-10 each\)/);
});

test('wrong order spoils it: -15, the ingredient is not used and the recipe waits; three wrongs end it', () => {
  const s = game({}, 3); const r = O.orderAdd(s, 2, 'salt'); assert.equal(r.outcome, 'wrong'); assert.equal(s.next, 0, 'still waiting for the butter'); assert.equal(s.taps.length, 0);
  assert.equal(O.gradeOf(s), 85); assert.deepEqual(s.wrongs[0], { id: 'salt', t: 2, wanted: 'butter' }); assert.ok(s.events.some((e) => e.type === 'wrong' && e.id === 'salt'));
  O.orderAdd(s, 3, 'steak'); assert.equal(O.gradeOf(s), 70); assert.ok(!s.done, '70 still passes');
  O.orderAdd(s, 4, 'turn'); assert.ok(s.done && s.result.how === 'rough' && !s.result.success && s.result.grade === 55 && s.result.wrong === 3);
  // tapping an ingredient that is already in is out of order too
  const u = game({}, 3); O.orderAdd(u, mid(u, 0), 'butter'); O.orderAdd(u, mid(u, 0) + 0.5, 'butter'); assert.equal(u.wrongs.length, 1); assert.equal(u.next, 1);
  assert.equal(O.orderAdd(u, 5, 'nope'), null, 'not a tile');
});

test('the roll widens or narrows every band and window by 15% a tier, about the middle', () => {
  for (const t of TIERS) {
    const s = game({ tier: t }, 3), f = 1 + 0.15 * t;
    assert.ok(Math.abs(s.steps[0].heat[0] - (50 - 10 * f)) < 1e-9 && Math.abs(s.steps[0].heat[1] - (50 + 10 * f)) < 1e-9, `butter band at ${t}`);
    assert.ok(Math.abs(s.steps[1].heat[0] - (80 - 10 * f)) < 1e-9);
    assert.ok(Math.abs(s.steps[1].after[0] - (6 - 3 * f)) < 1e-9 && Math.abs(s.steps[1].after[1] - (6 + 3 * f)) < 1e-9, `steak foam window at ${t}`);
    assert.ok(Math.abs(s.steps[3].after[0] - (9 - f)) < 1e-9 && Math.abs(s.steps[3].after[1] - (9 + f)) < 1e-9, `turn window at ${t}`);
    assert.ok(Math.abs(s.steps[2].after[1] - (2 + 2 * f)) < 1e-9);
    assert.ok(Math.abs(s.steps[2].heat[0] - (100 - 40 * f)) < 1e-9 && s.steps[2].heat[1] === 100, 'salt: only the low edge moves');
  }
  const rough = game({ tier: -2 }, 3), smooth = game({ tier: 2 }, 3);
  assert.ok(O.windowOf(smooth, 0).close - O.windowOf(smooth, 0).open > O.windowOf(rough, 0).close - O.windowOf(rough, 0).open);
});

test('the words: too early / now / late / burning for the next ingredient, and none after the end; no numbers', () => {
  const s = game({}, 3), w = O.windowOf(s, 0);
  assert.equal(O.orderWord(s, 0), 'too early'); assert.equal(O.orderWord(s, w.open), 'now'); assert.equal(O.orderWord(s, (w.open + w.close) / 2), 'now'); assert.equal(O.orderWord(s, w.close), 'now');
  assert.equal(O.orderWord(s, w.close + 0.2), 'burning', 'butter in a pan hotter than its band is burning');
  O.orderAdd(s, mid(s, 0), 'butter'); const m = O.windowOf(s, 1);
  assert.equal(O.orderWord(s, m.open - 0.5), 'too early'); assert.equal(O.orderWord(s, m.open), 'now');
  assert.ok(['late', 'burning'].includes(O.orderWord(s, m.close + 0.3)));
  O.orderAdd(s, (m.open + m.close) / 2, 'steak'); const sm = (m.open + m.close) / 2, ws = O.windowOf(s, 2);
  assert.equal(O.orderWord(s, sm + 1), 'now'); assert.equal(O.orderWord(s, sm + 4.3), 'late');
  assert.equal(O.orderWord(s, O.burnAt(s) - 0.5) === 'burning', true, 'late and nearly at the end of the curve: burning');
  perfect(game({}, 1)); const d = perfect(game({}, 2)); assert.equal(O.orderWord(d, 5), '');
  for (const word of ['too early', 'now', 'late', 'burning']) assert.doesNotMatch(word, /\d/);
  void ws;
});

test('a pan left to burn: nothing more can be added in time, the grade drops 25 for each ingredient never added; Give up is 0', () => {
  const s = game({}, 3); O.orderAdd(s, mid(s, 0), 'butter'); O.orderTick(s, O.burnAt(s) - 0.1); assert.ok(!s.done);
  O.orderTick(s, O.burnAt(s) + 0.1); assert.ok(s.done && s.result.how === 'burnt' && !s.result.success && s.result.missing === 3 && s.result.grade === 25, JSON.stringify(s.result));
  assert.match(O.orderWhy(s.result), /the pan burnt, 3 never added/); assert.equal(O.orderAdd(s, 99, 'steak'), null);
  const idle = game({}, 3); O.orderTick(idle, 999); assert.equal(idle.result.grade, 0, 'a pan nobody touched');
  const g = game({}, 3); assert.equal(O.orderGiveUp(g).grade, 0); assert.ok(g.done);
  assert.equal(O.burnAt(game({}, 3)), O.timeAtHeat(game({}, 3), 100) + 6);
});

test('the grade is 100 minus the costs and three misses still pass, a fourth does not (the game ends there)', () => {
  const s = game({}, 3), t0 = O.timeAtHeat(s, 41); O.orderAdd(s, 0.2, 'butter'); assert.ok(!s.done);
  O.orderAdd(s, 0.7, 'steak'); assert.equal(O.gradeOf(s), 70); assert.ok(!s.done, 'exactly 70 passes');
  O.orderAdd(s, 1.2, 'salt'); assert.ok(s.done && s.result.how === 'rough' && s.result.grade === 60 && !s.result.success);
  void t0;
});

// ---- the chain ------------------------------------------------------------------------------------------------------------------
test('the chain: the Sear a steak recipe runs through the shared rules (pass, redo and spoil, ruin)', () => {
  const rec = G.createRecipe({ recipe: G.RECIPES.steak, tier: 0, level: 9, seed: 3 }), cur = G.current(rec);
  assert.equal(cur.kind, 'order'); assert.equal(cur.setup.kind, 'order'); assert.equal(cur.setup.f, 1);
  assert.equal(G.RECIPES.steak.name, 'Sear a steak'); assert.equal(G.RECIPES.steak.materials, 4); assert.equal(G.RECIPES.steak.build, 30); assert.equal(G.KIND_NAME.order, 'Order');
  assert.equal(G.submit(rec, 60), 'redo'); assert.equal(rec.spoils, 1); assert.equal(G.submit(rec, 60), 'redo'); assert.equal(G.submit(rec, 60), 'ruined');
  const ok = G.createRecipe({ recipe: G.RECIPES.steak, level: 9, seed: 3 }); assert.equal(G.submit(ok, 100), 'passed'); assert.equal(ok.result.grades[0].kind, 'order');
  const mixed = G.createRecipe({ recipe: { id: 'x', name: 'x', what: 'x', materials: 4, build: 30, steps: [{ name: 'Cook', games: [{ kind: 'order' }, { kind: 'cut' }] }] }, level: 9 });
  assert.equal(G.submit(mixed, 90), 'passed'); assert.equal(G.current(mixed).kind, 'cut'); assert.match(G.partLine(mixed), /Order 90, next Cut/); assert.equal(JSON.parse(JSON.stringify(mixed)).list[0].kind, 'order');
});

test('the point picker, the roll preview, the chips and the bench say what Order does', () => {
  assert.match(CATEGORIES.crafting.cats[1].words(3), /Order: the cold pan warms 15% faster up to the butter's heat/);
  const smooth = rollPreview('steak', { total: 25, dc: 10 }, { level: 9 }), rough = rollPreview('steak', { total: 1, dc: 10 }, { level: 9 });
  assert.match(smooth.line, /every heat band and time window 30% wider/); assert.match(rough.line, /30% narrower/);
  assert.equal(rollPreview('steak', { total: 12, dc: 10 }, { level: 9 }).phrases.length, 0); assert.ok(Object.keys(CHAIN_SPECS).includes('steak'));
  const chips = effectChips('order', setupOrder({ tier: 1, points: { speed: 4 }, level: 9 })).map((c) => c.text);
  assert.ok(chips.some((c) => /Good roll: wider heat bands and time windows/.test(c)), chips.join('|')); assert.ok(chips.some((c) => /Speed 4: the cold pan warms 20% faster/.test(c)));
  assert.ok(effectChips('order', setupOrder({ level: 9 })).some((c) => /Speed 0: normal warm-up/.test(c.text)));
  const state = freshState(), st = { ...stationById('craft'), id: 'steak', label: 'order' }, start = startStation(state, st, { total: 15, dc: 10, natural: false });
  assert.equal(start.setup.kind, 'order'); assert.match(start.preview.line, /Good roll/);
  assert.match(settleStation(state, st, { success: true, xp: 5 }).said, /you did it[\s\S]*\+5 Crafting XP/);
});

// ---- the bots ----------------------------------------------------------------------------------------------------------------------------
const TABLE = {};
/**
 * A hand: aims at the middle of each ingredient's window, off by `lag` seconds plus a wobble of `sd` seconds (never before the last tap).
 * The pour's "wobbly" hand is a reaction; here the plan's windows are 2 to 6 s wide and three misses still pass, so the hand that gives the
 * target curve is a loose one: it taps within about 3.5 s of the middle (sd 3.55 s, 0.3 s early on average).
 */
function hand(setup, seed, { lag = 0, sd = 0 } = {}) {
  const s = O.createOrder({ seed, setup }), r = lcg(seed * 7 + 1);
  for (let i = 0; i < s.steps.length && !s.done; i++) { const w = O.windowOf(s, i); O.orderAdd(s, Math.max(s.t, (w.open + Math.min(w.close, w.open + 40)) / 2 + lag + sd * gauss(r)), s.steps[i].id); }
  return s;
}
const sweep = (fn, n = 400) => { let pass = 0, sum = 0, sec = 0; for (let i = 1; i <= n; i++) { const s = fn(i); if (s.done && s.result.success) pass++; sum += s.done ? s.result.grade : 0; sec += s.result?.seconds ?? 0; } return { rate: pass / n, avg: sum / n, sec: sec / n }; };
const WOBBLY = { lag: -0.3, sd: 3.55 };

test('perfect bot: every dish clean at every roll and with every Speed point (grade 100)', () => {
  for (const t of TIERS) for (const sp of [0, 9]) {
    const r = sweep((i) => hand(setupOrder({ tier: t, level: 9, points: { speed: sp } }), i), 200);
    TABLE[`perfect t${t} speed${sp}`] = { rate: r.rate, seconds: +r.sec.toFixed(1) }; assert.equal(r.rate, 1, `perfect, tier ${t}, speed ${sp}`); assert.equal(r.avg, 100);
  }
});

test('game length: a good hand takes 10 to 30 seconds', () => {
  const r = sweep((i) => hand(setupOrder({ level: 9 }), i, { lag: 0, sd: 0.4 }), 300), f = sweep((i) => hand(setupOrder({ level: 9, points: { speed: 9 } }), i, { lag: 0, sd: 0.4 }), 300);
  TABLE['good hand seconds, speed 0'] = +r.sec.toFixed(1); TABLE['good hand seconds, speed 9'] = +f.sec.toFixed(1);
  assert.ok(r.sec >= 10 && r.sec <= 30, `${r.sec}`); assert.ok(f.sec >= 10 && f.sec < r.sec, `nine points: ${f.sec}`);
});

test('lazy hands never pass: never touching the pan, everything at once, backwards, mashing', () => {
  for (const t of TIERS) {
    const idle = sweep((i) => { const s = game({ tier: t }, i); O.orderTick(s, 999); return s; }, 60); assert.equal(idle.rate, 0); TABLE[`lazy idle t${t}`] = idle.rate;
    const rush = sweep((i) => { const s = game({ tier: t }, i); for (const [k, st] of s.steps.entries()) O.orderAdd(s, 0.3 + 0.2 * k, st.id); return s; }, 60); assert.equal(rush.rate, 0, 'all in before the pan is warm'); TABLE[`rush t${t}`] = rush.rate;
    const back = sweep((i) => { const s = game({ tier: t }, i); [...s.steps].reverse().forEach((st, k) => O.orderAdd(s, 6 + k, st.id)); return s; }, 60); assert.equal(back.rate, 0, 'backwards'); TABLE[`backwards t${t}`] = back.rate;
    const mash = sweep((i) => { const s = game({ tier: t }, i), r = lcg(i); for (let k = 0; k < 80 && !s.done; k++) O.orderAdd(s, 0.4 * k, s.steps[Math.floor(r() * 4)].id); return s; }, 100); assert.ok(mash.rate <= 0.02, `mashing: ${mash.rate}`); TABLE[`mash t${t}`] = mash.rate;
  }
});

test('wobbly bot: about 35 to 50% at the worst roll, 70 to 80% at Steady, 90% or more at the best (a slope, not a cliff)', () => {
  const rates = TIERS.map((t) => sweep((i) => hand(setupOrder({ tier: t, level: 9 }), i, WOBBLY), 1000));
  TIERS.forEach((t, i) => { TABLE[`wobbly t${t}`] = { rate: +rates[i].rate.toFixed(3), avg: +rates[i].avg.toFixed(1), seconds: +rates[i].sec.toFixed(1) }; });
  const r = rates.map((x) => x.rate);
  assert.ok(r[0] >= 0.35 && r[0] <= 0.55, `Rough: ${r}`); assert.ok(r[2] >= 0.7 && r[2] <= 0.85, `Steady: ${r}`); assert.ok(r[4] >= 0.88, `Smooth: ${r}`);
  for (let i = 1; i < r.length; i++) { assert.ok(r[i] >= r[i - 1] - 0.02, `roll never hurts: ${r}`); assert.ok(r[i] - r[i - 1] < 0.3, `no cliff: ${r}`); }
});

test('Speed never makes it worse: a wobbly hand at 9 points passes at least as often as at 0 (and an early and a late hand)', () => {
  for (const [name, h] of [['wobbly', WOBBLY], ['early', { lag: -2, sd: 2 }], ['late', { lag: 2, sd: 2 }]]) {
    const by = [0, 3, 6, 9].map((p) => sweep((i) => hand(setupOrder({ tier: 0, points: { speed: p }, level: 9 }), i, h), 800));
    [0, 3, 6, 9].forEach((p, i) => { TABLE[`${name} steady speed${p}`] = { rate: +by[i].rate.toFixed(3), seconds: +by[i].sec.toFixed(1) }; });
    for (let i = 1; i < by.length; i++) assert.ok(by[i].rate >= by[i - 1].rate - 0.015, `${name}: points do not hurt: ${by.map((x) => x.rate)}`);
    assert.ok(by[3].rate >= by[0].rate - 0.01, `${name}: nine points are no worse than none`);
  }
});

test('each crafting path visibly changes something: Quality (+4), Material (-4%), Speed (a quicker warm-up, a shorter build)', () => {
  const base = setupOrder({ level: 9 }), q = setupOrder({ level: 9, points: { quality: 5 } }), m = setupOrder({ level: 9, points: { material: 5 } }), sp = setupOrder({ level: 9, points: { speed: 5 } });
  assert.equal(q.qualityBonus - base.qualityBonus, 20); assert.ok(m.materialFactor < base.materialFactor); assert.ok(sp.quick > base.quick && sp.buildFactor < base.buildFactor);
  assert.ok(O.timeAtHeat(game({ points: { speed: 5 } }, 3), 40) < O.timeAtHeat(game({}, 3), 40));
  const rec = (points) => G.createRecipe({ recipe: G.RECIPES.steak, level: 9, points, seed: 1 });
  const a = rec({}), b = rec({ quality: 5 }); G.submit(a, 80); G.submit(b, 80); assert.equal(b.result.quality - a.result.quality, 20);
  const c = rec({ speed: 5 }); G.submit(c, 80); assert.ok(c.result.buildSeconds < a.result.buildSeconds);
});

test.after(() => { if (process.env.ORDER_TABLE) console.log(JSON.stringify(TABLE, null, 1)); });
