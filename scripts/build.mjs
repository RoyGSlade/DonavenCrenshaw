import fs from 'fs-extra';
import path from 'path';
import { marked } from 'marked';
import matter from 'gray-matter';
import ejs from 'ejs';

// Core directories
const SRC_DIR = path.resolve('src');
const CONTENT_DIR = path.resolve('content');
const PUBLIC_DIR = path.resolve('public');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');
const LAYOUTS_DIR = path.join(SRC_DIR, 'layouts');

// Legacy V1 URLs kept alive as redirect stubs so inbound links do not 404.
// See MIGRATION.md "Compatibility Warning".
// Absolute base path the site is served from. GitHub Pages project sites live
// under /<repo>/; override with SITE_BASE=/ for a user/apex domain.
const SITE_BASE = process.env.SITE_BASE || '/SourceArcanum/';

const LEGACY_REDIRECTS = {
    'chronicles.html': 'chronicles/index.html',
    'docs.html': 'chronicles/index.html',
    'finance.html': 'financial/index.html',
    'games.html': 'games/index.html',
    'productivity.html': 'productivity/index.html',
    'roadmap.html': 'roadmap/index.html',
    'support.html': 'treasury/index.html'
};

// Ensure output directory exists and is clean
async function initPublicDir() {
    await fs.remove(PUBLIC_DIR);
    await fs.ensureDir(PUBLIC_DIR);
    // Copy static assets
    if (fs.existsSync(path.resolve('assets'))) {
        await fs.copy(path.resolve('assets'), path.join(PUBLIC_DIR, 'assets'));
    }
    // Copy styles from src to public
    if (fs.existsSync(path.join(SRC_DIR, 'styles'))) {
        await fs.copy(path.join(SRC_DIR, 'styles'), path.join(PUBLIC_DIR, 'styles'));
    }
    // Copy data to public
    if (fs.existsSync(path.resolve('data'))) {
        await fs.copy(path.resolve('data'), path.join(PUBLIC_DIR, 'data'));
    }
    // Copy scripts to public
    if (fs.existsSync(path.resolve('scripts'))) {
        // We only want to copy client scripts, not the build scripts themselves.
        // Actually to be safe we can copy the whole folder or just script.js and roadmap.js.
        // The front-end expects them in `./scripts/`
        await fs.ensureDir(path.join(PUBLIC_DIR, 'scripts'));
        if (fs.existsSync(path.resolve('scripts/script.js'))) {
            await fs.copy(path.resolve('scripts/script.js'), path.join(PUBLIC_DIR, 'scripts/script.js'));
        }
        if (fs.existsSync(path.resolve('scripts/roadmap.js'))) {
            await fs.copy(path.resolve('scripts/roadmap.js'), path.join(PUBLIC_DIR, 'scripts/roadmap.js'));
        }
    }
    // Copy locally vendored dependencies (webfonts). No external CDNs.
    if (fs.existsSync(path.resolve('vendor'))) {
        await fs.copy(path.resolve('vendor'), path.join(PUBLIC_DIR, 'vendor'));
    }
    // Copy project demo pages and runtime modules (e.g. Stardust)
    if (fs.existsSync(path.resolve('projects'))) {
        await fs.copy(path.resolve('projects'), path.join(PUBLIC_DIR, 'projects'));
    }
}

// Load global components
async function loadComponents() {
    return {
        nav: await fs.readFile(path.join(COMPONENTS_DIR, 'nav.ejs'), 'utf-8'),
        footer: await fs.readFile(path.join(COMPONENTS_DIR, 'footer.ejs'), 'utf-8'),
        head: await fs.readFile(path.join(COMPONENTS_DIR, 'head.ejs'), 'utf-8'),
        modal: await fs.readFile(path.join(COMPONENTS_DIR, 'modal.ejs'), 'utf-8')
    };
}

