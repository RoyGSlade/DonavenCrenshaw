// The weekly time trial: the event data, the layout, its rules (mines, rails,
// sentries, the finish line), the scripted lap, and exact replays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WEEKLY_EVENTS, currentWeekly, weeklyById } from '../projects/Space-Shooter/tracks/weekly.js';
import { createWeeklyLayout, WEEKLY_RULES as R, bouncerPosition } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { createWeeklyScene, stepWeekly, quantizeFrame, frameFromKeys, keysFromFrame, BIT, WEEKLY_CONFIG, WEEKLY_PHYSICS } from '../projects/Space-Shooter/engine/weekly/sim.js';
import { encodeInputLog, decodeInputLog, replayInputLog, ghostPose, LOG_PREFIX } from '../projects/Space-Shooter/engine/weekly/replay.js';
import { PLAYER_HULL, shipTouchesCircle } from '../projects/Space-Shooter/engine/hull.js';
import { flyWeeklyLap } from '../projects/Space-Shooter/engine/weekly/pilot.js';
import { weeklyStatus, parseWeeklyQuery, weeklyPreviewSvg, weeklyGameUrl } from '../projects/Space-Shooter/systems/weekly.js';
import { isInsideTrack, isHullInsideTrack, pointOnTrack, nearestTrackPoint, updateTrackProgress, createTrackProgress } from '../projects/Space-Shooter/engine/track.js';

const event = WEEKLY_EVENTS[0];
const layout = createWeeklyLayout(event);
const lap = flyWeeklyLap(layout);
const launch = { turn: 0, thrust: 0, back: 0, strafe: 0, bits: BIT.LAUNCH };
const idle = { turn: 0, thrust: 0, back: 0, strafe: 0, bits: 0 };

function launched() {
  const scene = createWeeklyScene(layout);
  stepWeekly(scene, launch);
  return scene;
}

test('every weekly event is well formed, a week long and uniquely named', () => {
  const ids = new Set();
  for (const e of WEEKLY_EVENTS) {
    assert.match(e.id, /^weekly-\d{2}$/);
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    assert.ok(Number.isInteger(e.week) && Number.isInteger(e.version) && e.version > 0);
    const open = Date.parse(e.opensAt), close = Date.parse(e.closesAt);
    assert.ok(Number.isFinite(open) && Number.isFinite(close), `${e.id} has readable dates with offsets`);
    assert.ok(close > open, `${e.id} has a positive release window`);
    if (e.week === 1) assert.equal(close - open, 7 * 86400000);
    assert.equal(e.commentsPage, `stardust-${e.id}`);
    assert.ok(e.rewards.podiumSize === 3 && e.rewards.champion);
    if (e.week === 1) assert.ok(e.rewards.podium && e.rewards.entitlement);
    if (e.enabled === false) assert.equal(e.track, null, "owner track is not invented");
  }
  assert.equal(weeklyById('weekly-01'), event);
  assert.equal(weeklyById('nope'), null);
  assert.equal(currentWeekly(Date.parse('2026-10-01T00:00:00Z')).id, 'weekly-01');
});

