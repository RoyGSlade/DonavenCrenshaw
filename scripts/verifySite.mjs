import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SITE_BASE = `/${String(process.env.SITE_BASE || '/').replace(/^\/+|\/+$/g, '')}${process.env.SITE_BASE && process.env.SITE_BASE !== '/' ? '/' : ''}`;
const redirects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'redirects.json'), 'utf8'));
const failures = [];

const requiredRoutes = [
    '/',
    '/now/',
    '/projects/',
    '/projects/getfast/',
    '/underplain/',
    '/underplain/betterfingers/',
    '/underplain/getfast/',
    '/underplain/pdfmanager/',
    '/crenshaw-systems/',
    '/crenshaw-systems/process/',
    '/work/',
    '/infinite-ages/',
    '/kingdoms-caravans/',
    '/build-log/',
    '/support/',
    '/about/',
    '/contact/',
    '/privacy/',
    '/licenses/'
];

const bannedPublicPatterns = [
    [/source arcanum/i, 'retired Source Arcanum identity'],
    [/betterfingers declassified/i, 'retired declassified product claim'],
    [/artifact unsealed/i, 'retired artifact interface copy'],
    [/status:\s*deployed/i, 'unsupported deployed status'],
    [/donations are votes/i, 'undefined sponsor voting claim'],
    [/youtube\.com\/watch\?v=placeholder/i, 'placeholder video URL'],
    [/fonts\.(?:googleapis|gstatic)\.com/i, 'external Google font dependency'],
    [/(?:href|src)=["']\s*["']/i, 'empty href/src attribute']
];

function routeFile(route) {
    const clean = route.replace(/^\/+/, '').replace(/\/+$/, '');
    return clean ? path.join(PUBLIC, clean, 'index.html') : path.join(PUBLIC, 'index.html');
}

function redirectFile(source) {
    const clean = source.replace(/^\/+/, '');
    if (!clean || clean.endsWith('/')) return path.join(PUBLIC, clean, 'index.html');
    return path.join(PUBLIC, clean);
}

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function internalTarget(fromFile, value) {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;
    const withoutQuery = value.split(/[?#]/, 1)[0];
    if (!withoutQuery) return null;
    const relative = withoutQuery.startsWith('/')
        ? withoutQuery.replace(new RegExp(`^${SITE_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '').replace(/^\/+/, '')
        : path.relative(PUBLIC, path.resolve(path.dirname(fromFile), withoutQuery));
    const safeRelative = relative.replace(/^\/+/, '');
    if (!safeRelative || safeRelative === '.') return path.join(PUBLIC, 'index.html');
    const extension = path.extname(safeRelative);
    if (safeRelative.endsWith('/')) return path.join(PUBLIC, safeRelative, 'index.html');
    if (extension) return path.join(PUBLIC, safeRelative);
    return path.join(PUBLIC, safeRelative, 'index.html');
}

if (!fs.existsSync(PUBLIC)) failures.push('public/ does not exist; run the build first');
if (fs.existsSync(path.join(PUBLIC, 'data'))) failures.push('legacy/source data was copied into public/data');
if (fs.existsSync(routeFile('/crenshaw-systems/software/'))) failures.push('unsupported Crenshaw Systems software catalog was published');

for (const route of requiredRoutes) {
    if (!fs.existsSync(routeFile(route))) failures.push(`missing required route ${route}`);
}

for (const redirect of redirects) {
    const file = redirectFile(redirect.source);
    if (!fs.existsSync(file)) {
        failures.push(`missing redirect source ${redirect.source}`);
        continue;
    }
    const html = fs.readFileSync(file, 'utf8');
    const target = /(?:^|\/)betterfingers(?:\.html)?\/?$/i.test(redirect.source)
        ? '/projects/betterfingers/'
        : redirect.target;
    const targetPath = `${SITE_BASE}${target.replace(/^\/+/, '')}`;
    const expected = new URL(targetPath, 'https://donavencrenshaw.com').href;
    if (!html.includes(`rel="canonical" href="${expected}"`)) {
        failures.push(`redirect ${redirect.source} does not canonicalize to ${target}`);
    }
    if (!/name="robots" content="noindex"/i.test(html)) {
        failures.push(`redirect ${redirect.source} is indexable`);
    }
}

const htmlFiles = walk(PUBLIC).filter((file) => file.endsWith('.html'));
for (const file of htmlFiles) {
    const relative = path.relative(PUBLIC, file);
    const html = fs.readFileSync(file, 'utf8');
    const redirect = /http-equiv="refresh"/i.test(html);

    if (!/<html\s+lang="en"/i.test(html)) failures.push(`${relative}: missing html lang`);
    if (!/<title>[^<]+<\/title>/i.test(html)) failures.push(`${relative}: missing title`);

    for (const [pattern, label] of bannedPublicPatterns) {
        if (pattern.test(html)) failures.push(`${relative}: contains ${label}`);
    }

    if (!redirect) {
        const h1Count = (html.match(/<h1\b/gi) || []).length;
        if (h1Count !== 1) failures.push(`${relative}: expected one h1, found ${h1Count}`);
        if (!/<main\b/i.test(html)) failures.push(`${relative}: missing main landmark`);
        if (!/class="skip-link"/i.test(html)) failures.push(`${relative}: missing skip link`);
        if (!/<meta\s+name="description"/i.test(html)) failures.push(`${relative}: missing description`);
    }

    for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
        const target = internalTarget(file, match[1]);
        if (target && !fs.existsSync(target)) {
            failures.push(`${relative}: broken internal target ${match[1]}`);
        }
    }

    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
        if (!/\balt=["'][^"']*["']/i.test(match[0])) failures.push(`${relative}: image missing alt attribute`);
    }
}

const home = fs.existsSync(routeFile('/')) ? fs.readFileSync(routeFile('/'), 'utf8') : '';
const primaryNav = home.match(/<nav class="site-nav"[\s\S]*?<\/nav>/i)?.[0] || '';
for (const label of ['Now', 'underplain', 'BetterFingers', 'GetFast', 'PDFManager', 'Infinite Ages', 'Infinite Ages TTRPG', 'Infinite Ages Evolved', 'Build Log', 'About', 'Contact']) {
    // Nav labels may be bare (>Label</a>) or wrapped (<span class="nav-label">Label</span></a>).
    if (!primaryNav.includes(`>${label}</a>`) && !primaryNav.includes(`>${label}</span>`)) failures.push(`primary navigation is missing ${label}`);
}
if (primaryNav.includes('data-route="projects"')) failures.push('primary navigation still contains the retired Projects item');
if (![...primaryNav.matchAll(/<a\b[^>]*>/gi)].some(([tag]) => /data-route="kingdoms-caravans"/i.test(tag) && /href="[^\"]*kingdoms-caravans\//i.test(tag))) failures.push('primary navigation is missing a direct Kingdoms & Caravans link');
if (/Crenshaw Systems|Service process|data-nav-group="crenshaw-systems"/i.test(primaryNav)) failures.push('primary navigation still promotes the hidden business branch');
if (!/UNDERPLAIN · FREE SOFTWARE BY DONAVEN CRENSHAW/i.test(home)) failures.push('homepage does not lead with underplain');
if (!/home-betterfingers-spotlight/i.test(home) || !/assets\/projects\/betterfingers\/showcase\/complete-workflow\.png/i.test(home)) failures.push('homepage is missing the BetterFingers visual spotlight');
if (!/href="\/projects\/betterfingers\/"/i.test(home)) failures.push('homepage spotlight does not link to BetterFingers');
if (!/<section\b[^>]*class="[^"]*game-spotlight[^"]*"[\s\S]*href="[^\"]*kingdoms-caravans\//i.test(home)) failures.push('homepage is missing the Kingdoms & Caravans game spotlight/link');
if (!/datetime="2026-08-26"/i.test(home)) failures.push('homepage current-state date is stale');
if (/BRING ME A BUSINESS PROBLEM|Crenshaw Systems/i.test(home)) failures.push('homepage still promotes the hidden business branch');

const betterFingersPage = fs.existsSync(routeFile('/projects/betterfingers/')) ? fs.readFileSync(routeFile('/projects/betterfingers/'), 'utf8') : '';
if (!/Signed alpha · Windows 11 x64/i.test(betterFingersPage)) failures.push('BetterFingers download card does not identify the signed Windows alpha');
if (/Unsigned alpha · Windows 11 x64/i.test(betterFingersPage)) failures.push('BetterFingers download card still contradicts the signed release');

const kingdomsCaravansPage = fs.existsSync(routeFile('/kingdoms-caravans/')) ? fs.readFileSync(routeFile('/kingdoms-caravans/'), 'utf8') : '';
const caravansZip = 'https://github.com/RoyGSlade/KingdomsAndCaravans/releases/download/v0.3.2/KingdomsAndCaravans-windows.zip';
if (!kingdomsCaravansPage.includes(caravansZip)) failures.push('Kingdoms & Caravans page is missing the direct v0.3.2 Windows ZIP link');
if (!/early[\s-]*(?:friend|windows)[\s-]*playtest/i.test(kingdomsCaravansPage)) failures.push('Kingdoms & Caravans page is missing early playtest wording');
if (!/<meta\b[^>]*property="og:image"[^>]*content="[^"]*kingdoms-caravans[^\"]*"/i.test(kingdomsCaravansPage) && !/<meta\b[^>]*content="[^"]*kingdoms-caravans[^\"]*"[^>]*property="og:image"/i.test(kingdomsCaravansPage)) failures.push('Kingdoms & Caravans page is missing an og:image social card');
if (!/<meta\b[^>]*name="twitter:card"[^>]*content="summary_large_image"/i.test(kingdomsCaravansPage) && !/<meta\b[^>]*content="summary_large_image"[^>]*name="twitter:card"/i.test(kingdomsCaravansPage)) failures.push('Kingdoms & Caravans page is missing a large social card declaration');
for (const image of ['construction.png', 'supply.png', 'city.png', 'defense.png']) {
    const asset = path.join(PUBLIC, 'assets', 'kingdoms-caravans', image);
    if (!fs.existsSync(asset)) failures.push(`missing Kingdoms & Caravans showcase asset ${image}`);
    if (!new RegExp(`assets/kingdoms-caravans/${image}`, 'i').test(kingdomsCaravansPage)) failures.push(`Kingdoms & Caravans page does not reference showcase asset ${image}`);
}

for (const route of ['/projects/', '/about/', '/contact/']) {
    const publicSurface = fs.existsSync(routeFile(route)) ? fs.readFileSync(routeFile(route), 'utf8') : '';
    if (/Crenshaw Systems|Business systems work|VIEW THE SERVICE PROCESS|READ THE INTAKE DETAILS/i.test(publicSurface)) failures.push(`${route} still promotes the hidden business branch`);
}

for (const route of ['/underplain/', '/underplain/pdfmanager/', '/licenses/', '/work/']) {
    const underplainSurface = fs.existsSync(routeFile(route)) ? fs.readFileSync(routeFile(route), 'utf8') : '';
    if (/Crenshaw Systems|crenshaw-systems\//i.test(underplainSurface)) failures.push(`${route} still exposes the hidden business branch`);
}

for (const route of ['/crenshaw-systems/', '/crenshaw-systems/process/']) {
    const hiddenBusinessPage = fs.existsSync(routeFile(route)) ? fs.readFileSync(routeFile(route), 'utf8') : '';
    if (!/<meta name="robots" content="noindex, follow">/i.test(hiddenBusinessPage)) failures.push(`${route} is retained but not hidden from search indexing`);
}

if (failures.length) {
    console.error(`\n[FAIL] Built-site verification found ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`[OK] Built-site verification passed: ${requiredRoutes.length} required routes, ${redirects.length} redirects, ${htmlFiles.length} HTML files.`);
