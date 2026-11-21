// Opening track A, outcome 4: every NPC answers. Pure tests: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_IDS } from '../projects/Space-Shooter/voyage/slice/presenceData.js';
import { ROLES } from '../projects/Space-Shooter/voyage/slice/role.js';
import { FALLBACK, fallbackLine } from '../projects/Space-Shooter/voyage/slice/fallbackLines.js';


// ---- 4. every NPC answers -----------------------------------------------------------------------------------------------------

test('fallback: every person in the opening has lines for every role and for when they are on the move', () => {
  for (const id of NPC_IDS) {
    assert.ok(FALLBACK[id], `${id} has fallback lines`);
    for (const role of ROLES) assert.ok(FALLBACK[id][role]?.length >= 3, `${id}/${role} has three or more`);
    assert.ok(FALLBACK[id].moving?.length >= 1, `${id} has a walking line`);
    for (let n = 0; n < 6; n++) for (const role of ROLES) assert.ok(fallbackLine(id, { role, n })?.text.length > 3);
  }
  assert.equal(fallbackLine('nobody'), null);
});

test('fallback: they rotate, they are short, and nobody calls a janitor captain', () => {
  for (const id of NPC_IDS) {
    const a = fallbackLine(id, { role: 'janitor', n: 0 }).text, b = fallbackLine(id, { role: 'janitor', n: 1 }).text;
    assert.notEqual(a, b, `${id} does not repeat on the second ask`);
    for (const [role, lines] of Object.entries(FALLBACK[id])) {
      for (const text of lines) {
        assert.ok(text.length <= 70, `${id}/${role}: short (${text.length})`);
        if (role === 'janitor' || role === 'gunner' || role === 'moving') assert.doesNotMatch(text, /\bcaptain\b[,.!?]/i, `${id}/${role}: ${text}`);
      }
    }
  }
  assert.equal(fallbackLine('tull', { role: 'captain', moving: true, n: 0 }).text.length > 0, true);
  assert.ok(FALLBACK.tull.janitor.some((t) => /mop boy/i.test(t)), 'the brief example: "Not now, mop boy"');
});

