// The workbench room (launch workbench lane): a dev-only test room opened with ?newgame=1&start=workbench.
// Pure rules here (state, stations, talks, spar, the map and the entry guard); the page is in stardust-workbench-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runtimeConfig } from '../projects/Space-Shooter/runtime-config.js';
import { compileMap, checkMaps, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { validateMap } from '../projects/Space-Shooter/voyage/procgen/index.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { createFight, stepFight, ENEMY_TYPES } from '../projects/Space-Shooter/voyage/onfoot/rules/shooter.js';
import { LOOK_ART } from '../projects/Space-Shooter/voyage/onfoot/look/lookArt.js';
import { GYM_GAMES } from '../projects/Space-Shooter/voyage/minigames/gym.js';
import { tierOf } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { unscanned } from '../projects/Space-Shooter/voyage/minigames/progress.js';
import { newGameFlag } from '../projects/Space-Shooter/voyage/flag.js';
import { WORKBENCH_DEF, WORKBENCH_ID } from '../projects/Space-Shooter/voyage/workbench/map.js';
import { YARD_DEF } from '../projects/Space-Shooter/voyage/workbench/yard.js';
import { wantsWorkbench } from '../projects/Space-Shooter/voyage/workbench/entry.js';
import * as S from '../projects/Space-Shooter/voyage/workbench/state.js';
import { STATIONS, stationOfProp, rollStation, startStation, settleStation, specOf, GAME_IDS, loadoutOf, previewLine } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { TALKS, TALK_WHO, talkIssues, nextAfterCheck } from '../projects/Space-Shooter/voyage/workbench/talks.js';
import { sparSetup, sparXp, sparSaid } from '../projects/Space-Shooter/voyage/workbench/spar.js';
import { ready as modulesReady } from '../projects/Space-Shooter/voyage/modules/registry.js';
await modulesReady(); // every game is a module: load the registry once

const VOYAGE = new URL('../projects/Space-Shooter/voyage/', import.meta.url).pathname;
const MAP = compileMap(WORKBENCH_DEF);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const roll = (n) => (n - 1) / 20 + 0.001; // an rng() value that makes the d20 land on n

// ---- the room ------------------------------------------------------------------------------------------------------
test('map: compiles, passes procgen rules, spawns and npcs stand on open floor', () => {
  assert.equal(WORKBENCH_ID, 'workbench');
  assert.deepEqual(checkMaps({ w: WORKBENCH_DEF, y: YARD_DEF }).problems, []);
  assert.equal(validateMap(WORKBENCH_DEF).ok, true);
  for (const s of Object.values(MAP.spawns)) assert.ok(walkable(MAP, s.x, s.y, 12));
  assert.deepEqual(MAP.npcs.map((n) => n.id).sort(), ['nessa', 'pip', 'tull']);
  assert.deepEqual(MAP.doors.map((d) => d.to), ['workbench-yard'], 'a closed room: its one door leads to the patrol yard annex and nowhere else');
});

test('map: every art it names is art the Duchess rooms or the look kit already use; it wears the Duchess freighter look', () => {
  assert.equal(WORKBENCH_DEF.look.set, 'freighter');
  const used = new Set();
  for (const def of Object.values(MAP_DEFS)) for (const p of [...(def.props || []), ...(def.look?.mounts || []), ...(def.look?.clutter || [])]) if (p.art) used.add(p.art);
  for (const p of [...WORKBENCH_DEF.props, ...(WORKBENCH_DEF.look.mounts || []), ...(WORKBENCH_DEF.look.clutter || [])]) if (p.art) assert.ok(LOOK_ART.prop[p.art] || used.has(p.art), `art ${p.art} is new`);
  for (const d of WORKBENCH_DEF.look.decals) if (d.art) assert.ok(LOOK_ART.decal[d.art] || LOOK_ART.prop[d.art], `decal ${d.art}`);
});

const EXPECT = ['wb-cut', 'wb-hook', 'wb-repair', 'wb-hack', 'wb-craft', 'wb-nav', 'wb-pilot', 'wb-stealth', 'wb-persuade', 'wb-intimidate', 'wb-haggle', 'wb-lock', 'wb-board', 'wb-scan', 'wb-reprint', 'wb-gym', 'wb-spar', 'wb-reset'];
test('map: one station for each of the nine games plus lock, board, scan, reprint, gym, spar and reset, each a station interact', () => {
  const ids = MAP.interacts.filter((i) => i.kind === 'station').map((i) => i.id).sort();
  assert.deepEqual(ids, [...EXPECT].sort());
  assert.equal(STATIONS.length, 9);
  assert.deepEqual([...GAME_IDS].sort(), STATIONS.map((s) => s.id).sort(), 'the nine games the gym knows are the nine stations');
  for (const s of STATIONS) assert.ok(ids.includes(s.prop), s.id);
});

// Flood fill on a half-tile grid: every station can be reached to within its interact reach, from the spawn.
test('map: every station and every npc can be reached on foot from the spawn', () => {
  const R = 12, STEP = 12;
  const key = (x, y) => `${x},${y}`;
  const start = MAP.spawns.default;
  const seen = new Set([key(Math.round(start.x / STEP), Math.round(start.y / STEP))]);
  const queue = [[Math.round(start.x / STEP), Math.round(start.y / STEP)]];
  while (queue.length) {
    const [gx, gy] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, ny = gy + dy, k = key(nx, ny);
      if (seen.has(k) || !walkable(MAP, nx * STEP, ny * STEP, R)) continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  const reachable = (it) => [...seen].some((k) => { const [gx, gy] = k.split(',').map(Number); return Math.hypot(gx * STEP - it.x, gy * STEP - it.y) <= it.reach - 6; });
  for (const it of MAP.interacts) assert.ok(reachable(it), `${it.kind}:${it.id} cannot be reached`);
});

test('map: the spar ring has its spawn, its exit lane and a fight that runs with the marauder type', () => {
  assert.ok(MAP.spawns.spar && MAP.zones.some((z) => z.id === 'spar-ring') && MAP.zones.some((z) => z.id === 'spar-exit'));
  const setup = sparSetup({ count: 3, seed: 5 });
  assert.equal(setup.enemies.length, 3);
  assert.ok(ENEMY_TYPES.marauder);
  const f = createFight({ map: MAP, spawn: setup.spawn, enemies: setup.enemies, player: { hp: 60 }, seed: setup.seed, exit: setup.exit });
  for (const e of f.enemies) assert.ok(walkable(MAP, e.x, e.y, e.kind.radius), 'enemy on open floor');
  for (let i = 0; i < 600; i++) stepFight(f, { move: { x: 0, y: 0 }, aim: 0, fire: false, dash: false }, 1 / 60);
  assert.ok(f.enemies.every((e) => e.type === 'marauder'));
});

// ---- the entry guard -------------------------------------------------------------------------------------------------
test('entry: only with the new-game switch AND start=workbench; the shipped switch stays off', () => {
  assert.equal(runtimeConfig.newGame, false, 'runtimeConfig.newGame stays false');
  const q = (s) => new URLSearchParams(s);
  assert.equal(wantsWorkbench({ flagEnabled: true, params: q('newgame=1&start=workbench') }), true);
  assert.equal(wantsWorkbench({ flagEnabled: false, params: q('start=workbench') }), false);
  assert.equal(wantsWorkbench({ flagEnabled: true, params: q('start=hangar') }), false);
  assert.equal(wantsWorkbench({ flagEnabled: true, params: q('') }), false);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  assert.equal(newGameFlag({ config: runtimeConfig, search: '?start=workbench', storage }).enabled, false, 'no flag, no room');
});

// (The shared full-screen helper workbench/fullScreen.js is plain DOM: importing it, as the scene mini-game sheet does, does not ask for the room.)
test('entry: no map, door, quest or link outside the room reaches it; only boot.js asks for it (talk/ and people/ are the room\'s social layer)', () => {
  assert.ok(!MAP_DEFS.workbench, 'not among the walkable places');
  for (const def of Object.values(MAP_DEFS)) for (const d of def.doors || []) assert.notEqual(d.to, 'workbench');
  const hits = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); const st = statSync(p); if (st.isDirectory()) { if (n === 'node_modules' || n === 'art' || n === 'audio') continue; walk(p); } else if (/\.(js|json|html)$/.test(n) && !p.includes('/voyage/workbench/') && !p.includes('/voyage/talk/') && !p.includes('/voyage/people/')) { const text = readFileSync(p, 'utf8'); if (/workbench\/|start=workbench|WORKBENCH_/.test(text) && text.replace(/import \{ openFullScreen \} from '\.\.\/workbench\/fullScreen\.js';/g, '').match(/workbench\/|start=workbench|WORKBENCH_/)) hits.push(relative(VOYAGE, p)); } } };
  walk(VOYAGE);
  assert.deepEqual(hits, ['boot.js'], 'only the page boot names the room');
  assert.ok(readFileSync(join(VOYAGE, 'boot.js'), 'utf8').includes('wantsWorkbench'));
});

