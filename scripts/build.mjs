import fs from 'fs-extra';
import path from 'path';
import { marked } from 'marked';
import matter from 'gray-matter';
import ejs from 'ejs';
import { importProjectSources } from './projectSources.mjs';
import { CUSTOM_TRACK } from '../projects/Space-Shooter/tracks/custom-track.js';
import { releaseText, isCustomTrackLive } from '../projects/Space-Shooter/systems/customTrack.js';
import { checkTrack } from '../projects/Space-Shooter/engine/trackChecks.js';
import { currentWeekly, weeklyStatus, weeklyGameUrl, weeklyPreviewSvg } from '../projects/Space-Shooter/systems/weekly.js';

const ROOT_DIR = path.resolve('.');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');
const LAYOUTS_DIR = path.join(SRC_DIR, 'layouts');
const SITE_BASE = process.env.SITE_BASE || '/DonavenCrenshaw/';
// The hub the pages talk to (data-hub on account.js). Local builds point it at
// a hub on this machine: HUB_URL=http://localhost:3100 npm run build.
const HUB_URL = hubOrigin(process.env.HUB_URL || 'https://api.donavencrenshaw.com');

function hubOrigin(value) {
    let parsed;
    try { parsed = new URL(String(value).trim()); } catch { throw new Error(`[CONFIG ERROR] HUB_URL must be an absolute http(s) URL, got ${value}`); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('[CONFIG ERROR] HUB_URL must use http or https');
    if (parsed.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)) throw new Error('[CONFIG ERROR] HUB_URL may only use plain http for a hub on this machine');
    return parsed.origin;
}

function normaliseBase(base) {
    const value = String(base || '/').trim();
    const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function normaliseRoute(route = '') {
    return String(route)
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\/index\.html?$/i, '')
        .replace(/\.html?$/i, '');
}

function routeUrl(site, route = '') {
    const cleanRoute = normaliseRoute(route);
    const pathPart = cleanRoute ? `${cleanRoute}/` : '';
    return new URL(`${site.basePath}${pathPart}`, `${site.domain}/`).href;
}

function sitePath(site, route = '') {
    const cleanRoute = normaliseRoute(route);
    return `${site.basePath}${cleanRoute ? `${cleanRoute}/` : ''}`;
}

function absoluteSiteAsset(site, asset) {
    if (!asset) return null;
    if (/^(?:https?:)?\/\//i.test(asset)) return asset;
    return new URL(`${site.basePath}${String(asset).replace(/^\/+/, '')}`, `${site.domain}/`).href;
}

function requiredString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`[DATA ERROR] ${label} must be a non-empty string`);
    }
    return value.trim();
}

async function readJson(filename, { required = false } = {}) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        if (required) throw new Error(`[DATA ERROR] Missing essential data file: data/${filename}`);
        return null;
    }

    try {
        return await fs.readJson(filePath);
    } catch (error) {
        throw new Error(`[DATA ERROR] Could not parse data/${filename}: ${error.message}`);
    }
}

function validateSite(rawSite) {
    if (!rawSite || typeof rawSite !== 'object' || Array.isArray(rawSite)) {
        throw new Error('[DATA ERROR] data/site.json must contain an object');
    }

    const identity = rawSite.identity && typeof rawSite.identity === 'object' ? rawSite.identity : rawSite;
    const site = { ...rawSite };
    site.name = requiredString(identity.name || rawSite.name, 'site.name');
    site.domain = requiredString(identity.domain || identity.url || rawSite.domain, 'site.domain');
    site.description = requiredString(identity.description || rawSite.description, 'site.description');
    try {
        const parsedDomain = new URL(site.domain);
        if (!/^https?:$/.test(parsedDomain.protocol)) throw new Error('must use http or https');
        site.domain = parsedDomain.href.replace(/\/$/, '');
    } catch (error) {
        throw new Error(`[DATA ERROR] site.domain must be an absolute http(s) URL: ${error.message}`);
    }
    site.social = site.social && typeof site.social === 'object' ? site.social : {};
    site.basePath = normaliseBase(SITE_BASE);
    return site;
}

function validateStructuredCollection(rawValue, filename, fields) {
    if (!Array.isArray(rawValue)) throw new Error(`[DATA ERROR] data/${filename}.json must contain an array`);
    rawValue.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`[DATA ERROR] ${filename}[${index}] must contain an object`);
        fields.forEach((field) => requiredString(item[field], `${filename}[${index}].${field}`));
    });
    return rawValue;
}

