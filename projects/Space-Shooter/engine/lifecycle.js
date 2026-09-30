// src/roadmap/engine/lifecycle.js
import { state } from '../state.js';
import { planIntro } from '../ui/raceIntro.js';

/**
 * Contains shared lifecycle functions used across modes and the manager,
 * preventing circular dependencies.
 *
 * The countdown is now the race intro (ui/raceIntro.js): READY / SET / GO over
 * `seconds`, preceded the first time on a track by a flythrough, which only
 * lengthens the wait on the grid. The ship stays locked until it ends.
 */
export function startCountdown(seconds, sceneState) {
  if (!sceneState) return;
  sceneState.intro = planIntro(sceneState, seconds);
  sceneState.countdownT = sceneState.intro.total;
  state.ui.countdownActive = true;
  sceneState.lockedInStart = true;
  sceneState.launched = false;
  // This is a property of roadmap mode, so check for its existence.
  if ('timerRunning' in sceneState) {
    sceneState.timerRunning = false;
  }
}
