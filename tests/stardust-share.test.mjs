// Copying another pilot's ship or settings: the ship share code (SDS1-), the
// ?import= link, what the hub's answer is checked against, the settings change
// summary and the one-step undo. The pure parts of systems/shipShare.js and
// systems/shareImport.js; the prompts themselves are ui/shareImport.js and the garage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeShipCode, decodeShipCode, shipCodeProblem, importedShipName, SHIP_CODE_PREFIX, SHIP_CODE_MAX } from '../projects/Space-Shooter/systems/shipShare.js';
import { presetAppearance, newLayer, cleanAppearance, SAYINGS, SHAPES, MAX_LAYERS, PART_CHOICES } from '../projects/Space-Shooter/systems/shipLivery.js';
import {
  parseImportParams, withoutImportParams, sharedUrl, fetchShared, describeSettingsChange, readUndo, saveUndo, clearUndo,
  applyImportedSettings, undoImportedSettings,
} from '../projects/Space-Shooter/systems/shareImport.js';
import { defaultBinds } from '../projects/Space-Shooter/systems/keybinds.js';
import { encodeSettingsCode, decodeSettingsCode, flightSettings, updateFlightSettings, applySettingsCode } from '../projects/Space-Shooter/systems/flightSettings.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const b64url = (text) => Buffer.from(text).toString('base64url');
const forge = (data) => `${SHIP_CODE_PREFIX}${b64url(JSON.stringify(data))}`;
// The code format's own field names, so a test can build a hand-made one.
const layerRow = (over = []) => [6, 0.1, -0.2, 0.3, 0.25, 15, 0.8, 'ff8800', 12, ...over];
const valid = () => ({ v: 1, f: 'manta', p: [0, 2, 1, 0], c: ['b8b8b8', 'c2c2c2', 'a6a6a6', '4c4c4c', '47d8f5', '8c8c8c'], l: [layerRow()] });

const sample = () => {
  const a = presetAppearance('manta');
  a.parts = { body: 1, wings: 2, cockpit: 1, engines: 0 };
  a.paint.hull = '#112233';
  a.layers = [
    { ...newLayer('star', '#ff8800'), id: 'a', x: 0.1, y: -0.2, width: 0.3, height: 0.25, angle: 15, opacity: 0.8, flipX: true },
    { ...newLayer('text', '#00ff88'), id: 'b', saying: 'eat-dust', visible: false, recolor: false },
    { ...newLayer('skull', '#ffffff'), id: 'c', x: -0.65, y: 0.65, width: 1.8, height: 0.02, angle: -180, opacity: 0, flipY: true },
  ];
  return cleanAppearance(a);
};
// A design without its throwaway layer ids, to compare a decode against.
const bare = (a) => ({ ...a, layers: a.layers.map(({ id, ...layer }) => layer) });

// ---- ship code ----------------------------------------------------------------------------

test('ship code: a design survives encode and decode, with fresh layer ids', () => {
  const a = sample();
  const code = encodeShipCode(a);
  assert.match(code, /^SDS1-[A-Za-z0-9_-]+$/);
  const back = decodeShipCode(code);
  assert.deepEqual(bare(back), bare(a));
  assert.deepEqual(back.layers.map((l) => l.id), ['s1', 's2', 's3']);
  assert.equal(back.layers[1].saying, 'eat-dust');
  // The decoded design is itself valid and encodes to the same code.
  assert.deepEqual(cleanAppearance(back), back);
  assert.equal(encodeShipCode(back), code);
  // Surrounding whitespace from a copy-paste is fine.
  assert.deepEqual(bare(decodeShipCode(`  ${code}\n`)), bare(a));
});

test('ship code: every hull and part index round trips, and a full 32-layer ship still fits a chat message', () => {
  for (const [family, slots] of Object.entries(PART_CHOICES)) {
    for (let i = 0; i < Math.max(...Object.values(slots).map((list) => list.length)); i++) {
      const a = presetAppearance(family);
      for (const [slot, list] of Object.entries(slots)) a.parts[slot] = Math.min(i, list.length - 1);
      assert.deepEqual(bare(decodeShipCode(encodeShipCode(a))), bare(a), `${family} ${i}`);
    }
  }
  const full = presetAppearance('needle');
  for (let i = 0; i < MAX_LAYERS; i++) full.layers.push(i % 4 === 0 ? { ...newLayer('text', '#ffffff'), saying: SAYINGS[i % SAYINGS.length].id } : newLayer(SHAPES[i % (SHAPES.length - 1)], '#abcdef'));
  const code = encodeShipCode(full);
  assert.ok(code.length < 4000, `a full ship is ${code.length} characters`);
  assert.equal(decodeShipCode(code).layers.length, MAX_LAYERS);
  assert.ok(encodeShipCode(sample()).length < 600, 'a normal ship is a short code');
});

