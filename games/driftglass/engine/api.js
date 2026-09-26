// src/roadmap/engine/api.js
// LOCAL-ONLY stubs — no server calls. All game logic runs client-side.
import { state } from '../state.js';
import { toast } from '../ui/hud.js';
import { enterArena } from './modeManager.js';
import { pauseTimer } from './modes/roadmap.js';

/** Local arena entry — no server prereq check. */
export async function requestArenaEnterFromBack() {
  if (state.mode === 'arena') return;
  pauseTimer();
  state.ui.showMinimap = false;
  toast('The Secret Altar accepts your challenge...', 3000);
  enterArena();
}

/** Local stub — victory is recorded in-memory only. */
export async function recordArenaVictory() {
  return { ok: true };
}

/** Local stub — no lockout timer. */
export async function recordArenaDefeat() {
  return { ok: true, locked: false };
}

/** Local stub — no encrypted shard system in demo. */
export async function fetchLatestEncryptedShard() {
  return { ok: false };
}

/** Local stub — no shard decryption in demo. */
export async function decryptShard(id, answer) {
  return { ok: false };
}