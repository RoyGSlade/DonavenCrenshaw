// Browser test: desktop with a real mouse and keys, phone at 390x844 with real touch. Checks the house rules, the play flows, Leave by
// contract 1.1 and that no sound is left running. Run: node --test tests/browser.test.mjs  (through the browser slot).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, DESKTOP, PHONE } from './kit.mjs';

let srv, browser;
before(async () => { const { chromium } = await loadPlaywright(); srv = await startServer(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await srv?.close(); });

async function session(size, query) {
  const ctx = await browser.newContext(size === 'phone' ? PHONE : DESKTOP);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${srv.origin}/test.html?autoplay=1&${query}`);
  await page.waitForSelector('.m-crate-look .cl-crate'); await page.waitForTimeout(500);
  const press = async (sel, o = {}) => { const l = page.locator(sel).first(); size === 'phone' ? await l.tap({ timeout: 6000, ...o }) : await l.click({ timeout: 6000, ...o }); };
  const say = () => page.locator('.cl-say').innerText();
  const openLid = async () => { await press('.cl-lid'); await page.waitForSelector('.cl-lid.is-off', { timeout: 6000 }); await page.waitForTimeout(400); };
  const leave = async () => { await page.locator('#leave').click(); await page.waitForFunction(() => window.__result, null, { timeout: 5000 }); return page.evaluate(() => window.__result); };
  return { ctx, page, errors, press, say, openLid, leave, size };
}
const SIZES = ['desktop', 'phone'];

for (const size of SIZES) {
  test(`${size}: house rules on the shut and the open crate`, async () => {
    const s = await session(size, 'fixture=wrongslip&points=0,1,0&level=9'); const { page } = s;
    for (const phase of ['shut', 'open']) {
      if (phase === 'open') await s.openLid();
      const m = await page.evaluate(() => {
        const vp = { w: innerWidth, h: innerHeight }; const root = document.querySelector('.m-crate-look').getBoundingClientRect();
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); };
        const hits = [];
        for (const el of document.querySelectorAll('.cl-btn, .cl-stack, .cl-tray-item, .cl-lid:not(.is-off), #leave')) {
          if (!visible(el)) continue; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          hits.push({ cls: el.className, ok: hit === el || el.contains(hit), tw: Math.round(r.width), th: Math.round(r.height) });
        }
        const rects = (sel) => [...document.querySelectorAll(sel)].filter(visible).map((e) => e.getBoundingClientRect());
        const hud = ['.cl-fill', '.cl-say', '.cl-tray', '.cl-actions', '.cl-owner'].map((q) => document.querySelector(q)?.innerText || '').join(' ');
        const styled = [...document.querySelectorAll('.cl-btn, .cl-tray-item, .cl-stack')].map((e) => { const c = getComputedStyle(e); return { box: c.boxShadow, tap: c.webkitTapHighlightColor }; });
        const crate = document.querySelector('.cl-crate').getBoundingClientRect(); const slip = document.querySelector('.cl-slip-wrap:not([hidden])')?.getBoundingClientRect(); const say = document.querySelector('.cl-say').getBoundingClientRect();
        const tray = document.querySelector('.cl-tray').getBoundingClientRect(); const act = document.querySelector('.cl-actions').getBoundingClientRect();
        return { vp, root: { w: root.width, h: root.height, l: root.left, t: root.top }, scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, h1: document.querySelectorAll('h1').length, hits, hud, styled,
          gaps: { crateToNext: (slip ? slip.top : say.top) - crate.bottom, sayToTray: tray.top - say.bottom, trayToActions: act.top - tray.bottom, actionsBottom: innerHeight - act.bottom }, actHeight: act.height, slip: Boolean(slip), vertical: tray.bottom > act.top };
      });
      assert.equal(m.h1, 1, `${phase}: exactly one h1`);
      assert.ok(Math.abs(m.root.w - m.vp.w) < 1 && Math.abs(m.root.h - m.vp.h) < 1 && m.root.l === 0 && m.root.t === 0, `${phase}: full screen`);
      assert.ok(m.scrollW <= m.vp.w && m.bodyW <= m.vp.w, `${phase}: nothing scrolls sideways`);
      for (const hit of m.hits) assert.ok(hit.ok, `${phase}: ${hit.cls} is not covered by another element`);
      assert.ok(!/\d/.test(m.hud), `${phase}: no digits on the live HUD ("${m.hud.replace(/\s+/g, ' ')}")`);
      for (const st of m.styled) { assert.equal(st.box, 'none', 'no box-shadow'); assert.match(st.tap, /rgba\(0, 0, 0, 0\)|transparent/, 'tap highlight is transparent'); }
      if (size === 'phone') { assert.ok(m.gaps.crateToNext <= 48, `${phase}: gap under the crate ${Math.round(m.gaps.crateToNext)}px`); assert.ok(m.gaps.sayToTray <= 48, `${phase}: say to tray ${Math.round(m.gaps.sayToTray)}px`); assert.ok(m.gaps.actionsBottom <= 48, `${phase}: action row is pinned low`); for (const hit of m.hits) if (/cl-stack|cl-tray-item|cl-btn/.test(hit.cls)) assert.ok(hit.tw >= 40 && hit.th >= 40, `${phase}: ${hit.cls} is a thumb-sized target (${hit.tw}x${hit.th})`); }
    }
    assert.deepEqual(s.errors, []); await s.ctx.close();
  });

  test(`${size}: lift the lid, take one, hold for all, put back, chalk, shut, leave`, async () => {
    const s = await session(size, 'fixture=ore'); const { page } = s;
    const said = [await s.say()]; assert.match(said[0], /lift the lid/i);
    assert.equal(await page.locator('.cl-stack').count(), 0, 'nothing to take through a shut lid');
    await s.press('.cl-lid'); await page.waitForSelector('.cl-lid.is-off'); await page.waitForTimeout(400);
    said.push(await s.say()); assert.match(said[1], /lid off/i);
    assert.equal(await page.locator('.cl-stack').count(), 2); assert.equal(await page.locator('.cl-latch.is-open').count(), 3, 'all three latches flipped');
    // take one
    await s.press('.cl-stack[data-item=ore]'); await page.waitForTimeout(700);
    assert.equal(await page.locator('.cl-stack[data-item=ore]').getAttribute('data-qty'), '8'); assert.equal(await page.locator('.cl-tray-item[data-item=ore]').count(), 1);
    said.push(await s.say()); assert.match(said[2], /Took .*Eight left/i);
    // hold for all (real press and hold)
    const box = await page.locator('.cl-stack[data-item=scrap]').boundingBox();
    if (size === 'phone') { await page.touchscreen.tap(1, 1); } // (touch hold is driven below with pointer events)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (size === 'desktop') { await page.mouse.down(); await page.waitForTimeout(250); assert.equal(await page.locator('.cl-stack.is-holding').count(), 1, 'a ring fills while you hold'); await page.waitForTimeout(500); await page.mouse.up(); }
    else { await page.evaluate(() => { const el = document.querySelector('.cl-stack[data-item=scrap]'); const r = el.getBoundingClientRect(); const o = { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', o)), 800); }); await page.waitForTimeout(1100); }
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.cl-stack[data-item=scrap]').count(), 0, 'the whole stack went'); assert.match(await s.say(), /Took all/i);
    assert.ok((await page.evaluate(() => window.__result)) === null);
    // the bag has room for 8: it held 3, took 1 + 4 = 8: now full, so one more is refused and says so
    await s.press('.cl-stack[data-item=ore]'); await page.waitForTimeout(400); assert.match(await s.say(), /bag is full/i); assert.equal(await page.locator('.cl-stack[data-item=ore]').getAttribute('data-qty'), '8');
    // put one back
    await s.press('.cl-tray-item[data-item=scrap]'); await page.waitForTimeout(500);
    assert.equal(await page.locator('.cl-stack[data-item=scrap]').getAttribute('data-qty'), '1'); assert.match(await s.say(), /Put .* in the crate/i);
    // chalk cycles, and what the screen says changes each time
    const chalks = []; for (let i = 0; i < 4; i++) { await s.press('.cl-chalkbtn'); await page.waitForTimeout(150); chalks.push(await s.say()); }
    assert.deepEqual(chalks.map((c) => c.replace(/\.$/, '')), ['Chalked it: keep', 'Chalked it: sell', 'Chalked it: scrap', 'Chalk wiped off']);
    await s.press('.cl-chalkbtn'); await page.waitForTimeout(500); assert.equal(await page.locator('.cl-chalk').getAttribute('data-tag'), 'keep');
    // shut, and open again
    await s.press('.cl-lidbtn'); await page.waitForTimeout(1500); assert.equal(await page.locator('.cl-stack').count(), 0); assert.match(await s.say(), /Lid shut/i); assert.equal(await page.locator('.cl-latch.is-open').count(), 0);
    await s.press('.cl-lidbtn'); await page.waitForSelector('.cl-lid.is-off'); await page.waitForTimeout(500); assert.equal(await page.locator('.cl-stack').count(), 2);
    // never a stale line: every said line differed from the one before it
    const all = [...said]; for (let i = 1; i < all.length; i++) assert.notEqual(all[i], all[i - 1]);
    // leave through the host's button
    const r = await s.leave();
    assert.equal(r.done, true); assert.equal(r.left, true); assert.equal(r.success, true); assert.equal(r.grade, 100);
    assert.deepEqual(r.took, { ore: 1, scrap: 4 }); assert.deepEqual(r.put, { scrap: 1 }); assert.equal(r.tag, 'keep');
    assert.deepEqual(r.effects.items, { ore: 1, scrap: 3 }); assert.deepEqual(r.effects.world.crates['crate-7'].contents, [{ item: 'ore', qty: 8 }, { item: 'scrap', qty: 1 }]);
    assert.equal(await page.evaluate(() => window.__leaveRegistered), 1, 'registered once through ctx.onLeave');
    assert.equal(await page.locator('.m-crate-look').count(), 0, 'torn down');
    const sounds = await page.evaluate(() => window.__sounds); for (const id of ['latch', 'creak', 'thud', 'straw', 'thunk', 'chalk']) assert.ok(sounds.includes(id), `sound ${id} was asked for`);
    assert.ok((await page.evaluate(() => window.__played)).includes('latch'), 'the sounds really played through the host');
    await page.waitForTimeout(1800); assert.equal(await page.evaluate(() => window.__voices()), 0, 'no sound left running');
    assert.deepEqual(s.errors, []); await s.ctx.close();
  });

  test(`${size}: a sealed crate says why and does nothing but leave`, async () => {
    const s = await session(size, 'fixture=sealed'); const { page } = s;
    assert.equal(await page.locator('.cl-notice').count(), 1); assert.match(await page.locator('.cl-notice').innerText(), /Customs seal/);
    await s.press('.cl-lid'); await page.waitForTimeout(700);
    assert.equal(await page.locator('.cl-stack').count(), 0); assert.equal(await page.locator('.cl-chalkbtn').isVisible(), false); assert.match(await s.say(), /Customs seal/);
    assert.equal(await page.locator('.cl-lid.is-off').count(), 0, 'the lid stays on');
    await s.press('.cl-backbtn'); await page.waitForFunction(() => window.__result);
    const r = await page.evaluate(() => window.__result); assert.equal(r.left, true); assert.equal(r.success, false); assert.deepEqual(r.effects, { items: {}, world: {} });
    assert.deepEqual(s.errors, []); await s.ctx.close();
  });

  test(`${size}: Perception paths change what you see, and an empty crate says so`, async () => {
    let s = await session(size, 'fixture=wrongslip&points=0,1,0&level=9'); await s.openLid();
    assert.ok(await s.page.locator('.cl-sl.is-more').count() >= 1 && await s.page.locator('.cl-sl.is-missing').count() === 1 && await s.page.locator('.cl-sl.is-less').count() === 1, 'Inspection marks the slip');
    assert.equal(await s.page.locator('.cl-notslip').count(), 1, 'a thing not on the slip is tagged'); assert.equal(await s.page.locator('.cl-stack[data-item=nav-chip]').count(), 0, 'the hidden thing is still buried'); await s.ctx.close();
    s = await session(size, 'fixture=wrongslip&points=1,0,0&level=9'); await s.openLid();
    assert.equal(await s.page.locator('.cl-stack.is-glint[data-item=nav-chip]').count(), 1, 'Awareness: a glint through the straw'); assert.equal(await s.page.locator('.cl-sl.is-more').count(), 0); await s.ctx.close();
    s = await session(size, 'fixture=food&points=0,0,1&level=9'); await s.openLid(); assert.match(await s.page.locator('.cl-tagcard').innerText(), /notice/i); await s.ctx.close();
    s = await session(size, 'fixture=wrongslip'); await s.openLid(); assert.equal(await s.page.locator('.cl-sl.is-more').count(), 0); assert.equal(await s.page.locator('.cl-tagcard').count(), 0);
    for (let i = 0; i < 5 && !(await s.page.locator('.cl-stack[data-item=nav-chip]').count()); i++) { await s.press('.cl-stack[data-item=hull-patch]'); await s.page.waitForTimeout(300); }
    assert.equal(await s.page.locator('.cl-stack[data-item=nav-chip]').count(), 1, 'taking what lies on top uncovers it'); assert.match(await s.say(), /under the straw/i); await s.ctx.close();
    s = await session(size, 'fixture=empty'); await s.openLid(); assert.match(await s.page.locator('.cl-fillword').innerText(), /empty/i); assert.ok(await s.page.locator('.cl-dr').count() >= 1, 'dressed by seed'); assert.equal(await s.page.locator('.cl-stack').count(), 0); await s.ctx.close();
  });

  test(`${size}: quick mode: lid already off, look and take only`, async () => {
    const s = await session(size, 'fixture=ore&quick=1'); const { page } = s;
    assert.equal(await page.locator('.cl-lid.is-off').count(), 1); assert.equal(await page.locator('.cl-stack').count(), 2);
    assert.equal(await page.locator('.cl-chalkbtn').isVisible(), false); assert.equal(await page.locator('.cl-lidbtn').isVisible(), false);
    await s.press('.cl-stack[data-item=ore]'); await page.waitForTimeout(600); assert.equal(await page.locator('.cl-stack[data-item=ore]').getAttribute('data-qty'), '8');
    await s.press('.cl-tray-item[data-item=ore]'); await page.waitForTimeout(300); assert.equal(await page.locator('.cl-stack[data-item=ore]').getAttribute('data-qty'), '8', 'no putting in');
    const r = await s.leave(); assert.deepEqual(r.effects.items, { ore: 1 }); assert.deepEqual(s.errors, []); await s.ctx.close();
  });
}

test('desktop keys: Tab and Enter open the lid and take; Escape leaves', async () => {
  const s = await session('desktop', 'fixture=ore'); const { page } = s;
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.className.includes('cl-lid')), true, 'the lid is first in the tab order');
  await page.keyboard.press('Enter'); await page.waitForSelector('.cl-lid.is-off'); await page.waitForTimeout(400);
  await page.locator('.cl-stack[data-item=ore]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500); assert.equal(await page.locator('.cl-stack[data-item=ore]').getAttribute('data-qty'), '8');
  await page.keyboard.press('Shift+Enter'); await page.waitForTimeout(500); assert.ok(Number(await page.locator('.cl-stack[data-item=ore]').getAttribute('data-qty')) < 8, 'shift+Enter takes all that fits');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__result); const r = await page.evaluate(() => window.__result);
  assert.equal(r.left, true); assert.ok(r.took.ore >= 2); assert.deepEqual(s.errors, []); await s.ctx.close();
});

test('desktop: dragging the lid up lifts it; a short drag springs back', async () => {
  const s = await session('desktop', 'fixture=ore'); const { page } = s;
  const b = await page.locator('.cl-lid').boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height * 0.5;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 20, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(500);
  assert.equal(await page.locator('.cl-lid.is-off').count(), 0, 'a short drag does not open it');
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 90, { steps: 6 }); await page.mouse.up(); await page.waitForSelector('.cl-lid.is-off', { timeout: 5000 });
  assert.equal(await page.locator('.cl-stack').count(), 2); await s.ctx.close();
});

test('a host that never registers onLeave still works: the host tears down and resolves', async () => {
  const s = await session('desktop', 'fixture=ore&noleave=1'); await s.page.locator('#leave').click(); await s.page.waitForFunction(() => window.__result);
  const r = await s.page.evaluate(() => window.__result); assert.equal(r.done, true); assert.equal(r.left, true); await s.ctx.close();
});
