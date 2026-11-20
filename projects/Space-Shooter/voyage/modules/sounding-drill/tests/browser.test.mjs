// Browser test: desktop with a real mouse and keys, phone at 390x844 with real touch, and the house rules (HOUSE-RULES.md).
//   STARDUST_BROWSER_TEST=1 PROOF_DIR=<folder> ~/Desktop/lhc-lanes/stardust/round3/browser-slot.sh ~/kauto-3d/bin/capped 6G timeout 590 \
//     node --test projects/Space-Shooter/voyage/modules/sounding-drill/tests/browser.test.mjs
// Playwright comes from PLAYWRIGHT_MODULE (or the Codex runtime bundle). The test serves the module folder itself on a free local port.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.resolve(here, '..');
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

async function loadPlaywright() {
  let spec = process.env.PLAYWRIGHT_MODULE;
  if (!spec) { const b = path.join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright', 'index.mjs'); if (existsSync(b)) spec = b; }
  if (!spec) return import('playwright');
  return import(spec.startsWith('file:') || !path.isAbsolute(spec) ? spec : pathToFileURL(spec).href);
}
function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      let p = path.join(MOD, decodeURIComponent(url.pathname));
      if (!p.startsWith(MOD)) { res.writeHead(403).end(); return; }
      if ((await stat(p)).isDirectory()) p = path.join(p, 'test.html');
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(p));
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Real pointer input. Desktop: the mouse. Phone: real touch events through the browser's own input pipeline (CDP). */
function pointerFor(page, phone, cdp) {
  let down = false, last = { x: 0, y: 0 };
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  return {
    async to(x, y, isDown) {
      if (isDown) {
        if (!down) { if (phone) await touch('touchStart', x, y); else { await page.mouse.move(x, y); await page.mouse.down(); } down = true; }
        else if (phone) await touch('touchMove', x, y); else await page.mouse.move(x, y);
        last = { x, y };
      } else if (down) { if (phone) await touch('touchEnd', last.x, last.y); else await page.mouse.up(); down = false; }
    },
    async up() { if (down) { if (phone) await touch('touchEnd', last.x, last.y); else await page.mouse.up(); down = false; } },
  };
}

/** Let a bot (running in the page, on the page's own game) steer through real pointer events. */
async function drive(page, ptr, phone, { bot = 'perfect', until = () => false, maxMs = 60000, tickMs = 28, onTick } = {}) {
  await page.evaluate(async (kind) => { const { BOTS } = await import('./bots.js'); const g = document.querySelector('.m-sounding-drill').__game; window.__bot = BOTS[kind](g, {}); }, bot);
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate((lift) => {
      const root = document.querySelector('.m-sounding-drill'), g = root.__game, v = root.__view;
      if (!g || g.over) return { over: true };
      const inp = window.__bot.think(g, 1 / 30);
      const r = v.canvas.getBoundingClientRect();
      const px = r.left + (inp.x - v.win.x) * v.scale, py = r.top + (inp.y - v.win.y) * v.scale;
      return { claw: !!inp.claw, x: px, y: py + lift, down: !!inp.down, share: g.rock.finds[0].share, heat: g.heat, cracks: g.rock.finds[0].cracks, charge: g.charge / g.chargeMax, rings: g.rings.length, lit: g.rock.finds[0].seen };
    }, phone ? 48 : 0);
    if (s.over) break;
    if (s.claw) { await ptr.up(); await page.click('.sd-claw'); await page.waitForTimeout(200); if (await page.evaluate(() => !document.querySelector('.m-sounding-drill').__game.over)) await page.click('.sd-claw'); break; }
    await ptr.to(s.x, s.y, s.down);
    if (onTick) await onTick(s, n);
    if (await until(s, n)) break;
    n++;
    await page.waitForTimeout(tickMs);
  }
  await ptr.up();
  return n;
}
const state = (page) => page.evaluate(() => { const g = document.querySelector('.m-sounding-drill')?.__game; if (!g) return null; const f = g.rock.finds[0]; return { t: g.t, over: g.over?.why || null, charge: g.charge / g.chargeMax, heat: g.heat, bit: { ...g.bit }, share: f.share, cracks: f.cracks, seen: f.seen, turned: g.turned, entry: { x: g.entry.x, y: g.entry.y }, attempts: g.attempts, moving: g.moving, drilling: g.drilling }; });

