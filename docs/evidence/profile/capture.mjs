// Screenshots the account page, pilot profiles and leaderboards against fixture hub answers.
//
//   node docs/evidence/profile/capture.mjs            (serves public/ on a free port above 4600)
//
// Every request to https://api.donavencrenshaw.com is answered here from the contract, so this
// needs no hub. Screenshots land next to this file. The Playwright import is the one the
// repo's other browser checks use.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import('file:///C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PUBLIC = path.join(ROOT, 'public');
const HUB = 'https://api.donavencrenshaw.com';
const { presetAppearance } = await import(pathToFileURL(path.join(ROOT, 'projects/Space-Shooter/systems/shipLivery.js')).href);

// --- static server ----------------------------------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const port = await new Promise((resolve) => {
  const tryPort = (p) => server.once('error', () => tryPort(p + 1)).listen(p, '127.0.0.1', () => resolve(p));
  tryPort(4641);
});
const ORIGIN = `http://127.0.0.1:${port}`;

// --- fixtures ---------------------------------------------------------------------------------

function appearance(family, parts, paint = {}) {
  const a = presetAppearance(family);
  Object.assign(a.parts, parts);
  Object.assign(a.paint, paint);
  return a;
}
const EQUIPPED = appearance('needle', { body: 0, wings: 0, cockpit: 2, engines: 0 }, { hull: '#d9492f', wings: '#2f6fd9', nose: '#f2c230', trim: '#20242b', glass: '#47d8f5', engines: '#8c8c8c' });
const DESIGNS = [
  { id: 'd1', title: 'Ember Needle', family: 'needle', appearance: EQUIPPED, createdAt: '2026-09-28T10:00:00Z', author: { username: 'nova', displayName: 'Nova' } },
  { id: 'd2', title: 'Midnight Manta', family: 'manta', appearance: appearance('manta', { body: 2, wings: 0, cockpit: 1, engines: 2 }, { hull: '#1d2747', wings: '#26335f', nose: '#6b7dd6' }), createdAt: '2026-09-27T10:00:00Z', author: { username: 'nova', displayName: 'Nova' } },
  { id: 'd3', title: 'Wisp Bloom', family: 'wisp', appearance: appearance('wisp', { body: 0, wings: 1, cockpit: 0, engines: 1 }, { hull: '#e8a1c8', wings: '#c77fb0' }), createdAt: '2026-09-26T10:00:00Z', author: { username: 'nova', displayName: 'Nova' } },
  { id: 'd4', title: 'Broken design', family: 'needle', appearance: { version: 2, family: 'needle', nonsense: true }, createdAt: '2026-09-25T10:00:00Z', author: { username: 'nova', displayName: 'Nova' } }
];

const userBase = { id: 'u1', username: 'nova', displayName: 'Nova', email: 'nova@example.test', bio: 'Night runs only.', createdAt: '2026-09-01T12:00:00Z', avatarPreset: 'pilot-nova', titleId: 'hat-trick', title: { id: 'hat-trick', title: 'Hat Trick', rarity: 'epic' }, discordUsername: '' };

const ENTRIES = [
  { rank: 1, username: 'nova', displayName: 'Nova', timeMs: 114692, setAt: '2026-09-27T15:57:56Z', avatarPreset: 'pilot-nova', title: { id: 't', title: 'Hat Trick', rarity: 'epic' }, ship: { build: 'needle:0-1-2-0', family: 'needle' }, client: { device: 'phone', input: 'tilt', build: '1.4.2' } },
  { rank: 2, username: 'vega', displayName: 'Vega', timeMs: 116210, setAt: '2026-09-28T15:57:56Z', avatarPreset: 'pilot-vega', title: null, ship: { build: 'manta:2-0-1-2', family: 'manta' }, client: { device: 'desktop', input: 'keyboard', build: '1.4.2' } },
  { rank: 3, username: 'lyra', displayName: 'Lyra the Long-Named Pilot', timeMs: 117004, setAt: '2026-09-28T16:00:00Z', avatarPreset: 'pilot-lyra', title: { id: 'w', title: 'Week 1 Champion', rarity: 'unique' }, ship: { build: 'wisp:0-0-0-0', family: 'wisp' }, client: { device: 'tablet', input: 'touch', build: '1.4.2' } },
  { rank: 4, username: 'orion', displayName: 'Orion', timeMs: 118500, setAt: '2026-09-29T08:00:00Z', avatarPreset: 'pilot-orion', title: null, ship: { build: 'courier:0-1-1-0', family: 'courier' }, client: { device: 'desktop', input: 'controller', build: '1.4.2' } },
  { rank: 5, username: 'draco', displayName: 'Draco', timeMs: 119900, setAt: '2026-09-29T09:00:00Z', avatarPreset: 'pilot-draco', title: null, client: { device: 'desktop' } },
  { rank: 6, username: 'atlas', displayName: 'Atlas', timeMs: 121000, setAt: '2026-09-29T10:00:00Z', avatarPreset: null, title: null, ship: { build: 'needle:0-0-0-0', family: 'needle' } },
  { rank: 7, username: 'ember', displayName: 'Ember (today’s hub: no extras)', timeMs: 123456, setAt: '2026-09-29T11:00:00Z', avatarPreset: 'pilot-ember', title: null }
];

