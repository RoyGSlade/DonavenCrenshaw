// "Waits on Donaven's walk": scenes 3 (airlock hack) and 5 (coolant) play hacking v2 (mirrors) and coolant water-rise v2, and the world
// results those games already build (the shut valve, security alerted, terminal locked) reach the engine as plain facts. The approved scene
// text and every ending stay exactly as they were: only the branch picks the node. Pure; the page side is the scenemini browser test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { startQuest, act, view } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { createCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';
import { worldResult } from '../projects/Space-Shooter/voyage/minigames/sceneHook.js';
import { ready as modulesReady } from '../projects/Space-Shooter/voyage/modules/registry.js';
await modulesReady(); // gym games and scene hooks come from the module registry

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));
const rng = () => 0.5;
const save0 = () => ({ ...emptySave(), money: 50, rep: { tull: 5 }, character: createCharacter({ name: 'Janitor', look: { portrait: 'p1' } }, rng, () => 1), flags: { [SLICE_FLAG]: 1 } });

function toNode(id, node, via = []) {
  const quest = Q[id];
  for (let seed = 7; seed < 400; seed++) {
    let { run, save } = startQuest(quest, save0(), { seed, now: 1 });
    const queue = [...via];
    for (let i = 0; i < 60 && run.node !== node; i++) {
      const open = view(quest, run, save).choices.filter((c) => !c.locked);
      const pick = open.length === 1 ? open[0] : open.find((c) => c.label.startsWith(queue[0] ?? '\0')) || open[0];
      if (open.length > 1 && queue.length) queue.shift();
      const r = act(quest, run, save, { type: 'choose', index: pick.index }, { now: 1 });
      if (r.error) break; run = r.run; save = r.save;
    }
    if (run.node === node) return { quest, run, save };
  }
  assert.fail(`no seed reaches ${node}`);
}
const hooked = (quest, run, save, label) => {
  const c = view(quest, run, save).choices.find((x) => x.label === label);
  return act(quest, run, save, { type: 'choose', index: c.index }, { now: 1 });
};

test('the hooks play the v2 games: playHook launches through the registry, and the hack and repair modules wrap mirrors (hacking v2) and the water-rise repair', () => {
  const read = (f) => readFileSync(new URL(`../projects/Space-Shooter/voyage/${f}`, import.meta.url), 'utf8');
  assert.match(read('minigames/playHook.js'), /modules\/registry\.js/);
  assert.match(read('modules/hack/index.js'), /playMirrors/); assert.match(read('modules/repair/index.js'), /playRepair/);
  for (const f of ['minigames/playHook.js', 'modules/hack/index.js']) assert.doesNotMatch(read(f), /hackView|playRing|playSetupHack/, 'the old hack ring is not behind a scene hook');
});

test('scene 5: a lost coolant line with the valve shut reaches the engine as plain facts and changes nothing else', () => {
  const label = 'Patch the line with a wrench and tape.';
  const a = toNode('gunners-week', 'engine-brief-2'), b = toNode('gunners-week', 'engine-brief-2');
  const world = worldResult('repair', { success: false, broken: true, flooding: true, offline: 'engine-cooling', system: 'engine-cooling', systemName: 'Engine cooling' });
  assert.deepEqual(world, { broken: true, flooding: true, offline: 'engine-cooling', system: 'engine-cooling', systemName: 'Engine cooling' });
  const ra = hooked(a.quest, a.run, a.save, label), rb = hooked(b.quest, b.run, b.save, label);
  const plain = act(a.quest, ra.run, ra.save, { type: 'minigame', branch: 'lose', xp: 0, skill: 'repair' }, { now: 1 });
  const withWorld = act(b.quest, rb.run, rb.save, { type: 'minigame', branch: 'lose', xp: 0, skill: 'repair', world }, { now: 1 });
  assert.equal(plain.error, undefined); assert.equal(withWorld.error, undefined);
  assert.equal(withWorld.run.node, plain.run.node, 'the branch picks the node, the world result does not');
  assert.equal(view(b.quest, withWorld.run, withWorld.save).text, view(a.quest, plain.run, plain.save).text, 'the approved scene text is untouched');
  assert.deepEqual(withWorld.run.world.repair, world);
  assert.ok(withWorld.events.some((e) => e.type === 'minigame-world' && e.kind === 'repair' && e.world.offline === 'engine-cooling'));
  assert.equal(plain.run.world, undefined);
});

test('scene 3: security alerted and the terminal locked reach the engine; junk keys and wrong types are dropped', () => {
  const label = 'Hack the inner airlock door shut from the corridor panel.';
  const a = toNode('hold-the-corridor', 'corridor');
  const r = hooked(a.quest, a.run, a.save, label);
  const world = worldResult('hack', { success: false, security: 'alerted', terminal: 'locked' });
  assert.deepEqual(world, { security: 'alerted', terminal: 'locked' });
  const fin = act(a.quest, r.run, r.save, { type: 'minigame', branch: 'lose', xp: 0, skill: 'hacking', world: { ...world, evil: 'x'.repeat(500), broken: 'yes', section: 7 } }, { now: 1 });
  assert.equal(fin.error, undefined);
  assert.equal(fin.run.node, 'fight-hold', 'a lost hack still goes to the corridor fight, as approved');
  assert.deepEqual(fin.run.world.hack, { security: 'alerted', terminal: 'locked' });
});
