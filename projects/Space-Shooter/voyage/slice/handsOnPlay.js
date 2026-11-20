// Scene 1's hands-on beats on the page (opening track C): the valve, the hose, the mop and the lever, done with the player's hands
// in the Tin Duchess's holodeck gym. The rules are pure (./handsOn.js); this is the DOM side.
//
//   const handsOn = createHandsOn({ root, store, toast, world, sound, reducedMotion, character, onBusy })
//   handsOn.begin(v, pick, node)   the director calls it for a scene node with `handsOn`: the beat is now on, the player does it
//   handsOn.use(target)            the world's `task` hook: a prop with interact.task was used. Returns a promise while a game runs.
// Every game opens on the shared full-screen helper and ends back in the room: no cut, no dialogue box.
// Leaving a game midway changes nothing and costs nothing; the thing stays there to try again.
import { openFullScreen } from '../workbench/fullScreen.js';
import { startHook } from '../minigames/sceneHook.js';
import { playRepair } from '../minigames/repairView.js';
import { playMop } from '../minigames/mopView.js';
import { playLeverGame, LEVER_WORDS } from '../minigames/leverView.js';
import { createLever } from '../minigames/lever.js';
import { playScrew } from '../minigames/screwView.js';
import { createScrew } from '../minigames/screw.js';
import { gameSetup } from '../minigames/craftChain.js';
import { ensureHandsOnStyle } from '../minigames/handsOnKit.js';
import { createEl } from '../onfoot/dom.js';
import * as R from './handsOn.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TASK_WORD = { valve: 'The valve', hose: 'The hose', cart: 'The floor', 'mop-loose': 'The floor', goo: 'The floor', lever: 'The lever' };

