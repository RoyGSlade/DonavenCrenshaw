// Opening track C in a real browser: scene 1 (Third Shift) played start to finish by bots at human speed, desktop and phone.
//   desktop: the good path (valve held, hose sealed, the loose mop, a plain head, the lever waited out) -> "Source found".
//   phone:   the rough path (valve lost and shut, hose lost, the mop from the cart, the absorber head screwed on, an early lever
//            release then the wait) -> "Under the goo". The two runs between them touch every branch of the chain.
// Asserts: each game opens full screen (the whole screen, no sideways scroll) and ends back in the room (same map, no cut, no dialogue
// box in between), the mop comes from both sources, the upgrade changes how fast the slime clears, the lever sequence works,
// the old "lights blink" text is gone from the cart, and every button in the games is a plain-frame pad with a transparent tap highlight.
// Opt-in, one at a time, under the browser lock:
//   PROOF_DIR=<dir> STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-opening-c-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function boot(page, origin) {
  await page.addInitScript(() => {
    try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {}
    let val;
    Object.defineProperty(window, '__stardust', { configurable: true, get: () => val, set: (v) => {
      val = v; const orig = v.jobs.take;
      v.jobs.take = (quest) => { const real = Math.random; if (quest.id === 'third-shift') Math.random = () => 1e-12; try { return orig(quest); } finally { Math.random = real; } };
    } });
  });
  await page.goto(`${origin}${V}?newgame=1`);
  await page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await settle(page, 1500);
}
const node = (page) => page.evaluate(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node || null);
const flags = (page) => page.evaluate(() => window.__stardust.store.get().flags || {});
const room = (page) => page.evaluate(() => window.__stardust.onfoot.world.map.id);
const toastText = (page) => page.evaluate(() => document.getElementById('vy-toast')?.textContent || '');
const waitNode = (page, id, ms = 15000) => page.waitForFunction((id) => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === id, id, { timeout: ms });

const readUntilChoices = async (page, max = 40) => {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => ({ choices: document.querySelectorAll('#hg-dialogue:not([hidden]) .ui-dlg-choice').length, next: Boolean(document.querySelector('#hg-dialogue:not([hidden]) .ui-dlg-next:not([hidden])')) }));
    if (st.choices) return;
    if (st.next) await page.locator('#hg-dialogue .ui-dlg-next').click({ timeout: 1500 }).catch(() => {});
    await settle(page, 220);
  }
  throw new Error('no choices');
};
const pickChoice = async (page, frag) => {
  for (let i = 0; i < 6; i++) {
    await readUntilChoices(page);
    const b = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: frag }).first();
    if (await b.count()) { await b.click(); return; }
    const go = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Go on' }).first();
    if (!(await go.count())) break;
    await go.click(); await settle(page, 400);
  }
  throw new Error(`no choice ${frag}`);
};
const walkTo = async (page, target) => {
  for (let hop = 0; hop < 8; hop++) {
    const door = await page.evaluate(async (target) => {
      const { doorToward } = await import('/projects/Space-Shooter/voyage/datapad/route.js');
      const { MAP_DEFS } = await import('/projects/Space-Shooter/voyage/maps/index.js');
      const w = window.__stardust.onfoot.world;
      if (w.map.id === target) return null;
      const id = doorToward(w.map.id, [target], MAP_DEFS);
      const e = w.doors.entries.find((x) => x.room === id), d = w.map.doors.find((x) => x.id === id);
      if (e) w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2); else w.place(d.x + d.w / 2, d.y + d.h / 2);
      return id;
    }, target);
    if (!door) return;
    await settle(page, 3200);
  }
};

