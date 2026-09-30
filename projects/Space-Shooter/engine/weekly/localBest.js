// This browser's best on each weekly event: { ms, log, at }. No DOM beyond
// localStorage, so the HUD and the weekly mode can both read it.
function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
const bestKey = (event) => `stardust.weekly.${event.id}.v${event.version}.best`;

export function readLocalBest(event, store = storage()) {
  try {
    const raw = store?.getItem(bestKey(event));
    const best = raw ? JSON.parse(raw) : null;
    return best && Number.isFinite(best.ms) && typeof best.log === "string" ? best : null;
  } catch { return null; }
}

export function saveLocalBest(event, best, store = storage()) {
  try { store?.setItem(bestKey(event), JSON.stringify(best)); } catch { /* private window */ }
}
