import test from "node:test";
import assert from "node:assert/strict";
import {
  RULES,
  NEUTRAL,
  createMatch,
  stepMatch,
  snapshot,
} from "../projects/Space-Shooter/dogfight/simulation.js";
import {
  inputControls,
  cleanSnapshot,
} from "../projects/Space-Shooter/dogfight/protocol.js";
import {
  relayAddress,
  defaultRelay,
} from "../projects/Space-Shooter/dogfight/transport.js";
const fire = { ...NEUTRAL, fire: true };
function active(seed = 123) {
  const m = createMatch(seed);
  m.phase = "playing";
  m.countdown = 0;
  return m;
}
test("seeded mirrored arena stays deterministic with bounded obstacle sizes", () => {
  const a = createMatch(23),
    b = createMatch(23);
  for (let i = 0; i < 1400; i++) {
    const input = [
      {
        turn: i % 180 < 70 ? 1 : 0,
        thrust: i % 90 < 55,
        brake: i % 180 > 155,
        fire: true,
      },
      NEUTRAL,
    ];
    stepMatch(a, input);
    stepMatch(b, input);
  }
  assert.deepEqual(a, b);
  assert.ok(a.obstacles.every((o) => o.radius >= 0.75 && o.radius <= 1.25));
  assert.equal(a.obstacles.length, 8);
});
test("countdown cannot move or shoot and fixed timestep is enforced", () => {
  const m = createMatch();
  for (let i = 0; i < 100; i++) stepMatch(m, [{ ...fire, thrust: true }, fire]);
  assert.equal(m.ships[0].x, 6);
  assert.equal(m.bullets.length, 0);
  assert.equal(m.phase, "countdown");
  assert.throws(() => stepMatch(m, [NEUTRAL, NEUTRAL], 0.2), RangeError);
});
test("actual bullets damage opponent and end a round; rematch resets hull", () => {
  const m = active();
  for (let i = 0; i < 240 && m.phase !== "finished"; i++)
    stepMatch(m, [fire, NEUTRAL]);
  assert.equal(m.phase, "finished");
  assert.equal(m.winner, 0);
  assert.equal(m.ships[1].hp, 0);
  assert.equal(m.ships[0].hp, 100);
  const n = createMatch(123, 2);
  assert.deepEqual(
    n.ships.map((s) => s.hp),
    [100, 100],
  );
  assert.equal(n.round, 2);
});
test("obstacle cover absorbs swept projectiles", () => {
  const m = active();
  m.obstacles = [{ x: 20, y: 12, radius: 1 }];
  for (let i = 0; i < 240; i++) stepMatch(m, [fire, NEUTRAL]);
  assert.equal(m.ships[1].hp, 100);
  assert.equal(m.phase, "playing");
});
test("fast rock collisions resolve outside geometry, damage once, and keep state finite", () => {
  const m = active();
  m.obstacles = [{ x: 8, y: 12, radius: 1 }];
  Object.assign(m.ships[0], { x: 6.6, y: 12, vx: 10 });
  stepMatch(m, [NEUTRAL, NEUTRAL]);
  assert.ok(m.ships[0].x <= 8 - 1 - RULES.shipRadius);
  assert.equal(m.ships[0].hp, 95);
  assert.ok(m.ships[0].vx < 0);
  assert.ok(
    m.ships.every((s) =>
      Object.values(s)
        .filter((v) => typeof v === "number")
        .every(Number.isFinite),
    ),
  );
});
test("equal hull at time expiry is a draw", () => {
  const m = active();
  m.remaining = RULES.step;
  stepMatch(m);
  assert.equal(m.phase, "finished");
  assert.equal(m.winner, null);
  assert.equal(m.reason, "time");
});
test("input and snapshot sanitation reject invented hits, malformed ranges and duplicate bullets", () => {
  assert.equal(inputControls({ ...NEUTRAL, hp: 0 }), null);
  assert.equal(inputControls({ ...NEUTRAL, turn: 2 }), null);
  const s = snapshot(active());
  assert.ok(cleanSnapshot(s, 1));
  assert.equal(cleanSnapshot({ ...s, round: 2 }, 1), null);
  assert.equal(
    cleanSnapshot({ ...s, ships: [{ ...s.ships[0], x: NaN }, s.ships[1]] }, 1),
    null,
  );
  assert.equal(
    cleanSnapshot(
      {
        ...s,
        bullets: [
          { id: 1, owner: 0, x: 4, y: 4 },
          { id: 1, owner: 0, x: 4, y: 4 },
        ],
      },
      1,
    ),
    null,
  );
});
test("public pages never default to private loopback or insecure remote transport", () => {
  assert.equal(
    defaultRelay({
      hostname: "example.com",
      protocol: "https:",
      host: "example.com",
    }),
    "",
  );
  assert.equal(
    defaultRelay({
      hostname: "127.0.0.1",
      protocol: "http:",
      host: "127.0.0.1:4173",
    }),
    "ws://127.0.0.1:4174/relay",
  );
  assert.throws(() =>
    relayAddress("ws://remote.example/relay", { protocol: "http:" }),
  );
  assert.throws(() =>
    relayAddress("ws://127.0.0.1:4174/relay", { protocol: "https:" }),
  );
  assert.throws(() => relayAddress("wss://name:secret@example.com/relay"));
  assert.equal(
    relayAddress("https://example.com", { protocol: "https:" }),
    "wss://example.com/relay",
  );
});

