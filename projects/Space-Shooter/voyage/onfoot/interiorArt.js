// Interior tiles and props from the art lane (lhc-lanes/stardust/art/interiors/,
// manifest.json). Empty until that art lands: every tile and prop then draws a
// placeholder. When it lands, lhc-lanes/stardust/onfoot/tools/prep-interiors.py
// copies the files into ./art/interiors/ and rewrites this file: { id: url }.
const at = (path) => new URL(`./art/interiors/${path}`, import.meta.url).href;
void at;

export const INTERIOR_ART = Object.freeze({
  tileSize: null, // the manifest's tile size in px (maps keep their own world tile size)
  tiles: Object.freeze({}),
  props: Object.freeze({}),
});
