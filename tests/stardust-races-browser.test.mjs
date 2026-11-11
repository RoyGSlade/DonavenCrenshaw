// Races and the arena from the new game, in a real browser (races lane, round 2):
//   1. A quest race: the job's race leg launches today's racing page in the
//      race frame with the upgraded ship; a real lap is flown (the repo's own
//      closed-loop test pilot, through key events); the finish returns a time
//      to the job; and NOTHING persistent is written: no weekly best, no
//      ghost, no hub board run, no weekly events, the browser's storage the
//      same apart from the new game's own save.
//   2. The practice circuit on a phone: the frame, the touch controls, the
//      render scale cap; leaving it keeps nothing.
//   3. The arena launch: the flight deck opens today's Dogfight page as it is.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 1500 node --test tests/stardust-races-browser.test.mjs
// RACES_PROOF_DIR=/some/dir saves screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadPlaywright, startServer, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';

const G = '../projects/Space-Shooter';
const { createVoyageStore } = await import(`${G}/voyage/store.js`);
const { startQuest } = await import(`${G}/voyage/quests/engine.js`);
const { QUESTS } = await import(`${G}/voyage/quests/data/quests/index.js`);
const { encodeSave, LOCAL_KEY } = await import(`${G}/voyage/save.js`);

const HUB = 'https://api.donavencrenshaw.com';
const proofDir = process.env.RACES_PROOF_DIR || null;
const OLD_BEST = { key: 'stardust.weekly.weekly-01.v1.best', value: JSON.stringify({ ms: 111111, log: 'SDW2:test', at: '2026-10-01T00:00:00Z' }) };

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A captain with engine and thruster upgrades; questNode: start that quest at this node. */
function makeSave(quest = null, node = null) {
  const store = createVoyageStore({ storage: memory(), now: () => 1000 });
  store.createCharacter({ name: 'Vela Quint' }, () => 0.5);
  store.update((s) => ({ ...s, upgrades: { ...s.upgrades, engine: 2, thrusters: 1 } }));
  if (!quest) return store.get();
  return startQuest({ ...QUESTS[quest], start: node }, store.get(), { seed: 7 }).save;
}

