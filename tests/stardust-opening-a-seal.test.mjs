// Opening track A, outcome 2: the opening is sealed (every exit, with its reason). Pure tests: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { ROOMS } from '../projects/Space-Shooter/voyage/slice/presence.js';
import { sealed, sealReason, openingOver, WHY, EXITS } from '../projects/Space-Shooter/voyage/slice/seal.js';

const slice = { flags: { 'slice-started': 1 }, quests: { active: {}, done: {} } };
const withDone = (...ids) => ({ ...slice, quests: { active: {}, done: Object.fromEntries(ids.map((i) => [i, { result: 'success' }])) } });


// ---- 2. the opening is sealed -------------------------------------------------------------------------------------------------

test('seal: every door that leaves the Duchess is sealed with a reason while the opening runs, and opens after it', () => {
  let leaving = 0;
  for (const room of ROOMS) {
    for (const d of MAP_DEFS[room].doors || []) {
      if (ROOMS.includes(d.to)) continue;
      leaving++;
      const why = sealReason(slice, { kind: 'door', id: d.id, to: d.to, map: room });
      assert.equal(why, WHY.stay, `${room}/${d.id} (to ${d.to}) is sealed`);
      assert.equal(sealReason(withDone('day-five'), { kind: 'door', id: d.id, to: d.to, map: room }), null, 'open once scene 6 is done');
    }
  }
  assert.ok(leaving >= 1, 'the pad has a way to the hangar');
});

test('seal: the helm is sealed; the cargo ramp is sealed until scene 6 is the scene in progress', () => {
  assert.equal(sealReason(slice, { kind: 'ship', id: 'helm' }), WHY.helm);
  assert.equal(sealReason(withDone('day-five'), { kind: 'ship', id: 'helm' }), null);
  assert.equal(sealReason(slice, { kind: 'door', id: 'ramp', to: 'duchess-pad', map: 'duchess-cargo' }), WHY.ramp);
  const scene6 = { ...slice, quests: { active: { 'day-five': { node: 'handover' } }, done: {} } };
  assert.equal(sealReason(scene6, { kind: 'door', id: 'ramp', to: 'duchess-pad', map: 'duchess-cargo' }), null, 'scene 6 starts on the pad');
  assert.equal(sealReason(slice, { kind: 'door', id: 'ramp', to: 'duchess-cargo', map: 'duchess-pad' }), null, 'coming back in is never sealed');
  assert.equal(sealReason(slice, { kind: 'door', id: 'corridor', to: 'duchess-mess', map: 'duchess-corridor' }), null, 'rooms inside the ship are open');
  assert.equal(sealReason({ flags: {}, quests: { active: {}, done: {} } }, { kind: 'ship', id: 'helm' }), null, 'outside the opening nothing is sealed');
});

test('seal: sealed() follows the opening: on from the first scene, off once scene 6 ends', () => {
  assert.equal(sealed({ flags: {} }), false);
  assert.equal(sealed(slice), true);
  assert.equal(sealed({ ...slice, flags: { ...slice.flags, 'day-five-over': 1 } }), false);
  assert.equal(openingOver(withDone('day-five')), true);
  for (const e of EXITS) assert.ok(e.id && e.where && e.how, `exit ${e.id} says how it is sealed`);
  assert.ok(EXITS.some((e) => e.id === 'helm') && EXITS.some((e) => e.id === 'classic-link-header'));
});

test('seal: the reasons are in the ship voice and end with a full stop', () => {
  for (const w of Object.values(WHY)) assert.match(w, /^Tull's orders: .*\.$/);
});

