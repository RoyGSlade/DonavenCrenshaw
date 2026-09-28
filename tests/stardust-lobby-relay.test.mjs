import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createDogfightServer, RELAY_VERSION } from "../scripts/serve-stardust-dogfight.mjs";
import { createMatch, snapshot, stepMatch, NEUTRAL } from "../projects/Space-Shooter/dogfight/simulation.js";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function client(server) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, { origin: `http://127.0.0.1:${server.port}` });
  const messages = [], all = [];
  ws.on("message", (data) => {
    const message = JSON.parse(data);
    messages.push(message);
    all.push(message);
  });
  await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
  return {
    ws, messages, all,
    send: (m) => ws.send(JSON.stringify(m)),
    async take(type, predicate = () => true) {
      for (let i = 0; i < 200; i++) {
        const at = messages.findIndex((m) => m.type === type && predicate(m));
        if (at !== -1) return messages.splice(at, 1)[0];
        await pause(15);
      }
      throw new Error(`Missing ${type}: ${JSON.stringify(messages)}`);
    },
    async none(type, ms = 60) {
      await pause(ms);
      assert.equal(messages.some((m) => m.type === type), false, `unexpected ${type}`);
    },
  };
}
const V3 = { protocol: 3 };
async function room(server, { mode = "duel", tickets = [] } = {}) {
  const seats = mode === "ffa3" ? 3 : 2;
  const peers = [];
  for (let i = 0; i < seats; i++) peers.push(await client(server));
  peers[0].send({ type: "create", mode, mapId: "classic", ...V3, ...(tickets[0] ? { ticket: tickets[0] } : {}) });
  const created = await peers[0].take("room");
  const joined = [created];
  for (let i = 1; i < seats; i++) {
    peers[i].send({ type: "join", code: created.code, ...V3, ...(tickets[i] ? { ticket: tickets[i] } : {}) });
    joined.push(await peers[i].take("room"));
  }
  const start = await peers[0].take("start");
  for (const p of peers.slice(1)) await p.take("start");
  return { peers, code: created.code, joined, start };
}
// The host reports a finished round with ship `winner` alive.
function finishRound(host, start, winner = 0, mode = "duel") {
  const m = createMatch(start.seed, start.round, start.loadouts, start.mapId, mode);
  m.phase = "finished";
  m.winner = winner;
  m.reason = "hull";
  m.tick = 50;
  m.ships.forEach((ship, id) => { if (id !== winner) ship.hp = 0; });
  host.send({ type: "snapshot", state: snapshot(m) });
}
const light = { classId: "light", bodyColor: "#223344", accentColor: "#bbccdd" };
const heavy = { classId: "heavy", bodyColor: "#334455", accentColor: "#ccddee" };

test("relay says version 3, gives only the joining guest a seat token and never broadcasts it", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers, joined } = await room(server);
  assert.equal(RELAY_VERSION, 3);
  assert.equal(peers[0].all.find((m) => m.type === "hello").version, 3);
  assert.equal("seatToken" in joined[0], false, "the host has no seat to reclaim");
  assert.match(joined[1].seatToken, /^[A-Za-z0-9_-]{24}$/);
  const lobby = await peers[0].take("lobby", (l) => l.seats.length === 2);
  assert.equal(lobby.phase, "waiting");
  assert.deepEqual(lobby.seats.map((s) => s.presence), ["here", "here"]);
  for (const message of peers[0].all)
    assert.equal(JSON.stringify(message).includes(joined[1].seatToken), false, "token leaked to the host");
  assert.equal((peers[0].all.find((m) => m.type === "roster")).lobby, true);
});

