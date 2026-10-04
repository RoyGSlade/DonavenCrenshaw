import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';
import { cleanSponsors, buildSponsorWall, groupKeyFor, parseSponsorshipsResponse } from '../scripts/sponsors.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const render = (wall) => ejs.render(read('src/components/sponsor-wall.ejs'), {
    data: { sponsorWall: wall, support: { channels: [{ id: 'github-sponsors', url: 'https://github.com/sponsors/RoyGSlade' }] } }
});

test('tiers map to wall groups, and nothing odd gets a group', () => {
    assert.equal(groupKeyFor({ amountUSD: 100 }), 'top');
    assert.equal(groupKeyFor({ amountUSD: 250 }), 'top');
    assert.equal(groupKeyFor({ amountUSD: 25 }), 'mid');
    assert.equal(groupKeyFor({ amountUSD: 5 }), 'base');
    assert.equal(groupKeyFor({ oneTime: true }), 'thanks');
    for (const bad of [0, -5, NaN, 'lots', null, undefined]) assert.equal(groupKeyFor({ amountUSD: bad }), null);
});

test('cleaning keeps only known fields: an email can not ride along', () => {
    const [row] = cleanSponsors([{ login: 'nova', name: 'Nova', amountUSD: 25, since: '2026-10', email: 'nova@example.org', phone: '555', profile: 'Nova_1' }]);
    assert.deepEqual(Object.keys(row).sort(), ['amountUSD', 'group', 'login', 'name', 'oneTime', 'profile', 'since']);
    assert.doesNotMatch(JSON.stringify(row), /nova@|555/);
});

test('bad rows are skipped, names are trimmed and de-fanged, duplicates collapse', () => {
    const rows = cleanSponsors([
        { login: 'ok-one', name: '  Ok‮One\u0000 ', amountUSD: 5 },
        { login: 'OK-ONE', name: 'dup', amountUSD: 100 },
        { login: '-bad', amountUSD: 5 },
        { login: 'has space', amountUSD: 5 },
        { login: 'x'.repeat(40), amountUSD: 5 },
        { login: 'free', amountUSD: 0 },
        { login: 'late', amountUSD: 5, since: '2026-13' },
        { login: 'prof', amountUSD: 5, profile: 'no spaces allowed' },
        null, 'text', 7
    ]);
    assert.deepEqual(rows.map((r) => r.login), ['ok-one', 'late', 'prof']);
    assert.equal(rows[0].name, 'OkOne');
    assert.equal(rows[1].since, null);
    assert.equal(rows[2].profile, null);
    assert.deepEqual(cleanSponsors('nope'), []);
    assert.deepEqual(cleanSponsors(undefined), []);
});

test('the wall orders groups biggest first and links profiles only when valid', () => {
    const wall = buildSponsorWall({ sponsors: [
        { login: 'small', amountUSD: 5 },
        { login: 'big', name: 'Big Co', amountUSD: 100, profile: 'Nova_1' },
        { login: 'gift', oneTime: true },
        { login: 'mid', amountUSD: 25 }
    ] }, { basePath: '/' });
    assert.deepEqual(wall.groups.map((g) => g.key), ['top', 'mid', 'base', 'thanks']);
    assert.equal(wall.total, 4);
    assert.equal(wall.groups[0].items[0].githubUrl, 'https://github.com/big');
    assert.equal(wall.groups[0].items[0].profileUrl, '/u/?name=Nova_1');
    assert.equal(wall.groups[1].items[0].profileUrl, null);
});

test('an empty list renders an invitation, not an empty box', () => {
    const html = render(buildSponsorWall({ sponsors: [] }));
    assert.match(html, /Be the first name here/);
    assert.match(html, /href="https:\/\/github\.com\/sponsors\/RoyGSlade"/);
    assert.doesNotMatch(html, /sponsor-tier/);
});

test('hostile names print as text and the page carries no email', () => {
    const html = render(buildSponsorWall({ sponsors: [
        { login: 'evil', name: '<script>alert(1)</script><img src=x onerror=alert(2)>', amountUSD: 100, email: 'leak@example.com' }
    ] }));
    assert.doesNotMatch(html, /<script|<img/i);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /leak@|@example/);
});

