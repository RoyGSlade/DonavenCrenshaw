// Opening track A, outcome 5: quest steps update themselves (audit of the six scenes). Pure tests: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { SLICE_ORDER, markerFor, stepOf, arriveMode, roomOf } from '../projects/Space-Shooter/voyage/slice/rules.js';
import { ROOMS } from '../projects/Space-Shooter/voyage/slice/presence.js';


// ---- 5. quest steps update themselves -----------------------------------------------------------------------------------------

test('auto steps: every step of every scene has a marker (a room and a spot), so the waypoint and the beat start without a menu', () => {
  for (const scene of SLICE_ORDER) {
    const quest = QUESTS[scene];
    for (const step of quest.steps) {
      assert.ok(step.where && step.at, `${scene}/${step.id} has where and at`);
      assert.ok(ROOMS.includes(step.where), `${scene}/${step.id}: ${step.where} is a Duchess room`);
      const first = step.nodes[0];
      assert.ok(quest.nodes[first], `${scene}/${step.id}: first node exists`);
      const m = markerFor(quest, { node: first });
      assert.deepEqual([m.map, Object.keys(m).filter((k) => k !== 'map')[0]], [step.where, Object.keys(step.at)[0]]);
      assert.ok(['walk', 'cut'].includes(arriveMode(quest, first)), `${scene}/${step.id}: the first beat starts by itself (walk to the marker, or a cut)`);
      assert.equal(stepOf(quest, first).id, step.id);
    }
  }
});

test('auto steps: the scene-start beat of every scene is in the room its first step names', () => {
  for (const scene of SLICE_ORDER) {
    const quest = QUESTS[scene];
    assert.equal(roomOf(quest, quest.start), quest.steps[0].where, `${scene}: starts in the first step's room`);
  }
});

