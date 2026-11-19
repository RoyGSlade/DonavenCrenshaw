// The integration station walk: in the REAL workbench page (?newgame=1&start=workbench), at 1440x900 and 390x844, every station and every
// mini-game view opens on the shared full-screen helper (workbench/fullScreen.js): the overlay covers the whole screen, the page does not
// scroll sideways, the Leave button is in thumb reach and big enough, the action buttons are on screen, and Leave closes it with no XP.
// It does not play the games to the end (each lane's own browser test does that); it proves where they open and that they all open.
// Opt-in, one at a time, under the browser lock:
//   PROOF_DIR=<dir> STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-integration-walk-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';

async function bootRoom(page, origin) {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; }); // the d20 lands on 14
}
async function use(page, id) {
  await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
    const it = m.interacts.find((i) => i.id === id);
    if (!it) throw new Error(`no ${id}`);
    let dx = m.w / 2 - it.x, dy = m.h / 2 - it.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    for (const [ux, uy] of [[dx, dy], [0, 1], [0, -1], [-1, 0], [1, 0]]) for (const k of [1.1, 1.0, 1.25, 0.9, 1.4]) { const x = it.x + ux * T * k, y = it.y + uy * T * k; if (walkable(m, x, y, 12) && Math.hypot(x - it.x, y - it.y) < it.reach - 4) { w.place(x, y, Math.atan2(it.y - y, it.x - x)); return; } }
    throw new Error(`no standing spot at ${id}`);
  }, id);
  await page.waitForTimeout(260);
  await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
}

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`station walk, ${name}`, { skip, timeout: 560000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const tap = (sel) => (phone ? page.tap(sel) : page.click(sel));
    const VW = profile.viewport.width, VH = profile.viewport.height;
    const shot = async (n) => { await page.waitForTimeout(500); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };

    /** The overlay is the whole screen, nothing scrolls sideways, and a Leave button in reach is on screen. Returns what it measured. */
    const checkFull = async (label, { leaveSel = '.wb-leave, .pr-leave, .ga-leave' } = {}) => {
      await page.waitForSelector('.wb-full .rp-panel', { timeout: 15000 });
      await page.waitForTimeout(400);
      const m = await page.evaluate((leaveSel) => {
        const r = document.querySelector('.wb-full').getBoundingClientRect();
        const l = document.querySelector(`.wb-full ${leaveSel.split(',').map((s) => s.trim()).join(', .wb-full ')}`)?.getBoundingClientRect();
        const btns = [...document.querySelectorAll('.wb-full button:not([hidden])')].filter((b) => b.offsetParent && !b.closest('[hidden]')).map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 24), x0: q.left, x1: q.right, y0: q.top, y1: q.bottom, h: q.height }; });
        return { full: [r.width, r.height], sw: document.documentElement.scrollWidth, iw: innerWidth, leave: l ? { x0: l.left, x1: l.right, y0: l.top, y1: l.bottom, h: l.height } : null, btns, sheetShown: !document.getElementById('hg-minigame').hidden };
      }, leaveSel);
      assert.deepEqual(m.full, [VW, VH], `${label}: the game owns the whole screen`);
      assert.equal(m.sw, m.iw, `${label}: no sideways scroll`);
      assert.equal(m.sheetShown, false, `${label}: the side sheet is not showing behind it`);
      assert.ok(m.leave, `${label}: a Leave button`);
      assert.ok(m.leave.h >= 40 && m.leave.x0 >= 0 && m.leave.x1 <= VW && m.leave.y0 >= 0 && m.leave.y1 <= VH, `${label}: Leave is a real target on screen (${JSON.stringify(m.leave)})`);
      for (const b of m.btns) assert.ok(b.x0 >= -1 && b.x1 <= VW + 1, `${label}: button "${b.t}" is inside the screen width (${Math.round(b.x0)}..${Math.round(b.x1)})`);
      return m;
    };
    const leave = async (sel = '.wb-leave') => { await tap(`.wb-full ${sel}`); await page.waitForSelector('.wb-full', { state: 'detached', timeout: 10000 }); await page.waitForTimeout(250); };
    const roll = async () => { await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); };
    const xpBefore = () => page.evaluate(() => JSON.stringify(window.__stardust.workbench.state.progress.xp));
    const sub = (title, fn) => t.test(title, fn);

    try {
      await bootRoom(page, server.origin);

      await sub('repair, hack, pilot, stealth grid, persuade, intimidate, haggle, heat and shape open full screen', async () => {
        for (const [id, pre] of [['repair'], ['hack', '.wb-w[data-where="foot"]'], ['pilot'], ['stealth'], ['persuade'], ['intimidate'], ['haggle'], ['craft', '.wb-c[data-craft="heat"]']]) {
          const xp = await xpBefore();
          await use(page, `wb-${id}`);
          if (pre) { await page.waitForSelector(pre); await tap(pre); }
          await roll();
          await checkFull(id);
          await shot(`walk-${id}`);
          await leave();
          assert.equal(await xpBefore(), xp, `${id}: leaving pays nothing`);
        }
      });

      await sub('the crafting chain: Cut, Screw and Bolt plate', async () => {
        for (const id of ['cut', 'screw', 'bolt-plate']) {
          await use(page, 'wb-craft');
          await page.waitForSelector(`.wb-c[data-craft="${id}"]`); await tap(`.wb-c[data-craft="${id}"]`);
          await roll();
          await checkFull(id);
          await shot(`walk-${id}`);
          await leave();
        }
      });

      await sub('navigation: Perihelion from the table (its own top bar and Leave)', async () => {
        await use(page, 'wb-nav');
        await roll();
        await checkFull('nav', { leaveSel: '.pr-leave' });
        await shot('walk-nav');
        await leave('.pr-leave');
      });

      await sub('the practice lock', async () => {
        await use(page, 'wb-lock');
        await checkFull('practice');
        await shot('walk-practice');
        await leave();
      });

      await sub('the trainer: the gallery and a Perihelion sector open full screen from the gym', async () => {
        await page.evaluate(() => { const w = __stardust.workbench, s = JSON.parse(JSON.stringify(w.state)); s.credits = 500; w.state = s; });
        await use(page, 'wb-gym');
        await page.waitForSelector('#hg-minigame:not([hidden]) .tr-root');
        await shot('walk-trainer');
        await tap('.tr-start');
        await page.waitForSelector('.wb-full .ga-panel .ga-begin');
        await checkFull('gallery', { leaveSel: '.ga-leave' });
        await shot('walk-gallery');
        await leave('.ga-leave');
        await page.waitForSelector('#hg-minigame:not([hidden]) .tr-root');
        await tap('.tr-skill[data-skill="navigation"]');
        await page.waitForSelector('.tr-sector, .tr-root[data-skill="navigation"]');
        const sector = page.locator('.tr-sector button, .tr-sector-go, [data-sector]').first();
        if (await sector.count()) {
          await (phone ? sector.tap() : sector.click());
          await checkFull('perihelion trainer', { leaveSel: '.pr-leave' });
          await shot('walk-perihelion-trainer');
          await leave('.pr-leave');
        }
        await page.evaluate(() => window.__stardust.workbench.closePanel());
        await page.waitForSelector('#hg-minigame', { state: 'hidden' });
      });

      await sub('Pip: the talk and a push into its game', async () => {
        await page.evaluate(() => window.__stardust.workbench.talk('pip'));
        await page.waitForSelector('#wb-talk:not([hidden]) .tk-line');
        await shot('walk-pip-talk');
        const w = await page.evaluate(() => { const r = document.getElementById('wb-talk').getBoundingClientRect(); return { x1: r.right, iw: innerWidth, sw: document.documentElement.scrollWidth }; });
        assert.ok(w.x1 <= w.iw + 1 && w.sw === w.iw, 'the talk fits the screen');
        await page.evaluate(() => document.querySelector('#wb-talk .tk-leave')?.click());
        await page.waitForSelector('#wb-talk', { state: 'detached' });
      });

      await sub('the patrol yard is the whole screen already: the door in the bay south wall leads there and back', async () => {
        const door = await page.evaluate(() => __stardust.onfoot.world.map.doors.map((d) => d.id));
        assert.deepEqual(door, ['to-yard']);
        await page.evaluate(() => __stardust.onfoot.world.go('workbench-yard', 'from-bay'));
        await page.waitForFunction(() => __stardust.onfoot.world.map.id === 'workbench-yard');
        await shot('walk-yard');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
        await page.evaluate(() => __stardust.onfoot.world.go('workbench', 'from-yard'));
        await page.waitForFunction(() => __stardust.onfoot.world.map.id === 'workbench');
      });

      assert.deepEqual(errors.filter((e) => !/Failed to load resource|favicon/i.test(e)), [], 'no page errors');
    } finally { await browser.close(); await server.close(); }
  });
}
