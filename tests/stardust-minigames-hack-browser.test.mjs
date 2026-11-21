// The hacking minigame in a real browser: set up from the address, played by
// tap (phone) and by key (desktop), a flood of misses trips the trace, no
// sideways scroll at 390 wide. Screenshots go to PROOF_DIR when it is set.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-hack-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const URL_Q = '?newgame=1&mini=hack&roll=9&dc=12&level=6&lock=2&time=1&size=2&retries=3&seed=4';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

// A bot inside the page: when the sweep sits in the lit window, press the button.
const startBot = (page, { via }) => page.evaluate((via) => {
  const s = document.querySelector('.hk-panel').__state; const TAU = Math.PI * 2;
  const inside = () => { const tb = s.tumblers[s.index]; const d = Math.abs(((s.cursor - tb.at + Math.PI * 3) % TAU) - Math.PI); return d <= tb.width / 2; };
  const press = () => (via === 'key' ? dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })) : document.querySelector('.hk-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  window.__bot = setInterval(() => { if (!s.done && inside()) press(); }, 4);
}, via);

test('hacking minigame in the browser', { skip }, async () => {
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
      await page.goto(`${server.origin}${PAGE}${URL_Q}`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.equal(await page.locator('#mg-mini').inputValue(), 'hack');
      // d20 9 + level 6 = 15 vs 12: margin 3, steady. Lock 2: 4 tumblers - 1 (size 2) = 3; 14.5 + 1.5 = 16 s; 2 + 1 = 3 spare.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier 0 Steady[\s\S]*3 tumblers[\s\S]*16s[\s\S]*3 spare/);
      await shot(page, `hack-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.hk-panel');
      const st = await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; return { n: s.tumblers.length, time: s.time, allowed: s.allowed }; });
      assert.deepEqual(st, { n: 3, time: 16, allowed: 3 });
      await page.waitForTimeout(300);
      await shot(page, `hack-${name}-2-start`);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector('.hk-btn').getBoundingClientRect().height }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll');
      assert.ok(m.btn >= 44);
      await startBot(page, { via });
      await page.waitForSelector('.rp-result.is-ok', { timeout: 20000 });
      await page.evaluate(() => clearInterval(window.__bot));
      const r = await page.evaluate(() => document.querySelector('.hk-panel').__state.result);
      assert.equal(r.success, true); assert.ok(r.xp >= 5);
      await page.waitForTimeout(250);
      await shot(page, `hack-${name}-3-open`);
      await page.click('.rp-result button');
      assert.equal(await page.locator('.hk-panel').count(), 0);

      // Misses: the (spare + 1)th trips the trace.
      await page.click('#mg-go');
      await page.waitForSelector('.hk-panel');
      await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; s.cursor = (s.tumblers[0].at + Math.PI) % (Math.PI * 2); });
      for (let i = 0; i < 4; i++) { await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; if (!s.done) { s.cursor = (s.tumblers[s.index].at + Math.PI) % (Math.PI * 2); s.dir = 0; } }); await page.keyboard.press('Space'); }
      await page.waitForSelector('.rp-result.is-bad', { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.querySelector('.hk-panel').__state.result.how), 'trace');
      await shot(page, `hack-${name}-4-trace`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
