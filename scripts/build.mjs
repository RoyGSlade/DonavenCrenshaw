import fs from 'fs-extra';
import path from 'path';
import { marked } from 'marked';
import matter from 'gray-matter';
import ejs from 'ejs';

const ROOT_DIR = path.resolve('.');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');
const LAYOUTS_DIR = path.join(SRC_DIR, 'layouts');
const SITE_BASE = process.env.SITE_BASE || '/SourceArcanum/';

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
        return { from, to, status: entry.status || 301 };
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
    await copyIfPresent(path.join(ROOT_DIR, 'assets'), path.join(PUBLIC_DIR, 'assets'));
    await copyIfPresent(path.join(SRC_DIR, 'styles'), path.join(PUBLIC_DIR, 'styles'));
    if (fs.existsSync(path.join(ROOT_DIR, 'scripts'))) {
        await fs.ensureDir(path.join(PUBLIC_DIR, 'scripts'));
        for (const filename of ['script.js']) {
            await copyIfPresent(path.join(ROOT_DIR, 'scripts', filename), path.join(PUBLIC_DIR, 'scripts', filename));
        }
    }
}

async function loadComponents() {
    const names = ['nav', 'footer', 'head'];
    return Object.fromEntries(await Promise.all(names.map(async (name) => [
        name,
        await fs.readFile(path.join(COMPONENTS_DIR, `${name}.ejs`), 'utf-8')
    ])));
}

function renderContext(site, frontmatter, route, data) {
    const page = pageContext(site, frontmatter, route, data);
    const shared = {
        site,
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
                footer: ejs.render(components.footer, context),
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
    const safeTarget = escapeAttribute(targetUrl);
    const safeTitle = escapeAttribute(title);
    return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${safeTarget}"><link rel="canonical" href="${safeTarget}"><title>${safeTitle}</title></head><body><main><h1>${safeTitle}</h1><p>This page has moved. <a href="${safeTarget}">Continue to the current page</a>.</p></main></body></html>\n`;
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
        footer: ejs.render(components.footer, context),
        head: ejs.render(components.head, { ...context, page: { ...context.page, url: null } })
    };
    const layout = await fs.readFile(path.join(LAYOUTS_DIR, 'default.ejs'), 'utf-8');
    const content = '<p class="section-desc">The page you requested could not be found. It may have moved or been archived.</p><p><a class="btn btn-primary" href="' + sitePath(site) + '">Return home</a></p>';
    await fs.writeFile(path.join(PUBLIC_DIR, '404.html'), ejs.render(layout, { ...context, content, components: renderedComponents }));
}

async function main() {
    console.log('--- STARTING STATIC SITE BUILD ---');
    const site = validateSite(await readJson('site.json', { required: true }));
    const branches = validateStructuredCollection(await readJson('branches.json', { required: true }), 'branches', ['id', 'name', 'status', 'route']);
    const products = validateStructuredCollection(await readJson('products.json', { required: true }), 'products', ['id', 'name', 'branchId', 'status']);
    const support = validateSupport(await readJson('support.json', { required: true }));
    const updates = validateUpdates(await readJson('updates.json', { required: true }));
    const redirects = await readJson('redirects.json', { required: true });
    const data = { branches, products, support, updates };
    const components = await loadComponents();

    await initPublicDir();
    const postsData = [];
    const generatedPaths = [];
    const redirectEntries = [];
    await buildAllContent(CONTENT_DIR, '', components, site, data, postsData, generatedPaths, redirectEntries);
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
