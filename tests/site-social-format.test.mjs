import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clock, span, gapText, siteUrl, inviteLink, challengeLink, challengePath, playPath, signInPath,
  readFriendParam, readChallengeId, cleanUsername, challengeMessage, inviteMessage, problemText,
  inviteState, requestSentText, boardRows, aroundMe, nextAbove, friendlessBoard, nextMedal, medalLine,
  splitRows, versusText, challengeRow, statusLabel
} from '../scripts/social.js';

test('times read like the boards: truncated to hundredths', () => {
  assert.equal(clock(114692), '1:54.69');
  assert.equal(clock(0), '0:00.00');
  assert.equal(clock(-5), '0:00.00');
  assert.equal(span(1800), '1.80s');
  assert.equal(span(62300), '1:02.30');
  assert.equal(gapText(1800), '+1.80s');
});

test('links follow the page origin and site base, so previews link to themselves', () => {
  assert.equal(inviteLink('https://donavencrenshaw.com', '/', 'nova'), 'https://donavencrenshaw.com/account/?friend=nova');
  assert.equal(inviteLink('http://localhost:3000/', 'DonavenCrenshaw', 'nova'), 'http://localhost:3000/DonavenCrenshaw/account/?friend=nova');
  assert.equal(challengeLink('https://donavencrenshaw.com', '/', 'ab_12'), 'https://donavencrenshaw.com/stardust/challenge/?c=ab_12');
  assert.equal(challengePath('/', 'x y'), '/stardust/challenge/?c=x%20y');
  assert.equal(siteUrl('https://a.b', '/base/', '/x/'), 'https://a.b/base/x/');
  assert.equal(playPath('/', 'c1'), '/games/stardust/?challenge=c1');
  assert.equal(playPath('/', null), '/games/stardust/');
  assert.equal(signInPath('/', '/stardust/challenge/?c=c1'), '/account/?next=%2Fstardust%2Fchallenge%2F%3Fc%3Dc1');
  assert.equal(signInPath('/', '/x/', { create: true }), '/account/?next=%2Fx%2F#create');
});

test('the sign-in link round-trips the challenge path through ?next=', () => {
  const next = new URL(signInPath('/', challengePath('/', 'c1')), 'https://donavencrenshaw.com').searchParams.get('next');
  assert.equal(next, '/stardust/challenge/?c=c1');
});

test('query parameters only accept exact usernames and URL-safe ids', () => {
  assert.equal(readFriendParam('?friend=nova'), 'nova');
  assert.equal(readFriendParam('?friend=%20Nova_1%20'), 'Nova_1');
  assert.equal(readFriendParam('?friend=no'), null);
  assert.equal(readFriendParam('?friend=<script>'), null);
  assert.equal(readFriendParam(''), null);
  assert.equal(readChallengeId('?c=abc-123_X'), 'abc-123_X');
  assert.equal(readChallengeId('?c='), null);
  assert.equal(readChallengeId('?c=../x'), null);
  assert.equal(readChallengeId(`?c=${'a'.repeat(65)}`), null);
});

test('the add-friend box takes a username, @username or a pasted invite link', () => {
  assert.equal(cleanUsername(' nova '), 'nova');
  assert.equal(cleanUsername('@nova'), 'nova');
  assert.equal(cleanUsername('https://donavencrenshaw.com/account/?friend=vega'), 'vega');
  assert.equal(cleanUsername('no spaces'), null);
  assert.equal(cleanUsername(''), null);
});

test('prepared messages name the time, the board and the link', () => {
  const link = 'https://donavencrenshaw.com/stardust/challenge/?c=c1';
  assert.equal(challengeMessage({ timeMs: 114692, board: 'full', link }), `Beat my Stardust time: 1:54.69 on the full network → ${link}`);
  assert.equal(challengeMessage({ timeMs: 114692, board: 'full', pilotName: 'Nova', mine: false }), 'Beat Nova’s Stardust time: 1:54.69 on the full network');
  assert.equal(challengeMessage({ timeMs: 41000, board: 'iron-veil' }), 'Beat my Stardust time: 0:41.00 on Iron Veil');
  assert.match(inviteMessage('https://x/account/?friend=nova'), /→ https:\/\/x\/account\/\?friend=nova$/);
});

