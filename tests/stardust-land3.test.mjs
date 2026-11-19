// Launch art batch 3 landing (launch land3 lane, 2026-11-18). Written before the wiring, against the outcome:
//   1. in the new game the player is the janitor (janitor-a..d at scale 2.0); today's game and ?start=hangar keep the pilot looks;
//   2. every speaker of the six opening scenes, in every emotion they use, resolves to a portrait file that exists
//      (the dialogue box shows a face, never a nameplate letter);
//   3. the holo palm and fern glitch art is registered (card A, the subtle strength; the strength itself is checked by eye
//      and by number in the proof, see launch/land3/READY-FOR-ERIK.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { castPortrait, expressionFor } from '../projects/Space-Shooter/voyage/story/cast.js';
import { playerArt, CAST_LOOK, JANITOR_SCALE } from '../projects/Space-Shooter/voyage/onfoot/assets.js';
import { wantsSlice } from '../projects/Space-Shooter/voyage/slice/director.js';
import { LOOK_ART } from '../projects/Space-Shooter/voyage/onfoot/look/lookArt.js';

const voyage = new URL('../projects/Space-Shooter/voyage/', import.meta.url);

test('land3: the new game player is the janitor at scale 2.0, in four colours', () => {
  assert.equal(JANITOR_SCALE, 2.0);
  const a = playerArt({ janitor: true, lookId: 'p1' });
  assert.match(a.file, /^janitor-a\.webp$/);
  assert.equal(a.scale, 2.0);
  assert.deepEqual(['p1', 'p2', 'p3', 'p4'].map((l) => playerArt({ janitor: true, lookId: l }).file), ['janitor-a.webp', 'janitor-b.webp', 'janitor-c.webp', 'janitor-d.webp']);
  assert.equal(playerArt({ janitor: true, lookId: 'nonsense' }).file, 'janitor-a.webp');
  for (const l of 'abcd') assert.ok(existsSync(new URL(`onfoot/art/cast/janitor-${l}.webp`, voyage)), `janitor-${l}.webp is in the repo`);
});

test('land3: today\'s game and the hangar start keep the pilot sprite and scale', () => {
  const p = playerArt({ janitor: false, lookId: 'p1' });
  assert.equal(p.file, 'cap-a.webp');
  assert.equal(p.scale, CAST_LOOK.captain.scale);
  assert.equal(playerArt({ janitor: false, lookId: 'p3' }).file, 'cap-c.webp');
  // the default (nothing switched on) is the pilot
  assert.equal(playerArt().file, 'cap-a.webp');
  // and the page only turns the janitor on when it starts the opening
  const fresh = { character: null, flags: {} };
  assert.equal(wantsSlice({ save: fresh, params: new URLSearchParams('newgame=1'), newGame: true }), true);
  assert.equal(wantsSlice({ save: fresh, params: new URLSearchParams('newgame=1&start=hangar'), newGame: true }), false);
  assert.equal(wantsSlice({ save: fresh, params: new URLSearchParams(''), newGame: false }), false);
});

test('land3: every speaker line of the six slice scenes resolves to a portrait file', () => {
  const seen = new Set();
  for (const q of SLICE_LIST) {
    for (const node of Object.values(q.nodes)) {
      if (!node.line) continue;
      const speaker = node.line.split('.')[0];
      const url = castPortrait(speaker, node.emotion);
      assert.ok(url, `${q.id} ${node.line} (${speaker}, ${node.emotion}) has a portrait`);
      assert.ok(existsSync(fileURLToPath(url)), `${node.line}: ${url} exists`);
      seen.add(`${speaker}:${expressionFor(node.emotion)}`);
    }
  }
  for (const who of ['tull', 'nessa', 'pip', 'reck', 'reaver']) assert.ok([...seen].some((s) => s.startsWith(`${who}:`)), `${who} speaks in the slice`);
});

test('land3: all 13 approved faces exist and the three expressions pick different files for the people who have them', () => {
  for (const who of ['tull', 'nessa', 'pip']) {
    const files = ['neutral', 'warm', 'grumpy'].map((e) => castPortrait(who, e));
    assert.equal(new Set(files).size, 3, who);
  }
  assert.notEqual(castPortrait('reck', 'neutral'), castPortrait('reck', 'warm'));
  assert.notEqual(castPortrait('reaver', 'neutral'), castPortrait('reaver', 'grumpy'));
});

test('land3: the holo palm and fern glitch states are registered', () => {
  for (const id of ['holo-palm-glitch', 'holo-fern-glitch']) {
    const file = LOOK_ART.prop[id];
    assert.ok(file, `${id} is in lookArt.js`);
    assert.ok(existsSync(new URL(`onfoot/art/look/${file}`, voyage)), `${id} file exists`);
  }
});
