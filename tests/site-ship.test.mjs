import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  familyName, parseBuild, shipFamily, shipChip, shipSummary, clientBadge, DEVICE_ICON
} from '../scripts/ship-info.js';
import { profileView, PROFILE_SECTIONS } from '../scripts/profile.js';
import { boardRows, createHub, socialApi } from '../scripts/social.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The game's own part names (projects/Space-Shooter/systems/shipLivery.js), read from the source
// so this test notices if the game's list and the site's wording drift apart.
const { PART_CHOICES } = await import(new URL('../projects/Space-Shooter/systems/shipLivery.js', import.meta.url));

test('device badges say where and how a run was flown, and ignore anything unknown', () => {
  assert.deepEqual(clientBadge({ device: 'phone', input: 'tilt', build: '1.4.2' }), { device: 'phone', input: 'tilt', label: 'Flown on a phone with tilt' });
  assert.equal(clientBadge({ device: 'desktop', input: 'keyboard' }).label, 'Flown on a desktop with keyboard');
  assert.equal(clientBadge({ device: 'tablet', input: 'touch' }).label, 'Flown on a tablet with touch');
  assert.equal(clientBadge({ device: 'desktop', input: 'controller' }).label, 'Flown on a desktop with controller');
  // input is optional; device is not.
  assert.equal(clientBadge({ device: 'desktop' }).label, 'Flown on a desktop');
  assert.equal(clientBadge({ device: 'desktop', input: 'voice' }).label, 'Flown on a desktop');
  assert.equal(clientBadge({ input: 'tilt' }), null);
  assert.equal(clientBadge({ device: 'toaster' }), null);
  assert.equal(clientBadge({ device: '__proto__' }), null);
  assert.equal(clientBadge({ device: 'constructor' }), null);
  assert.equal(clientBadge(null), null);
  assert.equal(clientBadge('phone'), null);
  assert.equal(clientBadge(undefined), null);
  // Every device has an icon to draw.
  for (const device of ['desktop', 'phone', 'tablet']) assert.ok(DEVICE_ICON[device].length >= 1, device);
});

test('ship chips name the family from the row, its build key or its appearance', () => {
  assert.deepEqual(shipChip({ build: 'needle:0-1-2-0', family: 'needle' }), { family: 'needle', text: 'Needle', label: 'Flying the Needle' });
  assert.equal(shipChip({ family: 'manta' }).text, 'Manta');
  assert.equal(shipChip({ family: 'wisp' }).text, 'Wisp');
  assert.equal(shipChip({ family: 'courier' }).text, 'Courier');
  assert.equal(shipChip({ build: 'wisp:2-2-2-2' }).family, 'wisp');
  assert.equal(shipChip({ appearance: { family: 'manta' } }).family, 'manta');
  assert.equal(shipChip({ family: 'hauler' }), null);
  assert.equal(shipChip({ family: '__proto__' }), null);
  assert.equal(shipChip({}), null);
  assert.equal(shipChip(null), null);
  assert.equal(shipFamily({ family: 'hauler', build: 'manta:0-0-0-0' }), 'manta');
  assert.equal(familyName('toString'), null);
});

test('build keys parse to part indices, and only real ones', () => {
  assert.deepEqual(parseBuild('needle:0-1-2-0'), { family: 'needle', parts: { body: 0, wings: 1, cockpit: 2, engines: 0 } });
  assert.equal(parseBuild('needle:0-1-2'), null);
  assert.equal(parseBuild('hauler:0-0-0-0'), null);
  assert.equal(parseBuild('needle:0-0-0-0<script>'), null);
  assert.equal(parseBuild(undefined), null);
});

