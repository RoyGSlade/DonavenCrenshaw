#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { sketchToWeekly, weeklyPreviewSvg } from '../../projects/Space-Shooter/studio/sketchToWeekly.js';

try {
  const args = process.argv.slice(2), options = {};
  let path = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--title', '--landmark', '--version', '--id'].includes(arg)) {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) throw new TypeError(`Missing value for ${arg}.`);
      options[arg.slice(2)] = arg === '--version' ? Number(value) : value;
    } else if (arg.startsWith('--')) throw new TypeError(`Unknown option ${arg}.`);
    else if (path === null) path = arg;
    else throw new TypeError('Supply one sketch path, or use stdin.');
  }
  let input;
  if (path && path !== '-') input = await readFile(path, 'utf8');
  else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = Buffer.concat(chunks).toString('utf8');
  }
  const { event, report } = sketchToWeekly(JSON.parse(input.replace(/^\uFEFF/, '')), options);
  process.stdout.write(JSON.stringify({ event, report, svg: weeklyPreviewSvg(event) }) + '\n');
} catch (error) {
  process.stderr.write(`Invalid sketch input: ${error.message}\n`);
  process.exitCode = 2;
}
