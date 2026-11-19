// The haggle in a real browser: set up from the address, a bot asks when the needle sits in
// the lit band (tap on phone, Space on desktop), a greedy player is walked out on, Take offer works.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-haggle-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=haggle&roll=11&dc=10&level=5&haggle=3&seed=4';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

// Reads the live state: price under the needle, comfort band, and presses Ask when wanted.
const bot = (page, { mode, via }) => page.evaluate(({ mode, via }) => {
  const s = document.querySelector('.hg-panel').__state;
  const price = () => { const x = (s.phase + s.t * s.speed) % 2; const p = x <= 1 ? x : 2 - x; return Math.round(s.open + p * (s.cap - s.open)); };
  const lo = Math.round(s.open + Math.max(0, s.limitAt - s.band) * (s.cap - s.open));
  const press = () => (via === 'key' ? dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })) : document.querySelector('.hk-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  window.__bot = setInterval(() => { if (s.done) return; const p = price(); if (mode === 'band' ? p >= lo && p <= s.limit : p >= s.limit + 3) press(); }, 4);
}, { mode, via });

test('haggle in the browser', { skip }, async () => {
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
      assert.equal(await page.locator('#mg-mini').inputValue(), 'haggle');
      // d20 11 + 5 = 16 vs 10: margin 6, Good: band (0.12 + 0.012) x 1.15 = 15.2%, patience 4, rounds 3, price +4.5%.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*15\.2%[\s\S]*4 patience[\s\S]*3 rounds[\s\S]*\+4\.5%/);
      await shot(page, `haggle-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.hg-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, ask: document.querySelector('.hk-btn').getBoundingClientRect().height, band: document.querySelector('.hg-band').getBoundingClientRect().width }));
      assert.ok(m.sw <= m.iw); assert.ok(m.ask >= 44); assert.ok(m.band > 10);
      await page.waitForTimeout(500); await shot(page, `haggle-${name}-2-start`);

      // Greedy first: three too-rich asks (tier +1 has 4 patience, 3 rounds): they close at their final offer, a fair deal at best.
      await bot(page, { mode: 'greedy', via });
      await page.waitForSelector('.rp-result', { timeout: 30000 });
      await page.evaluate(() => clearInterval(window.__bot));
      assert.equal(await page.evaluate(() => document.querySelector('.hg-panel').__state.result.how), 'final');
      await shot(page, `haggle-${name}-3-counter-final`);
      await page.click('.rp-result button');

      // Then in the band: a great deal.
      await page.click('#mg-go');
      await page.waitForSelector('.hg-panel');
      await bot(page, { mode: 'band', via });
      await page.waitForSelector('.rp-result[data-outcome="well"]', { timeout: 30000 });
      await page.evaluate(() => clearInterval(window.__bot));
      const r = await page.evaluate(() => document.querySelector('.hg-panel').__state.result);
      assert.equal(r.how, 'sweet'); assert.equal(r.xp, 4);
      await page.waitForTimeout(250); await shot(page, `haggle-${name}-4-great-deal`);
      await page.click('.rp-result button');

      // Take their offer, and a walk-out (low roll: patience 2).
      await page.click('#mg-go'); await page.waitForSelector('.hg-panel');
      await page.click('.hg-take');
      assert.equal(await page.locator('.rp-result[data-outcome="fair"]').count(), 1);
      await page.click('.rp-result button');
      await page.goto(`${server.origin}${PAGE}?newgame=1&mini=haggle&roll=2&dc=14&level=1&seed=4&auto=1`);
      await page.waitForSelector('.hg-panel');
      await bot(page, { mode: 'greedy', via });
      await page.waitForSelector('.rp-result[data-outcome="walked"]', { timeout: 30000 });
      await page.evaluate(() => clearInterval(window.__bot));
      await shot(page, `haggle-${name}-5-walked`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
