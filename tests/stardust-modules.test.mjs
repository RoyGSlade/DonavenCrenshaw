// The module registry (contract v1.1): rules over every registered module, the controller index, and the add-one tests
// (drop a folder, add ONE line to modules/list.js, change nothing else). These replace the old "nine games" count tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as R from '../projects/Space-Shooter/voyage/modules/registry.js';
import { MODULE_IDS } from '../projects/Space-Shooter/voyage/modules/list.js';
import { shelfRows, shelfGroups } from '../projects/Space-Shooter/voyage/modules/shelf.js';
import { playModule, stackPlay } from '../projects/Space-Shooter/voyage/modules/host.js';
import { ctxFromSave, applyEffects } from '../projects/Space-Shooter/voyage/modules/bind.js';
import { pickerLines } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { rollPreview } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { tierOf, tierInfo } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { hookIssues, startHook, branchOf, worldResult, xpEvent, HOOK_KINDS } from '../projects/Space-Shooter/voyage/minigames/sceneHook.js';
import { CONTEXTS } from '../projects/Space-Shooter/voyage/minigames/mirrors.js';
import { SYSTEMS } from '../projects/Space-Shooter/voyage/minigames/repair.js';
import { GYM_GAMES, gymGamesFor, gymSetup, gymGame } from '../projects/Space-Shooter/voyage/minigames/gym.js';
import { STATIONS } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const VOYAGE = path.join(here, '../projects/Space-Shooter/voyage');
const MODULES = path.join(VOYAGE, 'modules');
const FIXTURES = path.join(here, 'fixtures/modules');
const attempt = { total: 17, dc: 10, natural: false };

await R.ready();

