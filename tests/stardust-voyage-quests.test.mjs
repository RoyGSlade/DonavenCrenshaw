// Quest engine (P7), travel and events (P8), dialogue, puzzles and riddle (P10)
// for the new Stardust ("Voyage" in code). Pure modules, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, roller, step } from '../projects/Space-Shooter/voyage/quests/rng.js';
import { roll, fill } from '../projects/Space-Shooter/voyage/quests/rolls.js';
import { startQuest, view, act, rollQuest, availability, PARTS } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { validateQuest, validateEvents } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { explore, apply } from '../projects/Space-Shooter/voyage/quests/explore.js';
import { QUESTS, SLICE_QUEST } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { QUEST_GIVERS } from '../projects/Space-Shooter/voyage/quests/data/givers.js';
import { ENEMIES } from '../projects/Space-Shooter/voyage/quests/data/enemies.js';
import { TRACKS } from '../projects/Space-Shooter/voyage/quests/data/tracks.js';
import { emptySave, testCharacter, GIVERS } from '../projects/Space-Shooter/voyage/quests/coreStub.js';
import { scoreGuess, createCipher, actCipher } from '../projects/Space-Shooter/voyage/quests/parts/cipher.js';
import { createRiddle, actRiddle } from '../projects/Space-Shooter/voyage/quests/parts/riddle.js';
import { createSkirmish, actSkirmish } from '../projects/Space-Shooter/voyage/quests/parts/skirmish.js';
import { routes, createTrip, actTrip } from '../projects/Space-Shooter/voyage/quests/parts/travel.js';
import { liveFightSetup, createLiveFight, stepLiveFight, liveFightResult, enemyInput } from '../projects/Space-Shooter/voyage/quests/live/dogfight.js';
import { GLYPHS } from '../projects/Space-Shooter/systems/progression.js';

const low = () => ({ ...emptySave(), character: testCharacter({ cha: 1, con: 1, dex: 1, wis: 1 }) });
const high = () => ({ ...emptySave(), money: 500, items: { scrap: 4, permit: 1, 'mining-drill': 1 }, flags: { 'fragment-1': 1 }, character: testCharacter({ cha: 6, con: 6, dex: 6, wis: 6 }) });
const mid = () => ({ ...emptySave(), money: 200, items: { scrap: 2 }, character: testCharacter({ cha: 3, con: 4, dex: 3, wis: 4 }) });
const quest = QUESTS[SLICE_QUEST];

function partCtx(save, seed = 1) {
  const run = { rng: hashSeed('test', seed), hull: 100, hullMax: 100, location: 'alpha', local: {} };
  return { run, save, ship: { damage: 10 }, rng: roller(run), grant() {}, spend: () => true, log() {} };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('seeded randomness is stable and replayable', () => {
  assert.equal(hashSeed('cold-run', 1), hashSeed('cold-run', 1));
  assert.notEqual(hashSeed('cold-run', 1), hashSeed('cold-run', 2));
  const [a, s1] = step(42);
  const [b, s2] = step(42);
  assert.equal(a, b); assert.equal(s1, s2);
  const holder = { rng: 7 };
  const r = roller(holder);
  const first = [r.next(), r.int(1, 6), r.pick(['x', 'y', 'z'])];
  const again = roller({ rng: 7 });
  assert.deepEqual([again.next(), again.int(1, 6), again.pick(['x', 'y', 'z'])], first);
  assert.notEqual(holder.rng, 7, 'the holder carries the new state');
});

test('roll specs: pick, range, pickN, chance and enemy templates', () => {
  const r = roller({ rng: 99 });
  for (let i = 0; i < 200; i++) {
    const out = roll({ a: { pick: [1, 2] }, b: { range: [3, 5] }, c: { pickN: 2, from: ['p', 'q', 'r'] }, d: { chance: 0.5 }, e: 'kept' }, r);
    assert.ok([1, 2].includes(out.a));
    assert.ok(out.b >= 3 && out.b <= 5);
    assert.equal(new Set(out.c).size, 2);
    assert.equal(typeof out.d, 'boolean');
    assert.equal(out.e, 'kept');
    const enemy = roll({ enemy: 'raider' }, r);
    assert.ok(enemy.hp >= 34 && enemy.hp <= 56);
    assert.ok(['strafe', 'charge', 'orbit'].includes(enemy.movement));
    assert.equal(enemy.abilities.length, 1);
    assert.ok(ENEMIES.raider.abilities.from.includes(enemy.abilities[0]));
  }
  assert.equal(fill('Take {cargo.label} to {x}', { cargo: { label: 'a core' } }), 'Take a core to {x}');
});

test('a quest rolls the same pieces from the same seed, and different pieces across seeds', () => {
  assert.deepEqual(rollQuest(quest, 5), rollQuest(quest, 5));
  const variants = new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(rollQuest(quest, seed))));
  assert.ok(variants.size > 20, 'enemy hp, movement, abilities, setup and pay all vary');
  const setups = new Set(Array.from({ length: 60 }, (_, seed) => rollQuest(quest, seed).setup));
  assert.deepEqual([...setups].sort(), ['decoy', 'tailing', 'waiting']);
});

