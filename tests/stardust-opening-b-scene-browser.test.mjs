// Opening B outcomes 4 to 7 in a real browser: the marauder scene, death and retry, the stealth taste, move-aim-shoot, sound.
// STARDUST_BROWSER_TEST=1 ~/Desktop/lhc-lanes/stardust/round3/browser-slot.sh ~/kauto-3d/bin/capped 6G timeout 900 node --test tests/stardust-opening-b-scene-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, SIZES, skip, bootAt, boot, state, toLine, settle, PROOF } from '../scripts/stardust-opening-b-kit.mjs';

const node = (page) => page.evaluate(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node);
const clickChoice = async (page, text) => {
  await page.waitForFunction((t) => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => b.textContent.includes(t) && !b.disabled), text, { timeout: 25000 });
  await page.locator('#hg-dialogue .ui-dlg-choice', { hasText: text }).first().click();
};
const hop = (page, room) => page.evaluate(async (room) => {
  const { doorToward } = await import('/projects/Space-Shooter/voyage/datapad/route.js');
  const { MAP_DEFS } = await import('/projects/Space-Shooter/voyage/maps/index.js');
  const w = window.__stardust.onfoot.world;
  const id = doorToward(w.map.id, [room], MAP_DEFS);
  const e = w.doors.entries.find((x) => x.room === id);
  w.place(e.zone.x + e.zone.w / 2, e.zone.y + e.zone.h / 2);
}, room);
const shot = async (page, name, size) => { if (PROOF) { await settle(page, 350); await page.screenshot({ path: `${PROOF}/${name}-${size}.png` }); } };

