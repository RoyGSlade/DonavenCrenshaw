// The repair minigame (v2, closed network, no clock) in a real browser: closed without the new-game flag,
// open with it, the coolant flows and pours from open ends into a rising pool, tap-solvable at phone size
// with touch, key-solvable on the desktop, and a full pool floods the line. Screenshots go to PROOF_DIR when it is set.
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
const shot = async (page, name) => { if (PROOF) { await page.evaluate(() => document.querySelector('.rp-panel')?.scrollIntoView({ block: 'center' })); await page.screenshot({ path: `${PROOF}/${name}.png` }); } };

const st = (page, expr) => page.evaluate((e) => { const s = document.querySelector('.rp-panel').__state; return new Function('s', `return ${e}`)(s); }, expr);
// Fix the network the way a person would: the wrong piece next to the coolant, one tap at a time (touch on the phone).
const hint = (page) => page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/minigames/repair.js')).nextHint(document.querySelector('.rp-panel').__state));

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
      assert.equal(await st(page, 's.size'), 5);
      assert.equal(await page.locator('.rp-tile').count(), 25);
      assert.equal(await page.locator('.rp-clock').count(), 0, 'no clock');
      assert.equal(await page.locator('.rp-pool').count(), 1, 'a pool along the bottom');

      // 1. The water is seen mid-flow: some piece is only part full.
      await page.waitForFunction(() => document.querySelector('.rp-tile.is-filling'), null, { timeout: 4000, polling: 'raf' });
      await shot(page, `repair-${name}-2a-pump-starts`);
      assert.ok(await st(page, 's.tiles.some((t) => t.wet > 0)'));

      // 2. A leak with the pool rising: an open end pours and the pool is higher a moment later.
      await page.waitForSelector('.rp-mouth.is-pouring', { timeout: 6000 });
      const p0 = await st(page, 's.pool');
      if (name === 'phone') { const i = await hint(page); await page.locator(`.rp-tile[data-i="${i}"]`).tap(); await page.waitForTimeout(300); await shot(page, `repair-${name}-6-after-tap`); }
      await page.waitForFunction(() => { const s = document.querySelector('.rp-panel').__state; return s.pool > s.capacity * 0.12; }, null, { timeout: 90000, polling: 500 });
      await shot(page, `repair-${name}-3-leak`);
      assert.ok(await st(page, 's.pool') > p0, 'the pool is rising');
      const m = await page.evaluate(() => { const el = document.querySelector('.rp-mouth.is-pouring'); const r = getComputedStyle(el, '::after'); return { fall: parseFloat(r.height), pool: parseFloat(document.querySelector('.rp-pool-fill').style.height) }; });
      assert.ok(m.fall > 0, 'a stream falls from the open connector'); assert.ok(m.pool > 0, 'the pool band has water in it');
      assert.ok(await st(page, 's.open.length') > 0);

      let caught = false;
      // 3. Fix it by tapping the hinted pieces until it seals.
      for (let k = 0; k < 120 && !(await page.locator('.rp-result').count()); k++) {
        const i = await hint(page); if (i == null) break;
        await page.locator(`.rp-tile[data-i="${i}"]`).click();
        if (!caught && await st(page, 's.powered.length') >= 5 && await page.locator('.rp-tile.is-filling').count()) { caught = true; await shot(page, `repair-${name}-2-flowing`); }
      }
      assert.ok(caught, 'the water was caught mid-flow along a longer run of pipe');
      await page.waitForSelector('.rp-result.is-ok');
      const result = await st(page, 's.result');
      assert.equal(result.success, true); assert.equal(result.how, 'sealed');
      assert.ok(result.quality >= 40 && result.xp >= 4 + 2 * 2);
      assert.equal(await page.locator('.rp-mouth').count(), 0, 'nothing left open once sealed');
      assert.equal(await page.locator('.rp-valve.is-sealed').count(), 1);
      await page.waitForTimeout(300);
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

      // A full pool floods the line (a shallow pool so the proof is quick; the real depth is in setup).
      await page.goto(`${server.origin}${PAGE}?newgame=1&roll=1&dc=20&level=1&seed=3&auto=1`);
      await page.waitForSelector('.rp-panel');
      await page.waitForSelector('.rp-mouth.is-pouring', { timeout: 8000 });
      await page.evaluate(() => { const s = document.querySelector('.rp-panel').__state; s.capacity = s.pool + 8; });
      await page.waitForFunction(() => { const s = document.querySelector('.rp-panel').__state; return s.pool > s.capacity * 0.6; }, null, { timeout: 20000 });
      await shot(page, `repair-${name}-5a-pool-high`);
      await page.waitForSelector('.rp-result.is-bad', { timeout: 20000 });
      assert.equal(await st(page, 's.result.how'), 'flooded');
      await page.waitForTimeout(300);
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