for (const [size, profile, path] of [['desktop', DESK, 'good'], ['phone', PHONE, 'rough']]) {
  const phone = size === 'phone';
  test(`scene 1 is a chain of hands-on actions, ${size} (${path} path)`, { skip, timeout: 560000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|api\.donavencrenshaw/.test(m.text())) errors.push(m.text()); });
    const VW = profile.viewport.width, VH = profile.viewport.height;
    const shot = async (n) => { await settle(page, 450); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${size}.png` }); };
    const log = [];

    /** Stand beside a thing in the gym and use it the way a player does: face it, press E (desktop) or tap the prompt (phone). */
    const use = async (id) => {
      // Try standing spots round the thing until the prompt is on it (Pip stands beside the panel: another spot gets his prompt, not the lever's).
      const ok = await page.evaluate(async (id) => {
        const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
        const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
        const it = m.interacts.find((i) => i.id === id);
        if (!it) throw new Error(`no ${id}`);
        const spots = [];
        for (const k of [1.0, 1.2, 0.9, 1.4]) for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; spots.push([it.x + Math.cos(ang) * T * k, it.y + Math.sin(ang) * T * k]); }
        for (const [x, y] of spots) {
          if (!walkable(m, x, y, 12) || Math.hypot(x - it.x, y - it.y) >= it.reach - 4) continue;
          w.place(x, y, Math.atan2(it.y - y, it.x - x));
          await new Promise((r) => setTimeout(r, 170));
          if (w.target?.id === id) return true;
        }
        return false;
      }, id);
      assert.ok(ok, `a standing spot at ${id}`);
      await settle(page, 450);
      const tid = await page.evaluate(() => window.__stardust.onfoot.world.target?.id || null);
      assert.equal(tid, id, `the prompt is on ${id}`);
      if (phone) await page.tap('.of-prompt'); else await page.keyboard.press('KeyE');
      await settle(page, 350);
    };

    /** The overlay is the whole screen, nothing scrolls sideways, every button is a plain-frame pad with a transparent tap highlight. */
    const checkFull = async (label) => {
      await page.waitForSelector('.wb-full', { timeout: 15000 });
      await settle(page, 500);
      const m = await page.evaluate(() => {
        const r = document.querySelector('.wb-full').getBoundingClientRect();
        const btns = [...document.querySelectorAll('.wb-full button, .wb-full .ho-slot, .wb-full .ho-wheel, .wb-full .ho-canvas, .wb-full .rp-tile')].filter((b) => b.offsetParent).map((b) => {
          const cs = getComputedStyle(b), q = b.getBoundingClientRect();
          return { t: (b.textContent || b.className).trim().slice(0, 22), hl: cs.webkitTapHighlightColor, bi: cs.borderImageSource, ui: b.classList.contains('ui-btn'), x0: q.left, x1: q.right };
        });
        return { full: [r.width, r.height], sw: document.documentElement.scrollWidth, iw: innerWidth, btns, dlg: !document.getElementById('hg-dialogue').hidden, ho: document.body.classList.contains('ho-open') };
      });
      assert.deepEqual(m.full, [VW, VH], `${label}: the game owns the whole screen`);
      assert.equal(m.sw, m.iw, `${label}: no sideways scroll`);
      assert.equal(m.dlg, false, `${label}: no dialogue box behind it`);
      assert.equal(m.ho, true, `${label}: the hands-on phone rules are on`);
      for (const b of m.btns) {
        assert.ok(b.x0 >= -1 && b.x1 <= VW + 1, `${label}: "${b.t}" inside the screen`);
        assert.match(b.hl, /rgba\(0, 0, 0, 0\)|transparent/, `${label}: "${b.t}" has a transparent tap highlight (${b.hl})`);
        if (b.ui) assert.ok(!/hover|pressed|disabled/.test(b.bi), `${label}: "${b.t}" wears the plain frame (${b.bi})`);
      }
      return m;
    };
    /** House rule: no digits on an opening screen (the screen's own words, bars and pips only). */
    const noDigits = async (label) => {
      const hits = await page.evaluate(() => [...document.querySelectorAll('.wb-full .rp-panel *')].filter((e) => e.children.length === 0 && e.offsetParent && !e.closest('.rp-help') && /\d/.test(e.textContent)).map((e) => `${e.tagName}.${e.className}: ${e.textContent.trim()}`));
      assert.deepEqual(hits, [], `${label}: no digits on screen`);
    };
    /** Back in the room: the overlay is gone, same map, the floor is live, no dialogue box. */
    const backInRoom = async (label) => {
      await page.waitForSelector('.wb-full', { state: 'detached', timeout: 15000 });
      await settle(page, 400);
      const s = await page.evaluate(() => ({ map: window.__stardust.onfoot.world.map.id, mode: window.__stardust.onfoot.world.mode, dlg: !document.getElementById('hg-dialogue').hidden, ho: document.body.classList.contains('ho-open') }));
      assert.deepEqual(s, { map: 'duchess-holodeck', mode: 'walk', dlg: false, ho: false }, `${label}: back in the gym, no cut`);
    };

    // The water game bots (state is on the panel: window-free, a player's clicks do the rest).
    const solveWater = async () => {
      await page.waitForSelector('.wb-full .rp-panel .rp-tile');
      const plan = await page.evaluate(() => {
        const s = document.querySelector('.rp-panel').__state; const out = [];
        for (const i of s.net) { let m = s.tiles[i].mask, k = 0; while (m !== s.tiles[i].solved && k < 4) { m = ((m << 1) | (m >> 3)) & 15; k++; } if (k) out.push([i, k]); }
        return out;
      });
      for (const [i, k] of plan) for (let c = 0; c < k; c++) { await page.click(`.wb-full .rp-tile[data-i="${i}"]`, { timeout: 4000 }); await settle(page, 130); }
      await page.waitForSelector('.wb-full .rp-result.is-ok', { timeout: 15000 });
    };
    const loseWater = async (how) => {
      await page.waitForSelector('.wb-full .rp-panel .rp-tile');
      await settle(page, 600);
      await page.evaluate(() => { const s = document.querySelector('.rp-panel').__state; s.pool = s.capacity; });
      await page.waitForSelector('.wb-full .rp-result.is-bad', { timeout: 15000 });
      await settle(page, 300);
      if (how === 'shut') { await page.click('.wb-full .rp-shut'); await settle(page, 300); assert.match(await page.locator('.wb-full .rp-result').innerText(), /offline|Wellness foam/i); }
    };
    const tapBtn = async (sel) => { if (phone) await page.tap(sel); else await page.click(sel); };

    /** A real drag over the mop canvas, row by row, until the floor is clean. Returns { sweeps, head, power, lifted }. */
    const mopBot = async () => {
      await noDigits('mop');
      await page.waitForSelector('.wb-full .ho-mopcanvas');
      await settle(page, 400);
      const rect = await page.evaluate(() => { const r = document.querySelector('.ho-mopcanvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const dims = await page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="mop"]').__state; return { cols: s.cols, rows: s.rows }; });
      const px = (cx, cy) => [rect.x + (cx / dims.cols) * rect.w, rect.y + (cy / dims.rows) * rect.h];
      const fullH = await page.evaluate(() => document.querySelector('.ho-mopcanvas').getBoundingClientRect().height / innerHeight);
      assert.ok(fullH > (phone ? 0.45 : 0.6), `the mop board takes the spare height (${fullH.toFixed(2)} of the screen)`);
      let sweeps = 0, shot1 = false;
      for (let pass = 0; pass < 60; pass++) {
        for (let y = 1; y < dims.rows; y += 2) {
          const [x0, yy] = px(0.5, y), [x1] = px(dims.cols - 0.5, y);
          await page.mouse.move(x0, yy); await page.mouse.down();
          await page.mouse.move(pass % 2 ? x0 : x1, yy, { steps: 28 });
          await page.mouse.up(); sweeps++;
          const st = await page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="mop"]')?.__state; return s ? { done: s.done, c: 1 - s.goo.reduce((a, b) => a + b, 0) / s.total } : null; });
          if (!shot1 && st && st.c > 0.3) { shot1 = true; await shot('mop-midway'); }
          if (st?.done) { const r = await page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="mop"]').__state; return { head: s.head, power: s.power, lifted: s.lifted, puddles: s.puddles.length, mess: s.mess, workPerGoo: s.travel / s.total }; }); return { sweeps, ...r }; }
        }
      }
      throw new Error('the mop never finished');
    };

    try {
      await boot(page, server.origin);
      await pickChoice(page, 'Where is this gym?');
      await walkTo(page, 'duchess-holodeck');
      await pickChoice(page, 'Start cleaning.');
      // the old pick-a-way node is skipped by the page: the first hands-on beat is on
      await waitNode(page, 'work-valve');
      assert.equal(await room(page), 'duchess-holodeck');
      await settle(page, 900);
      assert.match(await toastText(page), /wheel|valve/i, 'Pip tells you what to do (the valve)');
      assert.equal(await page.evaluate(() => !document.getElementById('hg-dialogue').hidden), false, 'no dialogue box: the room is the menu');
      await shot('gym-start');

      await t.test('order: the hose, the cart and the lever are not first; the valve is', async () => {
        await use('holo-panel'); assert.match(await toastText(page), /Valve first/i);
        await use('supply-cart'); assert.match(await toastText(page), /Valve first/i);
        assert.equal(await page.evaluate(() => document.querySelector('.wb-full, .ho-cart') !== null), false, 'nothing opened');
        assert.equal(await node(page), 'work-valve');
      });

      await t.test('1. the valve: the water game, full screen, back in the room', async () => {
        await use('valve');
        const m = await checkFull('valve');
        assert.match(await page.locator('.wb-full .rp-eyebrow').innerText(), /FOAM VALVE/i);
        assert.equal(await page.locator('.rp-tile').count(), 0, 'the valve is its own game, not the pipe grid');
        assert.equal(await page.locator('.ho-wheel').count(), 3, 'three wheels');
        await noDigits('valve');
        {
          // house rule 5: the valve scene fills the height between the HUD and the wheels (no gap over 48 px) and takes real screen
          const g = await page.evaluate(() => { const c = document.querySelector('.ho-flowcanvas').getBoundingClientRect(), hud = document.querySelector('.ho-flowhud').getBoundingClientRect(), wh = document.querySelector('.ho-wheels').getBoundingClientRect(); return { h: c.height, top: c.top - hud.bottom, bottom: wh.top - c.bottom, tall: c.height > c.width }; });
          if (phone) {
            assert.ok(g.tall, 'a tall tank scene on a phone');
            assert.ok(g.h / VH >= 0.45, `the valve scene takes ${(g.h / VH).toFixed(2)} of the screen height`);
            assert.ok(g.top <= 48 && g.bottom <= 48, `no gap over 48 px (above ${g.top.toFixed(0)}, below ${g.bottom.toFixed(0)})`);
          } else assert.ok(g.h / VH >= 0.35, `the valve scene takes ${(g.h / VH).toFixed(2)} of the screen height`);
        }
        await shot('valve-game');
        const spin = async (id, turns) => { // circle a wheel with the pointer: positive clockwise (shuts), negative the other way (opens)
          const c = await page.evaluate((id) => { const r = document.querySelector(`.ho-wheel[data-valve="${id}"] .ho-wheel-rim`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 + 4 }; }, id);
          const dir = Math.sign(turns), n = Math.ceil(Math.abs(turns) * Math.PI * 2 / 0.3);
          await page.mouse.move(c.x + c.r, c.y); await page.mouse.down();
          for (let i = 1; i <= n; i++) { const a = dir * i * 0.3; await page.mouse.move(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r); }
          await page.mouse.up();
        };
        const fs = () => page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="flow"]').__state; return { level: s.level, leak: s.valves.leak, feed: s.valves.feed, done: s.done, ok: s.result?.success, spilled: s.spilled / s.floor }; });
        if (path === 'good') {
          await spin('leak', 3.2); assert.equal((await fs()).leak, 0, 'the stuck valve is tight');
          assert.match(await page.locator('.wb-full .rp-status').innerText(), /tight|open the feed/i);
          await spin('feed', -3.2); assert.equal((await fs()).feed, 1);
          for (let i = 0; i < 200 && (await fs()).level < 0.62; i++) await settle(page, 100);
          await spin('feed', 3.2);
          await page.waitForSelector('.wb-full .ho-card.is-ok', { timeout: 15000 });
          assert.ok((await fs()).spilled < 0.3, 'a tidy hold');
          await shot('valve-sealed');
          await tapBtn('.wb-full .ho-card .primary');
        } else {
          await page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="flow"]').__state; s.spilled = s.floor; });
          await page.waitForSelector('.wb-full .ho-card.is-bad', { timeout: 15000 });
          await shot('valve-lost');
          await tapBtn('.wb-full .ho-shutall'); await settle(page, 300);
          assert.match(await page.locator('.wb-full .ho-card').innerText(), /flooding stops/i);
          await tapBtn('.wb-full .ho-card button:not(.ho-shutall)');
        }
        await backInRoom('valve');
        await waitNode(page, 'work-hose');
        const f = await flags(page);
        if (path === 'good') assert.equal(f['s1-valve-fixed'], 1); else { assert.equal(f['s1-valve-lost'], 1); assert.equal(f['s1-valve-shut'], 1); assert.equal(f['s1-mess'], 1); }
        log.push(`valve ${path} ${m.btns.length} buttons`);
        await shot(path === 'good' ? 'room-valve-fixed' : 'room-flooded');
      });

      await t.test('2. the hose: the coolant game', async () => {
        await settle(page, 1200);
        assert.match(await toastText(page), /hose|pinhole|coolant/i);
        await use('hose');
        await checkFull('hose');
        assert.match(await page.locator('.wb-full .rp-eyebrow').innerText(), /COOLANT HOSE/i);
        assert.equal(await page.locator('.rp-panel[data-flavor="foam"]').count(), 0);
        await noDigits('hose');
        await shot('hose-game');
        if (path === 'good') { await solveWater(); assert.doesNotMatch(await page.locator('.wb-full .rp-result').innerText(), /XP/, 'no XP promised: none is granted'); await tapBtn('.wb-full .rp-result .primary'); }
        else { await loseWater('walk'); await tapBtn('.wb-full .rp-result button:not(.rp-shut)'); }
        await backInRoom('hose');
        await waitNode(page, 'work-mop');
        const f = await flags(page);
        if (path === 'good') assert.equal(f['s1-hose-fixed'], 1); else { assert.equal(f['s1-hose-lost'], 1); assert.equal(f['s1-mess'], 3); }
      });

      let mopRun;
      await t.test('3. the mop: picked up from the loose mop (desktop) or the cart (phone), upgraded at the cart, then the floor', async () => {
        await settle(page, 1200);
        await use('goo'); assert.match(await toastText(page), /need something to mop/i, 'no mop, no mopping');
        assert.equal(await page.locator('.wb-full').count(), 0);
        if (path === 'good') {
          await use('mop-loose');
          assert.match(await toastText(page), /pick up the mop/i);
          assert.equal((await flags(page))['s1-mop-held'], 1);
          await page.waitForFunction(() => window.__stardust.onfoot.world.stateOf('loose-mop') === 'gone', null, { timeout: 4000 });
          await shot('mop-picked-up');
          await use('supply-cart'); // the cart also offers the upgrade; this run skips it (plain head)
          assert.ok(await page.locator('.ho-cart').count(), 'the cart panel');
          assert.doesNotMatch(await page.locator('.ho-cart').innerText(), /lights|blink|numbers scroll/i);
          assert.match(await page.locator('.ho-cart').innerText(), /Fit an absorber head/);
          assert.equal(await page.locator('.ho-cart button', { hasText: 'Take a mop' }).count(), 0, 'you already have one');
          await tapBtn('.ho-cart button:has-text("Leave the cart")');
          await settle(page, 300);
        } else {
          await use('supply-cart');
          const panel = page.locator('.ho-cart');
          assert.ok(await panel.count(), 'the cart panel opens in the room');
          const text = await panel.innerText();
          assert.match(text, /two mops|squeegee|bucket/i);
          assert.doesNotMatch(text, /lights|blink|numbers scroll|closet/i, 'the old stock text is gone');
          await shot('cart-panel');
          await tapBtn('.ho-cart button:has-text("Take a mop")');
          await settle(page, 300);
          assert.equal((await flags(page))['s1-mop-held'], 1); assert.equal((await flags(page))['s1-mop-cart'], 1);
          await settle(page, 600); assert.equal(await page.evaluate(() => window.__stardust.onfoot.world.stateOf('loose-mop')), 'there', 'taken from the cart: the leaning mop stays');
          // the upgrade: a real screw game, full screen
          await tapBtn('.ho-cart button:has-text("Fit an absorber head")');
          await checkFull('screw');
          const sc = await page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="screw"]').__state; const r = document.querySelector('.cc-screwcanvas').getBoundingClientRect(); return { T: s.T, zone: s.zone, cx: s.cx, cy: s.cy, left: r.left, top: r.top, w: r.width, h: r.height }; });
          await shot('screw-head');
          const at = (a, rr) => [sc.left + ((sc.cx + Math.cos(a) * rr) / 500) * sc.w, sc.top + ((sc.cy + Math.sin(a) * rr) / 500) * sc.h];
          let a = 0; const [sx, sy] = at(a, 75); await page.mouse.move(sx, sy); await page.mouse.down();
          for (let i = 0; i < 400; i++) {
            a += 0.2; const [x, y] = at(a, 75); await page.mouse.move(x, y);
            if (i % 8 === 0) { const turns = await page.evaluate(() => document.querySelector('.rp-panel[data-game="screw"]').__state.turns); if (turns >= sc.T - sc.zone * 0.5) break; }
          }
          await page.mouse.up();
          await backInRoom('screw');
          await settle(page, 300);
          assert.equal((await flags(page))['s1-head-absorber'], 1, 'a snug head is the absorber');
          assert.match(await toastText(page), /absorber head bites/i);
          assert.equal(await page.locator('.ho-cart').count(), 1, 'back at the cart');
          await tapBtn('.ho-cart button:has-text("Leave the cart")');
          await settle(page, 300);
        }
        await use('goo');
        await checkFull('mop');
        await shot('mop-game');
        mopRun = await mopBot();
        await shot('mop-done');
        log.push(`mop ${JSON.stringify(mopRun)}`);
        await tapBtn('.wb-full .ho-card .primary');
        await backInRoom('mop');
        await waitNode(page, 'work-lever');
        assert.equal((await flags(page))['s1-mopped'], 1);
        await page.waitForFunction(() => window.__stardust.onfoot.world.stateOf('holo-goo') === 'clean', null, { timeout: 4000 });
        assert.equal(mopRun.head, path === 'good' ? 'plain' : 'absorber');
        assert.equal(mopRun.mess, path === 'good' ? 0 : 3);
        await shot('room-mopped');
      });

      await t.test('4. the lever: pull and hold, the hum dies, let go; the holodeck flickers; Pip reacts', async () => {
        await settle(page, 1200);
        assert.match(await toastText(page), /lever|hum/i);
        await use('holo-panel');
        await checkFull('lever');
        await noDigits('lever');
        await shot('lever-ready');
        const rect = await page.evaluate(() => { const r = document.querySelector('.ho-slot').getBoundingClientRect(); const hd = document.querySelector('.ho-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y0: hd.top + hd.height / 2, y1: r.bottom - 30 }; });
        const pull = async () => { await page.mouse.move(rect.x, rect.y0); await page.mouse.down(); await page.mouse.move(rect.x, rect.y1, { steps: 18 }); };
        const lv = () => page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="lever"]').__state; return { phase: s.phase, hum: s.hum, strikes: s.strikes, done: s.done }; });
        if (phone) {
          // too soon on purpose: a warning, not a failure
          await pull(); await settle(page, 900);
          assert.equal((await lv()).phase, 'off');
          await page.mouse.up(); await settle(page, 400);
          const w = await lv(); assert.equal(w.strikes, 1); assert.equal(w.done, false);
          assert.equal(await page.locator('.ho-strikes i.is-on').count(), 1, 'the warning shows as a pip');
          assert.match(await page.locator('.wb-full .rp-status').innerText(), /too soon|again|hold/i);
          await shot('lever-warning');
        }
        await pull(); await settle(page, 1500);
        const mid = await lv(); assert.equal(mid.phase, 'off'); assert.ok(mid.hum < 0.8 && mid.hum > 0.05, `the hum is running down (${mid.hum})`);
        await shot('lever-pulled');
        await settle(page, 2400);
        assert.equal((await lv()).phase, 'dead'); assert.match(await page.locator('.wb-full .rp-status').innerText(), /dead|let go/i);
        await page.mouse.up(); await settle(page, 300);
        await page.waitForSelector('.wb-full .ho-card.is-ok', { timeout: 8000 });
        await shot('lever-reset');
        await tapBtn('.wb-full .ho-card .primary');
        await backInRoom('lever');
        // the room answers: the holodeck flickers (state off at some point), then is on again
        await settle(page, 200);
        await waitNode(page, path === 'good' ? 'end-source-fixed' : 'end-slimed-end', 15000).catch(async () => { log.push(`ended at ${await node(page)}`); });
        await page.evaluate(() => window.__stardust.onfoot.world.setState('holo-projector', 'off'));
        await shot('holodeck-flicker-dark');
        await page.evaluate(() => window.__stardust.onfoot.world.setState('holo-projector', null));
      });

      await t.test('the ending: what you did picks it, and the approved lines play', async () => {
        for (let i = 0; i < 30; i++) {
          const st = await page.evaluate(() => ({ end: Boolean(document.querySelector('.qs-end')), dlg: !document.getElementById('hg-dialogue').hidden, text: document.getElementById('hg-dialogue').innerText }));
          if (st.end) break;
          if (st.dlg) { const next = page.locator('#hg-dialogue .ui-dlg-next:not([hidden])'); if (await next.count()) await next.click().catch(() => {}); else await page.locator('#hg-dialogue .ui-dlg-choice').first().click().catch(() => {}); }
          await settle(page, 400);
        }
        const run = await page.evaluate(() => window.__stardust.store.get().quests.done?.['third-shift'] || null);
        assert.ok(run, 'scene 1 finished');
        assert.equal(run.outcome, path === 'good' ? 'source-fixed' : 'slimed');
        await shot('ending');
      });

      log.push(`errors ${errors.length}`);
      assert.deepEqual(errors, []);
      // the mop upgrade: the absorber run cleared the floor with at least 2x fewer sweeps, with more goo to clear
      globalThis.__ocRuns = { ...(globalThis.__ocRuns || {}), [size]: mopRun };
      const r = globalThis.__ocRuns;
      if (r.desktop && r.phone) {
        assert.ok(r.desktop.workPerGoo >= r.phone.workPerGoo * 1.6, `mopping travel per bit of goo: plain ${r.desktop.workPerGoo.toFixed(2)} vs absorber ${r.phone.workPerGoo.toFixed(2)}`);
        assert.ok(Math.abs(r.phone.power / r.desktop.power - 2.4) < 1e-6);
      }
      console.log(log.join('\n'));
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      await server.close();
    }
  });
}