test('ship code: numbers are rounded, never changed past what the layer ranges allow', () => {
  const a = sample();
  a.layers[0].x = 0.123456789;
  a.layers[0].angle = 12.3456;
  const [layer] = decodeShipCode(encodeShipCode(a)).layers;
  assert.equal(layer.x, 0.1235);
  assert.equal(layer.angle, 12.35);
  assert.ok(cleanAppearance({ ...a, layers: [{ ...layer }] }));
});

test('ship code: only valid designs encode', () => {
  for (const bad of [null, {}, 'manta', { version: 2, family: 'hauler', parts: {}, paint: {}, layers: [] }, { ...sample(), parts: { body: 9, wings: 0, cockpit: 0, engines: 0 } }]) assert.equal(encodeShipCode(bad), null);
});

test('ship code: images are refused, wherever they hide', () => {
  const withImageKind = valid();
  assert.equal(decodeShipCode(forge(withImageKind)) !== null, true, 'the valid one is fine');
  // A png layer: not a shape the format has.
  assert.equal(decodeShipCode(forge({ ...valid(), l: [['png', 0, 0, 0.2, 0.2, 0, 1, 'ffffff', 15]] })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), l: [[99, 0, 0, 0.2, 0.2, 0, 1, 'ffffff', 15]] })), null);
  // A data: URI in any field.
  assert.equal(decodeShipCode(forge({ ...valid(), l: [layerRow().map((v, i) => (i === 7 ? PNG : v))] })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), f: PNG })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), image: PNG })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), decal: 'data:image/png;base64,AAAA' })), null);
  assert.match(shipCodeProblem(forge({ ...valid(), image: PNG })), /not valid/);
});

test('ship code: a text layer carries a saying id and nothing else', () => {
  const text = (...extra) => forge({ ...valid(), l: [[10, 0, 0, 0.3, 0.2, 0, 1, 'ffffff', 15, ...extra]] });
  assert.ok(decodeShipCode(text('stardust')), 'a listed saying');
  assert.equal(decodeShipCode(text('HELLO WORLD')), null, 'free text');
  assert.equal(decodeShipCode(text('not-a-saying')), null, 'an unknown id');
  assert.equal(decodeShipCode(text('__proto__')), null);
  assert.equal(decodeShipCode(text()), null, 'a text layer with no saying');
  assert.equal(decodeShipCode(text(42)), null);
  assert.equal(decodeShipCode(text('stardust', 'extra')), null);
  // And a saying on a layer that is not text is not a thing.
  assert.equal(decodeShipCode(forge({ ...valid(), l: [layerRow(['stardust'])] })), null);
  // The saying text is never in a code, only its id.
  assert.doesNotMatch(Buffer.from(encodeShipCode(sample()).slice(5), 'base64url').toString(), /EAT MY DUST/);
});

test('ship code: unknown hulls and parts are refused', () => {
  assert.equal(decodeShipCode(forge({ ...valid(), f: 'hauler' })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), f: '__proto__' })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), p: [0, 0, 0, 3] })), null, 'engine 3 does not exist');
  assert.equal(decodeShipCode(forge({ ...valid(), p: [0, 0, 0, -1] })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), p: [0, 0, 0.5, 0] })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), p: [0, 0, 0] })), null);
  assert.equal(decodeShipCode(forge({ ...valid(), f: 'courier', p: [1, 0, 0, 0] })), null, 'the Courier has one body');
});

