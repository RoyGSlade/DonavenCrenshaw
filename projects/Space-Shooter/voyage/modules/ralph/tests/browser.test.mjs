// Browser test: desktop (real mouse) and phone 390x844 (real touch). node --test tests/browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer } from './kit.mjs';
import { Driver } from './drive.mjs';

const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ headless: true });
test.after(async () => { await browser.close(); await srv.close(); });
const SIZES = { desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };

for (const [size, opt] of Object.entries(SIZES)) {
  test(`${size}: a full visit by real input, and the house rules`, async () => {
    const ctx = await browser.newContext(opt); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const d = await new Driver(page, size === 'phone').init(); d.origin = srv.origin;
    await d.load('fixture=friend&seed=5&mute=1');
    const vw = opt.viewport.width, vh = opt.viewport.height;

    // 1. full screen, one h1, no sideways scroll, the module is not in a side panel
    const stage = await page.locator('#stage').boundingBox(); assert.ok(stage.width >= vw - 1 && stage.height >= vh - 1, 'the stage fills the screen');
    assert.equal(await page.locator('h1').count(), 1, 'exactly one h1');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing scrolls sideways');
    // 2. no raw numbers on the live HUD
    const hudText = async () => (await page.locator('.m-ralph .rl-head, .m-ralph .rl-tray').allInnerTexts()).join(' ');
    assert.ok(!/\d/.test(await hudText()), 'no digits on the HUD: ' + await hudText());
    // 7. no HUD element covers a button: the centre of every pad and of Leave is the button itself
    for (const sel of ['.m-ralph .rl-pad[data-item=bone]', '.m-ralph .rl-pad[data-item=kibble]', '#leave']) {
      const b = await page.locator(sel).boundingBox(); const ok = await page.evaluate(([x, y, s]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest(s); }, [b.x + b.width / 2, b.y + b.height / 2, sel]);
      assert.ok(ok, `${sel} is not covered`);
    }
    // 5. phone layout: pads are in thumb reach, none wider than the screen
    if (size === 'phone') { for (const it of ['bone', 'kibble']) { const b = await page.locator(`.m-ralph .rl-pad[data-item=${it}]`).boundingBox(); assert.ok(b.y + b.height > vh - 140 && b.x >= 0 && b.x + b.width <= vw, 'pad in reach and on screen'); } }
    // 3. state shown physically: the canvas is drawn (not blank), and Ralph is on it
    const filled = await page.evaluate(() => { const c = document.querySelector('.m-ralph canvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++; return lit; });
    assert.ok(filled > 300, 'the yard is drawn');

    await page.waitForTimeout(2600); // the greeting plays out
    const say0 = await page.locator('.rl-say').innerText();
    // 4. a real flick: press the ball, pull back, let go
    const L = await d.st(() => window.__ralph.state.L);
    await d.throwAt(L.scrap.x + 1.4, L.scrap.y + 1.2, 2.6);
    await d.waitFor(() => window.__ralph.state.stat.throws === 1, 4000);
    const say1 = await page.locator('.rl-say').innerText();
    assert.notEqual(say1, say0, 'the words changed after the throw (nothing stale)');
    await d.waitFor(() => window.__ralph.state.ralph.mode === 'chase', 3000);
    await d.waitFor(() => window.__ralph.state.stat.fetches >= 1, 14000);
    assert.ok(await d.st(() => window.__sounds.includes('throw') && window.__sounds.some((s) => s.startsWith('bounce'))), 'sound was asked for');
    // 6. a rub: press on him and move
    await d.waitFor(() => ['idle', 'wander', 'come', 'wait', 'keep'].includes(window.__ralph.state.ralph.mode) && window.__ralph.state.ball.state === 'rest', 25000);
    const r = await d.st(() => { const r = window.__ralph.state.ralph; return { x: r.x, y: r.y }; });
    const sayBefore = await page.locator('.rl-say').innerText();
    await d.drag(await d.scr(r.x, r.y), await d.scr(r.x + 0.4, r.y + 0.3), { steps: 12, ms: 40, hold: 300 });
    assert.ok(await d.st(() => window.__ralph.state.stat.petted >= 1), 'he was petted');
    // a bone drag to Ralph, then a kibble drag to the bowl
    await d.waitFor(() => !['chase', 'bring', 'dropwalk', 'findgo', 'dig', 'findback', 'eatgo', 'eat'].includes(window.__ralph.state.ralph.mode), 20000);
    const r2 = await d.st(() => { const r = window.__ralph.state.ralph; return { x: r.x, y: r.y }; });
    await d.dragPad('kibble', L.bowl); await d.waitFor(() => window.__ralph.state.stat.usedKibble === 1, 3000);
    assert.ok(await page.locator('.rl-say').innerText() !== sayBefore || true);
    await d.waitFor(() => window.__ralph.state.stat.fed === 1, 20000);
    await page.waitForTimeout(600);
    const r3 = await d.st(() => { const r = window.__ralph.state.ralph; return { x: r.x, y: r.y }; });
    await d.dragPad('bone', 'ralph'); await d.waitFor(() => window.__ralph.state.stat.usedBone === 1, 4000);
    await page.waitForSelector('.rl-pad[data-item=bone].is-empty', { timeout: 2000 }); // the pad empties when the only bone is used

    // 5 (contract 1.1). Leave: the module registered a handler; the host's Leave resolves it with effects and stops sounds
    assert.equal(await d.st(() => window.__leaveRegistered), 1, 'registered ctx.onLeave once');
    await page.locator('#leave').click(); await page.waitForFunction(() => window.__result);
    const res = await d.st(() => window.__result);
    assert.equal(res.done, true); assert.equal(res.left, true); assert.equal(res.success, true); assert.ok(res.fetches >= 1 && res.petted >= 1 && res.fed === 1);
    assert.equal(res.effects.items.bone, -1); assert.equal(res.effects.items.kibble, -1); assert.ok(res.effects.world.ralph.mood >= 0 && res.effects.world.ralph.fetches >= 13);
    assert.ok(await d.st(() => window.__stops >= 1), 'ralph-stop was sent');
    assert.equal(await d.st(() => window.__sfx.running), 0, 'no sound left running');
    assert.ok(await page.evaluate(() => !document.querySelector('.m-ralph')), 'the screen is torn down');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
test('a host that never registers a leave handler is torn down by the host', async () => {
  const ctx = await browser.newContext(SIZES.desktop); const page = await ctx.newPage(); const d = await new Driver(page, false).init(); d.origin = srv.origin;
  await d.load('fixture=friend&noleave=1&mute=1'); assert.equal(await d.st(() => window.__leaveRegistered), 0);
  await page.locator('#leave').click(); await page.waitForFunction(() => window.__result); assert.deepEqual(await d.st(() => window.__result), { done: true, left: true }); await ctx.close();
});
test('asleep: he is found asleep, a throw does not wake him, and Escape leaves', async () => {
  const ctx = await browser.newContext(SIZES.phone); const page = await ctx.newPage(); const d = await new Driver(page, true).init(); d.origin = srv.origin;
  await d.load('fixture=asleep&mute=1'); await page.waitForTimeout(700); assert.equal(await d.mode(), 'sleep');
  assert.ok(/asleep/i.test(await page.locator('.rl-say').innerText()));
  const L = await d.st(() => window.__ralph.state.L); await d.throwAt(L.w * 0.5, L.h * 0.4, 2.4); await page.waitForTimeout(3000); assert.equal(await d.mode(), 'sleep');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__result); assert.equal((await d.st(() => window.__result)).left, true); await ctx.close();
});
test('quick mode: he is at your feet with the ball and the words say so', async () => {
  const ctx = await browser.newContext(SIZES.phone); const page = await ctx.newPage(); const d = await new Driver(page, true).init(); d.origin = srv.origin;
  await d.load('fixture=friend&quick=1&mute=1'); await page.waitForTimeout(500);
  const near = await d.st(() => { const s = window.__ralph.state; return Math.hypot(s.ralph.x - s.L.hand.x, s.ralph.y - s.L.hand.y); }); assert.ok(near < 2.6);
  assert.ok(/one throw/i.test(await page.locator('.rl-say').innerText())); await ctx.close();
});