test("the hub's rules and titles agree with the game (when the hub repo sits alongside)", { skip: !existsSync(new URL('../../hub/api/games/stardust/rules.json', import.meta.url)) }, () => {
  const rules = JSON.parse(readFileSync(new URL('../../hub/api/games/stardust/rules.json', import.meta.url), 'utf8'));
  const titles = JSON.parse(readFileSync(new URL('../../hub/api/config/titles.json', import.meta.url), 'utf8'));
  const titleIds = new Set((titles.titles || titles).map((t) => t.id));
  for (const e of WEEKLY_EVENTS) {
    const level = rules.levels.find((l) => l.id === e.id);
    assert.ok(level, `hub has a ${e.id} board`);
    assert.equal(level.version, e.version);
    assert.equal(Date.parse(level.opensAt), Date.parse(e.opensAt), `${e.id} opens at the same moment on both sides`);
    assert.equal(Date.parse(level.closesAt), Date.parse(e.closesAt), `${e.id} closes at the same moment on both sides`);
    assert.equal(level.network, false);
    assert.equal(level.staffHidden, true, 'the owner\'s dev times stay off the public board');
    assert.equal(level.replay, 'store');
    assert.ok(level.minTimeMs < lap.time, 'the hub floor is below a careful lap');
    const hubEvent = rules.events.find((x) => x.id === e.id);
    assert.ok(hubEvent && hubEvent.board === e.id, `hub has the ${e.id} event`);
    assert.equal(hubEvent.rewards.championTitle, e.rewards.champion);
    assert.equal(hubEvent.rewards.podiumTitle, e.rewards.podium);
    assert.equal(hubEvent.rewards.podiumEntitlement, e.rewards.entitlement);
    assert.ok(titleIds.has(e.rewards.champion), "champion title exists");
    if (e.rewards.podium) assert.ok(titleIds.has(e.rewards.podium));
    if (e.week === 2) {
      assert.equal(level.enabled, false);
      assert.equal(hubEvent.enabled, false);
      for (const p of e.rewards.placements) {
        assert.equal(hubEvent.rewards.placementTitles[p.rank], p.id);
        assert.equal(titles.titles.find(t => t.id === p.id).title, p.title);
      }
    }
  }
});

test('the layout: huge, closed, every piece in its place', () => {
  const { track } = layout;
  assert.ok(track.length > R.MIN_LENGTH, `lap ${track.length.toFixed(0)} cells`);
  assert.ok(track.length > 6 * 120, 'several times longer than a network circuit');
  assert.ok(track.width >= R.MIN_WIDTH && track.width <= R.MAX_WIDTH);
  assert.ok(track.bounds.maxX > 48 && track.bounds.maxY > 32, 'not held to the network grid');
  // The ship is its real body (physics 2): r is its bounding radius, span its wingspan.
  const r = PLAYER_HULL.radius, span = 2 * PLAYER_HULL.halfSpan;
  for (const s of layout.shards) assert.ok(isInsideTrack(track, s.x, s.y, r), `${s.id} is flyable`);
  for (const s of layout.stations) assert.ok(isInsideTrack(track, s.x, s.y, r), `${s.id} is flyable`);
  for (const m of layout.mines) {
    assert.ok(isInsideTrack(track, m.x, m.y), `${m.id} is on the lane`);
    for (const s of layout.shards) assert.ok(Math.hypot(m.x - s.x, m.y - s.y) > m.radius + r + R.SHARD_PICKUP, `${m.id} doesn't sit on ${s.id}`);
    // A wingspan-wide gap past every mine, on at least one side.
    const c = nearestTrackPoint(track, m.x, m.y);
    const room = track.width / 2 - c.distance - m.radius;
    assert.ok(room > span || track.width / 2 + c.distance - m.radius > span, `${m.id} leaves a gap`);
  }
  for (const t of layout.sentries) assert.ok(!isInsideTrack(track, t.x, t.y), `${t.id} sits beyond the outside rail`);
  for (const b of layout.bouncers) {
    for (const time of [0, 0.37, 1.1, 2.9, 7.3]) {
      const p = bouncerPosition(b, time);
      assert.ok(isInsideTrack(track, p.x, p.y, b.radius - 0.1), `${b.id} stays between the rails`);
    }
  }
  // No infield shortcut: distant parts of the lane never touch.
  for (let a = 0; a < track.length; a += 1.5)
    for (let b = a + R.LANE_GAP; b < track.length; b += 1.5) {
      if (track.length - (b - a) < R.LANE_GAP) continue;
      const p = pointOnTrack(track, a), q = pointOnTrack(track, b);
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > track.width, `lanes merge near ${a.toFixed(0)} / ${b.toFixed(0)}`);
    }
});

