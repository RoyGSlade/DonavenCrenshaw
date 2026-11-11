// Player two (P11): the crew aboard the pilot's ship. The relay's crew room,
// the crew messages, the crew card and reward share, and the four crew jobs in
// the quest engine: turret (S54), hold-to-repair (S53), navigation (S56), and
// dialogue checks and minigames while docked (S55). Solo play stays exactly as
// it was and every job stays finishable alone (S57); the pilot leaving keeps
// the pilot's job and the crew's rewards (S58).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createDogfightServer } from '../scripts/serve-stardust-dogfight.mjs';
import { CREW_MODE, CREW_LIMITS, cleanCrewData } from '../projects/Space-Shooter/voyage/crew/protocol.js';
import { crewCard, cleanCrewCard, crewShare, cleanCrewReward, SHARE_LIMITS } from '../projects/Space-Shooter/voyage/crew/card.js';
import { crewState } from '../projects/Space-Shooter/voyage/crew/state.js';
import { startQuest, view, act } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { CREW_RULES, patchAmount } from '../projects/Space-Shooter/voyage/quests/parts/crew.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { testCharacter } from '../projects/Space-Shooter/voyage/quests/core.js';
import { grant } from '../projects/Space-Shooter/voyage/economy.js';
import { cleanSave, emptySave } from '../projects/Space-Shooter/voyage/save.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const withCaptain = (stats) => cleanSave({ ...emptySave(), character: testCharacter(stats) });
const CREW = Object.freeze({ name: 'Nova', stats: { cha: 6, con: 6, dex: 6, wis: 6 }, skills: {} });

// ---- protocol --------------------------------------------------------------

test('crew messages: each seat sends only its own kinds, plain data within the limits', () => {
  assert.deepEqual(cleanCrewData('host', { kind: 'state', step: 'fight', fight: { hp: 3, log: ['a'] } }), { kind: 'state', step: 'fight', fight: { hp: 3, log: ['a'] } });
  assert.deepEqual(cleanCrewData('guest', { kind: 'act', job: 'turret', hit: true }), { kind: 'act', job: 'turret', hit: true });
  assert.equal(cleanCrewData('guest', { kind: 'state' }), null, 'the crew cannot send the pilot a state');
  assert.equal(cleanCrewData('host', { kind: 'act' }), null);
  assert.equal(cleanCrewData('spectator', { kind: 'act' }), null);
  assert.equal(cleanCrewData('host', { kind: 'state', text: 'x'.repeat(CREW_LIMITS.string + 1) }), null, 'long strings');
  assert.equal(cleanCrewData('host', { kind: 'state', list: Array(CREW_LIMITS.array + 1).fill(1) }), null, 'long lists');
  assert.equal(cleanCrewData('host', { kind: 'state', a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }), null, 'too deep');
  assert.equal(cleanCrewData('host', { kind: 'state', 'bad key': 1 }), null);
  assert.equal(cleanCrewData('host', { kind: 'state', __proto__: { x: 1 } }), null, 'only plain objects');
  assert.equal(cleanCrewData('host', { kind: 'state', n: Infinity }), null);
  const big = { kind: 'state', rows: Array.from({ length: 40 }, () => 'y'.repeat(350)) };
  assert.equal(cleanCrewData('host', big), null, 'over the byte limit');
});

// ---- the relay's crew room ---------------------------------------------------

async function client(server) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, { origin: `http://127.0.0.1:${server.port}` });
  const messages = [];
  ws.on('message', (data) => messages.push(JSON.parse(data)));
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  return {
    ws, messages,
    send: (m) => ws.send(JSON.stringify(m)),
    async take(type, predicate = () => true) {
      for (let i = 0; i < 200; i++) {
        const at = messages.findIndex((m) => m.type === type && predicate(m));
        if (at !== -1) return messages.splice(at, 1)[0];
        await pause(10);
      }
      throw new Error(`Missing ${type}: ${JSON.stringify(messages)}`);
    },
  };
}

