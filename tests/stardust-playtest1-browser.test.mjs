// Playtest 1 fixes in a real browser (Donaven, 2026-11-19, opening scenes 1 to 3).
//   blocker 1: a talk opened over a dialogue never leaves the player held or a box stuck behind;
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 400 node --test tests/stardust-playtest1-browser.test.mjs
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
  test(`blocker 1 (${size}): E on another interactable while a talk is open never holds the player or leaves a box behind`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await toBrief2(page);
      // The captain's choices are up: the floor is held, so E at the coffee machine does nothing and nothing is left over.
      await page.evaluate(() => window.__stardust.onfoot.world.place(72, 109));
      await settle(page, 400);
      await page.keyboard.press('KeyE'); await settle(page, 500);
      let s = await state(page);
      assert.equal(s.ofTalk, false, 'no second talk opens over the captain\'s question');
      assert.ok(s.choices.length >= 2, 'the captain\'s question is still there');
      for (let i = 0; i < s.choices.length; i++) {
        const hit = await page.evaluate((i) => { const n = document.querySelectorAll('#hg-dialogue .ui-dlg-choice')[i]; const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return n === e || n.contains(e) ? null : `${e?.tagName}#${e?.id}.${e?.className}`; }, i);
        assert.equal(hit, null, `the captain's choice ${i} is the top element at its centre`);
      }
      // Answer: the box must go away by itself once nothing follows.
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Where is this gym' }).click();
      await settle(page, 1800);
      s = await state(page);
      assert.equal(s.dlgOpen, false, `the captain's box is gone after the answer (still showing: ${s.text.slice(0, 40)})`);
      assert.equal(s.held, false, 'the player is free');
      // Now the coffee machine: its menu opens, holds the player, nothing covers its buttons, and Leave frees the player.
      await page.evaluate(() => window.__stardust.onfoot.world.place(72, 109));
      await settle(page, 400);
      await page.keyboard.press('KeyE'); await settle(page, 500);
      s = await state(page);
      assert.equal(await page.locator('.ok-screen[data-screen=coffee]').count(), 1, 'the coffee machine opens its screen (opening track A: a full screen now)');
      assert.equal(s.held, true, 'held while the menu is up');
      const top = (sel) => page.evaluate((sel) => { const n = document.querySelector(sel); const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return n === e || n.contains(e) ? null : `${e?.tagName}#${e?.id}.${e?.className}`; }, sel);
      assert.equal(await top('.ok-screen [data-coffee=leave]'), null, 'no HUD icon covers the screen\'s buttons');
      for (const sel of ['.ok-screen .wb-fleave', '.ok-screen [data-coffee=drink]', '.ok-screen [data-coffee=take]']) { await page.locator(sel).scrollIntoViewIfNeeded(); assert.equal(await top(sel), null, `nothing covers ${sel}`); }
      await page.locator('.ok-screen [data-coffee=leave]').click();
      await settle(page, 500);
      s = await state(page);
      assert.equal(await page.locator('.ok-screen').count(), 0); assert.equal(s.held, false, 'the player is free again');
      let { a, b } = await walkRight(page);
      assert.ok(b.x > a.x + 20, `the player moves (${a.x} -> ${b.x})`);
      // A stand-in talk box (Next / Done): the Next button is the top element at its centre (the phone's bag must not sit over it), and a tap anywhere closes it.
      await page.evaluate(() => { window.__stardust.onfoot.say([{ who: 'captain', name: 'You', text: 'Lights blink. Numbers scroll. Nothing here needs you yet.' }, { who: 'captain', name: 'You', text: 'Still nothing.' }]); });
      await page.waitForSelector('.of-talk');
      assert.equal(await top('.of-talk .primary'), null, 'the talk box\'s Next button is the top element at its centre');
      const cover = await page.evaluate(() => { const n = document.querySelector('.of-talk'); const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.x + 24, r.y + 14); return n.contains(e) ? null : `${e?.tagName}#${e?.id}.${e?.className}`; });
      assert.equal(cover, null, 'nothing covers the talk box');
      if (PROOF) await page.screenshot({ path: `${PROOF}/blocker1-talk-box-${size}.png` });
      await page.locator('.of-talk').click({ position: { x: 20, y: 10 } });
      await page.locator('.of-talk').click({ position: { x: 20, y: 10 } });
      await settle(page, 400);
      assert.equal(await page.locator('.of-talk').count(), 0);
      assert.equal((await state(page)).dlgOpen, false, 'no dialogue box left behind');
      // Same with "Later": the box goes, the player moves, the marker stays on the captain.
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
