const fs = require('fs');
const path = require('path');
const marked = require('marked');
const matter = require('gray-matter');

// Paths
const BASE_DIR = process.cwd();
const PROJECTS_JSON = path.join(BASE_DIR, 'data', 'projects.json');
const PROJECT_CARDS_DIR = path.join(BASE_DIR, 'project_cards');
const PROJECTS_OUTPUT_DIR = path.join(BASE_DIR, 'projects');
const PROJECT_TEMPLATE_FILE = path.join(BASE_DIR, 'project_template.html');

const CHRONICLES_CONTENT_DIR = path.join(BASE_DIR, 'content', 'chronicles');
const CHRONICLES_OUTPUT_DIR = path.join(BASE_DIR, 'public', 'chronicles');
const CHRONICLES_TEMPLATE_FILE = path.join(BASE_DIR, 'components', 'chronicle_template.html');
const CHRONICLES_INDEX_TEMPLATE_FILE = path.join(BASE_DIR, 'components', 'chronicles_index_template.html');
const CHRONICLES_INDEX_OUTPUT = path.join(BASE_DIR, 'chronicles.html');

const NAV_FILE = path.join(BASE_DIR, 'components', 'nav.html');
const FOOTER_FILE = path.join(BASE_DIR, 'components', 'footer.html');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function parseProjectMarkdown(content) {
    const data = {};

    // Helper functions for matching
    const extractGroup = (regex, fallback = "") => {
        const match = content.match(regex);
        return match ? match[1].trim() : fallback;
    };

    data.real_name = extractGroup(/\*\*Real Name:\*\*\s*(.*)/);
    data.codename = extractGroup(/\*\*Codename:\*\*\s*(.*)/);

    let statusMatch = extractGroup(/\*\*Status Label \(Display\):\*\*\s*(.*)/);
    if (!statusMatch) statusMatch = extractGroup(/\*\*Status:\*\*\s*(.*)/, "UNKNOWN");
    data.status_display = statusMatch;

    data.short_tagline = extractGroup(/\*\*Short Tagline \(7-12 words\):\*\*\s*\n(.*)/);
    data.flavor = extractGroup(/\*\*Flavor Description.*\*\*\s*\n(.*)/);

    // Full Description
    const fullDescMatch = content.match(/## Full Description\s*\n\s*\*\*.*?\*\*\s*\n.*?\)\s*\n\n([\s\S]*?)\n\n##/);
    if (fullDescMatch) {
        data.full_desc = fullDescMatch[1].trim().split('\n\n').map(p => `<p>${p.trim()}</p>`).join('');
    } else {
        data.full_desc = "<p>No description available.</p>";
    }

    // Feature List
    const featuresMatch = content.match(/## Feature List\s*\n\s*\*\*[^*]*\*\*\s*\n([\s\S]*?)\n\n\*\*/);
    let features_html = "";
    if (featuresMatch) {
        const lines = featuresMatch[1].trim().split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('- ')) {
                let feat_text = line.substring(2).trim();
                if (feat_text.includes('**')) {
                    const parts = feat_text.split('**');
                    if (parts.length >= 3) {
                        const title = parts[1];
                        const desc = parts[2].replace(/^[:\s]+/, '').trim();
                        features_html += `<div class="feature-card"><h4 style="color:var(--accent-gold); margin-bottom:0.5rem;">${title}</h4><p>${desc}</p></div>`;
                    } else {
                        features_html += `<div class="feature-card"><p>${feat_text}</p></div>`;
                    }
                } else {
                    features_html += `<div class="feature-card"><p>${feat_text}</p></div>`;
                }
            }
        }
    }
    data.features_html = features_html;

    // Roadmap
    const roadmapMatch = content.match(/## Roadmap\s*\n([\s\S]*?)## Trust Facts/);
    let roadmap_html = "";
    if (roadmapMatch) {
        let current_phase = "";
        const lines = roadmapMatch[1].trim().split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.includes('**') && line.includes('Near-term')) current_phase = "NEAR-TERM";
            else if (line.includes('**') && line.includes('Mid-term')) current_phase = "MID-TERM";
            else if (line.includes('**') && line.includes('Long-term')) current_phase = "LONG-TERM";
            else if (/^[1-3]\.\s/.test(line)) {
                let task = line.substring(3).trim();
                roadmap_html += `<div class="roadmap-item"><div class="roadmap-phase">${current_phase}</div><div style="flex-grow:1;">${task}</div></div>`;
            }
            else if (line && !line.startsWith('**') && !line.startsWith('(')) {
                if (current_phase === "LONG-TERM") {
                    roadmap_html += `<div class="roadmap-item"><div class="roadmap-phase">${current_phase}</div><div style="flex-grow:1;">${line}</div></div>`;
                }
            }
        }
    }
    data.roadmap_html = roadmap_html;

    // Trust Facts
    const trustMatch = content.match(/## Trust Facts\s*\n([\s\S]*?)## Downloads/);
    let trust_html = "";
    if (trustMatch) {
        const lines = trustMatch[1].trim().split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('- **')) {
                const parts = line.split('**');
                if (parts.length >= 3) {
                    const label = parts[1].replace(/:$/, '').trim();
                    const value = parts[2].replace(/^[:\s]+/, '').trim();
                    trust_html += `<li><span style="color:var(--text-muted);">${label}:</span> ${value}</li>`;
                }
            }
        }
    }
    data.trust_html = trust_html;

    return data;
}

