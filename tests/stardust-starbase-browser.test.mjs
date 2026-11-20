// The star base, tier 1, in the REAL page at 1440x900 (mouse and keys) and 390x844 (real touch): finish the claim from a seeded save,
// hop home with one tap, dock (the stand-in), walk the airlock and the concourse, open each of the four units and the workshop and the
// galley, leave. Each interactable opens the right thing; nothing scrolls sideways; every game opens on the whole screen; pads are the
// kit's plain frame with a transparent tap highlight (no sticky hover picture); the page has exactly one h1. Opt-in, one at a time, under
// the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/starbase/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-starbase-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { testCharacter } from '../projects/Space-Shooter/voyage/quests/core.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { startQuest } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { SLOT_POS } from '../projects/Space-Shooter/voyage/starbase/maps.js';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';

// A captain one tap from the claim: a Dead Weight run that has towed the hulk home and is standing at "keep or sell".
const LV = Object.fromEntries(['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation'].map((id) => [id, 5]));
const captain = { ...testCharacter({ cha: 5, con: 5, dex: 5, wis: 5, str: 5 }), id: 'c-sbtest', name: 'Tester', levels: LV };
const bare = { ...emptySave(), money: 300, character: captain, items: { scrap: 3 } };
const run = (() => { const s = startQuest(QUESTS['dead-weight'], bare, { seed: 3 }); return { ...s.run, node: 'keep-or-sell', part: null, local: { towed: true } }; })();
const SEED_SAVE = { ...bare, quests: { active: { 'dead-weight': run } } };

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`star base, ${name}`, { skip, timeout: 580000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    await context.addInitScript((seed) => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); if (!localStorage.getItem('stardust.voyage.v1')) localStorage.setItem('stardust.voyage.v1', JSON.stringify(seed)); } catch {} }, SEED_SAVE);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    const VW = profile.viewport.width, VH = profile.viewport.height;
    const log = (...a) => console.log(`# [${name}]`, ...a);
    const shot = async (n) => { await page.waitForTimeout(700); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const tap = (sel) => (phone ? page.tap(sel, { timeout: 15000 }) : page.click(sel, { timeout: 15000 }));
    const S = (fn, arg) => page.evaluate(fn, arg);
    const noSideways = async (label) => {
      const m = await S(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, x: scrollX }));
      assert.ok(m.sw <= m.iw && m.bw <= m.iw && m.x === 0, `${label}: nothing scrolls sideways ${JSON.stringify(m)}`);
    };
    /** A game opens on the whole screen: the shared overlay is fixed, covers the viewport, with a game in it. */
    const checkFull = async (label) => {
      await page.waitForSelector('.wb-full .wb-fstage > *', { timeout: 20000 });
      await page.waitForTimeout(400);
      const m = await S(() => { const r = document.querySelector('.wb-full').getBoundingClientRect(), cs = getComputedStyle(document.querySelector('.wb-full')); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth }; });
      assert.equal(m.pos, 'fixed', `${label}: the game overlay is fixed`);
      assert.ok(m.l <= 0 && m.t <= 0 && m.w >= m.iw - 1 && m.h >= m.ih - 1, `${label}: the game owns the whole screen ${JSON.stringify(m)}`);
      assert.ok(m.sw <= m.iw, `${label}: no sideways scroll in a game`);
    };
    /** Plain-frame pads: the kit's plain picture (never the hover or pressed one), a transparent tap highlight. */
    const checkPad = async (sel, label) => {
      const read = () => S((sel) => { const e = document.querySelector(sel); const cs = getComputedStyle(e); return { hl: cs.webkitTapHighlightColor, img: cs.borderImageSource, shadow: cs.boxShadow }; }, sel);
      const r = await read();
      assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(r.hl), `${label}: transparent tap highlight (${r.hl})`);
      assert.ok(/button(-primary)?\.webp/.test(r.img) && !/hover|pressed/.test(r.img), `${label}: plain frame (${r.img})`);
      assert.equal(r.shadow, 'none', `${label}: no box-shadow glow (a drop-shadow filter instead)`);
      if (!phone) { await page.hover(sel); const h = await read(); assert.ok(!/hover|pressed/.test(h.img), `${label}: hover keeps the plain frame (${h.img})`); }
    };
    /** Stand at an interact and use it: the E key on desktop, a real tap on the prompt on a phone. */
    const use = async (id) => {
      await S(async (id) => {
        const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
        const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
        const it = m.interacts.find((i) => i.id === id);
        if (!it) throw new Error(`no ${id} in ${m.id}`);
        let dx = m.w / 2 - it.x, dy = m.h / 2 - it.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        for (const [ux, uy] of [[0, 1], [dx, dy], [0, -1], [-1, 0], [1, 0]]) for (const k of [1.1, 1.0, 1.25, 0.9, 1.4]) { const x = it.x + ux * T * k, y = it.y + uy * T * k; if (walkable(m, x, y, 12) && Math.hypot(x - it.x, y - it.y) < it.reach - 4) { w.place(x, y); return; } }
        throw new Error(`no standing spot at ${id}`);
      }, id);
      await page.waitForFunction((id) => window.__stardust.onfoot.world.target?.id === id, id, { timeout: 8000 }).catch(async () => { throw new Error(`the thing in reach is not ${id}: ${await S(() => JSON.stringify({ t: window.__stardust.onfoot.world.target?.id, map: window.__stardust.onfoot.world.map.id, mode: window.__stardust.onfoot.world.mode }))}`); });
      if (phone) await page.tap('.of-prompt', { timeout: 8000 }); else await page.keyboard.press('KeyE');
    };
    const inMap = (id) => page.waitForFunction((id) => window.__stardust.onfoot.world.map.id === id, id, { timeout: 20000 });
    const unit = (id) => page.waitForSelector(`.sb-panel[data-unit="${id}"]`, { timeout: 10000 });
    const leaveUnit = async () => { await tap('.sb-panel [data-sb="leave"]'); await page.waitForSelector('.sb-panel', { state: 'detached', timeout: 5000 }); await page.waitForFunction(() => window.__stardust.onfoot.world.mode === 'walk'); };
    const save = () => S(() => JSON.parse(JSON.stringify(window.__stardust.store.get())));

    // ---- boot: a captain with the tow job one answer from the claim ----------------------------------------------------------------
    await page.goto(`${server.origin}${V}?newgame=1&start=hangar`);
    await page.waitForFunction(() => window.__stardust?.onfoot?.world && window.__stardust.starbase);
    await page.waitForTimeout(1200);
    const first = await save();
    assert.equal(first.base, undefined, 'no base before the claim');
    assert.equal(first.flags?.['starbase-claimed'], undefined);
    const h1s = await S(() => [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().slice(0, 30) + (h.closest('[hidden]') ? ' (hidden)' : '')));
    log('h1s on the page:', JSON.stringify(h1s));
    const visibleH1 = await S(() => [...document.querySelectorAll('h1')].filter((h) => !h.closest('[hidden]')).length);
    assert.equal(visibleH1, 1, `exactly one visible h1 ${JSON.stringify(h1s)}`);
    assert.equal(await S(async () => { const { mapDef } = await import('/projects/Space-Shooter/voyage/maps/index.js'); return Boolean(mapDef('starbase-concourse')); }), false, 'no base maps before the claim');
    // The helm does not offer the base yet, and the hop map draws no base.
    await S(() => { window.__stardust.onfoot.helm(); });
    await page.waitForSelector('.of-helm .of-course');
    assert.equal(await S(() => Boolean(document.querySelector('.of-helm [data-target="starbase"]'))), false, 'the helm hides the base until it is yours');
    await tap('.of-helm button:not(.of-course)'); // Stay docked
    await page.waitForSelector('.of-helm', { state: 'detached' });

    // ---- the claim --------------------------------------------------------------------------------------------------------------------
    await page.waitForSelector('#dp-continue', { timeout: 15000 });
    await tap('#dp-continue');
    await page.waitForSelector('.ui-dlg-choice', { timeout: 40000 });
    const choices = await S(() => [...document.querySelectorAll('.ui-dlg-choice')].map((b) => b.textContent.trim()));
    assert.equal(choices.length, 2, JSON.stringify(choices));
    assert.match(choices[0], /Sell her/);
    assert.match(choices[1], /Keep her/);
    await shot('1-claim-choice');
    await tap('.ui-dlg-choice:nth-of-type(2)');
    await page.waitForFunction(() => window.__stardust.store.get().flags?.['starbase-claimed'] === 1, null, { timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.__stardust.store.get().base), null, { timeout: 5000 });
    const claimed = await save();
    assert.equal(claimed.base.tier, 1);
    assert.equal(claimed.base.v, 1);
    assert.equal(claimed.quests.done['dead-weight'].outcome, 'kept-hulk');
    assert.equal(claimed.flags['fragment-3'], 1, 'the fragment still comes');
    assert.equal(claimed.money, 300, 'keeping pays no credits');
    log('claimed, base block', JSON.stringify(claimed.base), 'save bytes', JSON.stringify(claimed).length);
    // The result card is up: close it (its own Done).
    await page.waitForSelector('#dp-jobcard:not([hidden]) button:not(#dp-jobcard-later)', { timeout: 10000 });
    await tap('#dp-jobcard button:not(#dp-jobcard-later)');
    await page.waitForSelector('#dp-jobcard', { state: 'hidden', timeout: 10000 });
    assert.equal(await S(async () => { const { mapDef } = await import('/projects/Space-Shooter/voyage/maps/index.js'); return Boolean(mapDef('starbase-concourse')); }), true, 'the base maps are registered once it is yours');
    await noSideways('after the claim');

    // ---- the hop: Home is one tap from any hop -----------------------------------------------------------------------------------
    await S(() => { window.__flight = window.__stardust.onfoot.flyTo('alpha'); });
    await page.waitForSelector('.of-hop .of-hop-home', { timeout: 10000 });
    assert.equal(await S(() => document.querySelector('.of-hop-home').hidden), false);
    await checkPad('.of-hop-home', 'the Home pad');
    const hudBefore = await S(() => document.querySelector('.of-hop-hud').textContent);
    assert.match(hudBefore, /ALPHA RELAY/);
    // Home sits on the screen, big enough to tap (a phone thumb).
    const box = await S(() => { const r = document.querySelector('.of-hop-home').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    assert.ok(box.l >= 0 && box.r <= VW && box.t >= 0 && box.b <= VH && box.h >= 40 && box.w >= 60, `Home is on screen and tappable ${JSON.stringify(box)}`);
    // Put the ship where the base is on the map (so the proof shows it), then one tap on Home re-lays the course.
    await S(() => { const hop = document.querySelector('.of-hop').__hop; hop.ship.x = 128; hop.ship.y = 26; hop.ship.vx = hop.ship.vy = 0; hop.ship.angle = -0.3; });
    await page.waitForTimeout(400);
    await tap('.of-hop-home');
    await page.waitForFunction(() => /YOUR STAR BASE/.test(document.querySelector('.of-hop-hud')?.textContent || ''), null, { timeout: 5000 });
    assert.equal(await S(() => document.querySelector('.of-hop').__hop.to), 'starbase');
    assert.equal(await S(() => document.querySelector('.of-hop-home').hidden), true, 'Home hides once you are heading home');
    await shot('2-hop-with-home');
    // Dock: the ring around the base starts the stand-in dock.
    await S(() => { const hop = document.querySelector('.of-hop').__hop; hop.ship.x = 140 - 4.2; hop.ship.y = 20; hop.ship.vx = hop.ship.vy = 0; });
    await inMap('starbase-airlock');
    assert.equal(await S(() => window.__stardust.onfoot.docked), 'starbase');
    assert.match(await S(() => document.querySelector('.of-toast').textContent), /Docked clean/);
    await S(() => window.__flight);
    await noSideways('airlock');
    await shot('3-airlock');
    assert.match(await S(() => document.title), /star base/i);

    // ---- the airlock and the concourse ---------------------------------------------------------------------------------------------
    await use('in');
    await inMap('starbase-concourse');
    const layout = await S(() => { const w = window.__stardust.onfoot.world; return w.map.interacts.filter((i) => String(i.id).startsWith('sb-')).map((i) => [i.id, Math.round(i.x), Math.round(i.y)]); });
    assert.deepEqual(layout.map((l) => l[0]).sort(), ['sb-bay', 'sb-board', 'sb-noodles', 'sb-store']);
    for (const [id, x, y] of layout) {
      const [bx, by] = SLOT_POS[claimed.base.slots[id.slice(3)]];
      assert.ok(x / 48 >= bx && x / 48 <= bx + 3 && y / 48 >= by && y / 48 <= by + 2, `${id} stands in the slot the save names (${x / 48}, ${y / 48} vs bay ${bx},${by})`);
    }
    await S(() => window.__stardust.onfoot.world.place(3.5 * 48, 3.5 * 48)); // the aisle, so all four units are in front of the camera
    await noSideways('concourse');
    await shot('4-concourse');

    // ---- the fuel and repair bay -----------------------------------------------------------------------------------------------------
    await use('sb-bay');
    await unit('bay');
    await noSideways('bay panel');
    await checkPad('.sb-panel [data-sb="fuel"]', 'a unit pad');
    await tap('.sb-panel [data-sb="fuel"]');
    await page.waitForSelector('.sb-panel .sh-item[data-item="fuel-cell"]');
    await tap('.sb-panel .sh-item[data-item="fuel-cell"] .sh-buy button');
    await page.waitForFunction(() => window.__stardust.store.get().items['fuel-cell'] === 1);
    assert.equal((await save()).money, 300 - 60, 'the pump charged its own price');
    await tap('.sb-panel [data-sb="back"]');
    await tap('.sb-panel [data-sb="repair"]');
    await checkFull('the repair console');
    await tap('.wb-fleave'); // Leave this game
    await page.waitForSelector('.wb-full', { state: 'detached' });
    await unit('bay'); // leaving the game puts you back at the bay
    await leaveUnit();

    // ---- the noodle stall: a meal, a short buff -----------------------------------------------------------------------------------------
    await use('sb-noodles');
    await unit('noodles');
    await tap('.sb-panel .sh-item[data-item="noodle-bowl"] .sh-buy button');
    await page.waitForFunction(() => window.__stardust.store.get().items['noodle-bowl'] === 1);
    assert.equal((await save()).money, 300 - 60 - 12);
    await page.waitForSelector('.sb-meal[data-bowls="1"]');
    await shot('5-noodle-stall');
    await tap('.sb-panel [data-sb="eat"]');
    await page.waitForFunction(() => Boolean(window.__stardust.store.get().base.buff));
    const fed = await save();
    assert.equal(fed.items['noodle-bowl'], undefined, 'the bowl is eaten');
    assert.equal(fed.base.buff.id, 'fed');
    assert.ok(fed.base.buff.until > Date.now(), 'the buff has time left');
    await page.waitForSelector('.sb-meal[data-fed]:not([data-fed="0"])');
    await leaveUnit();

    // ---- the general store ---------------------------------------------------------------------------------------------------------------
    await use('sb-store');
    await unit('store');
    assert.deepEqual(await S(() => [...document.querySelectorAll('.sb-panel .sh-item')].map((e) => e.dataset.item)), ['medkit', 'scrap', 'circuit', 'shield-cell']);
    await tap('.sb-panel .sh-item[data-item="medkit"] .sh-buy button');
    await page.waitForFunction(() => window.__stardust.store.get().items.medkit >= 1);
    await leaveUnit();

    // ---- the job board -----------------------------------------------------------------------------------------------------------------------
    await use('sb-board');
    await unit('board');
    await page.waitForSelector('.sb-panel .vy-posting');
    const posts = await S(() => [...document.querySelectorAll('.sb-panel .vy-posting')].map((e) => e.dataset.quest));
    assert.ok(posts.length >= 3, `the board has postings: ${posts.join(', ')}`);
    assert.ok(posts.includes('dead-weight'), 'Dead Weight repeats and is on the board');
    await noSideways('job board');
    await leaveUnit();

    // ---- your workshop: the workbench ----------------------------------------------------------------------------------------------------
    await use('workshop');
    await inMap('starbase-workshop');
    await shot('6-workshop');
    await use('sb-workbench');
    await unit('workbench');
    await noSideways('workbench panel');
    assert.deepEqual(await S(() => [...document.querySelectorAll('.sb-panel [data-craft]')].map((b) => b.dataset.craft)), ['cut', 'screw', 'bolt-plate']);
    await tap('.sb-panel [data-craft="cut"]');
    await checkFull('the Cut game');
    await tap('.wb-fleave');
    await page.waitForSelector('.wb-full', { state: 'detached' });
    await unit('workbench');
    await leaveUnit();

    // ---- your galley: a stand-in for cooking -------------------------------------------------------------------------------------------
    await use('out');
    await inMap('starbase-concourse');
    await use('galley');
    await inMap('starbase-galley');
    await S(() => window.__stardust.store.update((s) => ({ ...s, items: { ...s.items, 'noodle-bowl': 1 } })));
    await use('sb-galley');
    await unit('galley');
    await page.waitForSelector('.sb-meal[data-bowls="1"]');
    await tap('.sb-panel [data-sb="eat"]');
    await page.waitForFunction(() => !window.__stardust.store.get().items['noodle-bowl']);
    await leaveUnit();

    // ---- leave: back through the concourse and the airlock to the ship ---------------------------------------------------------------
    await use('out');
    await inMap('starbase-concourse');
    await use('airlock');
    await inMap('starbase-airlock');
    await use('out');
    await inMap('ship');
    // The helm from here: Home (your hangar) and the star base are both one tap.
    await S(() => { window.__stardust.onfoot.helm(); });
    await page.waitForSelector('.of-helm [data-target="home"]');
    assert.equal(await S(() => Boolean(document.querySelector('.of-helm [data-target="starbase"]'))), false, 'docked at the base, the helm does not offer the base');
    await tap('.of-helm button:not(.of-course)');
    // From the hangar the helm offers the base, one tap.
    await S(() => { window.__stardust.onfoot.dockAt('home'); window.__stardust.onfoot.helm(); });
    await page.waitForSelector('.of-helm [data-target="starbase"]');
    await checkPad('.of-helm button:not(.of-course)', 'the helm Stay pad');
    await tap('.of-helm button:not(.of-course)');

    // ---- it is yours: a reload keeps the base, and the layout does not re-roll -----------------------------------------------------------
    const before = await S(() => JSON.parse(JSON.stringify(window.__stardust.store.get().base)));
    await page.reload();
    await page.waitForFunction(() => window.__stardust?.onfoot?.world && window.__stardust.store.get().base);
    const after = await S(() => JSON.parse(JSON.stringify(window.__stardust.store.get().base)));
    assert.deepEqual(after.slots, before.slots);
    assert.equal(after.seed, before.seed);
    const sig = () => S(async () => { const { getMap } = await import('/projects/Space-Shooter/voyage/maps/index.js'); return JSON.stringify(getMap('starbase-concourse').props.map((p) => [p.art, p.x, p.y])); });
    const sigAfter = await sig();
    assert.ok(sigAfter.length > 100);
    await S(() => { window.__stardust.onfoot.dockAt('starbase'); window.__stardust.onfoot.world.go('starbase-airlock', 'from-dock'); });
    await inMap('starbase-airlock');
    await noSideways('after the reload');
    assert.equal(await S(() => [...document.querySelectorAll('h1')].filter((h) => !h.closest('[hidden]')).length), 1, 'still exactly one visible h1 inside the base');
    assert.deepEqual(errors, [], 'no page errors');
    log('save bytes at the end', (await S(() => JSON.stringify(window.__stardust.store.get()).length)));
    await browser.close();
    await server.close();
  });
}