test('contract error codes become plain words', () => {
  assert.match(problemText({ status: 404, data: { error: 'no_user' } }), /No pilot has that username/);
  assert.match(problemText({ status: 409, data: { error: 'already_friends' } }), /already friends/);
  assert.match(problemText({ status: 409, data: { error: 'friend_limit' } }), /friend limit/);
  assert.match(problemText({ status: 400, data: { error: 'self' } }), /That’s you/);
  assert.match(problemText({ status: 429, data: {} }), /Wait a few minutes/);
  assert.match(problemText({ status: 401, data: null }), /Sign in again/);
  assert.match(problemText({ offline: true }), /isn’t answering/);
  assert.equal(problemText({ status: 500, data: { error: 'weird_new_code' } }, 'Fallback.'), 'Fallback.');
});

test('an invite link knows when not to ask', () => {
  const me = { username: 'rook' };
  const lists = { friends: [{ username: 'nova' }], incoming: [{ id: 'r1', username: 'vega' }], outgoing: [{ id: 'r2', username: 'lyra' }], blocked: [{ username: 'spam' }] };
  assert.equal(inviteState(null, me, lists), 'none');
  assert.equal(inviteState('Rook', me, lists), 'self');
  assert.equal(inviteState('nova', me, lists), 'friends');
  assert.equal(inviteState('vega', me, lists), 'incoming');
  assert.equal(inviteState('lyra', me, lists), 'outgoing');
  assert.equal(inviteState('spam', me, lists), 'blocked');
  assert.equal(inviteState('orion', me, lists), 'ask');
  assert.equal(inviteState('orion', me, null), 'ask');
});

test('a request to someone who blocked you reads the same as any sent request', () => {
  assert.match(requestSentText({ data: { status: 'pending', request: { id: null, username: 'nova' } } }, 'nova'), /^Request sent to nova/);
  assert.match(requestSentText({ data: { status: 'pending', request: { id: 'r1', username: 'nova', displayName: 'Nova' } } }, 'nova'), /^Request sent to Nova/);
  assert.equal(requestSentText({ data: { status: 'friends', friend: { username: 'nova', displayName: 'Nova' } } }, 'nova'), 'You and Nova are friends now.');
});

test('around-me rows mark you and name the pilot to chase', () => {
  const data = {
    board: 'full', version: 1, total: 42, me: { rank: 17, timeMs: 190000 },
    entries: [
      { rank: 16, username: 'vega', displayName: 'Vega', timeMs: 188200, setAt: '2026-09-20T10:00:00Z', isMe: false },
      { rank: 17, username: 'rook', displayName: 'Rook', timeMs: 190000, setAt: '2026-09-21T10:00:00Z', isMe: true },
      { rank: 18, username: 'lyra', displayName: null, timeMs: 191000, setAt: null, isMe: false }
    ],
    next: { rank: 16, username: 'vega', displayName: 'Vega', timeMs: 188200, gapMs: 1800 }
  };
  const view = aroundMe(data);
  assert.equal(view.hasTime, true);
  assert.equal(view.total, 42);
  assert.deepEqual(view.rows.map((r) => [r.rank, r.name, r.time, r.isMe]), [[16, 'Vega', '3:08.20', false], [17, 'Rook', '3:10.00', true], [18, 'lyra', '3:11.00', false]]);
  assert.equal(view.rows[0].date, '2026-09-20');
  assert.equal(view.next.text, 'Next: Vega +1.80s');
  assert.deepEqual(aroundMe({ me: null, entries: [], next: null, total: 3 }), { hasTime: false, me: null, total: 3, rows: [], next: null });
  assert.equal(aroundMe({ me: { rank: 1, timeMs: 1 }, entries: [], next: null }).next, null);
});

