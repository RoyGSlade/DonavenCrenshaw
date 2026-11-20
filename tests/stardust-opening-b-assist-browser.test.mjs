// Opening B, outcome 3 in a real browser: a rolled choice is something you do. The roll buys help and time; doing it in time passes.
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 400 node --test tests/stardust-opening-b-assist-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, SIZES, skip, bootAt, state, toLine, settle, PROOF } from '../scripts/stardust-opening-b-kit.mjs';

const toChoices = async (page) => {
  await toLine(page, 'not paying a toll');
  await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /cutter's readout/.test(b.textContent)), null, { timeout: 12000 });
};
const hud = (page) => page.evaluate(() => { const h = document.querySelector('.op-approach'); return h ? { verb: h.querySelector('.op-ap-verb').textContent, help: h.querySelector('.op-ap-help').textContent, tier: h.dataset.tier, secs: h.querySelector('.op-ap-secs').textContent, reached: h.dataset.reached, mark: window.__stardust.onfoot.world.stage.markedAt, captured: window.__stardust.onfoot.world.stage.captured } : null; });
const standAt = (page, id) => page.evaluate((id) => { const w = window.__stardust.onfoot.world; const i = w.map.interacts.find((x) => x.id === id); w.place(i.x + 40, i.y + 44); return { x: i.x, y: i.y }; }, id);

for (const [size, profile] of SIZES) {
  test(`approach (${size}): the roll sets help and time, you go to the console and work it, doing it in time takes the pass branch`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'visitors');
    try {
      await toChoices(page);
      const odds = await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: "cutter's readout" }).locator('.ui-dlg-odds').innerText();
      assert.match(odds, /sets your help and time/, 'the option says what the roll is for');
      assert.doesNotMatch(odds, /\d+%/, 'no pass chance on an approach');
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: "cutter's readout" }).click();
      await page.waitForSelector('.op-approach', { timeout: 8000 });
      const h = await hud(page);
      assert.equal(h.verb, 'Check the readout');
      assert.match(h.help, /Hint|No help/, 'the bar says what the roll bought');
      assert.equal(h.captured, true, 'the use key works the job');
      assert.equal(Boolean(h.mark), /Hint/.test(h.help), 'the floor is marked exactly when the roll bought a hint');
      assert.equal((await state(page)).node, 'bridge-3', 'nothing is decided yet');
      if (PROOF) { await settle(page, 500); await page.screenshot({ path: `${PROOF}/approach-bar-${size}.png` }); }
      const t0 = Number((await hud(page)).secs.replace(/\D/g, ''));
      await settle(page, 1300);
      assert.ok(Number((await hud(page)).secs.replace(/\D/g, '')) < t0, 'the time bar runs down');
      // Away from the console, working does nothing.
      await page.keyboard.down('KeyE'); await settle(page, 600); await page.keyboard.up('KeyE');
      assert.equal(await page.evaluate(() => document.querySelector('.op-ap-work i').style.width), '0%', 'no work away from the console');
      // Go to the nav console and work it.
      await standAt(page, 'nav-console');
      await settle(page, 400);
      const hh = await hud(page);
      if (hh) assert.equal(hh.reached, 'true');
      if (size === 'phone') {
        if (await page.locator('.op-ap-hold').count()) await page.locator('.op-ap-hold').dispatchEvent('pointerdown');
        await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'clamps', null, { timeout: 9000 });
        await page.locator('.op-ap-hold').dispatchEvent('pointerup').catch(() => {});
      } else {
        await page.keyboard.down('KeyE');
        await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'clamps', null, { timeout: 9000 });
        await page.keyboard.up('KeyE');
      }
      assert.equal(await page.locator('.op-approach').count(), 0, 'the bar is gone');
      assert.equal((await hud(page)), null);
      assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.stage.captured), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`approach (${size}): time running out takes the fail branch with a forced line; Try something else brings the options back`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'visitors');
    try {
      await toChoices(page);
      // Give up: the options come back and the beat is the same one.
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'calm Tull down' }).click();
      await page.waitForSelector('.op-approach');
      await page.locator('.op-ap-else').click();
      await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /calm Tull down/.test(b.textContent)), null, { timeout: 8000 });
      assert.equal((await state(page)).node, 'bridge-3');
      assert.equal((await state(page)).assist, null);
      // Run the clock out: Tull forces the next thing.
      await page.evaluate(() => window.__stardust.slice.runner.setScale(200));
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'calm Tull down' }).click();
      await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'reck-chat', null, { timeout: 9000 });
      const s = await state(page);
      assert.ok(s.bubbles.some((b) => b.id === 'tull' && /Not listening/.test(b.text)), `Tull forces it: ${JSON.stringify(s.bubbles)}`);
      assert.equal(await page.locator('.op-approach').count(), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
