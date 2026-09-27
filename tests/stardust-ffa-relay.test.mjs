import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
import {
  createMatch,
  snapshot,
  stepMatch,
  NEUTRAL,
} from "../projects/Space-Shooter/dogfight/simulation.js";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function client(server) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, {
    origin: `http://127.0.0.1:${server.port}`,
  });
  const messages = [];
  ws.on("message", (bytes) => messages.push(JSON.parse(bytes)));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return {
    ws,
    messages,
    send: (m) => ws.send(JSON.stringify(m)),
    async take(type, predicate = () => true) {
      for (let i = 0; i < 200; i++) {
        const index = messages.findIndex(
          (m) => m.type === type && predicate(m),
        );
        if (index >= 0) return messages.splice(index, 1)[0];
        await pause(10);
      }
      throw new Error(`Missing ${type}: ${JSON.stringify(messages)}`);
    },
  };
}
async function ffa(server, mapId = "classic") {
  const peers = await Promise.all([
    client(server),
    client(server),
    client(server),
  ]);
  peers[0].send({ type: "create", mode: "ffa3", mapId });
  const room = await peers[0].take("room");
  for (let i = 1; i < 3; i++) {
    peers[i].send({ type: "join", code: room.code });
    await peers[i].take("room");
  }
  const starts = await Promise.all(peers.map((p) => p.take("start")));
  return { peers, room, start: starts[0] };
}
const input = (seq, playerId = 99, round = 1) => ({
  type: "input",
  round,
  seq,
  playerId,
  controls: {
    ...NEUTRAL,
    turn: 0.3,
    thrust: true,
    thrustStrength: 0.7,
    strafe: -0.3,
  },
});

test("FFA waits for third seat, advertises roster, preserves map/loadouts and rejects a fourth", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server),
    one = await client(server),
    two = await client(server),
    four = await client(server);
  assert.deepEqual((await host.take("hello")).modes, ["duel", "ffa3"]);
  for (const mode of ["invalid", ["ffa3"], {}]) {
    host.send({ type: "create", mode });
    assert.match((await host.take("error")).message, /mode/);
  }
  const loadouts = [
    { classId: "medium", bodyColor: "#112233", accentColor: "#aabbcc" },
    { classId: "light", bodyColor: "#223344", accentColor: "#bbccdd" },
    { classId: "heavy", bodyColor: "#334455", accentColor: "#ccddee" },
  ];
  host.send({
    type: "create",
    mode: "ffa3",
    mapId: "gravemaw",
    loadout: loadouts[0],
  });
  const room = await host.take("room");
  assert.equal(room.playerId, 0);
  assert.equal(room.mode, "ffa3");
  assert.equal(room.capacity, 3);
  one.send({
    type: "join",
    code: room.code,
    loadout: loadouts[1],
    playerId: 0,
    mode: "duel",
    mapId: "classic",
  });
  const joined = await one.take("room");
  assert.equal(joined.playerId, 1);
  assert.equal(joined.role, "guest");
  assert.equal(joined.mapId, "gravemaw");
  for (const peer of [host, one]) {
    const roster = await peer.take("roster", (m) => m.players.length === 2);
    assert.equal(roster.capacity, 3);
    assert.deepEqual(
      roster.players.map((p) => p.loadout),
      loadouts.slice(0, 2),
    );
  }
  await pause(40);
  assert.equal(
    host.messages.some((m) => m.type === "start"),
    false,
  );
  assert.equal(server.rooms.get(room.code).phase, "waiting");
  two.send({ type: "join", code: room.code, loadout: loadouts[2] });
  assert.equal((await two.take("room")).playerId, 2);
  for (const peer of [host, one, two]) {
    assert.deepEqual(
      (await peer.take("roster", (m) => m.players.length === 3)).players.map(
        (p) => p.playerId,
      ),
      [0, 1, 2],
    );
    const start = await peer.take("start");
    assert.equal(start.mode, "ffa3");
    assert.equal(start.mapId, "gravemaw");
    assert.deepEqual(start.loadouts, loadouts);
  }
  four.send({ type: "join", code: room.code });
  assert.match((await four.take("error")).message, /full/);
});

