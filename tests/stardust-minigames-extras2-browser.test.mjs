// The bench board and the holodeck gym in a real browser, on the extras dev page: seal today's board by
// tapping the pipes, see yourself on the crew board; train with stand-in wins until the credits and the
// hourly cap bite; a Train link opens the real minigame at a Steady roll. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-extras2-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/extras.html';
const Q = '?newgame=1&day=20800&credits=30';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

test('bench board and holodeck gym in the browser', { skip }, async () => {
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
      const tap = (sel) => (name === 'phone' ? page.tap(sel) : page.click(sel));
      await page.goto(`${server.origin}${PAGE}`);
      assert.equal(await page.locator('#mg-closed').isVisible(), true);
      await page.goto(`${server.origin}${PAGE}${Q}`);
      await page.waitForSelector('.bn-list');
      const par = await page.evaluate(() => window.__bench.bench.par);
      assert.match(await page.locator('.bn-day', { hasText: 'Bench board for day' }).innerText(), new RegExp(`day 20800: a 5 x 5 board, 50 seconds, par ${par} turns`));
      assert.equal(await page.locator('.bn-list li').count(), 3);
      assert.match(await page.locator('.bn-stand').innerText(), /have not sealed/);
      await page.locator('.bn-list').scrollIntoViewIfNeeded(); await shot(page, `extras2-${name}-1-bench`);

      // Seal today's board by tapping the hinted pipes.
      await tap('.bn-play'); await page.waitForSelector('.rp-panel');
      for (let i = 0; i < 80 && !(await page.locator('.rp-result').count()); i++) {
        const idx = await page.evaluate(async () => { const m = await import('/projects/Space-Shooter/voyage/minigames/repair.js'); return m.nextHint(document.querySelector('.rp-panel').__state); });
        if (idx == null) break; await tap(`.rp-tile[data-i="${idx}"]`);
      }
      await page.waitForSelector('.rp-result');
      await page.click('.rp-result button');
      await page.waitForSelector('.bn-list li.is-you');
      assert.match(await page.locator('.bn-stand').innerText(), /You are \d of 4 with \d+ turns/);
      assert.equal(await page.locator('.bn-list li').count(), 4);
      await page.locator('.bn-list').scrollIntoViewIfNeeded(); await shot(page, `extras2-${name}-2-sealed`);

      // The gym is also where points are spent: the picker is inside it, and training uses what you spend.
      assert.equal(await page.locator('.ex-gym .ex-cats').count(), 1, 'the point picker lives in the gym');
      assert.equal(await page.locator('.ex-gym .ex-skills').count(), 1, 'so does the skill list');
      assert.equal(await page.locator('.ex-col > h2', { hasText: 'Spend points' }).count(), 0, 'no separate picker any more');
      const card = page.locator('.gm-card[data-game="repair"]');
      assert.match(await card.innerText(), /a quarter of the field XP \(a job that pays 8 pays 2\)\. 6 of 6 XP left this hour/);
      assert.match(await card.locator('.gm-train').getAttribute('href'), /mini=repair&roll=10&dc=13&level=3&auto=1&time=1$/);
      await page.locator('.ex-gym').scrollIntoViewIfNeeded(); await shot(page, `extras2-${name}-3-gym`);
      // Spend a point on Puzzle size: the Train link carries it.
      await tap('.ex-gym .ex-cat[data-cat="size"] .ex-step.primary');
      assert.match(await page.locator('.gm-card[data-game="repair"] .gm-train').getAttribute('href'), /level=3&auto=1&time=1&size=1$/);
      assert.match(await page.locator('.ex-gym .ex-left').innerText(), /1 point to spend/);
      await shot(page, `extras2-${name}-3b-spent`);
      for (const [wallet, left] of [[20, 4], [10, 2], [0, 0]]) {
        await tap('.gm-card[data-game="repair"] button:has-text("I won")');
        assert.match(await page.locator('#gm-wallet').innerText(), new RegExp(`You have ${wallet} credits`));
        assert.match(await page.locator('.gm-card[data-game="repair"]').innerText(), new RegExp(`${left} of 6 XP left`));
      }
      assert.equal(await page.locator('.gm-card[data-game="repair"] .gm-train').getAttribute('aria-disabled'), 'true');
      assert.equal(await page.locator('.ex-gym .ex-cat[data-cat="size"] .ex-pts').innerText(), '1 / 9', 'spending points does not cost credits');
      await page.locator('#gm-wallet').scrollIntoViewIfNeeded(); await shot(page, `extras2-${name}-4-broke`);
      // The Train link opens the real minigame at Steady and starts it.
      await page.goto(`${server.origin}${PAGE}${Q}`); await page.waitForSelector('.gm-card');
      await tap('.ex-skill[data-skill="piloting"]');
      const href = await page.locator('.gm-card[data-game="pilot"] .gm-train').getAttribute('href');
      await page.goto(new URL(href, `${server.origin}${PAGE}`).href);
      await page.waitForSelector('.pl-panel');
      assert.match(await page.locator('#mg-readout').innerText(), /Tier 0 Steady/);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
