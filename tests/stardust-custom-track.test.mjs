// The custom track (projects/Space-Shooter/tracks/custom-track.js) must pass
// exactly the rules the five network circuits pass (engine/trackChecks.js,
// shared with tests/stardust-track.test.mjs and the editor), and the scripted
// careful pilot must finish a lap on it, under today's rules and every lab rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_TRACK } from '../projects/Space-Shooter/tracks/custom-track.js';
import { createCustomLayout, createLevelLayout, CUSTOM_LEVEL, LEVELS } from '../projects/Space-Shooter/engine/levels.js';
import { checkTrack, checkTrackLayout, checkTrackSource, flyCarefulLap, pilotProblems, TRACK_RULES } from '../projects/Space-Shooter/engine/trackChecks.js';
import { hasRequiredShards } from '../projects/Space-Shooter/engine/rules.js';
import { releaseCountdown, customMusic, MUSIC_CUES, pickTrackFields, trackModuleText, CUSTOM_BOARD } from '../projects/Space-Shooter/systems/customTrack.js';
import { parseLab, labConfig } from '../projects/Space-Shooter/systems/lab.js';
import { config } from '../projects/Space-Shooter/state.js';
import { parseTrackText } from '../projects/Space-Shooter/editor/editorModel.js';

test('the custom track file has the metadata the game, site and hub rely on', () => {
  assert.equal(CUSTOM_TRACK.id, CUSTOM_BOARD);
  assert.equal(CUSTOM_TRACK.id, 'custom-track');
  assert.ok(Number.isInteger(CUSTOM_TRACK.version) && CUSTOM_TRACK.version >= 1, 'board version');
  assert.match(CUSTOM_TRACK.releaseAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/, 'releaseAt needs a date, time and UTC offset');
  assert.equal(releaseCountdown(CUSTOM_TRACK.releaseAt, 0).valid, true);
  assert.ok(MUSIC_CUES.includes(customMusic(CUSTOM_TRACK)));
  assert.ok(CUSTOM_TRACK.title.trim().length > 0);
  // It is a separate track, never one of the five network circuits.
  assert.ok(!LEVELS.includes(CUSTOM_TRACK));
  assert.ok(!LEVELS.some((level) => level.title === CUSTOM_TRACK.title));
});

test('the custom track passes the same corridor, bounds, obstacle and connectivity rules as the circuits', () => {
  assert.deepEqual(checkTrackSource(CUSTOM_TRACK), []);
  const layout = createCustomLayout(CUSTOM_TRACK);
  const { problems, warnings } = checkTrackLayout(layout, CUSTOM_TRACK);
  assert.deepEqual(problems, []);
  assert.deepEqual(warnings, [], 'every listed rock is placed');
  const track = layout.track;
  assert.ok(track.width >= TRACK_RULES.MIN_WIDTH);
  assert.ok(track.length > TRACK_RULES.MIN_LENGTH);
  // One portal: start and finish gate are the same spot.
  const start = layout.nodes.find((n) => n.kind === 'start'), gate = layout.nodes.find((n) => n.kind === 'gate');
  assert.deepEqual([start.x, start.y], [gate.x, gate.y]);
  const signals = layout.nodes.filter((n) => n.kind === 'planet');
  assert.ok(signals.length >= TRACK_RULES.MIN_APEXES && signals.length <= TRACK_RULES.MAX_APEXES);
  // Its own signal ids, so nothing can mistake them for network fragments (L1-S1 …).
  assert.deepEqual(signals.map((n) => n.id), signals.map((_, i) => `CT-S${i + 1}`));
  // Deterministic: every build of it is identical.
  assert.deepEqual(createCustomLayout(CUSTOM_TRACK), layout);
});

test('the scripted careful pilot finishes a lap of the custom track back through its portal', (t) => {
  const layout = createCustomLayout(CUSTOM_TRACK);
  const flown = flyCarefulLap(layout, { level: CUSTOM_LEVEL });
  assert.deepEqual(pilotProblems(flown), []);
  assert.ok(flown.finished, `lap incomplete after ${flown.time}s; checkpoint ${flown.scene.trackProgress.passed}`);
  assert.equal(flown.scene.trackProgress.passed, layout.track.checkpoints.length);
  assert.ok(hasRequiredShards(flown.scene));
  assert.ok(flown.scene.fuel > TRACK_RULES.PILOT_MIN_FUEL);
  assert.ok(flown.scene.player.hp > 0);
  assert.ok(flown.time < TRACK_RULES.PILOT_SECONDS);
  assert.equal(flown.leftLane, false);
  // The hub's floor for this board is 8 s; a careful lap is far slower.
  assert.ok(flown.time * 1000 > 8000);
  t.diagnostic(`${layout.track.name}${CUSTOM_TRACK.placeholder ? ' (placeholder)' : ''}: ${flown.time.toFixed(2)}s, fuel ${flown.scene.fuel.toFixed(1)}, hull ${flown.scene.player.hp.toFixed(1)}, lap ${layout.track.length.toFixed(1)} cells`);
});

test('checkTrack (as the game and editor call it) passes the custom track, pilot included', () => {
  const result = checkTrack(CUSTOM_TRACK, { pilot: true });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.ok(result.pilot.finished);
});

