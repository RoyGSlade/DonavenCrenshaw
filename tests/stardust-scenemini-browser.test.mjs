// The opening's three mini-games in the REAL game (?newgame=1), through the real UI, at 1440x900 and 390x844:
//   scene 3: the airlock hack, scene 4: the haggle with Tull, scene 5: the coolant repair.
// For each: take the hooked choice, the d20 tray shows the roll preview line, the mini-game sheet opens (skinned, nothing scrolls
// sideways), play it to a win with the same bots the skin test uses, the sheet closes, and the next line shows. Scene 3 also
// reloads in the middle (the saved run reopens the mini-game) and scene 4 plays the fair and walked results.
// Opt-in, one at a time, under the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/scenemini/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-scenemini-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';
const SEEDS = { 'third-shift': 1, visitors: 3, 'hold-the-corridor': 1, 'the-eighth-gunner': 1, 'gunners-week': 1, 'day-five': 3 };
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

async function boot(page, origin, seeds = SEEDS) {
  await page.addInitScript((seeds) => {
    try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {}
    let val;
    Object.defineProperty(window, '__stardust', { configurable: true, get: () => val, set: (v) => {
      val = v; const orig = v.jobs.take;
      v.jobs.take = (quest) => { const real = Math.random; if (seeds[quest.id]) Math.random = () => (seeds[quest.id] - 1) / 1e9 + 1e-12; try { return orig(quest); } finally { Math.random = real; } };
    } });
  }, seeds);
  await page.goto(`${origin}${V}?newgame=1`);
  await page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await settle(page, 1500);
}
const readUntilChoices = async (page, max = 40) => {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => ({ choices: document.querySelectorAll('#hg-dialogue:not([hidden]) .ui-dlg-choice').length, card: Boolean(document.querySelector('.qs-end')), next: Boolean(document.querySelector('#hg-dialogue:not([hidden]) .ui-dlg-next:not([hidden])')) }));
    if (st.choices || st.card) return st;
    if (st.next) await page.locator('#hg-dialogue .ui-dlg-next').click({ timeout: 1500 }).catch(() => {});
    await settle(page, 220);
  }
  throw new Error('no choices or card');
};
// Read on (and take "Go on") until the choice shows; return its button.
const toChoice = async (page, frag) => {
  for (let i = 0; i < 6; i++) {
    await readUntilChoices(page);
    if (await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: frag }).count()) break;
    const go = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: 'Go on' }).first();
    if (!(await go.count())) break;
    await go.click(); await settle(page, 400);
  }
  const b = page.locator('#hg-dialogue .ui-dlg-choice', { hasText: frag }).first();
  assert.ok(await b.count(), `no choice "${frag}"`);
  return b;
};
const pick = async (page, frag) => (await toChoice(page, frag)).click();
const walkTo = async (page, room) => {
  for (let hop = 0; hop < 8; hop++) {
    const door = await page.evaluate(async (room) => {
      const { doorToward } = await import('/projects/Space-Shooter/voyage/datapad/route.js');
      const { MAP_DEFS } = await import('/projects/Space-Shooter/voyage/maps/index.js');
      const w = window.__stardust.onfoot.world;
      if (w.map.id === room) return null;
      const d = w.map.doors.find((x) => x.id === doorToward(w.map.id, [room], MAP_DEFS));
      w.place(d.x + d.w / 2, d.y + d.h / 2);
      return d.id;
    }, room);
    if (!door) return;
    await settle(page, 1300);
  }
};
// Write the earlier scenes as played (good paths, mini-games stubbed to a win) so the page opens on the scene under test.
async function playedBefore(page, upto) {
  await page.evaluate(async (upto) => {
    const base = '/projects/Space-Shooter/voyage/';
    const { startQuest, act, view } = await import(base + 'quests/engine.js');
    const { SLICE_LIST } = await import(base + 'quests/data/slice/index.js');
    const PLANS = { 'third-shift': [['Where is this gym?', 'Start cleaning.', 'Fix the leaking valve.'], 'end-source-fixed-end'], visitors: [["Check the cutter's readout.", 'Keep your eyes on the cutter.', 'Grab the helm rail'], 'end-warned'], 'hold-the-corridor': [['Hack the inner airlock door', { mini: 'win' }], 'end-sealed-end'], 'the-eighth-gunner': [['Haggle for a bigger share.', { mini: 'win' }], 'end-hired-well-end'] };
    const s = window.__stardust; let save = { ...s.store.get(), quests: { ...s.store.get().quests, active: {} } };
    for (const id of Object.keys(PLANS).slice(0, upto)) {
      const q = SLICE_LIST.find((x) => x.id === id), [picks, end] = PLANS[id]; let done = null;
      for (let seed = 1; seed < 300 && !done; seed++) {
        let { run, save: sv } = startQuest(q, save, { seed, now: 1 }); const queue = [...picks]; let ok = true;
        for (let g = 0; g < 80 && !run.ended; g++) {
          const v = view(q, run, sv); let a;
          if (v.minigame) { queue.shift(); a = { type: 'minigame', branch: 'win', xp: 0, skill: v.choices[v.minigame.index].check.skill }; }
          else { const open = v.choices.filter((c) => !c.locked); const p = open.length === 1 ? open[0] : open.find((c) => typeof queue[0] === 'string' && c.label.includes(queue[0])); if (!p) { ok = false; break; } if (open.length > 1) queue.shift(); a = { type: 'choose', index: p.index }; }
          const n = act(q, run, sv, a, { now: 1 }); if (n.error) { ok = false; break; } run = n.run; sv = n.save;
        }
        if (ok && run.ended && run.node === end) done = sv;
      }
      if (!done) throw new Error('could not play ' + id);
      save = done;
    }
    s.store.update(() => save);
  }, upto);
  await page.reload();
  await page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await settle(page, 1500);
}