// ---- the test character ----------------------------------------------------------------------------------------------
test('state: fresh is level 1 everywhere, 100 credits, scanned, normal difficulty; reset gives it back', () => {
  const s = S.freshState();
  assert.ok(Object.values(s.progress.levels).every((l) => l === 1));
  assert.equal(s.credits, 100); assert.equal(s.dc, 12);
  assert.equal(unscanned(s.progress, s.snap).safe, true);
  const used = S.earnXp(s, 'repair', 8).state;
  assert.deepEqual(S.reset().progress, s.progress);
  assert.notDeepEqual(used.progress, s.progress);
});

test('state: XP lands in the character, levels up on the curve (20 x level), one action pays at most 10', () => {
  let s = S.freshState();
  let r = S.earnXp(s, 'hacking', 8); s = r.state;
  assert.equal(r.xp, 8); assert.equal(s.progress.xp.hacking, 8); assert.equal(s.progress.levels.hacking, 1);
  r = S.earnXp(s, 'hacking', 99); // capped at 10
  assert.equal(r.xp, 10);
  s = r.state; assert.equal(s.progress.xp.hacking, 18);
  for (let i = 0; i < 2; i++) s = S.earnXp(s, 'hacking', 10).state; // 38
  assert.equal(s.progress.levels.hacking, 2); assert.equal(s.progress.xp.hacking, 18);
  assert.equal(S.characterOf(s).levels.hacking, 2, 'the character the d20 reads has the new level');
  assert.equal(S.earnXp(s, 'bogus', 5).xp, 0);
  assert.equal(S.earnXp(s, 'repair', 0).xp, 0);
});

