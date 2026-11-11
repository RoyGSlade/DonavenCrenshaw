// The new Stardust's story lane (round 2): lines, stats words, and the
// tutorial director (the sequence, the saves, skipping and unlock gating).
// Pure modules, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoyageStore } from '../projects/Space-Shooter/voyage/store.js';
import { STATS, STAT_IDS } from '../projects/Space-Shooter/voyage/data.js';
import { effect } from '../projects/Space-Shooter/voyage/character.js';
import { createBus } from '../projects/Space-Shooter/voyage/story/bus.js';
import { LINES, LINE_ID, EMOTIONS, lineById, fillLine } from '../projects/Space-Shooter/voyage/story/lines.js';
import { CAST, CAST_IDS } from '../projects/Space-Shooter/voyage/story/cast.js';
import { createSay, readMs } from '../projects/Space-Shooter/voyage/story/say.js';
import { chance, boonFor, statCard, sixText, optionTag, passiveWords } from '../projects/Space-Shooter/voyage/story/stats.js';
import { STEPS, TALKS, ALL_UNLOCKS, PICKS, UNLOCK_ID } from '../projects/Space-Shooter/voyage/story/tutorial.js';
import { storyOf, cleanStory, isUnlocked, currentStep, metGivers, idleLine } from '../projects/Space-Shooter/voyage/story/progress.js';
import { createDirector, mergeRewards } from '../projects/Space-Shooter/voyage/story/director.js';
import { QUEST_GIVERS } from '../projects/Space-Shooter/voyage/quests/data/givers.js';

function memoryStore() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
// rng values that roll cha 6, con 2, dex 1, wis 5 (die = floor(r * 6) + 1), after the id's 8 draws.
const ROLL = [...Array(8).fill(0.1), 0.95, 0.2, 0.01, 0.7];

function setup({ storage = memoryStore() } = {}) {
  let t = 1_762_800_000_000;
  const store = createVoyageStore({ storage, now: () => (t += 1000) });
  const bus = createBus();
  const said = [];
  const speak = async (id) => { said.push(id); return { id, skipped: false }; };
  const seen = [];
  bus.on('*', (type, detail) => seen.push({ type, detail }));
  const director = createDirector({ store, bus, say: speak });
  return { store, bus, said, seen, director, storage };
}

async function emit(env, type, detail = {}) {
  env.bus.emit(type, detail);
  await env.director.idle();
}

const makeCaptain = (env) => {
  const r = env.store.createCharacter({ name: 'Vela Quint' }, seq(ROLL));
  assert.ok(r.ok);
  return env.store.get().character;
};

// Plays the tutorial up to (not including) step `until`.
async function playTo(env, until) {
  const script = {
    intro: ['intro:done'],
    create: ['captain:created'],
    walk: ['tutorial:arrived', { station: 'pad' }],
    ship: ['met:chibby'],
    ralph: ['met:ralph'],
    mine: ['tutorial:mined', { ore: 2 }],
    'hop-garrity': ['explore:arrived', { target: 'dustfall' }],
    garrity: ['met:garrity'],
    mel: ['met:mel'],
    shoot: ['tutorial:shot', { hits: 6, shots: 6 }],
    'hop-hask': ['explore:arrived', { target: 'alpha' }],
    hask: ['met:hask'],
    edna: ['met:edna'],
    talk: null,
    puzzle: ['tutorial:solved', { puzzle: 'lockbox' }],
    'hop-vey': ['explore:arrived', { target: 'beacon' }],
    vey: ['met:vey'],
  };
  for (const step of STEPS) {
    if (step.id === until) return;
    if (env.director.state().done.includes(step.id)) continue;
    assert.equal(env.director.state().step, step.id, `on ${step.id}`);
    if (step.id === 'create') {
      const c = makeCaptain(env);
      await emit(env, 'captain:created', { character: c });
    } else if (step.id === 'talk') {
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      assert.ok(env.director.choose(0));
      await env.director.idle();
    } else if (script[step.id]) {
      await emit(env, ...script[step.id]);
    } else {
      await env.director.idle();
    }
  }
}