test('ship code: bad colours, numbers and shapes are refused, not trimmed', () => {
  const bad = (patch) => decodeShipCode(forge({ ...valid(), ...patch }));
  assert.equal(bad({ c: ['b8b8b8'] }), null);
  assert.equal(bad({ c: ['b8b8b8', 'c2c2c2', 'a6a6a6', '4c4c4c', '47d8f5', 'red'] }), null);
  assert.equal(bad({ c: ['#b8b8b8', 'c2c2c2', 'a6a6a6', '4c4c4c', '47d8f5', '8c8c8c'] }), null);
  assert.equal(bad({ l: [layerRow().map((v, i) => (i === 1 ? 5 : v))] }), null, 'x out of range');
  assert.equal(bad({ l: [layerRow().map((v, i) => (i === 3 ? 0.001 : v))] }), null, 'too small');
  assert.equal(bad({ l: [layerRow().map((v, i) => (i === 6 ? 2 : v))] }), null, 'opacity above 1');
  assert.equal(bad({ l: [layerRow().map((v, i) => (i === 7 ? 'zzzzzz' : v))] }), null);
  assert.equal(bad({ l: [layerRow().map((v, i) => (i === 8 ? 16 : v))] }), null, 'flags');
  assert.equal(bad({ l: [layerRow().map((v, i) => (i === 1 ? '0.1' : v))] }), null, 'a number as text');
  assert.equal(bad({ l: Array.from({ length: MAX_LAYERS + 1 }, () => layerRow()) }), null, 'too many layers');
  assert.equal(bad({ l: [[6, 0, 0]] }), null);
  assert.equal(bad({ l: ['star'] }), null);
  assert.ok(bad({ l: Array.from({ length: MAX_LAYERS }, () => layerRow()) }), 'exactly the limit is fine');
});

test('ship code: anything that is not a code is null, and the status line says why', () => {
  const code = encodeShipCode(sample());
  const junk = [null, undefined, 7, {}, '', 'hello', 'SDS1-', 'SD1-abc', 'SDS2-abc', code.slice(5), `${code}!`, `${code}\u0000`, `${SHIP_CODE_PREFIX}${'A'.repeat(SHIP_CODE_MAX)}`,
    forge([1, 2]), forge('x'), forge(null), forge({ ...valid(), v: 2 }), forge({ ...valid(), extra: 1 }), forge({ f: 'manta' }), `${SHIP_CODE_PREFIX}${b64url('not json')}`, code.slice(0, code.length - 6)];
  for (const value of junk) assert.equal(decodeShipCode(value), null, String(value).slice(0, 30));
  assert.match(shipCodeProblem('hello'), /start with SDS1-/);
  assert.match(shipCodeProblem(code.slice(0, -6)), /not valid/);
  assert.equal(shipCodeProblem(code), null);
  // A settings code is not a ship code.
  assert.match(shipCodeProblem(encodeSettingsCode()), /not a Stardust ship code/);
});

test('copied ships are named after the pilot, shared codes after the hull', () => {
  assert.equal(importedShipName('manta', 'Ada'), "Ada's Manta");
  assert.equal(importedShipName('courier', 'Nova_1'), "Nova_1's Courier");
  assert.equal(importedShipName('wisp'), 'Shared Wisp');
  assert.equal(importedShipName('nope', 'Ada'), "Ada's Ship");
  assert.ok(importedShipName('manta', 'x'.repeat(80)).length <= 60);
});

// ---- the ?import= link -------------------------------------------------------------------

test('import links: only ship or settings from a real username', () => {
  assert.deepEqual(parseImportParams('?import=ship&from=Nova_Ace'), { kind: 'ship', from: 'Nova_Ace' });
  assert.deepEqual(parseImportParams('?hub=http://localhost:3100&from=abc&import=settings'), { kind: 'settings', from: 'abc' });
  assert.deepEqual(parseImportParams('import=ship&from=a-b'), { kind: 'ship', from: 'a-b' });
  for (const bad of ['', null, undefined, '?import=ship', '?from=Ada', '?import=ship&from=ab', `?import=ship&from=${'a'.repeat(21)}`, '?import=ship&from=a%20b', '?import=ship&from=<b>', '?import=ship&from=../x',
    '?import=garage&from=Ada', '?import=SHIP&from=Ada', '?import=&from=Ada', '?import=ship&import=settings']) {
    assert.equal(parseImportParams(bad), null, String(bad));
  }
});

test('the import params are removed from the address and nothing else is', () => {
  assert.equal(withoutImportParams('https://donavencrenshaw.com/games/stardust/?import=ship&from=Ada'), '/games/stardust/');
  assert.equal(withoutImportParams('https://x.test/games/stardust/?hub=http%3A%2F%2Flocalhost%3A3100&import=settings&from=Ada#garage'), '/games/stardust/?hub=http%3A%2F%2Flocalhost%3A3100#garage');
  assert.equal(withoutImportParams('https://x.test/games/stardust/'), '/games/stardust/');
  assert.equal(parseImportParams(new URL(withoutImportParams('https://x.test/g/?import=ship&from=Ada'), 'https://x.test').search), null, 'a reload would not ask again');
});

