// Adapter: Haggle as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createHaggle } from '../../minigames/haggle.js';
import { playHaggle } from '../../minigames/haggleView.js';
import { setupHaggle } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['haggle'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['social'].cats.filter((c) => ["persuade","intimidate","haggle"].includes(c.id));
export const setup = (o) => setupHaggle(o);

export async function play(stage, ctx) {
  const o = legacy('haggle', ctx);
  return playHaggle(stage, { state: createHaggle({ seed: o.seed, open: o.open ?? 20, best: o.best ?? 30, setup: o.setup }), who: o.who || 'the trader', what: o.what || 'the price', sound: o.sound, reducedMotion: o.reducedMotion });
}
