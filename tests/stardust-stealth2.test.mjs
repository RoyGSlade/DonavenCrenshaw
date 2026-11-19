// Real-time stealth on foot (launch stealth2 lane): live view cones clipped by walls and props, fog of war, detection meters
// (1.5 s in a cone: that guard inspects your spot; 3 s: every guard is alerted), noise from running vs sneaking, silent
// takedowns from behind an unaware guard, and the stealth points mapped onto noise, cones and meter drain.
// Pure rules here (rules/stealth.js) plus the patrol yard map and its workbench entry; the page is in stardust-stealth2-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runtimeConfig } from '../projects/Space-Shooter/runtime-config.js';
import { compileMap, checkMaps, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { setupStealth } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { CATEGORIES } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { STEALTH, liveTuning, clearWalk, hasLos, castRay, viewPolygon, pointInPolygon, polygonArea, coneSees, findPath, createStealth, takedownOf } from '../projects/Space-Shooter/voyage/onfoot/rules/stealth.js';
import { planStealthRoute, routeAt } from '../scripts/stardust-stealth-plan.mjs';
import { WORKBENCH_DEF } from '../projects/Space-Shooter/voyage/workbench/map.js';
import { YARD_DEF, YARD_ID, yardXp, yardSaid } from '../projects/Space-Shooter/voyage/workbench/yard.js';

const T = 48;
const px = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
/** A test room: an open floor `w` x `h` tiles with a wall ring, plus extra props / wall tiles and a stealth block. */
function room({ w = 24, h = 12, walls = [], props = [], guards = [] } = {}) {
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 || walls.some(([wx, wy]) => wx === x && wy === y) ? '#' : '.')).join(''));
  return compileMap({ id: 'stealth-test', name: 'Test', tile: T, grid, props, spawns: { default: [1, 1, 'right'] }, stealth: { guards } });
}
const crate = (x, y) => ({ art: 'cargo-crate', at: [x, y], size: [1, 1], block: 'low' });
const still = (id, x, y, face) => ({ id, path: [[x, y]], face });
const me = (tx, ty, gait = 'sneak', moving = false, dx = 0, dy = 0) => ({ ...px(tx, ty), x: px(tx, ty).x + dx, y: px(tx, ty).y + dy, gait, moving });
function run(sim, player, seconds, dt = 0.1) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) events.push(...sim.step(dt, typeof player === 'function' ? player(i * dt) : player));
  return events;
}
const types = (events, type) => events.filter((e) => e.type === type);

// ---- the numbers ---------------------------------------------------------------------------------------------------------
test('the timings are Donaven\'s: 1.5 s inspects, 3 s alerts everyone', () => {
  assert.equal(STEALTH.inspectAt, 1.5);
  assert.equal(STEALTH.alertAt, 3);
});

test('points: quiet, range and decay map onto noise, cone length and angle, and meter drain; no d20, no tier', () => {
  const base = liveTuning();
  assert.equal(base.coneTiles, STEALTH.coneTiles);
  assert.ok(base.noise.sneak < base.noise.walk && base.noise.walk < base.noise.run, 'sneak is quieter than walk, walk quieter than run');
  for (let n = 1; n <= 9; n++) {
    const q = setupStealth({ points: { quiet: n }, level: 9 }), r = setupStealth({ points: { range: n }, level: 9 }), d = setupStealth({ points: { decay: n }, level: 9 });
    const a = liveTuning({ points: { quiet: n }, level: 9 }), b = liveTuning({ points: { range: n }, level: 9 }), c = liveTuning({ points: { decay: n }, level: 9 });
    assert.ok(Math.abs(a.noise.run - base.noise.run * q.noiseFactor) < 1e-9, `quiet ${n} scales every noise radius by the shadow slip factor`);
    assert.ok(Math.abs(a.noise.walk - base.noise.walk * q.noiseFactor) < 1e-9);
    assert.ok(Math.abs(b.coneTiles - base.coneTiles * r.rangeFactor) < 1e-9, `range ${n} shortens the cone`);
    assert.ok(b.half < base.half && b.half >= base.half * 0.7, 'and narrows it a little, never to a sliver');
    assert.ok(Math.abs(c.drain - base.drain * (d.decay / 8)) < 1e-9, `decay ${n} drains the meter faster`);
  }
  assert.deepEqual(liveTuning({ points: { quiet: 3 }, level: 9, tier: 2 }), liveTuning({ points: { quiet: 3 }, level: 9, tier: -2 }), 'the d20 tier is ignored in live stealth');
});

