// Browser test: desktop 1440x900 with a real mouse and keys, phone 390x844 with real touch. The house rules in HOUSE-RULES.md.
// Run through the browser slot: browser-slot.sh capped 6G timeout 500 node --test tests/browser.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, DESKTOP, PHONE } from './kit.mjs';

let browser, srv;
before(async () => { const { chromium } = await loadPlaywright(); srv = await startServer(); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); await srv?.close(); });

async function open(profile, query = 'fixture=mel') {
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${srv.origin}/test.html?autoplay=1&${query}`);
  await page.waitForSelector('.m-shop-counter .sc-shutter', { state: 'attached' });
  const phone = Boolean(profile.hasTouch);
  const tap = async (sel) => { const l = page.locator(sel).first(); phone ? await l.tap({ timeout: 8000 }) : await l.click({ timeout: 8000 }); };
  const up = async () => { await page.waitForSelector('.sc-room.is-up'); await page.waitForTimeout(1250); };
  const view = () => page.evaluate(() => ({ till: document.querySelector('.sc-till .sc-digits').textContent, purse: document.querySelector('.sc-purse .sc-digits').textContent, pile: [...document.querySelectorAll('.sc-chip')].map((c) => c.dataset.id), mood: document.querySelector('.sc-room').dataset.mood, say: document.querySelector('.sc-say .sc-say-text')?.textContent || '' }));
  const leave = async () => { await page.locator('#leave').click(); await page.waitForFunction(() => window.__result); return page.evaluate(() => window.__result); };
  return { page, context, errors, phone, tap, up, view, leave };
}

for (const [name, profile] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: house rules`, async () => {
    const t = await open(profile);
    await t.up();
    const m = await t.page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const r = document.querySelector('.m-shop-counter').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.m-shop-counter button, #leave')].filter((b) => b.offsetParent !== null || getComputedStyle(b).position === 'fixed');
      const clipped = (b, cx, cy) => { for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll' || o === 'hidden') { const r2 = p.getBoundingClientRect(); if (cx < r2.left || cx > r2.right || cy < r2.top || cy > r2.bottom) return true; } } return false; };
      const covered = buttons.filter((b) => { const q = b.getBoundingClientRect(); if (!q.width || q.bottom < 0 || q.top > vh) return false; const cx = q.left + q.width / 2, cy = Math.min(Math.max(q.top + q.height / 2, 1), vh - 1); if (clipped(b, cx, cy)) return false; const e = document.elementFromPoint(cx, cy); return !(e && (b === e || b.contains(e))); }).map((b) => b.className || b.id);
      const digitNodes = [];
      const walker = document.createTreeWalker(document.querySelector('.m-shop-counter'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\d/.test(n.textContent) && !n.parentElement.closest('.sc-price,.sc-digits,.sc-till-top,.sc-chalk-deal,.sc-defs')) digitNodes.push(n.textContent.trim());
      return { full: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), vw, vh], sx: document.documentElement.scrollWidth <= vw && document.querySelector('.m-shop-counter').scrollWidth <= vw, h1: document.querySelectorAll('h1').length, covered, digitNodes, counterBottom: Math.round(document.querySelector('.sc-counter').getBoundingClientRect().bottom) };
    });
    assert.deepEqual(m.full, [0, 0, m.full[4], m.full[5], m.full[4], m.full[5]], 'rule 1: full screen');
    assert.equal(m.sx, true, 'rule 5: nothing scrolls sideways');
    assert.equal(m.h1, 1, 'rule 8: one h1');
    assert.deepEqual(m.covered, [], 'rule 7: nothing covers a button');
    assert.deepEqual(m.digitNodes, [], 'rule 2: digits only on price tags, the till and the purse');
    assert.equal(m.counterBottom, m.full[5], 'the counter is pinned to the bottom');
    assert.deepEqual(t.errors, []);
    await t.context.close();
  });

  test(`${name}: lift, pay, leave with real input`, async () => {
    const t = await open(profile);
    await t.up();
    await t.tap('.sc-slot[data-id=medkit]');
    await t.tap('.sc-slot[data-id=flak-vest]');
    await t.page.waitForTimeout(900);
    let v = await t.view();
    assert.deepEqual(v.pile.sort(), ['flak-vest', 'medkit']);
    assert.equal(v.till, '175');
    assert.equal(v.purse, '260', 'nothing is paid yet');
    await t.tap('.sc-chip[data-id=medkit]');
    await t.page.waitForTimeout(300);
    v = await t.view();
    assert.deepEqual(v.pile, ['flak-vest'], 'tap it on the counter to put it back');
    await t.tap('.sc-slot[data-id=medkit]');
    await t.page.waitForTimeout(600);
    await t.tap('.sc-pay');
    await t.page.waitForTimeout(1500);
    v = await t.view();
    assert.equal(v.purse, '85');
    assert.equal(v.till, '0');
    assert.equal(v.mood, 'happy');
    assert.match(v.say, /Don't scratch it/);
    assert.equal(await t.page.locator('.sc-slot[data-id=flak-vest].is-gone').count(), 1, 'the one vest is a dusty gap');
    const r = await t.leave();
    assert.deepEqual(r.effects.items, { medkit: 1, 'flak-vest': 1 });
    assert.equal(r.effects.world.moneyDelta, -175);
    assert.equal(r.left, true);
    assert.ok((await t.page.evaluate(() => window.__sounds)).includes('coins'));
    const played = await t.page.evaluate(() => ({ ok: window.__played, bad: window.__soundErrors }));
    for (const id of ['lift', 'knock', 'coins', 'till']) assert.ok(played.ok.includes(id), `${id} really played: ${JSON.stringify(played)}`);
    assert.deepEqual(played.bad.filter((b) => !b.startsWith('shutter:')), [], 'no sound failed to play (the shutter at autoplay=1 has no tap before it, so the browser may refuse it; opening from the Play button is a tap)');
    assert.deepEqual(t.errors, []);
    await t.context.close();
  });

  test(`${name}: broke, locked, and leaving with a full basket change nothing`, async () => {
    const t = await open(profile);
    await t.up();
    await t.tap('.sc-slot[data-id=scatter-pistol]');
    await t.tap('.sc-slot[data-id=bolt-carbine]');
    await t.page.waitForTimeout(600);
    await t.tap('.sc-pay');
    await t.page.waitForTimeout(500);
    let v = await t.view();
    assert.equal(v.purse, '260', 'broke: the purse is as it was');
    assert.equal(v.mood, 'annoyed');
    assert.match(v.say, /not enough money/);
    assert.equal(v.pile.length, 2, 'and the basket is left for you to change');
    await t.tap('.sc-slot[data-id=plated-coat]');
    await t.page.waitForTimeout(400);
    v = await t.view();
    assert.match(v.say, /Not for you/);
    assert.equal(v.pile.length, 2, 'locked never buys');
    const r = await t.leave();
    assert.equal(r.success, false);
    assert.equal(r.effects.world.moneyDelta, 0);
    assert.equal(r.effects.items, undefined);
    await t.context.close();
  });

  test(`${name}: haggle both ways, once`, async () => {
    for (const outcome of ['well', 'walked']) {
      const t = await open(profile, 'fixture=edna');
      await t.up();
      assert.equal(await t.page.locator('.sc-haggle:visible').count(), 0, 'nothing on the counter, nothing to haggle over');
      await t.tap('.sc-slot[data-id=nav-chip]');
      await t.page.waitForTimeout(700);
      assert.equal((await t.view()).till, '210', '280 less the 25 percent of the board');
      await t.tap('.sc-haggle');
      await t.page.waitForSelector('#picker:not([hidden])');
      const ask = await t.page.evaluate(() => window.__haggleAsk);
      assert.equal(ask.open, 210);
      assert.equal(ask.best, 168);
      await t.tap(`#picker button[data-o=${outcome}]`);
      await t.page.waitForTimeout(1300);
      const v = await t.view();
      assert.equal(v.till, outcome === 'well' ? '168' : '210');
      assert.equal(v.mood, outcome === 'well' ? 'happy' : 'annoyed');
      assert.equal(await t.page.locator('.sc-haggle:visible').count(), 0, 'the control is gone');
      assert.equal(await t.page.locator('.sc-stamp').innerText().then((s) => s.toLowerCase()), outcome === 'well' ? 'good deal' : 'no deal');
      await t.tap('.sc-pay');
      await t.page.waitForTimeout(900);
      const r = await t.leave();
      assert.equal(r.effects.world.moneyDelta, outcome === 'well' ? -168 : -210);
      assert.equal(r.haggle.outcome, outcome);
      assert.deepEqual(t.errors, []);
      await t.context.close();
    }
  });

  test(`${name}: selling your own goods`, async () => {
    const t = await open(profile);
    await t.up();
    if (profile.hasTouch) await t.tap('.sc-sellbtn');
    await t.tap('.sc-tray-item[data-k="tray:breach-kit"]');
    await t.page.waitForTimeout(500);
    assert.equal(await t.page.locator('.sc-offer .sc-price').innerText(), '60');
    await t.tap('.sc-take');
    await t.page.waitForTimeout(1300);
    const v = await t.view();
    assert.equal(v.purse, '320');
    assert.match(v.say, /Back already/);
    assert.equal(await t.page.locator('.sc-tray-item[data-k="tray:breach-kit"]').count(), 0);
    const r = await t.leave();
    assert.deepEqual(r.effects.items, { 'breach-kit': -1 });
    assert.equal(r.effects.world.moneyDelta, 60);
    await t.context.close();
  });

  test(`${name}: a shut shop shows its reason and only lets you leave; Esc leaves`, async () => {
    const t = await open(profile, 'fixture=stall&open=0');
    await t.page.waitForTimeout(1500);
    assert.match(await t.page.locator('.sc-shut-say').innerText(), /shutter is down/i);
    assert.equal(await t.page.locator('.sc-slot:visible').count(), 0, 'nothing to touch behind the shutter');
    const m = await t.page.evaluate(() => ({ sx: document.documentElement.scrollWidth <= innerWidth, h1: document.querySelectorAll('h1').length }));
    assert.deepEqual(m, { sx: true, h1: 1 });
    await t.page.keyboard.press('Escape');
    await t.page.waitForFunction(() => window.__result);
    const r = await t.page.evaluate(() => window.__result);
    assert.equal(r.left, true);
    assert.equal(r.success, false);
    await t.context.close();
  });

  test(`${name}: no ctx.play hides the haggle; quick mode hides it and the tray; reduced motion still works`, async () => {
    let t = await open(profile, 'fixture=mel&haggle=none');
    await t.up();
    await t.tap('.sc-slot[data-id=medkit]');
    await t.page.waitForTimeout(600);
    assert.equal(await t.page.locator('.sc-haggle:visible').count(), 0);
    await t.tap('.sc-pay');
    await t.page.waitForTimeout(800);
    assert.equal((await t.view()).purse, '225');
    await t.context.close();
    t = await open(profile, 'fixture=mel&quick=1');
    await t.page.waitForTimeout(400);
    assert.equal(await t.page.locator('.sc-sellbtn:visible, .sc-tray:visible, .sc-haggle:visible').count(), 0);
    assert.equal(await t.page.locator('.sc-room.is-up').count(), 1, 'quick: the shutter is already up');
    await t.context.close();
    t = await open(profile, 'fixture=mel&reduced=1');
    await t.page.waitForTimeout(300);
    await t.tap('.sc-slot[data-id=medkit]');
    await t.page.waitForTimeout(200);
    assert.deepEqual((await t.view()).pile, ['medkit']);
    await t.context.close();
  });
}

