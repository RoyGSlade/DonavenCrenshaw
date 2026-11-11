// Shared helpers for Stardust browser scripts (benchmark, Voyage tests).
// Dev-only: Playwright is supplied by the developer runtime and never shipped to players.
// Nothing here touches game code; it only starts a local static server and drives a browser.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createDogfightServer } from './serve-stardust-dogfight.mjs';

export const GAME_PATH = '/projects/Space-Shooter/';
export const DOGFIGHT_PATH = '/projects/Space-Shooter/dogfight/';
export const PHONE = Object.freeze({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
export const DESKTOP = Object.freeze({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

/** Find Playwright: PLAYWRIGHT_MODULE, a local install, or the Codex runtime bundle. */
export async function loadPlaywright() {
  let spec = process.env.PLAYWRIGHT_MODULE;
  if (!spec) {
    const bundled = path.join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(bundled)) spec = bundled;
  }
  if (!spec) return import('playwright');
  return import(spec.startsWith('file:') || !path.isAbsolute(spec) ? spec : pathToFileURL(spec).href);
}

/** Static game server plus Dogfight relay on a free local port. Close it when done. */
export async function startServer() {
  const server = await createDogfightServer({ port: 0 });
  return { port: server.port, origin: `http://127.0.0.1:${server.port}`, close: () => server.close() };
}

export async function launchBrowser(extra = {}) {
  const { chromium } = await loadPlaywright();
  return chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}), ...extra });
}

/** Keep runs independent of the public account service and the network. */
export async function blockHub(context) {
  await context.route('https://api.donavencrenshaw.com/**', route => route.fulfill({ json: { user: null } }));
}

// ---------------------------------------------------------------------------
// New-game scaffolding. The expansion REPLACES today's Stardust (Donaven, 2026-11-11), so this is
// not a side mode: the flag selects the new game, and with it off today's game must run unchanged.
// CONTRACT (proposed by bench; core owns the real switch, see bench/STATUS.md):
//   The new game is on only if the page is opened with ?newgame=1 OR localStorage['stardust.newgame'] === '1'.
//   ?newgame=0 wipes the stored flag for that load. Default is off.
// If core picks a different switch or route, change NEWGAME_FLAG / the paths below and every
// new-game test follows. (Old name in lane notes: "Voyage".)
export const NEWGAME_FLAG = Object.freeze({ query: 'newgame', storageKey: 'stardust.newgame', on: '1' });

/** URL of today's hangar, optionally with the new-game flag on and extra query params. */
export function gameUrl(origin, { newGame = false, params = {} } = {}) {
  const url = new URL(GAME_PATH, origin);
  if (newGame) url.searchParams.set(NEWGAME_FLAG.query, NEWGAME_FLAG.on);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.href;
}

/**
 * Open a page with the new game on (or off) and wait until the engine has booted.
 * Returns { page, context, errors }. `errors` collects page errors and failed requests.
 * `storage` seeds extra localStorage keys on the first load of the tab (for save-shape tests).
 * If the new game ships on its own route, pass `url` to override the target.
 */
export async function bootStardust(browser, origin, { newGame = true, params = {}, profile = DESKTOP, storage = {}, url = null } = {}) {
  const context = await browser.newContext({ ...profile });
  await blockHub(context);
  const flag = NEWGAME_FLAG;
  await context.addInitScript(({ newGame, flag, storage }) => {
    try {
      // Only on first load of the tab so tests can reload and keep their own state.
      if (!sessionStorage.getItem('__newGameKitInit')) {
        sessionStorage.setItem('__newGameKitInit', '1');
        if (newGame) localStorage.setItem(flag.storageKey, flag.on); else localStorage.removeItem(flag.storageKey);
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    } catch { /* storage blocked: the query param still carries the flag */ }
  }, { newGame, flag, storage });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url || gameUrl(origin, { newGame, params }));
  // Booted = the engine finished initialising (today the start button may be retired/disabled by the weekly rollout).
  await page.waitForFunction(() => /FLIGHT SYSTEMS READY|could not load/.test(document.getElementById('boot-status')?.textContent || ''), null, { timeout: 30000 });
  assert(!/could not load/.test(await page.locator('#boot-status').textContent()), 'Stardust failed to initialise');
  return { page, context, errors };
}

/**
 * A plain-data snapshot of today's hangar menu: every visible button/link/heading with its text and id,
 * in document order. Two snapshots being equal means the menu did not change.
 */
export function menuFingerprint(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#starmap-start') || document.body;
    const seen = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return !el.hidden && s.display !== 'none' && s.visibility !== 'hidden' && (r.width > 0 || r.height > 0); };
    return [...root.querySelectorAll('button, a[href], h1, h2, h3, [role="tab"], select, input')]
      .filter(seen)
      // Live data that changes every load (clocks, standings) is not menu structure.
      .filter(el => !el.closest('#weekly-ticker, #hangar-board'))
      .map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || '', text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) }));
  });
}

/** Anything in the page that belongs to the new game (data attribute, id/class containing "newgame", link to it). */
export function newGameTraces(page) {
  return page.evaluate(() => ({
    elements: [...document.querySelectorAll('[data-newgame], [id*="newgame" i], [class*="newgame" i], a[href*="newgame" i]')].map(e => e.id || e.className || e.tagName),
    flagInStorage: (() => { try { return localStorage.getItem('stardust.newgame'); } catch { return null; } })(),
  }));
}
