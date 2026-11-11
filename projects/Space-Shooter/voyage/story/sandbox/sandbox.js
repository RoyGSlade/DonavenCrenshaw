// Story sandbox: the intro and the tutorial director on their own save, with a
// button for every event the hangar, on-foot and exploration lanes will send.
// The real game mounts the same thing from the hangar (story/mount.js).
import { runtimeConfig } from '../../../runtime-config.js';
import { newGameFlag } from '../../flag.js';
import { createVoyageStore } from '../../store.js';
import { mountStory } from '../mount.js';
import { storyOf } from '../progress.js';
import { STEPS } from '../tutorial.js';

const $ = (id) => document.getElementById(id);
const flag = newGameFlag({ config: runtimeConfig, search: location.search });

if (!flag.enabled) {
  $('ss-closed').hidden = false;
} else {
  $('ss-app').hidden = false;
  const store = createVoyageStore({ key: 'stardust.voyage.story-sandbox.v1' });
  const log = (text) => {
    const li = document.createElement('li');
    li.textContent = text;
    $('ss-log').prepend(li);
  };

  // What the other lanes send. Only the one the current step waits for moves it on.
  const EVENTS = [
    ['Create a captain (hangar)', () => {
      if (!store.get().character) store.createCharacter({ name: 'Vela Quint' });
      story.bus.emit('captain:created', { character: store.get().character });
    }, 'create'],
    ['Walk 3 m (onfoot)', () => story.bus.emit('tutorial:moved', {}), null],
    ['Arrive at the pad', () => story.bus.emit('tutorial:arrived', { station: 'pad' }), 'walk'],
    ['Talk to Chibby', () => story.bus.emit('met:chibby', {}), 'ship'],
    ['Talk to Ralph', () => story.bus.emit('met:ralph', {}), 'ralph'],
    ['Finish mining (2 ore)', () => story.bus.emit('tutorial:mined', { ore: 2 }), 'mine'],
    ['Launch to Dustfall', () => story.bus.emit('explore:launched', { target: 'dustfall' }), null],
    ['Arrive at Dustfall', () => story.bus.emit('explore:arrived', { target: 'dustfall' }), 'hop-garrity'],
    ['Talk to Garrity', () => story.bus.emit('met:garrity', {}), 'garrity'],
    ['Talk to Mel', () => story.bus.emit('met:mel', {}), 'mel'],
    ['Range: 6 of 6', () => story.bus.emit('tutorial:shot', { hits: 6, shots: 6 }), 'shoot'],
    ['Range: 6 of 9', () => story.bus.emit('tutorial:shot', { hits: 6, shots: 9 }), 'shoot'],
    ['Arrive at Alpha Relay', () => story.bus.emit('explore:arrived', { target: 'alpha' }), 'hop-hask'],
    ['Talk to Hask', () => story.bus.emit('met:hask', {}), 'hask'],
    ['Talk to Edna', () => story.bus.emit('met:edna', {}), 'edna'],
    ['Solve the lockbox', () => story.bus.emit('tutorial:solved', { puzzle: 'lockbox' }), 'puzzle'],
    ['Arrive at Beacon Prime', () => story.bus.emit('explore:arrived', { target: 'beacon' }), 'hop-vey'],
    ['Talk to Vey', () => story.bus.emit('met:vey', {}), 'vey'],
  ];
  const buttons = EVENTS.map(([label, fn, step]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.step = step || '';
    b.addEventListener('click', fn);
    $('ss-events').append(b);
    return b;
  });

  function render() {
    const s = storyOf(store.get());
    const i = STEPS.findIndex((st) => st.id === s.step);
    $('ss-step').textContent = s.finished ? `Finished${s.skipped ? ' (skipped)' : ''}.` : `Step ${i + 1} of ${STEPS.length}: ${s.step}`;
    const items = s.unlocks.map((u) => { const li = document.createElement('li'); li.textContent = u; return li; });
    $('ss-unlocks').replaceChildren(...items);
    for (const b of buttons) b.dataset.next = String(!s.finished && b.dataset.step === s.step);
  }

  const story = mountStory({ store });
  story.bus.on('*', (type, detail) => {
    if (type === 'story:say') log(`${detail.name}: ${detail.text}`);
    else if (type === 'story:unlock') log(`Unlocked ${detail.id}`);
    else if (type === 'story:reward') log(`Reward: ${detail.events.map((e) => `${e.type} ${e.id || e.giver || ''} ${e.amount ?? e.value ?? ''}`.trim()).join(', ')}`);
    else if (type === 'story:done') log(detail.skipped ? 'Tutorial skipped.' : 'Tutorial finished. Jobs are open.');
  });
  store.subscribe(render);
  render();

  $('ss-replay').addEventListener('click', () => story.director.replay());
  $('ss-skip').addEventListener('click', () => story.director.skip());
  $('ss-reset').addEventListener('click', () => { store.reset(); location.reload(); });
}