test('the picker words say live stealth is pure play (no d20) and give the live numbers', () => {
  const words = CATEGORIES.stealth.cats.map((c) => c.words(5)).join(' | ');
  assert.match(words, /live/i);
  assert.match(CATEGORIES.stealth.note, /d20/i);
  assert.match(CATEGORIES.stealth.note, /pure play|like shooting/i);
});

// ---- line of sight and the view cone ---------------------------------------------------------------------------------------
test('line of sight: walls and props block it, open floor does not, a low crate counts as a prop', () => {
  const open = room();
  assert.equal(hasLos(open.solids, ...[px(2, 5).x, px(2, 5).y, px(10, 5).x, px(10, 5).y]), true);
  const wall = room({ walls: [[6, 4], [6, 5], [6, 6]] });
  assert.equal(hasLos(wall.solids, px(2, 5).x, px(2, 5).y, px(10, 5).x, px(10, 5).y), false, 'a wall between');
  assert.equal(hasLos(wall.solids, px(2, 2).x, px(2, 2).y, px(10, 2).x, px(10, 2).y), true, 'over the wall\'s end');
  const withCrate = room({ props: [crate(6, 5)] });
  assert.equal(hasLos(withCrate.solids, px(2, 5).x, px(2, 5).y, px(10, 5).x, px(10, 5).y), false, 'a crate between blocks it');
  assert.equal(hasLos(withCrate.solids, px(2, 3).x, px(2, 3).y, px(10, 3).x, px(10, 3).y), true, 'a row above the crate is clear');
});

test('castRay stops at the first thing it hits', () => {
  const m = room({ props: [crate(8, 5)] });
  const o = px(2, 5);
  const len = castRay(m.solids, o.x, o.y, 0, 600);
  assert.ok(Math.abs(len - (8 * T - o.x)) < 0.5, `hit the crate's near face (${len})`);
  assert.equal(castRay(m.solids, o.x, o.y, 0, 100), 100, 'short rays are not stopped by faraway things');
});

test('the view cone is clipped by a crate: a shadow behind it, light beside it', () => {
  const m = room({ props: [crate(6, 5)] });
  const g = px(2, 5);
  const poly = viewPolygon(m.solids, g.x, g.y, { angle: 0, half: 0.6, radius: 8 * T });
  const open = viewPolygon(room().solids, g.x, g.y, { angle: 0, half: 0.6, radius: 8 * T });
  assert.ok(polygonArea(poly) < polygonArea(open) * 0.93, 'the crate removes part of the cone');
  const behind = px(8, 5), beside = px(8, 7);
  assert.equal(pointInPolygon(poly, behind.x, behind.y), false, 'straight behind the crate is in its shadow');
  assert.equal(pointInPolygon(open, behind.x, behind.y), true);
  assert.equal(pointInPolygon(poly, beside.x, beside.y), true, 'beside it is seen');
  assert.equal(pointInPolygon(poly, px(1, 5).x, px(1, 5).y), false, 'behind the guard is outside the cone');
  for (const p of poly) assert.ok(Math.hypot(p.x - g.x, p.y - g.y) <= 8 * T + 0.5, 'never past the cone length');
});

test('the cone is clipped by a wall too, and never reaches round a corner', () => {
  const m = room({ walls: [[5, 3], [5, 4], [5, 5], [5, 6]] });
  const g = px(2, 5);
  const poly = viewPolygon(m.solids, g.x, g.y, { angle: 0, half: 0.6, radius: 8 * T });
  assert.equal(pointInPolygon(poly, px(8, 5).x, px(8, 5).y), false);
  assert.equal(pointInPolygon(poly, px(4, 5).x, px(4, 5).y), true);
});

