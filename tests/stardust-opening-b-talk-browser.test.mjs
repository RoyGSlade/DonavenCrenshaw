// Opening B, outcome 1 in a real browser: a talk never locks the player in place.
// STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 400 node --test tests/stardust-opening-b-talk-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, SIZES, skip, boot, state, walk, toLine, freeSpotAt, placeAt, settle, PROOF } from '../scripts/stardust-opening-b-kit.mjs';

for (const [size, profile] of SIZES) {
  test(`talk (${size}): the player walks while a line is up, walking off pauses it with a bark, stepping back resumes it`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      // The captain's briefing is open (a lone Go on plus Later). The floor is free.
      await page.waitForFunction(() => document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length >= 1, null, { timeout: 15000 });
      let s = await state(page);
      assert.equal(s.dlgOpen, true);
      assert.equal(s.held, false, 'a talk does not hold the floor');
      assert.equal(s.talkingTo, 'tull', 'the speaker has a talk ring');
      // 1. Walk with real keys while the talk is up.
      const near = await freeSpotAt(page, 'tull', 2);
      assert.ok(near, 'a free spot near Tull');
      await placeAt(page, near);
      await settle(page, 300);
      let a, b;
      for (const k of ['KeyD', 'KeyA', 'KeyS', 'KeyW']) { ({ a, b } = await walk(page, [k], 500)); if (Math.hypot(b.x - a.x, b.y - a.y) > 15) break; }
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 15, `the player moved while the talk was up (${a.x},${a.y} -> ${b.x},${b.y})`);
      assert.equal((await state(page)).dlgOpen, true, 'the box is still up');
      // 2. Walk off: the talk pauses, the box says why, Tull barks over his head.
      const far = await freeSpotAt(page, "tull", 7.2);
      assert.ok(far, 'a free spot six tiles off');
      await placeAt(page, far);
      await page.waitForFunction(() => document.querySelector('#hg-dialogue').classList.contains('is-paused'), null, { timeout: 4000 });
      s = await state(page);
      assert.ok(s.bubbles.some((x) => x.id === 'tull' && x.text.length > 3), `Tull barks: ${JSON.stringify(s.bubbles)}`);
      assert.equal(await page.locator('#hg-dialogue .ui-dlg-hint').isVisible(), true, 'the hint shows');
      if (PROOF) { await settle(page, 400); await page.screenshot({ path: `${PROOF}/talk-paused-bark-${size}.png` }); }
      // 3. Step back: it resumes.
      await placeAt(page, near);
      await page.waitForFunction(() => !document.querySelector('#hg-dialogue').classList.contains('is-paused'), null, { timeout: 4000 });
      assert.equal((await state(page)).held, false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`talk (${size}): choices stay tappable while the player keeps moving`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await toLine(page, 'Sign here');
      await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /Where is this gym/.test(b.textContent)), null, { timeout: 8000 });
      const near = await freeSpotAt(page, 'tull', 2);
      await placeAt(page, near);
      const before = (await state(page)).node;
      await page.keyboard.down('KeyD');
      await settle(page, 250);
      // Tap the answer with a key still held (a phone's thumb would be on the stick: the same DOM tap).
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Where is this gym' }).click({ timeout: 3000 });
      await settle(page, 700);
      await page.keyboard.up('KeyD');
      const after = await state(page);
      assert.notEqual(after.node, before, `the answer was taken while walking (${before} -> ${after.node})`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}

test('talk (desktop): number keys answer, and a bark shows over a person as you pass', { skip, timeout: 240000 }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const { context, page, errors } = await boot(browser, server.origin, SIZES[0][1]);
  try {
    await toLine(page, 'Sign here');
    await page.waitForFunction(() => document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length >= 3, null, { timeout: 8000 });
    const before = (await state(page)).node;
    await page.keyboard.press('Digit1');
    await settle(page, 800);
    assert.notEqual((await state(page)).node, before, 'the 1 key took the first answer');
    // Let the scene's talk end, then pass Tull: a bark.
    await page.waitForFunction(() => document.querySelector('#hg-dialogue').hidden || document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length === 0, null, { timeout: 20000 }).catch(() => {});
    const bark = await page.evaluate(async () => {
      const w = window.__stardust.onfoot.world; const r = window.__stardust.talkRange;
      const n = w.npcsHere().find((x) => ['tull', 'nessa', 'reck', 'pip'].includes(x.id));
      if (!n) return 'no one here';
      w.place(n.x + 60, n.y);
      for (let i = 0; i < 160; i++) { await new Promise((r) => setTimeout(r, 100)); if (w.stage.bubbles().length) break; }
      return w.stage.bubbles();
    });
    assert.ok(Array.isArray(bark) && bark.length >= 1, `a bark showed: ${JSON.stringify(bark)}`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); server.close(); }
});

const watchEnds = (page) => page.evaluate(() => { window.__ends = []; window.__stardust.bus.on('talk:end', (d) => window.__ends.push({ speaker: d.speaker, why: d.why, node: Object.values(window.__stardust.store.get().quests.active || {})[0]?.node })); });
const walkOffFor = async (page, who) => {
  // Far enough, then wait for the talk to end (far away, or 14 s paused).
  const far = (await freeSpotAt(page, who, 10.8)) || (await freeSpotAt(page, who, 7.2));
  await placeAt(page, far);
  await page.waitForFunction(() => window.__ends.length > 0, null, { timeout: 40000 });
};

for (const [size, profile] of SIZES) {
  test(`talk (${size}): (a) walking off from a lone Go on carries the scene on by itself, at the moment the talk ends`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'brief' && document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length === 2, null, { timeout: 15000 });
      await watchEnds(page);
      await placeAt(page, await freeSpotAt(page, 'tull', 2));
      await settle(page, 400);
      await walkOffFor(page, 'tull');
      const ended = await page.evaluate(() => window.__ends[0]);
      assert.equal(ended.node, 'brief', 'the talk ended while the scene was still on the lone Go on line');
      // The line's own timer was frozen while paused, so only the walk-off can have moved it on.
      await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node !== 'brief', null, { timeout: 1500 });
      assert.equal((await state(page)).node, 'brief-2', 'it carried on to the next beat with no Continue');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`talk (${size}): (b) walking off from a real choice leaves the scene waiting; coming back resumes the talk with the same choice up`, { skip, timeout: 240000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await toLine(page, 'Sign here');
      await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'brief-2' && document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length >= 3, null, { timeout: 15000 });
      const before = (await state(page)).choices;
      await watchEnds(page);
      await placeAt(page, await freeSpotAt(page, 'tull', 2));
      await settle(page, 400);
      await walkOffFor(page, 'tull');
      await settle(page, 1500);
      let s = await state(page);
      assert.equal(s.node, 'brief-2', 'the scene waits on the same beat (a real choice is not taken for you)');
      assert.equal(s.dlgOpen, false, 'the box went with the speaker');
      // Come back: it picks up by itself, same choices.
      await placeAt(page, await freeSpotAt(page, 'tull', 2));
      await page.waitForFunction(() => !document.querySelector('#hg-dialogue').hidden && document.querySelectorAll('#hg-dialogue .ui-dlg-choice').length >= 3, null, { timeout: 8000 });
      s = await state(page);
      assert.equal(s.node, 'brief-2', 'still the same beat');
      assert.deepEqual(s.choices, before, 'the same choice is still up');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
