// Visual QA for the pilot pages with a mocked hub.
//
//   SITE_BASE=/ npm run build
//   node scripts/qa-site-pages.mjs
//
// Serves public/ on 127.0.0.1:4310, answers every hub request with canned JSON
// shaped like the contract (CONTRACT.md: a signed-in member with earned titles,
// boards mixing avatars, titles and plain names, public/private/staff profiles,
// comments), and screenshots each page at desktop (1366 x 900) and mobile
// (390 x 844) into docs/stardust/evidence/weekly/. The weekly page is shot
// twice, before it opens and while it's live, by setting window.__SD_NOW__
// (honoured only on a loopback host). Fails on any page error or console error.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT = 'file:///C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || PLAYWRIGHT);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs', 'stardust', 'evidence', 'weekly');
const PORT = Number(process.env.QA_PORT) || 4310;
const ORIGIN = `http://127.0.0.1:${PORT}`;

if (!fs.existsSync(path.join(PUBLIC, 'stardust', 'weekly', 'index.html'))) {
    console.error('public/ has no weekly page. Run `SITE_BASE=/ npm run build` first.');
    process.exit(1);
}
// The hub origin the build baked into data-hub (HUB_URL).
const HUB = (/data-hub="([^"]+)"/.exec(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')) || [])[1] || 'https://api.donavencrenshaw.com';

// --- A tiny static server for public/ -----------------------------------------------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    let file = path.join(PUBLIC, pathname);
    if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }).end(body);
    });
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

// --- The mocked hub -------------------------------------------------------------------

const t = (id, title, rarity) => ({ id, title, rarity });
const ME = {
    id: 'u1', email: 'nova@example.test', username: 'nova_pilot', displayName: 'Nova', bio: 'Drift first, ask later. Chasing a sub-two full run.',
    avatarUrl: null, discordUsername: null, role: 'USER', createdAt: '2026-08-14T18:00:00Z', gravatarHash: null,
    avatarPreset: 'pilot-nova', titleId: 'weekly-podium', title: t('weekly-podium', 'Podium Regular', 'rare'), profilePublic: true
};
const EARNED = [
    { id: 'weekly-01-champion', title: 'Week 1 Champion', rarity: 'unique', description: 'First place in Week 1, Gantry Drop.', earnedAt: '2026-10-06T19:05:00Z', source: 'placement' },
    { id: 'founding-pilot', title: 'Founding Pilot', rarity: 'legendary', description: 'Flew Stardust in its first season.', earnedAt: '2026-09-01T00:00:00Z', source: 'manual' },
    { id: 'pole-position', title: 'Pole Position', rarity: 'epic', description: 'Hold first place on any circuit.', earnedAt: '2026-09-20T00:00:00Z', source: 'threshold' },
    { id: 'weekly-podium', title: 'Podium Regular', rarity: 'rare', description: 'Finish top 3 in any weekly event.', earnedAt: '2026-09-22T00:00:00Z', source: 'placement' },
    { id: 'circuit-rider', title: 'Circuit Rider', rarity: 'common', description: 'Post an accepted finish on all five circuits.', earnedAt: '2026-09-10T00:00:00Z', source: 'threshold' }
];
const ALL_TITLES = [
    ...EARNED.map(({ id, title, rarity, description }) => ({ id, title, rarity, description, hidden: false, holders: 3 })),
    { id: 'grand-pole', title: 'Grand Pole', rarity: 'legendary', description: 'Hold first place on all five circuits at once.', hidden: false, holders: 0 },
    { id: 'void-ace', title: 'Void Ace', rarity: 'epic', description: 'Win 100 recorded Dogfight duels.', hidden: false, holders: 0 },
    { id: 'dust-veteran', title: 'Dust Veteran', rarity: 'rare', description: 'Post 500 accepted runs.', hidden: false, holders: 1 },
    { id: 'wingmate', title: 'Wingmate', rarity: 'common', description: 'Make your first friend.', hidden: false, holders: 9 },
    { id: 'seal-breaker', title: '???', rarity: 'legendary', description: null, hidden: true, hint: 'Remember the way home, backwards.', holders: 0 },
    { id: 'gatecrasher', title: '???', rarity: 'epic', description: null, hidden: true, hint: 'The map ends before the sky does.', holders: 1 }
];
const PRESETS = ['nova', 'comet', 'vega', 'orion', 'lyra', 'draco', 'atlas', 'ember', 'frost', 'void', 'sol', 'nebula']
    .map((n) => ({ id: `pilot-${n}`, name: n[0].toUpperCase() + n.slice(1) }));

