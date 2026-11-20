// Opening track A in a real browser, desktop and phone: the crew walk through doors and answer when you talk, the opening is sealed on
// every exit with a reason, the tracker has no Continue and a scene you said "Later" to picks itself up, and the four object screens.
// STARDUST_BROWSER_TEST=1 [PROOF_DIR=<dir>] flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-opening-a-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';
import { FALLBACK } from '../projects/Space-Shooter/voyage/slice/fallbackLines.js';
import { WHY } from '../projects/Space-Shooter/voyage/slice/seal.js';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const SIZES = [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];
const settle = (page, ms = 500) => page.waitForTimeout(ms);
const shot = async (page, name, size) => { if (PROOF) { await settle(page, 400); await page.screenshot({ path: `${PROOF}/a-${name}-${size}.png` }); } };

async function boot(browser, origin, profile, seed = null) {
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
const where = (page) => page.evaluate(() => { const w = window.__stardust.onfoot.world; return { map: w.map.id, pos: w.position() }; });
const go = async (page, map, spawn = 'default') => { await page.evaluate(([m, s]) => window.__stardust.onfoot.world.go(m, s), [map, spawn]); await page.waitForFunction((m) => window.__stardust.onfoot.world.map.id === m, map); await settle(page, 500); };
const placeBy = (page, prop, dx = 0, dy = 0) => page.evaluate(([prop, dx, dy]) => { const w = window.__stardust.onfoot.world; const p = w.map.props.find((q) => q.name === prop || q.interact?.id === prop); w.place(p.cx + dx, p.cy + dy, 0); return { x: p.cx, y: p.cy, w: p.w, h: p.h }; }, [prop, dx, dy]);
const toastText = (page) => page.evaluate(() => `${document.querySelector('.of-toast')?.textContent || ''} ${document.querySelector('.vy-toast')?.textContent || ''}`);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const [size, profile] of SIZES) {
  test(`world (${size}): the crew walk through doors, answer when asked, the opening is sealed, and nothing waits on a Continue button`, { skip, timeout: 420000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      // ---- the start: Tull is in the mess, Nessa is not; the tracker has no Continue
      let s = await where(page);
      assert.equal(s.map, 'duchess-mess');
      assert.ok(await page.evaluate(() => window.__stardust.onfoot.world.npcAt('tull')), 'Tull is in the mess');
      assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.npcAt('nessa')), null, 'Nessa is not in the mess');
      await page.waitForSelector('#hg-dialogue:not([hidden]) .ui-dlg-choice', { timeout: 15000 });
      await shot(page, 'brief', size);
      assert.equal(await page.locator('#dp-continue').count(), 0, 'no Continue the job in the opening');
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click();
      await settle(page, 1200);
      assert.equal(await page.locator('#dp-continue').count(), 0, 'still no Continue after Later');
      assert.match(await page.locator('#hg-objective').innerText(), /Get the job from Tull/);

      // ---- a scene you stepped away from picks itself up when you walk back to its marker
      const tull = await page.evaluate(() => window.__stardust.onfoot.world.npcAt('tull'));
      await page.evaluate(() => window.__stardust.onfoot.world.place(110, 420));
      await settle(page, 900);
      assert.equal(await page.locator('#hg-dialogue:not([hidden])').count(), 0, 'far from Tull the box stays shut');
      await page.evaluate(({ x, y }) => window.__stardust.onfoot.world.place(x - 70, y + 20), tull);
      await page.waitForSelector('#hg-dialogue:not([hidden]) .ui-dlg-choice', { timeout: 25000 }); /* the stage direction reads first */
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click();
      await settle(page, 800);

      // ---- every NPC answers: Nessa has nothing scripted here, so she says something short and in character
      await go(page, 'duchess-holodeck', 'from-corridor');
      const nessa = await page.evaluate(() => window.__stardust.onfoot.world.npcAt('nessa'));
      assert.ok(nessa, 'Nessa is in the holodeck');
      await page.evaluate(({ x, y }) => window.__stardust.onfoot.world.place(x - 40, y + 30, -0.6), nessa);
      await settle(page, 500);
      const heard = [];
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
        await page.waitForSelector('.of-talk', { timeout: 4000 });
        heard.push(await page.locator('.of-talk-text').innerText());
        if (i === 0) await shot(page, 'busy-line', size);
        await page.locator('.of-talk button').click();
        await settle(page, 500);
      }
      assert.ok(heard.every((t) => FALLBACK.nessa.janitor.includes(t)), `a janitor line from Nessa (${JSON.stringify(heard)})`);
      assert.notEqual(heard[0], heard[1], 'she does not repeat herself');
      assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.held), false, 'you are free after');

      // ---- Tull walks to you: he is not in the holodeck until he has come through its door
      await page.evaluate(() => { const p = window.__stardust.presence; p.ledger.settle('tull', 'duchess-mess'); p.ledger.send('tull', 'duchess-holodeck'); });
      let first = null, last = null, sawBefore = 0;
      for (let i = 0; i < 80; i++) {
        await page.evaluate(() => window.__stardust.presence.hooks.tick(0.4));
        await settle(page, 90);
        const r = await page.evaluate(() => { const p = window.__stardust.presence, w = window.__stardust.onfoot.world; return { room: p.ledger.room('tull'), at: w.npcAt('tull') }; });
        const at = r.at;
        if (r.room !== 'duchess-holodeck') { if (r.room === 'duchess-corridor' && at) { /* between reads the walk may have just ended: only a person NOT in the ledger's room is wrong, checked again */ const again = await page.evaluate(() => window.__stardust.presence.ledger.room('tull')); assert.ok(again === 'duchess-holodeck' || !at, `Tull is not drawn in the holodeck while he is in ${r.room}`); } else assert.equal(at, null, `Tull is not drawn in the holodeck while he is in ${r.room}`); sawBefore++; }
        else { if (!first && at) first = at; if (at) last = at; if (at && !at.moving) break; }
      }
      assert.ok(sawBefore > 5, 'he spent a while elsewhere first');
      assert.ok(first, 'he walked in');
      assert.ok(Math.hypot(first.x - 8.5 * 48, first.y - 1.5 * 48) < 140, `first seen at the door (${JSON.stringify(first)})`);
      assert.ok(first.moving, 'walking in');
      await shot(page, 'captain-walks-in', size);
      assert.ok(Math.hypot(last.x - 6.5 * 48, last.y - 7.5 * 48) < 60, 'he ends on his spot in the room');

      // ---- the opening is sealed: the helm, the cargo ramp, the pad's door, the links to the old game
      await go(page, 'duchess-bridge');
      await placeBy(page, 'helm', 62, 0);
      await settle(page, 500);
      assert.match(await page.locator('.of-prompt').innerText(), /Tull's orders/, 'the prompt says why');
      await shot(page, 'sealed-helm', size);
      await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
      await settle(page, 400);
      assert.equal(await page.locator('.of-helm').count(), 0, 'the course list never opens');
      assert.match(await toastText(page), new RegExp(WHY.helm.slice(0, 20)));
      assert.equal((await where(page)).map, 'duchess-bridge');
      await go(page, 'duchess-cargo');
      await page.evaluate(() => { const w = window.__stardust.onfoot.world; const d = w.map.doors.find((x) => x.id === 'ramp'); w.place(d.x + d.w / 2, d.y + 6, 1.57); });
      await settle(page, 1000);
      assert.equal((await where(page)).map, 'duchess-cargo', 'the ramp does not let you off');
      await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
      await settle(page, 300);
      assert.match(await toastText(page), /Tull's orders: nobody leaves the ship/);
      await shot(page, 'sealed-ramp', size);
      await go(page, 'duchess-pad');
      await page.evaluate(() => { const w = window.__stardust.onfoot.world; const d = w.map.doors.find((x) => x.id === 'hangar'); if (d) w.place(d.x + d.w / 2, d.y + 6, 1.57); });
      await settle(page, 1000);
      assert.equal((await where(page)).map, 'duchess-pad', 'the berth door stays shut');
      const url = page.url();
      await page.locator('#vy-back').click({ force: true });
      await settle(page, 400);
      assert.equal(page.url(), url, 'the classic link goes nowhere');
      assert.match(await toastText(page), /Tull's orders/);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.dp-pause', { timeout: 3000 });
      await page.locator('.dp-pause-link').click();
      await settle(page, 400);
      assert.equal(page.url(), url, 'the pause sheet link goes nowhere');
      await page.keyboard.press('Escape');
      await settle(page, 300);
      // and it opens when the opening is over
      await page.evaluate(() => window.__stardust.store.update((s) => ({ ...s, flags: { ...s.flags, 'day-five-over': 1 } })));
      await go(page, 'duchess-bridge');
      await placeBy(page, 'helm', 62, 0);
      await settle(page, 400);
      await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
      await settle(page, 500);
      assert.equal(await page.locator('.of-helm').count(), 1, 'the helm works once the opening is over');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`doors (${size}): Nessa and Pip walking out through the holodeck door never keep the player waiting`, { skip, timeout: 180000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click({ timeout: 15000 });
      await settle(page, 600);
      // The same crossing twice in one page (so a slow machine slows both the same): alone, then with both crew walking through the door.
      const cross = async (withCrew) => {
        await go(page, 'duchess-holodeck');
        await page.evaluate((withCrew) => {
          const p = window.__stardust.presence, w = window.__stardust.onfoot.world;
          p.ledger.settle('nessa', 'duchess-holodeck'); p.ledger.settle('pip', 'duchess-holodeck');
          if (withCrew) { p.ledger.send('nessa', 'duchess-bridge'); p.ledger.send('pip', 'duchess-bridge'); }
          else { p.ledger.settle('nessa', 'duchess-mess'); p.ledger.settle('pip', 'duchess-mess'); }
          const e = w.doors.entries[0];
          w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2);
        }, withCrew);
        if (withCrew) await shot(page, 'door-shared', size);
        /* time it inside the page, so round trips do not count */
        return page.evaluate(() => new Promise((resolve) => { const w = window.__stardust.onfoot.world, t0 = performance.now(); const id = setInterval(() => { window.__stardust.presence.hooks.tick(0.02); if (w.map.id !== 'duchess-holodeck') { clearInterval(id); resolve((performance.now() - t0) / 1000); } else if (performance.now() - t0 > 12000) { clearInterval(id); resolve(null); } }, 20); }));
      };
      const alone = await cross(false);
      const crowded = await cross(true);
      assert.ok(alone != null && crowded != null, `both crossings finished (${alone}, ${crowded})`);
      assert.ok(crowded - alone <= 1, `the crew in the door cost the player ${(crowded - alone).toFixed(2)} s (${crowded.toFixed(2)} s against ${alone.toFixed(2)} s alone)`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`screens (${size}): the drinks machine, the engine core, the gun feed and the nav console open full screen and read the game`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Later' }).click({ timeout: 15000 });
      await settle(page, 800);
      const open = async (map, prop, dx, dy, screen) => {
        await go(page, map);
        await placeBy(page, prop, dx, dy);
        await settle(page, 400);
        await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
        await page.waitForSelector(`.ok-screen[data-screen=${screen}]`, { timeout: 4000 });
        await settle(page, 600);
        assert.ok(await noSideScroll(page), `${screen}: no sideways scroll`);
        const r = await page.evaluate(() => { const l = document.querySelector('.ok-screen .wb-fleave').getBoundingClientRect(); const top = document.elementFromPoint(l.left + l.width / 2, l.top + l.height / 2); return { x: l.right, y: l.top, w: l.width, h: l.height, vw: innerWidth, hit: Boolean(top?.closest('.wb-fleave')) }; });
        assert.ok(r.hit && r.h >= 40 && r.y < 90 && r.vw - r.x < 60, `${screen}: Leave sits in the top corner and can be tapped (${JSON.stringify(r)})`);
        const btn = await page.evaluate(() => { const b = document.querySelector('.ok-screen .ok-btn'); if (!b) return null; const c = getComputedStyle(b); return { tap: c.webkitTapHighlightColor, shadow: c.boxShadow, h: b.getBoundingClientRect().height, border: c.borderImageSource }; });
        if (btn) { assert.match(btn.tap, /rgba\(0, 0, 0, 0\)|transparent/, `${screen}: no tap highlight`); assert.equal(btn.shadow, 'none'); assert.ok(btn.h >= 44); assert.equal(btn.border, 'none'); }
      };
      const leave = async () => { await page.locator('.ok-screen .wb-fleave').click(); await settle(page, 400); assert.equal(await page.locator('.ok-screen').count(), 0); assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.held), false); };

      // the drinks machine: tea too
      await open('duchess-mess', 'coffee-machine', 0, 60, 'coffee');
      await page.locator('.ok-screen [data-tea=take]').click();
      assert.equal(await page.evaluate(() => window.__stardust.store.get().items.tea || 0), 1);
      await page.locator('.ok-screen [data-tea=drink]').click();
      await settle(page, 300);
      await shot(page, 'screen-coffee', size);
      assert.ok(await page.evaluate(() => window.__stardust.statuses.has('steady')));
      await leave();
      await settle(page, 700);
      assert.equal(await page.locator('.hg-st[data-status=steady] .hg-st-bar i').count(), 1, 'Steady is a word and a bar');

      // the engine core: bars, and what is wrong follows the story
      await open('duchess-engine', 'reactor', 0, 70, 'engine');
      assert.equal(await page.locator('.ok-screen [data-bar]').count(), 3);
      assert.equal(await page.locator('.ok-screen [data-issue]').count(), 0);
      await page.evaluate(() => window.__stardust.store.update((s) => ({ ...s, flags: { ...s.flags, 'coolant-leaking': 1 } })));
      await page.waitForSelector('.ok-screen [data-issue=coolant]', { timeout: 3000 });
      await shot(page, 'screen-engine', size);
      await leave();

      // the gun feed: a janitor is not on the roster (locked, with the reason); a gunner may set the tracking
      await open('duchess-bridge', 'gunner-seat', 0, -62, 'guns');
      assert.match(await page.locator('.ok-screen .ok-lock-why').innerText(), /Gunner roster only/);
      await shot(page, 'screen-guns', size);
      await leave();
      await page.evaluate(() => window.__stardust.store.update((s) => ({ ...s, quests: { ...s.quests, done: { ...s.quests.done, 'the-eighth-gunner': { result: 'success', outcome: 'hired-fair' } } } })));
      await open('duchess-bridge', 'gunner-seat', 0, -62, 'guns');
      await page.locator('.ok-screen [data-seg=tracking] [data-value=auto]').click();
      assert.equal(await page.evaluate(() => window.__stardust.store.get().flags['duchess-guns-auto']), 1, 'the choice is saved');
      assert.ok(await page.locator('.ok-screen [data-gun=turret] [data-bar]').count());
      await shot(page, 'screen-guns-gunner', size);
      await leave();

      // the nav console: the star map, and Plot a course is locked with its reason
      await open('duchess-bridge', 'nav-console', 0, 60, 'nav');
      assert.ok(await page.locator('.ok-screen svg.ok-map').count());
      assert.equal(await page.locator('.ok-screen [data-place]').count(), 3);
      assert.match(await page.locator('.ok-screen [data-nav=plot]').evaluate((b) => b.className), /is-locked/);
      assert.match(await page.locator('.ok-screen .ok-lock-why').innerText(), /Pilot's console: authorised crew only/);
      await shot(page, 'screen-nav', size);
      await leave();
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