async function buildAllContent(dirPath, subDir = '', components, postsData = []) {
    if (!fs.existsSync(dirPath)) return postsData;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (let entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            await buildAllContent(fullPath, path.posix.join(subDir, entry.name), components, postsData);
        } else if (entry.name === '404.md' && subDir === '') {
            // Built separately: it needs absolute asset paths, not depth-relative ones.
            continue;
        } else if (entry.name.endsWith('.md')) {
            const rawContent = await fs.readFile(fullPath, 'utf-8');
            const { data: frontmatter, content } = matter(rawContent);
            const htmlContent = marked.parse(content);

            const layoutPath = path.join(LAYOUTS_DIR, `${frontmatter.layout || 'default'}.ejs`);
            const layoutEjs = await fs.readFile(layoutPath, 'utf-8');

            const fileName = path.basename(fullPath, '.md');
            const isRootIndex = fileName === 'index' && subDir === '';
            const outDir = isRootIndex ? PUBLIC_DIR : path.join(PUBLIC_DIR, subDir, fileName !== 'index' ? fileName : '');

            // Calculate actual depth based on the final output directory vs public root
            const relativeOutStr = path.relative(PUBLIC_DIR, outDir);
            const depth = isRootIndex || relativeOutStr === '' ? 0 : relativeOutStr.split(path.sep).length;
            const siteRoot = depth > 0 ? '../'.repeat(depth) : './';

            // Pre-render components with the current context
            const renderedComponents = {
                nav: ejs.render(components.nav, { siteRoot, frontmatter }),
                footer: ejs.render(components.footer, { siteRoot, frontmatter }),
                head: ejs.render(components.head, { siteRoot, frontmatter }),
                modal: ejs.render(components.modal, { siteRoot, frontmatter })
            };

            const finalHtml = ejs.render(layoutEjs, {
                frontmatter,
                content: htmlContent,
                siteRoot,
                components: renderedComponents
            }, {
                views: [COMPONENTS_DIR]
            });

            await fs.ensureDir(outDir);
            const outPath = isRootIndex ? path.join(PUBLIC_DIR, 'index.html') : path.join(outDir, 'index.html');
            await fs.writeFile(outPath, finalHtml);
            console.log(`[GENERATED] ${path.relative(PUBLIC_DIR, outPath)}`);

            // Extract Post Data for chronicles
            if (subDir.startsWith('chronicles')) {
                // Determine the URL relative to the site root
                // For a file in content/chronicles/foo.md, the URL is chronicles/foo/index.html
                const relativeUrl = path.posix.join(subDir, fileName, 'index.html');
                postsData.push({
                    title: frontmatter.title || 'Untitled',
                    dateISO: frontmatter.date || new Date().toISOString().split('T')[0],
                    excerpt: frontmatter.excerpt || content.substring(0, 150) + '...',
                    url: relativeUrl
                });
            }
        }
    }
    return postsData;
}

// Project dossier pages, generated from data/projects.json.
//
// V1 built these from project_cards/*.md via scripts/build.js; the V2 migration
// ported the content-page builder but not this one, so the nine pages under
// projects/ became hand-maintained orphans that drifted from the JSON the site
// actually serves. They are regenerated here from the single source of truth,
// which also gives every project a shareable URL -- the card grid only ever
// opened a modal, so there was no way to link anyone to one project.
//
// Must run AFTER initPublicDir(), which copies projects/ wholesale (that is how
// the playable projects/Space-Shooter/ game ships).
async function buildProjectPages(components) {
    const dataPath = path.resolve('data/projects.json');
    if (!fs.existsSync(dataPath)) return;

    const projects = await fs.readJson(dataPath);
    const layoutEjs = await fs.readFile(path.join(LAYOUTS_DIR, 'project.ejs'), 'utf-8');
    const outDir = path.join(PUBLIC_DIR, 'projects');
    await fs.ensureDir(outDir);

    const siteRoot = '../';

    for (const project of projects) {
        // flagshipFeatures encode "Title:: body" -- the same split openModal()
        // performs in scripts/script.js.
        const flagship = (project.flagshipFeatures || []).map((entry) => {
            const [title, ...rest] = entry.split('::');
            return { title: title.trim(), text: rest.join('::').trim() };
        });

        const roadmap = project.roadmap || {};
        const trajectory = [
            ...(roadmap.nearTerm || []).map((text) => ({ phase: 'NEAR-TERM', text })),
            ...(roadmap.midTerm || []).map((text) => ({ phase: 'MID-TERM', text })),
            ...(roadmap.longTerm ? [{ phase: 'LONG-TERM', text: roadmap.longTerm }] : [])
        ];

        const tf = project.trustFacts || {};
        const trustFacts = [
            ['Runs offline', typeof tf.runsOffline === 'boolean' ? (tf.runsOffline ? 'Yes' : 'No') : tf.runsOffline],
            ['Requires internet', tf.requiresInternet],
            ['Telemetry', tf.telemetry],
            ['Accounts', tf.accounts],
            ['Data stored where', tf.dataStoredWhere]
        ].filter(([, value]) => value !== undefined && value !== null && value !== '')
            .map(([label, value]) => ({ label, value }));

        const frontmatter = { title: project.realName };
        const renderedComponents = {
            nav: ejs.render(components.nav, { siteRoot, frontmatter }),
            footer: ejs.render(components.footer, { siteRoot, frontmatter }),
            head: ejs.render(components.head, { siteRoot, frontmatter }),
            modal: ejs.render(components.modal, { siteRoot, frontmatter })
        };

        const finalHtml = ejs.render(layoutEjs, {
            project,
            frontmatter,
            siteRoot,
            components: renderedComponents,
            fullDescription: project.fullDescription || [],
            features: project.features || [],
            flagship,
            trajectory,
            trustFacts,
            integrity: tf.integrity ? { file: tf.installer || 'Unknown', sha256: tf.integrity } : null,
            // Placeholder link entries carry an empty url; drop them so the
            // panel falls back to ACCESS RESTRICTED instead of rendering blanks.
            links: (project.links || []).filter((link) => link.url)
        }, { views: [COMPONENTS_DIR] });

        await fs.writeFile(path.join(outDir, `${project.id}.html`), finalHtml);
        console.log(`[PROJECT] projects/${project.id}.html`);
    }
}

