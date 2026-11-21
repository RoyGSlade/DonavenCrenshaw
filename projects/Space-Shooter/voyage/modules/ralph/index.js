// Ralph entry: play(stage, ctx) -> Promise<result>. See README.md for ctx and the result.
// Leave (contract 1.1): the module calls ctx.onLeave(fn) once at the start; the host calls fn() when its Leave is pressed.
import { createRalph, finish } from './model.js';
import { mount, fitYard } from './view.js';

const BASE = new URL('.', import.meta.url).href;
let styleReady = null;
function ensureStyle() {
  const have = document.querySelector('link[data-m="ralph"]');
  if (have && styleReady) return styleReady;
  const link = have || document.createElement('link');
  styleReady = new Promise((resolve) => { link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', resolve, { once: true }); if (have && have.sheet) resolve(); });
  if (!have) { link.rel = 'stylesheet'; link.href = new URL('style.css', BASE).href; link.dataset.m = 'ralph'; document.head.append(link); }
  return styleReady;
}

export async function play(stage, ctx = {}) {
  await ensureStyle();
  stage.classList.add('m-ralph-stage');
  const rect = stage.getBoundingClientRect();
  const { w, h } = fitYard(rect.width || 1280, rect.height || 800);
  const state = createRalph({ seed: ctx.seed, quick: ctx.quick, context: ctx.context, w, h, force: ctx.debugForce });
  return new Promise((resolve) => {
    let ui = null, ended = false;
    const leave = () => {
      if (ended) return; ended = true;
      ctx.sound?.('ralph-stop'); // nothing of ours keeps running
      ui?.destroy();
      stage.classList.remove('m-ralph-stage');
      resolve(finish(state, { left: true }));
    };
    ctx.onLeave?.(leave);
    mount(stage, state, { ctx, base: BASE, onLeave: leave }).then((u) => { ui = u; if (ended) u.destroy(); });
  });
}
export default play;