const PROFILES = {
  // Another pilot: bio, dogfight and ship hidden; events shown.
  nova: {
    username: 'nova', displayName: 'Nova', avatarPreset: 'pilot-nova', avatarUrl: null, title: { id: 'hat-trick', title: 'Hat Trick', rarity: 'epic' }, joinedAt: '2026-09-01T12:00:00Z', isPublic: true,
    titles: [{ id: 'hat-trick', title: 'Hat Trick', rarity: 'epic', earnedAt: '2026-09-20T00:00:00Z' }, { id: 'w', title: 'Week 1 Champion', rarity: 'unique', earnedAt: '2026-09-29T00:00:00Z' }],
    stardust: { bests: [{ board: 'full', name: 'Full run', timeMs: 114692, rank: 1, setAt: '2026-09-27T15:57:56Z' }, { board: 'iron-veil', name: 'Iron Veil', timeMs: 41000, rank: 2, setAt: '2026-09-26T15:57:56Z' }] },
    events: [{ id: 'weekly-01', name: 'Week 1 — Gantry Drop', rank: 1, timeMs: 61230 }], staff: false
  },
  // Everything shown, with a ship.
  vega: {
    username: 'vega', displayName: 'Vega', avatarPreset: 'pilot-vega', avatarUrl: null, title: null, joinedAt: '2026-09-03T12:00:00Z', isPublic: true,
    bio: 'I fly the Needle because the Manta is too comfortable.',
    titles: [{ id: 'rare', title: 'Shard Hoarder', rarity: 'rare', earnedAt: '2026-09-20T00:00:00Z' }],
    stardust: { bests: [{ board: 'full', name: 'Full run', timeMs: 116210, rank: 2, setAt: '2026-09-28T15:57:56Z' }] },
    dogfight: { wins: 7, losses: 3 }, events: [], staff: false,
    ship: { build: 'needle:0-1-2-0', family: 'needle', appearance: EQUIPPED }
  },
  // Public, every section hidden: just the card.
  lyra: { username: 'lyra', displayName: 'Lyra', avatarPreset: 'pilot-lyra', avatarUrl: null, title: null, joinedAt: '2026-09-04T12:00:00Z', isPublic: true, staff: false },
  // Private: card and event results.
  orion: { username: 'orion', displayName: 'Orion', avatarPreset: 'pilot-orion', avatarUrl: null, title: null, joinedAt: '2026-09-05T12:00:00Z', isPublic: false, events: [{ id: 'weekly-01', name: 'Week 1 — Gantry Drop', rank: 3, timeMs: 64000 }], staff: false }
};