// GitHub Pages serves /404.html for any unmatched path, including nested ones
// like /games/nope. Depth-relative asset paths would break there, so this page
// is rendered once against the absolute SITE_BASE.
async function buildNotFound(components) {
    const sourcePath = path.join(CONTENT_DIR, '404.md');
    if (!fs.existsSync(sourcePath)) return;

    const { data: frontmatter, content } = matter(await fs.readFile(sourcePath, 'utf-8'));
    const htmlContent = marked.parse(content).replaceAll('{{SITE_BASE}}', SITE_BASE);
    const layoutEjs = await fs.readFile(path.join(LAYOUTS_DIR, `${frontmatter.layout || 'default'}.ejs`), 'utf-8');
    const siteRoot = SITE_BASE;

    const renderedComponents = {
        nav: ejs.render(components.nav, { siteRoot, frontmatter }),
        footer: ejs.render(components.footer, { siteRoot, frontmatter }),
        head: ejs.render(components.head, { siteRoot, frontmatter }),
        modal: ejs.render(components.modal, { siteRoot, frontmatter })
    };

    const finalHtml = ejs.render(layoutEjs, {
        frontmatter, content: htmlContent, siteRoot, components: renderedComponents
    }, { views: [COMPONENTS_DIR] });

    await fs.writeFile(path.join(PUBLIC_DIR, '404.html'), finalHtml);
    console.log('[GENERATED] 404.html');
}

// Emit a redirect stub for every deprecated V1 URL so inbound links survive.
async function buildLegacyRedirects() {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
        const target = SITE_BASE + to;
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<title>Redirecting…</title>
</head>
<body>
<p>This page has moved to <a href="${target}">${target}</a>.</p>
<script>window.location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
        await fs.writeFile(path.join(PUBLIC_DIR, from), html);
        console.log(`[REDIRECT] ${from} -> ${to}`);
    }
}

async function main() {
    console.log('--- STARTING ARCHITECURE BUILD ---');
    await initPublicDir();
    const components = await loadComponents();

    // Process top-level pages, specific collections, and gather post data
    const postsData = await buildAllContent(CONTENT_DIR, '', components);

    // Write aggregated posts data for the script.js pipeline
    // Sort descending by date
    postsData.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
    await fs.ensureDir(path.join(PUBLIC_DIR, 'data'));
    await fs.writeFile(path.join(PUBLIC_DIR, 'data', 'posts.json'), JSON.stringify(postsData, null, 2));
    console.log(`[DATA CACHE] /data/posts.json -> ${postsData.length} entries`);

    await buildProjectPages(components);
    await buildNotFound(components);
    await buildLegacyRedirects();

    console.log('--- BUILD COMPLETE ---');
}

main().catch(console.error);