test('on a friends board the next target is the row above you', () => {
  const entries = [
    { rank: 1, username: 'nova', displayName: 'Nova', timeMs: 114692, isMe: false },
    { rank: 2, username: 'rook', displayName: 'Rook', timeMs: 117792, isMe: true }
  ];
  assert.equal(nextAbove(entries).text, 'Next: Nova +3.10s');
  assert.equal(nextAbove(entries.slice(0, 1).concat({ ...entries[1], isMe: false }), 'rook').gapMs, 3100);
  assert.equal(nextAbove([{ ...entries[1], rank: 1 }]), null);
  assert.equal(nextAbove([]), null);
  assert.equal(friendlessBoard([entries[1]]), true);
  assert.equal(friendlessBoard([]), true);
  assert.equal(friendlessBoard(entries), false);
  assert.equal(boardRows([{ rank: 1, username: 'rook', timeMs: 1 }], 'rook')[0].isMe, true);
});

test('medals: next one up, nothing without medal times', () => {
  const medals = { gold: 120000, silver: 150000, bronze: 210000 };
  assert.deepEqual(nextMedal(190000, medals), { medal: 'silver', timeMs: 150000, gapMs: 40000 });
  assert.deepEqual(nextMedal(250000, medals), { medal: 'bronze', timeMs: 210000, gapMs: 40000 });
  assert.equal(nextMedal(120000, medals), null);
  assert.equal(nextMedal(190000, null), null);
  assert.equal(medalLine({ timeMs: 190000, medal: 'bronze' }, medals), 'Next medal: Silver in 40.00s (2:30.00)');
  assert.equal(medalLine({ timeMs: 110000, medal: 'gold' }, medals), 'Top medal on this board.');
  assert.equal(medalLine({ timeMs: 190000, medal: null }, null), '');
  assert.deepEqual(nextMedal(130000, { gold: 120000, silver: null, bronze: 210000 }), { medal: 'gold', timeMs: 120000, gapMs: 10000 });
  // A missing medal time is not a 0:00.00 target.
  assert.equal(nextMedal(130000, { gold: null, silver: 150000, bronze: 210000 }), null);
  assert.equal(nextMedal(null, medals), null);
});

test('splits come back in flying order with names', () => {
  const rows = splitRows({ 'iron-veil': 50000, 'alpha-relay': 21000, 'beacon-prime': 22500, 'new-level': 1000, bogus: 'x', 'nether-crossing': null });
  assert.deepEqual(rows.map((r) => [r.name, r.time]), [['Alpha Relay', '0:21.00'], ['Beacon Prime', '0:22.50'], ['Iron Veil', '0:50.00'], ['new-level', '0:01.00']]);
  assert.deepEqual(splitRows(null), []);
});

test('challenge rows for the inbox and the sent list', () => {
  const view = {
    id: 'c1', board: 'full', boardName: 'Full run', version: 1, status: 'active',
    target: { timeMs: 114692, pilot: { username: 'nova', displayName: 'Nova' } },
    from: { username: 'nova', displayName: 'Nova' }, to: { username: 'rook', displayName: 'Rook' },
    viewer: { isCreator: false, bestMs: 119000, beaten: false }, attemptsCount: 3, beatenCount: 1
  };
  const inbox = challengeRow(view, 'inbox');
  assert.equal(inbox.title, 'From Nova');
  assert.equal(inbox.target, '1:54.69');
  assert.equal(inbox.statusLabel, 'Open');
  assert.equal(inbox.detail, 'You: 1:59.00 · 4.30s behind');
  const sent = challengeRow(view, 'sent');
  assert.equal(sent.title, 'To Rook');
  assert.equal(sent.detail, '3 attempts · 1 beaten');
  const chase = challengeRow({ ...view, from: { username: 'rook', displayName: 'Rook' }, to: null, attemptsCount: 1, beatenCount: 0 }, 'sent');
  assert.equal(chase.title, 'Open link · Nova’s run');
  assert.equal(chase.detail, '1 attempt · 0 beaten');
  assert.equal(challengeRow({ ...view, viewer: { bestMs: null } }, 'inbox').detail, 'You: No attempt yet');
  assert.equal(statusLabel('outdated'), 'Track changed');
  assert.equal(statusLabel('expired'), 'Expired');
  assert.equal(versusText(113900, 114692), '1:53.90 · 0.79s faster');
});
