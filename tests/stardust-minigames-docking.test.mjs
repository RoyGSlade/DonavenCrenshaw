// Docking at the star base: the pure rules, the roll and path scaling, and the bot sweep (the skill curve).
// DOCK_TABLE=1 prints the pass-rate table the lane reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocking, stepDocking, frameOf, halfAt, dockingWord, warnFill, dockingXp, dockingHandBack, DOCKING_DT, RB, DM, SHIP_R, SCRAPE, PASS, OUTCOMES } from '../projects/Space-Shooter/voyage/minigames/docking.js';
import { runBot, sweep, makeBot } from '../projects/Space-Shooter/voyage/minigames/dockingBot.js';
import { setupDocking, DOCKING_BASE, tierOf } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { rollPreview, CHAIN_SPECS, SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { CATEGORIES, describeCategory } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { endWords, tryWords, gradeWord } from '../projects/Space-Shooter/voyage/minigames/dockingView.js';

const STEADY = setupDocking({ tier: 0 });
const TIERS = [-2, -1, 0, 1, 2];
const fly = (s, steps, input) => { for (let i = 0; i < steps && !s.done; i++) stepDocking(s, DOCKING_DT, typeof input === 'function' ? input(s) : input); return s; };
/** Put the ship on the lane at distance d and offset l, at rest against the berth (so it rides the sweep for free), at time 0. */
function place(s, d, l, { vlane = 0, vlat = 0 } = {}) {
  const f = frameOf(s, s.t);
  s.x = f.B.x + f.u.x * d + f.n.x * l; s.y = f.B.y + f.u.y * d + f.n.y * l;
  s.vx = f.Vb.x - f.u.x * vlane + f.n.x * vlat; s.vy = f.Vb.y - f.u.y * vlane + f.n.y * vlat;
  return s;
}
/** Fly with the velocity against the berth held exactly (every step): the ship closes at `vlane`, slides `vlat` sideways, drag and thrust ignored. */
function glide(s, steps, { vlane = 0, vlat = 0, firstScrape = false } = {}) {
  for (let i = 0; i < steps && !s.done && !(firstScrape && s.scrapes); i++) {
    const f = frameOf(s);
    s.vx = f.Vb.x - f.u.x * vlane + f.n.x * vlat; s.vy = f.Vb.y - f.u.y * vlane + f.n.y * vlat;
    stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 });
  }
  return s;
}
/** The scene with no drag, no thrust: only the berth's motion carries the ship (relative velocity stays what place() gave). */
const coast = (s, n) => { for (let i = 0; i < n && !s.done; i++) { const f = frameOf(s); const before = { x: s.x, y: s.y }; void before; stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); void f; } return s; };

test('determinism: the same seed and the same hand give the same run; another seed gives another', () => {
  const sig = (seed, kind) => { const s = runBot(kind, { seed, setup: STEADY }); return JSON.stringify([s.t, s.x, s.y, s.vx, s.vy, s.hullLost, s.result]); };
  for (const kind of ['perfect', 'wobbly', 'mash']) assert.equal(sig(11, kind), sig(11, kind), kind);
  assert.notEqual(sig(11, 'perfect'), sig(12, 'perfect'));
  const a = createDocking({ seed: 5, setup: STEADY }), b = createDocking({ seed: 5, setup: STEADY });
  assert.deepEqual(a, b);
  assert.deepEqual(new Set(Array.from({ length: 40 }, (_, i) => createDocking({ seed: i + 1, setup: STEADY }).dir)), new Set([-1, 1]), 'the base turns either way');
});

test('the board: the ship starts past the funnel mouth, to one side of the lane, at rest; the lane points down by the middle of the run', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createDocking({ seed, setup: STEADY }), f = frameOf(s);
    assert.ok(f.d > DM && f.d < DM + 16, `starts just past the mouth (${f.d})`);
    assert.ok(Math.abs(f.l) > 8, 'off the lane');
    assert.equal(Math.hypot(s.vx, s.vy), 0);
    assert.ok(Math.abs(frameOf(s, 6).th) < 1e-9, 'straight down six seconds in');
    assert.ok(Math.hypot(s.x, s.y) < 150 && Math.abs(s.x) < 100, 'inside the board');
  }
});