test('coneSees: in front and in range yes; behind, too far, too wide, or through a wall no', () => {
  const m = room({ walls: [[10, 4], [10, 5], [10, 6]] });
  const g = { ...px(2, 5), angle: 0 }, cone = { len: 6 * T, half: 0.6 };
  assert.equal(coneSees(m.solids, g, px(6, 5), cone), true);
  assert.equal(coneSees(m.solids, g, px(1, 5), cone), false, 'behind');
  assert.equal(coneSees(m.solids, g, px(9, 5), cone), false, 'too far (7 tiles)');
  assert.equal(coneSees(m.solids, g, px(5, 9), cone), false, 'outside the angle');
  assert.equal(coneSees(m.solids, { ...px(8, 5), angle: 0 }, px(12, 5), cone), false, 'through a wall');
});

test('findPath goes round walls and says null when sealed in', () => {
  const m = room({ walls: [[5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]] });
  const path = findPath(m, px(2, 5), px(8, 5));
  assert.ok(path && path.length >= 2, 'a detour round the end of the wall');
  assert.ok(path.some((p) => p.y > px(0, 8).y), 'it goes down past the wall\'s foot');
  assert.ok(path.every((p) => walkable(m, p.x, p.y, 14)));
  let at = px(2, 5); for (const p of path) { assert.ok(clearWalk(m.solids, at, p), 'every leg is a clear walk'); at = p; }
  const sealed = room({ walls: Array.from({ length: 10 }, (_, i) => [5, i + 1]) });
  assert.equal(findPath(sealed, px(2, 5), px(8, 5)), null);
});

// ---- the meters ------------------------------------------------------------------------------------------------------------
function watched() {
  const m = room({ guards: [still('g1', 2, 5, 'right'), still('g2', 20, 10, 'left')] });
  const sim = createStealth({ map: m });
  return { m, sim, player: me(8, 5) }; // 6 tiles... in the cone at 5.5 tiles from g1
}
test('1.5 s in a cone: that guard goes to inspect where you stand, the others stay calm', () => {
  const { m, sim } = watched();
  const p = me(6, 5); // 4 tiles in front of g1
  let ev = run(sim, p, 1.4);
  assert.equal(sim.guards[0].state, 'patrol', 'not yet at 1.4 s');
  assert.ok(Math.abs(sim.guards[0].meter - 1.4) < 1e-6);
  assert.equal(types(ev, 'inspect').length, 0);
  ev = run(sim, p, 0.1);
  assert.equal(sim.guards[0].state, 'inspect', 'at 1.5 s');
  const e = types(ev, 'inspect');
  assert.equal(e.length, 1); assert.equal(e[0].guard, 'g1');
  assert.ok(Math.hypot(e[0].at.x - p.x, e[0].at.y - p.y) < 1, 'it inspects your current spot');
  assert.equal(sim.guards[1].state, 'patrol');
  assert.equal(sim.alarm.on, false);
  assert.equal(sim.stats.inspects, 1);
});

test('3 s in a cone: every guard is alerted, once', () => {
  const { sim } = watched();
  const p = me(6, 5);
  const ev = run(sim, p, 2.9);
  assert.equal(sim.alarm.on, false, 'not at 2.9 s');
  const more = run(sim, p, 0.2);
  assert.equal(types(more, 'alarm').length, 1);
  assert.equal(sim.alarm.on, true);
  assert.ok(sim.guards.every((g) => g.state === 'alert'), 'all guards, even the far one that never saw you');
  assert.equal(types([...ev, ...more, ...run(sim, p, 0.3)], 'alarm').length, 1, 'one alarm, not one per step');
  assert.equal(sim.stats.alarms, 1);
});

test('out of the cone the meter drains slowly, and what drained is what you get back', () => {
  const m = room({ walls: [[5, 6]], guards: [still('g1', 2, 5, 'right')] });
  const sim = createStealth({ map: m });
  const seen = me(5, 5), hid = me(2, 9); // below and behind: out of the cone
  run(sim, seen, 1.0);
  assert.ok(Math.abs(sim.guards[0].meter - 1.0) < 1e-6);
  run(sim, hid, 1.0);
  const drained = sim.guards[0].meter;
  assert.ok(drained > 0.4 && drained < 0.9, `drains slowly (1.0 -> ${drained.toFixed(2)})`);
  run(sim, seen, 0.5);
  assert.equal(sim.guards[0].state, 'patrol', 'a second peek after a short rest still has not reached 1.5 s');
  run(sim, hid, 4);
  assert.equal(sim.guards[0].meter, 0, 'given time it goes to zero');
});

