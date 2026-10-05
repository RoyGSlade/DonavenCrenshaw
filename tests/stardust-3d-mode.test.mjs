// Which renderer a race uses, the "3D view (beta)" setting that picks it, and
// the guarantees around it: 2D stays the default, ?render= always wins, the
// 2D game never downloads the 3D code, and 3D failing cannot take 2D down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRenderMode, renderModeSource, saveRenderMode, chooseRenderMode, clearSessionRenderMode, RENDER_KEY, RENDER_EVENT } from '../projects/Space-Shooter/gfx3d/mode.js';

const game = (file) => readFileSync(new URL(`../projects/Space-Shooter/${file}`, import.meta.url), 'utf8');
const memory = (initial = {}) => { const data = { ...initial }; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data }; };
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('2D is the default, with nothing saved and nothing in the link', () => {
  assert.equal(readRenderMode({ search: '', storage: memory() }), '2d');
  assert.equal(readRenderMode({ search: '?preview=weekly', storage: memory() }), '2d');
  assert.equal(renderModeSource({ search: '', storage: memory() }), 'default');
});

test('?render= wins over the saved setting, either way round', () => {
  const saved3d = memory({ [RENDER_KEY]: '3d' });
  const saved2d = memory({ [RENDER_KEY]: '2d' });
  assert.equal(readRenderMode({ search: '?render=2d', storage: saved3d }), '2d');
  assert.equal(readRenderMode({ search: '?render=3d', storage: saved2d }), '3d');
  assert.equal(readRenderMode({ search: '?x=1&render=3d&y=2', storage: memory() }), '3d');
  assert.equal(renderModeSource({ search: '?render=3d', storage: saved2d }), 'link');
});

test('the saved setting is used when the link says nothing', () => {
  assert.equal(readRenderMode({ search: '', storage: memory({ [RENDER_KEY]: '3d' }) }), '3d');
  assert.equal(renderModeSource({ search: '', storage: memory({ [RENDER_KEY]: '3d' }) }), 'saved');
});

test('junk in the link, junk in storage and blocked storage all mean 2D', () => {
  for (const search of ['?render=', '?render=4d', '?render=3D', '?render=true', '?render=3dx']) {
    assert.equal(readRenderMode({ search, storage: memory() }), '2d', search);
  }
  assert.equal(readRenderMode({ search: '', storage: memory({ [RENDER_KEY]: 'webgl' }) }), '2d');
  assert.equal(readRenderMode({ search: '', storage: blocked }), '2d');
  assert.equal(readRenderMode({ search: '', storage: null }), '2d');
  assert.equal(renderModeSource({ search: '', storage: blocked }), 'default');
});

test('saveRenderMode keeps only the two real modes and reports a blocked store', () => {
  const store = memory();
  assert.equal(saveRenderMode('3d', store), true);
  assert.equal(store.data[RENDER_KEY], '3d');
  assert.equal(saveRenderMode('2d', store), true);
  assert.equal(store.data[RENDER_KEY], '2d');
  assert.equal(saveRenderMode('4d', store), false);
  assert.equal(saveRenderMode(undefined, store), false);
  assert.equal(store.data[RENDER_KEY], '2d', 'a bad value does not overwrite the setting');
  assert.equal(saveRenderMode('3d', blocked), false);
});

test('choosing a mode saves it and announces it so the game switches without a reload', () => {
  clearSessionRenderMode();
  const store = memory();
  const heard = [];
  const target = { dispatchEvent: (event) => { heard.push([event.type, event.detail]); return true; } };
  assert.equal(chooseRenderMode('3d', { storage: store, target }), true);
  assert.deepEqual(heard, [[RENDER_EVENT, { mode: '3d' }]]);
  assert.equal(readRenderMode({ search: '', storage: store }), '3d');
  assert.equal(chooseRenderMode('2d', { storage: store, target }), true);
  assert.equal(readRenderMode({ search: '', storage: store }), '2d');
});