test('the playtest lab rules apply to the custom track too, and the careful line still finishes', (t) => {
  for (const query of ['?lab', '?lab=fuel:lean', '?lab=rails:impact', '?lab=boost:charge', '?lab=boost:heat']) {
    const saved = { ...config };
    Object.assign(config, labConfig(parseLab(query)));
    try {
      const flown = flyCarefulLap(createCustomLayout(CUSTOM_TRACK));
      assert.ok(flown.finished, `${query}: did not finish`);
      assert.ok(flown.scene.fuel > 0, `${query}: ran dry`);
      t.diagnostic(`${query}: ${flown.time.toFixed(2)}s, fuel ${flown.scene.fuel.toFixed(1)}`);
    } finally {
      for (const key of Object.keys(config)) if (!(key in saved)) delete config[key];
      Object.assign(config, saved);
    }
  }
});

test('the network circuits are untouched by the custom track layout path', () => {
  for (let level = 1; level <= 5; level++) {
    const layout = createLevelLayout(level);
    assert.ok(layout.nodes.filter((n) => n.kind === 'planet').every((n) => n.id.startsWith(`L${level}-S`)));
  }
});

// The checks have to catch the mistakes someone drawing a track will make, in plain words.
const base = () => pickTrackFields(CUSTOM_TRACK);
const codes = (track, options) => checkTrack(track, options).problems.map((p) => p.code);

test('the checks reject a narrow lane, a short lap and points near the map edge', () => {
  assert.ok(codes({ ...base(), width: 5 }).includes('narrow'));
  assert.ok(codes({ ...base(), width: 9 }).includes('wide'));
  const short = { ...base(), points: [[10, 10], [20, 10], [20, 20], [10, 20]], apexes: [1, 2, 3], rocks: [] };
  assert.ok(codes(short).includes('short'));
  const edge = base();
  edge.points = edge.points.map(([x, y], i) => (i === 4 ? [46, y] : [x, y]));
  const edgeResult = checkTrack(edge);
  assert.ok(edgeResult.problems.some((p) => p.code === 'bounds' && /Point 4 .*edge/.test(p.message)));
});

test('the checks reject merging lanes, bad apex counts and duplicate points', () => {
  // Pull the dip at point 7 down until the top lane nearly touches the bottom straight.
  const merged = base();
  merged.points = merged.points.map(([x, y], i) => (i === 7 ? [21, 20] : [x, y]));
  const result = checkTrack(merged);
  assert.ok(result.problems.some((p) => p.code === 'lanes-merge' && /cut across/.test(p.message)), JSON.stringify(result.problems));
  assert.ok(codes({ ...base(), apexes: [3, 5] }).includes('apex-count'));
  assert.ok(codes({ ...base(), apexes: [2, 3, 5, 7, 9, 10] }).includes('apex-count'));
  assert.ok(codes({ ...base(), apexes: [0, 3, 5] }).includes('apex-index'));
  assert.ok(codes({ ...base(), apexes: [3, 5, 99] }).includes('apex-index'));
  const dup = base();
  dup.points.splice(2, 0, [...dup.points[1]]);
  assert.ok(codes(dup).includes('duplicate-point'));
  assert.ok(codes({ ...base(), rocks: [40] }).includes('rock-index'));
  assert.ok(codes({ ...base(), points: [[1, 1], [2, 2]] }).includes('points'));
});

test('an obstacle on the racing line or on a signal is reported, not silently flown', () => {
  const layout = createCustomLayout(CUSTOM_TRACK);
  const [a, b] = layout.safeRoute;
  // A rock moved onto the line out of the portal.
  const onLine = { ...layout, hazards: layout.hazards.map((h, i) => (i ? h : { ...h, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) };
  const lineProblems = checkTrackLayout(onLine).problems;
  assert.ok(lineProblems.some((p) => p.code === 'rock-on-line' && /racing line/.test(p.message)), JSON.stringify(lineProblems));
  // A rock moved onto an apex signal.
  const signal = layout.nodes.find((n) => n.kind === 'planet');
  const onSignal = { ...layout, hazards: layout.hazards.map((h, i) => (i ? h : { ...h, x: signal.x + 0.5, y: signal.y + 0.5 })) };
  assert.ok(checkTrackLayout(onSignal).problems.some((p) => p.code === 'node-rock' && /apex signal at point/.test(p.message)));
  // A listed rock the layout leaves out (too close to a signal) is a warning in plain words.
  const dropped = checkTrackLayout({ ...layout, hazards: layout.hazards.slice(1) }, CUSTOM_TRACK).warnings;
  assert.ok(dropped.some((w) => w.code === 'rock-dropped' && /segment \d+ was left out/.test(w.message)));
});

test('an exported track reads back identically, and the shipped file parses in the editor', async () => {
  const text = trackModuleText(CUSTOM_TRACK);
  assert.match(text, /export const CUSTOM_TRACK = \{/);
  assert.deepEqual(parseTrackText(text).track, pickTrackFields(CUSTOM_TRACK));
  const { readFile } = await import('node:fs/promises');
  const file = await readFile(new URL('../projects/Space-Shooter/tracks/custom-track.js', import.meta.url), 'utf8');
  assert.deepEqual(parseTrackText(file).track, pickTrackFields(CUSTOM_TRACK));
  // Exported text is a module that loads and passes the checks.
  const mod = await import(`data:text/javascript,${encodeURIComponent(text)}`);
  assert.equal(checkTrack(mod.CUSTOM_TRACK, { pilot: true }).ok, true);
});
