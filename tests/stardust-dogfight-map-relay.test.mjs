import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
import { createMatch, snapshot } from "../projects/Space-Shooter/dogfight/simulation.js";
import { damageTerrain } from "../projects/Space-Shooter/dogfight/terrain.js";
const pause = ms => new Promise(r => setTimeout(r, ms));
async function connect(server) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, { origin: `http://127.0.0.1:${server.port}` });
  const messages = []; ws.on("message", bytes => messages.push(JSON.parse(bytes)));
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  return { ws, messages, send: value => ws.send(JSON.stringify(value)), async take(type) {
    for (let i = 0; i < 150; i++) { const index = messages.findIndex(m => m.type === type); if (index >= 0) return messages.splice(index, 1)[0]; await pause(10); }
    throw new Error(`Missing ${type}: ${JSON.stringify(messages)}`);
  } };
}
test("relay binds map to room, ignores guest's selection, transmits destruction, rejects swaps, preserves map on rematch", async t => {
  const server = await createDogfightServer({ port: 0 }); t.after(() => server.close());
  for (const mapId of ["shatterbelt", "gravemaw", "stormworks"]) {
    const host = await connect(server), guest = await connect(server);
    host.send({ type: "create", mapId: "__proto__" }); assert.match((await host.take("error")).message, /map|arena/i);
    host.send({ type: "create", mapId }); const room = await host.take("room"); assert.equal(room.mapId, mapId);
    guest.send({ type: "join", code: room.code, mapId: "classic" }); assert.equal((await guest.take("room")).mapId, mapId);
    const start = await host.take("start"); assert.equal(start.mapId, mapId); assert.equal((await guest.take("start")).mapId, mapId);
    const m = createMatch(start.seed, 1, start.loadouts, mapId); m.tick = 1;
    const pod = m.obstacles.find(o => o.type === "fuel"); if (pod) damageTerrain(m, pod, 100);
    host.send({ type: "snapshot", state: snapshot(m) });
    const remote = (await guest.take("snapshot")).state; assert.equal(remote.mapId, mapId); assert.deepEqual(remote.terrain, snapshot(m).terrain);
    const forged = snapshot(createMatch(start.seed, 1, start.loadouts, "classic")); forged.tick = 2;
    host.send({ type: "snapshot", state: forged }); await pause(40); assert.equal(server.rooms.get(room.code).lastTick, 1);
    m.tick = 3; m.phase = "finished"; m.reason = "time"; m.remaining = 0;
    host.send({ type: "snapshot", state: snapshot(m) }); await host.take("result"); await guest.take("result");
    host.send({ type: "rematch", round: 1 }); guest.send({ type: "rematch", round: 1 });
    const restart = await host.take("start"); assert.equal(restart.round, 2); assert.equal(restart.mapId, mapId);
    assert.equal((await guest.take("start")).mapId, mapId);
    const fresh = createMatch(restart.seed, restart.round, restart.loadouts, restart.mapId);
    assert.ok(fresh.obstacles.every(o => o.hp !== 0)); assert.equal(fresh.bursts.length, 0);
    host.ws.close(); guest.ws.close();
  }
});