function makeHub({ signedIn, ship = 'equipped', profilePublic = true, profileShow, log }) {
  const state = { profilePublic, profileShow: profileShow || { bio: true, titles: false, bests: true, dogfight: true, events: true, ship: true, devices: false } };
  const me = () => ({ ...userBase, profilePublic: state.profilePublic, profileShow: { ...state.profileShow } });
  return (route, request) => {
    const url = new URL(request.url());
    const p = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
    const json = (status, data) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    log.push(`${method} ${p}${url.search}${method === 'PUT' ? ` ${request.postData()}` : ''}`);
    if (p === '/users/session') return json(200, { user: signedIn ? me() : null });
    if (p === '/users/me') return signedIn ? json(200, me()) : json(401, { error: 'unauthorized' });
    if (p === '/users/profile' && method === 'PUT') {
      const body = JSON.parse(request.postData() || '{}');
      if (typeof body.profilePublic === 'boolean') state.profilePublic = body.profilePublic;
      if (body.profileShow) Object.assign(state.profileShow, body.profileShow);
      return json(200, { user: me() });
    }
    if (p === '/stardust/ship') {
      if (ship === 'equipped') return json(200, { build: 'needle:0-1-2-0', family: 'needle', appearance: EQUIPPED, updatedAt: '2026-09-29T10:00:00Z' });
      if (ship === 'broken') return json(200, { build: 'needle:0-1-2-0', family: 'needle', appearance: { version: 2, family: 'needle', nonsense: true }, updatedAt: '2026-09-29T10:00:00Z' });
      return json(404, { error: 'no_ship' });
    }
    if (p === '/stardust/liveries') return json(200, { designs: signedIn ? DESIGNS : [], profile: { username: 'nova', displayName: 'Nova', bio: null } });
    if (p.startsWith('/profiles/')) {
      const name = decodeURIComponent(p.slice('/profiles/'.length)).toLowerCase();
      if (name === 'nova' && signedIn) return json(200, { ...PROFILES.nova, bio: 'Night runs only.', dogfight: { wins: 12, losses: 4 }, ship: { build: 'needle:0-1-2-0', family: 'needle', appearance: EQUIPPED }, profileShow: state.profileShow });
      return PROFILES[name] ? json(200, PROFILES[name]) : json(404, { error: 'not_found' });
    }
    if (p === '/games/stardust/me') return json(200, { bests: { full: { timeMs: 114692, rank: 1, medal: 'gold' } } });
    if (p === '/games/stardust') return json(200, { boards: [], events: [] });
    if (/^\/games\/stardust\/boards\//.test(p)) return json(200, { entries: ENTRIES, total: ENTRIES.length });
    if (p === '/dogfight/me') return json(200, { wins: 12, played: 16 });
    if (p === '/users/me/titles') return json(200, { active: 'hat-trick', earned: [{ id: 'hat-trick', title: 'Hat Trick', rarity: 'epic', description: 'Three board records.' }] });
    if (p === '/titles') return json(200, { titles: [] });
    if (p === '/avatars') return json(200, { presets: [] });
    if (p === '/friends') return json(200, { friends: [], incoming: [], outgoing: [], blocked: [] });
    if (p.startsWith('/games/stardust/challenges')) return json(200, { challenges: [] });
    if (p === '/feedback') return json(200, { items: [] });
    return json(404, { error: 'not_found' });
  };
}

// --- runs ------------------------------------------------------------------------------------------

const browser = await chromium.launch();
const report = [];
const problems = [];

async function shoot(name, { url, hubOptions = {}, widths = [1280, 375], after, focus, clip }) {
  for (const width of widths) {
    const label = width <= 480 ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: { width, height: width <= 480 ? 812 : 900 }, deviceScaleFactor: 1, hasTouch: width <= 480 });
    const page = await context.newPage();
    const log = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    const hub = makeHub({ ...hubOptions, log });
    await page.route(`${HUB}/**`, (route, request) => hub(route, request));
    await page.goto(`${ORIGIN}${url}`, { waitUntil: 'load' });
    if (after) await after(page, { label, log });
    await page.waitForTimeout(700);
    const file = `${name}-${label}.png`;
    const target = focus ? page.locator(focus).first() : null;
    if (target) await target.screenshot({ path: path.join(HERE, file) });
    else await page.screenshot({ path: path.join(HERE, file), fullPage: true });
    // No horizontal scroll at 375.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report.push({ file, overflow, hubCalls: log.filter((l) => !l.startsWith('GET /games') || /ship|liver/.test(l)).slice(0, 14) });
    for (const e of errors) problems.push(`${file}: ${e}`);
    await context.close();
  }
}

const scrollTo = (selector) => async (page) => { await page.locator(selector).first().scrollIntoViewIfNeeded(); };

