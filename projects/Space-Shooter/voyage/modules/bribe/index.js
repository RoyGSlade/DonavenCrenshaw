// Adapter: Bribe as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createBribe, setupBribe } from '../../talk/bribe.js';
import { playBribe } from '../../talk/bribeView.js';
import { legacy } from '../_shared/legacy.js';

import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['social'].cats.filter((c) => ["persuade","intimidate","haggle"].includes(c.id));
export const setup = (o) => setupBribe(o);

export async function play(stage, ctx) {
  const o = legacy('bribe', ctx);
  return playBribe(stage, { state: createBribe({ seed: o.seed, min: o.range?.min ?? 10, max: o.range?.max ?? 40, setup: o.setup }), who: o.who || 'the trader', what: o.what || 'what you want', gift: o.gift || null, sound: o.sound, reducedMotion: o.reducedMotion });
}
