import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunRecorder, describeResult, LEVEL_BOARDS } from '../projects/Space-Shooter/systems/hubRuns.js';
import {
  parseChallengeId, formatDelta, formatGap, splitLine, runningLine, referenceSoFar, breakdownRows, nameList,
  challengeOutcome, finishSummary, classifyChallenge, challengeNote, refusalText, refusalState, createErrorText,
  challengeLink, challengeMessage,
} from '../projects/Space-Shooter/systems/challenges.js';

const BASE = 'https://hub.example/api/games/stardust';
const BOARDS = [{ board: 'full', version: 1 }, ...LEVEL_BOARDS.map((board) => ({ board, version: 1 }))];
const NOVA = { username: 'nova', displayName: 'Nova' };
const ROOK = { username: 'rook', displayName: 'Rook' };
const ID = '3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c';
const TARGET_SPLITS = { 'alpha-relay': 21000, 'beacon-prime': 22000, 'dustfall-station': 23000, 'nether-crossing': 24000, 'iron-veil': 24692 };

function challengeView(overrides = {}) {
  return {
    id: ID, board: 'full', boardName: 'Full run', version: 1, status: 'active',
    createdAt: '2026-09-27T10:00:00Z', expiresAt: '2026-10-11T10:00:00Z',
    target: { timeMs: 114692, splits: TARGET_SPLITS, setAt: '2026-09-26T10:00:00Z', pilot: NOVA },
    from: NOVA, to: null, parentId: null, attempts: [], viewer: null,
    ...overrides,
  };
}

// A fake hub answering like FRIENDS_CHALLENGES.md. startChallenge picks how a
// run start carrying a challenge is answered: 'ok', or [status, error].
function fakeHub({ user = ROOK, startChallenge = 'ok', challenge = challengeView(), me = null, finish = {}, create = null } = {}) {
  const calls = [];
  let next = 1;
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    const method = init.method || 'GET';
    calls.push({ url, method, body });
    if (url.endsWith('/api/users/session')) return reply(200, { user });
    if (url === BASE) return reply(200, { boards: BOARDS });
    if (url === `${BASE}/me`) return user ? reply(200, me ?? { bests: {} }) : reply(401, { error: 'signed_out' });
    if (url === `${BASE}/runs`) {
      if (!user) return reply(401, { error: 'signed_out' });
      if (body.challenge) {
        if (startChallenge !== 'ok') return reply(startChallenge[0], { error: startChallenge[1], message: 'no' });
        return reply(201, { runId: `run-${next++}`, board: body.board, version: 1, challenge: { id: body.challenge, targetMs: 114692, splits: TARGET_SPLITS } });
      }
      return reply(201, { runId: `run-${next++}`, board: body.board, version: 1 });
    }
    const finished = url.match(/\/runs\/([^/]+)\/finish$/);
    if (finished) {
      return reply(200, { runId: finished[1], status: 'accepted', verification: 'timed', timeMs: body.timeMs, best: { timeMs: body.timeMs, rank: 4 }, personalBest: true, ...finish });
    }
    if (url === `${BASE}/challenges` && method === 'POST') {
      if (create) return reply(create[0], create[1]);
      return reply(201, { challenge: challengeView({ id: `made-${body.runId}`, from: user, to: body.to ? { username: body.to } : null, parentId: body.parent ?? null }) });
    }
    const one = url.match(/\/challenges\/([^/]+)$/);
    if (one && method === 'GET') {
      if (!challenge || decodeURIComponent(one[1]) !== challenge.id) return reply(404, { error: 'unknown_challenge' });
      return reply(200, challenge);
    }
    return reply(404, { error: 'not_found' });
  };
  return { calls, fetchImpl };
}

const config = { backendBaseUrl: BASE, requestTimeoutMs: 1000, build: 'stardust-test' };
const starts = (calls) => calls.filter((c) => c.url === `${BASE}/runs`).map((c) => c.body);

async function flyAll(rec, perLevel = 22000) {
  for (let level = 1; level <= 5; level += 1) {
    if (level > 1) rec.startLevel(level);
    await rec.finishLevel(level, perLevel);
  }
  return rec.finishRun(perLevel * 5);
}

