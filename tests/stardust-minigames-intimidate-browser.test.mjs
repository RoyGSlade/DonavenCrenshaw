// Intimidate (push your luck) in a real browser: tap Push and Stand on phone, click on desktop; a win, a snap
// and a stand-too-soon. The snap rolls are set through the page's state so the run is certain. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-intimidate-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=intimidate&roll=11&dc=10&level=6&intimidate=6&seed=3';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
const rig = (page, rolls) => page.evaluate((r) => { const s = document.querySelector('.it-panel').__state; s.rolls = r.map((x) => x / 100); }, rolls);

test('intimidate (push your luck) in the browser', { skip }, async () => {
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
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.equal(await page.locator('#mg-mini').inputValue(), 'intimidate');
      // 11 + 6 = 17 vs 10: margin 7, Good (-3 risk). 6 points: -6 more, 1 save. First push 8 - 3 - 6 = 2 percent, sixth 49.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*first push 2%[\s\S]*sixth 49%[\s\S]*1 save[\s\S]*exact risk/);
      await shot(page, `intimidate-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.it-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector('.it-push').getBoundingClientRect().height, rungs: document.querySelectorAll('.it-rung').length }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll'); assert.ok(m.btn >= 44); assert.equal(m.rungs, 6);
      assert.match(await page.locator('.it-rung.is-next').innerText(), /3[\s\S]*2% they snap/);
      await page.waitForTimeout(100); await shot(page, `intimidate-${name}-2-start`);

      // A win: push three times (certain not to snap), stand.
      await rig(page, [99, 99, 99, 99, 99, 99]);
      await tap('.it-push'); await tap('.it-push');
      // After a tap (phone: the hover state sticks) Push must still read as the main button, not a disabled one.
      await page.waitForTimeout(300);
      const look = await page.evaluate(() => { const b = document.querySelector('.it-push'); const c = getComputedStyle(b); return { img: c.borderImageSource, color: c.color, op: c.opacity, dis: b.disabled }; });
      assert.equal(look.dis, false); assert.equal(look.op, '1'); assert.match(look.img, /button-primary(-hover|-pressed)?\.webp/, `push keeps the primary kit picture after a tap: ${look.img}`); assert.doesNotMatch(look.color, /rgb\((1[5-9]\d|2\d\d)/, `push text stays dark on the light picture: ${look.color}`);
      await page.waitForTimeout(100); await shot(page, `intimidate-${name}-3-mid`);
      await tap('.it-push');
      assert.match(await page.locator('.it-have').innerText(), /You have 10 of the 10 you need: enough/);
      await tap('.it-stand');
      await page.waitForSelector('.rp-result[data-outcome="won"]');
      assert.match(await page.locator('.rp-result').innerText(), /10 of 10 · 3 pushes · \+3 Social XP/);
      await page.waitForTimeout(150); await shot(page, `intimidate-${name}-4-won`);
      await page.click('.rp-result button');

      // A snap with the one save: the first snap is shrugged off, the second ends it.
      await page.click('#mg-go'); await page.waitForSelector('.it-panel');
      await rig(page, [99, 0]); await page.evaluate(() => { document.querySelector('.it-panel').__state.extra = Array(12).fill(0); });
      await tap('.it-push'); await tap('.it-push');
      assert.match(await page.locator('.pc-none, .it-panel .rp-status').first().innerText(), /saved|flinch/);
      await shot(page, `intimidate-${name}-5-saved`);
      await tap('.it-push');
      await page.waitForSelector('.rp-result[data-outcome="snapped"]');
      await shot(page, `intimidate-${name}-6-snapped`);

      // Standing too soon.
      await page.click('.rp-result button');
      await page.click('#mg-go'); await page.waitForSelector('.it-panel');
      await rig(page, [99, 99, 99]); await tap('.it-push'); await tap('.it-stand');
      await page.waitForSelector('.rp-result[data-outcome="short"]');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