test('state: points are held to the level (at most the level in total, 9 each) and show in the character', () => {
  let s = S.freshState();
  s = S.setPoints(s, 'repair', { time: 5, size: 5 });
  assert.equal(Object.values(s.progress.points.repair).reduce((a, b) => a + b, 0), 1, 'level 1 holds one point');
  for (let i = 0; i < 6; i++) s = S.earnXp(s, 'repair', 10).state; // 60 XP: 20 + 40 -> level 3
  assert.equal(s.progress.levels.repair, 3);
  s = S.setPoints(s, 'repair', { time: 2, quality: 1 });
  assert.deepEqual(S.characterOf(s).points.repair, { time: 2, size: 0, quality: 1 });
});

test('state: scan, die and reprint: the risk meter is live, death restores the scan and counts', () => {
  let s = S.freshState();
  for (let i = 0; i < 4; i++) s = S.earnXp(s, 'repair', 10).state; // level 2 with 20 into it
  s = S.earnXp(s, 'social', 5).state;
  let u = unscanned(s.progress, s.snap);
  assert.equal(u.safe, false); assert.equal(u.xp, 45); assert.equal(u.points, 1);
  s = S.scan(s);
  assert.equal(unscanned(s.progress, s.snap).safe, true); assert.equal(s.scans, 1);
  s = S.earnXp(s, 'repair', 10).state;
  const before = s.progress.levels.repair;
  const d = S.die(s);
  assert.equal(d.state.deaths, 1);
  assert.deepEqual(d.state.progress.levels, s.snap.levels);
  assert.deepEqual(d.state.progress.xp, s.snap.xp);
  assert.equal(d.lost.xp, 10);
  assert.ok(/10 XP gone/.test(d.state.said), d.state.said);
  assert.equal(S.die(d.state).state.said.startsWith('You died with nothing unscanned'), true);
  assert.ok(before >= 2);
});

