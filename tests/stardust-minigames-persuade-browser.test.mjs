// Persuade (read the room) in a real browser: set up from the address, play by tap on phone and
// click on desktop: a win by reading the tells, a loss by picking what they dislike. Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-persuade-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const Q = '?newgame=1&mini=persuade&roll=11&dc=10&level=7&persuade=7&seed=3';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
// For each card: its id and what it is to them (read from the pure state; the player would read the tells).
const cardsOf = (page) => page.evaluate(() => { const s = document.querySelector('.pc-panel').__state; return s.hand.map((c) => ({ id: c.id, kind: s.cares.includes(c.value) ? 'care' : c.value === s.dislike ? 'dislike' : 'neutral', worth: c.worth })); });
const tap = async (page, name, id) => { const sel = `.pc-card[data-id="${id}"]`; if (name === 'phone') await page.tap(sel); else await page.click(sel); };

test('persuade (read the room) in the browser', { skip }, async () => {
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
      assert.equal(await page.locator('#mg-mini').inputValue(), 'persuade');
      // 11 + 7 = 18 vs 10: margin 8, Good. 7 points: goal 21 - 7 = 14, patience 4, tells 2 + 2 = 4.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier \+1 Good[\s\S]*Trust needed 14[\s\S]*patience 4[\s\S]*you notice 4 things/);
      await shot(page, `persuade-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.pc-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, card: document.querySelector('.pc-card').getBoundingClientRect().height, tells: document.querySelectorAll('.pc-tells li').length, cards: document.querySelectorAll('.pc-card').length }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll'); assert.ok(m.card >= 44); assert.equal(m.tells, 4); assert.equal(m.cards, 8);
      await page.waitForTimeout(100); await shot(page, `persuade-${name}-2-start`);

      // Play like a reader: cares first, best first. Mid-way screenshot after two.
      let cards = await cardsOf(page);
      const good = cards.filter((c) => c.kind === 'care').sort((a, b) => b.worth - a.worth);
      await tap(page, name, good[0].id); await tap(page, name, good[1].id);
      assert.match(await page.locator('.pc-panel .rp-status').innerText(), /landed/);
      await page.waitForTimeout(100); await shot(page, `persuade-${name}-3-mid`);
      for (const c of good.slice(2)) { if (await page.locator('.rp-result').count()) break; await tap(page, name, c.id); }
      await page.waitForSelector('.rp-result[data-outcome="won"]');
      assert.match(await page.locator('.rp-result').innerText(), /trust/);
      await page.waitForTimeout(150); await shot(page, `persuade-${name}-4-won`);
      await page.click('.rp-result button');

      // A bad read: the things they dislike, then a miss.
      await page.click('#mg-go'); await page.waitForSelector('.pc-panel');
      cards = await cardsOf(page);
      const bad = cards.filter((c) => c.kind !== 'care');
      await tap(page, name, bad.find((c) => c.kind === 'dislike').id);
      assert.match(await page.locator('.pc-card.is-hurt small').innerText(), /-2 patience/);
      await shot(page, `persuade-${name}-5-hurt`);
      for (const c of bad) { if (await page.locator('.rp-result').count()) break; if (await page.locator(`.pc-card[data-id="${c.id}"]:not(:disabled)`).count()) await tap(page, name, c.id); }
      await page.waitForSelector('.rp-result[data-outcome="lost"]');
      await shot(page, `persuade-${name}-6-lost`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close?.(); }
});
