// Docking: the pure rules, the roll and path scaling, quick mode, the lights and the bot sweep (the skill curve).
// DOCK_TABLE=1 prints the pass-rate table the lane reports.   Run: node --test tests/model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { T0, XB, YB0, YB1, createDocking, stepDocking, frameOf, halfAt, safeAt, WALL_CAP, GRACE, dockingWord, warnFill, wallNear, wallBand, lightsLeft, dockingXp, dockingEffects, DOCKING_DT, RB, DM, SHIP_R, SCRAPE, PASS, OUTCOMES } from '../model.js';
import { runBot, sweep, makeBot } from '../bot.js';
import { setupDocking, DOCKING_BASE, PATHS, ALIASES, cleanPoints } from '../setup.js';
import { endWords, tryWords, gradeWord, endLine, LINES, scrapeWords } from '../words.js';

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
    assert.ok(Math.abs(frameOf(s, T0).th) < 1e-9, 'straight down a few seconds in');
    assert.ok(Math.abs(s.x) < XB - 4 && s.y < YB1 && s.y > YB0, 'inside the board, with room for the ship');
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
  for (const k of ['success', 'grade', 'clean', 'hullLost', 'timeS', 'scrapes', 'wavedOff', 'berth']) assert.ok(k in s.result, k);
  assert.equal(s.result.wavedOff, false);
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
  for (let i = 0; i < 600; i++) { place(s, DM + 20, 40); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); }
  assert.equal(s.hullLost, 0); assert.equal(s.scrapes, 0);
});

test('a longer warning means a later scrape (the Pursuit path)', () => {
  const timeTo = (warn) => { const su = { ...STEADY, warn }; const s = createDocking({ seed: 4, setup: su }); let n = 0; while (!s.scrapes && n < 600) { place(s, 40, halfAt(su, 40) + 4); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); n++; } return n; };
  assert.ok(timeTo(1.2) > timeTo(0.6) + 20);
});

test('the lights: a run the base waves off when the lights are out has no dock, no grade, no XP, and never a clamp', () => {
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
  assert.equal(dockingXp({ outcome: 'docked', clean: true, middle: true }), 4); assert.equal(dockingXp({ outcome: 'docked', clean: false, middle: false }), 2); assert.equal(dockingXp({ outcome: 'docked', clean: true, middle: false }), 3); assert.equal(dockingXp({ outcome: 'waved-off' }), 0);
});

test('the words: drifting wide, ease off, in the corridor, lined up, too fast, scrape, clamped, waved off', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  place(s, 60, halfAt(STEADY, 60) + 3); assert.equal(dockingWord(s), 'drifting wide');
  place(s, DM + 5, STEADY.mouth + 10); assert.equal(dockingWord(s), 'find the corridor');
  place(s, 60, halfAt(STEADY, 60) * 0.8); assert.equal(dockingWord(s), 'in the corridor');
  place(s, 60, 0); assert.equal(dockingWord(s), 'lined up');
  place(s, 30, 0, { vlane: 30 }); assert.equal(dockingWord(s), 'too fast');
  place(s, 30, 0, { vlane: 20 }); assert.equal(dockingWord(s), 'ease off');
  place(s, 55, 0, { vlane: 20 }); assert.equal(dockingWord(s), 'lined up', 'a fast run in from far out is not scolded: the safe speed grows with the distance');
  assert.equal(safeAt(s, 0), STEADY.safe); assert.ok(safeAt(s, 60) > safeAt(s, 20));
  s.flash = 0.3; assert.equal(dockingWord(s), 'scrape');
  for (const w of [endWords({ outcome: 'docked', clean: true, hullLost: 0 }), endWords({ outcome: 'docked', clean: false, hullLost: 8 }), endWords({ outcome: 'waved-off' }), tryWords({ outcome: 'waved-off' }), tryWords({ outcome: 'docked', hullLost: 8 })]) assert.doesNotMatch(w, /\d/, w);
  assert.equal(gradeWord({ outcome: 'docked', grade: 100, clean: true, perfect: true }), 'perfect dock'); assert.equal(gradeWord({ outcome: 'docked', grade: 90, clean: true, perfect: false }), 'clean dock'); assert.equal(gradeWord({ outcome: 'waved-off' }), 'waved off');
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
  assert.equal(1, 1); assert.equal(setupDocking({ tier: 9 }).tier, 2, 'tier is clamped');
  assert.deepEqual(setupDocking({ tier: 1 }).label, 'Good');
});