// --- recorder: challenge runs ---

test('only the full-network run carries the challenge', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  rec.useChallenge(ID);
  const started = await rec.startRun();
  assert.equal(started.challenge.id, ID);
  assert.equal(started.challenge.targetMs, 114692);
  assert.equal(started.challengeRefused, undefined);
  const [full, alpha] = starts(hub.calls);
  assert.deepEqual(full, { board: 'full', version: 1, build: 'stardust-test', challenge: ID });
  assert.deepEqual(alpha, { board: 'alpha-relay', version: 1, build: 'stardust-test' });
  rec.startLevel(2);
  assert.ok(starts(hub.calls).slice(1).every((body) => !('challenge' in body)), 'circuit runs are unchanged');
});

test('a retry keeps the same challenge', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  rec.useChallenge(ID);
  await rec.startRun();
  await rec.startRun();
  assert.deepEqual(starts(hub.calls).filter((b) => b.board === 'full').map((b) => b.challenge), [ID, ID]);
});

test('a refused challenge still records the run, and says why', async () => {
  for (const [status, code] of [[404, 'unknown_challenge'], [410, 'challenge_expired'], [409, 'challenge_outdated'], [409, 'challenge_board']]) {
    const hub = fakeHub({ startChallenge: [status, code] });
    const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
    rec.useChallenge(ID);
    const started = await rec.startRun();
    assert.equal(started.challengeRefused, code, `HTTP ${status}`);
    assert.equal(started.challenge, null);
    assert.ok(started.runId, 'the run opened without the challenge');
    const fulls = starts(hub.calls).filter((b) => b.board === 'full');
    assert.equal(fulls.length, 2);
    assert.equal(fulls[0].challenge, ID);
    assert.equal('challenge' in fulls[1], false);
    const result = await flyAll(rec);
    assert.equal(result.status, 'accepted');
  }
});

test('a version mismatch is the run, not the challenge: no retry', async () => {
  const hub = fakeHub({ startChallenge: [409, 'version_mismatch'] });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  rec.useChallenge(ID);
  const started = await rec.startRun();
  assert.deepEqual(started, { error: 'outdated' });
  assert.equal(starts(hub.calls).filter((b) => b.board === 'full').length, 1);
});

test('guests never start a challenge run', async () => {
  const hub = fakeHub({ user: null });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  rec.useChallenge(ID);
  assert.deepEqual(await rec.startRun(), { error: 'guest' });
  assert.deepEqual(starts(hub.calls), []);
  assert.equal(await rec.profile(), null);
});

test('the accepted full run is kept for making a challenge', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  assert.equal(rec.lastRun, null);
  await flyAll(rec);
  assert.deepEqual(rec.lastRun, { runId: 'run-1', timeMs: 110000 });
  const made = await rec.createChallenge({ runId: rec.lastRun.runId });
  assert.equal(made.challenge.id, 'made-run-1');
  assert.deepEqual(hub.calls.at(-1).body, { runId: 'run-1' });
  await rec.startRun();
  assert.equal(rec.lastRun, null, 'a new launch forgets the old run');
});

test('an unaccepted full run is not kept', async () => {
  const hub = fakeHub({ finish: { status: 'flagged', reasons: ['below-floor'] } });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.startRun();
  await flyAll(rec);
  assert.equal(rec.lastRun, null);
});

test('a rechallenge goes back to the sender with the parent id', async () => {
  const hub = fakeHub();
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.connect();
  const made = await rec.createChallenge({ runId: 'run-9', to: 'nova', parent: ID });
  assert.ok(made.challenge);
  assert.deepEqual(hub.calls.at(-1).body, { runId: 'run-9', to: 'nova', parent: ID });
});

test('a challenge the hub will not make is never shown as made', async () => {
  for (const [status, data, error] of [[429, { error: 'too_many_challenges' }, 'too_many_challenges'], [409, { error: 'outdated' }, 'outdated'], [503, {}, 'offline'], [401, {}, 'signed-out']]) {
    const hub = fakeHub({ create: [status, data] });
    const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
    await rec.connect();
    assert.deepEqual(await rec.createChallenge({ runId: 'run-1' }), { error }, `HTTP ${status}`);
  }
  const down = createRunRecorder({ config, fetchImpl: async () => { throw new TypeError('down'); } });
  await down.connect();
  assert.deepEqual(await down.createChallenge({ runId: 'run-1' }), { error: 'signed-out' }, 'no player, no request');
});

