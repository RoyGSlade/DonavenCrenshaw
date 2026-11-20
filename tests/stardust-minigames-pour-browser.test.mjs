// Pour in the REAL workbench page at 1440x900 (the real Space key) and 390x844 (real touch on the Pour pad, through the DevTools protocol): the
// bench menu, a whole batch poured clean (three glasses, a fresh one each time), a spill (the liquid goes over, the glass empties, pour it
// again), a short pour topped up, Give up, and the layout rules (no gap over 48 px, no sideways scroll, chips wrap, the panel fills the stage,
// no digits on the live HUD, the pad is the plain kit frame with a drop-shadow glow and no box shadow). The game runs on its own clock, so the
// moment to let go is decided from the page's own level in the SAME page task that lets go (a polling loop inside the page). Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/cooking/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-pour-browser.test.mjs
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
const PANEL = '.cc-panel[data-game=pour]';

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
const snap = (page) => page.evaluate((sel) => { const s = document.querySelector(sel)?.__state; return s ? { done: s.done, grade: s.result?.grade, how: s.result?.how, idx: s.idx, N: s.N, level: s.level, line: s.plan[Math.min(s.idx, s.N - 1)].line, spills: s.spills, presses: s.presses, topUps: s.topUps, holding: s.holding, pours: s.pours.map((p) => ({ outcome: p.outcome, grade: p.grade })), clean: s.clean, pass: s.pass } : null; }, PANEL);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`pour in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
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
    const padCentre = () => page.evaluate((sel) => { const r = document.querySelector(`${sel} .cc-pourpad`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, PANEL);
    /** Let the pad finish its rest after the last pour (the game does not accept a press for a moment). */
    const rested = () => page.waitForFunction((sel) => document.querySelector(`${sel} .cc-pourpad`)?.classList.contains('is-next'), PANEL);

    /**
     * One pour by hand. Press for real (Space, or a finger on the pad). Then ONE page task polls the page's own clock and, the moment the
     * level reaches `target(line, band)`, lets go in that same task (a keyup on the document, or a pointerup on the pad with the finger's id).
     * `holdPast` keeps holding until the page reports a spill. Returns what the page looked like on the way (words, glow) and the outcome.
     */
    const pour = async ({ target = (line) => line, holdPast = false, shotBelow = null, shotName = null } = {}) => {
      await rested();
      const pad = await padCentre();
      await page.evaluate((sel) => { window.__pid = null; document.querySelector(`${sel} .cc-pourpad`).addEventListener('pointerdown', (e) => { window.__pid = e.pointerId; }, { once: true, capture: true }); }, PANEL);
      if (phone) await touch('touchStart', pad.x, pad.y); else await page.keyboard.down(' ');
      const seen = { words: [], glow: 0, shotDone: false };
      const mid = page.evaluate(({ sel, target, holdPast, phone, shotBelow }) => new Promise((resolve) => {
        const p = document.querySelector(sel), s = p.__state, padEl = p.querySelector('.cc-pourpad'), words = new Set(), out = { glow: 0 };
        const tfn = new Function('line', 'clean', 'pass', `return (${target})(line, clean, pass)`);
        let shot = false;
        const tick = () => {
          const line = s.plan[Math.min(s.idx, s.N - 1)].line;
          words.add(p.querySelector('.cc-glassstat em').textContent); out.glow = Math.max(out.glow, Number(padEl.style.getPropertyValue('--glow')));
          if (shotBelow != null && !shot && s.level >= line - shotBelow) { shot = true; window.__shotNow = true; }
          const reached = holdPast ? (s.spills > 0 || s.spillWait) : s.level >= tfn(line, s.clean, s.pass);
          if (reached || !s.holding) {
            if (!holdPast || !s.holding) { /* nothing more to wait for */ }
            if (phone) padEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: window.__pid ?? 1, pointerType: 'touch', bubbles: true }));
            else document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
            resolve({ words: [...words], glow: out.glow, level: s.level, line });
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }), { sel: PANEL, target: target.toString(), holdPast, phone, shotBelow });
      // a screenshot at the requested fraction: the page raises a flag, we take the picture while the pour is still running
      let result = null; const waitMid = mid.then((r) => { result = r; });
      if (shotBelow != null) { await page.waitForFunction(() => window.__shotNow || false, null, { timeout: 15000 }).catch(() => {}); await shot(shotName); await page.evaluate(() => { window.__shotNow = false; }); }
      await waitMid;
      if (phone) await touch('touchEnd'); else await page.keyboard.up(' ');
      Object.assign(seen, result);
      return seen;
    };
    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const go = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };
    const openMenu = async () => { await recover(); await use(page, 'wb-craft'); await page.waitForSelector('.wb-c[data-craft="cut"]'); };
    const pick = async () => { await go('.wb-c[data-craft="pour"]'); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(PANEL, { timeout: 15000 }); await wait(page, 600); };
    const gradeCard = () => page.waitForSelector('.cc-grade', { timeout: 60000 });
    /** Pour whatever glasses are left, each one on the line. */
    const finishBatch = async () => { for (let guard = 0; guard < 8; guard++) { const st = await snap(page); if (st.done) return; await pour(); await wait(page, 150); } };
    try {
      await bootRoom(page, server.origin);

      await sub('the bench menu lists the kitchen entry between Polish and Bolt plate', async () => {
        await openMenu();
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-c')].map((b) => b.dataset.craft)), ['cut', 'screw', 'bend', 'flatten', 'polish', 'pour', 'steak', 'bolt-plate', 'heat']);
        assert.match(await page.locator('.wb-c[data-craft="pour"]').innerText(), /Mix a coolant flask/);
        assert.match(await page.locator('.wb-craftrow:has(.wb-c[data-craft="pour"]) .rp-help').innerText(), /Kitchen/);
        await shot('c0-bench-menu');
      });

      await sub('a whole batch by hand: layout, plain words, three glasses poured clean, the result', async () => {
        const before = await state(page);
        await openMenu(); await pick();
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, chips: [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent) }));
        assert.match(m.eyebrow, /KITCHEN|MIX A COOLANT FLASK/i); assert.ok(m.chips.some((c) => /Steady roll: normal clean and pass bands/.test(c)), m.chips.join('|')); assert.ok(m.chips.some((c) => /Speed 0: normal stream/.test(c)));
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        const text = await page.locator(PANEL).innerText();
        assert.doesNotMatch(text, /\d/, `no number anywhere on the game screen: ${text}`);
        assert.match(text, /hold to pour/i); assert.match(text, /Glass/i); assert.match(text, /Pours/i);
        const lay = await page.evaluate((sel) => {
          const q = ['.wb-ftop', '.wb-fnote', '.cc-steps', '.cc-spoil', '.cc-pourhud', '.cc-pourwrap', '.cc-status', '.cc-giverow', '.cc-pourrow', '.cc-chipbox'];
          const rows = q.map((x) => document.querySelector(`.wb-full ${x}`)).filter((e) => e && e.offsetParent && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.toString().split(' ')[0], top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).sort((a, b) => a.top - b.top);
          const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push({ between: `${rows[i - 1].c} > ${rows[i].c}`, px: rows[i].top - rows[i - 1].bottom });
          const chips = document.querySelector('.wb-full .cc-chips'), cv = document.querySelector(`${sel} canvas`).getBoundingClientRect(), pad = document.querySelector(`${sel} .cc-pourpad`), c = getComputedStyle(pad), pr = pad.getBoundingClientRect();
          const names = [...document.querySelectorAll(`${sel} .cc-chip, ${sel} .cc-stat`)].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 30));
          return { gaps, maxGap: Math.max(0, ...gaps.map((g) => g.px)), below: innerHeight - rows[rows.length - 1].bottom, chipsClipped: chips.scrollWidth - chips.clientWidth, clipped: names, cvW: cv.width, cvH: cv.height, vw: innerWidth, sw: document.documentElement.scrollWidth, panelW: document.querySelector(sel).getBoundingClientRect().width, stageW: document.querySelector('.wb-full .cc-stage').getBoundingClientRect().width, tap: c.webkitTapHighlightColor, box: c.boxShadow, padW: pr.width, padH: pr.height, art: c.borderImageSource };
        }, PANEL);
        assert.ok(lay.maxGap <= 48, `no gap over 48 px inside the play block: ${JSON.stringify(lay.gaps)}`);
        assert.ok(lay.sw <= lay.vw, `the page does not scroll sideways: ${lay.sw} > ${lay.vw}`); assert.ok(lay.panelW >= lay.stageW - 2, `the panel fills the stage width: ${lay.panelW} of ${lay.stageW}`);
        assert.ok(lay.chipsClipped <= 0, `the chips wrap and none is cut off: ${lay.chipsClipped}`); assert.deepEqual(lay.clipped, [], 'no chip or gauge text is clipped');
        assert.ok(lay.below <= 24, `the last block sits at the bottom: ${lay.below}`);
        assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(lay.tap), `no tap highlight square: ${lay.tap}`); assert.equal(lay.box, 'none', 'no box shadow behind the pad');
        assert.match(lay.art, /button-primary\.webp/, 'the plain kit frame');
        assert.ok(lay.padH >= 64 && lay.padW >= 160, `a big Pour pad: ${lay.padW} x ${lay.padH}`);
        if (phone) assert.ok(lay.cvW >= profile.viewport.width - 40 && lay.cvH >= 300, `the board is full width and tall on a phone: ${lay.cvW} x ${lay.cvH}`);
        await shot('c1-pour-start');
        // pad frames: after a hover (desktop) and during a press the border image is the same plain frame
        if (!phone) { await page.hover(`${PANEL} .cc-pourpad`); await wait(page, 120); assert.match(await page.locator(`${PANEL} .cc-pourpad`).evaluate((e) => getComputedStyle(e).borderImageSource), /button-primary\.webp/, 'hover keeps the plain frame'); await page.mouse.move(5, 5); }
        // the first glass: pour to the line, watching the words and the pad glow, one shot on the way
        const out = await pour({ shotBelow: 9, shotName: 'c2-pour-nearly', target: (line) => line + 3 });
        assert.ok(out.words.includes('keep pouring') && out.words.some((w) => /nearly|on the line/.test(w)), `the word walks from keep pouring toward the line: ${out.words}`);
        assert.ok(out.glow >= 0.99, 'the Pour pad glows full while the surface is on the line');
        await wait(page, 150);
        let st = await snap(page);
        assert.equal(st.idx, 1, 'the first glass is poured'); assert.equal(st.pours[0].outcome, 'clean'); assert.equal(st.pours[0].grade, 100);
        assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /Next: glycol|fresh glass/i);
        await wait(page, 900); await shot('c4-pour-fresh-glass');
        assert.equal(await page.locator(`${PANEL} .cc-pips i.on`).count(), 1, 'one ingredient pip is filled');
        const second = await pour({ shotBelow: 0, shotName: 'c3-pour-on-the-line', target: (line) => line + 3 });
        assert.ok(second.words.includes('on the line: stop'), `the word says to stop when the surface is on the line: ${second.words}`);
        await wait(page, 150); assert.equal((await snap(page)).pours[1].outcome, 'clean');
        await finishBatch();
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.pass, '1'); assert.ok(card.grade >= 95, `a steady hand pours it clean: ${card.text}`); assert.match(card.text, /Pour: (perfect|clean)/i);
        await shot('c8-pour-grade');
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Pour \d+/); assert.match(fin, /scrap: 3 used/); assert.match(fin, /Crafting XP/);
        await shot('c9-pour-result');
        await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.crafting > before.progress.xp.crafting || after.progress.levels.crafting > before.progress.levels.crafting, 'XP in Crafting');
        assert.match(after.said, /Pour: you did it/);
      });

      await sub('holding past the line spills: the glass empties, a dent shows, and you pour it again', async () => {
        await openMenu(); await pick();
        const before = await snap(page);
        const out = await pour({ holdPast: true });
        await wait(page, 220); await shot('c5-pour-spill');
        const over = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} .cc-stat`)].flatMap((st) => [...st.children].map((c) => ({ c: c.className || c.tagName, over: Math.round(c.getBoundingClientRect().right - st.getBoundingClientRect().right) }))).filter((x) => x.over > 0), PANEL);
        assert.deepEqual(over, [], 'nothing in a gauge box runs past its box, even with a dent pip and the ingredient name');
        let st = await snap(page);
        assert.equal(st.spills, 1, JSON.stringify(st)); assert.equal(st.idx, 0, 'still the first glass'); assert.equal(st.level, 0, 'the glass is empty');
        assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /spilled/i); assert.equal(await page.locator(`${PANEL} .cc-pips i.dent`).count(), 1, 'a dent pip');
        assert.ok(out.words.includes('keep pouring'));
        await wait(page, 900);
        await pour(); await wait(page, 150);
        st = await snap(page);
        assert.equal(st.idx, 1); assert.equal(st.pours[0].grade, 50, 'a spoiled ingredient: 100 less 50');
        await finishBatch(); await gradeCard();
        const g = await page.evaluate(() => Number(document.querySelector('.cc-grade').dataset.grade));
        assert.ok(Math.abs(g - 83.33) < 0.7, `(50 + 100 + 100) / 3: ${g}`); assert.match(await page.locator('.cc-why').innerText(), /1 spill/);
        assert.equal(before.spills, 0);
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final'); await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('a short pour can be topped up: the word says so, the first press is free, the second costs 5', async () => {
        await openMenu(); await pick();
        await pour({ target: (line) => line - 25 });
        await wait(page, 200);
        let st = await snap(page);
        assert.equal(st.idx, 0); assert.equal(st.presses, 1); assert.equal(st.pours.length, 0);
        assert.match(await page.locator(`${PANEL} .cc-glassstat`).innerText(), /top it up/i); assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /Short of the line/i);
        assert.match(await page.locator(`${PANEL} .cc-pourpad`).innerText(), /hold to top up/i);
        await shot('c6-pour-top-it-up');
        await pour();
        await wait(page, 200);
        st = await snap(page);
        assert.equal(st.idx, 1); assert.equal(st.pours[0].grade, 95, 'one press after the first: -5');
        await go(`${PANEL} .cc-giveup`); await gradeCard(); assert.equal(await page.evaluate(() => document.querySelector('.cc-grade').dataset.grade), '0');
        await shot('c7-pour-gave-up');
        await page.locator('.cc-grade .cc-go').click(); await wait(page, 300); await recover();
      });
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