test('the decay points drain the meter faster', () => {
  const mk = (decay) => {
    const sim = createStealth({ map: room({ guards: [still('g1', 2, 5, 'right')] }), tuning: liveTuning({ points: { decay }, level: 9 }) });
    run(sim, me(5, 5), 1.2); run(sim, me(2, 9), 1.0);
    return sim.guards[0].meter;
  };
  assert.ok(mk(9) < mk(0) - 0.5, 'nine points of decay cools far faster');
});

test('the range points shorten the cone: a spot just inside the plain cone is outside the short one', () => {
  const m = room({ guards: [still('g1', 2, 5, 'right')] });
  const plain = createStealth({ map: m }), short = createStealth({ map: m, tuning: liveTuning({ points: { range: 9 }, level: 9 }) });
  const p = me(2, 5, 'sneak', false, STEALTH.coneTiles * T - 20, 0);
  run(plain, p, 1); run(short, p, 1);
  assert.ok(plain.guards[0].meter > 0.9);
  assert.equal(short.guards[0].meter, 0);
});

test('a crate between you and the guard keeps you hidden however long you stand there', () => {
  const m = room({ props: [crate(5, 5)], guards: [still('g1', 2, 5, 'right')] });
  const sim = createStealth({ map: m });
  run(sim, me(7, 5), 6);
  assert.equal(sim.guards[0].meter, 0);
  assert.equal(sim.stats.inspects, 0);
});

test('an inspecting guard walks to the spot, looks about, and goes back to its post when nothing is there', () => {
  const m = room({ guards: [{ ...still('g1', 2, 5, 'right') }] });
  const sim = createStealth({ map: m });
  run(sim, me(6, 5), 1.6);
  assert.equal(sim.guards[0].state, 'inspect');
  const away = me(2, 10);
  run(sim, away, 14);
  assert.equal(sim.guards[0].state, 'patrol', 'back on patrol');
  const home = px(2, 5);
  assert.ok(Math.hypot(sim.guards[0].x - home.x, sim.guards[0].y - home.y) < 4, 'back at its post');
});

// ---- noise -------------------------------------------------------------------------------------------------------------------
function listener() { // a guard facing away from the player, who stands to its right (east); the guard's cone points west
  const m = room({ guards: [still('g1', 10, 5, 'left')] });
  return { m, sim: createStealth({ map: m }) };
}
const heardAt = (tiles, gait, tuning) => {
  const m = room({ guards: [still('g1', 10, 5, 'left')] });
  const sim = createStealth({ map: m, tuning });
  const ev = sim.step(0.05, { ...px(10, 5), x: px(10, 5).x + tiles * T, gait, moving: true });
  return { heard: types(ev, 'heard').length > 0, state: sim.guards[0].state, sim };
};
test('noise: sneaking is nearly silent, walking carries a little, running carries far', () => {
  assert.equal(heardAt(2, 'sneak').heard, false, 'a sneak at 2 tiles is not heard');
  assert.equal(heardAt(0.5, 'sneak').heard, true, 'a sneak right behind a guard still is');
  assert.equal(heardAt(2, 'walk').heard, true);
  assert.equal(heardAt(3.5, 'walk').heard, false);
  assert.equal(heardAt(5, 'run').heard, true);
  assert.equal(heardAt(8, 'run').heard, false);
});

test('noise needs you to be moving: standing still on a run key is silent', () => {
  const { sim } = listener();
  const ev = sim.step(0.05, { ...px(10, 5), x: px(10, 5).x + 2 * T, gait: 'run', moving: false });
  assert.equal(types(ev, 'heard').length, 0);
});

