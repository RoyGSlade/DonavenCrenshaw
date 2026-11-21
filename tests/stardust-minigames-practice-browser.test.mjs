// The practice dummy lock in a real browser: miss on purpose many times (nothing trips), then open it, no XP.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-practice-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=practice&seed=2';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

test('practice dummy lock in the browser', { skip }, async () => {
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
      await page.goto(`${server.origin}${PAGE}${Q}`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.match(await page.locator('#mg-readout').innerText(), /Practice dummy lock[\s\S]*no clock[\s\S]*no trace[\s\S]*no XP/);
      await shot(page, `practice-${name}-1-setup`);
      await page.click('#mg-go'); await page.waitForSelector('.hk-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector('.hk-btn').getBoundingClientRect().height }));
      assert.ok(m.sw <= m.iw); assert.ok(m.btn >= 44);
      // Miss on purpose: park the sweep far from the window and splice twelve times.
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; s.cursor = (s.tumblers[s.index].at + Math.PI) % (Math.PI * 2); s.dir = 0; });
        if (name === 'phone') await page.tap('.hk-btn'); else await page.click('.hk-btn');
      }
      const st = await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; return { done: s.done, misses: s.misses, index: s.index }; });
      assert.deepEqual(st, { done: false, misses: 12, index: 0 });
      assert.match(await page.locator('.hk-panel .rp-status').innerText(), /Nothing happens here/);
      await shot(page, `practice-${name}-2-missed`);
      // Now set all three.
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; s.cursor = s.tumblers[s.index].at; s.dir = 0; });
        if (name === 'phone') await page.tap('.hk-btn'); else await page.click('.hk-btn');
      }
      await page.waitForSelector('.rp-result.is-ok');
      assert.match(await page.locator('.rp-result').innerText(), /LOCK OPEN[\s\S]*12 misses[\s\S]*practice: no XP/);
      await shot(page, `practice-${name}-3-open`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
