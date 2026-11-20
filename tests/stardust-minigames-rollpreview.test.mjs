// Extra 5: the roll preview line under the d20 result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollPreview, nextTier, SPECS } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { tierOf, setupRepair } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import * as MODS from '../projects/Space-Shooter/voyage/modules/registry.js';
await MODS.ready();

const at = (margin, natural = false) => ({ total: 12 + margin, dc: 12, natural });

test('exact lines: repair and pilot at each tier', () => {
  const L = (g, m, o) => rollPreview(g, at(m), o).line;
  assert.equal(L('repair', 12), 'Smooth roll: slower-rising water (36 s more), slower leaks, a smaller board (4 x 4).');
  assert.equal(L('repair', 6), 'Good roll: slower-rising water (18 s more), slower leaks.');
  assert.equal(L('repair', 2), 'Steady roll: nothing changes.');
  assert.equal(L('repair', -3), 'Shaky roll: faster-rising water (18 s less), faster leaks.');
  assert.equal(L('repair', -9), 'Rough roll: faster-rising water (36 s less), faster leaks, a bigger board (6 x 6).');
  assert.equal(L('pilot', 12), 'Smooth roll: 3.6 s more of fall time, wind 30% weaker, pad 20% wider.');
  assert.equal(L('intimidate', -9), 'Rough roll: snap risk 6 points higher, you only read a word for the risk.');
  assert.equal(L('stealth', 12), 'Smooth roll: 1 fewer guard, 8 more beats before the shift change.');
  assert.equal(L('persuade', 6), 'Good roll: you notice 1 more thing, 1 more patience, 1 less trust needed.');
});

test('a natural 20 is Smooth whatever the numbers say', () => {
  const p = rollPreview('repair', { total: 3, dc: 20, natural: true }, { level: 1 });
  assert.deepEqual([p.tier, p.label], [2, 'Smooth']); assert.equal(p.next, null); assert.equal(p.nextLine, 'The best roll there is.');
});

test('every game changes at every tier but Steady, and says so; Steady says nothing changes', () => {
  for (const g of Object.keys(SPECS)) {
    for (const m of [12, 6, -3, -9]) assert.ok(rollPreview(g, at(m), { level: 3 }).phrases.length >= 1, `${g} margin ${m}`);
    assert.deepEqual(rollPreview(g, at(2), { level: 3 }).phrases, []);
  }
  for (const g of Object.keys(SPECS)) assert.ok(MODS.has(g), `${g} preview belongs to a registered module`);
});

test('the numbers in the line are the real setup numbers, with the player\'s points', () => {
  const pts = { time: 4, size: 3 }, lv = 7;
  const a = setupRepair({ tier: 0, level: lv, points: pts }), b = setupRepair({ tier: 2, level: lv, points: pts });
  const p = rollPreview('repair', at(12), { level: lv, points: pts });
  assert.equal(p.line, `Smooth roll: slower-rising water (${b.capacity - a.capacity} s more), slower leaks${b.size < a.size ? `, a smaller board (${b.size} x ${b.size})` : ''}.`);
});

test('the gap to the next tier is exact: that many more reaches it, one fewer does not', () => {
  for (let total = 0; total <= 30; total++) {
    const attempt = { total, dc: 12 }, n = nextTier(attempt), t = tierOf(attempt);
    if (t === 2) { assert.equal(n, null); continue; }
    assert.equal(tierOf({ total: total + n.needed, dc: 12 }), t + 1, `total ${total}`);
    assert.equal(tierOf({ total: total + n.needed - 1, dc: 12 }), t, `total ${total} one short`);
    assert.ok(n.needed >= 1);
  }
  assert.equal(rollPreview('hack', at(2)).nextLine, '3 more on the d20 would make it Good.');
});

test('plain words: no raw decimals longer than one place and no codes', () => {
  for (const g of Object.keys(SPECS)) for (const m of [12, 6, -3, -9]) {
    const line = rollPreview(g, at(m), { level: 9, points: {} }).line;
    assert.doesNotMatch(line, /\d\.\d\d/); assert.doesNotMatch(line, /undefined|NaN|tier/i);
  }
});