test('the hub address for a shared ship comes from the game\'s backend base, and only for a real username', () => {
  const base = 'https://api.donavencrenshaw.com/api/games/stardust';
  assert.equal(sharedUrl('ship', 'Ada', base), 'https://api.donavencrenshaw.com/api/stardust/pilots/Ada/ship');
  assert.equal(sharedUrl('settings', 'Nova_Ace', 'http://localhost:3100/api/games/stardust'), 'http://localhost:3100/api/stardust/pilots/Nova_Ace/settings');
  for (const args of [['garage', 'Ada', base], ['ship', 'a/b', base], ['ship', 'Ada', ''], ['ship', 'Ada', null], ['ship', 'Ada', 'not a url']]) assert.equal(sharedUrl(...args), null, JSON.stringify(args));
});

// ---- asking the hub ----------------------------------------------------------------------

const answer = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } });
const BASE = 'https://api.example/api/games/stardust';

test('fetchShared: a valid ship comes back normalised, from the hub address, with no cookies sent', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return answer(200, { username: 'Ada', displayName: 'Ada L', appearance: sample() })(); };
  const got = await fetchShared('ship', 'Ada', { backendBaseUrl: BASE, fetchImpl });
  assert.equal(got.status, 'ok');
  assert.equal(seen.url, 'https://api.example/api/stardust/pilots/Ada/ship');
  assert.equal(seen.init.credentials, 'omit');
  assert.deepEqual(got.pilot, { username: 'Ada', displayName: 'Ada L' });
  assert.deepEqual(got.appearance, sample());
});

test('fetchShared: a ship that is not what the hub vouched for is invalid, not trimmed', async () => {
  const a = sample();
  const cases = {
    'a layer the game would drop': { ...a, layers: [...a.layers, { ...a.layers[0], id: 'x', kind: 'png', image: PNG }] },
    'free text on a text layer': { ...a, layers: [{ ...a.layers[1], saying: 'HELLO' }] },
    'an unknown part': { ...a, parts: { ...a.parts, engines: 7 } },
    'no appearance': null,
    'junk': 'ship',
  };
  for (const [label, appearance] of Object.entries(cases)) {
    const got = await fetchShared('ship', 'Ada', { backendBaseUrl: BASE, fetchImpl: answer(200, { username: 'Ada', appearance }) });
    assert.equal(got.status, 'invalid', label);
  }
});

test('fetchShared: 404 is missing, a server error or no answer is offline, anything else unusual is invalid', async () => {
  const run = (fetchImpl, backendBaseUrl = BASE, from = 'Ada') => fetchShared('ship', from, { backendBaseUrl, fetchImpl });
  assert.equal((await run(answer(404, { error: 'not_found' }))).status, 'missing');
  assert.equal((await run(answer(500, {}))).status, 'offline');
  assert.equal((await run(answer(503))).status, 'offline');
  assert.equal((await run(async () => { throw new TypeError('network down'); })).status, 'offline');
  assert.equal((await run(answer(200, {}), '')).status, 'offline', 'no hub configured');
  assert.equal((await run(answer(429, {}))).status, 'invalid');
  assert.equal((await run(answer(200))).status, 'invalid', 'not JSON');
  assert.equal((await run(answer(200, {}), BASE, 'a/b')).status, 'offline', 'a bad username never reaches the network');
});

test('fetchShared: settings come back decoded and range-checked', async () => {
  const code = encodeSettingsCode();
  const got = await fetchShared('settings', 'Ada', { backendBaseUrl: BASE, fetchImpl: answer(200, { username: 'Ada', displayName: 'Ada', code, updatedAt: null }) });
  assert.equal(got.status, 'ok');
  assert.equal(got.code, code);
  assert.deepEqual(got.next, decodeSettingsCode(code));
  for (const code of [undefined, '', 'SD1-', 'SD1-!!!', `SD1-${b64url(JSON.stringify({ v: 1, m: [1, 99, 0], t: [0, 0, 0] }))}`, `SDS1-${b64url('{}')}`]) {
    assert.equal((await fetchShared('settings', 'Ada', { backendBaseUrl: BASE, fetchImpl: answer(200, { code }) })).status, 'invalid', String(code));
  }
});

