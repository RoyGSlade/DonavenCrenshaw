import path from 'node:path';
import { validateProjectSource } from './projectSources.mjs';

const index = process.argv.indexOf('--source');
if (index < 0 || !process.argv[index + 1]) {
    console.error('Usage: node scripts/validateProjectSource.mjs --source <project-repo-root>');
    process.exit(2);
}
try {
    const root = path.resolve(process.argv[index + 1]);
    const result = await validateProjectSource(root, { sourceId: JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'website', 'project.json'), 'utf8')).id });
    console.log(`[OK] project source ${result.id}: ${result.publishedUpdates.length} published update(s), ${result.screenshots.length} screenshot(s)`);
} catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exit(1);
}