// ---- rules over the registry (no counts) -------------------------------------------------------------------------------
test('every registered module has a manifest, a play function, a picker line, a roll preview and a setup', () => {
  assert.ok(R.list().length > 0);
  for (const m of R.list()) {
    assert.deepEqual(R.manifestIssues(m), [], m.id);
    assert.equal(typeof R.get(m.id).mod.play, 'function', `${m.id} play`);
    assert.ok(R.pickerLineOf(m.id).length > 3, `${m.id} picker line`);
    assert.ok(R.pickerOf(m.id).length > 0 && R.pickerOf(m.id).every((p) => typeof p.words === 'function'), `${m.id} picker words`);
    const preview = R.rollPreviewOf(m.id, attempt, { level: 3, points: {} }, { tierOf, tierInfo });
    assert.match(preview.line, /roll:/, `${m.id} roll preview`);
    assert.ok(R.setupOf(m.id, { tier: 1, level: 3, points: {} }), `${m.id} setup`);
    assert.ok(fs.existsSync(path.join(MODULES, m.id, 'manifest.json')), `${m.id} folder`);
  }
});
test('the list has no duplicates and no folder is left off it', () => {
  assert.equal(new Set(MODULE_IDS).size, MODULE_IDS.length);
  const folders = fs.readdirSync(MODULES, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
  for (const f of folders) assert.ok(MODULE_IDS.includes(f), `folder ${f} is not in modules/list.js`);
});
test('the gym, the stations and the scene hooks all name registered modules (the old nine-game count tests, as one rule)', () => {
  for (const g of GYM_GAMES) { assert.ok(R.has(g.id), `gym game ${g.id}`); assert.equal(R.manifestOf(g.id).skill, g.skill, `${g.id} skill`); }
  for (const s of STATIONS) assert.ok(R.has(s.game || s.id), `station ${s.id}`);
  for (const k of ['repair', 'hack', 'haggle']) assert.ok(R.has(k), `hook kind ${k}`);
});
test('the roll preview and the picker lines work for any registered id, with no list of their own', () => {
  for (const m of R.list()) {
    const p = rollPreview(m.id, attempt, { level: 3, points: {} });
    assert.ok(p && p.line, m.id);
  }
  for (const skill of new Set(R.list().map((m) => m.skill).filter(Boolean))) assert.ok(pickerLines(skill).length > 0, skill);
});
test('points are keyed by the manifest paths, else the classic three, clean 0..9', () => {
  assert.deepEqual(R.pointsFor({ paths: [{ id: 'diagnose' }, { id: 'mend' }] }, { diagnose: 4, mend: 99, speed: 5 }), { diagnose: 4, mend: 9 });
  assert.deepEqual(R.pointsFor({}, { speed: 2, quality: -1 }), { speed: 2, quality: 0, material: 0 });
  assert.deepEqual(R.pointsFor(R.manifestOf('repair'), { time: 3, size: 1 }), { time: 3, size: 1, quality: 0 });
});
test('every map interact of kind module names a registered module', () => {
  for (const [id, def] of Object.entries(MAP_DEFS)) for (const p of def.props || []) if (p.interact?.kind === 'module') assert.ok(R.has(p.interact.id), `${id}: ${p.interact.id}`);
});
test('modules/index.json is the controller index and is current', () => {
  const have = JSON.parse(fs.readFileSync(path.join(MODULES, 'index.json'), 'utf8'));
  assert.deepEqual(have, JSON.parse(JSON.stringify(R.indexOf())), 'run node scripts/build-module-index.mjs');
  assert.deepEqual(have.modules.map((m) => m.id), [...MODULE_IDS]);
});
test('hook manifests agree with the game rules they replaced (hack contexts, repair systems, haggle outcomes)', () => {
  const kinds = R.hookKinds();
  assert.deepEqual(kinds.hack.inputs.context.values, [...CONTEXTS]);
  assert.deepEqual(kinds.repair.inputs.system.values, Object.keys(SYSTEMS));
  assert.deepEqual(kinds.haggle.outcomes, ['win', 'mid', 'lose']);
  for (const [id, h] of Object.entries(kinds)) assert.ok(R.has(id) && h.skill, id);
  assert.equal(branchOf('haggle', { outcome: 'well' }), 'win');
  assert.equal(branchOf('haggle', { outcome: 'fair' }), 'mid');
  assert.equal(branchOf('haggle', { outcome: 'walked' }), 'lose');
});
test('the gym games come from manifests: exactly the modules that opted in, in list order', () => {
  assert.deepEqual(GYM_GAMES.map((g) => g.id), R.list().filter((m) => m.gym).map((m) => m.id));
});
test('the shelf lists every registered module', () => {
  assert.deepEqual(shelfRows().map((r) => r.id).sort(), R.list().map((m) => m.id).sort());
  assert.ok(shelfGroups().every((g) => g.rows.length));
});

// ---- the add-one tests --------------------------------------------------------------------------------------------------
// A temp modules/ folder: symlinks to every real module, a COPY of list.js with one line added, and the fixture folders copied in.
function tempModules(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-modules-'));
  for (const id of fs.readdirSync(MODULES)) {
    if (id === 'list.js') continue;
    if (fs.statSync(path.join(MODULES, id)).isDirectory()) fs.symlinkSync(path.join(MODULES, id), path.join(dir, id));
  }
  let list = fs.readFileSync(path.join(MODULES, 'list.js'), 'utf8');
  for (const id of extra) { fs.cpSync(path.join(FIXTURES, id), path.join(dir, id), { recursive: true }); list = list.replace(/\]\);\s*$/, `  '${id}',\n]);\n`); }
  fs.writeFileSync(path.join(dir, 'list.js'), list);
  return dir;
}
async function loadWith(extra) {
  const dir = tempModules(extra);
  const { MODULE_IDS: ids } = await import(`${pathToFileURL(path.join(dir, 'list.js')).href}?${Date.now()}${Math.random()}`);
  R.reset();
  await R.ready({ ids, base: pathToFileURL(`${dir}/`) });
  return { dir, ids };
}

