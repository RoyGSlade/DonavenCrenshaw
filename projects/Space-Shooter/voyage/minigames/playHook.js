// The page side of a scene hook (proposal, SCENE-HOOKS.md part 3): open the minigame a hooked choice asks for, at the tier
// the d20 set, and resolve with what the engine's { type: 'minigame' } action needs: { branch, xp, skill, world, result }.
// `start` is sceneHook.startHook(...); `seed` should come from the run (for instance hashSeed(run.seed, run.steps)).
// The game is launched through the module registry by its hook kind (repair, hack, haggle, or any module a scene names).
import { ready, play } from '../modules/registry.js';
import { branchOf, HOOK_KINDS, worldResult } from './sceneHook.js';

// What each game was handed before the registry: the old per-kind options, now the module's ctx.context.
const optionsOf = (start) => ({
  repair: { system: start.system || undefined, title: start.title || 'Repair' },
  hack: { context: start.context, title: start.title || 'Terminal' },
  haggle: { open: start.open, best: start.best, who: start.who || 'Them', what: start.what || 'the deal' },
}[start.kind] || {});

export async function playHook(root, { start, seed = 1, sound = () => {}, reducedMotion = () => false } = {}) {
  const { kind, setup } = start;
  await ready();
  const result = await play(kind, root, { seed, setup, sound, reducedMotion, context: optionsOf(start) });
  return { branch: branchOf(kind, result), xp: result?.xp || 0, skill: HOOK_KINDS[kind].skill, world: worldResult(kind, result), result, ...(kind === 'haggle' && Number.isFinite(result?.price) ? { price: result.price } : {}) };
}