test('the scripted pilot finishes a clean lap with every shard, hull and fuel intact', () => {
  assert.equal(lap.physics, WEEKLY_PHYSICS.HULL, 'the pilot flies the current physics: the real body');
  assert.ok(lap.finished, `finished (dead: ${lap.dead})`);
  assert.equal(lap.scene.shards.size, layout.shards.length);
  assert.ok(lap.time < R.PILOT_SECONDS * 1000);
  assert.ok(lap.time > 45000, 'no lap is anywhere near the hub floor of 45 s by accident');
  assert.ok(lap.scene.fuel > 20 && lap.scene.player.hp > 0);
  assert.equal(lap.scene.trackProgress.passed, layout.track.checkpoints.length);
  assert.ok(!lap.events.wall, 'no rail hit on the whole lap');
});

test('a recorded lap replays to the exact same finish, through the text log', () => {
  const log = encodeInputLog({ eventId: event.id, version: event.version, frames: lap.frames, finishMs: lap.time });
  assert.ok(log.length < 256 * 1024, `log ${log.length} bytes fits the hub's 256 KB`);
  assert.equal(LOG_PREFIX, 'SDW2');
  assert.match(log, /^SDW2|weekly-01|/, 'new recordings are SDW2: the hull physics');
  const decoded = decodeInputLog(log);
  assert.equal(decoded.physics, WEEKLY_PHYSICS.HULL);
  assert.equal(decoded.frames.length, lap.frames.length);
  assert.deepEqual(decoded.frames.slice(0, 50), lap.frames.slice(0, 50));
  const replay = replayInputLog(layout, log);
  assert.equal(replay.physics, WEEKLY_PHYSICS.HULL);
  assert.ok(replay.finished && replay.matches);
  assert.equal(replay.finishMs, lap.time, 'bit-for-bit the same time');
  const pose = ghostPose(replay.poses, lap.time / 2);
  assert.ok(isInsideTrack(layout.track, pose.x, pose.y), 'the ghost flies the lane');
  // Changing one frame changes the outcome, so the log really drives the run.
  const tampered = lap.frames.map((f, i) => (i > 200 && i < 260 ? { ...f, turn: 100 } : f));
  const other = replayInputLog(layout, { frames: tampered, finishMs: Math.round(lap.time) });
  assert.ok(!other.matches);
});

test('an SDW1 log flown under the old circle rules still replays to its exact finish', () => {
  const old = flyWeeklyLap(layout, { physics: WEEKLY_PHYSICS.CIRCLE });
  assert.ok(old.finished, `physics 1 pilot finished (dead: ${old.dead})`);
  const log = encodeInputLog({ eventId: event.id, version: event.version, frames: old.frames, finishMs: old.time, physics: WEEKLY_PHYSICS.CIRCLE });
  assert.match(log, /^SDW1|weekly-01|/);
  const decoded = decodeInputLog(log);
  assert.equal(decoded.physics, WEEKLY_PHYSICS.CIRCLE);
  // The prefix alone picks the physics: the text log and its decoded frames.
  for (const input of [log, decoded]) {
    const replay = replayInputLog(layout, input);
    assert.equal(replay.physics, WEEKLY_PHYSICS.CIRCLE);
    assert.ok(replay.finished && replay.matches);
    assert.equal(replay.finishMs, old.time, 'bit-for-bit the same time');
  }
  assert.equal(encodeInputLog({ ...decoded, finishMs: old.time }), log, 'decode/encode round trip keeps SDW1');
  // The same inputs under the hull are a different run: physics really differ.
  const hull = replayInputLog(layout, { frames: old.frames, finishMs: Math.round(old.time) }, { physics: WEEKLY_PHYSICS.HULL });
  assert.equal(hull.physics, WEEKLY_PHYSICS.HULL);
  assert.notEqual(hull.finishMs, old.time);
});