function buildProjects(navHTML, footerHTML) {
    console.log("Building Projects...");
    ensureDir(PROJECTS_OUTPUT_DIR);

    const projectsData = JSON.parse(fs.readFileSync(PROJECTS_JSON, 'utf-8'));
    const template = fs.readFileSync(PROJECT_TEMPLATE_FILE, 'utf-8');

    let baseHTML = template
        .replace(/\{\{NAV\}\}/g, navHTML.replace(/\{\{SITE_ROOT\}\}/g, '../'))
        .replace(/\{\{FOOTER\}\}/g, footerHTML.replace(/\{\{SITE_ROOT\}\}/g, '../'));

    for (let p of projectsData) {
        const pid = p.id;
        const mdPath = path.join(PROJECT_CARDS_DIR, `${pid}.md`);

        if (!fs.existsSync(mdPath)) {
            console.log(`Skipping ${pid}: No markdown found.`);
            continue;
        }

        console.log(`Processing ${pid}...`);
        const mdContent = fs.readFileSync(mdPath, 'utf-8');

        let parsed;
        try {
            parsed = parseProjectMarkdown(mdContent);
        } catch (e) {
            console.error(`Error parsing ${pid}: ${e}`);
            continue;
        }

        let html = baseHTML;
        html = html.replace(/\{\{REAL_NAME\}\}/g, parsed.real_name || '');
        html = html.replace(/\{\{CODENAME\}\}/g, parsed.codename || '');
        html = html.replace(/\{\{STATUS_DISPLAY\}\}/g, parsed.status_display || 'UNKNOWN');
        html = html.replace(/\{\{SHORT_TAGLINE\}\}/g, parsed.short_tagline || '');
        html = html.replace(/\{\{FLAVOR_DESCRIPTION\}\}/g, parsed.flavor || '');
        html = html.replace(/\{\{FULL_DESCRIPTION\}\}/g, parsed.full_desc || '');
        html = html.replace(/\{\{FEATURES_HTML\}\}/g, parsed.features_html || '');
        html = html.replace(/\{\{ROADMAP_HTML\}\}/g, parsed.roadmap_html || '');
        html = html.replace(/\{\{TRUST_FACTS_HTML\}\}/g, parsed.trust_html || '');

        let links_html = "";
        if (p.links && p.links.length > 0) {
            for (let link of p.links) {
                links_html += `<a href="${link.url}" class="btn btn-primary">${link.label}</a>`;
            }
        } else {
            links_html = '<div class="mono" style="color:var(--text-muted);">// NO ARTIFACTS AVAILABLE</div>';
        }
        html = html.replace(/\{\{DOWNLOAD_LINKS_HTML\}\}/g, links_html);

        const outPath = path.join(PROJECTS_OUTPUT_DIR, `${pid}.html`);
        fs.writeFileSync(outPath, html, 'utf-8');
    }
}

