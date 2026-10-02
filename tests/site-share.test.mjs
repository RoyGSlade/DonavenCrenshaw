// The leaderboard's "Copy" menu (fly this ship, use their settings) and the
// account switch behind it. The button logic is scripts/ship-info.js shareActions;
// ship-ui.js and pilot-ui.js only draw what it says.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shareActions } from '../scripts/ship-info.js';
import { boardRows } from '../scripts/social.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ship = { build: 'manta:0-2-1-0', family: 'manta' };

test('a row with a public ship offers "Fly this ship", pointing at the game with an import', () => {
  assert.deepEqual(shareActions({ username: 'Nova_Ace', ship }, '/'), [
    { kind: 'ship', label: 'Fly this ship', href: '/games/stardust/?import=ship&from=Nova_Ace' }
  ]);
});

test('a row whose pilot opted in offers "Use their settings", with or without a ship', () => {
  assert.deepEqual(shareActions({ username: 'Ada', ship, hasSettings: true }, '/').map((a) => a.kind), ['ship', 'settings']);
  assert.deepEqual(shareActions({ username: 'Ada', ship: null, hasSettings: true }, '/'), [
    { kind: 'settings', label: 'Use their settings', href: '/games/stardust/?import=settings&from=Ada' }
  ]);
});

test('no ship and no opt-in means no buttons; hasSettings must be exactly true', () => {
  assert.deepEqual(shareActions({ username: 'Ada' }, '/'), []);
  assert.deepEqual(shareActions({ username: 'Ada', ship: null, hasSettings: false }, '/'), []);
  for (const junk of ['true', 1, {}, [], null, undefined]) assert.deepEqual(shareActions({ username: 'Ada', hasSettings: junk }, '/'), [], String(junk));
  // A ship the site cannot name (unknown family) is not a ship to copy.
  assert.deepEqual(shareActions({ username: 'Ada', ship: { family: 'hauler', build: 'hauler:0-0-0-0' } }, '/'), []);
});

test('your own row has no buttons, and a username the hub could not have issued gets none', () => {
  assert.deepEqual(shareActions({ username: 'Ada', ship, hasSettings: true, isMe: true }, '/'), []);
  for (const username of ['', 'ab', 'a'.repeat(21), 'a b', 'a/b', '<x>', 'a&import=settings', undefined, null, 5]) {
    assert.deepEqual(shareActions({ username, ship, hasSettings: true }, '/'), [], String(username));
  }
});

test('links honour the site base path, and the username is escaped into the query', () => {
  assert.equal(shareActions({ username: 'Ada', ship }, '/site/')[0].href, '/site/games/stardust/?import=ship&from=Ada');
  assert.equal(shareActions({ username: 'Ada', ship }, 'site')[0].href, '/site/games/stardust/?import=ship&from=Ada');
  assert.equal(shareActions({ username: 'Ada', ship })[0].href, '/games/stardust/?import=ship&from=Ada');
});

test('board rows carry hasSettings as a strict boolean', () => {
  const rows = boardRows([
    { rank: 1, username: 'a1', timeMs: 1, hasSettings: true },
    { rank: 2, username: 'b2', timeMs: 2 },
    { rank: 3, username: 'c3', timeMs: 3, hasSettings: 'yes' },
    { rank: 4, username: 'd4', timeMs: 4, hasSettings: false }
  ], null);
  assert.deepEqual(rows.map((r) => r.hasSettings), [true, false, false, false]);
});

test('every board draws the menu through the one shared row, so stardust, weekly and challenge pages all get it', () => {
  const pilotUi = read('scripts/pilot-ui.js');
  assert.match(pilotUi, /shareMenu/);
  for (const page of ['scripts/stardust-boards.js', 'scripts/stardust-weekly.js', 'scripts/stardust-challenge.js']) {
    assert.match(read(page), /\.boardList\(/, `${page} draws rows with the shared boardList`);
  }
  // The menu is plain links; nothing is changed from the leaderboard itself.
  const ui = read('scripts/ship-ui.js');
  assert.match(ui, /node\('a', 'sd-share-link'/);
  assert.doesNotMatch(ui, /method:\s*['"](PUT|POST|DELETE)/);
  // The pilot profile's ship card links the same import.
  assert.match(read('scripts/pilot-profile.js'), /shareActions/);
  assert.match(read('src/layouts/pilot-profile.ejs'), /data-pf-fly-ship/);
});

test('the account page has a Flight settings switch that starts off, and works with a private profile', () => {
  const page = read('src/layouts/account.ejs');
  assert.match(page, /'settings', 'Flight settings', 'Let others copy my flight settings from the leaderboards\./);
  const account = read('scripts/account.js');
  assert.match(account, /settings: 'Flight settings'/);
  assert.match(account, /OPT_IN = \['settings'\]/);
  assert.match(account, /show\[key\] === true/, 'a missing key is off for an opt-in section');
  assert.match(account, /STANDALONE = \['events', 'settings'\]/);
});

test('the privacy page says what ship and settings sharing shares, and that settings are opt-in', () => {
  const privacy = read('content/privacy.md');
  assert.match(privacy, /Flight settings/);
  assert.match(privacy, /shared with nobody unless you switch on/);
  assert.match(privacy, /Never an uploaded image, never text you typed/);
});