test('GitHub answers: only public sponsors count, stopped monthly ones drop, gifts stay as thanks', () => {
    const entity = (login, name) => ({ login, name });
    const rows = parseSponsorshipsResponse({ data: { viewer: { sponsorshipsAsMaintainer: { nodes: [
        { privacyLevel: 'PUBLIC', isActive: true, isOneTimePayment: false, createdAt: '2026-10-04T08:00:00Z', tier: { monthlyPriceInDollars: 25 }, sponsorEntity: entity('pub', 'Pub Person') },
        { privacyLevel: 'PRIVATE', isActive: true, isOneTimePayment: false, createdAt: '2026-10-04T08:00:00Z', tier: { monthlyPriceInDollars: 100 }, sponsorEntity: entity('shy', 'Shy') },
        { privacyLevel: 'PUBLIC', isActive: false, isOneTimePayment: false, createdAt: '2026-09-01T08:00:00Z', tier: { monthlyPriceInDollars: 5 }, sponsorEntity: entity('gone', null) },
        { privacyLevel: 'PUBLIC', isActive: false, isOneTimePayment: true, createdAt: '2026-09-02T08:00:00Z', tier: { monthlyPriceInDollars: 10 }, sponsorEntity: entity('gift', 'Gifter') },
        { privacyLevel: 'PUBLIC', isActive: true, isOneTimePayment: false, createdAt: '2026-10-01T08:00:00Z', tier: { monthlyPriceInDollars: 5 }, sponsorEntity: null }
    ] } } } });
    assert.deepEqual(rows.map((r) => r.login), ['pub', 'gift']);
    assert.deepEqual(rows[0], { login: 'pub', name: 'Pub Person', amountUSD: 25, oneTime: false, since: '2026-10' });
    assert.equal(rows[1].oneTime, true);
    assert.deepEqual(parseSponsorshipsResponse({ errors: [] }), []);
    assert.deepEqual(parseSponsorshipsResponse(null), []);
});

test('the committed data file is valid and holds no email', () => {
    const file = JSON.parse(read('data/sponsors.json'));
    assert.equal(file.schemaVersion, 1);
    assert.equal(cleanSponsors(file.sponsors).length, file.sponsors.length);
    assert.doesNotMatch(JSON.stringify(file), /e-?mail/i);
});

test('the support page asks for the wall, the sync is read-only, and privacy says what is shown', () => {
    assert.match(read('content/support.md'), /^sponsor_wall: true$/m);
    assert.match(read('src/layouts/default.ejs'), /frontmatter\.sponsor_wall/);
    const sync = read('scripts/sync-sponsors.mjs');
    assert.match(sync, /includePrivate: false/);
    assert.doesNotMatch(sync, /\bmutation\b|\bPOST\b|--method/i);
    assert.match(read('content/privacy.md'), /\*\*Sponsors:\*\*[^\n]*Private sponsorships are never listed, and no email address is stored or shown/);
});

test('the sync pages through GitHub, keeps linked profiles, and drops anyone no longer public', async () => {
    const { collect } = await import('../scripts/sync-sponsors.mjs');
    const node = (login, price, extra = {}) => ({ privacyLevel: 'PUBLIC', isActive: true, isOneTimePayment: false, createdAt: '2026-10-04T00:00:00Z', tier: { monthlyPriceInDollars: price }, sponsorEntity: { login, name: login }, ...extra });
    const pages = [
        { data: { viewer: { sponsorshipsAsMaintainer: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [node('Nova', 100), node('shy', 25, { privacyLevel: 'PRIVATE' })] } } } },
        { data: { viewer: { sponsorshipsAsMaintainer: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node('vega', 5)] } } } }
    ];
    const asked = [];
    const rows = collect((after) => { asked.push(after); return pages[asked.length - 1]; }, { sponsors: [
        { login: 'nova', amountUSD: 100, profile: 'Nova_1' },
        { login: 'cancelled-person', amountUSD: 25, profile: 'Gone_1' }
    ] });
    assert.deepEqual(asked, [null, 'c1']);
    assert.deepEqual(rows.map((r) => [r.login, r.group, r.profile]), [['Nova', 'top', 'Nova_1'], ['vega', 'base', null]]);
    assert.throws(() => collect(() => ({ errors: [{ type: 'INSUFFICIENT_SCOPES' }] }), { sponsors: [] }), /INSUFFICIENT_SCOPES/);
});
