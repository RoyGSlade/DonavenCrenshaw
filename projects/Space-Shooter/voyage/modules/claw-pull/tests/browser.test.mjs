// Browser test: desktop with a real mouse and keys, phone at 390x844 with real touch (two fingers: the board and the Reel pad), the house rules
// (HOUSE-RULES.md), and one test that plays a drill result into the claw, start to finish.
//   STARDUST_BROWSER_TEST=1 PROOF_DIR=<folder> ~/Desktop/lhc-lanes/stardust/round3/browser-slot.sh ~/kauto-3d/bin/capped 6G timeout 880 \
//     node --test projects/Space-Shooter/voyage/modules/claw-pull/tests/browser.test.mjs
// Playwright comes from PLAYWRIGHT_MODULE (or the Codex runtime bundle). The test serves the module folder itself on a free local port.
// A bot (bots.js) plays the page's own game, and every move reaches the page as a real pointer, touch or key event.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadPlaywright, serve, inputFor, drive, MOD, DESK, PHONE } from './drive.mjs';
import { rleDecode } from '../board.js';

const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const fixtures = JSON.parse(readFileSync(path.join(MOD, 'fixtures.json'), 'utf8'));
const byName = (n) => fixtures.results.find((r) => r.name === n);
/** A drill result in the shape the drill hands the host: finds with freed and cracks, and the tunnel with its rows. */
const drillResult = (n) => { const r = byName(n); return { done: true, success: true, grade: r.grade, perfect: false, xp: 3, why: 'claw', finds: r.finds, tunnel: { ...r.tunnel, rows: rleDecode(r.tunnel.rle) }, chargeLeft: 0.4, turned: 0, canTurn: false, effects: {} }; };

async function newPage(browser, opt, qs, { audioSpy = false } = {}) {
  const ctx = await browser.newContext(opt);
  if (audioSpy) await ctx.addInitScript(() => { const A = window.AudioContext; window.__acs = []; window.AudioContext = class extends A { constructor(...a) { super(...a); window.__acs.push(this); } }; });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (qs != null) { await page.goto(`${srvOrigin}/test.html?auto=1&${qs}`); await page.waitForSelector('.m-claw-pull canvas', { timeout: 15000 }); await page.waitForTimeout(500); }
  return { ctx, page, errs };
}
let srvOrigin = '';
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: path.join(PROOF, `${name}.png`) }); };

/** House rules a page can be checked for, live: no digits on the HUD, no sideways scroll, buttons not covered, kit-framed pads. */
async function houseRules(page, phone, label) {
  const r = await page.evaluate(() => {
    const root = document.querySelector('.m-claw-pull'), vw = innerWidth;
    const live = [...root.querySelectorAll('.cp-status, .cp-grip, .cp-find-word, .cp-find small, .cp-grab, .cp-reel, .cp-intro')].map((e) => e.textContent.trim()).join(' | ');
    const centre = (e) => { const b = e.getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); };
    const covered = root.querySelector('.cp-card') ? [] : [...root.querySelectorAll('.cp-grab, .cp-reel')].filter((b) => { const t = centre(b); return !(t === b || b.contains(t)); }).map((b) => b.className);
    const btn = root.querySelector('.cp-reel'), cs = getComputedStyle(btn);
    const box = (sel) => { const e = root.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return {
      live, covered, boxShadow: cs.boxShadow, tap: cs.webkitTapHighlightColor, borderImage: cs.borderImageSource.includes('button'),
      scrollW: document.documentElement.scrollWidth, innerW: vw, rootBox: box(':scope') || (() => { const b = root.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; })(),
      top: box('.cp-top'), scope: box('.cp-scope'), find: box('.cp-find'), actions: box('.cp-actions'), side: box('.cp-side'), h1: document.querySelectorAll('h1').length,
      stage: (() => { const b = document.getElementById('stage').getBoundingClientRect(); return { w: b.width, h: b.height }; })(), vh: innerHeight,
    };
  });
  assert.ok(!/\d/.test(r.live), `${label}: digits on the live HUD: ${r.live}`);
  assert.deepEqual(r.covered, [], `${label}: a button is covered`);
  assert.equal(r.boxShadow, 'none', `${label}: pads use a drop-shadow glow, not box-shadow`);
  assert.ok(/transparent|rgba\(0, 0, 0, 0\)/.test(r.tap), `${label}: tap highlight ${r.tap}`);
  assert.ok(r.borderImage, `${label}: the pad uses the kit frame`);
  assert.ok(r.scrollW <= r.innerW, `${label}: scrolls sideways (${r.scrollW} > ${r.innerW})`);
  assert.equal(r.h1, 1, `${label}: exactly one h1`);
  assert.ok(Math.abs(r.stage.w - r.innerW) < 2 && Math.abs(r.stage.h - r.vh) < 2, `${label}: the stage is full screen`);
  assert.ok(r.rootBox.w >= r.innerW - 2 && r.rootBox.h >= r.vh - 2, `${label}: the game fills the stage`);
  if (phone) {
    // the play block is one grouped unit: no gap over 48 px between neighbouring blocks, and only the action row pins to the bottom
    const gap = (a, b) => b.top - a.bottom;
    assert.ok(gap(r.top, r.scope) <= 48, `top to scope gap ${gap(r.top, r.scope)}`);
    assert.ok(gap(r.scope, r.find) <= 48 && gap(r.scope, r.find) >= -2, `scope to find gap ${gap(r.scope, r.find)}`);
    assert.ok(gap(r.find, r.actions) <= 48, `find to actions gap ${gap(r.find, r.actions)}`);
    assert.ok(r.vh - r.actions.bottom <= 24, `the action row sits at the bottom (${r.vh - r.actions.bottom})`);
    assert.ok(r.scope.bottom - r.scope.top >= r.vh * 0.5, 'the board takes the spare height');
  }
  return r;
}