test('a heard step turns the guard to look at the sound but fills no meter and starts no alarm', () => {
  const r = heardAt(2, 'run');
  assert.equal(r.state, 'look');
  const sim = r.sim; const g = sim.guards[0];
  run(sim, { ...px(10, 5), x: px(10, 5).x + 2 * T, gait: 'sneak', moving: false }, 0.5);
  assert.ok(Math.abs(Math.atan2(Math.sin(g.angle), Math.cos(g.angle))) < 0.5, 'now facing east, the sound');
  assert.equal(sim.alarm.on, false);
  assert.equal(sim.stats.inspects, 0);
});

test('the quiet points shrink the noise radius', () => {
  assert.equal(heardAt(3, 'run', liveTuning({ points: { quiet: 9 }, level: 9 })).heard, false);
  assert.equal(heardAt(3, 'run').heard, true);
});

test('noise is muffled by walls: the same step behind a wall is not heard at the edge of its radius', () => {
  const m = room({ walls: [[11, 3], [11, 4], [11, 5], [11, 6], [11, 7]], guards: [still('g1', 10, 5, 'left')] });
  const sim = createStealth({ map: m });
  const ev = sim.step(0.05, { ...px(10, 5), x: px(10, 5).x + 4.5 * T, gait: 'run', moving: true });
  assert.equal(types(ev, 'heard').length, 0);
});

// ---- takedowns ---------------------------------------------------------------------------------------------------------------
function tdRoom(face = 'right', extra = {}) {
  const m = room({ guards: [still('g1', 10, 5, face), ...(extra.guards || [])], walls: extra.walls || [], props: extra.props || [] });
  return { m, sim: createStealth({ map: m }), g: px(10, 5) };
}
test('takedown: only from behind an unaware guard, in reach', () => {
  const { sim, g } = tdRoom('right');
  const at = (dx, dy) => ({ x: g.x + dx, y: g.y + dy, gait: 'sneak', moving: false });
  assert.equal(sim.canTakedown(at(-36, 0))?.id, 'g1', 'right behind');
  assert.equal(sim.canTakedown(at(-36, 18))?.id, 'g1', 'behind and a little off');
  assert.equal(sim.canTakedown(at(40, 0)), null, 'in front');
  assert.equal(sim.canTakedown(at(0, 40)), null, 'at its side');
  assert.equal(sim.canTakedown(at(-120, 0)), null, 'too far');
});

test('takedown: not through a wall, not once it is on to you', () => {
  const { sim, g } = tdRoom('right', { walls: [] });
  const behind = { x: g.x - 36, y: g.y, gait: 'sneak', moving: false };
  sim.guards[0].state = 'alert';
  assert.equal(sim.canTakedown(behind), null, 'an alerted guard cannot be taken down');
  sim.guards[0].state = 'inspect';
  assert.equal(sim.canTakedown(behind), null, 'nor one who is inspecting');
  sim.guards[0].state = 'look';
  assert.equal(sim.canTakedown(behind)?.id, 'g1', 'one looking at a sound is still unaware');
  assert.equal(takedownOf(sim.guards[0], behind, [{ x: g.x - 20, y: g.y - 30, w: 8, h: 60 }]), false, 'a wall between you');
});

test('a takedown is silent, leaves the body where it fell, and the guard stops seeing', () => {
  const { sim, g } = tdRoom('right', { guards: [still('g2', 12, 5, 'right')] });
  const behind = { x: g.x - 36, y: g.y, gait: 'sneak', moving: false };
  assert.equal(sim.takedown('g1', behind), true);
  const gd = sim.guards[0];
  assert.equal(gd.state, 'down');
  assert.ok(Math.hypot(gd.x - g.x, gd.y - g.y) < 1, 'the body stays');
  assert.equal(sim.stats.takedowns, 1);
  const ev = run(sim, behind, 1);
  assert.equal(types(ev, 'heard').length, 0, 'no noise');
  assert.equal(sim.guards[1].state, 'patrol', 'a guard 2 tiles away that was facing away never turned');
  assert.equal(sim.canTakedown(behind), null, 'it is not a target twice');
  assert.equal(sim.takedown('g1', behind), false);
  // a downed guard has no cone
  const front = { x: g.x + 100, y: g.y, gait: 'sneak', moving: false };
  run(sim, front, 4);
  assert.equal(gd.meter, 0);
});

