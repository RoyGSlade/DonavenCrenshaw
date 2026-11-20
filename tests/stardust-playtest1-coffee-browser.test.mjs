// Playtest 1, item 7: the coffee machine. A cup now (Wired: 5% faster for a few minutes, plus a flavour line) or a cup in the pack, drunk from the bag.
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-playtest1-coffee-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';

test('coffee: take a cup, drink at the machine, drink from the bag; Wired is 5% faster and the pee line is only a tease', { skip, timeout: 120000 }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
    await page.goto(`${server.origin}${V}?newgame=1`);
    await page.waitForFunction(() => window.__stardust?.onfoot?.world);
    await page.waitForTimeout(1500);
    await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const atMachine = async () => { await page.evaluate(() => window.__stardust.onfoot.world.place(72, 109)); await page.waitForTimeout(400); await page.keyboard.press('KeyE'); await page.waitForSelector('.of-coffee'); };
    const coffees = () => page.evaluate(() => window.__stardust.store.get().items.coffee || 0);
    assert.equal(await page.evaluate(() => window.__stardust.statuses.speedMult()), 1);
    // 1. Take a cup with you.
    await atMachine();
    assert.deepEqual(await page.locator('.of-coffee button').allInnerTexts(), ['Drink a cup now', 'Take a cup with you', 'Leave it']);
    await page.locator('.of-coffee [data-coffee=take]').click();
    await page.waitForTimeout(400);
    assert.equal(await coffees(), 1, 'a cup is in the pack');
    assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.held), false, 'the player is free');
    // 2. Drink one now.
    await atMachine();
    await page.locator('.of-coffee [data-coffee=drink]').click();
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.__stardust.statuses.speedMult()), 1.05);
    assert.match(await page.locator('.of-toast').innerText(), /Bodily functions coming soon/);
    assert.match(await page.locator('.hg-status').innerText(), /Wired · [0-3]:\d\d/);
    assert.equal(await coffees(), 1, 'drinking at the machine does not use the pack cup');
    if (PROOF) await page.screenshot({ path: `${PROOF}/coffee-wired-desktop.png` });
    // 3. Drink the pack cup from the bag.
    await page.evaluate(() => { window.__stardust.statuses.clear(); window.__stardust.pad.open('pack'); });
    await page.waitForSelector('[data-use=coffee]');
    await page.locator('[data-use=coffee]').click();
    await page.waitForTimeout(400);
    assert.equal(await coffees(), 0, 'the cup was used');
    assert.equal(await page.evaluate(() => window.__stardust.statuses.speedMult()), 1.05);
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); server.close(); }
});
