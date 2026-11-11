#!/usr/bin/env node
// Stardust frame-rate benchmark. Dev-only; touches no game code.
//
//   node scripts/bench-stardust.mjs [--scenario racing|dogfight|lab|all] [--device desktop|phone|both]
//        [--seconds 30] [--profile-seconds 10] [--throttle 4] [--dpr 3] [--out DIR] [--no-cpuprofile]
//
// Run it capped and one at a time (the machine has crashed from heavy test runs):
//   ~/kauto-3d/bin/capped 6G timeout 1800 node scripts/bench-stardust.mjs --scenario all --device both
//
// Frame times come from a requestAnimationFrame recorder injected before the game loads.
// Phone = 390x844, touch, device pixel ratio 3 (--dpr), main thread slowed with CDP
// Emulation.setCPUThrottlingRate (--throttle, default 4). Headless Chromium rasterises in
// software here, so treat desktop numbers as "this machine", not "a typical PC".
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DESKTOP, DOGFIGHT_PATH, PHONE, blockHub, gameUrl, launchBrowser, startServer } from './stardust-test-kit.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
const SECONDS = Number(opt('seconds', 30));
const PROFILE_SECONDS = Number(opt('profile-seconds', 10));
const THROTTLE = Number(opt('throttle', 4));
const DPR = Number(opt('dpr', PHONE.deviceScaleFactor));
const SCENARIOS = opt('scenario', 'all') === 'all' ? ['racing', 'dogfight', 'lab'] : [opt('scenario')];
const DEVICES = opt('device', 'both') === 'both' ? ['desktop', 'phone'] : [opt('device')];
const OUT = path.resolve(opt('out', path.join(os.homedir(), 'Desktop/lhc-lanes/stardust/bench/results')));
const CPU_PROFILE = !flag('no-cpuprofile');
for (const s of SCENARIOS) if (!['racing', 'dogfight', 'lab'].includes(s)) throw new Error(`Unknown scenario ${s}`);
for (const d of DEVICES) if (!['desktop', 'phone'].includes(d)) throw new Error(`Unknown device ${d}`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Injected before any game script: records every animation-frame timestamp and long tasks.
function recorder() {
  window.__bench = { t: [], longtasks: [] };
  const tick = now => { window.__bench.t.push(now); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__bench.longtasks.push(e.duration); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* long tasks unsupported */ }
}

function stats(timestamps, longtasks, seconds) {
  const deltas = [];
  for (let i = 1; i < timestamps.length; i++) deltas.push(timestamps[i] - timestamps[i - 1]);
  if (!deltas.length) return { frames: 0 };
  const sorted = [...deltas].sort((a, b) => b - a);
  const worstN = Math.max(1, Math.ceil(sorted.length * 0.01));
  const worstAvg = sorted.slice(0, worstN).reduce((a, b) => a + b, 0) / worstN;
  const wall = timestamps.at(-1) - timestamps[0];
  const r = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    frames: deltas.length,
    seconds: r(wall / 1000),
    avgFps: r(deltas.length / (wall / 1000)),
    onePctLowFps: r(1000 / worstAvg),
    p50ms: r([...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)]),
    p99ms: r([...deltas].sort((a, b) => a - b)[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.99))]),
    maxMs: r(sorted[0]),
    // "Long frame": slower than 30 fps (over 33.4 ms) / over 50 ms / over 100 ms.
    framesOver33ms: deltas.filter(d => d > 33.4).length,
    framesOver50ms: deltas.filter(d => d > 50).length,
    framesOver100ms: deltas.filter(d => d > 100).length,
    longFramePct: r(100 * deltas.filter(d => d > 33.4).length / deltas.length),
    longTasks: longtasks.length,
    longTaskMs: r(longtasks.reduce((a, b) => a + b, 0), 0),
  };
}

