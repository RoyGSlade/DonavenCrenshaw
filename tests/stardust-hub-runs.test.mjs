import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunRecorder, describeResult, LEVEL_BOARDS } from '../projects/Space-Shooter/systems/hubRuns.js';

const BASE = 'https://hub.example/api/games/stardust';
const BOARDS = [{ board: 'full', version: 1 }, ...LEVEL_BOARDS.map((board) => ({ board, version: 1 }))];

// A fake hub that records every request and answers like the real one.
function fakeHub({ user = { username: 'nova', displayName: 'Nova' }, boards = BOARDS } = {}) {
  const calls = [];
  let next = 1;
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method || 'GET', body, credentials: init.credentials });
    if (url.endsWith('/api/users/session')) return reply(200, { user });
    if (url === BASE) return reply(200, { boards });
    if (url === `${BASE}/runs`) return user ? reply(201, { runId: `run-${next++}`, board: body.board }) : reply(401, { code: 'SIGNED_OUT' });
    const finish = url.match(/\/runs\/([^/]+)\/finish$/);
    if (finish) return reply(200, { runId: finish[1], status: 'accepted', timeMs: body.timeMs, best: { timeMs: body.timeMs, rank: 2 }, personalBest: true });
    return reply(404, {});
  };
  return { calls, fetchImpl };
}

const config = { backendBaseUrl: BASE, requestTimeoutMs: 1000, build: 'stardust-test' };
const opened = (calls) => calls.filter((c) => c.url === `${BASE}/runs`).map((c) => c.body.board);
const finished = (calls) => calls.filter((c) => c.url.endsWith('/finish'));

test('guests open no runs and send no times', async () => {
  const hub = fakeHub({ user: null });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  rec.startLevel(2);
  assert.equal(await rec.finishLevel(1, 40000), null);
  assert.equal(await rec.finishRun(200000), null);
  assert.deepEqual(opened(hub.calls), []);
  assert.deepEqual(finished(hub.calls), []);
});

test('a signed-in launch opens the full network and the first circuit, with credentials', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  assert.deepEqual(opened(hub.calls), ['full', 'alpha-relay']);
  const start = hub.calls.find((c) => c.url === `${BASE}/runs`);
  assert.deepEqual(start.body, { board: 'full', version: 1, build: 'stardust-test' });
  assert.ok(hub.calls.every((c) => c.credentials === 'include'));
});

test('each circuit is saved with its own time, and the full run carries the splits', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  const first = await rec.finishLevel(1, 41234.6);
  assert.equal(first.board, 'alpha-relay');
  assert.equal(first.status, 'accepted');
  for (let level = 2; level <= 5; level += 1) {
    rec.startLevel(level);
    await rec.finishLevel(level, 40000 + level);
  }
  const full = await rec.finishRun(210000.4);
  assert.equal(full.board, 'full');
  const last = finished(hub.calls).at(-1);
  assert.equal(last.body.timeMs, 210000);
  assert.deepEqual(Object.keys(last.body.splits), LEVEL_BOARDS);
  assert.equal(last.body.splits['alpha-relay'], 41235);
  assert.deepEqual(opened(hub.calls), ['full', ...LEVEL_BOARDS]);
});

test('quitting abandons the open runs, so late results are ignored', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  rec.abandon();
  assert.equal(await rec.finishLevel(1, 40000), null);
  assert.equal(await rec.finishRun(200000), null);
  assert.equal(finished(hub.calls).length, 0);
});

test('a board version the game does not know opens no run', async () => {
  const hub = fakeHub({ boards: [{ board: 'full', version: 2 }] });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  assert.deepEqual(opened(hub.calls), ['full'], 'the hub says which version; only boards it lists are opened');
});

test('with no hub configured nothing is requested', async () => {
  let requests = 0;
  const rec = createRunRecorder({ config: { backendBaseUrl: '' }, fetchImpl: async () => { requests += 1; } });
  await rec.startRun();
  assert.equal(await rec.finishRun(1000), null);
  assert.equal(requests, 0);
  assert.equal(rec.enabled, false);
});

test('results read plainly', () => {
  assert.equal(describeResult({ status: 'accepted', timeMs: 41230, personalBest: true, best: { rank: 3 } }, 'Alpha Relay'), 'Alpha Relay: new best 0:41.23 · #3');
  assert.equal(describeResult({ status: 'accepted', timeMs: 61000, personalBest: false, best: { rank: 9 } }, 'Iron Veil'), 'Iron Veil: saved 1:01.00 · #9');
  assert.match(describeResult({ status: 'rejected', reasons: ['below-floor'] }, 'Iron Veil'), /not counted \(faster than the circuit allows\)/);
  assert.equal(describeResult(null, 'x'), null);
});