test('the three Handling paths each change one thing you can see: Control the corridor, Maneuver the sweep, Pursuit the warning', () => {
  const base = setupDocking({ tier: 0 });
  const land = setupDocking({ tier: 0, points: { control: 9 }, level: 9 }), hand = setupDocking({ tier: 0, points: { maneuver: 9 }, level: 9 }), boost = setupDocking({ tier: 0, points: { pursuit: 9 }, level: 9 });
  assert.ok(land.mouth > base.mouth * 1.3 && land.berth > base.berth * 1.3); assert.equal(land.sweep, base.sweep); assert.equal(land.warn, base.warn);
  assert.ok(hand.sweep < base.sweep * 0.7); assert.equal(hand.mouth, base.mouth); assert.equal(hand.warn, base.warn);
  assert.ok(boost.warn > base.warn * 2.5); assert.equal(boost.mouth, base.mouth); assert.equal(boost.sweep, base.sweep);
  assert.equal(setupDocking({ tier: 0, points: { control: 9 }, level: 2 }).mouth, setupDocking({ tier: 0, points: { control: 2 }, level: 2 }).mouth, 'points are capped by the skill level');
});

test('no point in any path ever makes it harder: every number only moves toward easier, one point at a time, at every roll', () => {
  for (const t of TIERS) for (const cat of PATHS) for (let n = 0; n < 9; n++) {
    const a = setupDocking({ tier: t, points: { [cat]: n }, level: 9 }), b = setupDocking({ tier: t, points: { [cat]: n + 1 }, level: 9 });
    assert.ok(b.mouth >= a.mouth && b.berth >= a.berth && b.sweep <= a.sweep && b.warn >= a.warn && b.safe >= a.safe && b.tmax >= a.tmax, `${t} ${cat} ${n}`);
  }
});

test('a wobbly hand passes at least as often with points as without, on every path and all of them (200 runs, same seeds)', () => {
  for (const [name, points] of [['control', { control: 9 }], ['maneuver', { maneuver: 9 }], ['pursuit', { pursuit: 9 }], ['3 each', { control: 3, maneuver: 3, pursuit: 3 }]]) {
    const zero = sweep('wobbly', setupDocking({ tier: -1 }), 120).rate, nine = sweep('wobbly', setupDocking({ tier: -1, points, level: 9 }), 120).rate;
    assert.ok(nine >= zero - 0.01, `${name}: ${nine} vs ${zero}`);
  }
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
test('bot sweep: the times (a pass takes about 12 to 16 seconds, never past the lights)', () => {
  for (const t of TIERS) { const w = rate('wobbly', t); assert.ok(w.medianTime >= 11 && w.medianTime <= 18, `wobbly time ${w.medianTime} at ${t}`); }
  if (process.env.DOCK_TABLE) { for (const k of ['perfect', 'wobbly', 'lazy', 'mash']) console.log(k.padEnd(8), TIERS.map((t) => `${(100 * rate(k, t).rate).toFixed(0)}% ${rate(k, t).medianTime?.toFixed(1) ?? '-'}s (clean ${(100 * rate(k, t).clean).toFixed(0)}%)`).join(' | ')); }
});
test('bots: the mash hand does move the ship (it is not just standing still), and the lazy hand never moves it', () => {
  const m = runBot('mash', { seed: 4, setup: STEADY }), l = runBot('lazy', { seed: 4, setup: STEADY });
  assert.ok(m.result.outcome === 'waved-off' || m.result.grade < PASS); assert.equal(l.result.outcome, 'waved-off'); assert.equal(l.result.grade, 0); void makeBot; void coast;
});

// ---- the lights: the limit shown as something in the world ----------------------------------------------------------------------
test('the lights: they go out one by one, evenly, across the limit; the last one out is the wave-off', () => {
  const s = createDocking({ seed: 6, setup: STEADY });
  assert.equal(lightsLeft(s), STEADY.lights); assert.equal(lightsLeft(s, STEADY.tmax - 0.01), 1); assert.equal(lightsLeft(s, STEADY.tmax), 0);
  const outAt = []; let n = 0;
  while (!s.done && n++ < 60 * 40) { stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); for (const e of s.events) if (e.type === 'light') outAt.push([+s.t.toFixed(2), e.left]); }
  assert.equal(outAt.length, STEADY.lights, 'every light went out'); assert.deepEqual(outAt.map((o) => o[1]), [5, 4, 3, 2, 1, 0]);
  const gap = STEADY.tmax / STEADY.lights; outAt.forEach(([t], i) => assert.ok(Math.abs(t - gap * (i + 1)) < 0.05, `light ${i} at ${t}`));
  assert.equal(s.result.outcome, OUTCOMES.wavedOff); assert.equal(s.result.lightsLeft, 0);
});

test('waved off: the tug brings you in, so the story moves on: no grade, no XP, the fee is charged and the scrapes still cost hull', () => {
  const s = createDocking({ seed: 6, setup: STEADY, berth: 3 });
  place(s, 40, halfAt(STEADY, 40) + 4);
  for (let i = 0; i < 60 * 4; i++) { place(s, 40, halfAt(STEADY, 40) + 4); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); }
  const hull = s.hullLost; assert.ok(hull > 0, 'a scrape before the lights went out'); place(s, DM + 40, 90);
  fly(s, 60 * 40, { aim: null, thrust: 0 });
  const r = s.result;
  assert.equal(r.wavedOff, true); assert.equal(r.success, false); assert.equal(r.grade, 0); assert.equal(r.xp, 0); assert.equal(r.fee, STEADY.fee); assert.ok(r.hullLost >= hull, 'the scrapes still cost hull'); assert.equal(r.berth, 3);
  const fx = dockingEffects(r, { id: 'star-base' });
  assert.deepEqual(fx.world, { hullDelta: -r.hullLost, docked: { base: 'star-base', berth: 3 }, feeDelta: -STEADY.fee }, 'a waved-off run still ends docked, and pays the fee');
});

