// The playable slice: the quest engine on core's real rules. Quest rewards go
// through core's grant into the save, upgrades change the next job's ship, a
// death ending is reported for the hangar to call store.die(), quest state is
// kept and repaired by core's save, and the art map points at real files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startQuest, view, act, shipFor } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { shipRaceBonus, createRace, actRace } from '../projects/Space-Shooter/voyage/quests/parts/race.js';
import { roller, hashSeed } from '../projects/Space-Shooter/voyage/quests/rng.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { QUEST_GIVERS } from '../projects/Space-Shooter/voyage/quests/data/givers.js';
import * as quests from '../projects/Space-Shooter/voyage/quests/core.js';
import * as economy from '../projects/Space-Shooter/voyage/economy.js';
import { createVoyageStore } from '../projects/Space-Shooter/voyage/store.js';
import { cleanSave, cleanQuests, emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { upgrade, combatStats, writesBoard } from '../projects/Space-Shooter/voyage/upgrades.js';
import { ITEMS, START_KIT, GIVERS } from '../projects/Space-Shooter/voyage/data.js';
import { ART, shipTierArt, giverPortrait } from '../projects/Space-Shooter/voyage/art.js';

const captain = (stats = { cha: 3, con: 3, dex: 3, wis: 3 }) => quests.testCharacter(stats);
const withCaptain = (extra = {}, stats) => cleanSave({ ...emptySave(), character: captain(stats), ...extra });

function memoryStore() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// A simple player for steps other than dialogue: fire in fights, take the first
// lane, first open card choice, quick races, give up on puzzles.
function partAction(v, tactic = 'fire') {
  const p = v.part;
  if (p.kind === 'skirmish') return { move: tactic };
  if (p.kind === 'cipher' || p.kind === 'riddle') return { type: 'giveUp' };
  if (p.kind === 'race') return { type: 'quick', style: 'clean' };
  if (p.kind === 'foot') return { move: 'fight' };
  if (p.kind === 'trip' && p.phase === 'plan') return { type: 'route', route: p.routes[0].id };
  const card = p.card;
  if (card?.phase === 'choose') return { type: 'choose', index: card.choices.find((c) => !c.locked).index };
  if (card?.phase === 'fight') return { move: tactic };
  return { type: 'continue' };
}

// Plays a quest with a simple policy until it ends.
function play(quest, save, seed, pick) {
  let { run, save: s } = startQuest(quest, save, { seed, now: 1 });
  const events = [];
  for (let i = 0; i < 300 && !run.ended; i++) {
    const v = view(quest, run, s);
    const action = pick(v, run);
    const out = act(quest, run, s, action, { now: 2 });
    assert.equal(out.error, undefined, `step ${i} at ${run.node}: ${out.error}`);
    run = out.run; s = out.save; events.push(...out.events);
  }
  assert.ok(run.ended, 'the quest ended');
  return { run, save: s, events };
}

test('quests use core\'s real modules: the stub is gone, mining-drill is an item, givers match', () => {
  assert.equal(quests.grant, economy.grant, 'quests pay with core\'s grant');
  assert.equal(quests.missing, economy.missing);
  const drill = ITEMS.find((i) => i.id === 'mining-drill');
  assert.deepEqual({ kind: drill.kind, max: drill.max }, { kind: 'key', max: 1 });
  assert.deepEqual(Object.keys(QUEST_GIVERS).sort(), GIVERS.map((g) => g.id).sort());
  for (const id of Object.keys(QUEST_GIVERS)) assert.ok(quests.GIVERS[id], `${id} is a core giver`);
  assert.equal(existsSync(fileURLToPath(new URL('../projects/Space-Shooter/voyage/quests/coreStub.js', import.meta.url))), false);
});

test('a job\'s reward lands in the save through core\'s grant: credits, rep with the rep bonus, items, points, fragment', () => {
  // Charisma 6 gives +15% rep (core's rule), which the stub never did.
  const save = withCaptain({}, { cha: 6, con: 6, dex: 6, wis: 6 });
  const quest = QUESTS['cold-run'];
  const { save: after, events } = play(quest, save, 4, (v) => {
    if (v.part) return partAction(v);
    const quiet = v.choices.find((c) => !c.locked && /debt|decoy|outrun|another pad|I'll take it|Plot|Hand it/i.test(c.label));
    return { type: 'choose', index: (quiet || v.choices.find((c) => !c.locked)).index };
  });
  assert.equal(after.quests.done['cold-run'].result, 'success');
  assert.deepEqual(after.quests.active ?? {}, {}, 'nothing left running');
  assert.ok(after.money >= 70, 'paid in credits');
  assert.equal(after.rep.hask, Math.floor(12 * 1.15), 'quiet pays 12 rep, raised by the captain\'s charisma');
  assert.equal(after.character.earned, 1);
  assert.equal(after.flags['fragment-1'], 1);
  assert.ok(events.some((e) => e.type === 'rep' && e.giver === 'hask'));
});

test('max rep from a job pays the giver\'s permanent point, livery and title (shown in the Ledger)', () => {
  const save = withCaptain({ rep: { hask: 95 } });
  const out = economy.grant(save, { rep: { hask: 12 } });
  assert.equal(out.save.rep.hask, 100);
  assert.equal(out.save.character.permanent, 1);
  assert.ok(out.save.account.unlocks.includes('title:lane-warden'));
  assert.ok(out.events.some((e) => e.type === 'max-rep' && e.giver === 'hask'));
});

test('the loop: reward -> upgrade -> the next job\'s ship fight and race leg are stronger', () => {
  const store = createVoyageStore({ storage: memoryStore(), now: () => 1000 });
  assert.equal(store.createCharacter({ name: 'Vela' }, () => 0.5).ok, true);
  assert.deepEqual({ money: store.get().money, scrap: store.get().items.scrap }, { money: START_KIT.money, scrap: START_KIT.items.scrap }, 'a new captain signs on with the start kit');
  const before = shipFor(store.get());
  const first = startQuest(QUESTS['cold-run'], store.get(), { seed: 3, now: 1 });
  assert.equal(first.run.hullMax, before.hp);

  store.grant({ money: 120 }); // what a paid job hands over (tested above)
  assert.equal(store.upgrade('hull').ok, true, 'start kit plus one job buys hull tier 1');
  assert.equal(store.upgrade('guns').ok, false, 'not two upgrades yet');
  const next = startQuest(QUESTS['cold-run'], store.get(), { seed: 3, now: 1 });
  assert.equal(next.run.hullMax, before.hp + 20, 'hull tier 1 adds 20 hull to the next job');
  assert.equal(next.run.hullMax, combatStats(store.get(), null, 'ship-fight').hp, 'quest fights read core\'s ship-fight numbers');

  // Guns and engine reach fights and race legs too.
  let save = cleanSave({ ...store.get(), money: 5000, items: { scrap: 40, ore: 20, circuit: 10 } });
  assert.equal(shipFor(save).damage, 10);
  save = upgrade(save, 'guns').save;
  assert.equal(shipFor(save).damage, 12);
  const stockRace = shipRaceBonus(save);
  save = upgrade(upgrade(save, 'engine').save, 'thrusters').save;
  assert.ok(shipRaceBonus(save) > stockRace, 'engine and thrusters add to the race roll');
  // Same seed, same roll: the upgraded ship posts a faster quick-race time.
  const race = (s) => {
    const state = createRace({ track: 'gantry-drop', rival: { name: 'R', pace: 0.9 } });
    const run = { rng: hashSeed('race', 1), hull: 100, hullMax: 100 };
    actRace(state, { type: 'quick', style: 'clean' }, { save: s, run, rng: roller(run) });
    return state.timeMs;
  };
  assert.ok(race(save) < race(cleanSave({ ...save, upgrades: {} })));
  assert.equal(writesBoard('race', 'classic'), false, 'quest races never write today\'s boards');
  assert.equal(writesBoard('ship-fight', 'dogfight'), false);
});

test('a death ending is reported and the hangar\'s store.die() halves the earned points', () => {
  const quest = QUESTS['black-lane'];
  assert.equal(quest.nodes['end-towed'].death, true);
  const save = withCaptain({}, { cha: 1, con: 1, dex: 1, wis: 1 });
  save.character.earned = 5;
  const lost = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => play(quest, save, seed, (v) => {
    if (v.part) return partAction(v);
    return { type: 'choose', index: v.choices.find((c) => !c.locked).index };
  })).find((r) => r.run.ended.outcome === 'towed');
  assert.ok(lost, 'a weak captain loses the fight on some seed');
  assert.equal(lost.run.ended.death, true);
  // What jobs.js does with it:
  const storage = memoryStore();
  const store = createVoyageStore({ storage, now: () => 5 });
  store.update(() => lost.save);
  assert.equal(store.die(() => 0.5), 2);
  assert.equal(store.get().character.earned, 3);
  assert.equal(store.get().character.deaths, 1);
  assert.equal(store.get().quests.done['black-lane'].outcome, 'towed', 'the job record stays');
});

test('quest state in the save: kept, repaired, and trimmed to its budget', () => {
  const run = { v: 1, quest: 'cold-run', node: 'intro', log: [] };
  const q = cleanQuests({
    active: { 'cold-run': run, 'bad id!': run, 'dead-weight': { quest: 'other' } },
    done: { 'cold-run': { result: 'success', outcome: 'quiet', at: 5, times: 2 }, 'black-lane': { result: 'maybe' } },
    future: { keep: 1 },
  });
  assert.deepEqual(q.active, { 'cold-run': run });
  assert.deepEqual(q.done, { 'cold-run': { result: 'success', outcome: 'quiet', at: 5, times: 2 } });
  assert.deepEqual(q.future, { keep: 1 }, 'unknown keys are kept for newer pages');
  const big = cleanQuests({ active: { 'cold-run': { ...run, log: ['x'.repeat(40 * 1024)] } }, done: { 'cold-run': { result: 'failure', outcome: 'x', at: 1, times: 1 } } });
  assert.equal(big.active, undefined, 'an oversized run is dropped first');
  assert.equal(big.done['cold-run'].result, 'failure', 'the job record survives');
  assert.deepEqual(cleanQuests('nope'), {});
});

test('art map: one ship picture per visual tier and a portrait per giver, all real files', () => {
  assert.equal(ART.shipTiers.length, 4);
  for (let tier = 0; tier < 4; tier++) assert.ok(existsSync(fileURLToPath(shipTierArt(tier))), `tier ${tier}`);
  assert.equal(shipTierArt(9), shipTierArt(3), 'clamped');
  for (const id of Object.keys(QUEST_GIVERS)) assert.ok(existsSync(fileURLToPath(giverPortrait(id))), id);
  assert.equal(giverPortrait('nobody'), null);
});

test('every quest starts on core\'s rules with the upgraded ship\'s hull', () => {
  const save = withCaptain({ money: 300, items: { scrap: 4, permit: 1, 'mining-drill': 1 }, upgrades: { hull: 2, engine: 1, thrusters: 1, guns: 2 } }, { cha: 4, con: 4, dex: 4, wis: 4 });
  for (const quest of Object.values(QUESTS)) {
    const { run } = startQuest(quest, save, { seed: 11, now: 1 });
    assert.equal(run.hullMax, combatStats(save, null, 'ship-fight').hp, quest.id);
  }
});
