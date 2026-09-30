// Browser check for the hub sync: the equipped ship, flight settings and designs going to a
// signed-in pilot's account, the device/input tag on finish requests, ghosts drawn in the
// ship they were flown in, and "Practice in your ship". All traffic to the hub is intercepted
// with a fake: nothing reaches the public service.
//
//   node scripts/test-stardust-hub-sync-browser.mjs            (starts its own preview server)
//   EVIDENCE_DIR=<dir> ...                                      (screenshots go here; default: the OS temp dir)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.EVIDENCE_DIR || path.join(os.tmpdir(), 'stardust-hub-sync');
await mkdir(out, { recursive: true });
const fallback = pathToFileURL('C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href;
const pw = await import(process.env.PLAYWRIGHT_MODULE || fallback);
const chromium = pw.chromium || pw.default?.chromium;
const engine = (p) => import(pathToFileURL(path.join(root, 'projects', 'Space-Shooter', p)).href);
const { flyWeeklyLap } = await engine('engine/weekly/pilot.js');
const { createWeeklyLayout } = await engine('engine/weekly/layout.js');
const { encodeInputLog } = await engine('engine/weekly/replay.js');
const { WEEKLY_PHYSICS } = await engine('engine/weekly/sim.js');
const { currentWeekly } = await engine('tracks/weekly.js');
const { presetAppearance } = await engine('systems/shipLivery.js');

const port = Number(process.env.PORT) || 4700 + 30 + Math.floor(Math.random() * 200);
const server = spawn(process.execPath, [path.join(root, 'scripts', 'preview-stardust.mjs')], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/projects/Space-Shooter/`;
const event = currentWeekly();
const STEP_LOG = [];
const say = (line) => { STEP_LOG.push(line); console.log(line); };
const pageErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The fake hub ---------------------------------------------------------------------
function makeHub(init = {}) {
  const hub = { signedIn: true, ship: null, settings: null, garage: null, ghost: null, refuse: {}, calls: [], runs: 0, ...init };
  hub.writes = () => hub.calls.filter((c) => c.method !== 'GET');
  hub.finishes = () => hub.calls.filter((c) => c.path.endsWith('/finish'));
  hub.handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const origin = (await req.headerValue('origin')) || '*';
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body; try { body = req.postData() ? JSON.parse(req.postData()) : undefined; } catch { body = req.postData(); }
    hub.calls.push({ method, path: url.pathname + url.search, body, at: Date.now() });
    const send = (status, data) => route.fulfill({ status, headers: { ...headers, 'content-type': 'application/json' }, body: status === 204 ? '' : JSON.stringify(data ?? {}) });
    const p = url.pathname;
    const refused = hub.refuse[`${method} ${p}`];
    if (refused && hub.signedIn) return send(refused.status, refused.data);
    if (p === '/api/users/session') return send(200, hub.signedIn ? { user: { username: 'rook', displayName: 'Rook' } } : { user: null });
    if (p.endsWith('/v1/health')) return send(200, { service: 'stardust', version: 1, ok: true });
    if (p === '/api/games/stardust') return send(200, { boards: [{ board: 'full', version: 1 }, { board: event.id, version: event.version }, ...['alpha-relay', 'beacon-prime', 'dustfall-station', 'nether-crossing', 'iron-veil'].map((board) => ({ board, version: 1 }))] });
    if (p === '/api/games/stardust/runs') { hub.runs += 1; return send(201, { runId: `fixture-${hub.runs}` }); }
    if (p.endsWith('/finish')) return send(200, { status: 'accepted', timeMs: body?.timeMs, best: { rank: 4, timeMs: body?.timeMs }, personalBest: true, rankBefore: 6 });
    if (p.endsWith('/ghost')) return hub.ghost ? send(200, hub.ghost) : send(404, { error: 'no_ghost' });
    if (p.includes('/around-me')) return send(404, {});
    if (p.endsWith('/me')) return send(200, { bests: {} });
    if (p.includes('/boards/')) return send(200, { entries: [] });
    if (p === '/api/stardust/ship') {
      if (!hub.signedIn) return send(401, { error: 'unauthorized' });
      if (method === 'GET') return hub.ship ? send(200, { build: null, family: hub.ship.family, appearance: hub.ship, updatedAt: new Date().toISOString() }) : send(404, { error: 'no_ship' });
      if (method === 'PUT') { hub.ship = body.appearance; return send(200, { build: null, family: body.appearance.family, appearance: body.appearance, updatedAt: new Date().toISOString() }); }
      if (method === 'DELETE') { hub.ship = null; return send(204); }
    }
    const slot = p.match(/^\/api\/games\/stardust\/saves\/(\w+)$/)?.[1];
    if (slot) {
      if (!hub.signedIn) return send(401, { error: 'unauthorized' });
      if (method === 'GET') return hub[slot] ? send(200, { version: 1, data: hub[slot] }) : send(404, { error: 'not_found' });
      if (method === 'PUT') { hub[slot] = body.data; return send(200, { version: 1, data: body.data }); }
    }
    return send(404, { error: 'unknown' });
  };
  return hub;
}

async function until(label, fn, ms = 8000) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(`timed out waiting for: ${label}`);
    await sleep(50);
  }
}

const browser = await chromium.launch({ headless: true });
async function openPage(hub, { context = {}, init = null, query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, ...context });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${context.label || 'page'}: ${e.stack || e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|CORS/i.test(m.text())) pageErrors.push(`console.error: ${m.text()}`); });
  await page.route('https://api.donavencrenshaw.com/**', hub.handler);
  if (init) await page.addInitScript(init);
  await page.goto(base + query);
  await until('game boots', () => page.evaluate(() => /FLIGHT SYSTEMS READY|LOCAL FLIGHT|SIGNED IN|GUEST|OFFLINE/.test(document.getElementById('boot-status')?.textContent + document.getElementById('connection-status')?.textContent)), 20000);
  return { page, ctx };
}
const syncLine = (page) => page.evaluate(() => document.querySelector('[data-fx-sync]')?.textContent);
const waitSigned = (page) => until('signed in chip', () => page.evaluate(() => document.getElementById('connection-status').textContent.includes('SIGNED IN') || document.getElementById('connection-status').textContent.includes('GUEST')));
const apiWrites = (hub) => hub.writes().filter((c) => /\/saves\/|\/api\/stardust\/ship/.test(c.path));

async function equipInGarage(page) {
  // Opening the garage starts loading the ship parts; Equip unlocks when they are in.
  await page.locator('#hangar-ship').click();
  await page.waitForSelector('#ship-garage[open]');
  await until('garage ready', () => page.evaluate(() => { const b = document.getElementById('garage-equip'); return b && !b.disabled; }), 90000);
  await page.waitForTimeout(450);
  await page.locator('#garage-equip').click();
  await until('garage closed', () => page.evaluate(() => !document.getElementById('ship-garage').open), 10000);
}
const storedShip = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('stardust.courier.appearance.v1')));

// Flies the test pilot's lap by stepping the weekly mode directly, then returns when the finish event fired.
async function flyLap(page, { ship = null } = {}) {
  await page.evaluate(async ({ ship }) => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    const { updateWeekly, currentWeeklySession } = await import('/projects/Space-Shooter/engine/modes/weekly.js');
    const { flyWeeklyLap } = await import('/projects/Space-Shooter/engine/weekly/pilot.js');
    const { keysFromFrame, BIT, WEEKLY_PHYSICS } = await import('/projects/Space-Shooter/engine/weekly/sim.js');
    const STEP = 1 / 120;
    const session = currentWeeklySession();
    for (let i = 0; i < 400 && state.ui.countdownActive; i++) updateWeekly(0.05);
    const lap = flyWeeklyLap(session.layout, ship ? { physics: WEEKLY_PHYSICS.BUILD, ship } : {});
    if (!lap.finished) throw new Error('the test pilot did not finish its lap');
    for (const frame of lap.frames) {
      Object.assign(state.keys, keysFromFrame(frame));
      state.keys.launch = !!(frame.bits & BIT.LAUNCH); state.keys.shoot = !!(frame.bits & BIT.SHOOT);
      updateWeekly(STEP);
      if (state.run.current.completed) break;
    }
    if (!state.run.current.completed) throw new Error('the lap did not complete');
  }, { ship });
}

const failures = [];
const check = async (label, fn) => {
  try { await fn(); say(`ok    ${label}`); } catch (error) { failures.push(`${label}: ${error.message}`); say(`FAIL  ${label}\n      ${String(error.message).split('\n').join('\n      ')}`); }
};

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch { /* starting */ } await sleep(100); }

  // A settings code for a different setup, made in a throwaway guest page.
  const scratch = makeHub({ signedIn: false });
  const { page: scratchPage, ctx: scratchCtx } = await openPage(scratch);
  const remoteCode = await scratchPage.evaluate(async () => {
    const { updateFlightSettings, encodeSettingsCode } = await import('/projects/Space-Shooter/systems/flightSettings.js');
    updateFlightSettings((s) => { s.cameraMode = 'behind'; s.autoFire = true; s.minimap.zoomIndex = 3; });
    return encodeSettingsCode();
  });
  await scratchCtx.close();

  // ===== Signed in, desktop =====
  const hub = makeHub();
  const { page, ctx } = await openPage(hub, { context: { label: 'signed-in desktop' } });
  await waitSigned(page);
  await until('first sync finished', async () => hub.calls.some((c) => c.path === '/api/stardust/ship') && (await syncLine(page)) !== undefined);
  await sleep(300);

  await check('signed in with nothing to save: the start-up sync only reads (ship, settings, garage), writes nothing', async () => {
    assert.deepEqual(hub.writes().filter((c) => /\/saves\/|\/api\/stardust\/ship/.test(c.path)), []);
    const gets = hub.calls.filter((c) => c.method === 'GET').map((c) => c.path);
    for (const p of ['/api/stardust/ship', '/api/games/stardust/saves/settings', '/api/games/stardust/saves/garage']) assert.ok(gets.includes(p), `GET ${p}`);
    assert.equal(await syncLine(page), 'Saved to your account');
  });

  await check('equipping a ship in the garage sends PUT /api/stardust/ship { appearance } in the background', async () => {
    const before = hub.calls.length;
    await equipInGarage(page);
    const put = await until('PUT ship', () => hub.calls.slice(before).find((c) => c.method === 'PUT' && c.path === '/api/stardust/ship'));
    assert.deepEqual(Object.keys(put.body), ['appearance']);
    assert.deepEqual(put.body.appearance, await storedShip(page), 'exactly what the garage equipped');
    assert.equal(put.body.appearance.family, 'needle');
  });

  await check('changing a flight setting pushes the settings slot after a pause: PUT saves/settings { version, data: { code, updatedAt } }', async () => {
    const before = hub.calls.length;
    await page.evaluate(async () => {
      const { updateFlightSettings } = await import('/projects/Space-Shooter/systems/flightSettings.js');
      updateFlightSettings((s) => { s.autoFire = !s.autoFire; });
      updateFlightSettings((s) => { s.minimap.iconIndex = 4; });
    });
    await sleep(1500);
    assert.equal(hub.calls.slice(before).filter((c) => c.path.endsWith('/saves/settings') && c.method === 'PUT').length, 0, 'not sent while the pilot is still changing things');
    assert.equal(await syncLine(page), 'Saving to your account…');
    const put = await until('PUT settings', () => hub.calls.slice(before).find((c) => c.method === 'PUT' && c.path === '/api/games/stardust/saves/settings'), 9000);
    assert.equal(hub.calls.slice(before).filter((c) => c.path.endsWith('/saves/settings') && c.method === 'PUT').length, 1, 'two edits, one request');
    assert.equal(put.body.version, 1);
    assert.match(put.body.data.code, /^SD1-/);
    assert.ok(Number.isFinite(put.body.data.updatedAt) && put.body.data.updatedAt > 1.7e12);
    assert.equal(put.body.data.code, await page.evaluate(async () => (await import('/projects/Space-Shooter/systems/flightSettings.js')).encodeSettingsCode()));
    await until('status saved', async () => (await syncLine(page)) === 'Saved to your account');
  });

  await check('saving a design pushes the garage slot: PUT saves/garage { version, data: { designs, updatedAt } }', async () => {
    const before = hub.calls.length;
    await page.evaluate(async () => {
      const { saveDesign } = await import('/projects/Space-Shooter/systems/liveryLibrary.js');
      saveDesign('Sync test', JSON.parse(localStorage.getItem('stardust.courier.appearance.v1')));
    });
    const put = await until('PUT garage', () => hub.calls.slice(before).find((c) => c.method === 'PUT' && c.path === '/api/games/stardust/saves/garage'), 9000);
    assert.equal(put.body.data.designs.length, 1);
    assert.equal(put.body.data.designs[0].name, 'Sync test');
    assert.deepEqual(Object.keys(put.body.data.designs[0]).sort(), ['appearance', 'id', 'name']);
    assert.ok(put.body.data.updatedAt > 1.7e12);
  });

  await check('the Practice button shows for a custom ship and starts a build preview that is never submitted', async () => {
    await page.reload();
    await until('card', () => page.evaluate(() => !document.getElementById('weekly-card').hidden));
    await until('practice visible', () => page.evaluate(() => { const b = document.getElementById('weekly-practice-btn'); return b && !b.hidden && !b.disabled; }));
    assert.equal(await page.textContent('#weekly-practice-btn'), 'Practice in your ship');
    await page.screenshot({ path: path.join(out, 'hangar-practice-button.png') });
    const runsBefore = hub.runs, callsBefore = hub.calls.length;
    await page.evaluate(() => document.getElementById('weekly-practice-btn').click());
    await until('preview flight', () => page.evaluate(async () => { const { state } = await import('/projects/Space-Shooter/state.js'); return state.run?.kind === 'weekly' && state.run.current?.ship; }));
    const info = await page.evaluate(async () => { const { state } = await import('/projects/Space-Shooter/state.js'); return { preview: state.run.preview, ship: state.run.current.ship, physics: state.run.current.physics, stats: state.run.current.stats }; });
    assert.equal(info.preview, true);
    assert.match(info.ship, /^needle:/);
    assert.equal(info.physics, WEEKLY_PHYSICS.BUILD);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, 'practice-flight.png') });
    assert.match(await page.evaluate(() => document.body.innerText), /Test build needle:/);
    await flyLap(page, { ship: info.ship });
    await page.waitForTimeout(400);
    assert.equal(hub.runs, runsBefore, 'no hub run was opened');
    assert.deepEqual(hub.calls.slice(callsBefore).filter((c) => /\/runs/.test(c.path)), [], 'nothing was submitted, opened or finished');
    assert.match(await page.textContent('#starmap-end-save'), /Preview flight — not submitted/);
    const best = await page.evaluate((key) => localStorage.getItem(key), `stardust.weekly.${'weekly-01'}.v1.best`);
    assert.equal(best, null, 'a practice time in a build is not this browser\'s best on the standard ship');
    await page.screenshot({ path: path.join(out, 'practice-finished.png') });
  });

  await check('a finish request carries client { device, input, appearance }: desktop keyboard, standard ship, the equipped look', async () => {
    await page.reload();
    await until('weekly live', () => page.evaluate(() => { const b = document.getElementById('weekly-btn'); return b && !b.disabled && /^Fly week/.test(b.textContent); }));
    await page.evaluate(() => document.getElementById('weekly-btn').click());
    await until('countdown', () => page.evaluate(async () => { const { state } = await import('/projects/Space-Shooter/state.js'); return state.run?.kind === 'weekly'; }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    await until('run opened', () => hub.runs >= 1);
    await flyLap(page);
    const finish = await until('finish request', () => hub.finishes().at(-1));
    assert.ok(finish.body.timeMs > 40000);
    assert.equal(typeof finish.body.inputLog, 'string');
    assert.deepEqual({ device: finish.body.client.device, input: finish.body.client.input }, { device: 'desktop', input: 'keyboard' });
    assert.equal('build' in finish.body.client, false, 'ranked flights are the standard ship: no build');
    assert.deepEqual(finish.body.client.appearance, await storedShip(page));
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.weekly.weekly-01.v1.best')));
    assert.deepEqual(best.appearance, await storedShip(page), 'the local best keeps the ship it was set in');
    assert.equal('build' in best, false);
    say(`      finish body client: ${JSON.stringify({ ...finish.body.client, appearance: '{…}' })}`);
    await page.screenshot({ path: path.join(out, 'ranked-finish.png') });
  });

  await check('on an event that allows builds the finish says which build was flown', async () => {
    await page.reload();
    await until('weekly live', () => page.evaluate(() => { const b = document.getElementById('weekly-btn'); return b && !b.disabled && /^Fly week/.test(b.textContent); }));
    // Test-only: no event allows builds yet, so flip the flag on the running game's own event object.
    await page.evaluate(async () => { const { currentWeekly } = await import('/projects/Space-Shooter/tracks/weekly.js'); currentWeekly().ships = 'builds'; });
    await page.evaluate(() => document.getElementById('weekly-btn').click());
    await until('countdown', () => page.evaluate(async () => { const { state } = await import('/projects/Space-Shooter/state.js'); return state.run?.current?.ship; }));
    const ship = await page.evaluate(async () => (await import('/projects/Space-Shooter/state.js')).state.run.current.ship);
    await flyLap(page, { ship });
    const finish = await until('finish request', () => hub.finishes().length >= 2 && hub.finishes().at(-1));
    assert.equal(finish.body.client.build, ship);
    assert.match(ship, /^needle:/);
  });

  // ===== Newer hub settings are applied on start; a hub ship is adopted =====
  await ctx.close();
  await check('a newer settings slot on the hub is applied when the game starts, and not sent back', async () => {
    const hub2 = makeHub({ settings: { code: remoteCode, updatedAt: Date.now() + 60000 } });
    const { page: p2, ctx: c2 } = await openPage(hub2, { context: { label: 'pull settings' } });
    await until('applied', () => p2.evaluate(() => { try { return JSON.parse(localStorage.getItem('stardust.flight.v1')).cameraMode === 'behind'; } catch { return false; } }));
    const s = await p2.evaluate(() => JSON.parse(localStorage.getItem('stardust.flight.v1')));
    assert.equal(s.cameraMode, 'behind');
    assert.equal(s.autoFire, true);
    assert.equal(s.minimap.zoomIndex, 3);
    await until('status', async () => (await syncLine(p2)) === 'Saved to your account');
    await sleep(5200);
    assert.deepEqual(apiWrites(hub2), [], 'pulling is not a local edit: nothing is pushed back');
    await c2.close();
  });

  await check('a device with no ship adopts the hub ship (equipped locally, nothing pushed back)', async () => {
    const hub3 = makeHub({ ship: presetAppearance('manta') });
    const { page: p3, ctx: c3 } = await openPage(hub3, { context: { label: 'adopt ship' } });
    const adopted = await until('adopted', () => p3.evaluate(() => { try { return JSON.parse(localStorage.getItem('stardust.courier.appearance.v1'))?.family === 'manta'; } catch { return false; } }), 60000);
    assert.ok(adopted);
    await sleep(1500);
    assert.deepEqual(hub3.writes().filter((c) => c.path === '/api/stardust/ship'), []);
    await p3.screenshot({ path: path.join(out, 'adopted-ship-hangar.png') });
    // Going back to the standard ship removes it from the account.
    await p3.evaluate(async () => { (await import('/projects/Space-Shooter/systems/shipAppearance.js')).unequipAppearance(); });
    const del = await until('DELETE ship', () => hub3.calls.find((c) => c.method === 'DELETE' && c.path === '/api/stardust/ship'));
    assert.ok(del);
    assert.equal(hub3.ship, null);
    assert.equal(await p3.evaluate(() => localStorage.getItem('stardust.courier.appearance.v1')), null);
    await c3.close();
  });

  await check('the device ship wins over a different hub ship and is pushed', async () => {
    const hub4 = makeHub({ ship: presetAppearance('manta') });
    const { page: p4, ctx: c4 } = await openPage(hub4, { context: { label: 'device ship wins' }, init: () => { localStorage.setItem('stardust.courier.appearance.v1', JSON.stringify({ version: 2, family: 'wisp', parts: { body: 0, wings: 0, cockpit: 0, engines: 0 }, paint: { hull: '#b8b8b8', wings: '#c2c2c2', nose: '#a6a6a6', trim: '#4c4c4c', glass: '#47d8f5', engines: '#8c8c8c' }, layers: [] })); } });
    const put = await until('PUT ship', () => hub4.calls.find((c) => c.method === 'PUT' && c.path === '/api/stardust/ship'), 60000);
    assert.equal(put.body.appearance.family, 'wisp');
    assert.equal(hub4.ship.family, 'wisp');
    await c4.close();
  });

  await check('a full slot list (409 no_free_slot) is logged once and that slot is left alone', async () => {
    const hub5 = makeHub({ refuse: { 'PUT /api/games/stardust/saves/settings': { status: 409, data: { error: 'no_free_slot' } } } });
    const warnings = [];
    const { page: p5, ctx: c5 } = await openPage(hub5, { context: { label: 'no slot' } });
    p5.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await until('start-up sync done', async () => hub5.calls.some((c) => c.path === '/api/games/stardust/saves/garage') && (await syncLine(p5)) === 'Saved to your account');
    await p5.evaluate(async () => { const { updateFlightSettings } = await import('/projects/Space-Shooter/systems/flightSettings.js'); updateFlightSettings((s) => { s.autoFire = !s.autoFire; }); });
    await until('attempt', () => hub5.calls.some((c) => c.method === 'PUT' && c.path.endsWith('/saves/settings')), 9000);
    await p5.evaluate(async () => { const { updateFlightSettings } = await import('/projects/Space-Shooter/systems/flightSettings.js'); updateFlightSettings((s) => { s.autoFire = !s.autoFire; }); });
    await sleep(5200);
    assert.equal(hub5.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/saves/settings')).length, 1, 'no second try this session');
    assert.ok(warnings.some((w) => /no free save slot/.test(w)), `console warning: ${warnings.join(' | ')}`);
    assert.match(await syncLine(p5), /no free save slot/);
    await c5.close();
  });

  // ===== Guest =====
  await check('a guest changes settings, equips a ship and saves a design: no save or ship request is ever made', async () => {
    const guestHub = makeHub({ signedIn: false });
    const { page: pg, ctx: cg } = await openPage(guestHub, { context: { label: 'guest' } });
    await until('guest chip', () => pg.evaluate(() => /GUEST/.test(document.getElementById('connection-status').textContent)));
    await equipInGarage(pg);
    await pg.evaluate(async () => {
      const { updateFlightSettings } = await import('/projects/Space-Shooter/systems/flightSettings.js');
      updateFlightSettings((s) => { s.autoFire = !s.autoFire; });
      const { saveDesign } = await import('/projects/Space-Shooter/systems/liveryLibrary.js');
      saveDesign('Guest design', JSON.parse(localStorage.getItem('stardust.courier.appearance.v1')));
    });
    await sleep(5500);
    const paths = guestHub.calls.map((c) => `${c.method} ${c.path}`);
    assert.deepEqual(paths.filter((p) => /\/saves\/|\/api\/stardust\/ship/.test(p)), [], `requests: ${paths.join(', ')}`);
    assert.equal(guestHub.writes().length, 0);
    assert.equal(await syncLine(pg), 'Sign in to save to your account');
    assert.ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('stardust.courier.appearance.v1'))), 'everything stays on the device');
    // Practice still works for a guest.
    await pg.reload();
    await until('practice', () => pg.evaluate(() => { const b = document.getElementById('weekly-practice-btn'); return b && !b.hidden && !b.disabled; }));
    await cg.close();
  });

  await check('offline (the hub does not answer): play goes on, the settings line says so', async () => {
    const ctxOff = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const po = await ctxOff.newPage();
    po.on('pageerror', (e) => pageErrors.push(`offline: ${e.stack || e}`));
    await po.route('https://api.donavencrenshaw.com/**', (r) => r.abort());
    await po.goto(base);
    await until('boot', () => po.evaluate(() => /READY/.test(document.getElementById('boot-status').textContent)), 20000);
    await until('offline chip', () => po.evaluate(() => /OFFLINE/.test(document.getElementById('connection-status').textContent)));
    assert.equal(await syncLine(po), 'Offline: saved on this device');
    await ctxOff.close();
  });

  // ===== Phone with touch, and a controller =====
  await check('a phone flying with the touch controls says device phone, input touch', async () => {
    const phoneHub = makeHub();
    const { page: pp, ctx: cp } = await openPage(phoneHub, { context: { label: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
    await waitSigned(pp);
    await until('weekly live', () => pp.evaluate(() => { const b = document.getElementById('weekly-btn'); return b && !b.disabled && /^Fly week/.test(b.textContent); }));
    await pp.evaluate(() => document.getElementById('weekly-btn').click());
    await until('countdown', () => pp.evaluate(async () => { const { state } = await import('/projects/Space-Shooter/state.js'); return state.run?.kind === 'weekly'; }));
    // A real finger on the drive stick (DevTools touch events), pushed up for gas.
    await until('stick shown', () => pp.evaluate(() => { const e = document.querySelector('.fx-stick'); return e && e.getBoundingClientRect().width > 0; }));
    const cdp = await cp.newCDPSession(pp);
    const box = await pp.locator('.fx-stick').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - box.height * 0.35, id: 1 }] });
    await pp.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pp.screenshot({ path: path.join(out, 'phone-flight.png') });
    await until('run opened', () => phoneHub.runs >= 1);
    await flyLap(pp);
    const finish = await until('finish', () => phoneHub.finishes().at(-1));
    assert.deepEqual({ device: finish.body.client.device, input: finish.body.client.input }, { device: 'phone', input: 'touch' });
    assert.equal('appearance' in finish.body.client, false, 'no ship equipped on this phone');
    await cp.close();
  });

  await check('a tablet-sized touch screen is a tablet, and a controller driving says input controller', async () => {
    const padHub = makeHub();
    const fakePad = () => {
      const pad = { id: 'Fake pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      navigator.getGamepads = () => [pad];
      window.__pad = pad;
    };
    const { page: pt, ctx: ct } = await openPage(padHub, { context: { label: 'tablet+pad', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, init: fakePad });
    await waitSigned(pt);
    await until('weekly live', () => pt.evaluate(() => { const b = document.getElementById('weekly-btn'); return b && !b.disabled && /^Fly week/.test(b.textContent); }));
    await pt.evaluate(() => document.getElementById('weekly-btn').click());
    await until('countdown', () => pt.evaluate(async () => { const { state } = await import('/projects/Space-Shooter/state.js'); return state.run?.kind === 'weekly'; }));
    await pt.waitForTimeout(400);
    await pt.evaluate(() => { const p = window.__pad; p.axes[2] = 0.8; p.axes[1] = -0.9; p.buttons[7] = { pressed: true, touched: true, value: 1 }; p.timestamp += 1; });
    await pt.waitForTimeout(900);
    await pt.evaluate(() => { const p = window.__pad; p.axes[2] = 0; p.axes[1] = 0; p.buttons[7] = { pressed: false, touched: false, value: 0 }; });
    await until('run opened', () => padHub.runs >= 1);
    await flyLap(pt);
    const finish = await until('finish', () => padHub.finishes().at(-1));
    assert.deepEqual({ device: finish.body.client.device, input: finish.body.client.input }, { device: 'tablet', input: 'controller' });
    await ct.close();
  });

  // ===== Ghosts drawn in the ship they were flown in =====
  await check('a hub ghost flown in a custom ship is drawn in that ship (paint, decal and build size)', async () => {
    const ghostShip = presetAppearance('wisp');
    ghostShip.parts = { body: 0, wings: 1, cockpit: 0, engines: 1 };
    ghostShip.paint = { hull: '#ff2d7a', wings: '#ffd23f', nose: '#ffffff', trim: '#3a0ca3', glass: '#00e5ff', engines: '#ff6b35' };
    ghostShip.layers = [{ id: 'star-1', kind: 'star', x: 0, y: 0.05, width: 0.3, height: 0.3, angle: 0, opacity: 1, color: '#ffffff', flipX: false, flipY: false, visible: true, recolor: true }];
    const build = 'wisp:0-1-0-1';
    const layout = createWeeklyLayout(event);
    const lap = flyWeeklyLap(layout, { physics: WEEKLY_PHYSICS.BUILD, ship: build });
    assert.ok(lap.finished, 'the test pilot finishes the wisp build');
    const inputLog = encodeInputLog({ eventId: event.id, version: event.version, frames: lap.frames, finishMs: lap.time, physics: lap.physics, ship: build });
    const ghostHub = makeHub({ ghost: { rank: 1, username: 'vega', displayName: 'Vega', timeMs: Math.round(lap.time), inputLog, appearance: ghostShip, build } });
    const { page: pgh, ctx: cgh } = await openPage(ghostHub, { context: { label: 'ghost' } });
    await waitSigned(pgh);
    await until('weekly live', () => pgh.evaluate(() => { const b = document.getElementById('weekly-btn'); return b && !b.disabled && /^Fly week/.test(b.textContent); }));
    const artBefore = await pgh.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/art/garage/')).length);
    await pgh.evaluate(() => document.getElementById('weekly-btn').click());
    await until('ghost set', () => pgh.evaluate(async () => { const { weeklyGhosts } = await import('/projects/Space-Shooter/engine/modes/weekly.js'); return weeklyGhosts().some((g) => g.label.startsWith('#1') && g.appearance?.family === 'wisp' && g.build === 'wisp:0-1-0-1'); }), 20000);
    // Launch, then let the ghost run a few seconds ahead of the parked ship.
    await pgh.evaluate(async () => {
      const { state } = await import('/projects/Space-Shooter/state.js');
      const { updateWeekly } = await import('/projects/Space-Shooter/engine/modes/weekly.js');
      const { BIT } = await import('/projects/Space-Shooter/engine/weekly/sim.js');
      for (let i = 0; i < 400 && state.ui.countdownActive; i++) updateWeekly(0.05);
      state.keys.launch = true; updateWeekly(1 / 120); state.keys.launch = false;
    });
    const sprite = await until('ghost painted', async () => {
      await pgh.waitForTimeout(250);
      return pgh.evaluate(async () => { const { weeklyGhosts } = await import('/projects/Space-Shooter/engine/modes/weekly.js'); const g = weeklyGhosts().find((x) => x.label.startsWith('#1')); return g?.sprite ? { w: g.sprite.width, h: g.sprite.height } : null; });
    }, 90000);
    assert.deepEqual(sprite, { w: 384, h: 384 }, 'painted once at 384');
    const artAfter = await pgh.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/art/garage/')).length);
    say(`      ship parts requested only for the ghost: ${artAfter - artBefore} images (none before it was needed: ${artBefore === 0})`);
    // The same canvas the renderer drew: show it, and the flight with the ghost in it.
    await pgh.waitForTimeout(700);
    await pgh.screenshot({ path: path.join(out, 'ghost-custom-ship-flight.png') });
    await pgh.evaluate(async () => {
      const { weeklyGhosts } = await import('/projects/Space-Shooter/engine/modes/weekly.js');
      const g = weeklyGhosts().find((x) => x.label.startsWith('#1'));
      const c = document.createElement('canvas'); c.width = c.height = 384; c.getContext('2d').drawImage(g.sprite, 0, 0);
      window.__spriteUrl = c.toDataURL('image/png');
    });
    const url = await pgh.evaluate(() => window.__spriteUrl);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(out, 'ghost-sprite.png'), Buffer.from(url.split(',')[1], 'base64'));
    // The painted canvas carries the livery (pink hull, yellow wings), not the standard sprite's grey.
    const colours = await pgh.evaluate(() => {
      const g = document.createElement('canvas');
      return import('/projects/Space-Shooter/engine/modes/weekly.js').then(({ weeklyGhosts }) => {
        const sprite = weeklyGhosts().find((x) => x.label.startsWith('#1')).sprite;
        const data = sprite.getContext('2d').getImageData(0, 0, 384, 384).data;
        let pink = 0, yellow = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] > 40 && data[i + 2] < 200) pink++;
          if (data[i] > 170 && data[i + 1] > 140 && data[i + 2] < 110) yellow++;
        }
        return { pink, yellow };
      });
    });
    assert.ok(colours.pink > 300 && colours.yellow > 300, `livery colours on the ghost: ${JSON.stringify(colours)}`);
    await cgh.close();
  });
} catch (error) {
  failures.push(`script error: ${error.stack || error}`);
  say(`FAIL  script error: ${error.stack || error}`);
} finally {
  await browser.close();
  server.kill();
}

say(pageErrors.length ? `PAGE ERRORS (${pageErrors.length}):\n${pageErrors.join('\n')}` : 'page errors: none');
say(`evidence: ${out}`);
if (failures.length || pageErrors.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nPASS');