test("after-match lobby: ship and map changes between rounds only, validated, un-ready everyone, and start the next round", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers: [host, guest], code, start } = await room(server);
  // Nothing changes during a live round.
  guest.send({ type: "loadout", round: 1, loadout: light });
  host.send({ type: "map", round: 1, mapId: "gravemaw" });
  await pause(50);
  assert.equal(server.rooms.get(code).loadouts[1].classId, "medium");
  assert.equal(server.rooms.get(code).mapId, "classic");
  finishRound(host, start);
  await guest.take("result");
  const after = await guest.take("lobby", (m) => m.phase === "finished");
  assert.deepEqual(after.seats.map((s) => s.ready), [false, false]);
  host.send({ type: "ready", round: 1, ready: true });
  await guest.take("lobby", (m) => m.seats[0].ready);
  // A guest's ship change reaches everyone and un-readies the host too.
  guest.send({ type: "loadout", round: 1, loadout: light });
  const changed = await host.take("lobby", (m) => m.seats[1]?.loadout.classId === "light");
  assert.deepEqual(changed.seats.map((s) => s.ready), [false, false]);
  // Validation: bad loadouts error, stale rounds and guest map changes are ignored.
  guest.send({ type: "loadout", round: 1, loadout: { classId: "titan", bodyColor: "#000000", accentColor: "#ffffff" } });
  assert.match((await guest.take("error")).message, /valid ship/);
  guest.send({ type: "loadout", round: 1, loadout: { ...light, extra: 1 } });
  await guest.take("error");
  guest.send({ type: "loadout", round: 0, loadout: heavy });
  guest.send({ type: "map", round: 1, mapId: "gravemaw" });
  host.send({ type: "map", round: 1, mapId: "atlantis" });
  assert.match((await host.take("error")).message, /arena/);
  host.send({ type: "ready", round: 1, ready: "yes" });
  await pause(50);
  assert.equal(server.rooms.get(code).mapId, "classic");
  assert.equal(server.rooms.get(code).loadouts[1].classId, "light");
  assert.equal(server.rooms.get(code).votes.host, false);
  host.send({ type: "loadout", round: 1, loadout: heavy });
  host.send({ type: "map", round: 1, mapId: "gravemaw" });
  await guest.take("lobby", (m) => m.mapId === "gravemaw" && m.seats[0].loadout.classId === "heavy");
  // Readiness can be taken back; the round waits for every seat.
  guest.send({ type: "ready", round: 1, ready: true });
  guest.send({ type: "ready", round: 1, ready: false });
  host.send({ type: "ready", round: 1, ready: true });
  await host.none("start");
  guest.send({ type: "ready", round: 1, ready: true });
  for (const peer of [host, guest]) {
    const next = await peer.take("start");
    assert.equal(next.round, 2);
    assert.equal(next.mapId, "gravemaw");
    assert.deepEqual(next.loadouts, [heavy, light]);
  }
  // The new map and ships are what the relay accepts in snapshots now.
  const m = createMatch(1, 2, [heavy, light], "gravemaw");
  m.tick = 1;
  host.send({ type: "snapshot", state: snapshot(m) });
  assert.equal((await guest.take("snapshot", (s) => s.state.round === 2)).state.mapId, "gravemaw");
});

test("a dropped guest keeps the seat: host is told, watchdog holds, token rejoin resumes with the latest state", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers: [host, guest], code, joined, start } = await room(server);
  const m = createMatch(start.seed, 1, start.loadouts, start.mapId);
  m.phase = "playing";
  m.tick = 7;
  host.send({ type: "snapshot", state: snapshot(m) });
  await guest.take("snapshot");
  guest.ws.close();
  const away = await host.take("lobby", (l) => l.seats[1]?.presence === "away");
  assert.equal(away.phase, "active");
  assert.ok(away.seats[1].awayMs >= 0);
  assert.equal(server.rooms.size, 1);
  await host.none("closed");
  // Paused: no stall result while the seat is held.
  server.rooms.get(code).lastSnapshot = Date.now() - 10000;
  await pause(1200);
  assert.equal(host.messages.some((x) => x.type === "result"), false);
  // Too early to give up on them.
  host.send({ type: "release", round: 1, playerId: 1 });
  assert.match((await host.take("error")).message, /few seconds/);
  // A wrong or malformed token gets nothing.
  const thief = await client(server);
  thief.send({ type: "rejoin", code, token: "A".repeat(24), ...V3 });
  assert.match((await thief.take("error")).message, /no longer available/);
  thief.send({ type: "rejoin", code, token: [joined[1].seatToken] });
  await thief.take("error");
  const back = await client(server);
  back.send({ type: "rejoin", code, token: joined[1].seatToken, ...V3 });
  const again = await back.take("room");
  assert.equal(again.playerId, 1);
  assert.equal(again.rejoined, true);
  assert.equal(again.round, 1);
  assert.equal("seatToken" in again, false);
  const restart = await back.take("start");
  assert.equal(restart.rejoin, true);
  assert.equal(restart.seed, start.seed);
  assert.equal((await back.take("snapshot")).state.tick, 7);
  await host.take("lobby", (l) => l.seats[1]?.presence === "here");
  // The stall watchdog allows the 3-2-1, then the host must be live again.
  assert.ok(server.rooms.get(code).lastSnapshot > Date.now());
  back.send({ type: "input", round: 1, seq: 1, controls: { turn: 0, thrust: true, brake: false, fire: false } });
  assert.equal((await host.take("input")).seq, 1);
});