// Recorded with the pre-hull code (the scripted pilot of that day, before this
// change): a real SDW1 run with rock hits, a rail hit and a sentry shot. It
// must replay exactly as it did then, pose for pose.
test('a run recorded before the hull (tests/fixtures SDW1 log) replays bit-for-bit', () => {
  const log = readFileSync(new URL('./fixtures/stardust-weekly-01.sdw1.log', import.meta.url), 'utf8').trim();
  assert.match(log, /^SDW1|weekly-01|1|12808|106731|/);
  const replay = replayInputLog(layout, log);
  assert.equal(replay.physics, WEEKLY_PHYSICS.CIRCLE);
  assert.ok(replay.finished && replay.matches);
  assert.equal(replay.finishMs, 106731.39117082204);
  assert.equal(replay.poses.length, 3203);
  assert.equal(createHash('sha256').update(JSON.stringify(replay.poses)).digest('hex'), '296ec4402fd271c860979b599d4445cd24e1fb12c4dc8967ccd9e4b0dec069a5', 'every ghost pose unchanged');
  assert.equal(replayInputLog(layout, decodeInputLog(log)).finishMs, 106731.39117082204);
});

test('the hull physics: wing tips collect shards, and the body (not a circle) meets mines and rails', () => {
  const s = layout.shards[1];
  // A shard just off the right wing tip, beyond the old 0.7 centre pickup, is
  // collected. Facing +x (angle 0) the right wing points +y and the tip vertex
  // [tx, ty] (ship-local) sits at (x + ty, y + tx) in the world.
  const [tx, ty] = PLAYER_HULL.points.reduce((a, b) => (b[0] > a[0] ? b : a));
  const reach = tx + R.SHARD_TOUCH - 0.02;
  const scene = launched();
  Object.assign(scene.player, { x: s.x - ty, y: s.y - reach, vx: 0, vy: 0, angle: 0 });
  assert.ok(Math.hypot(scene.player.x - s.x, scene.player.y - s.y) > R.SHARD_PICKUP, 'beyond the old pickup');
  assert.ok(shipTouchesCircle(scene.player, s.x, s.y, R.SHARD_TOUCH));
  const events = stepWeekly(scene, idle);
  assert.ok(events.some((e) => e.type === 'shard' && e.id === s.id), 'the wing tip collected it');
  // Under physics 1 the same spot is out of reach.
  const old = createWeeklyScene(layout, { physics: WEEKLY_PHYSICS.CIRCLE });
  stepWeekly(old, launch);
  Object.assign(old.player, { x: s.x - ty, y: s.y - reach, vx: 0, vy: 0, angle: 0 });
  assert.ok(!stepWeekly(old, idle).some((e) => e.type === 'shard'));
  // A mine that the old circle missed but the nose touches ends the run.
  const m = layout.mines[0];
  const nose = launched();
  Object.assign(nose.player, { x: m.x - m.radius - PLAYER_HULL.nose + 0.03, y: m.y, vx: 0, vy: 0, angle: 0 });
  assert.ok(Math.hypot(nose.player.x - m.x, nose.player.y - m.y) > m.radius + WEEKLY_CONFIG.PLAYER_RADIUS, 'clear of the old circle');
  assert.ok(stepWeekly(nose, idle).some((e) => e.type === 'dead' && e.cause === 'mine'));
  // Parked beside a rail, the whole body stays on the lane.
  const rail = launched();
  const at = pointOnTrack(layout.track, 60, layout.track.width / 2 - 0.3);
  Object.assign(rail.player, { x: at.x, y: at.y, vx: -at.ty * 3, vy: at.tx * 3, angle: Math.atan2(at.ty, at.tx) + 0.8 });
  for (let i = 0; i < 20; i++) stepWeekly(rail, idle);
  assert.ok(isHullInsideTrack(layout.track, rail.player.x, rail.player.y, rail.player.angle, PLAYER_HULL, 1e-6), 'no part of the ship crosses the rail');
});

