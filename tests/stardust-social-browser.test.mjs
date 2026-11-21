// The good cutter in the REAL workbench page (?newgame=1&start=workbench) at 1440x900 and 390x844: the Cut station pins the want,
// Pip's lit words, a topic that teaches a fact, the push list with its DCs, a push inside its mini-game (persuade, intimidate and
// the bribe needle), a won reply, a lost reply, and his changed greeting after. Opt-in, one at a time, under the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/social/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-social-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
const DAY = 30 * 60 * 1000, NOW = 10 * DAY + 5 * 60 * 1000;

async function bootRoom(page, origin) {
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${origin}${V}?newgame=1&start=workbench&seed=7`);
  await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
  await page.waitForTimeout(1200);
  await page.evaluate((now) => { const w = window.__stardust.workbench; w.rng = () => 0.65; w.clock = () => now; }, NOW); // the d20 lands on 14; the clock stands still
}
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
  assert.equal(got, id, `the thing in reach is ${id}`);
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__stardust.workbench.state)));
/** The plan's example player (Social 3, points 2 / 0 / 1) on a fresh state. */
async function setPlayer(page, { level = 3, points = { persuade: 2, intimidate: 0, haggle: 1 }, credits = 100 } = {}) {
  await page.evaluate(async ({ level, points, credits }) => {
    const S = await import('/projects/Space-Shooter/voyage/workbench/state.js');
    let st = S.freshState();
    st = { ...st, credits, progress: { ...st.progress, levels: { ...st.progress.levels, social: level } } };
    window.__stardust.workbench.state = S.setPoints(st, 'social', points);
  }, { level, points, credits });
}
// A push's game owns the whole screen (workbench/fullScreen.js); panels (the Cut station) still use the side sheet.
const sheetOpen = (page) => page.waitForSelector('.wb-full .wb-fstage .rp-panel', { timeout: 15000 });
const gameShut = (page) => page.waitForSelector('.wb-full', { state: 'detached', timeout: 15000 });
const sheetShut = (page) => page.waitForSelector('#hg-minigame', { state: 'hidden', timeout: 15000 });

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  const phone = name === 'phone';
  test(`the good cutter, ${name}`, { skip, timeout: 560000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (n) => { await page.waitForTimeout(400); if (PROOF) await page.screenshot({ path: `${PROOF}/${n}-${name}.png` }); };
    const tap = (sel) => (phone ? page.locator(sel).first().tap() : page.locator(sel).first().click());
    const cleanup = async () => {
      if (await page.locator('#wb-talk').count()) { await page.locator('#wb-talk .tk-leave').click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(300); }
      if (await page.locator('#hg-minigame:not([hidden])').count()) { await page.evaluate(() => window.__stardust.workbench.closePanel()); await page.waitForTimeout(300); }
      await page.waitForTimeout(450);
    };
    const sub = (title, fn) => (!only || only.includes(title) ? t.test(title, async (...a) => { await cleanup(); return fn(...a); }) : null);
    const talkText = () => page.locator('#wb-talk').innerText();
    const openPip = async () => { await use(page, 'pip'); await page.waitForSelector('#wb-talk .tk-text'); };
    const leaveTalk = async () => { await tap('#wb-talk .tk-leave'); await page.waitForSelector('#wb-talk', { state: 'detached' }); await page.waitForTimeout(450); };
    const closePanel = async () => { await tap('.wb-pane .primary'); await sheetShut(page); await page.waitForTimeout(450); };
    const pushVia = async (id) => { await tap(`[data-push="${id}"]`); await page.waitForSelector('.tk-preview'); };
    const sayIt = async () => { await tap('.tk-say-it'); await page.waitForSelector('#hg-attempt:not([hidden])'); await sheetOpen(page); };
    const closeCard = async () => { await tap('.rp-result button'); await gameShut(page); await page.waitForSelector('#wb-talk:not([hidden]) .tk-line'); };
    const noScroll = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll');
    try {
      await bootRoom(page, server.origin);

      await sub('the Cut station says the worn cutter is 9 wide, "Pip has a good one", and pins the want', async () => {
        await setPlayer(page);
        await use(page, 'wb-cut');
        await page.waitForSelector('#hg-minigame:not([hidden]) .wb-cutbar');
        const text = await page.locator('.wb-pane').innerText();
        assert.match(text, /Worn cutter: 9 wide/); assert.match(text, /Pip has a good one\./); assert.match(text, /You want: the good cutter/);
        assert.equal(await page.locator('.wb-cutbar').getAttribute('data-width'), '9');
        assert.deepEqual((await state(page)).wants, ['good-cutter']);
        await shot('social-1-want-pinned');
        await closePanel();
      });

      await sub('route A: lit words, a topic teaches a fact, the push list with DCs, Persuade with Empathy wins in its mini-game', async () => {
        await setPlayer(page);
        await use(page, 'wb-cut'); await page.waitForSelector('.wb-cutbar'); await closePanel();
        await openPip();
        assert.match(await talkText(), /Pip/);
        assert.match(await page.locator('#wb-talk .tk-text').first().innerText(), /I have the good cutter, and I am not giving it to you/);
        assert.equal(await page.locator('.tk-lit[data-lit="want"]').innerText(), 'good cutter');
        assert.match(await page.locator('.tk-want').innerText(), /you want[\s\S]*the good cutter/i);
        assert.equal(await page.locator('[data-topic="nan"]').isDisabled(), true, 'locked topics show what opens them');
        assert.match(await page.locator('[data-topic="nan"]').innerText(), /^Get to know Pip better…/);
        assert.equal(await page.locator('.tk-voice').count(), 0, 'no debug voice ids');
        assert.equal(await page.locator('#wb-talk.ui-dialogue .ui-dlg-portrait').count(), 1, 'the game\'s dialogue kit');
        assert.equal(await page.locator('.tk-pips i.on').count(), 2, 'the bond as lit pips');
        assert.ok((await page.evaluate(() => __stardust.workbench.voiced)).some((v) => v.id === 'pip.wb.hello'), 'the line is sent to the voice');
        await noScroll();
        await shot('social-2-greeting-lit-words');
        await tap('[data-topic="projector"]');
        assert.match(await talkText(), /You learned: The projector needs one clean circuit board/);
        assert.equal(await page.locator('.tk-pips').getAttribute('aria-label'), 'Bond 3 of 5, Friendly');
        await shot('social-3-topic-teaches-a-fact');
        await tap('[data-topic="safety"]');
        assert.match(await talkText(), /You learned: He has kept the ship flying two years on tape/); assert.equal(await page.locator('.tk-pips').getAttribute('data-bond'), '3');
        assert.equal(await page.locator('[data-kind="push"]').count(), 0, 'no pushes before the no');
        await tap('[data-kind="ask"]');
        await page.waitForSelector('[data-kind="push"]');
        assert.match(await talkText(), /No\. Gunner four borrowed my last good cutter/);
        assert.match(await talkText(), /You learned: Gunner four lost his last good cutter/);
        assert.deepEqual(await page.locator('[data-push]').evaluateAll((els) => els.map((e) => e.dataset.push)), ['p-emp', 'p-ang', 'i-ang', 'b-mon', 'b-emp'], 'the pushes you can make, as lines you would say');
        assert.match(await page.locator('[data-push="p-emp"]').innerText(), /I am not gunner four[\s\S]*Persuade · Empathy · 75%/);
        assert.deepEqual(await page.locator('[data-push-locked]').evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0])), ['Know what he is hiding…'], 'locked pushes are hints');
        assert.ok((await page.evaluate(() => __stardust.workbench.voiced)).some((v) => v.id === 'pip.cutter.no'));
        await pushVia('p-emp');
        const card = await page.locator('.tk-preview').innerText();
        assert.match(card, /Roll d20 \+ Social 3 vs 9: 75%/);
        assert.match(card, /DC: Their no 12, Empathy fits them -2, Bond Friendly -1 = 9/); assert.match(card, /You know what he guards: the ship/);
        await noScroll();
        await page.locator('.tk-say-it').scrollIntoViewIfNeeded();
        await shot('social-4-push-list-with-dcs');
        await sayIt();
        await page.waitForFunction(() => /Made it|Not this time|Natural/.test(document.getElementById('hg-attempt').innerText));
        assert.match(await page.locator('#hg-attempt').innerText(), /14 \+ .* = 17[\s\S]*needs 9/);
        const g = await page.evaluate(() => { const s = document.querySelector('.pc-panel').__state; return { goal: s.goal, trust: s.trust, patience: s.patience, named: s.hand.filter((c) => c.named).map((c) => `${c.value}:${c.worth}`), cares: s.cares }; });
        assert.deepEqual([g.goal, g.trust, g.patience], [19, 4, 4]); assert.deepEqual(g.named, ['safety:5']); assert.deepEqual(g.cares, ['safety', 'honor', 'family']);
        await shot('social-5-push-in-its-minigame');
        const cards = await page.evaluate(() => { const s = document.querySelector('.pc-panel').__state; return s.hand.filter((c) => s.cares.includes(c.value)).sort((a, b) => (b.named ? 1 : 0) - (a.named ? 1 : 0) || b.worth - a.worth).map((c) => c.id); });
        for (const id of cards) { if (await page.locator('.rp-result').count()) break; await tap(`.pc-card[data-id="${id}"]`); }
        await page.waitForSelector('.rp-result');
        await closeCard();
        const text = await talkText();
        assert.match(text, /I am not gunner four/); assert.match(text, /Cut once/);
        assert.match(text, /\+4 Social XP|\+3 Social XP/); assert.match(text, /You have the good cutter|You borrowed the good cutter/);
        const s = await state(page);
        assert.equal(s.items['good-cutter'], 1); assert.equal(s.people.pip.bond, 4);
        assert.match(await page.evaluate(() => document.getElementById('wb-hud').textContent), /good cutter: 15 wide/);
        await shot('social-6-won-reply');
        await leaveTalk();
        // the greeting has changed
        await openPip();
        const owed = Boolean((await state(page)).people.pip.marks.owed);
        assert.match(await page.locator('#wb-talk .tk-text').first().innerText(), owed ? /You have my cutter/ : /Oh good, it is you\. Come in, mind the tape/);
        assert.equal(await page.locator('.tk-pips').getAttribute('aria-label'), 'Bond 4 of 5, Trusted'); assert.equal(await page.locator('.tk-pips i.on').count(), 4);
        await shot('social-7-changed-greeting');
        await leaveTalk();
        // the Cut station now says 15 wide
        await use(page, 'wb-cut'); await page.waitForSelector('.wb-cutbar');
        assert.equal(await page.locator('.wb-cutbar').getAttribute('data-width'), '15');
        await closePanel();
      });

      await sub('route B: Intimidate with Anger fails; the lost reply, bond 0, Tull rep -1, the want closed', async () => {
        await setPlayer(page);
        await openPip();
        await tap('.tk-lit[data-lit="want"]'); await tap('[data-kind="ask"]');
        await page.waitForSelector('[data-kind="push"]');
        await pushVia('i-ang');
        assert.match(await page.locator('.tk-preview').innerText(), /Roll d20 \+ Social 3 vs 14: 50%/);
        await sayIt();
        const g = await page.evaluate(() => { const s = document.querySelector('.it-panel').__state; s.rolls = Array(12).fill(0); return { chances: s.chances, reads: s.readsOdds }; });
        assert.deepEqual(g.chances.slice(0, 3), [12, 18, 26], 'a Steady roll with the Anger misfit: 8, 14, 22 plus 4');
        await tap('.it-push');
        await page.waitForSelector('.rp-result');
        await closeCard();
        const text = await talkText();
        assert.match(text, /No\. I have been shouted at by a reactor/);
        assert.match(text, /bond down 2/); assert.match(text, /Tull: rep with Tull -1/); assert.match(text, /closed until tomorrow/);
        const s = await state(page);
        assert.equal(s.people.pip.bond, 0); assert.equal(s.rep.tull, -1); assert.equal(s.items['good-cutter'], undefined);
        await shot('social-8-lost-reply');
        await leaveTalk();
        await openPip();
        assert.match(await page.locator('#wb-talk .tk-text').first().innerText(), /I am busy\. I am always busy/);
        assert.equal(await page.locator('[data-kind="ask"]').isDisabled(), true, 'the want is closed until tomorrow');
        await leaveTalk();
      });

      await sub('route C: look at the hook, learn he bought it himself, lean on his wallet: the safe first push, scared, the cutter', async () => {
        await setPlayer(page);
        await use(page, 'wb-hook'); await page.waitForSelector('.wb-hook-note');
        assert.match(await page.locator('.wb-pane').innerText(), /Pip's\. Not on the ship's list\./);
        await closePanel();
        await openPip();
        await tap('[data-topic="projector"]');
        assert.equal(await page.locator('[data-topic="tag"]').isDisabled(), false);
        await tap('[data-topic="tag"]');
        assert.match(await talkText(), /You learned: The cutter is not on Tull's list; he bought it himself/);
        await tap('.tk-lit[data-lit="want"]');
        await tap('[data-kind="ask"]'); await page.waitForSelector('[data-kind="push"]');
        await pushVia('i-mon');
        const card = await page.locator('.tk-preview').innerText();
        assert.match(card, /Roll d20 \+ Social 3 vs 11: 65%/); assert.match(card, /You know what he is hiding: the first push cannot snap/);
        await sayIt();
        const g = await page.evaluate(() => { const s = document.querySelector('.it-panel').__state; return { chances: s.chances.slice(0, 3), reads: s.readsOdds }; });
        assert.equal(g.chances[0], 0); assert.equal(g.reads, true);
        await page.evaluate(() => { document.querySelector('.it-panel').__state.rolls = Array(12).fill(0.99); });
        for (let i = 0; i < 6 && !(await page.locator('.rp-result').count()); i++) { const w = await page.evaluate(() => { const s = document.querySelector('.it-panel').__state; return s.won >= s.goal; }); await tap(w ? '.it-stand' : '.it-push'); }
        await page.waitForSelector('.rp-result');
        const outcome = await page.locator('.rp-result').getAttribute('data-outcome');
        await closeCard();
        if (outcome === 'won') {
          assert.match(await talkText(), /Take it\. And do not sit with me at lunch/);
          const s = await state(page); assert.equal(s.items['good-cutter'], 1); assert.ok(s.people.pip.marks.scared); assert.equal(s.people.pip.bond, 3);
          assert.equal(await page.locator('.tk-choice.is-locked[data-kind="topic"]').count(), 4, 'topics closed while scared');
        }
        await leaveTalk();
      });

      await sub('money: Bribe with Money: the needle, a deal inside the band pays and leaves Pip paid', async () => {
        await setPlayer(page);
        await openPip();
        await tap('.tk-lit[data-lit="want"]'); await tap('[data-kind="ask"]'); await page.waitForSelector('[data-kind="push"]');
        await pushVia('b-mon');
        assert.match(await page.locator('.tk-preview').innerText(), /vs 12: 60%/); assert.match(await page.locator('.tk-preview').innerText(), /It costs: 10 to 40 credits at the needle/);
        await sayIt();
        await page.waitForSelector('.bb-panel');
        const f = await page.evaluate(async () => {
          const m = await import('/projects/Space-Shooter/voyage/talk/bribe.js');
          const s = document.querySelector('.bb-panel').__state;
          const [lo, hi] = m.bandPrices(s);
          const target = Math.round((lo + hi) / 2);
          s.speed = 0; s.t = 0; s.phase = (target - s.min) / (s.max - s.min);
          return { lo, hi, target, price: m.priceAt(s), band: s.band };
        });
        assert.equal(f.price, Math.round((f.lo + f.hi) / 2));
        await shot('social-9-bribe-needle');
        await page.evaluate(() => document.querySelector('.bb-panel .hk-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
        await page.waitForSelector('.rp-result');
        assert.equal(await page.locator('.rp-result').getAttribute('data-outcome'), 'great');
        await closeCard();
        const s = await state(page);
        assert.equal(s.items['good-cutter'], 1); assert.ok(s.credits < 100 - 20 && s.credits > 100 - 36, `paid ${100 - s.credits}`);
        assert.ok(s.people.pip.marks.paid); assert.match(await talkText(), /You paid \d+ credits/); assert.match(await talkText(), /Do not tell me what you do with it/);
        await leaveTalk();
      });
      assert.deepEqual(errors.filter((e) => !/favicon|ERR_FAILED|net::/.test(e)), []);
    } finally { await context.close(); await browser.close(); await server.close(); }
  });
}
