// Opens any of the nine mini-games in a stage element, at the setup a station (or the gym, or a conversation) worked out,
// and resolves with the game's own result ({ success, xp, ... }; haggle adds outcome and price). The same create and play
// functions the scene hooks, the gym and the dev pages use; nothing is re-implemented here.
import { createPracticeHack } from '../minigames/hack.js'; import { playRing } from '../minigames/hackView.js';
import { playMirrors } from '../minigames/mirrorsView.js';
import { playRepair } from '../minigames/repairView.js';
import { createHaggle } from '../minigames/haggle.js'; import { playHaggle } from '../minigames/haggleView.js';
import { createCraft } from '../minigames/craft.js'; import { playCraft } from '../minigames/craftView.js';
import { createNav } from '../minigames/nav.js'; import { playNav } from '../minigames/navView.js';
import { createStealth } from '../minigames/stealth.js'; import { playStealth } from '../minigames/stealthView.js';
import { createPersuade } from '../minigames/persuade.js'; import { playPersuade } from '../minigames/persuadeView.js';
import { createIntimidate } from '../minigames/intimidate.js'; import { playIntimidate } from '../minigames/intimidateView.js';
import { createPilot } from '../minigames/pilot.js'; import { playPilot } from '../minigames/pilotView.js';
import { playNavField } from '../minigames/perihelionEntry.js';
import { createRecipe, RECIPES } from '../minigames/craftChain.js'; import { playRecipe } from '../minigames/recipeView.js';
import { createBribe } from '../talk/bribe.js'; import { playBribe } from '../talk/bribeView.js';

let craftBank = 0; // scrap the last craft rounded up, carried into the next one (the game's own rule)
export const resetCraftBank = () => { craftBank = 0; clearPart(); };

// The bench keeps a part-made item between games of a craft (Cut done, Screw next), so a craft can be left and picked up.
const PART_KEY = 'stardust.workbench.part.v1';
export function loadPart(storage = globalThis.localStorage) { try { const p = JSON.parse(storage?.getItem(PART_KEY) || 'null'); return p && Array.isArray(p.list) && !p.done ? p : null; } catch { return null; } }
export function savePart(part, storage = globalThis.localStorage) { try { storage?.setItem(PART_KEY, JSON.stringify(part)); } catch { /* a private window keeps it in memory only */ } }
export function clearPart(storage = globalThis.localStorage) { try { storage?.removeItem(PART_KEY); } catch { /* nothing to clear */ } }
/** The crafting chain's crafts. */
export const CHAIN_IDS = Object.freeze(['cut', 'screw', 'bend', 'bolt-plate']);

/**
 * `o`: { seed, setup, title, who, what, open, best, lock, context (hack: foot | ship | combat), system (repair), sound, reducedMotion }. Resolves with the game's result.
 * The panel of each game exposes its pure state as `.__state` (the browser tests drive bots through it).
 */
export async function playGame(stage, id, o = {}) {
  const { seed = 1, setup, title, who, what, sound = () => {}, reducedMotion = () => false } = o;
  switch (id) {
    case 'repair': return playRepair(stage, { seed, setup, system: o.system, title: title || 'Coolant line', sound, reducedMotion });
    case 'hack': return playMirrors(stage, { seed, setup, context: o.context || 'foot', title: title || 'Bench terminal', sound, reducedMotion });
    case 'haggle': return playHaggle(stage, { state: createHaggle({ seed, open: o.open ?? 20, best: o.best ?? 30, setup }), who: who || 'the trader', what: what || 'the price', sound, reducedMotion });
    case 'cut': case 'screw': case 'bend': case 'bolt-plate': {
      const state = o.resume || createRecipe({ recipe: RECIPES[id], tier: setup?.tier ?? 0, points: setup?.points ?? {}, level: 9, tool: o.tool || 'shop', bank: craftBank, seed });
      const r = await playRecipe(stage, { state, unit: 'scrap', reducedMotion, onProgress: (st) => { if (st.done) clearPart(); else if (st.list.length > 1 && st.grades.length) savePart(st); } });
      if (Number.isFinite(r?.bank)) craftBank = r.bank;
      return r;
    }
    case 'craft': { const r = await playCraft(stage, { state: createCraft({ seed, recipe: { materials: 4, build: 30 }, setup, bank: craftBank }), what: 'fitting', unit: 'scrap', reducedMotion }); if (Number.isFinite(r?.bank)) craftBank = r.bank; return r; }
    case 'perihelion': return playNavField(stage, { seed, setup, title: title || 'Plot a burn', sound, reducedMotion, embedded: o.embedded, onLeave: o.onLeave });
    case 'nav': return playNav(stage, { state: createNav({ seed, setup }), title: title || 'Lane run', reducedMotion });
    case 'stealth': return playStealth(stage, { state: createStealth({ seed, setup }), title: title || 'Cargo hold', reducedMotion });
    case 'persuade': return playPersuade(stage, { state: createPersuade({ seed, setup, opening: o.opening }), who: who || 'the dock clerk', what: what || 'let you through', reducedMotion });
    case 'intimidate': return playIntimidate(stage, { state: createIntimidate({ seed, setup }), who: who || 'the Cinder Reaver', what: what || 'stand down', reducedMotion });
    case 'pilot': return playPilot(stage, { state: createPilot({ seed, setup }), where: 'the hangar pad', reducedMotion });
    case 'practice': return playRing(stage, { state: createPracticeHack({ seed }), title: 'Practice lock', sound, reducedMotion });
    case 'bribe': return playBribe(stage, { state: createBribe({ seed, min: o.range?.min ?? 10, max: o.range?.max ?? 40, setup }), who: who || 'the trader', what: what || 'what you want', gift: o.gift || null, sound, reducedMotion });
    default: throw new Error(`No mini-game ${id}`);
  }
}