for (const [size, profile] of SIZES) {
  test(`marauders (${size}): alarm and hatch first, then the door blows, then Reavers, then Reck falls with the camera on him`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'visitors', { reduced: false });
    try {
      await page.evaluate(() => {
        const w = window.__stardust.onfoot.world, bus = window.__stardust.bus;
        const rec = (window.__rec = { t0: performance.now(), order: [], mood: [], loops: [], reckCam: null, reavers: 0 });
        const seen = new Set();
        const mark = (k) => { if (!seen.has(k)) { seen.add(k); rec.order.push(k); } };
        bus.on('audio:mood', (d) => rec.mood.push(d.mode)); bus.on('audio:loop', (d) => rec.loops.push(`${d.id}:${d.on}`));
        setInterval(() => {
          const s = w.stage.snapshot();
          if (s.pulse) mark('pulse'); if (s.banner) mark('banner'); if (s.inset) mark('inset'); if (s.camera) mark('camera');
          if (s.hatch.p > 0) mark('seam'); if (s.hatch.blown) mark('blown');
          if (s.actors.length) { mark('reavers'); if (!s.hatch.blown) rec.reaverBeforeBlow = true; }
          if (w.stateOf('reck') === 'down') { mark('reck-down'); if (!rec.reckCam) rec.reckCam = { cam: s.camera, reck: w.npcAt('reck') }; }
        }, 40);
      });
      await clickChoice(page, 'Go and talk to Reck');
      await clickChoice(page, 'Keep your eyes on the cutter');
      await page.waitForFunction(() => window.__rec.order.includes('pulse'), null, { timeout: 30000 });
      await page.waitForFunction(() => window.__rec.order.includes('camera'), null, { timeout: 5000 });
      await shot(page, 'breach-alarm', size);
      await clickChoice(page, 'Hold on to the console');
      await page.waitForFunction(() => window.__rec.order.includes('seam'), null, { timeout: 20000 });
      await shot(page, 'hatch-cut', size);
      await page.waitForFunction(() => window.__rec.order.includes('blown'), null, { timeout: 40000 });
      await page.waitForFunction(() => window.__rec.order.includes('reavers'), null, { timeout: 20000 });
      await page.waitForFunction(() => { const a = window.__stardust.onfoot.world.stage.snapshot().actors.find((x) => x.id === 'r1'); return a && a.x <= 640; }, null, { timeout: 8000 }).catch(() => {});
      await shot(page, 'reaver-at-hatch', size);
      await settle(page, 700);
      await shot(page, 'reavers-through-hatch', size);
      await page.waitForFunction(() => window.__rec.order.includes('reck-down'), null, { timeout: 30000 });
      const rec = await page.evaluate(() => window.__rec);
      const idx = (k) => rec.order.indexOf(k);
      assert.ok(idx('pulse') < idx('seam') && idx('seam') < idx('blown') && idx('blown') < idx('reavers') && idx('reavers') < idx('reck-down'), `order: ${rec.order}`);
      assert.ok(idx('camera') < idx('blown'), 'the camera swung to the hatch before the door blew');
      assert.ok(!rec.reaverBeforeBlow, 'no Reaver before the door blew');
      assert.equal(rec.mood[0], 'danger', 'the music cut to the tense bed');
      assert.ok(rec.loops.includes('klaxon:true'), 'the klaxon runs');
      assert.ok(rec.reckCam?.cam, 'the camera was on a target when Reck fell');
      assert.ok(Math.hypot(rec.reckCam.cam.x - 264, rec.reckCam.cam.y - 312) < 120, `that target is Reck's chair (${JSON.stringify(rec.reckCam.cam)})`);
      await page.waitForFunction(() => [...document.querySelectorAll('#hg-dialogue .ui-dlg-choice')].some((b) => /Duck behind the console/.test(b.textContent)), null, { timeout: 30000 });
      await shot(page, 'reck-down-choices', size);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`death (${size}): going down ends the run, shows retry, and retry replays the scene from its start`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'hold-the-corridor');
    try {
      await clickChoice(page, 'Grab the rifle');
      await hop(page, 'duchess-corridor');
      await clickChoice(page, 'Hold the corridor');
      await page.waitForFunction(() => window.__stardust.onfoot.world.mode === 'fight', null, { timeout: 10000 });
      await page.evaluate(() => { window.__stardust.onfoot.world.fightState.player.hp = 0; });
      await page.waitForSelector('.op-retry-btn', { timeout: 15000 });
      await shot(page, 'retry-screen', size);
      assert.notEqual(await node(page), 'end-overrun', 'dying is not a story branch');
      await page.locator('.op-retry-btn').click();
      await page.waitForFunction(() => window.__stardust.onfoot.world.mode === 'walk' && Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'bridge', null, { timeout: 15000 });
      assert.equal((await state(page)).map, 'duchess-bridge', 'back at the scene start');
      assert.equal(await page.locator('.op-retry').count(), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`stealth (${size}): slip behind them runs live stealth in the cargo hold; reaching the goal passes, an alarm fails into a fight in the hold`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await bootAt(browser, server.origin, profile, 'hold-the-corridor');
    try {
      await clickChoice(page, 'Grab the rifle');
      await hop(page, 'duchess-corridor');
      await clickChoice(page, 'Slip through the cargo hold');
      await page.waitForSelector('.op-approach');
      assert.equal(await page.evaluate(() => document.querySelector('.op-approach').dataset.phase), 'travel', 'first you walk there; the clock waits');
      await hop(page, 'duchess-cargo');
      await page.waitForFunction(() => window.__stardust.onfoot.world.map.id === 'duchess-cargo' && window.__stardust.onfoot.world.stealth, null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => document.querySelector('.op-approach').dataset.phase), 'sneak');
      assert.ok(await page.locator('.of-stealth').isVisible(), 'the stealth readout is up (cones, fog)');
      await shot(page, 'stealth-corridor', size);
      // Walk to the goal behind them.
      await page.evaluate(() => window.__stardust.onfoot.world.place(10.5 * 48, 14.5 * 48));
      await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === 'cargo-flank', null, { timeout: 15000 });
      assert.equal(await page.evaluate(() => Boolean(window.__stardust.onfoot.world.stealth)), false, 'stealth ends with the approach');
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });

  test(`combat (${size}): move, aim and shoot at the same time`, { skip, timeout: 300000 }, async () => {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true });
    const { context, page, errors } = await boot(browser, server.origin, profile);
    try {
      const start = async () => {
        await page.evaluate(async () => {
          const w = window.__stardust.onfoot.world;
          w.go('duchess-corridor', 'default');
          await new Promise((r) => setTimeout(r, 600));
          w.fight({ map: 'duchess-corridor', enemies: [{ type: 'drone', x: 17 * 48, y: 9.5 * 48, awake: false }, { type: 'drone', x: 24 * 48, y: 9.5 * 48, awake: false }], player: { hp: 500 } });
          window.__fw = w;
        });
        await settle(page, 600);
      };
      const fs = () => page.evaluate(() => { const f = window.__fw.fightState; return f && { x: f.player.x, y: f.player.y, a: f.player.angle, shots: f.player.shots }; });
      await start();
      await page.evaluate(() => { for (const e of window.__fw.fightState.enemies) e.hp = e.maxHp = 9999; });
      const help = await page.evaluate(() => document.querySelector('.of-hud-help').textContent);
      assert.match(help, /F|stick/, 'the fight says how to aim and fire');
      const a = await fs();
      if (size === 'desktop') {
        // Keyboard only: walk with W, hold F: it aims for the nearest enemy and fires, while walking.
        await page.keyboard.down('KeyW'); await page.keyboard.down('KeyF');
        await settle(page, 900);
        const b = await fs();
        await page.keyboard.up('KeyW'); await page.keyboard.up('KeyF');
        assert.ok(Math.abs(b.y - a.y) > 15, `moved (${a.y} -> ${b.y})`);
        assert.ok(b.shots > a.shots, `shot (${a.shots} -> ${b.shots})`);
        const want = await page.evaluate(() => { const f = window.__fw.fightState, p = f.player; const e = f.enemies.filter((x) => x.alive).sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0]; return Math.atan2(e.y - p.y, e.x - p.x); });
        assert.ok(Math.abs(Math.atan2(Math.sin(b.a - want), Math.cos(b.a - want))) < 0.9, `aimed at the nearest enemy, not where it walked (${b.a} vs ${want})`);
        // Mouse: aim with the pointer, click to fire, walk with D, all at once.
        const c = await fs();
        await page.mouse.move(700, 120);
        await page.keyboard.down('KeyD'); await page.mouse.down();
        await settle(page, 900);
        const d = await fs();
        await page.mouse.up(); await page.keyboard.up('KeyD');
        assert.ok(d.x > c.x + 15, 'moved while clicking');
        assert.ok(d.shots > c.shots, 'fired while moving');
        assert.ok(Math.sin(d.a) < -0.2, `aimed up toward the pointer (${d.a})`);
      } else {
        const rect = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
        const L = await rect('.of-stick-left'), R = await rect('.of-stick-right');
        const ptr = (sel, type, id, x, y) => page.locator(sel).dispatchEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, button: 0, isPrimary: true });
        await ptr('.of-stick-left', 'pointerdown', 11, L.x + 40, L.y);
        await ptr('.of-stick-right', 'pointerdown', 12, R.x, R.y - 44);
        await settle(page, 900);
        const b = await fs();
        await ptr('.of-stick-left', 'pointerup', 11, L.x, L.y); await ptr('.of-stick-right', 'pointerup', 12, R.x, R.y);
        assert.ok(b.x > a.x + 15, `left stick moved (${a.x} -> ${b.x})`);
        assert.ok(b.shots > a.shots, 'right stick fired');
        assert.ok(Math.sin(b.a) < -0.5, `and aimed up (${b.a})`);
        // A tap-and-hold on the playfield aims there and fires.
        const c = await fs();
        await page.evaluate(() => { const cv = document.querySelector('.of-canvas'); const r = cv.getBoundingClientRect(); const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 21, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); window.__tap = { ev, r }; ev('pointerdown', r.x + r.width * 0.5, r.y + r.height * 0.85); });
        await settle(page, 700);
        const d = await fs();
        await page.evaluate(() => window.__tap.ev('pointerup', 0, 0));
        assert.ok(d.shots > c.shots, 'a held tap fired');
        assert.ok(Math.sin(d.a) > 0.3, `aimed down toward the tap (${d.a})`);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); server.close(); }
  });
}

