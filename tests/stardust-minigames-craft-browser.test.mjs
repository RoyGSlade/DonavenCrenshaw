// The forge (heat and shape) in a real browser: set up from the address; hold-to-heat by key on
// desktop and by touch hold on phone, release in the band, tap the tools in order; a burnt stock;
// a wrong-order tap; the scrap bank carries between crafts. Screenshots to PROOF_DIR.
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

// Hold to heat, let go when the glow reaches `at` ('centre' | 'cold' | 'hot' | 'never').
const heat = (page, { at, via }) => page.evaluate(({ at, via }) => {
  const s = document.querySelector('.cf-panel').__state; const btn = document.querySelector('.cf-hold');
  const lo = s.centre - s.zone / 2, hi = s.centre + s.zone / 2;
  const target = { centre: s.centre, cold: lo - 0.06, hot: hi + 0.06, never: 2 }[at];
  if (via === 'key') dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); else btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
  const t = setInterval(() => { if (s.phase !== 'heat') return clearInterval(t); if (s.temp >= target) { clearInterval(t); if (via === 'key') dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); else btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 })); } }, 2);
}, { at, via });

test('crafting forge (heat and shape) in the browser', { skip }, async () => {
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
      // d20 12 + 6 = 18 vs 12: margin 6, Good. 3 speed points: 4 steps. Band 25.3%, work x1.15.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*4 steps[\s\S]*heat band 25\.3%[\s\S]*work x1\.15[\s\S]*quality \+8[\s\S]*build x0\.85[\s\S]*scrap x0\.96/);
      await shot(page, `craft-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.cf-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector('.cf-hold').getBoundingClientRect().height, n: document.querySelector('.cf-panel').__state.strikes }));
      assert.ok(m.sw <= m.iw); assert.ok(m.btn >= 44); assert.equal(m.n, 4);
      await page.waitForTimeout(300); await shot(page, `craft-${name}-2-heat`);

      await heat(page, { at: 'centre', via });
      await page.waitForSelector('.cf-panel[data-phase="shape"]', { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.querySelector('.cf-panel').__state.heat), 'ok');
      // One wrong tap first (spoils), then everything in order.
      const { order, tiles } = await page.evaluate(() => { const s = document.querySelector('.cf-panel').__state; return { order: s.order, tiles: s.tiles }; });
      const wrong = tiles.find((t) => t !== order[0]);
      await page.click(`[data-tool="${wrong}"]`);
      await shot(page, `craft-${name}-3-shape-wrong`);
      for (const id of order) await page.click(`[data-tool="${id}"]`);
      await page.waitForSelector('.rp-result[data-outcome="made"]');
      const r = await page.evaluate(() => document.querySelector('.cf-panel').__state.result);
      assert.deepEqual([r.success, r.good, r.wrong, r.spoils, r.quality, r.stars], [true, 3, 1, 1, 86, 2]);
      assert.equal(r.buildSeconds, 26); // 30 x 0.85
      // Scrap: exact 4 x 0.96 x 1.1 = 4.224, ceil 5, bank 0.776
      assert.deepEqual([r.materials, Math.round(r.bank * 1000) / 1000], [5, 0.776]);
      await page.waitForTimeout(250); await shot(page, `craft-${name}-4-made`);
      assert.match(await page.locator('.cf-mat').innerText(), /5 used \(4\.22 exact\), 0\.78 banked/);
      await page.click('.rp-result button');

      // The bank carries into the next craft: readout shows it, and the next clean craft uses 4 and grows it.
      assert.match(await page.locator('#mg-readout').innerText(), /banked 0\.78/);
      await page.click('#mg-go'); await page.waitForSelector('.cf-panel');
      await heat(page, { at: 'centre', via });
      await page.waitForSelector('.cf-panel[data-phase="shape"]');
      const o2 = await page.evaluate(() => document.querySelector('.cf-panel').__state.order);
      for (const id of o2) await page.click(`[data-tool="${id}"]`);
      await page.waitForSelector('.rp-result[data-outcome="made"]');
      const r2 = await page.evaluate(() => document.querySelector('.cf-panel').__state.result);
      assert.deepEqual([r2.spoils, r2.materials, Math.round(r2.bank * 1000) / 1000], [0, 4, 0.936]); // 3.84 - 0.776 = 3.064 -> 4, the credit grows
      await page.click('.rp-result button');

      // A burnt stock: hold forever.
      await page.click('#mg-go'); await page.waitForSelector('.cf-panel');
      await heat(page, { at: 'never', via });
      await page.waitForSelector('.cf-panel[data-phase="shape"]', { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.querySelector('.cf-panel').__state.heat), 'hot');
      await shot(page, `craft-${name}-5-burnt`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