test('all five quests, the givers and the event cards pass validation', () => {
  assert.equal(Object.keys(QUESTS).length, 5);
  for (const q of Object.values(QUESTS)) assert.deepEqual(validateQuest(q), [], q.id);
  assert.deepEqual(validateEvents(), []);
  for (const q of Object.values(QUESTS)) assert.ok(QUEST_GIVERS[q.giver] && GIVERS[q.giver], `${q.id} giver ${q.giver}`);
  for (const [id, giver] of Object.entries(QUEST_GIVERS)) for (const qid of giver.quests) assert.equal(QUESTS[qid].giver, id);
});

test('every node and every ending of every quest is reachable with real actions', () => {
  for (const q of Object.values(QUESTS)) {
    const nodes = new Set();
    const ends = new Set();
    for (const save of [low(), high(), mid()]) {
      const result = explore(q, save, { seeds: [1, 2, 3, 4, 5, 6] });
      assert.deepEqual(result.errors, [], q.id);
      result.nodes.forEach(n => nodes.add(n));
      result.ends.forEach((_, id) => ends.add(id));
    }
    assert.deepEqual(Object.keys(q.nodes).filter(id => !nodes.has(id)), [], `${q.id}: unreached nodes`);
    const endIds = Object.keys(q.nodes).filter(id => q.nodes[id].type === 'end');
    assert.deepEqual(endIds.filter(id => !ends.has(id)), [], `${q.id}: unreached endings`);
    const results = endIds.map(id => q.nodes[id]);
    assert.ok(new Set(results.filter(n => n.result === 'success').map(n => n.outcome)).size >= 2, `${q.id}: two ways to win`);
    assert.ok(new Set(results.filter(n => n.result === 'failure').map(n => n.outcome)).size >= 2, `${q.id}: two ways to fail`);
  }
});

test('the same seed and the same actions replay to the same run and save', () => {
  const found = explore(quest, mid(), { seeds: [3] });
  for (const { seed, path } of found.ends.values()) {
    const once = () => {
      let { run, save } = startQuest(quest, mid(), { seed });
      for (const action of path) ({ run, save } = apply(quest, run, save, action));
      return { run, save };
    };
    assert.deepEqual(once(), once());
  }
});

test('the engine never mutates the quest, the run or the save it is given', () => {
  const save = deepFreeze(mid());
  deepFreeze(quest);
  const start = startQuest(quest, save, { seed: 2 });
  deepFreeze(start.run); deepFreeze(start.save);
  const next = act(quest, start.run, start.save, { type: 'choose', index: 0 });
  assert.equal(next.error, undefined);
  assert.notEqual(next.run, start.run);
});

