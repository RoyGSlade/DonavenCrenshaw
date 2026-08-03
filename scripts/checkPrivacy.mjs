// Fails the build if the generated site would contact a third party.
//
// README and MIGRATION.md both promise this ("No cloud dependency", "No
// external CDNs are permitted") and it is the site's whole credibility pitch.
// Two violations shipped anyway: Google Fonts on every page, and YouTube's
// iframe_api injected on load on the home page.
//
// The YouTube one is why this runs against `public/` rather than the source
// tree. The URL was assembled from a string in JS and did not appear in any
// grep of the sources; it was only visible in the network panel. In built
// output the literal is present, so a plain scan catches it.
//
// Outbound *links* a visitor chooses to click (GitHub, Ko-fi) are fine. This
// only looks for hosts the page would contact on its own.

import fs from 'fs-extra';
import path from 'path';

const PUBLIC_DIR = path.resolve('public');
const SCAN_EXTENSIONS = new Set(['.html', '.css', '.js', '.json']);

// host pattern -> why it is not allowed
const FORBIDDEN = [
    ['fonts.googleapis.com', 'webfonts must be vendored; run `node scripts/fetch-fonts.mjs`'],
    ['fonts.gstatic.com', 'webfonts must be vendored; run `node scripts/fetch-fonts.mjs`'],
    ['www.youtube.com', 'use the consent facade and youtube-nocookie.com'],
    ['youtube.com/iframe_api', 'the player API must never load before an explicit click'],
    ['googletagmanager.com', 'no analytics'],
    ['google-analytics.com', 'no analytics'],
    ['cdn.jsdelivr.net', 'vendor it under /vendor instead'],
    ['cdnjs.cloudflare.com', 'vendor it under /vendor instead'],
    ['unpkg.com', 'vendor it under /vendor instead']
];

async function* walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) yield full;
    }
}

async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        console.error('[ERROR] public/ not found. Run `npm run build` first.');
        process.exit(1);
    }

    console.log('--- CHECKING FOR THIRD-PARTY REQUESTS ---');
    const violations = [];
    let scanned = 0;

    for await (const file of walk(PUBLIC_DIR)) {
        scanned += 1;
        const text = await fs.readFile(file, 'utf-8');
        for (const [needle, reason] of FORBIDDEN) {
            if (text.includes(needle)) {
                violations.push({ file: path.relative(PUBLIC_DIR, file), needle, reason });
            }
        }
    }

    if (violations.length > 0) {
        console.error(`\n[FAIL] ${violations.length} third-party reference(s) in built output:\n`);
        for (const v of violations) {
            console.error(`  ${v.file}`);
            console.error(`    ${v.needle} — ${v.reason}`);
        }
        process.exit(1);
    }

    console.log(`[OK] ${scanned} files scanned, no third-party requests.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
