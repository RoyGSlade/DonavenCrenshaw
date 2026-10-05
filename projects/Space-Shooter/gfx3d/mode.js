// Which renderer the weekly races use: '3d' or '2d'. Pure apart from reading
// the address bar and the saved setting, both passed in for tests.
export const RENDER_KEY = 'stardust.render';

/** ?render=3d|2d wins for this page load; otherwise the saved setting; otherwise 2D. */
export function readRenderMode({ search = globalThis.location?.search || '', storage = globalThis.localStorage } = {}) {
  const asked = new URLSearchParams(search).get('render');
  if (asked === '3d' || asked === '2d') return asked;
  try {
    const saved = storage?.getItem(RENDER_KEY);
    if (saved === '3d' || saved === '2d') return saved;
  } catch { /* storage blocked: default */ }
  return '2d';
}

export function saveRenderMode(mode, storage = globalThis.localStorage) {
  if (mode !== '3d' && mode !== '2d') return false;
  try { storage?.setItem(RENDER_KEY, mode); return true; } catch { return false; }
}