function validateSupport(rawSupport) {
    if (!rawSupport || typeof rawSupport !== 'object' || Array.isArray(rawSupport)) throw new Error('[DATA ERROR] data/support.json must contain an object');
    if (!Array.isArray(rawSupport.channels) || !Array.isArray(rawSupport.tiers)) throw new Error('[DATA ERROR] support.channels and support.tiers must be arrays');
    return rawSupport;
}

function validateUpdates(rawUpdates) {
    if (!rawUpdates || typeof rawUpdates !== 'object' || Array.isArray(rawUpdates)) throw new Error('[DATA ERROR] data/updates.json must contain an object');
    if (!Array.isArray(rawUpdates.items) || !Array.isArray(rawUpdates.drafts)) throw new Error('[DATA ERROR] updates.items and updates.drafts must be arrays');
    return rawUpdates;
}

function normaliseRedirects(rawRedirects) {
    if (rawRedirects === null) return [];
    const entries = Array.isArray(rawRedirects)
        ? rawRedirects
        : rawRedirects && Array.isArray(rawRedirects.redirects)
            ? rawRedirects.redirects
            : rawRedirects && typeof rawRedirects === 'object'
                ? Object.entries(rawRedirects).map(([from, to]) => ({ from, to }))
                : null;
    if (!entries) throw new Error('[DATA ERROR] data/redirects.json must contain an array, a { redirects: [] } object, or a source-to-target map');

    return entries.map((entry, index) => {
        if (!entry || typeof entry !== 'object') throw new Error(`[DATA ERROR] redirects[${index}] must contain an object`);
        const from = requiredString(entry.from || entry.source, `redirects[${index}].from`);
        const to = requiredString(entry.to || entry.target, `redirects[${index}].to`);
        if (from.includes('..') || from.includes('\\')) throw new Error(`[DATA ERROR] redirects[${index}].from contains an unsafe path`);
        const legacyBetterFingers = /(?:^|\/)betterfingers(?:\.html)?\/?$/i.test(from);
        return { from, to: legacyBetterFingers ? 'projects/betterfingers/' : to, status: entry.status || 301 };
    });
}

function branchFor(frontmatter, route) {
    if (frontmatter.branch) return String(frontmatter.branch).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const firstSegment = normaliseRoute(route).split('/')[0];
    if (firstSegment === 'underplain' || firstSegment === 'crenshaw-systems' || firstSegment === 'infinite-ages') return firstSegment;
    return 'parent';
}

function pageContext(site, frontmatter, route, data) {
    const branch = branchFor(frontmatter, route);
    return {
        route,
        branch,
        skin: String(frontmatter.skin || branch).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        url: routeUrl(site, route),
        title: frontmatter.title || site.name,
        description: frontmatter.description || site.description
    };
}

