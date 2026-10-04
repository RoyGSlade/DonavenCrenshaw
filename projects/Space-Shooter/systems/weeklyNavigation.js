import { weeklyAccess } from './weeklyAccess.js';

/** Refresh at the boundary even when the hangar has been left open for hours. */
export function initWeeklyNavigation() {
  const network = document.querySelector('.network-card');
  const dogfight = document.querySelector('.dogfight-card');
  const custom = document.getElementById('custom-track-card');
  const notice = document.getElementById('weekly-controls-notice');
  function paint() {
    if (network && weeklyAccess('full') !== 'open') {
      document.getElementById('network-title').textContent = 'Legacy circuits / retired';
      document.getElementById('starmap-start-btn').disabled = true;
      document.getElementById('starmap-start-btn').textContent = 'Retired - records preserved';
      network.querySelector('p').textContent = 'These five circuits are retired. Historical times and ghosts remain on the leaderboard.';
      network.querySelector('.launch-hint').textContent = 'Your saved runs and account history are preserved.';
    }
    if (dogfight) dogfight.hidden = weeklyAccess('dogfight') !== 'open';
    if (custom && weeklyAccess('custom-track') !== 'open') custom.hidden = true;
    if (notice) notice.hidden = !globalThis.matchMedia?.('(any-pointer: coarse)').matches && !(navigator.maxTouchPoints > 0);
  }
  paint();
  const timer = setInterval(paint, 1000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
