// Crate look entry: play(stage, ctx) -> Promise<result>. See README.md for ctx and the result.
// Leave: the module calls ctx.onLeave(fn) once at the start; the host calls fn() when its Leave is pressed (CONTRACT.md section 3).
import { createLook, finish } from './model.js';
import { mount } from './view.js';

const BASE = new URL('.', import.meta.url).href;

let styleReady = null;
function ensureStyle() {
  const have = document.querySelector('link[data-m="crate-look"]');
  if (have && styleReady) return styleReady;
  const link = have || document.createElement('link');
  styleReady = new Promise((resolve) => { link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', resolve, { once: true }); if (have && have.sheet) resolve(); });
  if (!have) { link.rel = 'stylesheet'; link.href = new URL('style.css', BASE).href; link.dataset.m = 'crate-look'; document.head.append(link); }
  return styleReady;
}

export async function play(stage, ctx = {}) {
  await ensureStyle(); // the look is in before the first frame
  const state = createLook({ seed: ctx.seed, tier: ctx.tier, points: ctx.points, level: ctx.level, quick: ctx.quick, context: ctx.context });
  return new Promise((resolve) => {
    let ui = null;
    let ended = false;
    // Leaving (contract 1.1): the host's Leave calls the handler we registered; Esc and "Step back" call it too. We stop our timers
    // (every sound is a short one-shot, so none is left running) and resolve with everything moved so far.
    const leave = () => {
      if (ended) return;
      ended = true;
      ui?.destroy();
      resolve(finish(state, { left: true }));
    };
    ui = mount(stage, state, { ctx, base: BASE, onLeave: leave });
    ctx.onLeave?.(leave);
  });
}

export default play;
