// Opening track A, outcome 6: the object screens' state (engine core, gun feed, nav console, drinks). Pure tests: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineState, gunState, courseState, DRINKS } from '../projects/Space-Shooter/voyage/slice/objectState.js';
import { STAND_IN } from '../projects/Space-Shooter/voyage/onfoot/standInLines.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { SCREENS } from '../projects/Space-Shooter/voyage/onfoot/objects/index.js';
import { STATUS_DEFS, createStatuses } from '../projects/Space-Shooter/voyage/status.js';

const slice = { flags: { 'slice-started': 1 }, quests: { active: {}, done: {} } };
const withDone = (...ids) => ({ ...slice, quests: { active: {}, done: Object.fromEntries(ids.map((i) => [i, { result: 'success' }])) } });


// ---- 6. the object screens' state ---------------------------------------------------------------------------------------------

test('engine core: bars and what is wrong follow the story flags', () => {
  const fine = engineState({});
  assert.equal(fine.status, 'RUNNING');
  assert.deepEqual(fine.problems, []);
  assert.deepEqual(fine.bars.map((b) => b.id), ['output', 'heat', 'coolant']);
  const leak = engineState({ 'coolant-leaking': 1 });
  assert.deepEqual(leak.problems.map((p) => p.id), ['coolant']);
  assert.ok(leak.bars.find((b) => b.id === 'coolant').value < fine.bars.find((b) => b.id === 'coolant').value);
  assert.ok(leak.bars.find((b) => b.id === 'heat').value > fine.bars.find((b) => b.id === 'heat').value, 'less coolant runs hotter');
  assert.equal(engineState({ 'coolant-leaking': 1, 'coolant-fixed': 1 }).problems.length, 0);
  const busted = engineState({ 'duchess-busted': 1 });
  assert.equal(busted.status, 'DEAD');
  assert.equal(busted.bars[0].value, 0);
  assert.deepEqual(busted.problems.map((p) => p.id).sort(), ['conduit', 'coolant', 'hull', 'reactor']);
  const mended = engineState({ 'duchess-busted': 1, 'reactor-fixed': 1, 'power-fixed': 1, 'coolant-fixed': 1, 'hull-patched': 1 });
  assert.equal(mended.problems.length, 0);
  for (const s of [fine, leak, busted, mended]) for (const b of s.bars) assert.ok(b.value >= 0 && b.value <= 100);
});

test('gun feed: guns, their status and the tracking mode come from the flags', () => {
  const g0 = gunState({});
  assert.equal(g0.guns[0].status, 'READY');
  assert.equal(g0.tracking, 'manual');
  assert.equal(gunState({ 'duchess-guns-auto': 1 }).tracking, 'auto');
  const dead = gunState({ 'reck-down': 1 });
  assert.equal(dead.guns[0].status, 'DAMAGED');
  assert.ok(dead.guns.find((g) => g.id === 'rifle' && !g.equipped), "Reck's rifle lies on the deck");
  assert.equal(gunState({ 'reck-down': 1, 'turret-repaired': 1 }).guns[0].status, 'READY');
  assert.equal(gunState({ 'reck-down': 1, 'reck-rifle-taken': 1 }).guns.find((g) => g.id === 'rifle').status, 'IN HAND');
  for (const g of dead.guns) assert.ok(g.ammo >= 0 && g.ammo <= 100);
});

test('nav console: the star map lists the sectors and plotting a course is locked with its reason until you are authorised', () => {
  const c = courseState(slice);
  assert.equal(c.authorised, false);
  assert.equal(c.reason, "Pilot's console: authorised crew only.");
  assert.deepEqual(c.places.map((p) => p.id).sort(), ['alpha', 'beacon', 'dustfall']);
  assert.ok(c.home && c.pois.length >= 3);
  const captain = courseState(withDone('day-five'));
  assert.equal(captain.authorised, true);
  assert.equal(captain.reason, null);
  assert.equal(courseState({ flags: {} }).authorised, true, 'outside the opening a licensed captain may');
});

test('drinks: coffee is the Wired cup, tea is the quiet one', () => {
  assert.equal(DRINKS.coffee.status, 'wired');
  assert.ok(DRINKS.tea && DRINKS.tea.item === 'tea');
});

test('status: tea is Steady (colour only), every status reports its total so the HUD can draw a draining bar', () => {
  assert.equal(STATUS_DEFS.steady.speed, 1);
  let t = 0;
  const s = createStatuses({ now: () => t });
  s.add('wired');
  s.add('steady');
  const on = s.active();
  assert.deepEqual(on.map((x) => x.id).sort(), ['steady', 'wired']);
  for (const x of on) assert.ok(x.total > 0 && x.left <= x.total);
  assert.equal(s.speedMult(), 1.05, 'tea does not slow you down or speed you up');
  t = on[0].total + 1;
  assert.equal(s.active().length, 0);
});

test('objects: every console and repair point on the Tin Duchess has a screen or its own line, never the stock "Lights blink" line', () => {
  // The holodeck's gym console and supply cart belong to the scene 1 hands-on track; every other interact in the Duchess is covered here.
  const OTHER_TRACK = new Set(['holo-console', 'supply-closet', 'valve', 'coolant', 'power', 'hull', 'crew-board', 'coffee']);
  const missing = [];
  for (const id of ['duchess-airlock', 'duchess-bridge', 'duchess-cargo', 'duchess-corridor', 'duchess-engine', 'duchess-holodeck', 'duchess-mess', 'duchess-pad', 'duchess-quarters']) {
    for (const p of MAP_DEFS[id].props || []) {
      const it = p.interact;
      if (!it || !['console', 'repair'].includes(it.kind) || OTHER_TRACK.has(it.id) || it.task) continue; // an interact with a hands-on task is played by slice/handsOn (track C)
      if (!SCREENS[`${it.kind}:${it.id}`] && !STAND_IN[it.id]) missing.push(`${id}/${it.id}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(SCREENS).sort(), ['console:coffee', 'console:engine-console', 'console:nav-console', 'repair:engine', 'repair:guns']);
});
