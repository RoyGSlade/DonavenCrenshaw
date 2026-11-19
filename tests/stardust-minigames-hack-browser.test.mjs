// Hacking v2 (mirrors, a portal, firewalls) in a real browser: set up from the address, a mirror selected by click and rotated by
// holding it, the dashed beam previewed, the portal caught in its window, the projectile fired, a firewall broken; out of time resets the
// board on the same seed; failing every retry shows the world answer for each context. Phone: touch, 44px boxes, no sideways scroll.
// Screenshots go to PROOF_DIR when it is set.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-hack-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const URL_Q = '?newgame=1&mini=hack&roll=9&dc=12&level=6&lock=2&time=1&size=2&retries=3&seed=4';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) { await page.evaluate(() => document.querySelector('.mh-panel')?.scrollIntoView({ block: 'start' })); await page.waitForTimeout(250); await page.screenshot({ path: `${PROOF}/${name}.png` }); } };
const st = (page, expr) => page.evaluate((e) => new Function('s', `return ${e}`)(document.querySelector('.mh-panel').__state), expr);

test('hacking v2 in the browser', { skip }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      const phone = name === 'phone';
      const context = await browser.newContext(profile);
      await blockHub(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
      const press = (sel) => (phone ? page.tap(sel) : page.click(sel));

      await page.goto(`${server.origin}${PAGE}${URL_Q}`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.equal(await page.locator('#mg-mini').inputValue(), 'hack');
      // d20 9 + level 6 = 15 vs 12: margin 3, Steady. Lock 2 = 2 firewalls. 26 + 2 = 28 s. size 2: spread 10, 1 fewer decoy. retries 1 + 3 = 4.
      assert.match(await page.locator('#mg-readout').innerText(), /Tier 0 Steady[\s\S]*2 firewalls[\s\S]*28s each[\s\S]*4 retries/);
      await shot(page, `hack-${name}-1-setup`);
      await page.click('#mg-go');
      await page.waitForSelector('.mh-panel');
      assert.deepEqual(await page.evaluate(() => { const s = document.querySelector('.mh-panel').__state; return { stages: s.stages, total: s.total, retries: s.retriesLeft, mirrors: s.layout.mirrors.length, ctx: s.context }; }), { stages: 2, total: 28, retries: 4, mirrors: (await st(page, 's.layout.mirrors.length')), ctx: 'foot' });
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, box: Math.min(...[...document.querySelectorAll('.mh-mirror')].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))), btn: Math.min(...[...document.querySelectorAll('.mh-actions .ui-btn')].map((b) => b.getBoundingClientRect().height)), field: document.querySelector('.mh-field').getBoundingClientRect().width }));
      assert.ok(m.sw <= m.iw, `no sideways scroll (${m.sw} > ${m.iw})`);
      assert.ok(m.box >= 43, `mirror boxes are tappable (${m.box}px)`);
      assert.ok(m.btn >= 44, `buttons 44px or taller (${m.btn})`);
      assert.equal(await page.locator('.mh-beam').count(), 1, 'the beam is previewed');
      assert.equal(await page.locator('.mh-fire').isDisabled(), true, 'no fire without the portal');
      await shot(page, `hack-${name}-2-start`);

      // Click a mirror's box to select it; hold it to rotate.
      const first = await st(page, 's.layout.mirrors[0].id');
      const box = page.locator(`.mh-mirror[data-i="${first}"]`);
      const second = (await st(page, 's.layout.mirrors.length')) > 1 ? 1 : 0;
      await page.locator(`.mh-mirror[data-i="${second}"]`).click({ force: !phone, trial: false }).catch(() => {});
      assert.equal(await st(page, 's.selected'), second, 'a click selects the mirror');
      assert.equal(await box.getAttribute('aria-pressed'), second === first ? 'true' : 'false');
      const a0 = await st(page, `s.angles[${second}]`);
      const bb = await page.locator(`.mh-mirror[data-i="${second}"]`).boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      if (!phone) { await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); }
      else { await page.evaluate((i) => { const b = document.querySelector(`.mh-mirror[data-i="${i}"]`); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7 })); setTimeout(() => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })), 900); }, second); await page.waitForTimeout(1000); }
      const a1 = await st(page, `s.angles[${second}]`);
      assert.notEqual(a1, a0, 'holding a mirror rotates it');
      assert.equal(await page.locator('.mh-mirror.is-selected').count(), 1);
      const lineRot = await page.evaluate((i) => document.querySelector(`.mh-mirror[data-i="${i}"] .mh-mline`).getAttribute('transform'), second);
      assert.match(lineRot, /rotate\(/);
      // the Turn buttons hold-rotate the selected mirror too
      const b0 = await st(page, `s.angles[${second}]`);
      await page.evaluate(() => { const b = document.querySelectorAll('.mh-turn')[1]; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 8 })); setTimeout(() => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8 })), 600); });
      await page.waitForTimeout(700);
      assert.notEqual(await st(page, `s.angles[${second}]`), b0);

      // A missed catch costs a short cooldown; a good catch opens the portal.
      await page.waitForFunction(async () => !(await import('/projects/Space-Shooter/voyage/minigames/mirrors.js')).inWindow(document.querySelector('.mh-panel').__state), null, { polling: 'raf' });
      await page.evaluate(() => document.querySelector('.mh-catch').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
      assert.equal(await st(page, 's.catchMisses'), 1); assert.match(await page.locator('.mh-portal-state').innerText(), /flickered/i);
      await shot(page, `hack-${name}-3-aiming`);

      // Solve stage one with the beam on the firewall, catch, fire.
      const solveStage = async (k) => {
        await page.evaluate(() => { const s = document.querySelector('.mh-panel').__state; s.angles = s.layout.solved.map((v, i) => v ?? s.layout.start[i]); });
        await page.waitForFunction(() => document.querySelector('.mh-beam').classList.contains('is-hit'));
        await page.evaluate(() => new Promise((res) => { const M = import('/projects/Space-Shooter/voyage/minigames/mirrors.js'); M.then((mod) => { const tick = () => { const s = document.querySelector('.mh-panel').__state; if (mod.inWindow(s) && s.portal.cooldown === 0) { document.querySelector('.mh-catch').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); res(true); } else requestAnimationFrame(tick); }; tick(); }); }));
        await page.waitForSelector('.mh-fire:not([disabled])');
        assert.equal(await st(page, 's.portal.open'), true);
        if (k === 0) await shot(page, `hack-${name}-4-portal-open`);
        await press('.mh-fire');
        await page.waitForSelector('.mh-shot');
        if (k === 0) { await page.waitForTimeout(150); await shot(page, `hack-${name}-5-firing`); }
        await page.waitForFunction((n) => { const s = document.querySelector('.mh-panel')?.__state; return !s || s.stage > n || s.done; }, k, { timeout: 12000 });
      };
      await solveStage(0);
      assert.equal(await st(page, 's.stage'), 1, 'the next firewall');
      await page.waitForTimeout(200);
      // Run the clock out: the board resets on the same seed and a retry is spent.
      const before = await page.evaluate(() => { const s = document.querySelector('.mh-panel').__state; return JSON.stringify(s.layout); });
      await page.evaluate(() => { const s = document.querySelector('.mh-panel').__state; s.angles = s.layout.solved.map((v, i) => v ?? s.layout.start[i]); s.left = 0.05; });
      await page.waitForFunction(() => document.querySelector('.mh-panel').__state.retriesUsed === 1, null, { timeout: 4000 });
      assert.equal(await page.evaluate(() => JSON.stringify(document.querySelector('.mh-panel').__state.layout)), before, 'the same seed, the same board');
      assert.deepEqual(await st(page, 's.angles'), await st(page, 's.layout.start'), 'the mirrors are back where they started');
      assert.equal(await st(page, 's.portal.open'), false);
      assert.match(await page.locator('.rp-status').innerText(), /reset/i);
      await shot(page, `hack-${name}-6-reset`);
      await solveStage(1);
      await page.waitForSelector('.rp-result.is-ok');
      const r = await st(page, 's.result');
      assert.deepEqual([r.success, r.security, r.retriesUsed, r.firewalls], [true, 'quiet', 1, 2]); assert.ok(r.xp >= 5);
      await page.waitForTimeout(250);
      await shot(page, `hack-${name}-7-open`);
      await page.click('.rp-result button');
      assert.equal(await page.locator('.mh-panel').count(), 0);

      // Failing every retry: the world answers by where you are.
      for (const [ctx, key, val, word] of [['foot', 'terminal', 'locked', /terminal is locked/i], ['ship', 'port', 'closed', /closed its ports/i], ['combat', 'section', 'changed', /target a new section/i]]) {
        await page.goto(`${server.origin}${PAGE}${URL_Q}&context=${ctx}&retries=0&roll=1&dc=20&level=1&lock=1`);
        await page.waitForSelector('#mg-page:not([hidden])');
        await page.click('#mg-go'); await page.waitForSelector('.mh-panel');
        assert.equal(await st(page, 's.context'), ctx);
        for (let k = 0; k < 6 && !(await page.locator('.rp-result').count()); k++) await page.evaluate(() => { document.querySelector('.mh-panel').__state.left = 0.02; }), await page.waitForTimeout(150);
        await page.waitForSelector('.rp-result.is-bad');
        const f = await st(page, 's.result');
        assert.deepEqual([f.success, f.security, f[key], f.how], [false, 'alerted', val, 'locked-out']);
        assert.match(await page.locator('.rp-result').innerText(), word);
        assert.match(await page.locator('.rp-status').innerText(), /Security is alerted/);
        await shot(page, `hack-${name}-8-failed-${ctx}`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
