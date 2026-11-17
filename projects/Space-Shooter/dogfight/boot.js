import { weeklyAccess } from '../systems/weeklyAccess.js';

// Check before importing the client, so retired rooms never connect to the relay.
// The new game's dogfight (?launch=1) is not a weekly room, so the weekly rollout never retires it.
let newGameDogfight = false;
if (new URLSearchParams(location.search).get('launch') === '1') {
  const [{ launchFromSearch }, { runtimeConfig }] = await Promise.all([import('./launch.js'), import('../runtime-config.js')]);
  newGameDogfight = launchFromSearch(location.search, { config: runtimeConfig }).on;
}
if (newGameDogfight || weeklyAccess('dogfight') === 'open') {
  await import('./client.js');
} else {
  location.replace('../');
}