test('relay: a crew room carries crew messages both ways and keeps Dogfight rooms apart', async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const pilot = await client(server);
  const hello = await pilot.take('hello');
  assert.deepEqual(hello.modes, ['duel', 'ffa3'], 'the Dogfight modes are unchanged');
  assert.equal(hello.crew, 1, 'the relay says it has crew rooms');

  pilot.send({ type: 'create', mode: CREW_MODE, protocol: 3 });
  const room = await pilot.take('room');
  assert.deepEqual({ role: room.role, mode: room.mode, capacity: room.capacity }, { role: 'host', mode: 'crew', capacity: 2 });

  // Today's Dogfight page sends a join with no mode: it is turned away with words.
  const dogfighter = await client(server);
  dogfighter.send({ type: 'join', code: room.code, protocol: 3 });
  assert.match((await dogfighter.take('error')).message, /crew room/);

  // A Dogfight room cannot be joined as crew either.
  const duelHost = await client(server);
  duelHost.send({ type: 'create', mode: 'duel', mapId: 'classic', protocol: 3 });
  const duel = await duelHost.take('room');
  const lost = await client(server);
  lost.send({ type: 'join', code: duel.code, mode: CREW_MODE, protocol: 3 });
  assert.match((await lost.take('error')).message, /Dogfight room/);

  const crew = await client(server);
  crew.send({ type: 'join', code: room.code, mode: CREW_MODE, protocol: 3 });
  const seat = await crew.take('room');
  assert.equal(seat.role, 'guest');
  assert.match(seat.seatToken, /^[A-Za-z0-9_-]{24}$/);
  assert.deepEqual((await pilot.take('crew-roster', (m) => m.seats.length === 2)).seats.map((s) => s.presence), ['here', 'here']);

  crew.send({ type: 'crew', data: { kind: 'card', name: 'Nova', stats: CREW.stats, skills: {} } });
  assert.equal((await pilot.take('crew')).data.name, 'Nova');
  pilot.send({ type: 'crew', data: { kind: 'state', step: 'board', captain: 'Vela' } });
  assert.equal((await crew.take('crew')).data.captain, 'Vela');
  crew.send({ type: 'crew', data: { kind: 'state' } });
  assert.match((await crew.take('error')).message, /not understood/);
  pilot.send({ type: 'snapshot', state: {} });
  assert.match((await pilot.take('error')).message, /Unsupported crew room/);

  const third = await client(server);
  third.send({ type: 'join', code: room.code, mode: CREW_MODE, protocol: 3 });
  assert.match((await third.take('error')).message, /full/);

  // The crew's socket drops: the seat is held and the token takes it back.
  crew.ws.terminate();
  assert.deepEqual((await pilot.take('crew-roster', (m) => m.seats[1]?.presence === 'away')).seats[1].presence, 'away');
  const back = await client(server);
  back.send({ type: 'rejoin', code: room.code, token: seat.seatToken, protocol: 3 });
  assert.equal((await back.take('room')).rejoined, true);
  assert.equal((await pilot.take('crew-roster', (m) => m.seats[1]?.presence === 'here')).seats[1].presence, 'here');
  back.send({ type: 'crew', data: { kind: 'act', job: 'scan' } });
  assert.equal((await pilot.take('crew')).data.job, 'scan');

  // The crew steps off: the pilot flies on alone and a new crew can join.
  back.send({ type: 'leave' });
  assert.match((await back.take('closed')).reason, /left the crew/);
  assert.equal((await pilot.take('crew-roster', (m) => m.seats[1]?.presence === 'open')).seats[1].presence, 'open');
  third.send({ type: 'join', code: room.code, mode: CREW_MODE, protocol: 3 });
  assert.equal((await third.take('room')).role, 'guest');

  // The pilot leaves: the room closes and the crew is told why (S58).
  pilot.ws.terminate();
  assert.match((await third.take('closed')).reason, /captain left/);
  assert.equal(server.rooms.has(room.code), false);
});

// ---- card and share ----------------------------------------------------------

test('crew card: name, stats and known skills only; anything else is refused', () => {
  const c = { ...testCharacter({ str: 3, cha: 2, con: 5, dex: 4, wis: 6 }, 'Nova'), skills: { mechanic: 2, nope: 3 } };
  const card = crewCard(c);
  assert.deepEqual(card, { name: 'Nova', stats: { str: 3, cha: 2, con: 5, dex: 4, wis: 6 }, skills: { mechanic: 2 } });
  assert.deepEqual(cleanCrewCard({ ...card, skills: { mechanic: 2, nope: 3 } }).skills, { mechanic: 2 }, 'unknown skills are dropped');
  assert.deepEqual(cleanCrewCard(card), { name: 'Nova', stats: { str: 3, cha: 2, con: 5, dex: 4, wis: 6 }, skills: { mechanic: 2 } });
  const { str, ...older } = card.stats;
  assert.equal(cleanCrewCard({ ...card, stats: older }).stats.str, 3, 'a crewmate on an older page counts Strength as average');
  assert.equal(crewCard(null), null, 'no captain, no card');
  assert.equal(cleanCrewCard({ ...card, stats: { ...card.stats, dex: 9 } }), null);
  assert.equal(cleanCrewCard({ ...card, name: '   ' }), null);
  assert.deepEqual(cleanCrewCard({ ...card, name: '<b>Nova</b>', skills: { mechanic: 9 } }).name, 'bNova/b');
  assert.deepEqual(cleanCrewCard({ ...card, skills: { mechanic: 9 } }).skills, {}, 'levels past the max are dropped');
});

