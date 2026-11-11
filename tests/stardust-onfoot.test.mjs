// On foot and exploration (round 2, onfoot lane): the map data, walking,
// the free-aim shooter, mining, the puzzle, the sector hop, the contract's
// event names and the quest engine's live on-foot hook. Rules only, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_DEFS, SECTOR_MAP, PUZZLES, GIVER_PLACES, getMap } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap, checkMaps, walkable, INTERACT_KINDS } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { createWalker, stepWalker, nearestInteract, WALK } from '../projects/Space-Shooter/voyage/onfoot/rules/walk.js';
import { createFight, stepFight, ENEMY_TYPES, BRAINS, STEP, footStats, questFightSetup } from '../projects/Space-Shooter/voyage/onfoot/rules/shooter.js';
import { createMining, stepMining, bandAt, MINING } from '../projects/Space-Shooter/voyage/onfoot/rules/mining.js';
import { createPuzzle, rotateTile, parMoves, LAYOUTS } from '../projects/Space-Shooter/voyage/onfoot/rules/puzzle.js';
import { createHop, stepHop, autopilot, PLACES, POIS, GIVER_PLACE, steerToward } from '../projects/Space-Shooter/voyage/explore/rules.js';
import { TUTORIAL_EVENTS, STATIONS, CAST, metEvent, createEmitter } from '../projects/Space-Shooter/voyage/onfoot/events.js';
import { createFoot, viewFoot, actFoot } from '../projects/Space-Shooter/voyage/quests/parts/foot.js';
import { effect, skillBonus } from '../projects/Space-Shooter/voyage/character.js';

const ROOT = new URL('../projects/Space-Shooter/voyage/', import.meta.url);
const T = 48;
const centre = ([x, y]) => ({ x: (x + 0.5) * T, y: (y + 0.5) * T });

test('every map is plain JSON, compiles, and links up (doors, spawns, npcs, stations, puzzles)', () => {
  for (const id of Object.keys(MAP_DEFS)) {
    const text = readFileSync(new URL(`maps/${id}.json`, ROOT), 'utf8');
    assert.deepEqual(JSON.parse(text), MAP_DEFS[id], `${id}.json is the data the game loads`);
  }
  const { problems } = checkMaps(MAP_DEFS, { puzzles: PUZZLES, stations: STATIONS });
  assert.deepEqual(problems, []);
  // The places Donaven listed: hangar, ship, workshop, Mel, Edna, the three givers, a cantina (+ a moon outpost to fight on).
  for (const id of ['hangar', 'ship', 'workshop', 'mel-bay', 'edna-den', 'hask-office', 'vey-lounge', 'garrity-office', 'cantina', 'moon-outpost']) assert.ok(MAP_DEFS[id], id);
  // Every map has a way out, and the hangar reaches the ship and the buildings.
  for (const map of Object.values(MAP_DEFS)) assert.ok(map.doors.length >= 1, `${map.id} has a door`);
  const hangarDoors = MAP_DEFS.hangar.doors.map(d => d.to).sort();
  assert.deepEqual(hangarDoors, ['cantina', 'edna-den', 'mel-bay', 'ship', 'workshop']);
  // The ship has the crew's repair points.
  assert.deepEqual(MAP_DEFS.ship.props.filter(p => p.interact?.kind === 'repair').map(p => p.interact.id).sort(), ['engine', 'guns', 'hull']);
});

test('the hangar carries every contract station, and Edna holds the lockbox', () => {
  const hangar = getMap('hangar');
  const stations = new Set([...hangar.rings.map(r => r.station), ...hangar.npcs.map(n => n.station)].filter(Boolean));
  for (const id of STATIONS) assert.ok(stations.has(id), `station ${id} in the hangar`);
  const den = getMap('edna-den');
  assert.ok(den.interacts.some(i => i.kind === 'puzzle' && i.id === 'lockbox'));
  assert.equal(den.npcs[0].id, 'edna');
  assert.deepEqual(Object.keys(GIVER_PLACES).sort(), ['garrity', 'hask', 'vey']);
  for (const [giver, mapId] of Object.entries(GIVER_PLACES)) assert.equal(getMap(mapId).npcs[0].id, giver);
});

