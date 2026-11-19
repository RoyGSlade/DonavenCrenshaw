// Launch polish lane (2026-11-18): four small fixes to approved work, new-game paths only.
//   1. phone: the dialogue box never covers the speaker (opt-in browser test below, plus the camera rule's source check)
//   2. no spawn point sits on a crew member (the holodeck door had Nessa one tile away)
//   3. a paid race's intro banner names the track and says it is a paid race
//   4. the turned phone arena draws its map labels upright; today's Dogfight draws them exactly as before
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadPlaywright, startServer, PHONE } from '../scripts/stardust-test-kit.mjs';
import { raceKicker } from '../projects/Space-Shooter/ui/raceIntro.js';
import { drawTerrain } from '../projects/Space-Shooter/dogfight/terrainView.js';
import { ACTIVITY_PAY } from '../projects/Space-Shooter/voyage/races/data.js';
import { createArena } from '../projects/Space-Shooter/dogfight/maps.js';

const maps = new URL('../projects/Space-Shooter/voyage/maps/', import.meta.url).pathname;

test('polish: every spawn point is at least two tiles from every crew member', () => {
  const bad = [];
  for (const f of readdirSync(maps).filter((n) => n.endsWith('.json'))) {
    const m = JSON.parse(readFileSync(path.join(maps, f), 'utf8'));
    for (const [name, sp] of Object.entries(m.spawns || {})) {
      for (const n of m.npcs || []) {
        const d = Math.hypot(sp[0] - n.at[0], sp[1] - n.at[1]) - (n.wander || 0);
        if (d < 2) bad.push(`${m.id}/${name} next to ${n.id} (${d.toFixed(2)} tiles)`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('polish: the holodeck arrival has room (the door spawn and Nessa)', () => {
  const m = JSON.parse(readFileSync(path.join(maps, 'duchess-holodeck.json'), 'utf8'));
  const sp = m.spawns['from-corridor'], nessa = m.npcs.find((n) => n.id === 'nessa');
  assert.ok(Math.hypot(sp[0] - nessa.at[0], sp[1] - nessa.at[1]) >= 2);
});

test('polish: the race banner says it is a paid race and what it pays', () => {
  const scene = { questRace: true, levelInfo: { title: 'Gantry Drop' } };
  const pay = (id) => ACTIVITY_PAY[`race-${id}`];
  assert.equal(raceKicker(scene, { kind: 'circuit', paid: true, pay: pay('gantry-drop') }), 'PAID RACE · PAYS 60');
  assert.equal(raceKicker(scene, { kind: 'circuit', paid: true, pay: pay('abandoned-mall') }), 'PAID RACE · PAYS 80');
  assert.equal(raceKicker(scene, { kind: 'circuit', paid: true }), 'PAID RACE');
  assert.doesNotMatch(raceKicker(scene, { kind: 'circuit', paid: true, pay: pay('gantry-drop') }), /GANTRY/, 'the big title already names the track');
  // practice and quest races read as before
  assert.equal(raceKicker(scene, { kind: 'circuit' }), 'PRACTICE CIRCUIT · THE HANGAR');
  assert.equal(raceKicker(scene, { kind: 'quest' }), 'QUEST RACE · OFF THE BOOKS');
  // today's racing page: no quest race, no change
  assert.equal(raceKicker({ weekly: { week: 7 } }, null), 'WEEKLY TIME TRIAL · WEEK 7');
});

// A recording canvas context: tracks the rotation in force when each label is drawn.
function recorder() {
  const stack = []; let angle = 0; const texts = []; let getT = 0;
  const grad = { addColorStop() {} };
  const c = new Proxy({}, {
    get(_, k) {
      if (k === 'save') return () => stack.push(angle);
      if (k === 'restore') return () => { angle = stack.pop(); };
      if (k === 'rotate') return (a) => { angle += a; };
      if (k === 'getTransform') return () => { getT++; return { angle }; };
      if (k === 'setTransform') return (m) => { angle = m.angle; };
      if (k === 'fillText') return (t) => texts.push({ t, angle });
      if (k === 'createRadialGradient') return () => grad;
      return () => {};
    },
    set() { return true; },
  });
  return { c, texts, getT: () => getT, turn: (a) => { angle += a; } };
}

test('polish: the turned phone arena draws every map label upright', () => {
  for (const id of ['stormworks', 'shatterbelt']) {
    const r = recorder();
    r.turn(Math.PI / 2); // the phone layout turns the whole arena
    drawTerrain(r.c, createArena(id), null, { labelRotation: -Math.PI / 2, labelScale: 2 });
    assert.ok(r.texts.length >= 2, `${id} has labels`);
    for (const t of r.texts) assert.ok(Math.abs(t.angle) < 1e-9, `${id} "${t.t}" is upright (rotation ${t.angle})`);
  }
  const names = new Set();
  const r = recorder(); r.turn(Math.PI / 2);
  drawTerrain(r.c, createArena('stormworks'), null, { labelRotation: -Math.PI / 2 });
  r.texts.forEach((t) => names.add(t.t));
  for (const want of ['FUEL', 'VENT / SAFE', 'BOOST STREAM']) assert.ok(names.has(want), `${want} is drawn`);
});

test('polish: today\'s Dogfight and the thumbnails draw labels exactly as before (no turn, no deferral)', () => {
  const r = recorder();
  drawTerrain(r.c, createArena('stormworks'), null, {});
  assert.equal(r.getT(), 0, 'nothing is queued or re-transformed');
  for (const t of r.texts) assert.equal(t.angle, 0);
  assert.ok(r.texts.length >= 3);
});

test('polish: the phone camera slides the view for the speaker, phone layout only', () => {
  const src = readFileSync(new URL('../projects/Space-Shooter/voyage/onfoot/world.js', import.meta.url), 'utf8');
  assert.match(src, /function speakerClear/);
  assert.match(src, /matchMedia\('\(max-width:700px\)'\)/);
  assert.match(src, /mode === 'walk'[\s\S]{0,160}speakerClear\(cam, dt\)/);
});

const skip = !process.env.STARDUST_POLISH_BROWSER_TEST;
test('polish (browser): at 390 the speaker is never under the dialogue box in the mess brief', { skip, timeout: 120000 }, async (t) => {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ ...PHONE });
  const page = await context.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('stardust.voyage.controls.v1', '1'); } catch {} });
  await page.goto(`${server.origin}/projects/Space-Shooter/voyage/?newgame=1`);
  await page.waitForFunction(() => window.__stardust?.onfoot?.world);
  await page.waitForSelector('#hg-dialogue:not([hidden]) .ui-dlg-choice', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const w = window.__stardust.onfoot.world;
    const box = document.querySelector('#hg-dialogue').getBoundingClientRect();
    const tull = w.npcAt('tull'), s = w.screenOf(tull.x, tull.y);
    return { speaker: document.querySelector('#hg-dialogue .ui-dlg-portrait').dataset.speaker, boxBottom: box.bottom, head: s.y - 34 };
  });
  assert.equal(r.speaker, 'tull');
  assert.ok(r.head >= r.boxBottom, `Tull's head (${r.head}) is below the box (${r.boxBottom})`);
});
