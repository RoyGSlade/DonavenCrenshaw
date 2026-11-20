// The star base's units on the page: what each walk-up spot opens. A unit is a "station" interact whose id starts with `sb-`
// (like the workbench room's `wb-`), so the walking world needs nothing new: boot.js sends those ids here (openUnit / stationInfo).
//
//   sb-bay        fuel and repair bay   the fuel pump (a shop) and the repair console (the repair game, full screen)
//   sb-noodles    noodle stall          the noodle shop; eat a bowl for the Fed buff
//   sb-store      general store         the shops module
//   sb-board      job board             the postings (the hangar board's own renderer)
//   sb-workbench  workshop workbench    the crafting chain's menu and its games (craft.js), played full screen
//   sb-galley     galley                a stand-in for cooking: heat a bowl from your kit
//
// Menus are a panel on the floor (the walk pauses under it; it is the page's `.of-panel`). A GAME is never a panel: it opens
// full screen (the shared full-screen helper, the house rule). All text goes in with textContent. State changes go through the store.
import { mountShop } from '../shops/ui.js';
import { registerStarbaseShops } from './shops.js';
import { UNITS, ROOMS, MEAL, eatMeal, buffMinutes, hasBase, BASE_MAPS } from './base.js';
import { check } from '../character.js';
import { startHook } from '../minigames/sceneHook.js';
import { playHook } from '../minigames/playHook.js';
import { openFullScreen } from '../workbench/fullScreen.js';
import { tierInfo } from '../minigames/setup.js';
import { CRAFT_LIST, TOOLS, startCraft, playCraftGame } from './craft.js';
import { ITEMS } from '../data.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter(Boolean));
  return el;
};
const btn = (text, onClick, attrs = {}) => { const b = h('button', { type: 'button', ...attrs, class: `ui-btn sb-btn ${attrs.class || ''}`.trim(), text }); b.addEventListener('click', onClick); return b; };

const PROMPTS = Object.freeze({
  'sb-bay': { name: UNITS.bay.name, prompt: 'Fuel and repair bay: pump and repair console' },
  'sb-noodles': { name: UNITS.noodles.name, prompt: 'Noodle stall: a hot bowl' },
  'sb-store': { name: UNITS.store.name, prompt: 'General store: parts and odds and ends' },
  'sb-board': { name: UNITS.board.name, prompt: 'Job board: postings' },
  'sb-workbench': { name: 'Workbench', prompt: 'Workbench: cut, screw, bolt and craft' },
  'sb-galley': { name: ROOMS.galley.name, prompt: 'Galley: heat a bowl' },
});
export const UNIT_STATIONS = Object.freeze(Object.keys(PROMPTS));

/**
 * { root (the floor element), store, bus, toast, jobs (createJobs), reducedMotion(), sound(id), now() }.
 * Returns { openUnit(id) -> Promise (resolves when the panel or game is closed), stationInfo(id), isUnit(id), close() }.
 */
