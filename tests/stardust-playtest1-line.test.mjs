// Playtest 1, item 4: the captain's first line names the gym before the sign. Proposed text, awaiting Donaven's yes (easy to revert).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';

test('item 4: the captain names the holodeck gym before "Jungle Wellness 4" and the line still fits a phone caption', () => {
  const q = SLICE_LIST.find((x) => x.id === 'third-shift');
  const text = q.nodes['brief-2'].text;
  assert.equal(text, 'The holodeck gym is a little moist. Jungle Wellness 4, the sign says. Mop it. Sign here. Do not ask me about the board.');
  assert.ok(text.indexOf('holodeck gym') < text.indexOf('Jungle Wellness 4'));
  assert.ok(text.split(/\s+/).length <= 45);
});

