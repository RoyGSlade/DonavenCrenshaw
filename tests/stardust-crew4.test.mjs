// Stardust launch, outcome 3 (tech lane plan, lhc-lanes/stardust/launch/tech/PLAN.md):
// real multiplayer, 1 to 4 players. One host's browser runs the session (as crew
// does today); friends join by link or room code; AI crew fill empty seats (low
// skill, mistakes, paid 10/15/25% of the job by tier); a player joining mid-mission
// takes an AI seat; if the host quits the session ends and progress is kept at
// checkpoints (design doc Section 9). Grows today's 2-seat crew relay and protocol.
// Written before the build: the relay tests skip until the protocol says 4 seats,
// the session tests until voyage/crew/seats.js exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { WebSocket } from 'ws';
import { createDogfightServer } from '../scripts/serve-stardust-dogfight.mjs';
import * as protocol from '../projects/Space-Shooter/voyage/crew/protocol.js';

const SEATS_URL = new URL('../projects/Space-Shooter/voyage/crew/seats.js', import.meta.url);
const seats = existsSync(SEATS_URL) ? await import(SEATS_URL.href) : null;
const relaySkip = protocol.CREW_SEATS >= 4 && protocol.CREW_PROTOCOL >= 2 ? false : 'outcome 3 not built yet (crew protocol is 2 seats)';
const seatSkip = seats ? false : 'outcome 3 not built yet (voyage/crew/seats.js)';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
    quiet: async (type, ms = 150) => { await pause(ms); return !messages.some((m) => m.type === type); },
  };
}

const card = (name) => ({ kind: 'card', name, stats: { str: 3, con: 3, dex: 3, wis: 3, cha: 3 }, skills: {} });

// ---- relay -------------------------------------------------------------------

test('relay: a crew room seats four and refuses a fifth; the roster lists every seat', { skip: relaySkip }, async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server);
  const hello = await host.take('hello');
  // Built: the hello keeps crew: 1 so pages from before outcome 3 still connect,
  // and lists the protocols it speaks (the plan's "crew >= 2" would have locked them out).
  assert.equal(hello.crew, 1);
  assert.ok(hello.crewProtocols.includes(2), 'the relay says it has 4-seat crew rooms');
  assert.equal(hello.crewSeats, 4);
  host.send({ type: 'create', mode: protocol.CREW_MODE, protocol: 3, seats: 4 });
  const room = await host.take('room');
  assert.equal(room.capacity, 4);
  const guests = [];
  for (let i = 1; i <= 3; i++) {
    const g = await client(server);
    g.send({ type: 'join', code: room.code, mode: protocol.CREW_MODE, protocol: 3 });
    const seat = await g.take('room');
    assert.equal(seat.seat, i, 'seats fill in order');
    guests.push(g);
  }
  const roster = await host.take('crew-roster', (m) => m.seats.filter((s) => s.presence === 'here').length === 4);
  assert.equal(roster.seats.length, 4);
  const fifth = await client(server);
  fifth.send({ type: 'join', code: room.code, mode: protocol.CREW_MODE, protocol: 3 });
  assert.match((await fifth.take('error')).message, /full/);
});

test('relay: the host reaches one seat or all; a seat reaches only the host', { skip: relaySkip }, async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server);
  host.send({ type: 'create', mode: protocol.CREW_MODE, protocol: 3, seats: 3 });
  const room = await host.take('room');
  const a = await client(server); a.send({ type: 'join', code: room.code, mode: protocol.CREW_MODE, protocol: 3 }); await a.take('room');
  const b = await client(server); b.send({ type: 'join', code: room.code, mode: protocol.CREW_MODE, protocol: 3 }); await b.take('room');
  host.send({ type: 'crew', to: 2, data: { kind: 'state', step: 'board' } });
  assert.equal((await b.take('crew')).data.step, 'board');
  assert.equal(await a.quiet('crew'), true, 'seat 1 did not get seat 2\'s message');
  host.send({ type: 'crew', data: { kind: 'note', text: 'all hands' } });
  assert.equal((await a.take('crew')).data.text, 'all hands');
  assert.equal((await b.take('crew')).data.text, 'all hands');
  a.send({ type: 'crew', data: card('Nova') });
  const got = await host.take('crew');
  assert.equal(got.data.name, 'Nova');
  assert.equal(got.from, 1, 'the host is told which seat spoke');
  assert.equal(await b.quiet('crew'), true, 'a seat never hears another seat directly');
});