// --- Lines -----------------------------------------------------------------------------

test('every line has a good id, a known speaker and emotion, and short text', () => {
  const ids = new Set();
  for (const l of LINES) {
    assert.match(l.id, LINE_ID, l.id);
    assert.ok(!ids.has(l.id), `duplicate ${l.id}`);
    ids.add(l.id);
    assert.ok(CAST_IDS.includes(l.speaker), `${l.id}: speaker ${l.speaker}`);
    assert.ok(EMOTIONS.includes(l.emotion), `${l.id}: emotion ${l.emotion}`);
    assert.ok(l.text.length > 0 && l.text.length <= 140, `${l.id} is ${l.text.length} characters`);
    assert.ok(l.direction && l.direction.length <= 140, `${l.id} needs a short direction`);
    if (/\{[a-z]+\}/.test(l.text)) assert.ok(l.audioText && !/\{/.test(l.audioText), `${l.id} needs audioText without a placeholder`);
    else assert.equal(l.audioText, undefined, `${l.id} has audioText but no placeholder`);
  }
});

test('every line the tutorial, talks and picks name exists', () => {
  const named = [];
  for (const s of STEPS) {
    for (const x of [...(s.enter || []), ...(s.after || [])]) if (typeof x === 'string') named.push(x);
    for (const a of s.also || []) named.push(...a.lines);
  }
  for (const t of Object.values(TALKS)) named.push(t.prompt, ...t.options.map((o) => o.reply));
  for (const stat of STAT_IDS) named.push(PICKS.roll({ character: { stats: { cha: 1, con: 1, dex: 1, wis: 1, [stat]: 6 } } }));
  named.push(PICKS.roll({ character: { stats: { cha: 3, con: 2, dex: 3, wis: 1 } } }), PICKS.shot({ hits: 6, shots: 6 }), PICKS.shot({ hits: 6, shots: 9 }));
  for (const id of named) assert.ok(lineById(id), `missing line ${id}`);
  for (const [giver, data] of Object.entries(QUEST_GIVERS)) {
    for (const q of data.quests) assert.ok(lineById(`${giver}.job.${q}`), `${giver} has no pitch for ${q}`);
    assert.ok(lineById(`${giver}.done.success`) && lineById(`${giver}.done.failure`));
  }
});

test('fillLine puts the captain in and falls back to "Captain"', () => {
  assert.equal(fillLine('Captain {name}. Has a ring.', { name: 'Vela' }), 'Captain Vela. Has a ring.');
  assert.equal(fillLine('{name}! All three?', {}), 'Captain! All three?');
});

test('say shows a line, holds it for its reading time, and a tap cuts it short', async () => {
  const bus = createBus();
  const out = [];
  bus.on('story:say', (d) => out.push(d));
  let release;
  const waits = [];
  const speak = createSay({ bus, voiceUrl: () => null, wait: (ms) => { waits.push(ms); return new Promise((r) => { release = r; }); } });
  const done = speak('chibby.create.done', { vars: { name: 'Vela' } });
  assert.equal(out[0].text, 'Captain Vela. Has a ring to it. Come find me on the pad.');
  assert.equal(out[0].name, 'Chibby');
  assert.equal(out[0].audio, null);
  assert.equal(out[0].durationMs, readMs(out[0].text));
  bus.emit('story:said', { seq: out[0].seq });
  assert.deepEqual(await done, { id: 'chibby.create.done', skipped: true });
  assert.ok(waits.includes(readMs(out[0].text)));
  release();
  const missing = await speak('nobody.says.this');
  assert.equal(missing.missing, true);
});

// --- Stats -------------------------------------------------------------------------------

test('success chances match 1d6 + stat against the target', () => {
  assert.equal(chance(3, 7), 0.5);
  assert.equal(chance(6, 7), 1);
  assert.equal(chance(1, 8), 0);
  assert.equal(chance(1, 7), 1 / 6);
  assert.equal(chance(4, 9, 1), 0.5);
});

test('the stat data keeps the slice effects and adds the round-2 tags', () => {
  const c = { stats: { cha: 6, con: 1, dex: 5, wis: 3 }, skills: {} };
  assert.equal(effect(c, 'price'), 6);
  assert.equal(effect(c, 'ship.hp'), -10);
  assert.equal(effect(c, 'repair.speed'), -0.2);
  assert.equal(effect(c, 'aim'), 0.2);
  assert.equal(effect(c, 'hint'), 0);
  assert.equal(boonFor(c, 'black-market'), 10);
  assert.equal(boonFor(c, 'aim.assist'), 0, 'dex 5 is not a 6');
  for (const s of STATS) assert.ok(s.options && s.boon?.tag, `${s.id} needs options and a boon`);
});

test('every stat explains itself, and the words come from the numbers', () => {
  for (const id of STAT_IDS) {
    const six = sixText(id);
    assert.match(six, /^A 6: /);
    const card = statCard(id, 6);
    assert.ok(card.line && card.boon && card.now.endsWith('.'));
    assert.equal(statCard(id, 3).now, 'Average: no bonus, no penalty.');
  }
  assert.deepEqual(passiveWords('cha', 6), ['prices 6% lower', 'rep 15% faster']);
  assert.match(sixText('con'), /\+15 hull/);
  assert.equal(optionTag('dex'), '[Quick hands]');
  assert.match(statCard('wis', 1).now, /hints 2 misses later/);
});

// --- The director ----------------------------------------------------------------------------

test('a new save starts at the intro, and the whole tutorial plays in order', async () => {
  const env = setup();
  env.director.start();
  assert.equal(env.director.state().step, 'intro');
  assert.ok(env.store.get().story, 'the block is saved at once');
  assert.equal(isUnlocked(env.store.get(), 'jobs'), false);

  await emit(env, 'intro:done');
  assert.equal(env.director.objective().text, 'Sign your licence.');
  assert.deepEqual(env.said, ['chibby.create.name', 'chibby.create.dice']);

  const c = makeCaptain(env);
  await emit(env, 'captain:created', { character: c });
  assert.ok(env.said.includes('chibby.roll.cha'), 'Chibby notices the 6 in charisma');
  assert.equal(env.director.state().step, 'walk');
  assert.equal(storyOf(env.store.get()).finished, false, 'a captain made in the tutorial is not taken for an old save');

  await playTo(env, 'mine');
  assert.ok(isUnlocked(env.store.get(), 'ship'));
  assert.equal(isUnlocked(env.store.get(), 'explore:dustfall'), false);
  await emit(env, 'tutorial:shot', { hits: 1, shots: 1 }); // not this step's event
  assert.equal(env.director.state().step, 'mine');
  const ore = env.store.get().items.ore || 0;
  await emit(env, 'tutorial:mined', { ore: 1 });
  assert.equal(env.store.get().items.ore, ore + 3, 'the director pays the mining reward');
  assert.ok(isUnlocked(env.store.get(), 'explore:dustfall'));
  assert.equal(env.director.objective().target, 'dustfall');

  await emit(env, 'explore:arrived', { target: 'alpha' }); // the wrong place
  assert.equal(env.director.state().step, 'hop-garrity');
  await playTo(env, 'shoot');
  assert.deepEqual(metGivers(env.store.get()), ['garrity']);
  assert.equal(env.store.get().rep.garrity >= 5, true);

  await emit(env, 'tutorial:shot', { hits: 6, shots: 8 });
  assert.ok(env.said.includes('mel.shoot.done'));
  await playTo(env, 'talk');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const choices = env.seen.filter((e) => e.type === 'story:choices' && e.detail).pop().detail;
  assert.equal(choices.talk, 'edna');
  const byStat = Object.fromEntries(choices.options.filter((o) => o.stat).map((o) => [o.stat, o]));
  assert.equal(byStat.cha.locked, false, 'charisma 6 opens Charm');
  assert.equal(byStat.wis.locked, false, 'wisdom 5 opens Read the room');
  assert.equal(byStat.dex.locked, true);
  assert.equal(byStat.dex.reason, 'Needs Dexterity 5.');
  assert.match(byStat.cha.label, /^\[Charm\] /);
  assert.equal(env.director.choose(byStat.dex.index), false, 'a locked option cannot be picked');
  env.bus.emit('story:choose', { index: byStat.cha.index });
  await env.director.idle();
  assert.ok(env.said.includes('edna.talk.cha'));
  assert.equal(env.director.state().step, 'puzzle');
  assert.equal(env.director.state().choices.edna, byStat.cha.index);

  await playTo(env, 'open');
  await env.director.idle();
  const save = env.store.get();
  assert.equal(storyOf(save).finished, true);
  assert.equal(storyOf(save).skipped, false);
  assert.ok(isUnlocked(save, 'jobs'));
  assert.deepEqual(metGivers(save), ['garrity', 'hask', 'vey']);
  assert.ok(env.said.includes('ralph.open.1'));
  assert.ok(env.seen.some((e) => e.type === 'story:done' && e.detail.skipped === false));
  assert.equal(env.director.objective(), null);
});

test('events for a later step are ignored, and a step reached early is not entered twice', async () => {
  const env = setup();
  env.director.start();
  await emit(env, 'met:chibby');
  await emit(env, 'tutorial:mined', { ore: 1 });
  assert.equal(env.director.state().step, 'intro');
  assert.equal(env.store.get().items.ore, undefined);
  await playTo(env, 'walk');
  // Arrive and talk before Chibby has finished his lines: both count, once each.
  env.bus.emit('tutorial:arrived', { station: 'pad' });
  env.bus.emit('met:chibby');
  await env.director.idle();
  assert.equal(env.director.state().step, 'ralph');
  assert.equal(env.seen.filter((e) => e.type === 'story:step' && e.detail.id === 'ship').length, 0, 'ship was passed before it was announced');
  assert.equal(env.said.filter((id) => id === 'chibby.ship.1').length, 1);
});

test('progress is saved: a reload resumes on the same step with the same unlocks', async () => {
  const env = setup();
  env.director.start();
  await playTo(env, 'mel');
  env.director.stop();
  const again = setup({ storage: env.storage });
  again.director.start();
  await again.director.idle();
  assert.equal(again.director.state().step, 'mel');
  assert.deepEqual(again.said, ['chibby.mel.1'], 'the step is re-entered with its opening line');
  assert.ok(isUnlocked(again.store.get(), 'giver:garrity'));
  const ore = again.store.get().items.ore;
  await playTo(again, 'shoot');
  assert.equal(again.store.get().items.ore, ore, 'nothing is paid twice');
});

test('skip ends it at once: every unpaid reward paid, every unlock open', async () => {
  const env = setup();
  env.director.start();
  await playTo(env, 'mine');
  const before = env.store.get();
  env.bus.emit('tutorial:skip');
  await env.director.idle();
  const save = env.store.get();
  const s = storyOf(save);
  assert.equal(s.finished, true);
  assert.equal(s.skipped, true);
  for (const id of ALL_UNLOCKS) assert.ok(isUnlocked(save, id), id);
  assert.equal(save.items.ore, (before.items.ore || 0) + 3);
  for (const g of ['garrity', 'hask', 'vey']) assert.ok(save.rep[g] >= 5 && save.flags[`met-${g}`] === 1, g);
  assert.equal(save.flags['kit-sidearm'], 1);
  assert.ok(env.said.includes('chibby.skip.1'));
  assert.equal(env.director.skip(), false, 'skipping twice does nothing');
  await emit(env, 'met:mel');
  assert.equal(currentStep(env.store.get()), null);
});

test('skip during the intro still leaves captain creation to the hangar', async () => {
  const env = setup();
  env.director.start();
  env.director.skip();
  await env.director.idle();
  assert.equal(env.store.get().character, null);
  assert.ok(isUnlocked(env.store.get(), 'jobs'));
  assert.equal(env.store.createCharacter({ name: 'Late Signer' }, seq(ROLL)).ok, true);
  assert.equal(storyOf(env.store.get()).finished, true);
});

test('replay starts over with the captain kept and nothing paid twice', async () => {
  const env = setup();
  env.director.start();
  await playTo(env, 'open');
  await env.director.idle();
  const before = env.store.get();
  env.director.replay();
  await env.director.idle();
  assert.equal(env.director.state().step, 'intro');
  await emit(env, 'intro:done');
  assert.equal(env.director.state().step, 'walk', 'create passes silently with a captain');
  assert.ok(isUnlocked(env.store.get(), 'jobs'), 'jobs stay open during a replay');
  await playTo(env, 'open');
  await env.director.idle();
  const after = env.store.get();
  assert.equal(after.items.ore, before.items.ore);
  assert.deepEqual(after.rep, before.rep);
  assert.equal(after.character.id, before.character.id);
});

test('an old save with a captain and no story counts as finished', () => {
  const save = { character: { name: 'Old Hand' }, flags: {} };
  assert.equal(storyOf(save).legacy, true);
  assert.ok(isUnlocked(save, 'jobs'));
  assert.equal(currentStep(save), null);
  assert.equal(currentStep({}).id, 'intro');
  assert.equal(isUnlocked({}, 'jobs'), false);
});

test('cleanStory repairs a bad block', () => {
  const s = cleanStory({ step: 'nope', done: ['intro', 'x', 'intro'], unlocks: ['jobs', 'bad id', 'station:pad'], paid: ['walk', 'mine'], finished: 'yes', skipped: true, choices: { edna: 99, other: 1 } });
  assert.deepEqual(s.done, ['intro']);
  assert.equal(s.step, 'create');
  assert.deepEqual(s.unlocks, ['jobs', 'station:pad']);
  assert.deepEqual(s.paid, ['mine'], 'only steps with a reward can be paid');
  assert.equal(s.finished, false);
  assert.equal(s.skipped, false);
  assert.deepEqual(s.choices, {});
  for (const id of ALL_UNLOCKS) assert.match(id, UNLOCK_ID);
});

test('the story block survives the core save round trip', async () => {
  const env = setup();
  env.director.start();
  await playTo(env, 'ship');
  const reloaded = createVoyageStore({ storage: env.storage });
  assert.equal(storyOf(reloaded.get()).step, 'ship');
});

test('idle lines: locked stations say "not yet", then they cycle', async () => {
  const fresh = { story: { step: 'walk' } };
  assert.equal(idleLine('mel', fresh), 'mel.locked.1');
  assert.equal(idleLine('edna', fresh), 'edna.locked.1');
  const open = { story: { finished: true } };
  assert.equal(idleLine('mel', open, 0), 'mel.idle.1');
  assert.equal(idleLine('mel', open, 4), 'mel.idle.2');
  assert.equal(idleLine('hask', open, 1), 'hask.greet.2');
  assert.equal(idleLine('nobody', open), null);
  for (const id of ['chibby', 'ralph', 'mel', 'edna', 'hask', 'vey', 'garrity']) assert.ok(idleLine(id, open), id);
});

test('mergeRewards adds rewards together', () => {
  assert.deepEqual(mergeRewards([{ items: { ore: 3 } }, { rep: { hask: 5 }, flags: { a: 1 } }, { rep: { hask: 2 }, items: { ore: 1 } }]),
    { items: { ore: 4 }, rep: { hask: 7 }, flags: { a: 1 } });
});

test('cast and tutorial ids follow the contract', () => {
  for (const id of CAST_IDS) assert.match(id, /^[a-z0-9][a-z0-9-]{0,31}$/);
  for (const s of STEPS) assert.match(s.id, /^[a-z0-9][a-z0-9-]{0,31}$/);
  assert.deepEqual(Object.keys(CAST).filter((id) => CAST[id].giver), ['hask', 'vey', 'garrity']);
});