test('dialogue: stats unlock options, local flags unlock options, costs lock when unaffordable', () => {
  const findAmbush = save => {
    for (let seed = 1; seed < 200; seed++) {
      if (rollQuest(quest, seed).setup !== 'waiting') continue;
      let { run, save: s } = startQuest(quest, save, { seed });
      run = { ...run, node: 'ambush-waiting', part: null };
      return view(quest, run, s);
    }
  };
  const poor = findAmbush(low());
  const nameDrop = poor.choices.find(c => c.label.startsWith('Name the debt'));
  assert.equal(nameDrop.locked, true);
  assert.equal(nameDrop.reasons.length, 1);
  assert.match(nameDrop.reasons[0], /^Needs Charisma 5\.?$/);
  assert.equal(poor.choices.find(c => c.label.startsWith('Vent two scrap')).locked, true);
  assert.equal(poor.choices.find(c => c.label.startsWith('Tap the Knock')).locked, true);
  const rich = findAmbush(high());
  assert.equal(rich.choices.find(c => c.label.startsWith('Name the debt')).locked, false);
  assert.equal(rich.choices.find(c => c.label.startsWith('Vent two scrap')).locked, false);
  const check = rich.choices.find(c => c.check);
  assert.match(check.check.text, /check, \d+ or more/);
  // Picking a locked option is refused and changes nothing.
  let { run, save } = startQuest(quest, low(), { seed: 1 });
  run = { ...run, node: 'ambush-waiting', part: null };
  const refused = act(quest, run, save, { type: 'choose', index: 3 });
  assert.match(refused.error, /^Needs Charisma 5\.?$/);
  assert.equal(refused.run, run);
});

test('checks roll d6 + stat against the difficulty, deterministically', () => {
  const outcomes = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const { run, save } = startQuest(quest, mid(), { seed });
    const next = act(quest, run, save, { type: 'choose', index: 1 });
    outcomes.add(next.run.node);
    const r = next.run.lastCheck;
    assert.equal(r.total, r.roll + r.bonus);
    assert.equal(r.pass, r.total >= 7);
    assert.equal(next.run.node, r.pass ? 'intro-knows' : 'intro-shrug');
    assert.deepEqual(act(quest, run, save, { type: 'choose', index: 1 }).run, next.run);
  }
  assert.deepEqual([...outcomes].sort(), ['intro-knows', 'intro-shrug']);
});

test('cipher lock: scoring, Wisdom reveal, solve and fail', () => {
  assert.deepEqual(scoreGuess([0, 1, 2, 3], [0, 1, 2, 3]), { exact: 4, near: 0 });
  assert.deepEqual(scoreGuess([0, 1, 2, 3], [3, 2, 1, 0]), { exact: 0, near: 4 });
  assert.deepEqual(scoreGuess([0, 1, 2, 3], [0, 4, 1, 1]), { exact: 1, near: 1 });
  const sharp = createCipher({ length: 4, symbols: 5 }, partCtx(high()));
  assert.ok(sharp.reveal && sharp.code[sharp.reveal.slot] === sharp.reveal.symbol);
  assert.equal(new Set(sharp.code).size, 4);
  const dull = createCipher({ length: 4, symbols: 5, attempts: 2 }, partCtx(low()));
  assert.equal(dull.reveal, null);
  assert.ok(actCipher(dull, { type: 'guess', code: [9, 9, 9, 9] }).error);
  const wrong = dull.code.map(s => (s + 1) % 5);
  actCipher(dull, { type: 'guess', code: wrong });
  assert.equal(dull.done, false);
  actCipher(dull, { type: 'guess', code: wrong });
  assert.equal(dull.outcome, 'failed');
  const s = createCipher({}, partCtx(mid()));
  actCipher(s, { type: 'guess', code: [...s.code] });
  assert.equal(s.outcome, 'solved');
});

