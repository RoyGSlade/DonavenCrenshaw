// Real browser check of the shop counter and a Studio play link in the quest
// sandbox. Opt-in: STARDUST_BROWSER_TEST=1. Run it on its own, capped:
// ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-voyage-shops-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const SANDBOX = '/projects/Space-Shooter/voyage/quests/sandbox/index.html';
const SAVE_KEY = 'stardust.voyage.quest-sandbox.v1';
const save = (money, extra = {}) => ({
  v: 1, updatedAt: 0, money, rep: {}, items: { scrap: 2 }, flags: {},
  upgrades: { hull: 0, engine: 0, thrusters: 0, guns: 0 }, account: { unlocks: [], maxRep: {} }, quests: {},
  character: { id: 'c-test', name: 'Test Pilot', look: { portrait: 'p1', color: '#5fd4ff' }, stats: { str: 3, cha: 3, con: 3, dex: 3, wis: 3 }, earned: 0, permanent: 0, skills: {}, deaths: 0, createdAt: 0 },
  ...extra,
});

test('shops: buy and wear Mel\'s gear, take Edna\'s deal, Chibby\'s parts; a quest link opens the job', { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 120000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockHub(context);
  await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, value); } }, [SAVE_KEY, JSON.stringify(save(600))]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${server.origin}${SANDBOX}?newgame=1`);

  await page.locator('[data-shop="mel"]').click();
  await page.locator('.sh-mel').waitFor();
  const vest = page.locator('[data-item="flak-vest"]');
  await vest.getByRole('button', { name: /Buy Flak vest/ }).click();
  await page.locator('.sh-note', { hasText: 'Bought Flak vest' }).waitFor();
  assert.match(await page.locator('.sh-gear').innerText(), /Armour: Flak vest/);
  assert.match(await vest.innerText(), /You have one\.|In your kit: 1/);
  assert.match(await page.locator('[data-item="plated-coat"]').innerText(), /rep with/, 'a gate says why');
  const wallet = await page.locator('.sh-wallet').innerText();
  assert.ok(Number.parseInt(wallet.replace(/\D/g, ''), 10) < 600, `paid: ${wallet}`);
  // Sell it back from the Sell tab.
  await page.getByRole('tab', { name: 'Sell' }).click();
  await page.locator('[data-sell="flak-vest"]').getByRole('button', { name: 'Sell one' }).click();
  await page.locator('.sh-note', { hasText: 'Sold Flak vest' }).waitFor();

  await page.getByRole('button', { name: 'Back to the job board' }).click();
  await page.locator('[data-shop="edna"]').click();
  const crate = page.locator('[data-deal="mystery-crate"]');
  await crate.getByRole('button', { name: 'Take the deal' }).click();
  assert.match(await page.locator('.sh-note').innerText(), /vs 8( \(double six!\))?: (double six, it pays off!|it pays off\.|no luck\.)/);

  await page.getByRole('button', { name: 'Back to the job board' }).click();
  await page.locator('[data-shop="chibby"]').click();
  await page.locator('[data-item="hull-patch"]').getByRole('button', { name: /Buy Hull patch/ }).click();
  await page.locator('.sh-note', { hasText: 'Bought Hull patch' }).waitFor();
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.ok(noScroll, 'no sideways scroll on a phone');

  // A Studio play link: straight into the Teapot Job at Edna's node, on its own save.
  const studio = await context.newPage();
  await studio.goto(`${server.origin}${SANDBOX}?newgame=1&studio=1&quest=teapot&node=edna&seed=4`);
  await studio.locator('.qs-dialogue').waitFor();
  assert.match(await studio.locator('#qs-main').innerText(), /My mother's teapot/);
  assert.match(await studio.locator('.qs-beat').innerText(), /Edna lifts the lid/);
  await studio.locator('.qs-choices button').first().click();
  await studio.locator('.qs-end').waitFor();
  assert.match(await studio.locator('.qs-end').innerText(), /New badge: Teapot lid charm/);
  assert.deepEqual(errors, []);
});