// ---- CPU profile aggregation ---------------------------------------------------------------
function aggregate(profile) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  let total = 0;
  profile.samples.forEach((id, i) => {
    const dt = (profile.timeDeltas[i] || 0) / 1000;
    self.set(id, (self.get(id) || 0) + dt); total += dt;
  });
  const fn = new Map(), file = new Map(), special = { idle: 0, program: 0, gc: 0, root: 0 };
  for (const [id, ms] of self) {
    const { callFrame: c } = byId.get(id);
    const name = c.functionName || '(anonymous)';
    if (name === '(idle)') { special.idle += ms; continue; }
    if (name === '(program)') { special.program += ms; continue; }
    if (name === '(garbage collector)') { special.gc += ms; continue; }
    if (name === '(root)') { special.root += ms; continue; }
    const where = c.url ? c.url.replace(/^https?:\/\/[^/]+/, '').replace('/projects/Space-Shooter/', '') : '(native)';
    const key = `${name} ${where}:${c.lineNumber + 1}`;
    fn.set(key, (fn.get(key) || 0) + ms);
    file.set(where, (file.get(where) || 0) + ms);
  }
  const busy = total - special.idle;
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, ms]) => ({ name: k, ms: Math.round(ms), pctOfBusy: Math.round(1000 * ms / busy) / 10 }));
  const pct = ms => Math.round(1000 * ms / total) / 10;
  return {
    sampledMs: Math.round(total),
    idlePct: pct(special.idle), nativeProgramPct: pct(special.program), gcPct: pct(special.gc),
    scriptPct: pct(total - special.idle - special.program - special.gc - special.root),
    topFunctions: top(fn, 15), topFiles: top(file, 8),
  };
}

// ---- drivers -------------------------------------------------------------------------------
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Press/release keys so `want` (a Set of key names) is what is held. */
function keyHolder(page) {
  const held = new Set();
  return async want => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
}

// Racing today = the weekly time trial (the five-circuit network is retired and the weekly window of
// this checkout closed on 2026-10-13), so the page clock is pinned inside that window. Only Date.now()
// is fixed; timers and animation frames run normally. ?preview=weekly flies it unsaved.
const RACE_DATE = '2026-10-08T12:00:00-07:00';

async function racingSetup(page, origin, params) {
  await page.clock.setFixedTime(new Date(RACE_DATE));
  await page.goto(gameUrl(origin, { params: { preview: 'weekly', ...params } }));
  await page.waitForFunction(() => document.getElementById('weekly-btn') && !document.getElementById('weekly-btn').disabled, null, { timeout: 30000 });
  await page.evaluate(async () => { window.__state = (await import('/projects/Space-Shooter/state.js')).state; });
  await page.locator('#weekly-btn').click();
  await page.waitForFunction(() => window.__state.run?.kind === 'weekly' && !window.__state.ui.countdownActive && window.__state.run.current?.countdownT <= 0, null, { timeout: 30000 });
  // The repo's own test pilot (engine/weekly/pilot.js), flown through real keyboard events like the weekly test.
  await page.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    const { pilotLine, pilotSpeeds } = await import('/projects/Space-Shooter/engine/weekly/pilot.js');
    const layout = state.run.current.layout;
    const line = pilotLine(layout), v = pilotSpeeds(line), n = line.length;
    const held = new Set();
    const key = (k, on) => {
      if (on === held.has(k)) return;
      if (on) held.add(k); else held.delete(k);
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: k, bubbles: true }));
    };
    const release = () => { for (const k of [...held]) key(k, false); };
    let idx = 0;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    window.__pilot = { fails: 0, laps: 0 };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const tick = () => {
      const lv = state.run?.current;
      if (!lv) { requestAnimationFrame(tick); return; }
      if (lv.completed || state.ui.showEndOverlay) {
        release();
        // Lap finished: fly again so the scene keeps running for the whole measurement.
        if (!window.__pilot.again) { window.__pilot.again = true; window.__pilot.laps++; document.getElementById('starmap-again-btn')?.click(); }
        requestAnimationFrame(tick); return;
      }
      window.__pilot.again = false;
      if (state.ui.showFailOverlay) { release(); if (!window.__pilot.onFail) window.__pilot.fails++; window.__pilot.onFail = true; document.querySelector('[data-fail="retry"]')?.click(); requestAnimationFrame(tick); return; }
      window.__pilot.onFail = false;
      if (lv.wreck || state.ui.countdownActive) { release(); requestAnimationFrame(tick); return; }
      if (lv.lockedInStart) { idx = 0; window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); requestAnimationFrame(tick); return; }
      const p = lv.player;
      let best = idx, bd = Infinity;
      for (let k = -4; k <= 40; k++) { const i = (idx + k + n) % n, d = Math.hypot(line[i].x - p.x, line[i].y - p.y); if (d < bd) { bd = d; best = i; } }
      idx = best;
      const speed = Math.hypot(p.vx, p.vy);
      const goal = line[(idx + Math.round((0.9 + speed * 0.22) / 0.5)) % n];
      const want = v[(idx + 2) % n] * 0.92;
      const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy) || 1;
      const ax = (dx / d) * want - p.vx, ay = (dy / d) * want - p.vy;
      const err = wrap(Math.atan2(ay, ax) - p.angle);
      key('d', err > 0.05); key('a', err < -0.05);
      key('w', Math.abs(err) < 0.45 && Math.hypot(ax, ay) > 0.25);
      key('x', speed > want + 0.8);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** The pilot runs inside the page; this just lets time pass. */
