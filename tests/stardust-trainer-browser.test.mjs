// The trainer in the REAL workbench page (?newgame=1&start=workbench), at 1440x900 and 390x844 (a phone with touch): the gym station opens the
// trainer, shooting trains in a gallery (a bot clicks or taps the targets), crafting, repair and hacking train with a book page and a question,
// a wrong answer pays nothing and points at the line, navigation shows a "coming" slot. Opt-in, under the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/trainer/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-trainer-browser.test.mjs
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
  await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; });
}
async function use(page, id) {
  await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
    const it = m.interacts.find((i) => i.id === id);
    let dx = m.w / 2 - it.x, dy = m.h / 2 - it.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    for (const [ux, uy] of [[dx, dy], [0, 1], [0, -1], [-1, 0], [1, 0]]) for (const k of [1.1, 1.0, 1.25, 0.9, 1.4]) { const x = it.x + ux * T * k, y = it.y + uy * T * k; if (walkable(m, x, y, 12) && Math.hypot(x - it.x, y - it.y) < it.reach - 4) { w.place(x, y); return; } }
    throw new Error(`no standing spot at ${id}`);
  }, id);
  await page.waitForTimeout(260);
  await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__stardust.workbench.state)));

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`trainer, ${name}`, { skip, timeout: 560000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (n) => { await page.waitForTimeout(350); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const tap = (sel) => (phone ? page.tap(sel) : page.click(sel));
    try {
      await bootRoom(page, server.origin);
      // level 6 everywhere, six points of spray in shooting, plenty of credits
      await page.evaluate(() => { const w = __stardust.workbench, s = JSON.parse(JSON.stringify(w.state)); for (const k of Object.keys(s.progress.levels)) s.progress.levels[k] = 6; s.progress.points.shooting = { spray: 6 }; s.credits = 500; w.state = s; });
      await use(page, 'wb-gym');
      await page.waitForSelector('#hg-minigame:not([hidden]) .tr-root');
      assert.equal(await page.locator('.tr-skill').count(), 8, 'a rail of eight skills');
      assert.equal(await page.locator('.tr-root').getAttribute('data-skill'), 'shooting');
      assert.match(await page.locator('.tr-root').getAttribute('style'), /#ff7a59/);
      const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })); assert.equal(sw.sw, sw.iw);
      await shot('t1-trainer-shooting');

      // ---- the gallery
      const before = await state(page);
      await tap('.tr-start');
      await page.waitForSelector('.ga-panel .ga-begin');
      await shot('t2-gallery-intro');
      await tap('.ga-begin');
      let mid = false;
      for (let i = 0; i < 400 && !(await page.locator('.ga-result').count()); i++) {
        const at = await page.evaluate(async () => {
          const p = document.querySelector('.ga-panel'), s = p.__state, g = await import('/projects/Space-Shooter/voyage/minigames/gallery.js');
          if (!g.canShoot(s)) return null;
          const c = s.targets.filter((t) => g.hittable(t, s.t)).sort((a, b) => b.y - a.y)[0];
          if (!c) return null; const q = g.targetAt(c, s.t); return p.__aim(q.x, q.y);
        });
        if (at) { await (phone ? page.touchscreen.tap(at[0], at[1]) : page.mouse.click(at[0], at[1])); }
        if (!mid && (await page.evaluate(() => document.querySelector('.ga-panel')?.__state.hits)) >= 3) { mid = true; await shot('t3-gallery-mid'); }
        await page.waitForTimeout(110);
      }
      await page.waitForSelector('.ga-result');
      const res = await page.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('.ga-panel').__state.result)));
      assert.ok(res.hits >= 8 && res.xp > 0, `the bot hit ${res.hits} and earned ${res.xp}`);
      assert.equal(await page.locator('.ga-result [data-line]').count(), 4, 'a line each for targets, bullseyes, accuracy and time');
      assert.match(await page.locator('.ga-result').innerText(), /Training pays XP, never skill points/);
      await shot('t4-gallery-results');
      await page.waitForTimeout(600); await tap('.ga-result button');
      await page.waitForSelector('.tr-root');
      const after = await state(page);
      assert.equal(after.credits, before.credits - 10, 'the entry fee');
      assert.ok(after.progress.xp.shooting > before.progress.xp.shooting || after.progress.levels.shooting > before.progress.levels.shooting, 'XP paid');
      assert.deepEqual(after.progress.points.shooting, before.progress.points.shooting, 'no skill point is ever paid');
      await shot('t5-trainer-after-gallery');

      // ---- the books
      for (const [skill, look] of [['repair', 'repair'], ['hacking', 'hack'], ['crafting', 'craft']]) {
        await tap(`.tr-skill[data-skill="${skill}"]`);
        await page.waitForSelector(`.bk-book.bk-${look} .bk-choice`);
        assert.equal(await page.locator('.bk-choice').count(), 4);
        assert.equal(await page.locator('.bk-n').count() >= 3, true, 'numbered lines');
        await shot(`t6-book-${skill}`);
        const s0 = await state(page);
        if (skill === 'repair') {
          await tap('.bk-choice:not([data-right])');
          await page.waitForSelector('.bk-out.is-wrong');
          assert.ok(await page.locator('.bk-l.is-ref').count() >= 1, 'the line that held the answer is marked');
          assert.match(await page.locator('.bk-out').innerText(), /Reread line/);
          await shot('t7-book-wrong');
          const s1 = await state(page);
          assert.deepEqual(s1.progress.xp, s0.progress.xp, 'a wrong answer pays nothing');
          await page.waitForTimeout(600); await tap('.bk-next');
          await page.waitForSelector('.bk-choice:not([disabled])');
        }
        const s2 = await state(page);
        const pageId = await page.evaluate(() => document.querySelector('.bk-book h3.bk-title').textContent);
        await tap('.bk-choice[data-right="1"]');
        await page.waitForSelector('.bk-out.is-right');
        const s3 = await state(page);
        assert.ok(s3.progress.xp[skill] > s2.progress.xp[skill] || s3.progress.levels[skill] > s2.progress.levels[skill], `${skill} XP paid for ${pageId}`);
        assert.equal(Object.keys(s3.learned).length, Object.keys(s2.learned).length + 1, 'the page is marked learned');
        assert.deepEqual(s3.progress.points[skill] || {}, s2.progress.points[skill] || {}, 'no skill point');
        await shot(`t8-book-${skill}-right`);
      }

      // ---- navigation has a slot for the Perihelion game
      await tap('.tr-skill[data-skill="navigation"]');
      await page.waitForSelector('.tr-coming');
      assert.match(await page.locator('.tr-coming').innerText(), /COMING/);
      await shot('t9-navigation-coming');
      await page.locator('.wb-pane .gm-row button', { hasText: 'Close' })[phone ? 'tap' : 'click']();
      await page.waitForSelector('#hg-minigame', { state: 'hidden' });
      assert.deepEqual(errors.filter((e) => !/favicon|ERR_FAILED|net::/.test(e)), []);
    } finally { await context.close(); await browser.close(); await server.close(); }
  });
}
