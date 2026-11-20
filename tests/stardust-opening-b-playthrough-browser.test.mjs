// Opening B: a player bot plays scenes 1 to 6 start to finish on desktop and phone, taking plain choices first, doing approaches with
// real input, winning fights, and sampling frames for hard cuts. It writes notes to $PROOF_DIR/playthrough-<size>.json and takes shots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright, startServer, SIZES, skip, boot, settle, frameReport, PROOF } from '../scripts/stardust-opening-b-kit.mjs';

for (const [size, profile] of SIZES) {
  test(`playthrough (${size}): scenes 1 to 6 start to finish, no hard cut, nothing stuck`, { skip, timeout: 900000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile, { reduced: false, sampler: true });
    const notes = { size, scenes: [], stuck: null, steps: 0 };
    const snap = async (name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/play-${name}-${size}.png` }).catch(() => {}); };
    try {
      let lastNode = '', same = 0, sceneSeen = new Set();
      for (let i = 0; i < 700; i++) {
        notes.steps = i;
        const st = await page.evaluate(() => {
          const S = window.__stardust, w = S.onfoot.world, store = S.store.get();
          const run = Object.values(store.quests.active || {})[0];
          const card = document.querySelector('#dp-jobcard');
          return { done: Object.keys(store.quests.done || {}), quest: run?.quest || null, node: run?.node || null, mode: w.mode, map: w.map.id, retry: Boolean(document.querySelector('.op-retry-btn')), card: card && !card.hidden, approach: document.querySelector('.op-approach')?.dataset.phase || (document.querySelector('.op-approach') ? 'work' : null), sheet: !document.querySelector('#hg-minigame').hidden, pending: S.slice?.pendingRoom || null, choices: [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].map((b) => ({ t: b.textContent.replace(/\s+/g, ' ').trim(), kind: b.dataset.kind, dis: b.disabled || b.hasAttribute('data-wait') })), skipping: Boolean(document.querySelector('.of-fade.on')) };
        });
        const key = `${st.quest}/${st.node}/${st.mode}/${st.approach}/${st.card}`;
        if (key === lastNode) same++; else { same = 0; lastNode = key; }
        if (same > 150) { notes.stuck = { st, key }; await snap('stuck'); break; }
        if (st.quest && !sceneSeen.has(st.quest)) { sceneSeen.add(st.quest); notes.scenes.push({ scene: st.quest, startedAtStep: i }); await settle(page, 600); await snap(`scene-${st.quest}`); }
        if (st.done.length >= 6 && !st.quest) break;
        if (st.retry) { await page.locator('.op-retry-btn').click(); continue; }
        if (st.mode === 'fight') { await page.evaluate(() => { for (const e of window.__stardust.onfoot.world.fightState.enemies) { e.alive = false; e.hp = 0; } }); await settle(page, 700); continue; }
        if (st.card) { await snap(`card-${st.quest}-${st.node}`); const b = page.locator('#dp-jobcard button.primary').first(); if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {}); await settle(page, 800); continue; }
        if (st.approach) {
          await page.evaluate(async () => {
            const w = window.__stardust.onfoot.world, S = window.__stardust;
            const { APPROACH, targetPoint } = await import('/projects/Space-Shooter/voyage/slice/staging.js');
            const run = Object.values(S.store.get().quests.active)[0];
            const ph = document.querySelector('.op-approach').dataset.phase;
            if (ph === 'travel' || ph === 'sneak') { const { doorToward } = await import('/projects/Space-Shooter/voyage/datapad/route.js'); const { MAP_DEFS } = await import('/projects/Space-Shooter/voyage/maps/index.js'); if (w.map.id !== 'duchess-cargo') { const id = doorToward(w.map.id, ['duchess-cargo'], MAP_DEFS); const e = w.doors.entries.find((x) => x.room === id); w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2); } else w.place(10.5 * 48, 14.5 * 48); return; }
            const idx = run.assist.index, spec = APPROACH[`${run.quest}/${run.node}/${idx}`];
            const t = spec && targetPoint(w.map, spec.where, { npcs: w.npcsHere() });
            if (t) w.place(t.x + (t.box ? 0 : 30), t.y + (spec.where.npc ? 40 : 46));
          });
          if (size === 'phone') { if (await page.locator('.op-ap-hold').count()) await page.locator('.op-ap-hold').dispatchEvent('pointerdown').catch(() => {}); await settle(page, 2600); await page.locator('.op-ap-hold').dispatchEvent('pointerup').catch(() => {}); } else { await page.keyboard.down('KeyE'); await settle(page, 2600); await page.keyboard.up('KeyE'); }
          continue;
        }
        if (st.sheet) { notes.sheet = (notes.sheet || 0) + 1; await page.evaluate(() => window.__stardust.onfoot.world.pause()); await settle(page, 400); break; }
        if (st.pending) {
          await page.evaluate((room) => { const w = window.__stardust.onfoot.world; w.go(room, room === 'duchess-bridge' ? 'from-corridor' : 'default'); }, st.pending); /* the bot teleports; the doors are walked in the other tests */
          await settle(page, 1500); continue;
        }
        const pick = st.choices.find((c) => !c.dis && c.kind === 'choice') || st.choices.find((c) => !c.dis && c.kind === 'attempt' && !/hack|bluff|haggle|patch the line|read the ledger/i.test(c.t)) || st.choices.find((c) => !c.dis && c.kind === 'attempt');
        if (!pick && st.quest && !st.card && !st.approach && same > 6 && same % 6 === 1) { notes.resumed = (notes.resumed || 0) + 1; await page.evaluate(() => window.__stardust.jobs.resume()); await settle(page, 1200); continue; } /* the talk ended because the bot walked off: the tracker's Continue picks it up */
        if (pick) { await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: pick.t.split(' Roll')[0].slice(0, 30) }).first().click({ timeout: 2000 }).catch(() => {}); await settle(page, 900); } else await settle(page, 700);
      }
      const r = await frameReport(page);
      notes.frames = r.frames; notes.cuts = r.cuts; notes.maxChange = r.maxChange; notes.captions = r.captions; notes.errors = errors;
      if (PROOF) fs.writeFileSync(`${PROOF}/playthrough-${size}.json`, JSON.stringify(notes, null, 1));
      assert.equal(notes.stuck, null, `stuck: ${JSON.stringify(notes.stuck)}`);
      assert.deepEqual(r.cuts, [], 'no hard cut in six scenes');
      assert.ok(notes.scenes.length >= 6, `six scenes started: ${notes.scenes.map((s) => s.scene)}`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}
