// Writes projects/Space-Shooter/voyage/modules/index.json: every manifest the registry holds, in list order (the controller reads this).
// usage: node scripts/build-module-index.mjs [--check]   (--check exits 1 when the file is stale)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ready, indexOf } from '../projects/Space-Shooter/voyage/modules/registry.js';

const out = fileURLToPath(new URL('../projects/Space-Shooter/voyage/modules/index.json', import.meta.url));
await ready();
const text = `${JSON.stringify(indexOf(), null, 2)}\n`;
if (process.argv.includes('--check')) { const have = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''; if (have !== text) { console.error('modules/index.json is stale: run node scripts/build-module-index.mjs'); process.exit(1); } console.log('modules/index.json is current'); }
else { fs.writeFileSync(out, text); console.log(`wrote ${out}`); }
