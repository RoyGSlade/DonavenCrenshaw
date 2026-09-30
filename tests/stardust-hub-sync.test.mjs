// Device/input tag on finish requests, and syncing the ship, settings and designs to the hub.
// Everything here runs against fakes: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideDevice, readDevice, classifyInputFrame, createInputTally, createRunClient, clientTag, ghostShip,
  gamepadDriving, snapshotAppearance, TABLET_MIN_SIDE,
} from '../projects/Space-Shooter/systems/runClient.js';
import { createRunRecorder, LEVEL_BOARDS } from '../projects/Space-Shooter/systems/hubRuns.js';
import {
  decideSync, mergeDesigns, cleanDesigns, fitGarageSave, librarySignature, byteLength, toMs, syncStatusText,
  readSettingsSave, readGarageSave, createHubSync, MAX_SAVE_BYTES, SAVE_HEADROOM, SETTINGS_SLOT, GARAGE_SLOT,
} from '../projects/Space-Shooter/systems/hubSync.js';
import { presetAppearance, newLayer, cleanAppearance } from '../projects/Space-Shooter/systems/shipLivery.js';
import { makeLocalBest, readLocalBest, saveLocalBest } from '../projects/Space-Shooter/engine/weekly/localBest.js';
import { ghostSprite } from '../projects/Space-Shooter/gfx/ghostShip.js';
import { drawCourier } from '../projects/Space-Shooter/gfx/stardustVfx.js';
import { buildForRun } from '../projects/Space-Shooter/systems/shipBuild.js';
import { buildScale } from '../projects/Space-Shooter/engine/shipStats.js';

