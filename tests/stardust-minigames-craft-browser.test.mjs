// The forge in a real browser: set up from the address, a bot strikes when the needle is in the
// lit zone (Space on desktop, tap on phone), a missing player ruins the part. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-craft-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=craft&roll=12&dc=12&level=6&quality=2&speed=3&material=1&seed=5';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

const bot = (page, { want, via }) => page.evaluate(({ want, via }) => {
  const s = document.querySelector('.cf-panel').__state;
  const inZone = () => { const x = (s.phase * 2 + s.t * s.speed) % 2; const p = x <= 1 ? x : 2 - x; const a = s.centres[s.index] - s.zone / 2, b = s.centres[s.index] + s.zone / 2; return p >= a && p <= b; };
  const press = () => (via === 'key' ? dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })) : document.querySelector('.hk-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  window.__bot = setInterval(() => { if (!s.done && inZone() === want) press(); }, 4);
}, { want, via });

test('crafting forge in the browser', { skip }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile, via] of [['desktop', DESK, 'key'], ['phone', PHONE, 'tap']]) {
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
      assert.equal(await page.locator('#mg-mini').inputValue(), 'craft');
      // d20 12 + 6 = 18 vs 12: margin 6, Good. Speed 3 points: 4 strikes, -1 at tier +1? no: strikes 4 (tier +1 leaves strikes).
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*4[\s\S]*strikes[\s\S]*zone 25\.3%[\s\S]*quality \+8[\s\S]*build x0\.85[\s\S]*material x0\.96/);
      assert.equal(await page.locator('#l-haggle').isVisible(), false);
      await shot(page, `craft-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.cf-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector('.hk-btn').getBoundingClientRect().height, n: document.querySelector('.cf-panel').__state.strikes }));
      assert.ok(m.sw <= m.iw); assert.ok(m.btn >= 44); assert.equal(m.n, 4);
      await page.waitForTimeout(400); await shot(page, `craft-${name}-2-start`);

      await bot(page, { want: true, via });
      await page.waitForSelector('.rp-result[data-outcome="made"]', { timeout: 30000 });
      await page.evaluate(() => clearInterval(window.__bot));
      const r = await page.evaluate(() => document.querySelector('.cf-panel').__state.result);
      assert.deepEqual([r.good, r.spoils, r.stars, r.quality, r.xp], [4, 0, 3, 100, 6]);
      assert.equal(r.buildSeconds, 26); // 30 s x 0.85 rounded
      await page.waitForTimeout(250); await shot(page, `craft-${name}-3-made`);
      await page.click('.rp-result button');

      await page.click('#mg-go'); await page.waitForSelector('.cf-panel');
      await bot(page, { want: false, via });
      await page.waitForSelector('.rp-result[data-outcome="ruined"]', { timeout: 30000 });
      await page.evaluate(() => clearInterval(window.__bot));
      const r2 = await page.evaluate(() => document.querySelector('.cf-panel').__state.result);
      assert.deepEqual([r2.success, r2.xp, r2.materials], [false, 0, 10]);
      await shot(page, `craft-${name}-4-ruined`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