test('compileMap refuses bad data', () => {
  assert.throws(() => compileMap({ id: 'Bad Id', grid: ['.'], spawns: { default: [0, 0] } }), /bad id/);
  assert.throws(() => compileMap({ id: 'x', grid: ['.?'], spawns: { default: [0, 0] } }), /unknown tile/);
  assert.throws(() => compileMap({ id: 'x', grid: ['..'] }), /default spawn/);
  assert.throws(() => compileMap({ id: 'x', grid: ['..'], spawns: { default: [0, 0] }, props: [{ art: 'a', at: [0, 0], interact: { kind: 'dance' } }] }), /unknown interact kind/);
  const broken = { a: { id: 'a', grid: ['...'], spawns: { default: [1, 0] }, doors: [{ id: 'd', at: [2, 0], to: 'nowhere' }] } };
  assert.match(checkMaps(broken).problems[0], /missing map nowhere/);
  assert.ok(INTERACT_KINDS.includes('repair'));
});

test('walking: accelerates, slides along walls, never enters a solid, finds the thing in front', () => {
  const map = getMap('workshop');
  const w = createWalker(map.spawns.default);
  for (let i = 0; i < 120; i++) stepWalker(w, { x: 0, y: -1 }, map, 1 / 60); // up into the engine stand / back wall
  assert.ok(walkable(map, w.x, w.y, WALK.radius - 0.5), 'stays on open floor');
  assert.ok(w.walked > T, 'moved');
  const start = { ...w };
  for (let i = 0; i < 30; i++) stepWalker(w, { x: 0, y: 0 }, map, 1 / 60);
  assert.ok(Math.hypot(w.vx, w.vy) < 1, 'stops when the stick is let go');
  assert.ok(Math.hypot(w.x - start.x, w.y - start.y) < 20);
  // Stand by Chibby's bench, face it: the bench is the interact in reach.
  const bench = map.interacts.find(i => i.kind === 'station');
  const near = createWalker({ x: bench.x, y: bench.y + 60, angle: -Math.PI / 2 });
  const still = { ...map, interacts: map.interacts.filter(i => i.kind !== 'npc') }; // world.js tracks npcs as they move
  assert.equal(nearestInteract(near, still)?.id, 'pad');
  assert.equal(nearestInteract(createWalker(map.spawns.default), map)?.kind, 'door');
});

const fightMap = getMap('moon-outpost');

test('shooter: aiming and firing kills a target; cover blocks shots both ways', () => {
  const f = createFight({ map: fightMap, spawn: { x: 3 * T, y: 7.5 * T, angle: 0 }, enemies: [{ type: 'target', x: 6 * T, y: 7.5 * T }] });
  for (let i = 0; i < 120 && !f.ended; i++) stepFight(f, { aim: 0, fire: true }, STEP);
  assert.equal(f.ended?.outcome, 'win');
  assert.ok(f.player.hits >= 2 && f.player.shots >= f.player.hits);
  // A crate between you and the target: shots stop on it.
  const crate = fightMap.solids.find(s => s.low);
  const g = createFight({ map: fightMap, spawn: { x: crate.x - 60, y: crate.y + crate.h / 2, angle: 0 }, enemies: [{ type: 'target', x: crate.x + crate.w + 60, y: crate.y + crate.h / 2 }] });
  for (let i = 0; i < 90; i++) stepFight(g, { aim: 0, fire: true }, STEP);
  assert.equal(g.enemies[0].hp, ENEMY_TYPES.target.hp, 'the crate took every shot');
  assert.ok(g.player.shots > 3);
});

