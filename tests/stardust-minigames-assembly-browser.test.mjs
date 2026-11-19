// Assembly repair in the REAL workbench page at 1440x900 (real mouse, Q/E and the wheel) and 390x844 (real touch through the DevTools protocol):
// the repair bench menu, the full-screen overlay, a part picked and turned, a wrong part bouncing off, a part snapped in, a bolt dragged to its hole,
// the real Screw game running in the same overlay, the next socket showing, the result card, and the lost state. The fingers are real input; the
// bot reads the pure state only to know where things are. Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/assembly/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-assembly-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const M = `${V}minigames/assembly.js`;
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const wait = (page, ms) => page.waitForTimeout(ms);

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
const S = (page) => page.evaluate(() => { const s = document.querySelector('.asm-panel').__state; return { phase: s.phase, active: s.active, wrong: s.wrongFits, wrongTurns: s.wrongTurns, stripped: s.stripped, selected: s.selected, done: s.done, t: s.t, clock: s.clock, layout: s.layoutKind, parts: s.sockets.length, bolts: (s.bolts || []).map((b) => ({ id: b.id, seated: b.seated, tight: b.tight })) }; });

function inputs(page, cdp) {
  return {
    mouse: { down: async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); }, move: (p) => page.mouse.move(p.x, p.y), up: () => page.mouse.up() },
    touch: { down: (p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }), move: (p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }), up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) },
  };
}

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`assembly in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
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
    const shot = async (n, settle = 350) => { await wait(page, settle); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const tap = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 120); await page.locator(sel).first().click(); };
    const pause = (on) => page.evaluate((on) => document.querySelector('.asm-panel').__pause(on), on);
    const noScroll = async (what) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${what}: no sideways scroll`);
    /** Page pixels of a board point. */
    const px = (b) => page.evaluate(({ x, y }) => { const v = document.querySelector('.asm-panel').__view(); return { x: v.left + x * v.k, y: v.top + y * v.k }; }, b);
    /** Where a loose part's first cell is on the board right now (tray size), after bringing the part into view in the tray. */
    const trayCell = (id) => page.evaluate(({ id }) => import('/projects/Space-Shooter/voyage/minigames/assembly.js').then((A) => {
      const s = document.querySelector('.asm-panel').__state, p = s.pieces.find((q) => q.id === id), T = A.areasOf(s).tray;
      if (s.layout.scrolls) { const z = A.pieceSize(s, p); const over = p.x + z.w - (T.x + T.w - 10), under = T.x + 10 - p.x; if (over > 0) A.scrollTray(s, over); else if (under > 0) A.scrollTray(s, -under); }
      const c = A.pieceCells(p)[0], cell = A.cellOf(s, p);
      return { x: p.x + (c[0] + 0.5) * cell, y: p.y + (c[1] + 0.5) * cell };
    }), { id });
    const viewLift = () => page.evaluate(() => document.querySelector('.asm-panel').__view().lift);
    /** Drag a loose part from the tray and let go with its middle at (cx, cy) in board units (real mouse or finger, in steps). The part rides `lift` above a finger. */
    async function dragPart(id, cx, cy, { letGo = true, steps = 16 } = {}) {
      const from = await px(await trayCell(id)), lift = await viewLift();
      const to = await px({ x: cx, y: cy + lift });
      await hand.down(from); await wait(page, 40);
      for (let i = 1; i <= steps; i++) { await hand.move({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }); await wait(page, 12); }
      if (letGo) { await wait(page, 60); await hand.up(); }
      return to;
    }
    const selectPart = async (id) => {
      const at = await px(await trayCell(id)); await hand.down(at); await wait(page, 60); await hand.up(); await wait(page, 100);
      assert.equal((await S(page)).selected, id);
    };
    const socketMid = (k) => page.evaluate(({ k }) => { const s = document.querySelector('.asm-panel').__state, q = s.sockets[k]; return { x: q.x + (q.w * s.layout.cell) / 2, y: q.y + (q.h * s.layout.cell) / 2 }; }, { k });
    const fitTurn = (page2) => page2.evaluate(async () => { const A = await import('/projects/Space-Shooter/voyage/minigames/assembly.js'); const s = document.querySelector('.asm-panel').__state, k = A.socketOf(s), p = A.pieceOf(s, k.part); for (let q = 0; q < 4; q++) if (A.fitsSocket(A.outlineOfPiece(p), q, A.outlineById(k.outline))) return { id: p.id, rot: p.rot, want: q }; });
    /** Finger circles the bolt head clockwise in the ring; stops and lifts when the torque is in the green (or `to` turns). */
    async function screwBy({ to = null, lift: doLift = true } = {}) {
      const r = await page.evaluate(() => { const c = document.querySelector('.cc-panel[data-game=screw] canvas').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = (75 * r.w) / 500;
      const st = () => page.evaluate(() => { const s = document.querySelector('.cc-panel[data-game=screw]').__state; return { turns: s.turns, T: s.T, zone: s.zone, done: s.done }; });
      let th = 0;
      await hand.down({ x: cx + rad, y: cy });
      for (let i = 0; i < 700; i++) {
        th += 0.11; await hand.move({ x: cx + rad * Math.cos(th), y: cy + rad * Math.sin(th) }); await wait(page, 5);
        if (i % 4 === 0) { const s = await st(); if (to != null ? s.turns >= to : s.turns >= s.T - s.zone / 2) break; }
      }
      if (doLift) await hand.up();
    }

    try {
      await bootRoom(page, server.origin);
      const before = await state(page);

      await t.test('the repair bench asks what needs fixing, then a d20 and the full-screen job', async () => {
        await use(page, 'wb-repair');
        await page.waitForSelector('.wb-r[data-repair="assembly"]');
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-r')].map((b) => b.dataset.repair)), ['coolant', 'assembly']);
        await noScroll('repair menu');
        await shot('0-repair-menu');
        await tap('.wb-r[data-repair="assembly"]');
        await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 });
        await page.waitForFunction(() => /Made it|Not this time|Natural/.test(document.getElementById('hg-attempt').innerText), null, { timeout: 8000 });
        const tray = await page.locator('#hg-attempt').innerText();
        assert.match(tray, /14 \+ .* = 1\d/, `the d20 sum shows (${tray})`);
        await page.waitForSelector('.wb-full .asm-panel', { timeout: 15000 });
        await pause(true);
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'the game owns the whole screen');
        assert.equal(await page.locator('.hg-sheet:visible .asm-panel').count(), 0, 'not in the side sheet');
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, note: document.querySelector('.wb-preview')?.textContent ?? '', hud: document.querySelector('.asm-hud').innerText, panel: document.querySelector('.asm-panel').innerText, kind: document.querySelector('.asm-panel').__state.layoutKind }));
        assert.match(m.eyebrow, /ASSEMBLY/); if (!phone) assert.match(m.note, /Steady roll/);
        assert.equal(m.kind, phone ? 'tall' : 'wide');
        assert.doesNotMatch(m.hud, /\d/, `the HUD has no digits, only bars and words (${m.hud})`);
        assert.doesNotMatch(m.panel, /\d+\s*\/\s*\d+/, 'no raw 96 / 300 numbers');
        assert.match(m.hud, /plenty of time/); assert.match(m.hud, /fit the first part/);
        await noScroll('assembly');
        const geo = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const o = r('.wb-full'), hud = r('.asm-hud'), c = r('.asm-canvas'), a = r('.asm-actions'), b = r('.asm-turn'); return { vh: o.height, hudBottom: hud.bottom, canvasTop: c.top, canvasBottom: c.bottom, actTop: a.top, actBottom: a.bottom, btnH: b.height, btnW: b.width, canvasW: c.width, canvasH: c.height }; });
        assert.ok(geo.hudBottom <= geo.canvasTop + 1 && geo.canvasBottom <= geo.actTop + 1, `HUD, board, buttons do not overlap ${JSON.stringify(geo)}`);
        if (phone) { assert.ok(geo.vh - geo.actBottom < 24, `the turn buttons are pinned to the bottom ${JSON.stringify(geo)}`); assert.ok(geo.btnH >= 56 && geo.btnW >= 120, `thumb-sized buttons ${JSON.stringify(geo)}`); assert.ok(geo.canvasW >= 300, `the board uses the width ${geo.canvasW}`); }
        else assert.ok(geo.canvasW >= 700, `the board is big on a desktop ${geo.canvasW}`);
        const cellPx = await page.evaluate(() => { const v = document.querySelector('.asm-panel').__view(), s = document.querySelector('.asm-panel').__state; return { socket: s.layout.cell * v.k, tray: s.layout.trayCell * v.k }; });
        assert.ok(cellPx.socket >= (phone ? 48 : 60), `the open socket is drawn with big cells (${cellPx.socket} px)`); assert.ok(cellPx.tray >= (phone ? 24 : 20), `tray cells ${cellPx.tray}`);
        await shot('1-start');
      });

      await t.test('a part picked and turned (the thumb buttons, Q and E, the wheel)', async () => {
        const k = await fitTurn(page);
        // pick it by tapping the piece in the tray
        const at = await px(await trayCell(k.id));
        await hand.down(at); await wait(page, 60); await hand.up(); await wait(page, 120);
        assert.equal((await S(page)).selected, k.id, 'a tap picks the part up');
        assert.equal(await page.locator('.asm-turn[data-turn=right]').isDisabled(), false);
        const rot0 = await page.evaluate((id) => document.querySelector('.asm-panel').__state.pieces.find((p) => p.id === id).rot, k.id);
        await tap('.asm-turn[data-turn=right]');
        const rot = (id) => page.evaluate((id) => document.querySelector('.asm-panel').__state.pieces.find((p) => p.id === id).rot, id);
        assert.equal(await rot(k.id), (rot0 + 1) % 4, 'turn right is one quarter turn clockwise');
        await tap('.asm-turn[data-turn=left]'); assert.equal(await rot(k.id), rot0);
        if (!phone) {
          await page.keyboard.press('e'); assert.equal(await rot(k.id), (rot0 + 1) % 4, 'E turns right');
          await page.keyboard.press('q'); assert.equal(await rot(k.id), rot0, 'Q turns left');
          await page.mouse.move(at.x, at.y); await page.mouse.wheel(0, 120); await wait(page, 60); assert.equal(await rot(k.id), (rot0 + 1) % 4, 'the wheel turns it');
          await page.mouse.wheel(0, -120); await wait(page, 60); assert.equal(await rot(k.id), rot0);
        }
        if (phone) {
          const s0 = (await page.evaluate(() => document.querySelector('.asm-panel').__state.trayScroll));
          const from = await px(await trayCell(k.id)); await hand.down(from); for (let i = 1; i <= 8; i++) { await hand.move({ x: from.x - i * 18, y: from.y + 2 }); await wait(page, 12); } await hand.up(); await wait(page, 100);
          const s1 = await page.evaluate(() => document.querySelector('.asm-panel').__state.trayScroll);
          assert.ok(s1 > s0, `a sideways swipe scrolls the tray (${s0} to ${s1})`);
          assert.equal((await S(page)).phase, 'fit'); assert.equal(await page.evaluate(() => document.querySelector('.asm-panel').__state.held), null, 'a swipe does not pick a part up');
          await shot('2b-tray-scrolled'); await page.evaluate(() => { document.querySelector('.asm-panel').__state.trayScroll = 0; });
        }
        await shot('2-part-picked-turned');
      });

      await t.test('a wrong part bounces off with a red flash and counts as a wrong fit', async () => {
        const mid = await socketMid(0);
        const decoy = await page.evaluate(() => document.querySelector('.asm-panel').__state.pieces.find((p) => p.role === 'decoy').id);
        await dragPart(decoy, mid.x, mid.y, { letGo: false });
        await shot('3a-wrong-part-over-the-socket', 80);
        await hand.up();
        await wait(page, 60);
        await shot('3b-wrong-part-bounce', 40);
        const s = await S(page);
        assert.equal(s.wrong, 1); assert.equal(s.phase, 'fit');
        assert.match(await page.locator('.asm-panel .rp-status').innerText(), /wrong part/);
        assert.equal(await page.locator('.asm-wrong.on').count(), 1, 'one red pip');
        assert.match(await page.locator('.asm-hud').innerText(), /one/);
        const placed = await page.evaluate(() => document.querySelector('.asm-panel').__state.pieces.filter((p) => p.placed).length);
        assert.equal(placed, 0);
      });

      await t.test('the right part turned right snaps in; the bolts open', async () => {
        const k = await fitTurn(page);
        // a wrong turn first: it bounces, no penalty
        const wrongTurn = (k.want + 1) % 4;
        await selectPart(k.id);
        for (let i = 0; i < 4 && (await fitTurn(page)).rot !== wrongTurn; i++) await tap('.asm-turn[data-turn=right]');
        assert.equal((await fitTurn(page)).rot, wrongTurn);
        const mid = await socketMid(0);
        await dragPart(k.id, mid.x, mid.y);
        await wait(page, 120);
        let s = await S(page);
        assert.equal(s.phase, 'fit'); assert.equal(s.wrong, 1, 'a wrong turn costs nothing'); assert.equal(s.wrongTurns, 1);
        assert.match(await page.locator('.asm-panel .rp-status').innerText(), /wrong way round/);
        await selectPart(k.id);
        for (let i = 0; i < 4 && (await fitTurn(page)).rot !== k.want; i++) await tap('.asm-turn[data-turn=right]');
        assert.equal((await fitTurn(page)).rot, k.want);
        await dragPart(k.id, mid.x, mid.y, { letGo: false });
        await shot('4a-part-over-the-socket-turned-right', 80);
        await hand.up();
        await shot('4b-part-snapped', 160);
        s = await S(page);
        assert.equal(s.phase, 'bolt'); assert.equal(s.wrong, 1);
        assert.match(await page.locator('.asm-panel .rp-status').innerText(), /bolts/);
        assert.match(await page.locator('.asm-hud').innerText(), /none snug yet/);
        assert.match(await page.locator('.asm-hud').innerText(), /bolt the first part/);
        assert.equal(await page.locator('.asm-turn:visible').count(), 0, 'the turn buttons are hidden while bolting');
        assert.match(await page.locator('.asm-boltline').innerText(), /Drag each bolt onto a glowing ring/);
        const strip = await page.evaluate(() => import('/projects/Space-Shooter/voyage/minigames/assembly.js').then((A) => { const s = document.querySelector('.asm-panel').__state; return { h: A.areasOf(s).tray.h, bolts: s.bolts.length }; }));
        assert.ok(strip.h <= 200, `the bolt tray is a slim strip (${strip.h})`);
      });

      await t.test('a bolt dragged to its hole, then the real Screw game in the same overlay', async () => {
        const dragBolt = async (id, { letGo = true } = {}) => {
          const g = await page.evaluate((id) => { const b = document.querySelector('.asm-panel').__state.bolts.find((o) => o.id === id); return { x: b.x, y: b.y, hx: b.hx, hy: b.hy }; }, id);
          const from = await px({ x: g.x, y: g.y }), to = await px({ x: g.hx, y: g.hy + (await page.evaluate(() => document.querySelector('.asm-panel').__view().boltLift)) });
          await hand.down(from); await wait(page, 40);
          for (let i = 1; i <= 12; i++) { await hand.move({ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }); await wait(page, 12); }
          if (letGo) { await wait(page, 50); await hand.up(); }
        };
        const first = (await S(page)).bolts[0].id;
        await dragBolt(first, { letGo: false });
        await shot('5a-bolt-dragged-to-its-hole', 80);
        await hand.up(); await wait(page, 120);
        assert.equal((await S(page)).bolts.find((b) => b.id === first).seated, true);
        // a bolt let go far from a hole goes back to the tray
        const second = (await S(page)).bolts[1].id;
        const g2 = await page.evaluate((id) => { const b = document.querySelector('.asm-panel').__state.bolts.find((o) => o.id === id); return { x: b.x, y: b.y }; }, second);
        const a = await px(g2); await hand.down(a); await hand.move({ x: a.x - 3, y: a.y - 60 }); await wait(page, 40); await hand.up(); await wait(page, 100);
        assert.equal((await S(page)).bolts.find((b) => b.id === second).seated, false); assert.match(await page.locator('.asm-panel .rp-status').innerText(), /Not on a ring/);
        await shot('5b-bolt-set-loose', 100);
        // tap the loose bolt: Screw opens in the same overlay with the clock HUD still on top
        const at = await page.evaluate((id) => { const b = document.querySelector('.asm-panel').__state.bolts.find((o) => o.id === id); return { x: b.x, y: b.y }; }, first);
        const p = await px(at); await hand.down(p); await wait(page, 50); await hand.up();
        await page.waitForSelector('.asm-screwhost .cc-panel[data-game=screw]', { timeout: 5000 });
        assert.equal(await page.locator('.wb-full').count(), 1, 'still one overlay');
        assert.equal(await page.locator('.asm-hud').isVisible(), true, 'the clock HUD stays on top of the close-up');
        assert.equal(await page.locator('.asm-canvas').isVisible(), false);
        assert.doesNotMatch(await page.locator('.asm-screwhost').innerText(), /\d+\s*\/\s*\d+/, 'no raw numbers in the close-up');
        await noScroll('screw close-up');
        assert.doesNotMatch(await page.locator('.asm-panel').innerText(), /\d/, 'no digits anywhere in the panel while Screw runs');
        assert.equal(await page.locator('.asm-stat:visible').count(), 2, 'the assembly HUD collapses to one slim row (time and parts)');
        assert.equal(await page.locator('.cc-pips:visible').count(), 2, 'slips and stripped are pips');
        await screwBy({ to: 2.2, lift: false });
        await shot('6-screw-in-progress');
        await screwBy({ lift: true });
        await page.waitForSelector('.asm-screwhost .cc-panel', { state: 'detached', timeout: 5000 });
        await wait(page, 150);
        const s = await S(page);
        assert.equal(s.bolts.find((b) => b.id === first).tight, true, 'the bolt is snug'); assert.equal(s.active, 0);
        assert.equal(await page.locator('.asm-canvas').isVisible(), true, 'back to the board');
        await shot('7-bolt-snug');
      });

      await t.test('the last bolt snug opens the next socket', async () => {
        await page.evaluate(async () => {
          const A = await import('/projects/Space-Shooter/voyage/minigames/assembly.js'); const s = document.querySelector('.asm-panel').__state;
          for (const b of s.bolts.slice()) { if (b.tight) continue; A.grabBolt(s, b.id); A.carryBolt(s, b.hx, b.hy); A.dropBolt(s); A.screwed(s, b.id, { success: true, grade: 90 }); }
        });
        await wait(page, 300);
        const s = await S(page);
        assert.equal(s.active, 1); assert.equal(s.phase, 'fit');
        assert.match(await page.locator('.asm-panel .rp-status').innerText(), /second socket is open/);
        assert.match(await page.locator('.asm-hud').innerText(), /fit the second part/);
        assert.equal(await page.locator('.asm-pip.on').count() >= 1, true);
        await shot('8-next-socket');
      });

      await t.test('the clock runs and the rest of the job finishes: result card with stars, quality and XP', async () => {
        const t0 = (await S(page)).t; await pause(false); await wait(page, 1500); await pause(true);
        assert.ok((await S(page)).t - t0 > 1, 'the clock is running');
        await page.evaluate(async () => {
          const A = await import('/projects/Space-Shooter/voyage/minigames/assembly.js'); const s = document.querySelector('.asm-panel').__state;
          while (!s.done) {
            const k = A.socketOf(s), p = A.pieceOf(s, k.part);
            for (let q = 0; q < 4; q++) if (A.fitsSocket(A.outlineOfPiece(p), q, A.outlineById(k.outline))) { while (p.rot !== q) { A.select(s, p.id); A.turn(s, 1); } }
            A.grab(s, p.id); A.carry(s, k.x + A.pieceSize(s, p).w / 2, k.y + A.pieceSize(s, p).h / 2); A.drop(s);
            for (const b of s.bolts.slice()) { A.grabBolt(s, b.id); A.carryBolt(s, b.hx, b.hy); A.dropBolt(s); A.screwed(s, b.id, { success: true, grade: 90 }); }
          }
        });
        await page.waitForSelector('.asm-card[data-outcome=fixed]', { timeout: 6000 });
        const card = await page.locator('.asm-card').innerText();
        assert.match(card, /back together/); assert.match(card, /Quality \d+\. Stars at 65 and 90/); assert.match(card, /Wrong fits: one/); assert.match(card, /Repair XP/);
        assert.doesNotMatch(card, /[=+]\s*\d+\s*[+x]|\d+\s*\/\s*\d+/, 'no formulas on the card');
        const q = await page.evaluate(() => document.querySelector('.asm-panel').__state.result);
        assert.equal(q.success, true); assert.ok(q.quality >= 40 && q.quality <= 100); assert.equal(q.wrongFits, 1);
        assert.equal(await page.locator('.asm-card').getAttribute('data-stars'), String(q.stars));
        await noScroll('result');
        await shot('9-result-card');
        await tap('.asm-card .cc-go');
        await page.waitForSelector('.wb-full', { state: 'detached', timeout: 15000 });
        const after = await state(page);
        assert.ok(after.progress.xp.repair > before.progress.xp.repair || after.progress.levels.repair > before.progress.levels.repair, 'XP landed in Repair');
        assert.match(after.said || '', /Assembly: you did it/);
      });

      await t.test('lost on the clock: the unit stays broken, said plainly, and the station remembers', async () => {
        await use(page, 'wb-repair');
        await page.waitForSelector('.wb-r[data-repair="assembly"]'); await tap('.wb-r[data-repair="assembly"]');
        await page.waitForSelector('.wb-full .asm-panel', { timeout: 15000 });
        await page.evaluate(() => { const s = document.querySelector('.asm-panel').__state; s.t = s.clock - 0.2; });
        await page.waitForSelector('.asm-card[data-outcome=broken]', { timeout: 8000 });
        const card = await page.locator('.asm-card').innerText();
        assert.match(card, /Out of time\. The .* stays broken/); assert.match(card, /one scrap \(a spoiled gasket\)/); assert.match(card, /STILL BROKEN/);
        const r = await page.evaluate(() => document.querySelector('.asm-panel').__state.result);
        assert.deepEqual([r.success, r.broken, r.xp], [false, true, 0]);
        await shot('10-lost');
        await tap('.asm-card .cc-go');
        await page.waitForSelector('.wb-full', { state: 'detached', timeout: 15000 });
        assert.match((await state(page)).said || '', /stays broken/);
      });

      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close();
      await server.close?.();
    }
  });
}
