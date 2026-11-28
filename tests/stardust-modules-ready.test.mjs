// A caller that forgets `await ready()` never gets a wrong answer. This file never loads the registry itself.
// Async entry points wait for it; sync ones (which cannot wait) throw one clear error that names ready().
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../projects/Space-Shooter/voyage/modules/registry.js';
import { startHook, startHookAsync, hookIssues, HOOK_KINDS } from '../projects/Space-Shooter/voyage/minigames/sceneHook.js';
import { startStation, startStationAsync, STATIONS } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { rollPreview } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { GYM_GAMES, gymGamesFor } from '../projects/Space-Shooter/voyage/minigames/gym.js';
import { pickerLines } from '../projects/Space-Shooter/voyage/minigames/picker.js';
import { shelfRows } from '../projects/Space-Shooter/voyage/modules/shelf.js';
import { playGame } from '../projects/Space-Shooter/voyage/workbench/games.js';
import { playHook } from '../projects/Space-Shooter/voyage/minigames/playHook.js';
import { playModule } from '../projects/Space-Shooter/voyage/modules/host.js';
import { openModule } from '../projects/Space-Shooter/voyage/modules/bind.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const NOT_READY = /ready\(\)/;
const attempt = { total: 15, dc: 10, natural: false };
const choice = { check: { skill: 'repair', stat: 'wis', tag: 'repair', dc: 10, pass: 'a', fail: 'b' }, minigame: { kind: 'repair' } };

test('before the registry is loaded, every sync entry point throws the one clear error naming ready()', () => {
  assert.equal(R.isReady(), false);
  for (const [name, fn] of [
    ['startHook', () => startHook(choice, attempt, {})],
    ['hookIssues', () => hookIssues(choice, {})],
    ['HOOK_KINDS', () => Object.keys(HOOK_KINDS)],
    ['startStation', () => startStation(freshState(), STATIONS[0], attempt)],
    ['rollPreview (a module id with no built-in list)', () => rollPreview('_nope', attempt, {})],
    ['GYM_GAMES', () => GYM_GAMES.map((g) => g.id)],
    ['gymGamesFor', () => gymGamesFor('repair')],
    ['pickerLines', () => pickerLines('repair')],
    ['shelfRows', () => shelfRows()],
    ['setupOf', () => R.setupOf('repair', {})],
  ]) assert.throws(fn, NOT_READY, name);
});
test('the async entry points wait for the registry, so a caller that skips ready() still works', async () => {
  assert.equal(R.isReady(), false);
  const start = await startHookAsync(choice, attempt, { levels: { repair: 2 } });
  assert.equal(start.kind, 'repair');
  assert.equal(R.isReady(), true, 'startHookAsync loaded it');
});
test('startStationAsync, on its own, loads the registry and starts the station', async () => {
  R.reset();
  const st = await startStationAsync(freshState(), STATIONS.find((s) => s.id === 'repair'), attempt);
  assert.equal(st.station.id, 'repair');
  assert.ok(st.setup && st.preview);
});
test('the launch paths wait for the registry too: they get past loading (and only then meet the missing DOM)', async () => {
  const notAboutReady = (e) => !NOT_READY.test(String(e.message));
  for (const [name, run] of [
    ['playGame', () => playGame({}, 'repair', {})],
    ['playHook', () => { R.reset(); return playHook({}, { start: { kind: 'repair', setup: {} } }); }],
    ['registry play', () => { R.reset(); return R.play('repair', {}, {}); }],
    ['playModule', () => { R.reset(); return playModule('repair', {}, { openStage: () => ({ stage: {}, close() {} }) }); }],
    ['openModule', () => { R.reset(); return openModule({ id: 'repair' }, { openStage: () => ({ stage: {}, close() {} }) }); }],
  ]) {
    R.reset();
    await assert.rejects(run(), notAboutReady, name);
    assert.equal(R.isReady(), true, `${name} loaded the registry`);
  }
});
