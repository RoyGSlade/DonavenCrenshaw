// Opening track A, outcome 3: role-aware lines. Pure tests: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleOf, roleSay, addressOf, ROLES } from '../projects/Space-Shooter/voyage/slice/role.js';
import { LINES } from '../projects/Space-Shooter/voyage/story/lines.js';
import { fillLine } from '../projects/Space-Shooter/voyage/story/lines.js';
import { STAND_IN } from '../projects/Space-Shooter/voyage/onfoot/standInLines.js';

const slice = { flags: { 'slice-started': 1 }, quests: { active: {}, done: {} } };
const withDone = (...ids) => ({ ...slice, quests: { active: {}, done: Object.fromEntries(ids.map((i) => [i, { result: 'success' }])) } });


// ---- 3. role-aware lines ------------------------------------------------------------------------------------------------------

test('role: janitor until hired, gunner until handed the ship, captain after; outside the opening a captain', () => {
  assert.equal(roleOf({ flags: {} }), 'captain');
  assert.equal(roleOf(slice), 'janitor');
  assert.equal(roleOf(withDone('third-shift', 'visitors', 'hold-the-corridor')), 'janitor');
  assert.equal(roleOf(withDone('the-eighth-gunner')), 'gunner', 'even a refused seat is a gunner week');
  assert.equal(roleOf({ ...withDone('the-eighth-gunner'), flags: { 'slice-started': 1, 'duchess-busted': 1 } }), 'captain', 'the handover makes the captain');
  assert.equal(roleOf(withDone('day-five')), 'captain');
  assert.deepEqual(ROLES, ['janitor', 'gunner', 'captain']);
});

test('role: a line written for a captain says the right word to a janitor, and keeps Captain Tull', () => {
  assert.equal(roleSay('Paperwork first, Captain. Then she is yours.', 'janitor'), 'Paperwork first, Janitor. Then she is yours.');
  assert.equal(roleSay("There's my captain!", 'janitor'), "There's my janitor!");
  assert.equal(roleSay('Pull up a crate, Captain.', 'gunner'), 'Pull up a crate, Gunner.');
  assert.equal(roleSay('Captain Tull says hello, Captain.', 'janitor'), 'Captain Tull says hello, Janitor.');
  assert.equal(roleSay('Pull up a crate, Captain.', 'captain'), 'Pull up a crate, Captain.');
  assert.equal(addressOf('gunner'), 'Gunner');
  assert.equal(roleSay('Lost the upgrades, kept the captain.', 'janitor'), 'Lost the upgrades, kept the janitor.', 'lower case stays lower case');
  assert.equal(roleSay('Captain {name}. Has a ring to it.', 'gunner'), 'Gunner {name}. Has a ring to it.', "the player's own title changes too");
});

test('role: every line in the game that addresses the player as captain is covered (the audit list)', () => {
  const addressed = [];
  for (const l of LINES) if (/\bcaptain\b/i.test(l.text)) addressed.push(l);
  for (const l of Object.values(STAND_IN).flat()) if (/\bcaptain\b/i.test(l.text)) addressed.push({ id: `standIn:${l.who}`, text: l.text });
  assert.ok(addressed.length >= 8, `found ${addressed.length} lines that say captain`);
  for (const l of addressed) {
    const said = roleSay(l.text, 'janitor').replace(/\{name\}/g, 'Sam');
    assert.doesNotMatch(said, /\b[Cc]aptain\b(?!\s+(?!Sam)[A-Z])/, `${l.id}: a janitor is not called captain: ${said}`);
  }
});


test('role: the story line filler applies it (a janitor hears the address word of their role, a captain is unchanged)', () => {
  assert.equal(fillLine('Pull up a crate, Captain.', { role: 'janitor' }), 'Pull up a crate, Janitor.');
  assert.equal(fillLine('Pull up a crate, Captain.', { role: 'gunner' }), 'Pull up a crate, Gunner.');
  assert.equal(fillLine('Pull up a crate, Captain.', { role: 'captain' }), 'Pull up a crate, Captain.');
  assert.equal(fillLine('Pull up a crate, Captain.', {}), 'Pull up a crate, Captain.');
  assert.equal(fillLine('Welcome aboard, {name}.', { name: 'Sam', role: 'janitor' }), 'Welcome aboard, Sam.');
  assert.equal(fillLine('Captain {name}. Has a ring to it.', { name: 'Sam', role: 'janitor' }), 'Janitor Sam. Has a ring to it.');
});