test("host continues without a duel guest: forfeit win, never reported, and the open seat takes a new pilot", async (t) => {
  const results = [];
  const server = await createDogfightServer({
    port: 0,
    verifyTicket: (ticket) => ({ userId: ticket }),
    onResult: (result) => results.push(result),
  });
  t.after(() => server.close());
  const { peers: [host, guest], code, joined } = await room(server, { tickets: ["ace", "rook"] });
  guest.ws.close();
  await host.take("lobby", (l) => l.seats[1]?.presence === "away");
  // Only the host decides.
  const other = await client(server);
  other.send({ type: "release", round: 1, playerId: 1 });
  assert.match((await other.take("error")).message, /Create or join/);
  server.rooms.get(code).seats[1].awaySince = Date.now() - 6000;
  host.send({ type: "release", round: 1, playerId: 0 });
  host.send({ type: "release", round: 1, playerId: "1" });
  await host.none("result");
  host.send({ type: "release", round: 1, playerId: 1 });
  const result = await host.take("result");
  assert.equal(result.winner, 0);
  assert.equal(result.reason, "forfeit");
  const open = await host.take("lobby", (l) => l.phase === "finished");
  assert.equal(open.seats[1].presence, "open");
  await pause(40);
  assert.deepEqual(results, [], "forfeits are casual");
  // An older page cannot take a reopened seat; a current page can.
  const legacy = await client(server);
  legacy.send({ type: "join", code });
  assert.match((await legacy.take("error")).message, /latest Dogfight page/);
  const fresh = await client(server);
  fresh.send({ type: "join", code, loadout: light, ...V3 });
  const seat = await fresh.take("room");
  assert.equal(seat.playerId, 1);
  assert.equal(seat.round, 1);
  assert.notEqual(seat.seatToken, joined[1].seatToken);
  const filled = await host.take("lobby", (l) => l.phase === "finished" && l.seats[1]?.presence === "here");
  assert.deepEqual(filled.seats[1].loadout, light);
  // The old token no longer matches the seat.
  const late = await client(server);
  late.send({ type: "rejoin", code, token: joined[1].seatToken, ...V3 });
  await late.take("error");
  host.send({ type: "ready", round: 1, ready: true });
  fresh.send({ type: "ready", round: 1, ready: true });
  assert.equal((await fresh.take("start")).round, 2);
});