test('add-one mini-game: one folder and one list line, nothing else, and it shows up everywhere', async () => {
  const before = MODULE_IDS.length;
  const { dir, ids } = await loadWith(['_sample-game']);
  assert.equal(ids.length, before + 1);
  assert.ok(R.has('_sample-game'));
  assert.ok(shelfRows().some((r) => r.id === '_sample-game'), 'workbench shelf');
  assert.ok(pickerLines('repair').some((l) => l.id === '_sample-game'), 'skill picker words');
  assert.ok(rollPreview('_sample-game', { total: 20, dc: 10, natural: false }, { level: 3, points: {} }).line.includes('roll:'), 'roll preview');
  const idx = R.indexOf();
  assert.ok(idx.modules.some((m) => m.id === '_sample-game'), 'controller index');
  assert.deepEqual(idx.modules.slice(0, before).map((m) => m.id), [...MODULE_IDS], 'the old modules are untouched');
  // its paths key the points; its own pure model reads them
  assert.deepEqual(R.buildCtx('_sample-game', { points: { diagnose: 5, speed: 9 } }).points, { diagnose: 5, mend: 0 });
  const model = await import(pathToFileURL(path.join(dir, '_sample-game/model.js')).href);
  assert.ok(model.triesOf({ points: R.buildCtx('_sample-game', { points: { diagnose: 6 } }).points }) > model.triesOf({}));
  // 2: it opts into the gym from its own manifest (no edit to gym.js)
  assert.ok(GYM_GAMES.some((g) => g.id === '_sample-game'), 'the gym lists it');
  assert.ok(gymGamesFor('repair').some((g) => g.id === '_sample-game'));
  assert.equal(gymGame('_sample-game').name, 'Sample pads');
  assert.deepEqual(gymGame('_sample-game').cats, ['diagnose', 'mend']);
  assert.equal(gymSetup('_sample-game', { level: 3, points: { diagnose: 2 } }).tier, 0, 'a Steady setup');
  // 3: it is accepted as a scene hook (no edit to sceneHook.js), and its inputs are checked from its manifest
  const choice = { check: { skill: 'repair', stat: 'wis', tag: 'x', dc: 10, pass: 'a', fail: 'b' }, minigame: { kind: '_sample-game', title: 'Pads', pads: 4 } };
  assert.deepEqual(hookIssues(choice, {}), []);
  assert.ok('_sample-game' in HOOK_KINDS && HOOK_KINDS['_sample-game'].skill === 'repair');
  assert.match(hookIssues({ ...choice, minigame: { kind: '_sample-game', pads: 9 } }).join(), /pads/);
  assert.match(hookIssues({ ...choice, check: { ...choice.check, skill: 'hacking' } }).join(), /should be repair/);
  assert.match(hookIssues({ ...choice, minigame: { kind: '_sample-game', mid: 'm' } }).join(), /no mid outcome/);
  const start = startHook(choice, { total: 20, dc: 10, natural: false }, { levels: { repair: 3 }, points: { repair: { diagnose: 2 } } });
  assert.deepEqual([start.kind, start.tier, start.setup.level, start.setup.points], ['_sample-game', 2, 3, { diagnose: 2, mend: 0 }]);
  assert.equal(branchOf('_sample-game', { success: true }), 'win');
  assert.equal(branchOf('_sample-game', { success: false }), 'lose');
  assert.deepEqual(worldResult('_sample-game', { success: true, effects: { world: { x: 1 } } }), { x: 1 });
  assert.equal(xpEvent('_sample-game', { xp: 3 }).skill, 'repair');
  // bound to a console with one data line, { kind: 'module', id }: the ctx comes from the save (DOM play is the browser test's job)
  const c = ctxFromSave(R.manifestOf('_sample-game'), { character: { levels: { repair: 4 }, points: { repair: { diagnose: 6, speed: 9 } } } }, { kind: 'module', id: '_sample-game', seed: 3, tier: 2 });
  assert.deepEqual([c.level, c.seed, c.tier], [4, 3, 2]);
  assert.deepEqual(c.points, { diagnose: 6, mend: 0 }, 'keyed by the module’s paths; keys it does not declare (speed) never leak in');
  fs.rmSync(dir, { recursive: true, force: true });
});
test('add-one screen: reads ctx.context, returns effects.world, and the host applies it', async () => {
  const { dir } = await loadWith(['_sample-screen']);
  assert.equal(R.manifestOf('_sample-screen').kind, 'screen');
  assert.ok(shelfGroups().some((g) => g.kind === 'screen' && g.rows.some((r) => r.id === '_sample-screen')));
  const world = [];
  const save = { character: { levels: {}, points: {} }, items: { scrap: 3 }, flags: {} };
  const guns = { port: { tracking: 'manual' } };
  // the screen needs a DOM; here a stand-in with the same contract reads context and returns the same effect shape
  const ctx = ctxFromSave(R.manifestOf('_sample-screen'), save, { context: { guns } });
  assert.deepEqual(ctx.context.guns, guns);
  assert.equal(ctx.context.items.scrap, 3);
  const applied = applyEffects({ world: { guns: { port: { tracking: 'auto' } } }, items: { scrap: 1 } }, { applyWorld: (w) => world.push(w), store: { grant: (g) => world.push(g) } });
  assert.deepEqual(world[0], { items: { scrap: 1 } });
  assert.deepEqual(world[1], { guns: { port: { tracking: 'auto' } } });
  assert.deepEqual(Object.keys(applied).sort(), ['items', 'world']);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('add-one with a bad manifest fails loudly instead of half-loading', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-modules-bad-'));
  fs.mkdirSync(path.join(dir, 'oops'));
  fs.writeFileSync(path.join(dir, 'oops/manifest.json'), JSON.stringify({ id: 'oops', kind: 'toy' }));
  fs.writeFileSync(path.join(dir, 'oops/index.js'), 'export const play = () => ({});');
  R.reset();
  await assert.rejects(R.ready({ ids: ['oops'], base: pathToFileURL(`${dir}/`) }), /kind toy/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- stacking: ctx.play, no module imports another --------------------------------------------------------------------
test('ctx.play stacks another module full screen and resolves with its result; the screen returns afterwards', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-modules-stack-'));
  const make = (id, body) => { fs.mkdirSync(path.join(dir, id)); fs.writeFileSync(path.join(dir, id, 'manifest.json'), JSON.stringify({ id, kind: id === 'outer' ? 'screen' : 'minigame', title: id, verb: 'go', contract: 1 })); fs.writeFileSync(path.join(dir, id, 'index.js'), body); };
  make('outer', 'export async function play(stage, ctx) { const inner = await ctx.play("inner", { seed: 9, tier: 2 }); return { done: true, success: inner.success, grade: inner.grade, innerSeed: inner.seed, back: true }; }');
  make('inner', 'export async function play(stage, ctx) { return { done: true, success: ctx.seed === 9 && ctx.tier === 2, grade: 80, seed: ctx.seed, points: ctx.points }; }');
  R.reset();
  await R.ready({ ids: ['outer', 'inner'], base: pathToFileURL(`${dir}/`) });
  const log = [];
  const openStage = (o) => { log.push(`open ${o.title}`); return { stage: {}, close: () => log.push(`close ${o.title}`) }; };
  const r = await playModule('outer', { seed: 1 }, { openStage });
  assert.deepEqual([r.success, r.grade, r.innerSeed, r.back], [true, 80, 9, true]);
  assert.deepEqual(log, ['open outer', 'open inner', 'close inner', 'close outer'], 'inner is stacked on top and closed first');
  assert.equal(typeof stackPlay({}), 'function');
  fs.rmSync(dir, { recursive: true, force: true });
});
test('a left module resolves as left and changes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-modules-left-'));
  fs.mkdirSync(path.join(dir, 'slow'));
  fs.writeFileSync(path.join(dir, 'slow/manifest.json'), JSON.stringify({ id: 'slow', kind: 'minigame', title: 'slow', verb: 'wait', contract: 1 }));
  fs.writeFileSync(path.join(dir, 'slow/index.js'), 'export const play = () => new Promise(() => {});');
  R.reset();
  await R.ready({ ids: ['slow'], base: pathToFileURL(`${dir}/`) });
  let leave;
  const r = await Promise.race([playModule('slow', {}, { openStage: (o) => { leave = o.onLeave; setTimeout(() => leave(), 5); return { stage: {}, close() {} }; } })]);
  assert.equal(r.left, true);
  const effects = []; const out = applyEffects(r.effects, { store: { grant: (g) => effects.push(g) } });
  assert.deepEqual([out, effects], [{}, []]);
  fs.rmSync(dir, { recursive: true, force: true });
});
