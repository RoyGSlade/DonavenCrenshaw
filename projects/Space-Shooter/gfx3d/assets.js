// Loads the 3D models listed in art/3d/manifest.json. Placeholder: no models yet.
export async function loadAssets(THREE, manifestUrl) {
  const manifest = await fetch(manifestUrl).then((r) => (r.ok ? r.json() : { ships: {}, props: {} })).catch(() => ({ ships: {}, props: {} }));
  return { manifest, ships: {}, props: {} };
}
