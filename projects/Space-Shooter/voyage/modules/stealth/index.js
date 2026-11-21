// Adapter: Shadow slip as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createStealth } from '../../minigames/stealth.js';
import { playStealth } from '../../minigames/stealthView.js';
import { setupStealth } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['stealth'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['stealth'].cats.filter((c) => ["quiet","range","decay"].includes(c.id));
export const setup = (o) => setupStealth(o);

export async function play(stage, ctx) {
  const o = legacy('stealth', ctx);
  return playStealth(stage, { state: createStealth({ seed: o.seed, setup: o.setup }), title: o.title || 'Cargo hold', reducedMotion: o.reducedMotion });
}