test('malformed logs are refused', () => {
  // SDW2 is a real prefix now (the hull physics); an unknown one is refused.
  for (const bad of [null, '', 'SDW3|x|1|0|0|', 'SDW0|x|1|0|0|', 'SDW1|weekly-01|1|5|0|1,0,0,0,0,0', 'SDW2|weekly-01|1|5|0|1,0,0,0,0,0', 'SDW1|weekly-01|1|1|0|1,zz,0', 'x'.repeat(300000)])
    assert.equal(decodeInputLog(bad), null);
});

test('inputs are quantised the same way live and in replays', () => {
  const f = frameFromKeys({ turnStrength: 0.333, thrustStrength: 0.77, backStrength: 0, strafeStrength: 1, left: true, boost: true, launch: true });
  assert.deepEqual(f, { turn: 34, thrust: 75, back: 0, strafe: 100, bits: BIT.LEFT | BIT.BOOST | BIT.LAUNCH });
  assert.deepEqual(quantizeFrame(f), f);
  assert.equal(keysFromFrame(f).turnStrength, 0.34);
});

test('nothing moves and the clock does not run until launch', () => {
  const scene = createWeeklyScene(layout);
  for (let i = 0; i < 300; i++) stepWeekly(scene, idle);
  assert.equal(scene.step, 0);
  assert.ok(scene.lockedInStart);
  const events = stepWeekly(scene, { ...idle, thrust: 100 });
  assert.equal(events[0].type, 'launch');
  assert.equal(scene.step, 1);
});

test('a rail hit halves the speed and takes the controls away for half a second', () => {
  const scene = launched();
  const p = scene.player;
  const at = pointOnTrack(layout.track, 60, 2.6);
  Object.assign(p, { x: at.x, y: at.y, vx: at.tx * 8 - at.ty * 5, vy: at.ty * 8 + at.tx * 5 });
  const before = Math.hypot(p.vx, p.vy);
  let hit = null;
  for (let i = 0; i < 30 && !hit; i++) hit = stepWeekly(scene, idle).find((e) => e.type === 'wall');
  assert.ok(hit, 'the rail was hit');
  assert.ok(Math.hypot(p.vx, p.vy) < before * 0.55, 'speed halved');
  assert.ok(p.stunTimer > R.WALL_STUN - 0.02);
  // Full right turn while stunned: the nose doesn't move.
  const angle = p.angle;
  for (let i = 0; i < 50; i++) stepWeekly(scene, { ...idle, turn: 100 });
  assert.equal(p.angle, angle, 'no steering during the stun');
  for (let i = 0; i < 30; i++) stepWeekly(scene, { ...idle, turn: 100 });
  assert.notEqual(p.angle, angle, 'control comes back after 0.5 s');
});

test('touching a mine ends the attempt at once', () => {
  const scene = launched();
  const m = layout.mines[0];
  Object.assign(scene.player, { x: m.x - 1, y: m.y, vx: 6, vy: 0 });
  let dead = null;
  for (let i = 0; i < 60 && !dead; i++) dead = stepWeekly(scene, idle).find((e) => e.type === 'dead');
  assert.equal(dead?.cause, 'mine');
  assert.equal(scene.dead, 'mine');
  assert.deepEqual(stepWeekly(scene, idle), [], 'a dead scene takes no more steps');
});

test('corner sentries fire at slow ships and leave fast ones alone', () => {
  const s = layout.sentries[0];
  const corner = layout.track.points[s.point];
  const slow = launched();
  let fired = false;
  for (let i = 0; i < 240; i++) {
    Object.assign(slow.player, { x: corner.x - 3, y: corner.y + 0.4, vx: 1, vy: 0 });
    if (stepWeekly(slow, idle).some((e) => e.type === 'sentry-fire')) fired = true;
  }
  assert.ok(fired, 'a slow ship draws fire');
  const fast = launched();
  let locked = false;
  for (let i = 0; i < 240; i++) {
    Object.assign(fast.player, { x: corner.x - 3, y: corner.y + 0.4, vx: R.SENTRY_MIN_SPEED + 3, vy: 0 });
    if (stepWeekly(fast, idle).some((e) => e.type === 'sentry-lock')) locked = true;
  }
  assert.ok(!locked, 'a fast ship is never targeted');
});

