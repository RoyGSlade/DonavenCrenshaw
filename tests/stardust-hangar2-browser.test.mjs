// Round 2 hangar in a real browser: the captain's licence with the physics die
// (the shown number is the saved stat), the hangar as a place (stations open
// in place, by click and through hangarApi, and tell the story bus), the skill
// tree (learn with its burst, take back, respec all), the dialogue box and the
// attempt roller on the story bus, sound settings, mounts from other lanes,
// and a phone at DPR 3 drawing at the render scale.
// Opt-in like the other browser checks; run it alone, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-hangar2-browser.test.mjs
// HANGAR_PROOF_DIR=<dir> saves screenshots at 1440 and 390.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { loadPlaywright, startServer, blockHub, PHONE } from '../scripts/stardust-test-kit.mjs';
import { openStation } from '../scripts/stardust-hangar-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/';
const SAVE_KEY = 'stardust.voyage.v1';
const proofDir = process.env.HANGAR_PROOF_DIR || '';
if (proofDir) mkdirSync(proofDir, { recursive: true });
const snap = async (page, name) => { if (proofDir) await page.screenshot({ path: path.join(proofDir, name) }); };
const readSave = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
// The page's own modules (same instances the hangar uses): the story bus seam and the hangar API.
const recordBus = (page) => page.evaluate(async () => {
  const { bus } = await import('/projects/Space-Shooter/voyage/hangarLinks.js');
  window.__events = [];
  for (const type of ['captain:created', 'tutorial:arrived', 'met:chibby', 'met:mel', 'hangar:opened', 'hangar:closed', 'hangar:learned', 'hangar:respec', 'story:said', 'licence:rolled', 'hangar:attempt-shown']) {
    bus.on(type, (d) => window.__events.push([type, d]));
  }
});
const events = (page) => page.evaluate(() => window.__events);
const emit = (page, type, detail) => page.evaluate(async ([t, d]) => { (await import('/projects/Space-Shooter/voyage/hangarLinks.js')).bus.emit(t, d); }, [type, detail]);