test('crew share: credits, rep, skill points and materials; never keys, parts, cargo or losses; capped', () => {
  const { events } = grant(withCaptain(), { money: 120, rep: { hask: 10 }, items: { scrap: 2, permit: 1, circuit: 1, 'cargo-crate': 1 }, skillPoints: 1, flags: { 'fragment-1': 1 } });
  assert.deepEqual(crewShare(events), { money: 120, rep: { hask: 10 }, items: { scrap: 2 }, skillPoints: 1 });
  const { events: fine } = grant(cleanSave({ ...withCaptain(), money: 100 }), { money: -40, rep: { hask: -5 } });
  assert.equal(crewShare(fine), null, 'fines are the pilot\'s');
  assert.deepEqual(cleanCrewReward({ money: 99999, rep: { hask: 400, nobody: 5 }, items: { scrap: 500, railgun: 1 }, skillPoints: 9 }),
    { money: SHARE_LIMITS.money, rep: { hask: SHARE_LIMITS.rep }, items: { scrap: SHARE_LIMITS.items }, skillPoints: SHARE_LIMITS.skillPoints });
  assert.equal(cleanCrewReward({ money: -5 }), null);
  assert.equal(cleanCrewReward('lots'), null);
});

// ---- the crew's jobs in the engine ------------------------------------------

const RAIDER = { name: 'Test raider', hp: 60, movement: 'hold', abilities: [], damage: [6, 10] };
const TEST_QUEST = Object.freeze({
  id: 'crew-test', title: 'Crew test', giver: 'hask', start: 'talk', location: 'alpha',
  nodes: {
    talk: {
      type: 'dialogue', speaker: 'Hask', text: 'Talk your way in, or just go?',
      choices: [
        { label: 'Talk them round', check: { stat: 'cha', dc: 8, pass: 'fight', fail: 'fight' } },
        { label: 'Just go', to: 'fight' },
      ],
    },
    fight: { type: 'fight', mode: 'ship', title: 'Raider', enemy: RAIDER, outcomes: { win: 'won', lose: 'lost', flee: 'lost' } },
    won: { type: 'end', result: 'success', title: 'Done', reward: { money: 50, rep: { hask: 5 }, items: { scrap: 2, permit: 1 } } },
    lost: { type: 'end', result: 'failure', title: 'Lost' },
  },
});

test('docked (S55): the crew takes a dialogue check with their own stats; other choices stay the pilot\'s', () => {
  const save = withCaptain({ cha: 1, con: 3, dex: 3, wis: 3 });
  const { run } = startQuest(TEST_QUEST, save, { seed: 7 });
  const state = crewState({ quest: TEST_QUEST, run, save });
  assert.equal(state.step, 'talk');
  assert.deepEqual(state.checks.map((c) => [c.index, c.statName, c.dc]), [[0, 'Charisma', 8]]);
  assert.equal(act(TEST_QUEST, run, save, { type: 'crew', job: 'check', index: 1 }, { crew: CREW }).error, 'The captain makes that call.');
  assert.equal(act(TEST_QUEST, run, save, { type: 'crew', job: 'check', index: 0 }).error, 'No crew aboard.', 'no crew, no crew jobs');
  const out = act(TEST_QUEST, run, save, { type: 'crew', job: 'check', index: 0 }, { crew: CREW });
  assert.equal(out.error, undefined);
  assert.equal(out.run.lastCheck.bonus, 3, 'the roll used the crew\'s Charisma 6 (+3), not the captain\'s 1 (-2)');
  assert.equal(out.rolls.length, 1, 'the attempt is reported for the die');
  assert.equal(out.rolls[0].who, 'Nova');
  assert.match(out.run.log.join('\n'), /Nova takes it\. Charisma: /);
  assert.equal(out.run.node, 'fight');
});

