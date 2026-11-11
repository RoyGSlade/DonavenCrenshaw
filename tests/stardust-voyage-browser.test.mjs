// The new game's hangar in a real browser: closed by default, opened with
// ?voyage=on, a captain made, a practice job paid, an upgrade bought and a skill
// learned, all still there after a reload; then a test death. Optional like the
// other browser checks: STARDUST_BROWSER_TEST=1 (and PLAYWRIGHT_MODULE when
// Playwright lives elsewhere). Run it alone, capped, never with the whole suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createDogfightServer } from '../scripts/serve-stardust-dogfight.mjs';

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

  await page.goto(`${base}?voyage=on&dev=1`);
  await page.locator('#vy-name').fill('Vela Quint');
  await page.getByRole('button', { name: 'Roll stats and sign on' }).click();
  await page.locator('#pane-captain h2', { hasText: 'Vela Quint' }).waitFor();
  for (let i = 0; i < 3; i++) await page.locator('#vy-dev-job').click();
  await page.locator('[data-skill="smooth-burn"]').click();
  await page.getByRole('tab', { name: 'Ship' }).click();
  await page.locator('[data-upgrade="hull"]').click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1')));
  assert.equal(before.upgrades.hull, 1);
  assert.equal(before.character.skills['smooth-burn'], 1);
  assert.equal(before.character.earned, 5, '2 to start + 3 from jobs');
  assert.ok(before.rep['relay-guild'] >= 30, 'three jobs at 10 rep, more with a charming captain');

  await page.reload();
  await page.getByRole('tab', { name: 'Ship' }).click();
  assert.match(await page.locator('#pane-ship').innerText(), /Hull plating/);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1')));
  assert.deepEqual(after, before, 'the save survives a reload');
  assert.equal(await page.locator('#pane-ship').innerText().then((t) => t.includes('null')), false);

  await page.locator('#vy-dev-die').click();
  const dead = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1')).character);
  assert.equal(dead.earned, 3, 'half of 5 lost, rounded down');
  assert.deepEqual(dead.skills, {});
  assert.equal(dead.deaths, 1);
  assert.deepEqual(errors, []);
});