test('the build reads as family and part names from the game’s own list', () => {
  const ship = { build: 'needle:0-1-2-0', family: 'needle', appearance: { family: 'needle', parts: { body: 0, wings: 1, cockpit: 2, engines: 0 } } };
  const summary = shipSummary(ship, PART_CHOICES);
  assert.equal(summary.name, 'Needle');
  assert.deepEqual(summary.parts.map((p) => [p.slot, p.name]), [['body', 'Spear'], ['wings', 'Talon'], ['cockpit', 'Split'], ['engines', 'Torch']]);
  assert.equal(summary.text, 'Needle: Spear body, Talon wings, Split cockpit, Torch engines');
  // From the build key alone when there is no appearance.
  assert.equal(shipSummary({ build: 'manta:2-0-1-2', family: 'manta' }, PART_CHOICES).text, 'Manta: Citadel body, Crescent wings, Diamond cockpit, Quad engines');
  // Without the game's list, or for an index it doesn't have, the family still reads.
  assert.equal(shipSummary(ship).text, 'Needle');
  assert.equal(shipSummary({ family: 'courier', build: 'courier:2-2-2-2' }, PART_CHOICES).text, 'Courier: Bulwark wings, Bulwark cockpit');
  assert.equal(shipSummary({}, PART_CHOICES), null);
});

test('board rows pass the optional ship and client through, and stay bare without them', () => {
  const [full, bare, junk] = boardRows([
    { rank: 1, username: 'nova', timeMs: 61230, ship: { build: 'needle:0-0-0-0', family: 'needle' }, client: { device: 'phone', input: 'tilt', build: '1.0.0' } },
    { rank: 2, username: 'vega', timeMs: 62000 },
    { rank: 3, username: 'lyra', timeMs: 63000, ship: 'needle', client: 7 }
  ], 'vega');
  assert.deepEqual(full.ship, { build: 'needle:0-0-0-0', family: 'needle' });
  assert.deepEqual(full.client, { device: 'phone', input: 'tilt', build: '1.0.0' });
  assert.deepEqual([bare.ship, bare.client], [null, null]);
  assert.deepEqual([junk.ship, junk.client], [null, null]);
});

test('profile sections exist only when the hub sent them with something in them', () => {
  // Another pilot: bio, dogfight and ship hidden, so the keys are simply absent.
  const other = profileView({
    username: 'nova', displayName: 'Nova', isPublic: true, joinedAt: '2026-09-01T12:00:00Z',
    titles: [{ id: 't', title: 'Hat Trick', rarity: 'epic' }],
    stardust: { bests: [{ board: 'full', name: 'Full run', timeMs: 114692, rank: 1 }] },
    events: [], staff: false
  });
  assert.deepEqual(other.has, { bio: false, titles: true, bests: true, dogfight: false, events: false, ship: false });
  assert.equal(other.any, true);
  assert.equal(other.ship, null);
  assert.deepEqual(other.onlyYou, []);

  // Shown but empty counts as absent: no heading over nothing.
  const empty = profileView({ username: 'vega', isPublic: true, bio: null, titles: [], stardust: { bests: [] }, dogfight: { wins: 0, losses: 0 }, events: [] });
  assert.equal(empty.any, false);
  assert.deepEqual(Object.values(empty.has), [false, false, false, false, false, false]);

  // A private profile still carries event results, and nothing else.
  const priv = profileView({ username: 'lyra', isPublic: false, events: [{ id: 'weekly-01', name: 'Week 1', rank: 3, timeMs: 61000 }] });
  assert.equal(priv.has.events, true);
  assert.equal(priv.any, true);
  assert.equal(priv.showDetails, false);
  assert.equal(priv.ownPrivate, false);

  // A ship needs a known family to be drawn; a hub that sends junk shows none.
  assert.equal(profileView({ username: 'a1b', isPublic: true, ship: { build: 'x', family: 'hauler' } }).has.ship, false);
  const withShip = profileView({ username: 'a1b', isPublic: true, ship: { build: 'wisp:0-0-0-0', family: 'wisp', appearance: { family: 'wisp' } } });
  assert.equal(withShip.has.ship, true);
  assert.equal(withShip.ship.family, 'wisp');
});

