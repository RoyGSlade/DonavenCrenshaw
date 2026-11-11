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
import { effect, hasUnlock, activityValue } from '../projects/Space-Shooter/voyage/character.js';
import { SKILLS } from '../projects/Space-Shooter/voyage/data.js';
import { missing } from '../projects/Space-Shooter/voyage/economy.js';

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

test('footStats reads the contract stat effects (Health, Dexterity, Strength); boons and skills do not touch the sidearm', () => {
  const plain = footStats(null);
  assert.equal(plain.hp, 60);
  assert.equal(plain.spreadScale, 1); assert.equal(plain.speedScale, 1); assert.equal(plain.melee, 0);
  const tough = { stats: { str: 6, con: 6, dex: 6, wis: 3, cha: 3 }, skills: { brawler: 2, gunner: 3 }, earned: 0, permanent: 0 };
  const s = footStats(tough, { effect });
  assert.ok(s.hp > plain.hp, 'Health adds hp (foot.hp)');
  assert.ok(s.speedScale > 1, 'Dexterity adds foot speed (foot.speed)');
  assert.ok(s.spreadScale < 1, 'Dexterity steadies the aim (aim)');
  assert.ok(s.melee > 0, 'Strength adds melee');
  assert.equal(s.damage, plain.damage, 'no stat tag raises sidearm damage any more');
  assert.equal(s.dashCooldown, plain.dashCooldown, 'dodge is not a stat tag any more');
  assert.equal('guard' in s, false); assert.equal('assist' in s, false);
  // A 6 in Health used to shrug off the first hit (a boon); boons are gone, so the first hit lands.
  const f = createFight({ map: fightMap, spawn: 'fight', enemies: [{ type: 'target', at: [18, 1] }], player: s });
  f.player.iframes = 0;
  const hp = f.player.hp;
  f.bullets.push({ x: f.player.x + 30, y: f.player.y, px: f.player.x + 30, py: f.player.y, vx: -600, vy: 0, owner: 'enemy', damage: 9, life: 1 });
  for (let i = 0; i < 10; i++) stepFight(f, {}, STEP);
  assert.equal(f.player.hp, hp - 9);
  // A 6 in Dexterity used to pull the sidearm onto targets (a boon); the shot now goes where the reticle points.
  const g = createFight({ map: fightMap, spawn: { x: 3 * T, y: 7.5 * T, angle: 0 }, enemies: [{ type: 'target', x: 6 * T, y: 9 * T }], player: s });
  for (let i = 0; i < 20; i++) stepFight(g, { aim: 0, fire: true }, STEP);
  assert.equal(g.enemies[0].hp, ENEMY_TYPES.target.hp, 'no aim assist: a shot straight ahead misses a target off to the side');
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
  // Strength digs faster (mine.speed).
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
  assert.equal(createPuzzle('lockbox', { freeHint: true }).hint, null, 'no free hint any more: the Wisdom 6 boon is gone');
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

import { activityMods, hasAccess, accessReason, unlocksFor, gateFor, ACTIVITY_IDS } from '../projects/Space-Shooter/voyage/onfoot/rules/activity.js';
import { createHack, stepHack, splice, cursorInWindow } from '../projects/Space-Shooter/voyage/onfoot/rules/hack.js';
import { wallPiece } from '../projects/Space-Shooter/voyage/onfoot/rules/walls.js';
import { registerMap, setRoomDresser, setVisitSeed, mapDef, enterMap, FRESH_TRIES } from '../projects/Space-Shooter/voyage/maps/index.js';
import { validateMap, designChecks } from '../projects/Space-Shooter/voyage/procgen/index.js';
import { dressRoom } from '../projects/Space-Shooter/voyage/procgen/dress.js';
import { unturnedBox } from '../projects/Space-Shooter/voyage/onfoot/rules/geom.js';
import TUNING from '../projects/Space-Shooter/voyage/onfoot/tuning.json' with { type: 'json' };

test('skills unlock things by level: skill data lives only in data.js; onfoot reads it through character.js', () => {
  // No stand-in table, no boons, in onfoot's own tuning.
  assert.equal('skillLevels' in TUNING, false); assert.equal('statBoons' in TUNING, false);
  // Every activity id onfoot understands is a real one in the skills' level data (contract section 9).
  const real = new Set(SKILLS.flatMap(sk => sk.levels.flatMap(l => l.unlocks.filter(u => u.type === 'activity').map(u => u.id))));
  for (const id of Object.keys(ACTIVITY_IDS)) assert.ok(real.has(id), `${id} is a contract activity id`);
  for (const id of ['hack.time', 'mine.sweet-spot', 'repair.time', 'lock.pins', 'explore.scan', 'salvage.yield']) assert.ok(ACTIVITY_IDS[id], `onfoot maps ${id}`);

  const none = { skills: {} };
  const hacker2 = { stats: { str: 3, con: 3, dex: 3, wis: 3, cha: 3 }, earned: 0, permanent: 0, skills: { hacker: 2, salvager: 1, lockpick: 2, mechanic: 2, navigator: 1 } };
  const hacker3 = { ...hacker2, skills: { ...hacker2.skills, hacker: 3 } };
  assert.deepEqual(activityMods(none, 'hack').ids, []);
  // Hacker: hack.time +5 s at rank 1, another +5 s at rank 3 (the values come from SKILLS).
  assert.equal(activityMods({ skills: { hacker: 1 } }, 'hack').time, 5);
  assert.equal(activityMods({ skills: { hacker: 2 } }, 'hack').time, 5, 'rank 2 gives access and an ability, no more time');
  assert.equal(activityMods(hacker3, 'hack').time, 10);
  assert.equal(activityMods(hacker3, 'hack').time, activityValue(hacker3, 'hack.time'));
  assert.match(activityMods(hacker3, 'hack').texts[0], /hack timer/);
  assert.ok(Math.abs(activityMods(hacker2, 'mine').sweet - 0.2) < 1e-9, 'Salvager 1: mining sweet spot 20% bigger');
  assert.equal(activityMods(hacker2, 'lock').pins, 2, 'Lockpick 1+2: two pins fewer');
  assert.ok(Math.abs(activityMods(hacker2, 'repair').time - 0.4) < 1e-9, 'Mechanic 1+2: repairs 40% quicker');
  assert.ok(Math.abs(activityMods(hacker2, 'explore').scan - 0.25) < 1e-9, 'Navigator 1: scanner reach 25% further');
  assert.equal(activityMods({ skills: { brawler: 2 } }, 'foot').ids.length, 0, 'no sidearm upgrades come from skills');
  // The minigames read them.
  const easy = createHack({ difficulty: 2, seed: 3, mods: activityMods(hacker3, 'hack') }), hard = createHack({ difficulty: 2, seed: 3 });
  assert.equal(easy.time, hard.time + 10);
  assert.equal(easy.allowed, hard.allowed, 'no extra misses any more');
  assert.equal(easy.tumblers[0].width, hard.tumblers[0].width, 'windows are not widened any more');
  const mineBase = createMining({}), mineSkill = createMining({ mods: activityMods(hacker2, 'mine') });
  assert.ok(Math.abs(mineSkill.band - mineBase.band * 1.2) < 1e-9);
  const pins = (c, pick) => createHack({ difficulty: 1, seed: 2, mods: activityMods(c, 'lock'), pick }).tumblers.length;
  assert.equal(pins(none, true), 3); assert.equal(pins(hacker2, true), 2, 'Lockpick takes pins off a pick lock, never below 2');
  assert.equal(pins(hacker2, false), 3, 'a hack lock is not a pick lock');
  // Salvage yield: one more part from a run that dug anything.
  const dig = (mods) => { const m = createMining({ seed: 5, mods }); for (let i = 0; i < 60 * 30 && !m.done; i++) stepMining(m, { drill: m.heat < (bandAt(m)[0] + bandAt(m)[1]) / 2 }, 1 / 60); return m.result; };
  assert.equal(dig({ yield: 1 }).ore, dig({}).ore + 1);
  assert.equal(createMining({ mods: { yield: 1 } }).bonus, 1);
  // Access: "needs Hacker 2" is the contract's door.sealed; a higher rank holds the lower access.
  assert.equal(hasAccess(none, 'door.sealed'), false);
  assert.equal(hasAccess({ skills: { hacker: 1 } }, 'door.sealed'), false);
  assert.equal(hasAccess(hacker2, 'door.sealed'), true);
  assert.equal(hasAccess(hacker2, 'terminal'), true, 'rank 2 keeps rank 1\'s access');
  assert.equal(hasAccess(hacker2, 'access:door.sealed'), true, 'the access: prefix is tolerated');
  assert.equal(hasAccess(none, null), true, 'no gate, no skill needed');
  assert.equal(hasUnlock(hacker2, 'access', 'door.sealed'), true);
  // The reason text is core's: "Needs Hacker rank 2." (level 1 reads "Needs the Hacker skill.").
  assert.equal(accessReason('door.sealed'), 'Needs Hacker rank 2.');
  assert.equal(accessReason('terminal'), 'Needs the Hacker skill.');
  assert.equal(accessReason('door.locked'), 'Needs the Lockpick skill.');
  assert.equal(accessReason('nonsense'), 'Locked.');
  assert.deepEqual(missing(none, { skills: { hacker: 2 } }), ['Needs Hacker rank 2.'], 'requires: { skills } says the same thing');
  assert.ok(unlocksFor(hacker2).every(u => ['activity', 'access', 'ability'].includes(u.type)));
});

test('hacking: splicing inside the window sets tumblers and opens the lock; misses trip the trace; time runs out', () => {
  const play = (good) => {
    const h = createHack({ difficulty: 1, seed: 11 });
    for (let i = 0; i < 60 * 30 && !h.done; i++) {
      stepHack(h, 1 / 60);
      if (good ? cursorInWindow(h) : i % 20 === 0 && !cursorInWindow(h)) splice(h);
    }
    return h.result;
  };
  assert.equal(play(true).success, true);
  const bad = play(false);
  assert.equal(bad.success, false); assert.equal(bad.how, 'trace');
  const idle = createHack({ difficulty: 1 });
  for (let i = 0; i < 60 * 40 && !idle.done; i++) stepHack(idle, 1 / 60);
  assert.equal(idle.result.how, 'timeout');
  assert.ok(createHack({ difficulty: 3 }).tumblers.length > createHack({ difficulty: 1 }).tumblers.length);
});

test('gated content is data: a hackable staff door, a skill-gated console, a hackable cache', () => {
  assert.deepEqual(MAP_DEFS.cantina.doors.find(d => d.id === 'staff').lock, { hack: 1 });
  const reactor = MAP_DEFS['moon-outpost'].props.find(p => p.interact?.id === 'reactor').interact;
  assert.equal(reactor.access, 'door.sealed', 'the reactor needs the contract id for Hacker 2, not a stand-in id');
  assert.equal(MAP_DEFS['moon-outpost'].props.find(p => p.interact?.kind === 'hack').interact.level, 1);
  // No map names an access id the skills do not grant (and none of the old stand-in ids is left).
  const granted = new Set(SKILLS.flatMap(sk => sk.levels.flatMap(l => l.unlocks.filter(u => u.type === 'access').map(u => u.id))));
  for (const def of Object.values(MAP_DEFS)) {
    for (const g of [...def.props.map(p => p.interact), ...def.doors].filter(Boolean)) {
      if (g.access) assert.ok(granted.has(g.access), `${def.id}: ${g.access} is a contract access id`);
      for (const [skill, rank] of Object.entries(g.requires?.skills || {})) assert.ok(SKILLS.find(sk => sk.id === skill)?.max >= rank, `${def.id}: ${skill} ${rank}`);
    }
  }
  assert.doesNotMatch(readFileSync(new URL('maps/moon-outpost.json', ROOT), 'utf8'), /slicer/);
});

test('gates say what is missing in core\'s words, and a pick lock needs Lockpick', () => {
  const hacker1 = { stats: {}, skills: { hacker: 1 } }, hacker2 = { stats: {}, skills: { hacker: 2 } };
  const reactor = MAP_DEFS['moon-outpost'].props.find(p => p.interact?.id === 'reactor').interact;
  assert.deepEqual(gateFor(reactor, { character: hacker1 }), { reason: 'Needs Hacker rank 2.' });
  assert.equal(gateFor(reactor, { character: hacker2 }), null);
  assert.deepEqual(gateFor({ requires: { skills: { hacker: 2 } } }, { character: hacker1, save: { character: hacker1 } }), { reason: 'Needs Hacker rank 2.' });
  assert.equal(gateFor({ requires: { skills: { hacker: 2 } } }, { character: hacker1 }), null, 'requires needs a save to read; without one it does not gate');
  // Hack locks are open to anyone; the hack minigame is the way in.
  assert.deepEqual(gateFor({ lock: { hack: 2 } }, { character: null }), { reason: 'Locked.', hack: 2 });
  // Pick locks need Lockpick 1 (door.locked), then run the same ring read as pins.
  assert.deepEqual(gateFor({ lock: { pick: 2 } }, { character: hacker2 }), { reason: 'Needs the Lockpick skill.' });
  assert.deepEqual(gateFor({ lock: { pick: 2 } }, { character: { skills: { lockpick: 1 } } }), { reason: 'Locked.', hack: 2, pick: true });
  assert.equal(gateFor(null), null);
  assert.equal(gateFor({ label: 'plain' }), null);
});

test('interior walls: the right piece for each wall tile (art/interiors README)', () => {
  // A 4x4 room: corners, edges.
  const grid = ['####', '#..#', '#..#', '####'];
  const open = (r, c) => grid[r]?.[c] === '.';
  assert.equal(wallPiece(open, 0, 1), 'edge-n');
  assert.equal(wallPiece(open, 3, 1), 'edge-s');
  assert.equal(wallPiece(open, 1, 0), 'edge-w');
  assert.equal(wallPiece(open, 1, 3), 'edge-e');
  assert.equal(wallPiece(open, 0, 0), 'corner-nw');
  assert.equal(wallPiece(open, 3, 3), 'corner-se');
  const l = ['####', '#..#', '#.##', '####'];
  const openL = (r, c) => l[r]?.[c] === '.';
  assert.equal(wallPiece(openL, 2, 2), 'outer-nw', 'the corner sticking into an L-shaped room');
});

test('maps can come from the procedural dresser or be registered at runtime', () => {
  const shell = { id: 'test-room', name: 'Test room', grid: ['#####', '#...#', '#...#', '#####'], spawns: { default: [2, 2, 'up'] }, doors: [{ id: 'out', at: [2, 3], to: 'hangar', arrive: 'default' }], dress: { seed: 4 } };
  const compiled = registerMap(shell);
  assert.equal(compiled.id, 'test-room');
  assert.equal(mapDef('test-room'), shell);
  let called = null;
  setRoomDresser((map, { seed }) => { called = seed; return { props: [{ art: 'crate-small', at: [1, 1], block: 'low' }] }; });
  try {
    registerMap({ ...shell, id: 'test-room-2' });
    assert.equal(called, null, 'registered maps are used as given');
    assert.throws(() => registerMap({ id: 'bad', grid: ['?'] }));
  } finally { setRoomDresser(null); }
});

test('rotated props: the art is fitted into the UNturned box, then turned (no squashing)', () => {
  // A 2x1 desk turned a quarter has map size 1x2: the art box is 2x1 again.
  assert.deepEqual(unturnedBox(48, 96, Math.PI / 2), { w: 96, h: 48, turned: true });
  assert.deepEqual(unturnedBox(48, 96, -Math.PI / 2), { w: 96, h: 48, turned: true });
  assert.deepEqual(unturnedBox(96, 48, 0), { w: 96, h: 48, turned: false });
  assert.deepEqual(unturnedBox(96, 48, Math.PI), { w: 96, h: 48, turned: false }, 'a half turn keeps the box');
  assert.equal(unturnedBox(48, 96, Math.PI * 3 / 2).turned, true);
  assert.equal(unturnedBox(48, 96, Math.PI / 2 + 0.1).turned, true, 'a little jitter on a turned prop is still a turn');
  assert.deepEqual(unturnedBox(48, 96, 0.7), { w: 48, h: 96, turned: false }, 'a free angle (a scattered rock) is not a turn: size is already its box');
  // drawContained turns about the prop centre with the swapped box (a fake canvas records the calls).
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (...a) => { calls.push([k, ...a]); }, set: () => true });
  return import('../projects/Space-Shooter/voyage/onfoot/draw.js').then(({ drawContained }) => {
    const art = { width: 200, height: 100 }; // a 2:1 desk
    const p = { x: 96, y: 48, w: 48, h: 96, cx: 120, cy: 96, rot: Math.PI / 2 };
    drawContained(ctx, art, p);
    const img = calls.find(c => c[0] === 'drawImage');
    assert.deepEqual(img.slice(2), [120 - 48, 96 - 24, 96, 48], 'drawn 2 tiles by 1 tile, centred on the prop, before the quarter turn');
    assert.ok(calls.some(c => c[0] === 'rotate' && Math.abs(c[1] - Math.PI / 2) < 1e-9));
    assert.ok(calls.some(c => c[0] === 'translate' && c[1] === 120 && c[2] === 96), 'turned about the prop centre');
  });
});

