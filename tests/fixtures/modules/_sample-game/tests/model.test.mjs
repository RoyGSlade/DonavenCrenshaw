import test from 'node:test';
import assert from 'node:assert/strict';
import { create, pick, triesOf, targetOf, PADS } from '../model.js';
test('same seed, same pad; points never make it worse', () => {
  assert.equal(targetOf(7), targetOf(7));
  for (let p = 0; p < 9; p++) assert.ok(triesOf({ points: { diagnose: p + 1 } }) >= triesOf({ points: { diagnose: p } }));
  assert.ok(pick(create({ seed: 3 }), targetOf(3)).success && PADS === 6);
});