test('claw in the browser: desktop (mouse and keys), phone (touch), the house rules, and a drill result played into the claw', { skip, timeout: 880000 }, async () => {
  const { chromium } = await loadPlaywright();
  const srv = await serve(); srvOrigin = srv.origin;
  const browser = await chromium.launch();
  const allErrs = [];
  try {
    // ----------------------------------------------------------------- desktop: a wobbly hand with the mouse and the keyboard
    {
      const { ctx, page, errs } = await newPage(browser, DESK, 'seed=3&tier=0&fixture=wide-two-2');
      allErrs.push(errs);
      const input = inputFor(page, false, null);
      await houseRules(page, false, 'desktop start');
      await shot(page, 'desk-1-start-intro');
      // the first ten seconds: the claw is at the mouth; steering with the real mouse moves it
      const h0 = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { x: g.head.x, y: g.head.y }; });
      const to = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game, v = document.querySelector('.m-claw-pull').__view; const f = g.finds[0]; const p = v.toScreen(f.x, f.y); return p; });
      await page.mouse.move(700, 450); await page.mouse.down();
      for (let i = 0; i < 12; i++) { await page.mouse.move(700 + (to.x - 700) * 0.05 * (i + 1), 450 + (to.y - 450) * 0.05 * (i + 1)); await page.waitForTimeout(60); }
      await page.mouse.up();
      const h1 = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { x: g.head.x, y: g.head.y }; });
      assert.ok(Math.hypot(h1.x - h0.x, h1.y - h0.y) > 8, 'a real mouse drag moves the claw');
      assert.equal(await page.evaluate(() => document.querySelector('.cp-intro').classList.contains('is-gone')), true, 'the intro goes away at the first move');
      // arrows steer too
      await page.keyboard.down('ArrowDown'); await page.waitForTimeout(500); await page.keyboard.up('ArrowDown');
      let seenWords = new Set(); let tight = false, firstReel = false, lastPhase = '';
      const final = await drive(page, input, false, {
        bot: 'wobbly', botOpts: { salt: 2 }, maxMs: 150000,
        onTick: async (s, n) => {
          seenWords.add(await page.evaluate(() => document.querySelector('.cp-status').textContent));
          if (s.phase === 'in' && s.t > 2.5 && !tight && n % 1 === 0) { tight = true; await shot(page, 'desk-2-going-in-lamp'); }
          if (s.phase === 'reel' && !firstReel) { firstReel = true; await page.waitForTimeout(120); await shot(page, 'desk-3-jaws-closed'); }
          if (s.phase !== lastPhase) { lastPhase = s.phase; if (s.phase === 'land') await shot(page, 'desk-6-landing'); }
          if (n % 25 === 0) { const hr = await houseRules(page, false, `desktop ${s.phase}`); void hr; }
        },
      });
      await page.waitForTimeout(2400);
      await shot(page, 'desk-7-result-card');
      assert.ok(final.over || (await page.evaluate(() => document.querySelector('.m-claw-pull').__game.over)), 'the game ended');
      const res = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { over: g.over, passed: g.passed }; });
      assert.ok(res.over, 'the claw reached an end');
      assert.ok(seenWords.size >= 5, `the words change as you play: ${[...seenWords].join(' | ')}`);
      await houseRules(page, false, 'desktop card');
      assert.equal(await page.locator('.cp-card').count(), 1, 'the result card shows');
      await page.click('.cp-go');
      await page.waitForFunction(() => window.__result, null, { timeout: 5000 });
      const result = await page.evaluate(() => window.__result);
      assert.equal(result.done, true); assert.equal(typeof result.success, 'boolean'); assert.ok(result.grade >= 0 && result.grade <= 100);
      assert.ok(Array.isArray(result.pulled) && typeof result.dropped === 'number' && typeof result.knocks === 'number');
      const sounds = await page.evaluate(() => window.__sounds || []);
      assert.ok(sounds.length > 4 && sounds.includes('music:duck') && sounds.includes('music:unduck'), `the host hears the claw's sounds: ${sounds.slice(0, 6)}`);
      assert.deepEqual(errs, [], 'no page errors on desktop');
      await ctx.close();
    }

    // ----------------------------------------------------------------- phone: real touch, two fingers, a flat-out reel for the knock, the slip and the drop
    {
      const { ctx, page, errs } = await newPage(browser, PHONE, 'seed=5&tier=-1&fixture=tall-clean-3');
      allErrs.push(errs);
      const cdp = await ctx.newCDPSession(page);
      const input = inputFor(page, true, cdp);
      await houseRules(page, true, 'phone start');
      await shot(page, 'phone-1-start-intro');
      // a real tap and a real drag steer the claw; the first touch removes the intro
      const bx = await page.evaluate(() => { const r = document.querySelector('.cp-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.7 }; });
      const hp0 = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { x: g.head.x, y: g.head.y }; });
      await input.board(bx.x, bx.y, true); for (let i = 0; i < 14; i++) { await input.board(bx.x + i * 3, bx.y + i * 14, true); await page.waitForTimeout(60); } await input.board(0, 0, false);
      const hp1 = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { x: g.head.x, y: g.head.y }; });
      assert.ok(Math.hypot(hp1.x - hp0.x, hp1.y - hp0.y) > 6, 'a real touch drag moves the claw');
      let knockShot = false, dropShot = false, slipSeen = false, tightShot = false, jawsShot = false, lastK = 0, lastD = 0, gotWords = new Set();
      const final = await drive(page, input, true, {
        bot: 'lazy', maxMs: 100000, botOpts: { clean: true },
        onTick: async (s, n) => {
          gotWords.add(await page.evaluate(() => document.querySelector('.cp-status').textContent));
          if (s.phase === 'in' && s.t > 3 && !tightShot) { tightShot = true; await shot(page, 'phone-2-going-in-lamp'); }
          if (s.phase === 'reel' && !jawsShot) { jawsShot = true; await page.waitForTimeout(100); await shot(page, 'phone-3-jaws-closed'); }
          if (s.knocks > lastK) { lastK = s.knocks; const slip = await page.evaluate(() => document.querySelector('.cp-grip')?.dataset.level); if (slip && slip !== 'good') slipSeen = true; if (!knockShot && (slipSeen || s.knocks >= 2)) { knockShot = true; await shot(page, 'phone-5-knock-grip-slipping'); } }
          if (s.drops > lastD) { lastD = s.drops; if (!dropShot) { dropShot = true; await page.waitForTimeout(250); await shot(page, 'phone-6-drop'); } }
          if (n % 30 === 0) await houseRules(page, true, `phone ${s.phase}`);
        },
      });
      await page.waitForTimeout(2400);
      await shot(page, 'phone-8-result-card');
      const st = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { over: g.over, knocks: g.knocks, drops: g.drops, grabbed: g.grabbed }; });
      assert.ok(st.grabbed >= 1, 'the jaws closed by a real tap');
      assert.ok(st.knocks >= 1, `a flat-out reel knocks the load: ${JSON.stringify(st)}`);
      assert.ok(await page.evaluate(() => !!document.querySelector('.cp-card') || document.querySelector('.m-claw-pull').__game.over), 'it ended');
      assert.deepEqual(errs, [], 'no page errors on the phone');
      void final; void gotWords;
      await ctx.close();
    }

    // ----------------------------------------------------------------- phone, a careful hand: reel past a tight spot, then a clean pull
    {
      const { ctx, page, errs } = await newPage(browser, PHONE, 'seed=2&tier=2&fixture=tall-two-3');
      allErrs.push(errs);
      const cdp = await ctx.newCDPSession(page);
      const input = inputFor(page, true, cdp);
      let reelShot = 0, bayShot = false, lastPhase = '';
      await page.evaluate(async () => { window.__probe = (await import('./board.js')).probe; });
      const final = await drive(page, input, true, {
        bot: 'perfect', maxMs: 140000,
        onTick: async (s) => {
          if (s.phase === 'reel' && s.v > 50 && reelShot < 1) {
            const clr = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return window.__probe(g.board, g.head.x, g.head.y, 30).d; });
            if (clr < 12.5 || s.s < 160) { reelShot++; await shot(page, 'phone-4-reel-past-tight-spot'); }
          }
          if (s.phase !== lastPhase) { lastPhase = s.phase; if (s.phase === 'bay' && !bayShot) { bayShot = true; await page.waitForTimeout(150); await shot(page, 'phone-7-bay-choice'); } }
        },
      });
      await page.waitForTimeout(2400);
      await shot(page, 'phone-9-result-card-clean');
      const out = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { why: g.over?.why, passed: g.passed, outCount: g.outCount }; });
      assert.equal(out.passed, true, `the careful hand got it out: ${JSON.stringify(out)} ${JSON.stringify(final)}`);
      assert.deepEqual(errs, [], 'no page errors, careful hand');
      await ctx.close();
    }

    // ----------------------------------------------------------------- one test plays the drill's result into the claw, start to finish
    {
      const { ctx, page, errs } = await newPage(browser, DESK, null);
      allErrs.push(errs);
      await page.goto(`${srvOrigin}/test.html`);
      const dr = drillResult('wide-clean-2');
      await page.fill('#context', JSON.stringify({ rock: dr }));
      await page.selectOption('#tier', '1');
      await page.click('#open');
      await page.waitForSelector('.m-claw-pull canvas');
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { gw: g.board.gw, gh: g.board.gh, finds: g.finds.map((f) => [f.item, f.x, f.y, f.r, f.cracks]), open: g.board.openCount, entry: g.board.mouth }; });
      assert.equal(info.gw, dr.tunnel.w); assert.equal(info.gh, dr.tunnel.h);
      assert.deepEqual(info.finds.map((f) => f.slice(0, 5)), dr.finds.map((f) => [f.item, f.x, f.y, f.r, f.cracks]), 'the claw plays on the drill\'s finds');
      assert.deepEqual(info.entry, dr.tunnel.entry, "the mouth is the drill's entry");
      const input = inputFor(page, false, null);
      const final = await drive(page, input, false, { bot: 'perfect', maxMs: 140000 });
      await page.waitForTimeout(2400);
      await page.click('.cp-go');
      await page.waitForFunction(() => window.__result, null, { timeout: 5000 });
      const result = await page.evaluate(() => window.__result);
      assert.equal(result.success, true, `drill result into the claw: ${JSON.stringify(final)} ${JSON.stringify(result)}`);
      assert.equal(result.pulled[0].item, dr.finds[0].item);
      assert.deepEqual(Object.keys(result.effects.items)[0], dr.finds[0].item);
      assert.deepEqual(errs, []);
      await ctx.close();
    }

    // ----------------------------------------------------------------- quick mode, on a phone and on a desktop
    for (const [name, opt, phone, fx] of [['phone', PHONE, true, 'tall-quick-1'], ['desk', DESK, false, 'wide-quick-1']]) {
      const { ctx, page, errs } = await newPage(browser, opt, `seed=4&quick=1&tier=0&fixture=${fx}`);
      allErrs.push(errs);
      const cdp = phone ? await ctx.newCDPSession(page) : null;
      const input = inputFor(page, phone, cdp);
      const q = await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; return { finds: g.finds.length, quick: g.rules.quick }; });
      assert.equal(q.finds, 1); assert.equal(q.quick, true);
      let shotMid = false;
      const t0 = Date.now();
      await drive(page, input, phone, { bot: 'wobbly', maxMs: 60000, onTick: async (s) => { if (s.phase === 'reel' && !shotMid && s.v > 40) { shotMid = true; await shot(page, `${name}-quick-reel`); } } });
      const secs = (Date.now() - t0) / 1000;
      await page.waitForTimeout(2400); await shot(page, `${name}-quick-card`);
      assert.ok(secs < 40, `quick mode is short: ${secs.toFixed(1)} s`);
      assert.ok(await page.evaluate(() => document.querySelector('.m-claw-pull').__game.over), 'quick game ended');
      assert.deepEqual(errs, []);
      await ctx.close();
    }

    // ----------------------------------------------------------------- Leave: the host's handler stops the game and resolves { left: true }
    {
      const { ctx, page, errs } = await newPage(browser, DESK, 'seed=6&fixture=wide-clean-4', { audioSpy: true });
      allErrs.push(errs);
      await page.keyboard.down('Space'); await page.waitForTimeout(200); await page.keyboard.up('Space');
      await page.click('#leave');
      await page.waitForFunction(() => window.__result, null, { timeout: 5000 });
      const result = await page.evaluate(() => window.__result);
      assert.equal(result.left, true); assert.equal(result.done, true);
      assert.equal(await page.locator('.m-claw-pull').count(), 0, 'the stage is cleared');
      const acs = await page.evaluate(() => (window.__acs || []).map((a) => a.state));
      assert.ok(acs.length >= 1 && acs.every((x) => x === 'closed'), `Leave closes every AudioContext: ${acs}`);
      await page.waitForTimeout(400);
      assert.deepEqual(errs, []);
      await ctx.close();
    }
    for (const e of allErrs) assert.deepEqual(e, []);
  } finally { await browser.close(); await srv.close(); }
});
