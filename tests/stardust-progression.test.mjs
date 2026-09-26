import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeal, GLYPHS, readDiscoveries, recordDiscovery, sealRemaining, submitSeal } from '../projects/Space-Shooter/systems/progression.js';
import { checkBackend, validateBackendUrl } from '../projects/Space-Shooter/systems/backend.js';

const correctReturn = ['purple', 'pink', 'green', 'blue'];

test('seal accepts the exact reverse journey order', () => {
  const seal = createSeal(10_000);
  assert.equal(GLYPHS.map(glyph => glyph.id).join(','), 'blue,green,pink,purple');
  assert.deepEqual(submitSeal(seal, correctReturn, 10_001), {
    ok: true,
    achievement: 'Stardust Remembers',
    local: true,
  });
  assert.equal(seal.status, 'solved');
  assert.equal(seal.attempts, 1);
});

test('wrong complete order is rejected without ending the active seal', () => {
  const seal = createSeal(1_000);
  assert.deepEqual(submitSeal(seal, ['blue', 'green', 'pink', 'purple'], 1_001), { ok: false, reason: 'order' });
  assert.equal(seal.status, 'active');
  assert.equal(seal.attempts, 1);
  assert.equal(submitSeal(seal, correctReturn, 1_002).ok, true);
});

test('incomplete, duplicate, and unknown choices do not count as a complete attempt', () => {
  const seal = createSeal(5_000);
  assert.deepEqual(submitSeal(seal, ['purple', 'pink'], 5_001), { ok: false, reason: 'incomplete' });
  assert.deepEqual(submitSeal(seal, ['purple', 'purple', 'green', 'blue'], 5_001), { ok: false, reason: 'incomplete' });
  assert.deepEqual(submitSeal(seal, ['purple', 'pink', 'green', 'unknown'], 5_001), { ok: false, reason: 'incomplete' });
  assert.equal(seal.attempts, 0);
});

test('deadline is exactly 120 seconds and expires at the boundary', () => {
  const start = 50_000;
  const seal = createSeal(start);
  assert.equal(seal.deadline, start + 120_000);
  assert.equal(sealRemaining(seal, start + 119_999), 1);
  assert.equal(sealRemaining(seal, start + 120_000), 0);
  assert.deepEqual(submitSeal(seal, correctReturn, start + 120_000), { ok: false, reason: 'expired' });
  assert.equal(seal.status, 'expired');
});

test('a fresh seal supports replay after a prior run', () => {
  const first = createSeal(100);
  assert.deepEqual(submitSeal(first, correctReturn, 101).ok, true);
  const replay = createSeal(200);
  assert.notEqual(replay.id, first.id);
  assert.equal(replay.status, 'active');
  assert.equal(replay.attempts, 0);
  assert.deepEqual(submitSeal(replay, correctReturn, 201).ok, true);
});

test('corrupt discovery storage returns an empty local record', () => {
  const storage = { getItem: () => '{bad json' };
  assert.deepEqual(readDiscoveries(storage), {});
  const wrongShape = { getItem: () => '["not", "a", "record"]' };
  assert.deepEqual(readDiscoveries(wrongShape), {});
});

test('unavailable discovery storage fails closed without throwing', () => {
  const storage = { getItem: () => { throw new Error('storage blocked'); }, setItem: () => { throw new Error('storage blocked'); } };
  assert.deepEqual(readDiscoveries(storage), {});
  assert.equal(recordDiscovery('local-test', storage), false);
  assert.equal(recordDiscovery('local-test', undefined), false);
});

test('discovery persistence is local and uses a stable versioned storage key', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(recordDiscovery('Where Gates Should Not Lead', storage), true);
  const [key, value] = [...values.entries()][0];
  assert.equal(key, 'stardust.discoveries.v1');
  assert.equal(typeof JSON.parse(value)['Where Gates Should Not Lead'], 'number');
});

test('backend defaults to local mode and makes no request', async () => {
  let requests = 0;
  const result = await checkBackend({ backendBaseUrl: '', requestTimeoutMs: 1000 }, async () => { requests++; throw new Error('must not run'); });
  assert.deepEqual(result, { mode: 'local', available: false });
  assert.equal(requests, 0);
});

test('backend URLs accept HTTPS and HTTP loopback only', () => {
  assert.equal(validateBackendUrl('https://games.example.test/'), 'https://games.example.test');
  assert.equal(validateBackendUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(validateBackendUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.equal(validateBackendUrl('http://[::1]:8080'), 'http://[::1]:8080');
  for (const invalid of [
    'http://games.example.test',
    'ftp://games.example.test',
    'https://user@games.example.test',
    'https://user:pass@games.example.test',
    'https://games.example.test?token=x',
    'https://games.example.test/#fragment',
    'not a URL',
  ]) assert.throws(() => validateBackendUrl(invalid), invalid);
});

test('backend health probe uses the v1 contract without credentials and validates the response', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, service: 'stardust', version: 1 }) };
  };
  const result = await checkBackend({ backendBaseUrl: 'https://api.example.test', requestTimeoutMs: 2500 }, fetchImpl);
  assert.deepEqual(result, { mode: 'connected', available: true });
  assert.equal(request.url, 'https://api.example.test/v1/health');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Accept, 'application/json');
  assert.ok(request.options.signal instanceof AbortSignal);

  const invalidContract = await checkBackend({ backendBaseUrl: 'https://api.example.test', requestTimeoutMs: 2500 }, async () => ({ ok: true, json: async () => ({ ok: true, service: 'other', version: 1 }) }));
  assert.deepEqual(invalidContract, { mode: 'local', available: false, reason: 'unavailable' });
});

test('invalid configured backend does not send a request', async () => {
  let requests = 0;
  const result = await checkBackend({ backendBaseUrl: 'http://public.example.test', requestTimeoutMs: 1000 }, async () => { requests++; });
  assert.deepEqual(result, { mode: 'local', available: false, reason: 'configuration' });
  assert.equal(requests, 0);
});

test('backend failures fall back to local play', async () => {
  const result = await checkBackend({ backendBaseUrl: 'https://api.example.test', requestTimeoutMs: 1000 }, async () => { throw new Error('offline'); });
  assert.deepEqual(result, { mode: 'local', available: false, reason: 'unavailable' });
});
