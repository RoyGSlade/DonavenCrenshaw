// The repair, hack and haggle panels in the game's own UI, inside a station sheet beside the real dialogue box and tracker
// (minigames/skin.html). Asserts the kit frames really are on (border images from ui/kit), nothing scrolls sideways at
// 390, the dialogue box and the minigame are both on screen, then plays each game and checks the scene's next line
// shows. Screenshots at both sizes to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 300 node --test tests/stardust-minigames-skin-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/skin.html';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

test('skinned minigames beside the dialogue box and tracker', { skip }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      for (const game of ['repair', 'hack', 'haggle']) {
        const context = await browser.newContext(profile);
        await blockHub(context);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
        const tap = (sel) => (name === 'phone' ? page.tap(sel) : page.click(sel));
        await page.goto(`${server.origin}${PAGE}`);
        assert.equal(await page.locator('#mg-closed').isVisible(), true);
        await page.goto(`${server.origin}${PAGE}?newgame=1&game=${game}&roll=14`);
        await page.waitForSelector('#sk-stage .rp-panel');
        await page.waitForSelector('#sk-dialogue:not([hidden]) .ui-dlg-choice');
        await page.waitForTimeout(250);
        const m = await page.evaluate(() => {
          const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; };
          const cs = (s, p) => getComputedStyle(document.querySelector(s))[p];
          return { sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, dlg: r('#sk-dialogue'), sheet: r('#sk-sheet'), tracker: r('#sk-tracker'), stage: r('#sk-stage'),
            dlgFrame: cs('#sk-dialogue', 'borderImageSource'), sheetFrame: cs('#sk-sheet', 'borderImageSource'), btn: cs('#sk-stage .ui-btn', 'borderImageSource'), name: cs('#sk-stage .rp-eyebrow', 'borderImageSource'),
            panelFlat: cs('#sk-stage .rp-panel', 'borderImageSource'), choice: document.querySelector('#sk-dialogue .ui-dlg-choice').textContent, speaker: document.querySelector('#sk-dialogue .ui-dlg-name').textContent, who: document.querySelector('#sk-dialogue .ui-dlg-text').textContent };
        });
        assert.ok(m.sw <= m.iw, `no sideways scroll (${m.sw} vs ${m.iw})`);
        assert.match(m.dlgFrame, /dialogue\.webp/); assert.match(m.sheetFrame, /panel\.webp/); assert.match(m.btn, /button(-primary)?\.webp/); assert.match(m.name, /nameplate\.webp/);
        assert.equal(m.panelFlat, 'none', 'inside the sheet the minigame has no frame of its own');
        assert.ok(m.dlg.bottom <= m.ih && m.dlg.top >= 0, 'the dialogue box is on screen');
        assert.ok(m.sheet.bottom <= m.ih && m.sheet.top >= 0, 'the sheet is on screen');
        assert.ok(m.dlg.bottom <= m.sheet.top + 2 || m.dlg.right <= m.sheet.left + 2, 'the dialogue box and the sheet do not overlap');
        assert.match(m.speaker, /Tull|Reaver|Captain|Reck|Nessa/i);
        assert.match(m.choice, /d20 14 vs \d+/);
        if (game !== 'hack') assert.equal(await page.locator('#sk-dialogue .ui-dlg-portrait img').count(), 1, 'Tull shows his face, not an initial');
        if (game === 'haggle' && name === 'desktop') assert.ok(m.sheet.h < m.ih - 250, `the haggle sheet fits its content (${m.sheet.h} of ${m.ih})`);
        if (game === 'repair') assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.rp-valve .rp-wheel-rim')).stroke), 'rgb(255, 107, 90)', 'the valve wheel is red while dry');
        await shot(page, `skin-${game}-${name}-1-open`);

        // Play it to a result by the same bots the browser tests use, then the scene's next line shows.
        if (game === 'repair') {
          for (let i = 0; i < 80 && !(await page.locator('.rp-result').count()); i++) {
            const idx = await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/minigames/repair.js')).nextHint(document.querySelector('.rp-panel').__state));
            if (idx == null) break; if (i === 3) { await page.waitForTimeout(350); await shot(page, `skin-${game}-${name}-2-mid`); } await tap(`.rp-tile[data-i="${idx}"]`);
          }
        } else if (game === 'hack') {
          for (let i = 0; i < 6; i++) {
            if (await page.locator('.rp-result').count()) break;
            await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; if (!s.done) { s.cursor = s.tumblers[s.index].at; s.dir = 0; } });
            if (i === 1) { await page.waitForTimeout(350); await shot(page, `skin-${game}-${name}-2-mid`); }
            await tap('.hk-btn');
          }
        } else {
          await page.evaluate(async () => { const m = await import('/projects/Space-Shooter/voyage/minigames/haggle.js'); const s = document.querySelector('.hg-panel').__state; const [lo, hi] = m.bandPrices(s); const v = s.speed; s.phase = 0; s.t = 0; for (let t = 0; t < 4; t += 0.005) { const p = m.priceAt(s, m.needleAt(s, t)); if (p >= lo && p <= hi) { s.phase = (t * v) % 2; s.t = 0; s.speed = 0; break; } } });
          await shot(page, `skin-${game}-${name}-2-mid`);
          await page.evaluate(() => { const b = document.querySelector('.hk-btn'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
        }
        if (game === 'repair') { await page.waitForSelector('.rp-valve.is-on'); await page.waitForTimeout(700); assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.rp-valve .rp-wheel-rim')).stroke), 'rgb(129, 230, 223)', 'cyan once sealed'); }
        await page.waitForSelector('.rp-result', { timeout: 15000 });
        await page.waitForTimeout(250); await shot(page, `skin-${game}-${name}-3-result`);
        assert.match(await page.locator('.rp-result').getAttribute('class'), /ui-card/);
        await page.click('.rp-result button');
        await page.waitForFunction(() => window.__skin.done);
        const done = await page.evaluate(() => window.__skin.done);
        assert.equal(done.branch, 'win');
        assert.equal(done.target, { repair: 'end-steady', hack: 'end-sealed', haggle: 'end-hired-well' }[game]);
        await page.waitForTimeout(200); await shot(page, `skin-${game}-${name}-4-next-line`);
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  } finally { await browser.close(); await server.close(); }
});
