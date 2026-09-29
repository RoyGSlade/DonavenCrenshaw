import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  profilePath, readProfileName, avatarIndex, avatarSrc, monogram, titleChip, rarityOf, sortTitles, lockedTitles,
  profileView, weeklyBoardText, weeklyBoardMeta, commentRow, commentRows, commentProblem, countdownParts, countdownWords, ordinal
} from '../scripts/profile.js';
import { boardRows } from '../scripts/social.js';

const AVATARS = JSON.parse(fs.readFileSync(new URL('../data/avatars.json', import.meta.url), 'utf8'));
const HUB = 'https://api.donavencrenshaw.com';

test('data/avatars.json is the id → image map: twelve presets, every file present', () => {
  const ids = ['pilot-nova', 'pilot-comet', 'pilot-vega', 'pilot-orion', 'pilot-lyra', 'pilot-draco', 'pilot-atlas', 'pilot-ember', 'pilot-frost', 'pilot-void', 'pilot-sol', 'pilot-nebula'];
  assert.deepEqual(AVATARS.map((a) => a.id), ids);
  for (const avatar of AVATARS) {
    assert.ok(avatar.name, `${avatar.id} has a name`);
    assert.ok(fs.existsSync(new URL(`../${avatar.file}`, import.meta.url)), `${avatar.file} exists`);
  }
  assert.equal(avatarIndex(AVATARS).size, 12);
});

test('profile links use ?name= and only for real usernames', () => {
  assert.equal(profilePath('/', 'Roy_G_Slade'), '/u/?name=Roy_G_Slade');
  assert.equal(profilePath('/DonavenCrenshaw/', 'nova'), '/DonavenCrenshaw/u/?name=nova');
  assert.equal(profilePath('DonavenCrenshaw', 'nova-1'), '/DonavenCrenshaw/u/?name=nova-1');
  assert.equal(profilePath('/', 'no'), null);
  assert.equal(profilePath('/', 'a b'), null);
  assert.equal(profilePath('/', undefined), null);
  assert.equal(profilePath('/', '<script>'), null);
});

test('the profile page reads one exact username from ?name=', () => {
  assert.equal(readProfileName('?name=nova'), 'nova');
  assert.equal(readProfileName('?name=%20Nova_1%20'), 'Nova_1');
  assert.equal(readProfileName('?name=%40vega'), 'vega');
  assert.equal(readProfileName('?name=no'), null);
  assert.equal(readProfileName('?name=../x'), null);
  assert.equal(readProfileName(`?name=${'a'.repeat(21)}`), null);
  assert.equal(readProfileName(''), null);
});

test('avatar src: preset from the data file, else an upload on the hub, else the monogram', () => {
  assert.deepEqual(avatarSrc({ avatarPreset: 'pilot-vega' }, { avatars: AVATARS, base: '/', hub: HUB }),
    { kind: 'preset', src: '/assets/images/avatars/pilot-vega.svg', id: 'pilot-vega', name: 'Vega' });
  assert.equal(avatarSrc({ avatarPreset: 'pilot-vega' }, { avatars: AVATARS, base: '/DonavenCrenshaw/', hub: HUB }).src, '/DonavenCrenshaw/assets/images/avatars/pilot-vega.svg');
  // A later swap to .png is a data change only.
  const swapped = AVATARS.map((a) => (a.id === 'pilot-vega' ? { ...a, file: 'assets/images/avatars/pilot-vega.png' } : a));
  assert.equal(avatarSrc({ avatarPreset: 'pilot-vega' }, { avatars: swapped }).src, '/assets/images/avatars/pilot-vega.png');
  // Preset wins over an upload; unknown or null presets fall through.
  assert.equal(avatarSrc({ avatarPreset: 'pilot-sol', avatarUrl: '/uploads/avatars/x.png' }, { avatars: AVATARS, hub: HUB }).kind, 'preset');
  assert.deepEqual(avatarSrc({ avatarPreset: 'pilot-unknown', avatarUrl: '/uploads/avatars/x.png' }, { avatars: AVATARS, hub: HUB }),
    { kind: 'upload', src: `${HUB}/uploads/avatars/x.png` });
  assert.equal(avatarSrc({ avatarPreset: null, avatarUrl: `${HUB}/uploads/avatars/y.webp` }, { avatars: AVATARS, hub: HUB }).src, `${HUB}/uploads/avatars/y.webp`);
  // Never a third-party host, a protocol-relative URL or a path escape.
  assert.equal(avatarSrc({ avatarUrl: 'https://tracker.example/p.gif' }, { avatars: AVATARS, hub: HUB }), null);
  assert.equal(avatarSrc({ avatarUrl: '//tracker.example/p.gif' }, { avatars: AVATARS, hub: HUB }), null);
  assert.equal(avatarSrc({ avatarUrl: '/uploads/../x' }, { avatars: AVATARS, hub: HUB }), null);
  assert.equal(avatarSrc({ avatarUrl: 'javascript:alert(1)' }, { avatars: AVATARS, hub: HUB }), null);
  assert.equal(avatarSrc({ avatarPreset: null }, { avatars: AVATARS, hub: HUB }), null);
  assert.equal(avatarSrc(null, { avatars: AVATARS }), null);
  // Malformed data entries are ignored rather than trusted.
  assert.equal(avatarIndex([{ id: 'x', name: 'X', file: 'https://evil.example/x.svg' }, { id: 'Bad Id', file: 'assets/images/avatars/a.svg' }]).size, 0);
});