// Account, signed in, ship equipped, two sections hidden.
await shoot('account-owner', { url: '/account/', hubOptions: { signedIn: true } });
await shoot('account-owner-profile-section', { url: '/account/', hubOptions: { signedIn: true }, focus: '#public-profile' });
await shoot('account-owner-ship-section', { url: '/account/', hubOptions: { signedIn: true }, focus: '#ship' });
await shoot('account-owner-designs-section', { url: '/account/', hubOptions: { signedIn: true }, focus: '#ship-designs' });
// No ship equipped.
await shoot('account-no-ship', { url: '/account/', hubOptions: { signedIn: true, ship: 'none' }, focus: '#ship' });
// The renderer can't draw what the hub sent: the family stays readable as text.
await shoot('account-ship-undrawable', { url: '/account/', hubOptions: { signedIn: true, ship: 'broken' }, focus: '#ship' });
// Private profile: switches disabled and explained, except Event results.
await shoot('account-private-profile', { url: '/account/', hubOptions: { signedIn: true, profilePublic: false }, focus: '#public-profile' });
// Flip one switch, then the master switch, and keep the requests.
await shoot('account-toggle-saved', {
  url: '/account/', hubOptions: { signedIn: true }, focus: '#public-profile',
  after: async (page, { log }) => {
    await page.locator('[data-acct-show-key="dogfight"]').evaluate((el) => el.closest('label').click());
    await page.waitForFunction(() => document.querySelector('[data-acct-status="show"]').textContent.startsWith('Saved'));
    const text = await page.locator('[data-acct-status="show"]').textContent();
    report.push({ file: 'toggle-status', text, dogfightChecked: await page.locator('[data-acct-show-key="dogfight"]').isChecked(), puts: log.filter((l) => l.startsWith('PUT')) });
  }
});
await shoot('account-toggle-failed', {
  url: '/account/', hubOptions: { signedIn: true }, focus: '#public-profile', widths: [1280],
  after: async (page) => {
    await page.route(`${HUB}/api/users/profile`, (route, request) => (request.method() === 'PUT'
      ? route.fulfill({ status: 500, headers: { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true', 'content-type': 'application/json' }, body: '{"error":"boom"}' })
      : route.fallback()));
    await page.locator('[data-acct-show-key="bio"]').evaluate((el) => el.closest('label').click());
    await page.waitForFunction(() => document.querySelector('[data-acct-status="show"]').textContent.startsWith('Not saved'));
    report.push({ file: 'toggle-failed', text: await page.locator('[data-acct-status="show"]').textContent(), bioChecked: await page.locator('[data-acct-show-key="bio"]').isChecked() });
  }
});
await shoot('account-make-private', {
  url: '/account/', hubOptions: { signedIn: true }, focus: '#public-profile', widths: [1280],
  after: async (page) => {
    await page.locator('[data-acct-public]').evaluate((el) => el.closest('label').click());
    await page.waitForFunction(() => document.querySelector('[data-acct-status="public"]').textContent.startsWith('Saved'));
    report.push({ file: 'make-private', disabled: await page.locator('[data-acct-show-key]').evaluateAll((els) => els.map((e) => `${e.dataset.acctShowKey}:${e.disabled}`)) });
  }
});

// Public profiles.
await shoot('profile-nova-partial', { url: '/u/?name=nova', hubOptions: { signedIn: false } });
await shoot('profile-vega-full', { url: '/u/?name=vega', hubOptions: { signedIn: false } });
await shoot('profile-lyra-all-hidden', { url: '/u/?name=lyra', hubOptions: { signedIn: false } });
await shoot('profile-orion-private', { url: '/u/?name=orion', hubOptions: { signedIn: false } });
await shoot('profile-nova-owner-view', { url: '/u/?name=nova', hubOptions: { signedIn: true } });

// Leaderboards.
await shoot('stardust-board', { url: '/stardust/', hubOptions: { signedIn: false }, focus: '#fastest-runs', after: scrollTo('#fastest-runs') });
await shoot('stardust-board-tip', {
  url: '/stardust/', hubOptions: { signedIn: false }, focus: '#fastest-runs',
  after: async (page) => {
    await page.locator('#fastest-runs .sd-device').first().click();
    const tip = await page.locator('#fastest-runs .sd-device-tip:not([hidden])').first().textContent();
    const label = await page.locator('#fastest-runs .sd-device').first().getAttribute('aria-label');
    const title = await page.locator('#fastest-runs .sd-device').first().getAttribute('title');
    report.push({ file: 'board-tip', tip, label, title, badges: await page.locator('#fastest-runs .sd-device').count(), chips: await page.locator('#fastest-runs .sd-ship-chip').count(), rows: await page.locator('#fastest-runs .sd-board li').count() });
  }
});
await shoot('weekly-board', { url: '/stardust/weekly/', hubOptions: { signedIn: false }, focus: '#weekly-board' });

await browser.close();
server.close();
console.log(JSON.stringify(report, null, 1));
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'No page errors, console errors or failed requests.');
