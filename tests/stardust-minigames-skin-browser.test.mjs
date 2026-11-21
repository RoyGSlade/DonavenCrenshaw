// All nine minigame panels (repair, hack, haggle, craft, navigate, stealth, persuade, intimidate, piloting) in the game's own UI, inside a station sheet beside the real dialogue box and tracker
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
const GAMES = ['repair', 'hack', 'haggle', 'craft', 'nav', 'stealth', 'persuade', 'intimidate', 'pilot'];
const WIN_TARGET = { repair: 'end-steady', hack: 'end-sealed', haggle: 'end-hired-well' }; // the others win to the choice's own pass node
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };

test('skinned minigames beside the dialogue box and tracker', { skip }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      for (const game of GAMES) {
        console.log('skin', game, name);
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
            dlgFrame: cs('#sk-dialogue', 'borderImageSource'), sheetFrame: cs('#sk-sheet', 'borderImageSource'), btn: cs('#sk-stage .ui-btn, #sk-stage .pc-card', 'borderImageSource'), name: cs('#sk-stage .rp-eyebrow', 'borderImageSource'),
            panelFlat: cs('#sk-stage .rp-panel', 'borderImageSource'), panelFrame: cs('#sk-sheet', 'borderImageSource'), btnSmall: [...document.querySelectorAll('#sk-stage .ui-btn, #sk-stage .pc-card')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length, btnCount: document.querySelectorAll('#sk-stage .ui-btn, #sk-stage .pc-card').length, choice: document.querySelector('#sk-dialogue .ui-dlg-choice').textContent, speaker: document.querySelector('#sk-dialogue .ui-dlg-name').textContent, who: document.querySelector('#sk-dialogue .ui-dlg-text').textContent };
        });
        assert.ok(m.sw <= m.iw, `no sideways scroll (${m.sw} vs ${m.iw})`);
        assert.match(m.dlgFrame, /dialogue\.webp/); assert.match(m.sheetFrame, /panel\.webp/); assert.match(m.btn, /(button[\w-]*|panel-light)\.webp/); assert.match(m.name, /nameplate\.webp/);
        assert.equal(m.panelFlat, 'none', 'inside the sheet the minigame has no frame of its own');
        assert.ok(m.dlg.bottom <= m.ih && m.dlg.top >= 0, 'the dialogue box is on screen');
        assert.ok(m.sheet.bottom <= m.ih && m.sheet.top >= 0, 'the sheet is on screen');
        assert.ok(m.dlg.bottom <= m.sheet.top + 2 || m.dlg.right <= m.sheet.left + 2, 'the dialogue box and the sheet do not overlap');
        assert.match(m.speaker, /Tull|Reaver|Captain|Reck|Nessa/i);
        assert.match(m.panelFrame, /panel\.webp/, 'the minigame panel is a kit panel');
        assert.match(m.choice, /d20 14 vs \d+/);
        if (game !== 'hack') assert.equal(await page.locator('#sk-dialogue .ui-dlg-portrait img').count(), 1, 'Tull shows his face, not an initial');
        if (game === 'haggle' && name === 'desktop') assert.ok(m.sheet.h < m.ih - 250, `the haggle sheet fits its content (${m.sheet.h} of ${m.ih})`);
        if (game === 'repair') assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.rp-valve .rp-wheel-rim')).stroke), 'rgb(255, 107, 90)', 'the valve wheel is red while dry');
        assert.ok(m.btnCount >= 1 && m.btnSmall === 0, `every kit button is 44px or taller (${m.btnSmall} of ${m.btnCount} are not)`);
        await shot(page, `skin-${game}-${name}-1-open`);

        // Play it to a result by the same bots the browser tests use, then the scene's next line shows. Mid shots come after a tap and a 300 ms wait.
        const mid = async () => { await page.waitForTimeout(300); await shot(page, `skin-${game}-${name}-2-mid`); };
        const cell = (i) => `.nv-cell[data-i="${i}"]`;
        const st = (sel) => page.evaluate((q) => { const s = document.querySelector(q).__state; return JSON.parse(JSON.stringify({ ...s, hazards: undefined, hitSet: undefined, _w: undefined, rolls: undefined, extra: undefined })); }, sel);
        if (game === 'repair') {
          for (let i = 0; i < 80 && !(await page.locator('.rp-result').count()); i++) {
            const idx = await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/minigames/repair.js')).nextHint(document.querySelector('.rp-panel').__state));
            if (idx == null) break; await tap(`.rp-tile[data-i="${idx}"]`); if (i === 3) await mid();
          }
        } else if (game === 'hack') {
          for (let i = 0; i < 6; i++) {
            if (await page.locator('.rp-result').count()) break;
            await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; if (!s.done) { s.cursor = s.tumblers[s.index].at; s.dir = 0; } });
            await tap('.hk-btn'); if (i === 1) await mid();
          }
        } else if (game === 'haggle') {
          await page.evaluate(async () => { const m = await import('/projects/Space-Shooter/voyage/minigames/haggle.js'); const s = document.querySelector('.hg-panel').__state; const [lo, hi] = m.bandPrices(s); const v = s.speed; s.phase = 0; s.t = 0; for (let t = 0; t < 4; t += 0.005) { const p = m.priceAt(s, m.needleAt(s, t)); if (p >= lo && p <= hi) { s.phase = (t * v) % 2; s.t = 0; s.speed = 0; break; } } });
          await shot(page, `skin-${game}-${name}-2-mid`);
          await page.evaluate(() => { const b = document.querySelector('.hk-btn'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); });
        } else if (game === 'craft') {
          await page.evaluate(() => { const s = document.querySelector('.cf-panel').__state, btn = document.querySelector('.cf-hold'); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 })); const t = setInterval(() => { if (s.phase !== 'heat') return clearInterval(t); if (s.temp >= s.centre) { clearInterval(t); btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 })); } }, 2); });
          await page.waitForFunction(() => document.querySelector('.cf-panel').__state.phase === 'shape');
          const order = await page.evaluate(() => document.querySelector('.cf-panel').__state.order);
          for (let k = 0; k < order.length; k++) { await tap(`[data-tool="${order[k]}"]`); if (k === 1) await mid(); }
        } else if (game === 'nav') {
          const sol = (await st('.nv-panel')).solution;
          for (let k = 1; k < sol.length; k++) { await tap(cell(sol[k])); if (k === Math.ceil(sol.length / 2)) await mid(); }
        } else if (game === 'stealth') {
          const route = (await st('.st-panel')).safe;
          for (let k = 1; k < route.length; k++) { await tap(cell(route[k])); if (k === Math.ceil(route.length / 2)) await mid(); }
        } else if (game === 'persuade') {
          const cards = await page.evaluate(() => { const s = document.querySelector('.pc-panel').__state; return s.hand.filter((c) => s.cares.includes(c.value)).sort((a, b) => b.worth - a.worth).map((c) => c.id); });
          for (let k = 0; k < cards.length && !(await page.locator('.rp-result').count()); k++) { await tap(`.pc-card[data-id="${cards[k]}"]`); if (k === 1) await mid(); }
        } else if (game === 'intimidate') {
          await page.evaluate(() => { const s = document.querySelector('.it-panel').__state; s.rolls = Array(12).fill(0.99); });
          await tap('.it-push'); await tap('.it-push'); await mid();
          while (!(await page.locator('.rp-result').count())) {
            const left = await page.evaluate(() => { const s = document.querySelector('.it-panel').__state; return { won: s.won, goal: s.goal, done: s.done }; });
            if (left.done) break;
            await tap(left.won >= left.goal ? '.it-stand' : '.it-push');
          }
        } else if (game === 'pilot') {
          await page.evaluate(() => {
            const panel = document.querySelector('.pl-panel'), s = panel.__state;
            const el = { left: panel.querySelector('.pl-left'), right: panel.querySelector('.pl-right'), thrust: panel.querySelector('.pl-thrust') }, held = { left: false, right: false, thrust: false };
            const set = (k, on) => { if (held[k] === on) return; held[k] = on; el[k].dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: 1, cancelable: true })); };
            const tick = () => {
              if (s.done) { for (const k of Object.keys(held)) set(k, false); return; }
              const err = s.padX - s.x, want = Math.max(-12, Math.min(12, err * 0.8)), dv = want - s.vx;
              const a = s.thrustAcc - s.g, lim = Math.sqrt(Math.max(0, 2 * a * s.y * 0.55)) + s.safe * 0.3;
              set('left', dv < -0.5); set('right', dv > 0.5); set('thrust', s.vy > lim);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          await page.waitForTimeout(2200); await mid();
        }
        if (game === 'repair') { await page.waitForSelector('.rp-valve.is-sealed'); await page.waitForTimeout(700); assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.rp-valve .rp-wheel-rim')).stroke), 'rgb(129, 230, 223)', 'cyan once sealed'); }
        await page.waitForSelector('.rp-result', { timeout: 40000 });
        await page.waitForTimeout(250); await shot(page, `skin-${game}-${name}-3-result`);
        assert.match(await page.locator('.rp-result').getAttribute('class'), /ui-card/);
        await page.click('.rp-result button');
        await page.waitForFunction(() => window.__skin.done);
        const done = await page.evaluate(() => window.__skin.done);
        assert.equal(done.branch, 'win');
        assert.equal(done.target, WIN_TARGET[game] || (await page.evaluate(() => window.__skin.pass)));
        await page.waitForTimeout(200); await shot(page, `skin-${game}-${name}-4-next-line`);
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  } finally { await browser.close(); await server.close(); }
});