test('shooter: a rusher closes and hurts on contact; a gunner shoots from range; a turret tracks', () => {
  const f = createFight({ map: fightMap, spawn: { x: 9 * T, y: 7 * T }, enemies: [{ type: 'drone', x: 14 * T, y: 7 * T, awake: true }] });
  for (let i = 0; i < 240; i++) stepFight(f, {}, STEP);
  assert.ok(f.player.hp < f.player.maxHp, 'the drone reached you');
  const g = createFight({ map: fightMap, spawn: { x: 10 * T, y: 11 * T }, enemies: [{ type: 'grunt', x: 16 * T, y: 11 * T, awake: true }], seed: 3 });
  let enemyShots = 0;
  for (let i = 0; i < 300; i++) { stepFight(g, {}, STEP); enemyShots += g.events.filter(e => e.type === 'shot' && e.owner === 'enemy').length; g.events.length = 0; }
  assert.ok(enemyShots >= 3, `grunt fired ${enemyShots}`);
  const tur = createFight({ map: fightMap, spawn: { x: 12 * T, y: 11 * T }, enemies: [{ type: 'turret', x: 16 * T, y: 11 * T, angle: -Math.PI / 2, awake: true }] });
  for (let i = 0; i < 120; i++) stepFight(tur, {}, STEP);
  assert.ok(Math.abs(Math.atan2(Math.sin(tur.enemies[0].angle - Math.PI), Math.cos(tur.enemies[0].angle - Math.PI))) < 0.3, 'turret turned to face you');
  assert.deepEqual([...new Set(Object.values(ENEMY_TYPES).map(e => e.brain))].sort(), [...BRAINS].sort());
});

test('shooter: dashing dodges, the exit zone lets you flee, same seed same fight', () => {
  const f = createFight({ map: fightMap, spawn: 'fight', exit: 'exit', enemies: [{ type: 'grunt', at: [15, 7] }] });
  stepFight(f, { move: { x: 1, y: 0 }, dash: true }, STEP);
  assert.ok(f.player.iframes > 0 && f.player.dashCd > 0);
  for (let i = 0; i < 200 && !f.ended; i++) stepFight(f, { move: { x: -1, y: 0 } }, STEP);
  assert.equal(f.ended?.outcome, 'flee');
  const play = () => {
    const s = createFight({ ...questFightSetup({ name: 'Raiders', hp: 45 }, 9), map: fightMap, spawn: 'fight', player: { hp: 60 } });
    for (let i = 0; i < 600 && !s.ended; i++) stepFight(s, { aim: 0, fire: i % 3 === 0, move: { x: 0.3, y: Math.sin(i / 30) } }, STEP);
    return JSON.stringify([s.player, s.enemies.map(e => [e.x, e.y, e.hp])]);
  };
  assert.equal(play(), play());
});

test('footStats reads the contract stat effects; quest enemies turn into bodies', () => {
  const plain = footStats(null);
  assert.equal(plain.hp, 60);
  const tough = { stats: { cha: 3, con: 6, dex: 6, wis: 3 }, skills: { brawler: 2 }, earned: 0, permanent: 0 };
  const s = footStats(tough, { effect, skillBonus });
  assert.ok(s.hp > plain.hp, 'Constitution and Brawler add hp');
  assert.ok(s.damage > plain.damage, 'fight tag adds damage');
  assert.equal(s.guard, true); assert.equal(s.assist, true);
  // The guard boon shrugs off the first hit.
  const f = createFight({ map: fightMap, spawn: 'fight', enemies: [{ type: 'target', at: [18, 1] }], player: s });
  f.player.iframes = 0;
  const hp = f.player.hp;
  f.bullets.push({ x: f.player.x + 30, y: f.player.y, px: f.player.x + 30, py: f.player.y, vx: -600, vy: 0, owner: 'enemy', damage: 9, life: 1 });
  for (let i = 0; i < 10; i++) stepFight(f, {}, STEP);
  assert.equal(f.player.hp, hp);
  assert.equal(questFightSetup({ name: 'Scrap drones', hp: 60 }).enemies.length, 4);
  assert.equal(questFightSetup({ name: 'Swarm', hp: 10 }).enemies[0].type, 'bug');
  for (const e of questFightSetup({ name: 'Guards', hp: 60 }).enemies) assert.ok(walkable(fightMap, (e.at[0] + 0.5) * T, (e.at[1] + 0.5) * T, 20));
});

