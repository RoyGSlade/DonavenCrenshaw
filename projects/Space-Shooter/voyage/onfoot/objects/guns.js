// The gun feed screen (opening track A, outcome 6): which guns are aboard and equipped, each one's status, the ammo drawn as a belt,
// and manual or auto tracking. The turret and Reck's rifle follow the story's flags; ammo is colour (dashed); the tracking choice is
// saved in the game (flag duchess-guns-auto). A janitor is not on the gun roster, so the switch is locked for them with its reason.
import { openObjectScreen, section, bar, chip, note, row, segmented, button } from './kit.js';
import { createEl } from '../dom.js';
import { gunState } from '../../slice/objectState.js';
import { roleOf } from '../../slice/role.js';

const TONE = { READY: 'good', 'IN HAND': 'good', DAMAGED: 'bad', 'ON THE DECK': 'warn' };

/** deps: { store }. Resolves when the player leaves. */
export function playGuns({ store }) {
  return new Promise((resolve) => {
    const screen = openObjectScreen({ word: 'BRIDGE', title: 'Gun feed', kind: 'guns', onLeave: () => done() });
    const list = createEl('div', { class: 'ok-guns' });
    const control = createEl('div', { class: 'ok-track-ctl' });
    const roster = createEl('div');
    const draw = () => {
      const save = store?.get() || {};
      const flags = save.flags || {};
      const st = gunState(flags);
      const role = roleOf(save);
      list.replaceChildren(...st.guns.map((g) => createEl('article', { class: 'ok-gun', dataset: { gun: g.id } },
        createEl('div', { class: 'ok-gun-head' }, createEl('b', { text: g.name }), chip(g.status, TONE[g.status] || 'plain'), g.equipped ? chip('Equipped', 'plain') : chip('Not equipped', 'warn')),
        bar({ label: 'Ammo belt', value: g.ammo, tone: g.ammo < 30 ? 'bad' : g.ammo < 55 ? 'warn' : 'good', real: g.ammoReal, segments: 20, hint: `${Math.round(g.ammo * 0.5)} rounds in the feed` }),
        createEl('p', { class: 'ok-note', text: g.note }))));
      const canSet = role !== 'janitor';
      control.replaceChildren(
        canSet
          ? segmented({ label: 'Tracking', data: 'tracking', value: st.tracking, options: [{ id: 'manual', label: 'Manual' }, { id: 'auto', label: 'Auto' }], onChange: (v) => { store.update((s) => ({ ...s, flags: { ...s.flags, 'duchess-guns-auto': v === 'auto' ? 1 : 0 } })); draw(); } })
          : createEl('div', { class: 'ok-lock' }, createEl('div', { class: 'ok-seg is-locked', 'aria-disabled': 'true' }, createEl('span', { class: 'ok-seg-b is-on', text: 'Manual' }), createEl('span', { class: 'ok-seg-b', text: 'Auto' })), createEl('p', { class: 'ok-lock-why', role: 'note', text: 'Gunner roster only. Ask Tull about the seat.' })),
        createEl('p', { class: 'ok-note', dataset: { trackingNote: st.tracking }, text: st.trackingNote }));
      roster.replaceChildren(row('On the gun roster', role === 'janitor' ? (flags['reck-down'] ? 'An empty seat' : 'Reck') : 'You', role === 'janitor' ? 'plain' : 'good'));
    };
    draw();
    const timer = setInterval(draw, 900);
    screen.body.append(section('Guns aboard', list, roster), section('Tracking', control), note('Solid bars read the ship. Dashed bars are for show.', 'ok-wide'));
    let ended = false;
    function done() { if (ended) return; ended = true; clearInterval(timer); screen.close(); resolve(); }
  });
}
