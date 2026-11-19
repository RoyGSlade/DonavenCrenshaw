// The new game's hangar page. Closed unless the switch is on or this tab was
// opened with ?newgame=1 (voyage/flag.js).
//
// Round 2, one game: you walk the hangar floor (the on-foot layer, onfoot/*)
// and every station opens in place as a panel (hangarPlace.js, hangar.js).
// The story director (story/*) runs the intro, the captain's licence with the
// physical dice (ui/licence.js) and the tutorial; its lines play in the
// dialogue box (ui/dialogue.js) with their voice files (ui/audio.js) over the
// hangar's ambience. Other lanes plug in through hangarApi: the shops
// (content), the race circuits and arena (races), and the space hops to the
// quest givers (explore), all from the launch hatch.
//
// Studio play links (STUDIO-SCHEMA.md section 5): ?step=<tutorial step>,
// ?quest=<id>[&node=<dialogue node>][&seed=n], ?map=<id>[&spawn=<name>],
// ?explore=<place>, and studio=1. Any of them plays on a throwaway save
// (its own storage key, never synced to the account), so a playtest never
// touches a real captain.
import { runtimeConfig } from '../runtime-config.js';
import { initCourierAppearance, getCourierAppearance, getEquippedAppearance, SHIP_STYLES } from '../systems/shipAppearance.js';
import { equippedBuild } from '../systems/shipBuild.js';
import { createRunRecorder } from '../systems/hubRuns.js';
import { newGameFlag } from './flag.js';
import { createVoyageStore } from './store.js';
import { startVoyageSync } from './live.js';
import { serverMode, probeSession, showMaintenance } from './session.js';
import { economy } from './account.js';
import { createSkillSave } from './skillSave.js';
import { createHangar } from './hangar.js';
import { createHangarPlace } from './hangarPlace.js';
import { provideHangar, hangarApi, addLaunch } from './hangarApi.js';
import { bus, tutorialOn, isUnlocked } from './hangarLinks.js';
import { createCrew } from './crew.js';
import { createJobs } from './jobs.js';
import { shipTierArt } from './art.js';
import { ambienceFor } from './ui/assets.js';
import { createHangarAudio } from './ui/audio.js';
import { createDialogueBox } from './ui/dialogue.js';
import { createLicence } from './ui/licence.js';
import { createSettings } from './ui/settings.js';
import { createAttemptRoller } from './ui/attemptRoll.js';
import { mountStory } from './story/mount.js';
import { storyOf, currentStep } from './story/progress.js';
import { STEP_IDS, STEPS } from './story/tutorial.js';
import { addLines, lineById } from './story/lines.js';
import { contentLines } from './quests/lines.js';
import { voiceUrl, scratchReady } from './story/voice.js';
import { QUESTS } from './quests/data/quests/index.js';
import { registerShops } from './shops/ui.js';
import { registerRaceLaunches } from './races/hangarLaunches.js';
import { createOnFoot, TARGETS_IN_ORDER } from './onfoot/onfoot.js';
import { setCaptainLook, setJanitorPlayer } from './onfoot/assets.js';
import { PLACES } from './explore/rules.js';
import { MAP_DEFS } from './maps/index.js';
// Round 3 basics: the bag and datapad, the quest tracker, the controls card and the pause sheet.
import { createDatapad } from './datapad/datapad.js';
import { createTracker } from './datapad/tracker.js';
import { createControlsCard, createPause } from './datapad/controls.js';
import { isTouchDevice } from './onfoot/input.js';
import { stationById } from './hangarStations.js';
import { createJobTalk } from './datapad/jobTalk.js';
import { createJobCard } from './datapad/jobCard.js';
import { offersAt, openCount } from './quests/offers.js';
import { OFFERS_DATA } from './quests/data/offers.js';
// Launch slice: the opening on the Tin Duchess (slice/director.js).
import { wantsSlice, startSlice, startRoom, createSliceDirector } from './slice/director.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
// The tutorial step each on-foot lesson belongs to (contract section 4).
const LESSON_STEP = Object.freeze({ mine: 'mine', range: 'shoot', puzzle: 'puzzle' });
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

