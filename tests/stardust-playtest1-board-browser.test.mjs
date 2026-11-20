// Playtest 1, item 8: the crew board close-up. Names with red crosses, the last in pencil, 3 to 5 small notes to find by looking closely.
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-playtest1-board-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const SIZES = [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];

for (const [size, profile] of SIZES) {
  test(`the crew board opens full screen, shows the crossed names, and its notes read on a tap (${size})`, { skip, timeout: 120000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...profile, reducedMotion: 'reduce' });
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
      await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
      await page.goto(`${server.origin}${V}?newgame=1`);
      await page.waitForFunction(() => window.__stardust?.onfoot?.world);
      await page.waitForTimeout(1500);
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click({ timeout: 20000 });
      await page.waitForTimeout(1200);
      // Stand under the board (the board's interact is a quiet one: the wall panel at the top of the mess).
      const spot = await page.evaluate(() => { const i = window.__stardust.onfoot.world.map.interacts.find((x) => x.id === 'crew-board'); return i && { x: i.x, y: i.y }; });
      assert.ok(spot, 'the mess has a crew-board interact');
      await page.evaluate((s) => window.__stardust.onfoot.world.place(s.x, s.y + 52, -Math.PI / 2), spot);
      await page.waitForTimeout(500);
      await page.keyboard.press('KeyE');
      await page.waitForSelector('.of-board');
      assert.equal(await page.locator('.of-board-plate').count(), 7);
      assert.equal(await page.locator('.of-board-plate.is-crossed').count(), 6, 'six names crossed out');
      assert.equal(await page.locator('.of-board-plate.is-pencil').count(), 1, 'the last in pencil');
      const notes = await page.locator('.of-board-note').count();
      assert.ok(notes >= 3 && notes <= 5, `${notes} notes`);
      const box = await page.locator('.of-board').boundingBox();
      assert.ok(box.width >= profile.viewport.width - 2 && box.height >= profile.viewport.height - 2, 'full screen');
      // Nothing from the HUD covers the Back button.
      assert.equal(await page.evaluate(() => { const n = document.querySelector('.of-board-back'); const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return n === e || n.contains(e); }), true);
      if (PROOF) await page.screenshot({ path: `${PROOF}/board-closeup-${size}.png` });
      // Read a note: it shows, it is remembered.
      await page.locator('.of-board-note').first().click();
      assert.match(await page.locator('.of-board-reading').innerText(), /\w/);
      assert.equal(await page.evaluate(() => Object.keys(window.__stardust.store.get().flags).filter((k) => k.startsWith('board-note-')).length), 1);
      assert.match(await page.locator('.of-board-count').innerText(), /1 of \d/);
      if (PROOF) await page.screenshot({ path: `${PROOF}/board-note-${size}.png` });
      await page.locator('.of-board-back').click();
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.of-board').count(), 0);
      assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.held), false, 'the player is free again');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
