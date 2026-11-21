// Piloting (touchdown) in a real browser, in real time: an in-page pilot works the on-screen
// buttons with pointer events (hold Thrust, Left, Right), so the controls are what is tested.
// A landing, a crash (no input) and a miss (steering away). Screenshots to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-pilot-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
// roll 2 + level 3 = 5 vs 12: margin -7, Rough: an 8.4 s fall. 3 points: boost 3 (one brake, 11.5 s fuel).
const Q = '?newgame=1&mini=pilot&roll=2&dc=12&level=3&boost=3&seed=5';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

// Starts an in-page pilot: mode 'ace' lands, 'away' steers the wrong way, 'none' does nothing.
const fly = (page, mode) => page.evaluate((m) => {
  const panel = document.querySelector('.pl-panel'), s = panel.__state;
  const el = { left: panel.querySelector('.pl-left'), right: panel.querySelector('.pl-right'), thrust: panel.querySelector('.pl-thrust') };
  const held = { left: false, right: false, thrust: false };
  const set = (k, on) => { if (held[k] === on) return; held[k] = on; el[k].dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: 1, cancelable: true })); };
  const tick = () => {
    if (s.done) { for (const k of Object.keys(held)) set(k, false); return; }
    if (m !== 'none') {
      const err = s.padX - s.x, want = Math.max(-12, Math.min(12, err * 0.8)), dv = want - s.vx;
      const a = s.thrustAcc - s.g, lim = Math.sqrt(Math.max(0, 2 * a * s.y * 0.55)) + s.safe * 0.3;
      if (m === 'away') { set('left', err > 0); set('right', err <= 0); } else { set('left', dv < -0.5); set('right', dv > 0.5); }
      set('thrust', s.vy > lim);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, mode);

test('piloting (touchdown) in the browser', { skip }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      const context = await browser.newContext(profile);
      await blockHub(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
      await page.goto(`${server.origin}${PAGE}`);
      assert.equal(await page.locator('#mg-closed').isVisible(), true);
      await page.goto(`${server.origin}${PAGE}${Q}`);
      await page.waitForSelector('#mg-page:not([hidden])');
      assert.equal(await page.locator('#mg-mini').inputValue(), 'pilot');
      assert.match(await page.locator('#mg-readout').innerText(), /Tier -2 Rough[\s\S]*Fall 8\.4 s[\s\S]*safe speed 3[\s\S]*wind 3\.3[\s\S]*pad 18 wide[\s\S]*fuel 11\.5 s[\s\S]*1 brake/);
      await shot(page, `pilot-${name}-1-setup`);

      // A landing.
      await page.click('#mg-go'); await page.waitForSelector('.pl-panel');
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, btn: document.querySelector('.pl-thrust').getBoundingClientRect().height, svg: document.querySelector('.pl-view').getBoundingClientRect().width }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll'); assert.ok(m.btn >= 44); assert.ok(m.svg >= 300);
      const fit = await page.evaluate(() => [...document.querySelectorAll('.pl-btn')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, bottom: r.bottom, top: r.top, ih: innerHeight, w: r.width }; }));
      assert.equal(fit.length, 4);
      for (const b of fit) { assert.ok(b.top >= 0 && b.bottom <= b.ih, `${b.t} is on screen (${b.top}..${b.bottom} of ${b.ih})`); assert.ok(b.w >= 44, `${b.t} wide enough`); }
      await fly(page, 'ace');
      await page.waitForTimeout(3500); await shot(page, `pilot-${name}-2-falling`);
      await page.waitForSelector('.rp-result', { timeout: 20000 });
      assert.equal(await page.locator('.rp-result').getAttribute('data-outcome'), 'landed', await page.locator('.pl-panel .rp-status').innerText());
      assert.match(await page.locator('.rp-result').innerText(), /Piloting XP/);
      await shot(page, `pilot-${name}-3-landed`);
      await page.click('.rp-result button');

      // A crash: no input at all.
      await page.click('#mg-go'); await page.waitForSelector('.pl-panel');
      await fly(page, 'none');
      await page.waitForSelector('.rp-result', { timeout: 20000 });
      assert.ok(['crashed', 'missed'].includes(await page.locator('.rp-result').getAttribute('data-outcome')));
      await shot(page, `pilot-${name}-4-crashed`);
      await page.click('.rp-result button');

      // A miss: brake and thrust fine, but steer away from the pad.
      await page.click('#mg-go'); await page.waitForSelector('.pl-panel');
      await fly(page, 'away');
      await page.waitForSelector('.rp-result', { timeout: 20000 });
      assert.equal(await page.locator('.rp-result').getAttribute('data-outcome'), 'missed');
      await shot(page, `pilot-${name}-5-missed`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
