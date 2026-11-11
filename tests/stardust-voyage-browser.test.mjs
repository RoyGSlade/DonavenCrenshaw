// The new game's hangar in a real browser: closed by default, opened with
// ?newgame=1, a captain made, a practice job paid, an upgrade bought and a skill
// learned, all still there after a reload; then a test death. Optional like the
// other browser checks: STARDUST_BROWSER_TEST=1 (and PLAYWRIGHT_MODULE when
// Playwright lives elsewhere). Run it alone, capped, never with the whole suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createDogfightServer } from '../scripts/serve-stardust-dogfight.mjs';
import { signOnCaptain, openStation } from '../scripts/stardust-hangar-kit.mjs';

test('new hangar: closed by default; captain, credits, upgrade and skill survive a reload; death halves points', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 60000,
}, async (t) => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
  const server = await createDogfightServer({ port: 0 }); t.after(() => server.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Keep local QA independent of the public account service: a guest, no saves.
  await page.route('https://api.donavencrenshaw.com/**', (route) => route.fulfill({ status: 401, json: { user: null } }));
  const base = `http://127.0.0.1:${server.port}/projects/Space-Shooter/voyage/`;

  await page.goto(base);
  assert.equal(await page.locator('#vy-closed').isVisible(), true, 'closed without the flag');
  assert.equal(await page.locator('#vy-hangar').isVisible(), false);

  await page.goto(`${base}?newgame=1&dev=1`);
  await signOnCaptain(page, 'Vela Quint');
  await page.locator('#vy-dev-open').click();
  for (let i = 0; i < 3; i++) await page.locator('#vy-dev-job').click();
  await page.locator('[data-skill="smooth-burn"]').click();
  await page.locator('[data-learn="smooth-burn"]').click();
  await openStation(page, 'pad');
  await page.locator('[data-upgrade="hull"]').click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1')));
  assert.equal(before.upgrades.hull, 1);
  assert.equal(before.character.skills['smooth-burn'], 1);
  assert.equal(before.character.earned, 5, '2 to start + 3 from jobs');
  assert.ok(before.rep.hask >= 30, 'three jobs at 10 rep, more with a charming captain');

  await page.reload();
  await openStation(page, 'pad');
  assert.match(await page.locator('#pane-ship').innerText(), /Hull plating/);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1')));
  assert.deepEqual(after, before, 'the save survives a reload');
  assert.equal(await page.locator('#pane-ship').innerText().then((t) => t.includes('null')), false);

  await page.locator('#hg-sheet-close').click();
  await page.locator('#vy-dev-open').click();
  await page.locator('#vy-dev-die').click();
  const dead = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1')).character);
  assert.equal(dead.earned, 3, 'half of 5 lost, rounded down');
  assert.deepEqual(dead.skills, {});
  assert.equal(dead.deaths, 1);

  // Render quality: DPR capped at 2, the player can go down to 1.
  await page.locator('#hg-settings-btn').click();
  await page.locator('[data-render="fast"]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('stardust.newgame.renderScale')), 'fast');

  // A phone at DPR 3 draws the scene at 2x, and at 1x on Fast.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  t.after(() => phone.close());
  await phone.route('https://api.donavencrenshaw.com/**', (route) => route.fulfill({ status: 401, json: { user: null } }));
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(`${base}?newgame=1`);
  const ratio = () => p2.evaluate(() => document.getElementById('voyage-scene').width / innerWidth);
  assert.equal(await ratio(), 2);
  await p2.evaluate(() => localStorage.setItem('stardust.newgame.renderScale', 'fast'));
  await p2.reload();
  assert.equal(await ratio(), 1);
  assert.deepEqual(errors, []);
});
