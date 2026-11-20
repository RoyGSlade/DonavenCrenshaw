// Flatten in the REAL workbench page at 1440x900 (the real mouse and the real Space key) and 390x844 (real touch on the bubbles and the
// Swing pad, thumb drags to steer, through the DevTools protocol): the bench menu, a whole sheet flattened (aiming, charging with the
// lean, a flat hit, the result), a dimple from a blow that is too hard, a soft hit that shrinks the bubble, a blow that lands beside the
// bubble because the lean ran past the limit, and the layout rules (no gap over 48 px, no sideways scroll, chips wrap, the pad is the plain
// kit frame). The game runs on its own clock, so every decision about when to let go and where to steer is made from numbers read in the
// SAME page task as the position it sends. Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/bend/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-flatten-browser.test.mjs
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
const PANEL = '.cc-panel[data-game=flatten]';
const FLAT = '/projects/Space-Shooter/voyage/minigames/flatten.js';

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
const snap = (page) => page.evaluate((sel) => { const s = document.querySelector(sel)?.__state; return s ? { done: s.done, grade: s.result?.grade, how: s.result?.how, left: s.bubbles.length, dimples: s.dimples.length, swings: s.swings, N: s.N, seed: s.seed, selected: s.selected, charging: s.charging, bubbles: s.bubbles.map((b) => ({ id: b.id, need: b.need })) } : null; }, PANEL);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`flatten in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
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

    /** What the page says right now, computed in ONE page task: the picked bubble, the charge, the lean, and the exact steer that cancels it. */
    const probe = (mode) => page.evaluate(async ({ mode, FLAT, PANEL }) => {
      const F = await import(FLAT), p = document.querySelector(PANEL), s = p.__state, v = p.__view(), b = F.bubbleOf(s);
      const tn = performance.now() / 1000, tau = tn - s.t0, w = s.charging ? F.wander(s, tau + 0.02) : 0;
      const steer = Math.max(-1, Math.min(1, mode === 'true' ? -w / F.STEER_GAIN : mode === 'push' ? (w >= 0 ? 1 : -1) : 0));
      const pad = p.querySelector('.cc-swing').getBoundingClientRect(), bp = b ? v.at(b) : null;
      return { charging: s.charging, done: s.done, need: b?.need, band: s.band, power: s.charging ? Math.min(100, (100 * tau) / s.chargeTime) : 0, lean: s.charging ? F.leanOf(s, tn) : 0, steer, bx: bp?.x, by: bp?.y, boardW: v.w, padX: pad.left + pad.width / 2, padY: pad.top + pad.height / 2, padW: pad.width, word: p.querySelector('.cc-powerstat em').textContent, leanWord: p.querySelector('.cc-leanstat em').textContent, glow: Number(p.querySelector('.cc-swing').style.getPropertyValue('--glow')) };
    }, { mode, FLAT, PANEL });
    const pickBubble = async (id) => {
      const at = await page.evaluate(async ({ id, PANEL }) => { const p = document.querySelector(PANEL), s = p.__state, v = p.__view(), b = s.bubbles.find((x) => x.id === id); return v.at(b); }, { id, PANEL });
      if (phone) { await touch('touchStart', at.x, at.y); await touch('touchEnd'); } else { await page.mouse.move(at.x, at.y); await page.mouse.click(at.x, at.y); }
      await page.waitForFunction(({ id, PANEL }) => document.querySelector(PANEL).__state.selected === id, { id, PANEL });
    };
    /**
     * One swing by hand. Press (Space, or a finger on the Swing pad), then loop: read the page, steer (the mouse, or the thumb sliding on the pad),
     * and let go when the power reaches `at(need)`. `steer` is 'true' (cancel the drift), 'none' or 'push' (shove it the way it already leans); `leanAbove` lets go
     * as soon as the lean passes that size instead. `shotAt` takes a screenshot at that fraction of the way.
     */
    const swing = async ({ at = (n) => n, steer = 'true', leanAbove = null, shotAt = null, shotName = null } = {}) => {
      let p0 = await probe(steer);
      const half = (x) => Math.max(40, x * 0.42);
      if (phone) await touch('touchStart', p0.padX, p0.padY); else await page.keyboard.down(' ');
      let shot_ = false, words = new Set(), maxGlow = 0, last = null;
      for (let i = 0; i < 400; i++) {
        const p = await probe(steer); last = p; words.add(p.word); maxGlow = Math.max(maxGlow, p.glow);
        if (!p.charging) break;
        const target = at(p.need);
        if (leanAbove != null ? Math.abs(p.lean) > leanAbove : p.power >= target) break;
        if (p.power >= 100) break;
        if (shotAt != null && !shot_ && p.power >= p.need * shotAt) { shot_ = true; await shot(shotName); }
        if (phone) await touch('touchMove', p.padX + p.steer * half(p.padW), p.padY); else await page.mouse.move(p.bx + p.steer * Math.max(120, p.boardW * 0.22), p.by + 40);
      }
      if (phone) await touch('touchEnd'); else await page.keyboard.up(' ');
      return { last, words: [...words], maxGlow };
    };
    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const go = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };
    const openMenu = async () => { await recover(); await use(page, 'wb-craft'); await page.waitForSelector('.wb-c[data-craft="cut"]'); };
    const pick = async () => { await go('.wb-c[data-craft="flatten"]'); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(PANEL, { timeout: 15000 }); await wait(page, 600); };
    const gradeCard = () => page.waitForSelector('.cc-grade', { timeout: 60000 });
    /** Flatten whatever bubbles are left, each one with a true-steered swing at the right power. */
    const finishSheet = async () => {
      for (let guard = 0; guard < 12; guard++) {
        const st = await snap(page); if (st.done || !st.left) return;
        await pickBubble(st.bubbles[0].id); await swing(); await wait(page, 150);
      }
    };
    try {
      await bootRoom(page, server.origin);

      await sub('the bench menu lists Flatten between Bend and Bolt plate', async () => {
        await openMenu();
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-c')].map((b) => b.dataset.craft)), ['cut', 'screw', 'bend', 'flatten', 'polish', 'bolt-plate', 'heat']);
        assert.match(await page.locator('.wb-c[data-craft="flatten"]').innerText(), /Flatten a plate/);
        await shot('f0-bench-menu');
      });

      await sub('a whole sheet by hand: layout, plain words, aim, charge with the lean, flat hits, the result', async () => {
        const before = await state(page);
        await openMenu(); await pick();
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, chips: [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent) }));
        assert.match(m.eyebrow, /FLATTEN/); assert.ok(m.chips.some((c) => /Steady roll: a normal power band and lean/.test(c)), m.chips.join('|')); assert.ok(m.chips.some((c) => /Speed 0/.test(c)));
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        const text = await page.locator(PANEL).innerText();
        assert.doesNotMatch(text, /\d/, `no number anywhere on the game screen: ${text}`);
        assert.match(text, /pick a bubble/i); assert.match(text, /Power/i); assert.match(text, /Lean/i);
        // layout: one block, no gap over 48 px, nothing off the side, chips wrap, the Swing pad is the plain kit frame
        const lay = await page.evaluate((sel) => {
          const q = ['.wb-ftop', '.wb-fnote', '.cc-steps', '.cc-spoil', '.cc-flathud', '.cc-flatwrap', '.cc-status', '.cc-giverow', '.cc-flatrow', '.cc-chipbox'];
          const rows = q.map((x) => document.querySelector(`.wb-full ${x}`)).filter((e) => e && e.offsetParent && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.toString().split(' ')[0], top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).sort((a, b) => a.top - b.top);
          const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push({ between: `${rows[i - 1].c} > ${rows[i].c}`, px: rows[i].top - rows[i - 1].bottom });
          const chips = document.querySelector('.wb-full .cc-chips'), cv = document.querySelector(`${sel} canvas`).getBoundingClientRect(), pad = document.querySelector(`${sel} .cc-swing`), c = getComputedStyle(pad), pr = pad.getBoundingClientRect();
          return { gaps, maxGap: Math.max(0, ...gaps.map((g) => g.px)), below: innerHeight - rows[rows.length - 1].bottom, chipsClipped: chips.scrollWidth - chips.clientWidth, cvW: cv.width, cvH: cv.height, vw: innerWidth, sw: document.documentElement.scrollWidth, tap: c.webkitTapHighlightColor, box: c.boxShadow, padW: pr.width, padH: pr.height, art: c.borderImageSource };
        }, PANEL);
        assert.ok(lay.maxGap <= 48, `no gap over 48 px inside the play block: ${JSON.stringify(lay.gaps)}`);
        assert.ok(lay.sw <= lay.vw, `the page does not scroll sideways: ${lay.sw} > ${lay.vw}`); assert.ok(lay.chipsClipped <= 0, `the chips wrap and none is cut off: ${lay.chipsClipped}`);
        assert.ok(lay.below <= 24, `the last block sits at the bottom: ${lay.below}`);
        assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(lay.tap), `no tap highlight square: ${lay.tap}`); assert.equal(lay.box, 'none', 'no box shadow behind the pad');
        assert.ok(lay.padH >= 64 && lay.padW >= 160, `a big Swing pad: ${lay.padW} x ${lay.padH}`);
        if (phone) assert.ok(lay.cvW >= profile.viewport.width - 40 && lay.cvH >= 300, `the board is full width and tall on a phone: ${lay.cvW} x ${lay.cvH}`);
        await shot('f1-flatten-start');
        // aim: tap the first bubble
        const first = (await snap(page)).bubbles[0];
        await pickBubble(first.id);
        await wait(page, 200);
        assert.match(await page.locator(`${PANEL} .cc-powerstat`).innerText(), /hold swing/i);
        assert.equal(await page.locator(`${PANEL} .cc-swing`).evaluate((e) => e.classList.contains('is-next')), true, 'the Swing pad wakes when a bubble is picked');
        await wait(page, 250); await shot('f2-flatten-aim');
        // charge with the lean, steering against it, let go at the right power
        const out = await swing({ shotAt: 0.5, shotName: 'f3-flatten-charge-lean' });
        assert.ok(out.words.includes('too soft') && out.words.includes('just right'), `the power word walks from too soft to just right: ${out.words}`);
        assert.ok(out.maxGlow >= 0.99, 'the Swing pad glows full while the power is just right');
        await wait(page, 120); await shot('f4-flatten-flat-hit');
        let st = await snap(page);
        assert.equal(st.left, 4, 'the first bubble is flat'); assert.equal(st.dimples, 0); assert.equal(st.swings, 1);
        await finishSheet();
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.pass, '1'); assert.ok(card.grade >= 94, `a steady hand flattens it clean: ${card.text}`); assert.match(card.text, /Flatten: (perfect|clean)/i);
        await shot('f5-flatten-grade');
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        const fin = await page.locator('.cc-final').innerText();
        assert.match(fin, /Flatten \d+/); assert.match(fin, /scrap: 3 used/); assert.match(fin, /Crafting XP/);
        await shot('f6-flatten-result');
        await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.crafting > before.progress.xp.crafting || after.progress.levels.crafting > before.progress.levels.crafting, 'XP in Crafting');
        assert.match(after.said, /Flatten: you did it/);
      });

      await sub('a blow that is too hard leaves a dimple (and the bubble is gone), one too soft shrinks the bubble', async () => {
        await openMenu(); await pick();
        let st = await snap(page); const a = st.bubbles[0], b = st.bubbles[1];
        await pickBubble(a.id);
        await swing({ at: (n) => Math.min(100, n + 18) }); // too hard
        await wait(page, 200); await shot('f7-flatten-dimple');
        st = await snap(page);
        assert.equal(st.dimples, 1, JSON.stringify(st)); assert.equal(st.left, 4); assert.ok(!st.bubbles.some((x) => x.id === a.id), 'the bubble is gone');
        assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /dimple/i);
        assert.equal(await page.locator(`${PANEL} .cc-pips i.dent`).count(), 1, 'a dent pip');
        // too soft on the next bubble: it shrinks and stays
        await pickBubble(b.id);
        await swing({ at: (n) => n * 0.35 });
        await wait(page, 200);
        st = await snap(page); const nb = st.bubbles.find((x) => x.id === b.id);
        assert.ok(nb && nb.need < b.need, `the soft hit shrank it: ${b.need} -> ${nb?.need}`); assert.equal(st.dimples, 1, 'and made no dimple'); assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /too soft/i);
        await finishSheet(); await gradeCard();
        const g = await page.evaluate(() => Number(document.querySelector('.cc-grade').dataset.grade));
        assert.ok(g >= 70 && g <= 92, `a dimple (-8) and a few extra swings: ${g}`);
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final'); await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('a lean past the limit when you let go lands the blow beside the bubble', async () => {
        await openMenu(); await pick();
        const a = (await snap(page)).bubbles[0];
        await pickBubble(a.id);
        const out = await swing({ steer: 'push', leanAbove: 0.45 });
        await wait(page, 150);
        assert.match(out.last.leanWord, /too far|leaning/i);
        const st = await snap(page);
        assert.ok(st.swings === 1 && st.dimples === 0 && st.left === 6, `a light blow that leaned too far makes a small new bubble beside it: ${JSON.stringify(st)}`);
        assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /leaned too far/i);
        await shot('f8-flatten-lean-miss');
        await go(`${PANEL} .cc-giveup`); await gradeCard(); assert.equal(await page.evaluate(() => document.querySelector('.cc-grade').dataset.grade), '0');
        await page.locator('.cc-grade .cc-go').click(); await wait(page, 300); await recover();
      });
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