if (!flag.enabled) {
  $('vy-closed').hidden = false;
} else {
  // Scratch voices (dev server only, ?voice=scratch) load their list first; otherwise this is instant.
  scratchReady.catch(() => 0).then(() => gate()).then((session) => boot(session));
}

// The session gate (launch tech lane, outcome 2): with the home server mode on, no
// run starts while the hub is down; a maintenance screen waits for it instead.
// Studio play links (throwaway saves) and server mode off play as they always have.
async function gate() {
  const linked = params.get('studio') === '1' || ['step', 'quest', 'map', 'explore'].some((k) => params.get(k));
  if (linked || !serverMode({ config: runtimeConfig, search: location.search })) return { mode: 'local' };
  const recorder = createRunRecorder();
  const probe = async () => { await recorder.connect(); return probeSession({ api: recorder.api, gamePath: recorder.gamePath, signedIn: Boolean(recorder.player) }); };
  const first = await probe();
  if (first.mode !== 'maintenance') return { ...first, recorder };
  const chip = $('vy-sync');
  chip.textContent = 'Guild bank offline';
  chip.dataset.status = 'offline';
  return new Promise((resolve) => {
    showMaintenance($('vy-maint'), {
      reason: first.reason,
      classicHref: '../?activity=classic',
      onRetry: async () => { const next = await probe(); if (next.mode !== 'maintenance') resolve({ ...next, recorder }); return next; },
    });
  });
}