async function racingDrive(page, ms) { await sleep(ms); }

async function racingProbe(page) {
  return page.evaluate(() => {
    const lv = window.__state.run.current;
    return { activeSec: Math.round((lv?.activeMs ?? 0) / 100) / 10, shards: lv?.shards?.size ?? null, wallHits: lv?.wallHits ?? null, fails: window.__pilot?.fails, laps: window.__pilot?.laps };
  });
}

async function dogfightSetup(browser, origin, device, profile) {
  const mk = async prof => {
    const context = await browser.newContext({ ...prof });
    await blockHub(context);
    await context.addInitScript(() => localStorage.setItem('stardust.dogfight.map', 'classic'));
    await context.addInitScript(recorder);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => console.error('  pageerror:', e.message));
    await page.goto(new URL(DOGFIGHT_PATH, origin).href);
    return { context, page };
  };
  const host = await mk(profile);
  const guest = await mk(DESKTOP);
  await host.page.locator('#connection-settings summary').click();
  await host.page.locator('#relay-url').fill(`ws://${new URL(origin).host}/relay`);
  await guest.page.locator('#connection-settings summary').click();
  await guest.page.locator('#relay-url').fill(`ws://${new URL(origin).host}/relay`);
  await host.page.locator('#create').click();
  await host.page.waitForFunction(() => document.querySelector('#share-code').textContent.length === 8);
  const code = await host.page.locator('#share-code').textContent();
  await guest.page.locator('#room-code').fill(code);
  await guest.page.locator('#join').click();
  const playing = p => p.waitForFunction(async () => { const d = (await import('./client.js')).getDiagnostics(); return d.phase === 'playing'; }, null, { timeout: 20000 });
  await playing(host.page); await playing(guest.page);
  return { host, guest };
}

/** Both pilots thrust, turn and fire in bursts; a finished round is rematched so the arena keeps running. */
async function dogfightDrive(duo, ms) {
  const holds = [keyHolder(duo.host.page), keyHolder(duo.guest.page)];
  const pages = [duo.host.page, duo.guest.page];
  const end = Date.now() + ms;
  let n = 0;
  while (Date.now() < end) {
    for (let i = 0; i < 2; i++) {
      const want = new Set(['w']);
      const phase = (n + i * 7) % 24;
      if (phase < 8) want.add('a'); else if (phase < 16) want.add('d');
      if (n % 10 < 4) want.add('Space');
      await holds[i](want);
    }
    if (n % 10 === 0) {
      for (const p of pages) {
        if (await p.locator('#result').isVisible().catch(() => false)) await p.locator('#rematch').click().catch(() => {});
      }
    }
    n++;
    await sleep(100);
  }
  await holds[0](new Set()); await holds[1](new Set());
}

