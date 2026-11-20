// Minigames lane piece 10: piloting, touchdown. Numbers from PLAN.md section 2.7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupPilot } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { createPilot, stepPilot, brake, windAt, gustAt, onPad, pilotXp, PILOT_DT } from '../projects/Space-Shooter/voyage/minigames/pilot.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';

test('pilot setup: base, the roll and the exact points', () => {
  assert.deepEqual(setupPilot({}), { fall: 12, safe: 3, drift: 4, wind: 2.5, fuel: 10, pad: 20, brakes: 0, thrust: 2.2, brakeCancel: 0.6, tier: 0, points: { handling: 0, boost: 0, landing: 0 }, label: 'Steady' });
  const t = (k) => setupPilot({ tier: k });
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).fall), [8.4, 10.2, 12, 13.8, 15.6]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).wind), [3.25, 2.875, 2.5, 2.125, 1.75]);
  assert.deepEqual([-2, -1, 0, 1, 2].map((k) => t(k).pad), [18, 19, 20, 22, 24]);
  const at = (c, n) => setupPilot({ points: { [c]: n }, level: 9 });
  assert.deepEqual([0, 1, 3, 9].map((n) => at('handling', n).drift), [4, 4.24, 4.72, 6.16]);
  assert.deepEqual([0, 1, 3, 9].map((n) => at('landing', n).safe), [3, 3.15, 3.45, 4.35]);
  assert.deepEqual([0, 1, 2, 3, 6, 9].map((n) => at('boost', n).fuel), [10, 10.5, 11, 11.5, 13, 14.5]);
  assert.deepEqual([0, 2, 3, 5, 6, 9].map((n) => at('boost', n).brakes), [0, 0, 1, 1, 2, 3]);
  assert.equal(setupPilot({ points: { landing: 9 }, level: 2 }).safe, 3.3, 'points are capped by level');
});

test('the picker words are the setup numbers', () => {
  for (const n of [0, 1, 3, 9]) {
    assert.match(CATEGORIES.piloting.cats[0].words(n), new RegExp(`^drift power ${Math.round(setupPilot({ points: { handling: n }, level: 9 }).drift * 10) / 10} in a landing`)); // docking adds its own clause after it
    const b = setupPilot({ points: { boost: n }, level: 9 });
    assert.ok(CATEGORIES.piloting.cats[1].words(n).startsWith(`${b.fuel} s of thrust, ${b.brakes} emergency brake${b.brakes === 1 ? '' : 's'} per landing`));
    assert.ok(CATEGORIES.piloting.cats[2].words(n).startsWith(`safe touchdown speed ${setupPilot({ points: { landing: n }, level: 9 }).safe}`));
  }
});

const mk = (seed, o = {}) => createPilot({ seed, setup: setupPilot(o) });

test('the world: deterministic, the pad is 22 to 40 away, the ship falls and the fall time is the setup', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const a = mk(seed), b = mk(seed);
    assert.deepEqual([a.x, a.padX, a.w, a.v], [b.x, b.padX, b.w, b.v]);
    const d = Math.abs(a.x - a.padX);
    assert.ok(d >= 21.9 || a.x <= 8 || a.x >= 92, `distance ${d}`);
    assert.ok(a.padX >= 30 && a.padX <= 70);
  }
  // Free fall, no wind: the clock matches the setup (12 s) within a step.
  const s = createPilot({ seed: 1, setup: { ...setupPilot({}), wind: 0 } });
  s.x = s.padX; let n = 0; while (!s.done && n++ < 3000) stepPilot(s, PILOT_DT, {});
  assert.ok(Math.abs(s.t - 12) < 0.05, `fall time ${s.t}`);
  assert.equal(s.result.outcome, 'crashed'); assert.ok(s.result.speed > 15);
});

test('controls: thrust slows the fall and burns fuel, drift pushes sideways, out of fuel means no thrust', () => {
  const s = createPilot({ seed: 2, setup: { ...setupPilot({}), wind: 0 } });
  for (let i = 0; i < 120; i++) stepPilot(s, PILOT_DT, {});
  const vy = s.vy; for (let i = 0; i < 60; i++) stepPilot(s, PILOT_DT, { thrust: true });
  assert.ok(s.vy < vy, 'thrust brakes'); assert.ok(Math.abs(s.fuel - 9) < 0.02);
  const x = s.x; for (let i = 0; i < 60; i++) stepPilot(s, PILOT_DT, { right: true }); assert.ok(s.x > x + 1.5);
  const y = createPilot({ seed: 2, setup: { ...setupPilot({}), wind: 0, fuel: 0.5 } });
  for (let i = 0; i < 120; i++) stepPilot(y, PILOT_DT, { thrust: true });
  assert.equal(y.fuel, 0); assert.equal(y.thrusting, false);
  // The ship never climbs off the top.
  const z = createPilot({ seed: 2, setup: setupPilot({}) }); for (let i = 0; i < 300; i++) stepPilot(z, PILOT_DT, { thrust: true });
  assert.ok(z.y <= 100);
});

test('brake cancels 60% of the fall speed, once per brake, only when falling', () => {
  const s = createPilot({ seed: 2, setup: setupPilot({ points: { boost: 6 }, level: 6 }) });
  assert.equal(s.brakes, 2); assert.equal(brake(s), false, 'not falling yet');
  for (let i = 0; i < 300; i++) stepPilot(s, PILOT_DT, {});
  const v = s.vy; assert.equal(brake(s), true); assert.ok(Math.abs(s.vy - v * 0.4) < 1e-9); assert.equal(s.brakes, 1);
  assert.equal(brake(s), true); assert.equal(brake(s), false);
  assert.equal(brake(mk(1)), false, 'no brakes without boost points');
});

