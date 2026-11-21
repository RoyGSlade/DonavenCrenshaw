import test from 'node:test';
import assert from 'node:assert/strict';
import { session, HANDS } from './hands.mjs';

const SHAPES = [[16, 10], [9, 14]];
const CONTEXTS = { friend: undefined, new: { now: 1790000000000, ralph: { mood: 5, bond: 0, lastSeen: 1789990000000, finds: [{ item: 'loose-bolt', chance: 0.15 }] }, save: { items: { bone: 0, kibble: 1 } } }, devoted: { now: 1790000000000, ralph: { mood: 90, bond: 5, lastSeen: 1789400000000, favourite: 'rub', spot: 'shoulder' }, save: { items: { bone: 2, kibble: 2 } } } };
const table = [];

for (const [name, make] of Object.entries(HANDS)) {
  test(`${name} hand: invariants over seeds, shapes and records`, () => {
    let n = 0, grades = 0, fetches = 0, petted = 0, minMood = 100, worstAway = 0, worstCarry = 0, fed = 0, found = 0, bone = 0;
    for (const [w, h] of SHAPES) for (const [cn, c] of Object.entries(CONTEXTS)) for (let seed = 1; seed <= 4; seed++) {
      const { sim, result } = session({ seed, w, h, context: c === undefined ? undefined : c, secs: 80, hand: make() });
      n++; grades += result.grade; fetches += result.fetches; petted += result.petted; fed += result.fed; found += result.found; bone += result.effects.items.bone ? 1 : 0;
      minMood = Math.min(minMood, sim.log.minMood); worstAway = Math.max(worstAway, sim.log.maxAwayRun); worstCarry = Math.max(worstCarry, sim.log.stuckBall);
      assert.equal(sim.log.gettable, true, 'the ball is always gettable');
      assert.ok(sim.log.stuckBall < 20, `the ball is never held more than 20 s (${sim.log.stuckBall})`);
      assert.ok(sim.log.maxAwayRun <= 6.5, 'he is never away for long');
      assert.ok(sim.log.minMood > 2, `mood never sticks at the bottom (${sim.log.minMood})`);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'the result is plain data');
      assert.ok(result.grade >= 0 && result.grade <= 100 && result.success === true && result.done === true);
      for (const [k, v] of Object.entries(result.effects.items)) { assert.ok(Number.isInteger(v)); if (k === 'bone' || k === 'kibble') assert.ok(v < 0 && -v <= 2); }
    }
    table.push({ hand: name, runs: n, grade: Math.round(grades / n), fetches: +(fetches / n).toFixed(1), petted: +(petted / n).toFixed(1), fed: +(fed / n).toFixed(1), found: +(found / n).toFixed(1), minMood: Math.round(minMood), worstAway: +worstAway.toFixed(1), worstCarry: +worstCarry.toFixed(1) });
    if (name === 'lazy') assert.equal(fetches, 0);
  });
}
test('the resting thinker does about as well as the wobbly hand, and resting costs nothing', () => {
  const g = (make) => { let t = 0, n = 0; for (const [w, h] of SHAPES) for (let seed = 1; seed <= 6; seed++) { t += session({ seed, w, h, secs: 80, hand: make() }).result.grade; n++; } return t / n; };
  const wob = g(HANDS.wobbly), thk = g(HANDS.thinker), lazy = g(HANDS.lazy);
  assert.ok(thk >= wob - 8, `thinker ${thk} vs wobbly ${wob}`); assert.ok(thk >= lazy, `thinker ${thk} vs lazy ${lazy}`);
  assert.ok(wob >= lazy, `wobbly ${wob} vs lazy ${lazy}`);
});
test('the nice hand ends happier than the lazy one, with a longer, fuller visit', () => {
  const nice = session({ seed: 2, secs: 90, hand: HANDS.nice() }), lazy = session({ seed: 2, secs: 90, hand: HANDS.lazy() });
  assert.ok(nice.result.grade > lazy.result.grade); assert.ok(nice.result.fetches >= 4);
});
test.after(() => { console.log('\nHAND TABLE\n' + table.map((r) => JSON.stringify(r)).join('\n')); });
