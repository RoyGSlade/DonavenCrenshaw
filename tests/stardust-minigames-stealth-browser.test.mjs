// Shadow slip in a real browser: set up from the address; tap a heat-free route beat by beat (touch on
// phone, keys on desktop), get seen on purpose, get caught, miss the shift change. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-stealth-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=stealth&roll=11&dc=10&level=7&quiet=2&range=3&decay=2&seed=3';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
const st = (page) => page.evaluate(() => { const s = document.querySelector('.st-panel').__state; return { pos: s.pos, beat: s.beat, heat: s.heat, safe: s.safe, done: s.done, result: s.result, beats: s.beats, size: s.size }; });
const cell = (i) => `.st-cell[data-i="${i}"]`;

test('stealth (shadow slip) in the browser', { skip }, async () => {
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
      assert.equal(await page.locator('#mg-mini').inputValue(), 'stealth');
      // d20 11 + 7 = 18 vs 10: margin 8, Good. 7 points: quiet 2, range 3, decay 2.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*2 guards[\s\S]*shift 32 beats[\s\S]*heard step \+10 heat[\s\S]*cones about 3 cells[\s\S]*cools 12/);
      assert.match(await page.locator('#mg-readout .mg-rollline').innerText(), /^Good roll: 4 more beats before the shift change\. 2 more on the d20 would make it Smooth\.$/);
      await shot(page, `stealth-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.st-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cell: document.querySelector('.st-cell').getBoundingClientRect().width, key: !!document.querySelector('.nv-key') }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll'); assert.ok(m.cell >= 44, `cell ${m.cell}`); assert.ok(m.key);
      assert.ok(await page.locator('.st-cell.is-now').count() >= 1, 'the cones for the next beat are lit');
      await page.waitForTimeout(150); await shot(page, `stealth-${name}-2-start`);

      // The heat-free route, one beat at a time (a wait is a tap on your own cell).
      let s = await st(page);
      const route = s.safe, mid = Math.ceil(route.length / 2);
      for (let k = 1; k < route.length; k++) {
        if (name === 'phone') await page.tap(cell(route[k])); else await page.click(cell(route[k]));
        if (k === mid) { await page.waitForTimeout(150); await shot(page, `stealth-${name}-3-mid`); }
      }
      await page.waitForSelector('.rp-result[data-outcome="slipped"]');
      s = await st(page);
      assert.deepEqual([s.result.success, s.result.maxHeat, s.result.stars, s.result.xp], [true, 0, 3, 6]);
      await page.waitForTimeout(250); await shot(page, `stealth-${name}-4-slipped`);
      await page.click('.rp-result button');

      // Seen on purpose: set up a guard cone and step into it, then keep stepping to be caught.
      await page.click('#mg-go'); await page.waitForSelector('.st-panel');
      // Wait beats until some neighbouring cell would be seen or heard, then step into it.
      const findBad = () => page.evaluate(async () => {
        const mod = await import('/projects/Space-Shooter/voyage/minigames/stealth.js');
        const s = document.querySelector('.st-panel').__state;
        return mod.neighbours(s, s.pos).find((j) => mod.gainAt(s, j, s.beat + 1, true).total > 0) ?? null;
      });
      let hot = await findBad();
      for (let k = 0; hot === null && k < 12; k++) { await page.click('.nv-back'); hot = await findBad(); }
      assert.notEqual(hot, null, 'some cell next to the start is watched within 12 beats');
      await page.click(cell(hot));
      assert.match(await page.locator('.st-panel .rp-status').innerText(), /Seen!|Heard a step/);
      assert.ok((await st(page)).heat > 0);
      await shot(page, `stealth-${name}-5-seen`);
      await page.evaluate(() => { const s = document.querySelector('.st-panel').__state; s.heat = 99.5; });
      const next = await page.evaluate(async () => {
        const mod = await import('/projects/Space-Shooter/voyage/minigames/stealth.js');
        const s = document.querySelector('.st-panel').__state;
        return [s.pos, ...mod.neighbours(s, s.pos)].find((j) => mod.gainAt(s, j, s.beat + 1, j !== s.pos).total > 0) ?? null;
      });
      assert.notEqual(next, null);
      await page.click(cell(next)); await page.waitForSelector('.rp-result[data-outcome="caught"]');
      await shot(page, `stealth-${name}-6-caught`); assert.equal((await st(page)).result.xp, 0); await page.click('.rp-result button');

      // Shift change.
      await page.click('#mg-go'); await page.waitForSelector('.st-panel');
      await page.evaluate(() => { const s = document.querySelector('.st-panel').__state; s.beat = s.beats - 1; s.heat = 0; });
      await page.click('.nv-back');
      await page.waitForSelector('.rp-result[data-outcome="late"], .rp-result[data-outcome="caught"]');
      assert.equal((await st(page)).result.success, false);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
