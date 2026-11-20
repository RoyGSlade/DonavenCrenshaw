// Adapter: Cut a plate as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createRecipe, RECIPES } from '../../minigames/craftChain.js';
import { playRecipe } from '../../minigames/recipeView.js';
import { setupCut, setupScrew } from '../../minigames/setup.js';
import { craftBank } from '../_shared/legacy.js';
import { legacy } from '../_shared/legacy.js';
import { CHAIN_SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = CHAIN_SPECS['cut'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['crafting'].cats.filter((c) => ["quality","speed","material"].includes(c.id));
export const setup = (o) => setupCut(o);

export async function play(stage, ctx) {
  const o = legacy('cut', ctx);
  const state = o.resume || createRecipe({ recipe: RECIPES['cut'], tier: o.setup?.tier ?? 0, points: o.setup?.points ?? {}, level: 9, tool: o.tool || 'shop', bank: craftBank.get(), seed: o.seed });
  const r = await playRecipe(stage, { state, unit: 'scrap', reducedMotion: o.reducedMotion, onProgress: o.onProgress });
  craftBank.set(r?.bank);
  return r;
}
