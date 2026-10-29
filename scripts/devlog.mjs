// Devlog entries: content/devlog/YYYY-MM-DD-slug.md, rendered on the Build Log page.
//
// Format (the Reporter's publisher writes exactly this):
//   ---
//   title: "Short plain title"
//   date: "2026-10-29"          (YYYY-MM-DD, must match the filename)
//   project: "Weekly devlog"    (optional label shown on the card)
//   summary: "One sentence."    (optional, shown under the title)
//   ---
//   Markdown body.
//
// Entries are NOT built as pages of their own: the build skips content/devlog and the
// Build Log page shows the newest few through the `<!-- DEVLOG_ENTRIES -->` marker in
// content/build-log.md. With no entries the marker renders as nothing and the page is
// exactly the hand-written one. The body is sanitized (no raw HTML, http(s) links only).

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const DEVLOG_MARKER = '<!-- DEVLOG_ENTRIES -->';
export const DEVLOG_DIRNAME = 'devlog';
export const DEFAULT_LIMIT = 5;

const FILE_NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const MAX_TITLE = 140;
const MAX_LABEL = 60;
const MAX_SUMMARY = 300;

function fail(file, message) {
    throw new Error(`[DEVLOG ERROR] ${file}: ${message}`);
}

function isRealDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function oneLine(value, file, field, max, { required = false } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(file, `${field} is required`);
        return '';
    }
    if (typeof value !== 'string') fail(file, `${field} must be text`);
    const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (required && !text) fail(file, `${field} is required`);
    if (text.length > max) fail(file, `${field} is longer than ${max} characters`);
    return text;
}

export function parseEntry(fileName, raw) {
    const match = FILE_NAME.exec(fileName);
    if (!match) fail(fileName, 'file name must look like YYYY-MM-DD-slug.md (lowercase letters, digits and hyphens)');
    const { data, content } = matter(raw);
    const rawDate = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : data.date;
    if (typeof rawDate !== 'string' || !isRealDate(rawDate)) fail(fileName, 'date must be a real YYYY-MM-DD date');
    if (rawDate !== match[1]) fail(fileName, `date ${rawDate} does not match the file name date ${match[1]}`);
    const body = content.trim();
    if (!body) fail(fileName, 'the entry has no body');
    return {
        slug: `${match[1]}-${match[2]}`,
        date: rawDate,
        title: oneLine(data.title, fileName, 'title', MAX_TITLE, { required: true }),
        project: oneLine(data.project, fileName, 'project', MAX_LABEL),
        summary: oneLine(data.summary, fileName, 'summary', MAX_SUMMARY),
        body
    };
}

export async function loadDevlogEntries(dir) {
    if (!(await fs.pathExists(dir))) return [];
    const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.md')).sort();
    const entries = [];
    for (const name of names) entries.push(parseEntry(name, await fs.readFile(path.join(dir, name), 'utf-8')));
    // Newest first; the slug (which carries the date) breaks ties so the order is stable.
    return entries.sort((a, b) => (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0));
}

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The card title is an h3 under the section's h2, so body headings move down two levels.
const HEADING_SHIFT = { h1: 'h4', h2: 'h4', h3: 'h5', h4: 'h6', h5: 'h6', h6: 'h6' };

export function renderBody(markdown) {
    const html = marked.parse(markdown, { async: false });
    return sanitizeHtml(html, {
        allowedTags: ['a', 'blockquote', 'br', 'code', 'del', 'em', 'h4', 'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'ul'],
        allowedAttributes: { a: ['href', 'title', 'rel'] },
        allowedSchemes: ['http', 'https'],
        allowProtocolRelative: false,
        allowVulnerableTags: false,
        transformTags: {
            ...Object.fromEntries(Object.entries(HEADING_SHIFT).map(([from, to]) => [from, to])),
            a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' })
        }
    });
}

function renderEntry(entry) {
    const id = `devlog-${entry.slug}`;
    return `    <article class="noir-card lit-edge shadow-caster buildlog-current devlog-entry" id="${escapeHtml(id)}" aria-labelledby="${escapeHtml(id)}-title">
      <div class="buildlog-current-meta">
        <time class="buildlog-date mono" datetime="${entry.date}">${entry.date}</time>
        <div>
          <h3 id="${escapeHtml(id)}-title" class="section-label">${escapeHtml(entry.title)}</h3>${entry.summary ? `\n          <p class="section-desc">${escapeHtml(entry.summary)}</p>` : ''}
        </div>${entry.project ? `\n        <span class="section-subtitle mono">${escapeHtml(entry.project)}</span>` : ''}
      </div>
      <div class="reading-text buildlog-entry-copy">
${renderBody(entry.body)}
      </div>
    </article>`;
}

// '' when there is nothing to show, so the Build Log page stays exactly as written by hand.
export function renderDevlogHtml(entries, { limit = DEFAULT_LIMIT } = {}) {
    const shown = entries.slice(0, Math.max(0, limit));
    if (!shown.length) return '';
    return `<section class="section-block buildlog-devlog" aria-labelledby="devlog-latest">
      <div class="section-header buildlog-history-header"><div><h2 id="devlog-latest" class="section-label">LATEST DEVLOGS</h2><p class="section-desc">Weekly notes, written from what shipped.</p></div></div>
${shown.map(renderEntry).join('\n')}
    </section>`;
}

export function injectDevlog(pageHtml, devlogHtml) {
    const has = pageHtml.includes(DEVLOG_MARKER);
    if (devlogHtml && !has) {
        throw new Error(`[DEVLOG ERROR] content/build-log.md has no ${DEVLOG_MARKER} marker, so devlog entries would be dropped`);
    }
    return has ? pageHtml.replace(DEVLOG_MARKER, () => devlogHtml) : pageHtml;
}
