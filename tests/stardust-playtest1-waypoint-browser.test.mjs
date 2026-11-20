// Playtest 1 fixes in a real browser (Donaven, 2026-11-19, opening scenes 1 to 3).
//   blocker 2: the waypoint follows the objective through the scene 1 doors and never sits on a person with nothing to say.
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 400 node --test tests/stardust-playtest1-waypoint-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const SIZES = [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];

async function boot(browser, origin, profile) {
  const context = await browser.newContext({ ...profile, reducedMotion: 'reduce' });
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1`);
  await page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await settle(page, 2000);
  return { context, page, errors };
}
const state = (page) => page.evaluate(() => {
  const w = window.__stardust.onfoot.world, d = document.querySelector('#hg-dialogue');
  const run = Object.values(window.__stardust.store.get().quests.active || {})[0];
  const a = w.objectiveAim();
  return { map: w.map.id, held: w.held, dlgOpen: !d.hidden, choices: [...d.querySelectorAll('.ui-dlg-choice')].map((b) => b.textContent), text: d.innerText, ofTalk: Boolean(document.querySelector('.of-talk')), node: run?.node || null, aim: a && { x: a.x, y: a.y, npc: a.npc || null, door: a.door || null, label: a.label || null }, pos: w.position() };
});
const toBrief2 = async (page) => {
  for (let i = 0; i < 12; i++) {
    if ((await state(page)).text.includes('Sign here')) return;
    const go = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Go on' });
    if (await go.count()) await go.click();
    await settle(page, 600);
  }
  throw new Error('never reached the captain\'s second line');
};
// Walk through the doors toward a room the way the player does: stand in the door (a link door is a two-door entry; step into its vestibule).
const hopToward = (page, room) => page.evaluate(async (room) => {
  const { doorToward } = await import('/projects/Space-Shooter/voyage/datapad/route.js');
  const { MAP_DEFS } = await import('/projects/Space-Shooter/voyage/maps/index.js');
  const w = window.__stardust.onfoot.world;
  if (w.map.id === room) return null;
  const id = doorToward(w.map.id, [room], MAP_DEFS);
  const e = w.doors.entries.find((x) => x.room === id);
  const d = w.map.doors.find((x) => x.id === id);
  if (e) w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2); else w.place(d.x + d.w / 2, d.y + d.h / 2);
  return id;
}, room);
const walkRight = async (page, ms = 600) => { const a = (await state(page)).pos; await page.keyboard.down('KeyD'); await settle(page, ms); await page.keyboard.up('KeyD'); return { a, b: (await state(page)).pos }; };

for (const [size, profile] of SIZES) {
  test(`blocker 2 (${size}): the waypoint follows scene 1 by doors, and the captain still talks after "Later"`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await toBrief2(page);
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click();
      await settle(page, 1500);
      let s = await state(page);
      assert.equal(s.dlgOpen, false, 'Later closes the box');
      assert.equal(s.node, 'brief-2');
      assert.equal(s.aim.npc, 'tull', 'the marker waits on the captain');
      // Talk to him: he picks the scene back up (he used to say nothing at all).
      await page.evaluate(({ x, y }) => window.__stardust.onfoot.world.place(x - 30, y + 24), s.aim);
      await settle(page, 400);
      await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
      await settle(page, 1800);
      s = await state(page);
      assert.ok(s.choices.some((c) => c.includes('Where is this gym')), `the captain's question is back (${JSON.stringify(s.choices)})`);
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Where is this gym' }).click();
      await settle(page, 1500);
      // The route: mess -> corridor -> holodeck. At every stop the marker is on the way to the objective, never on the captain.
      const seen = [];
      for (let hop = 0; hop < 6; hop++) {
        s = await state(page);
        seen.push({ map: s.map, node: s.node, aim: s.aim });
        assert.ok(s.aim, `${s.map}: the marker exists`);
        assert.notEqual(s.aim.npc, 'tull', `${s.map}: the marker is not on the captain (he has nothing left to say)`);
        if (s.map === 'duchess-holodeck') break;
        const door = await hopToward(page, 'duchess-holodeck');
        assert.ok(door, `a door toward the holodeck from ${s.map}`);
        await settle(page, 3400);
        const after = await state(page);
        assert.notEqual(after.map, s.map, `went through ${door}`);
        assert.ok(after.aim, `${after.map}: the marker moved on with the player`);
      }
      s = await state(page);
      assert.equal(s.map, 'duchess-holodeck');
      assert.ok(seen.length >= 2);
      assert.ok(s.aim.npc === 'nessa' || s.aim.label, 'in the holodeck the marker is on the crew (Nessa) or the gym');
      if (PROOF) await page.screenshot({ path: `${PROOF}/blocker2-holodeck-${size}.png` });
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
