// Adapter: Touchdown as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createPilot } from '../../minigames/pilot.js';
import { playPilot } from '../../minigames/pilotView.js';
import { setupPilot } from '../../minigames/setup.js';
import { legacy } from '../_shared/legacy.js';
import { SPECS } from '../../minigames/rollPreview.js';
export const rollSpec = SPECS['pilot'];
import { CATEGORIES } from '../../minigames/picker.js';
export const picker = CATEGORIES['piloting'].cats.filter((c) => ["handling","boost","landing"].includes(c.id));
export const setup = (o) => setupPilot(o);

export async function play(stage, ctx) {
  const o = legacy('pilot', ctx);
  return playPilot(stage, { state: createPilot({ seed: o.seed, setup: o.setup }), where: 'the hangar pad', reducedMotion: o.reducedMotion });
}
