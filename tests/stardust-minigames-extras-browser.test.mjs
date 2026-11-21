// The skill extras page in a real browser: closed by default; earn XP and watch
// the unscanned chip turn; scan and it goes safe; die and progress goes back;
// spend points with +/- and see the numbers; phone width. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-extras-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/extras.html';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name, full = false) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png`, fullPage: full }); };
const chip = (page) => page.locator('.ex-chip').first();

test('skill extras in the browser', { skip }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      const context = await browser.newContext(profile);
      await blockHub(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
      await page.goto(`${server.origin}${PAGE}`);
      assert.equal(await page.locator('#mg-closed').isVisible(), true);
      assert.equal(await page.locator('#ex-root').count() ? await page.locator('#mg-page').isVisible() : false, false);

      await page.goto(`${server.origin}${PAGE}?newgame=1`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.equal(await chip(page).getAttribute('data-tone'), 'safe');
      assert.match(await page.locator('.ex-left').innerText(), /2 points to spend/);
      await shot(page, `extras-${name}-1-start`, name === 'phone');

      await page.click('text=Seal a patch (+6 Repair XP)');
      assert.equal(await chip(page).getAttribute('data-tone'), 'low');
      assert.match(await chip(page).innerText(), /6 XP at risk since your last scan/);
      await page.click('text=Big job (+30 Repair XP)'); // level 3 into 5 + 36 = 41 of 60: still no level
      assert.equal(await chip(page).getAttribute('data-tone'), 'low');
      await page.click('text=Big job (+30 Repair XP)'); // 71: level 4, 11 into the level
      assert.equal(await chip(page).getAttribute('data-tone'), 'high');
      assert.match(await chip(page).innerText(), /1 skill point and 66 XP at risk since your last scan/);
      await shot(page, `extras-${name}-2-risk`, name === 'phone');

      // Spend a point: Repair level now 4, 3 unspent (1 spent in Time).
      const left0 = await page.locator('.ex-left').getAttribute('data-left');
      await page.click('.ex-cat[data-cat="size"] .ex-step.primary');
      await page.click('.ex-cat[data-cat="size"] .ex-step.primary');
      await page.click('.ex-cat[data-cat="size"] .ex-step.primary');
      assert.equal(await page.locator('.ex-left').getAttribute('data-left'), String(Number(left0) - 3));
      assert.match(await page.locator('.ex-cat[data-cat="size"] .ex-now').innerText(), /4 x 4 board/);
      await shot(page, `extras-${name}-3-picker`, name === 'phone');
      assert.equal(await page.locator('.ex-cat[data-cat="time"] .ex-step.primary').isDisabled(), Number(await page.locator('.ex-left').getAttribute('data-left')) === 0);

      // Scan: safe again. Earn, then die: back to the scan, the points spent since are gone.
      const spentBefore = await page.evaluate(() => JSON.stringify(window.__extras.progress.points.repair));
      await page.click('text=Scan: save here');
      assert.equal(await chip(page).getAttribute('data-tone'), 'safe');
      await page.click('text=Big job (+30 Repair XP)');
      await page.click('text=Die: reprint from the scan');
      assert.equal(await chip(page).getAttribute('data-tone'), 'safe');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__extras.progress.points.repair)), spentBefore);
      await shot(page, `extras-${name}-4-reprinted`, name === 'phone');

      // A skill with a planned game still lists its numbers.
      await page.click('.ex-skill[data-skill="social"]');
      assert.match(await page.locator('.ex-cat[data-cat="haggle"]').innerText(), /better final price/);

      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, step: document.querySelector('.ex-step').getBoundingClientRect().width }));
      assert.ok(m.sw <= m.iw, `no sideways scroll (${m.sw} > ${m.iw})`);
      assert.ok(m.step >= 44);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
