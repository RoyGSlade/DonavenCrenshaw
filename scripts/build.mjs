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

    console.log('--- BUILD COMPLETE ---');
}

main().catch(console.error);
