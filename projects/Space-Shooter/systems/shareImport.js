// Copying another pilot's ship or flight settings: the leaderboard buttons send a
// player here with ?import=ship&from=<username> or ?import=settings&from=<username>.
// This file is the pure half (no DOM, so tests run it in Node): reading and
// clearing the URL, asking the hub, checking what comes back, summarising what
// applying settings would change, and the one-step undo record. ui/shareImport.js
// draws the prompts.
//
// Nothing here changes the player's ship or settings. The prompts do that, only
// after the player says so.
import { cleanAppearance } from './shipLivery.js';
import {
  MINIMAP_ZOOMS, ICON_SCALES, TILT_DEAD_ZONES, TILT_MAX_TILTS, TILT_EXPOS, TILT_DEFAULTS,
  CAMERA_FOVS, CAMERA_DISTANCES, CAMERA_STIFFNESS, CAMERA_SWIVELS, CAMERA_TRANSITIONS, CAMERA_DEFAULTS, decodeSettingsCode, encodeSettingsCode, applySettingsCode,
} from './flightSettings.js';
import { normalizeControllerTuning } from './controllerTuning.js';
import { KEY_ACTIONS, PAD_ACTIONS, normalizeBinds, keyLabel, padLabel } from './keybinds.js';

export const IMPORT_KINDS = Object.freeze(['ship', 'settings']);
// The hub's username rule (api/lib/accounts.js). Anything else in ?from= is ignored.
const USERNAME = /^[A-Za-z0-9_-]{3,20}$/;

/** "?import=ship&from=Ada" → { kind, from }, or null when it is not a well-formed import link. */
export function parseImportParams(search) {
  try {
    const params = new URLSearchParams(search || '');
    const kind = params.get('import');
    const from = params.get('from');
    return IMPORT_KINDS.includes(kind) && USERNAME.test(from || '') ? { kind, from } : null;
  } catch {
    return null;
  }
}

/** The same address without import and from, so a reload does not ask again. Other params and the hash stay. */
export function withoutImportParams(href) {
  const url = new URL(href);
  url.searchParams.delete('import');
  url.searchParams.delete('from');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The hub's address for a shared ship or settings code, from the game's backend base (…/api/games/stardust). */
export function sharedUrl(kind, from, backendBaseUrl) {
  if (!IMPORT_KINDS.includes(kind) || !USERNAME.test(from || '') || !backendBaseUrl) return null;
  try {
    return `${new URL(backendBaseUrl).origin}/api/stardust/pilots/${encodeURIComponent(from)}/${kind}`;
  } catch {
    return null;
  }
}

/**
 * Ask the hub for what a pilot shares and check it before anyone sees it.
 *   { status: 'ok', pilot, appearance }   (ship)    appearance is validated and normalised, nothing trimmed
 *   { status: 'ok', pilot, code, next }   (settings) next is the decoded, range-checked settings
 *   { status: 'missing' }    not shared, unknown pilot, or nothing saved (the hub does not say which)
 *   { status: 'invalid' }    the hub answered with something the game refuses
 *   { status: 'offline' }    no hub, no answer, or a server error
 */
export async function fetchShared(kind, from, { backendBaseUrl, fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 8000 } = {}) {
  const url = sharedUrl(kind, from, backendBaseUrl);
  if (!url || !fetchImpl) return { status: 'offline' };
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchImpl(url, { credentials: 'omit', cache: 'no-store', signal: abort?.signal });
  } catch {
    return { status: 'offline' };
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) return { status: res.status >= 500 ? 'offline' : 'invalid' };
  let data = null;
  try { data = await res.json(); } catch { /* handled below */ }
  const pilot = { username: typeof data?.username === 'string' ? data.username : from, displayName: typeof data?.displayName === 'string' ? data.displayName.slice(0, 40) : from };
  if (kind === 'ship') {
    const raw = data?.appearance;
    const appearance = cleanAppearance(raw);
    // The hub already refuses images and free text; a design that loses a layer here is not what it vouched for.
    if (!appearance || appearance.layers.length !== (Array.isArray(raw?.layers) ? raw.layers.length : 0)) return { status: 'invalid' };
    return { status: 'ok', pilot, appearance };
  }
  const next = decodeSettingsCode(data?.code);
  return next ? { status: 'ok', pilot, code: String(data.code).trim(), next } : { status: 'invalid' };
}

// --- What applying settings would change -----------------------------------------------------

const pick = (list, index, fallback) => list[Number.isInteger(index) && index >= 0 && index < list.length ? index : fallback];
const step = (list) => (value, index) => `${index + 1} of ${list.length}`;
// [label, list, group key, defaults, format]. The same words as the settings panel.
const STEPPED = [
  ['Field of view', CAMERA_FOVS, 'camera', 'fovIndex', CAMERA_DEFAULTS, (v) => `${Math.round(v * 100)}`],
  ['Camera distance', CAMERA_DISTANCES, 'camera', 'distanceIndex', CAMERA_DEFAULTS, (v) => `${Math.round(v * 100)}%`],
  ['Camera stiffness', CAMERA_STIFFNESS, 'camera', 'stiffnessIndex', CAMERA_DEFAULTS, (v) => v.toFixed(2)],
  ['Swivel speed', CAMERA_SWIVELS, 'camera', 'swivelIndex', CAMERA_DEFAULTS, step(CAMERA_SWIVELS)],
  ['Camera transition', CAMERA_TRANSITIONS, 'camera', 'transitionIndex', CAMERA_DEFAULTS, step(CAMERA_TRANSITIONS)],
  ['Tilt sensitivity', TILT_EXPOS, 'tilt', 'sensIndex', TILT_DEFAULTS, step(TILT_EXPOS)],
  ['Max tilt', TILT_MAX_TILTS, 'tilt', 'maxIndex', TILT_DEFAULTS, (v) => `${v}°`],
  ['Tilt dead zone', TILT_DEAD_ZONES, 'tilt', 'deadIndex', TILT_DEFAULTS, (v) => `${v}°`],
  ['Minimap zoom', MINIMAP_ZOOMS, 'minimap', 'zoomIndex', { zoomIndex: 0 }, (v) => `${v}×`],
  ['Map icon size', ICON_SCALES, 'minimap', 'iconIndex', { iconIndex: 2 }, (v) => `${Math.round(v * 100)}%`],
];
const MAX_BIND_ROWS = 6;
const keys = (list) => (list.length ? list.map(keyLabel).join(' / ') : '—');