// Ten rows mixing presets, an upload, plain letters, titles and long names.
function boardEntries(base, step, stamp) {
    const pilots = [
        ['Roy_G_Slade', 'Roy_G_Slade', 'pilot-orion', t('weekly-01-champion', 'Week 1 Champion', 'unique')],
        ['DwarvenEx', 'DwarvenEx', 'pilot-ember', t('founding-pilot', 'Founding Pilot', 'legendary')],
        ['nova_pilot', 'Nova', 'pilot-nova', t('weekly-podium', 'Podium Regular', 'rare')],
        ['Antwon', 'Antwon', null, null],
        ['debo', 'debo', 'pilot-frost', t('pole-position', 'Pole Position', 'epic')],
        ['DrageNivek', 'DrageNivek', null, t('circuit-rider', 'Circuit Rider', 'common')],
        ['vega', 'Vega of the Long Drop', 'pilot-vega', t('gatecrasher', 'Gatecrasher', 'epic')],
        ['quietcomet', 'quietcomet', 'pilot-comet', null],
        ['lyra_x', 'Lyra', 'pilot-lyra', t('wingmate', 'Wingmate', 'common')],
        ['sol-runner', 'sol-runner', 'pilot-sol', null]
    ];
    return pilots.map(([username, displayName, avatarPreset, title], i) => ({
        rank: i + 1, username, displayName, avatarPreset, avatarUrl: null, title, timeMs: base + i * step + (i * 137) % 900, setAt: stamp
    }));
}

const PROFILES = {
    nova_pilot: {
        username: 'nova_pilot', displayName: 'Nova', avatarPreset: 'pilot-nova', avatarUrl: null, title: t('weekly-podium', 'Podium Regular', 'rare'), joinedAt: '2026-08-14T18:00:00Z', isPublic: true,
        bio: 'Drift first, ask later. Chasing a sub-two full run.\nFlies with a gamepad, badly.',
        titles: EARNED.map(({ id, title, rarity, earnedAt }) => ({ id, title, rarity, earnedAt })),
        stardust: { bests: [
            { board: 'alpha-relay', name: 'Alpha Relay', timeMs: 21870, rank: 3, setAt: '2026-09-21T00:00:00Z' },
            { board: 'full', name: 'Full run', timeMs: 128340, rank: 3, setAt: '2026-09-27T00:00:00Z' },
            { board: 'iron-veil', name: 'Iron Veil', timeMs: 30120, rank: 1, setAt: '2026-09-24T00:00:00Z' },
            { board: 'weekly-01', name: 'Week 1 · Gantry Drop', timeMs: 61230, rank: 3, setAt: '2026-10-01T00:00:00Z' }
        ] },
        dogfight: { wins: 14, losses: 9 },
        events: [{ id: 'weekly-00', name: 'Week 0 — Shakedown', rank: 2, timeMs: 58900 }],
        staff: false
    },
    vega: {
        username: 'vega', displayName: 'Vega of the Long Drop', avatarPreset: 'pilot-vega', avatarUrl: null, title: t('gatecrasher', 'Gatecrasher', 'epic'), joinedAt: '2026-09-02T18:00:00Z', isPublic: false,
        events: [{ id: 'weekly-00', name: 'Week 0 — Shakedown', rank: 5, timeMs: 61900 }],
        staff: false
    },
    Roy_G_Slade: {
        username: 'Roy_G_Slade', displayName: 'Roy_G_Slade', avatarPreset: 'pilot-orion', avatarUrl: null, title: t('founding-pilot', 'Founding Pilot', 'legendary'), joinedAt: '2026-07-30T18:00:00Z', isPublic: true,
        bio: 'Builds Stardust. Dev times on weekly tracks are kept apart and never ranked.',
        titles: [{ id: 'founding-pilot', title: 'Founding Pilot', rarity: 'legendary', earnedAt: '2026-09-01T00:00:00Z' }, { id: 'bug-hunter', title: 'Bug Hunter', rarity: 'epic', earnedAt: '2026-09-02T00:00:00Z' }],
        stardust: { bests: [{ board: 'full', name: 'Full run', timeMs: 114692, rank: 1, setAt: '2026-09-27T15:57:56Z' }, { board: 'beacon-prime', name: 'Beacon Prime', timeMs: 19840, rank: 1, setAt: '2026-09-25T00:00:00Z' }] },
        dogfight: { wins: 31, losses: 12 },
        events: [],
        staff: true,
        devTimes: [{ board: 'weekly-01', name: 'Week 1 · Gantry Drop', timeMs: 52345, setAt: '2026-09-29T10:00:00Z' }]
    }
};