const ship = (family = 'needle', parts = [0, 1, 0, 1]) => {
  const a = presetAppearance(family);
  a.parts = { body: parts[0], wings: parts[1], cockpit: parts[2], engines: parts[3] };
  return a;
};
const memoryStore = (seed = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// --- device -----------------------------------------------------------------------

test('device: desktop unless touch; phone vs tablet by the smaller screen side, whichever way it is held', () => {
  assert.equal(decideDevice({ touch: false, width: 390, height: 844 }), 'desktop');
  assert.equal(decideDevice({ touch: true, width: 390, height: 844 }), 'phone');
  assert.equal(decideDevice({ touch: true, width: 844, height: 390 }), 'phone', 'landscape is still a phone');
  assert.equal(decideDevice({ touch: true, width: 820, height: 1180 }), 'tablet');
  assert.equal(decideDevice({ touch: true, width: 1180, height: 820 }), 'tablet');
  assert.equal(decideDevice({ touch: true, width: TABLET_MIN_SIDE, height: 1000 }), 'tablet');
  assert.equal(decideDevice({ touch: true, width: TABLET_MIN_SIDE - 1, height: 1000 }), 'phone');
  assert.equal(decideDevice({ touch: true }), 'phone', 'a touch device that cannot say its size is a phone');
  assert.equal(decideDevice(), 'desktop');
});

test('device: read from the browser; a laptop with a touch screen is a desktop', () => {
  const win = ({ coarse = false, fine = false, points = 0, w = 1920, h = 1080 }) => ({
    matchMedia: (q) => ({ matches: q.includes('any-pointer: coarse') ? coarse : q.includes('any-pointer: fine') ? fine : q.includes('(pointer: fine)') ? fine : false }),
    navigator: { maxTouchPoints: points }, screen: { width: w, height: h },
  });
  assert.equal(readDevice(win({})), 'desktop');
  assert.equal(readDevice(win({ coarse: true, points: 5, w: 393, h: 852 })), 'phone');
  assert.equal(readDevice(win({ coarse: true, points: 5, w: 820, h: 1180 })), 'tablet');
  assert.equal(readDevice(win({ coarse: true, fine: true, points: 10, w: 1920, h: 1080 })), 'desktop', 'touch laptop');
  assert.equal(readDevice({}), 'desktop', 'no browser, no touch');
});

// --- input ------------------------------------------------------------------------

test('input: tilt beats controller beats touch beats keys; an idle frame is nothing', () => {
  assert.equal(classifyInputFrame({}), null);
  assert.equal(classifyInputFrame({ tilt: true }), null, 'tilt on but nobody is driving');
  assert.equal(classifyInputFrame({ keys: true }), 'keyboard');
  assert.equal(classifyInputFrame({ keys: true, touch: true }), 'touch');
  assert.equal(classifyInputFrame({ keys: true, touch: true, pad: true }), 'controller');
  assert.equal(classifyInputFrame({ keys: true, touch: true, pad: true, tilt: true }), 'tilt');
  assert.equal(classifyInputFrame({ tilt: true, tiltAxis: true }), 'tilt');
  assert.equal(classifyInputFrame({ tilt: false, tiltAxis: true }), null, 'a tilt axis without tilt steering on is not input');
});

test('input: the tally says what was used most, ties go to the rarer input, and an untouched run falls back', () => {
  const t = createInputTally();
  assert.equal(t.decide(), 'keyboard');
  assert.equal(t.decide('touch'), 'touch');
  for (let i = 0; i < 10; i++) t.add('keyboard');
  for (let i = 0; i < 3; i++) t.add('controller');
  t.add(null); t.add('bogus');
  assert.equal(t.decide(), 'keyboard');
  for (let i = 0; i < 7; i++) t.add('controller');
  assert.equal(t.decide(), 'controller', '10 v 10 goes to the controller');
  t.add('touch'); for (let i = 0; i < 10; i++) t.add('touch');
  assert.equal(t.decide(), 'touch');
  t.reset();
  assert.deepEqual(t.counts(), { keyboard: 0, controller: 0, touch: 0, tilt: 0 });
});

test('input: a gamepad reading drives when a stick, trigger or button is in use', () => {
  assert.equal(gamepadDriving(null), false);
  assert.equal(gamepadDriving({ thrust: false, turnStrength: 0, thrustStrength: 0, backStrength: 0 }), false);
  assert.equal(gamepadDriving({ turnStrength: -0.4 }), true);
  assert.equal(gamepadDriving({ thrustStrength: 0.2 }), true);
  assert.equal(gamepadDriving({ shoot: true }), true);
});

// --- client tag -------------------------------------------------------------------

test('client tag: only valid fields, build only when given a real build, appearance cleaned', () => {
  assert.deepEqual(clientTag({ device: 'phone', input: 'tilt' }), { device: 'phone', input: 'tilt' });
  assert.deepEqual(clientTag({ device: 'watch', input: 'eyes', build: 'needle:9-9-9-9', appearance: { junk: 1 } }), {});
  const a = ship();
  a.hp = 999; // not part of the cosmetic document
  assert.deepEqual(clientTag({ device: 'desktop', input: 'keyboard', build: 'needle:0-1-0-1', appearance: a }),
    { device: 'desktop', input: 'keyboard', build: 'needle:0-1-0-1', appearance: cleanAppearance(ship()) });
});

test('the run client snapshots device, build and ship when the attempt starts, and counts input while it flies', () => {
  let equipped = ship('needle');
  let device = 'phone';
  let tilt = false;
  const rc = createRunClient({ device: () => device, appearance: () => snapshotAppearance(() => equipped), tiltOn: () => tilt, touchDevice: () => device !== 'desktop' });
  assert.equal(rc.current(), null, 'nothing before an attempt begins');
  rc.begin({ build: 'needle:0-1-0-1' });
  // The pilot swaps ship and the device changes mid-run: neither changes what was started.
  equipped = ship('manta');
  device = 'desktop';
  for (let i = 0; i < 20; i++) rc.sample({ keys: true });
  for (let i = 0; i < 5; i++) rc.sample({ touch: true });
  rc.sample({});
  const tag = rc.current();
  assert.equal(tag.device, 'phone');
  assert.equal(tag.input, 'keyboard');
  assert.equal(tag.build, 'needle:0-1-0-1');
  assert.equal(tag.appearance.family, 'needle');
  // The next attempt starts from zero, on the ship now equipped, without a build.
  device = 'phone';
  rc.begin();
  assert.equal(rc.current().appearance.family, 'manta');
  assert.equal('build' in rc.current(), false);
  assert.equal(rc.current().input, 'touch', 'no input yet on a phone: touch is the fallback');
  tilt = true;
  assert.equal(rc.current().input, 'tilt', 'no input yet with tilt steering on: tilt');
  device = 'desktop'; tilt = false;
  rc.begin();
  assert.equal(rc.current().input, 'keyboard');
});

test('the run client takes a snapshot from the caller, and leaves the ship out when none is equipped', () => {
  const rc = createRunClient({ device: () => 'desktop', appearance: () => snapshotAppearance(() => null) });
  rc.begin({ build: null, appearance: ship('wisp') });
  assert.equal(rc.current().appearance.family, 'wisp');
  rc.begin({ build: null, appearance: null });
  assert.equal('appearance' in rc.current(), false);
  rc.begin();
  assert.equal('appearance' in rc.current(), false, 'standard ship: no appearance');
  assert.equal(snapshotAppearance(() => { throw new Error('storage'); }), null);
});

test('a hub ghost brings its ship; an older hub sends none', () => {
  assert.deepEqual(ghostShip({}), { appearance: null, build: null });
  assert.deepEqual(ghostShip(null), { appearance: null, build: null });
  assert.deepEqual(ghostShip({ appearance: ship('manta'), build: 'manta:0-1-0-1' }), { appearance: cleanAppearance(ship('manta')), build: 'manta:0-1-0-1' });
  assert.deepEqual(ghostShip({ appearance: { family: 'bogus' }, build: 'nope' }), { appearance: null, build: null });
});

// --- the hub client ---------------------------------------------------------------

const BASE = 'https://hub.example/api/games/stardust';
function fakeRunHub({ ghost = {} } = {}) {
  const calls = [];
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, credentials: init.credentials });
    if (url.endsWith('/api/users/session')) return reply(200, { user: { username: 'nova' } });
    if (url === BASE) return reply(200, { boards: [{ board: 'full', version: 1 }, { board: 'weekly-01', version: 1 }, ...LEVEL_BOARDS.map((board) => ({ board, version: 1 }))] });
    if (url === `${BASE}/runs`) return reply(201, { runId: 'run-1' });
    if (url.endsWith('/finish')) return reply(200, { status: 'accepted', timeMs: 1 });
    if (url.includes('/ghost')) return reply(200, { inputLog: 'SDW2|x', username: 'rook', timeMs: 5, ...ghost });
    if (url.endsWith('/api/stardust/ship')) return reply(401, { error: 'unauthorized' });
    return reply(404, {});
  };
  return { calls, fetchImpl };
}
const config = { backendBaseUrl: BASE, requestTimeoutMs: 1000, build: 'stardust-test' };
const finishes = (calls) => calls.filter((c) => c.url.endsWith('/finish'));

