// Polish in the REAL workbench page at 1440x900 (the real mouse dragging the plate, the real W A S D and Space keys) and 390x844 (real touch:
// a thumb dragging on the plate, a tap on the Done pad, through the DevTools protocol): the bench menu, a whole plate polished row by row
// until it finishes by itself (the wheel fighting the pull, tiles going from dull to bright), a tile heated until it warns and then dimples, the
// Done pad and Space, the keys, and the layout rules (no gap over 48 px, no sideways scroll, chips wrap, the Done pad is the plain kit frame).
// The game runs on its own clock, so every steering decision is made from numbers read in the SAME page task as the input it sends. Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/bend/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-polish-browser.test.mjs
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
const PANEL = '.cc-panel[data-game=polish]';
const STICK = 56;

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
const snap = (page) => page.evaluate((sel) => { const s = document.querySelector(sel)?.__state; return s ? { done: s.done, how: s.result?.how, grade: s.result?.grade, polished: s.polished, dimples: s.dimples, t: s.t, seed: s.seed, cols: s.cols, wheel: { ...s.wheel } } : null; }, PANEL);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`polish in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
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

    /** What the page says right now, in one page task: the wheel, the pull, the plate's numbers and every tile's shine. */
    const probe = () => page.evaluate(async (PANEL) => {
      const P = await import('/projects/Space-Shooter/voyage/minigames/polish.js'), p = document.querySelector(PANEL), s = p.__state, v = p.__view(), cv = p.querySelector('canvas').getBoundingClientRect();
      return { done: s.done, polished: s.polished, dimples: s.dimples, t: s.t, pull: P.pullAt(s, s.t), pullMax: s.pullMax, rate: s.rate, limit: s.limit, W: s.W, H: s.H, rows: s.rows, wx: s.wheel.x, wy: s.wheel.y, hot: !!P.hotCell(s), covered: P.coveredBy(s).map((c) => [c.i, Math.round(c.shine)]), cx: cv.left + cv.width / 2, cy: cv.top + cv.height * 0.8, plate: p.querySelector('.cc-platestat em').textContent, heat: p.querySelector('.cc-heatstat em').textContent, pullWord: p.querySelector('.cc-pullstat em').textContent, scale: v.scale };
    }, PANEL);
    /** A thumb or the mouse drag: down once at a spot on the plate, then every move is an offset from there (the floating stick). */
    let pointer = null;
    const dragStart = async (x, y) => { pointer = { x, y }; if (phone) await touch('touchStart', x, y); else { await page.mouse.move(x, y); await page.mouse.down(); } };
    const dragTo = async (ix, iy) => { const l = Math.hypot(ix, iy), k = l > 1 ? 1 / l : 1, x = pointer.x + ix * k * STICK, y = pointer.y + iy * k * STICK; if (phone) await touch('touchMove', x, y); else await page.mouse.move(x, y); };
    const dragEnd = async () => { if (!pointer) return; if (phone) await touch('touchEnd'); else await page.mouse.up(); pointer = null; };

    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const go = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };
    const openMenu = async () => { await recover(); await use(page, 'wb-craft'); await page.waitForSelector('.wb-c[data-craft="cut"]'); };
    const pick = async () => { await go('.wb-c[data-craft="polish"]'); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(PANEL, { timeout: 15000 }); await wait(page, 600); };
    const gradeCard = () => page.waitForSelector('.cc-grade', { timeout: 60000 });
    try {
      await bootRoom(page, server.origin);

      await sub('the bench menu lists Polish between Flatten and Bolt plate', async () => {
        await openMenu();
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-c')].map((b) => b.dataset.craft)), ['cut', 'screw', 'bend', 'flatten', 'polish', 'bolt-plate', 'heat']);
        assert.match(await page.locator('.wb-c[data-craft="polish"]').innerText(), /Polish a plate/);
        await shot('p0-bench-menu');
      });

      await sub('a whole plate by hand: layout, plain words, drag the wheel row by row against the pull until it finishes by itself', async () => {
        const before = await state(page);
        await openMenu(); await pick();
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, chips: [...document.querySelectorAll('.cc-chip')].map((c) => c.textContent) }));
        assert.match(m.eyebrow, /POLISH/); assert.ok(m.chips.some((c) => /Steady roll: a normal pull and dimple point/.test(c)), m.chips.join('|')); assert.ok(m.chips.some((c) => /Speed 0/.test(c)));
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        const text = await page.locator(PANEL).innerText();
        assert.doesNotMatch(text, /\d/, `no number anywhere on the game screen: ${text}`); assert.match(text, /keep going/i); assert.match(text, /Plate/i); assert.match(text, /Heat/i); assert.match(text, /Pull/i); assert.match(text, /Dimples/i);
        const lay = await page.evaluate((sel) => {
          const q = ['.wb-ftop', '.wb-fnote', '.cc-steps', '.cc-spoil', '.cc-polhud', '.cc-polwrap', '.cc-status', '.cc-giverow', '.cc-polrow', '.cc-chipbox'];
          const rows = q.map((x) => document.querySelector(`.wb-full ${x}`)).filter((e) => e && e.offsetParent && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.toString().split(' ')[0], top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).sort((a, b) => a.top - b.top);
          const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push({ between: `${rows[i - 1].c} > ${rows[i].c}`, px: rows[i].top - rows[i - 1].bottom });
          const chips = document.querySelector('.wb-full .cc-chips'), cv = document.querySelector(`${sel} canvas`).getBoundingClientRect(), pad = document.querySelector(`${sel} .cc-donepad`), c = getComputedStyle(pad), pr = pad.getBoundingClientRect(), plain = getComputedStyle(document.querySelector('.wb-full .wb-fleave'));
          return { gaps, maxGap: Math.max(0, ...gaps.map((g) => g.px)), below: innerHeight - rows[rows.length - 1].bottom, chipsClipped: chips.scrollWidth - chips.clientWidth, cvW: cv.width, cvH: cv.height, vw: innerWidth, sw: document.documentElement.scrollWidth, tap: c.webkitTapHighlightColor, box: c.boxShadow, padW: pr.width, padH: pr.height, art: c.borderImageSource, plainArt: plain.borderImageSource, plainSlice: c.borderImageSlice };
        }, PANEL);
        assert.ok(lay.maxGap <= 48, `no gap over 48 px inside the play block: ${JSON.stringify(lay.gaps)}`);
        assert.ok(lay.sw <= lay.vw, `the page does not scroll sideways: ${lay.sw} > ${lay.vw}`); assert.ok(lay.chipsClipped <= 0, `the chips wrap and none is cut off: ${lay.chipsClipped}`);
        assert.ok(lay.below <= 24, `the last block sits at the bottom: ${lay.below}`);
        assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(lay.tap), `no tap highlight square: ${lay.tap}`); assert.equal(lay.box, 'none', 'no box shadow behind the pad');
        assert.ok(lay.padH >= 64 && lay.padW >= 160, `a big Done pad: ${lay.padW} x ${lay.padH}`);
        if (phone) assert.ok(lay.cvW >= profile.viewport.width - 40 && lay.cvH >= 300, `the board is full width and tall on a phone: ${lay.cvW} x ${lay.cvH}`);
        assert.equal(await page.evaluate((s) => document.querySelector(s).__state.cols, PANEL), phone ? 5 : 8, 'a portrait plate on a phone, a wide one on a desktop');
        await shot('p1-polish-start');
        // the bot: row by row, back and forth, riding below each row's middle, at the net speed that lands a tile's shine in the safe part of the range
        const st = { row: 0, dir: 1, phase: 'start' }; let shotMid = false, shotPull = false, last = null, guard = 0;
        const t0 = Date.now(); const origin0 = await probe(); await dragStart(origin0.cx, origin0.cy);
        for (let i = 0; i < 6000; i++) {
          const p = await probe(); last = p; if (p.done) break;
          if (Date.now() - t0 > 180000) throw new Error(`the plate was not done in 3 minutes: ${JSON.stringify({ polished: p.polished, dimples: p.dimples, row: st.row })}`);
          if (st.row >= p.rows) { await dragEnd(); break; }
          const y = st.row * 100 + 82, dy = y - p.wy, iy = Math.max(-1, Math.min(1, dy / 25)), v = (101 * p.rate) / (70 + 0.35 * (p.limit - 70));
          let ix;
          if (st.phase === 'start') { ix = -1; if (p.wx <= 2 && Math.abs(dy) < 6) st.phase = 'sweep'; }
          else { ix = (st.dir > 0 ? v + p.pull : p.pull - v) / 220; if (st.dir > 0 ? p.wx >= p.W - 2 : p.wx <= 2) { st.row++; st.dir = -st.dir; } }
          if (!shotMid && p.polished >= 14) { shotMid = true; await shot('p2-polish-mid-plate'); }
          if (!shotPull && p.polished >= 6 && p.pull >= p.pullMax * 0.8) { shotPull = true; await wait(page, 50); await shot('p3-polish-pull-fighting'); }
          await dragTo(ix, iy); guard++;
        }
        await dragEnd();
        const fin = await snap(page);
        assert.ok(fin.done, 'the plate finished'); assert.ok(guard > 200, 'a real hand-steered run');
        assert.ok(fin.polished >= 28 && fin.dimples <= 2, `a steady hand polished it: ${JSON.stringify(fin)}`);
        await gradeCard();
        const card = await page.evaluate(() => ({ grade: Number(document.querySelector('.cc-grade').dataset.grade), pass: document.querySelector('.cc-grade').dataset.pass, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(card.pass, '1', card.text); assert.ok(card.grade >= 70, card.text); assert.match(card.text, /Polish: /i);
        await shot('p6-polish-grade');
        await go('.cc-grade .cc-go'); await page.waitForSelector('.cc-final');
        const text2 = await page.locator('.cc-final').innerText();
        assert.match(text2, /Polish \d+/); assert.match(text2, /scrap: 3 used/); assert.match(text2, /Crafting XP/);
        await shot('p7-polish-result');
        await go('.cc-final .cc-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.crafting > before.progress.xp.crafting || after.progress.levels.crafting > before.progress.levels.crafting, 'XP in Crafting');
        assert.match(after.said, /Polish: you did it/);
        assert.ok(last.t > 20, `a whole plate takes a while: ${last.t} s`);
      });

      await sub('grinding one tile glows it hot as a warning, then it dimples and stays dimpled; the Done pad (and Space) finish the plate', async () => {
        await openMenu(); await pick();
        // park the wheel on one tile: cancel the pull exactly and nudge to the tile's middle, until the tile warns, then until it dimples
        let hotShot = false, dimpleShot = false, st;
        const origin0 = await probe(); await dragStart(origin0.cx, origin0.cy);
        for (let i = 0; i < 3000; i++) {
          const p = await probe(); st = p; if (p.done) break;
          const tx = p.W / 2 + 50, ty = p.H / 2 + 50 * 0, dx = tx - p.wx, dy = ty - p.wy;
          const ix = Math.max(-1, Math.min(1, (dx * 3 + p.pull) / 220)), iy = Math.max(-1, Math.min(1, (dy * 3) / 220));
          if (p.hot && !hotShot) { hotShot = true; assert.equal(p.heat, 'too hot!', 'the word warns'); await wait(page, 60); await shot('p4-polish-about-to-dimple'); }
          if (p.dimples >= 1) { if (!dimpleShot) { dimpleShot = true; await wait(page, 150); await shot('p5-polish-dimple'); } break; }
          await dragTo(ix, iy);
        }
        await dragEnd();
        const mid = await snap(page);
        assert.ok(hotShot, 'the tile glowed hot first'); assert.equal(mid.dimples, 1, JSON.stringify(mid));
        assert.equal(await page.locator(`${PANEL} .cc-pips i.dent`).count(), 1, 'a dent pip'); assert.match(await page.locator(`${PANEL} .cc-status`).innerText(), /dimpled/i);
        // finish with Done: the pad on a phone, Space on a desktop
        if (phone) { const r = await page.locator(`${PANEL} .cc-donepad`).boundingBox(); await touch('touchStart', r.x + r.width / 2, r.y + r.height / 2); await touch('touchEnd'); } else await page.keyboard.press('Space');
        await gradeCard();
        const bad = await page.evaluate(() => ({ pass: document.querySelector('.cc-grade').dataset.pass, grade: document.querySelector('.cc-grade').dataset.grade, text: document.querySelector('.cc-grade').innerText }));
        assert.equal(bad.pass, '0'); assert.match(bad.text, /too rough/i); assert.match(bad.text, /Redo 1 of 2/);
        await page.locator('.cc-grade .cc-go').click(); await wait(page, 400);
        assert.equal(await page.locator('.cc-spoil').getAttribute('data-spoils'), '1', 'a spoil, and a fresh plate');
        assert.equal((await snap(page)).polished, 0);
        await recover();
      });

      if (!phone) await sub('W A S D steer the wheel and Space says Done', async () => {
        await openMenu(); await pick();
        const x0 = (await snap(page)).wheel, move = async (key, ms) => { await page.keyboard.down(key); await wait(page, ms); await page.keyboard.up(key); await wait(page, 60); return (await snap(page)).wheel; };
        const d = await move('d', 500); assert.ok(d.x > x0.x - 60 + 50 || d.x > x0.x - 10, `D drives right against the pull: ${x0.x} -> ${d.x}`);
        const w = await move('w', 400); assert.ok(w.y < d.y - 40, `W drives up: ${d.y} -> ${w.y}`);
        const s_ = await move('s', 400); assert.ok(s_.y > w.y + 40, `S drives down: ${w.y} -> ${s_.y}`);
        const a = await move('a', 400); assert.ok(a.x < s_.x - 20, `A drives left: ${s_.x} -> ${a.x}`);
        await page.keyboard.press('Space'); await gradeCard();
        await page.locator('.cc-grade .cc-go').click(); await wait(page, 300); await recover();
      });
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
