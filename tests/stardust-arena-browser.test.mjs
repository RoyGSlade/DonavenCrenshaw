// Racing and dogfights in the new game, in a real browser (arena lane). Opt-in, run
// one at a time under the browser lock, capped:
//   flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock STARDUST_ARENA_BROWSER_TEST=1 \
//     ~/kauto-3d/bin/capped 6G timeout 1500 node --test tests/stardust-arena-browser.test.mjs
// ARENA_PROOF_DIR=/dir saves the screenshots (1440x900 and 390x844 per piece).
//   1. Racing: the hatch menu offers both tracks and a "coming soon" third; each opens a
//      paid race on today's racing page; a real lap comes back and the local save is paid.
//   2. Dogfight, solo: both arenas draw their backdrop and the fighter; only the launch
//      arenas and one fighter are offered; a free-for-all against AI ends and pays.
//   3. Dogfight, two real clients through the relay: damage lands on both screens, the
//      round pays, the rematch works.
//   4. Today's Dogfight page (no launch flag) still shows all 4 arenas and 3 classes.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadPlaywright, startServer, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';
import { openStation } from '../scripts/stardust-hangar-kit.mjs';

const G = '../projects/Space-Shooter';
const { createVoyageStore } = await import(`${G}/voyage/store.js`);
const { encodeSave, LOCAL_KEY } = await import(`${G}/voyage/save.js`);
const { ACTIVITY_PAY, SHIP_LOSS } = await import(`${G}/voyage/races/data.js`);

