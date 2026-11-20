// Playtest 1, item 8: the crew board data (pure). The notes are drafts for Donaven's review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, noteFlag } from '../projects/Space-Shooter/voyage/slice/board.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';

test('board: seven names, six crossed, the last Reck in pencil; 3 to 5 short notes with unique ids on the board', () => {
  assert.equal(BOARD.names.length, 7);
  assert.equal(BOARD.names.filter((n) => n.crossed).length, 6);
  assert.deepEqual(BOARD.names.at(-1), { name: 'Reck', crossed: false, pencil: true });
  assert.ok(BOARD.notes.length >= 3 && BOARD.notes.length <= 5);
  assert.equal(new Set(BOARD.notes.map((n) => n.id)).size, BOARD.notes.length);
  for (const n of BOARD.notes) { assert.ok(n.text.split(/\s+/).length <= 25, n.id); assert.ok(n.at[0] >= 0 && n.at[0] <= 95 && n.at[1] >= 0 && n.at[1] <= 90); assert.match(noteFlag(n.id), /^board-note-/); }
});

test('board: the mess hall has one crew-board interact, on a prop that draws nothing', () => {
  const props = MAP_DEFS['duchess-mess'].props.filter((p) => p.interact?.id === 'crew-board');
  assert.equal(props.length, 1);
  assert.equal(props[0].alpha, 0); assert.equal(props[0].flat, true); assert.equal(props[0].block, false);
});
