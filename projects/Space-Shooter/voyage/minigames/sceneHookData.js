// The three dry-run hooks (SCENE-HOOKS.md): the `minigame` block to paste into one choice of a slice scene.
// Applied here only to an in-memory copy (applyHook); the quest data files are never edited by this lane.
export const SCENE_HOOKS = Object.freeze([
  { id: 'scene5-coolant', scene: 'gunners-week', node: 'engine-brief-2', label: 'Patch the line with a wrench and tape.', minigame: { kind: 'repair', title: 'Coolant line' } },
  { id: 'scene3-airlock', scene: 'hold-the-corridor', node: 'corridor', label: 'Hack the inner airlock door shut from the corridor panel.', minigame: { kind: 'hack', lock: 2, title: 'Inner airlock door' } },
  { id: 'scene4-haggle', scene: 'the-eighth-gunner', node: 'desk-2', label: 'Haggle for a bigger share.', minigame: { kind: 'haggle', who: 'Captain Tull', what: 'your share', open: 20, best: 30, mid: 'end-hired-fair' } },
]);

/** A copy of the quest with the hook's `minigame` block on its choice. Returns { quest, choice }. */
export function applyHook(quest, hook) {
  const copy = structuredClone(quest);
  const choice = copy.nodes[hook.node].choices.find((c) => c.label === hook.label);
  if (!choice) throw new Error(`${hook.id}: no choice labelled ${hook.label}`);
  choice.minigame = structuredClone(hook.minigame);
  return { quest: copy, choice };
}