const COMMENTS = [
    { id: 'c5', page: 'stardust-weekly-01', name: 'Nova', text: 'Mine #4 on the drop got me twice. Hug the left rail after shard 5.', createdAt: '2026-10-01T16:20:00Z', author: { username: 'nova_pilot', displayName: 'Nova', avatarPreset: 'pilot-nova', title: t('weekly-podium', 'Podium Regular', 'rare') } },
    { id: 'c4', page: 'stardust-weekly-01', name: 'Roy_G_Slade', text: 'Board is live. Good luck, pilots.', createdAt: '2026-09-30T02:05:00Z', author: { username: 'Roy_G_Slade', displayName: 'Roy_G_Slade', avatarPreset: 'pilot-orion', title: t('founding-pilot', 'Founding Pilot', 'legendary') } },
    { id: 'c3', page: 'stardust-weekly-01', name: 'Antwon', text: 'who put a sentry on the hairpin 😭\nsecond line to check wrapping', createdAt: '2026-09-30T01:10:00Z', author: { username: 'Antwon', displayName: 'Antwon', avatarPreset: null, title: null } },
    { id: 'c2', page: 'stardust-weekly-01', name: 'Old pilot', text: 'A comment from before comments had authors.', createdAt: '2026-09-29T20:00:00Z', author: null }
];