test('relay: a dropped seat is held for its token; the host leaving closes the room for all', { skip: relaySkip }, async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server);
  host.send({ type: 'create', mode: protocol.CREW_MODE, protocol: 3, seats: 4 });
  const room = await host.take('room');
  const a = await client(server); a.send({ type: 'join', code: room.code, mode: protocol.CREW_MODE, protocol: 3 }); const seatA = await a.take('room');
  const b = await client(server); b.send({ type: 'join', code: room.code, mode: protocol.CREW_MODE, protocol: 3 }); await b.take('room');
  a.ws.terminate();
  await host.take('crew-roster', (m) => m.seats[1]?.presence === 'away');
  const back = await client(server);
  back.send({ type: 'rejoin', code: room.code, token: seatA.seatToken, protocol: 3 });
  assert.equal((await back.take('room')).seat, 1);
  host.ws.terminate();
  assert.match((await back.take('closed')).reason, /captain left/);
  assert.match((await b.take('closed')).reason, /captain left/);
});

test('relay: a protocol-1 crew room (no seats asked) still works as two seats', { skip: relaySkip }, async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server);
  host.send({ type: 'create', mode: protocol.CREW_MODE, protocol: 3 });
  assert.equal((await host.take('room')).capacity, 2, 'today\'s page gets today\'s room');
});

test('protocol: seats are 0..3 and host messages may name one', { skip: relaySkip }, () => {
  assert.equal(protocol.CREW_SEATS, 4);
  assert.ok(protocol.cleanCrewData('host', { kind: 'state', step: 'board' }));
  assert.equal(protocol.cleanSeat?.(3), 3);
  assert.equal(protocol.cleanSeat?.(4), null);
  assert.equal(protocol.cleanSeat?.(-1), null);
});

// ---- session seats and AI crew ----------------------------------------------

test('seats: AI crew fill the empty seats; a joining player takes the lowest AI seat', { skip: seatSkip }, () => {
  let table = seats.createSeats({ size: 4, host: { name: 'Vela' } });
  table = seats.fillWithAi(table, { tier: 1 });
  assert.deepEqual(table.map((s) => s.kind), ['host', 'ai', 'ai', 'ai']);
  const joined = seats.join(table, { name: 'Nova' });
  assert.equal(joined.seat, 1);
  assert.deepEqual(joined.table.map((s) => s.kind), ['host', 'human', 'ai', 'ai']);
  assert.equal(seats.join(seats.createSeats({ size: 2, host: { name: 'V' } }), { name: 'X' }).seat, 1, 'an open seat is taken first');
});

test('seats: an AI card is low skill and can never carry more than its tier', { skip: seatSkip }, () => {
  for (const tier of [1, 2, 3]) {
    const c = seats.aiCard(tier);
    assert.ok(Object.values(c.levels).every((v) => v === tier), `tier ${tier}: every skill at level ${tier}`);
  }
  assert.ok(Object.values(seats.aiCard(9).levels).every((v) => v <= 3), 'tiers stop at 3');
});

test('seats: AI mistakes come from the session\'s seeded roller, so a replay is identical', { skip: seatSkip }, () => {
  const rngFrom = (s) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const run = () => { const rng = rngFrom(42); return Array.from({ length: 50 }, () => seats.aiAct({ tier: 1 }, ['scan', 'patch', 'turret'], rng)); };
  assert.deepEqual(run(), run());
  const acts = run();
  const mistakes = acts.filter((a) => a.mistake).length;
  assert.ok(mistakes > 5 && mistakes < 30, `tier 1 messes up often but not always (${mistakes}/50)`);
});

test('seats: wages are 10/15/25% by tier, prorated by the checkpoints each AI worked', { skip: seatSkip }, () => {
  const table = [{ kind: 'host' }, { kind: 'ai', tier: 1, from: 0 }, { kind: 'ai', tier: 3, from: 2 }];
  const w = seats.wageShare(table, 1000, { checkpoints: 4 });
  assert.equal(w[1], 100, 'tier 1 worked all 4 checkpoints: 10%');
  assert.equal(w[2], 125, 'tier 3 joined at checkpoint 2 of 4: half of 25%');
});

test('seats: the host quitting ends the session and keeps the last checkpoint', { skip: seatSkip }, () => {
  const out = seats.hostLeft({ checkpoint: 'vault', node: 'alarm' });
  assert.deepEqual(out, { ended: 'host-left', resumeAt: 'vault' });
});
