import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFlight, FLIGHT_CONFIG, CHARGE_BOOST } from '../projects/Space-Shooter/engine/systems/flight.js';
import { railImpact, constrainToTrack, createTrackProgress, updateTrackProgress, isLapReady, isInsideTrack, portalCoordinates } from '../projects/Space-Shooter/engine/track.js';
import { parseLab, labQuery, labConfig, labReport, createLabLog, LEAN_FUEL } from '../projects/Space-Shooter/systems/lab.js';
import { createLevelLayout } from '../projects/Space-Shooter/engine/levels.js';
import { state, config } from '../projects/Space-Shooter/state.js';
import { handlePlayerMovement } from '../projects/Space-Shooter/engine/systems/movement.js';
import { applyGravity, resolveHazards, updateHazards } from '../projects/Space-Shooter/engine/systems/environment.js';
import { hasRequiredShards } from '../projects/Space-Shooter/engine/rules.js';

const STEP = 1 / 120;

test('a lab link names its rules; unknown values fall back to today', () => {
  assert.equal(parseLab(''), null);
  assert.equal(parseLab('?challenge=x'), null);
  assert.deepEqual(parseLab('?lab'), { boost: 'pips', fuel: 'current', rails: 'current' });
  assert.deepEqual(parseLab('?lab=boost:charge,fuel:lean,rails:impact'), { boost: 'charge', fuel: 'lean', rails: 'impact' });
  assert.deepEqual(parseLab('?lab=boost:rocket,__proto__:x,rails:IMPACT'), { boost: 'pips', fuel: 'current', rails: 'impact' });
  assert.equal(labQuery(parseLab('?lab=rails:impact')), 'boost:pips,fuel:current,rails:impact');
  assert.deepEqual(labConfig(parseLab('?lab=1')), { BOOST_MODEL: undefined, FUEL_BURN_SCALE: 1, BOOST_FUEL_COST: 0, RAIL_MODEL: undefined });
  assert.deepEqual(labConfig(parseLab('?lab=fuel:lean,boost:heat')), { BOOST_MODEL: 'heat', FUEL_BURN_SCALE: LEAN_FUEL.BURN_SCALE, BOOST_FUEL_COST: LEAN_FUEL.BOOST_COST, RAIL_MODEL: undefined });
});

function flight(model, holdSeconds, afterSeconds = 0.05) {
  const cfg = { ...FLIGHT_CONFIG, BOOST_MODEL: model };
  const scene = { flux: 0, boost: 3, fuel: 100, launched: true };
  const player = { x: 5, y: 5, vx: 0, vy: 0, angle: 0 };
  const pushes = [];
  const env = { onBoost: (scale) => pushes.push(scale) };
  const keys = { boost: true };
  for (let t = 0; t < holdSeconds; t += STEP) advanceFlight(STEP, scene, player, keys, env, cfg);
  keys.boost = false;
  for (let t = 0; t < afterSeconds; t += STEP) advanceFlight(STEP, scene, player, keys, env, cfg);
  return { player, scene, pushes };
}

test('today\'s boost fires on press and reports each push', () => {
  const { pushes, scene, player } = flight(undefined, 0.02);
  assert.deepEqual(pushes, [1]);
  assert.equal(Math.round(scene.boost), 2);
  assert.ok(player.vx > 3.9);
});

test('charge boost: a tap does nothing; a full hold fires one strong push on release', () => {
  const tap = flight('charge', 0.1);
  assert.deepEqual(tap.pushes, []);
  assert.equal(tap.scene.boost, 3, 'a tap spends nothing');
  const full = flight('charge', 1.0);
  assert.equal(full.pushes.length, 1);
  assert.ok(Math.abs(full.pushes[0] - CHARGE_BOOST.HIGH) < 1e-9);
  assert.ok(full.player.vx > FLIGHT_CONFIG.BOOST_IMPULSE * 1.5, `vx ${full.player.vx}`);
  assert.ok(full.scene.boost < 2.1 && full.scene.boost > 1.9, 'one charge spent');
  const half = flight('charge', 0.4);
  assert.ok(half.pushes[0] > CHARGE_BOOST.LOW && half.pushes[0] < CHARGE_BOOST.HIGH);
});