test('a body in another guard\'s cone is found: that guard inspects it, and reaching it raises the alarm', () => {
  const m = room({ guards: [still('a', 9, 5, 'right'), still('b', 14, 5, 'left')] });
  const sim = createStealth({ map: m });
  const bpos = px(14, 5);
  assert.equal(sim.takedown('b', { x: bpos.x + 36, y: bpos.y, gait: 'sneak', moving: false }), true);
  const away = me(14, 10);
  const ev = run(sim, away, 0.2);
  assert.equal(types(ev, 'body-found').length, 1);
  assert.equal(sim.guards[0].state, 'inspect');
  const later = run(sim, away, 8);
  assert.equal(types(later, 'alarm').length, 1, 'the guard reaches the body and shouts');
  assert.equal(sim.alarm.on, true);
  assert.equal(sim.guards[1].state, 'down', 'the downed guard stays down');
});

// ---- the alarm -----------------------------------------------------------------------------------------------------------------
test('alarm: guards converge on the spot, search, then stand down and return to their patrols', () => {
  const m = room({ guards: [still('g1', 3, 2, 'right'), still('g2', 20, 9, 'left')] });
  const sim = createStealth({ map: m });
  const far = me(1, 10);
  const spot = px(12, 5);
  sim.raiseAlarm(spot, 'test');
  assert.equal(sim.alarm.on, true);
  run(sim, far, 6);
  for (const g of sim.guards) assert.ok(Math.hypot(g.x - spot.x, g.y - spot.y) < 3 * T, `${g.id} converged (${Math.round(Math.hypot(g.x - spot.x, g.y - spot.y))})`);
  const ev = run(sim, far, STEALTH.searchTime + 12);
  assert.equal(types(ev, 'stand-down').length, 1);
  assert.equal(sim.alarm.on, false);
  assert.ok(sim.guards.every((g) => g.state === 'patrol' && g.meter === 0), 'calm again');
});

test('an alerted guard that reaches you catches you', () => {
  const m = room({ guards: [still('g1', 3, 5, 'right')] });
  const sim = createStealth({ map: m });
  const p = me(8, 5);
  sim.raiseAlarm(p, 'test');
  const ev = run(sim, p, 8);
  assert.equal(types(ev, 'caught').length, 1);
  assert.equal(sim.stats.caught, 1);
});

test('reset puts the guards back and clears the alarm and the counts', () => {
  const m = room({ guards: [still('g1', 3, 5, 'right')] });
  const sim = createStealth({ map: m });
  sim.raiseAlarm(px(10, 5), 'x'); run(sim, me(1, 1), 3);
  sim.reset();
  assert.equal(sim.alarm.on, false);
  assert.deepEqual({ ...sim.stats }, { inspects: 0, alarms: 0, takedowns: 0, caught: 0, seen: 0, seconds: 0 });
  const g = sim.guards[0], home = px(3, 5);
  assert.ok(Math.hypot(g.x - home.x, g.y - home.y) < 1 && g.state === 'patrol');
});

test('patrols: a guard walks its path, turns round at the end and comes back, never past either end', () => {
  const m = room({ guards: [{ id: 'g1', path: [[3, 5], [9, 5]], mode: 'pingpong', pause: 0.5, face: 'right' }] });
  const sim = createStealth({ map: m });
  const far = me(1, 10), xs = [];
  for (let i = 0; i < 300; i++) { sim.step(0.1, far); xs.push(sim.guards[0].x); }
  assert.ok(xs[39] > px(3, 5).x + 100, 'walking east after 4 s');
  assert.ok(Math.max(...xs) <= px(9, 5).x + 2 && Math.min(...xs) >= px(3, 5).x - 2, 'never past the ends');
  assert.ok(xs[70] < xs[55], 'on the way back after the end');
  assert.ok(xs.indexOf(Math.max(...xs)) < 70, 'it reached the far end once');
  assert.ok(Math.abs(sim.guards[0].angle) < 3.2, 'angle stays wrapped');
});