test("home-network pages automatically use their own relay, without allowing insecure cross-site relays", () => {
  for (const hostname of [
    "192.168.1.15",
    "10.0.0.8",
    "172.16.2.4",
    "172.31.8.9",
  ]) {
    const location = { protocol: "http:", hostname, host: `${hostname}:4174` };
    const expected = `ws://${location.host}/relay`;
    assert.equal(defaultRelay(location), expected);
    assert.equal(relayAddress(expected, location), expected);
    assert.throws(() => relayAddress("ws://192.168.1.20:4174/relay", location));
    assert.throws(() => relayAddress(`ws://${hostname}:9999/relay`, location));
    assert.throws(() =>
      relayAddress(expected, { ...location, protocol: "https:" }),
    );
  }
  for (const hostname of [
    "172.15.1.1",
    "172.32.1.1",
    "192.168.999.1",
    "8.8.8.8",
    "game.example",
  ]) {
    const location = { protocol: "http:", hostname, host: `${hostname}:4174` };
    assert.equal(defaultRelay(location), "");
    assert.throws(() => relayAddress(`ws://${location.host}/relay`, location));
  }
  assert.throws(() =>
    relayAddress("ws://192.168.1.15:4174/relay", {
      protocol: "http:",
      hostname: "public.example",
      host: "public.example",
    }),
  );
});

test("analog steering is proportional; new controls accept only bounded types and preserve old clients", () => {
  const a = active(),
    b = active();
  stepMatch(a, [{ ...NEUTRAL, turn: 0.25 }, NEUTRAL]);
  stepMatch(b, [{ ...NEUTRAL, turn: 1 }, NEUTRAL]);
  assert.equal(a.ships[0].angle * 4, b.ships[0].angle);
  assert.equal(
    inputControls({ turn: 0.3, thrust: false, brake: false, fire: false })
      .boost,
    false,
  );
  assert.equal(
    inputControls({ turn: -0.4, thrust: false, brake: false, fire: false })
      .reverse,
    false,
  );
  for (const turn of [NaN, Infinity, -Infinity, -1.001, 1.001, "0", null])
    assert.equal(inputControls({ ...NEUTRAL, turn }), null);
  for (const key of ["reverse", "boost"])
    for (const value of [1, "true", null])
      assert.equal(inputControls({ ...NEUTRAL, [key]: value }), null);
});
test("reverse accelerates opposite the nose while S/brake only damps momentum", () => {
  const reverse = active(),
    brake = active();
  for (let i = 0; i < 30; i++) {
    stepMatch(reverse, [{ ...NEUTRAL, reverse: true }, NEUTRAL]);
    stepMatch(brake, [{ ...NEUTRAL, brake: true }, NEUTRAL]);
  }
  assert.ok(reverse.ships[0].x < 5 && reverse.ships[0].vx < -4);
  assert.equal(brake.ships[0].x, 6);
  assert.equal(brake.ships[0].vx, 0);
});
test("boost waits for GO, has equal bounded impulse and cooldown, and cannot repeat while held", () => {
  const m = createMatch();
  const boost = { ...NEUTRAL, boost: true };
  while (m.phase === "countdown") stepMatch(m, [boost, boost]);
  assert.equal(m.ships[0].x, 6);
  assert.equal(m.ships[0].boostCooldown, 0);
  stepMatch(m, [boost, boost]);
  assert.ok(m.ships[0].vx > 5.9 && m.ships[1].vx < -5.9);
  assert.equal(m.ships[0].boostCooldown, RULES.boostCooldown);
  assert.equal(m.ships[1].boostCooldown, RULES.boostCooldown);
  // Eliminate walls/rocks as a confound while checking hold and release semantics.
  m.obstacles = [];
  for (let i = 0; i < 130; i++) {
    m.ships[0].x = 6;
    m.ships[1].x = 34;
    stepMatch(m, [boost, NEUTRAL]);
    assert.ok(Math.hypot(m.ships[0].vx, m.ships[0].vy) <= RULES.maxBoostSpeed);
  }
  assert.equal(m.ships[0].boostCooldown, 0);
  assert.ok(m.ships[0].vx < 6, "holding after expiry must not retrigger");
  stepMatch(m, [NEUTRAL, NEUTRAL]);
  m.ships[0].vx = 13;
  stepMatch(m, [boost, NEUTRAL]);
  assert.equal(m.ships[0].boostCooldown, 2);
  assert.ok(m.ships[0].vx <= 14 && m.ships[0].vx > 13);
  stepMatch(m, [NEUTRAL, NEUTRAL]);
  const prior = m.ships[0].vx;
  stepMatch(m, [boost, NEUTRAL]);
  assert.ok(
    m.ships[0].vx < prior,
    "press during cooldown must not add impulse",
  );
  const data = snapshot(m);
  assert.ok(cleanSnapshot(data, 1));
  for (const value of [-1, 2.001, NaN, "0"]) {
    const bad = structuredClone(data);
    bad.ships[0].boostCooldown = value;
    assert.equal(cleanSnapshot(bad, 1), null);
  }
  assert.equal(createMatch(1, 2).ships[0].boostCooldown, 0);
});
test("the published site defaults to the hub's public relay", () => {
  for (const hostname of ["donavencrenshaw.com", "www.donavencrenshaw.com"])
    assert.equal(
      defaultRelay({ protocol: "https:", hostname, host: hostname }),
      "wss://relay.donavencrenshaw.com/relay",
    );
  assert.equal(
    defaultRelay({ protocol: "http:", hostname: "donavencrenshaw.com", host: "donavencrenshaw.com" }),
    "",
  );
});