test('every finish request carries the client block: circuits, the full network and a single board', async () => {
  const hub = fakeRunHub();
  const tag = { device: 'tablet', input: 'controller', build: 'needle:0-1-0-1', appearance: cleanAppearance(ship()) };
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl, client: () => tag });
  await rec.startRun();
  await rec.finishLevel(1, 40000);
  await rec.finishRun(200000);
  await rec.startBoardRun('weekly-01', { version: 1 });
  await rec.finishBoardRun(61000, { inputLog: 'SDW2|log' });
  const sent = finishes(hub.calls);
  assert.equal(sent.length, 3);
  for (const call of sent) assert.deepEqual(call.body.client, tag);
  assert.equal(sent[2].body.inputLog, 'SDW2|log', 'the rest of the body is unchanged');
  assert.equal(sent[1].body.timeMs, 200000);
});

test('no client provider, an empty one or a broken one: the finish is sent as it always was', async () => {
  for (const client of [undefined, () => null, () => ({}), () => { throw new Error('boom'); }]) {
    const hub = fakeRunHub();
    const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl, client });
    await rec.startRun();
    await rec.finishRun(123456);
    assert.deepEqual(finishes(hub.calls)[0].body, { timeMs: 123456, splits: {} });
  }
});

test('the hub ghost is handed on with its ship; other hub calls go out on the same terms as runs', async () => {
  const hub = fakeRunHub({ ghost: { appearance: ship('manta'), build: 'manta:0-1-0-1' } });
  const rec = createRunRecorder({ config, fetchImpl: hub.fetchImpl });
  await rec.connect();
  const top = await rec.ghost('weekly-01', { rank: 1 });
  assert.equal(top.inputLog, 'SDW2|x');
  assert.equal(top.appearance.family, 'manta');
  assert.equal(top.build, 'manta:0-1-0-1');
  const plain = createRunRecorder({ config, fetchImpl: fakeRunHub().fetchImpl });
  assert.deepEqual({ a: (await plain.ghost('weekly-01')).appearance, b: (await plain.ghost('weekly-01')).build }, { a: null, b: null });
  const res = await rec.api('/api/stardust/ship');
  assert.equal(res.status, 401);
  assert.equal(rec.player, null, 'a 401 from any hub call ends the signed-in state');
  assert.equal(hub.calls.at(-1).url, 'https://hub.example/api/stardust/ship');
  assert.equal(hub.calls.at(-1).credentials, 'include');
  assert.equal(rec.gamePath('/saves/settings'), '/api/games/stardust/saves/settings');
});

// --- local best and ghosts --------------------------------------------------------

test('the local best stores the ship the attempt started with, and reads old bests without one', () => {
  const event = { id: 'weekly-01', version: 1 };
  const store = memoryStore();
  saveLocalBest(event, makeLocalBest({ ms: 61234, log: 'SDW2|abc', at: '2026-10-01T00:00:00Z', appearance: ship('manta'), build: 'manta:0-1-0-1' }), store);
  const best = readLocalBest(event, store);
  assert.equal(best.ms, 61234);
  assert.equal(best.appearance.family, 'manta');
  assert.equal(best.build, 'manta:0-1-0-1');
  // No ship equipped: neither field is stored.
  saveLocalBest(event, makeLocalBest({ ms: 60000, log: 'SDW2|abd' }), store);
  const plain = JSON.parse(store.getItem('stardust.weekly.weekly-01.v1.best'));
  assert.equal('appearance' in plain, false);
  assert.equal('build' in plain, false);
  // A best saved before ships were recorded, and one with junk in the ship fields.
  store.setItem('stardust.weekly.weekly-01.v1.best', JSON.stringify({ ms: 70000, log: 'SDW2|old', at: 'x' }));
  assert.deepEqual(readLocalBest(event, store), { ms: 70000, log: 'SDW2|old', at: 'x' });
  store.setItem('stardust.weekly.weekly-01.v1.best', JSON.stringify({ ms: 70000, log: 'SDW2|old', at: 'x', appearance: { family: 'bogus' }, build: 'nope' }));
  assert.deepEqual(readLocalBest(event, store), { ms: 70000, log: 'SDW2|old', at: 'x' });
  store.setItem('stardust.weekly.weekly-01.v1.best', 'not json');
  assert.equal(readLocalBest(event, store), null);
});