test('state: difficulty dial, credits, and a state read from broken storage JSON is always whole', () => {
  let s = S.freshState();
  assert.deepEqual([s.dc, (s = S.nextDc(s)).dc, (s = S.nextDc(s)).dc, (s = S.nextDc(s)).dc], [12, 16, 8, 12]);
  assert.equal(S.withCredits(s, -4).credits, 0);
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(S.saveState(S.earnXp(s, 'repair', 6).state, storage), true);
  assert.equal(S.loadState(storage).progress.xp.repair, 6);
  mem.set(S.STORAGE_KEY, '{"progress":{"levels":{"repair":77,"hacking":"x"},"xp":{"repair":-4}},"credits":"lots","dc":13}');
  const l = S.loadState(storage);
  assert.equal(l.progress.levels.repair, 9); assert.equal(l.progress.levels.hacking, 1); assert.equal(l.progress.xp.repair, 0); assert.equal(l.credits, 100); assert.equal(l.dc, 12);
  mem.set(S.STORAGE_KEY, 'not json'); assert.equal(S.loadState(storage).credits, 100);
  assert.equal(S.loadState(null).credits, 100);
});

// ---- the nine stations ------------------------------------------------------------------------------------------------
test('stations: the d20 uses the real level (and only the level and points move the roll)', () => {
  let s = S.freshState();
  const repair = STATIONS.find((x) => x.id === 'repair');
  let a = rollStation(s, repair, () => roll(10));
  assert.equal(a.roll, 10); assert.equal(a.level, 1); assert.equal(a.total, 11); assert.equal(a.dc, 12); assert.equal(a.skill, 'repair'); assert.equal(a.statMod, 0);
  for (let i = 0; i < 6; i++) s = S.earnXp(s, 'repair', 10).state; // level 3
  a = rollStation(s, repair, () => roll(10));
  assert.equal(a.total, 13); assert.equal(a.pass, true);
  assert.equal(rollStation(S.nextDc(s), repair, () => roll(10)).dc, 16);
  assert.equal(rollStation(s, repair, () => roll(20)).natural, true);
  assert.deepEqual(specOf(repair, 16), { skill: 'repair', stat: 'wis', tag: 'repair', dc: 16 });
});

test('stations: all nine start a game at the rolled tier with level and points applied, and say what the roll did', () => {
  let s = S.freshState();
  for (let i = 0; i < 20; i++) for (const sk of ['repair', 'hacking', 'social', 'crafting', 'navigation', 'stealth', 'piloting']) s = S.earnXp(s, sk, 10).state;
  for (const st of STATIONS) {
    const lv = s.progress.levels[st.skill];
    assert.ok(lv >= 5, `${st.skill} level ${lv}`);
    const lo = startStation(s, st, { total: 2, dc: 12, natural: false });
    const hi = startStation(s, st, { total: 24, dc: 12, natural: false });
    assert.equal(lo.tier, tierOf({ total: 2, dc: 12 })); assert.equal(hi.tier, 2);
    assert.ok(lo.setup && hi.setup && lo.setup.tier === lo.tier, st.id);
    assert.notDeepEqual(lo.setup, hi.setup, `${st.id}: the roll changes the game`);
    assert.ok(/roll:/.test(previewLine(hi)), previewLine(hi));
    assert.equal(hi.level, lv);
  }
  // points shown in the setup: each Repair point in time gives 6 more capacity than none (repair v2: the pool is the timer)
  const repair = STATIONS[0];
  const none = startStation(s, repair, { total: 12, dc: 12 }).setup;
  const withPts = startStation(S.setPoints(s, 'repair', { time: 3 }), repair, { total: 12, dc: 12 }).setup;
  assert.equal(withPts.capacity - none.capacity, 18);
  assert.deepEqual(loadoutOf(S.setPoints(s, 'repair', { time: 3 }), 'repair').points.time, 3);
});

