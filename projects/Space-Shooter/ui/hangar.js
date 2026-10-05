import { getEquippedAppearance } from '../systems/shipAppearance.js';
import { SHIP_STYLES } from '../systems/shipLivery.js';

import { initWeeklyTicker } from './weeklyTicker.js';

let initialized = false;
export function initHangar({ studio = false } = {}) {
  if (initialized) return;
  initialized = true;
  if (!studio) initWeeklyTicker();
  document.getElementById('hangar-garage-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new Event('stardust:open-garage'));
  });
  function paintShip() {
    const ship = getEquippedAppearance();
    const name = SHIP_STYLES.find(style => style.id === ship?.family)?.name || 'Custom ship';
    document.getElementById('hangar-equipped-name').textContent = ship ? name : 'Standard Courier';
    document.getElementById('hangar-equipped-note').textContent = ship
      ? 'Your build’s stats and hitbox · shared ranked boards.'
      : 'Ready to fly. Customize whenever you like.';
  }
  window.addEventListener('stardust:appearance-changed', paintShip);
  // Saved ships load asynchronously; their image updates when the parts are ready.
  const image = document.querySelector('#hangar-ship img');
  if (image) new MutationObserver(paintShip).observe(image, { attributes: true, attributeFilter: ['src'] });
  paintShip();
}