function buildChronicles(navHTML, footerHTML) {
    console.log("Building Chronicles...");
    ensureDir(CHRONICLES_CONTENT_DIR);
    ensureDir(CHRONICLES_OUTPUT_DIR);

    const chronicleTemplate = fs.readFileSync(CHRONICLES_TEMPLATE_FILE, 'utf-8');
    const indexTemplate = fs.readFileSync(CHRONICLES_INDEX_TEMPLATE_FILE, 'utf-8');

    const mdFiles = fs.readdirSync(CHRONICLES_CONTENT_DIR).filter(f => f.endsWith('.md'));

    let chronicleBaseHTML = chronicleTemplate
        .replace(/\{\{NAV\}\}/g, navHTML.replace(/\{\{SITE_ROOT\}\}/g, '../'))
        .replace(/\{\{FOOTER\}\}/g, footerHTML.replace(/\{\{SITE_ROOT\}\}/g, '../'))
        .replace(/\{\{SITE_ROOT\}\}/g, '../');

    let entries = [];

    for (let file of mdFiles) {
        console.log(`Processing chronicle: ${file}`);
        const filePath = path.join(CHRONICLES_CONTENT_DIR, file);
        const rawContent = fs.readFileSync(filePath, 'utf-8');

        // Parse Frontmatter & Body
        const parsed = matter(rawContent);
        const data = parsed.data;
        const bodyHtml = marked.parse(parsed.content);

        const slug = file.replace(/\.md$/, '');
        const outName = `${slug}.html`;

        let html = chronicleBaseHTML;
        html = html.replace(/\{\{TITLE\}\}/g, data.title || 'Untitled');
        html = html.replace(/\{\{DATE\}\}/g, data.date || 'Unknown Date');
        html = html.replace(/\{\{AUTHOR\}\}/g, data.author || 'Anonymous');
        html = html.replace(/\{\{TAGS\}\}/g, (data.tags || []).join(', '));
        html = html.replace(/\{\{CONTENT\}\}/g, bodyHtml);

        const outPath = path.join(CHRONICLES_OUTPUT_DIR, outName);
        fs.writeFileSync(outPath, html, 'utf-8');

        entries.push({
            slug: slug,
            title: data.title || 'Untitled',
            date: data.date || new Date().toISOString(),
            tags: data.tags || [],
            author: data.author || 'Anonymous',
            excerpt: parsed.content.substring(0, 150).replace(/\n/g, ' ') + '...',
            outPathName: `public/chronicles/${outName}`
        });
    }

    // Sort by Date (newest first assuming ISO dates)
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Build Index
    console.log("Generating Chronicles Index...");
    let indexBaseHTML = indexTemplate
        .replace(/\{\{NAV\}\}/g, navHTML.replace(/\{\{SITE_ROOT\}\}/g, './'))
        .replace(/\{\{FOOTER\}\}/g, footerHTML.replace(/\{\{SITE_ROOT\}\}/g, './'))
        .replace(/\{\{SITE_ROOT\}\}/g, './');

    let feedHtml = entries.map(e => `
        <div class="log-entry" onclick="window.location.href='${e.outPathName}'" style="cursor: pointer; margin-bottom: 2rem;">
            <div class="log-date mono">${new Date(e.date).toLocaleDateString()}</div>
            <div>
                <h3 class="log-title">${e.title}</h3>
                <p class="mono" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">// TAGS: ${e.tags.join(', ')}</p>
                <p class="log-excerpt">${e.excerpt}</p>
                <div class="mono" style="margin-top: 1rem; color: var(--accent-gold); font-size: 0.8rem;">READ ENTRY &rarr;</div>
            </div>
        </div>
    `).join('');

    if (entries.length === 0) {
        feedHtml = '<div class="mono" style="color:var(--text-muted);">// NO CHRONICLES LOGGED YET</div>';
    }

    indexBaseHTML = indexBaseHTML.replace(/\{\{TOTAL_ENTRIES\}\}/g, entries.length);
    indexBaseHTML = indexBaseHTML.replace(/\{\{CHRONICLES_FEED\}\}/g, feedHtml);

    fs.writeFileSync(CHRONICLES_INDEX_OUTPUT, indexBaseHTML, 'utf-8');
}

function buildAll() {
    const navHTML = fs.readFileSync(NAV_FILE, 'utf-8');
    const footerHTML = fs.readFileSync(FOOTER_FILE, 'utf-8');

    buildProjects(navHTML, footerHTML);
    buildChronicles(navHTML, footerHTML);

    console.log("Build Complete.");
}

buildAll();