for (const [name, profile] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: no stale line, the face follows the line, the stamp goes on Pay`, async () => {
    const t = await open(profile, 'fixture=mel&haggle=fair');
    await t.up();
    await t.tap('.sc-slot[data-id=scatter-pistol]');
    await t.tap('.sc-slot[data-id=bolt-carbine]');
    await t.page.waitForTimeout(500);
    await t.tap('.sc-pay');
    await t.page.waitForTimeout(500);
    let v = await t.view();
    assert.match(v.say, /not enough money/);
    assert.equal(v.mood, 'annoyed');
    await t.tap('.sc-chip[data-id=bolt-carbine]');
    await t.page.waitForTimeout(400);
    assert.equal(await t.page.locator('.sc-say.is-empty').count(), 1, 'put one back: the broke line is gone');
    await t.tap('.sc-haggle');
    await t.page.waitForTimeout(900);
    assert.equal((await t.page.locator('.sc-stamp').innerText()).toLowerCase(), 'fair deal');
    assert.equal(await t.page.locator('.sc-say.is-empty').count(), 1, 'a fair deal with no line in the record: the stamp and the face, no bubble');
    assert.equal((await t.view()).mood, 'neutral');
    await t.tap('.sc-pay');
    await t.page.waitForTimeout(1000);
    v = await t.view();
    assert.match(v.say, /Don't scratch it/);
    assert.equal(await t.page.locator('.sc-stamp:not(:empty)').count(), 0, 'the stamp is gone after Pay');
    await t.tap('.sc-slot[data-id=plated-coat]');
    await t.page.waitForTimeout(500);
    v = await t.view();
    assert.match(v.say, /Not for you/);
    assert.equal(v.mood, 'neutral', 'the locked line is not said with a smile');
    if (profile.hasTouch) await t.tap('.sc-sellbtn');
    await t.tap('.sc-tray-item[data-k="tray:breach-kit"]');
    await t.page.waitForTimeout(500);
    assert.equal(await t.page.locator('.sc-say.is-empty').count(), 1, 'opening an offer closes the locked line');
    await t.context.close();
  });
}

test('desktop: the shelf units are as tall as what they hold, the keeper and counter take the rest', async () => {
  const t = await open(DESKTOP, 'fixture=stall');
  await t.up();
  const m = await t.page.evaluate(() => {
    const floor = document.querySelector('.sc-floor').getBoundingClientRect();
    return [...document.querySelectorAll('.sc-unit')].map((u) => { const r = u.getBoundingClientRect(); const last = [...u.querySelectorAll('.sc-slot')].pop(); const lr = last ? last.getBoundingClientRect() : r; return { h: Math.round(r.height), floorH: Math.round(floor.height), slackBelowLast: Math.round(r.bottom - lr.bottom) }; });
  });
  for (const u of m) assert.ok(u.slackBelowLast <= 40, `no bare boards under the last row: ${JSON.stringify(m)}`);
  assert.ok(m[1].h < m[1].floorH * 0.6, `the two-item unit is short: ${JSON.stringify(m)}`);
  await t.context.close();
});

for (const [name, profile] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: painted icons everywhere in Mel's locker, long ones laid out larger and at an angle, the parcel only where there is no picture`, async () => {
    let t = await open(profile);
    await t.up();
    await t.page.waitForTimeout(500);
    const m = await t.page.evaluate(() => {
      const fit = (id) => { const el = document.querySelector(`.sc-slot[data-id=${id}] .sc-icon`); return el ? [Number(el.style.getPropertyValue('--fit-sc')), el.style.getPropertyValue('--fit-tilt')] : null; };
      return { glyphs: document.querySelectorAll('.m-shop-counter .sc-glyph').length, imgs: document.querySelectorAll('.sc-slot .sc-icon').length, gun: fit('scatter-pistol'), rifle: fit('longshot'), carbine: fit('bolt-carbine'), medkit: fit('medkit'), vest: fit('plated-coat') };
    });
    assert.equal(m.glyphs, 0, 'no parcel in Mel\'s locker');
    assert.ok(m.imgs >= 10);
    for (const g of [m.gun, m.rifle, m.carbine]) { assert.ok(g[0] > 1.1, `a long gun is laid larger: ${g}`); assert.equal(g[1], '-8deg', 'and at a slight angle'); }
    assert.equal(m.medkit[0], 1, 'a squarish thing is left alone');
    assert.equal(m.vest[1], '0deg');
    await t.context.close();
    t = await open(profile, 'fixture=stall');
    await t.up();
    assert.ok(await t.page.locator('.sc-slot .sc-glyph').count() >= 4, 'the stall has no pictures: the parcel is the fallback');
    assert.equal(await t.page.locator('.sc-slot .sc-icon').count(), 0);
    await t.context.close();
  });

  test(`${name}: leaving follows contract 1.1 (ctx.onLeave registration)`, async () => {
    let t = await open(profile);
    await t.up();
    assert.equal(await t.page.evaluate(() => window.__leaveRegistered), 1, 'the module registered its handler once, at the start');
    assert.equal(await t.page.evaluate(() => typeof document.getElementById('stage').leave), 'undefined', 'no stage.leave any more');
    await t.tap('.sc-slot[data-id=medkit]');
    await t.page.waitForTimeout(500);
    await t.tap('.sc-pay');
    await t.page.waitForTimeout(700);
    const r = await t.leave();
    assert.equal(r.done, true);
    assert.equal(r.left, true);
    assert.equal(r.effects.world.moneyDelta, -35, 'the effects so far come with it');
    assert.equal(await t.page.locator('.m-shop-counter').count(), 0, 'torn down');
    await t.context.close();
    t = await open(profile, 'fixture=mel&noleave=1');
    await t.up();
    assert.equal(await t.page.evaluate(() => window.__leaveRegistered), 0, 'a host that offers no ctx.onLeave');
    await t.tap('.sc-slot[data-id=medkit]');
    await t.page.keyboard.press('Escape');
    await t.page.waitForFunction(() => window.__result);
    const e = await t.page.evaluate(() => window.__result);
    assert.equal(e.left, true, 'Esc still leaves');
    assert.equal(e.success, false);
    await t.context.close();
  });
}