test('every story map is valid for procgen (validateMap on whole tiles); the generic cantina falls back to a valid hand-made room', () => {
  const story = ['hangar', 'ship', 'workshop', 'mel-bay', 'edna-den', 'hask-office', 'vey-lounge', 'garrity-office', 'moon-outpost', 'cantina'];
  for (const id of story) {
    const v = validateMap(MAP_DEFS[id]);
    assert.deepEqual(v.problems, [], `${id} breaks procgen's hard rules`);
    assert.equal(v.ok, true);
  }
  // Every walkable map in the folder is covered by the list above (a new map file must be added to it).
  assert.deepEqual(Object.keys(MAP_DEFS).sort(), [...story].sort());
  // designChecks is information, not a rule: it must run on every map.
  for (const id of story) assert.equal(typeof designChecks(MAP_DEFS[id]).total, 'number');
  // The people stay reachable to talk to: an npc needs an open tile beside them.
  for (const id of story) for (const n of MAP_DEFS[id].npcs) {
    const map = getMap(id);
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walkable(map, (n.at[0] + 0.5 + dx) * T, (n.at[1] + 0.5 + dy) * T, 13));
    assert.ok(near, `${id}: somebody can stand next to ${n.id}`);
  }
});

test('generic places are dressed fresh on every visit with a new seed; story places stay as made', () => {
  const must = (map) => map.interacts.filter(i => i.kind === 'console').map(i => i.id).sort().join();
  assert.deepEqual(MAP_DEFS.cantina.dress, { fresh: true, type: 'cantina' });
  const seen = new Set();
  const seeds = [];
  setVisitSeed(() => { const s = 1000 + seeds.length * 7919; seeds.push(s); return s; });
  try {
    for (let i = 0; i < 12; i++) {
      const m = enterMap('cantina');
      assert.equal(m.visit.fallback, false);
      assert.equal(m.visit.seed, seeds[i], 'each visit takes a new seed');
      assert.deepEqual(validateMap(m.def).problems, [], `visit ${i} is a valid room`);
      assert.deepEqual(checkMaps({ ...MAP_DEFS, cantina: m.def }, { puzzles: PUZZLES, stations: STATIONS }).problems, [], 'spawns and doors still link up');
      assert.equal(must(m), 'bar,jukebox,vending', 'the must-have interacts come back each time');
      // The shell is the file's: doors (the hackable staff door), spawns, grid, name.
      assert.deepEqual(m.def.doors, MAP_DEFS.cantina.doors);
      assert.deepEqual(m.def.spawns, MAP_DEFS.cantina.spawns);
      assert.deepEqual(m.def.grid, MAP_DEFS.cantina.grid);
      assert.deepEqual(m.def.doors.find(d => d.id === 'staff').lock, { hack: 1 });
      seen.add(JSON.stringify(m.def.props.map(p => [p.art, p.at])));
    }
    assert.ok(seen.size >= 10, `12 visits gave ${seen.size} different rooms`);
    assert.equal(getMap('cantina').visit.seed, seeds[11], 'getMap answers with the room as last visited');
    // The same seed dresses the same room (the dresser is deterministic): a visit can be replayed.
    assert.deepEqual(enterMap('cantina', { seed: 77 }).def.props, enterMap('cantina', { seed: 77 }).def.props);
    // Story places are entered as made: the same compiled map every time.
    assert.equal(enterMap('hangar'), enterMap('hangar'));
    assert.equal(enterMap('ship').def, MAP_DEFS.ship);
  } finally { setVisitSeed(null); }
});

