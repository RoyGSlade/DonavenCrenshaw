// Opens any of the nine mini-games in a stage element, at the setup a station (or the gym, or a conversation) worked out,
// and resolves with the game's own result ({ success, xp, ... }; haggle adds outcome and price). The same create and play
// functions the scene hooks, the gym and the dev pages use; nothing is re-implemented here.
import { ready, play } from '../modules/registry.js';
import { stackPlay } from '../modules/host.js';
import { craftBank } from '../modules/_shared/legacy.js';

// The scrap a craft rounds up is carried into the next one: the bank lives with the craft modules (modules/_shared/legacy.js).
export const resetCraftBank = () => { craftBank.reset(); clearPart(); };

// The bench keeps a part-made item between games of a craft (Cut done, Screw next), so a craft can be left and picked up.
const PART_KEY = 'stardust.workbench.part.v1';
export function loadPart(storage = globalThis.localStorage) { try { const p = JSON.parse(storage?.getItem(PART_KEY) || 'null'); return p && Array.isArray(p.list) && !p.done ? p : null; } catch { return null; } }
export function savePart(part, storage = globalThis.localStorage) { try { storage?.setItem(PART_KEY, JSON.stringify(part)); } catch { /* a private window keeps it in memory only */ } }
export function clearPart(storage = globalThis.localStorage) { try { storage?.removeItem(PART_KEY); } catch { /* nothing to clear */ } }
/** The crafting chain's three crafts. */
export const CHAIN_IDS = Object.freeze(['cut', 'screw', 'bolt-plate']);

/**
 * `o`: { seed, setup, title, who, what, open, best, lock, context (hack: foot | ship | combat), system (repair), sound, reducedMotion, ... }. Resolves with the game's result.
 * Every game is a module (modules/<id>/): this only hands the old options to the registry as the module's ctx. The panel of each game exposes its pure state as `.__state`.
 */
export async function playGame(stage, id, o = {}) {
  await ready();
  const { seed = 1, setup, sound = () => {}, reducedMotion = () => false, onLeave, ...rest } = o;
  // The old `context` option (hack: foot | ship | combat) stays a context key; a part in hand saves as the craft goes on.
  const context = { ...rest, ...(CHAIN_IDS.includes(id) ? { onProgress: (st) => { if (st.done) clearPart(); else if (st.list.length > 1 && st.grades.length) savePart(st); } } : {}) };
  const ctx = { seed, setup, sound, reducedMotion, onLeave, context };
  return play(id, stage, { ...ctx, play: stackPlay(ctx) });
}