// ---- one run -------------------------------------------------------------------------------
async function runOne(scenario, device) {
  const server = await startServer();
  const browser = await launchBrowser();
  const profile = device === 'phone' ? { ...PHONE, deviceScaleFactor: DPR } : { ...DESKTOP };
  const started = Date.now();
  let pageUnderTest, cleanup = async () => {}, duo, drive, probe = async () => null;
  const result = { scenario, device, throttle: device === 'phone' ? THROTTLE : 1, viewport: profile.viewport, dpr: profile.deviceScaleFactor };
  try {
    if (scenario === 'dogfight') {
      duo = await dogfightSetup(browser, server.origin, device, profile);
      pageUnderTest = duo.host.page;
      drive = ms => dogfightDrive(duo, ms);
      probe = () => pageUnderTest.evaluate(async () => { const d = (await import('./client.js')).getDiagnostics(); return { phase: d.phase, round: d.round, hull: d.hull }; });
    } else {
      const context = await browser.newContext({ ...profile });
      await blockHub(context);
      await context.addInitScript(recorder);
      pageUnderTest = await context.newPage();
      pageUnderTest.on('pageerror', e => console.error('  pageerror:', e.message));
      const params = scenario === 'lab' ? { lab: 'boost:charge,fuel:lean,rails:impact' } : {};
      await racingSetup(pageUnderTest, server.origin, params);
      drive = ms => racingDrive(pageUnderTest, ms);
      probe = () => racingProbe(pageUnderTest);
    }
    const cdp = await pageUnderTest.context().newCDPSession(pageUnderTest);
    if (device === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await drive(3000); // warm up: JIT, caches, first spawns
    await pageUnderTest.evaluate(() => { window.__bench.t.length = 0; window.__bench.longtasks.length = 0; });
    result.before = await probe();
    await drive(SECONDS * 1000);
    const raw = await pageUnderTest.evaluate(() => ({ t: window.__bench.t.slice(), l: window.__bench.longtasks.slice() }));
    result.frames = stats(raw.t, raw.l, SECONDS);
    result.after = await probe();
    if (CPU_PROFILE && PROFILE_SECONDS > 0) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      await pageUnderTest.evaluate(() => { window.__bench.t.length = 0; });
      await cdp.send('Profiler.start');
      await drive(PROFILE_SECONDS * 1000);
      const { profile: prof } = await cdp.send('Profiler.stop');
      const frames = await pageUnderTest.evaluate(() => window.__bench.t.length);
      result.profile = aggregate(prof);
      result.profile.frames = frames;
      // Main-thread work per frame (script + native), in the slowed-down time the page experienced.
      // Independent of raster speed: if this exceeds 16.7 ms the page cannot hold 60 fps on that device.
      result.profile.mainThreadMsPerFrame = frames ? Math.round(10 * result.profile.sampledMs * (1 - result.profile.idlePct / 100) / frames) / 10 : null;
    }
    result.wallSeconds = Math.round((Date.now() - started) / 1000);
  } catch (error) {
    result.error = String(error?.stack || error).split('\n').slice(0, 4).join(' | ');
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
  return result;
}

function line(r) {
  if (r.error) return `${r.scenario.padEnd(8)} ${r.device.padEnd(8)} ERROR ${r.error}`;
  const f = r.frames;
  return `${r.scenario.padEnd(8)} ${r.device.padEnd(8)} avg ${String(f.avgFps).padStart(5)} fps | 1% low ${String(f.onePctLowFps).padStart(5)} | p99 ${String(f.p99ms).padStart(5)} ms | max ${String(f.maxMs).padStart(6)} ms | >33ms ${f.framesOver33ms}/${f.frames} (${f.longFramePct}%) | >100ms ${f.framesOver100ms}` +
    (r.profile ? ` | main thread ${r.profile.mainThreadMsPerFrame} ms/frame (idle ${r.profile.idlePct}%)` : '');
}

await mkdir(OUT, { recursive: true });
const all = [];
for (const device of DEVICES) {
  for (const scenario of SCENARIOS) {
    console.log(`\n== ${scenario} / ${device} (${SECONDS}s${device === 'phone' ? `, ${THROTTLE}x CPU, dpr ${DPR}` : ''})`);
    const r = await runOne(scenario, device); // one at a time, fresh browser each
    all.push(r);
    console.log(line(r));
    if (r.before || r.after) console.log('  state:', JSON.stringify(r.before), '->', JSON.stringify(r.after));
    await sleep(1500);
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(OUT, `bench-${stamp}.json`);
await writeFile(file, JSON.stringify({ when: new Date().toISOString(), host: { cpu: os.cpus()[0]?.model, cores: os.cpus().length }, seconds: SECONDS, throttle: THROTTLE, dpr: DPR, runs: all }, null, 1));
console.log('\n=== summary');
for (const r of all) console.log(line(r));
console.log(`\nSaved ${file}`);
process.exit(all.some(r => r.error) ? 1 : 0);
