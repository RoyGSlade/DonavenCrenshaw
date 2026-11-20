// Cut and Screw in the REAL workbench page at 1440x900 (real mouse) and 390x844 (real touch through the DevTools protocol):
// the crafting bench menu, a Cut by hand to a clean grade, a Screw with the torque bar (and a stripped head backed out), the
// two-game recipe with a spoil and its result card, and a part left between games and picked up. The bots move at human
// speed through real input; they read the pure state only to know where the outline and the bolt are. Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/cutscrew/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-cutscrew-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const wait = (page, ms) => page.waitForTimeout(ms);
let LIFT = 0; // touch: the blade rides 48 px above the fingertip, so the bot's finger goes 48 px below the line

async function bootRoom(page, origin) {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await wait(page, 1200);
  await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; }); // the d20 lands on 14
}
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
  await wait(page, 260);
  await page.evaluate(() => window.__stardust.onfoot.world.useTarget());
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__stardust.workbench.state)));

/** Real input: a mouse, or a finger through the DevTools protocol. Both take points in page pixels. */
function inputs(page, cdp) {
  return {
    mouse: { down: async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); }, move: (p) => page.mouse.move(p.x, p.y), up: () => page.mouse.up() },
    touch: { down: (p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }), move: (p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }), up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) },
  };
}
const canvasRect = async (page, game) => {
  await page.locator(`.cc-panel[data-game=${game}] canvas`).scrollIntoViewIfNeeded();
  await wait(page, 120);
  return page.evaluate((g) => { const r = document.querySelector(`.cc-panel[data-game=${g}] canvas`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, game);
};

const handCutPx = async (page) => async (x, y) => { const v = await page.evaluate(() => { const p = document.querySelector('.cc-panel[data-game=cut]'), r = p.querySelector('canvas').getBoundingClientRect(), w = p.__view(); return { l: r.left, t: r.top, k: w.pxPerUnit, cx: w.cx, cy: w.cy }; }); return { x: v.l + (x - v.cx) * v.k, y: v.t + (y - v.cy) * v.k + LIFT }; };
/** Cut by hand: press on START, follow the outline at about 180 units a second. `until` (0..1) stops and returns early (to shoot mid-drag). */
async function handCut(page, input, { delay = 60, until = null, release = true, probe = null } = {}) {
  const sel = '.cc-panel[data-game=cut]';
  const s = await page.evaluate((sel) => { const st = document.querySelector(sel).__state; return { start: st.start, targets: st.targets.map((p) => [p.x, p.y]) }; }, sel);
  const px = async (x, y) => { const v = await page.evaluate((sel) => { const p = document.querySelector(sel), r = p.querySelector('canvas').getBoundingClientRect(), w = p.__view(); return { l: r.left, t: r.top, k: w.pxPerUnit, cx: w.cx, cy: w.cy }; }, sel); return { x: v.l + (x - v.cx) * v.k, y: v.t + (y - v.cy) * v.k + LIFT }; };
  const pts = [[s.start.x, s.start.y], ...s.targets.slice(1), [s.start.x, s.start.y]];
  await input.down(await px(...pts[0]));
  const stop = until == null ? pts.length : Math.floor(pts.length * until);
  for (let i = 1; i < stop; i++) { await input.move(await px(...pts[i])); await wait(page, delay); if (await page.locator('.cc-grade').count()) break; }
  if (until == null && release) await input.up().catch(() => {});
  return { input, pts, px, at: stop };
}
/** Screw by hand: circle clockwise in the middle of the ring. `toTurns` is where to stop circling; `lift` lets go there. */
async function handScrew(page, input, { toTurns, lift = true, dir = 1, down = true, delay = 12 } = {}) {
  const r = await canvasRect(page, 'screw');
  const k = r.w / 500, cx = r.x + 250 * k, cy = r.y + 250 * k, rad = 75 * k;
  const st = () => page.evaluate(() => { const s = document.querySelector('.cc-panel[data-game=screw]').__state; return { turns: s.turns, T: s.T, zone: s.zone, status: s.status, done: s.done, theta: s.theta }; });
  let a = (await st()).theta;
  const at = () => ({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
  if (down) await input.down(at());
  for (let i = 0; i < 4000; i++) {
    const s = await st();
    if (s.done) break;
    if (dir > 0 ? s.turns >= toTurns : s.turns <= toTurns) break;
    a += dir * 0.12; await input.move(at()); await wait(page, delay);
  }
  if (lift) await input.up();
}
const go = async (page, sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`cut and screw in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
    LIFT = phone ? 48 : 0;
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const cdp = phone ? await context.newCDPSession(page) : null;
    const hand = inputs(page, cdp)[phone ? 'touch' : 'mouse'];
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (n) => { await wait(page, 350); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const sub = (title, fn) => (!only || only.includes(title) ? t.test(title, fn) : null);
    const tap = (sel) => go(page, sel);
    // A failed step must not leave the sheet open for the next one.
    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const openMenu = async () => { await recover(); await use(page, 'wb-craft'); await page.waitForSelector('.wb-c[data-craft="cut"]'); };
    const pick = async (id) => { await tap(`.wb-c[data-craft="${id}"]`); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(`.wb-full .cc-panel`, { timeout: 15000 }); };
    const gradeCard = (n = 1) => page.waitForFunction((n) => document.querySelectorAll('.cc-grade').length >= 1 && true, n, { timeout: 60000 });
    const noScroll = async (what) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${what}: no sideways scroll`);
    try {
      await bootRoom(page, server.origin);

      await sub('the bench menu: the chain, the older game, the cutter grades', async () => {
        await openMenu();
        const m = await page.evaluate(() => ({ crafts: [...document.querySelectorAll('.wb-c')].map((b) => b.dataset.craft), tools: [...document.querySelectorAll('.wb-t')].map((b) => b.dataset.tool), on: document.querySelector('.wb-t.is-on').dataset.tool }));
        assert.deepEqual(m.crafts, ['cut', 'screw', 'bend', 'flatten', 'bolt-plate', 'heat']); assert.deepEqual(m.tools, ['worn', 'shop', 'good']); assert.equal(m.on, 'shop');
        await noScroll('menu');
        await tap('.wb-t[data-tool="good"]');
        assert.equal(await page.evaluate(() => document.querySelector('.wb-t.is-on').dataset.tool), 'good');
        await shot('0-bench-menu');
      });

      await sub('Cut by hand: a clean grade with the good cutter, XP lands in Crafting', async () => {
        const before = await state(page);
        await pick('cut');
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, chips: [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent), note: document.querySelector('.wb-preview').textContent }));
        assert.match(m.eyebrow, /CUT/); assert.ok(m.chips.some((c) => /Good cutter: wide line/.test(c)), m.chips.join('|')); assert.ok(m.chips.some((c) => /Speed 0: normal feed/.test(c)));
        assert.ok(!m.chips.some((c) => /[x\/=]\s*\d|\d\s*\/\s*\d/.test(c)), 'no formulas in the chips');
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        assert.doesNotMatch(await page.locator('.cc-panel').innerText(), /\d+\s*\/\s*\d+/, 'no raw 96 / 300 numbers');
        assert.match(m.note, /roll:/);
        await noScroll('cut');
        await shot('1-cut-start');
        const mid = await handCut(page, hand, { until: 0.4 });
        await shot('2-cut-mid-drag');
        const sBefore = await page.evaluate(() => { const s = document.querySelector('.cc-panel[data-game=cut]').__state; return { good: s.good, torn: s.torn, covered: s.coveredCount, down: s.down }; });
        assert.ok(sBefore.down && sBefore.good > 40 && sBefore.torn <= 2, JSON.stringify(sBefore));
        // carry on from where we are
        const lw = await page.evaluate(() => document.querySelector('.cc-panel[data-game=cut]').__view());
        if (PROOF) { const { writeFile } = await import('node:fs/promises'); await writeFile(`${PROOF}/line-width-${name}.txt`, `${name} ${profile.viewport.width}x${profile.viewport.height}: zoom ${lw.zoom}, ${lw.pxPerUnit.toFixed(3)} px per board unit. Line width on screen at a Steady roll: worn ${(9 * lw.pxPerUnit).toFixed(1)} px, shop ${(12 * lw.pxPerUnit).toFixed(1)} px, good ${(15 * lw.pxPerUnit).toFixed(1)} px.\n`); }
        if (phone) assert.equal(lw.zoom, 1.6, 'phone zooms the sheet 1.6x');
        for (const p of mid.pts.slice(mid.at)) { await hand.move(await mid.px(...p)); await wait(page, 60); if (await page.locator('.cc-grade').count()) break; }
        await hand.up().catch(() => {});
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.pass, '1'); assert.ok(card.grade >= 85, `a steady hand cuts clean: ${card.text}`);
        await shot('3-cut-result');
        await tap('.cc-grade .cc-go');
        await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Cut \d+/); assert.match(fin, /scrap: 3 used/); assert.match(fin, /Crafting XP/);
        await shot('4-cut-recipe-result');
        await tap('.cc-final .cc-go');
        await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.crafting > before.progress.xp.crafting || after.progress.levels.crafting > before.progress.levels.crafting, 'XP in Crafting');
        assert.match(after.said, /Cut: you did it/);
      });

      await sub('Screw by hand: the torque bar wakes on the last turn, stop in the green; a stripped head is backed out', async () => {
        await openMenu(); await pick('screw');
        const chips = await page.evaluate(() => [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent));
        assert.ok(chips.some((c) => /normal turns/.test(c)), chips.join('|'));
        assert.doesNotMatch(await page.locator('.cc-panel').innerText(), /\d+\.\d\d\s*\/\s*\d/, 'no raw turn counts');
        await noScroll('screw');
        await shot('5-screw-start');
        // first bolt: strip it on purpose
        await handScrew(page, hand, { toTurns: 4.1, lift: false });
        await handScrew(page, hand, { toTurns: 4.3, lift: false, down: false });
        assert.equal(await page.evaluate(() => document.querySelector('.cc-panel[data-game=screw]').__state.status), 'stripped');
        await wait(page, 200);
        await shot('6-screw-stripped');
        await handScrew(page, hand, { toTurns: 0, dir: -1, lift: false, down: false });
        assert.equal(await page.evaluate(() => { const s = document.querySelector('.cc-panel[data-game=screw]').__state; return [s.status, s.stripped]; }).then(String), 'turning,1');
        // now properly: up to the middle of the last turn, shoot the torque bar, creep into the green, let go
        await handScrew(page, hand, { toTurns: 3.55, lift: false, down: false });
        await shot('7-screw-mid-turn');
        const awake = await page.evaluate(() => document.querySelector('.cc-torque').classList.contains('is-awake'));
        assert.ok(awake, 'the torque bar is awake on the last turn');
        await handScrew(page, hand, { toTurns: 3.93, lift: true, down: false });
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass }));
        assert.equal(card.grade, 85, 'one stripped bolt costs 15'); assert.equal(card.pass, '1');
        await shot('8-screw-result');
        await tap('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        assert.match(await page.locator('.cc-final').innerText(), /Screw 85/);
        await tap('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('bolt plate: a rough Cut is redone on a fresh sheet and spoils; the result card shows the chain', async () => {
        await openMenu(); await pick('bolt-plate');
        assert.equal(await page.locator('.cc-step').count(), 2);
        // a lazy cut: press, a straight line, Done
        const st = await page.evaluate(() => document.querySelector('.cc-panel[data-game=cut]').__state.start);
        const p0 = await (await handCutPx(page))(st.x, st.y);
        await hand.down(p0); for (let i = 1; i <= 12; i++) { await hand.move({ x: p0.x + i * 10, y: p0.y + 4 }); await wait(page, 40); } await hand.up();
        await go(page, '.cc-done');
        await gradeCard();
        const bad = await page.evaluate(() => ({ pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(bad.pass, '0'); assert.match(bad.text, /too rough/i); assert.match(bad.text, /spoils one unit/i); assert.match(bad.text, /Redo 1 of 2/);
        await shot('9-cut-redo-card');
        const sheetA = await page.evaluate(() => document.querySelector('.cc-panel[data-game=cut]').__state.seed);
        await tap('.cc-grade .cc-go');
        await page.waitForFunction((a) => { const p = document.querySelector('.cc-panel[data-game=cut]'); return p && p.__state.seed !== a && !p.__state.done; }, sheetA);
        assert.equal(await page.locator('.cc-spoil').getAttribute('data-spoils'), '1');
        assert.match(await page.locator('.cc-step[data-state=now]').innerText(), /redo 1/);
        await handCut(page, hand);
        await gradeCard(); assert.equal(await page.evaluate(() => document.querySelector('.cc-grade').dataset.pass), '1');
        await tap('.cc-grade .cc-go');
        await page.waitForSelector('.cc-panel[data-game=screw]');
        await handScrew(page, hand, { toTurns: 3.93 });
        await gradeCard(); await tap('.cc-grade .cc-go');
        await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Cut \d+ \(try 2\)/); assert.match(fin, /Screw 100/); assert.match(fin, /Spoils: 1/); assert.match(fin, /scrap: 5 used \(4\.4 exact\)/);
        await shot('10-recipe-result');
        await tap('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        assert.match((await state(page)).said, /Bolt plate: you did it/);
      });

      await sub('a part is kept between games: leave after the Cut, pick it up from the bench menu', async () => {
        await openMenu(); await pick('bolt-plate');
        await handCut(page, hand);
        await gradeCard(); await tap('.cc-grade .cc-go');
        await page.waitForSelector('.cc-panel[data-game=screw]');
        await tap('.wb-leave'); await page.waitForSelector('.wb-full', { state: 'detached' });
        await openMenu();
        const part = await page.locator('.wb-part').innerText();
        assert.match(part, /Bolt plate: Cut \d+, next Screw/);
        await shot('11-part-in-hand-menu');
        await tap('.wb-c[data-craft="resume"]');
        await page.waitForSelector('.cc-panel[data-game=screw]', { timeout: 15000 });
        assert.match(await page.locator('.cc-step[data-state=done]').innerText(), /Cut/);
        await handScrew(page, hand, { toTurns: 3.93 });
        await gradeCard(); await tap('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        assert.match(await page.locator('.cc-final').innerText(), /Cut \d+ · Screw 100/);
        await tap('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        await openMenu(); assert.equal(await page.locator('.wb-part').count(), 0, 'the part is gone once the craft is done');
        await tap('.wb-no');
      });

      await sub('the older heat-and-shape game is still on the menu', async () => {
        await openMenu(); await tap('.wb-c[data-craft="heat"]');
        await page.waitForSelector('.wb-full .cf-panel', { timeout: 15000 });
        await tap('.wb-leave'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
