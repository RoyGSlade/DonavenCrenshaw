// Opening B, outcome 2 in a real browser: no instant full-screen swap. Frames are sampled while the opening changes day, room and mode.
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 400 node --test tests/stardust-opening-b-cuts-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, SIZES, skip, boot, bootAt, state, toLine, settle, frameReport, PROOF } from '../scripts/stardust-opening-b-kit.mjs';

for (const [size, profile] of SIZES) {
  test(`cuts (${size}): a new day fades through black with a line, and nothing swaps the picture instantly`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'the-eighth-gunner', { reduced: false, sampler: true });
    try {
      // The reload started scene 4: it opened with a skip (a fade with one line) into the crew deck.
      await page.waitForFunction(() => Object.keys(window.__stardust.store.get().quests.active || {}).includes('the-eighth-gunner'), null, { timeout: 15000 });
      await settle(page, 1500);
      const r = await frameReport(page);
      assert.ok(r.frames > 20, `frames were sampled (${r.frames})`);
      assert.ok(r.captions.includes('The next morning.'), `the skip line showed: ${JSON.stringify(r.captions)}`);
      assert.deepEqual(r.cuts, [], 'no hard cut');
      assert.equal((await state(page)).map, 'duchess-quarters');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`cuts (${size}): the job card and the fight come in; a fight starts where the player stands and its card shows in place`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'hold-the-corridor', { reduced: false, sampler: true });
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /Grab the rifle/.test(b.textContent)), null, { timeout: 30000 });
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Grab the rifle' }).click();
      await settle(page, 600);
      // Walk through the bridge door the way the player does: stand in its entry.
      await page.evaluate(async () => {
        const { doorToward } = await import('/projects/Space-Shooter/voyage/datapad/route.js');
        const { MAP_DEFS } = await import('/projects/Space-Shooter/voyage/maps/index.js');
        const w = window.__stardust.onfoot.world;
        const id = doorToward(w.map.id, ['duchess-corridor'], MAP_DEFS);
        const e = w.doors.entries.find((x) => x.room === id);
        w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2);
      });
      await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'duchess-corridor', null, { timeout: 10000 });
      await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /Hold the corridor/.test(b.textContent)), null, { timeout: 15000 });
      const before = (await state(page)).pos;
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Hold the corridor' }).click();
      await page.waitForFunction(() => window.__stardust.onfoot.world.mode === 'fight', null, { timeout: 8000 });
      const at = await page.evaluate(() => { const p = window.__stardust.onfoot.world.fightState.player; return { x: p.x, y: p.y }; });
      assert.ok(Math.hypot(at.x - before.x, at.y - before.y) < 60, `the fight started where the player stood (${before.x},${before.y} -> ${at.x},${at.y})`);
      if (PROOF) { await settle(page, 800); await page.screenshot({ path: `${PROOF}/fight-in-place-${size}.png` }); }
      // End it: every enemy down. The result card shows right there, in the corridor.
      await page.evaluate(() => { for (const e of window.__stardust.onfoot.world.fightState.enemies) { e.alive = false; e.hp = 0; } });
      await page.waitForFunction(() => !document.querySelector('#dp-jobcard').hidden, null, { timeout: 12000 });
      assert.equal((await state(page)).map, 'duchess-corridor', 'the card shows in the corridor');
      const anim = await page.evaluate(() => getComputedStyle(document.querySelector('#dp-jobcard')).animationName);
      assert.match(anim, /op-card-in/, 'the card comes in');
      const r = await frameReport(page);
      assert.deepEqual(r.cuts, [], `no hard cut: ${JSON.stringify(r.cuts)}`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
