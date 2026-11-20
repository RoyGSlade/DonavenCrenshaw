// Shop counter entry: play(stage, ctx) -> Promise<result>. See README.md for ctx and the result.
import { createCounter, finish } from './model.js';
import { mount } from './view.js';

const BASE = new URL('.', import.meta.url).href;

function ensureStyle() {
  if (document.querySelector('link[data-m="shop-counter"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('style.css', BASE).href;
  link.dataset.m = 'shop-counter';
  document.head.append(link);
}

export async function play(stage, ctx = {}) {
  ensureStyle();
  const state = createCounter({
    seed: ctx.seed, tier: ctx.tier, points: ctx.points, level: ctx.level, quick: ctx.quick,
    haggleReady: typeof ctx.play === 'function', context: ctx.context,
  });
  return new Promise((resolve) => {
    let ui = null;
    let ended = false;
    const leave = (extra = {}) => {
      if (ended) return;
      ended = true;
      if (state.music) ctx.sound?.('music:stop');
      const result = finish(state, { left: true, ...extra });
      stage.removeEventListener('stardust:leave', onLeaveEvent);
      delete stage.leave;
      ui?.destroy();
      resolve(result);
    };
    const onLeaveEvent = () => leave();
    stage.addEventListener('stardust:leave', onLeaveEvent);
    stage.leave = () => leave();
    ui = mount(stage, state, { ctx, base: BASE, onLeave: () => leave() });
    if (state.music) ctx.sound?.(`music:${state.music}`);
  });
}

export default play;