test('the player profile and challenge details come from the contract endpoints', async () => {
  const me = { bests: { full: { timeMs: 190000, rank: 17, version: 1, runId: 'r', splits: { 'alpha-relay': 40100 }, medal: null } } };
  const hub = fakeHub({ me, challenge: challengeView({ viewer: { isCreator: false, bestMs: 119000, beaten: false } }) });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.connect();
  assert.deepEqual(await rec.profile(), me);
  assert.equal(rec.version('full'), 1);
  const loaded = await rec.loadChallenge(ID);
  assert.equal(classifyChallenge(loaded.status, loaded.data).state, 'active');
  assert.equal(classifyChallenge(...Object.values(await rec.loadChallenge('nope-nope-nope'))).state, 'missing');
  assert.ok(hub.calls.some((c) => c.url === `${BASE}/challenges/${ID}`));
});

test('an unreachable hub makes a challenge link "offline", never active', async () => {
  const rec = createRunRecorder({ config, fetchImpl: async () => { throw new TypeError('down'); } });
  const { status, data } = await rec.loadChallenge(ID);
  assert.equal(classifyChallenge(status, data).state, 'offline');
});

// --- pure wording ---

test('challenge ids are validated and length-capped', () => {
  assert.equal(parseChallengeId(`?challenge=${ID}`), ID);
  assert.equal(parseChallengeId('?challenge=abc12345'), 'abc12345');
  assert.equal(parseChallengeId('?challenge=short'), null);
  assert.equal(parseChallengeId(`?challenge=${'a'.repeat(65)}`), null);
  assert.equal(parseChallengeId('?challenge=<script>alert(1)</script>'), null);
  assert.equal(parseChallengeId('?challenge=../../etc'), null);
  assert.equal(parseChallengeId(''), null);
  assert.equal(parseChallengeId('?c=abc12345'), null);
});

test('deltas show their sign: minus is faster', () => {
  assert.equal(formatDelta(-840), '−0.84');
  assert.equal(formatDelta(1200), '+1.20');
  assert.equal(formatDelta(4), '±0.00');
  assert.equal(formatDelta(-62100), '−1:02.10');
  assert.equal(formatDelta(NaN), '');
  assert.equal(formatGap(3100), '3.10 s');
  assert.equal(formatGap(-790), '0.79 s');
  assert.equal(formatGap(62100), '1:02.10');
});

test('a circuit split compares with the PB and the challenge target', () => {
  assert.equal(splitLine({ board: 'alpha-relay', timeMs: 41230, pbMs: 42070, targetMs: 40030, targetName: 'Nova' }), 'Alpha Relay 0:41.23 · −0.84 PB · +1.20 Nova');
  assert.equal(splitLine({ board: 'alpha-relay', timeMs: 41230 }), 'Alpha Relay 0:41.23', 'guests get no invented deltas');
  assert.equal(splitLine({ board: 'iron-veil', timeMs: 50000, pbMs: 50000 }), 'Iron Veil 0:50.00 · ±0.00 PB');
});

test('the running total says whether the player is ahead', () => {
  const splits = { 'alpha-relay': 20000, 'beacon-prime': 22600 };
  const soFar = referenceSoFar(splits, TARGET_SPLITS);
  assert.equal(soFar, 43000);
  assert.equal(runningLine({ totalMs: 42600, targetMs: soFar, targetName: 'Nova' }), 'Running 0:42.60 · −0.40 Nova (ahead)');
  assert.equal(runningLine({ totalMs: 43500, targetMs: soFar, targetName: 'Nova' }), 'Running 0:43.50 · +0.50 Nova (behind)');
  assert.equal(runningLine({ totalMs: 43500, targetMs: null }), null);
  assert.equal(referenceSoFar(splits, { 'alpha-relay': 1 }), null, 'an unknown split means no running comparison');
  assert.equal(referenceSoFar(splits, null), null);
});

