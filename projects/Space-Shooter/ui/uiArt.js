// Optional UI art. Each control and gauge has a CSS placeholder; when a PNG of
// the matching name is listed in art/ui/manifest.json (run
// `node scripts/ui-art-manifest.mjs` after adding files), it replaces the
// placeholder. Only listed files are requested, so missing art never 404s.
let manifest = null;

export function uiArtUrl(name) {
  return new URL(`../art/ui/${name}.png`, import.meta.url).href;
}

function available() {
  manifest ??= fetch(new URL('../art/ui/manifest.json', import.meta.url), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { available: [] }))
    .then((m) => new Set(Array.isArray(m?.available) ? m.available : []))
    .catch(() => new Set());
  return manifest;
}

/** Resolves to the art URL when that PNG is in the manifest, otherwise null. */
export async function loadUiArt(name) {
  return (await available()).has(name) ? uiArtUrl(name) : null;
}

/** Use art/ui/<name>.png as el's background (or src) once it's known to exist. */
export function artImage(name, el, { property = 'backgroundImage' } = {}) {
  if (!el) return;
  loadUiArt(name).then((url) => {
    if (!url) return;
    if (property === 'src') el.src = url;
    else el.style[property] = `url("${url}")`;
    el.classList.add('has-art');
  }).catch(() => {});
}