/**
 * What a decoded settings code (decodeSettingsCode's answer) would change against
 * the current settings (flightSettings()): a list of { label, from, to }, only for
 * values that differ. Empty when applying it would change nothing.
 */
export function describeSettingsChange(current, next) {
  const rows = [];
  const add = (label, from, to) => { if (from !== to) rows.push({ label, from, to }); };
  const view = (mode) => (mode === 'behind' ? 'Behind the ship' : 'Track view');
  if (next.cameraMode) add('Camera', view(current.cameraMode), view(next.cameraMode));
  for (const [label, list, group, key, defaults, format] of STEPPED) {
    if (!next[group]) continue;
    const at = (settings) => pick(list, settings[group]?.[key], defaults[key]);
    const index = (settings) => (Number.isInteger(settings[group]?.[key]) ? settings[group][key] : defaults[key]);
    add(label, format(at(current), index(current)), format(at(next), index(next)));
  }
  add('Auto fire', current.autoFire ? 'On' : 'Off', next.autoFire ? 'On' : 'Off');
  add('Minimap', current.minimap?.show ? 'Shown' : 'Hidden', next.minimap.show ? 'Shown' : 'Hidden');
  if (next.controller) {
    const was = normalizeControllerTuning(current.controller);
    add('Stick dead zone', `${Math.round(was.stickDeadzone * 100)}%`, `${Math.round(next.controller.stickDeadzone * 100)}%`);
    add('Trigger dead zone', `${Math.round(was.triggerDeadzone * 100)}%`, `${Math.round(next.controller.triggerDeadzone * 100)}%`);
    add('Controller sensitivity', `${was.sensitivity.toFixed(2)}×`, `${next.controller.sensitivity.toFixed(2)}×`);
  }
  if (next.binds) {
    const was = normalizeBinds(current.binds);
    const bindRows = [];
    for (const [action, name] of KEY_ACTIONS) if (JSON.stringify(was.keys[action]) !== JSON.stringify(next.binds.keys[action])) bindRows.push({ label: `Key: ${name}`, from: keys(was.keys[action]), to: keys(next.binds.keys[action]) });
    for (const [action, name] of PAD_ACTIONS) if (was.pad[action] !== next.binds.pad[action]) bindRows.push({ label: `Button: ${name}`, from: padLabel(was.pad[action]), to: padLabel(next.binds.pad[action]) });
    if (was.sticks !== next.binds.sticks) bindRows.push({ label: 'Controller sticks', from: was.sticks === 'split' ? 'Split' : 'Left stick turns', to: next.binds.sticks === 'split' ? 'Split' : 'Left stick turns' });
    rows.push(...bindRows.slice(0, MAX_BIND_ROWS));
    if (bindRows.length > MAX_BIND_ROWS) rows.push({ label: 'Bindings', from: '', to: `and ${bindRows.length - MAX_BIND_ROWS} more changes` });
  }
  const modes = Object.keys(next.layouts || {});
  if (modes.length) {
    const had = modes.filter((mode) => current.layouts?.[mode]);
    add('HUD layout', had.length ? `${had.length} saved` : 'default', `${modes.length} replaced`);
  }
  return rows;
}

// --- The one-step undo ---------------------------------------------------------------------

const UNDO_KEY = 'stardust.settingsUndo.v1';

/** The settings as they were before the last import: { code, from, at }, or null. */
export function readUndo(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(UNDO_KEY));
    return typeof saved?.code === 'string' && saved.code.startsWith('SD1-') && decodeSettingsCode(saved.code)
      ? { code: saved.code, from: typeof saved.from === 'string' ? saved.from.slice(0, 20) : '', at: Number.isFinite(saved.at) ? saved.at : 0 }
      : null;
  } catch {
    return null;
  }
}
export function saveUndo({ code, from }, storage = globalThis.localStorage, now = Date.now) {
  try { storage?.setItem(UNDO_KEY, JSON.stringify({ code, from, at: now() })); return true; } catch { return false; }
}
export function clearUndo(storage = globalThis.localStorage) {
  try { storage?.removeItem(UNDO_KEY); } catch { /* private window */ }
}

/**
 * Apply a copied settings code, keeping the settings it replaces so undoImportedSettings can
 * put them back. Returns false (and changes nothing) for a code that does not decode.
 */
export function applyImportedSettings({ code, from = '' }, storage = globalThis.localStorage) {
  if (!decodeSettingsCode(code)) return false;
  const before = encodeSettingsCode();
  if (!applySettingsCode(code)) return false;
  saveUndo({ code: before, from }, storage);
  return true;
}

/** Put back the settings from before the last import, exactly (saved HUD layouts included). Returns the undo record, or null when there was nothing to undo. */
export function undoImportedSettings(storage = globalThis.localStorage) {
  const undo = readUndo(storage);
  if (!undo || !applySettingsCode(undo.code, { replaceLayouts: true })) return null;
  clearUndo(storage);
  return undo;
}