test('the finish line counts only after a full lap with every shard, across its full width', () => {
  const scene = launched();
  const g = layout.track.portal;
  const ready = () => {
    Object.assign(scene.trackProgress, { lapStarted: true, nextCheckpoint: layout.track.checkpoints.length, passed: layout.track.checkpoints.length, distance: layout.track.length });
    Object.assign(scene.player, { x: g.x - g.tx * 0.5 + g.nx * (layout.track.width / 2 - 0.3), y: g.y - g.ty * 0.5 + g.ny * (layout.track.width / 2 - 0.3), vx: g.tx * 6, vy: g.ty * 6 });
  };
  ready();
  let events = [];
  for (let i = 0; i < 30; i++) events.push(...stepWeekly(scene, idle));
  assert.ok(events.some((e) => e.type === 'missing-shards'));
  assert.ok(!scene.finished, 'no finish without the shards');
  for (const s of layout.shards) scene.shards.add(s.id);
  ready();
  events = [];
  for (let i = 0; i < 30 && !scene.finished; i++) events.push(...stepWeekly(scene, idle));
  assert.ok(scene.finished, 'crossing near the rail still finishes');
  assert.ok(scene.finishMs > 0 && scene.finishMs < scene.step * 1000 / 120 + 1e-9);
});

test('checkpoints span the whole corner: an apex cut still counts', () => {
  const { track } = layout;
  const c = track.checkpoints[0];
  const inside = c.insideSide;
  // Cross the corner's line on the inside, beyond width/2 but inside the lane.
  const off = track.width / 2 + (c.insideReach - track.width / 2) / 2;
  const nx = -c.ty * inside, ny = c.tx * inside;
  const scene = { track, launched: true, trackProgress: createTrackProgress(), player: { x: c.x + nx * off + c.tx * 0.1, y: c.y + ny * off + c.ty * 0.1 } };
  scene.trackProgress.lapStarted = true;
  const previous = { x: c.x + nx * off - c.tx * 0.1, y: c.y + ny * off - c.ty * 0.1 };
  assert.ok(isInsideTrack(track, previous.x, previous.y) && isInsideTrack(track, scene.player.x, scene.player.y), 'the cut is on the lane');
  updateTrackProgress(scene, previous);
  assert.equal(scene.trackProgress.passed, 1);
});

test('release window: upcoming, live, closed; links and the public layout picture', () => {
  assert.equal(weeklyStatus(event, Date.parse('2026-09-29T18:59:59-07:00')).state, 'upcoming');
  assert.equal(weeklyStatus(event, Date.parse('2026-09-29T19:00:00-07:00')).state, 'live');
  assert.equal(weeklyStatus(event, Date.parse('2026-09-30T19:00:00-07:00')).countdown.label, '6d 00:00:00');
  assert.equal(weeklyStatus(event, Date.parse('2026-10-06T19:00:00-07:00')).state, 'closed');
  assert.equal(parseWeeklyQuery('?weekly=weekly-01').event, event);
  assert.equal(parseWeeklyQuery('?weekly=../../x').event, null);
  assert.equal(parseWeeklyQuery('?preview=weekly').preview, true);
  // Old custom-track links land on the weekly card, which took over that slot.
  assert.equal(parseWeeklyQuery('?track=custom').event, currentWeekly());
  assert.equal(parseWeeklyQuery('?track=custom').focus, true);
  assert.equal(weeklyGameUrl(event), 'games/stardust/?weekly=weekly-01');
  const svg = weeklyPreviewSvg(event);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<text[^>]*font-weight="700" fill="#[0-9a-f]{6}"[^>]*>\d+<\/text>/g) || []).length, layout.shards.length, 'every shard is numbered');
  assert.ok(!svg.includes('#ff5a4e'), 'the public picture hides the mines');
  assert.ok(weeklyPreviewSvg(event, { obstacles: true }).includes('#ff5a4e'));
});
