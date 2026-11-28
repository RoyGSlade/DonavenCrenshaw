// The drinks machine screen (opening track A, outcome 6): coffee or tea, drink it here or take it with you. Builds on the playtest 1
// coffee and Wired work (status.js, the pack's Drink button): the same cup, the same status, on the shared object-screen kit.
import { openObjectScreen, section, bar, button, note, chip, row } from './kit.js';
import { createEl } from '../dom.js';
import { COFFEE_WORDS, TEA_WORDS, STATUS_DEFS } from '../../status.js';
import { DRINKS } from '../../slice/objectState.js';

const WORDS = { coffee: COFFEE_WORDS, tea: TEA_WORDS };

/** deps: { store, statuses, toast, sound }. Resolves when the player leaves. */
export function playCoffee({ store, statuses, sound = () => {} }) {
  return new Promise((resolve) => {
    const screen = openObjectScreen({ word: 'MESS HALL', title: COFFEE_WORDS.menuTitle, kind: 'coffee', onLeave: () => done() });
    const feedback = createEl('p', { class: 'ok-note ok-feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    const pack = createEl('p', { class: 'ok-row' });
    const live = createEl('div', { class: 'ok-live' });
    const cards = Object.values(DRINKS).map((d) => {
      const say = (text) => { feedback.hidden = false; feedback.textContent = text; refresh(); };
      return section(d.name,
        createEl('p', { class: 'ok-note', text: d.blurb }),
        createEl('div', { class: 'ok-actions' },
          button({ label: d.id === 'coffee' ? COFFEE_WORDS.drinkLabel : 'Drink a cup now', primary: true, data: { [d.id]: 'drink', ...(d.id === 'coffee' ? { coffee: 'drink' } : {}) }, onClick: () => { statuses.add(d.status); sound('talk'); say(WORDS[d.id].drink); } }),
          button({ label: d.id === 'coffee' ? COFFEE_WORDS.takeLabel : 'Take a cup with you', data: { [d.id]: 'take', ...(d.id === 'coffee' ? { coffee: 'take' } : {}) }, onClick: () => { store?.grant({ items: { [d.item]: 1 } }); say(WORDS[d.id].take); } })));
    });
    function refresh() {
      const s = store?.get()?.items || {};
      pack.replaceChildren(createEl('span', { text: 'In your pack' }), createEl('b', { text: `${s.coffee || 0} coffee · ${s.tea || 0} tea` }));
      const on = statuses.active();
      live.replaceChildren(...(on.length ? on.map((x) => bar({ label: x.name, value: x.left, max: x.total, unit: '', tone: x.id === 'wired' ? 'warn' : 'good', hint: x.text })) : [note('Nothing on you.')]));
    }
    const timer = setInterval(refresh, 1000);
    refresh();
    screen.body.append(...cards, section('Right now', live, pack), feedback);
    screen.body.append(createEl('button', { type: 'button', class: 'ok-btn ok-leave-bottom', dataset: { coffee: 'leave' }, onclick: () => done(), text: COFFEE_WORDS.leaveLabel }));
    let ended = false;
    function done() { if (ended) return; ended = true; clearInterval(timer); screen.close(); resolve(); }
    screen.body.querySelector('button')?.focus({ preventScroll: true });
  });
}