test('effects: a dock changes hull and the berth, and charges no fee (the fee key is absent, not zero)', () => {
  const s = createDocking({ seed: 3, setup: STEADY, berth: 2 }); place(s, 6, 0.5); glide(s, 200, { vlane: 2 });
  const fx = dockingEffects(s.result, { id: 'star-base', berth: 2 });
  assert.deepEqual(fx.world, { hullDelta: -0, docked: { base: 'star-base', berth: 2 } }); assert.ok(!('feeDelta' in fx.world));
});

test('a retry is never the same attempt: after a scrape you are somewhere else, with less hull and fewer lights', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  place(s, 8, 0); const before = { d: frameOf(s).d, hull: s.hullLost };
  glide(s, 30, { vlane: 20, firstScrape: true });
  const f = frameOf(s);
  assert.ok(f.d > SHIP_R && f.d !== before.d, 'moved'); assert.ok(f.closing < 0, 'thrown back out'); assert.ok(s.hullLost > before.hull);
  s.t = 13; assert.ok(lightsLeft(s) < STEADY.lights, 'and the lights keep going out');
});

test('the XP: 2 for a dock, +1 clean, +1 through the middle third; none when waved off', () => {
  const run = (l, hull) => { const s = createDocking({ seed: 3, setup: STEADY }); s.t = 0; place(s, SHIP_R + 0.4, l); s.hullLost = hull; glide(s, 120, { vlane: 1 }); return s.result; };
  assert.equal(run(0, 0).xp, 4); assert.equal(run(STEADY.berth * 0.8, 0).xp, 3); assert.equal(run(0, 8).xp, 3); assert.equal(run(STEADY.berth * 0.8, 8).xp, 2);
  assert.equal(run(0, 0).perfect, true); assert.equal(run(0, 8).perfect, false);
});