test('phone: no gap over 48 px between neighbouring blocks, shelves scroll up and down only', async () => {
  const t = await open(PHONE);
  await t.up();
  const m = await t.page.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    const blocks = ['.sc-head', '.sc-who', '.sc-mid-top', '.sc-scroller', '.sc-counter'].map(box).filter(Boolean).sort((a, b) => a.top - b.top);
    const gaps = blocks.slice(1).map((b, i) => Math.round(b.top - blocks[i].bottom));
    const sc = document.querySelector('.sc-scroller');
    return { gaps, overflowX: getComputedStyle(sc).overflowX, scrolls: sc.scrollHeight > sc.clientHeight };
  });
  assert.ok(m.gaps.every((g) => g <= 48), `gaps ${m.gaps}`);
  const w = await t.page.evaluate(() => ({ unit: document.querySelector('.sc-unit-l').getBoundingClientRect().width, floor: document.querySelector('.sc-floor').getBoundingClientRect().width }));
  assert.ok(w.unit >= w.floor - 20, `the shelf fills the phone's width: ${JSON.stringify(w)}`);
  assert.equal(m.scrolls, true, 'ten items do not fit: the shelves scroll');
  assert.notEqual(m.overflowX, 'scroll');
  await t.page.locator('.sc-scroller').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  assert.equal(await t.page.evaluate(() => document.querySelector('.sc-scroller').scrollLeft), 0);
  await t.context.close();
});
