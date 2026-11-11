// The new Stardust's story lane (round 2): lines, stats words, and the
// tutorial director (the sequence, the saves, skipping and unlock gating).
// Pure modules, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoyageStore } from '../projects/Space-Shooter/voyage/store.js';
import { STATS, STAT_IDS } from '../projects/Space-Shooter/voyage/data.js';
import { effect, check } from '../projects/Space-Shooter/voyage/character.js';
import { createBus } from '../projects/Space-Shooter/voyage/story/bus.js';
import { LINES, LINE_ID, EMOTIONS, lineById, fillLine, addLines } from '../projects/Space-Shooter/voyage/story/lines.js';
import { contentLines } from '../projects/Space-Shooter/voyage/quests/lines.js';
import { CAST, CAST_IDS } from '../projects/Space-Shooter/voyage/story/cast.js';
import { createSay, readMs } from '../projects/Space-Shooter/voyage/story/say.js';
import { chance, statCard, sixText, oneText, optionTag, passiveWords, oddsTable, HOW_CHECKS_WORK } from '../projects/Space-Shooter/voyage/story/stats.js';
import { STEPS, TALKS, ALL_UNLOCKS, PICKS, UNLOCK_ID } from '../projects/Space-Shooter/voyage/story/tutorial.js';
import { storyOf, cleanStory, isUnlocked, currentStep, metGivers, idleLine } from '../projects/Space-Shooter/voyage/story/progress.js';
import { createDirector, mergeRewards } from '../projects/Space-Shooter/voyage/story/director.js';
import { QUEST_GIVERS } from '../projects/Space-Shooter/voyage/quests/data/givers.js';

function memoryStore() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const seq = (values) => { let i = 0; return () => values[i++ % values.length]; };
// rng values that roll str 2, con 2, dex 1, wis 5, cha 6 (die = floor(r * 6) + 1), after the id's 8 draws.
const ROLL = [...Array(8).fill(0.1), 0.2, 0.2, 0.01, 0.7, 0.95];

function setup({ storage = memoryStore(), rng = null } = {}) {
  let t = 1_762_800_000_000;
  const store = createVoyageStore({ storage, now: () => (t += 1000) });
  const bus = createBus();
  const said = [];
  const speak = async (id) => { said.push(id); return { id, skipped: false }; };
  const seen = [];
  bus.on('*', (type, detail) => seen.push({ type, detail }));
  // Talk attempts roll 4 + 3 (0.55 -> 4, 0.4 -> 3) unless a test says otherwise.
  const director = createDirector({ store, bus, say: speak, nudgeMs: 0, rng: rng || seq([0.55, 0.4]) });
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
    for (const x of [...(s.enter || []), ...(s.after || []), ...(s.nudge || [])]) if (typeof x === 'string') named.push(x);
    for (const a of s.also || []) named.push(...a.lines);
  }
  for (const t of Object.values(TALKS)) named.push(t.prompt, ...t.options.flatMap((o) => (o.stat ? [o.pass, o.fail] : [o.reply])));
  for (const stat of STAT_IDS) named.push(PICKS.roll({ character: { stats: { str: 1, cha: 1, con: 1, dex: 1, wis: 1, [stat]: 6 } } }));
  named.push('chibby.roll.late', 'chibby.roll.late-done');
  named.push(PICKS.roll({ character: { stats: { str: 2, cha: 3, con: 2, dex: 3, wis: 1 } } }), PICKS.shot({ hits: 6, shots: 6 }), PICKS.shot({ hits: 6, shots: 9 }));
  for (const id of named) assert.ok(lineById(id), `missing line ${id}`);
  addLines(contentLines()); // the content lane's quests carry their own pitches (contract section 2)
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

