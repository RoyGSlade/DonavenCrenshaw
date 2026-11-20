// The module registry (contract v1.1, pipeline/CONTRACT.md). Every mini-game and screen is a folder
// modules/<id>/ with manifest.json and index.js (`play(stage, ctx)`). The game only ever launches them through here.
//
// `await ready()` once (the workbench, the scene hooks and the map binding do); after that every lookup is synchronous.
// No top-level await, and nothing here imports a module statically: modules may import game code that imports this file.
import { MODULE_IDS } from './list.js';

export const DEFAULT_PATHS = Object.freeze(['speed', 'quality', 'material']);
const POINT_MAX = 9;
const TIER_TIME = Object.freeze({ '-2': 0.7, '-1': 0.85, '0': 1, '1': 1.15, '2': 1.3 });
const TIER_LABEL = Object.freeze({ '-2': 'Rough', '-1': 'Shaky', '0': 'Steady', '1': 'Good', '2': 'Smooth' });
const clampTier = (t) => Math.max(-2, Math.min(2, Math.trunc(t) || 0));

let table = new Map(); // id -> { id, manifest, mod }
let readyPromise = null;
let loaded = false;

const here = () => new URL('./', import.meta.url);
async function defaultReadJson(url) {
  if (url.protocol === 'file:') { const fs = await import('node:fs/promises'); return JSON.parse(await fs.readFile(url, 'utf8')); }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`manifest ${url.pathname}: ${r.status}`);
  return r.json();
}
const defaultImport = (url) => import(/* webpackIgnore: true */ url.href);

/** Problems with a manifest, as plain sentences (empty when fine). */
export function manifestIssues(m, id = m?.id) {
  const out = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  if (m.id !== id) out.push(`manifest id ${m.id} should be ${id}`);
  if (!['minigame', 'screen', 'scene'].includes(m.kind)) out.push(`kind ${m.kind} is not minigame, screen or scene`);
  if (typeof m.title !== 'string' || !m.title) out.push('title is missing');
  if (typeof m.verb !== 'string' || !m.verb) out.push('verb is missing');
  if (m.contract !== undefined && !(m.contract >= 1)) out.push('contract must be a number');
  if (m.paths !== undefined && !(Array.isArray(m.paths) && m.paths.length && m.paths.every((p) => p && typeof p.id === 'string'))) out.push('paths must be a list of { id, division, tabletopSkill }');
  return out;
}

/**
 * Load the registry. Idempotent: the same promise comes back until `reset()`. `ids` and `base` (a URL of the modules folder)
 * default to list.js and this folder; tests pass their own.
 */
export function ready({ ids = MODULE_IDS, base = here(), readJson = defaultReadJson, importModule = defaultImport } = {}) {
  if (readyPromise) return readyPromise;
  const root = base instanceof URL ? base : new URL(base);
  readyPromise = (async () => {
    const next = new Map();
    for (const id of ids) {
      const manifest = await readJson(new URL(`${id}/manifest.json`, root));
      const bad = manifestIssues(manifest, id);
      if (bad.length) throw new Error(`module ${id}: ${bad.join('; ')}`);
      const mod = await importModule(new URL(`${id}/index.js`, root));
      if (typeof mod.play !== 'function') throw new Error(`module ${id}: index.js has no play(stage, ctx)`);
      next.set(id, { id, manifest, mod });
    }
    table = next;
    loaded = true;
    return api;
  })();
  readyPromise.catch(() => { readyPromise = null; });
  return readyPromise;
}
export function reset() { table = new Map(); readyPromise = null; loaded = false; }

/** True once `ready()` has finished. */
export const isReady = () => loaded;
/** The one clear error a sync API throws when it is called before the registry is loaded. `what` names the caller. */
export function assertReady(what = 'this') {
  if (!loaded) throw new Error(`The module registry is not loaded, so ${what} cannot run yet: await ready() from modules/registry.js first (or use the async entry point).`);
}

const need = (id) => { assertReady(`module ${id}`); const e = table.get(id); if (!e) throw new Error(`No module ${id} (is it in modules/list.js, and did the page await ready()?)`); return e; };
export const has = (id) => table.has(id);

export const get = (id) => need(id);
export const manifestOf = (id) => need(id).manifest;
export const list = () => { assertReady('the module list'); return [...table.values()].map((e) => e.manifest); };
export const byKind = (kind) => list().filter((m) => m.kind === kind);
export const bySkill = (skill) => list().filter((m) => m.skill === skill);

/** The path ids a module's `points` are keyed by: its manifest `paths`, or the classic three. */
export const pathIds = (manifest) => (Array.isArray(manifest?.paths) && manifest.paths.length ? manifest.paths.map((p) => p.id) : [...DEFAULT_PATHS]);
/** Whole numbers 0..9 for every path the module declares (a missing path is 0; unknown keys are dropped). */
export function pointsFor(manifest, points = {}) {
  return Object.fromEntries(pathIds(manifest).map((k) => [k, Math.max(0, Math.min(POINT_MAX, Math.trunc(points?.[k]) || 0))]));
}

/** The ctx a module is handed: the contract's defaults, points keyed by its paths, and a host `play` for stacking. */
export function buildCtx(id, given = {}) {
  const { manifest } = need(id);
  return {
    seed: 1, tier: 0, level: 1, context: {}, sound: () => {}, reducedMotion: () => false, onLeave: () => {}, mode: 'field',
    ...given,
    points: pointsFor(manifest, given.points),
    play: given.play || (() => Promise.reject(new Error('this host cannot stack modules'))),
  };
}

