import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { optedOut, sourceOf, viewBody, sendView, trackView } from '../scripts/visits.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const HUB = 'https://hub.example';
const here = { pathname: '/stardust/weekly/', search: '', hostname: 'donavencrenshaw.com' };

// Runs trackView with a recording sender.
function track(over = {}) {
  const sent = [];
  const counted = trackView({
    hub: HUB, nav: {}, location: here, referrer: '', send: (url, body) => { sent.push({ url, body: JSON.parse(body) }); return true; }, ...over
  });
  return { counted, sent };
}

test('a normal visit sends one beacon with the path and source to the hub', () => {
  const { counted, sent } = track();
  assert.equal(counted, true);
  assert.deepEqual(sent, [{ url: `${HUB}/api/metrics/view`, body: { p: '/stardust/weekly/', s: 'direct' } }]);
  assert.equal(track({ hub: `${HUB}///` }).sent[0].url, `${HUB}/api/metrics/view`);
});

test('Global Privacy Control and Do Not Track switch the counter off', () => {
  for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true, doNotTrack: '0' }]) {
    assert.equal(optedOut(nav), true, JSON.stringify(nav));
    const { counted, sent } = track({ nav });
    assert.equal(counted, false);
    assert.deepEqual(sent, []);
  }
  for (const nav of [{}, { doNotTrack: '0' }, { doNotTrack: null }, { globalPrivacyControl: false }, undefined]) {
    assert.equal(optedOut(nav), false, JSON.stringify(nav));
  }
});

test('no hub configured means nothing is sent', () => {
  for (const hub of [undefined, '', '   ']) {
    const { counted, sent } = track({ hub });
    assert.equal(counted, false);
    assert.deepEqual(sent, []);
  }
});

test('the ?via= tag is lowercased and must be 1 to 32 of a-z, 0-9 and hyphen', () => {
  assert.equal(sourceOf({ search: '?via=Reddit' }), 'reddit');
  assert.equal(sourceOf({ search: '?x=1&via=week-5-post' }), 'week-5-post');
  assert.equal(sourceOf({ search: `?via=${'a'.repeat(32)}` }), 'a'.repeat(32));
  // A bad tag is ignored, not stored: the referrer or "direct" decides instead.
  for (const bad of ['', 'a'.repeat(33), 'has space', 'a_b', 'a.b', '<b>', '%00', 'caf%C3%A9']) {
    assert.equal(sourceOf({ search: `?via=${bad}` }), 'direct', bad);
  }
  assert.equal(sourceOf({ search: '?via=bad!', referrer: 'https://news.ycombinator.com/item?id=1' }), 'news.ycombinator.com');
  // A tag beats the referrer.
  assert.equal(sourceOf({ search: '?via=discord', referrer: 'https://www.reddit.com/r/x' }), 'discord');
});

test('a referrer is reduced to its hostname; same-site clicks are internal', () => {
  assert.equal(sourceOf({ referrer: 'https://www.Reddit.com/r/space/comments/abc?utm=1#x', host: 'donavencrenshaw.com' }), 'reddit.com');
  assert.equal(sourceOf({ referrer: 'https://t.co/AbC123', host: 'donavencrenshaw.com' }), 't.co');
  assert.equal(sourceOf({ referrer: 'android-app://com.google.android.gm/', host: 'donavencrenshaw.com' }), 'com.google.android.gm');
  assert.equal(sourceOf({ referrer: 'https://donavencrenshaw.com/stardust/', host: 'donavencrenshaw.com' }), 'internal');
  assert.equal(sourceOf({ referrer: 'https://www.donavencrenshaw.com/', host: 'donavencrenshaw.com' }), 'internal');
  assert.equal(sourceOf({ referrer: 'not a url' }), 'direct');
  assert.equal(sourceOf({ referrer: '' }), 'direct');
  assert.equal(sourceOf({ referrer: `https://${'a'.repeat(70)}.example/` }), 'other');
  assert.doesNotMatch(sourceOf({ referrer: 'https://user:pass@evil.example/secret/path?token=1' }), /pass|secret|token|\//);
});

test('the body carries the path without query or hash, and nothing else', () => {
  assert.deepEqual(JSON.parse(viewBody({ pathname: '/stardust/?via=x#top', search: '?via=reddit&token=abc', host: 'donavencrenshaw.com' })), { p: '/stardust/', s: 'reddit' });
  assert.deepEqual(Object.keys(JSON.parse(viewBody(here))), ['p', 's']);
  assert.deepEqual(JSON.parse(viewBody({})), { p: '/', s: 'direct' });
});

test('the beacon is a cookie-free text/plain request, so there is no CORS preflight', () => {
  const calls = [];
  const fetchImpl = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); };
  assert.equal(sendView(`${HUB}/api/metrics/view`, '{"p":"/","s":"direct"}', { fetchImpl }), true);
  const { init } = calls[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.keepalive, true);
  assert.equal(init.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.deepEqual(Object.keys(init.headers), ['Content-Type']);
});

test('a failing hub never throws into the page', async () => {
  assert.equal(sendView(HUB, '{}', { fetchImpl: () => Promise.reject(new Error('offline')) }), true);
  assert.equal(sendView(HUB, '{}', { fetchImpl: () => { throw new Error('blocked'); } }), false);
  let beaconType = null;
  const nav = { sendBeacon: (url, blob) => { beaconType = blob.type; return true; } };
  assert.equal(sendView(HUB, '{}', { fetchImpl: null, nav }), true);
  assert.equal(beaconType, 'text/plain;charset=utf-8'); // Blob lowercases the type
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('every page loads the counter, and it stores nothing in the browser', () => {
  assert.match(read('src/components/head.ejs'), /<script type="module" src="<%= siteRoot %>scripts\/visits\.js" data-visits-hub="<%= hubUrl %>"><\/script>/);
  assert.match(read('scripts/build.mjs'), /'visits\.js'/);
  const source = read('scripts/visits.js');
  assert.doesNotMatch(source, /document\.cookie|localStorage|sessionStorage|indexedDB|fingerprint|userAgent|screen\./);
});