test('the funnel: the berth width at the berth, the mouth width at the mouth, a straight line between', () => {
  assert.equal(halfAt(STEADY, 0), STEADY.berth); assert.equal(halfAt(STEADY, -5), STEADY.berth);
  assert.equal(halfAt(STEADY, DM), STEADY.mouth); assert.equal(halfAt(STEADY, DM + 50), STEADY.mouth);
  assert.ok(Math.abs(halfAt(STEADY, DM / 2) - (STEADY.berth + STEADY.mouth) / 2) < 1e-9);
});

test('the lane sweeps: the berth moves along the rim at the setup rate, in either direction', () => {
  const s = createDocking({ seed: 2, setup: STEADY });
  const f0 = frameOf(s, 0), f1 = frameOf(s, 3);
  const turned = Math.abs(f1.th - f0.th);
  assert.ok(Math.abs(turned - STEADY.sweep * 3) < 1e-9);
  assert.ok(Math.abs(Math.hypot(f0.Vb.x, f0.Vb.y) - STEADY.sweep * RB) < 1e-9, 'the berth speed is sweep x rim');
  const ahead = frameOf(s, 3); assert.ok(Math.abs(Math.hypot(ahead.B.x, ahead.B.y) - RB) < 1e-9, 'the berth stays on the rim');
});

test('docking: lined up and slow at the berth, the clamps catch (clean, a high grade); the run is over and hands back the four numbers', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  place(s, 6, 0.5);
  glide(s, 200, { vlane: 2 });
  assert.equal(s.done, true);
  assert.equal(s.result.outcome, OUTCOMES.docked); assert.equal(s.result.clean, true); assert.equal(s.result.hullLost, 0); assert.equal(s.result.success, true);
  assert.ok(s.result.grade >= 90, `grade ${s.result.grade}`);
  assert.deepEqual(Object.keys(dockingHandBack(s.result)), ['clean', 'grade', 'hullLost', 'timeS']);
  assert.equal(dockingHandBack(s.result).clean, true);
  assert.equal(dockingWord(s), 'clamped');
  // the run ends: further steps change nothing
  const before = JSON.stringify(s); stepDocking(s, DOCKING_DT, { aim: 0, thrust: 1 }); assert.equal(JSON.stringify(s), before);
});

test('arriving too fast is a scrape, not the end: hull lost, bounced back out, the run goes on and can still dock', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  place(s, 8, 0);
  glide(s, 30, { vlane: 20, firstScrape: true });
  assert.equal(s.scrapes >= 1, true); assert.equal(s.hullLost, SCRAPE.fast);
  assert.equal(s.done, false, 'a scrape never ends the run');
  assert.ok(frameOf(s).d > SHIP_R, 'thrown back out of the berth');
  assert.ok(frameOf(s).closing < 0, 'moving away');
  // come round slowly: it docks, and the dock keeps the scrape on the record
  place(s, 6, 0); s.flash = 0;
  glide(s, 200, { vlane: 2 });
  assert.equal(s.result.outcome, OUTCOMES.docked); assert.equal(s.result.clean, false); assert.equal(s.result.hullLost, SCRAPE.fast);
});

test('arriving beside the berth is a scrape on the hull face; too fast and beside it costs the most', () => {
  const a = createDocking({ seed: 3, setup: STEADY }); place(a, 5, STEADY.berth + 3); glide(a, 100, { vlane: 6, firstScrape: true });
  assert.equal(a.hullLost, SCRAPE.face);
  const b = createDocking({ seed: 3, setup: STEADY }); place(b, 8, STEADY.berth + 3); glide(b, 30, { vlane: 25, firstScrape: true });
  assert.equal(b.hullLost, SCRAPE.both); assert.ok(SCRAPE.both > SCRAPE.fast && SCRAPE.fast > SCRAPE.face && SCRAPE.face > SCRAPE.wall);
});

test('the safe speed is against the BERTH: sliding sideways with the sweep is not a drift, a sideways speed over the limit is too fast', () => {
  const slow = createDocking({ seed: 3, setup: STEADY }); place(slow, 5, 0); glide(slow, 150, { vlane: 2 });
  assert.equal(slow.result.outcome, OUTCOMES.docked, 'matching the berth is safe'); assert.ok(Math.hypot(slow.vx, slow.vy) > 3, 'while the ship itself moves in the world at the berth\'s speed');
  const sideways = createDocking({ seed: 3, setup: STEADY }); place(sideways, 5, 0); glide(sideways, 150, { vlane: 2, vlat: STEADY.safe + 3 });
  assert.ok(sideways.scrapes >= 1, 'sideways over the safe speed scrapes');
});

