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
