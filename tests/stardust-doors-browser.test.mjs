// Doors built into the walls, in the REAL page (?newgame=1&start=workbench), at 1440x900 and 390x844, walked with the
// keyboard: the vestibule entry (outer door opens, closes behind, both shut while the map changes, the inner door opens, new
// room), the plain sliding doorway, the locked swing door, and the way back. A per-frame sampler proves the map only ever
// changes with every door shut. Opt in, one at a time, under the browser lock:
//   PROOF_DIR=$HOME/Desktop/lhc-lanes/stardust/launch/doors/proof STARDUST_BROWSER_TEST=1 flock ~/Desktop/lhc-lanes/stardust/round3/browser.lock \
//     ~/kauto-3d/bin/capped 6G timeout 590 node --test tests/stardust-doors-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, blockHub } from '../scripts/stardust-test-kit.mjs';

const V = '/projects/Space-Shooter/voyage/';
const PROOF = process.env.PROOF_DIR || null;
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const skip = process.env.STARDUST_BROWSER_TEST !== '1' && 'set STARDUST_BROWSER_TEST=1';

const where = (page) => page.evaluate(() => { const w = window.__stardust.onfoot.world; return { map: w.map.id, x: w.player.x, y: w.player.y, snap: w.doors.snapshot() }; });
const amount = (page, id) => page.evaluate((id) => window.__stardust.onfoot.world.doors.amount(id), id);
const phase = (page, id) => page.evaluate((id) => window.__stardust.onfoot.world.doors.phase(id), id);

