import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, snapshot, NEUTRAL, RULES } from '../projects/Space-Shooter/dogfight/simulation.js';
import { cleanSnapshot } from '../projects/Space-Shooter/dogfight/protocol.js';
import { createPredictor, canPredict } from '../projects/Space-Shooter/dogfight/prediction.js';

const GUEST = 1;
const hold = (overrides) => ({ ...NEUTRAL, thrustStrength: 0, backStrength: 0, strafe: 0, ...overrides });
const THRUST = hold({ thrust: true, thrustStrength: 1 });
const THRUST_LEFT = hold({ thrust: true, thrustStrength: 1, turn: -1 });
const BOOST = hold({ thrust: true, thrustStrength: 1, boost: true });

function playing(mapId = 'classic') {
  const match = createMatch(7, 1, [], mapId, 'duel');
  while (match.phase !== 'playing') stepMatch(match, [NEUTRAL, NEUTRAL]);
  return match;
}
const arenaOf = (match) => ({ obstacles: match.obstacles.map((o) => ({ ...o })), fields: match.fields });
// What the relay forwards to the guest: the cleaned host snapshot plus the ack.
function relayed(match, ack) {
  const state = snapshot(match);
  state.ships[GUEST].ack = ack;
  return cleanSnapshot(state, match.round, null, match.mapId, match.mode);
}

test('snapshots carry velocities and the ack through the relay filter', () => {
  const match = playing();
  for (let i = 0; i < 30; i++) stepMatch(match, [NEUTRAL, THRUST]);
  const guest = relayed(match, 42).ships[GUEST];
  assert.ok(Math.abs(guest.vx) > 0.1);
  assert.equal(guest.ack, 42);
  assert.ok(canPredict(guest));
  assert.equal(canPredict(relayed(match, 0).ships[GUEST]), true, 'ack 0 is still an ack');
  assert.equal(canPredict(relayed(match, 0).ships[0]), false, 'the host ship carries no ack');
});

test('old hosts and relays: no velocities means no prediction, and bad values cost only the prediction data', () => {
  const match = playing();
  const state = snapshot(match);
  for (const ship of state.ships) { delete ship.vx; delete ship.vy; delete ship.angVel; }
  const old = cleanSnapshot(state, 1, null, match.mapId, 'duel');
  assert.ok(old, 'old snapshots stay valid');
  assert.equal(canPredict(old.ships[GUEST]), false);
  const wild = snapshot(match);
  wild.ships[GUEST].vx = 1e6;
  wild.ships[GUEST].ack = -3;
  const kept = cleanSnapshot(wild, 1, null, match.mapId, 'duel');
  assert.ok(kept, 'an out-of-range velocity does not drop the snapshot');
  assert.equal(kept.ships[GUEST].vx, undefined);
  assert.equal(kept.ships[GUEST].ack, undefined);
});

for (const mapId of ['classic', 'gravemaw', 'stormworks']) {
  test(`with instant inputs the guest's prediction lands exactly on the host (${mapId})`, () => {
    const match = playing(mapId);
    const predictor = createPredictor();
    const arena = arenaOf(match);
    predictor.reconcile(relayed(match, 0).ships[GUEST], arena);
    const plan = [...Array(40).fill(THRUST), ...Array(30).fill(THRUST_LEFT), ...Array(20).fill(BOOST), ...Array(30).fill(hold({}))];
    plan.forEach((input, i) => {
      stepMatch(match, [NEUTRAL, input]);
      predictor.advance(RULES.step, input, i + 1, arena);
    });
    const host = match.ships[GUEST];
    const drawn = predictor.pose();
    assert.ok(Math.hypot(drawn.x - host.x, drawn.y - host.y) < 1e-9, `${drawn.x},${drawn.y} vs ${host.x},${host.y}`);
    assert.ok(Math.abs(drawn.angle - host.angle) < 1e-9);
    // And a snapshot of that same moment corrects nothing.
    predictor.reconcile(relayed(match, plan.length).ships[GUEST], arena);
    assert.ok(predictor.stats.lastError < 1e-9, String(predictor.stats.lastError));
  });
}