test('riddle: reuses the parked seal glyphs, rolled order, checks only a full answer', () => {
  const reverse = createRiddle({ mode: 'reverse' }, partCtx(low(), 4));
  assert.deepEqual(reverse.fragments.map(f => f.id).sort(), GLYPHS.map(g => g.id).sort());
  const order = reverse.fragments.slice().sort((a, b) => ['first', 'second', 'third', 'last'].indexOf(a.text.match(/sealed (\w+)/)[1]) - ['first', 'second', 'third', 'last'].indexOf(b.text.match(/sealed (\w+)/)[1])).map(f => f.id);
  assert.deepEqual(reverse.answer, [...order].reverse());
  assert.ok(actRiddle(reverse, { type: 'answer', order: ['blue'] }, partCtx(low())).error, 'incomplete answers are not attempts');
  assert.equal(reverse.attemptsLeft, 3);
  actRiddle(reverse, { type: 'answer', order: [...order] }, partCtx(low()));
  assert.equal(reverse.wrong, 1);
  assert.equal(reverse.hint, null, 'no hint below Wisdom 5');
  actRiddle(reverse, { type: 'answer', order: reverse.answer }, partCtx(low()));
  assert.equal(reverse.outcome, 'solved');
  const same = createRiddle({ mode: 'same' }, partCtx(high(), 4));
  assert.match(same.instruction, /AS THEY WERE SEALED/);
  actRiddle(same, { type: 'answer', order: [...same.answer].reverse() }, partCtx(high()));
  assert.match(same.hint, /first echo to return/);
  const orders = new Set(Array.from({ length: 20 }, (_, i) => createRiddle({}, partCtx(low(), i)).answer.join()));
  assert.ok(orders.size > 5, 'the order is rolled, not the public answer of the old seal');
});

test('ship fight: rolled enemy, win, lose, break off, parley and a live result', () => {
  const enemy = { name: 'Test raider', hp: 30, movement: 'hold', abilities: [], damage: [6, 10], parley: true, parleyDc: 2 };
  const fight = createSkirmish({ enemy }, partCtx(high()));
  for (let i = 0; i < 50 && !fight.done; i++) actSkirmish(fight, { move: 'fire' }, partCtx(high(), i));
  assert.equal(fight.outcome, 'win');
  const talk = createSkirmish({ enemy }, partCtx(high()));
  actSkirmish(talk, { move: 'hail' }, partCtx(high()));
  assert.equal(talk.outcome, 'parley');
  const brute = { ...enemy, hp: 999, damage: [30, 40], parley: false };
  const lost = createSkirmish({ enemy: brute }, partCtx(low()));
  for (let i = 0; i < 50 && !lost.done; i++) actSkirmish(lost, { move: 'hail' }, partCtx(low(), i));
  assert.equal(lost.outcome, 'lose');
  const runner = createSkirmish({ enemy: brute }, partCtx(high()));
  for (let i = 0; i < 50 && !runner.done; i++) actSkirmish(runner, { move: 'flee' }, partCtx(high(), i));
  assert.ok(['flee', 'lose'].includes(runner.outcome));
  const live = createSkirmish({ enemy }, partCtx(mid()));
  assert.ok(actSkirmish(live, { type: 'live', outcome: 'draw' }, partCtx(mid())).error);
  actSkirmish(live, { type: 'live', outcome: 'win', hull: 64 }, partCtx(mid()));
  assert.equal(live.outcome, 'win');
  assert.equal(live.ship.hp, 64);
});

test('live ship fights run on Dogfight\'s own simulation, scaled to the quest numbers', () => {
  const enemy = roll({ enemy: 'raider' }, roller({ rng: 11 }));
  const setup = liveFightSetup(enemy, { hull: 100, damage: 10 }, 77);
  const play = () => {
    const match = createLiveFight(setup);
    assert.equal(match.ships[1].hp, setup.hp[1]);
    let result = null;
    for (let i = 0; i < 60 * 200 && !result; i++) {
      // The test pilot uses the same brain as the enemy, charging in.
      stepLiveFight(match, enemyInput(match, 'charge', 0), setup);
      result = liveFightResult(match, setup);
    }
    return { result, tick: match.tick };
  };
  const a = play();
  assert.ok(a.result, 'the fight finishes');
  assert.ok(['win', 'lose', 'flee'].includes(a.result.outcome));
  assert.ok(a.result.hull >= 1 && a.result.hull <= 100);
  assert.deepEqual(play(), a, 'deterministic');
});