test('the finish breakdown only shows columns it has numbers for', () => {
  const splits = { 'alpha-relay': 20000, 'beacon-prime': 22600, 'dustfall-station': 23000, 'nether-crossing': 24000, 'iron-veil': 24300 };
  const guest = breakdownRows({ splits, totalMs: 113900 });
  assert.deepEqual(guest.columns, { pb: false, target: false });
  assert.equal(guest.rows.length, 5);
  assert.equal(guest.rows[0].name, 'Alpha Relay');

  const full = breakdownRows({ splits, totalMs: 113900, pb: { timeMs: 115000, splits: { 'alpha-relay': 20500 } }, target: { name: 'Nova', timeMs: 114692, splits: TARGET_SPLITS } });
  assert.deepEqual(full.columns, { pb: true, target: true });
  assert.equal(full.rows[0].pb, -500);
  assert.equal(full.rows[1].pb, null);
  assert.equal(full.rows[0].target, -1000);
  assert.equal(full.total.pb, -1100);
  assert.equal(full.total.target, -792);
  assert.equal(full.targetName, 'Nova');
});

test('the finish summary reports rank, friends, medals and the challenge', () => {
  const result = {
    status: 'accepted', timeMs: 113900, personalBest: true, best: { timeMs: 113900, rank: 17 }, rankBefore: 21,
    friends: { rank: 2, of: 5, overtaken: [{ username: 'vega', displayName: 'Vega', timeMs: 188200 }], next: { username: 'nova', displayName: 'Nova', timeMs: 110800, gapMs: 3100 } },
    medal: { earned: 'silver', improved: true, next: { medal: 'gold', timeMs: 109700, gapMs: 4200 } },
    challenge: { id: ID, targetMs: 114692, beaten: true, firstBeat: true, from: NOVA, pilot: NOVA, canRechallenge: true },
  };
  const s = finishSummary(result);
  assert.equal(s.headline, 'New personal best: 1:53.90. Up from #21 to #17 on the full network.');
  assert.deepEqual(s.lines, [
    'You passed Vega.',
    'Friends: 2 of 5',
    'Next: Nova, 3.10 s faster',
    'Silver medal earned.',
    'Next medal: Gold, 4.20 s faster.',
    'You beat Nova’s 1:54.69 by 0.79 s.',
  ]);
});

test('no duplicate celebration without a personal best', () => {
  const s = finishSummary({
    status: 'accepted', timeMs: 115310, personalBest: false, best: { timeMs: 113900, rank: 17 }, rankBefore: 17,
    friends: { rank: 2, of: 5, overtaken: [{ username: 'vega' }], next: null },
    medal: { earned: 'silver', improved: false, next: null },
    challenge: { targetMs: 114692, beaten: false, from: ROOK, pilot: NOVA },
  });
  assert.equal(s.headline, 'Saved 1:55.31. Your best is still 1:53.90, #17 on the full network.');
  assert.ok(!s.lines.some((line) => /passed|earned|personal best/i.test(line)));
  assert.ok(s.lines.includes('Your medal: Silver.'));
  assert.ok(s.lines.includes('0.62 s short of Nova’s 1:54.69.'), 'the target pilot is named, not the sender');
  assert.equal(finishSummary({ status: 'flagged', reasons: [] }), null);
  assert.equal(finishSummary(null), null);
});

test('first saved time and friend leader wording', () => {
  const s = finishSummary({ status: 'accepted', timeMs: 190000, personalBest: true, best: { timeMs: 190000, rank: 42 }, rankBefore: null, friends: { rank: 1, of: 3, overtaken: [], next: null } });
  assert.equal(s.headline, 'New personal best: 3:10.00. #42 on the full network.');
  assert.deepEqual(s.lines, ['Friends: 1 of 3', 'You lead your friends.']);
  assert.equal(nameList([{ displayName: 'A' }, { displayName: 'B' }, { displayName: 'C' }, { displayName: 'D' }, { username: 'e' }]), 'A, B, C and 2 more');
  assert.equal(nameList([{ displayName: 'A' }, { username: 'b' }]), 'A and b');
});

