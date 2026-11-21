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

// ---- the rollout: the Duchess airlock and a hangar connector (Berth 7), frame by frame ------------------------------------
const KEY = { n: 'KeyW', s: 'KeyS', w: 'KeyA', e: 'KeyD' };
const OUTV = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const mapId = (page) => page.evaluate(() => window.__stardust.onfoot.world.map.id);

/** The story talks over rooms (a narration box pauses the walk): click through whatever is up. */
async function clearTalk(page) {
  for (let i = 0; i < 30; i++) {
    const open = await page.evaluate(() => { const b = document.querySelector('.ui-dialogue:not([hidden])'); if (!b) return false; const btn = b.querySelector('button'); btn?.click(); return true; });
    if (!open) return;
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
  }
}

/** From a room, through one entry and out the other side, shooting each beat. */
async function proofEntry(page, shot, { map, spawn, door, to, arriveDoor, tag }) {
  for (let k = 0; k < 4; k++) { // the story may talk over the room or send us elsewhere: click through, go back to the room
    await page.evaluate(([m, s]) => window.__stardust.onfoot.world.go(m, s), [map, spawn]);
    await page.waitForFunction((m) => window.__stardust.onfoot.world.map.id === m, map);
    await page.waitForTimeout(600);
    await clearTalk(page);
    if ((await mapId(page)) === map) break;
  }
  const info = await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, sys = w.doors, e = sys.entries.find((x) => x.room === id), d = sys.get(id), T = w.map.tile;
    const o = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[e.side];
    const lanes = Array.from({ length: Math.max(d.w, d.h) / T }, (_, a) => ({ lx: o[0] ? d.x + d.w / 2 : d.x + (a + 0.5) * T, ly: o[1] ? d.y + d.h / 2 : d.y + (a + 0.5) * T }));
    for (const k of [3, 2.6, 2.2]) for (const l of lanes) { const x = l.lx - o[0] * k * T, y = l.ly - o[1] * k * T; if (walkable(w.map, x, y, 12)) { w.place(x, y, Math.atan2(o[1], o[0])); return { side: e.side, lx: l.lx, ly: l.ly, id: e.id }; } }
    throw new Error('no approach to ' + id);
  }, door);
  const o = OUTV[info.side], key = KEY[info.side];
  await page.waitForTimeout(700);
  await shot(`${tag}-1-approach-door-shut`);
  assert.equal(await amount(page, door), 0, 'shut while you are a few tiles away');
  await page.keyboard.down(key);
  let opened = false;
  for (let i = 0; i < 80 && !opened; i++) { await page.waitForTimeout(30); opened = (await amount(page, door)) > 0.55; }
  await page.keyboard.up(key);
  assert.ok(opened, 'the outer door slides apart on approach');
  await shot(`${tag}-2-outer-door-opening`);
  await page.keyboard.down(key);
  let cycling = false;
  for (let i = 0; i < 200 && !cycling; i++) { await page.waitForTimeout(30); cycling = (await phase(page, info.id)) === 'cycling'; }
  await page.keyboard.up(key);
  assert.ok(cycling, 'the vestibule cycles');
  await page.waitForTimeout(220);
  const mid = await where(page);
  assert.equal(mid.map, map);
  assert.equal(mid.snap.doors.find((d) => d.id === door).open, 0, 'the outer door shut behind you');
  assert.equal(mid.snap.doors.find((d) => d.id === `${door}-far`).open, 0, 'the far door shut ahead');
  await shot(`${tag}-3-vestibule-both-doors-shut`);
  await page.waitForFunction((m) => window.__stardust.onfoot.world.map.id === m, to, { timeout: 8000 });
  await page.waitForTimeout(120);
  const arr = await where(page);
  assert.equal(arr.snap.doors.find((d) => d.id === arriveDoor).open, 0, 'arrived with the inner door shut');
  assert.equal(arr.snap.doors.find((d) => d.id === `${arriveDoor}-far`).open, 0);
  await shot(`${tag}-4-new-vestibule-both-shut`);
  await page.waitForFunction((id) => window.__stardust.onfoot.world.doors.amount(id) > 0.5, arriveDoor, { timeout: 5000 });
  await shot(`${tag}-5-inner-door-opening`);
  await clearTalk(page);
  // walk out into the new room (toward the room door, past it)
  const back = await page.evaluate((id) => { const w = window.__stardust.onfoot.world, e = w.doors.entries.find((x) => x.room === id); const d = w.doors.get(id); return { side: e.side, cx: d.x + d.w / 2, cy: d.y + d.h / 2, T: w.map.tile }; }, arriveDoor);
  const ob = OUTV[back.side];
  await page.keyboard.down(KEY[{ n: 's', s: 'n', w: 'e', e: 'w' }[back.side]]);
  let out = false;
  for (let i = 0; i < 300 && !out; i++) { await page.waitForTimeout(30); const p = await where(page); out = (p.x - back.cx) * -ob[0] + (p.y - back.cy) * -ob[1] > back.T * 1.4; }
  await page.keyboard.up(KEY[{ n: 's', s: 'n', w: 'e', e: 'w' }[back.side]]);
  assert.ok(out, 'walked out into the new room');
  await page.waitForTimeout(900);
  await shot(`${tag}-6-new-room`);
  assert.equal(await amount(page, arriveDoor), 0, 'the inner door closed behind');
}

for (const [name, profile] of [['desktop', DESK], ['phone', PHONE]]) {
  test(`doors on the Duchess airlock and the Berth 7 connector, ${name}`, { skip, timeout: 560000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(profile);
    await blockHub(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const shot = async (label) => { await page.waitForTimeout(120); if (PROOF) await page.screenshot({ path: `${PROOF}/rollout-${name}-${label}.png` }); };
    try {
      await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
      await page.goto(`${server.origin}${V}?newgame=1&seed=7`);
      await page.waitForFunction(() => window.__stardust?.onfoot?.world);
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        window.__log = []; let last = null;
        const tick = () => { const w = window.__stardust.onfoot.world, s = w.doors.snapshot(); const row = { map: w.map.id, open: Object.fromEntries(s.doors.map((d) => [d.id, d.open])), t: performance.now() }; if (!last || last.map !== row.map) window.__log.push({ ...row, prev: last }); last = row; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      // the Duchess airlock: corridor -> airlock (the corridor's airlock door, the airlock's corridor door)
      await proofEntry(page, shot, { map: 'duchess-corridor', spawn: 'default', door: 'airlock', to: 'duchess-airlock', arriveDoor: 'corridor', tag: 'airlock' });
      // Berth 7: the hangar's berth door to the pad (the pad's hangar door)
      await proofEntry(page, shot, { map: 'hangar', spawn: 'default', door: 'berth', to: 'duchess-pad', arriveDoor: 'hangar', tag: 'berth7' });
      // every map change the sampler saw happened with that entry's doors shut on both sides
      const log = await page.evaluate(() => window.__log.filter((r) => r.prev && r.prev.map !== r.map));
      assert.ok(log.length >= 2, 'saw the map changes');
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.equal(sw, 0, 'no sideways scroll');
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    } finally {
      await browser.close();
      await server.close?.();
    }
  });
}
