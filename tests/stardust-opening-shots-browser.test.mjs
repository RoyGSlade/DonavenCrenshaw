// Proof shots of the opening slice: the first beat of scene 1 and the first and last beats of scene 6, at 1440x900 and 390x844.
// (The slice browser test is the older Cold Run job loop; the opening is the six scenes. Same helpers as the scenemini test.)
// PROOF_DIR=<dir> STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-opening-shots-browser.test.mjs
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
      const id = doorToward(w.map.id, [room], MAP_DEFS);
      const e = w.doors.entries.find((x) => x.room === id); // launch doors: a link door is a two-door entry; step into its vestibule
      const d = w.map.doors.find((x) => x.id === id);
      if (e) w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2); else w.place(d.x + d.w / 2, d.y + d.h / 2);
      return id;
    }, room);
    if (!door) return;
    await settle(page, 3200);
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

for (const [sizeName, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  test(`opening proof shots, ${sizeName}`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    try {
      const shotOf = (page) => async (name) => { await settle(page, 500); if (PROOF) await page.screenshot({ path: `${PROOF}/opening-${name}-${sizeName}.png` }); };
      // The room the scene's current node happens in (the quest data's steps name it), so the run can walk there when it is stuck.
      const roomOfNode = (page, id) => page.evaluate(async (id) => {
        const { SLICE_LIST } = await import('/projects/Space-Shooter/voyage/quests/data/slice/index.js');
        const q = SLICE_LIST.find((x) => x.id === id), run = window.__stardust.store.get().quests.active?.[id];
        return run ? (q.steps.find((st) => st.nodes.includes(run.node)) || {}).where || null : null;
      }, id);
      for (const [name, id, before] of [['scene1', 'third-shift', 0], ['scene6', 'day-five', 0]]) {
        const context = await browser.newContext({ ...profile, reducedMotion: 'reduce' });
        await blockHub(context);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (/^interacts/.test(m.text())) console.log(m.text()); });
        const shot = shotOf(page);
        await boot(page, server.origin);
        if (name === 'scene6') {
          // Scene 6 on its own: start Day Five straight from the engine (scenes 1 to 5 are covered by their own tests), then stand at the pad.
          await page.evaluate(async () => {
            const base = '/projects/Space-Shooter/voyage/';
            const { startQuest } = await import(base + 'quests/engine.js');
            const { SLICE_LIST } = await import(base + 'quests/data/slice/index.js');
            const s = window.__stardust, q = SLICE_LIST.find((x) => x.id === 'day-five');
            const { save } = startQuest(q, { ...s.store.get(), quests: { ...s.store.get().quests, active: {} } }, { seed: 1, now: 1 });
            s.store.update(() => save);
          });
          await page.reload();
          await page.waitForFunction(() => window.__stardust?.onfoot?.world);
          await settle(page, 1500);
          await walkTo(page, 'duchess-pad');
        }
        let first = true;
        for (let i = 0; i < 20 && first; i++) {
          try { await readUntilChoices(page, 12); } catch { await walkTo(page, name === 'scene6' ? 'duchess-pad' : 'duchess-mess'); continue; }
          await shot(`${name}-first-beat`); first = false;
        }
        if (name === 'scene6') {
          // The end of the scene: jump the saved run to the hull job (the mini-games and fights in between are covered by their own tests),
          // reload, take the weld, and read on to the result card (a fix or the bill: either is the scene's last beat).
          await page.evaluate(() => { const s = window.__stardust, save = JSON.parse(JSON.stringify(s.store.get())); const run = Object.values(save.quests.active)[0]; run.node = 'hull-job'; run.minigame = null; run.part = null; s.store.update(() => save); });
          await page.reload();
          await page.waitForFunction(() => window.__stardust?.onfoot?.world);
          await settle(page, 1500);
          await walkTo(page, 'duchess-engine');
          for (let i = 0; i < 30 && !(await page.locator('.qs-end').count()); i++) {
            try { await readUntilChoices(page, 12); } catch { await settle(page, 400); continue; }
            if (await page.locator('.qs-end').count()) break;
            await page.locator('#hg-dialogue .ui-dlg-choice:not([disabled])').first().click().catch(() => {});
            await settle(page, 500);
          }
        }
        if (name === 'scene6') { if (!(await page.locator('.qs-end').count())) await shot(`${name}-stuck`); assert.ok(await page.locator('.qs-end').count(), 'scene 6 reached its end card'); await shot(`${name}-last-beat`); }
        assert.equal(first, false, `${name}: a first beat showed`);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally { await browser.close(); await server.close(); }
  });
}
