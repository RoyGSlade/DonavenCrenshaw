import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createMatch, stepMatch, snapshot, NEUTRAL, RULES } from "../projects/Space-Shooter/dogfight/simulation.js";
import { cleanSnapshot } from "../projects/Space-Shooter/dogfight/protocol.js";
import { cleanLoadout, defaultLoadout, shipStats } from "../projects/Space-Shooter/dogfight/ships.js";
import { createDogfightServer } from "../scripts/serve-stardust-dogfight.mjs";
const loadout = classId => ({ ...defaultLoadout(), classId });
const active = classes => {
  const m = createMatch(1, 1, classes.map(loadout));
  m.phase = "playing"; m.countdown = 0; m.obstacles = [];
  return m;
};

test("loadouts accept any RGB paint but reject invalid classes, CSS and supplied stats", () => {
  assert.deepEqual(cleanLoadout({ ...loadout("heavy"), bodyColor: "#ABCDEF", accentColor: "#000000" }),
    { classId: "heavy", bodyColor: "#abcdef", accentColor: "#000000" });
  for (const invalid of [null, [], "heavy", { ...loadout("medium"), classId: "constructor" },
    { ...loadout("light"), hp: 9999 }, { ...loadout("light"), bodyColor: "red" },
    { ...loadout("light"), accentColor: "url(evil)" }, { ...loadout("light"), bodyColor: "#fff" }]) {
    assert.equal(cleanLoadout(invalid), null);
  }
});
test("classes trade hull for acceleration, turn and top speed; medium stays the default", () => {
  const states = ["light", "medium", "heavy"].map(id => active([id, "medium"]));
  for (let i = 0; i < 180; i++) for (const m of states) {
    m.ships[0].x = 6; m.ships[0].y = 12;
    stepMatch(m, [{ ...NEUTRAL, thrust: true }, NEUTRAL]);
  }
  assert.deepEqual(states.map(m => m.ships[0].hp), [80,100,140]);
  const speeds = states.map(m => m.ships[0].vx);
  assert.ok(speeds[0] > speeds[1] && speeds[1] > speeds[2]);
  for (const m of states) {
    m.ships[0].angle = 0; m.ships[0].vx = 100;
    stepMatch(m, [{ ...NEUTRAL, turn: 1 }, NEUTRAL]);
    assert.ok(Math.hypot(m.ships[0].vx, m.ships[0].vy) <= shipStats(m.ships[0]).speed + 1e-9);
  }
  assert.ok(states[0].ships[0].angle > states[1].ships[0].angle);
  assert.ok(states[1].ships[0].angle > states[2].ships[0].angle);
  assert.equal(createMatch().ships[0].loadout.classId, "medium");
});
test("all classes take real projectile damage and rematch restores their own hull", () => {
  for (const classId of ["light", "medium", "heavy"]) {
    const m = active(["medium", classId]);
    m.ships[1].x = 20;
    for (let i = 0; i < 400 && m.phase !== "finished"; i++) stepMatch(m, [{ ...NEUTRAL, fire: true }, NEUTRAL]);
    assert.equal(m.winner, 0);
    assert.equal(m.ships[1].hp, 0);
    const rematch = createMatch(2, 2, m.ships.map(ship => ship.loadout));
    assert.equal(rematch.ships[1].hp, shipStats(m.ships[1]).hp);
    assert.deepEqual(rematch.ships[1].loadout, m.ships[1].loadout);
  }
});
test("timeout compares hull percentage, including unequal full-health classes", () => {
  for (const [a,b,winner] of [[80,140,null],[60,70,0],[40,70,null],[20,70,1]]) {
    const m = active(["light", "heavy"]);
    m.ships[0].hp = a; m.ships[1].hp = b; m.remaining = RULES.step;
    stepMatch(m);
    assert.equal(m.winner, winner);
  }
});
test("class collision radii keep hulls inside walls and snapshots enforce selected stats", () => {
  const m = active(["heavy", "light"]);
  Object.assign(m.ships[0], { x: 0.01, vx: -10 });
  stepMatch(m);
  assert.ok(m.ships[0].x >= shipStats(m.ships[0]).radius);
  assert.ok(m.ships[0].vx > 0, "wall contact must bounce the heavy hull inward");
  const locked = m.ships.map(s => s.loadout), s = snapshot(m);
  assert.ok(cleanSnapshot(s, 1, locked));
  for (const change of [{hp:141}, {maxHp:999}, {loadout:loadout("light")},
    {loadout:{...loadout("heavy"), bodyColor:"#123456"}}]) {
    const bad = structuredClone(s); Object.assign(bad.ships[0], change);
    assert.equal(cleanSnapshot(bad, 1, locked), null);
  }
});

async function client(server) {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/relay`, { origin: `http://127.0.0.1:${server.port}` });
  const messages = [];
  socket.on("message", data => messages.push(JSON.parse(data)));
  await new Promise((resolve,reject) => { socket.once("open",resolve); socket.once("error",reject); });
  return { send: message => socket.send(JSON.stringify(message)), async take(type) {
    for (let i=0;i<100;i++) {
      const at = messages.findIndex(m => m.type === type);
      if (at >= 0) return messages.splice(at,1)[0];
      await new Promise(resolve => setTimeout(resolve,10));
    }
    throw new Error(`Missing ${type}`);
  } };
}
test("relay shares both loadouts, rejects changed loadouts and preserves them for rematch", async t => {
  const server = await createDogfightServer({ port:0 }); t.after(() => server.close());
  const host = await client(server), guest = await client(server);
  host.send({type:"create", loadout:{...loadout("heavy"), speed:100}});
  assert.match((await host.take("error")).message, /valid ship/);
  const loadouts = [loadout("heavy"), {...loadout("light"), bodyColor:"#e34a12",accentColor:"#ffc812"}];
  host.send({type:"create",loadout:loadouts[0]});
  const room = await host.take("room");
  guest.send({type:"join",code:room.code,loadout:loadouts[1]});
  const start = await host.take("start");
  assert.deepEqual(start.loadouts, loadouts);
  assert.deepEqual((await guest.take("start")).loadouts, loadouts);
  const match = createMatch(start.seed,start.round,loadouts);
  const bad = snapshot(match); bad.ships[0].loadout = loadout("light"); bad.ships[0].hp = 80; bad.ships[0].maxHp = 80;
  host.send({type:"snapshot",state:bad});
  await new Promise(resolve => setTimeout(resolve,30));
  assert.equal(server.rooms.get(room.code).lastTick,-1);
  host.send({type:"snapshot",state:snapshot(match)});
  assert.deepEqual((await guest.take("snapshot")).state.ships.map(s=>s.loadout),loadouts);
  host.send({type:"abort",reason:"host-hidden"}); await host.take("result");
  host.send({type:"rematch",round:1}); guest.send({type:"rematch",round:1});
  assert.deepEqual((await host.take("start")).loadouts,loadouts);
});