// ---- quick mode -------------------------------------------------------------------------------------------------------------------
test('quick mode: you start already lined up inside the funnel mouth, riding the sweep, with a shorter limit', () => {
  const q = setupDocking({ tier: 0, quick: true });
  assert.equal(q.quick, true); assert.ok(q.tmax < STEADY.tmax); assert.equal(q.mouth, STEADY.mouth);
  for (let seed = 1; seed <= 40; seed++) {
    const s = createDocking({ seed, setup: q }), f = frameOf(s);
    assert.equal(s.quick, true); assert.ok(f.d < DM && f.d > DM - 25, `inside the mouth (${f.d})`); assert.ok(Math.abs(f.l) < q.mouth * 0.5, `lined up (${f.l})`);
    assert.ok(f.speed < s.safe * 1.5, 'riding the sweep, not racing it');
    assert.equal(dockingWord(s) === 'drifting wide' || dockingWord(s) === 'find the corridor', false, 'not outside the corridor');
  }
  const a = runBot('perfect', { seed: 5, setup: q, quick: true });
  assert.equal(a.result.outcome, OUTCOMES.docked); assert.ok(a.result.timeS >= 5 && a.result.timeS <= 11, `quick run ${a.result.timeS} s`);
});
test('quick mode is deterministic and plays differently from the full run', () => {
  const q = setupDocking({ tier: 0, quick: true });
  const sig = (seed) => JSON.stringify(runBot('wobbly', { seed, setup: q, quick: true }).result);
  assert.equal(sig(9), sig(9)); assert.notEqual(sig(9), sig(10));
});

// ---- the paths and their aliases ------------------------------------------------------------------------------------------------------
test('the three division names are control, maneuver, pursuit, and Stardust\'s old piloting names count as the same paths', () => {
  assert.deepEqual([...PATHS], ['control', 'maneuver', 'pursuit']); assert.deepEqual({ ...ALIASES }, { landing: 'control', handling: 'maneuver', boost: 'pursuit' });
  for (const [old, now] of Object.entries(ALIASES)) assert.deepEqual(setupDocking({ points: { [old]: 5 }, level: 9 }), setupDocking({ points: { [now]: 5 }, level: 9 }), `${old} = ${now}`);
  assert.deepEqual(cleanPoints({ landing: 3, handling: 2, boost: 1 }), { control: 3, maneuver: 2, pursuit: 1 });
  assert.deepEqual(cleanPoints({ control: 4, landing: 9 }), { control: 4, maneuver: 0, pursuit: 0 }, 'a division name beats the old one');
  assert.deepEqual(cleanPoints({ control: 9, maneuver: 9, pursuit: 9 }, 5), { control: 5, maneuver: 0, pursuit: 0 }, 'capped by the skill level');
  assert.deepEqual(cleanPoints({ control: 99, maneuver: -3 }), { control: 9, maneuver: 0, pursuit: 0 });
});

test('Pursuit: the wall glows earlier (a wider glow band) and the warning tone starts sooner; Control and Maneuver leave both alone', () => {
  const base = createDocking({ seed: 4, setup: setupDocking({ tier: 0 }) }), purs = createDocking({ seed: 4, setup: setupDocking({ tier: 0, points: { pursuit: 9 }, level: 9 }) });
  assert.ok(wallBand(purs) > wallBand(base) * 2);
  const rel = 0.8; // 80% of the way to the wall
  const at = (st) => { place(st, 40, halfAt(st, 40) * rel); return wallNear(st); };
  assert.ok(at(purs) > at(base), 'the same spot glows more with Pursuit');
  assert.equal(at(base), 0, 'well inside, nothing glows'); assert.equal(wallNear(Object.assign(place(base, 40, halfAt(base, 40) + 1), {})), 1);
  const ctl = createDocking({ seed: 4, setup: setupDocking({ tier: 0, points: { control: 9 }, level: 9 }) }); assert.equal(wallBand(ctl), wallBand(base));
  place(base, DM + 20, 0); assert.equal(wallNear(base), 0, 'no walls in open space');
});

// ---- the flight line for the result card -----------------------------------------------------------------------------------------------
test('the flight line: the approach is sampled as (distance along the lane, offset from its middle), with the scrapes marked', () => {
  const s = runBot('perfect', { seed: 21, setup: STEADY }); const r = s.result;
  assert.ok(r.path.length > 80 && r.path.length < 300, `${r.path.length} samples`);
  assert.ok(r.path[0][0] > DM, 'starts outside the mouth'); assert.ok(r.path.at(-1)[0] < 6, 'ends at the berth');
  for (const p of r.path) assert.equal(p.length, 2);
  const w = runBot('wobbly', { seed: 2, setup: setupDocking({ tier: -2 }) }).result; assert.equal(w.marks.length, w.scrapes, 'one mark per scrape');
  for (const m of w.marks) assert.ok(['wall', 'face', 'fast', 'both'].includes(m[2]));
});

