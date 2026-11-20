// Player-bot helpers for scene 1's hands-on games (foam valve, coolant hose, mop, holodeck lever), shared by the playthrough bot.
// Copied (not extracted) from tests/stardust-opening-c-browser.test.mjs: C's helpers are closures over its test state
// (the phone flag, its shot() and its assertions), so moving them would have changed that test. Everything here plays with real
// pointer input: a stand-and-press at the thing (E, or the tap prompt on a phone), wheels spun with the mouse, tiles clicked,
// the mop dragged row by row, the lever pulled and held. It never writes quest state.
import { settle } from './stardust-opening-b-kit.mjs';

/** The scene-1 nodes that are played in the room, with no dialogue box. */
export const HANDS_ON_NODES = ['work-valve', 'work-hose', 'work-mop', 'work-lever'];
export const isHandsOn = (quest, node) => quest === 'third-shift' && HANDS_ON_NODES.includes(node);

const nodeOf = (page) => page.evaluate(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node || null);
const flagsOf = (page) => page.evaluate(() => window.__stardust.store.get().flags || {});

/** Stand beside an interactable and use it the way a player does (face it, E on desktop, tap the prompt on a phone). */
export async function use(page, phone, id) {
  const ok = await page.evaluate(async (id) => {
    const { walkable } = await import('/projects/Space-Shooter/voyage/onfoot/rules/mapdata.js');
    const w = window.__stardust.onfoot.world, m = w.map, T = m.tile;
    const it = m.interacts.find((i) => i.id === id);
    if (!it) return false;
    const spots = [];
    for (const k of [1.0, 1.2, 0.9, 1.4]) for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; spots.push([it.x + Math.cos(ang) * T * k, it.y + Math.sin(ang) * T * k]); }
    for (const [x, y] of spots) {
      if (!walkable(m, x, y, 12) || Math.hypot(x - it.x, y - it.y) >= it.reach - 4) continue;
      w.place(x, y, Math.atan2(it.y - y, it.x - x));
      await new Promise((r) => setTimeout(r, 170));
      if (w.target?.id === id) return true;
    }
    return false;
  }, id);
  if (!ok) throw new Error(`hands-on bot: no standing spot at ${id}`);
  await settle(page, 450);
  if (phone) await page.tap('.of-prompt'); else await page.keyboard.press('KeyE');
  await settle(page, 350);
}

const tapBtn = (page, phone, sel) => (phone ? page.tap(sel) : page.click(sel));

/** Circle a wheel with the pointer: positive turns clockwise (shuts), negative opens. */
async function spin(page, id, turns) {
  const c = await page.evaluate((id) => { const r = document.querySelector(`.ho-wheel[data-valve="${id}"] .ho-wheel-rim`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 + 4 }; }, id);
  const dir = Math.sign(turns), n = Math.ceil(Math.abs(turns) * Math.PI * 2 / 0.3);
  await page.mouse.move(c.x + c.r, c.y); await page.mouse.down();
  for (let i = 1; i <= n; i++) { const a = dir * i * 0.3; await page.mouse.move(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r); }
  await page.mouse.up();
}
const flowState = (page) => page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="flow"]').__state; return { level: s.level, leak: s.valves.leak, feed: s.valves.feed }; });

/** The coolant hose: turn each pipe tile the right number of times with real clicks. */
async function solveWater(page) {
  await page.waitForSelector('.wb-full .rp-panel .rp-tile');
  const plan = await page.evaluate(() => {
    const s = document.querySelector('.rp-panel').__state; const out = [];
    for (const i of s.net) { let m = s.tiles[i].mask, k = 0; while (m !== s.tiles[i].solved && k < 4) { m = ((m << 1) | (m >> 3)) & 15; k++; } if (k) out.push([i, k]); }
    return out;
  });
  for (const [i, k] of plan) for (let c = 0; c < k; c++) { await page.click(`.wb-full .rp-tile[data-i="${i}"]`, { timeout: 4000 }); await settle(page, 130); }
  await page.waitForSelector('.wb-full .rp-result.is-ok', { timeout: 15000 });
}

