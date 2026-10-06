// Shrinks a .glb without changing how it looks: drops unused data, merges duplicate
// materials/accessors, and quantizes vertex data (KHR_mesh_quantization: positions 14-bit,
// normals 10-bit, UVs 12-bit). The vendored GLTFLoader (three r186) decodes this natively;
// no meshopt/draco decoder is needed, so no extra runtime files ship.
//   node tools/3d/optimize.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, weld } from '@gltf-transform/functions';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/3d/optimize.mjs in.glb out.glb');
  process.exit(2);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await doc.transform(
  prune(),
  dedup(),
  weld(),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
);
await io.write(output, doc);