async function open(browser, server, { save, profile = DESKTOP, url }) {
  const context = await browser.newContext({ ...profile });
  const hub = [];
  await context.route(`${HUB}/**`, (route) => {
    const req = route.request();
    hub.push({ method: req.method(), url: req.url(), frame: req.frame()?.url() || '' });
    return route.fulfill({ json: { user: null } });
  });
  await context.addInitScript(({ save, key, best }) => {
    try {
      if (!sessionStorage.getItem('__racesInit')) {
        sessionStorage.setItem('__racesInit', '1');
        localStorage.setItem('stardust.newgame', '1');
        localStorage.setItem(key, save);
        localStorage.setItem(best.key, best.value);
      }
    } catch { /* storage blocked */ }
    // Every weekly event the racing code sends to run saving, in every frame.
    window.__weeklyEvents = [];
    for (const type of ['stardust:weeklyAttempt', 'stardust:weeklyRunComplete', 'stardust:weeklyFailed']) addEventListener(type, () => window.__weeklyEvents.push(type));
  }, { save: encodeSave(save), key: LOCAL_KEY, best: OLD_BEST });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.origin}${url}`);
  return { context, page, hub, errors };
}

const storageSnapshot = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const withoutNewGame = (snap) => Object.fromEntries(Object.entries(snap).filter(([k]) => !k.startsWith('stardust.voyage.')));
const snap = async (page, name) => { if (proofDir) await page.screenshot({ path: path.join(proofDir, name) }); };
const raceFrame = async (page) => {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((x) => /questrace=/.test(x.url()));
    if (f) return f;
    await page.waitForTimeout(100);
  }
  throw new Error('no race frame');
};

// The repo's own test pilot line (engine/weekly/pilot.js), flown closed-loop through key events in the race frame.
async function flyPilot(frame) {
  await frame.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    const { pilotLine, pilotSpeeds } = await import('/projects/Space-Shooter/engine/weekly/pilot.js');
    window.__pilot = { wrecks: 0, done: false };
    const held = new Set();
    const key = (k, on) => {
      if (on === held.has(k)) return;
      if (on) held.add(k); else held.delete(k);
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: k, bubbles: true }));
    };
    const release = () => { for (const k of [...held]) key(k, false); };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let line = null, v = null, n = 0, idx = 0;
    const tick = () => {
      const lv = state.run?.current;
      if (window.__pilot.done) { release(); return; }
      if (!lv) { requestAnimationFrame(tick); return; }
      if (!line) { line = pilotLine(lv.layout); v = pilotSpeeds(line); n = line.length; }
      if (lv.completed) { release(); window.__pilot.done = true; return; }
      if (lv.wreck) {
        release();
        const retry = document.getElementById('qr-retry');
        if (retry) { window.__pilot.wrecks++; retry.click(); }
        requestAnimationFrame(tick); return;
      }
      if (state.ui.countdownActive) { release(); requestAnimationFrame(tick); return; }
      if (lv.lockedInStart) { idx = 0; window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); requestAnimationFrame(tick); return; }
      const p = lv.player;
      let best = idx, bd = Infinity;
      for (let k = -4; k <= 40; k++) { const i = (idx + k + n) % n, d = Math.hypot(line[i].x - p.x, line[i].y - p.y); if (d < bd) { bd = d; best = i; } }
      idx = best;
      const speed = Math.hypot(p.vx, p.vy);
      const goal = line[(idx + Math.round((0.9 + speed * 0.22) / 0.5)) % n];
      const want = v[(idx + 2) % n] * 0.92;
      const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy) || 1;
      const ax = (dx / d) * want - p.vx, ay = (dy / d) * want - p.vy;
      const err = wrap(Math.atan2(ay, ax) - p.angle);
      key('d', err > 0.05); key('a', err < -0.05);
      key('w', Math.abs(err) < 0.45 && Math.hypot(ax, ay) > 0.25);
      key('x', speed > want + 0.8);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test('quest race: the race leg flies live with the upgraded ship, the time comes back, nothing persistent is written', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 900000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const P = await open(browser, server, { save: makeSave('railgun-paper-trail', 'armoury-race'), url: '/projects/Space-Shooter/voyage/?newgame=1' });
  t.after(() => P.context.close().catch(() => {}));
  const { page } = P;

  await page.getByRole('tab', { name: 'Jobs' }).click();
  await page.locator('#pane-jobs .qs-race').waitFor();
  const before = withoutNewGame(await storageSnapshot(page));
  assert.equal(before[OLD_BEST.key], OLD_BEST.value);
  await page.locator('#qs-race-live').click();
  await page.locator('iframe.rc-frame').waitFor();
  const frame = await raceFrame(page);
  await frame.locator('#qr-launch').waitFor({ timeout: 30000 });
  const chips = await frame.locator('.qr-stats li').evaluateAll((li) => li.map((x) => [x.dataset.stat, x.dataset.value]));
  assert.deepEqual(chips.map(([k]) => k), ['topSpeed', 'accel', 'grip']);
  assert.match(chips[0][1], /^\+[1-9]/, 'top speed is up on stock');
  assert.match(await frame.locator('.qr-offbooks').innerText(), /no leaderboard, no ghost, no personal best, no weekly entry/);
  assert.equal(await frame.evaluate(() => document.documentElement.dataset.questrace), 'quest');
  await snap(page, 'races-01-quest-intro.png');

  await frame.locator('#qr-launch').click();
  await frame.waitForFunction(async () => (await import('/projects/Space-Shooter/state.js')).state.run?.questRace?.kind === 'quest', null, { timeout: 20000 });
  const flown = await frame.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    return { maxSpeed: state.run.current.config?.MAX_SPEED ?? null, physics: state.run.current.physics, questRace: state.run.current.questRace };
  });
  const { WEEKLY_CONFIG } = await import(`${G}/engine/weekly/sim.js`);
  assert.ok(flown.maxSpeed > WEEKLY_CONFIG.MAX_SPEED, 'the scene flies the upgraded top speed');
  assert.equal(flown.questRace, true);
  await page.waitForTimeout(1200);
  await snap(page, 'races-02-quest-grid.png');
  await flyPilot(frame);
  await frame.locator('#qr-take').waitFor({ timeout: 600000 });
  const ms = Number(await frame.locator('.qr-time').getAttribute('data-ms'));
  assert.ok(ms > 30000 && ms < 400000, `a real lap time (${ms} ms)`);
  await snap(page, 'races-03-quest-result.png');

  // Nothing was kept by today's racing code.
  const inFrame = await frame.evaluate(() => ({ blocked: document.documentElement.dataset.questraceBlocked || '', events: window.__weeklyEvents, best: localStorage.getItem('stardust.weekly.weekly-01.v1.best') }));
  for (const kind of ['best', 'ghost', 'weekly']) assert.ok(inFrame.blocked.split(' ').includes(kind), `the ${kind} write was asked and refused`);
  assert.deepEqual(inFrame.events, [], 'no weekly attempt or finish event reached run saving');
  assert.equal(inFrame.best, OLD_BEST.value, 'this browser\'s weekly best is untouched');
  // Today's start screen still reads the public board for its widget; the race frame writes nothing.
  const fromFrame = P.hub.filter((r) => /questrace=/.test(r.frame) && r.method !== 'GET');
  assert.deepEqual(fromFrame, [], 'the race frame sent nothing to the hub');
  assert.equal(P.hub.filter((r) => /\/runs|\/boards\/.*\/(runs|finish)/.test(r.url) && r.method !== 'GET').length, 0, 'no board run anywhere');

  // Back to the job with the time.
  await frame.locator('#qr-take').click();
  await page.locator('iframe.rc-frame').waitFor({ state: 'detached', timeout: 10000 });
  await page.locator('#pane-jobs .qs-end').waitFor({ timeout: 10000 });
  const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), LOCAL_KEY);
  assert.equal(save.quests.active?.['railgun-paper-trail'], undefined, 'the race leg is done');
  assert.ok(save.quests.done?.['railgun-paper-trail'], 'the job ended on the race result');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('stardust.questrace.ticket')), null, 'the ticket is used up');
  const after = withoutNewGame(await storageSnapshot(page));
  assert.deepEqual(after, before, 'today\'s game storage is exactly as it was');
  await snap(page, 'races-04-quest-back.png');
  assert.deepEqual(P.errors, []);
});

test('practice circuit on a phone: the frame, touch controls, render scale; leaving keeps nothing', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 300000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const P = await open(browser, server, { save: makeSave(), profile: PHONE, url: '/projects/Space-Shooter/voyage/races/?newgame=1' });
  t.after(() => P.context.close().catch(() => {}));
  const { page } = P;
  await page.locator('[data-fly-circuit="gantry-drop"]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll at 390');
  await snap(page, 'races-05-phone-deck.png');
  const before = withoutNewGame(await storageSnapshot(page));
  await page.locator('[data-fly-circuit="gantry-drop"]').click();
  const frame = await raceFrame(page);
  await frame.locator('#qr-launch').waitFor({ timeout: 30000 });
  assert.match(await frame.locator('.qr-eyebrow').first().innerText(), /PRACTICE CIRCUIT/);
  await frame.locator('#qr-launch').tap();
  await frame.waitForFunction(async () => (await import('/projects/Space-Shooter/state.js')).state.run?.questRace?.kind === 'circuit', null, { timeout: 20000 });
  await frame.waitForFunction(async () => !(await import('/projects/Space-Shooter/state.js')).state.ui.countdownActive, null, { timeout: 20000 });
  const view = await frame.evaluate(() => {
    const canvas = document.getElementById('starmap-canvas');
    return { touch: document.body.classList.contains('fx-touch-on'), width: canvas.width, css: canvas.getBoundingClientRect().width };
  });
  assert.equal(view.touch, true, `the racing touch pad is up (${JSON.stringify(view)})`);
  await frame.locator('.fx-touch.fx-boost').waitFor({ state: 'visible', timeout: 10000 });
  assert.ok(await frame.locator('.fx-touch.fx-stick, .fx-touch.fx-wheel').first().isVisible(), 'the steering control is up');
  assert.ok(view.width <= Math.ceil(view.css * 2) + 1, `the canvas is capped at 2x (${view.width} for ${view.css} css px), not the phone's 3x`);
  // A tap on the touch pad launches the ship off the grid.
  await frame.locator('.fx-touch.fx-boost').tap();
  await frame.waitForFunction(async () => (await import('/projects/Space-Shooter/state.js')).state.run.current?.launched === true, null, { timeout: 10000 });
  await snap(page, 'races-06-phone-circuit.png');
  await page.locator('.rc-quit').tap();
  await page.locator('iframe.rc-frame').waitFor({ state: 'detached' });
  assert.deepEqual(withoutNewGame(await storageSnapshot(page)), before, 'leaving the circuit kept nothing');
  assert.deepEqual(P.hub.filter((r) => /questrace=/.test(r.frame) && r.method !== 'GET'), []);
  assert.deepEqual(P.errors, []);
});

test('arena: the flight deck opens today\'s Dogfight page as it is', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 120000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const P = await open(browser, server, { save: makeSave(), url: '/projects/Space-Shooter/voyage/races/?newgame=1' });
  t.after(() => P.context.close().catch(() => {}));
  const { page } = P;
  await page.locator('#rc-arena').waitFor();
  assert.match(await page.locator('.rc-tile.is-arena').innerText(), /2-3 PILOTS/);
  await snap(page, 'races-07-deck.png');
  await page.locator('#rc-arena').click();
  await page.waitForURL(/\/projects\/Space-Shooter\/dogfight\/$/);
  await page.locator('#back').waitFor();
  assert.deepEqual(P.errors, []);
});
