import { state } from '../state.js';
import { toast } from '../ui/hud.js';
import { enterArena } from './modeManager.js';
import { pauseTimer } from './modes/roadmap.js';
import { isBacksideArenaEntry } from './rules.js';
import { runtimeConfig } from '../runtime-config.js';
import { createSeal, recordDiscovery, submitSeal } from '../systems/progression.js';

let activeSeal = null;
export async function requestArenaEnterFromBack() {
  const gate = state.run?.current?.nodes.find(n => n.kind === 'gate');
  if (runtimeConfig.bossFight === false) return { ok: false, reason: 'disabled' };
  if (state.mode === 'arena' || !gate || !isBacksideArenaEntry(gate)) return { ok: false };
  activeSeal = null;
  recordDiscovery('Where Gates Should Not Lead');
  pauseTimer();
  state.ui.showMinimap = false;
  toast('Something answers from the other side.', 3000);
  enterArena();
  return { ok: true, local: true };
}
export async function recordArenaVictory() {
  const arena = state.arena;
  if (!arena?.hasEncryptedShard || arena.boss?.state !== 'dead') return { ok: false };
  recordDiscovery('The Warden Falls');
  activeSeal ||= createSeal();
  return { ok: true, local: true, seal: activeSeal };
}
export async function recordArenaDefeat() {
  activeSeal = null;
  return { ok: true, local: true, locked: false };
}
export async function fetchLatestEncryptedShard() {
  return activeSeal ? { ok: true, local: true, seal: activeSeal } : { ok: false };
}
export async function decryptShard(id, answer) {
  if (!activeSeal || activeSeal.id !== id) return { ok: false, reason: 'inactive' };
  const result = submitSeal(activeSeal, answer);
  if (result.ok) result.persisted = recordDiscovery(result.achievement);
  return result;
}
export function abandonSeal() { activeSeal = null; }
