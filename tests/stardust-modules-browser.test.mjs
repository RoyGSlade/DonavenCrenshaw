// The add-one test in the REAL page, desktop and phone. The page is served as it is in the repo; the browser then sees ONE extra line in
// modules/list.js, the fixture folder tests/fixtures/modules/_sample-game/, and ONE extra data line on a map prop (interact kind module).
// It opens the sample from the workbench Module shelf and from the bound console. Opt-in, one at a time, under the browser slot:
//   STARDUST_BROWSER_TEST=1 ~/Desktop/lhc-lanes/stardust/round3/browser-slot.sh ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-modules-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, 'fixtures/modules/_sample-game');
const V = '/projects/Space-Shooter/voyage/';
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html' };

/** What the browser sees after "copy the folder, add one line to list.js, add one data line to a map". */
async function addSample(context) {
  await context.route(`**${V}modules/list.js*`, async (route) => {
    const res = await route.fetch(); const body = (await res.text()).replace(/\]\);\s*$/, "  '_sample-game',\n]);\n");
    await route.fulfill({ response: res, body, contentType: 'text/javascript' });
  });
  await context.route(`**${V}modules/_sample-game/**`, async (route) => {
    const file = path.join(FIX, new URL(route.request().url()).pathname.split('/_sample-game/')[1]);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'text/plain' });
  });
  await context.route(`**${V}workbench/workbench.json*`, async (route) => {
    const res = await route.fetch(); const def = await res.json();
    def.props.push({ art: 'holo-terminal', at: [12, 8], size: [2, 1], block: 'low', interact: { kind: 'module', id: '_sample-game', label: 'Sample pads' } });
    await route.fulfill({ response: res, body: JSON.stringify(def), contentType: 'application/json' });
  });
}

async function standAt(page, id) {
  await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
    const it = m.interacts.find((i) => i.id === id);
    if (!it) throw new Error(`no ${id}`);
    for (const [ux, uy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) for (const k of [1.1, 1.0, 1.25, 0.9, 1.4]) { const x = it.x + ux * T * k, y = it.y + uy * T * k; if (walkable(m, x, y, 12) && Math.hypot(x - it.x, y - it.y) < it.reach - 4) { w.place(x, y); return; } }
    throw new Error(`no standing spot at ${id}`);
  }, id);
  await page.waitForTimeout(260);
  const got = await page.evaluate(() => { const w = window.__stardust.onfoot.world; w.useTarget(); return w.target?.id ?? null; });
  assert.equal(got, id);
}
const tapper = (page, phone) => (sel) => (phone ? page.tap(sel) : page.click(sel));

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`add-one mini-game in the real page, ${name}`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    await addSample(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const tap = tapper(page, phone);
    const shot = async (n) => { await page.waitForTimeout(300); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const target = () => page.evaluate(() => document.querySelector('.m-_sample-game').__state.target);
    try {
      await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
      await page.goto(`${server.origin}${V}?newgame=1&start=workbench&seed=7`);
      await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
      await page.waitForTimeout(1000);

      // 1. From the workbench menu: Skills board, Module shelf, Play.
      await standAt(page, 'wb-board');
      await page.waitForSelector('.wb-shelf-open');
      await tap('.wb-shelf-open');
      await page.waitForSelector('.wb-shelf-row[data-module="_sample-game"]');
      assert.ok(await page.locator('.wb-shelf-row[data-module="repair"]').count(), 'the existing games are on the shelf too');
      await shot('shelf');
      await tap('.wb-shelf-play[data-module="_sample-game"]');
      await page.waitForSelector('.wb-full .m-_sample-game');
      const box = await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), innerWidth, innerHeight, document.documentElement.scrollWidth]; });
      assert.deepEqual(box.slice(0, 4), [box[2], box[3], box[2], box[3]], 'full screen');
      assert.ok(box[4] <= box[2], 'no sideways scroll');
      await shot('sample-from-shelf');
      await tap(`.sg-pad[data-pad="${await target()}"]`);
      await page.waitForSelector('.wb-full', { state: 'detached' });
      await page.waitForFunction(() => /Sample pads: you did it/.test(document.body.innerText), null, { timeout: 8000 });
      await page.evaluate(() => window.__stardust.workbench.closePanel());

      // 2. From the bound console: the map's one data line.
      await standAt(page, '_sample-game');
      await page.waitForSelector('.wb-full .m-_sample-game');
      await shot('sample-from-console');
      const lit = await page.evaluate(() => document.querySelector('.sg-pad.is-lit') !== null);
      assert.ok(lit);
      await tap('.wb-fleave'); // Leave works: the screen closes and nothing is applied
      await page.waitForSelector('.wb-full', { state: 'detached' });
      await standAt(page, '_sample-game');
      await page.waitForSelector('.wb-full .m-_sample-game');
      await tap(`.sg-pad[data-pad="${await target()}"]`);
      await page.waitForSelector('.wb-full', { state: 'detached' });
      assert.deepEqual(errors.filter((e) => !/favicon|ERR_FAILED|net::/.test(e)), []);
    } finally { await browser.close(); await server.close(); }
  });
}