test('when storage is blocked the choice still holds for this page load, and says it was not saved', () => {
  clearSessionRenderMode();
  assert.equal(chooseRenderMode('3d', { storage: blocked, target: null }), false, 'caller learns it was not kept');
  assert.equal(readRenderMode({ search: '', storage: blocked }), '3d', 'but this session honours it');
  assert.equal(readRenderMode({ search: '?render=2d', storage: blocked }), '2d', 'and a link still wins');
  clearSessionRenderMode();
  assert.equal(readRenderMode({ search: '', storage: blocked }), '2d');
});

test('the settings panel has a "3D view (beta)" switch wired to the saved mode, locked while a link decides', () => {
  const panel = game('ui/settingsPanel.js');
  assert.match(panel, /3D view \(beta\)/);
  assert.match(panel, /data-fx="render3d"/);
  assert.match(panel, /chooseRenderMode\(/, 'saves through the one mode module');
  assert.match(panel, /button\.disabled = source === 'link'/, 'disabled while ?render= is in the address');
  assert.match(panel, /addEventListener\(RENDER_EVENT, paint\)/, 'repaints when the mode or its status changes');
});

test('2D players never load the 3D code: graphics.js imports it lazily, behind the mode and a WebGL probe', () => {
  const graphics = game('ui/graphics.js');
  assert.doesNotMatch(graphics, /^import[^;\n]*gfx3d\/index\.js/m, 'no static import of the 3D orchestrator');
  assert.match(graphics, /import\('\.\.\/gfx3d\/index\.js'\)/, 'loaded on demand');
  assert.match(graphics, /readRenderMode\(\) === '3d'/);
  assert.match(graphics, /webglAvailable\(\)/, 'no WebGL means 2D before downloading three.js');
  assert.match(graphics, /webglcontextlost/, 'a lost GPU context falls back to 2D');
  for (const file of ['index.html', 'boot.js', 'index.js', 'state.js']) {
    assert.doesNotMatch(game(file), /gfx3d\/index|vendor\/three/, `${file} does not pull the 3D code in up front`);
  }
});

test('3D failing at any point leaves 2D drawing: every failure path in the bridge ends in breakBridge3d', () => {
  const graphics = game('ui/graphics.js');
  const bridge = graphics.slice(graphics.indexOf('3D look bridge'), graphics.indexOf('export function render()'));
  assert.ok(bridge.length > 500, 'bridge found');
  assert.match(bridge, /\.catch\(\(error\) => breakBridge3d/, 'a module that fails to import, or draw3d rejecting');
  assert.match(bridge, /catch \(error\) \{ breakBridge3d/, 'ensure3d throwing');
  assert.match(bridge, /status\?\.failed\) \{ breakBridge3d/, 'the orchestrator giving up');
  assert.match(bridge, /bridge3d\.canvas\?\.remove\?\.\(\)/, 'the dead canvas is removed');
  // The 2D frame is drawn whenever the bridge says it did not draw 3D.
  assert.match(graphics, /if \(!in3d\) ctx\.drawImage\(bufferCanvas/);
  assert.match(graphics, /STARFIELD\?\.ENABLED && !in3d/, 'starfield only when 2D owns the frame');
  assert.match(graphics, /hasRun\(\) && !in3d\) drawRoadmap/, 'the 2D world is skipped only when 3D drew the frame');
});

test('the 3D canvas is hidden whenever it is not the thing being shown', () => {
  const graphics = game('ui/graphics.js');
  assert.match(graphics, /canvas\.style\.display = show/, 'hidden when idle (menus, other modes)');
  assert.match(graphics, /canvas\.style\.display = 'none'/, 'hidden when 2D is chosen');
  const css = game('game.css');
  assert.match(css, /#starmap-canvas-3d\{[^}]*pointer-events:none/, 'never steals clicks');
});
