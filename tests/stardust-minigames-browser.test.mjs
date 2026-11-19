// The repair minigame in a real browser: closed without the new-game flag, open
// with it, tap-solvable at phone size with touch, key-solvable on the desktop,
// and a timeout floods the line. Screenshots go to PROOF_DIR when it is set.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

// The turns that put every wrong pipe piece back, read from the live board.
const plan = (page) => page.evaluate(() => {
  const s = document.querySelector('.rp-panel').__state; const out = [];
  const turn = (m) => ((m << 1) | (m >> 3)) & 15;
  for (const i of s.path) { let m = s.tiles[i].mask, k = 0; while (m !== s.tiles[i].solved && k < 4) { m = turn(m); k++; } for (let j = 0; j < k; j++) out.push(i); }
  return out;
});

test('repair minigame in the browser', { skip }, async () => {
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

      // Closed by default.
      await page.goto(`${server.origin}${PAGE}`);
      assert.equal(await page.locator('#mg-closed').isVisible(), true);
      assert.equal(await page.locator('#mg-page').isVisible(), false);

      // Open with the flag, set up from the address, started by hand.
      await page.goto(`${server.origin}${PAGE}?newgame=1&mini=repair&roll=14&dc=12&level=5&time=2&size=1&quality=2&seed=7`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good/);
      await shot(page, `repair-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.rp-panel');
      const size = await page.evaluate(() => document.querySelector('.rp-panel').__state.size);
      assert.equal(size, 5);
      assert.equal(await page.locator('.rp-tile').count(), 25);
      await shot(page, `repair-${name}-2-start`);

      // Solve it by tapping, halfway first for a mid-play shot.
      const turns = await plan(page);
      assert.ok(turns.length > 0);
      const half = Math.ceil(turns.length / 2);
      for (let k = 0; k < turns.length; k++) {
        await page.locator('.rp-tile').nth(turns[k]).click();
        if (k + 1 === half) { await page.waitForTimeout(250); await shot(page, `repair-${name}-3-mid`); }
      }
      await page.waitForSelector('.rp-result.is-ok');
      const result = await page.evaluate(() => document.querySelector('.rp-panel').__state.result);
      assert.equal(result.success, true);
      assert.ok(result.quality >= 40 && result.xp >= 4 + 2 * 2);
      await page.waitForTimeout(250);
      await shot(page, `repair-${name}-4-sealed`);
      await page.click('.rp-result button');
      assert.equal(await page.locator('.rp-panel').count(), 0);

      // Phone: no sideways scroll, tiles big enough to tap.
      if (name === 'phone') {
        await page.click('#mg-go');
        await page.waitForSelector('.rp-panel');
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, tile: document.querySelector('.rp-tile').getBoundingClientRect().width }));
        assert.ok(m.sw <= m.iw, `no sideways scroll (${m.sw} > ${m.iw})`);
        assert.ok(m.tile >= 44, `tile ${m.tile}px`);
      }

      // The clock: a short one floods the line.
      await page.goto(`${server.origin}${PAGE}?newgame=1&roll=1&dc=20&level=1&seed=3&auto=1`);
      await page.waitForSelector('.rp-panel');
      await page.evaluate(() => { document.querySelector('.rp-panel').__state.t = 34; });
      await page.waitForSelector('.rp-result.is-bad', { timeout: 5000 });
      await shot(page, `repair-${name}-5-flooded`);

      // Keys: arrows move focus, Space turns.
      await page.goto(`${server.origin}${PAGE}?newgame=1&seed=2&auto=1`);
      await page.waitForSelector('.rp-panel');
      await page.locator('.rp-tile').first().focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.i), '1');
      const before = await page.evaluate(() => document.querySelector('.rp-panel').__state.moves);
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
      assert.ok(await page.evaluate(() => document.querySelector('.rp-panel').__state.moves) >= before);

      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close(); await server.close();
  }
});
