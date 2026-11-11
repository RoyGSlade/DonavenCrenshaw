// Loaded by today's hangar page (../index.html). It does one of two things and
// nothing else, so today's game runs exactly as before:
//   - switch on (runtimeConfig.voyage): a bare visit goes to the new hangar;
//   - switch off, tab opened with ?voyage=on: a "Preview the new Stardust" card
//     joins the "Try another flight" cards.
import { runtimeConfig } from '../runtime-config.js';
import { voyageFlag, cutOverTarget } from './flag.js';

const target = cutOverTarget({ config: runtimeConfig, search: location.search });
if (target) location.replace(target);
else if (voyageFlag({ config: runtimeConfig, search: location.search }).enabled) addPreviewCard();

function addPreviewCard() {
  const grid = document.querySelector('.hangar-mode-grid');
  if (!grid || document.getElementById('voyage-card')) return;
  const card = document.createElement('section');
  card.id = 'voyage-card';
  card.className = 'dogfight-card';
  card.setAttribute('aria-labelledby', 'voyage-card-title');
  const copy = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'PREVIEW / NOT PUBLIC YET';
  const title = document.createElement('h2');
  title.id = 'voyage-card-title';
  title.textContent = 'The new Stardust';
  const text = document.createElement('p');
  text.textContent = 'Your captain, ship upgrades, credits and rep. Saved on this device and, signed in, on your account.';
  copy.append(eyebrow, title, text);
  const link = document.createElement('a');
  link.className = 'mode-link';
  link.href = './voyage/';
  link.textContent = 'Open the new hangar ↗';
  card.append(copy, link);
  grid.append(card);
}
