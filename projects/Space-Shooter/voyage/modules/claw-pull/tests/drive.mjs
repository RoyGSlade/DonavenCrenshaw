// Helpers for the browser test and the proof scripts: serve the module folder, drive the page with REAL input, let a bot play through it.
// Desktop: the real mouse and keyboard. Phone: real touch events through the browser's own input pipeline (CDP), two fingers when needed.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MOD = path.resolve(here, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
export const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
export const LAPTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export async function loadPlaywright() {
  let spec = process.env.PLAYWRIGHT_MODULE;
  if (!spec) { const b = path.join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright', 'index.mjs'); if (existsSync(b)) spec = b; }
  if (!spec) return import('playwright');
  return import(spec.startsWith('file:') || !path.isAbsolute(spec) ? spec : pathToFileURL(spec).href);
}
export function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      let p = path.join(MOD, decodeURIComponent(url.pathname));
      if (!p.startsWith(MOD)) { res.writeHead(403).end(); return; }
      if ((await stat(p)).isDirectory()) p = path.join(p, 'test.html');
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(p));
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

/** Two pointers at most: the board (steer, nudge) and the Reel pad. On a phone these are two real fingers; on a desktop the mouse takes the board and the keyboard holds Reel. */
export function inputFor(page, phone, cdp) {
  const fingers = new Map();   // id -> { x, y }
  let mouseDown = false, space = false;
  const sendTouch = async (type) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id })) }); };
  return {
    async board(x, y, down) {
      if (phone) {
        if (down) { const had = fingers.has(1); fingers.set(1, { x, y }); await sendTouch(had ? 'touchMove' : 'touchStart'); }
        else if (fingers.has(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...fingers.entries()].filter(([id]) => id !== 1).map(([id, p]) => ({ x: p.x, y: p.y, id })) }); fingers.delete(1); if (fingers.size) await sendTouch('touchMove'); }
      } else if (down) { if (!mouseDown) { await page.mouse.move(x, y); await page.mouse.down(); mouseDown = true; } else await page.mouse.move(x, y); }
      else if (mouseDown) { await page.mouse.up(); mouseDown = false; }
    },
    async reel(on, pad) {
      if (phone) {
        if (on && !fingers.has(2)) { fingers.set(2, { x: pad.x, y: pad.y }); await sendTouch('touchStart'); }
        else if (!on && fingers.has(2)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...fingers.entries()].filter(([id]) => id !== 2).map(([id, p]) => ({ x: p.x, y: p.y, id })) }); fingers.delete(2); if (fingers.size) await sendTouch('touchMove'); }
      } else if (on && !space) { await page.keyboard.down(' '); space = true; }
      else if (!on && space) { await page.keyboard.up(' '); space = false; }
    },
    async release() { await this.board(0, 0, false); await this.reel(false); },
  };
}

/**
 * Let a bot (running inside the page, on the page's own game) play through real pointer events until `until(state)` or the game ends.
 * `onTick(state, n)` may take screenshots. Returns the last state.
 */
export async function drive(page, input, phone, { bot = 'perfect', until = () => false, maxMs = 120000, tickMs = 30, onTick, botOpts = {} } = {}) {
  await page.evaluate(async ([kind, opts]) => { const { BOTS } = await import('./bots.js'); const g = document.querySelector('.m-claw-pull').__game; window.__bot = BOTS[kind](g, opts); }, [bot, botOpts]);
  const t0 = Date.now(); let n = 0, last = null;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate(({ lift }) => {
      const root = document.querySelector('.m-claw-pull'), g = root.__game, v = root.__view;
      if (!g || g.over) return { over: true, why: g?.over?.why, phase: g?.phase };
      const inp = window.__bot.think(g, 1 / 30);
      const act = {};
      if (inp.goBack) act.goBack = true; if (inp.done) act.done = true; if (inp.giveUp) act.giveUp = true;
      let sp = null, nudge = null;
      if (g.phase === 'in' && inp.x != null) { const p = v.toScreen(inp.x, inp.y); sp = { x: p.x, y: p.y + lift }; }
      if (g.phase === 'reel') { const hp = v.toScreen(g.head.x, g.head.y); nudge = { x: hp.x + (inp.nx || 0) * 34 * v.cam.z, y: hp.y + (inp.ny || 0) * 34 * v.cam.z, on: Math.hypot(inp.nx || 0, inp.ny || 0) > 0.02 }; }
      const pad = document.querySelector('.cp-reel').getBoundingClientRect();
      return { act, grab: !!inp.grab, reel: !!inp.reel, down: !!inp.down, sp, nudge, pad: { x: pad.left + pad.width / 2, y: pad.top + pad.height / 2 }, phase: g.phase, t: g.t, v: g.v, grip: g.grip, gripMax: g.gripNow || g.gripMax, knocks: g.knocks, drops: g.drops, s: g.s, head: { x: g.head.x, y: g.head.y } };
    }, { lift: phone ? 48 : 0 });
    last = s;
    if (s.over) break;
    if (s.act?.goBack) { await input.release(); await page.click('.cp-grab'); }
    else if (s.act?.done) { await input.release(); await page.click('.cp-reel'); }
    else if (s.act?.giveUp) { await input.release(); await page.evaluate(() => document.querySelector('.m-claw-pull').__game && 0); break; }
    else if (s.phase === 'in') {
      await input.reel(false, s.pad);
      if (s.grab) { await input.board(0, 0, false); await page.click('.cp-grab'); await page.evaluate(() => { const g = document.querySelector('.m-claw-pull').__game; if (g.phase === 'in') window.__bot.refused?.(g.lastGrabFail); }); }   // a hand sees "that side's still buried" and tries another side
      else if (s.sp && s.down) await input.board(s.sp.x, s.sp.y, true); else await input.board(0, 0, false);
    } else if (s.phase === 'reel') {
      if (s.nudge?.on) await input.board(s.nudge.x, s.nudge.y, true); else await input.board(0, 0, false);
      await input.reel(s.reel, s.pad);
    } else { await input.release(); }
    if (onTick) await onTick(s, n);
    if (await until(s, n)) break;
    n++;
    await page.waitForTimeout(tickMs);
  }
  await input.release();
  return last;
}
