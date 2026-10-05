import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEKLY_EVENTS } from '../projects/Space-Shooter/tracks/weekly.js';
import { createWeeklyLayout } from '../projects/Space-Shooter/engine/weekly/layout.js';
import { flyWeeklyLap } from '../projects/Space-Shooter/engine/weekly/pilot.js';
import { encodeInputLog, decodeInputLog, replayInputLog } from '../projects/Space-Shooter/engine/weekly/replay.js';
import { makeLocalBest, readLocalBest, saveLocalBest } from '../projects/Space-Shooter/engine/weekly/localBest.js';
import { canLaunchWeeklyMode } from '../projects/Space-Shooter/systems/weeklyAccess.js';
import { validateDraftPath, parseStudioQuery, validateDraftEvent, loadStudioDraft, studioDraft, studioRunPayload, postStudioRun, studioLabel } from '../projects/Space-Shooter/systems/weeklyStudio.js';

const event = () => structuredClone(WEEKLY_EVENTS[0]);
const load = (path = '/studio/drafts/owner-track.json', source = event()) => loadStudioDraft(path, async () => ({ ok: true, json: async () => source }));
const memoryStore = () => {
  const items = new Map();
  return { items, getItem: (key) => items.get(key) || null, setItem: (key, value) => items.set(key, value) };
};

test('studio URL parser opts in only for weekly previews with one valid draft path', () => {
  for (const search of ['', '?draft=/studio/drafts/x.json', '?preview=custom&draft=1', '?preview=weekly']) {
    assert.deepEqual(parseStudioQuery(search), { requested: false, path: null });
  }
  assert.deepEqual(parseStudioQuery('?preview=weekly&draft=%2Fstudio%2Fdrafts%2Fx.json'), { requested: true, path: '/studio/drafts/x.json' });
  for (const path of ['', '1', 'studio/drafts/x.json', '/studio/drafts/x.js', '/drafts/x.json',
    'https://example.com/studio/drafts/x.json', 'http://localhost/studio/drafts/x.json', '//evil.test/studio/drafts/x.json',
    '/studio/drafts/../x.json', '/studio/drafts/a/../../x.json', '/studio/drafts/./x.json',
    '/studio/drafts//x.json', '/studio/drafts/%2e%2e/x.json', '/studio/drafts/%2F%2Fevil.json',
    '/studio/drafts/x.json?url=https://evil.test', '/studio/drafts/x.json#fragment', '/studio/drafts/\\evil.json',
    '/studio/drafts/x.JSON', '/studio/drafts/x.json\n']) {
    assert.equal(validateDraftPath(path), null, path);
    assert.deepEqual(parseStudioQuery(`?preview=weekly&draft=${encodeURIComponent(path)}`), { requested: true, path: null }, path);
  }
  assert.equal(parseStudioQuery('?preview=weekly&draft=/studio/drafts/a.json&draft=/studio/drafts/b.json').path, null);
  assert.equal(validateDraftPath('/studio/drafts/review/week-2.v3.json'), '/studio/drafts/review/week-2.v3.json');
});

test('draft fetch is root-relative, same-origin, fresh, and refuses redirects/failure', async () => {
  const calls = [];
  const draft = await loadStudioDraft('/studio/drafts/week-2.json', async (...args) => {
    calls.push(args); return { ok: true, json: async () => event() };
  });
  assert.deepEqual(calls, [['/studio/drafts/week-2.json', { mode: 'same-origin', credentials: 'same-origin', redirect: 'error', cache: 'no-store' }]]);
  assert.deepEqual(studioDraft(draft), { path: '/studio/drafts/week-2.json', draftId: 'week-2' });
  assert.equal(studioDraft(JSON.parse(JSON.stringify(draft))), null, 'JSON cannot grant the private launch marker');
  await assert.rejects(loadStudioDraft('https://evil.test/studio/drafts/x.json', () => assert.fail('must not fetch')));
  await assert.rejects(loadStudioDraft('/studio/drafts/x.json', async () => ({ ok: false })));
  await assert.rejects(loadStudioDraft('/studio/drafts/x.json', async () => { throw new Error('redirect rejected'); }));
  await assert.rejects(loadStudioDraft('/studio/drafts/x.json', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })));
});

test('draft event validates weekly inputs and rejects malformed/degenerate layouts', () => {
  assert.equal(validateDraftEvent(WEEKLY_EVENTS[0]), WEEKLY_EVENTS[0]);
  const pending = event(); pending.enabled = false; delete pending.opensAt; delete pending.closesAt;
  assert.equal(validateDraftEvent(pending), pending, 'draft does not need a release approval or window');
  const mutations = [
    (e) => e.id = 'bad|log', (e) => e.id = 123, (e) => e.version = '1', (e) => e.version = 0,
    (e) => e.week = 1.2, (e) => e.title = '', (e) => e.track = null,
    (e) => e.opensAt = 'yesterday', (e) => e.closesAt = e.opensAt, (e) => e.ships = 'unknown',
    (e) => e.track.width = '6', (e) => e.track.width = 1, (e) => e.track.width = Infinity,
    (e) => e.track.points = [], (e) => e.track.points[0] = [NaN, 1],
    (e) => e.track.points[1] = e.track.points[0], (e) => e.track.points = [[0, 0], [2, 0], [1, 1]],
    (e) => e.track.shards = [], (e) => e.track.mines = null,
    (e) => e.track.shards[0].seg = -1, (e) => e.track.shards[0].seg = e.track.points.length,
    (e) => e.track.shards[0].t = 2, (e) => e.track.mines[0].off = 'oops',
    (e) => e.track.bouncers[0].radius = 0, (e) => e.track.bouncers[0].radius = 3,
    (e) => e.track.bouncers[0].speed = NaN, (e) => e.track.bouncers[0].phase = '1',
    (e) => e.track.sentries[0].point = 999, (e) => e.track.sentries[0].side = 'left',
  ];
  for (const mutate of mutations) { const bad = event(); mutate(bad); assert.throws(() => validateDraftEvent(bad)); }
  for (const bad of [null, [], {}, 'track']) assert.throws(() => validateDraftEvent(bad));
});