/** A real drag over the mop canvas, row by row, until the floor is clean. */
async function mop(page) {
  await page.waitForSelector('.wb-full .ho-mopcanvas');
  await settle(page, 400);
  const rect = await page.evaluate(() => { const r = document.querySelector('.ho-mopcanvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const dims = await page.evaluate(() => { const s = document.querySelector('.rp-panel[data-game="mop"]').__state; return { cols: s.cols, rows: s.rows }; });
  const px = (cx, cy) => [rect.x + (cx / dims.cols) * rect.w, rect.y + (cy / dims.rows) * rect.h];
  for (let pass = 0; pass < 60; pass++) {
    for (let y = 1; y < dims.rows; y += 2) {
      const [x0, yy] = px(0.5, y), [x1] = px(dims.cols - 0.5, y);
      await page.mouse.move(x0, yy); await page.mouse.down();
      await page.mouse.move(pass % 2 ? x0 : x1, yy, { steps: 28 });
      await page.mouse.up();
      const done = await page.evaluate(() => document.querySelector('.rp-panel[data-game="mop"]')?.__state?.done);
      if (done) return;
    }
  }
  throw new Error('hands-on bot: the mop never finished');
}

const waitNode = (page, id, ms = 15000) => page.waitForFunction((id) => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node === id, id, { timeout: ms });
const overlayGone = async (page) => { await page.waitForSelector('.wb-full', { state: 'detached', timeout: 15000 }); await settle(page, 400); };

/**
 * Play the hands-on node the run is on, on its good path, then return once the quest has moved to the next node.
 * snap(name) is an optional screenshot hook.
 */
export async function playHandsOn(page, { phone, node, snap = async () => {} }) {
  if (node === 'work-valve') {
    await use(page, phone, 'valve');
    await page.waitForSelector('.wb-full .ho-wheel', { timeout: 15000 });
    await snap('valve-game');
    await spin(page, 'leak', 3.2);
    await spin(page, 'feed', -3.2);
    for (let i = 0; i < 200 && (await flowState(page)).level < 0.62; i++) await settle(page, 100);
    await spin(page, 'feed', 3.2);
    await page.waitForSelector('.wb-full .ho-card.is-ok', { timeout: 15000 });
    await tapBtn(page, phone, '.wb-full .ho-card .primary');
    await overlayGone(page); await waitNode(page, 'work-hose');
  } else if (node === 'work-hose') {
    await settle(page, 1200);
    await use(page, phone, 'hose');
    await page.waitForSelector('.wb-full .rp-panel .rp-tile', { timeout: 15000 });
    await snap('hose-game');
    await solveWater(page);
    await tapBtn(page, phone, '.wb-full .rp-result .primary');
    await overlayGone(page); await waitNode(page, 'work-mop');
  } else if (node === 'work-mop') {
    await settle(page, 1200);
    if (!(await flagsOf(page))['s1-mop-held']) {
      await use(page, phone, 'mop-loose');
      await page.waitForFunction(() => window.__stardust.store.get().flags?.['s1-mop-held'] === 1, null, { timeout: 4000 });
      await settle(page, 600);
    }
    await use(page, phone, 'goo');
    await page.waitForSelector('.wb-full .ho-mopcanvas', { timeout: 15000 });
    await snap('mop-game');
    await mop(page);
    await tapBtn(page, phone, '.wb-full .ho-card .primary');
    await overlayGone(page); await waitNode(page, 'work-lever');
  } else if (node === 'work-lever') {
    await settle(page, 1200);
    await use(page, phone, 'holo-panel');
    await page.waitForSelector('.wb-full .ho-slot', { timeout: 15000 });
    await snap('lever-ready');
    const rect = await page.evaluate(() => { const r = document.querySelector('.ho-slot').getBoundingClientRect(); const hd = document.querySelector('.ho-handle').getBoundingClientRect(); return { x: r.left + r.width / 2, y0: hd.top + hd.height / 2, y1: r.bottom - 30 }; });
    await page.mouse.move(rect.x, rect.y0); await page.mouse.down(); await page.mouse.move(rect.x, rect.y1, { steps: 18 });
    for (let i = 0; i < 40; i++) { const ph = await page.evaluate(() => document.querySelector('.rp-panel[data-game="lever"]').__state.phase); if (ph === 'dead') break; await settle(page, 250); }
    await page.mouse.up(); await settle(page, 300);
    await page.waitForSelector('.wb-full .ho-card.is-ok', { timeout: 8000 });
    await tapBtn(page, phone, '.wb-full .ho-card .primary');
    await overlayGone(page);
    // the room answers (the holodeck flickers, Pip reacts) and the quest moves on; wait for it so the bot never pulls the lever twice
    await page.waitForFunction(() => Object.values(window.__stardust.store.get().quests.active || {})[0]?.node !== 'work-lever', null, { timeout: 20000 });
  }
}
