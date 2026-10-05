import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sketchToWeekly, weeklyPreviewSvg } from '../projects/Space-Shooter/studio/sketchToWeekly.js';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { createWeeklyLayout, WEEKLY_RULES as R } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { flyWeeklyLap } from '../projects/Space-Shooter/engine/weekly/pilot.js';
import { pointOnTrack, isInsideTrack } from '../projects/Space-Shooter/engine/track.js';

function oval({ size = 0.4, jitter = 0, count = 240 } = {}) {
  return { version: 1, aspect: 1, points: Array.from({ length: count }, (_, i) => {
    const a = 2 * Math.PI * i / count;
    const noise = jitter * (Math.sin(i * 12.9898) + Math.cos(i * 4.1414)) / 2;
    return [0.5 + (size + noise) * Math.cos(a), 0.5 + (size * 0.8 + noise) * Math.sin(a)];
  }) };
}

function trace(vertices, samples = 20) {
  return vertices.flatMap((p, i) => {
    const q = vertices[(i + 1) % vertices.length];
    return Array.from({ length: samples }, (_, k) => p.map((v, axis) => v + (q[axis] - v) * k / samples));
  });
}

function assertPlayable(result) {
  const { event, report } = result;
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.pilot.finished, true);
  assert.ok(report.pilot.ms > 0 && report.pilot.ms < R.PILOT_SECONDS * 1000);
  assert.ok(report.estimatedHumanMs > 0 && report.estimatedHumanMs < report.pilot.ms);
  assert.ok(event.track.points.length >= 12 && event.track.points.length <= 30);
  assert.ok(report.shards >= 8 && report.shards <= 10);
  assert.equal(report.mines, event.track.mines.length);
  assert.equal(report.bouncers, event.track.bouncers.length);
  assert.deepEqual(event.rewards, {});
  assert.equal(event.commentsPage, null);
  const layout = createWeeklyLayout(event);
  for (const shard of layout.shards) assert.ok(isInsideTrack(layout.track, shard.x, shard.y, 0.54));
  for (const list of [event.track.shards, event.track.mines, event.track.bouncers, event.track.stations])
    for (const p of list) {
      assert.ok(Number.isInteger(p.seg) && p.seg >= 0 && p.seg < event.track.points.length);
      assert.ok(p.t >= 0 && p.t <= 1);
    }
  // Same nonlocal-lane rule as weekly.js, independently sampled along distance.
  for (let a = 0; a < layout.track.length; a += 3)
    for (let b = a + R.LANE_GAP; b < layout.track.length; b += 3) {
      if (layout.track.length - b + a < R.LANE_GAP) continue;
      const p = pointOnTrack(layout.track, a), q = pointOnTrack(layout.track, b);
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > layout.track.width, 'distant lanes stay separate');
    }
}

const baseline = JSON.stringify(WEEKLY_EVENTS);
const noisy = oval({ jitter: 0.0035, count: 700 });

test('oval becomes a playable weekly event, with the Gantry Drop lap length', () => {
  const result = sketchToWeekly(oval());
  assertPlayable(result);
  const base = createWeeklyLayout(WEEKLY_EVENTS[0]);
  assert.ok(Math.abs(result.report.lengthCells - base.track.length) < 0.01);
  assert.ok(result.report.mines > 0 && result.report.bouncers > 0);
  const lap = flyWeeklyLap(createWeeklyLayout(result.event));
  assert.ok(lap.finished);
  assert.equal(lap.time, result.report.pilot.ms, 'the final returned event, with default pilot settings, really finishes');
  assert.equal(lap.scene.shards.size, result.report.shards);
});

test('jittered hand drawing is cleaned, deterministic, and leaves inputs untouched', () => {
  const input = JSON.stringify(noisy);
  const first = sketchToWeekly(noisy, { title: 'Noisy Loop' });
  assertPlayable(first);
  assert.deepEqual(sketchToWeekly(noisy, { title: 'Noisy Loop' }), first);
  assert.equal(JSON.stringify(noisy), input);
  assert.ok(first.event.track.points.length < noisy.points.length / 10);
  console.log('Noisy loop report:', JSON.stringify(first.report));
});

