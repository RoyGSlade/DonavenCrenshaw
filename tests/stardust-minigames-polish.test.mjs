// Polish, the fifth game of the crafting chain (v2/PLAN.md section 4.3): every rule of the spec as an exact test (the wheel and its pull,
// shine at 60 a second, polished at 70, dimpled at 130, the automatic finish at 36, three dimples ruin it, the grade), the roll and the
// Speed path as tables, the chain wiring, and a bot sweep (perfect, slow-handed and lazy hands at every roll). Pure: no DOM.
//   POLISH_TABLE=1 node --test tests/stardust-minigames-polish.test.mjs   prints the pass-rate table
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../projects/Space-Shooter/voyage/minigames/polish.js';
import * as G from '../projects/Space-Shooter/voyage/minigames/craftChain.js';
import { setupPolish, POLISH_BASE } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { rollPreview, CHAIN_SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { startStation, settleStation, stationById } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const r4 = (x) => Math.round(+x.toFixed(6) * 10000) / 10000;
const TIERS = [-2, -1, 0, 1, 2], DT = 1 / 60;
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const game = (o = {}, seed = 1, portrait = false) => P.createPolish({ seed, setup: setupPolish({ level: 9, ...o }), portrait });
/** Run `seconds` of game time with a constant input. */
function run(s, seconds, input = { x: 0, y: 0 }) { for (let i = 0; i < Math.round(seconds / DT) && !s.done; i++) P.polishStep(s, DT, input); return s; }
/** Put the wheel somewhere and hold it there for `seconds` against the pull (the exact input that cancels it). */
function holdAt(s, x, y, seconds) { s.wheel.x = x; s.wheel.y = y; for (let i = 0; i < Math.round(seconds / DT) && !s.done; i++) { s.wheel.x = x; s.wheel.y = y; P.polishStep(s, DT, { x: 0, y: 0 }); } s.wheel.x = x; s.wheel.y = y; return s; }

// ---- setup tables ------------------------------------------------------------------------------------------------------------
test('Polish setup: the pull and the dimple limit by roll, the shine rate by Speed points, exact tables', () => {
  assert.deepEqual([POLISH_BASE.pullMin, POLISH_BASE.pullMax, POLISH_BASE.limit, POLISH_BASE.rate], [40, 140, 130, 60]);
  for (const t of TIERS) {
    const u = setupPolish({ tier: t, level: 9 });
    assert.equal(u.pullMin, r4(40 * (1 - 0.05 * t)), `pull low at ${t}`); assert.equal(u.pullMax, r4(140 * (1 - 0.05 * t)), `pull high at ${t}`); assert.equal(u.limit, 130 + 4 * t, `limit at ${t}`);
  }
  assert.equal(setupPolish({ tier: 2 }).limit, 138); assert.equal(setupPolish({ tier: -2 }).limit, 122); assert.equal(setupPolish({ tier: -2 }).pullMax, 154, 'Rough: pull x1.1'); assert.equal(setupPolish({ tier: 2 }).pullMax, 126, 'Smooth: pull x0.9');
  for (let p = 0; p <= 9; p++) {
    assert.equal(setupPolish({ points: { speed: p }, level: 9 }).rate, r4(60 * (1 + 0.05 * p)), `shine rate at ${p} points`);
    assert.equal(setupPolish({ points: { quality: p }, level: 9 }).qualityBonus, 4 * p);
    assert.equal(setupPolish({ points: { material: p }, level: 9 }).materialFactor, r4(1 - 0.04 * p));
    assert.equal(setupPolish({ points: { speed: p }, level: 9 }).buildFactor, r4(1 - 0.05 * p));
  }
  assert.equal(setupPolish({ points: { speed: 9 }, level: 9 }).rate, 87, 'nine points: 60 up to 87'); assert.equal(setupPolish({ points: { speed: 9 }, level: 9 }).baseRate, 60, 'the base rate stays 60 for the heat');
  assert.equal(setupPolish({ points: { speed: 9 }, level: 3 }).rate, r4(60 * 1.15), 'points never pass the level');
});

// ---- the model ------------------------------------------------------------------------------------------------------------------
test('the plate is 40 cells (8 x 5, or 5 x 8 on a portrait screen), 60 units each, all dull, the wheel in the middle', () => {
  for (const portrait of [false, true]) {
    const s = game({}, 1, portrait);
    assert.equal(s.cells.length, 40); assert.deepEqual([s.cols, s.rows], portrait ? [5, 8] : [8, 5]); assert.deepEqual([s.W, s.H], portrait ? [300, 480] : [480, 300]);
    assert.ok(s.cells.every((c) => c.shine === 0 && c.state === 'dull')); assert.deepEqual(s.wheel, { x: s.W / 2, y: s.H / 2 });
    assert.deepEqual([s.cells[0].x, s.cells[0].y], [30, 30]); assert.deepEqual([s.cells[39].x, s.cells[39].y], [s.W - 30, s.H - 30]);
  }
});

test('the pull: 40 to 140 units a second to the left, a new strength every 1.5 to 3 s, seeded, scaled by the roll', () => {
  const s = game({}, 5);
  assert.deepEqual(s.segs.map((g) => r4(g.to - g.from)).filter((d) => d < 1.5 - 1e-9 || d > 3 + 1e-9), [], 'every stretch is 1.5 to 3 s');
  assert.ok(s.segs.every((g) => g.v >= 40 && g.v <= 140), 'every strength is 40 to 140'); assert.ok(new Set(s.segs.map((g) => Math.round(g.v))).size > 20, 'it changes');
  assert.deepEqual(game({}, 5).segs, s.segs); assert.notDeepEqual(game({}, 6).segs, s.segs);
  for (let t = 0; t < 120; t += 0.37) { const v = P.pullAt(s, t); assert.ok(v >= 40 - 1e-9 && v <= 140 + 1e-9, `pull at ${t}: ${v}`); }
  for (const tier of TIERS) { const u = game({ tier }, 5); for (let t = 0; t < 60; t += 0.7) assert.ok(Math.abs(P.pullAt(u, t) - P.pullAt(s, t) * (1 - 0.05 * tier)) < 1e-6, `scaled at ${tier}`); }
  assert.equal(P.pullAt(s, 0), s.segs[0].v); assert.ok(Math.abs(P.pullAt(s, s.segs[0].to + 1.2) - s.segs[1].v) < 1e-9, 'eased in 1.2 s'); const mid = P.pullAt(s, s.segs[0].to + 0.6); assert.ok(Math.abs(mid - (s.segs[0].v + s.segs[1].v) / 2) < 1e-9, 'halfway at 0.6 s');
});

test('the wheel: 220 units a second under your hand, pulled left all the time, kept on the plate; the input is cut to length 1', () => {
  const s = game({}, 5), x0 = s.wheel.x, y0 = s.wheel.y;
  P.polishStep(s, 0.1, { x: 0, y: 0 }); assert.ok(Math.abs(s.wheel.x - (x0 - 0.1 * P.pullAt(s, 0))) < 1e-9, 'idle: the pull carries it left'); assert.equal(s.wheel.y, y0);
  const u = game({}, 5); P.polishStep(u, 0.1, { x: 0, y: 1 }); assert.ok(Math.abs(u.wheel.y - (u.H / 2 + 22)) < 1e-9, '220 a second down'); 
  const d = game({}, 5); P.polishStep(d, 0.1, { x: 1, y: 1 }); assert.ok(Math.abs(d.wheel.y - (d.H / 2 + 22 / Math.SQRT2)) < 1e-9, 'a diagonal is no faster');
  const f = game({}, 5); P.polishStep(f, 0.1, { x: 50, y: 0 }); assert.ok(Math.abs(f.wheel.x - (f.W / 2 + 22 - 0.1 * P.pullAt(f, 0))) < 1e-9, 'a long vector is cut to 1');
  const e = game({}, 5); e.cells.forEach((c) => { c.state = 'dimpled'; }); run(e, 20, { x: 0, y: 0 }); assert.equal(e.wheel.x, 0, 'pulled to the left edge and kept on the plate');
  const r = game({}, 5); run(r, 10, { x: 1, y: -1 }); assert.ok(r.wheel.x <= r.W && r.wheel.y === 0 && r.wheel.x > 0);
  assert.equal(P.polishStep(game(), 0, { x: 1, y: 0 }).t, 0); assert.equal(P.polishStep(game(), -1, { x: 1, y: 0 }).t, 0);
  const n = game({}, 5); P.polishStep(n, DT, { x: NaN, y: undefined }); assert.ok(Number.isFinite(n.wheel.x));
});

test('cells under the wheel gain shine at 60 a second (87 at nine Speed points): a cell is covered within 54 units of its middle', () => {
  const s = game({}, 5), c18 = s.cells[18], c19 = s.cells[19]; // (150, 150) and (210, 150): 60 apart
  s.wheel.x = c18.x; s.wheel.y = c18.y;
  assert.equal(P.coveredBy(s).length, 1, 'one cell at a middle (the neighbours are 60 away)');
  assert.equal(P.coveredBy(s, { x: 180, y: 150 }).length, 2, 'two on an edge (30 away each)'); assert.equal(P.coveredBy(s, { x: 180, y: 180 }).length, 4, 'four at a corner (42 away each)');
  assert.equal(P.coveredBy(s, { x: 150 + 54, y: 150 }).filter((c) => c === c18).length, 1, 'inside at 54'); assert.equal(P.coveredBy(s, { x: 150 + 54.5, y: 150 }).filter((c) => c === c18).length, 0, 'outside past 54');
  holdAt(s, c18.x, c18.y, 0.5); assert.ok(Math.abs(c18.shine - 30) < 0.5, `half a second: ${c18.shine}`);
  assert.ok(s.cells.filter((x) => x !== c18).every((x) => x.shine === 0), 'nothing else moved'); void c19;
  const f = game({ points: { speed: 9 } }, 5); holdAt(f, f.cells[18].x, f.cells[18].y, 0.5); assert.ok(Math.abs(f.cells[18].shine - 43.5) < 0.5, 'nine points: 87 a second below polished');
  // above polished the heat builds at the base 60: Speed points never shrink the margin before a dimple
  const g = game({ points: { speed: 9 } }, 5), c = g.cells[18]; c.shine = 80; c.state = 'polished'; g.polished = 1; holdAt(g, c.x, c.y, 0.5); assert.ok(Math.abs(c.shine - 110) < 0.5, `from 80 at the base rate: ${c.shine}`);
  const b = game({}, 5), d = b.cells[18]; d.shine = 80; d.state = 'polished'; b.polished = 1; holdAt(b, d.x, d.y, 0.5); assert.ok(Math.abs(d.shine - 110) < 0.5);
  const dim = game({ points: { speed: 9 } }, 5); holdAt(dim, dim.cells[18].x, dim.cells[18].y, 0.8 + 60 / 60 + 0.05); assert.equal(dim.cells[18].state, 'dimpled', 'a dimple from 70 takes the same 1.0 s at nine points as at none');
});

test('polished at 70: the cell counts once; the plate counts polished cells', () => {
  const s = game({}, 5); holdAt(s, 150, 150, 1.1); const c = P.coveredBy(s)[0];
  assert.equal(c.state, 'dull'); assert.equal(s.polished, 0); holdAt(s, 150, 150, 0.1);
  assert.equal(c.state, 'polished'); assert.equal(s.polished, 1); assert.deepEqual(s.events.filter((e) => e.type === 'polished').length, 1);
  holdAt(s, 150, 150, 0.3); assert.equal(s.polished, 1, 'grinding on does not count it twice');
});

test('dimpled at 130 (138 at Smooth, 122 at Rough): the cell stays dimpled, no longer counts, and costs 10', () => {
  for (const [tier, limit] of [[0, 130], [2, 138], [-2, 122]]) {
    const s = game({ tier }, 5), c = s.cells.find((x) => Math.hypot(x.x - 150, x.y - 150) < 1);
    holdAt(s, 150, 150, (limit - 1) / 60); assert.equal(c.state, 'polished', `just under the limit at ${tier}`);
    holdAt(s, 150, 150, 0.05); assert.equal(c.state, 'dimpled', `dimpled at ${limit}`); assert.equal(s.dimples, 1); assert.equal(s.polished, 0, 'a dimpled cell is not polished');
    const shine = c.shine; holdAt(s, 150, 150, 1); assert.equal(c.shine, shine, 'a dimpled cell takes no more shine'); assert.equal(s.dimples, 1);
    assert.equal(P.gradeOf(s), 0 - 0 > 0 ? 0 : Math.max(0, -10));
  }
});

test('three dimples ruin the plate (grade 0); 36 polished cells finish it by itself; Done finishes it; Give up is 0', () => {
  const s = game({}, 5); let t = 0;
  for (const [x, y] of [[150, 150], [210, 150], [270, 150]]) { holdAt(s, x, y, 2.4); t++; if (s.done) break; }
  assert.ok(s.done && s.result.how === 'ruined' && s.result.grade === 0 && !s.result.success && s.dimples === 3, 'three dimples');
  assert.match(P.polishWhy(s.result), /three dimples ruined/);
  const a = game({}, 5); for (const c of a.cells.slice(0, 35)) { c.shine = 80; c.state = 'polished'; a.polished++; } holdAt(a, a.cells[35].x, a.cells[35].y, 1.3);
  assert.ok(a.done && a.result.how === 'auto' && a.result.polished >= 36, 'finishes at 36'); assert.equal(a.result.grade, Math.round(a.polished / 40 * 100 - 10 * a.dimples));
  const b = game({}, 5); for (const c of b.cells.slice(0, 30)) { c.shine = 80; c.state = 'polished'; b.polished++; }
  assert.equal(P.polishFinish(b).grade, 75); assert.equal(b.result.how, 'done'); assert.ok(b.result.success);
  assert.equal(P.polishStep(b, 1, { x: 1, y: 0 }), b, 'a finished plate does not move'); assert.equal(P.polishGiveUp(b).grade, 75, 'it is already over');
  const g = game(); assert.equal(P.polishGiveUp(g).grade, 0); assert.ok(g.done);
});

test('the grade: polished share x 100 minus 10 a dimple, whole numbers, 90 at the automatic finish', () => {
  const s = game({}, 5);
  for (const [n, d, want] of [[0, 0, 0], [28, 0, 70], [28, 1, 60], [36, 0, 90], [36, 2, 70], [40, 0, 100], [10, 3, 0]]) { s.polished = n; s.dimples = d; assert.equal(P.gradeOf(s), want, `${n} polished, ${d} dimples`); }
  s.polished = 36; s.dimples = 0; const a = game({}, 5); a.polished = 36; assert.equal(P.gradeOf(a), 90);
  s.polished = 27; s.dimples = 0; assert.equal(P.gradeOf(s), 68, '27 of 40 is 67.5');
});

test('the words: keep going, nearly done, and the heat of the cell under the wheel (too hot! within 45 of its limit); no numbers', () => {
  const s = game({}, 5);
  assert.equal(P.plateWord(s), 'keep going'); s.polished = 19; assert.equal(P.plateWord(s), 'keep going'); s.polished = 20; assert.equal(P.plateWord(s), 'nearly done'); s.polished = 36; assert.equal(P.plateWord(s), 'done');
  const h = game({}, 5); h.wheel.x = 150; h.wheel.y = 150; assert.equal(P.heatWord(h), 'cool');
  holdAt(h, 150, 150, 0.5); assert.equal(P.heatWord(h), 'grinding'); holdAt(h, 150, 150, 0.9); assert.equal(P.heatWord(h), 'polished here: move on');
  holdAt(h, 150, 150, 0.55); const c = P.coveredBy(h)[0]; assert.ok(c.shine >= 105 && c.shine < 130, `${c.shine}`); assert.equal(P.heatWord(h), 'too hot!'); assert.equal(P.hotCell(h), c);
  const t = game({ tier: 2 }, 5); t.wheel.x = 150; t.wheel.y = 150; holdAt(t, 150, 150, 1.5); assert.equal(P.hotCell(t), null, 'Smooth: 90 is not yet hot (limit 138, hot from 93)');
  assert.ok(['light pull', 'steady pull', 'strong pull'].includes(P.pullWord(h)));
  assert.equal(P.motionWord(-60), 'with the pull: fast and light'); assert.equal(P.motionWord(60), 'against the pull: slow, grinds hard'); assert.equal(P.motionWord(0), 'on the spot: grinds hard, watch the heat'); assert.equal(P.motionWord(15), 'on the spot: grinds hard, watch the heat');
  for (const w of [P.plateWord(h), P.heatWord(h), P.pullWord(h), P.motionWord(-60), P.motionWord(60), P.motionWord(0)]) assert.doesNotMatch(w, /\d/);
});

// ---- the chain ----------------------------------------------------------------------------------------------------------------------
test('the chain: a Polish recipe runs through the shared rules (pass, redo and spoil, ruin)', () => {
  const rec = G.createRecipe({ recipe: G.RECIPES.polish, tier: 0, level: 9, seed: 3 }), cur = G.current(rec);
  assert.equal(cur.kind, 'polish'); assert.equal(cur.setup.kind, 'polish'); assert.equal(cur.setup.limit, 130);
  assert.equal(G.RECIPES.polish.name, 'Polish a plate'); assert.equal(G.RECIPES.polish.materials, 3); assert.equal(G.RECIPES.polish.build, 25); assert.equal(G.KIND_NAME.polish, 'Polish');
  assert.equal(G.submit(rec, 50), 'redo'); assert.equal(G.submit(rec, 50), 'redo'); assert.equal(G.submit(rec, 50), 'ruined');
  const ok = G.createRecipe({ recipe: G.RECIPES.polish, level: 9, seed: 3 }); assert.equal(G.submit(ok, 90), 'passed'); assert.equal(ok.result.grades[0].kind, 'polish');
  const hull = G.createRecipe({ recipe: { id: 'h', name: 'Hull patch', what: 'patch', materials: 4, build: 40, steps: [{ name: 'Shape', games: [{ kind: 'flatten' }] }, { name: 'Finish', games: [{ kind: 'polish' }] }] }, level: 9 });
  assert.equal(G.submit(hull, 90), 'passed'); assert.equal(G.current(hull).kind, 'polish'); assert.match(G.partLine(hull), /next Polish/);
});

test('the point picker, the roll preview and the bench say what Polish does', () => {
  assert.match(CATEGORIES.crafting.cats[1].words(3), /Polish: shine 15% faster/);
  const smooth = rollPreview('polish', { total: 25, dc: 10 }, { level: 9 }), rough = rollPreview('polish', { total: 1, dc: 10 }, { level: 9 });
  assert.match(smooth.line, /pulled 10% less/); assert.match(smooth.line, /takes longer to dimple/); assert.match(rough.line, /pulled 10% more/); assert.match(rough.line, /less time to dimple/);
  assert.equal(rollPreview('polish', { total: 12, dc: 10 }, { level: 9 }).phrases.length, 0); assert.ok(Object.keys(CHAIN_SPECS).includes('polish'));
  const state = freshState(), st = { ...stationById('craft'), id: 'polish', label: 'polish' }, start = startStation(state, st, { total: 15, dc: 10, natural: false });
  assert.equal(start.setup.kind, 'polish'); assert.match(start.preview.line, /Good roll/);
  assert.match(settleStation(state, st, { success: true, xp: 5 }).said, /you did it[\s\S]*\+5 Crafting XP/);
});

// ---- the bots: perfect, slow-handed and lazy, at every roll -------------------------------------------------------------------------------
const TABLE = {};
/**
 * A hand that polishes in passes along the lines between rows (the pull helps going left and fights going right), back and forth: a line between two
 * rows covers both at once, the last line of an odd plate runs along its edge. It aims at the net speed that lands a tile's shine in the safe part of
 * the polished-to-dimple range. `lag` is how old its picture of the pull is (seconds), `speedSd` how badly it judges its speed (a share), `jitter`
 * the wobble of the thumb, `ySd` how far it strays from its line (units), `react` how long a hot tile has to glow before it answers with full speed (seconds; null: it never looks), `frac` where in the range it aims (0 = just polished, 1 = just short of a dimple).
 */
const CHORD = 90; // the stretch of a line one tile is under the wheel, at 30 units off its middle
function passLines(s) { const out = []; for (let r = 0; r < s.rows; r += 2) out.push(r + 1 < s.rows ? (r + 1) * 60 : s.rows * 60); return out; }
function hand(setup, seed, { lag = 0, speedSd = 0, jitter = 0, ySd = 0, frac = 0.35, react = null, portrait = false, maxSeconds = 400 } = {}) {
  const s = P.createPolish({ seed, setup, portrait }), r = lcg(seed * 13 + 7), lines = passLines(s);
  let k = 0, dir = 1, st = 'start', yErr = 0, vErr = 0, hotFor = 0;
  for (let i = 0; i < Math.round(maxSeconds / DT) && !s.done; i++) {
    if (k >= lines.length) { P.polishFinish(s); break; }
    if (i % 30 === 0) { yErr = ySd * gauss(r); vErr = speedSd * gauss(r); }
    const y = lines[k] + yErr, pull = P.pullAt(s, Math.max(0, s.t - lag)), dy = y - s.wheel.y, iy = Math.max(-1, Math.min(1, dy / 25)) + jitter * gauss(r);
    const v = ((CHORD * s.rate) / (70 + frac * (s.limit - 70))) * (1 + vErr);
    let ix;
    if (st === 'start') { ix = -1; if (s.wheel.x <= 2 && Math.abs(dy) < 6 + Math.abs(yErr)) st = 'sweep'; }
    else { ix = (dir > 0 ? v + pull : pull - v) / 220 + jitter * gauss(r); if (dir > 0 ? s.wheel.x >= s.W - 2 : s.wheel.x <= 2) { k++; dir = -dir; } }
    if (react != null) { hotFor = P.hotCell(s) ? hotFor + DT : 0; if (hotFor >= react && st !== 'start') ix = dir > 0 ? 1 : -1; } // a hot tile is on the screen: after a reaction time the hand pushes on at full speed
    P.polishStep(s, DT, { x: ix, y: iy });
  }
  if (!s.done) P.polishFinish(s);
  return s;
}
const sweep = (fn, n = 120) => { let pass = 0, sum = 0, sec = 0; for (let i = 1; i <= n; i++) { const s = fn(i); if (s.result.success) pass++; sum += s.result.grade; sec += s.result.seconds; } return { rate: pass / n, avg: sum / n, seconds: Math.round((sec / n) * 10) / 10 }; };

test('perfect bot: polishes the plate row by row at every roll, wide and portrait, with and without Speed points (it aims low in the polished-to-dimple range, 35% of the way)', () => {
  for (const portrait of [false, true]) for (const t of TIERS) {
    const r = sweep((i) => hand(setupPolish({ tier: t, level: 9 }), i, { portrait }), 80);
    TABLE[`perfect t${t} ${portrait ? 'portrait' : 'wide'}`] = r.rate; TABLE[`perfect seconds t${t} ${portrait ? 'portrait' : 'wide'}`] = r.seconds; assert.ok(r.seconds >= 12 && r.seconds <= 35, `a good hand takes 20 to 35 s: ${r.seconds} at tier ${t} (portrait ${portrait})`); assert.ok(r.rate >= 0.97, `perfect, tier ${t}, portrait ${portrait}: ${r.rate}`);
    if (t >= 0) assert.ok(r.avg >= 85, `a clean plate: ${r.avg}`);
  }
  for (const t of [0, 2]) for (const sp of [3, 9]) { const r = sweep((i) => hand(setupPolish({ tier: t, level: 9, points: { speed: sp } }), i), 60); TABLE[`perfect t${t} speed${sp}`] = r.rate; assert.ok(r.rate >= 0.95, `perfect with ${sp} Speed points at tier ${t}: ${r.rate}`); }
  const s = hand(setupPolish({ level: 9 }), 4); assert.equal(s.dimples, 0); assert.ok(s.result.polished >= 36);
});

test('lazy hands never pass: hands off, one direction, scribbling, Done at once, giving up', () => {
  const idle = (setup, i) => { const s = P.createPolish({ seed: i, setup }); for (let k = 0; k < 6000 && !s.done; k++) P.polishStep(s, DT, { x: 0, y: 0 }); if (!s.done) P.polishFinish(s); return s; };
  const right = (setup, i) => { const s = P.createPolish({ seed: i, setup }); for (let k = 0; k < 6000 && !s.done; k++) P.polishStep(s, DT, { x: 1, y: 0 }); if (!s.done) P.polishFinish(s); return s; };
  const scribble = (setup, i) => { const s = P.createPolish({ seed: i, setup }), r = lcg(i * 3 + 1); let ix = 0, iy = 0; for (let k = 0; k < 4800 && !s.done; k++) { if (k % 12 === 0) { ix = r() * 2 - 1; iy = r() * 2 - 1; } P.polishStep(s, DT, { x: ix, y: iy }); } if (!s.done) P.polishFinish(s); return s; };
  const instant = (setup, i) => { const s = P.createPolish({ seed: i, setup }); P.polishFinish(s); return s; };
  for (const t of TIERS) for (const [name, bot] of Object.entries({ idle, right, scribble, instant })) {
    const r = sweep((i) => bot(setupPolish({ tier: t, level: 9 }), i), 80); TABLE[`lazy ${name} t${t}`] = r.rate;
    assert.ok(r.rate <= (name === 'scribble' ? 0.05 : 0), `${name} at tier ${t}: ${r.rate}`);
  }
  assert.ok(idle(setupPolish({ level: 9 }), 1).dimples >= 1, 'hands off: the pull drags it into the edge and the cell under it dimples');
});

test('slow-handed bot (late to see the pull, jittery thumb, a hand that misjudges its speed): a slope, not a cliff, with the roll', () => {
  const h = { lag: 0.5, speedSd: 0.2, jitter: 0.2, ySd: 12, react: 0.35 };
  const at = (tier, points = {}) => sweep((i) => hand(setupPolish({ tier, points, level: 9 }), i, h), 200).rate;
  const runs = TIERS.map((t) => sweep((i) => hand(setupPolish({ tier: t, level: 9 }), i, h), 200)), byTier = runs.map((r) => r.rate); TIERS.forEach((t, i) => { TABLE[`slow t${t}`] = byTier[i]; TABLE[`slow seconds t${t}`] = runs[i].seconds; });
  assert.ok(runs[2].seconds <= 45, `a wobbly hand at Steady: ${runs[2].seconds} s`);
  for (let i = 1; i < byTier.length; i++) { assert.ok(byTier[i] >= byTier[i - 1] - 0.04, `roll: ${byTier}`); assert.ok(byTier[i] - byTier[i - 1] < 0.5, `no cliff in the roll: ${byTier}`); }
  assert.ok(byTier[4] > byTier[0] + 0.4, `Smooth beats Rough: ${byTier}`);
  // Speed points must never make the game worse: they quicken the shine only up to polished, the heat toward a dimple builds at the base rate.
  const curve = [0, 3, 6, 9].map((p) => at(0, { speed: p })); [0, 3, 6, 9].forEach((p, i) => { TABLE[`slow steady speed${p}`] = curve[i]; });
  assert.ok(curve[3] >= curve[0], `nine Speed points are at least as good as none for the wobbly hand: ${curve}`);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1] - 0.03, `Speed points never make it worse: ${curve}`);
});

test.after(() => { if (process.env.POLISH_TABLE) console.log(JSON.stringify(TABLE, null, 1)); });
