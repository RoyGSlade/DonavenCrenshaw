// Weekly time trial, flown for real in a browser: the hangar card, a whole lap
// driven through keyboard events (the same input path a player uses), the
// finish, the local best and its ghost, the recording replayed to the same
// time, a mine death, a rail stun, and screenshots of each.
//
//   node scripts/test-stardust-weekly-browser.mjs [--hub=http://localhost:3100] [--headed]
//
// Without --hub the production hub is blocked, so nothing leaves the machine.
// With --hub the game talks to that local hub (sign in on the site first, in
// the same browser profile, for times to save — see docs/stardust/WEEKLY.md).
// Playwright: PLAYWRIGHT_MODULE, or the Codex runtime copy on this machine.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const out = path.join(root, 'docs', 'stardust', 'evidence', 'weekly');
await mkdir(out, { recursive: true });

const fallback = pathToFileURL('C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href;
const pw = await import(process.env.PLAYWRIGHT_MODULE || fallback).catch(() => import('playwright'));
const chromium = pw.chromium || pw.default?.chromium;

const port = 4181 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [path.join(root, 'scripts', 'preview-stardust.mjs')], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}/projects/Space-Shooter/`;
for (let i = 0; i < 50; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

const browser = await chromium.launch({ headless: !args.headed });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/api\.donavencrenshaw|Failed to load resource|ERR_FAILED|CORS/.test(m.text())) errors.push(m.text()); });
if (!args.hub) await page.route('https://api.donavencrenshaw.com/**', (r) => r.abort());

try {
  const query = args.hub ? `?preview=weekly&hub=${encodeURIComponent(args.hub)}` : '?preview=weekly';
  await page.goto(base + query);
  // Synchronous handles for waitForFunction (an async predicate would resolve at once).
  await page.waitForFunction(() => document.getElementById('weekly-card') && !document.getElementById('weekly-card').hidden);
  await page.evaluate(async () => { window.__sd = (await import('/projects/Space-Shooter/state.js')).state; });
  await page.waitForSelector('#weekly-card:not([hidden])');
  await page.waitForFunction(() => !document.getElementById('weekly-btn').disabled);
  await page.screenshot({ path: path.join(out, 'game-hangar-card.png') });
  check(/Preview week 1/.test(await page.textContent('#weekly-btn')), 'hangar card offers the preview flight');
  await page.click('#weekly-btn');
  await page.waitForFunction(() => window.__sd.run?.kind === 'weekly' && !window.__sd.ui.countdownActive && window.__sd.run.current?.countdownT <= 0);
  await page.screenshot({ path: path.join(out, 'game-grid.png') });

  // The driver: the test pilot's racing line, flown with A/D/W/X key events.
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
    let idx = 0;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    window.__weeklyDriver = { done: false };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const tick = () => {
      const lv = state.run?.current;
      if (!lv || lv.completed || state.ui.showEndOverlay) { for (const k of [...held]) key(k, false); window.__weeklyDriver.done = true; return; }
      // A death opens the attempt-over screen: retry, like a player would.
      if (state.ui.showFailOverlay) { for (const k of [...held]) key(k, false); window.__weeklyDriver.deaths = (window.__weeklyDriver.deaths || 0) + (window.__weeklyDriver.onFail ? 0 : 1); window.__weeklyDriver.onFail = true; document.querySelector('[data-fail="retry"]')?.click(); requestAnimationFrame(tick); return; }
      window.__weeklyDriver.onFail = false;
      if (lv.wreck || state.ui.countdownActive) { for (const k of [...held]) key(k, false); requestAnimationFrame(tick); return; }
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
      key('d', err > 0.05);
      key('a', err < -0.05);
      key('w', Math.abs(err) < 0.45 && Math.hypot(ax, ay) > 0.25);
      key('x', speed > want + 0.8);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Screenshots along the lap, by race time.
  const shots = [[3, 'game-top-straight'], [18, 'game-staircase'], [34, 'game-long-drop'], [60, 'game-hairpin'], [85, 'game-climb']];
  for (const [seconds, name] of shots) {
    const reached = await page.waitForFunction((s) => window.__sd.run?.current?.activeMs >= s * 1000 || window.__weeklyDriver?.done, seconds, { timeout: 240000, polling: 100 }).then(() => true).catch(() => false);
    if (reached) await page.screenshot({ path: path.join(out, `${name}.png`) });
  }
  await page.waitForFunction(() => window.__weeklyDriver?.done, null, { timeout: 300000, polling: 250 }).catch(async (error) => {
    // Say where the pilot got stuck instead of a bare timeout.
    console.log('lap did not finish:', JSON.stringify(await page.evaluate(() => { const lv = window.__sd.run?.current, ui = window.__sd.ui; return { activeMs: lv?.activeMs, shards: lv?.shards?.size, dead: lv?.dead, wreck: !!lv?.wreck, locked: lv?.lockedInStart, deaths: window.__weeklyDriver?.deaths, countdown: ui.countdownActive, paused: ui.paused, fail: ui.showFailOverlay, end: ui.showEndOverlay, start: ui.showStartOverlay }; })), errors);
    throw error;
  });
  const result = await page.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    const { replayInputLog } = await import('/projects/Space-Shooter/engine/weekly/replay.js');
    const lv = state.run.current;
    const raw = localStorage.getItem('stardust.weekly.weekly-01.v1.best');
    const best = raw ? JSON.parse(raw) : null;
    const replay = best ? replayInputLog(lv.layout, best.log) : null;
    return { finished: lv.finished, ms: lv.finishMs, shards: lv.shards.size, total: lv.shardList.length, wallHits: lv.wallHits, best: best?.ms, logBytes: best?.log.length, replayMs: replay?.finishMs, matches: replay?.matches, end: document.getElementById('starmap-end-title')?.textContent, save: document.getElementById('starmap-end-save')?.textContent };
  });
  console.log(JSON.stringify(result));
  check(result.finished && result.shards === result.total, `finished a live lap with every shard (${(result.ms / 1000).toFixed(2)} s, ${result.wallHits} rail hits)`);
  check(Math.round(result.ms) === result.best, 'local best saved with the finish time');
  check(result.matches === true, `recorded inputs replay to the same finish (${result.replayMs?.toFixed(3)} vs ${result.ms?.toFixed(3)} ms, ${result.logBytes} bytes)`);
  check(/Gantry Drop complete/.test(await page.textContent('#starmap-end-lede') || ''), 'end screen names the weekly track');
  await page.screenshot({ path: path.join(out, 'game-finish.png') });

  // Fly again: the best now rides along as a ghost.
  await page.click('#starmap-again-btn');
  await page.waitForFunction(() => window.__sd.run?.kind === 'weekly' && !window.__sd.ui.countdownActive && window.__sd.run.current?.countdownT <= 0);
  const ghosts = await page.evaluate(async () => (await import('/projects/Space-Shooter/engine/modes/weekly.js')).weeklyGhosts().length);
  check(ghosts >= 1, 'second attempt has the personal-best ghost');
  const send = (type, key) => page.evaluate(([t, k]) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true })), [type, key]);
  await send('keydown', ' ');
  await send('keydown', 'w');
  await page.waitForTimeout(1200);
  await send('keyup', 'w');
  check(await page.evaluate(async () => !(await import('/projects/Space-Shooter/state.js')).state.run.current.lockedInStart), 'Space/W launch the second attempt');
  await page.screenshot({ path: path.join(out, 'game-ghost.png') });

  // A rail hit: speed halved, controls stunned.
  const stun = await page.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    const lv = state.run.current;
    const { pointOnTrack } = await import('/projects/Space-Shooter/engine/track.js');
    const p = lv.player;
    // Two cells right of the centre on the top straight, heading into the right-hand rail.
    const at = pointOnTrack(lv.track, 60, 2.2);
    p.x = at.x; p.y = at.y; p.stunTimer = 0;
    p.vx = at.tx * 4 - at.ty * 6; p.vy = at.ty * 4 + at.tx * 6;
    const before = Math.hypot(p.vx, p.vy);
    await new Promise((r) => setTimeout(r, 250));
    return { stunned: p.stunTimer > 0 || lv.wallHits > 0, before, after: Math.hypot(p.vx, p.vy), hits: lv.wallHits };
  });
  check(stun.hits >= 1 && stun.after < stun.before * 0.62, `rail hit halves speed and stuns (${stun.before.toFixed(1)} → ${stun.after.toFixed(1)}, hits ${stun.hits})`);
  await page.screenshot({ path: path.join(out, 'game-rail-stun.png') });

  // A mine: instant loss, then straight back to the grid on a fresh clock.
  const mine = await page.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    const lv = state.run.current;
    const m = lv.mines[0];
    lv.player.x = m.x - 1.2; lv.player.y = m.y; lv.player.vx = 5; lv.player.vy = 0; lv.player.stunTimer = 0;
    await new Promise((r) => setTimeout(r, 400));
    return { dead: lv.dead, wreck: !!lv.wreck };
  });
  check(mine.dead === 'mine' && mine.wreck, 'touching a mine destroys the ship');
  // The attempt-over screen: cause, the board around you, Retry / Return to hangar.
  const failShown = await page.waitForSelector('#weekly-fail:not(.hidden)', { timeout: 5000 }).then(() => true).catch(() => false);
  check(failShown && /DESTROYED/.test(await page.textContent('#fx-fail-title')), 'a death opens the attempt-over screen');
  await page.screenshot({ path: path.join(out, 'game-mine-death.png') });
  await page.keyboard.press('r');
  const reset = await page.waitForFunction(() => { const lv = window.__sd.run.current; return lv && !lv.dead && lv.lockedInStart && lv.activeMs === 0; }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  check(reset, 'after a death the next attempt starts on the grid with the clock at zero');

  // A slow ship inside a sentry's range gets locked and shot at.
  const sentry = await page.evaluate(async () => {
    const { state } = await import('/projects/Space-Shooter/state.js');
    await new Promise((r) => { const w = () => (!state.ui.countdownActive ? r() : setTimeout(w, 50)); w(); });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const lv = state.run.current;
    const s = lv.sentries[0];
    const corner = lv.track.points[s.point];
    let fired = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      lv.player.x = corner.x - 3; lv.player.y = corner.y + 0.5; lv.player.vx = 0.5; lv.player.vy = 0; lv.player.hp = 100;
      if (lv.enemyShots.length || s.state === 'telegraph') fired = true;
      await new Promise((r) => setTimeout(r, 30));
    }
    return { fired, state: s.state, locked: lv.lockedInStart, activeMs: lv.activeMs, fail: state.ui.showFailOverlay, countdown: state.ui.countdownActive, dead: lv.dead };
  });
  check(sentry.fired, `a slow ship in range draws sentry fire${sentry.fired ? '' : ` ${JSON.stringify(sentry)}`}`);
  await page.screenshot({ path: path.join(out, 'game-sentry-lock.png') });
  check(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall weekly browser checks passed');
process.exit(failures.length ? 1 : 0);
