// Adapter: Heat and shape as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createCraft } from '../../minigames/craft.js';
import { playCraft } from '../../minigames/craftView.js';
import { setupCraft } from '../../minigames/setup.js';
import { craftBank } from '../_shared/legacy.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['craft'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['crafting'].cats.filter((c) => ["quality","speed","material"].includes(c.id));
export const setup = (o) => setupCraft(o);

export async function play(stage, ctx) {
  const o = legacy('craft', ctx);
  const r = await playCraft(stage, { state: createCraft({ seed: o.seed, recipe: { materials: 4, build: 30 }, setup: o.setup, bank: craftBank.get() }), what: 'fitting', unit: 'scrap', reducedMotion: o.reducedMotion });
  craftBank.set(r?.bank);
  return r;
}
