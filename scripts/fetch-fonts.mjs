// Vendors the site's webfonts into /vendor/fonts so no page needs to talk to
// Google. Run once (or after changing --font-* tokens in src/styles/tokens.css)
// and commit the result; the build and CI never hit the network.
//
//   node scripts/fetch-fonts.mjs
//
// The four families below are exactly what src/styles/tokens.css references.
// All are SIL Open Font License 1.1, which permits redistribution.

import fs from 'fs-extra';
import path from 'path';

const OUT_DIR = path.resolve('vendor/fonts');

// Google serves woff2 only to user agents it believes support it.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FAMILIES = [
    'Alegreya:ital,wght@0,400;0,500;1,400',
    'Cinzel:wght@400;600;700',
    'Marcellus+SC',
    'Space+Mono:wght@400;700'
];

async function main() {
    const url = `https://fonts.googleapis.com/css2?${FAMILIES.map(f => `family=${f}`).join('&')}&display=swap`;
    console.log(`[FETCH] ${url}`);

    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Google Fonts CSS request failed: ${res.status}`);
    let css = await res.text();

    await fs.emptyDir(OUT_DIR);

    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
    if (!urls.length) throw new Error('no font files found in the returned CSS');

    for (const fontUrl of urls) {
        const fontRes = await fetch(fontUrl, { headers: { 'User-Agent': UA } });
        if (!fontRes.ok) throw new Error(`failed to download ${fontUrl}: ${fontRes.status}`);

        // e.g. .../s/alegreya/v36/4UacrEBBsBhlBjvfkQjt71kZfyBzPgNG9hUI_KCisSGVrw.woff2
        const fileName = path.basename(new URL(fontUrl).pathname);
        await fs.writeFile(path.join(OUT_DIR, fileName), Buffer.from(await fontRes.arrayBuffer()));
        css = css.replaceAll(fontUrl, `./${fileName}`);
        console.log(`[FONT] ${fileName}`);
    }

    const header = `/* Vendored from Google Fonts by scripts/fetch-fonts.mjs. Do not edit by hand.\n` +
        `   Alegreya, Cinzel, Marcellus SC, Space Mono - SIL Open Font License 1.1. */\n`;
    await fs.writeFile(path.join(OUT_DIR, 'fonts.css'), header + css);
    console.log(`[WRITE] vendor/fonts/fonts.css (${urls.length} files)`);
}

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