test('the walls warn first: outside the lit lane the warning drains, back inside it refills, and only an empty warning scrapes', () => {
  const s = createDocking({ seed: 4, setup: STEADY });
  const w = STEADY.warn;
  place(s, 40, halfAt(STEADY, 40) + 4);
  const f = (n, side = 1) => { for (let i = 0; i < n; i++) { place(s, 40, side * (halfAt(STEADY, 40) + 4)); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); } };
  f(Math.round(60 * (w * 0.5)));
  assert.equal(s.hullLost, 0, 'half the warning: nothing yet'); assert.ok(warnFill(s) < 0.6 && warnFill(s) > 0.3, `warn ${warnFill(s)}`);
  assert.equal(dockingWord(s), 'drifting wide');
  for (let i = 0; i < 30; i++) { place(s, 40, 0); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); }
  assert.ok(warnFill(s) > 0.9, 'back inside, it refills');
  f(Math.round(60 * (w + 0.2)));
  assert.equal(s.hullLost, SCRAPE.wall); assert.equal(s.scrapes, 1); assert.equal(s.done, false);
});

test('past the funnel mouth there are no walls: open space never scrapes', () => {
  const s = createDocking({ seed: 4, setup: STEADY });
  for (let i = 0; i < 600; i++) { place(s, DM + 20, 90); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); }
  assert.equal(s.hullLost, 0); assert.equal(s.scrapes, 0);
});

test('a longer warning means a later scrape (the Boost path)', () => {
  const timeTo = (warn) => { const su = { ...STEADY, warn }; const s = createDocking({ seed: 4, setup: su }); let n = 0; while (!s.scrapes && n < 600) { place(s, 40, halfAt(su, 40) + 4); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); n++; } return n; };
  assert.ok(timeTo(1.2) > timeTo(0.6) + 20);
});

test('the clock: a run the base waves off after the time limit has no dock, no grade, no XP, and never a clamp', () => {
  const s = createDocking({ seed: 6, setup: STEADY });
  fly(s, 60 * 40, { aim: null, thrust: 0 });
  assert.equal(s.done, true); assert.equal(s.result.outcome, OUTCOMES.wavedOff); assert.equal(s.result.success, false); assert.equal(s.result.grade, 0); assert.equal(s.result.xp, 0); assert.equal(s.result.clean, false);
  assert.ok(Math.abs(s.t - STEADY.tmax) < 0.05);
  assert.equal(dockingWord(s), 'waved off');
});

test('the grade: speed, being off centre, scrapes and time each cost something; a dead-centre slow clean dock is near 100; 70 passes', () => {
  const dockWith = (o) => { const s = createDocking({ seed: 3, setup: STEADY }); s.t = o.t ?? 0; place(s, SHIP_R + 0.4, o.l ?? 0); s.hullLost = o.hull ?? 0; glide(s, 120, { vlane: o.v ?? 1 }); return s.result; };
  const best = dockWith({ v: 0.5 }); assert.ok(best.grade >= 96, JSON.stringify(best));
  assert.ok(dockWith({ v: STEADY.safe - 0.5 }).grade < best.grade, 'faster costs');
  assert.ok(dockWith({ l: STEADY.berth * 0.9 }).grade < best.grade, 'off centre costs');
  assert.ok(dockWith({ hull: 8 }).grade < best.grade && dockWith({ hull: 16 }).grade < dockWith({ hull: 8 }).grade, 'hull costs');
  assert.ok(dockWith({ t: 24 }).grade < dockWith({ t: 10 }).grade, 'a slow dock costs a little');
  assert.equal(dockWith({ hull: 8 }).success, true);
  assert.equal(dockWith({ hull: 40 }).success, false); assert.equal(PASS, 70);
  assert.equal(dockingXp({ success: true, grade: 95, clean: true }), 6); assert.equal(dockingXp({ success: true, grade: 75, clean: false }), 4); assert.equal(dockingXp({ success: false }), 0);
});

test('the words: drifting wide, in the corridor, lined up, too fast, scrape, clamped, waved off', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  place(s, 60, halfAt(STEADY, 60) + 3); assert.equal(dockingWord(s), 'drifting wide');
  place(s, DM + 5, STEADY.mouth + 10); assert.equal(dockingWord(s), 'find the corridor');
  place(s, 60, halfAt(STEADY, 60) * 0.8); assert.equal(dockingWord(s), 'in the corridor');
  place(s, 60, 0); assert.equal(dockingWord(s), 'lined up');
  place(s, 30, 0, { vlane: STEADY.safe * 2 }); assert.equal(dockingWord(s), 'too fast');
  s.flash = 0.3; assert.equal(dockingWord(s), 'scrape');
  for (const w of [endWords({ outcome: 'docked', clean: true, hullLost: 0 }), endWords({ outcome: 'docked', clean: false, hullLost: 8 }), endWords({ outcome: 'waved-off' }), tryWords({ outcome: 'waved-off' }), tryWords({ outcome: 'docked', hullLost: 8 })]) assert.doesNotMatch(w, /\d/, w);
  assert.equal(gradeWord({ outcome: 'docked', grade: 100, clean: true }), 'perfect dock'); assert.equal(gradeWord({ outcome: 'waved-off' }), 'waved off');
});

