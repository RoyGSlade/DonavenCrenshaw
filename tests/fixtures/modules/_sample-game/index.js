// Sample mini-game module (contract v1.1). play(stage, ctx) resolves with { done, success, grade }.
import { playView } from './view.js';

export function play(stage, ctx) {
  return new Promise((resolve) => {
    if (!document.querySelector('link[data-m-sample-game]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./style.css', import.meta.url).href; l.dataset.mSampleGame = ''; document.head.append(l); }
    playView(stage, ctx, resolve);
  });
}