function structuredData(site, page, frontmatter) {
    const sameAs = Object.values(site.social || {}).filter((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
    const person = {
        '@type': 'Person',
        name: site.name,
        url: routeUrl(site, ''),
        description: site.description
    };
    if (site.location) person.homeLocation = { '@type': 'Place', name: site.location };
    if (sameAs.length) person.sameAs = sameAs;

    const graph = [person, {
        '@type': 'WebSite',
        name: site.name,
        url: routeUrl(site, ''),
        description: site.description
    }];
    if (page.url && !frontmatter.noindex) {
        graph.push({
            '@type': 'WebPage',
            name: page.title,
            description: page.description,
            url: page.url,
            isPartOf: { '@type': 'WebSite', url: routeUrl(site, '') }
        });
    }
    return { '@context': 'https://schema.org', '@graph': graph };
}

async function initPublicDir() {
    await fs.remove(PUBLIC_DIR);
    await fs.ensureDir(PUBLIC_DIR);
    const copyIfPresent = async (source, destination) => {
        if (fs.existsSync(source)) await fs.copy(source, destination);
    };
    // Folder READMEs (assets/images/avatars/README.md) are notes for the owner, not site files.
    await fs.copy(path.join(ROOT_DIR, 'assets'), path.join(PUBLIC_DIR, 'assets'), { filter: (candidate) => path.basename(candidate) !== 'README.md' });
    await copyIfPresent(path.join(SRC_DIR, 'styles'), path.join(PUBLIC_DIR, 'styles'));
    // Stardust is plain ES modules. It is published at /games/stardust/ so its
    // ../../assets/ paths land on the site's /assets/. Art provenance and QA
    // evidence stay out of the public build, as in scripts/build-stardust.mjs.
    await fs.copy(path.join(ROOT_DIR, 'projects', 'Space-Shooter'), path.join(PUBLIC_DIR, 'games', 'stardust'), {
        filter: (candidate) => !path.relative(ROOT_DIR, candidate).split(path.sep)
            .some((part) => part.startsWith('.') || /^(evidence|provenance)$/i.test(part) || /provenance\.json$/i.test(part))
    });
    if (fs.existsSync(path.join(ROOT_DIR, 'scripts'))) {
        await fs.ensureDir(path.join(PUBLIC_DIR, 'scripts'));
        for (const filename of ['script.js', 'smoke.js', 'light-engine.js', 'account.js', 'voting.js', 'visits.js', 'stardust-boards.js', 'stardust-challenge.js', 'social.js', 'share.js', 'profile.js', 'pilot-ui.js', 'stardust-weekly.js', 'pilot-profile.js', 'ship-info.js', 'ship-ui.js']) {
            await copyIfPresent(path.join(ROOT_DIR, 'scripts', filename), path.join(PUBLIC_DIR, 'scripts', filename));
        }
    }
    // The game page is copied, not rendered from head.ejs, so it gets the visit
    // counter here (scripts/visits.js). It is the page that matters most.
    const gamePage = path.join(PUBLIC_DIR, 'games', 'stardust', 'index.html');
    if (fs.existsSync(gamePage)) {
        const html = await fs.readFile(gamePage, 'utf-8');
        const tag = `<script type="module" src="../../scripts/visits.js" data-visits-hub="${HUB_URL}"></script>`;
        if (!html.includes('data-visits-hub')) await fs.writeFile(gamePage, html.replace('</body>', `  ${tag}\n</body>`));
    }
}

async function loadComponents() {
    const names = ['nav', 'footer', 'head'];
    return Object.fromEntries(await Promise.all(names.map(async (name) => [
        name,
        await fs.readFile(path.join(COMPONENTS_DIR, `${name}.ejs`), 'utf-8')
    ])));
}

// data/hub-snapshot.json is committed by the hub on the laptop (see the private
// DonavenCrenshaw-Hub repo). It is optional: pages render an empty state without it.
function validateHubSnapshot(snapshot) {
    if (!snapshot) return null;
    if (snapshot.schemaVersion !== 1) throw new Error('[DATA ERROR] data/hub-snapshot.json: unsupported schemaVersion');
    const list = (value, label) => {
        if (value === undefined) return [];
        if (!Array.isArray(value)) throw new Error(`[DATA ERROR] data/hub-snapshot.json: ${label} must be an array`);
        return value;
    };
    return {
        generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : null,
        leaderboard: list(snapshot.stardust?.leaderboard, 'stardust.leaderboard'),
        platinum: list(snapshot.platinum10 ?? snapshot.golden100, 'platinum10').slice(0, 10),
        features: list(snapshot.votes?.features, 'votes.features')
    };
}

// The Stardust custom track (projects/Space-Shooter/tracks/custom-track.js) for
// the landing page: its release time for the countdown and no-JS fallback, and
// whether it can open at all (it passes the track checks and isn't the placeholder).
function customTrackData(now = Date.now()) {
    const check = checkTrack(CUSTOM_TRACK);
    if (!check.ok) console.warn(`[CUSTOM TRACK] fails its checks, shown as coming soon: ${check.problems.map((p) => p.message).join(' ')}`);
    const ready = check.ok && !CUSTOM_TRACK.placeholder;
    return {
        title: CUSTOM_TRACK.title || 'Custom track',
        releaseAt: CUSTOM_TRACK.releaseAt,
        releaseText: releaseText(CUSTOM_TRACK.releaseAt),
        ready,
        live: ready && isCustomTrackLive(CUSTOM_TRACK, now)
    };
}

// data/avatars.json: the one place a preset id maps to an image. Validated
// here and published as scripts/avatars.js for the pages' modules.
async function avatarData() {
    const avatars = await readJson('avatars.json', { required: true });
    if (!Array.isArray(avatars) || !avatars.length) throw new Error('[DATA ERROR] data/avatars.json must be a non-empty array');
    const seen = new Set();
    for (const [index, entry] of avatars.entries()) {
        if (!entry || !/^[a-z0-9-]{1,40}$/.test(String(entry.id))) throw new Error(`[DATA ERROR] avatars[${index}].id must be lowercase letters, digits and -`);
        if (seen.has(entry.id)) throw new Error(`[DATA ERROR] avatars[${index}].id ${entry.id} is duplicated`);
        seen.add(entry.id);
        requiredString(entry.name, `avatars[${index}].name`);
        if (!/^assets\/images\/avatars\/[A-Za-z0-9_-]+\.(?:svg|png|webp|jpe?g|avif)$/.test(String(entry.file))) throw new Error(`[DATA ERROR] avatars[${index}].file must be an image under assets/images/avatars/`);
        if (!fs.existsSync(path.join(ROOT_DIR, entry.file))) throw new Error(`[DATA ERROR] avatars[${index}].file ${entry.file} does not exist`);
    }
    return avatars.map(({ id, name, file }) => ({ id, name, file }));
}

// The current weekly time trial (projects/Space-Shooter/tracks/weekly.js): the
// words the page is built with, so it reads right without JavaScript, and its
// layout picture at assets/images/stardust/weekly/<id>-layout.svg.
async function weeklyData(now = Date.now()) {
    const event = currentWeekly(now);
    if (!event) return null;
    const status = weeklyStatus(event, now);
    const layout = `assets/images/stardust/weekly/${event.id}-layout.svg`;
    await fs.ensureDir(path.join(PUBLIC_DIR, path.dirname(layout)));
    const svg = weeklyPreviewSvg(event, { obstacles: false });
    await fs.writeFile(path.join(PUBLIC_DIR, layout), svg);
    const size = /\swidth="(\d+)" height="(\d+)"/.exec(svg);
    const shards = Array.isArray(event.track?.shards) ? event.track.shards.length : 0;
    return {
        id: event.id,
        week: event.week,
        title: event.title,
        tagline: event.tagline || '',
        opensAt: event.opensAt,
        closesAt: event.closesAt,
        opensText: status.opensText,
        closesText: status.closesText,
        state: status.state,
        rewards: event.rewards || {},
        commentsPage: event.commentsPage,
        gameUrl: weeklyGameUrl(event),
        layout,
        layoutWidth: size ? Number(size[1]) : 752,
        layoutHeight: size ? Number(size[2]) : 1234,
        shards
    };
}

function renderContext(site, frontmatter, route, data) {
    const page = pageContext(site, frontmatter, route, data);
    const shared = {
        site,
        hubUrl: HUB_URL,
        data,
        page,
        frontmatter,
        siteRoot: site.basePath,
        siteLink: (target = '') => sitePath(site, target),
        siteUrl: (target = '') => routeUrl(site, target),
        assetUrl: (asset) => absoluteSiteAsset(site, asset),
        jsonLd: structuredData(site, page, frontmatter)
    };
    return { ...shared, page };
}

async function buildAllContent(dirPath, subDir = '', components, site, data, postsData = [], generatedPaths = [], redirectEntries = []) {
    if (!fs.existsSync(dirPath)) return postsData;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            await buildAllContent(fullPath, path.posix.join(subDir, entry.name), components, site, data, postsData, generatedPaths, redirectEntries);
        } else if (entry.name.endsWith('.md')) {
            const rawContent = await fs.readFile(fullPath, 'utf-8');
            const { data: frontmatter, content } = matter(rawContent);
            const fileName = path.basename(fullPath, '.md');
            const isRootIndex = fileName === 'index' && subDir === '';
            const route = isRootIndex ? '' : path.posix.join(subDir, fileName !== 'index' ? fileName : '');
            const outDir = isRootIndex ? PUBLIC_DIR : path.join(PUBLIC_DIR, route);
            const context = renderContext(site, frontmatter, route, data);
            const renderedComponents = {
                nav: ejs.render(components.nav, context),
                footer: ejs.render(components.footer, context, { views: [COMPONENTS_DIR] }),
                head: ejs.render(components.head, context)
            };
            const layoutPath = path.join(LAYOUTS_DIR, `${frontmatter.layout || 'default'}.ejs`);
            if (!fs.existsSync(layoutPath)) throw new Error(`[BUILD ERROR] Missing layout for ${fullPath}: ${frontmatter.layout || 'default'}`);
            const layoutEjs = await fs.readFile(layoutPath, 'utf-8');
            const htmlContent = marked.parse(content);
            const finalHtml = frontmatter.redirect
                ? redirectHtml(site, route, frontmatter.redirect, frontmatter.title || 'Page moved')
                : ejs.render(layoutEjs, { ...context, content: htmlContent, components: renderedComponents }, { views: [COMPONENTS_DIR] });
            const outputHtml = frontmatter.redirect ? finalHtml : rewriteInternalUrls(finalHtml, site, route);

            await fs.ensureDir(outDir);
            const outPath = isRootIndex ? path.join(PUBLIC_DIR, 'index.html') : path.join(outDir, 'index.html');
            await fs.writeFile(outPath, outputHtml);
            generatedPaths.push(path.relative(PUBLIC_DIR, outPath).split(path.sep).join('/'));
            console.log(`[GENERATED] ${path.relative(PUBLIC_DIR, outPath)}`);

            if (frontmatter.redirect) redirectEntries.push({ from: route, to: frontmatter.redirect, status: 301 });
            if (subDir.startsWith('chronicles') && frontmatter.publicationStatus === 'published') {
                postsData.push({
                    title: frontmatter.title || 'Untitled',
                    dateISO: frontmatter.date || null,
                    excerpt: frontmatter.excerpt || content.substring(0, 150).replace(/\s+/g, ' ').trim() + '...',
                    url: path.posix.join(subDir, fileName, 'index.html')
                });
            }
        }
    }
    return postsData;
}