test('thrust: it burns along the ship\'s heading, the ship swings to the aim at a limited rate, and drag bleeds speed off', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  s.x = 0; s.y = 120; s.vx = 0; s.vy = 0; s.h = 0;
  fly(s, 5, { aim: Math.PI / 2, thrust: 0 });
  assert.ok(s.h > 0 && s.h < Math.PI / 2, 'swinging, not snapping'); assert.equal(s.vx, 0); assert.equal(s.vy, 0);
  fly(s, 60, { aim: Math.PI / 2, thrust: 1 });
  assert.ok(s.vy > 5 && Math.abs(s.h - Math.PI / 2) < 1e-6);
  const v = s.vy; fly(s, 60, { aim: Math.PI / 2, thrust: 0 }); assert.ok(s.vy < v * 0.6, 'drag');
  s.done = false;
});

// ---- the roll and the paths ---------------------------------------------------------------------------------------------------
test('the roll: a smoother roll widens the corridor and slows the sweep, a rougher one the opposite; the rolls are ordered and Steady is the base', () => {
  const at = (t) => setupDocking({ tier: t });
  for (let i = 1; i < TIERS.length; i++) { const a = at(TIERS[i - 1]), b = at(TIERS[i]); assert.ok(b.mouth > a.mouth && b.berth > a.berth, 'wider'); assert.ok(b.sweep < a.sweep, 'slower'); assert.equal(b.warn, a.warn, 'the roll leaves the warning to the Boost path'); }
  assert.equal(at(0).mouth, DOCKING_BASE.mouth); assert.equal(at(0).berth, DOCKING_BASE.berth); assert.equal(at(0).sweep, DOCKING_BASE.sweep); assert.equal(at(0).warn, DOCKING_BASE.warn);
  assert.equal(tierOf({ total: 24, dc: 12 }), 2); assert.equal(setupDocking({ tier: 9 }).tier, 2, 'tier is clamped');
  assert.deepEqual(setupDocking({ tier: 1 }).label, 'Good');
});

test('the three Piloting paths each change one thing you can see: Landing the corridor, Handling the sweep, Boost the warning', () => {
  const base = setupDocking({ tier: 0 });
  const land = setupDocking({ tier: 0, points: { landing: 9 }, level: 9 }), hand = setupDocking({ tier: 0, points: { handling: 9 }, level: 9 }), boost = setupDocking({ tier: 0, points: { boost: 9 }, level: 9 });
  assert.ok(land.mouth > base.mouth * 1.3 && land.berth > base.berth * 1.3); assert.equal(land.sweep, base.sweep); assert.equal(land.warn, base.warn);
  assert.ok(hand.sweep < base.sweep * 0.7); assert.equal(hand.mouth, base.mouth); assert.equal(hand.warn, base.warn);
  assert.ok(boost.warn > base.warn * 2.5); assert.equal(boost.mouth, base.mouth); assert.equal(boost.sweep, base.sweep);
  assert.equal(setupDocking({ tier: 0, points: { landing: 9 }, level: 2 }).mouth, setupDocking({ tier: 0, points: { landing: 2 }, level: 2 }).mouth, 'points are capped by the skill level');
});

test('no point in any path ever makes it harder: every number only moves toward easier, one point at a time, at every roll', () => {
  for (const t of TIERS) for (const cat of ['landing', 'handling', 'boost']) for (let n = 0; n < 9; n++) {
    const a = setupDocking({ tier: t, points: { [cat]: n }, level: 9 }), b = setupDocking({ tier: t, points: { [cat]: n + 1 }, level: 9 });
    assert.ok(b.mouth >= a.mouth && b.berth >= a.berth && b.sweep <= a.sweep && b.warn >= a.warn && b.safe >= a.safe && b.tmax >= a.tmax, `${t} ${cat} ${n}`);
  }
});