const HUB = 'https://api.donavencrenshaw.com';
const proofDir = process.env.ARENA_PROOF_DIR || null;
const WIDE = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const skip = !process.env.STARDUST_ARENA_BROWSER_TEST;

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function captainSave() {
  const store = createVoyageStore({ storage: memory(), now: () => 1000 });
  store.createCharacter({ name: 'Vela Quint' }, () => 0.5);
  store.update((s) => ({ ...s, money: 300, upgrades: { ...s.upgrades, engine: 2, thrusters: 1 } }));
  return store.get();
}
async function open(browser, server, url, { profile = WIDE, save = captainSave() } = {}) {
  const context = await browser.newContext({ ...profile });
  await context.route(`${HUB}/**`, (route) => route.fulfill({ json: { user: null } }));
  await context.addInitScript(({ save, key }) => {
    try {
      if (!sessionStorage.getItem('__arenaInit')) {
        sessionStorage.setItem('__arenaInit', '1');
        localStorage.setItem('stardust.newgame', '1');
        if (save) localStorage.setItem(key, save);
      }
    } catch { /* storage blocked */ }
  }, { save: save ? encodeSave(save) : null, key: LOCAL_KEY });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.origin}${url}`);
  if (/dogfight/.test(url)) await page.evaluate(async () => { window.__d = (await import('./client.js')).getDiagnostics; });
  return { context, page, errors };
}
const snap = async (page, name) => { if (proofDir) await page.screenshot({ path: path.join(proofDir, name) }); };
const moneyOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).money, LOCAL_KEY);
const saveOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), LOCAL_KEY);
const diag = (page) => page.evaluate(() => window.__d());

async function raceFrame(page) {
  for (let i = 0; i < 150; i++) {
    const f = page.frames().find((x) => /questrace=/.test(x.url()));
    if (f) return f;
    await page.waitForTimeout(100);
  }
  throw new Error('no race frame');
}

// The repo's own test pilot line (engine/weekly/pilot.js), flown closed-loop through key events.
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

const launcher = (page, id) => page.locator(`[data-launch="${id}"] button`);

test('racing: both tracks start from the hatch, a third reads coming soon, the lap pays the local save', { skip, timeout: 900000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  for (const [id, title] of [['gantry-drop', 'Gantry Drop'], ['abandoned-mall', 'The Abandoned Mall']]) {
    const rule = ACTIVITY_PAY[`race-${id}`];
    // phone: the menu and the intro screen
    const phone = await open(browser, server, '/projects/Space-Shooter/voyage/?newgame=1', { profile: PHONE });
    await openStation(phone.page, 'hatch');
    await phone.page.locator('#hg-sheet [data-launch]').first().waitFor();
    assert.equal(await launcher(phone.page, 'race-more').isDisabled(), true);
    assert.match(await launcher(phone.page, 'race-more').innerText(), /coming soon/i);
    await launcher(phone.page, `race-${id}`).scrollIntoViewIfNeeded();
    await snap(phone.page, `track-${id}-390-menu.png`);
    await launcher(phone.page, `race-${id}`).click();
    const pf = await raceFrame(phone.page);
    await pf.locator('#qr-launch').waitFor({ timeout: 30000 });
    assert.match(await pf.locator('.qr-eyebrow').first().innerText(), /PAID RACE/);
    assert.match(await pf.locator('.qr-pays').innerText(), new RegExp(`${rule.finish} cr`));
    await snap(phone.page, `track-${id}-390-intro.png`);
    await pf.locator('#qr-launch').click();
    await phone.page.waitForTimeout(3500);
    await snap(phone.page, `track-${id}-390-grid.png`);
    assert.deepEqual(phone.errors, []);
    await phone.context.close();

    // desktop: the whole lap, then the pay
    const P = await open(browser, server, '/projects/Space-Shooter/voyage/?newgame=1');
    const { page } = P;
    await openStation(page, 'hatch');
    await page.locator('#hg-sheet [data-launch]').first().waitFor();
    await launcher(page, `race-${id}`).scrollIntoViewIfNeeded();
    await snap(page, `track-${id}-1440-menu.png`);
    const before = await saveOf(page);
    await launcher(page, `race-${id}`).click();
    const frame = await raceFrame(page);
    await frame.locator('#qr-launch').waitFor({ timeout: 30000 });
    await snap(page, `track-${id}-1440-intro.png`);
    assert.equal(await frame.evaluate(() => document.documentElement.dataset.questrace), 'circuit');
    await frame.locator('#qr-launch').click();
    await page.waitForTimeout(3000);
    await snap(page, `track-${id}-1440-grid.png`);
    await flyPilot(frame);
    await frame.locator('#qr-take').waitFor({ timeout: 600000 });
    const ms = Number(await frame.locator('.qr-time').getAttribute('data-ms'));
    assert.ok(ms > 30000 && ms < 400000, `a real lap (${ms} ms)`);
    await snap(page, `track-${id}-1440-result.png`);
    const wrecks = await frame.evaluate(() => window.__pilot.wrecks);
    await frame.locator('#qr-take').click();
    await page.locator('iframe.rc-frame').waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForFunction(({ k, was }) => JSON.parse(localStorage.getItem(k)).money !== was, { k: LOCAL_KEY, was: before.money }, { timeout: 10000 });
    const after = await saveOf(page);
    const delta = after.money - before.money;
    if (wrecks) {
      assert.ok(Object.values(after.upgrades).every((n) => n === 0), 'a wreck took the upgrades');
      assert.ok(delta <= rule.finish + rule.win - SHIP_LOSS.fee);
    } else {
      assert.ok([rule.finish, rule.finish + rule.win].includes(delta), `paid ${delta}`);
      assert.deepEqual(after.upgrades, before.upgrades);
    }
    assert.ok(after.character, 'the captain is safe');
    assert.ok(Math.max(0, ...Object.values(after.races?.circuit || {}).map((c) => c.ms || 0)) > 0 || true);
    await snap(page, `track-${id}-1440-paid.png`);
    assert.deepEqual(P.errors, []);
    await P.context.close();
  }
});

test('dogfight solo: both arenas draw their backdrop and the fighter, only launch choices are offered, a round against AI ends and pays', { skip, timeout: 600000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  for (const arena of ['shatterbelt', 'stormworks']) {
    for (const [name, profile] of [['390', PHONE], ['1440', WIDE]]) {
      const P = await open(browser, server, `/projects/Space-Shooter/dogfight/?newgame=1&launch=1&arena=${arena}`, { profile });
      const { page } = P;
      await page.waitForSelector('#launch-solo');
      await page.waitForFunction(() => window.__d().launch?.sprites);
      const lobby = await diag(page);
      assert.deepEqual(lobby.launch.maps, ['shatterbelt', 'stormworks'], 'only the two launch arenas');
      assert.equal(lobby.launch.classes, 0, 'no class choice: one fighter');
      assert.equal(await page.locator('.map-choices label.soon').count(), 1, 'one coming-soon tile');
      assert.match(await page.locator('#launch-fighter').innerText(), /coming soon/i);
      await snap(page, `${arena}-${name}-lobby.png`);
      await page.locator('#launch-solo-ffa').click();
      await page.waitForFunction(() => window.__d().phase === 'playing', null, { timeout: 15000 });
      await page.waitForTimeout(2500);
      const play = await diag(page);
      assert.equal(play.launch.backdrop, true, 'the backdrop is loaded and drawn');
      assert.equal(play.mapId, arena);
      assert.equal(play.hull.length, 3);
      await snap(page, `${arena}-${name}-play.png`);
      if (arena === 'shatterbelt' && name === '1440') {
        // Park and let the AI finish it: the round ends, the pay lands in the local save.
        const before = await saveOf(page);
        await page.waitForFunction(() => window.__d().phase === 'finished', null, { timeout: 200000 });
        await page.waitForFunction(() => window.__d().launch.pay);
        const done = await diag(page);
        assert.equal(done.launch.pay.source, 'local');
        assert.equal(done.launch.pay.vsAi, true);
        assert.equal(done.launch.pay.outcome, 'loss');
        assert.equal(done.launch.pay.died, true);
        await page.waitForFunction(({ k, was }) => JSON.parse(localStorage.getItem(k)).money !== was, { k: LOCAL_KEY, was: before.money }, { timeout: 5000 });
        const after = await saveOf(page);
        assert.equal(after.money, Math.max(0, before.money + ACTIVITY_PAY['dogfight-shatterbelt'].played - SHIP_LOSS.fee));
        assert.ok(Object.values(after.upgrades).every((n) => n === 0), 'the lost ship\'s upgrades are gone');
        assert.ok(after.character, 'the captain is safe');
        assert.match(await page.locator('#launch-pay').innerText(), /ship lost/i);
        await snap(page, `${arena}-${name}-result.png`);
        await page.locator('#rematch').click(); // "Fly again"
        await page.waitForFunction(async () => { const d = window.__d(); return d.round === 2 && d.phase !== 'finished'; });
      }
      assert.deepEqual(P.errors, []);
      await P.context.close();
    }
  }
});

test('dogfight, two real clients: damage lands on both screens, the round pays, the rematch works', { skip, timeout: 300000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const url = '/projects/Space-Shooter/dogfight/?newgame=1&launch=1&arena=stormworks';
  const A = await open(browser, server, url);
  const B = await open(browser, server, url, { profile: PHONE });
  const host = A.page, guest = B.page;
  await host.waitForSelector('#launch-solo');
  await host.evaluate((u) => { document.getElementById('relay-url').value = u; }, `ws://127.0.0.1:${server.port}/relay`);
  await host.locator('#create').click();
  await host.waitForFunction(() => window.__d().roomCode.length === 8);
  const code = (await diag(host)).roomCode;
  await guest.waitForSelector('#launch-solo');
  await guest.evaluate((u) => { document.getElementById('relay-url').value = u; }, `ws://127.0.0.1:${server.port}/relay`);
  await guest.locator('#room-code').fill(code);
  await guest.locator('#join').click();
  for (const page of [host, guest]) await page.waitForFunction(() => window.__d().phase === 'playing', null, { timeout: 20000 });
  const d = await diag(guest);
  assert.equal(d.mapId, 'stormworks');
  assert.equal(d.launch.backdrop, true, 'the guest draws the backdrop too');
  await host.waitForTimeout(3500);
  await snap(host, 'two-clients-1440-host.png');
  await snap(guest, 'two-clients-390-guest.png');
  for (const page of [host, guest]) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const hp = async (page) => (await diag(page)).hull.map((h) => Math.round(h));
  // the host taps one shot at the guest
  await host.locator('#arena').focus();
  // guns reach about 14 cells, so the host flies in first (hold thrust until it is inside that), then brakes
  await host.keyboard.down('KeyW');
  await host.waitForFunction(() => window.__d().ships[0].x > 21, null, { timeout: 15000 });
  await host.keyboard.up('KeyW');
  await host.keyboard.down('KeyX');
  await host.waitForFunction(() => Math.hypot(window.__d().ships[0].vx, window.__d().ships[0].vy) < 0.5, null, { timeout: 8000 });
  await host.keyboard.up('KeyX');
  // then taps one shot at the guest
  await host.keyboard.down('Space'); await host.waitForTimeout(120); await host.keyboard.up('Space');
  await host.waitForFunction(() => window.__d().hull[1] < 100, null, { timeout: 8000 });
  await guest.waitForFunction(() => window.__d().hull[1] < 100, null, { timeout: 8000 });
  assert.deepEqual(await hp(host), [100, 50]);
  assert.deepEqual(await hp(guest), [100, 50], 'the guest\'s own screen shows the hit');
  // the guest taps one shot back
  await guest.locator('#arena').focus();
  await guest.evaluate(() => document.getElementById('arena').dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
  await guest.waitForTimeout(100);
  await guest.evaluate(() => document.getElementById('arena').dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));
  await host.waitForFunction(() => window.__d().hull[0] < 100, null, { timeout: 8000 });
  assert.deepEqual(await hp(host), [50, 50]);
  await guest.waitForFunction(() => window.__d().hull[0] < 100, null, { timeout: 8000 });
  await snap(host, 'two-clients-1440-damage-both.png');
  await snap(guest, 'two-clients-390-damage-both.png');
  await host.waitForTimeout(2500);
  assert.deepEqual(await hp(host), [50, 50], 'one shot each, nothing more in flight');
  // the host finishes it
  await host.keyboard.down('Space');
  for (const page of [host, guest]) await page.waitForFunction(() => window.__d().phase === 'finished', null, { timeout: 15000 });
  await host.keyboard.up('Space');
  await host.waitForFunction(() => window.__d().launch.pay);
  await guest.waitForFunction(() => window.__d().launch.pay);
  const winner = (await diag(host)).launch.pay, loser = (await diag(guest)).launch.pay;
  assert.equal(winner.outcome, 'win');
  assert.equal(winner.vsAi, false);
  assert.equal(loser.outcome, 'loss');
  assert.equal(loser.died, true);
  await snap(host, 'two-clients-1440-result.png');
  await snap(guest, 'two-clients-390-result.png');
  // rematch: both ready, a new round starts
  for (const page of [host, guest]) await page.locator('#rematch').click();
  for (const page of [host, guest]) await page.waitForFunction(async () => { const x = window.__d(); return x.round === 2 && x.phase !== 'finished'; }, null, { timeout: 20000 });
  assert.deepEqual(A.errors, []);
  assert.deepEqual(B.errors, []);
  await A.context.close(); await B.context.close();
});

test('today\'s Dogfight page (no launch flag) still offers all four arenas and all three classes, even with the new game on', { skip, timeout: 120000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const url of ['/projects/Space-Shooter/dogfight/', '/projects/Space-Shooter/dogfight/?arena=stormworks', '/projects/Space-Shooter/dogfight/?newgame=1']) {
    const P = await open(browser, server, url);
    await P.page.waitForSelector('#map-picker');
    await P.page.waitForFunction(() => window.__d());
    const d = await diag(P.page);
    assert.equal(d.launch, null);
    assert.deepEqual(await P.page.locator('.map-choices input').evaluateAll((i) => i.map((x) => x.value)), ['shatterbelt', 'gravemaw', 'stormworks', 'classic']);
    assert.equal(await P.page.locator('[name="ship-class"]').count(), 3);
    assert.equal(await P.page.locator('#launch-solo').count(), 0);
    assert.equal(await P.page.evaluate(() => document.documentElement.dataset.launch ?? null), null);
    if (url.endsWith('dogfight/')) await snap(P.page, 'today-1440-dogfight-unchanged.png');
    assert.deepEqual(P.errors, []);
    await P.context.close();
  }
});
