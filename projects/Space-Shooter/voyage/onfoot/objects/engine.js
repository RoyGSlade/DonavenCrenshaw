// The engine core screen (opening track A, outcome 6): live bars for output, heat and coolant, and what is wrong right now.
// Real where the story has set a flag (the reactor, the coolant line, the conduit, the hull), colour where it has not (dashed bars).
import { openObjectScreen, section, bar, chip, note, levelWord } from './kit.js';
import { createEl } from '../dom.js';
import { engineState } from '../../slice/objectState.js';

const CORE_SVG = (tone, output) => `<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><circle class="ok-core-ring" cx="60" cy="60" r="50"/><circle class="ok-core-ring r2" cx="60" cy="60" r="36"/><circle class="ok-core-heart" cx="60" cy="60" r="${output > 0 ? 8 + output * 0.18 : 6}"/><path class="ok-core-rod" d="M60 4v20M60 96v20M4 60h20M96 60h20"/></svg>`;

/** deps: { store }. Resolves when the player leaves. */
export function playEngine({ store, word = 'ENGINE ROOM' }) {
  return new Promise((resolve) => {
    const screen = openObjectScreen({ word, title: 'Reactor core', kind: 'engine', onLeave: () => done() });
    const core = createEl('div', { class: 'ok-core' });
    const head = createEl('div', { class: 'ok-core-head' });
    const bars = createEl('div', { class: 'ok-bars' });
    const issues = createEl('div', { class: 'ok-issues' });
    const draw = () => {
      const st = engineState(store?.get()?.flags || {});
      const tone = st.status === 'RUNNING' ? 'good' : st.status === 'DEAD' ? 'bad' : 'warn';
      core.className = `ok-core is-${tone}`;
      core.innerHTML = CORE_SVG(tone, st.bars[0].value);
      head.replaceChildren(chip(st.status, tone), createEl('span', { class: 'ok-core-word', text: st.status === 'RUNNING' ? 'Steady hum.' : st.status === 'DEAD' ? 'Nothing is turning.' : 'Running, with faults.' }));
      bars.replaceChildren(...st.bars.map((b) => bar({ label: b.label, value: b.value, unit: b.unit, tone: b.tone, real: b.real, hint: levelWord(b.id === 'heat' ? 100 - b.value : b.value) === 'Empty' ? 'Nothing.' : `${levelWord(b.id === 'heat' ? 100 - b.value : b.value)}${b.id === 'heat' ? ' margin' : ''}` })));
      issues.replaceChildren(...(st.problems.length
        ? st.problems.map((p) => createEl('p', { class: 'ok-issue', dataset: { issue: p.id } }, createEl('b', { text: p.text }), createEl('small', { text: `At ${p.where}.` })))
        : [note('Nothing is wrong right now. Pip says that is when to worry.')]));
    };
    draw();
    const timer = setInterval(draw, 700);
    screen.body.append(section('The core', createEl('div', { class: 'ok-core-wrap' }, core, head), bars), section('What is wrong right now', issues),
      note('Solid bars read the ship. Dashed bars are for show.', 'ok-wide'));
    let ended = false;
    function done() { if (ended) return; ended = true; clearInterval(timer); screen.close(); resolve(); }
  });
}
