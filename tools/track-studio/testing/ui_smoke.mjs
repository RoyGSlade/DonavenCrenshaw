// Headless phone smoke test for Track Studio v2. Starts the studio server
// (loopback, --dev-no-auth, the real converter, fake LHC, a temp 3D queue) and
// drives the page in a phone-sized Chromium: draw a loop, brush the width,
// pens, stamps, selection, palm rejection, pinch, a request card, Make track.
//
//   node tools/track-studio/testing/ui_smoke.mjs <work dir> [/path/to/node_modules/playwright/index.mjs]
//   (or PLAYWRIGHT_MODULE=...; CHROMIUM=/path/to/chrome picks a browser binary)
//
// Writes screenshots to <work dir>/shots. Exits 1 when any check fails.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const work = resolve(process.argv[2] || join(REPO, '.collab-reports', 'ui-smoke'));
rmSync(work, { recursive: true, force: true });
const data = join(work, 'data'), queue = join(work, 'queue'), shots = join(work, 'shots'), lhcLog = join(work, 'lhc.log');
mkdirSync(shots, { recursive: true });

const mod = process.argv[3] || process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(mod ? (mod.startsWith('file:') ? mod : pathToFileURL(mod).href) : 'playwright');

const port = 18000 + Math.floor(Math.random() * 2000);
const server = spawn('python3', [join(REPO, 'tools/track-studio/server.py'), '--root', REPO, '--data', data, '--port', String(port),
  '--dev-no-auth', '--lhc', JSON.stringify(['python3', join(HERE, 'fake_lhc.py')]), '--repo-target', REPO, '--asset-queue', queue],
{ env: { ...process.env, FAKE_LHC_LOG: lhcLog }, stdio: ['ignore', 'ignore', 'pipe'] });
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60 && !serverLog.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100));

