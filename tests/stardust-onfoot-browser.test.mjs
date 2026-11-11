// The on-foot tutorial layers in a real browser, with real keys, mouse and
// clicks: walk -> talk to Chibby -> mine the seam -> clear Mel's range ->
// open Edna's lockbox -> launch, fly to Dustfall -> meet Garrity. Then the
// same page at phone size. Screenshots go to PROOF_DIR when it is set.
// Opt-in like the other browser checks; run it on its own, capped:
//   STARDUST_BROWSER_TEST=1 ~/kauto-3d/bin/capped 6G timeout 600 node --test tests/stardust-onfoot-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { loadPlaywright, startServer, blockHub, DESKTOP, PHONE } from '../scripts/stardust-test-kit.mjs';

const PAGE = '/projects/Space-Shooter/voyage/onfoot/';
const PROOF = process.env.PROOF_DIR || null;
const shot = async (page, name) => { if (PROOF) await page.screenshot({ path: `${PROOF}/${name}.png` }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const world = (page) => page.evaluate(() => {
  const w = document.querySelector('.of-world')?.__world;
  return w ? { map: w.map.id, x: w.player.x, y: w.player.y, mode: w.mode, target: w.target ? { kind: w.target.kind, id: w.target.id } : null } : null;
});
const log = (page) => page.evaluate(() => window.__onfoot.log.slice());

/** Walks to a world point with held arrow keys, steering every 70 ms. */
async function walkTo(page, x, y, { near = 26, tries = 200 } = {}) {
  const held = new Set();
  const hold = async (keys) => {
    for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  let last = null, stuck = 0;
  for (let i = 0; i < tries; i++) {
    const w = await world(page);
    const dx = x - w.x, dy = y - w.y;
    if (Math.hypot(dx, dy) < near) break;
    if (last && Math.hypot(w.x - last.x, w.y - last.y) < 1) stuck++; else stuck = 0;
    last = w;
    const keys = [];
    // When stuck on a corner, slide sideways for a moment.
    const sx = stuck > 3 ? Math.sign(dy || 1) : 0, sy = stuck > 3 ? -Math.sign(dx || 1) : 0;
    if (dx + sx * 40 > 8) keys.push('ArrowRight'); else if (dx + sx * 40 < -8) keys.push('ArrowLeft');
    if (dy + sy * 40 > 8) keys.push('ArrowDown'); else if (dy + sy * 40 < -8) keys.push('ArrowUp');
    await hold(keys);
    await sleep(70);
  }
  await hold([]);
  await sleep(150);
  return world(page);
}

async function walkToInteract(page, kind, id, via = []) {
  for (const [x, y] of via) await walkTo(page, x, y, { near: 30 });
  const spot = await page.evaluate(([kind, id]) => {
    const w = document.querySelector('.of-world').__world;
    const it = kind === 'npc' ? w.map.npcs.find(n => n.id === id) : w.map.interacts.find(i => i.kind === kind && i.id === id);
    return it ? { x: it.x, y: it.y, reach: it.reach || 60 } : null;
  }, [kind, id]);
  assert.ok(spot, `${kind} ${id} on this map`);
  await walkTo(page, spot.x, spot.y + 50, { near: 22 });
  for (let i = 0; i < 20; i++) {
    const w = await world(page);
    if (w.target?.kind === kind && w.target?.id === id) return w;
    await walkTo(page, spot.x, spot.y, { near: 30, tries: 6 });
  }
  const w = await world(page);
  assert.fail(`could not reach ${kind} ${id}: at ${Math.round(w.x)},${Math.round(w.y)} on ${w.map}, target ${JSON.stringify(w.target)}`);
}

async function finishTalk(page) {
  await page.waitForSelector('.of-talk', { timeout: 5000 });
  for (let i = 0; i < 10 && await page.locator('.of-talk').count(); i++) { await sleep(180); await page.keyboard.press('Enter'); }
  await page.waitForSelector('.of-talk', { state: 'detached', timeout: 5000 });
}

async function playMining(page) {
  await page.waitForSelector('.of-mine', { timeout: 5000 });
  let down = false;
  for (let i = 0; i < 1500; i++) {
    const s = await page.evaluate(() => { const p = document.querySelector('.of-mine'); if (!p) return null; const st = p.__state; const c = 0.56 + 0.17 * Math.sin(st.t * 0.62 + st.seed) * Math.min(1, 0.3 + st.progress); return { done: st.done, heat: st.heat, mid: c }; });
    if (!s || s.done) break;
    const want = s.heat < s.mid;
    if (want !== down) { if (want) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); down = want; }
    await sleep(30);
  }
  if (down) await page.keyboard.up('Space');
  await page.waitForFunction(() => document.querySelector('.of-mine')?.__state.done, null, { timeout: 30000 });
  await sleep(400);
}

async function playRange(page) {
  await page.waitForFunction(() => document.querySelector('.of-world').__world.mode === 'fight');
  await sleep(300);
  await shot(page, '04-range-1440');
  const box = await page.locator('.of-world canvas').boundingBox();
  let downNow = false;
  for (let i = 0; i < 400; i++) {
    const aim = await page.evaluate(() => {
      const w = document.querySelector('.of-world').__world;
      const f = w.fightState;
      if (!f || f.ended) return null;
      const e = f.enemies.filter(x => x.alive).sort((a, b) => Math.hypot(a.x - f.player.x, a.y - f.player.y) - Math.hypot(b.x - f.player.x, b.y - f.player.y))[0];
      return e ? w.screenOf(e.x, e.y) : null;
    });
    if (!aim) break;
    await page.mouse.move(box.x + aim.x, box.y + aim.y);
    if (!downNow) { await page.mouse.down(); downNow = true; }
    if (i === 25) await shot(page, '05-firing-1440');
    await sleep(40);
  }
  if (downNow) await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.of-world').__world.mode === 'walk', null, { timeout: 8000 });
}

async function playLockbox(page) {
  await page.waitForSelector('.of-puzzle', { timeout: 5000 });
  await shot(page, '06-lockbox-1440');
  const plan = await page.evaluate(() => document.querySelector('.of-puzzle').__state.tiles.map((t, i) => {
    let m = t.mask, n = 0;
    while (t.line && !t.fixed && m !== t.solved && n < 4) { m = ((m << 1) | (m >> 3)) & 15; n++; }
    return [i, n];
  }).filter(([, n]) => n));
  for (const [i, n] of plan) for (let k = 0; k < n; k++) { await page.locator(`.of-puzzle .of-tile[data-i="${i}"]`).click(); await sleep(60); }
  await shot(page, '07-lockbox-solved-1440');
  await page.locator('.of-puzzle button', { hasText: 'Continue' }).click();
}

async function flyHop(page, phoneShots = false) {
  await page.waitForSelector('.of-hop', { timeout: 5000 });
  const held = new Set();
  const hold = async (keys) => {
    for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  for (let i = 0; i < 900; i++) {
    const h = await page.evaluate(() => {
      const el = document.querySelector('.of-hop'); if (!el) return null;
      const hop = el.__hop, s = hop.ship;
      const dest = { dustfall: [99, 81.4], alpha: [21.6, 72.6], beacon: [61.2, 33] }[hop.to];
      return { arrived: hop.arrived, docking: hop.docking, x: s.x, y: s.y, a: s.angle, v: Math.hypot(s.vx, s.vy), d: hop.distance, dx: dest[0] - s.x, dy: dest[1] - s.y };
    });
    if (!h || h.arrived || h.docking) break;
    const want = Math.atan2(h.dy, h.dx);
    const diff = Math.atan2(Math.sin(want - h.a), Math.cos(want - h.a));
    const keys = [];
    if (diff > 0.12) keys.push('ArrowRight'); else if (diff < -0.12) keys.push('ArrowLeft');
    if (Math.abs(diff) < 0.6 && h.v < Math.max(4, h.d * 0.8)) keys.push('ArrowUp');
    if (h.v > h.d * 1.3 + 2) keys.push('ArrowDown');
    await hold(keys);
    if (i === 40) await shot(page, phoneShots ? '13-hop-390' : '08-hop-1440');
    await sleep(40);
  }
  await hold([]);
  await page.waitForSelector('.of-hop', { state: 'detached', timeout: 10000 });
}

test('on foot: walk, talk, mine, shoot, lockbox, fly to a giver (1440), then the phone layout (390)', {
  skip: !process.env.STARDUST_BROWSER_TEST, timeout: 420000,
}, async (t) => {
  if (PROOF) mkdirSync(PROOF, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await server.close(); });

  // ---- desktop ----
  const context = await browser.newContext({ ...DESKTOP, viewport: { width: 1440, height: 900 } });
  await blockHub(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/api\.donavencrenshaw\.com/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/api\.donavencrenshaw\.com/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${server.origin}${PAGE}?newgame=1`);
  await page.waitForFunction(() => window.__onfoot && document.querySelector('.of-world')?.__world);
  await sleep(600);
  await shot(page, '01-hangar-1440');

  // Walk: real keys to Chibby at the pad.
  const chibby = await page.evaluate(() => document.querySelector('.of-world').__world.map.npcs.find(n => n.id === 'chibby'));
  await walkTo(page, chibby.x + 20, chibby.y + 50);
  let events = await log(page);
  assert.ok(events.includes('tutorial:moved'), 'moved');
  assert.ok(events.includes('tutorial:arrived'), 'arrived at a station ring');

  // Talk.
  await walkToInteract(page, 'npc', 'chibby');
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.of-talk');
  await shot(page, '02-talk-1440');
  await finishTalk(page);
  assert.ok((await log(page)).includes('met:chibby'));

  // Mine: the seam by the scrap pile (Ralph has trotted over by now).
  await walkToInteract(page, 'mine', 'scrap-seam');
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.of-mine');
  await sleep(1200);
  await page.keyboard.down('Space'); await sleep(900); await shot(page, '03-mining-1440'); await page.keyboard.up('Space');
  await playMining(page);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.of-mine', { state: 'detached' });
  const ore = await page.evaluate(() => JSON.parse(localStorage.getItem('stardust.voyage.v1'))?.items?.ore || 0);
  assert.ok(ore >= 3, `mined ${ore} ore into the save`);

  // Shoot: Mel's range, aiming with the mouse.
  await walkToInteract(page, 'range', 'range');
  await page.keyboard.press('KeyE');
  await playRange(page);
  events = await log(page);
  assert.ok(events.includes('tutorial:shot'), 'cleared the range');

  // Puzzle: through Edna's back-room door, then her lockbox.
  const door = await page.evaluate(() => { const d = document.querySelector('.of-world').__world.map.doors.find(x => x.id === 'backroom'); return { x: d.x + d.w / 2, y: d.y + d.h / 2 }; });
  await walkTo(page, door.x - 60, door.y);
  await walkTo(page, door.x + 10, door.y, { near: 6, tries: 30 });
  await page.waitForFunction(() => document.querySelector('.of-world').__world.map.id === 'edna-den', null, { timeout: 5000 });
  await sleep(500);
  await walkToInteract(page, 'puzzle', 'lockbox');
  await page.keyboard.press('KeyE');
  await playLockbox(page);
  assert.ok((await log(page)).includes('tutorial:solved'));

  // Fly: back to the hangar, the launch hatch, Dustfall, then meet Garrity.
  const out = await page.evaluate(() => { const d = document.querySelector('.of-world').__world.map.doors.find(x => x.id === 'out'); return { x: d.x + d.w / 2, y: d.y + d.h / 2 }; });
  await walkTo(page, out.x - 40, out.y);
  await walkTo(page, out.x + 10, out.y, { near: 6, tries: 30 });
  await page.waitForFunction(() => document.querySelector('.of-world').__world.map.id === 'hangar', null, { timeout: 5000 });
  await sleep(400);
  await walkToInteract(page, 'station', 'hatch', [[13.5 * 48, 8.5 * 48], [2 * 48, 8.5 * 48]]); // round the ship, not through it (the hatch opens the helm here; the hangar page opens its launch panel)
  await page.keyboard.press('KeyE');
  await page.locator('.of-helm [data-target="dustfall"]').click();
  await flyHop(page);
  await page.waitForFunction(() => document.querySelector('.of-world').__world.map.id === 'garrity-office', null, { timeout: 8000 });
  await sleep(700);
  await shot(page, '09-garrity-office-1440');
  await walkToInteract(page, 'npc', 'garrity');
  await page.keyboard.press('KeyE');
  await finishTalk(page);
  events = await log(page);
  for (const e of ['explore:launched', 'explore:arrived', 'met:garrity', 'tutorial:mined', 'tutorial:shot', 'tutorial:solved']) assert.ok(events.includes(e), e);
  await shot(page, '10-checklist-done-1440');
  t.diagnostic(`events: ${[...new Set(events)].join(', ')}`);
  assert.deepEqual(errors, []);
  await context.close();

  // ---- phone ----
  const phone = await browser.newContext({ ...PHONE });
  await blockHub(phone);
  const p2 = await phone.newPage();
  const errors2 = [];
  p2.on('pageerror', e => errors2.push(e.message));
  p2.on('response', r => { if (r.status() >= 400 && !/api\.donavencrenshaw\.com/.test(r.url())) errors2.push(`${r.status()} ${r.url()}`); });
  await p2.goto(`${server.origin}${PAGE}?newgame=1`);
  await p2.waitForFunction(() => window.__onfoot && document.querySelector('.of-world')?.__world);
  await sleep(600);
  assert.equal(await p2.locator('.of-stick-left').count(), 1, 'touch stick on phones');
  const canvasSize = await p2.evaluate(() => { const c = document.querySelector('.of-world canvas'); return { w: c.width, css: c.getBoundingClientRect().width }; });
  assert.ok(canvasSize.w <= canvasSize.css * 2 + 1, `render scale caps the canvas (${canvasSize.w} px for ${canvasSize.css} css px)`);
  await shot(p2, '11-hangar-390');
  // Thumbstick: drag the left stick up for a moment; the captain walks.
  const stick = await p2.locator('.of-stick-left').boundingBox();
  const before = await world(p2);
  await p2.touchscreen.tap(stick.x + stick.width / 2, stick.y + stick.height / 2);
  await p2.evaluate(() => {
    const s = document.querySelector('.of-stick-left'); const r = s.getBoundingClientRect();
    const ev = (type, y) => s.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: y, bubbles: true }));
    ev('pointerdown', r.top + r.height / 2); ev('pointermove', r.top);
    setTimeout(() => ev('pointerup', r.top), 700);
  });
  await sleep(900);
  const after = await world(p2);
  assert.ok(before.y - after.y > 40, `the stick moved the captain (${Math.round(before.y - after.y)} px)`);
  await p2.evaluate(() => { window.__practice = window.__onfoot.onfoot.practice(); });
  await sleep(700);
  await shot(p2, '12-range-390');
  await p2.evaluate(() => { const w = document.querySelector('.of-world').__world; for (const e of w.fightState.enemies) e.hp = 0, e.alive = false; });
  await p2.waitForFunction(() => document.querySelector('.of-world').__world.mode === 'walk', null, { timeout: 5000 });
  await p2.evaluate(() => { window.__flight = window.__onfoot.onfoot.flyTo('beacon'); });
  await flyHop(p2, true);
  await p2.waitForFunction(() => document.querySelector('.of-world').__world.map.id === 'vey-lounge', null, { timeout: 8000 });
  await sleep(600);
  await shot(p2, '14-vey-lounge-390');
  await p2.evaluate(() => { window.__mine = window.__onfoot.onfoot.mine({ title: 'Ore seam' }); });
  await sleep(800);
  await shot(p2, '15-mining-390');
  await p2.evaluate(() => document.querySelector('.of-mine')?.remove());
  // The hack: open the outpost cache's bypass and splice it open with taps on the button.
  await p2.evaluate(() => { window.__hack = window.__onfoot.onfoot.hack({ id: 'test-cache', label: 'Sealed supply cache', level: 1 }); });
  await p2.waitForSelector('.of-hack');
  await sleep(500);
  await shot(p2, '16-hack-390');
  for (let i = 0; i < 400; i++) {
    const s = await p2.evaluate(() => { const st = document.querySelector('.of-hack')?.__state; if (!st) return null; const tb = st.tumblers[st.index]; const d = tb ? Math.abs(((st.cursor - tb.at + Math.PI * 3) % (Math.PI * 2)) - Math.PI) : 9; return { done: st.done, inside: d < tb?.width / 2 - 0.08 }; });
    if (!s || s.done) break;
    if (s.inside) await p2.locator('.of-hack .of-drill-btn').tap();
    await sleep(16);
  }
  if (await p2.locator('.of-hack').count()) { await sleep(400); await p2.keyboard.press('Enter'); }
  const hack = await p2.evaluate(() => window.__hack);
  assert.equal(hack?.success, true, 'the bypass opens with taps');
  assert.deepEqual(errors2, []);
  await phone.close();
});