test('draft launch bypasses release gates only in preview, and keeps an explicit label', async () => {
  const source = event(); source.enabled = false;
  const draft = await load('/studio/drafts/week-2.json', source);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: draft, preview: true }, Date.parse('2030-01-01')), true);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: draft, preview: false }), false);
  assert.equal(canLaunchWeeklyMode({ kind: 'weekly', event: source, preview: false }), false);
  assert.equal(studioLabel(draft), 'PLAYTEST: Gantry Drop v1 — not ranked');
});

test('bests are isolated by draft path id and version, even with a shipped weekly id', async () => {
  const store = memoryStore();
  const a = await load('/studio/drafts/a.json');
  const b = await load('/studio/drafts/b.json');
  const v2 = await load('/studio/drafts/a.json', { ...event(), version: 2 });
  const best = makeLocalBest({ ms: 120000, log: 'a' });
  saveLocalBest(WEEKLY_EVENTS[0], makeLocalBest({ ms: 100000, log: 'ranked' }), store);
  saveLocalBest(a, best, store);
  assert.deepEqual(readLocalBest(a, store), best);
  assert.equal(readLocalBest(b, store), null);
  assert.equal(readLocalBest(v2, store), null);
  assert.equal(readLocalBest(WEEKLY_EVENTS[0], store).log, 'ranked');
  assert.equal(readLocalBest({ ...WEEKLY_EVENTS[0], id: 'weekly-02' }, store), null);
  assert.deepEqual([...store.items.keys()], ['stardust.weekly.weekly-01.v1.best', 'stardust.studio.a.v1.best']);
});

test('finished run payload carries the real SDW log and build; the draft best replays as a ghost', async () => {
  const draft = await load();
  const layout = createWeeklyLayout(draft);
  const lap = flyWeeklyLap(layout);
  assert.ok(lap.finished);
  const log = encodeInputLog({ eventId: draft.id, version: draft.version, frames: lap.frames, finishMs: lap.time });
  assert.deepEqual(studioRunPayload(draft, { ms: lap.time, finished: true, log }), {
    draftId: 'owner-track', version: 1, ms: Math.round(lap.time), finished: true, log, build: null,
  });
  assert.equal(decodeInputLog(log).eventId, draft.id);
  assert.ok(replayInputLog(layout, log).matches);
  assert.equal(studioRunPayload(draft, { ms: lap.time, finished: true, log, build: 'courier:0-0-0-0' }).build, 'courier:0-0-0-0');
  const store = memoryStore(); saveLocalBest(draft, makeLocalBest({ ms: Math.round(lap.time), log }), store);
  assert.ok(replayInputLog(layout, readLocalBest(draft, store).log).finished);
});

test('wreck/abort payload omits replay/build, and public events cannot emit studio runs', async () => {
  const draft = await load();
  for (const reason of ['mine', 'fuel', 'hull', 'abort', 'retry', 'pagehide']) {
    assert.deepEqual(studioRunPayload(draft, { ms: 345.6, finished: false, reason, log: 'ignored', build: 'ignored' }), {
      draftId: 'owner-track', version: 1, ms: 346, finished: false, reason,
    });
  }
  assert.equal(studioRunPayload(event(), { ms: 1, finished: true, log: 'log' }), null);
  assert.equal(studioRunPayload(draft, { ms: NaN, finished: true, log: 'log' }), null);
  assert.equal(studioRunPayload(draft, { ms: 1, finished: true }), null);
});

test('run POST is fire-and-forget, same-origin, no redirects; errors stay silent', async () => {
  const draft = await load(); const calls = [];
  const result = { ms: 1, finished: true, log: 'SDW2|weekly-01|1|0|1|' };
  assert.equal(postStudioRun(draft, result, (...args) => { calls.push(args); return Promise.reject(new Error('offline')); }), undefined);
  const [path, options] = calls[0];
  assert.equal(path, '/studio/api/runs');
  assert.deepEqual({ ...options, body: JSON.parse(options.body) }, {
    method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: studioRunPayload(draft, result), keepalive: true,
  });
  assert.doesNotThrow(() => postStudioRun(draft, result, () => { throw new Error('synchronous failure'); }));
  postStudioRun(draft, { ...result, log: 'x'.repeat(70000) }, (_path, opts) => { assert.equal(opts.keepalive, false); });
  postStudioRun(event(), result, () => assert.fail('public runs never post'));
  await Promise.resolve();
});