function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function rewriteInternalUrls(html, site, route) {
    return html.replace(/\b(href|src)=(['"])(.*?)\2/gi, (match, attribute, quote, value) => {
        if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i.test(value)) return match;
        let resolved = value;
        if (value.startsWith('./') || value.startsWith('../')) {
            const parsed = new URL(value, routeUrl(site, route));
            resolved = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } else {
            resolved = `${site.basePath}${value.replace(/^\/+/, '')}`;
        }
        return `${attribute}=${quote}${resolved}${quote}`;
    });
}

function redirectHtml(site, source, target, title = 'Page moved') {
    const targetUrl = /^https?:\/\//i.test(target) ? target : routeUrl(site, target);
    const navigationTarget = /^https?:\/\//i.test(target) ? target : sitePath(site, target);
    const safeTarget = escapeAttribute(targetUrl);
    const safeNavigationTarget = escapeAttribute(navigationTarget);
    const safeTitle = escapeAttribute(title);
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${safeNavigationTarget}"><link rel="canonical" href="${safeTarget}"><title>${safeTitle}</title></head><body><main><h1>${safeTitle}</h1><p>This page has moved. <a href="${safeNavigationTarget}">Continue to the current page</a>.</p></main></body></html>\n`;
}

async function buildRedirectMap(site, rawRedirects, generatedPaths, redirectEntries) {
    // Explicit route decisions are authoritative; frontmatter redirects cover
    // legacy content only when the data map has no matching source.
    const dataEntries = normaliseRedirects(rawRedirects);
    const entries = [...dataEntries, ...redirectEntries];
    const seen = new Set();
    let generated = 0;
    for (const [index, entry] of entries.entries()) {
        const isAuthoritative = index < dataEntries.length;
        const source = String(entry.from).replace(/^\/+/, '');
        const sourcePath = source.endsWith('/') || !path.posix.basename(source).includes('.')
            ? `${source.replace(/\/+$/, '')}/index.html`
            : source;
        if (!sourcePath || sourcePath.startsWith('..') || sourcePath.includes('\\')) continue;
        if (seen.has(sourcePath)) continue;
        seen.add(sourcePath);
        if (generatedPaths.includes(sourcePath) && !isAuthoritative) {
            console.log(`[REDIRECTS] preserved generated route ${sourcePath}`);
            continue;
        }
        const outputPath = path.join(PUBLIC_DIR, sourcePath);
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, redirectHtml(site, entry.from, entry.to));
        generated += 1;
        console.log(`[REDIRECT${isAuthoritative ? ' DATA' : ''}] ${sourcePath} -> ${routeUrl(site, entry.to)}`);
    }
    console.log(`[REDIRECTS] generated ${generated} static redirect target(s)`);
}

