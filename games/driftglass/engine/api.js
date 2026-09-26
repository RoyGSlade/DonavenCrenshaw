// Connection between Driftglass and the hub at api.donavencrenshaw.com.
//
// For now every run is a guest run and nothing leaves the browser. Saved times,
// the arena and what follows it need a signed-in player, which comes with
// accounts. Until then this module only decides what a guest is told.
import { toast } from '../ui/hud.js';

export const HUB_ORIGIN = 'https://api.donavencrenshaw.com';

export function isSignedIn() {
  return false;
}

let lastNudgeAt = 0;

/** Called while the player is somewhere only signed-in players may pass. */
export async function requestArenaEnterFromBack() {
  if (isSignedIn()) return;
  const now = performance.now();
  if (now - lastNudgeAt < 4000) return;
  lastNudgeAt = now;
  toast('Something answers, but not to guests.', 3600);
}

export async function recordArenaVictory() {
  return { ok: false, reason: 'guest' };
}

export async function recordArenaDefeat() {
  return { ok: false, reason: 'guest', locked: false };
}
