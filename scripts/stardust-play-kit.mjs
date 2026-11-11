// Helpers for browser tests that PLAY the new Stardust: walk the on-foot floor
// with held keys, use what's in reach, mine, clear Mel's range, open Edna's
// lockbox, fly a hop, and play a job on the board to its end screen. They read
// the page (the world element's __world, the minigame panels' __state) and
// press real keys, mouse and clicks. Dev-only, never shipped. Moved here from
// the onfoot and slice tests so the round-2 end-to-end test can share them.
import assert from 'node:assert/strict';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The walking world, as plain data: { map, x, y, mode, target }. */
export const world = (page) => page.evaluate(() => {
  const w = document.querySelector('.of-world')?.__world;
  return w ? { map: w.map.id, x: w.player.x, y: w.player.y, mode: w.mode, target: w.target ? { kind: w.target.kind, id: w.target.id } : null } : null;
});

/** Waits until the walking world is on `mapId`. */
export const onMap = (page, mapId, timeout = 8000) => page.waitForFunction((id) => document.querySelector('.of-world')?.__world?.map.id === id, mapId, { timeout });

/** Walks to a world point with held arrow keys, steering every 70 ms. */
export async function walkTo(page, x, y, { near = 26, tries = 200 } = {}) {
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

/** Walks until `kind:id` is the thing in reach (npc, station, mine, range, puzzle, ...). via: waypoints first. */
export async function walkToInteract(page, kind, id, via = []) {
  for (const [x, y] of via) await walkTo(page, x, y, { near: 30 });
  const spot = await page.evaluate(([kind, id]) => {
    const w = document.querySelector('.of-world').__world;
    if (kind === 'npc') { const n = w.npcAt?.(id) || w.map.npcs.find((x) => x.id === id); return n ? { x: n.x, y: n.y, reach: 60 } : null; }
    const it = w.map.interacts.find((i) => i.kind === kind && i.id === id);
    return it ? { x: it.x, y: it.y, reach: it.reach || 60 } : null;
  }, [kind, id]);
  assert.ok(spot, `${kind} ${id} on this map`);
  // Try the sides in turn (below, right, left, above, then the corners), each at a
  // little under its reach, until the thing is in reach.
  const r = Math.max(40, Math.min(spot.reach * 0.75, 140));
  const sides = [[0, 1], [1, 0], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  for (const [sx, sy] of sides) {
    const now = kind === 'npc' ? await page.evaluate((id) => document.querySelector('.of-world').__world.npcAt?.(id), id) : null;
    const cx = now?.x ?? spot.x, cy = now?.y ?? spot.y;
    let w = await walkTo(page, cx + sx * r, cy + sy * r, { near: 18, tries: 90 });
    if (w.target?.kind === kind && w.target?.id === id) return w;
    for (let i = 0; i < 4; i++) {
      w = await walkTo(page, cx + sx * r * 0.5, cy + sy * r * 0.5, { near: 10, tries: 8 });
      if (w.target?.kind === kind && w.target?.id === id) return w;
    }
  }
  const w = await world(page);
  assert.fail(`could not reach ${kind} ${id}: at ${Math.round(w.x)},${Math.round(w.y)} on ${w.map}, target ${JSON.stringify(w.target)}`);
}

/** Walks through a door (by id) on the current map. */
export async function walkThroughDoor(page, doorId, toMap) {
  const d = await page.evaluate((id) => { const d = document.querySelector('.of-world').__world.map.doors.find((x) => x.id === id); return d ? { x: d.x + d.w / 2, y: d.y + d.h / 2, w: d.w, h: d.h } : null; }, doorId);
  assert.ok(d, `door ${doorId}`);
  const side = await world(page);
  // Line up square to the door, then step into it.
  const vertical = d.w >= d.h;
  const ax = vertical ? d.x : (side.x < d.x ? d.x - 60 : d.x + 60);
  const ay = vertical ? (side.y < d.y ? d.y - 60 : d.y + 60) : d.y;
  await walkTo(page, ax, ay, { near: 20 });
  await walkTo(page, d.x, d.y, { near: 4, tries: 40 });
  if (toMap) await onMap(page, toMap);
  await sleep(400);
}

export async function playMining(page) {
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
  await page.waitForFunction(() => !document.querySelector('.of-mine') || document.querySelector('.of-mine').__state.done, null, { timeout: 30000 });
  await sleep(400);
  if (await page.locator('.of-mine').count()) await page.keyboard.press('Enter');
  await page.waitForSelector('.of-mine', { state: 'detached', timeout: 5000 });
}

export async function playRange(page, shot = async () => {}) {
  await page.waitForFunction(() => document.querySelector('.of-world').__world.mode === 'fight');
  await sleep(300);
  const box = await page.locator('.of-world canvas').boundingBox();
  let downNow = false;
  for (let i = 0; i < 500; i++) {
    const aim = await page.evaluate(() => {
      const w = document.querySelector('.of-world').__world;
      const f = w.fightState;
      if (!f || f.ended) return null;
      const e = f.enemies.filter((x) => x.alive).sort((a, b) => Math.hypot(a.x - f.player.x, a.y - f.player.y) - Math.hypot(b.x - f.player.x, b.y - f.player.y))[0];
      return e ? w.screenOf(e.x, e.y) : null;
    });
    if (!aim) break;
    await page.mouse.move(box.x + aim.x, box.y + aim.y);
    if (!downNow) { await page.mouse.down(); downNow = true; }
    if (i === 25) await shot();
    await sleep(40);
  }
  if (downNow) await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.of-world').__world.mode === 'walk', null, { timeout: 8000 });
}

export async function playLockbox(page, shot = async () => {}) {
  await page.waitForSelector('.of-puzzle', { timeout: 5000 });
  const plan = await page.evaluate(() => document.querySelector('.of-puzzle').__state.tiles.map((t, i) => {
    let m = t.mask, n = 0;
    while (t.line && !t.fixed && m !== t.solved && n < 4) { m = ((m << 1) | (m >> 3)) & 15; n++; }
    return [i, n];
  }).filter(([, n]) => n));
  for (const [i, n] of plan) for (let k = 0; k < n; k++) { await page.locator(`.of-puzzle .of-tile[data-i="${i}"]`).click(); await sleep(60); }
  await shot();
  await page.locator('.of-puzzle button', { hasText: 'Continue' }).click();
}

const DEST = { dustfall: [99, 81.4], alpha: [21.6, 72.6], beacon: [61.2, 33], home: [10, 98] };

/** Flies the open hop to its destination with held arrow keys. */
export async function flyHop(page, shot = async () => {}) {
  await page.waitForSelector('.of-hop', { timeout: 8000 });
  const held = new Set();
  const hold = async (keys) => {
    for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  for (let i = 0; i < 1500; i++) {
    const h = await page.evaluate((dest) => {
      const el = document.querySelector('.of-hop'); if (!el) return null;
      const hop = el.__hop, s = hop.ship;
      const d = dest[hop.to] || [hop.target?.x ?? 0, hop.target?.y ?? 0];
      return { arrived: hop.arrived, docking: hop.docking, x: s.x, y: s.y, a: s.angle, v: Math.hypot(s.vx, s.vy), d: hop.distance, dx: d[0] - s.x, dy: d[1] - s.y };
    }, DEST);
    if (!h || h.arrived || h.docking) break;
    const want = Math.atan2(h.dy, h.dx);
    const diff = Math.atan2(Math.sin(want - h.a), Math.cos(want - h.a));
    const keys = [];
    if (diff > 0.12) keys.push('ArrowRight'); else if (diff < -0.12) keys.push('ArrowLeft');
    if (Math.abs(diff) < 0.6 && h.v < Math.max(4, h.d * 0.8)) keys.push('ArrowUp');
    if (h.v > h.d * 1.3 + 2) keys.push('ArrowDown');
    await hold(keys);
    if (i === 40) await shot();
    await sleep(40);
  }
  await hold([]);
  await page.waitForSelector('.of-hop', { state: 'detached', timeout: 15000 });
}

// All codes of `length` distinct symbols out of `symbols`, and the lock's scoring (the job board's cipher).
function codes(length, symbols) {
  const out = [];
  const walk = (prefix) => {
    if (prefix.length === length) { out.push(prefix); return; }
    for (let s = 0; s < symbols; s++) if (!prefix.includes(s)) walk([...prefix, s]);
  };
  walk([]);
  return out;
}
function score(code, guess) {
  let exact = 0, shared = 0;
  guess.forEach((s, i) => { if (code[i] === s) exact++; if (code.includes(s)) shared++; });
  return { exact, near: shared - exact };
}

/** Plays the job running in the Jobs pane to its end screen, reading only the page. */
export async function playJob(page) {
  const pane = page.locator('#pane-jobs');
  const seen = new Set();
  let candidates = null;
  for (let step = 0; step < 240; step++) {
    const text = await pane.innerText();
    if (/JOB DONE|JOB FAILED/.test(text)) return { text, seen: [...seen] };
    if (await pane.locator('.qs-cipher').count()) {
      seen.add('cipher');
      const symbols = await pane.locator('.qs-pad button').count();
      const length = await pane.locator('.qs-slot').count();
      candidates ??= codes(length, symbols);
      const glyph = (await pane.locator('.qs-pad button').allInnerTexts()).map((t) => t.split(' ')[0]);
      for (const line of await pane.locator('.qs-guesses li').allInnerTexts()) {
        const [codePart, feedback] = line.split(/\s{2,}/);
        const guess = codePart.trim().split(' ').map((g) => glyph.indexOf(g));
        const [, exact, near] = feedback.match(/(\d) in place, (\d) elsewhere/).map(Number);
        candidates = candidates.filter((c) => { const s = score(c, guess); return s.exact === exact && s.near === near; });
      }
      const slots = await pane.locator('.qs-slot').evaluateAll((els) => els.map((e) => (e.classList.contains('is-known') ? e.textContent : null)));
      slots.forEach((g, i) => { if (g) candidates = candidates.filter((c) => c[i] === glyph.indexOf(g)); });
      for (const s of candidates[0]) await page.keyboard.press(String(s + 1));
      await page.keyboard.press('Enter');
      continue;
    }
    if (await pane.locator('.qs-fight').count()) { seen.add('fight'); await page.keyboard.press('f'); continue; }
    if (await pane.locator('.qs-race').count()) { seen.add('race'); await pane.locator('.qs-race .qs-moves button').last().click(); continue; }
    if (await pane.locator('.qs-foot .qs-moves button').count()) { seen.add('foot'); await pane.locator('.qs-foot .qs-moves button').first().click(); continue; }
    const enabled = pane.locator('.qs-choices button:not([disabled])');
    if (await enabled.count()) {
      if (await pane.locator('.qs-map').count()) seen.add('travel');
      if (await pane.locator('.qs-event').count()) seen.add('event');
      const labels = await enabled.allInnerTexts();
      // Never hand the cargo over; take sure things over rolls.
      const sure = labels.findIndex((l) => /Vent two scrap/.test(l));
      const pick = sure >= 0 ? sure : labels.findIndex((l) => !/Take it\.|hand the core|Pay the/i.test(l));
      await enabled.nth(Math.max(0, pick)).click();
      continue;
    }
    const primary = pane.locator('button.primary');
    if (await primary.count()) { await primary.first().click(); continue; }
    const any = pane.locator('.qs-moves button:not([disabled])');
    if (await any.count()) { await any.first().click(); continue; }
    throw new Error(`Stuck at: ${text.slice(0, 300)}`);
  }
  throw new Error('The job did not end in 240 steps');
}