function boot(session = { mode: 'local' }) {
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

  // --- The save: the real one, or a throwaway one for Studio play links ---
  const link = {
    step: STEP_IDS.includes(params.get('step')) ? params.get('step') : null,
    quest: QUESTS[params.get('quest')] ? params.get('quest') : null,
    node: params.get('node') || null,
    seed: Number.parseInt(params.get('seed'), 10) || 1,
    map: MAP_DEFS[params.get('map')] ? params.get('map') : null,
    spawn: params.get('spawn') || 'default',
    explore: PLACES[params.get('explore')] && params.get('explore') !== 'home' ? params.get('explore') : null,
  };
  const throwaway = params.get('studio') === '1' || Boolean(link.step || link.quest || link.map || link.explore);
  const store = createVoyageStore(throwaway ? { key: 'studio.stardust.voyage.v1' } : {});
  if (link.step || link.quest) store.reset();
  // A linked step after the licence, a quest, a map or a hop needs a captain to play with.
  const afterCreate = link.step && STEP_IDS.indexOf(link.step) > STEP_IDS.indexOf('create');
  if (throwaway && !store.get().character && (afterCreate || link.quest || link.map || link.explore)) {
    store.createCharacter({ name: 'Studio Captain', look: { portrait: 'p1', color: '#81e6df' } });
  }
  // A quest, map or hop link plays with the tutorial out of the way.
  if (throwaway && !link.step && (link.quest || link.map || link.explore) && !storyOf(store.get()).finished) {
    store.update((s) => ({ ...s, story: { ...storyOf(s), step: null, finished: true, skipped: true } }));
  }

  // Launch slice: a fresh save opened with ?newgame=1 starts as the janitor on the Tin Duchess (?start=hangar keeps the hangar start).
  const slicing = wantsSlice({ save: store.get(), params, throwaway, newGame: flag.enabled });
  if (slicing) startSlice(store);
  setJanitorPlayer(slicing); // the new game's player is the janitor; today's game and ?start=hangar keep the pilot
  let slice = null;

  const chip = $('vy-sync');
  let recorder;
  let ready;
  if (throwaway) {
    recorder = createRunRecorder();
    ready = Promise.resolve();
    chip.textContent = 'Studio playtest: a throwaway save';
    chip.dataset.status = 'studio';
  } else {
    ({ recorder, ready } = startVoyageSync(store, {
      onStatus: (status, text) => { chip.textContent = text; chip.dataset.status = status; },
    }));
    if (!store.stored) chip.textContent = 'This browser is not keeping saves';
  }
  // Server mode: the hub owns the money (voyage/account.js). A guest plays a demo that pays nothing real.
  if (!throwaway && session.mode === 'play') {
    economy.enable({ api: recorder.api, gamePath: recorder.gamePath, store, toast });
    ready.then(() => economy.pull()).catch(() => {});
    // Tutorial step rewards are hub claims (rules.json "voyage".claims, once each).
    const paysReal = (id) => { const r = STEPS.find((st) => st.id === id)?.reward; return Boolean(r?.money || Object.keys(r?.items || {}).length); };
    bus.on('story:reward', (d) => { for (const step of d?.steps || []) if (paysReal(step)) economy.claim(`tutorial:${step}`); });
  } else if (!throwaway && session.mode === 'guest') {
    const tag = document.createElement('span');
    tag.className = 'vy-guest';
    tag.textContent = 'Guest demo: sign in to keep progress';
    chip.after(tag);
  }

  // --- Sound: nothing plays until the player touches the page ---
  const audio = createHangarAudio();
  const BED_FOR = { workshop: 'workshop', den: 'den', cantina: 'den' };
  const setBed = (ambient) => {
    const amb = ambienceFor(BED_FOR[ambient] || 'hangar');
    if (amb) audio.setAmbience(amb.url, amb.gain);
  };
  setBed('hangar');
  const unlock = () => { if (audio.unlock()) { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); } };
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
  const settings = createSettings({ root: $('hg-settings'), button: $('hg-settings-btn'), audio, toast });
  const touch = isTouchDevice();
  document.body.classList.toggle('is-touch', touch);
  const dialogueBox = createDialogueBox({ root: $('hg-dialogue'), bus, audio, reducedMotion: still });
  // Every attempt in play is its own d20 roll; the corner d20 shows it (the rules already decided the number).
  createAttemptRoller({ root: $('hg-attempt'), bus, reducedMotion: still });
  // The director's sound and juice hooks: a soft chime (no file; muted with the rest).
  bus.on('story:cue', (d) => audio.cue?.(d?.cue));
  bus.on('story:unlock', (d) => { if (d?.name) toast(`Open now: ${d.name}`); });

  // Quest lines (content lane) join story's lines, so say(id) and the voice map know them.
  try { addLines(contentLines()); } catch (error) { console.warn('Stardust: quest lines could not be added', error); }

  // --- The floor: the walkable hangar (and every room and place beyond it) ---
  const floor = $('hg-floor');
  let place = null;
  let onfoot = null;
  let sheetOpen = false;
  const overlays = new Set(); // 'intro', 'licence', 'pad', 'pause', 'nap': the floor holds still under them
  const holdFloor = () => {
    if (!onfoot) return;
    if (sheetOpen || place?.current || overlays.size) onfoot.world.pause();
    else if (!flying) onfoot.world.resume();
  };
  let flying = false;
  let pad = null; // the datapad (round 3), made once the floor exists
  let tracker = null; // the quest tracker (round 3)

  // Where a station stands on screen, from the hangar map's rings (props, doors, zones, npcs tagged with it).
  const stationScreen = (id) => {
    const w = onfoot?.world;
    if (!w || w.map?.id !== 'hangar' || flying || w.mode !== 'walk' || floor.querySelector('.of-panel, .of-overlay, .of-talk')) return null;
    const ring = w.map.rings.find((r) => r.station === id);
    if (!ring) return null;
    const x = ring.rect ? ring.rect.x + ring.rect.w / 2 : ring.x;
    const y = ring.rect ? ring.rect.y : ring.y - (ring.r || w.map.tile) * 0.55;
    const p = w.screenOf(x, y);
    const box = floor.getBoundingClientRect();
    const sx = box.left + p.x;
    const sy = box.top + p.y;
    if (sx < 8 || sy < 96 || sx > innerWidth - 8 || sy > innerHeight - 8) return null;
    return { x: sx, y: sy };
  };
  // A station's name, prompt words and whether it is open yet (the interact marks, prompt and map).
  const stationInfo = (id) => {
    const s = stationById(id);
    if (!s) return null;
    return { name: s.name, prompt: s.prompt || null, who: s.who, locked: Boolean(s.unlock) && !isUnlocked(store.get(), s.unlock) };
  };
  // The header names the place you are in (round 3: it said "The Hangar" everywhere).
  const wordmark = document.querySelector('.vy-wordmark');
  const setPlaceName = (name) => {
    const b = document.createElement('b');
    b.textContent = '/';
    wordmark.replaceChildren('STARDUST', b, String(name || '').toUpperCase());
    document.title = `${name} · Stardust`;
  };
  const placeNameFor = (map) => {
    const docked = Object.values(PLACES).find((p) => p.map === map.id);
    if (docked && docked.id !== 'home') return `${docked.name} · ${map.name}`;
    if (map.id === 'ship' && onfoot && onfoot.docked !== 'home') return `${map.name} · docked at ${PLACES[onfoot.docked]?.name || ''}`;
    return map.name;
  };

  // The scene contract hangarPlace.js needs, on top of the walkable floor.
  const floorScene = {
    stationScreen,
    sideFor: (id) => ((stationScreen(id)?.x ?? 0) < innerWidth / 2 ? 'right' : 'left'),
    toScreen: () => ({ x: -999, y: -999, scale: 1 }),
    setHover() {}, setStates() {}, focus() {},
  };

  // The ship on the pad (the hangar lane's tier art; a custom garage ship at tier 0).
  const shipName = () => {
    const a = getEquippedAppearance();
    return a ? SHIP_STYLES.find((s) => s.id === a.family)?.name || 'Custom ship' : 'Standard Courier';
  };
  const panes = { ship: $('pane-ship'), jobs: $('pane-jobs'), crew: $('pane-crew'), station: $('pane-station'), mount: $('pane-mount') };
  const { jobs: _jobPane, ...stationPanes } = panes;
  // Jobs open once the tutorial is done (story's 'jobs' unlock).
  const jobsOpen = () => !tutorialOn(store.get()) && isUnlocked(store.get(), 'jobs');
  const OFFERS_WORDS = OFFERS_DATA.words;

  // The crew seat (P11): a friend aboard as crew, through a crew room on the relay. It lives at the hatch.
  const crewLink = (code) => {
    const url = new URL(location.pathname, location.origin);
    if (!runtimeConfig.newGame) url.searchParams.set('newgame', '1');
    url.searchParams.set('crew', code);
    return url.href;
  };
  const linkedCrew = (params.get('crew') || '').trim().toUpperCase();
  const crew = createCrew({
    pane: panes.crew, recorder, store, toast,
    say: (events) => hangar.say(events),
    inviteLink: crewLink,
    onAboard: () => place?.openStation('hatch', { via: 'refresh', view: 'crew' }),
    reducedMotion: still,
    joinCode: linkedCrew || null,
  });
  // Server mode: the hub's AI crew tiers and wages (rules.json "voyage") replace the page's defaults.
  if (session.clock?.crewTiers) crew.hooks.setTiers(session.clock.crewTiers);

  // --- The captain's licence: a new captain, a death, an old captain meeting Strength ---
  const licence = createLicence({
    root: $('hg-licence'), store, bus, toast, reducedMotion: still, dev: flag.dev,
    onSigned: (character) => {
      licence.close();
      overlays.delete('licence'); holdFloor();
      setCaptainLook(character?.look?.portrait);
      // During the tutorial the director takes it from here (walk to Chibby); after it, the bunk.
      // After the tutorial the pad opens on the new captain; the controls card waits until it closes.
      if (!tutorialOn(store.get()) && pad?.open('captain')) return;
      maybeControls();
    },
  });
  const openLicence = () => {
    if (!$('hg-licence').hidden) return;
    overlays.add('licence'); holdFloor();
    licence.open();
  };
  const rollAgain = (opts) => {
    overlays.add('licence'); holdFloor();
    licence.rollOnly({ ...opts, done: (rolls) => { overlays.delete('licence'); holdFloor(); opts.done(rolls); } });
  };
  // Dying (Deadly jobs only) re-rolls the stats: through the dice, not behind the curtain.
  const realDie = store.die.bind(store);
  store.die = (...args) => {
    const lost = realDie(...args);
    if (lost != null) {
      rollAgain({
        eyebrow: 'BACK FROM THE DEAD · DRIFTWAKE REGISTRY',
        title: 'Chibby patched you together. Roll your new stats.',
        body: `You lost ${lost} skill point${lost === 1 ? '' : 's'}, your ship upgrades and your old stats. Your gear, your rep and your name stay.`,
        button: 'Back on my feet',
        done: (rolls) => store.update((s) => ({ ...s, character: { ...s.character, stats: { ...s.character.stats, ...rolls } } })),
      });
    }
    return lost;
  };
  // A captain from before Strength rolls it once (the director plays Chibby's line first).
  bus.on('story:roll-missing', (d) => {
    const stats = Array.isArray(d?.stats) ? d.stats : [];
    if (!stats.length || !store.get().character?.toRoll?.length) return;
    rollAgain({
      eyebrow: 'CHIBBY\'S CLIPBOARD',
      title: 'Chibby forgot your strength test',
      body: 'One roll, and it\'s yours for keeps. Everything else stays as it was.',
      button: 'Done',
      stats,
      done: (rolls) => {
        store.update((s) => {
          const { toRoll, ...c } = s.character;
          return { ...s, character: { ...c, stats: { ...c.stats, ...rolls } } };
        });
        if (lineById('chibby.roll.late-done')) story.speak('chibby.roll.late-done', { vars: { name: store.get().character?.name || '' } });
      },
    });
  });

  // --- What each station shows ---
  const hangar = createHangar({
    panes: { ...panes, dev: $('vy-dev') }, store, toast, dev: flag.dev, crew, bus,
    ship: { name: shipName, build: () => equippedBuild() },
    onTier: () => onfoot?.world.redraw(),
    tutorialOn,
    reducedMotion: still,
    openLicence,
    openPad: (page) => { place?.closeStation({ restoreFocus: false }); pad?.open(page); },
    onNap: (on) => { if (on) overlays.add('nap'); else overlays.delete('nap'); holdFloor(); },
    // The station buttons for the on-foot lessons run them right here on the floor.
    hooks: {
      mine: () => lesson({ kind: 'mine', id: 'scrap-seam', label: 'The seam Ralph dug up' }, () => onfoot.mine({ title: 'The seam Ralph dug up' })),
      range: () => lesson({ kind: 'range', id: 'range', label: 'Mel\'s range' }, () => onfoot.practice()),
      puzzle: () => lesson({ kind: 'puzzle', id: 'lockbox', label: 'Edna\'s lockbox' }, () => { onfoot.world.go('edna-den', 'from-hangar'); return onfoot.puzzle('lockbox'); }),
      // The board's postings; taking one closes the board and the job starts in the world.
      postings: (pane) => jobs.renderPostings(pane, (quest) => { place.closeStation({ restoreFocus: false }); jobs.take(quest); }),
    },
  });
  // A lesson from a station button: close the panel, then play it if the tutorial allows it now.
  function lesson(target, run) {
    place?.closeStation({ restoreFocus: false });
    if (!allowLesson(target)) return null;
    return run();
  }
  initCourierAppearance().then(() => {
    getCourierAppearance();
    hangar.render();
  }).catch((error) => console.warn('Stardust: the equipped ship could not load', error));

  // --- Jobs in the world (round 3): offers spoken where givers work, beats in the dialogue box ---
  const jobTalk = createJobTalk({
    bus, store,
    take: (quest) => jobs.take(quest),
    onBusy: (on) => { if (on) overlays.add('jobtalk'); else overlays.delete('jobtalk'); holdFloor(); tracker?.render(); },
    name: () => store.get().character?.name || '',
  });
  const jobCard = createJobCard({
    root: $('dp-jobcard'), later: $('dp-jobcard-later'), eyebrow: $('dp-jobcard-eyebrow'),
    title: () => jobs.title,
    onChange: (open) => { if (open) { overlays.add('jobcard'); dialogueBox.hide(); } else overlays.delete('jobcard'); holdFloor(); tracker?.render(); },
    onLater: () => toast(OFFERS_WORDS.paused),
  });
  let lastRoll = 0;
  const presenter = {
    // A beat waits for the dice of the step before it to land, then plays in the dialogue box.
    dialogue: (v, pick) => {
      const wait = Math.max(0, lastRoll + 1400 - Date.now());
      setTimeout(() => jobTalk.beat(v).then((i) => { if (i >= 0) pick(i); else if (i === -1) toast(OFFERS_WORDS.paused); }), wait);
    },
    card: (kind, v) => (slice && kind === 'end' && v ? slice.endCard(v, () => jobCard.show(kind)) : jobCard.show(kind)),
    // launch slice: a beat plays in its room, an on-foot fight runs on the Duchess's floor, a closed result card starts the next scene.
  };
  const playBeat = presenter.dialogue;
  presenter.dialogue = (v, pick) => (slice ? slice.beat(v, () => playBeat(v, pick)) : playBeat(v, pick));
  presenter.foot = (part, done) => (slice ? slice.fight(part, done) : done(null));
  presenter.exit = () => slice?.afterCard();
  const jobs = createJobs({
    pane: panes.jobs, store, toast, dev: flag.dev, presenter,
    say: (events) => hangar.say(events),
    onCaptain: openLicence,
    crew: crew.hooks,
    // A spoken node plays its voice file (the quest player shows the filled text itself).
    voice: ({ line }) => { const url = voiceUrl(line); if (url) audio.playLine(url); },
    // Every attempt the engine rolled shows on the corner dice.
    rolled: (rolls) => { lastRoll = Date.now(); for (const r of rolls) bus.emit('roll:attempt', { ...r, who: r.who || store.get().character?.name || null }); },
  });
  crew.attach(jobs);

  place = createHangarPlace({
    scene: floorScene, store, bus,
    layer: $('hg-spots'),
    sheet: { root: $('hg-sheet'), title: $('hg-sheet-title'), who: $('hg-sheet-who'), close: $('hg-sheet-close'), tabs: $('hg-sheet-tabs') },
    panes: stationPanes, // the job card's pane is not a station view
    renderStation: (station, state, pane, view) => hangar.renderStation(station, state, pane, view),
    reducedMotion: still,
    onOpen: (station, pane) => { if (pane === 'crew') crew.refresh(); },
  });
  provideHangar(place);
  place.subscribe((e) => {
    sheetOpen = e.type === 'open';
    // A station opening (a link, a screen reader's button) takes the screen from the datapad.
    if (sheetOpen && pad?.isOpen) pad.close();
    holdFloor();
  });

  function allowLesson(target) {
    const need = LESSON_STEP[target.kind];
    if (!need || !tutorialOn(store.get())) return true;
    const at = STEP_IDS.indexOf(currentStep(store.get())?.id);
    if (at >= STEP_IDS.indexOf(need)) return true;
    const o = story.director.objective();
    toast(o?.text ? `Not yet. ${o.text}` : 'Not yet.');
    return false;
  }


  // The walkable floor. Walking up to a station and pressing E opens it in place.
  onfoot = createOnFoot({
    root: floor, store, bus, mapId: link.map || (slicing ? startRoom(store.get()) : 'hangar'), spawn: link.map ? link.spawn : 'default',
    reducedMotion: still,
    hooks: {
      openStation: (id) => new Promise((resolve) => {
        if (!place.openStation(id, { via: 'walk' })) { resolve(); return; }
        const off = place.subscribe((e) => { if (e.type === 'close') { off(); resolve(); } });
      }),
      isUnlocked: (id) => isUnlocked(store.get(), id),
      tutorial: () => tutorialOn(store.get()),
      // During the tutorial, a lesson waits for its turn (the director pays for each one once).
      allow: (target) => allowLesson(target),
      entered: (map) => { slice?.entered(map); setBed(map.ambient); place?.closeStation({ restoreFocus: false }); place?.place(); setPlaceName(placeNameFor(map)); },
      flying: (on) => { flying = on; holdFloor(); place?.place(); if (on) setPlaceName('The Drift'); else if (onfoot?.world?.map) setPlaceName(placeNameFor(onfoot.world.map)); },
      stationInfo,
      // Jobs you haven't taken: a giver offers theirs in person (after the tutorial).
      offerTalk: (who, map) => (jobsOpen() && offersAt({ map: map.id, npc: who }, store.get()).length ? jobTalk.offerAt({ map: map.id, npc: who }) : null),
      // The "job here" mark: open offers at a giver or a board.
      offers: ({ map, npc, station }) => {
        if (!jobsOpen()) return 0;
        if (station === 'board') return openCount({ map, board: true }, store.get());
        return npc ? openCount({ map, npc }, store.get()) : 0;
      },
    },
  });
  setCaptainLook(store.get().character?.look?.portrait);
  store.subscribe((save) => setCaptainLook(save.character?.look?.portrait));
  setPlaceName(placeNameFor(onfoot.world.map));

  // --- Round 3 basics: the HUD keeps the header and the phone's thumbs clear ---
  const header = document.querySelector('.vy-top');
  const fitSafe = () => onfoot.world.setSafe({ top: Math.ceil(header.getBoundingClientRect().bottom), bottom: touch ? 112 : 0 });
  fitSafe();
  addEventListener('resize', fitSafe);
  // Something else owns the screen: a station panel, the licence or intro, a minigame or talk, a flight, a fight.
  const screenBusy = () => sheetOpen || Boolean(place.current) || overlays.has('intro') || overlays.has('licence') || overlays.has('nap') || overlays.has('pause') || flying
    || onfoot.world.mode !== 'walk' || Boolean(floor.querySelector('.of-panel, .of-overlay, .of-talk')) || !$('hg-licence').hidden;
  pad = createDatapad({
    root: document.body, store, bus, toast, touch, skillSave: createSkillSave({ store, economy }),
    world: () => onfoot?.world || null,
    tutorialOn, reducedMotion: still, stationInfo,
    canOpen: () => !screenBusy(),
    onChange: (open) => { if (open) overlays.add('pad'); else overlays.delete('pad'); holdFloor(); },
    openLicence,
    onContinueJob: () => jobs.resume(),
  });
  tracker = createTracker({
    root: $('hg-objective'), store, bus, touch,
    world: () => onfoot?.world || null,
    stationInfo,
    boardOpen: () => place.current === 'board',
    jobBusy: () => jobTalk.busy || jobCard.open,
    onContinue: () => jobs.resume(),
  });
  const controls = createControlsCard({ root: document.body, touch });
  const pause = createPause({
    root: document.body, touch, settings, controls,
    canOpen: () => !screenBusy() && !pad.isOpen,
    onChange: (open) => { if (open) overlays.add('pause'); else overlays.delete('pause'); holdFloor(); },
  });
  function maybeControls() {
    if (pad.isOpen || screenBusy()) return; // only on a free floor; the next free moment tries again
    if (store.get().character && !overlays.has('intro') && !overlays.has('licence') && $('hg-licence').hidden) controls.maybeShow();
  }
  // Esc: close what is open (the pad and station panels close themselves), else pause.
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.defaultPrevented || e.repeat) return;
    if (pause.isOpen) { e.preventDefault(); pause.close(); return; }
    if (controls.open) { e.preventDefault(); controls.hide(); return; }
    if (pad.isOpen || !$('hg-settings').hidden || screenBusy()) return;
    e.preventDefault();
    pause.open();
  }, true);
  // The controls card goes once the player uses something or opens the bag.
  bus.on('datapad:open', () => controls.hide());
  bus.on('datapad:close', () => setTimeout(maybeControls, 300));
  bus.on('hangar:opened', () => controls.hide());
  bus.on('hangar:closed', () => setTimeout(maybeControls, 300));

  // The intro holds the floor still while it plays; the licence opens on the create
  // step (or whenever there is no captain once the intro and tutorial are out of the way).
  bus.on('story:step', (d) => {
    if (d?.id === 'intro') { overlays.add('intro'); holdFloor(); }
    if (d?.id === 'create' && !store.get().character) openLicence();
  });
  bus.on('intro:done', () => { overlays.delete('intro'); holdFloor(); setTimeout(maybeControls, 400); });
  bus.on('story:done', () => {
    overlays.delete('intro'); holdFloor();
    if (!store.get().character) openLicence();
  });
  // --- Other lanes plug in (contract sections 4 and 7) ---
  const story = mountStory({
    store, root: document.body, bus, caption: false, playsAudio: false, reducedMotion: still,
    startAt: link.step,
  });
  registerShops(hangarApi, { speak: (id) => story.speak(id, { vars: { name: store.get().character?.name || '' } }) });
  registerRaceLaunches(hangarApi);

  // The launch hatch: a hop to each quest giver (space exploration), once the story opens it.
  TARGETS_IN_ORDER.forEach((id, i) => {
    const p = PLACES[id];
    const giver = p.giver ? `${p.giver[0].toUpperCase()}${p.giver.slice(1)}` : '';
    addLaunch({
      id: `hop-${id}`,
      label: `Fly to ${p.name}`,
      blurb: giver ? `${giver} works out of there. A short hop across the Drift; slow down near anything odd to scan it.` : 'A short hop across the Drift.',
      order: 5 + i,
      available: (save) => (isUnlocked(save, `explore:${id}`) ? { ok: true } : { ok: false, reason: 'No reason to go yet. Somebody in the hangar will give you one.' }),
      run: () => { place.closeStation({ restoreFocus: false }); return onfoot.flyTo(id); },
    });
  });

  // Station nameplates ride the floor as you walk (hidden off screen and in other rooms).
  const trackerBox = $('hg-objective');
  const dialogueEl = $('hg-dialogue');
  const followPlates = () => {
    place.place();
    // Marks keep out from under the tracker (round 3).
    const avoid = [];
    const shown = (box) => box && !box.hidden && getComputedStyle(box).opacity !== '0';
    if (!document.body.classList.contains('dp-open')) for (const box of [trackerBox, dialogueEl, document.querySelector('.dp-controls')]) if (shown(box)) avoid.push(box.getBoundingClientRect());
    // While a dialogue box is up, door chips it would cover hide instead of wandering off their doors.
    onfoot.world.setSafe({ avoid, hideDoorsUnder: shown(dialogueEl) ? [dialogueEl.getBoundingClientRect()] : [] });
    // In an on-foot fight the dialogue box lets clicks through to the aim (its buttons still work).
    document.body.classList.toggle('hg-fight', onfoot.world.mode === 'fight');
    requestAnimationFrame(followPlates);
  };
  requestAnimationFrame(followPlates);

  // Quest keys (1-9 for choices, F/E/H/B in fights, Enter, Backspace) while the job board is open.
  addEventListener('keydown', (e) => { if (jobCard.open && !pad.isOpen) jobs.keydown(e); });
  // Crew station keys while the crew view is open.
  addEventListener('keydown', (e) => { if (!panes.crew.hidden && !$('hg-sheet').hidden) crew.keydown(e); });
  addEventListener('keyup', (e) => { if (!panes.crew.hidden && !$('hg-sheet').hidden) crew.keyup(e); });

  crew.render();
  ready.then(() => crew.refresh());

  // --- Where to start ---
  const step = currentStep(store.get())?.id || null;
  if (link.quest) {
    jobs.openLinked(link.quest, { node: link.node, seed: link.seed });
  } else if (link.explore) {
    onfoot.flyTo(link.explore);
  } else if (!store.get().character && (step === 'create' || storyOf(store.get()).finished)) openLicence();
  else if (crew.pending) place.openStation('hatch', { via: 'refresh', view: 'crew' });
  // A job in progress waits on the tracker and the datapad (Continue); nothing pops up.
  // Launch slice: the opening picks its scene up (a reload lands back in the beat) or starts the next one.
  if (slicing) {
    slice = createSliceDirector({ store, jobs, toast, world: () => onfoot?.world || null, fightIn: (setup) => onfoot.fight(setup) });
    ready.then(() => {
      // A signed-in account whose own save is an older hangar game replaces the fresh one: leave the Duchess for the hangar.
      if (!store.get().flags?.['slice-started']) { onfoot.world.go('hangar', 'default'); return; }
      slice.boot();
    });
  }

  // For tests and poking around in the console (no secrets: the save is the player's own).
  setTimeout(maybeControls, 600);
  window.__stardust = { store, story, onfoot, place, jobs, licence, bus, pad, tracker, controls, pause, jobTalk, jobCard, crew, slice };
}