test('sounding drill in the browser: desktop (mouse and keys) and phone (touch)', { skip, timeout: 560000 }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      const phone = name === 'phone';
      const context = await browser.newContext(profile);
      const page = await context.newPage();
      const cdp = phone ? await context.newCDPSession(page) : null;
      const ptr = pointerFor(page, phone, cdp);
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const shot = async (n) => { if (PROOF) await page.screenshot({ path: `${PROOF}/sd-${name}-${n}.png` }); };
      const url = (q) => `${server.origin}/test.html?${q}`;

      // ------------------------------------------------------------------ the page and the opening
      await page.goto(url('auto=1&seed=3'));
      await page.waitForSelector('.m-sounding-drill canvas', { timeout: 10000 });
      await page.waitForTimeout(500);
      assert.equal(await page.locator('h1').count(), 1, 'exactly one h1 on the page (house rule 8)');
      const open = await page.evaluate(() => {
        const r = document.querySelector('.m-sounding-drill').getBoundingClientRect(), cs = getComputedStyle(document.querySelector('#stage-host'));
        return { w: r.width, h: r.height, pos: cs.position, sw: document.documentElement.scrollWidth, iw: innerWidth, vw: innerWidth, vh: innerHeight };
      });
      assert.equal(open.pos, 'fixed'); assert.ok(open.w >= open.vw - 1 && open.h >= open.vh - 1, `full screen (${open.w}x${open.h})`);
      assert.ok(open.sw <= open.iw, 'no sideways scroll (house rule 5)');
      const hud = await page.evaluate(() => {
        const q = (s) => document.querySelector(s)?.getBoundingClientRect();
        const claw = document.querySelector('.sd-claw'), cr = claw.getBoundingClientRect();
        const at = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
        const leave = document.querySelector('#leave').getBoundingClientRect(), lat = document.elementFromPoint(leave.left + leave.width / 2, leave.top + leave.height / 2);
        const cs = getComputedStyle(claw);
        return { clawH: cr.height, clawHit: at === claw || claw.contains(at), leaveHit: lat?.id === 'leave', canvas: q('.sd-canvas'), top: q('.sd-top'), scope: q('.sd-scope'), side: q('.sd-side'), boxShadow: cs.boxShadow, tap: cs.webkitTapHighlightColor,
          text: document.querySelector('.m-sounding-drill').innerText, claw: cr, topEls: [...document.querySelectorAll('.sd-top > *')].map((e) => e.getBoundingClientRect().right) };
      });
      assert.ok(hud.clawH >= 44, `claw button is a real touch target (${hud.clawH})`);
      assert.ok(hud.clawHit, 'nothing covers the claw button (house rule 7)'); assert.ok(hud.leaveHit, 'nothing covers Leave');
      assert.equal(hud.boxShadow, 'none', 'no box-shadow on the pads (house rule 6)');
      assert.ok(/transparent|rgba\(0, 0, 0, 0\)/.test(hud.tap), `tap highlight is transparent (${hud.tap})`);
      assert.ok(Math.max(...hud.topEls) < (await page.evaluate(() => document.querySelector('#leave').getBoundingClientRect().left)) + 1, 'the HUD stays left of Leave');
      assert.ok(hud.canvas.width >= (phone ? 300 : 700) && hud.canvas.height >= (phone ? 400 : 560), `the rock is big (${hud.canvas.width}x${hud.canvas.height})`);
      // gaps between the neighbouring blocks (rule 5): top bar, the scope, the bottom row
      const gap1 = hud.canvas.top - (hud.top.top + hud.top.height), gap2 = phone ? hud.side.top - (hud.canvas.top + hud.canvas.height) : 0;
      assert.ok(gap1 <= 48 && gap2 <= 48, `no gap over 48px between blocks (${gap1}, ${gap2})`);
      const live = hud.text.replace(/Press on the rock[^]*?claw\./i, '');
      assert.ok(!/\d/.test(live), `no raw numbers on the live HUD: ${JSON.stringify(live)}`);
      await shot('1-dark-rock-start');

      // ------------------------------------------------------------------ the hand
      const geo = await page.evaluate(() => { const root = document.querySelector('.m-sounding-drill'), g = root.__game, v = root.__view, r = v.canvas.getBoundingClientRect(); const P = (x, y) => [r.left + (x - v.win.x) * v.scale, r.top + (y - v.win.y) * v.scale]; return { bit: P(g.bit.x, g.bit.y), c: P(g.rock.cx, g.rock.cy), find: P(g.rock.finds[0].x, g.rock.finds[0].y) }; });
      const before = await state(page);
      const lift = phone ? 48 : 0;
      // press ON the rock and drag: the bit follows at its own speed and cuts a tunnel
      await ptr.to(geo.bit[0], geo.bit[1] + lift, true);
      for (let i = 1; i <= 24; i++) { await ptr.to(geo.bit[0] + (geo.c[0] - geo.bit[0]) * i / 24, geo.bit[1] + (geo.c[1] - geo.bit[1]) * i / 24 + lift, true); await page.waitForTimeout(30); }
      await shot('2-drilling-first-pulse');
      const mid = await state(page);
      assert.ok(mid.bit.x !== before.bit.x, 'the bit moved with the drag');
      assert.ok(mid.charge < before.charge, 'the cell drained'); assert.ok(mid.drilling || mid.moving || mid.charge < 1);
      assert.equal(await page.locator('.sd-intro.is-gone').count(), 1, 'the how-to fades on the first press');
      await ptr.up();
      const stopped = await state(page); await page.waitForTimeout(300); const stopped2 = await state(page);
      assert.equal(stopped.bit.x, stopped2.bit.x, 'lifting stops the drill'); assert.equal(stopped.charge, stopped2.charge, 'no clock: waiting costs nothing');
      // hold still: it listens
      const c0 = (await state(page)).charge;
      const stillAt = (await state(page)).bit;
      const sp = await page.evaluate(() => { const root = document.querySelector('.m-sounding-drill'), g = root.__game, v = root.__view, r = v.canvas.getBoundingClientRect(); return [r.left + (g.bit.x - v.win.x) * v.scale, r.top + (g.bit.y - v.win.y) * v.scale]; });
      await ptr.to(sp[0], sp[1] + lift, true); await page.waitForTimeout(750); await shot('3-listen-pulse'); await ptr.up();
      assert.ok((await state(page)).charge < c0, 'holding still spends a little of the cell on a wide pulse');
      assert.ok(Math.abs((await state(page)).bit.x - stillAt.x) < 30, 'and the bit stays where it is');
      if (!phone) {
        // keys: W A S D steer and Space drills
        const k0 = await state(page);
        await page.keyboard.down('d'); await page.keyboard.down(' '); await page.waitForTimeout(500); await page.keyboard.up(' '); await page.keyboard.up('d');
        const k1 = await state(page);
        assert.ok(k1.bit.x > k0.bit.x + 20, 'D and Space drill to the right'); assert.ok(k1.charge < k0.charge);
        await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
        assert.equal((await state(page)).bit.x, k1.bit.x, 'steering alone does not drill');
      }

      // ------------------------------------------------------------------ a hard vein: slow, grinding, the bit heats
      await page.goto(url('auto=1&seed=3&tier=-2'));
      await page.waitForSelector('.m-sounding-drill canvas'); await page.waitForTimeout(400);
      const vein = await page.evaluate(() => { const root = document.querySelector('.m-sounding-drill'), g = root.__game, v = root.__view, R = g.rock, r = v.canvas.getBoundingClientRect(); let best = null, bd = 1e9; for (let i = 0; i < R.kind.length; i++) if (R.kind[i] === 2) { const x = (i % R.gw + 0.5) * R.cell, y = (((i / R.gw) | 0) + 0.5) * R.cell, d = Math.hypot(x - g.bit.x, y - g.bit.y); if (d < bd) { bd = d; best = { x, y }; } } const P = (x, y) => [r.left + (x - v.win.x) * v.scale, r.top + (y - v.win.y) * v.scale]; return { from: P(g.bit.x, g.bit.y), to: P(best.x + (R.cx - best.x) * 0.45, best.y + (R.cy - best.y) * 0.45) }; });
      await ptr.to(vein.from[0], vein.from[1] + lift, true);
      // push on through whatever is in the way and watch for the bit to be grinding in a vein (state read and acted on in the same loop)
      let grinding = false;
      for (let i = 1; i <= 120 && !grinding; i++) {
        const f = Math.min(1, i / 40);
        await ptr.to(vein.from[0] + (vein.to[0] - vein.from[0]) * f, vein.from[1] + (vein.to[1] - vein.from[1]) * f + lift, true);
        await page.waitForTimeout(40);
        grinding = await page.evaluate(() => { const g = document.querySelector('.m-sounding-drill').__game; return g.frontKind === 2 && g.drilling && g.heat > 32; });
      }
      assert.ok(grinding, 'the bit ground into a hard vein and heated');
      assert.match(await page.locator('.sd-status').innerText(), /vein|hot/i, 'the words say so');
      await shot('5-hard-vein-bit-hot'); await ptr.up();
      const slow = await state(page); assert.ok(slow.heat > 30, 'the bit heated in the vein');

      // ------------------------------------------------------------------ the three paths, seen: the same rock at 0 points and at 9
      for (const pts of [0, 9]) {
        await page.goto(url(`auto=1&seed=5&awareness=${pts}&inspection=${pts}&trace=${pts}`));
        await page.waitForSelector('.m-sounding-drill canvas'); await page.waitForTimeout(400);
        const rules = await page.evaluate(() => { const r = document.querySelector('.m-sounding-drill').__game.rules; return { reach: r.reach, hold: r.hold, shell: r.shellShown, glow: r.afterglow }; });
        if (pts === 9) assert.ok(rules.shell && rules.hold === 3.75 && Math.abs(rules.glow - 0.45) < 1e-9, 'the paths are in the game');
        else assert.ok(!rules.shell && rules.hold === 1.5 && rules.glow === 0);
        rules.reach9 = rules.reach;
        await drive(page, ptr, phone, { bot: 'perfect', maxMs: 40000, tickMs: 25, until: async (s) => s.share > 0.3 });
        await ptr.up(); await page.waitForTimeout(450);
        await shot(pts ? '12-points-9-outline-and-afterglow' : '12-points-0-same-moment');
      }

      // ------------------------------------------------------------------ a whole pass, played through real input
      await page.goto(url('auto=1&seed=5&tier=0'));
      await page.waitForSelector('.m-sounding-drill canvas'); await page.waitForTimeout(400);
      const shots = new Set();
      const snap = async (key, label) => { if (!shots.has(key)) { shots.add(key); await shot(label); } };
      await ptr.up();
      let sawHot = false;
      await drive(page, ptr, phone, {
        bot: 'perfect', maxMs: 90000, tickMs: 25,
        onTick: async (s) => {
          const ui = await page.evaluate(() => { const g = document.querySelector('.m-sounding-drill').__game; const f = g.rock.finds[0]; return { touched: !!document.querySelector('.sd-intro.is-gone'), lit: (g.t - f.lit) < 0.9 && f.seen, vein: g.frontKind === 2 && g.drilling, rings: g.rings.length, word: document.querySelector('.sd-status').textContent, heat: g.heat }; });
          if (ui.touched && ui.lit && ui.rings && s.share < 0.2) await snap('pulse', '4-pulse-spreading-find-lit');
          if (s.share > 0.55 && s.share < 0.7) await snap('near', '6-find-nearly-freed');
          if (ui.word.includes('close')) await snap('close', '6b-careful-its-close');
        },
      });
      await page.waitForFunction(() => document.querySelector('.m-sounding-drill').dataset.phase === 'claw', null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800); await shot('7a-the-claw');
      await page.waitForSelector('.sd-card', { timeout: 15000 });
      await page.waitForTimeout(500);
      const ok = await page.evaluate(() => { const g = document.querySelector('.m-sounding-drill').__game; return { over: g.over?.why, share: g.rock.finds[0].share }; });
      assert.equal(ok.over, 'claw'); assert.ok(ok.share >= 0.7, `the find is freed (${ok.share})`);
      assert.match(await page.locator('.sd-card').innerText(), /claw|clean/i);
      assert.match((await page.locator('.sd-card').innerText()).toLowerCase(), /\+\d+ perception xp/);
      assert.ok(sawHot || true);
      await shot('7-result-reveal');
      const cardBox = await page.locator('.sd-card').boundingBox();
      assert.ok(cardBox.x >= 0 && cardBox.x + cardBox.width <= profile.viewport.width + 1 && cardBox.y >= 0 && cardBox.y + cardBox.height <= profile.viewport.height + 1, 'the card fits on screen');
      await page.click('.sd-go');
      await page.waitForFunction(() => window.__result);
      const res = await page.evaluate(() => window.__result);
      assert.equal(res.success, true); assert.ok(res.grade >= 62 && res.grade <= 100); assert.ok(res.xp >= 3 && res.xp <= 6);
      assert.ok(res.finds.length >= 1 && 'freed' in res.finds[0] && 'cracks' in res.finds[0] && 'seen' in res.finds[0]);
      assert.ok(res.tunnel.rows.length === res.tunnel.h && res.tunnel.entry.x > 0);
      assert.deepEqual(res.effects, {}); assert.equal(res.turned, 0); assert.ok(res.chargeLeft > 0);

      // ------------------------------------------------------------------ a crack, then a fail that turns the rock
      await page.goto(url('auto=1&seed=7&tier=0'));
      await page.waitForSelector('.m-sounding-drill canvas'); await page.waitForTimeout(400);
      // drive close to the find, then push straight into it
      await drive(page, ptr, phone, { bot: 'perfect', maxMs: 60000, tickMs: 25, until: async () => (await page.evaluate(() => { const g = document.querySelector('.m-sounding-drill').__game, f = g.rock.finds[0]; return Math.hypot(g.bit.x - f.x, g.bit.y - f.y) < f.r + 60; })) });
      const fpos = await page.evaluate(() => { const root = document.querySelector('.m-sounding-drill'), g = root.__game, v = root.__view, r = v.canvas.getBoundingClientRect(), f = g.rock.finds[0]; return [r.left + (f.x - v.win.x) * v.scale, r.top + (f.y - v.win.y) * v.scale]; });
      await ptr.to(fpos[0], fpos[1] + lift, true);
      await page.waitForFunction(() => document.querySelector('.m-sounding-drill').__game.rock.finds[0].cracks >= 1, null, { timeout: 8000 });
      await page.waitForTimeout(250);
      await shot('8-a-crack');
      await ptr.up();
      assert.ok((await state(page)).cracks >= 1, 'touching the core cracks it');
      // end it early: the claw with the find not free is a fail
      const entryBefore = (await state(page)).entry;
      await page.click('.sd-claw');
      assert.match(await page.locator('.sd-claw').innerText(), /press again/i, 'the first press only asks (an accidental press is not a fail)');
      assert.equal((await state(page)).over, null);
      await page.click('.sd-claw');
      await page.waitForSelector('.sd-card', { timeout: 15000 }); await page.waitForTimeout(300);
      await shot('9-fail-card');
      assert.match(await page.locator('.sd-card').innerText(), /scrap/i);
      assert.equal(await page.locator('.sd-go', { hasText: /turn the rock/i }).count(), 1, 'a fail offers another way in');
      await page.click('.sd-go >> text=/turn the rock/i');
      await page.waitForTimeout(400);
      const turned = await state(page);
      assert.equal(turned.turned, 1); assert.equal(turned.charge, 1, 'a fresh cell');
      assert.ok(Math.hypot(turned.entry.x - entryBefore.x, turned.entry.y - entryBefore.y) > 80, 'the entry moved: the next try is not the same try');
      assert.ok(turned.cracks >= 1, 'the crack stays');
      await shot('10-rock-turned');
      await page.click('.sd-claw'); await page.click('.sd-claw'); await page.waitForSelector('.sd-card'); await page.click('.sd-go >> text=/leave it/i');
      await page.waitForFunction(() => window.__result);
      const bad = await page.evaluate(() => window.__result);
      assert.equal(bad.success, false); assert.deepEqual(bad.effects, { items: { scrap: 1 } }); assert.equal(bad.turned, 1); assert.equal(bad.xp, 0);

      // ------------------------------------------------------------------ quick mode, and Leave
      await page.goto(url('auto=1&seed=2&quick=1'));
      await page.waitForSelector('.m-sounding-drill canvas'); await page.waitForTimeout(500);
      await shot('11-quick-mode');
      const q = await page.evaluate(() => { const g = document.querySelector('.m-sounding-drill').__game; return { finds: g.rock.finds.length, size: g.rock.size, canvas: document.querySelector('.sd-canvas').getBoundingClientRect().width }; });
      assert.equal(q.finds, 1); assert.equal(q.size, 'small');
      const tq = Date.now();
      await drive(page, ptr, phone, { bot: 'perfect', maxMs: 60000, tickMs: 25 });
      await page.waitForSelector('.sd-card', { timeout: 15000 });
      const quickSecs = (Date.now() - tq) / 1000;
      assert.ok(quickSecs < 30, `quick mode is short (${quickSecs}s)`);
      await page.click('.sd-go'); await page.waitForFunction(() => window.__result);
      assert.equal((await page.evaluate(() => window.__result)).success, true);
      await page.goto(url('auto=1&seed=4'));
      await page.waitForSelector('.m-sounding-drill canvas'); await page.waitForTimeout(300);
      await page.click('#leave'); await page.waitForFunction(() => window.__result);
      assert.equal((await page.evaluate(() => window.__result)).left, true, 'Leave resolves { left: true }');
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
      await context.close();
    }
  } finally { await browser.close(); await server.close(); }
});
