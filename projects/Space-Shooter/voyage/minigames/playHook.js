// The page side of a scene hook (proposal, SCENE-HOOKS.md part 3): open the minigame a hooked choice asks for, at the tier
// the d20 set, and resolve with what the engine's { type: 'minigame' } action needs: { branch, xp, skill, result }.
// `start` is sceneHook.startHook(...); `seed` should come from the run (for instance hashSeed(run.seed, run.steps)).
import { createSetupHack } from './hack.js';
import { playSetupHack } from './hackView.js';
import { createHaggle } from './haggle.js';
import { playHaggle } from './haggleView.js';
import { playRepair } from './repairView.js';
import { branchOf, HOOK_KINDS } from './sceneHook.js';

export async function playHook(root, { start, seed = 1, sound = () => {}, reducedMotion = () => false } = {}) {
  const { kind, setup } = start;
  const result = kind === 'repair' ? await playRepair(root, { seed, setup, title: start.title || 'Repair', sound, reducedMotion })
    : kind === 'hack' ? await playSetupHack(root, { state: createSetupHack({ seed, lock: start.lock, setup }), title: start.title || 'Lock', sound, reducedMotion })
    : await playHaggle(root, { state: createHaggle({ seed, open: start.open, best: start.best, setup }), who: start.who || 'Them', what: start.what || 'the deal', sound, reducedMotion });
  return { branch: branchOf(kind, result), xp: result?.xp || 0, skill: HOOK_KINDS[kind].skill, result };
}