test('the monogram is the first letter of the shown name', () => {
  assert.equal(monogram({ displayName: 'nova', username: 'n0va' }), 'N');
  assert.equal(monogram({ username: 'vega' }), 'V');
  assert.equal(monogram({ name: 'Roy_G_Slade' }), 'R');
  assert.equal(monogram({}), '?');
});

test('title chips whitelist the rarity so it is safe in a class name', () => {
  assert.deepEqual(titleChip({ id: 'weekly-01-champion', title: 'Week 1 Champion', rarity: 'unique' }),
    { id: 'weekly-01-champion', text: 'Week 1 Champion', rarity: 'unique', label: 'Unique title: Week 1 Champion', className: 'pilot-chip pilot-chip--unique' });
  assert.equal(titleChip({ title: 'Odd', rarity: 'x" onmouseover="alert(1)' }).className, 'pilot-chip pilot-chip--common');
  assert.equal(titleChip({ title: 'Odd', rarity: 'LEGENDARY' }).rarity, 'common');
  assert.equal(titleChip(null), null);
  assert.equal(titleChip({ title: '   ', rarity: 'rare' }), null);
  assert.equal(rarityOf('epic'), 'epic');
});

test('earned titles sort rarest first; locked ones keep hidden titles secret', () => {
  const sorted = sortTitles([{ id: 'a', title: 'Zeta', rarity: 'common' }, { id: 'b', title: 'Alpha', rarity: 'legendary' }, { id: 'c', title: 'Mid', rarity: 'unique' }]);
  assert.deepEqual(sorted.map((t) => t.id), ['c', 'b', 'a']);
  const all = [
    { id: 'wingmate', title: 'Wingmate', description: 'Make your first friend.', rarity: 'common', hidden: false, holders: 4 },
    { id: 'gatecrasher', title: '???', description: null, rarity: 'epic', hidden: true, hint: 'The map ends before the sky does.', holders: 0 },
    { id: 'first-blood', title: 'First Blood', description: 'Win a duel.', rarity: 'common', hidden: false }
  ];
  const locked = lockedTitles(all, [{ id: 'first-blood' }]);
  assert.deepEqual(locked.map((t) => t.id), ['gatecrasher', 'wingmate']);
  assert.deepEqual(locked[0], { id: 'gatecrasher', title: '???', rarity: 'epic', text: 'The map ends before the sky does.', secret: true, holders: 0 });
  assert.equal(locked[1].text, 'Make your first friend.');
  assert.equal(locked[1].secret, false);
});

