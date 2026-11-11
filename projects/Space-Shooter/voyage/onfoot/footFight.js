// A live on-foot fight in its own overlay, for pages that are not already on
// foot (the job board's quest player). Loads its own styles, builds a world on
// the fight's map, plays the fight and resolves { outcome, hp } for the quest
// engine's on-foot step ({ type: 'live', outcome, hp }).
import { createWorld } from './world.js';
import { footStats } from './rules/shooter.js';
import { effect, skillBonus } from '../character.js';
import { createEl } from './dom.js';

export function ensureOnFootStyles() {
  if (document.querySelector('link[data-onfoot-css]')) return;
  const link = createEl('link', { rel: 'stylesheet', href: new URL('./onfoot.css', import.meta.url).href, dataset: { onfootCss: '' } });
  document.head.append(link);
}

export function playFootFight(setup, { character = null, title = 'On foot', onCancel = null } = {}) {
  ensureOnFootStyles();
  const stage = createEl('div', { class: 'of-stage' });
  const quit = createEl('button', { type: 'button', class: 'of-overlay-quit', text: 'Back away (turn by turn)' });
  const overlay = createEl('div', { class: 'of-overlay', role: 'dialog', 'aria-label': `Live fight: ${title}` },
    createEl('p', { class: 'of-eyebrow', text: `ON FOOT · ${title.toUpperCase()}` }), stage, quit);
  document.body.append(overlay);
  const world = createWorld({ root: stage, mapId: setup.map || 'moon-outpost', spawn: setup.spawn || 'fight' });
  const player = { ...footStats(character, { effect, skillBonus }), ...(setup.player || {}) };
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => { if (done) return; done = true; world.destroy(); overlay.remove(); resolve(result); };
    quit.addEventListener('click', () => { onCancel?.(); finish(null); });
    world.fight({ ...setup, player }).then(finish);
  });
}