test("guest identity is socket-bound, sequences are separate and rooms cannot receive each other inputs or snapshots", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const a = await ffa(server),
    b = await ffa(server);
  for (let id = 1; id <= 2; id++) a.peers[id].send(input(1, id === 1 ? 2 : 0));
  const received = [
    await a.peers[0].take("input"),
    await a.peers[0].take("input"),
  ].sort((x, y) => x.playerId - y.playerId);
  assert.deepEqual(
    received.map((m) => m.playerId),
    [1, 2],
  );
  assert.deepEqual(
    received.map((m) => m.seq),
    [1, 1],
  );
  assert.equal(received[1].controls.thrustStrength, 0.7);
  assert.equal(received[1].controls.strafe, -0.3);
  a.peers[1].send(input(1));
  a.peers[2].send(input(0));
  a.peers[0].send(input(10));
  await pause(40);
  assert.equal(
    a.peers[0].messages.some((m) => m.type === "input"),
    false,
  );
  for (const peer of b.peers)
    assert.equal(
      peer.messages.some((m) => m.type === "input" || m.type === "snapshot"),
      false,
    );
  const m = createMatch(
    a.start.seed,
    1,
    a.start.loadouts,
    a.start.mapId,
    "ffa3",
  );
  m.tick = 1;
  a.peers[2].send({ type: "snapshot", state: snapshot(m) });
  await pause(30);
  assert.equal(server.rooms.get(a.room.code).lastTick, -1);
  a.peers[0].send({ type: "snapshot", state: snapshot(m) });
  const copies = await Promise.all(
    a.peers.slice(1).map((p) => p.take("snapshot")),
  );
  assert.deepEqual(copies[0], copies[1]);
  assert.equal(copies[0].state.ships.length, 3);
  for (const peer of b.peers)
    assert.equal(
      peer.messages.some((m) => m.type === "snapshot"),
      false,
    );
  const wrongMode = snapshot(m);
  wrongMode.mode = "duel";
  wrongMode.tick = 2;
  a.peers[0].send({ type: "snapshot", state: wrongMode });
  await pause(30);
  assert.equal(server.rooms.get(a.room.code).lastTick, 1);
});

test("one elimination keeps FFA active, winner seat2 reaches all peers, and only all three rematch votes restart", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers, room, start } = await ffa(server, "shatterbelt");
  const m = createMatch(start.seed, 1, start.loadouts, start.mapId, "ffa3");
  m.phase = "playing";
  m.ships[0].hp = 0;
  stepMatch(m, [NEUTRAL, NEUTRAL, NEUTRAL]);
  assert.equal(m.phase, "playing");
  peers[0].send({ type: "snapshot", state: snapshot(m) });
  for (const peer of peers.slice(1))
    assert.equal((await peer.take("snapshot")).state.phase, "playing");
  assert.equal(server.rooms.get(room.code).phase, "active");
  m.ships[1].hp = 0;
  stepMatch(m, [NEUTRAL, NEUTRAL, NEUTRAL]);
  assert.equal(m.winner, 2);
  assert.equal(m.phase, "finished");
  peers[0].send({ type: "snapshot", state: snapshot(m) });
  for (const peer of peers) {
    const result = await peer.take("result");
    assert.equal(result.winner, 2);
    assert.equal(result.reason, "hull");
  }
  peers[0].send({ type: "rematch", round: 1 });
  peers[1].send({ type: "rematch", round: 1 });
  const vote = await peers[0].take(
    "votes",
    (v) => v.votes.host && v.votes.guest,
  );
  assert.deepEqual(vote.votes, { host: true, guest: true, guest2: false });
  await pause(30);
  assert.equal(server.rooms.get(room.code).round, 1);
  peers[2].send({ type: "rematch", round: 1 });
  for (const peer of peers) {
    const again = await peer.take("start");
    assert.equal(again.round, 2);
    assert.equal(again.mode, "ffa3");
    assert.equal(again.mapId, start.mapId);
    assert.deepEqual(again.loadouts, start.loadouts);
  }
  peers[1].send(input(1, 2, 2));
  assert.equal((await peers[0].take("input")).playerId, 1);
});

test("disconnecting any waiting or active seat closes the entire room and clears every socket binding", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server),
    waiting = await client(server);
  host.send({ type: "create", mode: "ffa3" });
  const room = await host.take("room");
  waiting.send({ type: "join", code: room.code });
  await waiting.take("room");
  waiting.ws.close();
  await host.take("closed");
  assert.equal(server.rooms.size, 0);
  for (const id of [0, 1, 2]) {
    const match = await ffa(server);
    match.peers[id].ws.close();
    for (let p = 0; p < 3; p++)
      if (p !== id) await match.peers[p].take("closed");
    assert.equal(server.rooms.size, 0);
    for (const socket of server.wss.clients)
      if (socket.room?.code === match.room.code)
        assert.fail("A closed room retained a bound socket");
    for (const peer of match.peers) peer.ws.close();
    await pause(25);
  }
});

test("host abort and missing snapshots finish all three peers without creating stored results", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers, room } = await ffa(server);
  peers[0].send({ type: "abort", reason: "host-hidden" });
  for (const peer of peers)
    assert.equal((await peer.take("result")).reason, "host-hidden");
  for (const peer of peers) peer.send({ type: "rematch", round: 1 });
  for (const peer of peers) await peer.take("start");
  // Advance only the relay's watchdog timestamp, avoiding a multi-second test sleep.
  server.rooms.get(room.code).lastSnapshot = Date.now() - 4000;
  for (const peer of peers) {
    const result = await peer.take("result");
    assert.equal(result.reason, "host-stalled");
    assert.equal(result.winner, null);
  }
  peers[1].send({ type: "leave" });
  for (const peer of peers) await peer.take("closed");
  assert.equal(server.rooms.size, 0);
});
