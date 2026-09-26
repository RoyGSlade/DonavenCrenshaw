import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
import {
  createMatch,
  snapshot,
} from "../projects/Space-Shooter/dogfight/simulation.js";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function client(server, address = "127.0.0.1") {
  const ws = new WebSocket(`ws://${address}:${server.port}/relay`, {
    origin: `http://${address}:${server.port}`,
  });
  const messages = [];
  ws.on("message", (data) => messages.push(JSON.parse(data)));
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  return {
    ws,
    messages,
    send: (m) => ws.send(JSON.stringify(m)),
    async take(type) {
      for (let i = 0; i < 150; i++) {
        const at = messages.findIndex((m) => m.type === type);
        if (at !== -1) return messages.splice(at, 1)[0];
        await pause(20);
      }
      throw new Error(`Missing ${type}: ${JSON.stringify(messages)}`);
    },
  };
}
test("relay binds roles, enforces two seats, rejects forged snapshots and handles rematch/disconnect", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const host = await client(server),
    guest = await client(server),
    third = await client(server);
  host.send({ type: "create" });
  const room = await host.take("room");
  assert.equal(room.role, "host");
  guest.send({ type: "join", code: room.code });
  assert.equal((await guest.take("room")).role, "guest");
  const start = await host.take("start");
  await guest.take("start");
  third.send({ type: "join", code: room.code });
  assert.match((await third.take("error")).message, /full/);
  const m = createMatch(start.seed, start.round);
  guest.send({ type: "snapshot", state: snapshot(m) });
  await pause(60);
  assert.equal(
    host.messages.some((x) => x.type === "snapshot"),
    false,
  );
  assert.equal(server.rooms.get(room.code).lastTick, -1);
  guest.send({
    type: "input",
    round: 1,
    seq: 1,
    controls: { turn: 1, thrust: true, brake: false, fire: false },
    x: 0,
    hp: 0,
  });
  const input = await host.take("input");
  assert.equal(input.controls.turn, 1);
  assert.equal("x" in input, false);
  guest.send({
    type: "input",
    round: 1,
    seq: 1,
    controls: { turn: 0, thrust: false, brake: false, fire: false },
  });
  await pause(50);
  assert.equal(
    host.messages.some((x) => x.type === "input"),
    false,
  );
  m.phase = "finished";
  m.winner = 0;
  m.reason = "hull";
  m.ships[1].hp = 0;
  host.send({ type: "snapshot", state: snapshot(m) });
  assert.equal((await guest.take("result")).winner, 0);
  await host.take("result");
  host.send({ type: "rematch", round: 1 });
  await host.take("votes");
  await pause(30);
  assert.equal(server.rooms.get(room.code).round, 1);
  guest.send({ type: "rematch", round: 1 });
  assert.equal((await host.take("start")).round, 2);
  assert.equal((await guest.take("start")).round, 2);
  guest.ws.close();
  assert.match((await host.take("closed")).reason, /disconnected/);
  assert.equal(server.rooms.size, 0);
});
test("relay rejects origin spoofing and files outside its static scopes", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.port}`;
  assert.equal(
    (await fetch(`${base}/projects/Space-Shooter/dogfight/`)).status,
    200,
  );
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal(
    (await fetch(`${base}/projects/Space-Shooter/art/provenance.json`)).status,
    404,
  );
  assert.equal(
    (await fetch(`${base}/projects/Space-Shooter/art/asteroid-provenance.json`))
      .status,
    404,
  );
  assert.equal(
    (await fetch(`${base}/projects/Space-Shooter/dogfight/%2e%2e%2fstate.js`))
      .status,
    404,
  );
  const denied = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, {
      origin: "http://evil.example",
      headers: { Host: "evil.example" },
    });
    ws.on("unexpected-response", (_request, res) => {
      res.resume();
      ws.terminate();
      resolve(res.statusCode);
    });
    ws.on("error", () => {});
  });
  assert.equal(denied, 403);
});
test("oversized traffic is closed rather than queued", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const c = await client(server);
  const closed = new Promise((r) => c.ws.once("close", (code) => r(code)));
  c.ws.send("x".repeat(17000));
  assert.equal(await closed, 1009);
});
test("stalled host ends round explicitly rather than simulating in the background", async (t) => {
  const server = await createDogfightServer({ port: 0 });
  t.after(() => server.close());
  const h = await client(server),
    g = await client(server);
  h.send({ type: "create" });
  const room = await h.take("room");
  g.send({ type: "join", code: room.code });
  await h.take("start");
  await g.take("start");
  await pause(3300);
  const result = await g.take("result");
  assert.equal(result.reason, "host-stalled");
  assert.equal(result.winner, null);
});

test("LAN binding rejects wildcard, public and unassigned addresses", async () => {
  for (const lanAddress of ["0.0.0.0", "8.8.8.8", "127.0.0.1", "192.168.999.1"])
    await assert.rejects(createDogfightServer({ port: 0, lanAddress }), /private IPv4 address assigned/);
});

test("explicit LAN server serves the phone link and shares rooms with loopback clients", {
  skip: !process.env.STARDUST_TEST_LAN_IP,
}, async t => {
  const address = process.env.STARDUST_TEST_LAN_IP;
  const server = await createDogfightServer({ port: 0, lanAddress: address });
  t.after(() => server.close());
  const base = `http://${address}:${server.port}`;
  assert.equal((await fetch(`${base}/projects/Space-Shooter/`)).status, 200);
  assert.equal((await fetch(`${base}/projects/Space-Shooter/dogfight/`)).status, 200);
  const host = await client(server), guest = await client(server, address);
  host.send({ type: "create" });
  const room = await host.take("room");
  guest.send({ type: "join", code: room.code });
  assert.equal((await host.take("start")).round, 1);
  assert.equal((await guest.take("start")).round, 1);
});
test("sockets that never join a room are closed after the idle timeout", async (t) => {
  const server = await createDogfightServer({ port: 0, idleTimeoutMs: 300 });
  t.after(() => server.close());
  const idle = await client(server);
  const host = await client(server);
  host.send({ type: "create" });
  await host.take("room");
  const closed = await new Promise((r) => idle.ws.once("close", (code) => r(code)));
  assert.equal(closed, 1000);
  await pause(500);
  assert.equal(host.ws.readyState, WebSocket.OPEN);
});
test("a client address header gives each visitor their own connection limit", async (t) => {
  const server = await createDogfightServer({ port: 0, clientIpHeader: "cf-connecting-ip" });
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.port}`;
  const open = (ip) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, { origin, headers: { "CF-Connecting-IP": ip } });
    ws.once("open", () => resolve({ ws, status: 101 }));
    ws.once("unexpected-response", (_req, res) => { res.resume(); ws.terminate(); resolve({ ws, status: res.statusCode }); });
    ws.on("error", () => {});
  });
  const held = [];
  for (let i = 0; i < 16; i++) held.push(await open("203.0.113.7"));
  t.after(() => held.forEach(({ ws }) => ws.terminate()));
  assert.ok(held.every(({ status }) => status === 101));
  assert.equal((await open("203.0.113.7")).status, 403);
  const other = await open("198.51.100.9");
  assert.equal(other.status, 101);
  other.ws.terminate();
});
