// Copies the pinned three.js build and the few addons the 3D renderer uses into
// projects/Space-Shooter/vendor/three/, rewriting the bare 'three' import to a
// relative path so the game needs no import map and makes no third-party requests.
// Run after changing the devDependency: node scripts/stardust/vendor-three.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(root, 'node_modules', 'three');
const out = join(root, 'projects', 'Space-Shooter', 'vendor', 'three');
mkdirSync(join(out, 'addons'), { recursive: true });

for (const f of ['three.module.js', 'three.core.js']) copyFileSync(join(src, 'build', f), join(out, f));
copyFileSync(join(src, 'LICENSE'), join(out, 'LICENSE'));
const addons = {
  'GLTFLoader.js': 'examples/jsm/loaders/GLTFLoader.js',
  'BufferGeometryUtils.js': 'examples/jsm/utils/BufferGeometryUtils.js',
  'SkeletonUtils.js': 'examples/jsm/utils/SkeletonUtils.js',
};
for (const [name, rel] of Object.entries(addons)) {
  const text = readFileSync(join(src, rel), 'utf8')
    .replace(/from\s+'three'/g, "from '../three.module.js'")
    .replace(/from\s+'\.\.\/utils\/(\w+\.js)'/g, "from './$1'");
  writeFileSync(join(out, 'addons', name), text);
}
const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
writeFileSync(join(out, 'VERSION'), version + '\n');
console.log(`vendored three ${version} -> ${out}`);
