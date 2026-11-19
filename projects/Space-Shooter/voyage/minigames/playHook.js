// The page side of a scene hook (proposal, SCENE-HOOKS.md part 3): open the minigame a hooked choice asks for, at the tier
// the d20 set, and resolve with what the engine's { type: 'minigame' } action needs: { branch, xp, skill, world, result }.
// `start` is sceneHook.startHook(...); `seed` should come from the run (for instance hashSeed(run.seed, run.steps)).
import { playMirrors } from './mirrorsView.js';
import { createHaggle } from './haggle.js';
import { playHaggle } from './haggleView.js';
import { playRepair } from './repairView.js';
import { branchOf, HOOK_KINDS, worldResult } from './sceneHook.js';

export async function playHook(root, { start, seed = 1, sound = () => {}, reducedMotion = () => false } = {}) {
  const { kind, setup } = start;
  const result = kind === 'repair' ? await playRepair(root, { seed, setup, system: start.system || undefined, title: start.title || 'Repair', sound, reducedMotion })
    : kind === 'hack' ? await playMirrors(root, { seed, setup, context: start.context, title: start.title || 'Terminal', sound, reducedMotion })
    : await playHaggle(root, { state: createHaggle({ seed, open: start.open, best: start.best, setup }), who: start.who || 'Them', what: start.what || 'the deal', sound, reducedMotion });
  return { branch: branchOf(kind, result), xp: result?.xp || 0, skill: HOOK_KINDS[kind].skill, world: worldResult(kind, result), result };
}
