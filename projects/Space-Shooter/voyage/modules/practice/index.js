// Adapter: Practice lock as a module. The game code stays in minigames/ (and talk/); this only maps the contract's ctx onto it.
import { createPracticeHack } from '../../minigames/hack.js';
import { playRing } from '../../minigames/hackView.js';
import { legacy } from '../_shared/legacy.js';

export async function play(stage, ctx) {
  const o = legacy('practice', ctx);
  return playRing(stage, { state: createPracticeHack({ seed: o.seed }), title: 'Practice lock', sound: o.sound, reducedMotion: o.reducedMotion });
}
