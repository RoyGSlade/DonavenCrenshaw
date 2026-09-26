import { cp, mkdir, stat, rm, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const outputRoot = path.join(repoRoot, 'dist', 'stardust');

const sources = [
  { source: path.join(repoRoot, 'projects', 'Space-Shooter'), target: path.join(outputRoot, 'projects', 'Space-Shooter') },
  { source: path.join(repoRoot, 'assets', 'Images', 'sprites'), target: path.join(outputRoot, 'assets', 'Images', 'sprites') },
  { source: path.join(repoRoot, 'assets', 'audio'), target: path.join(outputRoot, 'assets', 'audio') },
];

function keepRuntimeFile(source, candidate) {
  const relative = path.relative(source, candidate);
  const parts = relative.split(path.sep).filter(Boolean);
  return !parts.some(part => part.startsWith('.') || /^(evidence|provenance)$/i.test(part) || /provenance\.json$/i.test(part));
}

async function copyTree({ source, target }) {
  const info = await stat(source).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Required Stardust build input is missing: ${path.relative(repoRoot, source)}`);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true, filter: candidate => keepRuntimeFile(source, candidate) });
}

// Rebuild only this fixed generated directory; reject links that could escape the workspace.
if (path.resolve(outputRoot) !== path.resolve(repoRoot, 'dist', 'stardust')) throw new Error('Unsafe output path');
for (const candidate of [path.join(repoRoot, 'dist'), outputRoot]) {
  const info = await lstat(candidate).catch(() => null);
  if (info?.isSymbolicLink()) throw new Error('Build output must not be a symbolic link');
}
for (const source of sources) await stat(source.source);
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const source of sources) await copyTree(source);
await writeFile(path.join(outputRoot, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Stardust</title><meta http-equiv="refresh" content="0;url=./projects/Space-Shooter/"><a href="./projects/Space-Shooter/">Launch Stardust</a></html>');

console.log(`Stardust standalone build copied to ${path.relative(repoRoot, outputRoot)}`);
console.log('Included: projects/Space-Shooter/, assets/Images/sprites/, assets/audio/');
console.log('Clean standalone artifact; the website build and routes are unchanged.');
