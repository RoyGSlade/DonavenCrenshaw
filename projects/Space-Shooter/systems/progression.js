// Local discoveries are separate from future server-verified achievements.
export const SEAL_DURATION_MS = 120000;
export const GLYPHS = Object.freeze([
  { id: 'blue', symbol: '△', label: 'Horizon', clue: 'First, the Horizon watched our departure.' },
  { id: 'green', symbol: '✦', label: 'Fallen star', clue: 'Second, we followed the Fallen star.' },
  { id: 'pink', symbol: '⌂', label: 'Home', clue: 'Third, we looked back toward Home.' },
  { id: 'purple', symbol: '◯', label: 'Shadow', clue: 'Last, we entered the Shadow.' },
]);
const RETURN_ORDER = ['purple', 'pink', 'green', 'blue'];
const STORAGE_KEY = 'stardust.discoveries.v1';

export function createSeal(now = Date.now()) {
  return { id: `seal-${now}`, deadline: now + SEAL_DURATION_MS, status: 'active', choices: [], attempts: 0 };
}
export function sealRemaining(seal, now = Date.now()) {
  return Math.max(0, (seal?.deadline ?? now) - now);
}
export function submitSeal(seal, choices, now = Date.now()) {
  if (!seal || seal.status !== 'active') return { ok: false, reason: 'inactive' };
  if (sealRemaining(seal, now) <= 0) {
    seal.status = 'expired';
    return { ok: false, reason: 'expired' };
  }
  if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4 || choices.some(id => !GLYPHS.some(g => g.id === id))) return { ok: false, reason: 'incomplete' };
  seal.attempts++;
  if (choices.some((id, i) => id !== RETURN_ORDER[i])) return { ok: false, reason: 'order' };
  seal.status = 'solved';
  return { ok: true, achievement: 'Stardust Remembers', local: true };
}
function defaultStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}
export function readDiscoveries(storage = defaultStorage()) {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}
export function recordDiscovery(id, storage = defaultStorage()) {
  const discoveries = readDiscoveries(storage);
  discoveries[id] = Date.now();
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(discoveries)); return Boolean(storage); }
  catch { return false; }
}