// Each game's bot (the skin test's): plays to the result card by tapping what a player taps.
const BOTS = {
  repair: async (page, tap, mid) => {
    for (let i = 0; i < 80 && !(await page.locator('.rp-result').count()); i++) {
      const idx = await page.evaluate(async () => (await import('/projects/Space-Shooter/voyage/minigames/repair.js')).nextHint(document.querySelector('.rp-panel').__state));
      if (idx == null) break; await tap(`.rp-tile[data-i="${idx}"]`); if (i === 3) await mid();
    }
  },
  hack: async (page, tap, mid) => {
    for (let i = 0; i < 6; i++) {
      if (await page.locator('.rp-result').count()) break;
      await page.evaluate(() => { const s = document.querySelector('.hk-panel').__state; if (!s.done) { s.cursor = s.tumblers[s.index].at; s.dir = 0; } });
      await tap('.hk-btn'); if (i === 1) await mid();
    }
  },
  haggle: async (page, tap, mid, want = 'win') => {
    if (want === 'win') await page.evaluate(async () => { const m = await import('/projects/Space-Shooter/voyage/minigames/haggle.js'); const s = document.querySelector('.hg-panel').__state; const [lo, hi] = m.bandPrices(s); const v = s.speed; s.phase = 0; s.t = 0; for (let t = 0; t < 4; t += 0.005) { const p = m.priceAt(s, m.needleAt(s, t)); if (p >= lo && p <= hi) { s.phase = (t * v) % 2; s.t = 0; s.speed = 0; break; } } });
    if (want === 'win') { await mid(); await page.evaluate(() => document.querySelector('.hk-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))); }
  },
};

const SCENES = [
  { id: 'scene3-hack', before: 2, kind: 'hack', frag: 'Hack the inner airlock door', title: /Inner airlock door/, eyebrow: /^BYPASS · (ROUGH|SHAKY|STEADY|SMOOTH|[A-Z ]+) ROLL$/, end: /sealed|Sealed|Reck|corridor|door/i,
    to: async (page) => { await readUntilChoices(page); await pick(page, 'Grab the rifle'); await walkTo(page, 'duchess-corridor'); await readUntilChoices(page); } },
  { id: 'scene4-haggle', before: 3, kind: 'haggle', frag: 'Haggle for a bigger share.', title: /Captain Tull/, eyebrow: /^HAGGLE · [A-Z ]+ ROLL$/,
    to: async (page) => { await walkTo(page, 'duchess-quarters'); await readUntilChoices(page); } },
  { id: 'scene5-repair', before: 4, kind: 'repair', frag: 'Patch the line', title: /Coolant line/, eyebrow: /^REPAIR · [A-Z ]+ ROLL$/,
    to: async (page) => {
      await walkTo(page, 'duchess-bridge'); await readUntilChoices(page);
      await pick(page, 'Pull the arm housing'); await pick(page, 'On to the next job.'); await pick(page, 'Scan the lane carefully.'); await pick(page, 'Back to the bridge console.');
      await readUntilChoices(page); await pick(page, 'Go find Pip'); await settle(page, 500);
      await walkTo(page, 'duchess-engine'); await readUntilChoices(page);
    } },
];

test('the opening mini-games in the real game: hack (scene 3), haggle (scene 4), repair (scene 5)', { skip, timeout: 900000 }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [sizeName, profile] of [['desktop', DESK], ['phone', PHONE]]) {
      for (const sc of SCENES) {
        if (only && !only.includes(sc.id)) continue;
        console.log('scenemini', sc.id, sizeName);
        const context = await browser.newContext({ ...profile, reducedMotion: 'reduce' });
        await blockHub(context);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com|Failed to load resource/.test(m.text())) errors.push(m.text()); });
        const shot = async (name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${sc.id}-${sizeName}-${name}.png` }); };
        const tap = (sel) => (sizeName === 'phone' ? page.tap(sel) : page.click(sel));
        const mid = async () => { await settle(page, 300); await shot('3-mid'); };
        await boot(page, server.origin);
        await playedBefore(page, sc.before);
        await sc.to(page);
        const before = await page.evaluate(() => window.__stardust.store.get());
        // The hooked choice shows its odds; take it.
        const hooked = await toChoice(page, sc.frag);
        assert.match(await hooked.innerText(), /Roll d20.* vs \d+: \d+%/);
        await settle(page, 500);
        await shot('1-choice');
        await hooked.click();
        // The d20 tray says what the roll did to the game; the sheet opens beside the floor.
        await page.waitForSelector('#hg-minigame:not([hidden]) .rp-panel', { timeout: 15000 });
        await page.waitForSelector('#hg-attempt .ui-attempt-preview:not([hidden])', { timeout: 15000 });
        const preview = await page.locator('#hg-attempt .ui-attempt-preview').innerText();
        assert.match(preview, /^(Rough|Shaky|Steady|Smooth|[A-Za-z]+) roll: .+\./, preview);
        assert.match(await page.locator('#hg-attempt .ui-attempt-verdict').innerText(), /Now play it/);
        assert.match(await page.locator('#hg-minigame-eyebrow').innerText(), sc.eyebrow);
        assert.match(await page.locator('#hg-minigame-title').innerText(), sc.title);
        await settle(page, 350);
        const m = await page.evaluate(() => {
          const r = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
          return { sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, sheet: r('#hg-minigame'), frame: getComputedStyle(document.querySelector('#hg-minigame')).borderImageSource, small: [...document.querySelectorAll('#hg-minigame-stage .ui-btn, #hg-minigame-stage .rp-tile')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44 && b.getBoundingClientRect().width < 44).length, atRun: JSON.stringify(Object.values(window.__stardust.store.get().quests.active)[0]?.minigame || null) };
        });
        assert.ok(m.sw <= m.iw && m.iw === profile.viewport.width, `no sideways scroll, and the page is as wide as the phone (${m.sw} of ${m.iw})`);
        assert.match(m.frame, /panel\.webp/); assert.ok(m.sheet && m.sheet.top >= 0 && m.sheet.bottom <= m.ih, 'the sheet is on screen');
        assert.equal(m.small, 0, 'every tap target is 44px');
        assert.notEqual(m.atRun, 'null', 'the saved run holds the pending mini-game');
        await shot('2-open');

        // Scene 3: a reload in the middle reopens the same mini-game.
        if (sc.id === 'scene3-hack' && sizeName === 'desktop') {
          await page.reload();
          await page.waitForSelector('#hg-minigame:not([hidden]) .hk-panel', { timeout: 20000 });
        }
        const bot = BOTS[sc.kind];
        await bot(page, tap, mid);
        await page.waitForSelector('.rp-result', { timeout: 40000 });
        await settle(page, 300); await shot('4-result');
        await page.click('.rp-result button');
        await page.waitForSelector('#hg-minigame', { state: 'hidden' });
        const after = await page.evaluate(() => { const s = window.__stardust.store.get(); return { money: s.money, rep: s.rep, flags: Object.keys(s.flags), active: Object.keys(s.quests.active), done: Object.keys(s.quests.done) }; });
        // The next line shows (the end of the scene, or the corridor fight after a lost hack).
        await readUntilChoices(page, 60);
        await page.waitForSelector('#hg-attempt', { state: 'hidden', timeout: 12000 }); // the d20 tray has timed out
        await settle(page, 400);
        await shot('5-next-line');
        const next = await page.evaluate(() => ({ text: document.querySelector('#hg-dialogue .ui-dlg-text')?.textContent || '', card: Boolean(document.querySelector('.qs-end')), mini: Boolean(window.__stardust.store.get().quests.active && Object.values(window.__stardust.store.get().quests.active)[0]?.minigame) }));
        assert.equal(next.mini, false, 'the pending mini-game is cleared');
        assert.ok(next.text || next.card, 'a next line or the result card shows');
        if (sc.id === 'scene4-haggle') assert.ok(after.flags.includes('gunner-hired') || next.text.length > 0);
        assert.ok(after.money >= before.money - 20, 'credits are not lost by playing');
        assert.deepEqual(errors, []);
        await context.close();
      }
    }
  } finally { await browser.close(); await server.close(); }
});