test('attempts are a fresh 2d6 + stat bonus; a double six always passes; no auto-fail', () => {
  const six = { stats: { str: 6, con: 3, dex: 3, wis: 3, cha: 6 }, skills: { hacker: 3 } };
  const one = { stats: { str: 1, con: 3, dex: 3, wis: 3, cha: 1 }, skills: {} };
  const boxcars = check(one, { stat: 'cha', dc: 99 }, () => 0.99);
  assert.deepEqual([boxcars.dice, boxcars.natural, boxcars.pass], [[6, 6], true, true], 'a double six beats any target with any stat');
  const snake = check(six, { stat: 'cha', dc: 5 }, () => 0);
  assert.deepEqual([snake.total, snake.natural, snake.pass], [5, false, true], 'double one is just a low roll: 2 + 3 meets 5');
  assert.equal(check(six, { stat: 'cha', dc: 6 }, () => 0).pass, false);
  const r = check(one, { stat: 'str', dc: 7 }, seq([0.5, 0.5]));
  assert.deepEqual([r.dice, r.roll, r.statMod, r.bonus, r.total, r.pass, r.natural], [[4, 4], 8, -2, -2, 6, false, false]);
  assert.equal(check(six, { stat: 'cha', tag: 'hack', dc: 7 }, seq([0.5, 0.5])).bonus, 3, 'skills never add to a roll');
  for (const v of [1, 2, 3, 4, 5, 6]) for (const dc of [6, 7, 9, 11, 30]) {
    const p = chance(v, dc);
    assert.ok(p > 0 && p < 1, `stat ${v} vs ${dc} is ${p}`);
  }
  assert.equal(chance(1, 30).toFixed(4), (1 / 36).toFixed(4), 'only a double six');
  assert.equal(chance(6, 5), 1, 'with no auto-fail, an easy enough target is certain for a 6');
  assert.equal(chance(3, 7).toFixed(4), (21 / 36).toFixed(4));
  assert.equal(chance(6, 9).toFixed(4), (26 / 36).toFixed(4));
  assert.equal(chance(1, 9).toFixed(4), (3 / 36).toFixed(4));
  const table = oddsTable();
  assert.deepEqual(table.map((row) => row.name), ['easy', 'normal', 'tough', 'hard', 'heroic']);
  for (const row of table) for (let i = 1; i < 6; i++) assert.ok(row.byStat[i] >= row.byStat[i - 1]);
});