test('a public profile shows everything; a private one only the card and placements', () => {
  const pub = profileView({
    username: 'nova', displayName: 'Nova', avatarPreset: 'pilot-nova', title: { id: 't', title: 'Hat Trick', rarity: 'epic' },
    joinedAt: '2026-09-01T12:00:00Z', isPublic: true, bio: 'Hi', titles: [{ id: 't', title: 'Hat Trick', rarity: 'epic' }, { id: 'u', title: 'Week 1 Champion', rarity: 'unique' }],
    stardust: { bests: [{ board: 'iron-veil', name: 'Iron Veil', timeMs: 41000, rank: 2 }, { board: 'full', name: 'Full run', timeMs: 114692, rank: 1, setAt: '2026-09-27T15:57:56Z' }] },
    dogfight: { wins: 7, losses: 3 }, events: [{ id: 'weekly-01', name: 'Week 1 — Gantry Drop', rank: 2, timeMs: 61230 }], staff: false
  });
  assert.equal(pub.name, 'Nova');
  assert.equal(pub.joined, 'Joined September 2026');
  assert.equal(pub.showDetails, true);
  assert.equal(pub.ownPrivate, false);
  assert.deepEqual(pub.titles.map((c) => c.text), ['Week 1 Champion', 'Hat Trick']);
  assert.deepEqual(pub.bests.map((b) => [b.board, b.time, b.rank]), [['full', '1:54.69', '#1'], ['iron-veil', '0:41.00', '#2']]);
  assert.deepEqual(pub.dogfight, { wins: 7, losses: 3, text: '7–3', played: 10 });
  assert.deepEqual(pub.events, [{ id: 'weekly-01', name: 'Week 1 — Gantry Drop', place: '2nd', podium: true, time: '1:01.23' }]);
  assert.deepEqual(pub.devTimes, []);

  const priv = profileView({ username: 'vega', displayName: 'vega', avatarPreset: null, title: null, joinedAt: 'bad', isPublic: false, events: [], staff: false });
  assert.equal(priv.showDetails, false);
  assert.equal(priv.ownPrivate, false);
  assert.equal(priv.chip, null);
  assert.equal(priv.joined, '');
  assert.deepEqual(priv.bests, []);
  assert.equal(priv.dogfight, null);

  // The owner looking at their own private profile gets the details, flagged.
  const own = profileView({ username: 'vega', isPublic: false, bio: '', titles: [], stardust: { bests: [] }, dogfight: { wins: 0, losses: 0 }, events: [] });
  assert.equal(own.showDetails, true);
  assert.equal(own.ownPrivate, true);
});

test('staff profiles carry dev times; nobody else does, even if the hub sent some', () => {
  const staff = profileView({ username: 'Roy_G_Slade', isPublic: true, staff: true, devTimes: [{ board: 'weekly-01', name: 'Week 1 · Gantry Drop', timeMs: 52345, setAt: '2026-09-29T10:00:00Z' }] });
  assert.deepEqual(staff.devTimes, [{ board: 'weekly-01', name: 'Week 1 · Gantry Drop', time: '0:52.34', date: '2026-09-29' }]);
  assert.equal(staff.staff, true);
  const pilot = profileView({ username: 'nova', isPublic: true, staff: false, devTimes: [{ board: 'weekly-01', timeMs: 1 }] });
  assert.deepEqual(pilot.devTimes, []);
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(12), '12th');
  assert.equal(ordinal(23), '23rd');
  assert.equal(ordinal(0), '');
});

test('board rows carry avatar and title for the row renderer, and degrade without them', () => {
  const [row, bare] = boardRows([
    { rank: 1, username: 'nova', displayName: 'Nova', timeMs: 61230, setAt: '2026-09-30T02:00:00Z', avatarPreset: 'pilot-nova', title: { id: 't', title: 'Hat Trick', rarity: 'epic' } },
    { rank: 2, username: 'vega', timeMs: 62000 }
  ], 'vega');
  assert.deepEqual([row.avatarPreset, row.title.title, row.isMe], ['pilot-nova', 'Hat Trick', false]);
  assert.deepEqual([bare.avatarPreset, bare.avatarUrl, bare.title, bare.name, bare.isMe], [null, null, null, 'vega', true]);
});