test('a wobbly hand passes at least as often with points as without, on every path and all of them (200 runs, same seeds)', () => {
  for (const [name, points] of [['landing', { landing: 9 }], ['handling', { handling: 9 }], ['boost', { boost: 9 }], ['3 each', { landing: 3, handling: 3, boost: 3 }]]) {
    const zero = sweep('wobbly', setupDocking({ tier: -1 }), 120).rate, nine = sweep('wobbly', setupDocking({ tier: -1, points, level: 9 }), 120).rate;
    assert.ok(nine >= zero - 0.01, `${name}: ${nine} vs ${zero}`);
  }
});

test('the roll preview line says what the roll did to the game, from the real setup', () => {
  assert.ok(CHAIN_SPECS.docking, 'docking previews live beside the craft chain so the nine-game count stays nine'); assert.ok(!('docking' in SPECS));
  const L = (total) => rollPreview('docking', { total, dc: 12 }).line;
  assert.equal(L(22), 'Smooth roll: corridor 20% wider, sweep 20% slower.');
  assert.equal(L(12), 'Steady roll: nothing changes.');
  assert.match(L(2), /^Rough roll: corridor 15% narrower, sweep 20% faster\.$/);
  assert.equal(rollPreview('docking', { total: 12, dc: 12 }, { level: 9, points: { boost: 9 } }).line, 'Steady roll: nothing changes.', 'points are not the roll: the line is about the roll only');
});

test('the picker words name the docking effect of each path in plain words', () => {
  const cats = CATEGORIES.piloting.cats;
  assert.match(cats[0].words(9), /base turns 36% slower/); assert.match(cats[1].words(9), /warns you 1\.7 s before it scrapes/); assert.match(cats[2].words(9), /corridor is 36% wider/);
  assert.match(describeCategory('piloting', { boost: 3 }, 9, 'boost').now, /warns you 1 s before it scrapes/);
});

// ---- the bot sweep -------------------------------------------------------------------------------------------------------------
const N = 150;
const table = {};
const rate = (kind, tier) => (table[`${kind}${tier}`] ||= sweep(kind, setupDocking({ tier }), N));
test('bot sweep: a perfect hand docks every time at every roll, in a believable time; lazy and mash never', () => {
  for (const t of TIERS) {
    const p = rate('perfect', t); assert.equal(p.rate, 1, `perfect at ${t}`); assert.ok(p.medianTime > 8 && p.medianTime < 25, `perfect time ${p.medianTime}`);
    assert.equal(rate('lazy', t).rate, 0, `lazy at ${t}`); assert.equal(rate('mash', t).rate, 0, `mash at ${t}`);
  }
});
test('bot sweep: a wobbly hand with reaction lag passes about 35-50% at Rough, 70-80% at Steady, 90% or more at Smooth, climbing with the roll', () => {
  const r = TIERS.map((t) => rate('wobbly', t).rate);
  assert.ok(r[0] >= 0.33 && r[0] <= 0.5, `Rough ${r[0]}`); assert.ok(r[2] >= 0.68 && r[2] <= 0.82, `Steady ${r[2]}`); assert.ok(r[4] >= 0.9, `Smooth ${r[4]}`);
  for (let i = 1; i < 5; i++) assert.ok(r[i] >= r[i - 1] - 0.02, `climbs: ${r}`);
  assert.ok(r[1] > r[0] + 0.1 && r[3] > r[2] + 0.05);
});
test('bot sweep: the times (a pass takes about 12 to 16 seconds, never past the clock)', () => {
  for (const t of TIERS) { const w = rate('wobbly', t); assert.ok(w.medianTime >= 11 && w.medianTime <= 18, `wobbly time ${w.medianTime} at ${t}`); }
  if (process.env.DOCK_TABLE) { for (const k of ['perfect', 'wobbly', 'lazy', 'mash']) console.log(k.padEnd(8), TIERS.map((t) => `${(100 * rate(k, t).rate).toFixed(0)}% ${rate(k, t).medianTime?.toFixed(1) ?? '-'}s (clean ${(100 * rate(k, t).clean).toFixed(0)}%)`).join(' | ')); }
});
test('bots: the mash hand does move the ship (it is not just standing still), and the lazy hand never moves it', () => {
  const m = runBot('mash', { seed: 4, setup: STEADY }), l = runBot('lazy', { seed: 4, setup: STEADY });
  assert.ok(m.result.outcome === 'waved-off' || m.result.grade < PASS); assert.equal(l.result.outcome, 'waved-off'); assert.equal(l.result.grade, 0); void makeBot; void coast;
});
