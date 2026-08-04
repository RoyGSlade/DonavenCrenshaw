import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateProjectSource } from '../scripts/projectSources.mjs';

const fixture = path.resolve('fixtures/projects/example-project');

test('valid bundled fixture is accepted and published updates are sorted', async () => {
    const result = await validateProjectSource(fixture, { sourceId: 'example-project' });
    assert.equal(result.id, 'example-project');
    assert.equal(result.publishedUpdates[0].id, 'fixture-added');
    assert.match(result.pageHtml, /bundled fixture/);
    assert.match(result.publishedUpdates[0].bodyHtml, /<h2>What changed<\/h2>/);
    assert.match(result.publishedUpdates[0].bodyHtml, /<li>Headings remain below the page title\.<\/li>/);
    assert.equal(result.showcase, null);
    assert.deepEqual(result.assetCopies, []);
});

async function copyFixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-source-test-'));
    await fs.cp(fixture, root, { recursive: true });
    return root;
}

test('frontmatter is rejected', async () => {
    const root = await copyFixture();
    await fs.writeFile(path.join(root, 'website', 'page.md'), '---\ntitle: bad\n---\nBody');
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /frontmatter/);
});

test('a project Markdown h1 is rejected because the layout owns the title', async () => {
    const root = await copyFixture();
    await fs.writeFile(path.join(root, 'website', 'page.md'), '# Duplicate title\n\nBody');
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /must not contain an h1/);
});

test('missing referenced assets are rejected', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'project.json');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    project.screenshots = [{ path: 'website/assets/missing.png', alt: 'Missing' }];
    await fs.writeFile(file, JSON.stringify(project));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /missing asset/);
});

test('optional showcase media is validated, mapped, and deduplicated for publishing', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'project.json');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    const assets = path.join(root, 'website', 'assets', 'showcase');
    await fs.mkdir(assets, { recursive: true });
    await Promise.all([
        fs.writeFile(path.join(assets, 'speak.png'), 'image'),
        fs.writeFile(path.join(assets, 'review.mp4'), 'video'),
        fs.writeFile(path.join(assets, 'review-poster.jpg'), 'poster')
    ]);
    project.developmentLabel = 'Product in development';
    project.showcase = {
        title: 'Example workflow',
        variant: 'workflow',
        loop: false,
        slides: [{
            id: 'speak-review',
            title: 'Speak and review',
            layout: 'split',
            media: [
                { type: 'image', path: 'website/assets/showcase/speak.png', alt: 'Speak step' },
                { type: 'video', path: 'website/assets/showcase/review.mp4', poster: 'website/assets/showcase/review-poster.jpg', alt: 'Review step', muted: true }
            ]
        }]
    };
    await fs.writeFile(file, JSON.stringify(project));

    const result = await validateProjectSource(root, { sourceId: 'example-project' });
    assert.equal(result.project.developmentLabel, 'Product in development');
    assert.equal(result.showcase.variant, 'workflow');
    assert.equal(result.showcase.loop, false);
    assert.equal(result.showcase.slides[0].media[0].publicPath, 'assets/projects/example-project/showcase/speak.png');
    assert.equal(result.showcase.slides[0].media[1].posterPublicPath, 'assets/projects/example-project/showcase/review-poster.jpg');
    assert.equal(result.assetCopies.length, 3);
});

test('missing showcase media is rejected', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'project.json');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    project.showcase = {
        title: 'Missing media',
        slides: [{ id: 'missing', title: 'Missing', layout: 'single', media: [{ type: 'image', path: 'website/assets/missing.png', alt: 'Missing' }] }]
    };
    await fs.writeFile(file, JSON.stringify(project));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /missing asset/);
});

test('showcase media type must match a supported file extension', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'project.json');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.mkdir(path.join(root, 'website', 'assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'website', 'assets', 'pretend.txt'), 'not an image');
    project.showcase = {
        title: 'Invalid media',
        slides: [{ id: 'invalid', title: 'Invalid', layout: 'single', media: [{ type: 'image', path: 'website/assets/pretend.txt', alt: 'Invalid' }] }]
    };
    await fs.writeFile(file, JSON.stringify(project));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /image asset must use a supported extension/);
});

test('traversal screenshot paths are rejected', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'project.json');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    project.screenshots = [{ path: 'website/assets/../page.md', alt: 'Escape' }];
    await fs.writeFile(file, JSON.stringify(project));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /schema error|unsafe asset path/);
});

test('duplicate update ids are rejected', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'updates.json');
    const updates = JSON.parse(await fs.readFile(file, 'utf8'));
    updates.items.push({ ...updates.items[0], title: 'Duplicate' });
    await fs.writeFile(file, JSON.stringify(updates));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /duplicate update/);
});

test('unsafe manifest links are rejected', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'project.json');
    const project = JSON.parse(await fs.readFile(file, 'utf8'));
    project.links[0].url = 'javascript:alert(1)';
    await fs.writeFile(file, JSON.stringify(project));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /schema error|scheme/);
});

test('unsafe links in an update body are rejected', async () => {
    const root = await copyFixture();
    const file = path.join(root, 'website', 'updates.json');
    const updates = JSON.parse(await fs.readFile(file, 'utf8'));
    updates.items[0].body = '## Bad link\n\n[Open](javascript:alert(1))';
    await fs.writeFile(file, JSON.stringify(updates));
    await assert.rejects(validateProjectSource(root, { sourceId: 'example-project' }), /scheme|unsafe/);
});
