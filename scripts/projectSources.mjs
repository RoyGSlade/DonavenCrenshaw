import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(HERE, '..');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schemas');
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const SAFE_ASSET = /^website\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export const STATUS_LABELS = {
    concept: 'Concept', planned: 'Planned', prototype: 'Prototype',
    'private-alpha': 'Private alpha', 'public-alpha': 'Public alpha', beta: 'Beta',
    stable: 'Stable', maintenance: 'Maintenance', archived: 'Archived'
};

function makeAjv() {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    return ajv;
}

async function readJson(filename, sourceLabel) {
    let text;
    try { text = await fs.readFile(filename, 'utf8'); } catch (error) {
        throw new Error(`${sourceLabel}: missing ${path.basename(filename)} (${error.message})`);
    }
    try { return JSON.parse(text); } catch (error) {
        throw new Error(`${sourceLabel}: invalid JSON in ${path.basename(filename)} (${error.message})`);
    }
}

async function schemas() {
    return Promise.all(['project.schema.json', 'updates.schema.json', 'project-sources-registry.schema.json'].map(async (name) => [
        name, JSON.parse(await fs.readFile(path.join(SCHEMA_DIR, name), 'utf8'))
    ]));
}

function ajvMessage(validate, filename) {
    return (validate.errors || []).map((error) => `${filename}${error.instancePath || ''} ${error.message}`).join('; ');
}

function assertUnique(values, label) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) throw new Error(`duplicate ${label} id: ${value}`);
        seen.add(value);
    }
}

function safeUrl(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: URL must be a non-empty string`);
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error(`${label}: URL is invalid`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label}: URL scheme must be HTTP(S)`);
}

