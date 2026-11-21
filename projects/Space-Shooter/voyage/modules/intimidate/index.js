// Adapter: Intimidate as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createIntimidate } from '../../minigames/intimidate.js';
import { playIntimidate } from '../../minigames/intimidateView.js';
import { setupIntimidate } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['intimidate'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['social'].cats.filter((c) => ["persuade","intimidate","haggle"].includes(c.id));
export const setup = (o) => setupIntimidate(o);

export async function play(stage, ctx) {
  const o = legacy('intimidate', ctx);
  return playIntimidate(stage, { state: createIntimidate({ seed: o.seed, setup: o.setup }), who: o.who || 'the Cinder Reaver', what: o.what || 'stand down', reducedMotion: o.reducedMotion });
}
