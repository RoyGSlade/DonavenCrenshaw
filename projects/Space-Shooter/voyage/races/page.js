// The flight deck preview page (voyage/races/index.html): the same card the
// hangar mounts at a station, on its own, behind the new game's switch.
import { runtimeConfig } from '../../runtime-config.js';
import { equippedBuild } from '../../systems/shipBuild.js';
import { newGameFlag } from '../flag.js';
import { createVoyageStore } from '../store.js';
import { mountFlightDeck } from './launch.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
if (!flag.enabled) document.getElementById('rc-closed').hidden = false;
else {
  const note = document.getElementById('rc-toast');
  mountFlightDeck(document.getElementById('rc-deck-root'), {
    store: createVoyageStore(),
    build: () => equippedBuild(),
    toast: (text) => { note.textContent = text; },
  });
}