test('heat boost: holding it repeats, and every push is weaker than the last', () => {
  const { pushes, scene } = flight('heat', 1.0);
  assert.ok(pushes.length >= 4, `${pushes.length} pushes`);
  for (let i = 1; i < pushes.length; i++) assert.ok(pushes[i] < pushes[i - 1] + 1e-9);
  assert.ok(pushes.at(-1) >= 0.35 * 1.15 - 1e-9, 'never below the floor');
  assert.ok(scene.boost < 3, 'the meter shows the hot drive');
});

test('impact rails: a scrape keeps its speed and hull, a head-on hit loses both', () => {
  assert.deepEqual(railImpact(1), { impact: 1, keep: 1 - 0.035, damage: 0 });
  const hard = railImpact(10);
  assert.ok(hard.keep >= 0.55 && hard.keep < 0.7);
  assert.ok(Math.abs(hard.damage - 21) < 1e-9);
  assert.equal(railImpact(40).damage, 25);
  assert.equal(railImpact(-3).impact, 0);

  const track = createLevelLayout(1).track;
  const previous = { x: 25, y: 25 };
  const hits = [];
  const today = { x: 24, y: 5, vx: 0, vy: -15 };
  assert.equal(constrainToTrack(track, today, previous, config.PLAYER_RADIUS), true);
  const lab = { x: 24, y: 5, vx: 0, vy: -15 };
  assert.equal(constrainToTrack(track, lab, previous, config.PLAYER_RADIUS, { model: 'impact', onImpact: (h) => hits.push(h) }), true);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].damage > 0, 'a 15-unit head-on hit damages the hull');
  assert.ok(isInsideTrack(track, lab.x, lab.y, config.PLAYER_RADIUS));
});

test('a lab report says what was flown and never claims a saved time', () => {
  const log = createLabLog();
  log.boost(1.6); log.boost(0.5); log.rail({ impact: 6, damage: 7 }); log.rail({ impact: 0.2, damage: 0 });
  log.dock(); log.fuel(12); log.circuit(1, 41230);
  const text = labReport({ boost: 'charge', fuel: 'lean', rails: 'impact' }, log.data, 205000);
  assert.match(text, /boost charge · fuel lean · rails impact/);
  assert.match(text, /Total 3:25\.00 \(not saved\)/);
  assert.match(text, /Alpha Relay: 0:41\.23/);
  assert.match(text, /Boosts 2 \(average strength ×1\.05\)/);
  assert.match(text, /Rail hits 1, hard 1, rail damage 7/);
  assert.match(text, /Docked 1, ran out of fuel 0, lowest fuel 12/);
});

