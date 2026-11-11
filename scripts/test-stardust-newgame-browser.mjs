// New-game browser test scaffolding. Dev-only; run one browser file at a time:
//   ~/kauto-3d/bin/capped 6G timeout 600 node scripts/test-stardust-newgame-browser.mjs
//
// Core and quests: drop your new-game tests in this file (or copy its pattern into a sibling
// scripts/test-stardust-newgame-*.mjs). Use bootStardust(browser, origin, { newGame: true }) from
// scripts/stardust-test-kit.mjs to open Stardust with the new-game flag on, and menuFingerprint()
// to prove a menu did or did not change. (The expansion replaces today's game, so "flag off" means
// "today's game, unchanged", the safe state until Donaven approves the cut-over.)
//
// The placeholder test below only checks that default: with the flag off today's game boots
// and its hangar menu is exactly today's.
import assert from 'node:assert/strict';
import { bootStardust, launchBrowser, menuFingerprint, newGameTraces, startServer } from './stardust-test-kit.mjs';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`ok   ${name}`); }
  catch (error) { results.push({ name, ok: false }); console.log(`FAIL ${name}\n     ${String(error?.message || error).split('\n').join('\n     ')}`); }
}

// Controls today's hangar must keep while the flag is off. Add to it only when today's menu changes on purpose.
const TODAY_MENU_IDS = ['starmap-start-btn', 'starmap-settings-btn-start', 'hangar-garage-btn'];

const server = await startServer();
const browser = await launchBrowser();
try {
  await test('flag off: today\'s game boots unchanged', async () => {
    // Three ways of being "off": no flag at all, ?newgame=0, and the flag stored then cleared.
    const plain = await bootStardust(browser, server.origin, { newGame: false });
    const explicitOff = await bootStardust(browser, server.origin, { newGame: false, params: { newgame: '0' } });
    try {
      const a = await menuFingerprint(plain.page);
      const b = await menuFingerprint(explicitOff.page);
      assert(a.length > 5, `the menu should have its usual controls, found ${a.length}`);
      for (const id of TODAY_MENU_IDS) assert(a.some(item => item.id === id), `today's hangar lost #${id}`);
      assert.deepEqual(b, a, 'an explicit newgame=0 must not change the menu');
      for (const { page } of [plain, explicitOff]) {
        const traces = await newGameTraces(page);
        assert.deepEqual(traces.elements, [], 'no new-game element may exist with the flag off');
        assert.notEqual(traces.flagInStorage, '1', 'the stored flag must be cleared when off');
        assert.equal(await page.locator('#starmap-canvas').count(), 1, 'today\'s flight canvas is present');
      }
      assert.deepEqual(plain.errors.filter(e => !/api\.donavencrenshaw|ERR_FAILED|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await plain.context.close(); await explicitOff.context.close();
    }
  });

  // EXAMPLE for core/quests (pattern only; enable when the flag does something):
  // await test('flag on: the new game replaces the hangar', async () => {
  //   const { page, context } = await bootStardust(browser, server.origin, { newGame: true });
  //   try { assert.equal((await newGameTraces(page)).elements.length > 0, true); } finally { await context.close(); }
  // });
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