test('shoot (S54) and repair (S53): one turret shot and one repair a round; systems break only with a crew aboard', () => {
  const save = withCaptain({ cha: 3, con: 3, dex: 3, wis: 3 });
  let { run } = startQuest(TEST_QUEST, save, { seed: 11 });
  run = act(TEST_QUEST, run, save, { type: 'choose', index: 1 }).run;
  assert.equal(run.part.kind, 'skirmish');
  const crew = { crew: CREW };

  const shot = act(TEST_QUEST, run, save, { type: 'crew', job: 'turret', hit: true }, crew);
  const dealt = RAIDER.hp - shot.run.part.state.enemy.hp;
  assert.ok(dealt >= CREW_RULES.turret.base && dealt <= CREW_RULES.turret.base + CREW_RULES.turret.spread, `turret dealt ${dealt}`);
  assert.match(act(TEST_QUEST, shot.run, save, { type: 'crew', job: 'turret', hit: true }, crew).error, /recharging/);
  const miss = act(TEST_QUEST, run, save, { type: 'crew', job: 'turret', hit: false }, crew);
  assert.equal(miss.run.part.state.enemy.hp, RAIDER.hp, 'a missed shot does nothing but use the round');
  assert.match(act(TEST_QUEST, run, save, { type: 'crew', job: 'repair', system: 'hull' }, crew).error, /whole/);

  // Fight on with the crew aboard until a system breaks, then repair it.
  let r = shot.run;
  let broke = null;
  for (let i = 0; i < 40 && !broke && !r.ended; i++) {
    const next = act(TEST_QUEST, r, save, { move: 'evade' }, crew);
    r = next.run;
    const sys = r.part?.state.systems;
    broke = sys && Object.keys(sys).find((k) => sys[k]);
  }
  assert.ok(broke, 'an enemy hit knocked out a system');
  assert.equal(crewState({ quest: TEST_QUEST, run: r, save }).fight.systems[broke], true, 'the crew sees it');
  const fixed = act(TEST_QUEST, r, save, { type: 'crew', job: 'repair', system: broke }, crew);
  assert.equal(fixed.run.part.state.systems[broke], false);
  assert.match(act(TEST_QUEST, fixed.run, save, { type: 'crew', job: 'repair', system: 'hull' }, crew).error, /Already repairing/);
  const hurt = fixed.run.part.state.ship;
  if (hurt.hp < hurt.hpMax) {
    const next = act(TEST_QUEST, fixed.run, save, { move: 'evade' }, crew).run;
    if (next.part?.kind === 'skirmish') {
      const before = next.part.state.ship.hp;
      const patched = act(TEST_QUEST, next, save, { type: 'crew', job: 'repair', system: 'hull' }, crew).run.part.state.ship.hp;
      assert.equal(patched, Math.min(next.part.state.ship.hpMax, before + patchAmount(CREW)), 'a patch is 5 + 3 for Constitution 6');
    }
  }

  // Solo, the same fight never breaks a system.
  let solo = run;
  for (let i = 0; i < 40 && !solo.ended; i++) {
    solo = act(TEST_QUEST, solo, save, { move: 'evade' }).run;
    if (solo.part) assert.deepEqual(solo.part.state.systems ?? {}, {}, 'no crew, no broken systems');
  }
});

test('the turret can finish a fight: the job moves on and the crew\'s share is the pilot\'s gains', () => {
  const save = withCaptain();
  let { run } = startQuest(TEST_QUEST, save, { seed: 5 });
  run = act(TEST_QUEST, run, save, { type: 'choose', index: 1 }).run;
  run.part.state.enemy.hp = 2; // nearly dead
  const out = act(TEST_QUEST, run, save, { type: 'crew', job: 'turret', hit: true }, { crew: CREW });
  assert.equal(out.run.ended?.result, 'success');
  assert.deepEqual(crewShare(out.events), { money: 50, rep: { hask: 5 }, items: { scrap: 2 } }, 'the permit (a key) stays with the pilot');
  assert.equal(crewState({ quest: TEST_QUEST, run: out.run, save: out.save }).step, 'end');
});

