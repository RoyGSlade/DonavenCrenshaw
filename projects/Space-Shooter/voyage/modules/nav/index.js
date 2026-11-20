// Adapter: Lane run as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createNav } from '../../minigames/nav.js';
import { playNav } from '../../minigames/navView.js';
import { setupNavTrainer } from '../../minigames/perihelionEntry.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['nav'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['navigation'].cats.filter((c) => ["time","fuel","warning"].includes(c.id));
export const setup = (o) => setupNavTrainer(o);

export async function play(stage, ctx) {
  const o = legacy('nav', ctx);
  return playNav(stage, { state: createNav({ seed: o.seed, setup: o.setup }), title: o.title || 'Lane run', reducedMotion: o.reducedMotion });
}
