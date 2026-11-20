// Playtest 1, item 7: the Wired status (pure).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatuses, clock, COFFEE_WORDS } from '../projects/Space-Shooter/voyage/status.js';
import { ITEMS } from '../projects/Space-Shooter/voyage/data.js';

test('Wired: 5% faster for 3 minutes, then it wears off; unknown ids do nothing', () => {
  let t = 1000;
  const s = createStatuses({ now: () => t });
  assert.equal(s.speedMult(), 1);
  assert.equal(s.add('nope'), null);
  s.add('wired');
  assert.equal(s.speedMult(), 1.05);
  assert.deepEqual(s.active().map((x) => [x.id, x.left]), [['wired', 180000]]);
  t += 179000; assert.equal(s.has('wired'), true);
  t += 2000; assert.equal(s.speedMult(), 1); assert.deepEqual(s.active(), []);
  assert.equal(clock(161000), '2:41');
});

test('coffee: an item you can carry, and the tease line says the plain words', () => {
  assert.ok(ITEMS.find((i) => i.id === 'coffee' && i.max >= 1));
  assert.match(COFFEE_WORDS.drink, /Wired/); assert.match(COFFEE_WORDS.drink, /5%/); assert.match(COFFEE_WORDS.drink, /Bodily functions coming soon\.$/);
});
