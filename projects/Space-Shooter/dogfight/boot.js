import { weeklyAccess } from '../systems/weeklyAccess.js';

// Check before importing the client, so retired rooms never connect to the relay.
if (weeklyAccess('dogfight') === 'open') {
  await import('./client.js');
} else {
  location.replace('../');
}
