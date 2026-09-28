// Custom-track runs on the hub (docs/game/HUB_CONTRACT.md, board "custom-track"):
// one board run per launch, outside the full network, honest when the hub is
// old or on another version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunRecorder, describeResult, LEVEL_BOARDS } from '../projects/Space-Shooter/systems/hubRuns.js';
import { CUSTOM_BOARD } from '../projects/Space-Shooter/systems/customTrack.js';

const BASE = 'https://hub.example/api/games/stardust';
const NETWORK = [{ board: 'full', version: 1 }, ...LEVEL_BOARDS.map((board) => ({ board, version: 1 }))];
const WITH_CUSTOM = [...NETWORK, { board: CUSTOM_BOARD, kind: 'level', version: 1, name: 'Custom Track', network: false }];

function fakeHub({ user = { username: 'nova', displayName: 'Nova' }, boards = WITH_CUSTOM, finishStatus = 'accepted' } = {}) {
  const calls = [];
  let next = 1;
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method || 'GET', body, credentials: init.credentials });
    if (url.endsWith('/api/users/session')) return reply(200, { user });
    if (url === BASE) return reply(200, { boards });
    if (url === `${BASE}/runs`) return user ? reply(201, { runId: `run-${next++}`, board: body.board, version: body.version }) : reply(401, {});
    const finish = url.match(/\/runs\/([^/]+)\/finish$/);
    if (finish) return reply(200, { runId: finish[1], status: finishStatus, timeMs: body.timeMs, best: { timeMs: body.timeMs, rank: 1 }, personalBest: true });
    return reply(404, {});
  };
  return { calls, fetchImpl };
}

const config = { backendBaseUrl: BASE, requestTimeoutMs: 1000, build: 'stardust-test' };
const opened = (calls) => calls.filter((c) => c.url === `${BASE}/runs`).map((c) => c.body);
const finished = (calls) => calls.filter((c) => c.url.endsWith('/finish')).map((c) => c.body);

test('a signed-in custom launch opens only the custom-track board and finishes it with its time', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  const started = await rec.startBoardRun(CUSTOM_BOARD, { version: 1 });
  assert.equal(started.runId, 'run-1');
  assert.deepEqual(opened(hub.calls), [{ board: 'custom-track', version: 1, build: 'stardust-test' }]);
  const result = await rec.finishBoardRun(41234.6);
  assert.equal(result.board, 'custom-track');
  assert.equal(result.status, 'accepted');
  // Only a time: no splits, no fragments, no network board touched.
  assert.deepEqual(finished(hub.calls), [{ timeMs: 41235 }]);
  assert.ok(hub.calls.every((c) => c.credentials === 'include'));
  assert.equal(rec.lastRun, null, 'a custom run never becomes a network challenge run');
  assert.equal(describeResult(result, 'Custom Track'), 'Custom Track: new best 0:41.23 · #1');
  // Finishing twice sends nothing more.
  assert.equal(await rec.finishBoardRun(1), null);
  assert.equal(finished(hub.calls).length, 1);
});

test('guests fly the custom track without any run being opened or sent', async () => {
  const hub = fakeHub({ user: null });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startBoardRun(CUSTOM_BOARD, { version: 1 });
  assert.equal(await rec.finishBoardRun(40000), null);
  assert.deepEqual(opened(hub.calls), []);
  assert.deepEqual(finished(hub.calls), []);
});

test('an older hub without the custom-track board: played locally, and told honestly it is not saved', async () => {
  const hub = fakeHub({ boards: NETWORK });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  const started = await rec.startBoardRun(CUSTOM_BOARD, { version: 1 });
  assert.deepEqual(started, { error: 'no-board' });
  assert.equal(rec.boardsKnown, true);
  assert.equal(rec.version(CUSTOM_BOARD), null);
  const result = await rec.finishBoardRun(40000);
  assert.deepEqual(result, { board: 'custom-track', status: 'unsaved', reasons: ['no-board'] });
  assert.deepEqual(opened(hub.calls), []);
  assert.deepEqual(finished(hub.calls), []);
  const line = describeResult(result, 'Custom Track');
  assert.match(line, /isn’t on the leaderboard yet/);
  assert.doesNotMatch(line, /out of date/, 'the game is not the outdated one here');
});

test('a hub on another custom-track version is not sent a mismatched run', async () => {
  const hub = fakeHub({ boards: [...NETWORK, { board: CUSTOM_BOARD, version: 2 }] });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  assert.deepEqual(await rec.startBoardRun(CUSTOM_BOARD, { version: 1 }), { error: 'version-mismatch' });
  const result = await rec.finishBoardRun(40000);
  assert.equal(result.status, 'unsaved');
  assert.match(describeResult(result, 'Custom Track'), /doesn’t match the leaderboard’s version/);
  assert.deepEqual(opened(hub.calls), []);
});

test('a hub that is asleep: nothing opened, the time is reported unsaved', async () => {
  const rec = createRunRecorder({ config, fetchImpl: async () => { throw new Error('down'); } });
  assert.deepEqual(await rec.startBoardRun(CUSTOM_BOARD, { version: 1 }), { error: 'offline' });
  assert.equal(rec.reachable, false);
  assert.match(describeResult(await rec.finishBoardRun(1), 'Custom Track'), /offline/);
});

test('custom and network launches abandon each other; the network run is unchanged', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startBoardRun(CUSTOM_BOARD, { version: 1 });
  await rec.startRun();
  // The custom run was abandoned by the network launch: finishing it sends nothing.
  assert.equal(await rec.finishBoardRun(40000), null);
  assert.deepEqual(opened(hub.calls).map((b) => b.board), ['custom-track', 'full', 'alpha-relay']);
  await rec.startBoardRun(CUSTOM_BOARD, { version: 1 });
  assert.equal(await rec.finishRun(200000), null, 'the full run was abandoned by the custom launch');
  const custom = await rec.finishBoardRun(39000);
  assert.equal(custom.board, 'custom-track');
  assert.deepEqual(finished(hub.calls), [{ timeMs: 39000 }]);
  rec.abandon();
  assert.equal(await rec.finishBoardRun(1), null);
});
