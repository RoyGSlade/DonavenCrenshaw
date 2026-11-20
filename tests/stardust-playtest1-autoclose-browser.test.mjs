// Playtest 1, item 3: a dialogue whose only option is "Done" (or a lone "Go on") closes by itself after the line has had time to be read,
// or on the next tap. STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-playtest1-autoclose-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';

test('lone Done closes by itself (a stand-in talk box) and a lone Go on takes itself (the captain)', { skip, timeout: 120000 }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await blockHub(context);
  const page = await context.newPage();
  try {
    await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
    await page.goto(`${server.origin}${V}?newgame=1`);
    await page.waitForFunction(() => window.__stardust?.onfoot?.world);
    const node = () => page.evaluate(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node);
    // The captain's first line has one choice, Go on (plus Later): nobody taps, it moves on by itself.
    await page.waitForFunction(() => document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length === 2, null, { timeout: 15000 });
    assert.equal(await node(), 'brief');
    const t0 = Date.now();
    await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'brief-2', null, { timeout: 15000 });
    const waited = Date.now() - t0;
    assert.ok(waited > 2000, `it waited for the line to be read (${waited} ms)`);
    // Answer, then a stand-in talk box: its lone Done closes itself.
    await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /Where is this gym/.test(b.textContent)));
    await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Where is this gym' }).click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__stardust.onfoot.world.place(72, 109));
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__stardust.onfoot.say([{ who: 'captain', name: 'You', text: 'Lights blink. Numbers scroll. Nothing here needs you yet.' }]); });
    await page.waitForSelector('.of-talk');
    const t1 = Date.now();
    await page.waitForSelector('.of-talk', { state: 'detached', timeout: 12000 });
    assert.ok(Date.now() - t1 > 1500, 'the coffee box waited for the line to be read');
    assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.held), false, 'the player is free');
  } finally { await context.close(); await browser.close(); server.close(); }
});