export function createHandsOn({ root, store, toast = () => {}, world = () => null, sound = () => {}, reducedMotion = () => false, character = () => null, onBusy = () => {} } = {}) {
  let cur = null;           // { beat, node, pick, seed } the beat on now
  let busy = false;         // a game or the cart is open
  const announced = new Set();
  const flags = () => store.get().flags || {};
  const setFlags = (patch) => { if (patch && Object.keys(patch).length) store.update((s) => ({ ...s, flags: { ...s.flags, ...patch } })); };
  const say = (text, who = 'Pip') => { if (text) toast(who ? `${who}: ${text}` : text); };

  /** The director found a scene node with `handsOn`. 'start' is the old pick-a-way node: the hands-on way in is picked for the player. */
  function begin(v, pick, node) {
    if (node?.handsOn === 'start') {
      const i = (node.choices || []).findIndex((c) => c.hands);
      cur = null;
      if (i >= 0) setTimeout(() => pick(i), 0); // out of the render that called us
      return;
    }
    const beat = R.beatOf(node);
    if (!beat) return;
    const run = store.get().quests?.active?.[v.quest?.id];
    cur = { beat, node: v.node, pick, seed: R.seedOf(run, beat) };
    if (!announced.has(v.node)) { announced.add(v.node); setTimeout(() => { if (cur?.node === v.node) say(R.LINES.start[beat]); }, 500); }
  }

  /** A full-screen game in the shared helper: resolves with the game's result, or null when the player left it. */
  async function game({ word, title, run }) {
    ensureHandsOnStyle();
    document.body.classList.add('ho-open');
    let left; const leaving = new Promise((r) => { left = r; });
    const fs = openFullScreen({ word, title, onLeave: () => left(null) });
    onBusy(true);
    try { return await Promise.race([run(fs.stage), leaving]); }
    catch (error) { console.warn('Stardust: a hands-on game failed to run', error); return null; }
    finally { fs.close(); document.body.classList.remove('ho-open'); onBusy(false); }
  }

  const start = (spec) => startHook({ minigame: spec, check: { pass: 'x', fail: 'y' } }, { total: 10, dc: 10, natural: false }, character() || {});

  async function water(beat) {
    const foam = beat === 'valve';
    const hook = start(foam ? { kind: 'repair', system: 'wellness-foam', title: 'Foam valve' } : { kind: 'repair', system: 'engine-cooling', title: 'Coolant hose' });
    const setup = foam ? { ...hook.setup, size: Math.min(4, hook.setup.size) } : hook.setup;
    return game({
      word: `REPAIR · ${foam ? 'FOAM VALVE' : 'COOLANT HOSE'}`, title: foam ? 'Foam valve' : 'Coolant hose',
      run: (stage) => playRepair(stage, { seed: cur.seed, setup, system: hook.system || undefined, title: foam ? 'Foam valve' : 'Coolant hose', flavor: foam ? 'foam' : null, sound, reducedMotion }),
    });
  }

  function finishBeat(after) {
    setFlags(after.flags);
    say(after.line);
    const c = cur;
    if (c && after.choice != null) { c.done = true; setTimeout(() => c.pick(after.choice), reducedMotion() ? 50 : 900); } // `done`: nothing more to do in this beat while the scene moves on
  }

  async function doValve() {
    const r = await water('valve');
    if (r) finishBeat(R.afterValve(flags(), r));
  }
  async function doHose() {
    const r = await water('hose');
    if (r) finishBeat(R.afterHose(flags(), r));
  }
  async function doMop() {
    const c = R.chainOf(flags());
    if (!c.held) { say(R.LINES.mop.need, null); return; }
    const r = await game({ word: 'MOP · THE GOO', title: 'Mop the goo', run: (stage) => playMop(stage, { seed: cur.seed, mess: c.mess, head: c.head, reducedMotion }) });
    if (r?.success) finishBeat(R.afterMop());
  }
  async function doLever() {
    let warned = false;
    const r = await game({
      word: 'POWER · HOLODECK', title: 'Holodeck power',
      run: (stage) => playLeverGame(stage, { state: createLever(), words: { ...LEVER_WORDS, surge: R.LINES.lever.warn }, sound, reducedMotion, onEvent: (e) => { if (e.type === 'surge') warned = true; } }),
    });
    void warned;
    if (!r) return;
    await flicker(Boolean(r.success));
    finishBeat(R.afterLever(r));
  }

  /** The room answers the lever: the jungle drops out and comes back in a stutter (or stays dead when the projector fried). */
  async function flicker(ok) {
    const w = world();
    if (!w?.setState) return;
    const seq = ok ? ['off', 'on', 'off', 'off', 'on', 'off', 'on'] : ['off', 'on', 'off', 'fried'];
    for (const st of seq) { w.setState('holo-projector', st); await wait(reducedMotion() ? 30 : st === 'off' ? 110 : 150); }
    w.setState('holo-projector', ok ? null : 'fried');
  }

  /** The supply cart: a small panel in the room (take a mop, fit an absorber head). Resolves when it is closed. */
  function cart() {
    return new Promise((resolve) => {
      const lines = createEl('p', { class: 'of-help ho-cartline', text: R.LINES.mop.cartLook });
      const list = createEl('div', { class: 'ho-cartbtns' });
      const panel = createEl('section', { class: 'of-panel ho-cart', role: 'dialog', 'aria-label': 'Supply cart' }, createEl('p', { class: 'of-eyebrow', text: 'SUPPLY CART' }), lines, list);
      const close = () => { panel.remove(); onBusy(false); busy = false; resolve(); };
      const btn = (text, fn, primary = false) => { const b = createEl('button', { type: 'button', class: `ui-btn${primary ? ' primary' : ''}`, text }); b.addEventListener('click', fn); list.append(b); return b; };
      const render = () => {
        list.replaceChildren();
        const c = R.chainOf(flags());
        if (!c.held) btn('Take a mop', () => { const t = R.takeMop(flags(), 'cart'); setFlags(t.flags); lines.textContent = t.line; render(); }, true);
        else if (c.head === 'plain') btn('Fit an absorber head', async () => { panel.hidden = true; await upgrade(); panel.hidden = false; render(); }, true);
        else lines.textContent = R.LINES.mop.upgraded;
        btn('Leave the cart', close);
        list.querySelector('button')?.focus({ preventScroll: true });
      };
      root.append(panel);
      onBusy(true);
      render();
    });
  }

  async function upgrade() {
    lineNow(R.LINES.mop.upgradePrompt);
    const hook = start({ kind: 'repair', title: 'Absorber head' });
    const setup = gameSetup('screw', { tier: hook.tier, points: character()?.points?.crafting || {}, level: 9 });
    const r = await game({ word: 'SCREW · ABSORBER HEAD', title: 'Fit the absorber head', run: (stage) => playScrew(stage, { state: createScrew({ setup }), what: 'absorber head', reducedMotion }) });
    if (!r) return;
    const after = R.afterUpgrade(flags(), r);
    setFlags(after.flags);
    lineNow(after.line);
  }
  const lineNow = (text) => say(text, null);

  /** The world's task hook. */
  function use(target) {
    if (busy) return null;
    const task = target?.task;
    const c = R.chainOf(flags());
    const hint = cur?.done ? R.LINES.order.done(TASK_WORD[task] || 'That') : R.whyNot(cur?.beat || null, task);
    if (hint) {
      // Not begun: the thing's own plain description; begun but out of order: Pip's hint.
      const spent = { valve: c.valve, hose: c.hose, cart: c.mopped, 'mop-loose': c.mopped, goo: c.mopped, lever: c.lever }[task];
      if (!cur && spent) say(R.LINES.order.done(TASK_WORD[task]), null);
      else say(hint, cur ? 'Pip' : null);
      return null;
    }
    busy = true;
    const done = (p) => Promise.resolve(p).catch((e) => console.warn('Stardust: a hands-on beat failed', e)).finally(() => { if (task !== 'cart') busy = false; });
    switch (task) {
      case 'valve': return done(doValve());
      case 'hose': return done(doHose());
      case 'goo': return done(doMop());
      case 'lever': return done(doLever());
      case 'mop-loose': { const t = R.takeMop(flags(), 'loose'); setFlags(t.flags); lineNow(t.line); busy = false; return null; }
      case 'cart': return cart();
      default: busy = false; return null;
    }
  }

  return { begin, use, get beat() { return cur?.beat || null; }, get busy() { return busy; } };
}
