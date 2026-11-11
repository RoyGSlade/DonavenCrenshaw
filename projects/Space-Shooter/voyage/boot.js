// The new game's hangar page. Closed unless the switch is on or this tab was
// opened with ?newgame=1 (voyage/flag.js).
//
// Round 2: the hangar is a place. The scene (hangarScene.js) draws the floor
// and its stations; hangarPlace.js opens a station in place; hangar.js draws
// what each station shows. A new captain signs the licence with real dice
// (ui/licence.js). Lines from the story director play in the dialogue box
// (ui/dialogue.js) with their voice files (ui/audio.js), over the hangar's
// ambience once the player has touched the page.
import { runtimeConfig } from '../runtime-config.js';
import { initCourierAppearance, getCourierAppearance, getEquippedAppearance, SHIP_STYLES } from '../systems/shipAppearance.js';
import { equippedBuild } from '../systems/shipBuild.js';
import { newGameFlag } from './flag.js';
import { createVoyageStore } from './store.js';
import { startVoyageSync } from './live.js';
import { createHangar } from './hangar.js';
import { createHangarScene } from './hangarScene.js';
import { createHangarPlace } from './hangarPlace.js';
import { provideHangar } from './hangarApi.js';
import { bus, tutorialOn } from './hangarLinks.js';
import { createCrew } from './crew.js';
import { createJobs } from './jobs.js';
import { shipTierArt } from './art.js';
import { HANGAR_ART, ambienceFor } from './ui/assets.js';
import { createHangarAudio } from './ui/audio.js';
import { createDialogueBox } from './ui/dialogue.js';
import { createLicence } from './ui/licence.js';
import { createSettings } from './ui/settings.js';
import { createAttemptRoller } from './ui/attemptRoll.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);

