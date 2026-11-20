// Shop counter entry: play(stage, ctx) -> Promise<result>. See README.md for ctx and the result.
import { createCounter, finish } from './model.js';
import { mount } from './view.js';

const BASE = new URL('.', import.meta.url).href;

let styleReady = null;
function ensureStyle() {
  const have = document.querySelector('link[data-m="shop-counter"]');
  if (have && styleReady) return styleReady;
  const link = have || document.createElement('link');
  styleReady = new Promise((resolve) => { link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', resolve, { once: true }); if (have && have.sheet) resolve(); });
  if (!have) { link.rel = 'stylesheet'; link.href = new URL('style.css', BASE).href; link.dataset.m = 'shop-counter'; document.head.append(link); }
  return styleReady;
}

export async function play(stage, ctx = {}) {
  await ensureStyle(); // the look is in before the first frame
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
