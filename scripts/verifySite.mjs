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
    '/underplain/',
    '/underplain/betterfingers/',
    '/underplain/getfast/',
    '/underplain/pdfmanager/',
    '/crenshaw-systems/',
    '/crenshaw-systems/process/',
    '/work/',
    '/infinite-ages/',
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
    const targetPath = `${SITE_BASE}${redirect.target.replace(/^\/+/, '')}`;
    const expected = new URL(targetPath, 'https://donavencrenshaw.com').href;
    if (!html.includes(`rel="canonical" href="${expected}"`)) {
        failures.push(`redirect ${redirect.source} does not canonicalize to ${redirect.target}`);
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
for (const label of ['Now', 'Projects', 'underplain', 'Crenshaw Systems', 'Infinite Ages', 'Build Log', 'About', 'Contact']) {
    // Nav labels may be bare (>Label</a>) or wrapped (<span class="nav-label">Label</span></a>).
    if (!home.includes(`>${label}</a>`) && !home.includes(`>${label}</span>`)) failures.push(`primary navigation is missing ${label}`);
}

if (failures.length) {
    console.error(`\n[FAIL] Built-site verification found ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`[OK] Built-site verification passed: ${requiredRoutes.length} required routes, ${redirects.length} redirects, ${htmlFiles.length} HTML files.`);