if (!flag.enabled) {
  $('vy-closed').hidden = false;
} else {
  $('vy-hangar').hidden = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => reducedMotion.matches;

  const toastNode = $('vy-toast');
  let toastTimer = 0;
  const toast = (text) => {
    toastNode.textContent = text;
    toastNode.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3400);
  };
  bus.on('hangar:toast', (d) => d?.text && toast(String(d.text)));

  const store = createVoyageStore();
  const chip = $('vy-sync');
  const { recorder, ready } = startVoyageSync(store, {
    onStatus: (status, text) => { chip.textContent = text; chip.dataset.status = status; },
  });
  if (!store.stored) chip.textContent = 'This browser is not keeping saves';

  // Sound: nothing plays until the player touches the page.
  const audio = createHangarAudio();
  const amb = ambienceFor('hangar');
  if (amb) audio.setAmbience(amb.url, amb.gain);
  const unlock = () => { if (audio.unlock()) { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); } };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
  createSettings({ root: $('hg-settings'), button: $('hg-settings-btn'), audio, toast });
  createDialogueBox({ root: $('hg-dialogue'), bus, audio, reducedMotion: still });
  // Every check in play is its own roll; the corner die shows it (the rules already decided the number).
  createAttemptRoller({ root: $('hg-attempt'), bus, reducedMotion: still });
  // The director's sound and juice hooks: a soft chime (no file; muted with the rest).
  bus.on('story:cue', (d) => audio.cue?.(d?.cue));
  bus.on('story:unlock', (d) => { if (d?.name) toast(`Open now: ${d.name}`); });

  let place = null;
  const scene = createHangarScene($('voyage-scene'), {
    reducedMotion: still,
    art: HANGAR_ART,
    onStation: (id) => place?.openStation(id, { via: 'click' }),
    onFrame: () => place?.place(),
  });

  const shipName = () => {
    const a = getEquippedAppearance();
    return a ? SHIP_STYLES.find((s) => s.id === a.family)?.name || 'Custom ship' : 'Standard Courier';
  };
  const panes = { ship: $('pane-ship'), jobs: $('pane-jobs'), captain: $('pane-captain'), ledger: $('pane-ledger'), crew: $('pane-crew'), station: $('pane-station'), mount: $('pane-mount') };

  // The crew seat (P11): a friend aboard as crew, through a crew room on the relay. It lives at the hatch.
  const crewLink = (code) => {
    const url = new URL(location.pathname, location.origin);
    if (!runtimeConfig.newGame) url.searchParams.set('newgame', '1');
    url.searchParams.set('crew', code);
    return url.href;
  };
  const linkedCrew = (new URLSearchParams(location.search).get('crew') || '').trim().toUpperCase();
  const crew = createCrew({
    pane: panes.crew, recorder, store, toast,
    say: (events) => hangar.say(events),
    inviteLink: crewLink,
    onAboard: () => place?.openStation('hatch', { via: 'refresh', view: 'crew' }),
    reducedMotion: still,
    joinCode: linkedCrew || null,
  });

  // The ship on the pad. Tier 0 with a custom garage ship shows that ship; the
  // standard ship and every upgraded tier show the tier art (voyage/art.js).
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

  const licence = createLicence({
    root: $('hg-licence'), store, bus, toast, reducedMotion: still, dev: flag.dev,
    onSigned: () => { licence.close(); place?.openStation('quarters', { via: 'click' }); },
  });

  const hangar = createHangar({
    panes: { ...panes, dev: $('vy-dev') }, store, toast, dev: flag.dev, crew, bus,
    ship: { name: shipName, build: () => equippedBuild() },
    onTier: (n) => { scene.setTier(n); if (n !== tier) { tier = n; showShip(); } },
    tutorialOn,
    reducedMotion: still,
    openLicence: () => licence.open(),
  });
  showShip();
  initCourierAppearance().then(() => {
    custom = getCourierAppearance() || null;
    showShip();
    hangar.render();
  }).catch((error) => console.warn('Stardust: the equipped ship could not load', error));

  const jobs = createJobs({
    pane: panes.jobs, store, toast, dev: flag.dev,
    say: (events) => hangar.say(events),
    onCaptain: () => licence.open(),
    crew: crew.hooks,
  });
  crew.attach(jobs);

  place = createHangarPlace({
    scene, store, bus,
    layer: $('hg-spots'),
    sheet: { root: $('hg-sheet'), title: $('hg-sheet-title'), who: $('hg-sheet-who'), close: $('hg-sheet-close'), tabs: $('hg-sheet-tabs') },
    panes,
    renderStation: (station, state, pane, view) => hangar.renderStation(station, state, pane, view),
    reducedMotion: still,
    onOpen: (station, pane) => { if (pane === 'crew') crew.refresh(); },
  });
  provideHangar(place);
  place.place();

  // The director's objective, as a banner over the hangar.
  const objective = $('hg-objective');
  bus.on('story:objective', (o) => {
    objective.hidden = !o?.text;
    objective.querySelector('span').textContent = o?.text || '';
  });

  // Quest keys (1-9 for choices, F/E/H/B in fights, Enter, Backspace) while the job board is open.
  addEventListener('keydown', (e) => { if (!panes.jobs.hidden && !$('hg-sheet').hidden) jobs.keydown(e); });
  // Crew station keys while the crew view is open.
  addEventListener('keydown', (e) => { if (!panes.crew.hidden && !$('hg-sheet').hidden) crew.keydown(e); });
  addEventListener('keyup', (e) => { if (!panes.crew.hidden && !$('hg-sheet').hidden) crew.keyup(e); });

  crew.render();
  ready.then(() => crew.refresh());

  // Where to start: the licence for a new player (after the story's intro, when
  // the director is running), a job or crew in progress where it left off.
  bus.on('story:step', (d) => { if (d?.id === 'create' && !store.get().character) licence.open(); });
  const step = store.get().story?.step;
  if (!store.get().character && (!step || step === 'create')) licence.open();
  else if (crew.pending) place.openStation('hatch', { via: 'refresh', view: 'crew' });
  else if (jobs.playing) place.openStation('board', { via: 'refresh' });
}
