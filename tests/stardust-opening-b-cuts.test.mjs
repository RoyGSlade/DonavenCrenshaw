// Opening B, outcome 2: no hard cuts anywhere in scenes 1 to 6. The slice director is run against a fake world that records every
// fade, teleport and map change; the only fades allowed are the time skips between days.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSliceDirector } from '../projects/Space-Shooter/voyage/slice/director.js';
import { fightHere, spawnAt, TIME_SKIPS, skipLine } from '../projects/Space-Shooter/voyage/slice/cuts.js';
import { SLICE_LIST, SLICE_ORDER } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { arriveMode, roomOf, SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';

function fakeWorld(mapId = 'duchess-pad') {
  const calls = [];
  const w = {
    calls,
    map: { id: mapId, tile: 48, w: 960, h: 480, doors: [{ id: 'a', to: 'duchess-corridor', x: 0, y: 200, w: 48, h: 48 }] },
    position: () => ({ x: 480, y: 240 }),
    player: { angle: 0.5 },
    go: (...a) => calls.push(['go', ...a]),
    place: (...a) => calls.push(['place', ...a]),
    skip: (o) => { calls.push(['skip', o.room, o.caption]); return Promise.resolve(); },
  };
  return w;
}

function director(w, { taken = [] } = {}) {
  const store = { get: () => ({ flags: { [SLICE_FLAG]: 1 }, quests: { active: {}, done: {} } }) };
  const jobs = { playing: false, take: (q) => { taken.push(q.id); return true; } };
  const fights = [];
  const d = createSliceDirector({ store, jobs, toast: () => {}, world: () => w, fightIn: async (setup) => { fights.push(setup); return { outcome: 'win', hp: 10 }; } });
  return { d, fights, taken };
}

const fakeView = (quest, nodeId) => ({ quest: { id: quest.id }, node: nodeId });

test('beats never move the player: every node of every scene, played from a different room, calls no go, place or skip', () => {
  let beats = 0;
  for (const quest of SLICE_LIST) {
    for (const [nodeId, node] of Object.entries(quest.nodes)) {
      if (node.type !== 'dialogue') continue;
      const w = fakeWorld('duchess-pad');
      const { d } = director(w);
      let played = 0;
      d.beat(fakeView(quest, nodeId), () => { played++; });
      assert.deepEqual(w.calls, [], `${quest.id}/${nodeId}: no fade, teleport or map change`);
      const room = roomOf(quest, nodeId);
      if (room && room !== w.map.id && arriveMode(quest, nodeId) === 'walk') {
        assert.equal(played, 0, `${quest.id}/${nodeId}: waits for the player to walk to ${room}`);
        assert.equal(d.pendingRoom, room);
      } else assert.equal(played, 1, `${quest.id}/${nodeId}: plays where the player stands`);
      beats++;
    }
  }
  assert.ok(beats > 40, `walked ${beats} dialogue beats`);
});

test('a waiting beat plays when the player walks into its room', async () => {
  const w = fakeWorld('duchess-pad');
  const { d } = director(w);
  let played = 0;
  d.beat(fakeView(QUESTS.visitors, 'bridge'), () => { played++; });
  assert.equal(played, 0);
  d.entered({ id: 'duchess-bridge' });
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(played, 1);
});

test('result cards show where the player stands, with no cut to the ending\'s room', () => {
  let cards = 0;
  for (const quest of SLICE_LIST) {
    for (const [nodeId, node] of Object.entries(quest.nodes)) {
      if (node.type !== 'end') continue;
      const w = fakeWorld('duchess-cargo');
      const { d } = director(w);
      let shown = 0;
      d.endCard(fakeView(quest, nodeId), () => { shown++; });
      assert.equal(shown, 1, `${quest.id}/${nodeId}`);
      assert.deepEqual(w.calls, [], `${quest.id}/${nodeId}: no cut`);
      cards++;
    }
  }
  assert.ok(cards >= 20);
});

test('fights run where the player stands: another room\'s fight comes in by a door, the player is never yanked to a spawn', async () => {
  for (const quest of SLICE_LIST) {
    for (const [nodeId, node] of Object.entries(quest.nodes)) {
      if (node.type !== 'fight') continue;
      const arenaMap = node.arena.map;
      for (const standing of [arenaMap, 'duchess-cargo', 'duchess-bridge']) {
        const w = fakeWorld(standing);
        const { d, fights } = director(w);
        let result = 'unset';
        d.fight({ live: { setup: { map: arenaMap, spawn: 'default', exit: null, seed: 1, enemies: node.arena.enemies.map((e) => ({ ...e, room: true })) } } }, (r) => { result = r; });
        await new Promise((r) => setTimeout(r, 500));
        assert.deepEqual(w.calls, [], `${quest.id}/${nodeId} from ${standing}: no cut`);
        assert.equal(fights.length, 1);
        const s = fights[0];
        assert.equal(s.map, standing, 'the fight is in the room the player is in');
        assert.deepEqual({ x: s.spawn.x, y: s.spawn.y }, { x: 480, y: 240 }, 'the player starts where they stand');
        assert.equal(s.enemies.length, node.arena.enemies.length);
        if (standing !== arenaMap) for (const e of s.enemies) { assert.ok(e.x > 0 && e.x < 960 && e.y > 0 && e.y < 480, 'enemies are inside the room'); assert.equal(e.awake, true); }
        assert.deepEqual(result, { outcome: 'win', hp: 10 });
      }
    }
  }
});

test('fightHere puts the enemies in a file just inside the door, awake, and keeps their types and extras', () => {
  const setup = { map: 'duchess-corridor', spawn: 'default', seed: 3, enemies: [{ type: 'marauder', at: [1, 1], room: true, hp: 20 }, { type: 'marauder-boss', at: [2, 2], room: true }, { type: 'marauder', at: [3, 3], room: true }] };
  const out = fightHere(setup, { map: { id: 'duchess-cargo', tile: 48, w: 960, h: 480 }, player: { x: 480, y: 240, angle: 1 }, doorBox: { x: 0, y: 200, w: 48, h: 48 } });
  assert.equal(out.map, 'duchess-cargo');
  assert.equal(out.enemies.length, 3);
  assert.deepEqual(out.enemies.map((e) => e.type), ['marauder', 'marauder-boss', 'marauder']);
  assert.equal(out.enemies[0].hp, 20);
  for (const e of out.enemies) { assert.equal(e.at, undefined); assert.ok(e.x > 24 && e.x < 300, `just inside the west door: ${e.x}`); assert.equal(e.awake, true); }
  assert.deepEqual(out.spawn, spawnAt({ x: 480, y: 240 }, 1));
});

test('the only fades are time skips: scenes 4, 5 and 6 open with a skip line, scenes 1, 2 and 3 do not', async () => {
  assert.deepEqual(Object.keys(TIME_SKIPS), ['the-eighth-gunner', 'gunners-week', 'day-five']);
  for (const id of SLICE_ORDER) {
    const w = fakeWorld('duchess-corridor');
    const taken = [];
    const store = { get: () => ({ flags: { [SLICE_FLAG]: 1 }, quests: { active: {}, done: Object.fromEntries(SLICE_ORDER.slice(0, SLICE_ORDER.indexOf(id)).map((q) => [q, { result: 'success' }])) } }) };
    const d = createSliceDirector({ store, jobs: { playing: false, take: (q) => { taken.push(q.id); return true; } }, toast: () => {}, world: () => w, fightIn: async () => ({}) });
    assert.equal(d.advance(), true);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(taken, [id]);
    if (TIME_SKIPS[id]) { assert.equal(w.calls.length, 1); assert.equal(w.calls[0][0], 'skip'); assert.equal(w.calls[0][2], skipLine(id)); } else assert.deepEqual(w.calls, [], `${id} starts with no fade`);
  }
});

test('a scene start is not doubled while its time skip fades', async () => {
  const w = fakeWorld('duchess-corridor');
  let release;
  w.skip = () => new Promise((r) => { release = r; });
  const taken = [];
  const store = { get: () => ({ flags: { [SLICE_FLAG]: 1 }, quests: { active: {}, done: { 'third-shift': {}, visitors: {}, 'hold-the-corridor': {} } } }) };
  const d = createSliceDirector({ store, jobs: { playing: false, take: (q) => { taken.push(q.id); return true; } }, toast: () => {}, world: () => w, fightIn: async () => ({}) });
  assert.equal(d.advance(), true);
  assert.equal(d.advance(), true, 'a second ask while it fades is a no-op');
  assert.equal(taken.length, 0);
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(taken, ['the-eighth-gunner']);
});