test('a ghost is painted once from its appearance, only after the ship parts have loaded', async () => {
  const ghost = { appearance: ship('needle'), build: 'needle:0-1-0-1' };
  const sprite = { tag: 'canvas' };
  let loaded = false, loads = 0, renders = 0;
  const deps = { loaded: () => loaded, load: () => new Promise((r) => { loads += 1; setTimeout(() => { loaded = true; r(); }, 0); }), render: () => { renders += 1; return sprite; } };
  assert.equal(ghostSprite({ appearance: null }, deps), null, 'no ship on record: the standard sprite');
  assert.equal(ghostSprite(ghost, deps), null, 'parts not loaded: standard sprite meanwhile');
  assert.equal(ghostSprite(ghost, deps), null);
  assert.equal(loads, 1, 'loading starts once');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(ghostSprite(ghost, deps), sprite);
  assert.equal(ghostSprite(ghost, deps), sprite);
  assert.equal(renders, 1, 'rendered once and cached on the ghost');
  assert.equal(ghost.sprite, sprite);
  // A ship that cannot be painted, or parts that cannot load, never retry every frame.
  const bad = { appearance: ship('manta') };
  let tries = 0;
  assert.equal(ghostSprite(bad, { loaded: () => true, load: async () => {}, render: () => { tries += 1; throw new Error('not ready'); } }), null);
  assert.equal(ghostSprite(bad, { loaded: () => true, load: async () => {}, render: () => { tries += 1; return sprite; } }), null);
  assert.equal(tries, 1);
  const noLoad = { appearance: ship('wisp') };
  ghostSprite(noLoad, { loaded: () => false, load: async () => { throw new Error('offline'); }, render: () => sprite });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(noLoad.spriteFailed, true);
});

test('drawCourier draws a ghost sprite at its build size, and the standard ship at its own', () => {
  const draws = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'drawImage' ? (...a) => draws.push(a) : k in t ? t[k] : () => ({ addColorStop() {} })),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const pose = { x: 1, y: 1, angle: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, standardShip: true };
  const standard = { tag: 'standard' }, custom = { tag: 'custom' };
  drawCourier(ctx, pose, { paused: true }, {}, 100, standard, 0, 0.66);
  drawCourier(ctx, { ...pose, appearanceCanvas: custom, buildKey: null }, { paused: true }, {}, 100, standard, 0, 0.66);
  drawCourier(ctx, { ...pose, appearanceCanvas: custom, buildKey: 'manta:0-1-0-1' }, { paused: true }, {}, 100, standard, 0, 0.66);
  assert.equal(draws[0][0], standard);
  assert.equal(draws[1][0], custom);
  assert.equal(draws[2][0], custom);
  const side = (d) => d[3];
  assert.ok(Math.abs(side(draws[0]) - 100 * 1.6 * 0.66) < 1e-9);
  assert.equal(side(draws[1]), side(draws[0]), 'a custom ship without a build is framed like the standard one');
  assert.ok(buildScale('manta:0-1-0-1') > 1);
  assert.ok(Math.abs(side(draws[2]) - side(draws[0]) * buildScale('manta:0-1-0-1')) < 1e-9);
});

test('practice and ranked flights fly the equipped build; the address bar works for previews', () => {
  const store = memoryStore({ 'stardust.courier.appearance.v1': JSON.stringify(ship('needle')) });
  const event = { id: 'weekly-01' };
  assert.equal(buildForRun(event, { preview: true, ship: 'equipped', search: '', storage: store }), 'needle:0-1-0-1');
  assert.equal(buildForRun(event, { preview: false, search: '', storage: store }), 'needle:0-1-0-1', 'ranked flies the equipped build');
  assert.equal(buildForRun(event, { preview: true, search: '?ship=equipped', storage: store }), 'needle:0-1-0-1', 'the address bar still works');
  assert.equal(buildForRun(event, { preview: true, ship: 'equipped', search: '', storage: memoryStore() }), null, 'no custom ship: standard');
});

// --- sync rules -------------------------------------------------------------------