// ---- fog of war -----------------------------------------------------------------------------------------------------------------
test('fog of war: you see what your character can see; enemies in the fog are hidden', () => {
  const m = room({ walls: [[8, 3], [8, 4], [8, 5], [8, 6], [8, 7]], props: [crate(4, 8)], guards: [still('near', 5, 5, 'left'), still('beyond', 12, 5, 'left'), still('far', 21, 2, 'left'), still('shadow', 4, 10, 'up')] });
  const sim = createStealth({ map: m });
  sim.step(0.05, me(3, 5));
  const vis = (g) => sim.isVisible(g.x, g.y);
  const byId = Object.fromEntries(sim.guards.map((g) => [g.id, g]));
  assert.equal(vis(byId.near), true, 'in the open, near');
  assert.equal(vis(byId.beyond), false, 'behind a wall');
  assert.equal(vis(byId.far), false, 'out of sight range');
  assert.equal(vis(byId.shadow), false, 'in a crate\'s shadow');
  assert.ok(sim.vision().length > 20, 'the sight polygon is exposed for drawing');
  assert.equal(pointInPolygon(sim.vision(), px(5, 5).x, px(5, 5).y), true);
  assert.equal(pointInPolygon(sim.vision(), px(12, 5).x, px(12, 5).y), false);
});

test('fog: the sight radius is a few tiles, not the whole room', () => {
  const sim = createStealth({ map: room({ w: 40 }) });
  sim.step(0.05, me(3, 5));
  assert.equal(sim.isVisible(px(3 + STEALTH.sightTiles - 1, 5).x, px(3, 5).y), true);
  assert.equal(sim.isVisible(px(3 + STEALTH.sightTiles + 2, 5).x, px(3, 5).y), false);
});

// ---- the patrol yard (the workbench annex) -------------------------------------------------------------------------------------
const YARD = compileMap(YARD_DEF);
const WB = compileMap(WORKBENCH_DEF);
test('yard: a map of its own that compiles, loads through checkMaps with the workbench, and has spawns and guards on open floor', () => {
  assert.equal(YARD_ID, 'workbench-yard');
  assert.deepEqual(checkMaps({ wb: WORKBENCH_DEF, yard: YARD_DEF }).problems, []);
  for (const s of Object.values(YARD.spawns)) assert.ok(walkable(YARD, s.x, s.y, 14), `spawn on floor`);
  const sim = createStealth({ map: YARD });
  assert.ok(sim.guards.length >= 2 && sim.guards.length <= 3, '2 or 3 guards');
  for (const g of sim.guards) assert.ok(walkable(YARD, g.x, g.y, 14), `${g.id} stands on floor`);
});

test('yard: the workbench has one door, into the yard, and the yard door leads back; nothing else reaches either', () => {
  assert.deepEqual(WB.doors.map((d) => d.to), [YARD_ID]);
  assert.deepEqual(YARD.doors.map((d) => d.to), ['workbench']);
  assert.ok(WB.spawns[YARD.doors[0].arrive], 'the way back arrives somewhere real');
  assert.ok(YARD.spawns[WB.doors[0].arrive]);
  for (const def of Object.values(MAP_DEFS)) { assert.equal(def.stealth, undefined, `${def.id} has no live stealth: today's game is untouched`); for (const d of def.doors || []) assert.notEqual(d.to, YARD_ID); }
  assert.equal(runtimeConfig.newGame, false, 'the new game stays off');
});

test('yard: cover to hide behind, a goal to reach, every patrol point on floor, and every patrol joined by a path', () => {
  assert.ok(YARD.props.filter((p) => p.block).length >= 6, 'cover props');
  const goal = YARD.interacts.find((i) => i.id === 'wb-yard-goal');
  assert.ok(goal && goal.kind === 'station');
  const start = YARD.spawns['from-bay'];
  assert.ok(findPath(YARD, start, goal), 'the goal can be reached on foot');
  for (const g of YARD_DEF.stealth.guards) for (const [x, y] of g.path) { const p = px(x, y); assert.ok(walkable(YARD, p.x, p.y, 14), `${g.id} waypoint ${x},${y}`); }
  for (const g of YARD_DEF.stealth.guards) for (let i = 1; i < g.path.length; i++) assert.ok(findPath(YARD, px(...g.path[i - 1]), px(...g.path[i])), `${g.id} leg ${i}`);
});