test('mining: riding the green band digs it all out clean; never drilling gets nothing; holding flat out jams', () => {
  const play = (policy) => {
    const s = createMining({ seed: 5 });
    for (let i = 0; i < 60 * 30 && !s.done; i++) stepMining(s, { drill: policy(s) }, 1 / 60);
    return s.result;
  };
  const good = play(s => { const [lo, hi] = bandAt(s); return s.heat < (lo + hi) / 2; });
  assert.equal(good.ore, MINING.chunks + 1);
  assert.equal(good.clean, true);
  assert.deepEqual(good.reward, { items: { ore: MINING.chunks + 1 } });
  assert.equal(play(() => false).ore, 0);
  assert.ok(play(() => true).jams >= 1);
  // Constitution digs faster (mine.speed).
  const fast = createMining({ seed: 5, speed: 1.4 }), slow = createMining({ seed: 5 });
  for (let i = 0; i < 120; i++) { for (const s of [fast, slow]) stepMining(s, { drill: s.heat < 0.6 }, 1 / 60); }
  assert.ok(fast.progress > slow.progress);
});

test('puzzle: every layout starts unsolved, solves by turning each line tile home, hints show up', () => {
  for (const id of Object.keys(LAYOUTS)) {
    const s = createPuzzle(id);
    assert.equal(s.solved, false);
    let turns = 0;
    s.tiles.forEach((t, i) => { if (!t.line || t.fixed) return; while (t.mask !== t.solved && turns < 100) { rotateTile(s, i); turns++; } });
    assert.equal(s.solved, true, id);
    assert.equal(turns, parMoves(id), `${id} par`);
    assert.equal(rotateTile(s, 1).ok, false, 'no turning once solved');
  }
  const stuck = createPuzzle('lockbox');
  const decoy = stuck.tiles.findIndex(t => !t.line && t.role === 'conduit');
  for (let i = 0; i < stuck.hintAfter; i++) rotateTile(stuck, decoy);
  assert.ok(stuck.hint != null && stuck.tiles[stuck.hint].line, 'a hint points at a tile on the line');
  assert.ok(createPuzzle('lockbox', { freeHint: true }).hint != null, 'Wisdom 6 starts with a hint');
  assert.ok(createPuzzle('lockbox', { hintBonus: 2 }).hintAfter < stuck.hintAfter);
  const fixed = createPuzzle('lockbox');
  assert.equal(rotateTile(fixed, fixed.tiles.findIndex(t => t.role === 'source')).ok, false);
});

test('exploration hop: flies on the shared flight code to each giver and docks; points of interest scan', () => {
  assert.deepEqual(GIVER_PLACE, { hask: 'alpha', vey: 'beacon', garrity: 'dustfall' });
  for (const to of ['dustfall', 'alpha', 'beacon']) {
    const h = createHop({ to });
    let i = 0, events = [];
    while (!h.arrived && i < 60 * 90) { stepHop(h, autopilot(h)); events.push(...h.events); i++; }
    assert.ok(h.arrived, `reached ${to}`);
    assert.deepEqual(events.filter(e => e.type === 'arrived')[0], { type: 'arrived', place: to, giver: PLACES[to].giver });
  }
  const poi = POIS.find(p => p.id === 'derelict-pod');
  const h = createHop({ to: 'alpha' });
  Object.assign(h.ship, { x: poi.x + 1, y: poi.y, vx: 0, vy: 0 });
  const seen = [];
  for (let i = 0; i < 120; i++) { stepHop(h, { brake: true }); seen.push(...h.events.filter(e => e.type === 'poi').map(e => e.id)); }
  assert.deepEqual(seen, ['derelict-pod']);
  assert.ok(createHop({ to: 'alpha', visited: ['derelict-pod'] }).seen.includes('derelict-pod'));
  // The touch stick steers toward where it points.
  const s = steerToward({ angle: 0 }, { x: 0, y: 1 });
  assert.ok(s.turn > 0 && s.thrust === 0);
});

