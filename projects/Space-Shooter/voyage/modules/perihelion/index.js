// Adapter: Perihelion as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { playNavField } from '../../minigames/perihelionEntry.js';
import { setupPerihelion } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['perihelion'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['navigation'].cats.filter((c) => ["time","fuel","warning"].includes(c.id));
export const setup = (o) => setupPerihelion(o);

export async function play(stage, ctx) {
  const o = legacy('perihelion', ctx);
  return playNavField(stage, { seed: o.seed, setup: o.setup, title: o.title || 'Plot a burn', sound: o.sound, reducedMotion: o.reducedMotion, embedded: o.embedded, onLeave: o.onLeave });
}