// Guest and host exchange messages through a network with a fixed one-way
// delay; the host publishes every 3 ticks (~50 ms) and the guest sends every
// 2 ticks (~33 ms), like the real client.
function simulateDelayed({ oneWayTicks, plan }) {
  const match = playing();
  const arena = arenaOf(match);
  const predictor = createPredictor();
  const toHost = [];
  const toGuest = [];
  let hostInput = { seq: 0, input: NEUTRAL };
  let seq = 0;
  let sent = NEUTRAL;
  const trace = [];
  for (let tick = 0; tick < plan.length; tick++) {
    if (tick % 2 === 0) {
      seq += 1;
      sent = plan[tick];
      toHost.push({ at: tick + oneWayTicks, seq, input: sent });
    }
    while (toHost.length && toHost[0].at <= tick) hostInput = toHost.shift();
    stepMatch(match, [NEUTRAL, hostInput.input]);
    if (tick % 3 === 0) toGuest.push({ at: tick + oneWayTicks, state: relayed(match, hostInput.seq) });
    while (toGuest.length && toGuest[0].at <= tick) predictor.reconcile(toGuest.shift().state.ships[GUEST], arena);
    predictor.advance(RULES.step, sent, seq, arena);
    trace.push({ tick, drawn: predictor.pose(), host: { x: match.ships[GUEST].x, y: match.ships[GUEST].y } });
  }
  return { trace, stats: predictor.stats };
}

test('a guest sees its own thrust at once, not a round trip later', () => {
  const plan = [...Array(30).fill(hold({})), ...Array(60).fill(THRUST)];
  const { trace } = simulateDelayed({ oneWayTicks: 6, plan }); // 100 ms each way
  // The guest spawns facing left, so measure distance, not direction.
  const away = (from, to) => Math.hypot(to.x - from.x, to.y - from.y) > 0.001;
  const moved = trace.findIndex((t, i) => i > 30 && away(trace[30].drawn, t.drawn));
  const hostMoved = trace.findIndex((t, i) => i > 30 && away(trace[30].host, t.host));
  assert.ok(moved > 30 && moved - 30 <= 2, `drawn ship reacted after ${moved - 30} ticks`);
  assert.ok(hostMoved - 30 >= 6, `the host saw it after ${hostMoved - 30} ticks`);
});

test('under 100 ms each way, corrections stay small and nothing snaps', () => {
  const plan = [
    ...Array(20).fill(hold({})), ...Array(60).fill(THRUST), ...Array(40).fill(THRUST_LEFT),
    ...Array(30).fill(hold({ turn: 1 })), ...Array(40).fill(BOOST), ...Array(60).fill(hold({ brake: true })),
  ];
  const { stats } = simulateDelayed({ oneWayTicks: 6, plan });
  assert.equal(stats.snaps, 0);
  assert.ok(stats.maxError < 0.6, `largest correction ${stats.maxError.toFixed(3)} units`);
  assert.ok(stats.reconciles > 50);
});

test('without prediction data the predictor stays off', () => {
  const predictor = createPredictor();
  assert.equal(predictor.reconcile({ x: 1, y: 1, angle: 0 }, { obstacles: [], fields: [] }), false);
  assert.equal(predictor.active, false);
  assert.equal(predictor.pose(), null);
});

test('a big correction snaps instead of sliding across the arena', () => {
  const match = playing();
  const arena = arenaOf(match);
  const predictor = createPredictor();
  predictor.reconcile(relayed(match, 0).ships[GUEST], arena);
  match.ships[GUEST].x = 5; // e.g. a jump gate on the host
  predictor.reconcile(relayed(match, 0).ships[GUEST], arena);
  assert.equal(predictor.pose().x, 5);
  assert.equal(predictor.stats.snaps, 1);
});
