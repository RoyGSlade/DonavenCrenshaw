import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEntry, loadDevlogEntries, renderBody, renderDevlogHtml, injectDevlog, DEVLOG_MARKER } from '../scripts/devlog.mjs';

const fixtures = new URL('./fixtures/devlog/', import.meta.url);
const sample = fs.readFileSync(new URL('2026-10-25-sample-entry.md', fixtures), 'utf8');
const entry = (date, title, extra = '') => `---\ntitle: "${title}"\ndate: "${date}"\n${extra}---\nBody for ${title}.\n`;

test('a well-formed entry parses', () => {
  const e = parseEntry('2026-10-25-sample-entry.md', sample);
  assert.deepEqual([e.slug, e.date, e.title, e.project], ['2026-10-25-sample-entry', '2026-10-25', 'Sample entry for the tests', 'Sample']);
  assert.match(e.summary, /test fixture/);
  assert.match(e.body, /^This file only exists/);
});

test('an unquoted YAML date still parses', () => {
  const e = parseEntry('2026-10-25-a.md', '---\ntitle: T\ndate: 2026-10-25\n---\nBody\n');
  assert.equal(e.date, '2026-10-25');
});

test('bad entries fail loudly', () => {
  const cases = [
    ['notes.md', entry('2026-10-25', 'T'), /file name/],
    ['2026-10-25-Upper.md', entry('2026-10-25', 'T'), /file name/],
    ['2026-10-26-a.md', entry('2026-10-25', 'T'), /does not match/],
    ['2026-13-40-a.md', entry('2026-13-40', 'T'), /real YYYY-MM-DD/],
    ['2026-10-25-a.md', '---\ndate: "2026-10-25"\n---\nBody\n', /title is required/],
    ['2026-10-25-a.md', '---\ntitle: T\ndate: "2026-10-25"\n---\n\n', /no body/],
    ['2026-10-25-a.md', entry('2026-10-25', 'T', `summary: "${'x'.repeat(301)}"\n`), /summary is longer/],
    ['2026-10-25-a.md', entry('2026-10-25', 'T', 'project: [a, b]\n'), /project must be text/]
  ];
  for (const [name, raw, pattern] of cases) assert.throws(() => parseEntry(name, raw), pattern, name);
});

test('entries load newest first and a missing folder is empty', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devlog-'));
  try {
    fs.writeFileSync(path.join(dir, '2026-10-18-older.md'), entry('2026-10-18', 'Older'));
    fs.writeFileSync(path.join(dir, '2026-10-25-newer.md'), entry('2026-10-25', 'Newer'));
    fs.writeFileSync(path.join(dir, '.gitkeep'), '');
    assert.deepEqual((await loadDevlogEntries(dir)).map((e) => e.title), ['Newer', 'Older']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual(await loadDevlogEntries(path.join(os.tmpdir(), 'devlog-does-not-exist')), []);
});

test('the body is sanitized: no scripts, no javascript links, headings move down', () => {
  const html = renderBody('# Big\n\n## Mid\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) and [good](https://example.org/x)\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<script|javascript:|onerror|<img|<h1|<h2/i);
  assert.match(html, /<h4>Big<\/h4>/);
  assert.match(html, /<a href="https:\/\/example\.org\/x" rel="noopener noreferrer">good<\/a>/);
});

test('rendering shows the newest few and escapes the card fields', () => {
  const entries = ['12', '11', '10'].map((day) => ({ slug: `2026-10-${day}-a`, date: `2026-10-${day}`, title: `Day ${day}`, project: '', summary: '', body: 'Body' }));
  entries.unshift({ slug: '2026-10-25-x', date: '2026-10-25', title: 'A <b>"quoted"</b> & title', project: 'P&Q', summary: '<i>s</i>', body: 'Body' });
  const html = renderDevlogHtml(entries, { limit: 2 });
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.match(html, /A &lt;b&gt;&quot;quoted&quot;&lt;\/b&gt; &amp; title/);
  assert.match(html, /P&amp;Q/);
  assert.match(html, /&lt;i&gt;s&lt;\/i&gt;/);
  assert.doesNotMatch(html, /Day 10/);
});

test('with no entries the page is untouched, and entries without a marker are an error', () => {
  const page = `<div>${DEVLOG_MARKER}<article>hand-written</article></div>`;
  assert.equal(renderDevlogHtml([]), '');
  assert.equal(injectDevlog(page, ''), '<div><article>hand-written</article></div>');
  assert.equal(injectDevlog('<div></div>', ''), '<div></div>');
  assert.throws(() => injectDevlog('<div></div>', '<section>x</section>'), /marker/);
  assert.equal(injectDevlog(page, '<section>$&</section>'), '<div><section>$&</section><article>hand-written</article></div>');
});

test('the Build Log page carries the marker, and the build skips the devlog folder', () => {
  assert.ok(fs.readFileSync(new URL('../content/build-log.md', import.meta.url), 'utf8').includes(DEVLOG_MARKER));
  assert.match(fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8'), /DEVLOG_DIRNAME\) continue/);
});
