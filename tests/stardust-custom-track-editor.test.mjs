// The track editor's edits (editor/editorModel.js): apexes and rocks keep
// pointing at the same corners and stretches as points come and go.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankTrack, snap, clampPoint, insertPoint, removePoint, movePoint, toggleApex, toggleRock, hitPoint, hitSegment, parseTrackText,
} from '../projects/Space-Shooter/editor/editorModel.js';
import { pickTrackFields } from '../projects/Space-Shooter/systems/customTrack.js';
import { CUSTOM_TRACK } from '../projects/Space-Shooter/tracks/custom-track.js';
import { checkTrack } from '../projects/Space-Shooter/engine/trackChecks.js';

const square = () => ({ ...blankTrack(), points: [[10, 10], [20, 10], [20, 20], [10, 20]], apexes: [1, 2, 3], rocks: [0, 2] });

test('snapping and clamping keep points on the 48 x 32 grid', () => {
  assert.equal(snap(12.26), 12.5);
  assert.equal(snap(12.24), 12);
  assert.equal(snap(12.345, 0), 12.35);
  assert.deepEqual(clampPoint(-3, 40), [0, 32]);
  assert.deepEqual(clampPoint(50, 5), [48, 5]);
});

test('inserting a point shifts later apexes and rocks; the split segment keeps its rock on the first half', () => {
  const t = insertPoint(square(), 2, [22, 15]);
  assert.deepEqual(t.points, [[10, 10], [20, 10], [22, 15], [20, 20], [10, 20]]);
  assert.deepEqual(t.apexes, [1, 3, 4]);
  assert.deepEqual(t.rocks, [0, 3]);
  // Appending at the end changes no indices.
  const end = insertPoint(square(), 4, [5, 15]);
  assert.deepEqual(end.apexes, [1, 2, 3]);
  assert.deepEqual(end.rocks, [0, 2]);
  // The original is untouched.
  assert.deepEqual(square().points.length, 4);
});

test('removing a point drops its apex and the rock leaving it, and renumbers the rest', () => {
  const t = removePoint(square(), 2);
  assert.deepEqual(t.points, [[10, 10], [20, 10], [10, 20]]);
  assert.deepEqual(t.apexes, [1, 2]);
  assert.deepEqual(t.rocks, [0]);
  const last = removePoint(square(), 3);
  assert.deepEqual(last.rocks, [0, 2]);
  assert.equal(removePoint(square(), 9).points.length, 4);
});

test('apexes toggle on any point but the start; rocks toggle per segment; moving rocks follow', () => {
  let t = toggleApex(square(), 0);
  assert.deepEqual(t.apexes, [1, 2, 3]);
  t = toggleApex(t, 2);
  assert.deepEqual(t.apexes, [1, 3]);
  t = toggleApex(t, 2);
  assert.deepEqual(t.apexes, [1, 2, 3]);
  t = toggleRock({ ...square(), moving: [2] }, 2);
  assert.deepEqual(t.rocks, [0]);
  assert.equal('moving' in t, false);
  t = toggleRock(t, 3);
  assert.deepEqual(t.rocks, [0, 3]);
  assert.deepEqual(movePoint(square(), 1, [60, -1]).points[1], [48, 0]);
});

test('hit tests find the nearest point and the segment under the pointer', () => {
  assert.equal(hitPoint(square(), 20.4, 10.3), 1);
  assert.equal(hitPoint(square(), 15, 15), -1);
  assert.equal(hitSegment(square(), 15, 10.5), 0);
  assert.equal(hitSegment(square(), 10.5, 15), 3);
  assert.equal(hitSegment(square(), 15, 15, 1), -1);
});

test('paste import reads JSON and the shipped JS file without evaluating anything', () => {
  const json = JSON.stringify(CUSTOM_TRACK);
  assert.deepEqual(parseTrackText(json).track, pickTrackFields(CUSTOM_TRACK));
  const js = "export const CUSTOM_TRACK = {\n  // comment, with: a colon\n  title: 'A: \\'quoted\\' track', /* block */ width: 6.4,\n  points: [[12, 25], [26, 25],],\n  apexes: [1], rocks: [],\n};";
  const t = parseTrackText(js).track;
  assert.equal(t.title, "A: 'quoted' track");
  assert.deepEqual(t.points, [[12, 25], [26, 25]]);
  assert.match(parseTrackText('alert(1)').error, /isn’t a track/);
  assert.match(parseTrackText('{ title: alert(1) }').error, /isn’t a track/);
});

test('a track drawn from a blank grid in the editor passes the shared checks and the pilot', () => {
  let t = blankTrack('2026-09-29T19:00:00-07:00');
  for (const p of [[12, 25], [36, 25], [42, 20], [42, 11], [36, 6], [12, 6], [6, 11], [6, 20]]) t = insertPoint(t, t.points.length, p);
  for (const i of [2, 4, 6]) t = toggleApex(t, i);
  for (const s of [1, 5]) t = toggleRock(t, s);
  const result = checkTrack(t, { pilot: true });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
});
