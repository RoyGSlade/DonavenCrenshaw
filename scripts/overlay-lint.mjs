#!/usr/bin/env node
// Checks a scene overlay against its scene by exact labels (social lane, plan 1.9):
//   node scripts/overlay-lint.mjs scene-4-the-eighth-gunner.talk.md [scene-4-the-eighth-gunner.md]
// With one argument the scene is the same name without ".talk" beside it. Exits 1 with every problem listed. Applies nothing.
import { readFileSync, existsSync } from 'node:fs';
import { validateOverlay } from '../projects/Space-Shooter/voyage/talk/overlay.js';
import { PEOPLE } from '../projects/Space-Shooter/voyage/people/index.js';

const [overlayPath, scenePath = overlayPath?.replace(/\.talk\.md$/, '.md')] = process.argv.slice(2);
if (!overlayPath || !existsSync(overlayPath) || !existsSync(scenePath)) { console.error('usage: overlay-lint.mjs overlay.talk.md [scene.md]'); process.exit(2); }
const { errors } = validateOverlay(readFileSync(overlayPath, 'utf8'), readFileSync(scenePath, 'utf8'), { sheets: PEOPLE });
if (errors.length) { errors.forEach((e) => console.log('FAIL', overlayPath, e)); process.exit(1); }
console.log('OK', overlayPath);