test('weekly board wording follows the event state', () => {
  assert.equal(weeklyBoardText('upcoming', 0), 'Board opens with the track.');
  assert.equal(weeklyBoardText('upcoming', 5), 'Board opens with the track.');
  assert.equal(weeklyBoardText('live', 3), '');
  assert.match(weeklyBoardText('live', 0), /No times yet/);
  assert.match(weeklyBoardText('closed', 0), /closed with no finished runs/);
  assert.equal(weeklyBoardMeta('upcoming'), 'Opens with the track');
  assert.equal(weeklyBoardMeta('live'), 'Live · refreshes every minute');
  assert.equal(weeklyBoardMeta('closed'), 'Closed · final standings');
  assert.equal(weeklyBoardMeta('live', { live: false }), 'Hub asleep · try again soon');
});

test('the countdown splits into clock segments and words', () => {
  assert.deepEqual(countdownParts(51509564), [{ value: '14', unit: 'hrs' }, { value: '18', unit: 'min' }, { value: '30', unit: 'sec' }]);
  assert.deepEqual(countdownParts(7 * 86400000).map((p) => `${p.value} ${p.unit}`), ['7 days', '00 hrs', '00 min', '00 sec']);
  assert.deepEqual(countdownParts(86400000 + 1000).map((p) => p.value), ['1', '00', '00', '01']);
  assert.equal(countdownParts(86400000 + 1000)[0].unit, 'day');
  assert.deepEqual(countdownParts(-5).map((p) => p.value), ['00', '00', '00']);
  assert.equal(countdownWords(51509564), '14 hours, 18 minutes');
  assert.equal(countdownWords(86400000 + 60000), '1 day, 0 hours, 1 minute');
});

test('comment rows: newest first, author link only for real usernames, delete only your own', () => {
  const me = { username: 'Nova', role: 'USER' };
  const data = { items: [
    { id: 'c1', page: 'stardust-weekly-01', name: 'Vega', text: 'gl', createdAt: '2026-09-29T20:00:00Z', author: { username: 'vega', displayName: 'Vega', avatarPreset: 'pilot-vega', title: { id: 't', title: 'Hat Trick', rarity: 'epic' } } },
    { id: 'c2', page: 'stardust-weekly-01', name: 'nova', text: 'mine', createdAt: '2026-09-30T08:00:00Z', author: { username: 'nova', displayName: 'nova', avatarPreset: null, title: null } },
    { id: 'c3', page: 'stardust-weekly-01', name: 'Old timer', text: 'from before authors', createdAt: '2026-09-28T08:00:00Z', author: null },
    { id: 'c4', text: 42 }
  ] };
  const rows = commentRows(data, me, { base: '/' });
  assert.deepEqual(rows.map((r) => r.id), ['c2', 'c1', 'c3']);
  assert.equal(rows[0].canDelete, true);
  assert.equal(rows[1].canDelete, false);
  assert.equal(rows[1].href, '/u/?name=vega');
  assert.equal(rows[1].chip.rarity, 'epic');
  assert.equal(rows[1].pilot.avatarPreset, 'pilot-vega');
  assert.equal(rows[1].date, '2026-09-29');
  assert.deepEqual([rows[2].name, rows[2].href, rows[2].username, rows[2].canDelete], ['Old timer', null, null, false]);
  assert.equal(commentRow({ id: 'c9', text: 'x', author: { username: 'vega' } }, { username: 'x', role: 'ADMIN' }).canDelete, true);
  assert.equal(commentRow({ id: 'c9', text: 'x' }, null).canDelete, false);
  assert.equal(commentRow({ id: '../bad', text: 'x', author: { username: 'nova' } }, me).canDelete, false);
  assert.deepEqual(commentRows(null, me), []);
});

test('comment errors are plain words, and a missing display name says where to fix it', () => {
  assert.match(commentProblem({ ok: false, status: 400, data: { error: 'display_name_required' } }), /display name on your account page/);
  assert.match(commentProblem({ ok: false, status: 400, data: { error: 'invalid_text' } }), /1000 characters/);
  assert.match(commentProblem({ ok: false, status: 401, data: null }), /Sign in again/);
  assert.match(commentProblem({ ok: false, status: 429, data: {} }), /Wait a few minutes/);
  assert.match(commentProblem({ ok: false, offline: true }), /isn’t answering/);
});
