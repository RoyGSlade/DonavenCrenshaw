// Adapter: Mirrors and firewalls as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { playMirrors } from '../../minigames/mirrorsView.js';
import { setupHack } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['hack'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['hacking'].cats.filter((c) => ["time","size","retries"].includes(c.id));
export const setup = (o) => setupHack(o);

export async function play(stage, ctx) {
  const o = legacy('hack', ctx);
  return playMirrors(stage, { seed: o.seed, setup: o.setup, context: o.context || 'foot', title: o.title || 'Bench terminal', sound: o.sound, reducedMotion: o.reducedMotion });
}
