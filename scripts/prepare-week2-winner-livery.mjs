import { readFile, writeFile } from 'node:fs/promises';
import { week2WinnerLivery } from '../projects/Space-Shooter/systems/weeklyRewards.js';

const [resultsPath, outputPath] = process.argv.slice(2);
if (!resultsPath || !outputPath) throw new Error('Usage: node scripts/prepare-week2-winner-livery.mjs <final-event.json> <output.json>');
const reward = week2WinnerLivery(JSON.parse(await readFile(resultsPath, 'utf8')));
if (!reward) throw new Error('A finalized weekly-02 response with one winner and a configured existing hull family is required.');
// Never overwrite a reviewed reward artifact, and never touch the Hub or public site.
await writeFile(outputPath, JSON.stringify(reward, null, 2) + '\n', { flag: 'wx' });
console.log(`Prepared ${reward.name}; owner delivery approval is still required.`);
