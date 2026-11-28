// Binding a module to a console in a map with one data line:  "interact": { "kind": "module", "id": "gun-feed" }
// The page builds the ctx from the save, plays the module full screen, then applies its `effects`. The module never writes the save.
// Optional keys on the interact: `tier` (a fixed roll tier), `seed`, `context` (extra world state for the module), `mode`.
import { ready, manifestOf, pointsFor, normalizeResult } from './registry.js';
import { playModule } from './host.js';

/** The ctx a save makes for a module: level and points of its skill, and the world state it may read. */
export function ctxFromSave(manifest, save = {}, target = {}) {
  const skill = manifest.skill;
  const level = save?.character?.levels?.[skill] ?? 1;
  const points = pointsFor(manifest, save?.character?.points?.[skill]);
  const context = { items: { ...(save?.items || {}) }, flags: { ...(save?.flags || {}) }, ...(save?.fuel != null ? { fuel: save.fuel } : {}), ...(target.context || {}) };
  return { seed: target.seed ?? 1, tier: target.tier ?? 0, level, points, context, mode: target.mode || 'field' };
}

/** Apply a result's `effects`: items and flags through the store's grant, `world` through the page's hook. Returns what was applied. */
export function applyEffects(effects, { store = null, applyWorld = null } = {}) {
  const e = effects || {};
  const applied = {};
  if (store?.grant && (e.items || e.flags)) { store.grant({ ...(e.items ? { items: e.items } : {}), ...(e.flags ? { flags: e.flags } : {}) }); if (e.items) applied.items = e.items; if (e.flags) applied.flags = e.flags; }
  if (e.world && applyWorld) { applyWorld(e.world); applied.world = e.world; }
  return applied;
}

/**
 * Play the module a map interact names. `host`: { store, save(), sound, reducedMotion, toast, applyWorld(world), openStage }.
 * Resolves with the normalised result (a left game changes nothing).
 */
export async function openModule(target, host = {}) {
  await ready();
  const manifest = manifestOf(target.id);
  const ctx = { ...ctxFromSave(manifest, host.save?.() || {}, target), sound: host.sound || (() => {}), reducedMotion: host.reducedMotion || (() => false) };
  const raw = await playModule(target.id, ctx, { openStage: host.openStage });
  const result = normalizeResult(raw);
  if (!result.left) applyEffects(result.effects, host);
  return result;
}
