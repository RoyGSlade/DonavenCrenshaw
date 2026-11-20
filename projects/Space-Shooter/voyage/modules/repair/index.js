// Adapter: Coolant pipes as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { playRepair } from '../../minigames/repairView.js';
import { setupRepair } from '../../minigames/setup.js';
import { worldOf } from '../../minigames/repair.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['repair'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['repair'].cats.filter((c) => ["time","size","quality"].includes(c.id));
// What a lost line did to the world, for scene hooks (the hook's `world`).
export const hookWorld = worldOf;
export const setup = (o) => setupRepair(o);

export async function play(stage, ctx) {
  const o = legacy('repair', ctx);
  return playRepair(stage, { seed: o.seed, setup: o.setup, system: o.system, title: o.title || 'Coolant line', showXp: o.showXp, sound: o.sound, reducedMotion: o.reducedMotion });
}
