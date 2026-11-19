// Bend in the REAL workbench page at 1440x900 (real keys A, D, Space and the real mouse) and 390x844 (real touch on the two thumb
// pads and the Set button, through the DevTools protocol): the bench menu, a two-bend bracket pressed in the beat and set on the
// line, a kink from mashing (and the redo from a straight bar), a bend pressed past the line that cracks the piece and is redone on a
// fresh bar, and the result cards. The bots read the pure state only to know the angle and the target; the game runs on its own
// clock, so each press is timed from one schedule and the decision to stop is made in the same page task as the press.
// Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/bend/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-bend-browser.test.mjs
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
const sleepUntil = async (t) => { const d = t - performance.now(); if (d > 0) await new Promise((r) => setTimeout(r, d)); };
const PANEL = '.cc-panel[data-game=bend]';

async function bootRoom(page, origin) {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await wait(page, 1200);
  await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; }); // the d20 lands on 14: a Good roll
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
const bendState = (page) => page.evaluate((sel) => { const s = document.querySelector(sel)?.__state; return s ? { angle: s.angle, target: s.targets[Math.min(s.index, s.bends - 1)], index: s.index, bends: s.bends, kinks: s.kinks, strain: s.strain, done: s.done, next: s.lastKey ? (s.lastKey === 'a' ? 'd' : 'a') : 'a', presses: s.presses, good: s.good, rushed: s.rushed, slow: s.slow, seed: s.seed, grade: s.result?.grade, how: s.result?.how, sets: s.sets.map((x) => x.grade) } : null; }, PANEL);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`bend in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
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
    const center = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    /** A real press of a pad: a finger (touch) or the keyboard key; `how` 'mouse' clicks the pad with the real mouse. */
    const press = async (key, how = null) => {
      if (phone || how === 'touch') { const p = await center(`${PANEL} .cc-pad[data-key=${key}]`); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else if (how === 'mouse') { const p = await center(`${PANEL} .cc-pad[data-key=${key}]`); await page.mouse.click(p.x, p.y); }
      else await page.keyboard.press(key);
    };
    const set = async (how = null) => {
      if (phone || how === 'mouse') { const p = await center(`${PANEL} .cc-set`); if (phone) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else await page.mouse.click(p.x, p.y); }
      else await page.keyboard.press('Space');
    };
    /**
     * Bend by hand on the beat: A, D, A, D every `gap` seconds on one schedule, until the angle is `stopAt` degrees short of
     * (negative: past) the line, then Set. `half` takes a screenshot at that many degrees. Returns the state as it was set.
     */
    const bendTo = async (o = {}) => {
      const { gap = 0.31, past = 0, shotAt = null, shotName = null, doSet = true, how = null, setHow = null, firstDelay = 0.4 } = o;
      let at = performance.now() + firstDelay * 1000, shot_ = false, st;
      for (let i = 0; i < 200; i++) {
        st = await bendState(page);
        if (!st || st.done) return st;
        if (st.angle >= st.target + past) break;
        if (shotAt != null && !shot_ && st.angle >= st.target * shotAt) { shot_ = true; await shot(shotName); at = performance.now() + gap * 1000; }
        await sleepUntil(at); await press(st.next, how); at += gap * 1000;
      }
      st = await bendState(page);
      if (doSet && st && !st.done && st.angle <= st.target + 10) { await wait(page, 450); await set(setHow); }
      return st;
    };
    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const go = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };
    const openMenu = async () => { await recover(); await use(page, 'wb-craft'); await page.waitForSelector('.wb-c[data-craft="cut"]'); };
    const pick = async (id) => { await go(`.wb-c[data-craft="${id}"]`); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(PANEL, { timeout: 15000 }); await wait(page, 500); };
    const gradeCard = () => page.waitForSelector('.cc-grade', { timeout: 60000 });
    const noScroll = async (what) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${what}: no sideways scroll`);
    try {
      await bootRoom(page, server.origin);

      await sub('the bench menu lists Bend between Screw and Bolt plate', async () => {
        await openMenu();
        const crafts = await page.evaluate(() => [...document.querySelectorAll('.wb-c')].map((b) => b.dataset.craft));
        assert.deepEqual(crafts, ['cut', 'screw', 'bend', 'bolt-plate', 'heat']);
        assert.match(await page.locator('.wb-c[data-craft="bend"]').innerText(), /Bend a bracket/);
        await noScroll('menu'); await shot('0-bench-menu');
      });

      await sub('Bend by hand: full screen, plain words, press in the beat, set on the line, two bends, XP lands', async () => {
        const before = await state(page);
        await pick('bend');
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, chips: [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent), note: document.querySelector('.wb-preview').textContent }));
        assert.match(m.eyebrow, /BEND/); assert.ok(m.chips.some((c) => /Good roll: a wider rhythm window/.test(c)), m.chips.join('|')); assert.ok(m.chips.some((c) => /Speed 0/.test(c)));
        assert.match(m.note, /roll:/); assert.match(m.note, /rhythm window/);
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        const text = await page.locator(PANEL).innerText();
        assert.doesNotMatch(text, /\d/, `no number anywhere on the game screen: ${text}`);
        assert.match(text, /keep going/); assert.match(text, /Strain/); assert.match(text, /Gap to the line/);
        await noScroll('bend');
        // layout: the play block is grouped and centred, only the action row sits at the bottom, and it all fits on the screen
        const lay = await page.evaluate((sel) => { const q = (s) => document.querySelector(`${sel} ${s}`).getBoundingClientRect(); const hud = q('.cc-bendhud'), cv = q('canvas'), row = q('.cc-bendrow'), sc = document.querySelector('.wb-full').getBoundingClientRect(); return { hudBottom: hud.bottom, cvTop: cv.top, cvBottom: cv.bottom, cvW: cv.width, rowTop: row.top, rowBottom: row.bottom, vh: innerHeight, vw: innerWidth, scBottom: sc.bottom }; }, PANEL);
        assert.ok(lay.cvTop - lay.hudBottom < 24, `the HUD and the board stay together: ${JSON.stringify(lay)}`);
        assert.ok(lay.rowBottom <= lay.vh + 1 && lay.rowBottom >= lay.vh - 40, `the action row pins to the bottom: ${JSON.stringify(lay)}`);
        assert.ok(lay.cvBottom <= lay.rowTop + 1, 'the board does not run under the pads');
        if (phone) assert.ok(lay.cvW >= profile.viewport.width - 32, `the board is full width on a phone: ${lay.cvW}`);
        const padSize = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} .cc-pad, ${sel} .cc-set`)].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), PANEL);
        for (const [w, h] of padSize) assert.ok(w >= 80 && h >= 64, `thumb-size pads: ${padSize}`);
        await shot('1-bend-start');
        // bend one: pressed in the beat, a screenshot at about half the way, set square with the keyboard / the finger
        await bendTo({ shotAt: 0.5, shotName: '2-bend-mid', setHow: null, doSet: false });
        const mid = await bendState(page);
        assert.equal(mid.angle, mid.target, 'pressed in the beat all the way to the line'); assert.equal(mid.rushed, 0, JSON.stringify(mid)); assert.equal(mid.kinks, 0);
        assert.match(await page.locator(`${PANEL} .cc-gap`).evaluate((e) => e.parentElement.innerText), /on the line: set it/);
        await shot('3-bend-on-the-line');
        await wait(page, 450); await set(null);
        await wait(page, 120); await shot('4-bend-set');
        const afterSet = await bendState(page);
        assert.equal(afterSet.index, 1); assert.deepEqual(afterSet.sets, [100]); assert.equal(afterSet.angle, 0, 'a fresh bar for the second bend');
        // bend two: set it with the real mouse on the desktop (the pads and Set also take the mouse)
        await bendTo({ setHow: phone ? null : 'mouse', firstDelay: 0.6 });
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.pass, '1'); assert.equal(card.grade, 100, card.text); assert.match(card.text, /Bend: perfect/);
        await shot('5-bend-grade');
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Bend 100/); assert.match(fin, /scrap: 3 used/); assert.match(fin, /Crafting XP/);
        await shot('6-bend-result');
        await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.crafting > before.progress.xp.crafting || after.progress.levels.crafting > before.progress.levels.crafting, 'XP in Crafting');
        assert.match(after.said, /Bend: you did it/);
      });

      await sub('mashing kinks the bar (a shake, a snap, redone from straight, costs ten), the same key twice does nothing', async () => {
        await openMenu(); await pick('bend');
        // the same key twice does nothing
        await press('a'); await wait(page, 350); await press('a'); await wait(page, 100);
        let st = await bendState(page);
        assert.equal(st.presses, 1); assert.equal(st.angle, 2); assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /same key twice/);
        // press in the beat to a few degrees, then mash: the strain climbs and the bar kinks
        await press('d'); await wait(page, 300); await press('a'); await wait(page, 300);
        let k = 'd';
        for (let i = 0; i < 12; i++) { await press(k); k = k === 'd' ? 'a' : 'd'; await wait(page, 55); st = await bendState(page); if (i === 2) await shot('7-bend-strain-rising'); if (st.kinks) break; }
        st = await bendState(page);
        assert.equal(st.kinks, 1, JSON.stringify(st)); assert.equal(st.angle, 0, 'redone from a straight bar');
        const hot = await page.evaluate((sel) => document.querySelector(`${sel} .cc-status`).textContent, PANEL);
        assert.match(hot, /KINK/);
        await shot('8-bend-kink');
        // now bend it properly: the kink costs ten off the first bend
        await wait(page, 700);
        await bendTo({ firstDelay: 0.3 });
        st = await bendState(page);
        assert.equal(st.index, 1); assert.deepEqual(st.sets, [90], 'a kink costs ten off that bend');
        await bendTo({ firstDelay: 0.6 });
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.grade, 95, card.text); assert.match(card.text, /Bend: perfect/);
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final'); await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('pressing more than ten degrees past the line cracks the piece: too rough, a spoil, redone on a fresh bar', async () => {
        await openMenu(); await pick('bend');
        const first = await bendState(page);
        await bendTo({ past: 20, doSet: false, gap: 0.3 });
        await gradeCard();
        const bad = await page.evaluate(() => ({ pass: document.querySelector('.cc-grade').dataset.pass, grade: document.querySelector('.cc-grade').dataset.grade, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(bad.pass, '0'); assert.equal(bad.grade, '0'); assert.match(bad.text, /too rough/i); assert.match(bad.text, /cracked/i); assert.match(bad.text, /Redo 1 of 2/);
        await shot('9-bend-cracked-card');
        await go('.cc-grade .cc-go');
        await page.waitForFunction((a) => { const p = document.querySelector('.cc-panel[data-game=bend]'); return p && p.__state.seed !== a && !p.__state.done; }, first.seed);
        assert.equal(await page.locator('.cc-spoil').getAttribute('data-spoils'), '1');
        assert.match(await page.locator('.cc-step[data-state=now]').innerText(), /redo 1/);
        await bendTo({ firstDelay: 0.3 }); await bendTo({ firstDelay: 0.6 });
        await gradeCard(); assert.equal(await page.evaluate(() => document.querySelector('.cc-grade').dataset.pass), '1');
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Bend 100 \(try 2\)/); assert.match(fin, /Spoils: 1/); assert.match(fin, /scrap: 4 used \(3\.3 exact\)/);
        await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('Give up, and the other crafts are still on the menu', async () => {
        await openMenu(); await pick('bend');
        await go(`${PANEL} .cc-giveup`);
        await gradeCard();
        assert.equal(await page.evaluate(() => document.querySelector('.cc-grade').dataset.grade), '0');
        await page.locator('.cc-grade .cc-go').click(); await wait(page, 300); await recover();
        await openMenu(); await go('.wb-c[data-craft="cut"]'); await page.waitForSelector('.cc-panel[data-game=cut]', { timeout: 15000 });
        await go('.wb-leave'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