test('navigation (S56): the crew sees odds per lane and for the next jump; a passed scan halves the next jump\'s', () => {
  const quest = QUESTS['cold-run'];
  const save = withCaptain();
  let found = null;
  for (let seed = 1; seed < 80 && !found; seed++) {
    let { run, save: s } = startQuest(quest, save, { seed });
    for (let i = 0; i < 20 && !run.ended && run.part?.kind !== 'trip'; i++) {
      const v = view(quest, run, s);
      if (v.part) break;
      const next = act(quest, run, s, { type: 'choose', index: v.choices.find((c) => !c.locked).index });
      run = next.run; s = next.save;
    }
    if (run.part?.kind === 'trip' && run.part.state.phase === 'plan') found = { run, save: s };
  }
  assert.ok(found, 'cold run reaches its trip');
  const { run, save: s } = found;
  const nav = crewState({ quest, run, save: s }).trip;
  assert.ok(nav.routes.length >= 1);
  for (const r of nav.routes) assert.ok(r.odds >= 0 && r.odds <= 100, `${r.id}: ${r.odds}%`);
  assert.equal(nav.canScan, true);

  const marked = act(quest, run, s, { type: 'crew', job: 'mark', route: nav.routes.at(-1).id }, { crew: CREW });
  assert.equal(view(quest, marked.run, marked.save).part.crewMark, nav.routes.at(-1).id, 'the pilot sees the navigator\'s pick');
  assert.equal(act(quest, run, s, { type: 'crew', job: 'mark', route: 'nowhere' }, { crew: CREW }).error, 'No such lane.');

  const scanned = act(quest, run, s, { type: 'crew', job: 'scan' }, { crew: { ...CREW, stats: { ...CREW.stats, wis: 6 } } });
  assert.equal(scanned.error, undefined);
  assert.equal(scanned.run.part.state.scanned, 1, 'Wisdom 6 always passes the scan');
  assert.match(act(quest, scanned.run, scanned.save, { type: 'crew', job: 'scan' }, { crew: CREW }).error, /already scanned/);
  assert.match(scanned.run.part.state.log.at(-1), /safer/);
});

test('minigames (S55): the crew can try the cipher seal; only guesses, never giving up for the pilot', () => {
  const quest = { ...TEST_QUEST, id: 'crew-seal', start: 'seal', nodes: { ...TEST_QUEST.nodes, seal: { type: 'puzzle', kind: 'cipher', params: { title: 'Seal', length: 3, symbols: 4, attempts: 5 }, outcomes: { solved: 'won', failed: 'lost' } } } };
  const save = withCaptain();
  const { run } = startQuest(quest, save, { seed: 3 });
  const state = crewState({ quest, run, save });
  assert.equal(state.step, 'puzzle');
  assert.equal(state.puzzle.kind, 'cipher');
  assert.equal(act(quest, run, save, { type: 'crew', job: 'puzzle', action: { type: 'giveUp' } }, { crew: CREW }).error, 'No puzzle to work on right now.');
  const guess = act(quest, run, save, { type: 'crew', job: 'puzzle', action: { type: 'guess', code: [0, 1, 2] } }, { crew: CREW });
  assert.equal(guess.error, undefined);
  assert.equal(crewState({ quest, run: guess.run, save: guess.save }).puzzle?.guesses?.length ?? 0, guess.run.ended ? 0 : 1);
});

// ---- S57: every job finishable alone, and solo play unchanged ---------------

function soloPolicy(v, n) {
  const p = v.part;
  if (!p) {
    const open = v.choices.filter((c) => !c.locked);
    return { type: 'choose', index: open[n % open.length].index };
  }
  if (p.kind === 'skirmish') return { move: 'fire' };
  if (p.kind === 'cipher' || p.kind === 'riddle') return { type: 'giveUp' };
  if (p.kind === 'race') return { type: 'quick', style: p.moves[0].id };
  if (p.kind === 'foot') return { move: p.moves[0].id };
  if (p.kind === 'trip' && p.phase === 'plan') return { type: 'route', route: p.routes[n % p.routes.length].id };
  const card = p.card;
  if (card?.phase === 'choose') return { type: 'choose', index: card.choices.find((c) => !c.locked).index };
  if (card?.phase === 'fight') return { move: 'fire' };
  return { type: 'continue' };
}

test('S57: every job ends alone, and passing no crew changes nothing about a solo run', () => {
  for (const quest of Object.values(QUESTS)) {
    for (let seed = 1; seed <= 12; seed++) {
      const save = cleanSave({ ...withCaptain({ cha: 4, con: 4, dex: 4, wis: 4 }), money: 500, items: { scrap: 20, ore: 10, 'mining-drill': 1, permit: 1 }, rep: { hask: 60, vey: 60, garrity: 60 } });
      let a = startQuest(quest, save, { seed, now: 1 });
      let b = structuredClone(a);
      for (let i = 0; i < 300 && !a.run.ended; i++) {
        const action = soloPolicy(view(quest, a.run, a.save), seed + i);
        const nextA = act(quest, a.run, a.save, action, { now: 2 });
        const nextB = act(quest, b.run, b.save, action, { now: 2, crew: null });
        assert.equal(nextA.error, undefined, `${quest.id} seed ${seed} step ${i}: ${nextA.error}`);
        assert.deepEqual(nextB.run, nextA.run, 'crew: null plays exactly like no crew');
        a = { ...a, ...nextA }; b = { ...b, ...nextB };
      }
      assert.ok(a.run.ended, `${quest.id} seed ${seed} ended alone`);
    }
  }
});