test('travel: fast and safe lanes, rolled events, cards with fights', () => {
  const lanes = routes('alpha', 'veil');
  assert.equal(lanes[0].id, 'fast');
  assert.equal(lanes[0].path[0], 'alpha');
  assert.equal(lanes[0].path.at(-1), 'veil');
  if (lanes[1]) assert.ok(lanes[1].risk < lanes[0].risk, 'the safe lane is safer');
  assert.deepEqual(routes('beacon', 'beacon').map(r => r.id), ['here']);
  let events = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const ctx = partCtx(mid(), seed);
    const trip = createTrip({ to: 'veil', risk: 0 }, ctx);
    actTrip(trip, { type: 'route', route: 'fast' }, ctx);
    for (let i = 0; i < 100 && !trip.done; i++) {
      if (trip.phase === 'card') {
        events++;
        const card = trip.card;
        const action = card.phase === 'choose' ? { type: 'choose', index: 0 } : card.phase === 'fight' ? { move: 'fire' } : { type: 'continue' };
        const r = actTrip(trip, action, ctx);
        if (r.error) actTrip(trip, { type: 'choose', index: 1 }, ctx);
      } else actTrip(trip, { type: 'continue' }, ctx);
    }
    assert.equal(trip.outcome, 'arrived');
    assert.equal(ctx.run.location, 'veil');
  }
  assert.ok(events > 10, `random events turn up on trips (${events})`);
});

test('race legs: real track times, quick and live results', async () => {
  const { createRace, actRace } = await import('../projects/Space-Shooter/voyage/quests/parts/race.js');
  const race = createRace({ track: 'gantry-drop', rival: { name: 'R', pace: 0.9 } });
  assert.equal(race.targetMs, Math.round(TRACKS['gantry-drop'].pilotMs * 0.9));
  actRace(race, { type: 'live', timeMs: race.targetMs - 1 }, partCtx(mid()));
  assert.equal(race.outcome, 'win');
  const slow = createRace({ track: 'gantry-drop' });
  actRace(slow, { type: 'live', timeMs: slow.targetMs + 1 }, partCtx(mid()));
  assert.equal(slow.outcome, 'lose');
  const quick = createRace({ track: 'abandoned-mall' });
  actRace(quick, { type: 'quick', style: 'clean' }, partCtx(mid()));
  assert.equal(quick.outcome === 'win', quick.timeMs <= quick.targetMs);
});

test('race track times match the racing game\'s own test pilot on the real layouts', async () => {
  const { WEEKLY_EVENTS } = await import('../projects/Space-Shooter/tracks/weekly.js');
  const { createWeeklyLayout } = await import('../projects/Space-Shooter/engine/weekly/layout.js');
  const { flyWeeklyLap } = await import('../projects/Space-Shooter/engine/weekly/pilot.js');
  for (const track of Object.values(TRACKS)) {
    const lap = flyWeeklyLap(createWeeklyLayout(WEEKLY_EVENTS.find(e => e.id === track.weekly)));
    assert.equal(lap.finished, true);
    assert.equal(Math.round(lap.time), track.pilotMs, track.title);
  }
});

test('endings pay rewards in core\'s format, keep quest state small, and gate repeats', () => {
  const found = explore(QUESTS['railgun-paper-trail'], high(), { seeds: [1, 2] });
  let railguns = 0;
  for (const { seed, path, result } of found.ends.values()) {
    let { run, save } = startQuest(QUESTS['railgun-paper-trail'], high(), { seed });
    for (const action of path) ({ run, save } = apply(QUESTS['railgun-paper-trail'], run, save, action));
    if (result === 'success') {
      assert.equal(save.items.railgun, 1);
      assert.equal(save.flags['fragment-2'], 1);
      railguns++;
    }
    assert.equal(save.quests.done['railgun-paper-trail'].result, result);
    assert.equal(save.quests.active?.['railgun-paper-trail'], undefined);
  }
  assert.ok(railguns >= 3, 'steal, file and build all give the railgun');
  const { run, save } = startQuest(quest, mid(), { seed: 1 });
  assert.ok(JSON.stringify(save.quests).length < 32 * 1024);
  assert.equal(save.quests.active['cold-run'].node, run.node);
  const done = { ...mid(), quests: { done: { 'listening-gate': { result: 'success' } } } };
  assert.deepEqual(availability(QUESTS['listening-gate'], done).reasons, ['Already done']);
  assert.equal(availability(QUESTS['cold-run'], { ...mid(), quests: { done: { 'cold-run': { result: 'success' } } } }).ok, true, 'Cold Run repeats');
  assert.deepEqual(Object.keys(PARTS).sort(), ['cipher', 'event', 'foot', 'race', 'riddle', 'skirmish', 'trip']);
});