test("three-player: giving up a held seat eliminates only that ship; its pilot may still come back to watch", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers, code, joined, start } = await room(server, { mode: "ffa3" });
  peers[2].ws.close();
  await peers[0].take("lobby", (l) => l.seats[2]?.presence === "away");
  await peers[1].take("lobby", (l) => l.seats[2]?.presence === "away");
  server.rooms.get(code).seats[2].awaySince = Date.now() - 6000;
  peers[0].send({ type: "release", round: 1, playerId: 2 });
  const open = await peers[1].take("lobby", (l) => l.seats[2]?.presence === "open");
  assert.equal(open.phase, "active");
  await peers[0].none("result");
  // Nobody new can take a seat in a live round.
  const fresh = await client(server);
  fresh.send({ type: "join", code, ...V3 });
  assert.match((await fresh.take("error")).message, /unavailable/);
  const back = await client(server);
  back.send({ type: "rejoin", code, token: joined[2].seatToken, ...V3 });
  assert.equal((await back.take("room")).playerId, 2);
  await back.take("start");
  // The host plays the round out with that ship eliminated.
  const m = createMatch(start.seed, 1, start.loadouts, start.mapId, "ffa3");
  m.phase = "playing";
  m.ships[2].hp = 0;
  m.ships[1].hp = 0;
  stepMatch(m, [NEUTRAL, NEUTRAL, NEUTRAL]);
  peers[0].send({ type: "snapshot", state: snapshot(m) });
  for (const peer of [peers[0], peers[1], back]) assert.equal((await peer.take("result")).winner, 0);
});

test("between rounds a held seat blocks the next round until its pilot returns or the host opens it", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const { peers: [h, g], code, start } = await room(server);
  finishRound(h, start);
  await g.take("result");
  await h.take("result");
  g.ws.close();
  const away = await h.take("lobby", (l) => l.phase === "finished" && l.seats[1]?.presence === "away");
  assert.equal(away.seats[1].ready, false);
  h.send({ type: "ready", round: 1, ready: true });
  await h.none("start");
  server.rooms.get(code).seats[1].awaySince = Date.now() - 6000;
  h.send({ type: "release", round: 1, playerId: 1 });
  const open = await h.take("lobby", (l) => l.seats[1]?.presence === "open");
  assert.equal(open.phase, "finished");
  await h.none("result");
  assert.equal(server.rooms.size, 1);
});

test("older pages keep rematch-only rules: no lobby, no token, and a drop still closes the room", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const h = await client(server), g = await client(server);
  h.send({ type: "create", ...V3 });
  const created = await h.take("room");
  g.send({ type: "join", code: created.code });
  const joined = await g.take("room");
  assert.equal("seatToken" in joined, false);
  const start = await h.take("start");
  await g.take("start");
  assert.equal(h.all.filter((m) => m.type === "roster").at(-1).lobby, false);
  finishRound(h, start);
  await g.take("result");
  // The older page only knows these message types.
  const known = new Set(["hello", "room", "roster", "start", "snapshot", "result", "votes", "closed", "error", "input", "opponent"]);
  assert.deepEqual(g.all.filter((m) => !known.has(m.type)), []);
  h.send({ type: "loadout", round: 1, loadout: light });
  h.send({ type: "map", round: 1, mapId: "gravemaw" });
  await pause(40);
  assert.equal(server.rooms.get(created.code).mapId, "classic");
  h.send({ type: "ready", round: 1, ready: true });
  g.send({ type: "rematch", round: 1 });
  assert.equal((await g.take("start")).round, 2);
  g.ws.close();
  assert.match((await h.take("closed")).reason, /disconnected/);
  assert.equal(server.rooms.size, 0);
});

test("held seats are bounded: the hold expires, a token takeover closes a stale socket, host drop still closes", async (t) => {
  const server = await createDogfightServer({ port: 0, holdMs: 300 });
  t.after(() => server.close());
  const a = await room(server);
  a.peers[1].ws.close();
  await a.peers[0].take("lobby", (l) => l.seats[1]?.presence === "away");
  // Mid-round in a duel the expired hold is a forfeit.
  assert.equal((await a.peers[0].take("result")).reason, "forfeit");

  const b = await room(server);
  const stale = new Promise((r) => b.peers[1].ws.once("close", (code) => r(code)));
  const takeover = await client(server);
  takeover.send({ type: "rejoin", code: b.code, token: b.joined[1].seatToken, ...V3 });
  assert.equal((await takeover.take("room")).playerId, 1);
  assert.equal(await stale, 4000);
  await pause(60);
  assert.equal(server.rooms.get(b.code).players[1].readyState, WebSocket.OPEN);
  b.peers[0].ws.close();
  assert.match((await takeover.take("closed")).reason, /disconnected/);
  assert.equal(server.rooms.has(b.code), false);
});