test('stations: a finished game pays real XP, can level the skill up, haggle pays its price in credits', () => {
  let s = S.freshState();
  const repair = STATIONS.find((x) => x.id === 'repair'), haggle = STATIONS.find((x) => x.id === 'haggle');
  let r = settleStation(s, repair, { success: true, xp: 6 }); s = r.state;
  assert.equal(r.xp, 6); assert.equal(s.progress.xp.repair, 6); assert.ok(/\+6 Repair XP/.test(r.said), r.said);
  r = settleStation(s, repair, { success: false, xp: 0 }); assert.equal(r.xp, 0); assert.ok(/not this time/i.test(r.said));
  s = r.state;
  for (let i = 0; i < 2; i++) s = settleStation(s, repair, { success: true, xp: 10 }).state; // 26 XP: level 2
  assert.equal(s.progress.levels.repair, 2);
  assert.ok(/now level 2/.test(s.said), s.said);
  const credits = s.credits;
  r = settleStation(s, haggle, { outcome: 'well', xp: 4, price: 29, success: true });
  assert.equal(r.state.credits, credits + 29); assert.equal(r.credits, 29); assert.equal(r.state.progress.xp.social, 4);
  assert.equal(settleStation(s, haggle, { outcome: 'walked', xp: 0, price: 12 }).state.credits, credits);
  assert.equal(stationOfProp('wb-nav').id, 'nav'); assert.equal(stationOfProp('wb-board'), null);
});

test('stations: the gym trains the same nine games', () => {
  assert.deepEqual(GYM_GAMES.map((g) => g.id).sort(), STATIONS.map((s) => s.id).sort());
});

// ---- the conversations --------------------------------------------------------------------------------------------------
test('talks: Tull and Nessa each have a clean tree with one check (haggle, persuade) and an ending; Pip has the social lane\'s full conversation', () => {
  assert.deepEqual([...TALK_WHO].sort(), ['nessa', 'tull']);
  const games = [];
  for (const who of TALK_WHO) {
    assert.deepEqual(talkIssues(TALKS[who]), [], who);
    for (const n of Object.values(TALKS[who].nodes)) for (const c of n.choices || []) if (c.check) games.push(c.check.game);
  }
  assert.deepEqual(games.sort(), ['haggle', 'persuade']);
  assert.ok(talkIssues({ start: 'a', nodes: { a: { speaker: 'x', text: 'y', choices: [{ label: 'z', goto: 'nope' }] } } }).length >= 2);
  const choice = TALKS.tull.nodes.hello.choices[0];
  assert.deepEqual(['win', 'mid', 'lose'].map((b) => nextAfterCheck(choice, b)), ['well', 'fair', 'walked']);
});

test('talks: every speaker is a cast member the dialogue box knows', async () => {
  const { CAST } = await import('../projects/Space-Shooter/voyage/story/cast.js').catch(() => ({ CAST: {} }));
  for (const who of TALK_WHO) for (const n of Object.values(TALKS[who].nodes)) assert.ok(TALK_WHO.includes(n.speaker) || CAST[n.speaker], n.speaker);
});

// ---- the sparring spot ----------------------------------------------------------------------------------------------------
test('spar: placeholder shooting XP is 2 a kill, +2 for a clear ring, never over 10; words say what happened', () => {
  assert.equal(sparXp({ outcome: 'win', kills: 2 }), 6);
  assert.equal(sparXp({ outcome: 'lose', kills: 1 }), 2);
  assert.equal(sparXp({ outcome: 'flee', kills: 0 }), 0);
  assert.equal(sparXp({ outcome: 'win', kills: 4 }), 10);
  assert.ok(/Ring clear, 2 marauders down\. \+6 Shooting XP/.test(sparSaid({ outcome: 'win', kills: 2 }, 6)));
  assert.ok(/ring resets/.test(sparSaid({ outcome: 'lose', kills: 0 }, 0)));
  assert.equal(sparSetup({ count: 99 }).enemies.length, 4);
  assert.equal(sparSetup({ count: 0 }).enemies.length, 2);
});
