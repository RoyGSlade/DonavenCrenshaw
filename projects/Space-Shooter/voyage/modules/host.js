// The host side of the contract: open a module full screen with a Leave button, hand it its ctx (including `ctx.play`, which
// stacks another module on top and resolves with that module's result), and close the screen when it ends. DOM only; no rules.
import { ready, play as playIn, manifestOf } from './registry.js';
import { openFullScreen } from '../workbench/fullScreen.js';

/** The default way to get a stage: the shared full-screen overlay. A host may pass its own `openStage({ word, title, onLeave }) -> { stage, close }`. */
export const defaultOpenStage = (o) => openFullScreen({ ...o, note: '' });

/** `ctx.play` for a stage opener: opens `id` full screen over whatever is showing, resolves with its result, then closes it. */
export function stackPlay(baseCtx = {}, openStage = defaultOpenStage) {
  const { sound, reducedMotion, mode } = baseCtx; // a stacked module gets its own seed, setup and context, never the screen's
  return (id, overrides = {}) => playModule(id, { sound, reducedMotion, mode, ...overrides }, { openStage });
}

/**
 * Open `id` full screen and play it with `ctx` (seed, tier, points, level, context, sound, reducedMotion, mode). Resolves with the module's
 * result; `{ left: true }` when the player pressed Leave. `ctx.play` is provided here.
 */
export async function playModule(id, ctx = {}, { openStage = defaultOpenStage } = {}) {
  await ready();
  const m = manifestOf(id);
  let finish = null;
  const left = new Promise((resolve) => { finish = () => resolve({ done: true, success: false, grade: 0, left: true }); });
  const fs = openStage({ word: String(m.kind || 'module').toUpperCase(), title: m.title, onLeave: () => { ctx.onLeave?.(); finish(); } });
  try {
    const { play: _drop, ...rest } = ctx;
    return await Promise.race([playIn(id, fs.stage, { ...rest, onLeave: () => finish(), play: stackPlay(rest, openStage) }), left]);
  } finally { fs.close(); }
}