test('a marked hairpin keeps its apex and is flyable', () => {
  const vertices = [[0.15, 0.15], [0.85, 0.15], [0.85, 0.4], [0.55, 0.4], [0.55, 0.82], [0.5, 0.9], [0.45, 0.82], [0.45, 0.4], [0.15, 0.4]];
  const sketch = { version: 1, aspect: 1, points: trace(vertices), marks: [{ at: 100, kind: 'tight' }, { at: 80, kind: 'landmark', note: 'Needle Turn' }] };
  const result = sketchToWeekly(sketch);
  assertPlayable(result);
  assert.equal(result.event.track.landmark, 'Needle Turn');
  const p = result.event.track.points;
  const apex = p.reduce((a, b) => b[1] > a[1] ? b : a);
  const factor = (apex[1] - p[0][1]) / (0.9 - 0.15);
  assert.ok(Math.abs(apex[0] - (p[0][0] + (0.5 - 0.15) * factor)) < 1e-8, 'the pinned apex survives simplification');
  assert.ok(result.report.fixes.some((s) => /finish line/.test(s)), 'a corner start receives a logged finish approach repair');
  assert.ok(flyWeeklyLap(createWeeklyLayout(result.event)).finished);
  const override = sketchToWeekly(sketch, { landmark: 'Owner Landmark' });
  assert.equal(override.event.track.landmark, 'Owner Landmark');
});

test('self-crossing figure eight is rejected with a usable preview and clear reason', () => {
  const sketch = { version: 1, aspect: 1, points: Array.from({ length: 300 }, (_, i) => {
    const a = 2 * Math.PI * i / 300; return [0.5 + 0.4 * Math.sin(a), 0.5 + 0.35 * Math.sin(2 * a)];
  }) };
  const result = sketchToWeekly(sketch);
  assert.equal(result.report.ok, false);
  assert.equal(result.report.pilot.finished, false);
  assert.equal(result.report.pilot.ms, null);
  assert.match(result.report.problems.join(' '), /self-intersects|overlap/);
  assert.match(weeklyPreviewSvg(result.event), /^<svg /);
});

test('noncrossing lanes closer than their width are rejected', () => {
  const result = sketchToWeekly({ version: 1, aspect: 1, points: trace([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.51, 0.9], [0.51, 0.4], [0.5, 0.4], [0.5, 0.9], [0.1, 0.9]]) });
  assert.equal(result.report.ok, false);
  assert.match(result.report.problems.join(' '), /overlap/);
});

test('very small and full-canvas drawings have comparable proportions and length', () => {
  const small = sketchToWeekly(oval({ size: 0.0004 }));
  const large = sketchToWeekly(oval({ size: 0.49 }));
  assertPlayable(small); assertPlayable(large);
  assert.ok(Math.abs(small.report.lengthCells - large.report.lengthCells) < 0.01);
  const bounds = (r) => {
    const p = r.event.track.points;
    return (Math.max(...p.map(p => p[0])) - Math.min(...p.map(p => p[0]))) / (Math.max(...p.map(p => p[1])) - Math.min(...p.map(p => p[1])));
  };
  assert.ok(Math.abs(bounds(small) - bounds(large)) < 1e-8);
});

test('aspect, start index, closure duplicates and reversed drawing direction are respected', () => {
  const sketch = oval();
  sketch.start = 60; sketch.aspect = 2;
  sketch.points.push([...sketch.points[0]]);
  const result = sketchToWeekly(sketch);
  assertPlayable(result);
  const p = result.event.track.points;
  assert.ok(p[0][1] > p[1][1] && p[0][0] > p[1][0], 'start at bottom, then race towards left');
  const reversed = sketchToWeekly({ ...oval(), points: oval().points.reverse() });
  assertPlayable(reversed);
  const area = (points) => points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - p[1] * q[0]; }, 0);
  assert.ok(area(p) * area(reversed.event.track.points) < 0);
  const xs = p.map(p => p[0]), ys = p.map(p => p[1]);
  assert.ok((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)) > 2.4);
});

test('difficulty scales hazard density; calm, fast and hazard marks influence it', () => {
  const input = oval();
  const easy = sketchToWeekly({ ...input, difficulty: 'easy' });
  const normal = sketchToWeekly(input);
  const hard = sketchToWeekly({ ...input, difficulty: 'hard' });
  for (const r of [easy, normal, hard]) assertPlayable(r);
  assert.ok(easy.report.mines < normal.report.mines && normal.report.mines < hard.report.mines);
  assert.ok(easy.report.bouncers <= normal.report.bouncers && normal.report.bouncers <= hard.report.bouncers);
  const marked = (kind) => sketchToWeekly({ ...input, marks: [{ at: 75, kind }] });
  const calm = marked('calm'), hazard = marked('hazard'), fast = marked('fast');
  for (const r of [calm, hazard, fast]) assertPlayable(r);
  assert.ok(calm.report.mines < normal.report.mines);
  assert.ok(hazard.report.mines > normal.report.mines && fast.report.mines > normal.report.mines);
});

