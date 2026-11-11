// The Stardust Studio's play links on the hangar page (STUDIO-SCHEMA.md section 5):
// a quest at a dialogue node, a map at a spawn, a tutorial step. Each plays on a
// throwaway save (studio.stardust.voyage.v1) and never touches the real one.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-studio-links-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub, DESKTOP } from '../scripts/stardust-test-kit.mjs';
import { sleep } from '../scripts/stardust-play-kit.mjs';

const HANGAR = '/projects/Space-Shooter/voyage/';
const REAL = 'stardust.voyage.v1';
const STUDIO = 'studio.stardust.voyage.v1';

test('studio play links open the exact spot on a throwaway save', { skip: !process.env.STARDUST_BROWSER_TEST, timeout: 180000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); });
  const context = await browser.newContext({ ...DESKTOP, viewport: { width: 1440, height: 900 } });
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // A real captain on this device first; the links must leave it alone.
  await page.goto(`${server.origin}${HANGAR}?newgame=1`);
  await page.waitForFunction(() => window.__stardust);
  await page.evaluate(() => { window.__stardust.store.createCharacter({ name: 'Real Captain' }); window.__stardust.store.grant({ money: 123 }); });
  const real = await page.evaluate((k) => localStorage.getItem(k), REAL);
  assert.match(real, /Real Captain/);

  // 1. A quest at a dialogue node.
  await page.goto(`${server.origin}${HANGAR}?newgame=1&studio=1&quest=cold-run&node=intro-advance&seed=7`);
  await page.locator('#hg-sheet[data-open-station="board"]').waitFor();
  await page.locator('#pane-jobs .qs-dialogue').waitFor();
  const run = await page.evaluate(() => window.__stardust.store.get().quests.active['cold-run']);
  assert.equal(run.node, 'intro-advance', 'the job opens at the linked node');
  assert.equal(run.seed, 7);
  assert.match(await page.locator('#vy-sync').innerText(), /throwaway/);

  // 2. A map at a spawn.
  await page.goto(`${server.origin}${HANGAR}?newgame=1&studio=1&map=ship&spawn=helm`);
  await page.waitForFunction(() => document.querySelector('.of-world')?.__world?.map.id === 'ship');
  const at = await page.evaluate(() => { const w = document.querySelector('.of-world').__world; return { x: w.player.x / w.map.tile, y: w.player.y / w.map.tile }; });
  assert.ok(Math.abs(at.x - 7.5) < 1 && Math.abs(at.y - 2.5) < 1, `at the helm spawn (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);

  // 3. A tutorial step (story's start-at-step, earlier rewards in place).
  await page.goto(`${server.origin}${HANGAR}?newgame=1&step=mel`);
  await page.waitForFunction(() => window.__stardust?.store.get().story?.step === 'mel');
  const stepSave = await page.evaluate(() => window.__stardust.store.get());
  assert.ok(stepSave.character, 'a captain to play the step with');
  assert.ok(stepSave.story.unlocks.includes('giver:garrity'), 'the steps before it are done');
  await sleep(300);

  // The real save never moved.
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), REAL), real, 'the real captain is untouched');
  assert.ok(await page.evaluate((k) => localStorage.getItem(k), STUDIO), 'the studio save is its own');
  assert.deepEqual(errors, []);
});
