import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotBuffer, blendSnapshots, INTERPOLATION_DELAY_MS } from '../projects/Space-Shooter/dogfight/interpolation.js';

// A ship at a steady 0.01 units per ms (about Dogfight cruise speed, under the
// respawn-snap distance), published every 50 ms like the host.
const V = 0.01;
const state = (tick, x, extra = {}) => ({
  tick,
  phase: 'playing',
  ships: [{ id: 0, x, y: 0, angle: 0, hp: 100, ...extra }],
  traps: [],
  bullets: [{ id: 7, x: x + 10, y: 0 }],
});

function drawnPositions(arrivals, frames) {
  const buffer = createSnapshotBuffer();
  const out = [];
  let next = 0;
  for (const now of frames) {
    while (next < arrivals.length && arrivals[next].at <= now) {
      buffer.push(arrivals[next].state, arrivals[next].at);
      next += 1;
    }
    const pair = buffer.sample(now);
    if (pair) out.push({ now, x: blendSnapshots(pair, buffer.newest).ships[0].x });
  }
  return out;
}

const steady = Array.from({ length: 12 }, (_, i) => ({ at: i * 50, state: state(i * 3, i * 50 * V) }));
const frames = Array.from({ length: 101 }, (_, i) => i * 5);

test('steady snapshots draw steady motion: no freezes and no jumps', () => {
  const drawn = drawnPositions(steady, frames).filter((p) => p.now >= 150 && p.now <= 500);
  for (let i = 1; i < drawn.length; i += 1) {
    const step = drawn[i].x - drawn[i - 1].x;
    assert.ok(Math.abs(step - 5 * V) < 1e-9, `at ${drawn[i].now} ms the ship moved ${step} instead of ${5 * V}`);
  }
});

test('the drawn moment is the fixed delay behind now', () => {
  const drawn = drawnPositions(steady, frames).find((p) => p.now === 300);
  assert.ok(Math.abs(drawn.x - (300 - INTERPOLATION_DELAY_MS) * V) < 1e-9, String(drawn.x));
});

test('jittery arrival never draws the ship going backwards', () => {
  const jitter = [0, 18, -12, 25, -20, 5, 30, -8, 12, 0, 22, -15];
  const arrivals = steady.map((a, i) => ({ ...a, at: Math.max(0, a.at + jitter[i]) }));
  const drawn = drawnPositions(arrivals, frames);
  for (let i = 1; i < drawn.length; i += 1) assert.ok(drawn[i].x >= drawn[i - 1].x, `went backwards at ${drawn[i].now} ms`);
});

test('when snapshots stop the newest position is held, not extrapolated', () => {
  const drawn = drawnPositions(steady.slice(0, 4), frames);
  assert.ok(Math.abs(drawn.at(-1).x - 150 * V) < 1e-9);
});

test('old or repeated ticks are ignored', () => {
  const buffer = createSnapshotBuffer();
  assert.equal(buffer.push(state(6, 100), 100), true);
  assert.equal(buffer.push(state(6, 999), 120), false);
  assert.equal(buffer.push(state(3, 999), 130), false);
  assert.equal(buffer.newest.ships[0].x, 100);
  buffer.clear();
  assert.equal(buffer.sample(200), null);
});

test('hull and clock come from the newest snapshot; a respawn snaps instead of sliding', () => {
  const from = state(0, 0);
  const to = state(3, 2);
  const newest = state(6, 4, { hp: 40 });
  const mid = blendSnapshots({ from, to, t: 0.5 }, newest);
  assert.equal(mid.ships[0].x, 1);
  assert.equal(mid.ships[0].hp, 40);
  assert.equal(mid.bullets[0].x, 11);
  const respawn = blendSnapshots({ from, to: state(3, 500), t: 0.5 }, newest);
  assert.equal(respawn.ships[0].x, 500);
});