function safeRelativeUrl(value, label) {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
        safeUrl(value, label);
        return;
    }
    if (value.includes('\\') || value.includes('\0')) throw new Error(`${label}: unsafe link`);
    const pathname = value.split(/[?#]/, 1)[0];
    const parts = pathname.split('/');
    if (parts.includes('..')) throw new Error(`${label}: traversal link`);
}

function validateMarkdownLinks(markdown, sourceLabel) {
    const links = [...markdown.matchAll(/(?:\]\(|href\s*=\s*["'])([^)"']+)/gi)];
    links.forEach((match) => safeRelativeUrl(match[1], `${sourceLabel}: page.md link`));
}

function sanitizeMarkdown(markdown, sourceLabel) {
    const trimmed = markdown.replace(/^\uFEFF/, '').trimStart();
    if (trimmed.startsWith('---') || trimmed.startsWith('+++')) {
        throw new Error(`${sourceLabel}: page.md frontmatter is not allowed`);
    }
    const tokens = marked.lexer(markdown);
    if (tokens.some((token) => token.type === 'heading' && token.depth === 1)) {
        throw new Error(`${sourceLabel}: page.md must not contain an h1; the website layout owns the project title`);
    }
    validateMarkdownLinks(markdown, sourceLabel);
    const rendered = marked.parse(markdown, { async: false });
    return sanitizeHtml(rendered, {
        allowedTags: ['a', 'blockquote', 'br', 'code', 'em', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'ul'],
        allowedAttributes: { a: ['href', 'title'] },
        allowedSchemes: ['http', 'https'],
        allowProtocolRelative: false,
        allowVulnerableTags: false
    });
}

function assertAssetPath(value, sourceLabel) {
    if (typeof value !== 'string' || !SAFE_ASSET.test(value) || value.includes('..') || value.includes('\\')) {
        throw new Error(`${sourceLabel}: unsafe asset path ${String(value)}`);
    }
}

async function assertAssetExists(sourceRoot, assetPath, sourceLabel) {
    assertAssetPath(assetPath, sourceLabel);
    const website = path.join(sourceRoot, 'website');
    const assetsRoot = path.resolve(website, 'assets');
    const target = path.resolve(sourceRoot, assetPath);
    if (!target.startsWith(`${assetsRoot}${path.sep}`)) throw new Error(`${sourceLabel}: asset escapes website/assets`);
    let stat;
    try { stat = await fs.stat(target); } catch (error) { throw new Error(`${sourceLabel}: missing asset ${assetPath} (${error.message})`); }
    if (!stat.isFile()) throw new Error(`${sourceLabel}: asset is not a file ${assetPath}`);
    const realAssets = await fs.realpath(assetsRoot);
    const realTarget = await fs.realpath(target);
    if (realTarget !== realAssets && !realTarget.startsWith(`${realAssets}${path.sep}`)) {
        throw new Error(`${sourceLabel}: symlink escapes website/assets for ${assetPath}`);
    }
}

export async function validateProjectSource(sourceRoot, { sourceId = path.basename(sourceRoot) } = {}) {
    const sourceLabel = `source ${sourceId}`;
    const root = path.resolve(sourceRoot);
    const [projectSchema, updatesSchema] = await schemas().then((all) => all.slice(0, 2).map(([, schema]) => schema));
    const ajv = makeAjv();
    const validateProject = ajv.compile(projectSchema);
    const validateUpdates = ajv.compile(updatesSchema);
    const project = await readJson(path.join(root, 'website', 'project.json'), sourceLabel);
    const updates = await readJson(path.join(root, 'website', 'updates.json'), sourceLabel);
    if (!validateProject(project)) throw new Error(`${sourceLabel}: project.json schema error: ${ajvMessage(validateProject, 'project.json')}`);
    if (!validateUpdates(updates)) throw new Error(`${sourceLabel}: updates.json schema error: ${ajvMessage(validateUpdates, 'updates.json')}`);
    if (project.id !== sourceId) throw new Error(`${sourceLabel}: registry/manifest ID agreement failed (${sourceId} !== ${project.id})`);
    assertUnique(project.features.map((item) => item.id), 'feature');
    assertUnique(project.roadmap.map((item) => item.id), 'roadmap');
    assertUnique(updates.items.map((item) => item.id), 'update');
    project.links.forEach((link, index) => safeUrl(link.url, `${sourceLabel}: project.json links[${index}]`));
    updates.items.forEach((item, index) => { if (item.url) safeUrl(item.url, `${sourceLabel}: updates.json items[${index}]`); });
    const pagePath = path.join(root, 'website', 'page.md');
    let pageMarkdown;
    try { pageMarkdown = await fs.readFile(pagePath, 'utf8'); } catch (error) { throw new Error(`${sourceLabel}: missing page.md (${error.message})`); }
    const pageHtml = sanitizeMarkdown(pageMarkdown, sourceLabel);
    for (const screenshot of project.screenshots) await assertAssetExists(root, screenshot.path, `${sourceLabel}: project.json screenshots`);
    const publishedUpdates = updates.items.filter((item) => item.state === 'published').sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    return {
        id: project.id,
        sourceId,
        root,
        project,
        updates: updates.items,
        publishedUpdates,
        pageMarkdown,
        pageHtml,
        screenshots: project.screenshots.map((shot) => ({ ...shot, sourcePath: shot.path, publicPath: `assets/projects/${project.id}/${shot.path.slice('website/assets/'.length)}` }))
    };
}

export async function loadProjectRegistry({ root = ROOT_DIR, registryPath = path.join(root, 'data', 'project-sources.json') } = {}) {
    const registry = await readJson(registryPath, 'project source registry');
    const registrySchema = (await schemas())[2][1];
    const ajv = makeAjv();
    const validate = ajv.compile(registrySchema);
    if (!validate(registry)) throw new Error(`project source registry schema error: ${ajvMessage(validate, 'data/project-sources.json')}`);
    assertUnique(registry.sources.map((source) => source.id), 'registry source');
    return registry;
}

export async function importProjectSources({ root = ROOT_DIR, outputDir = path.join(root, 'public'), registryPath = path.join(root, 'data', 'project-sources.json'), sourceBase = process.env.PROJECT_SOURCE_ROOT || root } = {}) {
    const registry = await loadProjectRegistry({ root, registryPath });
    const accepted = [];
    const warnings = [];
    for (const source of registry.sources) {
        if (!source.enabled) continue;
        const sourceRoot = path.resolve(sourceBase, source.localPath);
        try {
            accepted.push(await validateProjectSource(sourceRoot, { sourceId: source.id }));
        } catch (error) {
            const message = `[PROJECT SOURCE ${source.required ? 'ERROR' : 'WARN'}] ${error.message}`;
            if (source.required) throw new Error(message);
            warnings.push(message);
            console.warn(message);
        }
    }
    assertUnique(accepted.map((source) => source.id), 'accepted project');

    const staging = path.join(outputDir, `.project-import-${process.pid}`);
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    try {
        for (const source of accepted) {
            for (const screenshot of source.screenshots) {
                const from = path.join(source.root, screenshot.sourcePath);
                const destination = path.join(staging, screenshot.publicPath);
                await fs.mkdir(path.dirname(destination), { recursive: true });
                await fs.copyFile(from, destination);
            }
        }
        const finalAssets = path.join(outputDir, 'assets', 'projects');
        await fs.rm(finalAssets, { recursive: true, force: true });
        if (fsSync.existsSync(path.join(staging, 'assets', 'projects'))) {
            await fs.mkdir(path.dirname(finalAssets), { recursive: true });
            await fs.rename(path.join(staging, 'assets', 'projects'), finalAssets);
        }
    } finally {
        await fs.rm(staging, { recursive: true, force: true });
    }
    return { sources: accepted, warnings };
}

export function safeRegistryPath(value) {
    return typeof value === 'string' && value.split('/').every((segment) => SAFE_SEGMENT.test(segment));
}