/** Walk to a world point with the real keyboard (WASD), one axis at a time. */
async function walk(page, tx, ty, { tol = 10, secs = 14, axes = 'xy' } = {}) {
  const t0 = Date.now();
  const order = axes === 'yx' ? ['y', 'x'] : ['x', 'y'];
  for (const axis of order) {
    for (;;) {
      const p = await where(page);
      const d = (axis === 'x' ? tx - p.x : ty - p.y);
      if (Math.abs(d) <= tol) break;
      if (Date.now() - t0 > secs * 1000) throw new Error(`walk to ${tx},${ty} timed out at ${Math.round(p.x)},${Math.round(p.y)} (${p.map})`);
      const key = axis === 'x' ? (d > 0 ? 'KeyD' : 'KeyA') : (d > 0 ? 'KeyS' : 'KeyW');
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(180, Math.max(30, Math.abs(d) * 1.4)));
      await page.keyboard.up(key);
    }
  }
  await page.waitForTimeout(60);
}
const holdKey = async (page, key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  test(`doors in the workbench, ${name}`, { skip, timeout: 560000 }, async (t) => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    let n = 0;
    const shot = async (label) => { await page.waitForTimeout(120); if (PROOF) await page.screenshot({ path: `${PROOF}/${name}-${String(++n).padStart(2, '0')}-${label}.png` }); };
    try {
      await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
      await page.goto(`${server.origin}${V}?newgame=1&start=workbench&seed=7`);
      await page.waitForFunction(() => window.__stardust?.workbench && window.__stardust.onfoot?.world);
      await page.waitForTimeout(1200);
      // per-frame sampler: every frame, the map and every door's amount; used to prove no map change happens with a door apart
      await page.evaluate(() => {
        window.__log = []; let last = null;
        const tick = () => { const w = window.__stardust.onfoot.world, s = w.doors.snapshot(); const row = { map: w.map.id, open: Object.fromEntries(s.doors.map((d) => [d.id, d.open])), entries: s.entries.map((e) => e.phase) }; if (!last || last.map !== row.map || JSON.stringify(last.open) !== JSON.stringify(row.open)) window.__log.push({ ...row, t: performance.now() }); last = row; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.equal(sw.sw, sw.iw, 'no sideways scroll');

      // ---- the vestibule entry: bench -> annex -------------------------------------------------------------------
      await page.evaluate(() => window.__stardust.onfoot.world.place(15 * 48 + 24 + 48 * 0.5, 12.5 * 48));
      await walk(page, 17 * 48, 12.5 * 48);
      await walk(page, 17 * 48, 14.9 * 48, { axes: 'yx' });
      await shot('approach-outer-door-shut');
      assert.equal(await amount(page, 'annex-room'), 0, 'shut while you are a tile away');
      await page.keyboard.down('KeyS');
      let sawOpen = false;
      for (let i = 0; i < 40; i++) { await page.waitForTimeout(40); if ((await amount(page, 'annex-room')) > 0.55) { sawOpen = true; break; } }
      await page.keyboard.up('KeyS');
      assert.ok(sawOpen, 'the outer door slides apart on approach');
      await shot('outer-door-opening');
      await walk(page, 16.5 * 48 + 24, 16.5 * 48 + 8, { axes: 'yx' });
      await shot('in-the-doorway');
      // keep walking in: past the sealing point the outer door closes behind
      await page.keyboard.down('KeyS');
      let cycling = false;
      for (let i = 0; i < 120; i++) { await page.waitForTimeout(40); if ((await phase(page, 'annex')) === 'cycling') { cycling = true; break; } }
      await page.keyboard.up('KeyS');
      assert.ok(cycling, 'the vestibule cycles');
      await page.waitForTimeout(250);
      const mid = await where(page);
      assert.equal(mid.map, 'workbench');
      const dm = Object.fromEntries(mid.snap.doors.map((d) => [d.id, d.open]));
      assert.equal(dm['annex-room'], 0, 'outer door shut behind you'); assert.equal(dm['annex-far'], 0, 'far door shut ahead');
      await shot('vestibule-both-doors-shut');
      await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'workbench-annex', null, { timeout: 8000 });
      await page.waitForTimeout(120);
      const arr = await where(page);
      assert.equal(arr.snap.doors.find((d) => d.id === 'bench-room').open, 0, 'arrived with the inner door shut');
      assert.equal(arr.snap.doors.find((d) => d.id === 'bench-far').open, 0);
      await shot('new-room-vestibule-both-shut');
      await page.waitForFunction(() => window.__stardust.onfoot.world.doors.amount('bench-room') > 0.5, null, { timeout: 5000 });
      await shot('inner-door-opening');
      await walk(page, 10 * 48, 4.5 * 48, { axes: 'yx' });
      await walk(page, 10 * 48, 6.2 * 48, { axes: 'yx' });
      await page.waitForTimeout(700);
      await shot('new-room');
      assert.equal(await amount(page, 'bench-room'), 0, 'the inner door closed behind');

      // the proof: the map only ever changed with every door in the sample shut
      const log = await page.evaluate(() => window.__log);
      const changes = log.map((r, i) => [r, log[i - 1]]).filter(([r, p]) => p && p.map !== r.map);
      assert.ok(changes.length >= 1, 'saw the map change');
      for (const [r, p] of changes) {
        const entryDoors = (id) => (id === 'workbench' ? ['annex-room', 'annex-far'] : ['bench-room', 'bench-far']);
        for (const id of entryDoors(p.map)) assert.equal(p.open[id], 0, `before the change ${id} was shut`);
        for (const id of entryDoors(r.map)) assert.equal(r.open[id], 0, `after the change ${id} is shut`);
      }

      // ---- a plain sliding doorway (annex: cargo doorway at col 6) -------------------------------------------------------
      await walk(page, 8.5 * 48, 8.9 * 48, { axes: 'yx' });
      await shot('sliding-doorway-shut');
      assert.equal(await amount(page, 'cargo-door'), 0);
      await walk(page, 7.4 * 48, 8.9 * 48);
      await page.waitForFunction(() => { const a = window.__stardust.onfoot.world.doors.amount('cargo-door'); return a > 0.3 && a < 0.8; }, null, { timeout: 4000 }).catch(() => {});
      await shot('sliding-doorway-sliding');
      await page.waitForTimeout(350);
      await walk(page, 4.4 * 48, 8.9 * 48);
      assert.equal((await where(page)).x < 6 * 48, true, 'walked through the doorway');
      await page.waitForTimeout(900);
      await shot('sliding-doorway-closed-behind');
      assert.equal(await amount(page, 'cargo-door'), 0);

      // ---- a locked swing door --------------------------------------------------------------------------------------------
      await walk(page, 12.2 * 48, 8.9 * 48);
      await walk(page, 13.1 * 48, 8.9 * 48);
      await page.waitForTimeout(900);
      assert.equal(await amount(page, 'store-door'), 0, 'locked: stays shut with you at it');
      await shot('locked-swing-door-shut');
      await page.evaluate(() => window.__stardust.onfoot.world.open('hack:workbench-annex:store-door')); // what a won hack does
      await page.waitForFunction(() => window.__stardust.onfoot.world.doors.amount('store-door') > 0.4, null, { timeout: 4000 });
      await shot('swing-door-swinging');
      await page.waitForTimeout(400);
      await shot('swing-door-open');
      await walk(page, 16 * 48, 8.9 * 48);
      assert.equal((await where(page)).x > 14.6 * 48, true, 'walked through the swing door');

      // ---- and the way back: annex -> bench ---------------------------------------------------------------------------------
      await walk(page, 12.5 * 48, 8.9 * 48);
      await walk(page, 10 * 48, 8.9 * 48);
      await walk(page, 10 * 48, 5.6 * 48, { axes: 'yx' });
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'workbench', null, { timeout: 15000 });
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(120);
      const back = await where(page);
      assert.equal(back.snap.doors.find((d) => d.id === 'annex-room').open, 0, 'back in the bench vestibule with the door shut');
      await page.waitForFunction(() => window.__stardust.onfoot.world.doors.amount('annex-room') > 0.5, null, { timeout: 5000 });
      await walk(page, 17 * 48, 13.6 * 48, { axes: 'yx' });
      await page.waitForTimeout(1200);
      await shot('back-in-the-bench');
      assert.equal(await amount(page, 'annex-room'), 0);
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    } finally {
      await browser.close();
      await server.close?.();
    }
  });
}