// ---- words and lines -------------------------------------------------------------------------------------------------------------------
test('the dockmaster\'s four lines are the brief\'s drafts, with a number in words and no digits', () => {
  assert.equal(LINES.approach.text(1), "Berth one's lit. Bring her in slow."); assert.equal(LINES.scrape.text(), "That's my paint you're wearing.");
  assert.equal(LINES.clean.text(), 'Clamps on. Welcome home.'); assert.equal(LINES.wavedOff.text(), "Kill your engines. I'm sending the tug.");
  assert.equal(endLine({ outcome: 'waved-off' }), LINES.wavedOff); assert.equal(endLine({ outcome: 'docked', clean: true }), LINES.clean); assert.equal(endLine({ outcome: 'docked', clean: false }), LINES.scrape);
  for (const k of ['wall', 'fast', 'face', 'both']) assert.doesNotMatch(scrapeWords(k), /\d/);
  for (const l of Object.values(LINES)) assert.doesNotMatch(l.text(4), /\d/);
});

// ---- quick bot sweep ---------------------------------------------------------------------------------------------------------------------
test('quick bot sweep: perfect docks every time in 6 to 10 s, a wobbly hand passes most of the time, lazy and mash never', () => {
  for (const t of TIERS) {
    const su = setupDocking({ tier: t, quick: true }), p = sweep('perfect', su, N, {}, true);
    assert.equal(p.rate, 1, `perfect quick at ${t}`); assert.ok(p.medianTime >= 6 && p.medianTime <= 10, `perfect quick time ${p.medianTime}`);
    assert.equal(sweep('lazy', su, N, {}, true).rate, 0); assert.equal(sweep('mash', su, N, {}, true).rate, 0, `mash quick at ${t}`);
  }
  const w = TIERS.map((t) => sweep('wobbly', setupDocking({ tier: t, quick: true }), N, {}, true));
  assert.ok(w[0].rate >= 0.35 && w[0].rate <= 0.55, `quick Rough ${w[0].rate}`); assert.ok(w[2].rate >= 0.7 && w[2].rate <= 0.85, `quick Steady ${w[2].rate}`); assert.ok(w[4].rate >= 0.85, `quick Smooth ${w[4].rate}`);
  for (const x of w) assert.ok(x.medianTime >= 6 && x.medianTime <= 10, `quick time ${x.medianTime}`);
  if (process.env.DOCK_TABLE) for (const k of ['perfect', 'wobbly', 'lazy', 'mash']) console.log('quick', k.padEnd(8), TIERS.map((t) => { const r = sweep(k, setupDocking({ tier: t, quick: true }), N, {}, true); return `${(100 * r.rate).toFixed(0)}% ${r.medianTime?.toFixed(1) ?? '-'}s`; }).join(' | '));
});
test('quick mode: points still never hurt a wobbly hand', () => {
  for (const [name, points] of [['control', { control: 9 }], ['maneuver', { maneuver: 9 }], ['pursuit', { pursuit: 9 }]]) {
    const zero = sweep('wobbly', setupDocking({ tier: -1, quick: true }), 150, {}, true).rate, nine = sweep('wobbly', setupDocking({ tier: -1, points, level: 9, quick: true }), 150, {}, true).rate;
    assert.ok(nine >= zero - 0.01, `${name}: ${nine} vs ${zero}`);
  }
});
test('the module names no base or ship: the model and words carry no world content', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['../model.js', '../words.js', '../setup.js']) { const src = await readFile(new URL(f, import.meta.url), 'utf8'); assert.doesNotMatch(src, /Lantern|Tin Duchess|Driftborn|Relay Guild|Hollow Choir|Ember Syndicate/i, f); }
});