test('events follow ROUND2-CONTRACT: names, stations, cast; the bus and the window both hear them', () => {
  assert.equal(TUTORIAL_EVENTS.moved, 'tutorial:moved');
  assert.equal(TUTORIAL_EVENTS.arrived, 'tutorial:arrived');
  assert.equal(TUTORIAL_EVENTS.mined, 'tutorial:mined');
  assert.equal(TUTORIAL_EVENTS.shot, 'tutorial:shot');
  assert.equal(TUTORIAL_EVENTS.solved, 'tutorial:solved');
  assert.equal(TUTORIAL_EVENTS.exploreArrived, 'explore:arrived');
  assert.equal(TUTORIAL_EVENTS.launched, 'explore:launched');
  assert.equal(metEvent('ralph'), 'met:ralph');
  assert.deepEqual([...STATIONS].sort(), ['backroom', 'board', 'hatch', 'kennel', 'locker', 'pad', 'quarters', 'range', 'scrap']);
  assert.deepEqual([...CAST].sort(), ['chibby', 'edna', 'garrity', 'hask', 'mel', 'ralph', 'vey']);
  const heard = [];
  const target = new EventTarget();
  const emit = createEmitter({ bus: { emit: (type, detail) => heard.push(['bus', type, detail]) }, target });
  target.addEventListener('stardust:tutorial', e => heard.push(['window', e.detail.event, e.detail.ore]));
  emit('tutorial:mined', { ore: 3 });
  assert.deepEqual(heard, [['bus', 'tutorial:mined', { ore: 3 }], ['window', 'tutorial:mined', 3]]);
  const quiet = createEmitter({ bus: { emit: () => { throw new Error('boom'); } }, target: null });
  const warn = console.warn; console.warn = () => {};
  try { assert.doesNotThrow(() => quiet('x')); } finally { console.warn = warn; }
});

test('quest on-foot step: still rolls, and also takes a live result', () => {
  const state = createFoot({ enemy: { name: 'Raiders', hp: 45 }, title: 'Dock brawl' });
  const v = viewFoot(state, { run: { seed: 4, steps: 2 } });
  assert.equal(v.live.kind, 'foot');
  assert.equal(v.live.setup.map, 'moon-outpost');
  assert.equal(v.live.setup.enemies.length, 3);
  assert.deepEqual(v.moves.map(m => m.id), ['fight', 'retreat']);
  assert.match(actFoot(createFoot({}), { type: 'live', outcome: 'nope' }, {}).error, /Unknown/);
  const won = createFoot({});
  actFoot(won, { type: 'live', outcome: 'win', hp: 40 }, {});
  assert.equal(won.done, true); assert.equal(won.outcome, 'win');
});

test('the on-foot layers name no CDN and use textContent for text (offline, safe)', () => {
  const files = ['onfoot/world.js', 'onfoot/onfoot.js', 'onfoot/draw.js', 'onfoot/talk.js', 'onfoot/miningView.js', 'onfoot/puzzleView.js', 'onfoot/footFight.js', 'onfoot/input.js', 'onfoot/preview.js', 'explore/hop.js', 'onfoot/index.html'];
  for (const f of files) {
    const text = readFileSync(new URL(f, ROOT), 'utf8');
    assert.doesNotMatch(text, /https?:\/\/(?!127\.0\.0\.1|www\.w3\.org)/, `${f} loads nothing from the network`);
    assert.doesNotMatch(text, /innerHTML|insertAdjacentHTML|document\.write/, `${f} uses textContent`);
  }
});