test('the owner sees every section, marked “only you” where others can not', () => {
  const show = { bio: true, titles: false, bests: true, dogfight: true, events: true, ship: true, devices: true };
  const own = profileView({
    username: 'nova', isPublic: true, profileShow: show, bio: 'Hi',
    titles: [{ id: 't', title: 'Hat Trick', rarity: 'epic' }], stardust: { bests: [{ board: 'full', timeMs: 1 }] },
    dogfight: { wins: 2, losses: 1 }, events: [{ id: 'weekly-01', name: 'Week 1', rank: 1, timeMs: 5 }],
    ship: { build: 'needle:0-0-0-0', family: 'needle', appearance: { family: 'needle' } }
  });
  assert.equal(own.isOwner, true);
  assert.deepEqual(own.onlyYou, ['titles']);
  assert.equal(own.ownPrivate, false);

  // A private profile: everything but event results is only for the owner.
  const ownPrivate = profileView({
    username: 'nova', isPublic: false, profileShow: { ...show, titles: true }, bio: 'Hi',
    titles: [{ id: 't', title: 'Hat Trick', rarity: 'epic' }], events: [{ id: 'weekly-01', name: 'Week 1', rank: 1, timeMs: 5 }]
  });
  assert.equal(ownPrivate.ownPrivate, true);
  assert.deepEqual(ownPrivate.onlyYou, ['bio', 'titles']);
  assert.deepEqual(PROFILE_SECTIONS, ['bio', 'titles', 'bests', 'dogfight', 'events', 'ship']);
});

test('each profile switch saves on its own: only that key is sent', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ path: url.slice('https://hub.example/api'.length), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    return { ok: true, status: 200, json: async () => ({ user: { profileShow: {} } }) };
  };
  const api = socialApi(createHub('https://hub.example', { fetchImpl }));
  await api.setProfileShow('ship', false);
  await api.setProfileShow('devices', true);
  await api.setProfilePublic(true);
  await api.account();
  await api.myShip();
  await api.liveries('Nova_1');
  await api.liveries();
  assert.deepEqual(calls, [
    { path: '/users/profile', method: 'PUT', body: { profileShow: { ship: false } } },
    { path: '/users/profile', method: 'PUT', body: { profileShow: { devices: true } } },
    { path: '/users/profile', method: 'PUT', body: { profilePublic: true } },
    { path: '/users/me', method: 'GET', body: undefined },
    { path: '/stardust/ship', method: 'GET', body: undefined },
    { path: '/stardust/liveries?artist=Nova_1', method: 'GET', body: undefined },
    { path: '/stardust/liveries', method: 'GET', body: undefined }
  ]);
});

test('the account page has one switch per section the hub knows, and no upload or free text for ships', () => {
  const page = read('src/layouts/account.ejs');
  for (const key of ['bio', 'titles', 'bests', 'dogfight', 'events', 'ship', 'devices']) {
    assert.ok(page.includes(`'${key}'`), `${key} has a switch`);
  }
  assert.match(page, /data-acct-show-key/);
  assert.match(page, /View my public profile/);
  assert.match(page, /Customize in the game/);
  assert.doesNotMatch(page, /type="file"/);
  for (const file of ['scripts/account.js', 'scripts/ship-ui.js', 'scripts/ship-info.js', 'scripts/pilot-profile.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /data:image\/|\.preview\b|readAsDataURL|FileReader|type\s*=\s*['"]file['"]/, `${file} stores and uploads no pictures`);
  }
});

test('the ship renderer is imported on demand, from the published game path', () => {
  const ui = read('scripts/ship-ui.js');
  // Dynamic import only: a page that shows no ship never downloads the part images.
  assert.doesNotMatch(ui, /^import .*shipAppearance/m);
  assert.match(ui, /import\(`\$\{gameRoot\(base\)\}shipAppearance\.js`\)/);
  assert.match(ui, /games\/stardust\/systems\//);
  assert.match(ui, /loadShipKits\(\)/);
  // Rendered at twice the card size, then posed to fill the frame.
  assert.match(ui, /renderAppearance\(appearance, null, size \* 2\)/);
  // The build publishes the two new modules.
  const build = read('scripts/build.mjs');
  assert.match(build, /'ship-info\.js'/);
  assert.match(build, /'ship-ui\.js'/);
});