async function build404(components, site, data) {
    const frontmatter = {
        title: 'Page not found',
        description: 'The page you requested could not be found.',
        noindex: true,
        branch: 'parent'
    };
    const context = renderContext(site, frontmatter, '', data);
    const renderedComponents = {
        nav: ejs.render(components.nav, context),
        footer: ejs.render(components.footer, context, { views: [COMPONENTS_DIR] }),
        head: ejs.render(components.head, { ...context, page: { ...context.page, url: null } })
    };
    const layout = await fs.readFile(path.join(LAYOUTS_DIR, 'default.ejs'), 'utf-8');
    const content = '<p class="section-desc">The page you requested could not be found. It may have moved or been archived.</p><p><a class="btn btn-primary" href="' + sitePath(site) + '">Return home</a></p>';
    await fs.writeFile(path.join(PUBLIC_DIR, '404.html'), ejs.render(layout, { ...context, content, components: renderedComponents }));
}

function projectStatusLabel(project) {
    return String(project.status || '').replace(/-/g, ' ').toUpperCase();
}

async function buildImportedProjects(site, components, data, generatedPaths) {
    for (const imported of data.importedProjects || []) {
        const route = path.posix.join('projects', imported.id);
        const frontmatter = { title: imported.project.name, description: imported.project.summary, branch: 'parent', skin: 'parent', page_kind: 'imported-project' };
        const context = renderContext(site, frontmatter, route, data);
        const renderedComponents = {
            nav: ejs.render(components.nav, context),
            footer: ejs.render(components.footer, context, { views: [COMPONENTS_DIR] }),
            head: ejs.render(components.head, context)
        };
        const layout = await fs.readFile(path.join(LAYOUTS_DIR, 'imported-project.ejs'), 'utf8');
        const html = ejs.render(layout, { ...context, project: imported.project, imported, components: renderedComponents });
        const outputPath = path.join(PUBLIC_DIR, route, 'index.html');
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, rewriteInternalUrls(html, site, route));
        generatedPaths.push(path.relative(PUBLIC_DIR, outputPath).split(path.sep).join('/'));
        console.log(`[GENERATED IMPORT] ${path.relative(PUBLIC_DIR, outputPath)} (${projectStatusLabel(imported.project)})`);
    }
}