test('round-2 hangar: dice licence, stations in place, skill tree and respec, dialogue, attempt roller, phone', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 300000,
}, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  t.after(() => context.close());
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/voyage/')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${server.origin}${HANGAR}?newgame=1&dev=1`);
  await recordBus(page);
  // Round 2: a new save opens on the story's intro; this check skips the tutorial (the e2e test plays it).
  await page.locator('.sy-intro-skipall').click();

  // 1. A new player: the licence opens. Roll the first stat with the real tumble.
  await page.locator('#hg-licence').waitFor();
  assert.equal(await page.locator('.ui-roll-row').count(), await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/data.js')).STATS.length), 'one row per stat');
  assert.equal(await page.locator('#hg-sign').isDisabled(), true, 'cannot sign before rolling');
  await page.locator('#vy-name').fill('Vela Quint');
  await page.locator('#hg-roll').click();
  await page.waitForTimeout(350);
  await snap(page, 'hangar2-01-licence-rolling-1440.png');
  await page.waitForFunction(() => document.querySelector('.ui-roll-row.is-rolled'), null, { timeout: 15000 });
  const first = await page.locator('.ui-roll-row.is-rolled .ui-roll-value').first().innerText();
  assert.match(first, /^[1-6]$/);
  // The rest with reduced motion: each throw is simulated at once and drawn where it lands.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (let i = 0; i < 8 && await page.locator('#hg-roll').isEnabled(); i++) await page.locator('#hg-roll').click();
  const shown = await page.locator('.ui-roll-row').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [r.dataset.rollRow, Number(r.dataset.value)])));
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.newgame.pendingRolls')));
  assert.deepEqual(shown, pending, 'what the rows show is what is kept');
  await snap(page, 'hangar2-02-licence-rolled-1440.png');
  // A reload does not re-roll.
  await page.reload();
  await recordBus(page);
  await page.locator('#hg-licence').waitFor();
  assert.deepEqual(await page.locator('.ui-roll-row').evaluateAll((rows) => Object.fromEntries(rows.map((r) => [r.dataset.rollRow, Number(r.dataset.value)]))), shown, 'rolls survive a reload');
  await page.locator('#vy-name').fill('Vela Quint');
  await page.locator('#hg-sign').click();
  await page.locator('#pane-captain h2', { hasText: 'Vela Quint' }).waitFor();
  const signed = await readSave(page);
  assert.deepEqual(signed.character.stats, shown, 'the rolled faces are the captain\'s stats');
  assert.equal(await page.evaluate(() => localStorage.getItem('stardust.newgame.pendingRolls')), null);
  assert.equal((await events(page)).filter(([e]) => e === 'captain:created').length, 1, 'the director hears captain:created once');

  // 2. The bunk opened in place. The skill tree: learn with a burst, take back, respec all.
  assert.equal(await page.locator('#hg-sheet').getAttribute('data-open-station'), 'quarters');
  assert.equal(await page.locator('.ui-node').count(), await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/data.js')).SKILLS.length));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#vy-dev-open').click();
  await page.locator('#vy-dev-job').click();
  await page.locator('[data-skill="pilot"]').click();
  await page.locator('[data-detail="pilot"]').waitFor();
  assert.match(await page.locator('[data-detail="pilot"]').innerText(), /1 skill point a rank/);
  await page.locator('[data-learn="pilot"]').click();
  assert.equal(await page.locator('[data-skill="pilot"].is-fresh .ui-burst').count(), 1, 'the learn burst plays');
  await page.locator('.ui-tree').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await snap(page, 'hangar2-03-skill-tree-learn-1440.png');
  await page.locator('[data-learn="pilot"]').click();
  let c = (await readSave(page)).character;
  assert.equal(c.skills['pilot'], 2);
  await page.locator('[data-unlearn="pilot"]').click();
  c = (await readSave(page)).character;
  assert.equal(c.skills['pilot'], 1, 'one rank back');
  const moneyBefore = (await readSave(page)).money;
  await page.locator('#ui-respec-all').click();
  await page.locator('#ui-respec-all', { hasText: 'Yes' }).click();
  const respecced = await readSave(page);
  assert.deepEqual(respecced.character.skills, {});
  assert.equal(respecced.money, moneyBefore - 10, 'outside the tutorial a respec costs 10 credits a point');
  assert.ok((await events(page)).some(([e]) => e === 'hangar:respec'));

  // 3. Stations in place: click the pad, Escape back to the hangar; the director hears it.
  await page.locator('#hg-sheet-close').click();
  assert.equal(await page.locator('#hg-sheet').isVisible(), false);
  await snap(page, 'hangar2-04-hangar-1440.png');
  await page.locator('[data-station="pad"]').dispatchEvent('click');
  await page.locator('#hg-sheet[data-open-station="pad"]').waitFor();
  assert.equal(await page.locator('#pane-ship').isVisible(), true);
  await page.waitForTimeout(500);
  await snap(page, 'hangar2-05-pad-open-1440.png');
  let seen = await events(page);
  assert.ok(seen.some(([e, d]) => e === 'tutorial:arrived' && d.station === 'pad'));
  assert.ok(seen.some(([e]) => e === 'met:chibby'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hg-sheet').isVisible(), false);
  // Focus goes back to the station's plate when it is on screen (the floor scrolls with the captain).
  if (await page.locator('[data-station="pad"]').isVisible()) assert.equal(await page.evaluate(() => document.activeElement?.dataset?.station), 'pad', 'focus goes back to the station');
  // Walking up: the onfoot lane's way in.
  await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/hangarApi.js')).hangarApi.openStation('locker', { via: 'walk' }));
  await page.locator('#hg-sheet[data-open-station="locker"]').waitFor();
  seen = await events(page);
  assert.ok(seen.some(([e, d]) => e === 'hangar:opened' && d.station === 'locker' && d.via === 'walk'));
  assert.ok(!seen.some(([e, d]) => e === 'tutorial:arrived' && d.station === 'locker'), 'onfoot sends its own arrival');
  // Another lane mounts a shop on Mel's locker, and a launch at the hatch.
  await page.evaluate(async () => {
    const api = await import('/projects/Space-Shooter/voyage/hangarApi.js');
    api.mountStation('locker', { id: 'shop', label: 'Shop', render(el) { const p = document.createElement('p'); p.id = 'test-shop'; p.textContent = 'Mel\'s prices'; el.append(p); } });
    api.addLaunch({ id: 'practice', label: 'Practice circuit', blurb: 'Three laps, no boards', run() { window.__launched = true; } });
  });
  await page.locator('#hg-sheet-tabs [data-view="shop"]').click();
  await page.locator('#test-shop', { hasText: 'Mel\'s prices' }).waitFor();
  await openStation(page, 'hatch');
  await page.locator('[data-launch="practice"] button').click();
  assert.equal(await page.evaluate(() => window.__launched), true);

  // A locked station says why (a save in the tutorial with only the bunk open).
  await page.evaluate(async (key) => {
    const s = JSON.parse(localStorage.getItem(key));
    s.story = { v: 1, step: 'walk', done: ['intro', 'create'], unlocks: ['station:quarters'], paid: [], finished: false, skipped: false };
    localStorage.setItem(key, JSON.stringify(s));
  }, SAVE_KEY);
  await page.reload();
  await recordBus(page);
  // (The job board: opening the pad would itself move the tutorial on, since Chibby is there.)
  assert.equal(await page.locator('[data-station="pad"]').evaluate((b) => b.classList.contains('is-locked')), true);
  await openStation(page, 'board');
  assert.match(await page.locator('[data-locked="board"]').innerText(), /NOT YET/);
  assert.equal(await page.locator('[data-station="board"]').evaluate((b) => b.classList.contains('is-locked')), true);
  await emit(page, 'story:objective', { step: 'walk', text: 'Walk to Chibby at the pad.', station: 'pad', target: null });
  assert.equal(await page.locator('#hg-objective').innerText().then((x) => /Walk to Chibby/.test(x)), true);
  assert.equal(await page.locator('[data-station="pad"]').evaluate((b) => b.classList.contains('is-objective')), true);
  // Respec is free while the tutorial runs.
  await openStation(page, 'quarters');
  await page.locator('[data-skill="mechanic"]').click();
  await page.locator('[data-unlearn="mechanic"]').waitFor();
  assert.match(await page.locator('[data-unlearn="mechanic"]').innerText(), /free/);

  // 4. The dialogue box answers story:say, and the attempt roller shows a decided roll.
  await emit(page, 'story:say', { seq: 41, id: 'chibby.ship.1', speaker: 'chibby', name: 'Chibby', text: 'She\'s yours, Captain. Mind the paint.', audio: null, durationMs: 9000 });
  await page.locator('#hg-dialogue .ui-dlg-text', { hasText: 'Mind the paint' }).waitFor();
  await emit(page, 'roll:attempt', { kind: 'attempt', dice: [4, 3], roll: 7, statMod: 2, extra: 0, bonus: 2, total: 9, dc: 7, pass: true, natural: false, stat: 'cha', label: 'Talk Edna down' });
  await page.locator('#hg-attempt.is-done').waitFor({ timeout: 6000 });
  assert.match(await page.locator('#hg-attempt').innerText(), /4 \+ 3 \+ 2 = 9, needs 7[\s\S]*Made it/);
  await snap(page, 'hangar2-06-dialogue-attempt-1440.png');
  await page.locator('#hg-dialogue .ui-dlg-next').click();
  assert.ok((await events(page)).some(([e, d]) => e === 'story:said' && d.seq === 41), 'the box answers story:said');

  // 5. Sound settings stick per device; nothing has to play for the page to work.
  await page.locator('#hg-settings-btn').click();
  await page.locator('#hg-mute').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.newgame.audio')).muted), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hg-settings').isVisible(), false);
  assert.deepEqual(errors, []);

  // 6. Phone, DPR 3: the scene and the dice draw at 2x (Sharp) and 1x on Fast; no sideways scroll.
  const phone = await browser.newContext({ ...PHONE });
  t.after(() => phone.close());
  await blockHub(phone);
  const p2 = await phone.newPage();
  const phoneErrors = [];
  p2.on('pageerror', (e) => phoneErrors.push(e.message));
  await p2.goto(`${server.origin}${HANGAR}?newgame=1`);
  await p2.locator('.sy-intro-skipall').click();
  await p2.locator('#hg-licence').waitFor();
  assert.equal(await p2.evaluate(() => document.getElementById('hg-dice').width / document.getElementById('hg-dice').getBoundingClientRect().width), 2);
  await snap(p2, 'hangar2-07-licence-390.png');
  await p2.emulateMedia({ reducedMotion: 'reduce' });
  await p2.locator('#vy-name').fill('Ossa Vey');
  for (let i = 0; i < 8 && await p2.locator('#hg-roll').isEnabled(); i++) await p2.locator('#hg-roll').click();
  await p2.locator('#hg-sign').click();
  await p2.locator('#pane-captain h2', { hasText: 'Ossa Vey' }).waitFor();
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll at 390');
  await snap(p2, 'hangar2-08-bunk-390.png');
  await p2.locator('#hg-sheet-close').click();
  assert.equal(await p2.evaluate(() => document.querySelector('#hg-floor .of-canvas').width / innerWidth), 2);
  await snap(p2, 'hangar2-09-hangar-390.png');
  await openStation(p2, 'pad');
  await p2.waitForTimeout(300);
  await snap(p2, 'hangar2-10-pad-390.png');
  await p2.evaluate(() => localStorage.setItem('stardust.newgame.renderScale', 'fast'));
  await p2.reload();
  assert.equal(await p2.evaluate(() => document.querySelector('#hg-floor .of-canvas').width / innerWidth), 1, 'Fast draws at 1x');
  assert.deepEqual(phoneErrors, []);
});