test('touchdown: landed, crashed (too fast) and missed (off the pad); stars and XP', () => {
  const land = (o) => { const s = createPilot({ seed: 3, setup: { ...setupPilot({}), wind: 0, ...o } }); s.x = s.padX; s.y = 0.001; s.vy = o?.vy ?? 1.5; s.vx = 0; stepPilot(s, PILOT_DT, {}); return s; };
  let s = land({}); assert.deepEqual([s.result.outcome, s.result.success, s.result.stars], ['landed', true, 3]); assert.equal(s.result.xp, 6);
  s = createPilot({ seed: 3, setup: { ...setupPilot({}), wind: 0 } }); s.x = s.padX; s.y = 0.001; s.vy = 2.9; s.fuel = 1; stepPilot(s, PILOT_DT, {});
  assert.deepEqual([s.result.outcome, s.result.soft, s.result.thrifty, s.result.stars, s.result.xp], ['landed', false, false, 1, 4]);
  s = createPilot({ seed: 3, setup: { ...setupPilot({}), wind: 0 } }); s.x = s.padX; s.y = 0.001; s.vy = 5; stepPilot(s, PILOT_DT, {});
  assert.deepEqual([s.result.outcome, s.result.xp, s.result.stars], ['crashed', 0, 0]);
  s = createPilot({ seed: 3, setup: { ...setupPilot({}), wind: 0 } }); s.x = s.padX + 30; s.y = 0.001; s.vy = 1; stepPilot(s, PILOT_DT, {});
  assert.deepEqual([s.result.outcome, s.result.xp], ['missed', 0]);
  assert.deepEqual([1, 2, 3].map((st) => pilotXp({ success: true, stars: st })), [4, 5, 6]);
  assert.equal(onPad(createPilot({ seed: 3, setup: {} })), false);
});

// Bots. ace reads the speed every step; steady re-reads every `lag` steps (a slow hand); drifter only
// steers and never thrusts; floater holds thrust from the start; sloppy starts thrust too late.
function ace(s, k = 0.55, m = 0.3) {
  const err = s.padX - s.x, want = Math.max(-12, Math.min(12, err * 0.8)), dv = want - s.vx;
  const a = s.thrustAcc - s.g, lim = Math.sqrt(Math.max(0, 2 * a * s.y * k)) + s.safe * m;
  return { left: dv < -0.5, right: dv > 0.5, thrust: s.vy > lim };
}
const BOTS = {
  ace: () => ace, steady12: () => { let n = 0, i = {}; return (s) => (n++ % 12 === 0 ? (i = ace(s)) : i); }, steady24: () => { let n = 0, i = {}; return (s) => (n++ % 24 === 0 ? (i = ace(s)) : i); },
  drifter: () => (s) => ({ left: s.padX - s.x < -2, right: s.padX - s.x > 2, thrust: false }),
  floater: () => () => ({ thrust: true }),
  sloppy: () => (s) => ({ left: s.padX - s.x < -2, right: s.padX - s.x > 2, thrust: s.y < 40 }),
};
const rate = (bot, tier, points, n = 150) => { let w = 0; for (let seed = 1; seed <= n; seed++) { const s = mk(seed, { tier, level: 9, points }); const f = BOTS[bot](); let i = 0; while (!s.done && i++ < 3600) stepPilot(s, PILOT_DT, f(s)); if (s.result?.success) w++; } return w / n; };

test('bots: a good pilot lands at every roll; never thrusting, thrusting from the start and braking late all crash', () => {
  for (const tier of [-2, 0, 2]) {
    assert.ok(rate('ace', tier, {}) >= 0.95, `ace at tier ${tier}`);
    for (const b of ['drifter', 'floater', 'sloppy']) assert.equal(rate(b, tier, {}), 0, `${b} at tier ${tier}`);
  }
});

test('bots: a slower hand lands less often, and points and the roll help it', () => {
  const none = rate('steady24', 0, {}), pts = rate('steady24', 0, { handling: 3, boost: 3, landing: 3 });
  assert.ok(none > rate('steady24', -2, {}) , 'a better roll helps the slow hand');
  assert.ok(rate('steady24', 2, {}) >= none);
  assert.ok(pts >= none, `points help: ${none} -> ${pts}`);
  assert.ok(rate('ace', 0, {}) > none && rate('steady12', 0, {}) >= none, 'a quicker hand lands more');
  // landing points alone (safe speed) move a slow hand's results; so does fuel.
  assert.ok(rate('steady24', -2, { landing: 9 }) > rate('steady24', -2, {}), 'landing points help');
});

test('every pilot point visibly changes something', () => {
  for (const c of ['handling', 'boost', 'landing']) for (let n = 1; n <= 9; n++) {
    const a = setupPilot({ points: { [c]: n - 1 }, level: 9 }), b = setupPilot({ points: { [c]: n }, level: 9 });
    assert.notDeepEqual([a.drift, a.fuel, a.safe, a.brakes], [b.drift, b.fuel, b.safe, b.brakes], `${c} ${n}`);
  }
  assert.ok(Number.isFinite(windAt(mk(1))) && Number.isFinite(gustAt(mk(1))));
});
