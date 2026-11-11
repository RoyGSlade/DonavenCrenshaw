// The new game's hangar page. Closed unless the switch is on or this tab was
// opened with ?newgame=1 (voyage/flag.js).
import { runtimeConfig } from '../runtime-config.js';
import { initCourierAppearance, getCourierAppearance, getEquippedAppearance, SHIP_STYLES } from '../systems/shipAppearance.js';
import { equippedBuild } from '../systems/shipBuild.js';
import { newGameFlag } from './flag.js';
import { createVoyageStore } from './store.js';
import { startVoyageSync } from './live.js';
import { createHangar } from './hangar.js';
import { createHangarScene } from './scene.js';
import { createCrew } from './crew.js';
import { createJobs } from './jobs.js';
import { shipTierArt } from './art.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
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
  // The crew seat (P11): a friend aboard as crew, through a crew room on the relay.
  const crewLink = (code) => {
    const url = new URL(location.pathname, location.origin);
    if (!runtimeConfig.newGame) url.searchParams.set('newgame', '1');
    url.searchParams.set('crew', code);
    return url.href;
  };
  const linkedCrew = (new URLSearchParams(location.search).get('crew') || '').trim().toUpperCase();
  const crew = createCrew({
    pane: $('pane-crew'), recorder, store, toast,
    say: (events) => hangar.say(events),
    inviteLink: crewLink,
    onAboard: () => select($('tab-crew')),
    reducedMotion: () => reducedMotion.matches,
    joinCode: linkedCrew || null,
  });
  // The ship on the pad. Tier 0 with a custom garage ship shows that ship; the
  // standard ship and every upgraded tier show the tier art (voyage/art.js,
  // Mk I to Mk IV, drawn on one shared canvas so the ship grows tier by tier).
  const TIER_ART_SCALE = 1.4; // the tier art's canvas has more margin than a garage picture
  const tierImages = new Map();
  let tier = 0;
  let custom = null;
  const showShip = () => {
    if (tier === 0 && custom) { scene.setShip(custom); return; }
    let image = tierImages.get(tier);
    if (!image) {
      image = new Image();
      image.dataset.tier = String(tier);
      image.onload = () => showShip();
      image.src = shipTierArt(tier);
      tierImages.set(tier, image);
    }
    if (image.complete && image.naturalWidth) scene.setShip(image, TIER_ART_SCALE);
  };

  const hangar = createHangar({
    panes, store, toast, dev: flag.dev, crew,
    ship: { name: shipName, build: () => equippedBuild() },
    onTier: (n) => { scene.setTier(n); if (n !== tier) { tier = n; showShip(); } },
  });
  showShip();
  initCourierAppearance().then(() => {
    custom = getCourierAppearance() || null;
    showShip();
    hangar.render();
  }).catch((error) => console.warn('Stardust: the equipped ship could not load', error));

  const jobs = createJobs({
    pane: $('pane-jobs'), store, toast, dev: flag.dev,
    say: (events) => hangar.say(events),
    onCaptain: () => select($('tab-captain')),
    crew: crew.hooks,
  });
  crew.attach(jobs);
  // Quest keys (1-9 for choices, F/E/H/B in fights, Enter, Backspace) while the Jobs tab is open.
  addEventListener('keydown', (e) => { if (!$('pane-jobs').hidden) jobs.keydown(e); });
  // Crew station keys (Space fires the turret, arrows aim, hold R to repair) while the Crew tab is open.
  addEventListener('keydown', (e) => { if (!$('pane-crew').hidden) crew.keydown(e); });
  addEventListener('keyup', (e) => { if (!$('pane-crew').hidden) crew.keyup(e); });

  crew.render();
  ready.then(() => crew.refresh());

  // Tabs: arrow keys move between them, as the ARIA tab pattern asks.
  const tabs = [...document.querySelectorAll('.vy-tabs [role=tab]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (tab.id === 'tab-crew') crew.refresh();
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
  else if (crew.pending) select($('tab-crew'));
  else if (jobs.playing) select($('tab-jobs'));
}