test('five stats with passive effects; the words come from the numbers', () => {
  assert.deepEqual(STAT_IDS, ['str', 'con', 'dex', 'wis', 'cha']);
  const c = { stats: { str: 5, cha: 6, con: 1, dex: 5, wis: 3 }, skills: {} };
  assert.equal(effect(c, 'price'), 6);
  assert.equal(effect(c, 'ship.hp'), -10);
  assert.equal(effect(c, 'melee'), 2);
  assert.equal(effect(c, 'aim'), 0.2);
  assert.equal(effect(c, 'hint'), 0);
  for (const id of STAT_IDS) {
    assert.match(sixText(id), /^A 6: \+3 on every roll \(easy \d+%, normal \d+%, hard \d+%\)/);
    assert.match(oneText(id), /double six still always works/);
    const card = statCard(id, 6);
    assert.ok(card.line && card.rolls && card.odds && card.now.endsWith('.'));
    assert.equal(statCard(id, 3).now, 'Average: no extra effects.');
    assert.equal(statCard(id, 3).bonus, '+0');
  }
  assert.deepEqual(passiveWords('cha', 6), ['prices 6% lower', 'rep 15% faster']);
  assert.match(sixText('con'), /\+15 hull/);
  assert.equal(optionTag('dex'), '[Dexterity]');
  assert.match(statCard('wis', 1).now, /hints 2 misses later/);
  assert.ok(HOW_CHECKS_WORK.every((line) => !/[{}]/.test(line)), 'every placeholder filled');
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
  const attempts = choices.options.filter((o) => o.kind === 'attempt');
  assert.deepEqual(attempts.map((o) => o.stat), ['cha', 'str', 'con', 'dex', 'wis'], 'one attempt per stat');
  assert.ok(attempts.every((o) => !o.locked && o.chance > 0 && o.chance < 1), 'anyone may try; the stat only moves the odds');
  const cha = attempts.find((o) => o.stat === 'cha');
  assert.match(cha.label, /^\[Charisma\] /);
  assert.equal(cha.chance.toFixed(4), (33 / 36).toFixed(4), 'charisma 6 vs 7: anything but 2 or 3 on 2d6');
  const gated = choices.options.find((o) => o.kind === 'skill');
  assert.equal(gated.locked, true);
  assert.equal(gated.reason, 'Needs the Trader skill.');
  assert.match(gated.label, /^\[Trader\] /);
  assert.equal(env.director.choose(gated.index), false, 'a locked option cannot be picked');
  env.bus.emit('story:choose', { index: cha.index });
  await env.director.idle();
  const roll = env.seen.find((e) => e.type === 'roll:attempt').detail;
  assert.deepEqual([roll.dice, roll.bonus, roll.total, roll.dc, roll.pass, roll.who], [[4, 3], 3, 10, 7, true, 'Vela Quint']);
  assert.ok(env.said.includes('edna.talk.cha'));
  assert.equal(env.director.state().step, 'puzzle');
  assert.equal(env.director.state().choices.edna, cha.index);

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

test('story data files are strict JSON after "= " (the Stardust Studio edits them)', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const dir = new URL('../projects/Space-Shooter/voyage/story/data/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const text = await readFile(new URL(f, dir), 'utf8');
    const m = text.match(/^export const ([A-Z_]+) = ([\s\S]*);\s*$/m);
    assert.ok(m, `${f} has one export`);
    const body = text.slice(text.indexOf(' = ', text.indexOf('export const')) + 3).replace(/;\s*$/, '');
    const data = JSON.parse(body);
    assert.equal(data.version, 1, `${f} carries a version`);
  }
});

test('other lanes can add lines in the same shape', async () => {
  const { addLines, lineById: byId, allLines } = await import('../projects/Space-Shooter/voyage/story/lines.js');
  const before = allLines().length;
  const out = addLines({ version: 1, lines: [
    { id: 'clerk.paper.1', speaker: 'clerk', name: 'Clerk Ossa', emotion: 'dry', text: 'Form nine. In triplicate.', direction: 'Bored.' },
    { id: 'chibby.ship.1', speaker: 'chibby', emotion: 'warm', text: 'Taken already.', direction: '' },
    { id: 'clerk.paper.2', speaker: 'clerk', emotion: 'dry', text: 'Hello {name}.', direction: '' },
  ] });
  assert.deepEqual(out, { added: 1, skipped: ['chibby.ship.1', 'clerk.paper.2'] });
  assert.equal(byId('clerk.paper.1').name, 'Clerk Ossa');
  assert.equal(allLines().length, before + 1);
  const bus = createBus();
  const seen = [];
  bus.on('story:say', (d) => seen.push(d));
  const speak = createSay({ bus, voiceUrl: () => null, wait: () => Promise.resolve() });
  await speak('clerk.paper.1');
  assert.equal(seen[0].name, 'Clerk Ossa');
});

test('a quiet player gets a nudge line once, and doing something restarts the wait', async () => {
  const pending = [];
  const timer = { set: (fn, ms) => { const h = { fn, ms, live: true }; pending.push(h); return h; }, clear: (h) => { h.live = false; } };
  const fire = async () => { const h = pending.filter((x) => x.live).pop(); assert.ok(h, 'a nudge is armed'); h.live = false; h.fn(); await env.director.idle(); };
  let t = 1_762_800_000_000;
  const store = createVoyageStore({ storage: memoryStore(), now: () => (t += 1000) });
  const bus = createBus();
  const said = [];
  const env = { store, bus, director: createDirector({ store, bus, say: async (id) => { said.push(id); }, timer, nudgeMs: 30000 }) };
  env.director.start();
  await emit(env, 'intro:done');
  assert.equal(pending.filter((x) => x.live).length, 0, 'no nudge on a step without one');
  env.store.createCharacter({ name: 'Vela' }, seq(ROLL));
  await emit(env, 'captain:created', { character: env.store.get().character });
  assert.equal(env.director.state().step, 'walk');
  assert.equal(pending.filter((x) => x.live).length, 1);
  assert.equal(pending.at(-1).ms, 30000);
  env.bus.emit('tutorial:moved', {});
  assert.equal(pending.filter((x) => x.live).length, 1, 'moving re-arms instead of stacking');
  await fire();
  assert.equal(said.at(-1), 'chibby.nudge.walk');
  assert.equal(pending.filter((x) => x.live).length, 0, 'each nudge plays once');
  await emit(env, 'tutorial:arrived', { station: 'pad' });
  assert.equal(env.director.state().step, 'ship');
  await fire();
  assert.equal(said.at(-1), 'chibby.nudge.ship');
  env.director.stop();
  assert.equal(pending.filter((x) => x.live).length, 0);
});

test('a failed attempt in Edna\'s talk still moves the tutorial on, with its own line', async () => {
  const env = setup({ rng: seq([0.2, 0.2]) }); // 2 + 2
  env.director.start();
  await playTo(env, 'talk');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const str = env.seen.filter((e) => e.type === 'story:choices' && e.detail).pop().detail.options.find((o) => o.stat === 'str');
  assert.equal(env.director.choose(str.index), true);
  await env.director.idle();
  assert.ok(env.said.includes('edna.talk.str-fail'), 'strength 2 with 2 + 2: a miss');
  assert.equal(env.director.state().step, 'puzzle');
});

test('a Trader can take the skill-gated option', async () => {
  const env = setup();
  env.director.start();
  await playTo(env, 'edna');
  env.store.update((s) => ({ ...s, character: { ...s.character, earned: 3, skills: { trader: 1 } } }));
  await playTo(env, 'talk');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const gated = env.seen.filter((e) => e.type === 'story:choices' && e.detail).pop().detail.options.find((o) => o.kind === 'skill');
  assert.equal(gated.locked, false);
  assert.equal(env.director.choose(gated.index), true);
  await env.director.idle();
  assert.ok(env.said.includes('edna.talk.trader'));
  assert.equal(env.seen.some((e) => e.type === 'roll:attempt'), false, 'a skill option does not roll');
});

test('an old captain without Strength is asked to roll it once', async () => {
  const storage = memoryStore();
  const old = { v: 1, updatedAt: 1, character: { id: 'c-old', name: 'Old Hand', stats: { cha: 4, con: 3, dex: 5, wis: 2 }, earned: 2, permanent: 0, skills: {}, deaths: 0, createdAt: 1 }, money: 10 };
  storage.setItem('stardust.voyage.v1', JSON.stringify(old));
  const env = setup({ storage });
  assert.equal(env.store.get().character.stats.str, 3, 'average until rolled');
  assert.deepEqual(env.store.get().character.toRoll, ['str']);
  env.director.start();
  await env.director.idle();
  assert.ok(env.said.includes('chibby.roll.late'));
  assert.deepEqual(env.seen.find((e) => e.type === 'story:roll-missing').detail, { stats: ['str'] });
  assert.deepEqual(env.store.rollMissingStats(() => 0.9), { str: 6 });
  assert.equal(env.store.get().character.stats.str, 6);
  assert.equal(env.store.get().character.toRoll, undefined);
  assert.deepEqual(env.store.rollMissingStats(() => 0.1), {}, 'only once');
});

test('talking to someone the tutorial is not waiting on plays their idle line, in turn', async () => {
  const env = setup();
  env.director.start();
  await playTo(env, 'walk');
  await emit(env, 'met:mel');
  assert.equal(env.said.at(-1), 'mel.locked.1', 'Mel is not open yet');
  await emit(env, 'met:chibby');
  assert.equal(env.said.at(-1), 'chibby.idle.1');
  await emit(env, 'met:chibby');
  assert.equal(env.said.at(-1), 'chibby.idle.2');
  assert.equal(env.director.state().step, 'walk', 'idle talk never moves the tutorial');
  await emit(env, 'met:nobody');
  assert.equal(env.said.at(-1), 'chibby.idle.2');
});

test('jumpTo starts at any step with the earlier rewards and unlocks in place (the Studio play link)', async () => {
  const env = setup();
  env.director.start();
  env.store.createCharacter({ name: 'Studio Test' }, seq(ROLL));
  assert.equal(env.director.jumpTo('nope'), false);
  assert.equal(env.director.jumpTo('hask'), true);
  await env.director.idle();
  const save = env.store.get();
  assert.equal(env.director.state().step, 'hask');
  assert.equal(save.items.ore >= 3, true, 'the mining reward was paid');
  assert.ok(isUnlocked(save, 'giver:garrity') && isUnlocked(save, 'explore:alpha'));
  assert.equal(isUnlocked(save, 'giver:hask'), false);
  await emit(env, 'met:hask');
  assert.equal(env.director.state().step, 'edna');
});
