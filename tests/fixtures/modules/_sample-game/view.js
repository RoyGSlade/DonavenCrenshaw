// Draws the sample into `stage`. DOM only; every rule is in model.js.
import { PADS, create, pick, resultOf } from './model.js';

export function playView(stage, ctx, onDone) {
  let state = create(ctx);
  const root = document.createElement('div');
  root.className = 'm-_sample-game';
  root.innerHTML = '<p class="sg-help"></p><div class="sg-pads"></div>';
  const help = root.querySelector('.sg-help'), pads = root.querySelector('.sg-pads');
  const buttons = Array.from({ length: PADS }, (_, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sg-pad'; b.dataset.pad = i; b.setAttribute('aria-label', `Pad ${i + 1}`); pads.append(b); return b; });
  const draw = () => { buttons[state.target].classList.add('is-lit'); help.textContent = state.done ? (state.success ? 'Hit.' : 'Missed.') : `Hit the lit pad. ${state.tries - state.picks.length} left.`; root.__state = state; };
  buttons.forEach((b, i) => b.addEventListener('click', () => { state = pick(state, i); draw(); if (state.done) onDone(resultOf(state)); }));
  stage.replaceChildren(root);
  draw();
}
