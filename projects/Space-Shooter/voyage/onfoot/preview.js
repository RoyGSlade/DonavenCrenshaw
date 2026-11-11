// The on-foot preview: the tutorial's playable layers in one place, before the
// story lane's director and the hangar lane's screens are merged. A stand-in
// checklist follows the tutorial events so each piece can be tried in order:
// walk, talk to Chibby, drill the ore slab, clear the range, power Edna's door,
// board your ship and fly to a giver. ?map=<id> starts in any map.
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { createVoyageStore } from '../store.js';
import { createOnFoot } from './onfoot.js';
import { MAP_DEFS } from '../maps/index.js';
import { TUTORIAL_EVENTS, EVENT_NAME } from './events.js';
import { createEl } from './dom.js';
import { createTalk } from './talk.js';
import { STAND_IN } from './standInLines.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);

if (!flag.enabled) $('of-closed').hidden = false;
else boot();

function boot() {
  $('of-page').hidden = false;
  const params = new URLSearchParams(location.search);
  const start = MAP_DEFS[params.get('map')] ? params.get('map') : 'hangar';
  const spawnName = params.get('spawn') || 'default';
  // Studio playtests (studio=1) use their own save, so they never touch a real captain (STUDIO-SCHEMA section 5).
  const store = createVoyageStore(params.get('studio') === '1' ? { key: 'studio.stardust.voyage.v1' } : {});
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = $('of-stage');
  const talkBox = createTalk(stage);
  const talkStandIn = (who) => talkBox.show(STAND_IN[who] || [{ who, text: '…' }]);

  // The contract's on-foot steps, in tutorial order (story's director runs the real thing).
  const steps = [
    { id: 'walk', station: 'pad', text: 'Walk to Chibby at the pad', on: (e, d) => e === TUTORIAL_EVENTS.arrived && d.station === 'pad' },
    { id: 'ship', station: 'pad', text: 'Talk to Chibby', on: (e) => e === 'met:chibby' },
    { id: 'ralph', station: 'scrap', text: 'Ralph found something. Mine the seam he dug up.', on: (e) => e === TUTORIAL_EVENTS.mined },
    { id: 'shoot', station: 'range', text: "Knock down every target on Mel's range", on: (e) => e === TUTORIAL_EVENTS.shot },
    { id: 'puzzle', station: 'backroom', text: "Open Edna's lockbox in her back room", on: (e) => e === TUTORIAL_EVENTS.solved },
    { id: 'hop', station: 'hatch', text: 'Launch hatch: fly to a station', on: (e) => e === TUTORIAL_EVENTS.exploreArrived },
    { id: 'giver', station: null, text: 'Find the quest giver there', on: (e) => /^met:(hask|vey|garrity)$/.test(e) },
  ];
  // A tiny stand-in bus and director, so the objective marker and Ralph's lead
  // work here the way story's director will drive them in the game.
  const listeners = new Map();
  const bus = {
    emit(type, detail) { for (const fn of listeners.get(type) || []) fn(detail); },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
  };
  let current = 0;
  const objective = () => (steps[current] ? { step: steps[current].id, text: steps[current].text, station: steps[current].station } : null);
  const toggle = createEl('button', { type: 'button', class: 'of-steps-title', 'aria-expanded': 'true', text: 'TUTORIAL PREVIEW' });
  const list = createEl('ol', { class: 'of-steps', 'aria-label': 'Tutorial preview' }, toggle, ...steps.map(s => createEl('li', { dataset: { step: s.id }, text: s.text })));
  const collapse = (on) => { if (on) list.dataset.collapsed = ''; else delete list.dataset.collapsed; toggle.setAttribute('aria-expanded', String(!on)); };
  toggle.addEventListener('click', () => collapse(!('collapsed' in list.dataset)));
  if (innerWidth < 620) collapse(true);
  stage.append(list);
  const log = [];
  addEventListener(EVENT_NAME, (e) => {
    const { event, ...data } = e.detail;
    log.push(event);
    for (const s of steps) if (s.on(event, data)) list.querySelector(`[data-step="${s.id}"]`).classList.add('done');
    while (steps[current] && list.querySelector(`[data-step="${steps[current].id}"]`).classList.contains('done')) current++;
    queueMicrotask(() => bus.emit('story:objective', objective()));
    const n = list.querySelectorAll('li.done').length;
    toggle.textContent = `TUTORIAL PREVIEW ${n}/${steps.length}`;
  });

  const onfoot = createOnFoot({ root: stage, store, bus, mapId: start, spawn: spawnName, reducedMotion: () => reducedMotion.matches, hooks: { talk: (who) => talkStandIn(who) } });
  bus.emit('story:objective', objective());
  // ?explore=<placeId>: straight into a hop to that place (Studio's sector-map play link).
  const explore = params.get('explore');
  if (['alpha', 'beacon', 'dustfall'].includes(explore)) onfoot.flyTo(explore);
  // For tests and poking around in the console.
  window.__onfoot = { onfoot, store, log };
}
