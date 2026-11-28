// Skill points and XP that stick, in a real browser (skill-save lane, 2026-11-18).
// The extras page with ?save=1 keeps a preview save: a point spent in the picker is
// still there after a reload; scan, die, and the progress goes back to the scan;
// an XP claim over the cap is refused with plain words. Server mode off here
// (the hub side is proven by launch/skillsave/e2e-skillsave.mjs against a real hub).
//   PROOF_DIR=... STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-skill-save-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/extras.html?newgame=1&save=1';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name, full = false) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png`, fullPage: full }); };
const chip = (page) => page.locator('.ex-chip').first();
const char = (page) => page.evaluate(() => window.__skillsave.store.get().character);
const log = (page) => page.locator('#ex-log');

test('skill points and XP are stored and validated, in the browser', { skip }, async () => {
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
      await page.goto(`${server.origin}${PAGE}`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.match(await page.locator('#ex-mode').innerText(), /Saved in this browser/);
      assert.equal(await chip(page).getAttribute('data-tone'), 'safe', 'scanned at the start');
      // Repair is level 3 with one point spent: two to spend.
      assert.equal(await page.locator('.ex-left').getAttribute('data-left'), '2');
      assert.equal(await page.locator('.ex-cat[data-cat="size"] .ex-step:not(.primary)').isHidden(), true, 'spent points stay spent: no minus button');
      await shot(page, `skillsave-${name}-1-start`, name === 'phone');

      // Spend both: it survives a reload.
      await page.click('.ex-cat[data-cat="size"] .ex-step.primary');
      await page.click('.ex-cat[data-cat="quality"] .ex-step.primary');
      assert.equal(await page.locator('.ex-left').getAttribute('data-left'), '0');
      assert.deepEqual((await char(page)).points.repair, { time: 1, size: 1, quality: 1 });
      await page.reload();
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.deepEqual((await char(page)).points.repair, { time: 1, size: 1, quality: 1 }, 'points survive a reload');
      assert.equal(await page.locator('.ex-left').getAttribute('data-left'), '0');
      assert.match(await page.locator('.ex-cat[data-cat="size"] .ex-now').innerText(), /board/);
      await shot(page, `skillsave-${name}-2-spent-after-reload`, name === 'phone');

      // A hacked save with more points than the level is repaired on load.
      await page.evaluate(() => { const s = window.__skillsave.store; s.update((x) => ({ ...x, character: { ...x.character, points: { repair: { time: 9, size: 9, quality: 9 } } } })); });
      assert.deepEqual((await char(page)).points.repair, { time: 3 }, 'the cleaner trims to the level');
      await page.evaluate(() => { const s = window.__skillsave.store; s.update((x) => ({ ...x, character: { ...x.character, points: { repair: { time: 1, size: 1, quality: 1 } } } })); });

      // XP: win some, then try to take too much.
      await page.click('text=Win a repair (+6 Repair XP)');
      await page.waitForFunction(() => window.__skillsave.store.get().character.xp.repair === 256);
      assert.match(await log(page).innerText(), /Won a repair: \+6 XP/);
      await page.click('text=Claim 30 Repair XP in one win');
      await page.waitForFunction(() => /more XP than one win can give/.test(document.querySelector('#ex-log').textContent));
      assert.equal((await char(page)).xp.repair, 256, 'over the cap: refused, nothing paid');
      await shot(page, `skillsave-${name}-3-claim-refused`, name === 'phone');

      // Scan, earn, die: back to the scan.
      await page.click('text=Scan: save here');
      await page.waitForFunction(() => window.__skillsave.store.get().character.scan.xp.repair === 256);
      assert.equal(await chip(page).getAttribute('data-tone'), 'safe');
      for (let i = 0; i < 3; i++) await page.click('text=Win a repair (+6 Repair XP)');
      await page.waitForFunction(() => window.__skillsave.store.get().character.xp.repair === 274);
      assert.notEqual(await chip(page).getAttribute('data-tone'), 'safe');
      assert.match(await chip(page).innerText(), /XP at risk since your last scan/);
      await shot(page, `skillsave-${name}-4-at-risk`, name === 'phone');
      // The hour's cap: 30 XP a skill. 6 + 18 so far; one more win of 6 fills it, the next is refused.
      await page.click('text=Win a repair (+6 Repair XP)');
      await page.waitForFunction(() => window.__skillsave.store.get().character.xp.repair === 280);
      await page.click('text=Win a repair (+6 Repair XP)');
      await page.waitForFunction(() => /all the XP this skill pays out/.test(document.querySelector('#ex-log').textContent));
      assert.equal((await char(page)).xp.repair, 280, 'the hour is full: refused');
      await shot(page, `skillsave-${name}-5-hour-cap`, name === 'phone');

      await page.click('text=Die: reprint from the scan');
      await page.waitForFunction(() => window.__skillsave.store.get().character.xp.repair === 256);
      assert.equal(await chip(page).getAttribute('data-tone'), 'safe');
      assert.deepEqual((await char(page)).points.repair, { time: 1, size: 1, quality: 1 }, 'points were spent before the scan: they stay');
      await page.reload();
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.equal((await char(page)).xp.repair, 256, 'the reprint survives a reload');
      await shot(page, `skillsave-${name}-6-reprinted`, name === 'phone');

      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.ok(m.sw <= m.iw, `no sideways scroll (${m.sw} > ${m.iw})`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
