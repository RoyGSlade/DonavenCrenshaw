// Perihelion (navigation v2) in a real browser at 1440x900 and 390x844: plan with the arc, a live burn with a trim, a slingshot
// ring pressed on the mark, a results card, and a trainer sector. Screenshots go to PROOF_DIR.
//   STARDUST_BROWSER_TEST=1 PROOF_DIR=~/Desktop/lhc-lanes/stardust/launch/nav2/proof flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 400 node --test tests/stardust-minigames-perihelion-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/minigames/';
const FIELD = '?newgame=1&mini=perihelion&roll=11&dc=10&level=7&time=3&fuel=2&warning=2&seed=5&auto=1';
const TRAIN = (n) => `?newgame=1&mini=trainer&sector=${n}&level=7&time=2&fuel=2&warning=3&auto=1`;
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';

test('navigation (Perihelion) in the browser', { skip, timeout: 300000 }, async () => {
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
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const shot = async (n) => { if (PROOF) { await page.locator('.pr-panel').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${PROOF}/nav2-${name}-${n}.png` }); } };
      const st = () => page.evaluate(() => { const s = document.querySelector('.pr-panel').__state; return { phase: s.phase, turn: s.turn, done: s.done, result: s.result, ship: { ...s.ship }, plan: { ...s.plan }, mark: s.burn?.mark ? { ...s.burn.mark } : null, trims: s.trims, perfect: s.perfect }; });
      const canvasBox = async () => page.locator('.pr-canvas').boundingBox();
      const tapAt = async (x, y) => { if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };

      await page.goto(`${server.origin}${PAGE}${FIELD}`);
      await page.waitForSelector('.pr-canvas');
      await page.waitForTimeout(400);
      // Plain words only: no dev line; whole-number fuel; the briefing names the points that are spent.
      assert.equal(await page.locator('.pr-kit').count(), 0, 'no dev stats line');
      assert.match(await page.locator('.pr-brief').innerText(), /Par: 3 turns, 46 fuel\. Your points: longer burns, cheaper fuel, a longer arc/);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, burn: document.querySelector('.pr-burn').getBoundingClientRect().height, cw: document.querySelector('.pr-canvas').getBoundingClientRect().width }));
      assert.ok(m.sw <= m.iw, 'no sideways scroll'); assert.ok(m.burn >= 44, `burn button ${m.burn}`);
      assert.ok(await page.evaluate(() => document.querySelector('.pr-title').getBoundingClientRect().height < 22), 'the title does not wrap');
      assert.ok(m.cw >= (phone ? 280 : 500), `map width ${m.cw}`);
      assert.equal(await page.evaluate(() => document.querySelector('.pr-panel').__view.rot), phone, 'the arena turns on its side on a phone');

      // Aim by dragging from the ship towards the waypoint; the predicted arc follows the drag.
      const geo = await page.evaluate(() => { const p = document.querySelector('.pr-panel'), s = p.__state, v = p.__view, g = s.gates[0]; const r = document.querySelector('.pr-canvas').getBoundingClientRect(); const a = v.P(s.ship.x, s.ship.y), b = v.P(g.x, g.y); return { sx: r.left + a[0], sy: r.top + a[1], gx: r.left + b[0], gy: r.top + b[1] }; });
      await page.mouse.move(geo.sx, geo.sy); await page.mouse.down();
      await page.mouse.move((geo.sx + geo.gx) / 2, (geo.sy + geo.gy) / 2, { steps: 5 }); await page.mouse.up();
      await page.waitForTimeout(150);
      const planned = await st();
      assert.ok(planned.plan.thrust >= 30, `the drag set the thrust (${planned.plan.thrust})`);
      const arc = await page.evaluate(() => document.querySelector('.pr-panel').__view.arcShown);
      assert.ok(arc > 20, `the predicted arc is on screen (${arc} points)`);
      assert.match(await page.locator('.pr-status').innerText(), /Aim -?\d+°, thrust \d+%/);
      assert.match(await page.locator('.pr-burn').innerText(), /^BURN \d+% · \d+ fuel$/, 'whole-number fuel');
      assert.match(await page.locator('.pr-status').innerText(), /Your points save \d+ fuel/, 'the saving is said in plain words');
      assert.match(await page.locator('.pr-meter.is-fuel b').innerText(), /^\d+$/);
      await shot('1-plan-arc');

      // Burn, then trim by tapping the left half of the map (the screenshot is taken just after the trim).
      await page.click('.pr-burn');
      await page.waitForTimeout(900);
      const box = await canvasBox(); const before = await st();
      assert.equal(before.phase, 'burn');
      await tapAt(box.x + box.width * 0.25, box.y + box.height * 0.5);
      await page.waitForTimeout(120);
      const after = await st();
      assert.equal(after.trims, 1, 'a tap on the left half is one trim'); assert.ok(after.ship.fuel < before.ship.fuel);
      await shot('2-burn-trim');
      await page.waitForFunction(() => document.querySelector('.pr-panel').__state.phase !== 'burn', null, { timeout: 8000 });
      assert.ok((await st()).turn >= 2 || (await st()).done);

      // A slingshot: park the ship inside the first well's ring of the first trainer sector, coast, and press MARK in the band.
      await page.goto(`${server.origin}${PAGE}${TRAIN(1)}`);
      await page.waitForSelector('.pr-canvas'); await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.querySelector('.pr-panel').dataset.mode), 'trainer');
      assert.match(await page.locator('.pr-title').innerText(), /LAGRANGE APPROACH/i);
      await shot('3-trainer-sector-1');
      await page.evaluate(() => { const p = document.querySelector('.pr-panel'), s = p.__state; s.ship.x = 470; s.ship.y = 300; s.ship.vx = 60; s.ship.vy = 0; p.__view.plan(0, 0); p.__view.launch(); });
      await page.waitForSelector('.pr-mark.is-live', { timeout: 4000 });
      await page.waitForFunction(() => { const m = document.querySelector('.pr-panel').__state.burn?.mark; return m && m.progress > 0.2; });
      await shot('4-slingshot-ring');
      await page.waitForFunction(() => { const m = document.querySelector('.pr-panel').__state.burn?.mark; return m && m.progress >= 0.6; });
      const mb = await page.locator('.pr-mark').boundingBox(); assert.ok(mb.height >= 44, 'the MARK button is a real touch target');
      await tapAt(mb.x + mb.width / 2, mb.y + mb.height / 2);
      await page.waitForTimeout(150);
      assert.equal((await st()).perfect, 1, 'pressed in the sweet spot');
      assert.ok(await page.evaluate(() => document.querySelector('.pr-panel').__view.fx.callouts.some((c) => /SLINGSHOT/.test(c.text))), 'the mark says so on the map');
      await shot('5-slingshot-mark');
      await page.waitForFunction(() => document.querySelector('.pr-panel').__state.phase !== 'burn', null, { timeout: 8000 });

      // Clear sector 4 with the bot's plans, flown by the view, to reach a results card.
      await page.goto(`${server.origin}${PAGE}${TRAIN(4)}`);
      await page.waitForSelector('.pr-canvas'); await page.waitForTimeout(300);
      await shot('6-trainer-sector-4');
      const plans = await page.evaluate(async () => { const b = await import('/projects/Space-Shooter/voyage/minigames/perihelionBot.js'); const p = document.querySelector('.pr-panel'); window.__p = b.solve(p.__state, { angles: 36, beam: 5 }).plans; p.__view.speed = 4; return window.__p.length; });
      assert.ok(plans >= 1);
      for (let i = 0; i < plans; i++) {
        await page.evaluate((k) => { const p = document.querySelector('.pr-panel'), pl = window.__p[k]; p.__view.plan(pl.angle, pl.thrust); p.__view.launch(); }, i);
        if (i === 0) { await page.waitForTimeout(500); await shot('7-mid-burn'); }
        await page.waitForFunction(() => { const s = document.querySelector('.pr-panel').__state; return s.phase !== 'burn'; }, null, { timeout: 10000 });
      }
      await page.waitForSelector('.rp-result[data-outcome="arrived"]');
      await page.waitForTimeout(300);
      const card = await page.locator('.rp-result').innerText();
      assert.match(card, /turns? · fuel used [\d.]+.*hull \d of 3.*\+\d+ Navigation XP/);
      await shot('8-result');
      assert.deepEqual(errors, [], 'no page errors');
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});

const V = '/projects/Space-Shooter/voyage/';
async function use(page, id) {
  await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
    const it = m.interacts.find((i) => i.id === id);
    let dx = m.w / 2 - it.x, dy = m.h / 2 - it.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const dirs = [[dx, dy], [0, 1], [0, -1], [-1, 0], [1, 0]];
    for (const [ux, uy] of dirs) for (const k of [1.1, 1.0, 1.25, 0.9, 1.4]) { const x = it.x + ux * T * k, y = it.y + uy * T * k; if (walkable(m, x, y, 12) && Math.hypot(x - it.x, y - it.y) < it.reach - 4) { w.place(x, y); return; } }
    throw new Error(`no standing spot at ${id}`);
  }, id);
  await page.waitForTimeout(260);
  assert.equal(await page.evaluate(() => { const w = window.__stardust.onfoot.world; w.useTarget(); return w.target?.id ?? null; }), id);
}

test('the workbench navigation station plays Perihelion, with the game owning the phone screen', { skip, timeout: 300000 }, async () => {
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
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const shot = async (n) => { await page.waitForTimeout(300); if (PROOF) await page.screenshot({ path: `${PROOF}/nav2b-station-${name}-${n}.png` }); };
      await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
      await page.goto(`${server.origin}${V}?newgame=1&start=workbench&seed=7`);
      await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
      await page.waitForTimeout(1200);
      await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; });
      await use(page, 'wb-nav');
      await page.waitForSelector('#hg-minigame:not([hidden]) .wb-stage .pr-canvas', { timeout: 15000 });
      await page.waitForSelector('#hg-attempt', { state: 'hidden', timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(400);
      const fits = async (what) => {
        const m = await page.evaluate(() => { const r = (q) => { const e = document.querySelector(q); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; }; return { ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth, burn: r('.pr-burn'), mark: r('.pr-mark'), canvas: r('.pr-canvas'), title: r('.pr-title') }; });
        assert.ok(m.sw <= m.iw, `${what}: no sideways scroll`);
        for (const k of ['burn', 'mark', 'canvas']) if (m[k]) assert.ok(m[k].bottom <= m.ih + 1 && m[k].top >= 0 && m[k].right <= m.iw + 1, `${what}: ${k} is on screen (${JSON.stringify(m[k])} in ${m.iw}x${m.ih})`);
        assert.ok(m.title.h < 22, `${what}: the title does not wrap`);
        if (m.burn) assert.ok(m.burn.h >= 44); if (m.mark) assert.ok(m.mark.h >= 44);
        return m;
      };
      const plan = await page.evaluate(async () => { const b = await import('/projects/Space-Shooter/voyage/minigames/perihelionBot.js'); const p = document.querySelector('.pr-panel'); window.__plans = b.solve(p.__state, { angles: 36, beam: 5 }).plans; const pl = window.__plans[0]; p.__view.plan(pl.angle, pl.thrust); return window.__plans.length; });
      await fits('plan');
      await shot('1-plan');
      let marked = false;
      for (let i = 0; i < plan; i++) {
        if (i) await page.evaluate((k) => { const p = document.querySelector('.pr-panel'), pl = window.__plans[k]; p.__view.plan(pl.angle, pl.thrust); }, i);
        await page.evaluate(() => document.querySelector('.pr-panel').__view.launch());
        for (let n = 0; n < 400 && !marked; n++) {
          if (await page.locator('.pr-mark.is-live').count()) { await page.evaluate(() => { document.querySelector('.pr-panel').__view.speed = 0; }); await fits('burn with a live ring'); await shot('2-mid-burn-mark'); await page.evaluate(() => { document.querySelector('.pr-panel').__view.speed = 1; }); marked = true; await page.evaluate(() => document.querySelector('.pr-panel').__view.mark()); break; }
          if (await page.evaluate(() => document.querySelector('.pr-panel').__state.phase !== 'burn')) break;
          await page.waitForTimeout(25);
        }
        await page.evaluate(() => { document.querySelector('.pr-panel').__view.speed = 30; });
        await page.waitForFunction(() => { const s = document.querySelector('.pr-panel')?.__state; return !s || s.phase !== 'burn'; }, null, { timeout: 15000 });
        await page.evaluate(() => { const v = document.querySelector('.pr-panel')?.__view; if (v) v.speed = 1; });
      }
      assert.ok(marked, 'a ring lit up during the clear, with MARK in reach');
      await page.waitForSelector('.rp-result');
      await page.waitForTimeout(300);
      await shot('3-result');
      assert.deepEqual(errors, [], 'no page errors');
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
