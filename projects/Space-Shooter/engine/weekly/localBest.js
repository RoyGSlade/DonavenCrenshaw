// This browser's best on each weekly event: { ms, log, at, appearance?, build? }.
// appearance is the ship (paint and decals) the pilot had equipped when that
// attempt started and build the garage build it was flown as, so the best-run
// ghost is drawn as the ship it was set in. No DOM beyond localStorage, so the
// HUD and the weekly mode can both read it.
import { cleanAppearance } from "../../systems/shipLivery.js";
import { isBuild } from "../shipStats.js";
import { studioDraft } from "../../systems/weeklyStudio.js";

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
const bestKey = (event) => studioDraft(event)
  ? `stardust.studio.${encodeURIComponent(studioDraft(event).draftId)}.v${event.version}.best`
  : `stardust.weekly.${event.id}.v${event.version}.best`;

/** A best to store. The ship snapshot is cleaned, and left out when there is none. */
export function makeLocalBest({ ms, log, at = new Date().toISOString(), appearance = null, build = null }) {
  const best = { ms, log, at };
  const clean = cleanAppearance(appearance);
  if (clean) best.appearance = clean;
  if (isBuild(build)) best.build = build;
  return best;
}

export function readLocalBest(event, store = storage()) {
  try {
    const raw = store?.getItem(bestKey(event));
    const best = raw ? JSON.parse(raw) : null;
    if (!(best && Number.isFinite(best.ms) && typeof best.log === "string")) return null;
    // Bests saved before ships were recorded simply have no appearance.
    const { appearance, build, ...rest } = best;
    return makeLocalBest({ ...rest, appearance, build });
  } catch { return null; }
}

export function saveLocalBest(event, best, store = storage()) {
  try { store?.setItem(bestKey(event), JSON.stringify(best)); } catch { /* private window */ }
}