/** Play a module in `stage`. The module's own result passes through untouched (the workbench settles it); see normalizeResult for hosts that follow the contract only. */
export async function play(id, stage, given = {}) { await ready(); return need(id).mod.play(stage, buildCtx(id, given)); }

/** The contract's result shape from any module result: { done, success, grade, ... } (null, a left game, becomes { done, left }). */
export function normalizeResult(r) {
  if (!r) return { done: true, success: false, grade: 0, left: true };
  const success = r.success ?? (r.outcome ? r.outcome !== 'walked' : false);
  return { ...r, done: true, success: Boolean(success), grade: Number.isFinite(r.grade) ? r.grade : success ? 100 : 0 };
}

/** The setup the d20 tier and the points make for a module: its own `setup(o)` or a plain one built from the tier. */
export function setupOf(id, o = {}) {
  const { manifest, mod } = need(id);
  const tier = clampTier(o.tier), level = o.level ?? 1, points = pointsFor(manifest, o.points);
  return typeof mod.setup === 'function' ? mod.setup({ ...o, tier, level, points }) : { tier, level, points, time: TIER_TIME[String(tier)], label: TIER_LABEL[String(tier)] };
}

/** { setup, phrases } the roll preview compares: the module's own `rollSpec`, or a time line from the tier. */
export function rollSpecOf(id) {
  const { mod } = need(id);
  if (mod.rollSpec) return mod.rollSpec;
  return { setup: (o) => setupOf(id, o), phrases: [(b, n) => { const d = Math.round((n.time / b.time - 1) * 100); return d === 0 ? null : `${Math.abs(d)}% ${d > 0 ? 'more' : 'less'} time`; }] };
}

/** The picker words for a module: [{ id, name, words(n) }]; the default is one line per declared path. */
export function pickerOf(id) {
  const { manifest, mod } = need(id);
  if (Array.isArray(mod.picker) && mod.picker.length) return mod.picker;
  const paths = Array.isArray(manifest.paths) && manifest.paths.length ? manifest.paths.map((p) => ({ id: p.id, name: p.division || p.id })) : DEFAULT_PATHS.map((k) => ({ id: k, name: k[0].toUpperCase() + k.slice(1) }));
  return paths.map((p) => ({ ...p, words: (n) => (n > 0 ? `${p.name}: ${n} point${n === 1 ? '' : 's'} in ${manifest.title}` : `${p.name}: no bonus yet`) }));
}
/** One plain line for the skill picker: what the module is and where it is played. */
export function pickerLineOf(id) {
  const m = manifestOf(id);
  return `${m.title}: ${m.verb}${m.skill ? ` (${m.skill})` : ''}`;
}

/** The roll preview for a module and an attempt, same shape as minigames/rollPreview.rollPreview; `tierOf` and `tierInfo` come in so this file has no game imports. */
export function rollPreviewOf(id, attempt, { level = 1, points = {} } = {}, { tierOf, tierInfo }) {
  const spec = rollSpecOf(id);
  const tier = tierOf(attempt), label = tierInfo(tier).label;
  const base = spec.setup({ tier: 0, level, points }), now = spec.setup({ tier, level, points });
  const phrases = spec.phrases.map((p) => p(base, now)).filter(Boolean);
  return { tier, label, phrases, line: phrases.length ? `${label} roll: ${phrases.join(', ')}.` : `${label} roll: nothing changes.` };
}

/** The gym's games, from manifests: a module opts in with `"gym": { "name": "..." }`. [{ id, skill, name, setup(o), cats }] in list order. */
export function gymGames() {
  return list().filter((m) => m.gym).map((m) => ({ id: m.id, skill: m.skill, name: m.gym.name || m.title, setup: (o) => setupOf(m.id, o), cats: pathIds(m) }));
}

/**
 * What a scene may ask of a module, from its manifest `hook`: { skill, categories, outcomes, inputs, defaults, branch, worldFields }. A module opts in
 * with that block. Returns { [id]: hook } for every module that has one.
 */
export function hookKinds() {
  return Object.fromEntries(list().filter((m) => m.hook).map((m) => [m.id, { skill: m.hook.skill || m.skill, categories: pathIds(m), outcomes: m.hook.outcomes || ['win', 'lose'], inputs: m.hook.inputs || {}, defaults: m.hook.defaults || {}, branch: m.hook.branch || null, worldFields: m.hook.worldFields || [] }]));
}

/** The contract's controller index: every manifest, in list order (written to modules/index.json by scripts/build-module-index.mjs). */
export const indexOf = () => ({ contract: 1, modules: list() });

const api = { ready, reset, isReady, assertReady, gymGames, hookKinds, has, get, manifestOf, list, byKind, bySkill, pathIds, pointsFor, buildCtx, play, normalizeResult, setupOf, rollSpecOf, pickerOf, pickerLineOf, rollPreviewOf, indexOf, manifestIssues };
export default api;

// In a page, start loading as soon as anything imports the registry, so menus that read it synchronously (the skills page, the gym) are ready by the
// time a player opens them, without boot.js having to know. Not in node: tests choose when to load.
if (typeof document !== 'undefined') ready().catch((e) => console.warn('Stardust: the module registry could not load', e));