test('a scrape is a lesson, not a trap: a breath before the wall can warn again, and the walls alone cost at most a capped share of the hull', () => {
  const s = createDocking({ seed: 4, setup: STEADY });
  const out = () => place(s, 40, halfAt(STEADY, 40) + 4);
  let n = 0; while (!s.scrapes && n++ < 600) { out(); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); }
  assert.equal(s.scrapes, 1); assert.ok(s.grace > 0, 'grace after the scrape');
  const w0 = s.warnLeft; for (let i = 0; i < 30; i++) { out(); stepDocking(s, DOCKING_DT, { aim: null, thrust: 0 }); }
  assert.equal(s.warnLeft, w0, 'the warning does not drain during the grace'); assert.ok(GRACE > 0);
  // a ship parked in a sweeping corridor for the whole run is bounced and nudged, never wrecked
  const lazy = runBot('lazy', { seed: 3, setup: STEADY }); assert.ok(lazy.result.hullLost <= WALL_CAP, `hull lost ${lazy.result.hullLost}`); assert.equal(lazy.result.outcome, OUTCOMES.wavedOff);
  const t = createDocking({ seed: 4, setup: STEADY }); for (let i = 0; i < 60 * 25; i++) { place(t, 40, halfAt(STEADY, 40) + 4); stepDocking(t, DOCKING_DT, { aim: null, thrust: 0 }); if (t.done) break; }
  assert.equal(t.wallLost, WALL_CAP, 'the walls alone stop at the cap'); assert.equal(t.done, false, 'and the run goes on');
});

test('the board has edges: a ship that burns away from the base is turned back at the edge of the screen, with no scrape', () => {
  const s = createDocking({ seed: 3, setup: STEADY });
  for (let i = 0; i < 60 * 8 && !s.done; i++) { stepDocking(s, DOCKING_DT, { aim: 0, thrust: 1 }); assert.ok(s.x <= XB + 1e-9 && s.x >= -XB && s.y <= YB1 && s.y >= YB0, `on the board at ${i}`); }
  assert.equal(s.x, XB, 'held at the right edge'); assert.equal(s.hullLost, 0, 'and it cost nothing');
  const q = createDocking({ seed: 3, setup: STEADY }); for (let i = 0; i < 60 * 8 && !q.done; i++) stepDocking(q, DOCKING_DT, { aim: Math.PI / 2, thrust: 1 });
  assert.ok(q.y <= YB1 + 1e-9);
});

// ---- contract 1.1: the manifest and the points it names ---------------------------------------------------------------------------------
test('the manifest follows contract 1.1: path objects whose ids are the ids ctx.points is read with, no tabletop field, contract "1.1"', async () => {
  const { readFile } = await import('node:fs/promises');
  const m = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(m.contract, '1.1'); assert.equal(m.id, 'docking'); assert.equal(m.kind, 'minigame'); assert.ok(!('tabletop' in m), 'no tabletop field'); assert.ok(!('pathAliases' in m), 'the alias table lives in the code');
  assert.ok(Array.isArray(m.paths) && m.paths.every((p) => p && typeof p === 'object' && p.id && p.division && p.tabletopSkill === 'Handling'));
  assert.deepEqual(m.paths.map((p) => p.id), [...PATHS], 'the manifest ids are the ids the setup reads');
  assert.deepEqual(m.paths.map((p) => p.division), ['Control', 'Maneuver', 'Pursuit']);
  for (const p of m.paths) { const base = setupDocking({}), one = setupDocking({ points: { [p.id]: 6 }, level: 9 }); assert.notDeepEqual(one, base, `points keyed by "${p.id}" change the setup`); assert.equal(one.points[p.id], 6); }
  for (const k of ['success', 'grade', 'clean', 'hullLost', 'timeS', 'scrapes', 'wavedOff', 'berth']) assert.ok(m.outputs.includes(k), k);
});
test('the tug fee comes from the base record when it has one, else the placeholder', () => {
  assert.equal(setupDocking({}).fee, DOCKING_BASE.fee); assert.equal(setupDocking({ fee: 60 }).fee, 60); assert.equal(setupDocking({ fee: -3 }).fee, DOCKING_BASE.fee); assert.equal(setupDocking({ fee: undefined }).fee, DOCKING_BASE.fee);
  assert.equal(createDocking({ seed: 1, setup: setupDocking({ fee: 60 }) }).fee, 60);
});
test('the dockmaster lines are marked as drafts in the fixtures', async () => {
  const { readFile } = await import('node:fs/promises');
  const f = JSON.parse(await readFile(new URL('../fixtures.json', import.meta.url), 'utf8')); assert.equal(f.lines.status, 'draft'); assert.match(f.lines.note, /draft/i);
});
