// Plot the lane in a real browser: set up from the address; tap a route cell by cell (touch on phone,
// arrow keys on desktop), back up, hit a visible hazard on purpose, run out of fuel. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-nav-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=nav&roll=11&dc=10&level=7&time=2&fuel=2&warning=3&seed=5';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
const st = (page) => page.evaluate(() => { const s = document.querySelector('.nv-panel').__state; return { path: s.path, solution: s.solution, size: s.size, hazards: [...s.hazards], time: s.time, fuel: s.fuel, hits: s.hits, done: s.done, result: s.result, budgetTime: s.budgetTime, budgetFuel: s.budgetFuel }; });
const cell = (i) => `.nv-cell[data-i="${i}"]`;

test('navigation (plot the lane) in the browser', { skip }, async () => {
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
      assert.equal(await page.locator('#mg-mini').inputValue(), 'nav');
      // d20 11 + 7 = 18 vs 10: margin 8, Good. 7 points: time 2, fuel 2, warning 3 (reveal 2).
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*Map 6 x 6[\s\S]*5 hazards[\s\S]*warning 2 ahead[\s\S]*time x0\.92[\s\S]*fuel x0\.92[\s\S]*time budget x1\.15/);
      await shot(page, `nav-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.nv-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cell: document.querySelector('.nv-cell').getBoundingClientRect().width }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll'); assert.ok(m.cell >= 44, `cell ${m.cell}`);
      const s0 = await st(page);
      assert.ok(await page.locator('.nv-cell.is-hazard').count() >= 1, 'a hazard beside the start is warned about');

      // Plot the route with a detour: step, back up, then the whole solution.
      if (name === 'phone') { await page.tap(cell(s0.solution[1])); } else { await page.click(cell(s0.solution[1])); }
      await page.click('.nv-back');
      let s = await st(page);
      assert.deepEqual(s.path, [0]); assert.ok(s.time > 0, 'backing up still costs');
      await page.waitForTimeout(150); await shot(page, `nav-${name}-2-start`);
      const mid = Math.ceil(s0.solution.length / 2);
      for (let k = 1; k < s0.solution.length; k++) {
        await page.click(cell(s0.solution[k]));
        if (k === mid) { await page.waitForTimeout(150); await shot(page, `nav-${name}-3-mid`); }
      }
      await page.waitForSelector('.rp-result[data-outcome="arrived"]');
      s = await st(page);
      assert.equal(s.result.success, true); assert.equal(s.result.backups, 1); assert.equal(s.result.hits, 0);
      await page.waitForTimeout(250); await shot(page, `nav-${name}-4-arrived`);
      await page.click('.rp-result button');

      // A hazard on purpose, then run dry. (The next run is seed 6 in the page.)
      await page.click('#mg-go'); await page.waitForSelector('.nv-panel');
      const s1 = await st(page);
      const hz = s1.hazards.find((h) => Math.abs((h % s1.size) - 0) + Math.floor(h / s1.size) === 1);
      if (hz !== undefined) {
        await page.click(cell(hz));
        assert.equal((await st(page)).hits, 1);
        assert.match(await page.locator('.nv-panel .rp-status').innerText(), /Hazard! \+3 time, \+3 fuel/);
        await shot(page, `nav-${name}-5-hazard`);
      }
      await page.evaluate(() => { const s = document.querySelector('.nv-panel').__state; s.fuel = s.budgetFuel - 0.1; });
      const near = (await st(page)).path.at(-1);
      const next = near + 1 < 36 && near % 6 < 5 ? near + 1 : near + 6;
      await page.click(cell(next));
      await page.waitForSelector('.rp-result[data-outcome="stranded"]');
      assert.equal((await st(page)).result.how, 'out-of-fuel');
      await shot(page, `nav-${name}-6-stranded`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