const json = (status, data) => ({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Credentials': 'true' }, body: JSON.stringify(data) });

function hubAnswer(method, url) {
    const p = url.pathname.replace(/^\/api/, '');
    const q = url.searchParams;
    if (method === 'OPTIONS') return { status: 204, headers: { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
    if (p === '/users/session') return json(200, { user: ME });
    if (p === '/users/me/titles') return json(200, { active: ME.titleId, earned: EARNED });
    if (p === '/titles') return json(200, { titles: ALL_TITLES });
    if (p === '/avatars') return json(200, { presets: PRESETS });
    if (p === '/users/me/avatar' && method === 'PUT') return json(200, { avatarPreset: 'pilot-nova' });
    if (p === '/users/me/title' && method === 'PUT') return json(200, { active: ME.titleId });
    if (p === '/games/stardust/me') return json(200, { bests: {
        full: { timeMs: 128340, rank: 3, medal: 'silver', splits: { 'alpha-relay': 21870, 'beacon-prime': 22010, 'dustfall-station': 27300, 'nether-crossing': 26840, 'iron-veil': 30320 } },
        'alpha-relay': { timeMs: 21870, rank: 3, medal: 'gold' }, 'iron-veil': { timeMs: 30120, rank: 1, medal: 'gold' }
    } });
    if (p === '/games/stardust') return json(200, { boards: [], events: [] });
    if (p === '/dogfight/me') return json(200, { wins: 14, played: 23 });
    if (p === '/friends') return json(200, { friends: [], incoming: [], outgoing: [], blocked: [] });
    if (p === '/games/stardust/challenges') return json(200, { challenges: [] });
    if (p === '/games/stardust/boards/weekly-01') return json(200, { board: 'weekly-01', entries: boardEntries(52870, 1630, '2026-10-01T03:00:00Z') });
    if (p.startsWith('/games/stardust/boards/')) return json(200, { entries: boardEntries(114692, 9100, '2026-09-27T15:57:56Z') });
    if (p === '/feedback' && method === 'GET') return json(200, { items: q.get('page') === 'stardust-weekly-01' ? COMMENTS : [] });
    if (p.startsWith('/profiles/')) {
        const name = decodeURIComponent(p.slice('/profiles/'.length));
        const hit = Object.values(PROFILES).find((pr) => pr.username.toLowerCase() === name.toLowerCase());
        return hit ? json(200, hit) : json(404, { error: 'not_found' });
    }
    return json(404, { error: 'not_found' });
}

// --- Shots --------------------------------------------------------------------------------

const VIEWPORTS = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };
const UPCOMING = Date.parse('2026-09-29T11:42:10-07:00');
const LIVE = Date.parse('2026-10-01T09:30:05-07:00');

const SHOTS = [
    { name: 'account', path: '/account/', full: true, parts: [['account-pilot-card', '#pilot-card']] },
    { name: 'profile-public', path: '/u/?name=nova_pilot', full: true },
    { name: 'profile-private', path: '/u/?name=vega', full: true },
    { name: 'profile-staff', path: '/u/?name=Roy_G_Slade', full: true },
    { name: 'profile-missing', path: '/u/?name=nobody_here', full: false, expect404: true },
    { name: 'stardust', path: '/stardust/', full: false, parts: [['stardust-board', '#fastest-runs']] },
    // The hub asleep: the board falls back to the build-time snapshot (names only, letter avatars).
    { name: 'stardust-hub-asleep', path: '/stardust/', full: false, hubDown: true, parts: [['stardust-board-snapshot', '#fastest-runs']] },
    { name: 'weekly-upcoming', path: '/stardust/weekly/', full: true, now: UPCOMING },
    { name: 'weekly-live', path: '/stardust/weekly/', full: true, now: LIVE },
    { name: 'home', path: '/', full: false }
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];
const written = [];
try {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
        for (const shot of SHOTS) {
            const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', isMobile: vpName === 'mobile', hasTouch: vpName === 'mobile' });
            if (shot.now) await context.addInitScript((now) => { window.__SD_NOW__ = now; }, shot.now);
            await context.route(`${HUB}/**`, (route) => route.fulfill(shot.hubDown ? json(503, { error: 'asleep' }) : hubAnswer(route.request().method(), new URL(route.request().url()))));
            const page = await context.newPage();
            page.on('pageerror', (error) => problems.push(`${shot.name}/${vpName}: page error ${error.message}`));
            // A 404 from the hub is the point of the missing-profile shot, and a 503 of the asleep one.
            page.on('console', (msg) => { if (msg.type() === 'error' && !((shot.expect404 || shot.hubDown) && /status of (404|503)/.test(msg.text()))) problems.push(`${shot.name}/${vpName}: console ${msg.text()}`); });
            page.on('requestfailed', (req) => { if (!/favicon|\.mp3|\.ogg/.test(req.url())) problems.push(`${shot.name}/${vpName}: request failed ${req.url()}`); });
            await page.goto(`${ORIGIN}${shot.path}`, { waitUntil: 'networkidle' });
            await page.waitForTimeout(700);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            if (overflow > 1) problems.push(`${shot.name}/${vpName}: page scrolls sideways by ${overflow}px`);
            const file = path.join(OUT, `${shot.name}-${vpName}.png`);
            await page.screenshot({ path: file, fullPage: shot.full });
            written.push(file);
            // The skip link is position: fixed; element shots of tall parts would catch it.
            await page.addStyleTag({ content: '.skip-link { visibility: hidden; }' });
            for (const [partName, selector] of shot.parts || []) {
                const part = page.locator(selector).first();
                await part.scrollIntoViewIfNeeded();
                const partFile = path.join(OUT, `${partName}-${vpName}.png`);
                await part.screenshot({ path: partFile });
                written.push(partFile);
            }
            await context.close();
        }
    }
} finally {
    await browser.close();
    server.close();
}

for (const file of written) console.log(`[SHOT] ${path.relative(ROOT, file)}`);
if (problems.length) {
    console.error(`\n[FAIL] ${problems.length} problem(s):`);
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
}
console.log(`[OK] ${written.length} screenshots, no page errors, no sideways scroll.`);