test('a fresh dress that breaks a rule tries the next seed, then falls back to the hand-made props', () => {
  const shell = { id: 'fresh-room', name: 'Fresh room', grid: ['#######', '#.....#', '#.....#', '#.....#', '#######'], spawns: { default: [3, 2, 'up'] },
    doors: [{ id: 'out', at: [3, 4], size: [1, 1], to: 'hangar', arrive: 'default' }], dress: { fresh: true, type: 'workshop' },
    props: [{ art: 'crate-small', at: [1, 1], size: [1, 1], block: 'low' }] };
  registerMap(shell);
  const calls = [];
  // A dresser whose first two seeds overlap two props, then a good one.
  setRoomDresser((map, { seed }) => { calls.push(seed); return { props: seed < 12 ? [{ art: 'crate-small', at: [1, 1], size: [1, 1], block: 'low' }, { art: 'crate-small', at: [1, 1], size: [1, 1], block: 'low' }] : [{ art: 'crate-small', at: [4, 1], size: [1, 1], block: 'low' }] }; });
  try {
    const m = enterMap('fresh-room', { seed: 10 });
    assert.deepEqual(calls, [10, 11, 12], 'seeds 10 and 11 broke a rule; the next one was tried');
    assert.deepEqual(m.visit, { seed: 12, tries: 3, fallback: false });
    assert.deepEqual(m.def.props[0].at, [4, 1]);
    // Never a valid room: the hand-made props come back, after a few tries.
    calls.length = 0;
    setRoomDresser(() => { calls.push(1); return { props: [{ art: 'crate-small', at: [0, 0], size: [1, 1], block: true }] }; }); // inside a wall
    const kept = enterMap('fresh-room', { seed: 5 });
    assert.equal(calls.length, FRESH_TRIES);
    assert.equal(kept.visit.fallback, true);
    assert.deepEqual(kept.def.props, shell.props, 'the hand-made props are the fallback');
    // A dresser that throws is a failed seed, not a crash.
    setRoomDresser(() => { throw new Error('boom'); });
    assert.equal(enterMap('fresh-room', { seed: 5 }).visit.fallback, true);
    // No dresser (null = procgen's own): the real dresser makes a valid room from this shell.
    setRoomDresser(null);
    const real = enterMap('fresh-room', { seed: 3 });
    assert.equal(real.visit.fallback, false);
    assert.deepEqual(validateMap(real.def).problems, []);
  } finally { setRoomDresser(null); }
  // The dresser is registered by the maps module itself: a map with a one-off dress seed and no props is
  // dressed on first entry with no setup, then kept (a story place is dressed once and fixed).
  const once = registerMap({ ...shell, id: 'dress-once', props: [], dress: { seed: 4, type: 'workshop' } });
  assert.equal(once.props.length, 0, 'registered maps are used as given');
  setRoomDresser(null); // clears the cache; the next getMap dresses
  const dressed = getMap('dress-once');
  assert.ok(dressed.props.length > 0, 'procgen dressed it');
  assert.equal(getMap('dress-once'), dressed, 'dressed once, then kept');
  assert.deepEqual(validateMap(dressed.def).problems, []);
  assert.deepEqual(dressed.def.props, dressRoom(mapDef('dress-once'), { seed: 4 }).props, 'seed 4, as the file says');
});
