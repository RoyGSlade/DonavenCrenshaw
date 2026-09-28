import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub, socialApi } from '../scripts/social.js';

const ORIGIN = 'https://hub.example';

// A fake hub that records every request and answers from a table, like
// tests/stardust-hub-runs.test.mjs does for the game.
function fakeHub(routes = {}) {
  const calls = [];
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => { if (data === undefined) throw new SyntaxError('no body'); return data; } });
  const fetchImpl = async (url, init = {}) => {
    const path = url.slice(`${ORIGIN}/api`.length);
    calls.push({ url, path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, credentials: init.credentials, signal: init.signal });
    const route = routes[`${init.method || 'GET'} ${path}`];
    if (typeof route === 'function') return route();
    if (route) return reply(route[0], route[1]);
    return reply(404, { error: 'not_found' });
  };
  return { calls, fetchImpl, reply };
}

test('every friends call hits the contract path with the right method and credentials', async () => {
  const hub = fakeHub({
    'GET /friends': [200, { friends: [], incoming: [], outgoing: [], blocked: [] }],
    'POST /friends/requests': [201, { status: 'pending', request: { id: 'r1', username: 'nova' } }],
    'POST /friends/requests/r%2F1/accept': [200, { status: 'friends', friend: { username: 'vega' } }],
    'POST /friends/requests/r1/decline': [204],
    'DELETE /friends/requests/r1': [204],
    'DELETE /friends/nova': [204],
    'POST /friends/blocks': [201, { blocked: { username: 'spam', displayName: 'Spam' } }],
    'DELETE /friends/blocks/spam': [204]
  });
  const api = socialApi(createHub(ORIGIN, { fetchImpl: hub.fetchImpl }));

  assert.equal((await api.friends()).ok, true);
  const sent = await api.request('nova');
  assert.equal(sent.status, 201);
  assert.equal(sent.data.request.id, 'r1');
  assert.equal((await api.accept('r/1')).data.status, 'friends');
  const declined = await api.decline('r1');
  assert.deepEqual([declined.ok, declined.status, declined.data], [true, 204, null]);
  assert.equal((await api.cancel('r1')).ok, true);
  assert.equal((await api.unfriend('nova')).ok, true);
  assert.equal((await api.block('spam')).status, 201);
  assert.equal((await api.unblock('spam')).ok, true);

  assert.deepEqual(hub.calls.map((c) => `${c.method} ${c.path}`), [
    'GET /friends',
    'POST /friends/requests',
    'POST /friends/requests/r%2F1/accept',
    'POST /friends/requests/r1/decline',
    'DELETE /friends/requests/r1',
    'DELETE /friends/nova',
    'POST /friends/blocks',
    'DELETE /friends/blocks/spam'
  ]);
  assert.deepEqual(hub.calls[1].body, { username: 'nova' });
  assert.deepEqual(hub.calls[6].body, { username: 'spam' });
  assert.ok(hub.calls.every((c) => c.credentials === 'include' && c.signal));
});

test('boards, around-me, challenges and progress use the contract paths', async () => {
  const hub = fakeHub();
  const api = socialApi(createHub(ORIGIN, { fetchImpl: hub.fetchImpl }));
  await api.board('full', { scope: 'friends', limit: 50 });
  await api.board('iron-veil');
  await api.aroundMe(3);
  await api.challenge('c1');
  await api.challenges('inbox');
  await api.challenges('sent');
  await api.challenges('anything else');
  await api.me();
  await api.game();
  await api.session();
  assert.deepEqual(hub.calls.map((c) => c.path), [
    '/games/stardust/boards/full?scope=friends&limit=50',
    '/games/stardust/boards/iron-veil?limit=10',
    '/games/stardust/boards/full/around-me?span=3',
    '/games/stardust/challenges/c1',
    '/games/stardust/challenges?box=inbox',
    '/games/stardust/challenges?box=sent',
    '/games/stardust/challenges?box=inbox',
    '/games/stardust/me',
    '/games/stardust',
    '/users/session'
  ]);
});

test('a 401 is signed out, not offline; contract errors come through with their code', async () => {
  const hub = fakeHub({
    'GET /friends': [401, { error: 'signed_out' }],
    'POST /friends/requests': [409, { error: 'already_friends', message: 'Already friends.' }]
  });
  const api = socialApi(createHub(ORIGIN, { fetchImpl: hub.fetchImpl }));
  const out = await api.friends();
  assert.deepEqual([out.ok, out.signedOut, out.offline], [false, true, false]);
  const clash = await api.request('nova');
  assert.deepEqual([clash.ok, clash.status, clash.data.error, clash.signedOut], [false, 409, 'already_friends', false]);
});

test('a sleeping hub (network error or 5xx gateway) reads as offline', async () => {
  const down = socialApi(createHub(ORIGIN, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }));
  assert.deepEqual(await down.challenge('c1'), { ok: false, status: 0, data: null, offline: true, signedOut: false });
  const gateway = fakeHub({ 'GET /games/stardust/challenges/c1': [502, undefined] });
  const res = await socialApi(createHub(ORIGIN, { fetchImpl: gateway.fetchImpl })).challenge('c1');
  assert.deepEqual([res.offline, res.data], [true, null]);
});

test('a hub that never answers is abandoned after the timeout', async () => {
  const hang = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const started = Date.now();
  const res = await createHub(ORIGIN, { fetchImpl: hang, timeoutMs: 30 })('/friends');
  assert.equal(res.offline, true);
  assert.ok(Date.now() - started < 2000);
});
