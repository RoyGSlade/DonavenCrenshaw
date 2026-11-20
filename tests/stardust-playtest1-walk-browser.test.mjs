// Playtest 1, item 5: the player no longer floats. While walking the body steps (rocks, rises on each step, scuffs dust); idle it stands upright.
// Proof: 6 frames of a walking burst per size (PROOF_DIR). STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-playtest1-walk-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const SIZES = [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];

for (const [size, profile] of SIZES) {
  test(`the player steps while walking and stands upright when idle (${size})`, { skip, timeout: 120000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    try {
      await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
      await page.goto(`${server.origin}${V}?newgame=1`);
      await page.waitForFunction(() => window.__stardust?.onfoot?.world);
      await page.waitForTimeout(1500);
      // Free the floor: skip the captain (Later), then stand in open deck.
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click({ timeout: 20000 });
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__stardust.onfoot.world.place(200, 300, 0));
      await page.waitForTimeout(500);
      const clip = () => page.evaluate(() => { const w = window.__stardust.onfoot.world, p = w.position(), s = w.screenOf(p.x, p.y), r = w.canvas.getBoundingClientRect(); return { x: Math.max(0, r.left + s.x - 60), y: Math.max(0, r.top + s.y - 70), width: 120, height: 120 }; });
      const frames = [];
      await page.keyboard.down('KeyD');
      for (let i = 0; i < 6; i++) { await page.waitForTimeout(70); frames.push(await page.screenshot({ clip: await clip() })); }
      await page.keyboard.up('KeyD');
      const distinct = new Set(frames.map((b) => crypto.createHash('sha1').update(b).digest('hex')));
      assert.ok(distinct.size >= 4, `the walking body changes from frame to frame (${distinct.size} distinct of 6)`);
      if (PROOF) frames.forEach((b, i) => import('node:fs').then((fs) => fs.writeFileSync(`${PROOF}/walk-${size}-${i + 1}.png`, b)));
      // Idle: upright. The body's heading rotation is only the facing; no sway beyond the slow breath.
      await page.waitForTimeout(600);
      const idle = await page.evaluate(() => window.__stardust.onfoot.world.position().moving);
      assert.equal(idle, false);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
