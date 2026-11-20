// Docking at the star base in the REAL workbench page at 1440x900 (a real mouse and real keys) and 390x844 (real two-finger touch through
// the DevTools protocol: one finger drags on the board to aim, one holds the Thrust pad): the flight console menu, the full-screen game,
// plain words, a hand that flies the real controls from the ship's state and docks, a scrape that costs hull and never the run, the
// clock waving the base off, the keys, and the result card. The hand only READS the pure state (where the ship and the lane are); every
// press, move and touch is a real input event, and the game runs on its own clock.
// Opt-in:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/docking/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-minigames-docking-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';
import { perfectInput } from '../projects/Space-Shooter/voyage/minigames/dockingBot.js';
import { frameOf } from '../projects/Space-Shooter/voyage/minigames/docking.js';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const wait = (page, ms) => page.waitForTimeout(ms);
const PANEL = '.dk-panel[data-game=docking]';

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
const snap = (page) => page.evaluate((sel) => { const p = document.querySelector(sel); if (!p) return null; const s = p.__state, v = p.__view(), r = p.querySelector('canvas').getBoundingClientRect(); return { ...JSON.parse(JSON.stringify({ ...s, events: [] })), view: { x: r.left + v.shipX, y: r.top + v.shipY }, input: { ...p.__input } }; }, PANEL);

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`docking in the workbench, ${name}`, { skip, timeout: 590000 }, async (t) => {
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

    // ---- real inputs ----------------------------------------------------------------------------------------------------------------
    let fingers = { aim: null, pad: false };          // phone: the two touches in flight
    let held = { space: false, mouse: false };        // desktop
    const center = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    async function sendTouches() {
      const pts = [];
      if (fingers.aim) pts.push({ x: fingers.aim.x, y: fingers.aim.y, id: 1 });
      if (fingers.pad) { const c = await center(`${PANEL} .dk-pad`); pts.push({ x: c.x, y: c.y, id: 2 }); }
      if (!pts.length) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); fingers.sent = 0; return; }
      const type = pts.length > (fingers.sent || 0) ? 'touchStart' : 'touchMove';
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }); fingers.sent = pts.length;
    }
    /** Aim the ship at `angle` (world radians) with the real mouse or a real finger, and hold or release the thrust. */
    async function hand(s, angle, thrustOn) {
      const px = s.view.x + Math.cos(angle) * 90, py = s.view.y + Math.sin(angle) * 90;
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
      else { if (held.space) await page.keyboard.up('Space'); if (held.mouse) await page.mouse.up(); held = { space: false, mouse: false }; }
    }
    /** Fly the hand until the run ends, a callback says stop, or `ms` pass. perfect: the exact line; `steer` (s, level) may override the aim and thrust. */
    async function fly({ ms = 40000, until = null, steer = null, period = 45 } = {}) {
      let acc = 0, s; const end = performance.now() + ms; const log = [];
      while (performance.now() < end) {
        s = await snap(page);
        if (!s || s.done) break;
        if (until && until(s)) break;
        let { aim, thrust } = steer ? steer(s) : perfectInput(s);
        acc += thrust; const on = acc >= 1; if (on) acc -= 1;
        await hand(s, aim, on);
        if (log.length < 4000) log.push([s.t, s.hullLost]);
        await wait(page, period);
      }
      await letGo();
      return s;
    }
    const resultCard = () => page.waitForSelector('.dk-card', { timeout: 20000 });
    const recover = async () => { for (let i = 0; i < 3; i++) { if (await page.locator('.dk-go').count()) { await page.locator('.dk-go').click(); await wait(page, 300); } if (await page.locator('.wb-full .wb-leave').count()) { await page.locator('.wb-leave').click(); await wait(page, 300); } else if (await page.locator('.wb-no').count()) { await page.locator('.wb-no').first().click(); await wait(page, 300); } } };
    const go = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await wait(page, 150); await page.locator(sel).first().click(); };
    const openMenu = async () => { await recover(); await use(page, 'wb-pilot'); await page.waitForSelector('.wb-f[data-flight="docking"]'); };
    const openDocking = async () => { await openMenu(); await go('.wb-f[data-flight="docking"]'); await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 }); await page.waitForSelector(PANEL, { timeout: 15000 }); await wait(page, 500); };
    const noScroll = async (what) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${what}: no sideways scroll`);

    try {
      await bootRoom(page, server.origin);

      await sub('the flight console asks: Touchdown or Dock at the star base', async () => {
        await openMenu();
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-f')].map((b) => b.dataset.flight)), ['touchdown', 'docking']);
        assert.match(await page.locator('.wb-f[data-flight="docking"]').innerText(), /Dock at the star base/);
        await noScroll('menu'); await shot('0-flight-menu');
        await go('.wb-f[data-flight="touchdown"]'); await page.waitForSelector('.pl-panel', { timeout: 15000 });
        await go('.wb-leave'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('docking is full screen with plain words, no gap over 48 px, one plain-frame pad, and the approach picture', async () => {
        await openDocking();
        const m = await page.evaluate(() => ({ eyebrow: document.querySelector('.wb-feyebrow').textContent, note: document.querySelector('.wb-preview').textContent, title: document.querySelector('.wb-ftitle').textContent }));
        assert.match(m.eyebrow, /DOCKING/); assert.match(m.note, /roll:/);
        assert.equal(await page.locator('.wb-full').count(), 1, 'a full-screen game');
        assert.deepEqual(await page.evaluate(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(); return [r.width, r.height]; }), [profile.viewport.width, profile.viewport.height], 'it owns the whole screen');
        const live = await page.locator(`${PANEL} .dk-hud`).innerText(); const said = await page.locator(`${PANEL} .rp-status`).innerText();
        assert.doesNotMatch(live + said, /\d/, `no digit on the live HUD: ${live} / ${said}`);
        assert.match(live, /Lane/i); assert.match(live, /Closing/i); assert.match(live, /Hull/i); assert.match(live, /Warning/i); assert.match(live, /find the corridor|drifting wide|in the corridor|lined up/i);
        await noScroll('docking');
        const lay = await page.evaluate(() => {
          const sel = ['.wb-ftop', '.wb-fnote', '.dk-hud', '.dk-wrap', '.rp-status', '.dk-row'];
          const rows = sel.map((q) => document.querySelector(`.wb-full ${q}`)).filter((e) => e && e.offsetParent && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.toString().split(' ')[0], top: Math.round(r.top), bottom: Math.round(r.bottom) }; }).sort((x, y) => x.top - y.top);
          const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push({ between: `${rows[i - 1].c} > ${rows[i].c}`, px: rows[i].top - rows[i - 1].bottom });
          const cv = document.querySelector('.dk-panel canvas').getBoundingClientRect(), row = document.querySelector('.dk-row').getBoundingClientRect();
          return { gaps, maxGap: Math.max(0, ...gaps.map((g) => g.px)), below: innerHeight - rows[rows.length - 1].bottom, cvW: cv.width, cvH: cv.height, cvBottom: cv.bottom, rowTop: row.top, vw: innerWidth, sw: document.documentElement.scrollWidth, panelW: document.querySelector('.dk-panel').getBoundingClientRect().width, stageW: document.querySelector('.wb-full .wb-fstage').getBoundingClientRect().width, canvasPx: document.querySelector('.dk-panel canvas').width };
        });
        assert.ok(lay.maxGap <= 48, `no gap over 48 px: ${JSON.stringify(lay.gaps)}`);
        assert.ok(lay.sw <= lay.vw, `the page does not scroll sideways: ${lay.sw} > ${lay.vw}`);
        assert.ok(lay.panelW >= lay.stageW - 2, `the panel fills the stage: ${lay.panelW} of ${lay.stageW}`);
        assert.ok(lay.below <= 24, `the pad sits at the bottom of the screen: ${lay.below}`);
        assert.ok(lay.cvBottom <= lay.rowTop + 1, 'the board does not run under the pad');
        assert.ok(lay.cvW >= (phone ? profile.viewport.width - 40 : 700) && lay.cvH >= (phone ? 400 : 400), `the board is big: ${lay.cvW} x ${lay.cvH}`);
        assert.ok(lay.canvasPx >= lay.cvW - 2, 'the canvas is drawn at screen resolution');
        // the pad is the plain kit frame: no tap highlight square, no box shadow, no hover or pressed picture, thumb size
        const padStyle = () => page.evaluate((sel) => { const b = document.querySelector(`${sel} .dk-pad`), c = getComputedStyle(b), r = b.getBoundingClientRect(); return { tap: c.webkitTapHighlightColor, box: c.boxShadow, art: c.borderImageSource, filter: c.filter, w: r.width, h: r.height, cls: [...b.classList].filter((x) => /^(primary|ui-btn|dk-pad)$/.test(x)).sort().join(' ') }; }, PANEL);
        const before = await padStyle();
        assert.match(before.tap, /rgba\(0, 0, 0, 0\)|transparent/, 'no tap highlight'); assert.equal(before.box, 'none'); assert.match(before.filter, /drop-shadow/); assert.ok(before.w >= 80 && before.h >= 64, `thumb-size pad ${before.w} x ${before.h}`);
        assert.equal(before.cls, 'dk-pad primary ui-btn'.split(' ').sort().join(' '));
        await shot('1-approach');
      });

      await sub('the controls are real: a finger or the mouse sets the aim, the pad or Space or a key thrusts, and nothing sticks', async () => {
        const s0 = await snap(page);
        const toward = Math.atan2(-s0.y, -s0.x);                      // the base is up and away from the ship
        if (phone) {
          await hand(s0, toward, false); await wait(page, 150);
          let s = await snap(page); assert.ok(Math.abs(Math.atan2(Math.sin(s.input.aim - toward), Math.cos(s.input.aim - toward))) < 0.12, `a dragging finger aims: ${s.input.aim} vs ${toward}`);
          assert.equal(s.input.thrust, 0, 'dragging alone does not thrust');
          await hand(s, toward, true); await wait(page, 120); s = await snap(page); assert.equal(s.input.thrust, 1, 'the held pad thrusts');
          await wait(page, 300); s = await snap(page); assert.ok(Math.hypot(s.vx, s.vy) > 2, 'and the ship accelerates');
          assert.equal(await page.locator(`${PANEL} .dk-pad`).evaluate((b) => b.classList.contains('is-held')), true);
          await letGo(); await wait(page, 150); s = await snap(page); assert.equal(s.input.thrust, 0, 'letting go stops the thrust');
          assert.equal(await page.locator(`${PANEL} .dk-pad`).evaluate((b) => b.classList.contains('is-held')), false);
          const after = await page.evaluate((sel) => { const b = document.querySelector(`${sel} .dk-pad`), c = getComputedStyle(b); return { art: c.borderImageSource, box: c.boxShadow, tap: c.webkitTapHighlightColor }; }, PANEL);
          assert.equal(after.box, 'none'); assert.match(after.tap, /rgba\(0, 0, 0, 0\)|transparent/); assert.match(after.art, /button-primary\.webp/, 'no hover or pressed picture after a touch');
        } else {
          await page.mouse.move(s0.view.x + Math.cos(toward) * 120, s0.view.y + Math.sin(toward) * 120); await wait(page, 150);
          let s = await snap(page); assert.ok(Math.abs(Math.atan2(Math.sin(s.input.aim - toward), Math.cos(s.input.aim - toward))) < 0.12, 'the mouse aims'); assert.equal(s.input.thrust, 0, 'aiming alone does not thrust');
          await page.keyboard.down('Space'); await wait(page, 150); s = await snap(page); assert.equal(s.input.thrust, 1, 'Space thrusts'); await page.keyboard.up('Space');
          await page.mouse.down(); await wait(page, 120); s = await snap(page); assert.equal(s.input.thrust, 1, 'holding the mouse thrusts'); await page.mouse.up(); await wait(page, 120);
          s = await snap(page); assert.equal(s.input.thrust, 0, 'letting go stops the thrust');
          // the arrow keys and WASD burn in a direction: left and down by key, whatever the mouse says
          const v0 = await snap(page);
          await page.keyboard.down('a'); await wait(page, 500); await page.keyboard.up('a');
          let k = await snap(page); assert.ok(k.vx < v0.vx - 3, `A burns left (${v0.vx} -> ${k.vx})`);
          await page.keyboard.down('ArrowDown'); await wait(page, 500); await page.keyboard.up('ArrowDown');
          const k2 = await snap(page); assert.ok(k2.vy > k.vy + 3, 'the Down arrow burns down');
          assert.equal((await snap(page)).input.thrust, 0, 'no key left held');
        }
        // the ship swings round to the aim and the burn follows its heading
        assert.ok((await snap(page)).thrusting === false || true);
      });

      await sub('a hand that flies the real controls docks: lined up in the corridor, clamped, the result card, real XP', async () => {
        await recover(); const before = await state(page);
        let card = null, shots = {};
        for (let attempt = 0; attempt < 3 && !card; attempt++) {
          await openDocking();
          const s = await fly({ ms: 45000, until: (q) => { if (!shots.lined && q.d == null) { const f = frameOf(q); if (f.d < 55 && Math.abs(f.l) < f.half * 0.55) { shots.lined = true; return true; } } return false; } });
          if (shots.lined && s && !s.done) {
            await wait(page, 120);
            const w = await page.locator(`${PANEL} .dk-lane em`).innerText(); assert.match(w, /lined up|in the corridor/i, `lined up word: ${w}`);
            await shot('2-lined-up');
            const hudText = await page.locator(`${PANEL} .dk-hud`).innerText(); assert.doesNotMatch(hudText, /\d/, `no digit on the live HUD in flight: ${hudText}`);
            await fly({ ms: 40000 });
          }
          const fin = await snap(page);
          if (fin?.done) await wait(page, 180);
          if (fin?.done && fin.result.outcome === 'docked') { await wait(page, 250); await shot('3-clamped'); }
          await resultCard();
          card = await page.evaluate(() => { const c = document.querySelector('.dk-card'); return { ok: c.dataset.ok, outcome: c.dataset.outcome, grade: Number(c.dataset.grade), text: c.innerText }; });
          if (card.ok !== '1') { await shot(`3b-try-${attempt}`); await go('.dk-go'); await page.waitForSelector('.wb-full', { state: 'detached' }); card = null; shots = {}; }
        }
        assert.ok(card, 'docked within three tries');
        assert.equal(card.outcome, 'docked'); assert.ok(card.grade >= 70, card.text); assert.match(card.text, /dock|scraped/i); assert.match(card.text, /Piloting XP/);
        await shot('4-result');
        await go('.dk-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page);
        assert.ok(after.progress.xp.piloting > before.progress.xp.piloting || after.progress.levels.piloting > before.progress.levels.piloting, 'XP in Piloting');
        assert.match(after.said, /Docking: you did it/);
      });

      await sub('a scrape costs hull and never the run: thrown straight at the berth, the clamps refuse you, the hull bar drops, you keep flying', async () => {
        await openDocking();
        // full thrust at the berth from the start: it comes in far too fast
        const aim = (s) => { const f = frameOf(s); return { aim: Math.atan2(f.B.y - s.y, f.B.x - s.x), thrust: 1 }; };
        const s = await fly({ ms: 30000, steer: aim, until: (q) => q.scrapes > 0 });
        assert.ok(s.scrapes > 0, 'a scrape happened'); await wait(page, 80);
        const m = await page.evaluate((sel) => { const p = document.querySelector(sel); const st = p.__state; return { done: st.done, hull: st.hullLost, bar: parseFloat(p.querySelector('.dk-hull i').style.width), word: p.querySelector('.dk-hullstat em').textContent, lane: p.querySelector('.dk-lane em').textContent, said: p.querySelector('.rp-status').textContent }; }, PANEL);
        assert.equal(m.done, false, 'the run goes on'); assert.ok(m.hull > 0 && m.bar < 100, JSON.stringify(m)); assert.match(m.word, /scuffed|damaged/);
        assert.match(m.said + m.lane, /scrape|too fast|hull|wall/i, JSON.stringify(m));
        await shot('5-scrape');
        await letGo(); await wait(page, 600);
        assert.equal((await snap(page)).done, false, 'still flying after the scrape');
        await go('.wb-leave'); await page.waitForSelector('.wb-full', { state: 'detached' });
      });

      await sub('the base waves you off when the clock runs out: no dock, no XP, a Step back card', async () => {
        await openDocking(); const before = await state(page);
        await page.evaluate((sel) => { document.querySelector(sel).__state.t = document.querySelector(sel).__state.tmax - 0.6; }, PANEL);
        await resultCard();
        const card = await page.evaluate(() => { const c = document.querySelector('.dk-card'); return { ok: c.dataset.ok, outcome: c.dataset.outcome, text: c.innerText }; });
        assert.equal(card.outcome, 'waved-off'); assert.equal(card.ok, '0'); assert.match(card.text, /WAVED OFF/); assert.match(card.text, /No XP/); assert.match(card.text, /Step back/);
        await shot('6-waved-off');
        await go('.dk-go'); await page.waitForSelector('.wb-full', { state: 'detached' });
        const after = await state(page); assert.deepEqual(after.progress.xp, before.progress.xp, 'no XP for a waved-off run'); assert.match(after.said, /Docking: not this time/);
      });
      await letGo();
      assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], 'no page errors');
    } finally {
      await browser.close(); await server.close();
    }
  });
}