test('sync decision: the newer stamp wins, the hub having nothing means push only if the pilot ever changed it', () => {
  assert.equal(decideSync({ localAt: 0, remoteAt: null }), 'none');
  assert.equal(decideSync({ localAt: 5, remoteAt: null }), 'push');
  assert.equal(decideSync({ localAt: 5, remoteAt: 9 }), 'pull');
  assert.equal(decideSync({ localAt: 9, remoteAt: 5 }), 'push');
  assert.equal(decideSync({ localAt: 0, remoteAt: 1 }), 'pull');
  assert.equal(decideSync({ localAt: 5, remoteAt: 5 }), 'none');
  assert.equal(decideSync({ localAt: 1, remoteAt: 9, same: true }), 'align');
  assert.equal(toMs('2026-10-01T00:00:00Z'), Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(toMs(1234.9), 1234);
  assert.equal(toMs('soon'), 0);
  assert.equal(toMs(-4), 0);
});

const design = (id, name = id, family = 'needle') => ({ id, name, appearance: ship(family) });

test('designs merge by id: local versions win, no local design is dropped, hub-only ones are added up to the cap', () => {
  const local = [design('a', 'mine'), design('b')];
  const remote = [design('a', 'theirs'), design('c'), design('d')];
  const merged = mergeDesigns(local, remote);
  assert.deepEqual(merged.map((d) => d.id), ['a', 'b', 'c', 'd']);
  assert.equal(merged[0].name, 'mine');
  const full = Array.from({ length: 12 }, (_, i) => design(`l${i}`));
  assert.deepEqual(mergeDesigns(full, remote).map((d) => d.id), full.map((d) => d.id), 'a full local library takes nothing');
  assert.equal(mergeDesigns([], Array.from({ length: 20 }, (_, i) => design(`r${i}`))).length, 12);
  assert.deepEqual(mergeDesigns(local, null).map((d) => d.id), ['a', 'b']);
  assert.deepEqual(cleanDesigns([design('x'), { id: 'y', name: 'no ship', appearance: { junk: 1 } }, { name: 'no id', appearance: ship() }, design('x', 'dupe'), null, design('z', 'n'.repeat(99))]).map((d) => [d.id, d.name.length]), [['x', 1], ['z', 60]]);
  assert.equal(librarySignature([design('a'), design('b')]), librarySignature([design('b'), design('a')]), 'order does not matter');
  assert.notEqual(librarySignature([design('a')]), librarySignature([design('a', 'renamed')]));
});

function fatDesign(id) {
  const a = ship('manta');
  for (let i = 0; i < 32; i++) Object.assign(a.layers[i] = newLayer('star', '#ff00aa'), { id: `layer-${id}-${i}` });
  return { id, name: id, appearance: cleanAppearance(a) };
}

test('the pushed garage copy is cut to 64 KB by dropping the oldest designs; nothing fitting means no push', () => {
  const one = fatDesign('d0');
  const each = byteLength(JSON.stringify(one));
  assert.ok(each > 5000 && each < 64 * 1024, `a fully decorated design is ${each} bytes`);
  const library = Array.from({ length: 12 }, (_, i) => fatDesign(`d${i}`)); // newest first, like the library
  const fit = fitGarageSave(library, 1234);
  assert.ok(fit.dropped > 0 && fit.dropped < 12, `dropped ${fit.dropped}`);
  const body = JSON.stringify({ version: 1, data: fit.data });
  assert.ok(byteLength(body) <= MAX_SAVE_BYTES - SAVE_HEADROOM, `body is ${byteLength(body)} bytes`);
  assert.deepEqual(fit.data.designs.map((d) => d.id), library.slice(0, library.length - fit.dropped).map((d) => d.id), 'the newest are kept');
  assert.equal(fit.data.updatedAt, 1234);
  // One more design than fits would not have fit.
  assert.ok(byteLength(JSON.stringify({ version: 1, data: { designs: library.slice(0, library.length - fit.dropped + 1), updatedAt: 1234 } })) > MAX_SAVE_BYTES - SAVE_HEADROOM);
  const small = fitGarageSave([design('a')], 1);
  assert.equal(small.dropped, 0);
  assert.equal(fitGarageSave([fatDesign('big')], 1, 100), null);
  assert.deepEqual(fitGarageSave([], 7), { data: { designs: [], updatedAt: 7 }, dropped: 0 });
});

test('saves from the hub are read defensively', () => {
  assert.equal(readSettingsSave(null), null);
  assert.equal(readSettingsSave({ data: { code: '' } }), null);
  assert.deepEqual(readSettingsSave({ version: 1, data: { code: 'SD1-x', updatedAt: 5 } }), { code: 'SD1-x', updatedAt: 5 });
  assert.equal(readGarageSave({ data: { designs: 'no' } }), null);
  assert.deepEqual(readGarageSave({ data: { designs: [design('a'), { id: 'bad' }], updatedAt: '2026-10-01T00:00:00Z' } }).designs.map((d) => d.id), ['a']);
  assert.equal(syncStatusText('saved'), 'Saved to your account');
  assert.equal(syncStatusText('guest'), 'Sign in to save to your account');
  assert.equal(syncStatusText('offline'), 'Offline: saved on this device');
});

// --- the syncer against a fake hub -------------------------------------------------

function world({ signedIn = true, hub = {}, settingsCode = 'SD1-local', library = [], equipped = null, stored = {} } = {}) {
  const w = {
    signedIn, calls: [], hub: { ship: null, settings: null, garage: null, ...hub }, statuses: [], logs: [], timers: [], clock: 1000,
    settingsCode, library, equipped, state: stored, applied: [], equips: [], prepared: 0, refuse: {},
  };
  const rec = (method, path, body) => w.calls.push({ method, path, body });
  w.api = async (path, { method = 'GET', body } = {}) => {
    rec(method, path, body);
    if (!w.signedIn) return { ok: false, status: 401, data: null };
    if (w.offline) return { ok: false, status: 0, data: null };
    const key = `${method} ${path}`;
    if (w.refuse[key]) return w.refuse[key];
    if (path === '/api/stardust/ship') {
      if (method === 'GET') return w.hub.ship ? { ok: true, status: 200, data: { build: null, family: w.hub.ship.family, appearance: w.hub.ship, updatedAt: 'x' } } : { ok: false, status: 404, data: { error: 'no_ship' } };
      if (method === 'PUT') { w.hub.ship = body.appearance; return { ok: true, status: 200, data: { appearance: body.appearance } }; }
      if (method === 'DELETE') { w.hub.ship = null; return { ok: true, status: 204, data: null }; }
    }
    const slot = path.split('/saves/')[1];
    if (slot) {
      if (method === 'GET') return w.hub[slot] ? { ok: true, status: 200, data: { version: 1, data: w.hub[slot] } } : { ok: false, status: 404, data: { error: 'not_found' } };
      if (method === 'PUT') { w.hub[slot] = body.data; return { ok: true, status: 200, data: {} }; }
    }
    return { ok: false, status: 404, data: null };
  };
  w.sync = createHubSync({
    api: w.api,
    gamePath: (p) => `/api/games/stardust${p}`,
    signedIn: () => w.signedIn,
    reachable: () => !w.offline,
    store: { read: () => JSON.parse(JSON.stringify(w.state)), write: (s) => { w.state = JSON.parse(JSON.stringify(s)); } },
    settings: { code: () => w.settingsCode, apply: (code) => { if (!code.startsWith('SD1-')) return false; w.applied.push(code); w.settingsCode = code; return true; } },
    library: { read: () => w.library, write: (d) => { w.library = d; } },
    ship: { get: () => w.equipped, prepare: async () => { w.prepared += 1; }, equip: (a) => { w.equips.push(a); w.equipped = a; w.sync.shipChanged(); } },
    emit: (s) => w.statuses.push(s),
    log: { warn: (...a) => w.logs.push(a.join(' ')) },
    now: () => w.clock,
    setTimer: (fn, ms) => { const t = { fn, ms }; w.timers.push(t); return t; },
    clearTimer: (t) => { const i = w.timers.indexOf(t); if (i >= 0) w.timers.splice(i, 1); },
    debounceMs: 4000, resyncMs: 60000,
  });
  return w;
}
const settle = async (w) => { await w.sync.onSession({ force: true }); await new Promise((r) => setTimeout(r, 0)); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const writes = (w) => w.calls.filter((c) => c.method !== 'GET');

test('guests: nothing is requested, however much they change', async () => {
  const w = world({ signedIn: false, equipped: ship() });
  w.sync.onSession();
  w.settingsCode = 'SD1-changed'; w.sync.settingsChanged();
  w.library = [design('a')]; w.sync.libraryChanged();
  w.sync.shipChanged();
  w.sync.flush();
  await tick();
  assert.deepEqual(w.calls, []);
  assert.equal(w.timers.length, 0);
  assert.equal(w.sync.status(), 'guest');
});

test('ship: equipped on the device and none on the hub goes up; both and different: the device wins; both and same: nothing', async () => {
  const w = world({ equipped: ship('needle') });
  await settle(w);
  assert.deepEqual(writes(w).filter((c) => c.path === '/api/stardust/ship').map((c) => [c.method, c.body.appearance.family]), [['PUT', 'needle']]);
  const w2 = world({ equipped: ship('needle'), hub: { ship: ship('manta') } });
  await settle(w2);
  assert.deepEqual(writes(w2).filter((c) => c.path === '/api/stardust/ship').map((c) => c.method), ['PUT']);
  assert.equal(w2.hub.ship.family, 'needle', 'the local ship replaced the hub copy');
  assert.equal(w2.equips.length, 0);
  const w3 = world({ equipped: ship('needle'), hub: { ship: ship('needle') } });
  await settle(w3);
  assert.deepEqual(writes(w3).filter((c) => c.path === '/api/stardust/ship'), []);
});

test("ship: a device with none adopts the hub's, without sending it straight back", async () => {
  const w = world({ equipped: null, hub: { ship: ship('wisp', [1, 2, 0, 1]) } });
  await settle(w);
  assert.equal(w.prepared, 1, 'the ship parts are loaded first');
  assert.equal(w.equips.length, 1);
  assert.equal(w.equipped.family, 'wisp');
  assert.deepEqual(writes(w).filter((c) => c.path === '/api/stardust/ship'), [], 'adopting is not an equip to push');
  // No ship anywhere: nothing happens.
  const none = world({ equipped: null });
  await settle(none);
  assert.deepEqual(writes(none).filter((c) => c.path === '/api/stardust/ship'), []);
});

test('ship: a pilot who equips while the hub ship is still loading keeps their own', async () => {
  const w = world({ equipped: null, hub: { ship: ship('wisp') } });
  w.sync = createHubSync({ ...{}, api: w.api, gamePath: (p) => p, signedIn: () => true, store: { read: () => ({}), write() {} }, settings: { code: () => 'SD1-x', apply: () => true }, library: { read: () => [], write() {} },
    ship: { get: () => w.equipped, prepare: async () => { w.equipped = ship('needle'); }, equip: (a) => { w.equips.push(a); } }, now: () => 1 });
  await w.sync.onSession();
  await tick();
  assert.equal(w.equips.length, 0);
});

test('ship: equipping PUTs the appearance, going back to the standard ship DELETEs, in that order', async () => {
  const w = world({ equipped: null });
  await settle(w);
  w.calls.length = 0;
  w.equipped = ship('manta'); w.sync.shipChanged();
  w.equipped = null; w.sync.shipChanged();
  await tick(); await tick();
  assert.deepEqual(writes(w).map((c) => `${c.method} ${c.path}`), ['DELETE /api/stardust/ship'], 'both changes were queued before the first ran, so one request says where it ended');
  w.calls.length = 0;
  w.equipped = ship('manta'); w.sync.shipChanged();
  await tick();
  w.equipped = null; w.sync.shipChanged();
  await tick();
  assert.deepEqual(writes(w).map((c) => `${c.method} ${c.path}`), ['PUT /api/stardust/ship', 'DELETE /api/stardust/ship']);
  assert.deepEqual(writes(w)[0].body, { appearance: cleanAppearance(ship('manta')) });
});

test('ship: a failed request is a warning, never an error, and the garage is never waited on', async () => {
  const w = world({ equipped: ship() });
  w.refuse['PUT /api/stardust/ship'] = { ok: false, status: 500, data: null };
  await settle(w);
  assert.ok(w.logs.some((l) => l.includes('your ship was not saved')));
  w.offline = true;
  w.equipped = ship('manta');
  w.sync.shipChanged();
  await tick();
  assert.equal(w.sync.status(), 'offline');
});

test('settings: a newer hub copy is applied; an older or missing one is overwritten; same content only moves the stamp', async () => {
  const w = world({ settingsCode: 'SD1-mine', stored: { settingsCode: 'SD1-mine', settingsAt: 500 }, hub: { settings: { code: 'SD1-theirs', updatedAt: 900 } } });
  await settle(w);
  assert.deepEqual(w.applied, ['SD1-theirs']);
  assert.equal(w.state.settingsAt, 900);
  assert.deepEqual(writes(w).filter((c) => c.path.includes('settings')), []);
  // Local changed after the hub copy: it is pushed.
  const p = world({ settingsCode: 'SD1-mine', stored: { settingsCode: 'SD1-mine', settingsAt: 2000 }, hub: { settings: { code: 'SD1-theirs', updatedAt: 900 } } });
  await settle(p);
  assert.deepEqual(p.applied, []);
  const put = writes(p).find((c) => c.path.endsWith('/saves/settings'));
  assert.deepEqual(put.body, { version: 1, data: { code: 'SD1-mine', updatedAt: 2000 } });
  // A change noticed at start (the code moved since the last look) is stamped now and pushed over an older hub copy.
  const n = world({ settingsCode: 'SD1-new', stored: { settingsCode: 'SD1-prev', settingsAt: 100 }, hub: { settings: { code: 'SD1-theirs', updatedAt: 900 } } });
  await settle(n);
  assert.equal(n.state.settingsAt, 1000);
  assert.deepEqual(n.applied, []);
  // Hub has none and the pilot never changed anything: nothing is saved.
  const fresh = world({ settingsCode: 'SD1-default' });
  await settle(fresh);
  assert.deepEqual(writes(fresh).filter((c) => c.path.includes('/saves/')), []);
  // Same content: no apply, no push.
  const same = world({ settingsCode: 'SD1-x', stored: { settingsCode: 'SD1-x', settingsAt: 100 }, hub: { settings: { code: 'SD1-x', updatedAt: 900 } } });
  await settle(same);
  assert.deepEqual(same.applied, []);
  assert.deepEqual(writes(same).filter((c) => c.path.includes('/saves/')), []);
  assert.equal(same.state.settingsAt, 900);
});

test('settings: a browser that never tracked them takes the hub copy and keeps its own once; an unreadable hub copy is not applied', async () => {
  const w = world({ settingsCode: 'SD1-mine', hub: { settings: { code: 'SD1-theirs', updatedAt: 900 } } });
  await settle(w);
  assert.deepEqual(w.applied, ['SD1-theirs']);
  assert.equal(w.state.settingsBackup, 'SD1-mine');
  const bad = world({ settingsCode: 'SD1-mine', hub: { settings: { code: 'garbage', updatedAt: 900 } } });
  await settle(bad);
  assert.deepEqual(bad.applied, []);
  assert.ok(bad.logs.some((l) => l.includes('could not be read')));
});

test('settings: changes are pushed after a pause, many edits become one request, and a pulled copy is not pushed back', async () => {
  const w = world({ settingsCode: 'SD1-a' });
  await settle(w);
  w.calls.length = 0;
  for (const code of ['SD1-b', 'SD1-c', 'SD1-d']) { w.clock += 10; w.settingsCode = code; w.sync.settingsChanged(); }
  assert.deepEqual(w.calls, [], 'nothing goes out while the pilot is still changing things');
  assert.equal(w.timers.length, 1, 'one timer, restarted by each edit');
  assert.equal(w.timers[0].ms, 4000);
  assert.equal(w.sync.status(), 'saving');
  w.timers[0].fn(); w.timers.length = 0;
  await tick(); await tick();
  assert.deepEqual(writes(w).map((c) => [c.method, c.path, c.body.data.code]), [['PUT', '/api/games/stardust/saves/settings', 'SD1-d']]);
  assert.equal(w.hub.settings.updatedAt, w.state.settingsAt);
  assert.equal(w.sync.status(), 'saved');
  // Applying a pulled copy fires the settings event; it is not a local edit.
  w.calls.length = 0;
  w.hub.settings = { code: 'SD1-remote', updatedAt: w.clock + 5000 };
  w.clock += 120000;
  await w.sync.onSession({ force: true }); await tick();
  assert.deepEqual(w.applied.at(-1), 'SD1-remote');
  w.sync.settingsChanged();
  assert.equal(w.timers.length, 0);
});

test('an edit made after seeing a hub copy always outranks it, even on a clock that runs behind', async () => {
  const w = world({ settingsCode: 'SD1-a', stored: { settingsCode: 'SD1-a', settingsAt: 50, settingsSeen: 10_000_000 } });
  await settle(w);
  w.settingsCode = 'SD1-b';
  w.sync.settingsChanged();
  assert.ok(w.state.settingsAt > 10_000_000);
});

test('the three-slot limit: a 409 no_free_slot stops that slot for the session and is reported', async () => {
  const w = world({ settingsCode: 'SD1-a', stored: { settingsCode: 'SD1-a', settingsAt: 50 } });
  w.refuse['PUT /api/games/stardust/saves/settings'] = { ok: false, status: 409, data: { error: 'no_free_slot' } };
  await settle(w);
  assert.ok(w.logs.some((l) => l.includes('no free save slot')));
  assert.deepEqual(w.sync.blocked, [SETTINGS_SLOT]);
  assert.equal(w.sync.status(), 'no-slot');
  w.calls.length = 0;
  w.settingsCode = 'SD1-b'; w.sync.settingsChanged();
  assert.equal(w.timers.length, 0, 'no more attempts for that slot');
  await w.sync.onSession({ force: true }); await tick();
  assert.deepEqual(w.calls.filter((c) => c.path.endsWith('/saves/settings')), []);
  assert.ok(w.calls.some((c) => c.path === '/api/stardust/ship'), 'other things still sync');
  assert.equal(syncStatusText('no-slot').includes('no free save slot'), true);
});

test('garage: a newer hub library is merged into the local one; local designs stay and are sent up', async () => {
  const w = world({ library: [design('mine'), design('both', 'local name')], stored: { garageSig: librarySignature([design('mine'), design('both', 'local name')]), garageAt: 100 },
    hub: { garage: { designs: [design('both', 'hub name'), design('theirs')], updatedAt: 900 } } });
  await settle(w);
  assert.deepEqual(w.library.map((d) => d.id), ['mine', 'both', 'theirs']);
  assert.equal(w.library[1].name, 'local name');
  const put = writes(w).find((c) => c.path.endsWith('/saves/garage'));
  assert.deepEqual(put.body.data.designs.map((d) => d.id), ['mine', 'both', 'theirs'], 'the merged library went back up, stamped after the hub copy');
  assert.ok(put.body.data.updatedAt > 900);
  // The hub copy holds everything the device has: applied, nothing pushed.
  const w2 = world({ library: [design('a')], stored: { garageSig: librarySignature([design('a')]), garageAt: 100 }, hub: { garage: { designs: [design('a'), design('b')], updatedAt: 900 } } });
  await settle(w2);
  assert.deepEqual(w2.library.map((d) => d.id), ['a', 'b']);
  assert.deepEqual(writes(w2).filter((c) => c.path.includes('/saves/')), []);
  assert.equal(w2.state.garageAt, 900);
});

test('garage: a library never tracked here merges with the hub and loses nothing; a newer local library is pushed', async () => {
  const w = world({ library: [design('local-only')], hub: { garage: { designs: [design('hub-only')], updatedAt: 900 } } });
  await settle(w);
  assert.deepEqual(w.library.map((d) => d.id).sort(), ['hub-only', 'local-only']);
  assert.deepEqual(writes(w).find((c) => c.path.endsWith('/saves/garage')).body.data.designs.map((d) => d.id).sort(), ['hub-only', 'local-only']);
  const p = world({ library: [design('new'), design('old')], stored: { garageSig: librarySignature([design('old')]), garageAt: 100 }, hub: { garage: { designs: [design('old')], updatedAt: 900 } } });
  await settle(p);
  assert.deepEqual(p.library.map((d) => d.id), ['new', 'old']);
  assert.deepEqual(writes(p).find((c) => c.path.endsWith('/saves/garage')).body.data.designs.map((d) => d.id), ['new', 'old']);
});

test('garage: saving or removing a design pushes after a pause; an oversized library is trimmed and says so', async () => {
  const w = world({ library: [] });
  await settle(w);
  w.calls.length = 0;
  w.library = Array.from({ length: 12 }, (_, i) => fatDesign(`d${i}`));
  w.sync.libraryChanged();
  assert.equal(w.timers.length, 1);
  w.timers[0].fn(); w.timers.length = 0;
  await tick(); await tick();
  const put = writes(w).find((c) => c.path.endsWith('/saves/garage'));
  assert.ok(byteLength(JSON.stringify(put.body)) <= 64 * 1024);
  assert.ok(put.body.data.designs.length < 12 && put.body.data.designs[0].id === 'd0');
  assert.ok(w.logs.some((l) => l.includes('oldest design') && l.includes('64 KB')));
  assert.equal(w.library.length, 12, 'the device keeps them all');
});

test('offline: the hub not answering is a status and a warning, never an exception; it is tried again next start', async () => {
  const w = world({ settingsCode: 'SD1-a', stored: { settingsCode: 'SD1-a', settingsAt: 50 }, equipped: ship() });
  w.offline = true;
  await settle(w);
  assert.equal(w.sync.status(), 'offline');
  assert.equal(syncStatusText(w.sync.status()), 'Offline: saved on this device');
  w.offline = false;
  await settle(w);
  assert.equal(w.sync.status(), 'saved');
  assert.ok(writes(w).some((c) => c.path.endsWith('/saves/settings')), 'the stamp was still newer than the hub, so it went up');
  assert.ok(w.statuses.includes('saving') && w.statuses.at(-1) === 'saved');
});

test('signed out mid-session: pending pushes are dropped and nothing more is sent', async () => {
  const w = world({ settingsCode: 'SD1-a' });
  await settle(w);
  w.settingsCode = 'SD1-b'; w.sync.settingsChanged();
  assert.equal(w.timers.length, 1);
  w.signedIn = false;
  w.calls.length = 0;
  await w.sync.onSession({ force: true });
  assert.equal(w.timers.length, 0);
  w.sync.shipChanged();
  await tick();
  assert.deepEqual(w.calls, []);
  assert.equal(w.sync.status(), 'guest');
});
