// The opening slice, scenes 1 to 6 (launch slice lane, 2026-11-16). Written against the outcome in
// lhc-lanes/stardust/launch/slice/PLAN.md before the director was built:
//   1. the six missions pass the game's own validator, with unique lines and known speakers;
//   2. every step's marker names a spot that exists in its room and can be reached on foot;
//   3. a scripted walk (no browser) plays scenes 1 to 6 on a fresh save through the real engine and checks every flag,
//      every payout and the state each Duchess room shows, on the good path and on the failure path;
//   4. a fight's arena is valid, its enemies stand on open floor, and the rules (next scene, walk or cut, marker) hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { resolveStates, applyStates } from '../projects/Space-Shooter/voyage/onfoot/rules/states.js';
import { validateQuest, questLines, SPEAKERS } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { startQuest, act, view } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { explore } from '../projects/Space-Shooter/voyage/quests/explore.js';
import { SLICE_LIST, SLICE_ORDER } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { createCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { PLACES, markerPoint, markerDistance, markerReach } from '../projects/Space-Shooter/voyage/slice/places.js';
import { nextScene, arriveMode, markerFor, roomOf, START_ROOM, SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';
import { ENEMY_TYPES } from '../projects/Space-Shooter/voyage/onfoot/rules/shooter.js';
import { QUEST_GIVERS } from '../projects/Space-Shooter/voyage/quests/data/givers.js';
import { ready as modulesReady } from '../projects/Space-Shooter/voyage/modules/registry.js';
await modulesReady(); // scene-hook validation reads each game's manifest from the module registry

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));
const rng = () => 0.5;
const janitor = () => ({ ...emptySave(), character: createCharacter({ name: 'Janitor', look: { portrait: 'p1' } }, rng, () => 1), flags: { [SLICE_FLAG]: 1 } });

// ---- 1. the missions ----------------------------------------------------------------------------------------
test('slice: six missions in order, valid, with unique lines and known speakers, and a real giver', () => {
  assert.deepEqual(SLICE_ORDER, ['third-shift', 'visitors', 'hold-the-corridor', 'the-eighth-gunner', 'gunners-week', 'day-five']);
  for (const q of SLICE_LIST) assert.deepEqual(validateQuest(q), [], q.id);
  const { lines, errors } = questLines(SLICE_LIST);
  assert.deepEqual(errors, []);
  assert.ok(lines.length >= 60, `${lines.length} spoken lines`);
  for (const l of lines) assert.ok(SPEAKERS[l.speaker], `${l.id} speaker`);
  for (const l of lines) assert.ok(l.text.split(/\s+/).length <= 45, `${l.id} fits a phone caption`);
  for (const q of SLICE_LIST) assert.ok(QUESTS[q.id] === q, `${q.id} is registered`);
  assert.equal(QUEST_GIVERS.tull.slice, true);
  for (const q of SLICE_LIST) for (const node of Object.values(q.nodes)) assert.ok(PLACES.includes(node.room), `${q.id} node room`);
});

test('slice: every node and every ending of every scene is reachable with real actions', () => {
  const rich = { ...janitor(), money: 50 };
  for (const q of SLICE_LIST) {
    const result = explore(q, rich, { seeds: Array.from({ length: 30 }, (_, i) => i + 1) });
    assert.deepEqual(result.errors, [], q.id);
    const all = new Set(Object.keys(q.nodes));
    for (const n of all) assert.ok(result.nodes.has(n), `${q.id}: node ${n} is never reached`);
    const ends = Object.entries(q.nodes).filter(([, n]) => n.type === 'end').map(([id]) => id);
    for (const e of ends) assert.ok(result.ends.has(e), `${q.id}: ending ${e} is never reached`);
  }
});

// ---- 2. markers -----------------------------------------------------------------------------------------------
/** Tiles of walkable floor reachable from a map's door spawns, on a 12 px grid (the player's radius). */
function reach(map) {
  const step = 12, r = 14;
  const key = (x, y) => `${x},${y}`;
  const seen = new Set();
  const queue = Object.values(map.spawns).map((s) => ({ x: Math.round(s.x / step) * step, y: Math.round(s.y / step) * step }));
  const cells = [];
  while (queue.length) {
    const c = queue.pop();
    const k = key(c.x, c.y);
    if (seen.has(k) || !walkable(map, c.x, c.y, r)) continue;
    seen.add(k); cells.push(c);
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) queue.push({ x: c.x + dx, y: c.y + dy });
  }
  return cells;
}