// ---- settings: what changes, apply, undo ---------------------------------------------------

function reset() {
  updateFlightSettings((s) => {
    s.cameraMode = 'track';
    s.camera = { fovIndex: 2, distanceIndex: 2, stiffnessIndex: 1, swivelIndex: 2, transitionIndex: 1 };
    s.tilt = { deadIndex: 3, maxIndex: 5, sensIndex: 2 };
    s.autoFire = false;
    s.minimap = { show: true, zoomIndex: 0, iconIndex: 2 };
    s.controller = { stickDeadzone: 0.2, triggerDeadzone: 0.08, sensitivity: 1 };
    s.layouts = { desktop: null, 'touch-landscape': null, 'touch-portrait': null };
    s.binds = defaultBinds();
  });
}
const memory = () => { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map }; };
// A pilot's settings code: their own tweaks on top of the defaults.
function pilotCode(tweak) {
  reset();
  updateFlightSettings(tweak);
  const code = encodeSettingsCode();
  reset();
  return code;
}

test('settings summary: only what differs, in words, bindings included', () => {
  reset();
  const next = decodeSettingsCode(pilotCode((s) => {
    s.cameraMode = 'behind';
    s.camera = { ...s.camera, fovIndex: 5, swivelIndex: 4 };
    s.tilt = { deadIndex: 1, maxIndex: 3, sensIndex: 4 };
    s.autoFire = true;
    s.binds = { ...s.binds, keys: { ...s.binds.keys, boost: ['b'] }, pad: { ...s.binds.pad, brake: 6 }, sticks: 'left-turn' };
    s.controller = { stickDeadzone: 0.3, triggerDeadzone: 0.08, sensitivity: 1.5 };
    s.layouts = { desktop: { fire: { x: 0.5, y: 0.5, s: 1 } } };
  }));
  const rows = describeSettingsChange(flightSettings(), next);
  const text = rows.map((r) => `${r.label}: ${r.from} -> ${r.to}`);
  assert.ok(text.includes('Camera: Track view -> Behind the ship'), text.join('\n'));
  assert.ok(text.some((t) => t.startsWith('Field of view: 100 -> ')), text.join('\n'));
  assert.ok(text.some((t) => t.startsWith('Swivel speed: 3 of 6 -> 5 of 6')));
  assert.ok(text.includes('Auto fire: Off -> On'));
  assert.ok(text.some((t) => t.startsWith('Max tilt: 40° -> 30°')));
  assert.ok(text.some((t) => t.startsWith('Key: Boost: ') && t.endsWith('-> B')), text.join('\n'));
  assert.ok(text.some((t) => t.startsWith('Button: Brake')));
  assert.ok(text.includes('Controller sticks: Split -> Left stick turns'));
  assert.ok(text.includes('Stick dead zone: 20% -> 30%'));
  assert.ok(text.includes('Controller sensitivity: 1.00× -> 1.50×'));
  assert.ok(text.includes('HUD layout: default -> 1 replaced'));
  // Nothing that is the same shows up.
  assert.ok(!text.some((t) => t.startsWith('Minimap')) && !text.some((t) => t.startsWith('Field of view: 100 -> 100')));
  // The same settings change nothing.
  assert.deepEqual(describeSettingsChange(flightSettings(), decodeSettingsCode(encodeSettingsCode())), []);
});

test('settings summary: a long list of rebinds is cut short, and old codes without camera or binds only describe what they carry', () => {
  reset();
  const many = decodeSettingsCode(pilotCode((s) => {
    const keys = {};
    for (const action of Object.keys(s.binds.keys)) keys[action] = ['KeyQ'];
    s.binds = { ...s.binds, keys };
  }));
  const rows = describeSettingsChange(flightSettings(), many);
  assert.ok(rows.length <= 8, `${rows.length} rows`);
  assert.match(rows.at(-1).to, /^and \d+ more changes$/);
  const old = decodeSettingsCode(`SD1-${b64url(JSON.stringify({ v: 1, m: [1, 0, 2], a: 1, t: [3, 5, 2], l: {} }))}`);
  assert.deepEqual(describeSettingsChange(flightSettings(), old).map((r) => r.label), ['Auto fire']);
});

