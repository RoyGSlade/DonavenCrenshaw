// Browser QA for the Stardust 3D look, flown for real in Chromium.
//
//   npm run qa:3d                  (or: node scripts/stardust/qa-3d.mjs [--headed] [--gpu] [--keep-going] [--only=3d,2d,toggle,fallback,modules,lost])
//
// Cases (each its own browser context; nothing leaves the machine, the hub is blocked):
//   3d-1080   ?render=3d at 1920x1080: WebGL canvas present and not blank, the 2D HUD still drawn,
//             HUD/pause menu layered above the 3D canvas, a resize to 1280x720 followed, frame times sampled
//   3d-720    the same at 1280x720 (fresh page), plus a device-pixel-ratio 2 context (canvas capped at 2x)
//   2d        ?render=2d: the old look, no 3D module even requested
//   toggle    the "3D view (beta)" setting switches 3D on and off with no reload and survives a reload
//   fallback  WebGL disabled by launch flag: ?render=3d still plays, in 2D
//   modules   the 3D modules fail to load (requests blocked): the game still plays, in 2D
//   lost      the WebGL context is lost mid-race: the game drops back to 2D cleanly
//
// Screenshots go to <repo>/.shots/ (not committed) and a JSON summary to .shots/qa-3d-results.json.
// --gpu asks Chromium for the real GPU (ANGLE/D3D11) instead of the software rasteriser (SwiftShader);
// frame times from SwiftShader are NOT a GPU number and the report prints which renderer ran.
// Playwright: PLAYWRIGHT_MODULE, or the Codex runtime copy on this machine, or an installed `playwright`.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const shots = path.join(root, '.shots');
await mkdir(shots, { recursive: true });

