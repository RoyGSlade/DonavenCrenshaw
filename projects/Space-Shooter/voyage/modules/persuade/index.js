// Adapter: Persuade as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createPersuade } from '../../minigames/persuade.js';
import { playPersuade } from '../../minigames/persuadeView.js';
import { setupPersuade } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['persuade'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['social'].cats.filter((c) => ["persuade","intimidate","haggle"].includes(c.id));
export const setup = (o) => setupPersuade(o);

export async function play(stage, ctx) {
  const o = legacy('persuade', ctx);
  return playPersuade(stage, { state: createPersuade({ seed: o.seed, setup: o.setup, opening: o.opening }), who: o.who || 'the dock clerk', what: o.what || 'let you through', reducedMotion: o.reducedMotion });
}
