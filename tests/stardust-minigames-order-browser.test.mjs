// Order and timing (Sear a steak) in the REAL workbench page at 1440x900 (real mouse clicks and the real 1 to 4 keys) and 390x844 (real
// touch taps through the DevTools protocol): the bench menu, a whole dish (the empty pan, butter in its window, the steak on, salt, turn,
// the result), a wrong-order spoil, a pan left to burn, and the layout rules (no gap over 48 px, no sideways scroll, chips wrap, the panel
// fills the stage, no digits on the live HUD, the tiles are the plain kit frame with a drop-shadow glow and no box shadow). The game runs on
// its own clock, so when to tap is decided from the page's own clock and windows in ONE page task, and the real tap follows at once (every
// window is at least a second and a half wide). Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/cooking/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-order-browser.test.mjs
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
const PANEL = '.cc-panel[data-game=order]';
const ORDER = '/projects/Space-Shooter/voyage/minigames/order.js';

async function bootRoom(page, origin) {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await wait(page, 1200);
  await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; }); // the d20 lands on 14: a Steady roll
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
const snap = (page) => page.evaluate((sel) => { const p = document.querySelector(sel), s = p?.__state; return s ? { done: s.done, grade: s.result?.grade, how: s.result?.how, next: s.next, taps: s.taps.map((x) => ({ id: x.id, heatOK: x.heatOK, timeOK: x.timeOK, word: x.word })), wrongs: s.wrongs.length, misses: s.misses.length, layout: s.layout, t: p.__time() } : null; }, PANEL);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`order in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const cdp = phone ? await context.newCDPSession(page) : null;
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (n) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const sub = (title, fn) => (!only || only.includes(title) ? t.test(title, fn) : null);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });

    /** Wait inside the page until the next ingredient's window has reached `where` (0 is the middle; a number of seconds shifts it), and report the tile. One page task. */
    const when = ({ shift = 0, id = null } = {}) => page.evaluate(({ ORDER, PANEL, shift, id }) => import(ORDER).then((O) => new Promise((resolve) => {
      const p = document.querySelector(PANEL), s = p.__state, T = p.__time;
      const tick = () => {
        if (s.done) return resolve(null);
        const w = O.windowOf(s, s.next);
        if (w && T() >= (w.open + Math.min(w.close, w.open + 40)) / 2 + shift) {
          const want = id || s.steps[s.next].id, r = p.querySelector(`.cc-tile[data-id="${want}"]`).getBoundingClientRect();
          return resolve({ id: want, x: r.left + r.width / 2, y: r.top + r.height / 2, word: O.orderWord(s, T()), key: s.layout.indexOf(want) + 1, t: T() });
        }
        requestAnimationFrame(tick);
      };
      tick();
    })), { ORDER, PANEL, shift, id });
    /** Put an ingredient in with a real input: desktop alternates a mouse click and the number key, phone a finger tap. */
    const tap = async (at, how = 'mouse') => {
      if (phone) { await touch('touchStart', at.x, at.y); await touch('touchEnd'); }
      else if (how === 'key') await page.keyboard.press(String(at.key));
      else { await page.mouse.move(at.x, at.y); await page.mouse.click(at.x, at.y); }
    };
    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const go = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };
    const openMenu = async () => { await recover(); await use(page, 'wb-craft'); await page.waitForSelector('.wb-c[data-craft="cut"]'); };
    const pick = async () => { await go('.wb-c[data-craft="steak"]'); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(PANEL, { timeout: 15000 }); await wait(page, 500); };
    const gradeCard = () => page.waitForSelector('.cc-grade', { timeout: 60000 });
    /** Whatever is left of the recipe, each ingredient at the middle of its window. */
    const finishDish = async () => { for (let g = 0; g < 6; g++) { const st = await snap(page); if (st.done) return; const at = await when(); if (!at) return; await tap(at, g % 2 ? 'key' : 'mouse'); await wait(page, 120); } };
    try {
      await bootRoom(page, server.origin);

      await sub('the bench menu lists Sear a steak between the pour and Bolt plate', async () => {
        await openMenu();
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-c')].map((b) => b.dataset.craft)), ['cut', 'screw', 'bend', 'flatten', 'polish', 'pour', 'steak', 'bolt-plate', 'heat']);
        assert.match(await page.locator('.wb-c[data-craft="steak"]').innerText(), /Sear a steak/); assert.match(await page.locator('.wb-craftrow:has(.wb-c[data-craft="steak"]) .rp-help').innerText(), /Kitchen/);
        await shot('o0-bench-menu');
      });

      await sub('a whole dish by hand: layout, plain words, butter, steak, salt, turn, the result', async () => {
        const before = await state(page);
        await openMenu(); await pick();
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, chips: [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent) }));
        assert.match(m.eyebrow, /KITCHEN/); assert.ok(m.chips.some((c) => /Steady roll: normal heat bands and time windows/.test(c)), m.chips.join('|')); assert.ok(m.chips.some((c) => /Speed 0: normal warm-up/.test(c)));
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        const text = await page.locator(PANEL).innerText();
        assert.doesNotMatch(text, /\d/, `no number anywhere on the game screen: ${text}`);
        assert.match(text, /too early/i); assert.match(text, /pan/i); assert.match(text, /timing/i); assert.match(text, /butter/i);
        const lay = await page.evaluate((sel) => {
          const q = ['.wb-ftop', '.wb-fnote', '.cc-steps', '.cc-spoil', '.cc-ordhud', '.cc-ordwrap', '.cc-status', '.cc-giverow', '.cc-ordrow', '.cc-chipbox'];
          const rows = q.map((x) => document.querySelector(`.wb-full ${x}`)).filter((e) => e && e.offsetParent && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.toString().split(' ')[0], top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).sort((a, b) => a.top - b.top);
          const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push({ between: `${rows[i - 1].c} > ${rows[i].c}`, px: rows[i].top - rows[i - 1].bottom });
          const chips = document.querySelector('.wb-full .cc-chips'), cv = document.querySelector(`${sel} canvas`).getBoundingClientRect(), tile = document.querySelector(`${sel} .cc-tile`), c = getComputedStyle(tile), pr = tile.getBoundingClientRect();
          const clipped = [...document.querySelectorAll(`${sel} .cc-chip, ${sel} .cc-stat, ${sel} .cc-tile`)].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 30));
          const over = [...document.querySelectorAll(`${sel} .cc-stat`)].flatMap((st) => [...st.children].map((k) => Math.round(k.getBoundingClientRect().right - st.getBoundingClientRect().right))).filter((x) => x > 0);
          const tiles = [...document.querySelectorAll(`${sel} .cc-tile`)].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; });
          return { gaps, maxGap: Math.max(0, ...gaps.map((g) => g.px)), below: innerHeight - rows[rows.length - 1].bottom, chipsClipped: chips.scrollWidth - chips.clientWidth, clipped, over, cvW: cv.width, cvH: cv.height, vw: innerWidth, sw: document.documentElement.scrollWidth, panelW: document.querySelector(sel).getBoundingClientRect().width, stageW: document.querySelector('.wb-full .cc-stage').getBoundingClientRect().width, tap: c.webkitTapHighlightColor, box: c.boxShadow, tileW: pr.width, tileH: pr.height, art: c.borderImageSource, tiles };
        }, PANEL);
        assert.ok(lay.maxGap <= 48, `no gap over 48 px inside the play block: ${JSON.stringify(lay.gaps)}`);
        assert.ok(lay.sw <= lay.vw, `the page does not scroll sideways: ${lay.sw} > ${lay.vw}`); assert.ok(lay.panelW >= lay.stageW - 2, `the panel fills the stage width: ${lay.panelW} of ${lay.stageW}`);
        assert.ok(lay.chipsClipped <= 0, `the chips wrap and none is cut off: ${lay.chipsClipped}`); assert.deepEqual(lay.clipped, [], 'no chip, gauge or tile text is clipped'); assert.deepEqual(lay.over, [], 'nothing runs past its gauge box');
        assert.ok(lay.below <= 24, `the last block sits at the bottom: ${lay.below}`); assert.ok(lay.tiles.every(([l, r]) => l >= 0 && r <= lay.vw), `the tiles are on screen: ${JSON.stringify(lay.tiles)}`);
        assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(lay.tap), `no tap highlight square: ${lay.tap}`); assert.equal(lay.box, 'none', 'no box shadow behind a tile'); assert.match(lay.art, /button-primary\.webp/, 'the plain kit frame');
        assert.ok(lay.tileH >= 64 && lay.tileW >= 70, `big tiles: ${lay.tileW} x ${lay.tileH}`);
        if (phone) assert.ok(lay.cvW >= profile.viewport.width - 40 && lay.cvH >= 240, `the board is full width on a phone: ${lay.cvW} x ${lay.cvH}`);
        await wait(page, 400); await shot('o1-order-empty-pan');
        if (!phone) { await page.hover(`${PANEL} .cc-tile`); await wait(page, 120); assert.match(await page.locator(`${PANEL} .cc-tile`).first().evaluate((e) => getComputedStyle(e).borderImageSource), /button-primary\.webp/, 'hover keeps the plain frame'); await page.mouse.move(5, 5); }
        // butter: wait for the middle of its window, shoot, then tap
        const words = new Set(); const early = await snap(page); assert.equal(early.next, 0);
        words.add((await page.locator(`${PANEL} .cc-nextstat em`).innerText()).toLowerCase());
        const b = await when(); assert.equal(b.id, 'butter'); assert.equal(b.word, 'now'); words.add(b.word);
        assert.equal(await page.locator(`${PANEL} .cc-tile[data-id=butter]`).evaluate((e) => e.classList.contains('is-next')), true, 'the right tile glows in its window');
        await shot('o2-order-butter-window'); await tap(b);
        await wait(page, 200); let st = await snap(page); assert.equal(st.taps.length, 1); assert.deepEqual(st.taps[0], { id: 'butter', heatOK: true, timeOK: true, word: 'now' });
        assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /Butter in, right on time/);
        assert.equal(await page.locator(`${PANEL} .cc-tile[data-id=butter]`).evaluate((e) => e.classList.contains('is-in')), true);
        // steak
        const stk = await when(); assert.equal(stk.id, 'steak'); await tap(stk, 'key'); await wait(page, 1500); await shot('o3-order-meat-on');
        st = await snap(page); assert.equal(st.taps.length, 2); assert.equal(st.taps[1].timeOK && st.taps[1].heatOK, true);
        // salt, then turn
        const salt = await when(); await tap(salt); await wait(page, 700); await shot('o4-order-salt'); const turn = await when(); await tap(turn, 'key');
        await wait(page, 300); st = await snap(page); assert.ok(st.done && st.how === 'done' && st.grade === 100, JSON.stringify(st));
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.pass, '1'); assert.ok(card.grade >= 95, `a steady hand sears it clean: ${card.text}`); assert.match(card.text, /Order: (perfect|clean)/i);
        await shot('o9-order-grade');
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Order \d+/); assert.match(fin, /scrap: 4 used/); assert.match(fin, /Crafting XP/);
        await shot('o10-order-result');
        await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.crafting > before.progress.xp.crafting || after.progress.levels.crafting > before.progress.levels.crafting, 'XP in Crafting');
        assert.match(after.said, /Order: you did it/);
        assert.ok(words.has('too early') && words.has('now'), `the word walks from too early to now: ${[...words]}`);
      });

      await sub('the wrong tile spoils the ingredient: the pan puffs, the recipe waits, the grade drops', async () => {
        await openMenu(); await pick();
        const wrong = await when({ shift: -1.5, id: 'salt' }); await tap(wrong);
        await wait(page, 250); await shot('o5-order-wrong-order');
        let st = await snap(page); assert.equal(st.wrongs, 1); assert.equal(st.next, 0, 'the recipe still waits for the butter'); assert.equal(st.taps.length, 0);
        assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /out of order: it is spoiled/i); assert.match(await page.locator(`${PANEL} .cc-nextstat`).innerText(), /butter/i);
        await finishDish(); await gradeCard();
        const g = await page.evaluate(() => ({ n: Number(document.querySelector('.cc-grade').dataset.grade), why: document.querySelector('.cc-why').innerText }));
        assert.equal(g.n, 85, `one spoil costs 15: ${g.n}`); assert.match(g.why, /1 out of order/);
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final'); await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('a pan left alone gets too hot: the word goes to burning, the pan smokes, and giving up is a zero', async () => {
        await openMenu(); await pick();
        await page.waitForFunction((sel) => /burning/i.test(document.querySelector(`${sel} .cc-nextstat em`).textContent), PANEL, { timeout: 40000 });
        await wait(page, 300); await shot('o6-order-burning');
        assert.equal(await page.locator(`${PANEL} .cc-nextstat`).evaluate((e) => e.dataset.state), 'burn');
        await go(`${PANEL} .cc-giveup`); await gradeCard(); assert.equal(await page.evaluate(() => document.querySelector('.cc-grade').dataset.grade), '0');
        await page.locator('.cc-grade .cc-go').click(); await wait(page, 300); await recover();
      });
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
