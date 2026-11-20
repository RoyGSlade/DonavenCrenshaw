// Docking in a real browser: the module's own test page at 1440x900 (a real mouse and real keys) and 390x844 (real touch through the
// DevTools protocol: one finger drags on the board to aim, a second holds the Thrust pad). It checks the house rules (full screen,
// no digits on the live HUD, nothing covers a button, one h1, no sideways scroll, no big gaps on the phone), then plays: a clean dock,
// a scrape that costs hull and never the run, the approach lights going out and the tug, quick mode, the keys, and Leave. The hand
// only READS the pure state; every press, move and touch is a real input event, and the game runs on its own clock.
// Opt-in (one browser at a time on this machine):
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/pipeline/lanes/docking/proof STARDUST_BROWSER_TEST=1 \
//     ~/Desktop/lhc-lanes/stardust/round3/browser-slot.sh ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/browser.test.mjs
// Playwright: PLAYWRIGHT_MODULE=$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { startServer } from './serve.mjs';
import { perfectInput } from '../bot.js';
import { frameOf, halfAt, DM } from '../model.js';

const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const wait = (page, ms) => page.waitForTimeout(ms);
const ROOT = '.m-docking[data-game=docking]';
const PW = process.env.PLAYWRIGHT_MODULE || `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;

const snap = (page) => page.evaluate((sel) => {
  const p = document.querySelector(sel); if (!p) return null;
  const s = p.__state, v = p.__view(), r = p.querySelector('canvas').getBoundingClientRect();
  return { ...JSON.parse(JSON.stringify({ ...s, events: [], result: s.result ? { ...s.result, path: [], marks: s.result.marks } : null })), view: { x: r.left + v.shipX, y: r.top + v.shipY, l: r.left, t: r.top, w: r.width, h: r.height }, input: { ...p.__input } };
}, ROOT);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`docking in a real browser, ${name}`, { skip, timeout: 590000 }, async (t) => {
    const { chromium } = await import(PW);
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    const page = await context.newPage();
    const cdp = phone ? await context.newCDPSession(page) : null;
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (n) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const sub = (title, fn) => (!only || only.includes(title) ? t.test(title, fn) : null);

    // ---- real inputs ------------------------------------------------------------------------------------------------------------------
    let fingers = { aim: null, pad: false, sent: 0 };   // phone: the two touches in flight
    let held = { space: false };                        // desktop
    const center = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    async function sendTouches() {
      const pts = [];
      if (fingers.aim) pts.push({ x: fingers.aim.x, y: fingers.aim.y, id: 1 });
      if (fingers.pad) { const c = await center(`${ROOT} .dk-pad`); pts.push({ x: c.x, y: c.y, id: 2 }); }
      if (!pts.length) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); fingers.sent = 0; return; }
      const type = pts.length > (fingers.sent || 0) ? 'touchStart' : 'touchMove';
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }); fingers.sent = pts.length;
    }
    /** Aim the ship at `angle` (world radians) with the real mouse or a real finger, and hold or release the thrust. The pointer stays on the board. */
    async function hand(s, angle, thrustOn) {
      const v = s.view; let r = 90;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      for (const [lim, o, d] of [[v.l + v.w - 4, v.x, ux], [v.l + 4, v.x, ux], [v.t + v.h - 4, v.y, uy], [v.t + 4, v.y, uy]]) if (Math.abs(d) > 1e-6) { const k = (lim - o) / d; if (k > 0) r = Math.min(r, k); }
      r = Math.max(r, 8);
      const px = v.x + ux * r, py = v.y + uy * r;
      if (phone) {
        const moved = !fingers.aim || Math.hypot(fingers.aim.x - px, fingers.aim.y - py) > 1, flipped = fingers.pad !== thrustOn;
        fingers.aim = { x: px, y: py }; fingers.pad = thrustOn;
        if (moved || flipped) await sendTouches();
      } else {
        await page.mouse.move(px, py);
        if (thrustOn && !held.space) { await page.keyboard.down('Space'); held.space = true; }
        else if (!thrustOn && held.space) { await page.keyboard.up('Space'); held.space = false; }
      }
    }
    async function letGo() {
      if (phone) { fingers = { aim: null, pad: false, sent: fingers.sent }; await sendTouches(); }
      else if (held.space) { await page.keyboard.up('Space'); held.space = false; }
    }
    /** Fly the hand until the run ends, `until` says stop, or `ms` pass. Default: the exact line; `steer(s, perfect)` may override the aim and thrust. */
    async function fly({ ms = 40000, until = null, steer = null, period = 45 } = {}) {
      let acc = 0, s; const end = performance.now() + ms;
      while (performance.now() < end) {
        s = await snap(page);
        if (!s || s.done) break;
        if (until && await until(s)) break;
        const p = perfectInput(s); const { aim, thrust } = steer ? steer(s, p) : p;
        acc += thrust; const on = acc >= 1; if (on) acc -= 1;
        await hand(s, aim, on);
        await wait(page, period);
      }
      await letGo();
      return s;
    }
    const open = async (query = '') => {
      await page.goto(`${server.origin}/test.html${query ? `?${query}` : ''}`);
      if (phone) await page.locator('#play').tap(); else await page.locator('#play').click();
      await page.waitForSelector(ROOT); await wait(page, 500);
      const s0 = await snap(page), v = s0.view;   // the ship starts ON the board, with room around it (a seed once started it off the phone's edge)
      assert.ok(v.x > v.l + 12 && v.x < v.l + v.w - 12 && v.y > v.t + 12 && v.y < v.t + v.h - 12, `the ship starts on the board (${Math.round(v.x)},${Math.round(v.y)} in ${Math.round(v.l)},${Math.round(v.t)},${Math.round(v.w)}x${Math.round(v.h)})`);
    };
    const card = () => page.waitForSelector('.dk-card', { timeout: 20000 });
    const result = () => page.evaluate(() => window.__result);
    const first = async () => {   // the first burn starts the run (the lights wait until then)
      if (phone) { fingers.pad = true; await sendTouches(); await wait(page, 120); fingers.pad = false; await sendTouches(); }
      else { await page.keyboard.down('Space'); await wait(page, 120); await page.keyboard.up('Space'); }
    };

    try {
      await sub('house rules: full screen, one h1, plain words, nothing covers a button, no sideways scroll', async () => {
        await open('seed=3');
        assert.equal(await page.locator('h1').count(), 1, 'exactly one h1 on the page');
        const geo = await page.evaluate((sel) => {
          const stage = document.getElementById('stage').getBoundingClientRect(), root = document.querySelector(sel).getBoundingClientRect();
          const box = (q) => { const r = document.querySelector(`${sel} ${q}`).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
          const hit = (el) => { const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === el || el.contains(e)); };
          return {
            stage: { top: stage.top, bottom: stage.bottom, h: stage.height, w: stage.width }, root: { top: root.top, bottom: root.bottom, h: root.height, w: root.width },
            hud: box('.dk-hud'), board: box('.dk-board'), say: box('.dk-say'), tip: box('.dk-tip'), row: box('.dk-row'),
            pad: hit(document.querySelector(`${sel} .dk-pad`)), leave: hit(document.getElementById('leave')),
            scroll: document.documentElement.scrollWidth - innerWidth, vh: innerHeight, vw: innerWidth,
            hudText: document.querySelector(`${sel} .dk-hud`).innerText, sayText: document.querySelector(`${sel} .dk-say`).innerText, tipText: document.querySelector(`${sel} .dk-tip`).innerText, startText: document.querySelector(`${sel} .dk-start`).innerText,
            tap: getComputedStyle(document.querySelector(`${sel} .dk-pad`)).webkitTapHighlightColor, padShadow: getComputedStyle(document.querySelector(`${sel} .dk-pad`)).boxShadow,
          };
        }, ROOT);
        assert.ok(geo.root.h >= geo.stage.h - 2, 'the module fills the stage');
        assert.ok(geo.board.h > geo.stage.h * (phone ? 0.42 : 0.5), `the board takes the spare height (${geo.board.h} of ${geo.stage.h})`);
        assert.ok(geo.pad && geo.leave, 'the thrust pad and Leave can be hit (nothing covers them)');
        assert.equal(geo.scroll, 0, 'no sideways scroll');
        assert.doesNotMatch(geo.hudText, /\d/, 'no digits on the live HUD');
        assert.doesNotMatch(geo.sayText + geo.tipText + geo.startText, /\d/, 'no digits in the live words');
        assert.equal(geo.padShadow, 'none', 'the pad glows by drop-shadow, never box-shadow');
        assert.ok(geo.pad);
        const gaps = [['hud', 'board'], ['board', 'say'], ['say', 'tip'], ['tip', 'row']].map(([a, b]) => geo[b].top - geo[a].bottom);
        assert.ok(gaps.every((g) => g <= 48), `no gap over 48 px between neighbouring blocks: ${gaps}`);
        if (phone) assert.ok(geo.vh - geo.row.bottom <= 16, `only the action row pins to the bottom (${geo.vh - geo.row.bottom} px under it)`);
        await shot('1-approach');
        // the lights wait for the first burn
        await wait(page, 1500);
        assert.equal((await snap(page)).t, 0, 'the run has not started: no input yet');
      });

      await sub('a clean dock: real mouse and keys, or real touch, fly it in; the clamps catch; the card draws the flight line', async () => {
        await open('seed=3&tier=1');
        const s0 = await snap(page); assert.equal(s0.done, false);
        await first();
        const z0 = (await page.evaluate((sel) => document.querySelector(sel).__view().zoom, ROOT));
        assert.ok(z0 < 1.15, `far out the view is wide (zoom ${z0})`);
        let mid = await fly({ until: (q) => { const f = frameOf(q); return Math.hypot(q.x - f.B.x, q.y - f.B.y) < 14; } });
        assert.ok(!mid.done, 'still flying at 14 from the berth'); await wait(page, 700);   // let the camera finish gliding in
        const near = await page.evaluate((sel) => { const r = document.querySelector(sel); const v = r.__view(); return { zoom: v.zoom, shipLen: 8.2 * v.sc }; }, ROOT);
        assert.ok(near.zoom > 2.3, `closing on the berth the camera has zoomed in (${near.zoom})`);
        assert.ok(near.shipLen >= 30, `the ship is big enough to read its nose: ${Math.round(near.shipLen)} css px long`);
        await shot('2b-zoomed-in');
        await fly();
        await wait(page, 200);
        const s = await snap(page);
        assert.equal(s.done, true, 'the run ended'); assert.equal(s.result.outcome, 'docked');
        await wait(page, 500); await shot('4-clamped');
        await card(); await wait(page, 400); await shot('6-result-card');
        const c = await page.evaluate(() => { const c = document.querySelector('.dk-card'); return { ok: c.dataset.ok, outcome: c.dataset.outcome, canvas: !!c.querySelector('canvas.dk-flight'), text: c.innerText, h: c.getBoundingClientRect().height, vh: innerHeight, bottom: c.getBoundingClientRect().bottom }; });
        assert.equal(c.canvas, true, 'the flight line is on the card'); assert.equal(c.outcome, 'docked'); assert.ok(c.bottom <= c.vh, 'the card fits the screen');
        await page.locator('.dk-go').click(); await wait(page, 400);
        const r = await result();
        assert.equal(r.done, true); assert.equal(r.outcome, 'docked'); assert.equal(r.wavedOff, false); assert.ok(r.grade >= 60, `grade ${r.grade}`);
        assert.deepEqual(Object.keys(r.effects.world).sort(), ['docked', 'hullDelta']); assert.equal(r.effects.world.docked.base, 'star-base'); assert.ok(!('feeDelta' in r.effects.world));
        for (const k of ['success', 'grade', 'clean', 'hullLost', 'timeS', 'scrapes', 'wavedOff', 'berth']) assert.ok(k in r, k);
        assert.equal(await page.locator(ROOT).count(), 0, 'the game closed itself');
      });

      await sub('lined up, the wall warning and a scrape: the wall glows, the warning fills, a scrape costs hull and never ends the run, then it still docks', async () => {
        await open('seed=5&tier=0&pursuit=6');
        await first();
        // 1. fly the exact line until lined up inside the corridor
        let s = await fly({ ms: 30000, until: (q) => { const f = frameOf(q); return f.d < DM - 18 && Math.abs(f.l) < f.half * 0.4; } });
        assert.ok(!s.done, 'still flying'); await shot('2-lined-up');
        assert.equal(await page.locator(`${ROOT} .dk-lane em`).innerText(), 'lined up');
        // 2. drift sideways into the wall: it glows first, then the warning fills
        const toWall = (q) => { const f = frameOf(q), sgn = f.l >= 0 ? 1 : -1; return { aim: Math.atan2(f.n.y * sgn, f.n.x * sgn), thrust: 1 }; };
        let sawGlow = false;
        s = await fly({ ms: 20000, steer: (q) => toWall(q), until: async (q) => { const f = frameOf(q); if (!sawGlow && Math.abs(f.l) > f.half * 0.8 && Math.abs(f.l) <= f.half) sawGlow = true; return q.outside && q.warnLeft < q.warn * 0.7; } });
        assert.ok(s.outside, 'outside the walls'); assert.equal(s.scrapes, 0, 'the warning comes before any scrape');
        await shot('3-wall-warning');
        if (!phone) assert.equal(await page.locator(`${ROOT} .dk-warnstat em`).innerText(), 'steer back');   // the phone HUD drops the wall panel: the wall itself glows
        assert.match(await page.locator(`${ROOT} .dk-tip`).innerText(), /steer back|drifting wide/i);
        // 3. keep going: the wall scrapes, which costs hull and bounces you, and never ends the run
        s = await fly({ ms: 20000, steer: (q) => toWall(q), until: (q) => q.scrapes >= 1 });
        await shot('5-scrape');
        assert.ok(s.hullLost > 0, 'hull lost'); assert.equal(s.done, false, 'a scrape never ends the run');
        assert.equal(await page.locator(`${ROOT} .dk-say b`).innerText(), 'DOCKMASTER');
        assert.match(await page.locator(`${ROOT} .dk-say span`).innerText(), /my paint/i);
        const hullBefore = s.hullLost, lightsBefore = s.lightsOut;
        // 4. come back to the line and dock: the card draws the scrape on the flight line
        await fly({ ms: 40000 });
        s = await snap(page);
        assert.equal(s.done, true); assert.equal(s.result.outcome, 'docked'); assert.equal(s.result.clean, false); assert.ok(s.result.hullLost >= hullBefore); assert.ok(s.lightsOut >= lightsBefore);
        await card(); await wait(page, 500); await shot('7-result-card-scrape');
        assert.match(await page.locator('.dk-card .dk-legend').innerText(), /red marks/i);
        await page.locator('.dk-go').click(); await wait(page, 300);
        const r = await result(); assert.ok(r.scrapes >= 1); assert.equal(r.clean, false); assert.ok(r.effects.world.hullDelta < 0);
      });

      await sub('waved off: the approach lights go out one by one, a tug brings you in, the fee is charged and the story moves on', async () => {
        await open('seed=2&quick=1&tier=0');
        await first();
        await wait(page, 7000);
        let s = await snap(page); assert.ok(s.lightsOut >= 2 && s.lightsOut <= 3, `lights going out (${s.lightsOut})`);
        assert.equal(await page.locator(`${ROOT} .dk-lamps i.is-out`).count(), s.lightsOut, 'the lamps on screen match');
        await shot('8-lights-going-out');
        await page.waitForFunction((sel) => document.querySelector(sel)?.__state.done, ROOT, { timeout: 15000 });
        await wait(page, 1900); await shot('9-waved-off-tug');
        assert.equal(await page.locator('.dk-card').count(), 0, 'the tug is still pushing: the card waits');
        await card(); await wait(page, 500); await shot('10-waved-off-card');
        assert.equal(await page.locator('.dk-card').getAttribute('data-outcome'), 'waved-off');
        assert.match(await page.locator(`${ROOT} .dk-say span`).innerText(), /send(ing)? the tug/i);
        await page.locator('.dk-go').click(); await wait(page, 300);
        const r = await result();
        assert.equal(r.wavedOff, true); assert.equal(r.success, false); assert.equal(r.grade, 0); assert.equal(r.xp, 0); assert.equal(r.effects.world.feeDelta, -25); assert.equal(r.effects.world.docked.berth, 1);
        assert.ok(r.effects.world.hullDelta <= 0);
      });

      await sub('quick mode: lined up at the mouth, only the last approach, 6 to 10 seconds', async () => {
        await open('seed=4&quick=1&tier=0');
        const s0 = await snap(page), f0 = frameOf(s0);
        assert.equal(s0.quick, true); assert.ok(f0.d < DM && Math.abs(f0.l) < f0.half, 'starts inside the corridor mouth');
        await shot('11-quick-start');
        await first();
        await fly();
        const s = await snap(page);
        assert.equal(s.result.outcome, 'docked'); assert.ok(s.result.timeS >= 5 && s.result.timeS <= 11, `quick run took ${s.result.timeS} s`);
        await card(); await wait(page, 400); await shot('12-quick-card');
        await page.locator('.dk-go').click();
      });

      await sub('the hand: keys (WASD) aim and burn on a desktop, a finger on the board aims and the pad burns on a phone; sound and music ids are asked for', async () => {
        await open('seed=7');
        const s0 = await snap(page);
        if (phone) {
          const A = Math.atan2(s0.view.t + s0.view.h / 2 - s0.view.y, s0.view.l + s0.view.w / 2 - s0.view.x);   // toward the middle of the board, so the finger stays on it
          await hand(s0, A, false); await wait(page, 100); await hand(s0, A, true); await wait(page, 700);   // one finger down, then the other, as a hand does
          const s1 = await snap(page);
          assert.equal(s1.thrusting, true, 'the pad burns'); assert.ok(Math.cos(s1.h - A) > 0.9, `the nose swung toward the finger (${s1.h} vs ${A})`); assert.ok(s1.vx * Math.cos(A) + s1.vy * Math.sin(A) > 0.5, 'and the ship went that way');
          await letGo();
        } else {
          await page.keyboard.down('KeyD'); await wait(page, 700);
          const s1 = await snap(page); assert.equal(s1.thrusting, true); assert.ok(Math.cos(s1.h) > 0.5 && s1.vx > 0.5, `D aims right and burns (${s1.h}, ${s1.vx})`);
          await page.keyboard.up('KeyD'); await wait(page, 200);
          await page.keyboard.down('ArrowUp'); await wait(page, 700);
          const s2 = await snap(page); assert.ok(Math.sin(s2.h) < -0.3, `up aims up (${s2.h})`);
          await page.keyboard.up('ArrowUp');
          await page.mouse.move(s0.view.x - 80, s0.view.y); await page.keyboard.down('Space'); await wait(page, 600);
          const s3 = await snap(page); assert.equal(s3.thrusting, true, 'Space burns'); await page.keyboard.up('Space');
        }
        const hasAudio = await page.evaluate(() => typeof (window.AudioContext || window.webkitAudioContext) === 'function');
        if (hasAudio) assert.equal(await page.evaluate((sel) => document.querySelector(sel).__audio(), ROOT), true, 'the module made its own sound after the first touch or key');
        const ids = await page.evaluate(() => window.__sounds || []);
        assert.ok(ids.includes('music:duck') && ids.includes('line:dockmaster.approach'), `host sound ids: ${ids}`);
      });

      await sub('Leave (contract 1.1): the module registered ctx.onLeave once, the host calls it, and the loop, the keys and every sound stop', async () => {
        await open('seed=9');
        assert.equal(await page.evaluate(() => window.__leaveRegistered), 1, 'registered the leave handler once at the start');
        await first();
        if (phone) { fingers.pad = true; await sendTouches(); } else await page.keyboard.down('KeyD');   // sound is running: the thruster and the guide tone
        await wait(page, 500);
        const audioOn = () => page.evaluate(async () => (await import('./audio.js')).liveAudioContexts());
        assert.equal(await audioOn(), 1, 'one audio context is live while it plays');
        if (phone) await page.locator('#leave').tap(); else await page.locator('#leave').click();
        await wait(page, 500);
        assert.equal(await page.locator(ROOT).count(), 0, 'the game is gone');
        const r = await result(); assert.equal(r.left, true); assert.equal(r.done, true);
        assert.equal(await audioOn(), 0, 'no audio context (so no thruster, guide tone or wall pulse) is running after Leave');
        if (phone) { fingers.pad = false; await sendTouches(); } else await page.keyboard.up('KeyD');
        await page.keyboard.press('Space'); await page.keyboard.press('KeyD'); await wait(page, 300);
        assert.equal(await audioOn(), 0, 'and a key press afterwards starts nothing');
      });

      await sub('reduced motion: the camera zooms in three steps instead of gliding', async () => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await open('seed=3&tier=1');
        await first();
        const seen = new Set();
        await fly({ until: async (q) => { const z = await page.evaluate((sel) => document.querySelector(sel).__view().zoom, ROOT); seen.add(Math.round(z * 100) / 100); return false; } });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const allowed = [1, 1.8, 2.6];
        assert.ok([...seen].every((z) => allowed.some((a) => Math.abs(a - z) < 0.02)), `only the three steps ${allowed}, saw ${[...seen]}`);
        assert.ok(seen.size >= 2, `it did step in (${[...seen]})`);
      });
    } finally {
      await browser.close(); await server.close();
    }
    assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], 'no page errors');
  });
}
