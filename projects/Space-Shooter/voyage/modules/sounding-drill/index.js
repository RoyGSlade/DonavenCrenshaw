// Sounding drill, contract 1.1: `play(stage, ctx) -> Promise<result>`.
// The stage is an empty full-screen element opened by the host (it also has the Leave button). Leave, per contract 1.1: the module
// registers its handler once at the start with `ctx.onLeave(fn)`; when the player presses Leave the host calls `fn()`, and the module
// stops its loop and its Web Audio and resolves { done: true, left: true }.
import { mountGame } from './view.js';

const here = (p) => new URL(p, import.meta.url);
let fixturesCache = null;
async function loadFixtures() {
  if (fixturesCache) return fixturesCache;
  try { const r = await fetch(here('./fixtures.json')); fixturesCache = await r.json(); } catch { fixturesCache = { items: {}, rocks: [] }; }
  return fixturesCache;
}

export function play(stage, ctx = {}) {
  let ctl = null, done = false, resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = here('./style.css').href; css.dataset.sdStyle = '1';
  if (!document.querySelector('link[data-sd-style]')) document.head.append(css);
  const end = (result) => {
    if (done) return; done = true;
    ctl?.destroy();
    ctx.sound?.('music:unduck');
    resolveFn(result);
  };
  const onLeave = () => { if (ctl) ctl.leave(); else end({ done: true, success: false, grade: 0, left: true, effects: {} }); };
  ctx.onLeave?.(onLeave);
  (async () => {
    const fixtures = await loadFixtures();
    if (done) return;
    const c = ctx.context || {};
    const items = c.items ? { ...fixtures.items, ...c.items } : fixtures.items;
    ctx.sound?.('music:duck');
    ctl = mountGame(stage, ctx, { fixtures: { ...fixtures, items }, items, rock: c.rock || null, resume: c.resume || null, quick: !!ctx.quick, onDone: end });
  })();
  return promise;
}
export default play;
