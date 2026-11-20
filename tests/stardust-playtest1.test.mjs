// Playtest 1 fixes (Donaven, 2026-11-19), pure parts. The browser parts are in stardust-playtest1-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { markerFor, waitingOn, SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';

const saveAt = (quest, node) => ({ ...emptySave(), flags: { [SLICE_FLAG]: 1 }, quests: { active: { [quest.id]: { node, visits: { [node]: 1 }, ended: false } }, done: {} } });

test('waypoint: a marker that points at a person only ever sits on a step with something for them to say', () => {
  let checked = 0;
  for (const q of SLICE_LIST) {
    for (const [id, node] of Object.entries(q.nodes)) {
      if (node.type === 'end') continue;
      const run = { node: id, visits: { [id]: 1 }, ended: false };
      const m = markerFor(q, run);
      if (!m?.npc) continue;
      checked++;
      // the run is at a dialogue node of a step whose marker is this npc: talking to them has a beat to play
      assert.equal(node.type, 'dialogue', `${q.id}/${id}: the marker is on ${m.npc} but the node is ${node.type}`);
      assert.ok(waitingOn(saveAt(q, id), m.npc, m.map), `${q.id}/${id}: talking to ${m.npc} in ${m.map} must pick the scene back up`);
      assert.ok(!waitingOn(saveAt(q, id), 'someone-else', m.map), 'only the marked person picks it up');
      assert.ok(!waitingOn(saveAt(q, id), m.npc, 'hangar'), 'only in the marked room');
    }
  }
  assert.ok(checked >= 5, `${checked} npc markers checked`);
});

test('waypoint: after "Later" the captain is still the marked person and waitingOn says so', () => {
  const q = SLICE_LIST.find((x) => x.id === 'third-shift');
  const s = saveAt(q, 'brief-2');
  assert.deepEqual(markerFor(q, s.quests.active['third-shift']), { map: 'duchess-mess', npc: 'tull' });
  assert.equal(waitingOn(s, 'tull', 'duchess-mess'), true);
  assert.equal(waitingOn({ ...s, quests: { active: {}, done: {} } }, 'tull', 'duchess-mess'), false, 'no scene, nothing to resume');
});

test('lone Done / Go on: the wait scales with the line and stays in a sane range', async () => {
  const { autoMs } = await import('../projects/Space-Shooter/voyage/datapad/jobTalk.js');
  assert.ok(autoMs('Hi.') >= 2200 && autoMs('Hi.') < autoMs('x'.repeat(120)));
  assert.equal(autoMs('x'.repeat(5000)), 9000);
});