const results = [];
let failed = false;
function check(name, ok, detail = '') {
  const line = `${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`;
  results.push(line);
  process.stderr.write(line + '\n');
  if (!ok) failed = true;
}
// Never leave the server behind: a watchdog and signal handlers kill it.
const bail = (why) => { process.stderr.write(`\n${why}\n${results.join('\n')}\n`); try { server.kill('SIGKILL'); } catch { /* gone */ } process.exit(1); };
setTimeout(() => bail('watchdog: the smoke run took over 5 minutes'), 300000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => bail(`stopped by ${sig}`));

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(`${base}/studio/`);
  await page.waitForFunction(() => globalThis.__studio && globalThis.__studio.D, null, { timeout: 15000 });
  check('page boots without errors', errors.length === 0, errors.join(' | '));
  const dock = await page.$$eval('#dock .tool', (b) => b.map((x) => x.getBoundingClientRect().height));
  check('dock targets are 44px or larger', dock.length === 9 && dock.every((hgt) => hgt >= 44), dock.join(','));
  const small = await page.evaluate(() => [...document.querySelectorAll('button, .hint, .save, label, input, textarea')]
    .filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.className || e.tagName));
  check('text is 16px or larger', small.length === 0, small.slice(0, 5).join(','));
  await page.screenshot({ path: join(shots, '01-empty.png') });

  // Draw a closed loop (an oval in the usable area) with one finger-like pointer.
  const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const cx = box.w / 2, cy = 420, rx = 150, ry = 230;
  const oval = Array.from({ length: 121 }, (_, i) => { const a = (i / 120) * Math.PI * 2; return [cx + rx * Math.cos(a) + 6 * Math.sin(a * 7), cy + ry * Math.sin(a)]; });
  oval.push([cx + rx + 4, cy + 12]);
  await page.mouse.move(...oval[0]);
  await page.mouse.down();
  for (const p of oval.slice(1)) await page.mouse.move(...p, { steps: 2 });
  await page.mouse.up();
  let lane = await page.evaluate(() => ({ closed: __studio.S.doc.lane.closed, n: __studio.S.doc.lane.points.length, lap: __studio.D.lap, overlaps: __studio.D.analysis.overlaps.length }));
  check('a drawn loop closes itself and populates the lane', lane.closed && lane.n > 50 && lane.lap > 300, JSON.stringify(lane));
  await page.waitForFunction(() => /Saved/.test(document.getElementById('save-state').textContent), null, { timeout: 10000 });
  check('the design autosaves to the server', existsSync(join(data, 'designs')) && readdirSync(join(data, 'designs')).length === 1);
  await page.waitForFunction(() => __studio.S.game && __studio.S.game.status !== 'running', null, { timeout: 90000 });
  const game = await page.evaluate(() => ({ status: __studio.S.game.status, ok: __studio.S.game.report && __studio.S.game.report.ok, err: __studio.S.game.error, ms: __studio.S.game.ms }));
  check('the in-browser game check (real converter + autopilot) runs in the worker', game.status === 'done' && game.ok === true, JSON.stringify(game));
  await page.screenshot({ path: join(shots, '02-loop.png') });

  // Width brush over the right side of the loop.
  await page.click('#dock .tool[data-tool="width"]');
  await page.mouse.move(cx + rx, cy - 120); await page.mouse.down();
  for (let k = 0; k <= 20; k++) await page.mouse.move(cx + rx + 2, cy - 120 + k * 12, { steps: 2 });
  await page.mouse.up();
  const spans = await page.evaluate(() => __studio.S.doc.width.spans);
  check('the width brush paints a span at the game max', spans.length === 1 && spans[0].w === 8, JSON.stringify(spans));
  const tick = await page.evaluate(() => [...document.querySelectorAll('#sub .slider')].map((s) => ({ max: s.querySelector('input').max, tick: s.querySelector('.gamemax')?.textContent || '' })));
  check('width sliders stop at the game max and mark it', tick.filter((t) => t.tick === 'game max 8' && t.max === '8').length === 2, JSON.stringify(tick));
  await page.screenshot({ path: join(shots, '03-width.png') });

  // Obstacle pen: a row, then a tap for one mine.
  await page.click('#dock .tool[data-tool="obstacles"]');
  await page.mouse.move(cx - rx + 5, cy - 60); await page.mouse.down();
  for (let k = 0; k <= 10; k++) await page.mouse.move(cx - rx + 5, cy - 60 + k * 12, { steps: 2 });
  await page.mouse.up();
  await page.mouse.click(cx, cy - ry);
  const obstacles = await page.evaluate(() => ({ strokes: __studio.S.doc.strokes.filter((s) => s.layer === 'obstacles').length, mines: __studio.S.doc.stamps.filter((s) => s.type === 'mine').length }));
  check('obstacle pen: a stroke row and a tapped mine', obstacles.strokes === 1 && obstacles.mines === 1, JSON.stringify(obstacles));
  const mineSize = await page.evaluate(() => ({ size: __studio.S.doc.stamps.find((s) => s.type === 'mine').size, sub: document.querySelector('#sub .stat.locked')?.textContent || '' }));
  check('a mine is the game\'s size and its size is locked', mineSize.size === 0.84 && /fixed in game/.test(mineSize.sub), JSON.stringify(mineSize));
  // Select the mine: the scale handle is locked and the box says why.
  await page.click('#dock .tool[data-tool="select"]');
  await page.mouse.click(cx, cy - ry);
  await page.waitForTimeout(100);
  const handle = await page.evaluate(() => ({ kinds: (__studio.S.box?.handles || []).map((x) => x.kind), label: __studio.S.box?.sizeLabel }));
  check('the mine\'s size handle is locked, labelled "fixed in game"', handle.kinds.includes('locked') && !handle.kinds.includes('scale') && /fixed in game/.test(handle.label || ''), JSON.stringify(handle));
  const legend = await page.evaluate(() => __studio.legend());
  check('the scale bar reads in lane widths', /lane widths? = \d/.test(legend.label), JSON.stringify(legend));
  await page.evaluate(() => { __studio.S.sel.clear(); __studio.zoomAt([206, 200], 12); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(shots, '03b-true-size.png') });
  await page.click('#fit-btn');

  // Hazard zone lasso and a shard line.
  await page.click('#dock .tool[data-tool="hazards"]');
  const zone = [[cx - 40, cy - 40], [cx + 40, cy - 40], [cx + 40, cy + 40], [cx - 40, cy + 40], [cx - 38, cy - 38]];
  await page.mouse.move(...zone[0]); await page.mouse.down();
  for (const p of zone.slice(1)) await page.mouse.move(...p, { steps: 6 });
  await page.mouse.up();
  await page.click('#dock .tool[data-tool="shards"]');
  await page.mouse.move(cx - 60, cy + ry - 2); await page.mouse.down();
  for (let k = 0; k <= 12; k++) await page.mouse.move(cx - 60 + k * 10, cy + ry, { steps: 2 });
  await page.mouse.up();
  const layers = await page.evaluate(() => __studio.S.doc.strokes.map((s) => s.layer).sort().join(','));
  check('zone and shard strokes land on their layers', layers === 'hazards,obstacles,shards', layers);

  // Stamp a star, select it, open properties via long press, then delete it.
  await page.click('#dock .tool[data-tool="stamp"]');
  await page.click('#sub button:has-text("Star")');
  await page.mouse.click(cx + 30, cy + 30);
  await page.waitForSelector('#dlg-ask[open]');
  await page.fill('#ask-body input', 'Neon sign');
  await page.click('#ask-body button.primary');
  const star = await page.evaluate(() => __studio.S.doc.stamps.find((s) => s.type === 'star'));
  check('a star stamp with a label', !!star && star.label === 'Neon sign', JSON.stringify(star));
  await page.mouse.move(cx + 30, cy + 30); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  const propsOpen = await page.$('#dlg-props[open]');
  check('long-press opens the properties sheet', !!propsOpen);
  if (propsOpen) {
    await page.click('#props-body button:has-text("Rotating")');
    const beh = await page.evaluate(() => __studio.S.doc.stamps.find((s) => s.type === 'star').behavior);
    check('properties change the behaviour', beh === 'rotating', beh);
    await page.click('#dlg-props [data-close]');
  }
  await page.screenshot({ path: join(shots, '04-layers.png') });

  // Undo / redo.
  const before = await page.evaluate(() => __studio.S.doc.stamps.length);
  await page.click('#undo');
  const undone = await page.evaluate(() => __studio.S.doc.stamps.find((s) => s.type === 'star').behavior);
  await page.click('#redo');
  const redone = await page.evaluate(() => __studio.S.doc.stamps.find((s) => s.type === 'star').behavior);
  check('undo and redo', undone === 'static' && redone === 'rotating' && before >= 2, `${undone} ${redone}`);

  // Palm rejection and pinch with synthetic touch pointers on the canvas.
  await page.click('#dock .tool[data-tool="notes"]');
  const touch = (type, id, x, y, extra = {}) => page.evaluate(([type, id, x, y, extra]) => {
    document.getElementById('board').dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: x, clientY: y, width: 10, height: 10, button: 0, buttons: 1, ...extra }));
  }, [type, id, x, y, extra]);
  const notesBefore = await page.evaluate(() => __studio.S.doc.strokes.filter((s) => s.layer === 'notes').length);
  const scale0 = await page.evaluate(() => __studio.S.view.scale);
  await touch('pointerdown', 11, 60, 200);
  for (let k = 1; k <= 8; k++) { await touch('pointermove', 11, 60 + k * 10, 200 + k * 4); await page.waitForTimeout(40); }
  await touch('pointerdown', 12, 300, 600, { width: 80, height: 80 }); // a resting palm
  await touch('pointermove', 12, 320, 640, { width: 80, height: 80 });
  await touch('pointerdown', 13, 250, 500); // a late second finger
  await touch('pointermove', 13, 280, 540);
  for (let k = 9; k <= 12; k++) await touch('pointermove', 11, 60 + k * 10, 200 + k * 4);
  await touch('pointerup', 13, 280, 540); await touch('pointerup', 12, 320, 640); await touch('pointerup', 11, 180, 248);
  const notesAfter = await page.evaluate(() => __studio.S.doc.strokes.filter((s) => s.layer === 'notes').length);
  const scale1 = await page.evaluate(() => __studio.S.view.scale);
  check('palm rejection: the stroke survives a palm and a late finger', notesAfter === notesBefore + 1 && scale1 === scale0, `${notesBefore}->${notesAfter} scale ${scale0}->${scale1}`);
  await touch('pointerdown', 21, 150, 400); await touch('pointerdown', 22, 250, 400);
  for (let k = 1; k <= 5; k++) { await touch('pointermove', 21, 150 - k * 15, 400); await touch('pointermove', 22, 250 + k * 15, 400); }
  await touch('pointerup', 21, 75, 400); await touch('pointerup', 22, 325, 400);
  const scale2 = await page.evaluate(() => __studio.S.view.scale);
  const notesPinch = await page.evaluate(() => __studio.S.doc.strokes.filter((s) => s.layer === 'notes').length);
  check('two fingers pinch-zoom and draw nothing', scale2 > scale1 * 1.5 && notesPinch === notesAfter, `scale ${scale1}->${scale2}`);
  await page.click('#fit-btn');

  // Layers: hide and lock.
  await page.click('#layers-btn');
  await page.click('#layers-body li:nth-child(5) button:has-text("Shown")');
  const vis = await page.evaluate(() => __studio.S.doc.layers.shards.visible);
  check('the layer panel hides a layer', vis === false);
  await page.click('#layers-body li:nth-child(5) button:has-text("Hidden")');
  await page.click('#dlg-layers [data-close]');

  // Skin picker: the real skin code draws both previews; Classic is chosen, then back to Midnight.
  await page.click('#menu-btn');
  await page.waitForSelector('#dlg-track[open] .skin-card');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, '05a-track-settings.png') });
  await page.click('.skin-card:has-text("Classic")');
  const classic = await page.evaluate(() => __studio.S.doc.skin);
  await page.click('#dlg-track [data-close]');
  await page.screenshot({ path: join(shots, '05b-classic.png') });
  await page.click('#menu-btn');
  await page.click('.skin-card:has-text("Midnight metal")');
  await page.click('#dlg-track [data-close]');
  check('the skin picker switches the track skin', classic === 'classic' && (await page.evaluate(() => __studio.S.doc.skin)) === 'midnight');
  await page.click('#dock .tool[data-tool="notes"]');

  // Request something new.
  await page.click('#sub button:has-text("Request something new")');
  await page.waitForSelector('#dlg-request[open]');
  await page.fill('#rq-title', 'Broken escalator');
  await page.fill('#rq-desc', 'Steps fall through the store');
  await page.fill('#rq-effect', 'Knocks you sideways');
  await page.click('#rq-type button:has-text("Hazard")');
  await page.click('#rq-behavior button:has-text("Falling")');
  await page.screenshot({ path: join(shots, '05-request.png') });
  await page.click('#rq-save');
  await page.waitForFunction(() => !document.getElementById('dlg-request').open, null, { timeout: 20000 });
  const req = await page.evaluate(() => ({ stamp: __studio.S.doc.stamps.find((s) => s.type === 'request'), reqs: __studio.S.doc.requests }));
  const lhc = existsSync(lhcLog) ? readFileSync(lhcLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const queued = existsSync(queue) ? readdirSync(queue).filter((f) => f.endsWith('.json')) : [];
  check('a request saves a card, a ? stamp and a 3D queue entry', !!req.stamp && req.reqs.length === 1 && lhc.some((c) => c.cmd.join(' ') === 'board add') && queued.length === 1,
    JSON.stringify({ stamp: !!req.stamp, reqs: req.reqs.length, lhc: lhc.map((c) => c.cmd.join(' ')), queued }));
  const reqDir = join(data, 'requests');
  const png = existsSync(reqDir) ? readdirSync(reqDir).map((d) => join(reqDir, d, 'sketch.png')).filter(existsSync) : [];
  check('the canvas region sketch PNG is saved with the request', png.length === 1 && readFileSync(png[0]).subarray(0, 4).toString('hex') === '89504e47');

  // Checks sheet, then Make track with the real converter.
  await page.click('#check-btn');
  await page.screenshot({ path: join(shots, '06-checks.png') });
  const checkCount = await page.$$eval('#check-body li', (l) => l.length);
  check('the checks panel lists live checks', checkCount >= 6, String(checkCount));
  await page.click('#dlg-check [data-close]');
  await page.click('#make-btn');
  await page.waitForSelector('#dlg-tracks[open] .vcard', { timeout: 120000 });
  const card = await page.evaluate(() => { const c = document.querySelector('.vcard'); return { text: c.textContent, play: c.querySelector('a.btn.primary').getAttribute('href') }; });
  check('Make track makes a version card with Playtest, intent and the skin', /Playtest/.test(card.text) && /Design intent/.test(card.text) && /Midnight metal/.test(card.text) && card.play.includes('/studio/drafts/w2-v1.json'),
    card.text.slice(0, 160));
  await page.screenshot({ path: join(shots, '07-tracks.png') });
  const versions = JSON.parse(readFileSync(join(data, 'versions.json'), 'utf8'));
  check('the version stores the design, skin and intent', versions[0].draftVersion === 2 && versions[0].skin === 'midnight' && versions[0].report.intent.length > 0, JSON.stringify(versions[0].report.intent || []).slice(0, 200));
  // The game itself loads the draft (preview=weekly) without errors.
  const game2 = await context.newPage();
  const gameErrors = [];
  game2.on('pageerror', (e) => gameErrors.push(String(e)));
  await game2.goto(base + card.play);
  await game2.waitForTimeout(4000);
  check('the game loads the studio draft', gameErrors.length === 0, gameErrors.join(' | '));
  await game2.screenshot({ path: join(shots, '08-game.png') });
  await game2.close();
  // An older draft drawn wider than the game: loads as saved, clamps on the first edit, says so once.
  const old = await page.evaluate(() => {
    const S = __studio.S;
    S.doc.width = { base: 12, taper: 24, spans: [{ from: 0.1, len: 0.2, w: 13 }] };
    S.undo = []; __studio.refresh();
    const loaded = S.doc.width.base;
    __studio.mutate((d) => { d.title = 'Old wide draft'; });
    return { loaded, base: S.doc.width.base, span: S.doc.width.spans[0].w };
  });
  await page.waitForTimeout(50);
  const note = await page.evaluate(() => document.getElementById('toast').textContent);
  check('an old wide draft loads as saved and clamps to 8 on edit, with a note', old.loaded === 12 && old.base === 8 && old.span === 8 && /wider than the game allows/.test(note), JSON.stringify({ ...old, note }));
  check('no page errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('smoke run', false, String(e && e.stack || e));
  await page.screenshot({ path: join(shots, '99-failure.png') }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
}
console.log(`${results.filter((r) => r.startsWith('ok')).length}/${results.length} checks passed; screenshots in ${shots}`);
if (failed) console.log('\nserver log tail:\n' + serverLog.split('\n').slice(-15).join('\n'));
process.exit(failed ? 1 : 0);
