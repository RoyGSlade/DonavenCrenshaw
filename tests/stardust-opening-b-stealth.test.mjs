// Opening B, outcome 5: "slip behind them" is the live stealth the game already has (cones, fog of war, noise, takedowns), for a short
// taste in the cargo hold: two Reavers, one way round. Pure checks on the staging data and the real stealth simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { createStealth, liveTuning, STEALTH as RULES, findPath } from '../projects/Space-Shooter/voyage/onfoot/rules/stealth.js';
import { STEALTH, APPROACH, stealthDef, targetPoint } from '../projects/Space-Shooter/voyage/slice/staging.js';
import { approachFor } from '../projects/Space-Shooter/voyage/slice/assist.js';

const m = compileMap(MAP_DEFS['duchess-cargo']);
const T = m.tile;
const KEY = 'hold-the-corridor/corridor/1';
const def = STEALTH[KEY];

test('the stealth approach is the corridor\'s "slip behind them" choice, in the cargo hold, with two guards and a goal', () => {
  assert.equal(APPROACH[KEY].kind, 'stealth');
  assert.equal(APPROACH[KEY].map, def.map);
  assert.equal(def.map, 'duchess-cargo');
  assert.equal(def.guards.length, 2, 'one corridor, two marauders');
  assert.deepEqual(stealthDef('hold-the-corridor', 'corridor', 1), def);
  assert.equal(stealthDef('hold-the-corridor', 'corridor', 0), null);
});

test('the guards stand and walk on open floor, and the goal is open floor you can get to from the door', () => {
  for (const g of def.guards) for (const [tx, ty] of g.path) assert.ok(walkable(m, (tx + 0.5) * T, (ty + 0.5) * T, 12), `${g.id} at ${tx},${ty}`);
  assert.ok(walkable(m, def.goal.tile[0] * T + T / 2, def.goal.tile[1] * T + T / 2, 12) || walkable(m, def.goal.tile[0] * T, def.goal.tile[1] * T, 12));
  const spawn = m.spawns['from-corridor'];
  const route = findPath(m, spawn, { x: (def.goal.tile[0] + 0.5) * T, y: (def.goal.tile[1] + 0.5) * T });
  assert.ok(route && route.length >= 1, 'a way in');
  assert.ok(targetPoint(m, { tile: def.goal.tile }), 'the goal resolves');
});

function walkRoute(route, { gait = 'sneak', tune = {}, guards = def.guards, maxT = 150 } = {}) {
  const sim = createStealth({ map: m, def: { guards }, tuning: liveTuning(tune), seed: 7 });
  let p = { x: m.spawns['from-corridor'].x, y: m.spawns['from-corridor'].y };
  const speed = RULES.speed[gait], dt = 1 / 30;
  const events = []; let t = 0, wi = 0;
  while (wi < route.length && t < maxT) {
    const w = { x: route[wi][0] * T, y: route[wi][1] * T };
    const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
    if (d < 6) { wi++; continue; }
    const s = Math.min(d, speed * dt);
    p = { x: p.x + (dx / d) * s, y: p.y + (dy / d) * s };
    for (const e of sim.step(dt, { x: p.x, y: p.y, gait, moving: true })) events.push(e.type);
    t += dt;
  }
  return { sim, events, t, p };
}

test('the stealth is real: standing in a guard\'s cone raises the alarm; a clean sneak round the east lane does not', () => {
  // Stand in the middle of the hold in the guards' sight: inspect, then the alarm.
  const sim = createStealth({ map: m, def: { guards: def.guards }, tuning: liveTuning(), seed: 7 });
  const stand = { x: 10.5 * T, y: 6 * T, gait: 'walk', moving: false };
  const seen = [];
  for (let i = 0; i < 30 * 40; i++) for (const e of sim.step(1 / 30, stand)) seen.push(e.type);
  assert.ok(seen.includes('inspect') || seen.includes('alarm'), 'standing in the open down the lane is noticed');
  // A sneak round the east lane, behind the standing guard, to the goal.
  const east = [[10.5, 5.6], [17, 5.6], [18.3, 6.5], [18.3, 13.6], [17.2, 14.6], [15.5, 14.7], [12.5, 14.7], def.goal.tile];
  const ok = [];
  for (const gait of ['sneak', 'walk']) { const r = walkRoute(east, { gait }); ok.push({ gait, alarm: r.events.includes('alarm'), t: r.t }); }
  assert.ok(ok.some((r) => !r.alarm), `some pace gets round without the alarm: ${JSON.stringify(ok)}`);
});

test('the help is real: a tool shortens the cones, a hand removes the second Reaver', () => {
  const plain = createStealth({ map: m, def: { guards: def.guards }, tuning: liveTuning(), seed: 7 });
  const tool = createStealth({ map: m, def: { guards: def.guards }, tuning: liveTuning({ points: { range: 4 }, level: 9 }), seed: 7 });
  assert.ok(tool.coneOf(tool.guards[0]).len < plain.coneOf(plain.guards[0]).len, 'shorter cones');
  const hand = createStealth({ map: m, def: { guards: def.guards.filter((g) => g.id !== 'reaver-b') }, tuning: liveTuning(), seed: 7 });
  assert.equal(hand.guards.length, 1);
  assert.deepEqual(approachFor({ total: 30, dc: 12 }, APPROACH[KEY]).help, ['hint', 'tool', 'hand']);
  assert.equal(approachFor({ total: 30, dc: 12 }, APPROACH[KEY]).timeMs, Math.round(45000 * 1.3));
});

test('a takedown from behind takes a guard down quietly', () => {
  const sim = createStealth({ map: m, def: { guards: [def.guards[1]] }, tuning: liveTuning(), seed: 7 });
  const g = sim.guards[0];
  const behind = { x: g.x - Math.cos(g.angle) * 36, y: g.y - Math.sin(g.angle) * 36 };
  sim.step(1 / 30, { ...behind, gait: 'sneak', moving: false });
  assert.ok(sim.canTakedown(behind), 'in reach and behind');
  assert.equal(sim.takedown(g.id, behind), true);
  assert.equal(sim.guards[0].state, 'down');
});