test('yard: a careful sneak from the door to the console, planned round the cones, gets there with no inspect and no alarm', () => {
  const goal = YARD.interacts.find((i) => i.id === 'wb-yard-goal');
  const to = { x: goal.x, y: goal.y + 40 };
  const route = planStealthRoute(YARD, { from: YARD.spawns['from-bay'], to });
  assert.ok(route, 'a route that no cone ever touches exists');
  assert.ok(route[route.length - 1].t < 90, `and it is not a marathon (${route[route.length - 1].t.toFixed(0)} s)`);
  const sim = createStealth({ map: YARD });
  const events = [];
  let last = route[0];
  for (let t = 0; t <= route[route.length - 1].t; t += 0.05) {
    const at = routeAt(route, t);
    events.push(...sim.step(0.05, { ...at, gait: 'sneak', moving: Math.hypot(at.x - last.x, at.y - last.y) > 0.1 }));
    last = at;
  }
  assert.equal(sim.stats.alarms, 0);
  assert.equal(sim.stats.inspects, 0);
  assert.equal(events.filter((e) => e.type === 'heard').length, 0, 'and no guard even heard a step');
  assert.ok(Math.hypot(last.x - to.x, last.y - to.y) < 30, 'at the console');
});

test('yard: running straight at the console gets you noticed', () => {
  const sim = createStealth({ map: YARD });
  const goal = YARD.interacts.find((i) => i.id === 'wb-yard-goal');
  const route = findPath(YARD, YARD.spawns['from-bay'], { x: goal.x, y: goal.y + 40 });
  const speed = STEALTH.speed.run, dt = 0.05, p = { ...YARD.spawns['from-bay'], gait: 'run', moving: true };
  let i = 0, alarmed = false; const events = [];
  for (let t = 0; t < 120 && i < route.length && !alarmed; t += dt) {
    const w = route[i], dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
    if (d <= speed * dt) { p.x = w.x; p.y = w.y; i++; } else { p.x += (dx / d) * speed * dt; p.y += (dy / d) * speed * dt; }
    events.push(...sim.step(dt, { ...p }));
    alarmed = sim.alarm.on;
  }
  assert.ok(events.some((e) => ['heard', 'inspect', 'alarm'].includes(e.type)), 'the runner is noticed: a guard hears, inspects or sounds the alarm');
});

test('yard: a patrolling guard can be reached from behind on open floor somewhere on its beat', () => {
  const sim = createStealth({ map: YARD });
  let found = false;
  for (let t = 0; t < 90 && !found; t += 0.25) {
    sim.step(0.25, { x: -9999, y: -9999, gait: 'sneak', moving: false });
    for (const g of sim.guards) {
      const back = { x: g.x - Math.cos(g.angle) * 38, y: g.y - Math.sin(g.angle) * 38 };
      if (walkable(YARD, back.x, back.y, 12) && takedownOf(g, { ...back, gait: 'sneak' }, YARD.solids)) found = true;
    }
  }
  assert.equal(found, true);
});

// ---- the XP and the words ----------------------------------------------------------------------------------------------------
test('yard XP is placeholder, capped at 10, and rewards the quiet way', () => {
  const base = { outcome: 'goal', inspects: 0, alarms: 0, takedowns: 0, caught: 0 };
  assert.equal(yardXp({ outcome: 'left' }), 0);
  assert.ok(yardXp(base) > yardXp({ ...base, inspects: 1 }) && yardXp({ ...base, inspects: 1 }) > yardXp({ ...base, inspects: 2, alarms: 1 }));
  assert.ok(yardXp({ ...base, takedowns: 3 }) <= 10 && yardXp({ ...base, takedowns: 3 }) >= yardXp(base));
  assert.match(yardSaid(base, yardXp(base)), /XP/);
});

test('the live stealth layer is only ever started by a map with a stealth block', () => {
  const src = readFileSync(new URL('../projects/Space-Shooter/voyage/onfoot/world.js', import.meta.url), 'utf8');
  assert.match(src, /def\.stealth|\.stealth\b/, 'world.js reads the map\'s stealth block');
  assert.equal(JSON.stringify(Object.values(MAP_DEFS)).includes('"stealth"'), false);
});