test('applying copied settings keeps the old ones; undo puts them back exactly, saved layouts included', () => {
  reset();
  updateFlightSettings((s) => { s.layouts = { ...s.layouts, desktop: { fire: { x: 0.2, y: 0.8, s: 1.2 } } }; s.camera = { ...s.camera, fovIndex: 1 }; });
  const mine = encodeSettingsCode();
  const theirs = pilotCode((s) => { s.cameraMode = 'behind'; s.autoFire = true; s.layouts = { ...s.layouts, 'touch-portrait': { fire: { x: 0.9, y: 0.9, s: 1 } } }; });
  const storage = memory();
  assert.equal(readUndo(storage), null);

  assert.equal(applyImportedSettings({ code: 'SD1-nonsense', from: 'Ada' }, storage), false);
  assert.equal(readUndo(storage), null, 'a bad code changes nothing and records nothing');

  // Put "mine" back as the current settings, then copy theirs.
  assert.ok(applySettingsCode(mine, { replaceLayouts: true }));
  assert.equal(encodeSettingsCode(), mine);
  assert.equal(applyImportedSettings({ code: theirs, from: 'Ada' }, storage), true);
  assert.equal(flightSettings().cameraMode, 'behind');
  assert.equal(flightSettings().autoFire, true);
  assert.ok(flightSettings().layouts['touch-portrait'], 'their layout came with the settings');
  assert.deepEqual(readUndo(storage), { code: mine, from: 'Ada', at: readUndo(storage).at });

  const undone = undoImportedSettings(storage);
  assert.equal(undone.from, 'Ada');
  assert.equal(encodeSettingsCode(), mine, 'exactly the old settings');
  assert.equal(flightSettings().layouts['touch-portrait'], null, 'their layout is gone again');
  assert.deepEqual(flightSettings().layouts.desktop, { fire: { x: 0.2, y: 0.8, s: 1.2 } });
  assert.equal(readUndo(storage), null, 'one undo, then nothing to undo');
  assert.equal(undoImportedSettings(storage), null);
});

test('the undo record is read back only if it holds a real settings code', () => {
  const storage = memory();
  assert.ok(saveUndo({ code: encodeSettingsCode(), from: 'Ada' }, storage, () => 123));
  assert.deepEqual(readUndo(storage), { code: encodeSettingsCode(), from: 'Ada', at: 123 });
  clearUndo(storage);
  assert.equal(readUndo(storage), null);
  for (const junk of ['', 'null', '{"code":"hello"}', '{"code":"SD1-!!"}', '{"code":7}', '[]', 'not json']) {
    storage.setItem('stardust.settingsUndo.v1', junk);
    assert.equal(readUndo(storage), null, junk);
  }
  // No storage at all (a private window): nothing breaks.
  assert.equal(readUndo(null), null);
  assert.equal(saveUndo({ code: 'x', from: 'a' }, { setItem() { throw new Error('full'); } }), false);
});

// ---- wiring --------------------------------------------------------------------------------

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the game wires the import prompts: boot, garage, settings Undo, and a stylesheet', () => {
  const boot = read('projects/Space-Shooter/boot.js');
  assert.match(boot, /initShareImport/);
  const ui = read('projects/Space-Shooter/ui/shareImport.js');
  assert.match(ui, /history\.replaceState/, 'the link is cleared before anything asks');
  assert.match(ui, /applyImportedSettings/);
  assert.match(ui, /stardust:import-ship/);
  const garage = read('projects/Space-Shooter/ui/shipGarage.js');
  assert.match(garage, /stardust:import-ship/);
  assert.match(garage, /Keep my ship/);
  assert.match(garage, /saveImported\(true\)/, 'equipping keeps the ship it replaces');
  assert.match(garage, /garage-code-use/);
  assert.match(read('projects/Space-Shooter/ui/settingsPanel.js'), /undoImportedSettings/);
  assert.match(read('projects/Space-Shooter/index.html'), /shareImport\.css/);
  // Copied designs go through the same equip path as any other, so a copied build flies with its own stats and hitbox.
  assert.match(garage, /equipAppearance\(draft\)/);
  // No pictures, no free text, no mouse steering anywhere in the new code.
  for (const file of ['systems/shipShare.js', 'systems/shareImport.js', 'ui/shareImport.js']) {
    assert.doesNotMatch(read(`projects/Space-Shooter/${file}`), /FileReader|readAsDataURL|type\s*=\s*['"]file['"]|mousemove|pointermove/, file);
  }
});
