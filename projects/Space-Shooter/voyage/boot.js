// The new game's hangar page. Closed unless the switch is on or this tab was
// opened with ?voyage=on (voyage/flag.js).
import { runtimeConfig } from '../runtime-config.js';
import { initCourierAppearance, getCourierAppearance, getEquippedAppearance, SHIP_STYLES } from '../systems/shipAppearance.js';
import { equippedBuild } from '../systems/shipBuild.js';
import { voyageFlag } from './flag.js';
import { createVoyageStore } from './store.js';
import { startVoyageSync } from './live.js';
import { createHangar } from './hangar.js';
import { createHangarScene } from './scene.js';
import { createCrew } from './crew.js';

const flag = voyageFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);

if (!flag.enabled) {
  $('vy-closed').hidden = false;
} else {
  $('vy-hangar').hidden = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = createHangarScene($('voyage-scene'), { reducedMotion: () => reducedMotion.matches });

  const toastNode = $('vy-toast');
  let toastTimer = 0;
  const toast = (text) => {
    toastNode.textContent = text;
    toastNode.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3200);
  };

  const store = createVoyageStore();
  const chip = $('vy-sync');
  const { recorder, ready } = startVoyageSync(store, {
    onStatus: (status, text) => { chip.textContent = text; chip.dataset.status = status; },
  });
  if (!store.stored) chip.textContent = 'This browser is not keeping saves';

  const shipName = () => {
    const a = getEquippedAppearance();
    return a ? SHIP_STYLES.find((s) => s.id === a.family)?.name || 'Custom ship' : 'Standard Courier';
  };
  const panes = { ship: $('pane-ship'), captain: $('pane-captain'), ledger: $('pane-ledger'), crew: $('pane-crew'), dev: $('vy-dev') };
  const crew = createCrew({ recorder, captain: () => store.get().character?.name || null });
  const hangar = createHangar({
    panes, store, toast, dev: flag.dev, crew,
    ship: { name: shipName, build: () => equippedBuild() },
    onTier: (n) => scene.setTier(n),
  });

  // The equipped garage ship on the pad; the standard ship's picture until it loads.
  const standard = new Image();
  standard.onload = () => { if (!getCourierAppearance()) scene.setShip(standard); };
  standard.src = '../art/player-ship.png';
  initCourierAppearance().then(() => {
    const c = getCourierAppearance();
    if (c) scene.setShip(c);
    hangar.render();
  }).catch((error) => console.warn('Stardust: the equipped ship could not load', error));

  ready.then(() => crew.refresh(panes.crew));

  // Tabs: arrow keys move between them, as the ARIA tab pattern asks.
  const tabs = [...document.querySelectorAll('.vy-tabs [role=tab]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (tab.id === 'tab-crew') crew.refresh(panes.crew);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
  if (!store.get().character) select($('tab-captain'));
}