test('scale changes lap size; extreme scales return a bounded rejection', () => {
  const scaled = sketchToWeekly({ ...oval(), scale: 1.5 });
  assertPlayable(scaled);
  const base = createWeeklyLayout(WEEKLY_EVENTS[0]).track.length;
  assert.ok(Math.abs(scaled.report.lengthCells - base * 1.5) < 0.01);
  for (const scale of [0.1, 1000]) {
    const r = sketchToWeekly({ ...oval(), scale });
    assert.equal(r.report.ok, false);
    assert.ok(r.report.problems.length);
  }
});

test('SVG escapes owner text and shows lane, start, arrows and obstacles', () => {
  const { event } = sketchToWeekly(oval(), { title: '<script>" &', landmark: '<img onload="bad">' });
  const svg = weeklyPreviewSvg(event, { width: 720 });
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="720"/);
  assert.ok(svg.includes('&lt;script&gt;&quot; &amp;') && svg.includes('&lt;img onload=&quot;bad&quot;&gt;'));
  assert.ok(!svg.includes('<script>') && !svg.includes('<img'));
  assert.ok(svg.includes('#ff5a4e') && svg.includes('#9aabb7') && svg.includes('#8de5dc'));
  assert.ok(!/NaN|Infinity|undefined/.test(svg));
  for (const width of ['600', NaN, 0, -1, Infinity]) assert.throws(() => weeklyPreviewSvg(event, { width }), TypeError);
});

test('invalid sketches and options throw input errors', () => {
  for (const patch of [{ version: 2 }, { points: [] }, { points: [[NaN, 0], [0, 0], [1, 1], [1, 0]] }, { aspect: 0 }, { start: -1 }, { start: 240 }, { scale: 0 }, { difficulty: 'insane' }, { marks: [{ at: 9000, kind: 'tight' }] }, { marks: [{ at: 3, kind: 'bogus' }] }, { points: Array(50).fill([0.5, 0.5]) }])
    assert.throws(() => sketchToWeekly({ ...oval(), ...patch }), TypeError);
  for (const options of [{ version: 0 }, { title: '' }, { landmark: 5 }, { id: null }]) assert.throws(() => sketchToWeekly(oval(), options), TypeError);
  assert.throws(() => sketchToWeekly(oval({ count: 2001 })), TypeError);
});

test('phone stroke sample-count boundaries remain flyable', () => {
  for (const count of [50, 2000]) assertPlayable(sketchToWeekly(oval({ count })));
});

test('CLI reads stdin and a file, carries options, exits zero for rejected geometry', () => {
  const cli = new URL('../scripts/stardust/sketch-to-weekly.mjs', import.meta.url);
  const run = (args, input) => spawnSync(process.execPath, [fileURLToPath(cli), ...args], { input: JSON.stringify(input), encoding: 'utf8' });
  const result = run(['--title', 'CLI Loop', '--landmark', 'Dock', '--id', 'draft-test', '--version', '3'], oval());
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assertPlayable(parsed);
  assert.equal(parsed.event.title, 'CLI Loop');
  assert.equal(parsed.event.track.landmark, 'Dock');
  assert.equal(parsed.event.id, 'draft-test'); assert.equal(parsed.event.version, 3);
  assert.match(parsed.svg, /^<svg /);
  const dir = mkdtempSync(new URL('./.studio-cli-', import.meta.url));
  try {
    const path = join(dir, 'sketch.json');
    writeFileSync(path, JSON.stringify({ ...oval(), scale: 0.1 }));
    const rejected = run([path], null);
    assert.equal(rejected.status, 0, rejected.stderr);
    assert.equal(JSON.parse(rejected.stdout).report.ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  for (const args of [['--version', 'nope'], ['--title'], ['--bogus']]) assert.equal(run(args, oval()).status, 2);
  const bad = run([], { version: 1, points: [] });
  assert.equal(bad.status, 2); assert.equal(bad.stdout, '');
});

test('conversion does not change the live weekly event data', () => {
  assert.equal(JSON.stringify(WEEKLY_EVENTS), baseline);
});
