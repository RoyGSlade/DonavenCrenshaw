// Claw, contract 1.1: `play(stage, ctx) -> Promise<result>`.
// The stage is an empty full-screen element opened by the host (it also has the Leave button). Leave, per contract 1.1: the module registers its
// handler once at the start with `ctx.onLeave(fn)`; when the player presses Leave the host calls `fn()`, and the module stops its loop and its
// Web Audio and resolves { done: true, left: true }.
// The board is what the Sounding drill left: `ctx.context.rock` is a drill result ({ finds, tunnel }). With none, a real drill result from
// fixtures.json is picked by the seed and mirrored by it (the shape the screen wants: tall on a phone, wide on a desktop).
import { mountGame } from './view.js';
import { pickResult, straightShaft, rleDecode } from './board.js';

const here = (p) => new URL(p, import.meta.url);
let fixturesCache = null;
async function loadFixtures() {
  if (fixturesCache) return fixturesCache;
  try { const r = await fetch(here('./fixtures.json')); fixturesCache = await r.json(); } catch { fixturesCache = { items: {}, results: [] }; }
  return fixturesCache;
}

/** A host's `context.rock` may be a whole drill result, or carry the entry beside the tunnel. Make it one shape. */
export function normaliseRock(rock) {
  if (!rock?.tunnel || !Array.isArray(rock.finds) || !rock.finds.length) return null;
  const t = rock.tunnel, entry = t.entry || rock.entry;
  if (!entry || !(t.rows || t.rle)) return null;
  return { ...rock, finds: rock.finds.map((f) => ({ ...f })), tunnel: { cell: t.cell || 8, w: t.w, h: t.h, rows: t.rows || rleDecode(t.rle), entry, board: t.board || rock.board || { w: t.w * (t.cell || 8), h: t.h * (t.cell || 8) } } };
}

export function play(stage, ctx = {}) {
  let ctl = null, done = false, resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = here('./style.css').href; css.dataset.cpStyle = '1';
  if (!document.querySelector('link[data-cp-style]')) document.head.append(css);
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
    const quick = !!ctx.quick;
    let result = normaliseRock(c.rock);
    if (!result) {
      const wide = stage.clientWidth > stage.clientHeight * 1.05;
      const pick = pickResult({ seed: ctx.seed ?? 1, layout: wide ? 'wide' : 'tall', quick, fixtures });
      result = pick?.result || null;
    }
    if (!result) { end({ done: true, success: false, grade: 0, left: true, effects: {}, why: 'no rock' }); return; }
    if (quick) result = straightShaft(result);
    ctx.sound?.('music:duck');
    ctl = mountGame(stage, ctx, { result, items, fixtures: { ...fixtures, items }, quick, onDone: end });
  })();
  return promise;
}
export default play;