const fallbackModule = pathToFileURL('C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href;
const pw = await import(process.env.PLAYWRIGHT_MODULE || fallbackModule).catch(() => import('playwright'));
const chromium = pw.chromium || pw.default?.chromium;

const port = 4581 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [path.join(root, 'scripts', 'preview-stardust.mjs')], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/projects/Space-Shooter/`;
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const failures = [];
const results = { startedAt: new Date().toISOString(), cases: {} };
let currentCase = '';
const check = (ok, label, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${currentCase}] ${label}${detail !== undefined ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
  (results.cases[currentCase] ||= { checks: [] }).checks.push({ ok, label, detail });
  if (!ok) failures.push(`[${currentCase}] ${label}`);
};

const GL_ARGS = args.gpu ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=d3d11'] : ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
const launch = (extra = []) => chromium.launch({ headless: !args.headed, args: [...GL_ARGS, ...extra] });

// --- helpers ---------------------------------------------------------------------------------
const NOISE = /api\.donavencrenshaw|Failed to load resource|ERR_FAILED|ERR_BLOCKED|CORS|net::/;

async function openPage(browser, { viewport, dpr = 1, query, block = [] }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const log = { errors: [], warnings: [], requests: [] };
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) log.errors.push(m.text());
    if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('request', (r) => log.requests.push(r.url()));
  await page.route('https://api.donavencrenshaw.com/**', (r) => r.abort());
  for (const pattern of block) await page.route(pattern, (r) => r.abort());
  await page.goto(base + query);
  await page.waitForFunction(() => document.getElementById('weekly-card') && !document.getElementById('weekly-card').hidden);
  await page.evaluate(async () => { window.__sd = (await import('/projects/Space-Shooter/state.js')).state; });
  await page.waitForFunction(() => !document.getElementById('weekly-btn').disabled);
  return { context, page, log };
}

/** "Preview week 1", skip the flythrough, wait for the grid to go live, launch. */
async function startRace(page) {
  await page.click('#weekly-btn');
  await page.waitForFunction(() => window.__sd.run?.kind === 'weekly');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); // any key skips the flythrough (Esc would also pause)
  await page.waitForFunction(() => !window.__sd.ui.countdownActive && window.__sd.run.current?.countdownT <= 0, null, { timeout: 30000 });
  await page.keyboard.press('Space'); // launch
  await page.waitForFunction(() => !window.__sd.run.current.lockedInStart, null, { timeout: 5000 }).catch(() => {});
}

/** Hold thrust and weave for a few seconds so the camera, trails and ship all move. */
async function fly(page, { seconds = 5, mid = null, midAt = 2.2 } = {}) {
  const k = page.keyboard;
  let midDone = !mid;
  const start = await page.evaluate(() => ({ x: window.__sd.run.current.player.x, y: window.__sd.run.current.player.y }));
  await k.down('w');
  const plan = [['', 0.25], ['d', 0.2], ['', 0.15], ['a', 0.2], ['', 0.2]];
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < seconds) {
    for (const [turn, share] of plan) {
      if (turn) await k.down(turn);
      await page.waitForTimeout(Math.round(share * 1000));
      if (turn) await k.up(turn);
    }
    if (!midDone && (Date.now() - t0) / 1000 >= midAt) { midDone = true; await mid(); }
    if (await page.evaluate(() => window.__sd.ui.showFailOverlay)) break; // hit a rail or mine: fine, we only need frames
  }
  if (!midDone) await mid();
  await k.up('w');
  const end = await page.evaluate(() => ({ x: window.__sd.run.current.player.x, y: window.__sd.run.current.player.y, wreck: !!window.__sd.run.current.wreck, fail: !!window.__sd.ui.showFailOverlay }));
  return { start, end, moved: Math.hypot(end.x - start.x, end.y - start.y) };
}
/** After a crash: retry like a player would and get back to a live, launched race. */
const retryIfFailed = async (page, flight) => {
  if (!flight.end.fail) return;
  await page.click('[data-fail="retry"]').catch(() => {});
  await page.waitForFunction(() => !window.__sd.ui.showFailOverlay && !window.__sd.ui.countdownActive && window.__sd.run.current?.countdownT <= 0, null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
};

const notBlank = (a) => a.colours >= 4 && a.offDominant >= 0.001;
/** Luminance spread and distinct-colour count of a PNG, analysed on a blank page. */
let analyser = null;
async function analyse(context, png) {
  analyser ||= await context.newPage();
  return analyser.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    const { data } = x.getImageData(0, 0, bmp.width, bmp.height);
    let n = 0, sum = 0, sum2 = 0;
    const colours = new Map();
    for (let i = 0; i < data.length; i += 4 * 7) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++; sum += l; sum2 += l * l;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      colours.set(key, (colours.get(key) || 0) + 1);
    }
    const mean = sum / n;
    const dominant = Math.max(...colours.values());
    // "Not blank": more than one colour, and at least 0.1% of sampled pixels differ from the most common one.
    return { width: bmp.width, height: bmp.height, mean: +mean.toFixed(2), stddev: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2), colours: colours.size, offDominant: +(1 - dominant / n).toFixed(4) };
  }, png.toString('base64'));
}

/** Screenshot with everything except the WebGL canvas hidden, to judge the 3D layer alone. */
async function shot3dOnly(page, context, file) {
  const style = await page.addStyleTag({ content: 'body > *:not(#starmap-canvas-3d){visibility:hidden!important}' });
  const png = await page.screenshot({ path: file });
  await style.evaluate((el) => el.remove());
  return analyse(context, png);
}

/** How many 2D-canvas pixels carry anything: in 3D mode that is the HUD only; in 2D, the whole world. */
const hud2d = (page) => page.evaluate(() => {
  const c = document.getElementById('starmap-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 9) if (d[i] > 0) lit++;
  return { lit, width: c.width, height: c.height };
});

const canvas3d = (page) => page.evaluate(() => {
  const c = document.getElementById('starmap-canvas-3d');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    width: c.width, height: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), display: getComputedStyle(c).display, parent: c.parentElement?.tagName,
    glRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? 'WebGL (renderer hidden)' : 'no context', dpr: window.devicePixelRatio,
  };
});

const mode = (page) => page.evaluate(() => document.documentElement.dataset.render3d || '');
const waitMode = (page, want, timeout = 20000) => page.waitForFunction((w) => document.documentElement.dataset.render3d === w, want, { timeout }).catch(() => {});

const frameSample = (page, frames = 180) => page.evaluate((n) => new Promise((resolve) => {
  const t = []; let last = performance.now();
  const f = (now) => { t.push(now - last); last = now; if (t.length < n) requestAnimationFrame(f); else resolve(t); };
  requestAnimationFrame(f);
}), frames).then((t) => {
  t.shift();
  const s = [...t].sort((a, b) => a - b), avg = t.reduce((a, b) => a + b, 0) / t.length;
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
  return { frames: t.length, avgMs: +avg.toFixed(2), medianMs: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), maxMs: +s[s.length - 1].toFixed(2), fpsAvg: +(1000 / avg).toFixed(1) };
});

const noErrors = (log) => log.errors;
const closeSettingsAndResume = async (page) => {
  await page.click('#settings-save-btn');
  await page.waitForTimeout(300);
  if (await page.evaluate(() => !document.getElementById('starmap-pause').classList.contains('hidden'))) await page.click('#starmap-resume-btn');
};

// --- cases -----------------------------------------------------------------------------------
async function case3d() {
  const browser = await launch();
  try {
    // Checks that only mean something mid-flight, run while the keys are down.
    const inFlight = (page, context, tag, w, h, extra = async () => {}) => async () => {
      let c = await canvas3d(page);
      check(!!c && c.display !== 'none' && c.width > 0 && c.height > 0, 'WebGL canvas #starmap-canvas-3d present and shown', c);
      check(c?.parent === 'BODY', 'canvas is a direct child of <body>, under the 2D canvas');
      check(c && c.cssW === w && c.cssH === h && c.width === w && c.height === h, `canvas backing store is ${w}x${h} at DPR 1`, c && { w: c.width, h: c.height });
      results.glRenderer = c?.glRenderer;
      const a = await shot3dOnly(page, context, path.join(shots, `3d-${tag}-3d-layer.png`));
      check(notBlank(a), '3D layer is not blank (pixel variance)', a);
      await page.screenshot({ path: path.join(shots, `3d-${tag}-race.png`) });
      const hud = await hud2d(page);
      check(hud.lit > 100, '2D HUD still drawn on the 2D canvas', hud);
      const dom = await page.evaluate(() => ({ flightUi: !!document.querySelector('#flight-ui'), visible: [...document.querySelectorAll('#flight-ui *')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }) }));
      check(dom.flightUi && dom.visible, 'DOM flight HUD (#flight-ui) is present and visible', dom);
      await extra();
    };

    currentCase = '3d-1080';
    let { context, page, log } = await openPage(browser, { viewport: { width: 1920, height: 1080 }, query: '?preview=weekly&render=3d' });
    await startRace(page);
    await waitMode(page, 'active');
    check(await mode(page) === 'active', '3D renderer reports active in the race', await mode(page));
    const flight = await fly(page, { mid: inFlight(page, context, '1920x1080', 1920, 1080, async () => {
      const comp = await analyse(context, await page.screenshot());
      check(notBlank(comp), 'composite screenshot is not blank', comp);
      const order = await page.evaluate(() => {
        const kids = [...document.body.children];
        const el3 = document.getElementById('starmap-canvas-3d');
        return { i3: kids.indexOf(el3), i2: kids.indexOf(document.getElementById('starmap-canvas')), z3: getComputedStyle(el3).zIndex, z2: getComputedStyle(document.getElementById('starmap-canvas')).zIndex, pe3: getComputedStyle(el3).pointerEvents };
      });
      check(order.i3 >= 0 && order.i3 < order.i2 && order.z3 === order.z2, '3D canvas is below the 2D canvas in paint order', order);
      check(order.pe3 === 'none', '3D canvas never takes pointer events', order.pe3);
    }) });
    check(flight.moved > 5 || flight.end.fail, 'the ship flew while 3D rendered (keys reach the sim)', { moved: +flight.moved.toFixed(1), wreck: flight.end.wreck });
    await retryIfFailed(page, flight);
    // Pause menu above the 3D canvas.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#starmap-pause:not(.hidden)', { timeout: 5000 });
    const pause = await page.evaluate(() => {
      const r = document.querySelector('#starmap-pause .panel').getBoundingClientRect();
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + 40).map((e) => e.id || e.className || e.tagName);
      return { top: stack[0], stack: stack.slice(0, 5), above3d: stack.indexOf('starmap-canvas-3d') === -1 || stack.indexOf('starmap-pause') < stack.indexOf('starmap-canvas-3d') };
    });
    check(pause.above3d && !/starmap-canvas/.test(String(pause.top)), 'pause menu renders above the 3D canvas', pause);
    await page.screenshot({ path: path.join(shots, '3d-1920x1080-pause.png') });
    await page.click('#starmap-resume-btn');
    await page.waitForSelector('#starmap-pause.hidden', { state: 'attached', timeout: 5000 });
    // Resize to 1280x720 while racing.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(800);
    let c = await canvas3d(page);
    check(c && c.cssW === 1280 && c.cssH === 720 && c.width === 1280 && c.height === 720, 'window resize to 1280x720 resizes the 3D canvas', c && { w: c.width, h: c.height, cssW: c.cssW, cssH: c.cssH });
    await page.keyboard.down('w'); await page.waitForTimeout(500);
    let a = await shot3dOnly(page, context, path.join(shots, '3d-after-resize-1280x720-3d-layer.png'));
    check(notBlank(a), '3D layer still not blank after the resize', a);
    const perf = await frameSample(page);
    await page.keyboard.up('w');
    results.cases[currentCase].frameTimes = perf;
    check(perf.frames > 100, 'frame time sampled over rAF (1920x1080 -> resized 1280x720, 3D on)', perf);
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;

    currentCase = '3d-720';
    ({ context, page, log } = await openPage(browser, { viewport: { width: 1280, height: 720 }, query: '?preview=weekly&render=3d' }));
    await startRace(page);
    await waitMode(page, 'active');
    const f2 = await fly(page, { mid: inFlight(page, context, '1280x720', 1280, 720, async () => {
      const p720 = await frameSample(page);
      results.cases[currentCase].frameTimes = p720;
      check(p720.frames > 100, 'frame time sampled over rAF while flying', p720);
    }) });
    check(f2.moved > 5 || f2.end.fail, 'the ship flew', { moved: +f2.moved.toFixed(1) });
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;

    currentCase = '3d-dpr2';
    ({ context, page, log } = await openPage(browser, { viewport: { width: 1280, height: 720 }, dpr: 2, query: '?preview=weekly&render=3d' }));
    await startRace(page);
    await waitMode(page, 'active');
    await fly(page, { seconds: 3, mid: async () => {
      c = await canvas3d(page);
      check(!!c && c.width === 2560 && c.height === 1440, 'DPR 2: backing store is 2560x1440 (2x, the cap)', c && { w: c.width, h: c.height, dpr: c.dpr });
      a = await shot3dOnly(page, context, path.join(shots, '3d-1280x720-dpr2-3d-layer.png'));
      check(notBlank(a), '3D layer not blank at DPR 2', a);
    } });
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;
  } finally { await browser.close(); }
}

async function case2d() {
  currentCase = '2d';
  const browser = await launch();
  try {
    const { context, page, log } = await openPage(browser, { viewport: { width: 1920, height: 1080 }, query: '?preview=weekly&render=2d' });
    await startRace(page);
    const flight = await fly(page);
    await retryIfFailed(page, flight);
    check(await mode(page) === 'off', '3D reports off', await mode(page));
    const c = await canvas3d(page);
    check(!c || c.display === 'none', 'no visible 3D canvas', c);
    check(!log.requests.some((u) => /\/gfx3d\/(?!mode\.js)|\/vendor\/three\//.test(u)), 'no 3D module or three.js was even requested');
    const png = await page.screenshot({ path: path.join(shots, '2d-1920x1080-race.png') });
    const a = await analyse(context, png);
    check(notBlank(a), '2D look is drawn (not blank)', a);
    const world = await hud2d(page);
    check(world.lit > 2000, '2D canvas carries the world (far more than the HUD alone)', world);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, '2d-1280x720-race.png') });
    check(flight.moved > 5 || flight.end.fail, 'the ship flew in 2D', { moved: +flight.moved.toFixed(1) });
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;
    const d = await openPage(browser, { viewport: { width: 1280, height: 720 }, query: '?preview=weekly' });
    await startRace(d.page);
    await d.page.waitForTimeout(800);
    check(await mode(d.page) === 'off' && !d.log.requests.some((u) => /\/gfx3d\/(?!mode\.js)|\/vendor\/three\//.test(u)), 'default (no ?render=) stays 2D and loads no 3D code', await mode(d.page));
    await d.context.close();
  } finally { await browser.close(); }
}

async function caseToggle() {
  currentCase = 'toggle';
  const browser = await launch();
  try {
    const { context, page, log } = await openPage(browser, { viewport: { width: 1280, height: 720 }, query: '?preview=weekly' });
    await startRace(page);
    await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
    check(await mode(page) === 'off', 'starts in 2D by default', await mode(page));
    const openSettings = async () => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('#starmap-pause:not(.hidden)');
      await page.click('#starmap-settings-btn-pause');
      await page.waitForSelector('#starmap-settings:not(.hidden)');
      await page.click('#settings-tab-camera');
    };
    await openSettings();
    const btn = page.locator('[data-fx="render3d"]');
    check(await btn.count() === 1 && /3D view \(beta\)/.test(await page.textContent('#settings-pane-camera')), '"3D view (beta)" row is in the Camera settings');
    check(await btn.getAttribute('aria-pressed') === 'false' && (await btn.textContent()) === 'Off', 'toggle shows Off', await btn.textContent());
    await page.screenshot({ path: path.join(shots, 'toggle-settings-off.png') });
    await btn.click();
    check(await btn.getAttribute('aria-pressed') === 'true' && (await btn.textContent()) === 'On', 'toggle shows On after click');
    check(await page.evaluate(() => localStorage.getItem('stardust.render')) === '3d', 'choice saved to localStorage (stardust.render=3d)');
    await page.screenshot({ path: path.join(shots, 'toggle-settings-on.png') });
    await closeSettingsAndResume(page);
    await waitMode(page, 'active', 30000);
    check(await mode(page) === 'active', 'race switches to 3D without a reload', await mode(page));
    check(await page.evaluate(() => performance.getEntriesByType('navigation').length) === 1 && await page.evaluate(() => !!window.__sd), 'same page load (no reload happened)');
    await page.keyboard.down('w'); await page.waitForTimeout(700);
    const a = await shot3dOnly(page, context, path.join(shots, 'toggle-on-3d-layer.png'));
    await page.keyboard.up('w');
    check(notBlank(a), '3D layer drawn after toggling on', a);
    await openSettings();
    await btn.click();
    check(await btn.textContent() === 'Off' && await page.evaluate(() => localStorage.getItem('stardust.render')) === '2d', 'toggle Off saves 2d');
    await closeSettingsAndResume(page);
    await page.waitForTimeout(800);
    const c = await canvas3d(page);
    check(await mode(page) === 'off' && (!c || c.display === 'none'), 'toggling Off hides the 3D canvas and returns to 2D', { mode: await mode(page), canvas: c && c.display });
    await page.evaluate(() => localStorage.setItem('stardust.render', '3d'));
    await page.goto(base + '?preview=weekly');
    await page.waitForFunction(() => !document.getElementById('weekly-btn')?.disabled);
    await page.evaluate(async () => { window.__sd = (await import('/projects/Space-Shooter/state.js')).state; });
    await startRace(page);
    await waitMode(page, 'active', 30000);
    check(await mode(page) === 'active', 'saved 3d setting applies after reload', await mode(page));
    await page.goto(base + '?preview=weekly&render=2d');
    await page.waitForFunction(() => !document.getElementById('weekly-btn')?.disabled);
    await page.evaluate(async () => { window.__sd = (await import('/projects/Space-Shooter/state.js')).state; });
    await startRace(page);
    await page.waitForTimeout(800);
    check(await mode(page) === 'off', '?render=2d wins over a saved 3d setting', await mode(page));
    await openSettings();
    check(await btn.isDisabled(), 'the switch is disabled (and says why) while ?render= is in the link', await page.textContent('[data-fx-3d-hint]'));
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;
  } finally { await browser.close(); }
}

async function caseFallback() {
  currentCase = 'fallback';
  const browser = await launch(['--disable-3d-apis', '--disable-webgl', '--disable-webgl2']);
  try {
    const { context, page, log } = await openPage(browser, { viewport: { width: 1280, height: 720 }, query: '?preview=weekly&render=3d' });
    const gl = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
    check(gl === false, 'launch flag really disabled WebGL in this browser', gl);
    await startRace(page);
    const flight = await fly(page);
    await retryIfFailed(page, flight);
    await waitMode(page, 'failed', 5000);
    check(await mode(page) === 'failed', 'bridge reports the 3D failure and falls back', await mode(page));
    const c = await canvas3d(page);
    check(!c || c.display === 'none', 'no 3D canvas left on screen', c);
    const png = await page.screenshot({ path: path.join(shots, 'fallback-no-webgl-1280x720.png') });
    const a = await analyse(context, png);
    const world = await hud2d(page);
    check(notBlank(a) && world.lit > 2000, 'the race is drawn and playable in 2D', { ...a, lit: world.lit });
    check(flight.moved > 5 || flight.end.fail, 'the ship still flew', { moved: +flight.moved.toFixed(1) });
    check(log.warnings.some((w) => /\[3d\] falling back to 2D/.test(w)), 'a console warning explains the fallback', log.warnings.filter((w) => /3d/.test(w)));
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;
  } finally { await browser.close(); }
}

async function caseModulesFail() {
  const browser = await launch();
  try {
    for (const [name, pattern] of [
      ['no-3d-index', '**/gfx3d/index.js'],
      ['no-3d-world', '**/gfx3d/world.js'],
      ['no-three', '**/vendor/three/three.module.js'],
    ]) {
      currentCase = name;
      const { context, page, log } = await openPage(browser, { viewport: { width: 1280, height: 720 }, query: '?preview=weekly&render=3d', block: [pattern] });
      await startRace(page);
      const flight = await fly(page, { seconds: 3 });
      await retryIfFailed(page, flight);
      await waitMode(page, 'failed', 5000);
      check(await mode(page) === 'failed', `blocked ${pattern}: bridge falls back`, await mode(page));
      const c = await canvas3d(page);
      check(!c || c.display === 'none', 'no 3D canvas left on screen', c);
      const png = await page.screenshot({ path: path.join(shots, `fallback-${name}.png`) });
      const a = await analyse(context, png);
      const world = await hud2d(page);
      check(notBlank(a) && world.lit > 2000, 'the race still draws in 2D', { ...a, lit: world.lit });
      check(flight.moved > 5 || flight.end.fail, 'the ship still flew', { moved: +flight.moved.toFixed(1) });
      check(noErrors(log).length === 0, 'no uncaught errors', noErrors(log));
      await context.close(); analyser = null;
    }
  } finally { await browser.close(); }
}

async function caseContextLost() {
  currentCase = 'lost-ctx';
  const browser = await launch();
  try {
    const { context, page, log } = await openPage(browser, { viewport: { width: 1280, height: 720 }, query: '?preview=weekly&render=3d' });
    await startRace(page);
    await waitMode(page, 'active');
    await fly(page, { seconds: 1.5 });
    check(await mode(page) === 'active', '3D active before the loss', await mode(page));
    const lost = await page.evaluate(() => {
      const c = document.getElementById('starmap-canvas-3d');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return 'no WEBGL_lose_context';
      ext.loseContext();
      return 'lost';
    });
    check(lost === 'lost', 'context loss triggered', lost);
    await page.keyboard.down('w');
    await waitMode(page, 'failed', 5000);
    await page.waitForTimeout(600);
    check(await mode(page) === 'failed', 'bridge noticed the loss and switched to 2D', await mode(page));
    const c = await canvas3d(page);
    check(!c || c.display === 'none', 'dead canvas removed or hidden', c);
    const png = await page.screenshot({ path: path.join(shots, 'lost-context-falls-back-2d.png') });
    await page.keyboard.up('w');
    const a = await analyse(context, png);
    const world = await hud2d(page);
    check(notBlank(a) && world.lit > 2000, 'the 2D world is drawn again right away', { ...a, lit: world.lit });
    check(noErrors(log).length === 0, 'no console errors or page errors', noErrors(log));
    await context.close(); analyser = null;
  } finally { await browser.close(); }
}

const only = typeof args.only === 'string' ? args.only.split(',') : null;
const suite = [['3d', case3d], ['2d', case2d], ['toggle', caseToggle], ['fallback', caseFallback], ['modules', caseModulesFail], ['lost', caseContextLost]];
try {
  for (const [name, fn] of suite) {
    if (only && !only.includes(name)) continue;
    try { await fn(); } catch (error) {
      failures.push(`[${name}] crashed: ${error.message}`);
      console.log(`FAIL [${name}] crashed: ${error.stack || error.message}`);
      if (!args['keep-going']) break;
    }
  }
} finally {
  server.kill();
  results.failures = failures;
  await writeFile(path.join(shots, 'qa-3d-results.json'), JSON.stringify(results, null, 2));
  console.log(`\nGL renderer: ${results.glRenderer ?? 'unknown'}`);
  for (const [name, r] of Object.entries(results.cases)) if (r.frameTimes) console.log(`frame times [${name}]: ${JSON.stringify(r.frameTimes)}`);
  console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}
