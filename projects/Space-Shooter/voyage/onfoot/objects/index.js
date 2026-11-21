// Which things in the Tin Duchess open a full screen, and which screen (opening track A, outcome 6).
//
//   const objects = createObjectScreens({ store, statuses, sound, helm })
//   objects.screenFor(target)   a function that opens the screen, or null when the thing has none
import { playCoffee } from './coffee.js';
import { playEngine } from './engine.js';
import { playGuns } from './guns.js';
import { playNav } from './nav.js';

/** The interact ids that have a screen: id -> which. (kind is checked too: a prop with the same id in another map is not this.) */
export const SCREENS = Object.freeze({
  'console:coffee': 'coffee',
  'repair:engine': 'engine',
  'console:engine-console': 'engine',
  'repair:guns': 'guns',
  'console:nav-console': 'nav',
});

export function createObjectScreens({ store, statuses, sound, helm }) {
  const open = {
    coffee: () => playCoffee({ store, statuses, sound }),
    engine: () => playEngine({ store }),
    guns: () => playGuns({ store }),
    nav: () => playNav({ store, helm }),
  };
  return {
    screenFor(target) {
      const which = SCREENS[`${target?.kind}:${target?.id}`];
      return which ? open[which] : null;
    },
  };
}
