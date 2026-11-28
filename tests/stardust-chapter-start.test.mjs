// Playtest links that start at a later scene (?newgame=1&chapter=N): every chapter's earlier scenes play to their endings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterOf, playedTo, CHAPTER_PLANS } from '../projects/Space-Shooter/voyage/slice/chapterStart.js';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';

test('chapterOf takes 2 to 6 only', () => {
  assert.deepEqual(['1', '2', '4', '6', '7', 'x', ''].map(chapterOf), [null, 2, 4, 6, null, null, null]);
});

test('each chapter start has every earlier scene done and nothing active', () => {
  for (let n = 2; n <= SLICE_LIST.length; n++) {
    const save = playedTo({ quests: { active: {}, done: {} }, flags: {} }, n);
    assert.deepEqual(Object.keys(save.quests.done), SLICE_LIST.slice(0, n - 1).map((q) => q.id), `chapter ${n}`);
    assert.deepEqual(save.quests.active, {});
  }
  assert.equal(Object.keys(CHAPTER_PLANS).length, SLICE_LIST.length - 1);
});