export function createStarbase({ root, store, bus = null, toast = () => {}, jobs = null, reducedMotion = () => false, sound = () => {}, now = () => Date.now(), onBusy = () => {}, rng = Math.random }) {
  registerStarbaseShops();
  let panel = null, cleanup = null, finish = null, follow = null; // follow: what to run (a full-screen game) after the panel closes
  let seedCounter = 0;
  const nextSeed = () => ((now() % 100000) + 17 * ++seedCounter) | 0;

  const isUnit = (id) => Object.hasOwn(PROMPTS, String(id));
  const stationInfo = (id) => (isUnit(id) ? { ...PROMPTS[id], who: null, locked: false } : null);

  function close() {
    if (!panel) return;
    try { cleanup?.(); } catch { /* the unit's own problem */ }
    cleanup = null;
    panel.remove(); panel = null;
    removeEventListener('keydown', onKey, true);
    finish?.(); finish = null;
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };

  /** A panel on the floor: eyebrow, title, a body you fill, and Leave. Resolves (the interaction ends) when it closes. */
  function open(eyebrow, title, fill, { id = '' } = {}) {
    close();
    const body = h('div', { class: 'sb-body' });
    const leave = btn('Leave', () => close(), { class: 'sb-leave', 'data-sb': 'leave' });
    panel = h('section', { class: 'of-panel sb-panel', role: 'dialog', 'aria-label': title, 'data-unit': id }, h('p', { class: 'of-eyebrow', text: eyebrow }), h('h2', { class: 'sb-title', text: title }), body, leave);
    root.append(panel);
    addEventListener('keydown', onKey, true);
    const wait = new Promise((resolve) => { finish = resolve; });
    cleanup = fill(body) || null;
    leave.focus({ preventScroll: true });
    return wait;
  }

  const walletLine = () => h('p', { class: 'sb-wallet', text: `${(store.get().money || 0).toLocaleString('en-US')} cr` });

  // --- shop counters ---------------------------------------------------------------------------------------------------------
  function shopInto(el, shop) {
    const holder = h('div', { class: 'sb-shop' });
    el.append(holder);
    const counter = mountShop({ root: holder, shop, store, toast, bus, rng });
    counter.render();
    return () => counter.destroy();
  }

  // --- a hooked game: the d20 sets the tier, the game opens full screen with the captain's real level and points ---
  async function repairGame(title, system) {
    const c = store.get().character;
    if (!c) { toast('Sign on a captain first.'); return null; }
    const attempt = check(c, { skill: 'repair', stat: 'wis', tag: 'repair', dc: 10 }, rng);
    bus?.emit('roll:attempt', { ...attempt, who: c.name || 'You', label: `Repair attempt · ${title}` });
    const start = startHook({ minigame: { kind: 'repair', title, ...(system ? { system } : {}) }, check: { pass: 'x', fail: 'y' } }, attempt, c);
    const r = await runFullScreen({ word: `REPAIR · ${tierInfo(start.tier).label.toUpperCase()} ROLL`, title, play: (stage) => playHook(stage, { start, seed: nextSeed(), sound, reducedMotion }) });
    return r ? { ...r.result, branch: r.branch, xp: r.xp } : null;
  }

  /** Open a game on the whole screen (the house rule) and wait for its result card, or Leave. play(stage) -> Promise<result>. */
  async function runFullScreen({ word, title, note = '', play }) {
    let leaveNow;
    const left = new Promise((resolve) => { leaveNow = () => resolve(null); });
    const fs = openFullScreen({ word, title, note, onLeave: () => leaveNow() });
    onBusy(true);
    let result = null;
    try { result = await Promise.race([play(fs.stage), left]); }
    catch (error) { console.warn('Stardust: a base game could not run', error); }
    fs.close();
    onBusy(false);
    return result;
  }

  // --- the units ---------------------------------------------------------------------------------------------------------------
  const units = {
    'sb-bay': () => open('FUEL AND REPAIR BAY', 'Fuel and repair', (body, ctx) => {
      let view = 'menu', stop = null;
      const draw = () => {
        stop?.(); stop = null;
        if (view === 'fuel') {
          stop = shopInto(body, 'starbase-fuel');
          body.append(btn('Back', () => { view = 'menu'; body.replaceChildren(); draw(); }, { 'data-sb': 'back' }));
          return;
        }
        body.replaceChildren(
          h('p', { class: 'sb-note', text: UNITS.bay.blurb }),
          btn('Fuel pump', () => { view = 'fuel'; body.replaceChildren(); draw(); }, { class: 'primary', 'data-sb': 'fuel' }),
          btn('Repair console', () => {
            follow = async () => {
              const r = await repairGame('Hull plate');
              toast(r ? (r.success ? 'Repair console: patched. (Practice: no pay yet.)' : 'Repair console: not this time. (Practice: nothing lost.)') : 'You left the repair console.');
              return 'reopen';
            };
            close();
          }, { 'data-sb': 'repair' }),
        );
      };
      draw();
      return () => stop?.();
    }, { id: 'bay' }),

    'sb-noodles': () => open('NOODLE STALL', 'The noodle stall', (body) => {
      let stop = null;
      const draw = () => {
        stop?.();
        const save = store.get();
        const have = save.items?.[MEAL.item] || 0, mins = buffMinutes(save, now());
        body.replaceChildren(
          h('p', { class: 'sb-note', text: UNITS.noodles.blurb }),
          h('p', { class: 'sb-meal', 'data-bowls': String(have), 'data-fed': String(mins), text: mins ? `${MEAL.name}: about ${mins} minute${mins === 1 ? '' : 's'} left.` : `${have} ${ITEMS.find((i) => i.id === MEAL.item)?.name || 'bowl'}${have === 1 ? '' : 's'} in your kit.` }),
          btn(have ? 'Eat a bowl' : 'No bowl to eat', () => eat(), { class: have ? 'primary' : '', disabled: !have, 'data-sb': 'eat' }),
        );
        stop = shopInto(body, 'starbase-noodles');
      };
      const unsub = store.subscribe(() => { if (panel?.dataset.unit === 'noodles') draw(); });
      draw();
      return () => { stop?.(); unsub(); };
    }, { id: 'noodles' }),

    'sb-store': () => open('GENERAL STORE', 'The general store', (body) => {
      body.append(h('p', { class: 'sb-note', text: UNITS.store.blurb }));
      return shopInto(body, 'starbase-store');
    }, { id: 'store' }),

    'sb-board': () => open('JOB BOARD', 'Job board', (body) => {
      if (!jobs) { body.append(h('p', { class: 'sb-note', text: 'The board is dark for a moment. Try again shortly.' })); return null; }
      const holder = h('div', { class: 'sb-board vy-pane' });
      body.append(holder);
      jobs.renderPostings(holder, (quest) => { close(); jobs.take(quest); }, BASE_MAPS.concourse);
      const unsub = store.subscribe(() => { if (holder.isConnected) jobs.renderPostings(holder, (quest) => { close(); jobs.take(quest); }, BASE_MAPS.concourse); });
      return unsub;
    }, { id: 'board' }),

    'sb-workbench': () => open('WORKSHOP', 'Your workbench', (body) => {
      let tool = 'shop';
      const draw = () => body.replaceChildren(
        h('p', { class: 'sb-note', text: 'One d20 roll sets how rough or smooth the whole craft is.' }),
        ...CRAFT_LIST.map((c) => h('div', { class: 'sb-craftrow' }, btn(c.name, () => { follow = async () => { await craft(c.id, tool); return 'reopen'; }; close(); }, { 'data-craft': c.id }), h('span', { class: 'sb-note', text: c.what }))),
        h('h3', { class: 'sb-sub', text: 'Your cutter' }),
        h('div', { class: 'sb-tools' }, ...Object.entries(TOOLS).map(([t, word]) => btn(`${t[0].toUpperCase()}${t.slice(1)}: ${word} line`, () => { tool = t; draw(); }, { 'data-tool': t, 'aria-pressed': String(t === tool), class: t === tool ? 'primary' : '' }))),
        h('p', { class: 'sb-note', text: 'A wider line is easier to stay inside.' }),
      );
      draw();
      return null;
    }, { id: 'workbench' }),

    'sb-galley': () => open('GALLEY', 'Your galley', (body) => {
      const draw = () => {
        const save = store.get();
        const have = save.items?.[MEAL.item] || 0, mins = buffMinutes(save, now());
        body.replaceChildren(
          h('p', { class: 'sb-note', text: 'A stand-in for cooking: the pans come later. For now the galley heats a bowl from your kit.' }),
          h('p', { class: 'sb-meal', 'data-bowls': String(have), 'data-fed': String(mins), text: mins ? `${MEAL.name}: about ${mins} minute${mins === 1 ? '' : 's'} left.` : `${have} bowl${have === 1 ? '' : 's'} in your kit.` }),
          btn(have ? 'Heat and eat a bowl' : 'No bowl to heat (the noodle stall sells them)', () => eat(), { class: have ? 'primary' : '', disabled: !have, 'data-sb': 'eat' }),
        );
      };
      const unsub = store.subscribe(draw);
      draw();
      return unsub;
    }, { id: 'galley' }),
  };

  function eat() {
    const out = eatMeal(store.get(), now());
    if (!out.ok) { toast(out.reason); return false; }
    store.update(() => out.save);
    toast(`${MEAL.name}. Sharp for ${MEAL.minutes} minutes.`);
    sound('talk');
    return true;
  }

  // --- crafting: the chain's own games, with the captain's real level and points ---------------------------------------------
  async function craft(id, tool = 'shop') {
    const c = store.get().character;
    if (!c) { toast('Sign on a captain first.'); return null; }
    const start = startCraft(c, id, { tool, seed: nextSeed(), rng });
    const name = CRAFT_LIST.find((x) => x.id === id)?.name || id;
    bus?.emit('roll:attempt', { ...start.attempt, who: c.name || 'You', label: `Crafting attempt · ${name}`, preview: start.note });
    const result = await runFullScreen({ word: `CRAFT · ${start.label.toUpperCase()} ROLL`, title: name, note: start.note, play: (stage) => playCraftGame(stage, start, { reducedMotion }) });
    toast(result ? (result.ruined ? `${name}: ruined. The material is gone.` : `${name}: done.`) : `You left ${name}. Nothing lost.`);
    return result;
  }

  return {
    isUnit, stationInfo, close,
    get open() { return Boolean(panel); },
    /** A unit's interact: opens its panel (or game); resolves when it is closed. */
    async openUnit(id) {
      let again = id;
      while (again && units[again]) {
        await units[again]();
        const next = follow; follow = null;
        again = next && (await next()) === 'reopen' ? id : null;
      }
    },
    eat, craft, repairGame,
    /** The base block of the live save (null before the claim). */
    base: () => (hasBase(store.get()) ? store.get().base : null),
  };
}