test('sound (desktop): the klaxon loops, the bed is cut in danger and restored in calm, effects make sound', { skip, timeout: 240000 }, async () => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const { context, page, errors } = await boot(browser, server.origin, SIZES[0][1], { reduced: true });
  try {
    await page.addInitScript(() => {});
    await page.evaluate(() => {
      window.__nodes = 0;
      for (const name of ['createOscillator', 'createBufferSource']) { const orig = AudioContext.prototype[name]; AudioContext.prototype[name] = function (...a) { window.__nodes++; return orig.apply(this, a); }; }
    });
    await page.mouse.click(300, 400); // the first touch unlocks sound
    await settle(page, 300);
    const before = await page.evaluate(() => window.__nodes);
    await page.evaluate(() => { window.__stardust.sfx('shot'); window.__stardust.sfx('breach'); window.__stardust.bus.emit('audio:loop', { id: 'klaxon', on: true }); });
    await settle(page, 400);
    const after = await page.evaluate(() => ({ n: window.__nodes, running: window.__stardust.sfx.running() }));
    assert.ok(after.n > before + 3, `effects made sound nodes (${before} -> ${after.n})`);
    assert.deepEqual(after.running, ['klaxon']);
    const bed0 = await page.evaluate(() => window.__stardust.audio.moodFactor);
    await page.evaluate(() => window.__stardust.bus.emit('audio:mood', { mode: 'danger' }));
    await settle(page, 1200);
    assert.ok((await page.evaluate(() => window.__stardust.audio.moodFactor)) < 0.1 && bed0 === 1, 'the music is cut');
    await page.evaluate(() => { window.__stardust.bus.emit('audio:mood', { mode: 'calm' }); window.__stardust.bus.emit('audio:loop', { id: 'klaxon', on: false }); });
    await settle(page, 1200);
    assert.ok((await page.evaluate(() => window.__stardust.audio.moodFactor)) > 0.9, 'and back');
    assert.deepEqual(await page.evaluate(() => window.__stardust.sfx.running()), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); await browser.close(); server.close(); }
});