test('slice: every step marker names a spot in its room that exists and can be reached on foot', () => {
  let checked = 0;
  for (const q of SLICE_LIST) {
    assert.ok(q.steps.length >= 3, `${q.id} has tracker steps`);
    for (const step of q.steps) {
      assert.ok(PLACES.includes(step.where), `${q.id}/${step.id} points at a room`);
      assert.ok(step.at, `${q.id}/${step.id} has a marker spot`);
      assert.equal(step.where, q.nodes[step.nodes[0]].room, `${q.id}/${step.id}: the marker room is where the step's first beat plays`);
      // The spot must exist in the room in at least one state the step can be played in (a flag can remove a prop).
      const def = MAP_DEFS[step.where];
      const variants = [{}, ...Object.values(Object.fromEntries(Object.keys(def.tags || {}).map((t) => [t, null])))].length ? [{}] : [{}];
      void variants;
      const flagsTried = [{}, { 'reck-down': 1, 'reavers-docked': 1, 'reavers-boarded': 1 }, { 'duchess-busted': 1 }, { 'nessa-quit': 1, 'pip-quit': 1, 'turret-repaired': 1 }];
      const found = flagsTried.map((flags) => { const map = compileMap(applyStates(def, resolveStates(def, flags))); return { map, point: markerPoint(map, step.at) }; }).filter((f) => f.point);
      assert.ok(found.length, `${q.id}/${step.id}: ${JSON.stringify(step.at)} exists in ${step.where}`);
      const { map } = found[0];
      const cells = reach(map);
      const near = cells.some((c) => markerDistance(map, step.at, c.x, c.y) <= markerReach(map, step.at));
      assert.ok(near, `${q.id}/${step.id}: a player can stand within reach of ${JSON.stringify(step.at)} in ${step.where}`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `${checked} markers checked`);
});

// ---- 3. the scripted walk -----------------------------------------------------------------------------------
const stateOf = (save, room) => resolveStates(MAP_DEFS[room], save.flags || {});

/**
 * Plays one scene through the real engine. picks: label fragments in order, or { fight: 'win'|'lose'|'flee' }.
 * A single-choice node ("Go on", "On to the next job.") is taken without a pick. The engine rolls from the seed, so
 * seeds are tried until the rolls fall the way the plan needs; the end node must be `end`.
 */
function playScene(quest, save, picks, end, maxSeed = 400) {
  for (let seed = 1; seed <= maxSeed; seed++) {
    let { run, save: s } = startQuest(quest, save, { seed, now: 1 });
    const visited = [run.node];
    let queue = [...picks];
    let ok = true;
    for (let guard = 0; guard < 80 && !run.ended; guard++) {
      const v = view(quest, run, s);
      let action;
      if (v.minigame) {
        // A hooked choice (scenes 3, 4, 5): the d20 set the tier; the minigame is stubbed to the outcome the plan names.
        const want = queue[0];
        if (!want?.mini) { ok = false; break; }
        queue.shift();
        action = { type: 'minigame', branch: want.mini, xp: 2, skill: v.choices[v.minigame.index].check.skill };
      } else if (v.part?.kind === 'foot') {
        const want = queue[0];
        if (!want?.fight) { ok = false; break; }
        queue.shift();
        action = { type: 'live', outcome: want.fight, hp: 30 };
      } else if (v.type === 'dialogue') {
        const open = v.choices.filter((c) => !c.locked);
        // A node with one way on ("Go on", a lone check) is taken without a pick; the plan names the real forks.
        const pick = open.length === 1 ? open[0] : open.find((c) => typeof queue[0] === 'string' && c.label.includes(queue[0]));
        if (!pick) { ok = false; break; }
        if (open.length > 1) queue.shift();
        action = { type: 'choose', index: pick.index };
      } else { ok = false; break; }
      const next = act(quest, run, s, action, { now: 1 });
      if (next.error) { ok = false; break; }
      run = next.run; s = next.save; visited.push(run.node);
    }
    if (ok && run.ended && run.node === end && !queue.length) return { seed, save: s, run, visited };
  }
  assert.fail(`${quest.id}: no seed plays ${JSON.stringify(picks)} to ${end}`);
}

const money = (n) => n;
function expectScene(label, result, { money: delta, rep, flags = [], notFlags = [], items = {}, outcome, before }) {
  const { save } = result;
  assert.equal(result.run.ended.outcome, outcome, `${label}: outcome`);
  assert.equal(save.money, Math.max(0, before.money + delta), `${label}: money ${before.money} + ${delta} (never below 0)`);
  if (rep != null) assert.equal(save.rep.tull || 0, Math.max(0, (before.rep.tull || 0) + rep), `${label}: Tull's rep`);
  for (const f of flags) assert.ok(save.flags[f], `${label}: flag ${f} is set`);
  for (const f of notFlags) assert.ok(!save.flags[f], `${label}: flag ${f} is not set`);
  for (const [id, n] of Object.entries(items)) assert.equal((save.items[id] || 0) - (before.items[id] || 0), n, `${label}: item ${id}`);
  assert.equal(save.quests.active?.[result.run.quest], undefined, `${label}: the scene is no longer active`);
  assert.ok(save.quests.done[result.run.quest], `${label}: the scene is on record`);
}
const rooms = (save, list) => Object.fromEntries(list.map(([room, tag]) => [`${room}:${tag}`, stateOf(save, room)[tag]]));

test('slice walk (good path): scenes 1 to 6 on a fresh save, every flag, payout and room state', () => {
  let save = janitor();
  assert.equal(nextScene(save), 'third-shift');
  const play = (id, picks, end) => { const r = playScene(Q[id], save, picks, end); const before = save; save = r.save; assert.equal(nextScene(save), SLICE_ORDER[SLICE_ORDER.indexOf(id) + 1] || null); return { r, before }; };

  // Scene 1: the valve is fixed, the foam stops, the goo goes. Pays 24 and 3 rep.
  let { r, before } = play('third-shift', ['Where is this gym?', 'Start cleaning.', 'Fix the leaking valve.'], 'end-source-fixed-end');
  expectScene('scene 1', r, { before, money: 24, rep: 3, outcome: 'source-fixed', flags: ['goo-cleared', 'goo-source-fixed', 'pip-impressed', 'shift-1-over'] });
  assert.deepEqual(rooms(save, [['duchess-holodeck', 'holo-goo'], ['duchess-holodeck', 'holo-valve'], ['duchess-holodeck', 'holo-projector']]), { 'duchess-holodeck:holo-goo': 'clean', 'duchess-holodeck:holo-valve': 'fixed', 'duchess-holodeck:holo-projector': 'on' });
  assert.equal(stateOf(save, 'duchess-bridge').reck, 'alive');

  // Scene 2: the nav check spots the clamps (flag), the Reavers dock and breach, Reck dies. Pays 8 and 1 rep.
  ({ r, before } = play('visitors', ["Check the cutter's readout.", 'Keep your eyes on the cutter.', 'Grab the helm rail'], 'end-warned'));
  expectScene('scene 2', r, { before, money: 8, rep: 1, outcome: 'warned', flags: ['saw-clamps', 'reavers-docked', 'reavers-boarded', 'reck-down'] });
  assert.deepEqual(rooms(save, [['duchess-airlock', 'airlock-outer'], ['duchess-airlock', 'boarding-clamp'], ['duchess-bridge', 'gunner-seat'], ['duchess-bridge', 'reck']]), { 'duchess-airlock:airlock-outer': 'breached', 'duchess-airlock:boarding-clamp': 'torn', 'duchess-bridge:gunner-seat': 'broken', 'duchess-bridge:reck': 'down' });

  // Scene 3: hack the inner airlock door shut. Pays 20 and 3 rep; the door shows sealed, no bodies in the corridor.
  ({ r, before } = play('hold-the-corridor', ['Hack the inner airlock door', { mini: 'win' }], 'end-sealed-end'));
  expectScene('scene 3', r, { before, money: 20, rep: 3, outcome: 'sealed', flags: ['reck-rifle-taken', 'airlock-sealed', 'reavers-repelled'] });
  assert.deepEqual(rooms(save, [['duchess-corridor', 'airlock-inner'], ['duchess-corridor', 'reavers'], ['duchess-bridge', 'reck']]), { 'duchess-corridor:airlock-inner': 'sealed', 'duchess-corridor:reavers': 'aboard', 'duchess-bridge:reck': 'looted' });

  // Scene 4: the haggle works. Pays 30 and 3 rep.
  ({ r, before } = play('the-eighth-gunner', ['Haggle for a bigger share.', { mini: 'win' }], 'end-hired-well-end'));
  expectScene('scene 4', r, { before, money: 30, rep: 3, outcome: 'hired-well', flags: ['gunner-hired', 'pay-raised'] });

  // Scene 5: turret, scan, Nessa quits, the coolant is fixed. Pays 6 + 5 + 25 and 2 rep, a hull patch; Pip leaves too.
  ({ r, before } = play('gunners-week', ['Patch the line', { mini: 'win' }], 'end-steady-end'));
  expectScene('scene 5', r, { before, money: 6 + 5 + 25, rep: 2, outcome: 'steady', items: { 'hull-patch': 1 }, flags: ['coolant-leaking', 'turret-repaired', 'nessa-quit', 'pip-quit', 'coolant-fixed'] });
  assert.deepEqual(rooms(save, [['duchess-engine', 'coolant'], ['duchess-engine', 'pip'], ['duchess-bridge', 'nessa'], ['duchess-bridge', 'gunner-seat']]), { 'duchess-engine:coolant': 'intact', 'duchess-engine:pip': 'gone', 'duchess-bridge:nessa': 'gone', 'duchess-bridge:gunner-seat': 'intact' });
  assert.equal(stateOf(save, 'duchess-pad')['berth-door'], 'shut', 'the pad door to the hangar is shut before day five');
  assert.equal(stateOf(save, 'duchess-pad')['duchess-hull'], 'whole');
  assert.equal(stateOf(save, 'duchess-pad')['tull-pad'], 'away');

  // Scene 6: she flies. Pays 30 and 3 rep; the reactor and hull are mended, the pad hull is repaired, the hangar door opens.
  ({ r, before } = play('day-five', ['Go look at the ship.', 'Bring the reactor back'], 'flying'));
  expectScene('scene 6', r, { before, money: 30, rep: 3, outcome: 'flying', flags: ['duchess-busted', 'reactor-fixed', 'hull-patched', 'duchess-repaired', 'day-five-over'] });
  assert.deepEqual(rooms(save, [['duchess-engine', 'reactor'], ['duchess-engine', 'engine-console'], ['duchess-engine', 'hull-patch'], ['duchess-pad', 'duchess-hull'], ['duchess-pad', 'tull-pad'], ['duchess-pad', 'berth-door']]),
    { 'duchess-engine:reactor': 'fixed', 'duchess-engine:engine-console': 'fixed', 'duchess-engine:hull-patch': 'patched', 'duchess-pad:duchess-hull': 'repaired', 'duchess-pad:tull-pad': 'here', 'duchess-pad:berth-door': 'open' });
  assert.equal(nextScene(save), null, 'all six scenes are on record');
  assert.equal(save.money, 24 + 8 + 20 + 30 + 36 + 30, 'the whole good run is 148 credits');
});

test('slice walk (mini-games stubbed to the other outcomes): lost hack then fight, a fair haggle, a flooded coolant line', () => {
  let save = janitor();
  const play = (id, picks, end) => { const r = playScene(Q[id], save, picks, end); const before = save; save = r.save; return { r, before }; };
  play('third-shift', ['Where is this gym?', 'Start cleaning.', 'Fix the leaking valve.'], 'end-source-fixed-end');
  play('visitors', ["Check the cutter's readout.", 'Keep your eyes on the cutter.', 'Grab the helm rail'], 'end-warned');
  const start = save.money;
  // Scene 3: the hack is lost (trace tripped), the corridor fight is won: the door stays open, the Reavers are held. +15, +3 rep.
  let { r, before } = play('hold-the-corridor', ['Hack the inner airlock door', { mini: 'lose' }, { fight: 'win' }], 'end-held');
  expectScene('scene 3', r, { before, money: 15, rep: 3, outcome: 'held', flags: ['reavers-repelled'], notFlags: ['airlock-sealed'] });
  assert.equal(stateOf(save, 'duchess-corridor')['airlock-inner'], 'open');
  // Scene 4: a fair haggle is the standard share. +20, +2 rep.
  ({ r, before } = play('the-eighth-gunner', ['Haggle for a bigger share.', { mini: 'mid' }], 'end-hired-fair-end'));
  expectScene('scene 4 fair', r, { before, money: 20, rep: 2, outcome: 'hired-fair', flags: ['gunner-hired'], notFlags: ['pay-raised'] });
  // Scene 5: the coolant floods the engine room: 6 + 5 on the way, -15 at the end, a hull patch, no coolant-fixed.
  ({ r, before } = play('gunners-week', ['Patch the line', { mini: 'lose' }], 'end-spray-end'));
  expectScene('scene 5', r, { before, money: 6 + 5 - 15, rep: 0, outcome: 'spray', items: { 'hull-patch': 1 }, flags: ['nessa-quit', 'pip-quit'], notFlags: ['coolant-fixed'] });
  assert.equal(save.money, start + 15 + 20 + 6 + 5 - 15);
  // A walked haggle is the lowball, on every one of the three haggle choices.
  for (const via of [['Haggle for a bigger share.'], ['What happened to the other seven gunners?', 'Haggle for a bigger share.'], ['Read the ledger on the desk.', 'Haggle, now that you know he is broke.']]) {
    const walked = playScene(Q['the-eighth-gunner'], janitor(), [...via, { mini: 'lose' }], 'end-lowballed-end');
    assert.equal(walked.run.ended.outcome, 'lowballed');
  }
});

test('slice walk (failure path): every failure still moves the story on, with its own flags, payouts and room states', () => {
  let save = janitor();
  const play = (id, picks, end) => { const r = playScene(Q[id], save, picks, end); const before = save; save = r.save; assert.equal(nextScene(save), SLICE_ORDER[SLICE_ORDER.indexOf(id) + 1] || null); return { r, before }; };

  // Scene 1: the console fries the projector. -10 (money stays at 0), -2 rep (rep stays at 0).
  let { r, before } = play('third-shift', ['Where is this gym?', 'Start cleaning.', 'Reset the holodeck program'], 'end-projector-fried-end');
  expectScene('scene 1', r, { before, money: -10, rep: -2, outcome: 'projector-fried', flags: ['holo-projector-fried', 'shift-1-over'], notFlags: ['goo-cleared', 'goo-source-fixed'] });
  assert.deepEqual(rooms(save, [['duchess-holodeck', 'holo-goo'], ['duchess-holodeck', 'holo-valve'], ['duchess-holodeck', 'holo-projector']]), { 'duchess-holodeck:holo-goo': 'dirty', 'duchess-holodeck:holo-valve': 'leaking', 'duchess-holodeck:holo-projector': 'fried' });

  // Scene 2: Reck is talked to, the janitor freezes.
  ({ r, before } = play('visitors', ['Go and talk to Reck.', 'Keep your eyes on the cutter.', 'Stand where you are'], 'end-frozen'));
  expectScene('scene 2', r, { before, money: -5, outcome: 'frozen', flags: ['reavers-docked', 'reavers-boarded', 'reck-down'], notFlags: ['saw-clamps'] });

  // Scene 3: the fight is lost: the line breaks. -20, -1 rep.
  ({ r, before } = play('hold-the-corridor', ['Hold the corridor', { fight: 'lose' }], 'end-overrun'));
  expectScene('scene 3', r, { before, money: -20, rep: -1, outcome: 'overrun', flags: ['reck-rifle-taken', 'reavers-repelled'], notFlags: ['airlock-sealed'] });
  assert.deepEqual(rooms(save, [['duchess-corridor', 'airlock-inner'], ['duchess-corridor', 'reavers']]), { 'duchess-corridor:airlock-inner': 'open', 'duchess-corridor:reavers': 'repelled' });

  // Scene 4: says no, then takes the seat with breakfast. Pays 5.
  ({ r, before } = play('the-eighth-gunner', ['No thanks.', 'Hold out.'], 'end-refused-end'));
  expectScene('scene 4', r, { before, money: 5, outcome: 'refused', flags: ['gunner-hired'], notFlags: ['pay-raised'] });

  // Scene 5: the turret limps, a beacon pings, the jury-rigged fitting pops. The coolant stays leaking.
  ({ r, before } = play('gunners-week', ['Jury-rig a fitting'], 'end-tull-blames-end'));
  expectScene('scene 5', r, { before, money: -10, rep: -2, outcome: 'tull-blames', items: { 'hull-patch': 1 }, flags: ['coolant-leaking', 'nessa-quit', 'pip-quit'], notFlags: ['coolant-fixed'] });
  assert.equal(stateOf(save, 'duchess-engine').coolant, 'leaking', 'the leak is still there');

  // Scene 6: the restart trips every breaker; she is towed. -40, and the hangar door still opens.
  ({ r, before } = play('day-five', ['Go look at the ship.', 'Bring the reactor back'], 'towed'));
  expectScene('scene 6', r, { before, money: -40, outcome: 'towed', flags: ['duchess-busted', 'day-five-over'], notFlags: ['reactor-fixed', 'duchess-repaired'] });
  assert.deepEqual(rooms(save, [['duchess-engine', 'reactor'], ['duchess-engine', 'hull-patch'], ['duchess-engine', 'conduit'], ['duchess-pad', 'duchess-hull'], ['duchess-pad', 'berth-door']]),
    { 'duchess-engine:reactor': 'broken', 'duchess-engine:hull-patch': 'blown', 'duchess-engine:conduit': 'open', 'duchess-pad:duchess-hull': 'busted', 'duchess-pad:berth-door': 'open' });
  assert.equal(nextScene(save), null);
});

test('slice walk: the limping ending and the on-foot side options also land (flank, bluff, run)', () => {
  const save = janitor();
  const done = [
    ['day-five', ['Go look at the ship.', 'Rig a bypass'], 'limping', ['power-fixed', 'reactor-fixed', 'duchess-busted', 'day-five-over']],
    ['hold-the-corridor', ['Slip through the cargo hold', { fight: 'win' }], 'end-held', ['reavers-repelled']],
    ['hold-the-corridor', ['Bluff them', { fight: 'win' }], 'end-held', ['reavers-repelled']],
    ['hold-the-corridor', ['Hold the corridor', { fight: 'flee' }], 'end-ran', ['reavers-repelled']],
  ];
  for (const [id, picks, end, flags] of done) {
    const r = playScene(Q[id], save, picks, end);
    for (const f of flags) assert.ok(r.save.flags[f], `${id} -> ${end}: ${f}`);
  }
});

// ---- 4. fights and rules ---------------------------------------------------------------------------------------
test('slice: every fight is on foot with its own arena, and its enemies stand on open floor in that room', () => {
  const fights = SLICE_LIST.flatMap((q) => Object.entries(q.nodes).filter(([, n]) => n.type === 'fight').map(([id, n]) => [q.id, id, n]));
  assert.equal(fights.length, 4);
  for (const [qid, id, n] of fights) {
    assert.equal(n.mode, 'foot');
    assert.equal(n.arena.map, n.room, `${qid}/${id}: the arena is the room the fight node is in`);
    const map = compileMap(applyStates(MAP_DEFS[n.arena.map], resolveStates(MAP_DEFS[n.arena.map], { 'reck-down': 1, 'reavers-docked': 1, 'reavers-boarded': 1, 'reck-rifle-taken': 1 })));
    assert.ok(n.arena.enemies.length >= 2, `${qid}/${id}: more than one Reaver`);
    for (const e of n.arena.enemies) {
      assert.ok(ENEMY_TYPES[e.type], e.type);
      assert.ok(walkable(map, (e.at[0] + (map.def.roomBox?.[0] || 0) + 0.5) * map.tile, (e.at[1] + (map.def.roomBox?.[1] || 0) + 0.5) * map.tile, 16), `${qid}/${id}: ${e.type} at ${e.at} is on open floor in ${map.id}`);
    }
    assert.deepEqual(Object.keys(n.outcomes).sort(), ['flee', 'lose', 'win'].filter((k) => n.outcomes[k]).sort());
  }
});

test('slice rules: next scene, walk or cut, and the marker for the step a run is on', () => {
  const save = janitor();
  assert.equal(nextScene(save), 'third-shift');
  const started = startQuest(Q['third-shift'], save, { seed: 1, now: 1 });
  assert.equal(nextScene(started.save), 'visitors', 'a scene in progress is not handed out twice');
  assert.deepEqual(markerFor(Q['third-shift'], started.run), { map: 'duchess-mess', npc: 'tull' });
  // Scene 1: the brief is in the mess (the start), the gym waits for the player to walk there, the ending is a cut.
  assert.equal(roomOf(Q['third-shift'], 'brief'), START_ROOM);
  assert.equal(arriveMode(Q['third-shift'], 'brief'), 'walk');
  assert.equal(arriveMode(Q['third-shift'], 'goo'), 'walk');
  assert.equal(arriveMode(Q['third-shift'], 'nessa'), 'cut');
  assert.equal(arriveMode(Q['third-shift'], 'end-clean'), 'cut');
  // Scene 2's boarding is a cut from the airlock back to the bridge (the draft's cut-to), not a walk.
  assert.equal(arriveMode(Q.visitors, 'breach'), 'cut');
  assert.equal(arriveMode(Q.visitors, 'last'), 'cut');
  // Scene 3: the corridor fight waits for the player to walk in; the cargo flank is a cut.
  assert.equal(arriveMode(Q['hold-the-corridor'], 'corridor'), 'walk');
  assert.equal(arriveMode(Q['hold-the-corridor'], 'cargo-flank'), 'cut');
  assert.equal(markerFor(Q.visitors, { node: 'x', ended: { result: 'success' } }), null);
});

test('slice: a scene whose rolls fail never dead-ends and a failed record still moves the story on', () => {
  let save = janitor();
  for (const id of SLICE_ORDER) {
    const next = nextScene(save);
    assert.equal(next, id);
    // The fastest way through each scene is its own first failure ending (a record is a record).
    const failEnd = Object.values(Q[id].nodes).find((n) => n.type === 'end' && n.result === 'failure').outcome;
    assert.ok(failEnd, id);
    save = { ...save, quests: { ...save.quests, done: { ...(save.quests?.done || {}), [id]: { result: 'failure', outcome: failEnd, at: 1, times: 1 } } } };
  }
  assert.equal(nextScene(save), null);
  void money;
});

test('slice: a room shows its state while the beat that explains it plays (flags paid on entering the node)', () => {
  // Scene 5 begins with the coolant line already spraying; day five begins with the ship busted and Tull on the pad.
  const s5 = startQuest(Q['gunners-week'], janitor(), { seed: 1, now: 1 });
  assert.equal(stateOf(s5.save, 'duchess-engine').coolant, 'leaking');
  const s6 = startQuest(Q['day-five'], janitor(), { seed: 1, now: 1 });
  assert.equal(stateOf(s6.save, 'duchess-pad')['duchess-hull'], 'busted');
  assert.equal(stateOf(s6.save, 'duchess-pad')['tull-pad'], 'here');
  assert.equal(stateOf(s6.save, 'duchess-pad')['berth-door'], 'shut', 'the way to the hangar stays shut until day five is over');
  // Scene 2: the clamp shows when the player is cut to the airlock, the boarding when the door gives, Reck down as he falls.
  const walk = (id, picks, until) => {
    let { run, save } = startQuest(Q[id], janitor(), { seed: 3, now: 1 });
    const queue = [...picks];
    for (let guard = 0; guard < 30 && run.node !== until; guard++) {
      const open = view(Q[id], run, save).choices.filter((x) => !x.locked);
      const pick = open.length === 1 ? open[0] : open.find((x) => x.label.includes(queue[0]));
      if (open.length > 1) queue.shift();
      const n = act(Q[id], run, save, { type: 'choose', index: pick.index }, { now: 1 });
      run = n.run; save = n.save;
    }
    return { run, save };
  };
  const atBreach = walk('visitors', ["Check the cutter's readout.", 'Keep your eyes on the cutter.'], 'breach');
  assert.equal(atBreach.run.node, 'breach');
  assert.equal(stateOf(atBreach.save, 'duchess-airlock')['boarding-clamp'], 'sealed');
  assert.equal(stateOf(atBreach.save, 'duchess-airlock')['airlock-outer'], 'closed');
});