// The same scripted pilot as the circuit tests, flying each lab rule set, so
// the notes say what a variant changes for a careful line before anyone plays.
function flyLap(level, lab, boostEvery = 0) {
  const saved = { ...config };
  Object.assign(config, labConfig(lab));
  try {
    const scene = createLevelLayout(level);
    const portal = scene.track.portal;
    Object.assign(scene, {
      level, startPos: { x: portal.x, y: portal.y }, lockedInStart: false, launched: true, fuel: 100, flux: 30, boost: 3,
      elapsed: 0, trackProgress: createTrackProgress(), shards: new Set(),
      player: { x: portal.x, y: portal.y, vx: 0, vy: 0, angle: portal.angle, hp: 100, invulnTimer: 0 },
    });
    const player = scene.player;
    state.mode = 'roadmap';
    state.ui.countdownActive = false;
    state.gfx.particles = [];
    let target = 1, time = 0, finished = false, boosts = 0, lowest = 100, railHits = 0;
    const path = scene.safeRoute;
    for (; time < 90 && target < path.length; time += STEP) {
      const goal = path[target], dx = goal.x - player.x, dy = goal.y - player.y, d = Math.hypot(dx, dy);
      if (d < 0.3) { target++; continue; }
      const desired = Math.min(4, Math.sqrt(5 * d));
      const ax = ((dx / d) * desired - player.vx) * 2, ay = ((dy / d) * desired - player.vy) * 2;
      let error = Math.atan2(ay, ax) - player.angle;
      error = Math.atan2(Math.sin(error), Math.cos(error));
      // An eager pilot: tries to boost on a fixed rhythm when roughly lined up.
      const wantBoost = boostEvery > 0 && Math.abs(error) < 0.2 && Math.floor(time / boostEvery) % 2 === 0;
      Object.assign(state.keys, {
        launch: false, boost: wantBoost, brake: false, left: false, right: false,
        turnStrength: Math.max(-1, Math.min(1, error * 2)),
        thrustStrength: Math.abs(error) < 0.35 ? Math.min(1, Math.hypot(ax, ay) / 5) : 0,
        backStrength: 0, strafeLeft: false, strafeRight: false,
      });
      const previous = { x: player.x, y: player.y };
      const before = scene.trackProgress.boundaryHits;
      updateHazards(scene, STEP);
      applyGravity(player, scene.gravityWells, STEP);
      handlePlayerMovement(STEP, scene, player, {
        onFuelUse: (amount) => { scene.fuel -= amount * (config.FUEL_BURN_SCALE ?? 1); },
        onBoost: () => { boosts++; scene.fuel -= config.BOOST_FUEL_COST || 0; },
      });
      resolveHazards(scene, player);
      updateTrackProgress(scene, previous);
      player.invulnTimer = Math.max(0, player.invulnTimer - STEP);
      railHits += scene.trackProgress.boundaryHits - before;
      lowest = Math.min(lowest, scene.fuel);
      for (const node of scene.nodes.filter((n) => n.kind === 'planet'))
        if (Math.hypot(player.x - node.x - 0.5, player.y - node.y - 0.5) <= config.PLANET_RADIUS + config.PLAYER_RADIUS) scene.shards.add(node.id);
      const rel = portalCoordinates(scene.track, player);
      if (isLapReady(scene) && hasRequiredShards(scene) && Math.hypot(rel.forward, rel.lateral) <= config.GATE_RADIUS && rel.forward < -0.12 && rel.velocity > 0.15) {
        finished = true;
        break;
      }
    }
    return { finished, time, fuel: scene.fuel, lowest, hull: player.hp, boosts, railHits };
  } finally {
    for (const key of Object.keys(config)) if (!(key in saved)) delete config[key];
    Object.assign(config, saved);
  }
}

// The careful line must still finish every circuit under every rule set. The
// boosting pilot is crude (it boosts on a timer, not on a racing line), so its
// laps are reported, never asserted: they are no evidence about real players.
for (const [name, lab, boostEvery, mustFinish] of [
  ['today', parseLab('?lab'), 0, true],
  ['lean tank, careful line', parseLab('?lab=fuel:lean'), 0, true],
  ['impact rails, careful line', parseLab('?lab=rails:impact'), 0, true],
  ['charge boost, careful line', parseLab('?lab=boost:charge'), 0, true],
  ['heat boost, careful line', parseLab('?lab=boost:heat'), 0, true],
  ['lean tank, crude timed boosting (report only)', parseLab('?lab=fuel:lean'), 0.5, false],
]) {
  test(`scripted laps under the lab rules: ${name}`, (t) => {
    for (let level = 1; level <= 5; level++) {
      const lap = flyLap(level, lab, boostEvery);
      t.diagnostic(`L${level}: ${lap.finished ? 'finished' : 'did not finish'} ${lap.time.toFixed(2)}s, fuel left ${lap.fuel.toFixed(1)} (lowest ${lap.lowest.toFixed(1)}), hull ${lap.hull.toFixed(0)}, boosts ${lap.boosts}, rail contacts ${lap.railHits}`);
      if (mustFinish) {
        assert.ok(lap.finished, `circuit ${level} did not finish`);
        assert.ok(lap.lowest > 0, `circuit ${level} ran dry on the careful line`);
      }
    }
  });
}