test('challenge outcomes, including a tie', () => {
  assert.equal(challengeOutcome({ timeMs: 113900, targetMs: 114692, pilot: NOVA }), 'You beat Nova’s 1:54.69 by 0.79 s.');
  assert.equal(challengeOutcome({ timeMs: 115312, targetMs: 114692, pilot: NOVA }), '0.62 s short of Nova’s 1:54.69.');
  assert.match(challengeOutcome({ timeMs: 114692, targetMs: 114692, pilot: NOVA }), /matched .*tie doesn’t beat it/);
  assert.equal(challengeOutcome({ timeMs: 1, targetMs: null }), null);
});

test('hangar lines for every challenge state', () => {
  const active = classifyChallenge(200, challengeView());
  assert.equal(active.state, 'active');
  assert.deepEqual(challengeNote(active, { signedIn: true }), { text: 'Challenge from Nova: beat Nova’s 1:54.69 on the full network.', signIn: false });
  const out = challengeNote(active, { signedIn: false });
  assert.equal(out.signIn, true, 'signed out: the page adds "Sign in for this attempt to count."');
  assert.equal(out.text, 'Challenge from Nova: beat Nova’s 1:54.69 on the full network.');

  const chase = classifyChallenge(200, challengeView({ from: ROOK }));
  assert.equal(challengeNote(chase, { signedIn: true }).text, 'Challenge from Rook: chase down Nova’s 1:54.69 on the full network.');

  const tried = classifyChallenge(200, challengeView({ viewer: { isCreator: false, bestMs: 119000, beaten: false } }));
  assert.match(challengeNote(tried, { signedIn: true }).text, /Your best try: 1:59\.00\.$/);

  assert.equal(classifyChallenge(200, challengeView({ status: 'expired' })).state, 'expired');
  assert.match(challengeNote(classifyChallenge(200, challengeView({ status: 'expired' }))).text, /from Nova has expired/);
  assert.equal(classifyChallenge(200, challengeView({ status: 'outdated' })).state, 'outdated');
  assert.equal(classifyChallenge(200, challengeView({ board: 'alpha-relay' })).state, 'unsupported');
  assert.equal(classifyChallenge(404, { error: 'unknown_challenge' }).state, 'missing');
  assert.equal(classifyChallenge(0, null).state, 'offline');
  assert.equal(classifyChallenge(503, null).state, 'offline');
  assert.equal(classifyChallenge(429, { error: 'too_many_requests' }).state, 'unavailable');
  for (const state of ['expired', 'outdated', 'unsupported', 'missing', 'offline', 'unavailable']) {
    const note = challengeNote({ state, challenge: null });
    assert.ok(note.text.length > 10 && note.signIn === false, state);
  }
  assert.match(challengeNote({ state: 'offline', challenge: null }).text, /offline/);
});

test('refusals and link errors read plainly', () => {
  assert.equal(refusalText('challenge_expired'), 'This challenge has expired, so this run counts as a normal run.');
  assert.match(refusalText('something_new'), /counts as a normal run/);
  assert.equal(refusalState('challenge_expired'), 'expired');
  assert.equal(refusalState('challenge_outdated'), 'outdated');
  assert.equal(refusalState('unknown_challenge'), 'missing');
  assert.match(createErrorText('offline'), /no link was made/);
  assert.match(createErrorText('too_many_challenges'), /daily limit/);
  assert.match(createErrorText('weird'), /didn’t make a link/);
});

test('challenge links are built relative to the site, with a prepared message', () => {
  assert.equal(challengeLink(ID, 'https://donavencrenshaw.com/games/stardust/'), `https://donavencrenshaw.com/stardust/challenge/?c=${ID}`);
  assert.equal(challengeLink('a b&c', 'https://donavencrenshaw.com/games/stardust/index.html'), 'https://donavencrenshaw.com/stardust/challenge/?c=a%20b%26c');
  assert.equal(challengeMessage(113900, 'https://x/c'), 'Beat my Stardust time: 1:53.90 on the full network → https://x/c');
});

test('existing save wording is unchanged', () => {
  assert.match(describeResult({ status: 'unsaved', reasons: ['offline'] }, 'Full network'), /offline, so this time wasn’t saved/);
});