async function main() {
    console.log('--- STARTING STATIC SITE BUILD ---');
    const site = validateSite(await readJson('site.json', { required: true }));
    const branches = validateStructuredCollection(await readJson('branches.json', { required: true }), 'branches', ['id', 'name', 'status', 'route']);
    const products = validateStructuredCollection(await readJson('products.json', { required: true }), 'products', ['id', 'name', 'branchId', 'status']);
    const support = validateSupport(await readJson('support.json', { required: true }));
    const updates = validateUpdates(await readJson('updates.json', { required: true }));
    const redirects = await readJson('redirects.json', { required: true });
    const hubSnapshot = validateHubSnapshot(await readJson('hub-snapshot.json'));
    const components = await loadComponents();

    await initPublicDir();
    const projectImport = await importProjectSources({ root: ROOT_DIR, outputDir: PUBLIC_DIR });
    const importedProjects = projectImport.sources.map((source) => ({
        ...source,
        publicUrl: sitePath(site, `projects/${source.id}`),
        publishedUpdates: source.publishedUpdates.map((update) => ({ ...update, projectId: source.id, projectName: source.project.name }))
    }));
    const avatars = await avatarData();
    await fs.writeFile(path.join(PUBLIC_DIR, 'scripts', 'avatars.js'), `// Generated by scripts/build.mjs from data/avatars.json. Edit that file, not this one.\nexport const AVATARS = ${JSON.stringify(avatars, null, 2)};\n`);
    const weekly = await weeklyData();
    console.log(`[HUB] ${HUB_URL}`);
    if (weekly) console.log(`[WEEKLY] ${weekly.id} ${weekly.title}: ${weekly.state} at build time -> ${weekly.layout}`);
    const data = { branches, products, support, updates, hubSnapshot, customTrack: customTrackData(), weekly, avatars, importedProjects, importedWarnings: projectImport.warnings };
    const postsData = [];
    const generatedPaths = [];
    const redirectEntries = [];
    await buildAllContent(CONTENT_DIR, '', components, site, data, postsData, generatedPaths, redirectEntries);
    await buildImportedProjects(site, components, data, generatedPaths);
    postsData.sort((a, b) => {
        if (!a.dateISO) return 1;
        if (!b.dateISO) return -1;
        return new Date(b.dateISO) - new Date(a.dateISO);
    });
    await buildRedirectMap(site, redirects, generatedPaths, redirectEntries);
    await build404(components, site, data);
    console.log(`[PUBLISHED LOGS] ${postsData.length}`);
    console.log(`--- BUILD COMPLETE (${products.length} products, ${branches.length} branches, ${generatedPaths.length} content routes) ---`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
