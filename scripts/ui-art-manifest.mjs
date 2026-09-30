// Lists the UI art PNGs present in projects/Space-Shooter/art/ui/ into its
// manifest.json, so the game only loads files that exist (no 404 probing).
// Run after dropping new PNGs in:  node scripts/ui-art-manifest.mjs
import { readdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../projects/Space-Shooter/art/ui/', import.meta.url);
const available = readdirSync(dir).filter((f) => /\.png$/i.test(f)).map((f) => f.replace(/\.png$/i, '')).sort();
writeFileSync(new URL('manifest.json', dir), `${JSON.stringify({ available }, null, 2)}\n`);
console.log(`UI art: ${available.length ? available.join(', ') : 'none yet (placeholders in use)'}`);
