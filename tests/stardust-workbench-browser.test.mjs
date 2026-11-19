// The workbench room in the REAL page (?newgame=1&start=workbench), at 1440x900 and 390x844: every station opens its game after a
// real d20 and pays real XP into the character (a bot plays each of the nine to a win), the practice lock and the gym trainer,
// the three talks with their social checks, the sparring fight, the live board, scan, die and reprint, reset, a reload, and the
// room is closed without the flag. Opt-in, one at a time, under the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/workbench/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-workbench-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const NINE = [['repair', 'repair'], ['hack', 'hacking'], ['craft', 'crafting'], ['nav', 'navigation'], ['pilot', 'piloting'], ['stealth', 'stealth'], ['persuade', 'social'], ['intimidate', 'social'], ['haggle', 'social']];

export async function bootRoom(page, origin, extra = '') {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7${extra}`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; }); // the d20 lands on 14
}

// Walk up to a thing in the room and press E: put the player at its reach, then use what is in reach.
async function use(page, id) {
  await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
    const it = m.interacts.find((i) => i.id === id);
    if (!it) throw new Error(`no ${id}`);
    let dx = m.w / 2 - it.x, dy = m.h / 2 - it.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const dirs = [[dx, dy], [0, 1], [0, -1], [-1, 0], [1, 0]];
    for (const [ux, uy] of dirs) for (const k of [1.1, 1.0, 1.25, 0.9, 1.4]) { const x = it.x + ux * T * k, y = it.y + uy * T * k; if (walkable(m, x, y, 12) && Math.hypot(x - it.x, y - it.y) < it.reach - 4) { w.place(x, y); return; } }
    throw new Error(`no standing spot at ${id}`);
  }, id);
  await page.waitForTimeout(260);
  const got = await page.evaluate(() => { const w = window.__stardust.onfoot.world; w.useTarget(); return w.target?.id ?? null; });
  assert.equal(got, id, `the thing in reach is ${id} (${await page.evaluate(() => { const w = window.__stardust.onfoot.world; return JSON.stringify({ mode: w.mode, p: [Math.round(w.player.x), Math.round(w.player.y)], busy: window.__stardust.workbench.busy, panel: Boolean(document.querySelector('.of-panel, .of-overlay, .of-talk')), sheet: !document.getElementById('hg-minigame').hidden, dlg: !document.getElementById('hg-dialogue').hidden }); })})`);
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__stardust.workbench.state)));
const sheetOpen = (page) => page.waitForSelector('#hg-minigame:not([hidden]) .wb-stage .rp-panel', { timeout: 15000 });
const sheetShut = (page) => page.waitForSelector('#hg-minigame', { state: 'hidden', timeout: 15000 });

// Each game's bot: plays to the result card by tapping what a player taps (the skin test's bots).
const BOTS = {
  repair: async (page, tap) => { for (let i = 0; i < 80 && !(await page.locator('.rp-result').count()); i++) { const idx = await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/minigames/repair.js')).nextHint(document.querySelector('.rp-panel').__state)); if (idx == null) break; await tap(`.rp-tile[data-i="${idx}"]`); } },
  hack: async (page, tap) => { for (let i = 0; i < 6; i++) { if (await page.locator('.rp-result').count()) break; await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; if (!s.done) { s.cursor = s.tumblers[s.index].at; s.dir = 0; } }); await tap('.hk-btn'); } },
  haggle: async (page) => {
    await page.evaluate(async () => { const m = await import('/projects/Space-Shooter/voyage/minigames/haggle.js'); const s = document.querySelector('.hg-panel').__state; const [lo, hi] = m.bandPrices(s); const v = s.speed; s.phase = 0; s.t = 0; for (let t = 0; t < 4; t += 0.005) { const p = m.priceAt(s, m.needleAt(s, t)); if (p >= lo && p <= hi) { s.phase = (t * v) % 2; s.t = 0; s.speed = 0; break; } } });
    await page.evaluate(() => document.querySelector('.hk-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  },
  craft: async (page, tap) => {
    await page.evaluate(() => { const s = document.querySelector('.cf-panel').__state, btn = document.querySelector('.cf-hold'); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 })); const t = setInterval(() => { if (s.phase !== 'heat') return clearInterval(t); if (s.temp >= s.centre) { clearInterval(t); btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 })); } }, 2); });
    await page.waitForFunction(() => document.querySelector('.cf-panel').__state.phase === 'shape');
    const order = await page.evaluate(() => document.querySelector('.cf-panel').__state.order);
    for (const t of order) await tap(`[data-tool="${t}"]`);
  },
  nav: async (page, tap) => { const sol = await page.evaluate(() => [...document.querySelector('.nv-panel').__state.solution]); for (let k = 1; k < sol.length; k++) await tap(`.nv-cell[data-i="${sol[k]}"]`); },
  stealth: async (page, tap) => { const route = await page.evaluate(() => [...document.querySelector('.st-panel').__state.safe]); for (let k = 1; k < route.length; k++) await tap(`.st-panel .st-cell[data-i="${route[k]}"], .nv-cell[data-i="${route[k]}"]`); },
  persuade: async (page, tap) => { const cards = await page.evaluate(() => { const s = document.querySelector('.pc-panel').__state; return s.hand.filter((c) => s.cares.includes(c.value)).sort((a, b) => b.worth - a.worth).map((c) => c.id); }); for (let k = 0; k < cards.length && !(await page.locator('.rp-result').count()); k++) await tap(`.pc-card[data-id="${cards[k]}"]`); },
  intimidate: async (page, tap) => {
    await page.evaluate(() => { document.querySelector('.it-panel').__state.rolls = Array(12).fill(0.99); });
    await tap('.it-push'); await tap('.it-push');
    while (!(await page.locator('.rp-result').count())) { const left = await page.evaluate(() => { const s = document.querySelector('.it-panel').__state; return { won: s.won, goal: s.goal, done: s.done }; }); if (left.done) break; await tap(left.won >= left.goal ? '.it-stand' : '.it-push'); }
  },
  pilot: async (page) => {
    await page.evaluate(() => {
      const panel = document.querySelector('.pl-panel'), s = panel.__state;
      const el = { left: panel.querySelector('.pl-left'), right: panel.querySelector('.pl-right'), thrust: panel.querySelector('.pl-thrust') }, held = { left: false, right: false, thrust: false };
      const set = (k, on) => { if (held[k] === on) return; held[k] = on; el[k].dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: 1, cancelable: true })); };
      const tick = () => { if (s.done) { for (const k of Object.keys(held)) set(k, false); return; } const err = s.padX - s.x, want = Math.max(-12, Math.min(12, err * 0.8)), dv = want - s.vx; const a = s.thrustAcc - s.g, lim = Math.sqrt(Math.max(0, 2 * a * s.y * 0.55)) + s.safe * 0.3; set('left', dv < -0.5); set('right', dv > 0.5); set('thrust', s.vy > lim); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  },
};
const tapper = (page, phone) => (sel) => (phone ? page.tap(sel) : page.click(sel));
/** Play the open game to its result card with the bot, close the card. */
async function playToEnd(page, id, phone) {
  await BOTS[id](page, tapper(page, phone));
  await page.waitForSelector('.rp-result', { timeout: 45000 });
  await page.waitForTimeout(250);
}
const closeCard = async (page, phone) => { await tapper(page, phone)('.rp-result button'); };

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`workbench room, ${name}`, { skip, timeout: 560000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (n) => { await page.waitForTimeout(350); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const sub = (title, fn) => (!only || only.includes(title) ? t.test(title, fn) : null);
    try {
      await sub('closed without the flag, and the plain new game does not land in the room', async () => {
        const p2 = await context.newPage();
        await p2.goto(`${server.origin}${V}?start=workbench`);
        assert.equal(await p2.locator('#vy-closed').isVisible(), true, 'no flag: the closed card');
        assert.equal(await p2.evaluate(() => Boolean(window.__stardust)), false);
        await p2.close();
        const p3 = await context.newPage();
        await p3.goto(`${server.origin}${V}?newgame=1`);
        await p3.waitForFunction(() => window.__stardust?.onfoot?.world);
        assert.notEqual(await p3.evaluate(() => window.__stardust.onfoot.world.map.id), 'workbench');
        assert.equal(await p3.evaluate(() => window.__stardust.workbench), null);
        await p3.close();
      });

      await bootRoom(page, server.origin);
      await sub('the room loads: overview, no sideways scroll, a live chip, the flag stays off', async () => {
        const m = await page.evaluate(() => ({ map: __stardust.onfoot.world.map.id, doors: __stardust.onfoot.world.map.doors.length, sw: document.documentElement.scrollWidth, iw: innerWidth, hud: document.getElementById('wb-hud').textContent, newGame: null, npcs: __stardust.onfoot.world.map.npcs.map((n) => n.id).sort(), name: document.querySelector('.vy-wordmark').textContent }));
        assert.equal(m.map, 'workbench'); assert.equal(m.doors, 1, 'one door: into the patrol yard'); assert.equal(m.sw, m.iw, 'the page is exactly as wide as the screen');
        assert.match(m.hud, /SCANNED[\s\S]*100 credits/); assert.deepEqual(m.npcs, ['nessa', 'pip', 'tull']); assert.match(m.name, /WORKBENCH/i);
        assert.equal((await state(page)).dc, 12);
        await shot('1-overview');
      });

      await sub('the nine stations: a real d20, the preview line, the skinned game, real XP in the character', async () => {
        for (const [id, skill] of NINE) {
          const before = await state(page);
          await use(page, `wb-${id}`);
          await page.waitForSelector('#hg-attempt:not([hidden])', { timeout: 5000 });
          await page.waitForFunction(() => /Made it|Not this time|Natural/.test(document.getElementById('hg-attempt').innerText), null, { timeout: 5000 });
          const tray = await page.locator('#hg-attempt').innerText();
          assert.match(tray, /14 \+ .* = 1\d[\s\S]*needs 12/, `the tray shows the d20 sum (${tray})`);
          if (id === 'repair') await shot('2-station-roll');
          await sheetOpen(page);
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, note: document.querySelector('.wb-preview').textContent, title: document.getElementById('hg-minigame-title').textContent, eyebrow: document.getElementById('hg-minigame-eyebrow').textContent, skin: Boolean(document.querySelector('.wb-stage .mg-skin, .wb-stage .ui-panel, .wb-stage .rp-panel')) }));
          assert.equal(m.sw, m.iw, `${id}: no sideways scroll`);
          assert.match(m.note, /roll:/, `${id}: preview line`); assert.match(m.eyebrow, /STEADY ROLL/);
          if (id === 'repair') await shot('3-station-game');
          await playToEnd(page, id, phone);
          if (id === 'repair') await shot('4-station-result');
          await closeCard(page, phone);
          await sheetShut(page);
          const after = await state(page);
          const gained = (after.progress.levels[skill] - before.progress.levels[skill]) > 0 || after.progress.xp[skill] > before.progress.xp[skill];
          assert.ok(gained, `${id}: XP landed in ${skill} (${JSON.stringify(before.progress.xp[skill])} -> ${JSON.stringify(after.progress.xp[skill])})`);
          assert.equal(await page.evaluate((s) => __stardust.store.get().character.levels[s], skill), after.progress.levels[skill], `${id}: the level is mirrored into the captain's save`);
          assert.match(after.said, /XP/);
        }
        assert.ok((await state(page)).xpPaid >= 9 * 3);
      });

      await sub('practice lock: opens the ring, no clock, no XP', async () => {
        const before = await state(page);
        await use(page, 'wb-lock');
        await sheetOpen(page);
        assert.match(await page.locator('.wb-preview').textContent(), /no clock/i);
        await shot('5-practice-lock');
        await playToEnd(page, 'hack', phone);
        await closeCard(page, phone); await sheetShut(page);
        assert.deepEqual((await state(page)).progress, before.progress);
      });

      await sub('gym trainer: spend a point, train for credits, the XP is a quarter', async () => {
        await use(page, 'wb-gym');
        await page.waitForSelector('#hg-minigame:not([hidden]) .wb-pane .ex-cats');
        await page.waitForTimeout(200);
        const sel = phone ? 'tap' : 'click';
        const plus = page.locator('.wb-pane .ex-step.primary:not([disabled])').first();
        if (await plus.count()) { await plus[sel](); await page.waitForTimeout(150); }
        const mid = await state(page);
        assert.ok(Object.values(mid.progress.points.repair || {}).some((n) => n > 0), 'a point was spent');
        await shot('6-gym');
        const credits = mid.credits;
        await page.locator('.wb-train[data-game="repair"]')[sel]();
        await sheetOpen(page);
        assert.match(await page.locator('#hg-minigame-eyebrow').textContent(), /GYM/);
        await playToEnd(page, 'repair', phone); await closeCard(page, phone);
        await page.waitForSelector('#hg-minigame:not([hidden]) .wb-pane .gm-list');
        const after = await state(page);
        assert.equal(after.credits, credits - 10, 'the gym fee');
        assert.match(after.said, /XP|hour/);
        await page.locator('.wb-pane .gm-row button', { hasText: 'Close' })[sel](); await sheetShut(page);
      });

      await sub('talks: Tull haggles, Nessa is persuaded, Pip is leaned on, with real checks and results', async () => {
        const tap = tapper(page, phone);
        const nextLine = async (frag) => { await page.waitForFunction((f) => document.querySelector('#hg-dialogue:not([hidden]) .ui-dlg-text')?.textContent.includes(f), frag, { timeout: 15000 }); };
        const choose = async (frag) => { const b = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: frag }).first(); await b.waitFor({ timeout: 15000 }); await tap(`#hg-dialogue .ui-dlg-choice:has-text("${frag}")`); };
        // Tull
        await use(page, 'tull');
        await nextLine('workbench bay');
        assert.equal(await page.locator('#hg-dialogue .ui-dlg-portrait img').count(), 1, 'Tull shows his face');
        assert.match(await page.locator('#hg-dialogue .ui-dlg-name').textContent(), /Tull/);
        assert.match(await page.locator('#hg-dialogue .ui-dlg-choice[data-kind="attempt"]').first().textContent(), /Roll .* vs 12: \d+%/);
        await shot('7-talk');
        const credits = (await state(page)).credits, social = (await state(page)).progress;
        await choose('Haggle');
        await page.waitForSelector('#hg-attempt:not([hidden])'); await sheetOpen(page);
        await playToEnd(page, 'haggle', phone); await closeCard(page, phone); await sheetShut(page);
        await nextLine('Thirty credits');
        assert.ok((await state(page)).credits > credits, 'the price paid credits');
        assert.notDeepEqual((await state(page)).progress.xp.social, social.xp.social);
        await choose('Pleasure'); await page.waitForSelector('#hg-dialogue', { state: 'hidden' });
        // Nessa
        await use(page, 'nessa'); await nextLine('teach them the lane').catch(() => nextLine('charge in patience'));
        await choose('Talk her'); await sheetOpen(page);
        await playToEnd(page, 'persuade', phone); await closeCard(page, phone); await sheetShut(page);
        await nextLine('Hands off the stick'); await choose('Thank you'); await page.waitForSelector('#hg-dialogue', { state: 'hidden' });
        // Pip
        await use(page, 'pip'); await nextLine('good cutter');
        await choose('Lean on him'); await sheetOpen(page);
        await playToEnd(page, 'intimidate', phone); await closeCard(page, phone); await sheetShut(page);
        await nextLine('Take it'); await choose('Thanks, Pip'); await page.waitForSelector('#hg-dialogue', { state: 'hidden' });
      });

      await sub('sparring: a marauder fight that starts, ends, pays Shooting XP, and can be fought again', async () => {
        for (let round = 0; round < 2; round++) {
          const before = (await state(page)).progress.xp.shooting + 20 * ((await state(page)).progress.levels.shooting - 1);
          await use(page, 'wb-spar');
          await page.waitForSelector('#hg-minigame:not([hidden]) .wb-count');
          if (round === 0) await shot('8-spar-picker');
          await page.locator('.wb-n[data-n="1"]')[phone ? 'tap' : 'click']();
          await page.locator('.wb-start')[phone ? 'tap' : 'click']();
          await page.waitForFunction(() => window.__stardust.onfoot.world.mode === 'fight');
          assert.equal(await page.evaluate(() => __stardust.onfoot.world.fightState.enemies.map((e) => e.type).join()), 'marauder');
          await page.waitForTimeout(900);
          if (round === 0) await shot('9-spar-fight');
          await page.evaluate(() => { const f = __stardust.onfoot.world.fightState; for (const e of f.enemies) { e.alive = false; e.hp = 0; } f.kills = f.enemies.length; });
          await page.waitForFunction(() => window.__stardust.onfoot.world.mode === 'walk', null, { timeout: 8000 });
          const s = await state(page);
          assert.match(s.said, /Ring clear, 1 marauder down\. \+4 Shooting XP/);
          assert.equal(s.progress.xp.shooting + 20 * (s.progress.levels.shooting - 1) - before, 4);
        }
      });

      await sub('board, scan, die and reprint, reset: live and correct', async () => {
        await use(page, 'wb-board');
        await page.waitForSelector('#hg-minigame:not([hidden]) .wb-pane .ex-skill');
        assert.match(await page.locator('.wb-pane .ex-chip').innerText(), /UNSCANNED/);
        assert.equal(await page.locator('.wb-pane .ex-skill').count(), 8, 'all eight skills');
        assert.ok(await page.locator('.wb-pane .ex-risk li').count() >= 8, 'a row for each skill that moved');
        await shot('10-board-after-xp');
        await page.locator('.wb-dc')[phone ? 'tap' : 'click']();
        assert.equal((await state(page)).dc, 16); await page.locator('.wb-dc')[phone ? 'tap' : 'click'](); await page.locator('.wb-dc')[phone ? 'tap' : 'click']();
        assert.equal((await state(page)).dc, 12);
        await page.locator('.wb-pane .gm-row button', { hasText: 'Close' })[phone ? 'tap' : 'click'](); await sheetShut(page);
        // scan: safe
        await use(page, 'wb-scan');
        await page.waitForFunction(() => document.getElementById('wb-hud').dataset.tone === 'safe');
        assert.equal((await state(page)).scans, 1);
        // earn something, then die: back to the scan
        await page.evaluate(async () => { const m = await import('/projects/Space-Shooter/voyage/workbench/state.js'); const w = __stardust.workbench; w.state = m.earnXp(w.state, 'repair', 10).state; });
        await page.waitForFunction(() => document.getElementById('wb-hud').dataset.tone !== 'safe');
        const pre = await state(page);
        await use(page, 'wb-reprint');
        await page.waitForSelector('#hg-minigame:not([hidden]) .wb-yes');
        assert.match(await page.locator('.wb-pane .ex-chip').innerText(), /10 XP at risk/);
        await shot('11-reprint');
        await page.locator('.wb-yes')[phone ? 'tap' : 'click'](); await sheetShut(page);
        const post = await state(page);
        assert.deepEqual(post.progress.levels, pre.snap.levels); assert.deepEqual(post.progress.xp, pre.snap.xp); assert.equal(post.deaths, 1);
        assert.equal(await page.evaluate(() => document.getElementById('wb-hud').dataset.tone), 'safe');
        // reload keeps the test character
        await page.reload(); await page.waitForFunction(() => window.__stardust?.workbench); await page.waitForTimeout(800);
        assert.deepEqual((await state(page)).progress, post.progress);
        // reset
        await page.evaluate(() => { window.__stardust.workbench.rng = () => 0.65; });
        await use(page, 'wb-reset');
        await page.waitForSelector('#hg-minigame:not([hidden]) .wb-yes');
        await page.locator('.wb-yes')[phone ? 'tap' : 'click'](); await sheetShut(page);
        const fresh = await state(page);
        assert.ok(Object.values(fresh.progress.levels).every((l) => l === 1)); assert.equal(fresh.credits, 100); assert.equal(fresh.xpPaid, 0); assert.equal(fresh.deaths, 0);
        assert.equal(await page.evaluate(() => __stardust.store.get().character.levels.repair), 1);
      });
      assert.deepEqual(errors.filter((e) => !/favicon|ERR_FAILED|net::/.test(e)), []);
    } finally { await context.close(); await browser.close(); await server.close(); }
  });
}
