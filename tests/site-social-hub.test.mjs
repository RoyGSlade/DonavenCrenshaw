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

test('titles, avatars, profiles, events and comments use the contract method and path', async () => {
  const hub = fakeHub({
    'PUT /users/me/title': [200, { active: 'wingmate' }],
    'PUT /users/me/avatar': [200, { avatarPreset: 'pilot-nova' }],
    'PUT /users/profile': [200, { user: { username: 'nova', profilePublic: true } }],
    'POST /feedback': [201, { id: 'c1' }],
    'DELETE /feedback/c%2F1': [204]
  });
  const api = socialApi(createHub(ORIGIN, { fetchImpl: hub.fetchImpl }));
  await api.titles();
  await api.myTitles();
  assert.equal((await api.setTitle('wingmate')).data.active, 'wingmate');
  await api.setTitle(null);
  await api.setTitle('');
  await api.avatars();
  assert.equal((await api.setAvatar('pilot-nova')).data.avatarPreset, 'pilot-nova');
  await api.setAvatar(null);
  assert.equal((await api.setProfilePublic(true)).ok, true);
  await api.setProfilePublic(0);
  await api.profile('Roy_G_Slade');
  await api.profile('a/b');
  await api.event('weekly-01');
  await api.board('weekly-01', { limit: 50 });
  await api.comments('stardust-weekly-01');
  assert.equal((await api.postComment('stardust-weekly-01', 'good luck')).status, 201);
  assert.equal((await api.deleteComment('c/1')).ok, true);

  assert.deepEqual(hub.calls.map((c) => `${c.method} ${c.path}`), [
    'GET /titles',
    'GET /users/me/titles',
    'PUT /users/me/title',
    'PUT /users/me/title',
    'PUT /users/me/title',
    'GET /avatars',
    'PUT /users/me/avatar',
    'PUT /users/me/avatar',
    'PUT /users/profile',
    'PUT /users/profile',
    'GET /profiles/Roy_G_Slade',
    'GET /profiles/a%2Fb',
    'GET /games/stardust/events/weekly-01',
    'GET /games/stardust/boards/weekly-01?limit=50',
    'GET /feedback?page=stardust-weekly-01',
    'POST /feedback',
    'DELETE /feedback/c%2F1'
  ]);
  const bodies = hub.calls.map((c) => c.body);
  assert.deepEqual(bodies[2], { titleId: 'wingmate' });
  assert.deepEqual(bodies[3], { titleId: null });
  assert.deepEqual(bodies[4], { titleId: null });
  assert.deepEqual(bodies[6], { preset: 'pilot-nova' });
  assert.deepEqual(bodies[7], { preset: null });
  assert.deepEqual(bodies[8], { profilePublic: true });
  assert.deepEqual(bodies[9], { profilePublic: false });
  assert.deepEqual(bodies[15], { page: 'stardust-weekly-01', text: 'good luck' });
  assert.ok(hub.calls.every((c) => c.credentials === 'include'));
});

test('title, avatar and profile errors come through with their contract codes', async () => {
  const hub = fakeHub({
    'PUT /users/me/title': [400, { error: 'title_not_earned' }],
    'PUT /users/me/avatar': [400, { error: 'unknown_avatar' }],
    'POST /feedback': [400, { error: 'display_name_required' }]
  });
  const api = socialApi(createHub(ORIGIN, { fetchImpl: hub.fetchImpl }));
  assert.deepEqual([(await api.setTitle('gatecrasher')).data.error], ['title_not_earned']);
  assert.deepEqual([(await api.setAvatar('pilot-x')).data.error], ['unknown_avatar']);
  const missing = await api.profile('nobody');
  assert.deepEqual([missing.ok, missing.status, missing.data.error, missing.offline], [false, 404, 'not_found', false]);
  assert.equal((await api.postComment('p', 'x')).data.error, 'display_name_required');
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
