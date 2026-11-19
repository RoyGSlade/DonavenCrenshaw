// Developer preview for the minigames. Closed unless the new-game flag is on
// (?newgame=1), like the on-foot preview. Everything can come from the address:
//   ?newgame=1&mini=repair&roll=14&dc=12&level=5&time=2&size=1&quality=2&seed=7&auto=1
//   ?newgame=1&mini=hack&roll=9&dc=12&level=6&lock=2&time=1&size=2&retries=3&auto=1
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { tierOf, tierInfo, setupRepair, setupHaggle, setupCraft, CRAFT_CATEGORIES, setupNav, NAV_CATEGORIES, setupStealth, STEALTH_CATEGORIES, REPAIR_CATEGORIES, HACK_CATEGORIES, SOCIAL_CATEGORIES } from './setup.js';
import { playRepair } from './repairView.js';
import { createSetupHack, hackSetup } from './hack.js';
import { playSetupHack } from './hackView.js';
import { createHaggle } from './haggle.js';
import { playHaggle } from './haggleView.js';
import { createCraft } from './craft.js';
import { playCraft } from './craftView.js';
import { createNav } from './nav.js';
import { playNav } from './navView.js';
import { createStealth } from './stealth.js';
import { playStealth } from './stealthView.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
if (!flag.enabled) $('mg-closed').hidden = false;
else boot();

function boot() {
  $('mg-page').hidden = false;
  const params = new URLSearchParams(location.search);
  const ids = ['roll', 'level', 'dc', 'lock', 'time', 'size', 'quality', 'retries', 'haggle', 'speed', 'material', 'fuel', 'warning', 'quiet', 'range', 'decay'];
  if (['repair', 'hack', 'haggle', 'craft', 'nav', 'stealth'].includes(params.get('mini'))) $('mg-mini').value = params.get('mini');
  for (const id of ids) { const v = params.get(id); if (v != null && /^\d+$/.test(v)) $(id).value = v; }
  const mini = () => $('mg-mini').value;
  const read = () => Object.fromEntries(ids.map((id) => [id, Number($(id).value)]));
  const compute = () => {
    const v = read();
    const attempt = { total: v.roll + v.level, dc: v.dc, natural: v.roll === 20 };
    const tier = tierOf(attempt);
    const setup = mini() === 'stealth'
      ? setupStealth({ tier, level: v.level, points: Object.fromEntries(STEALTH_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'nav'
      ? setupNav({ tier, level: v.level, points: Object.fromEntries(NAV_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'craft'
      ? setupCraft({ tier, level: v.level, points: Object.fromEntries(CRAFT_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'haggle'
      ? setupHaggle({ tier, level: v.level, points: Object.fromEntries(SOCIAL_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'hack'
      ? hackSetup({ tier, level: v.level, lock: v.lock, points: Object.fromEntries(HACK_CATEGORIES.map((c) => [c, v[c]])) })
      : setupRepair({ tier, level: v.level, points: Object.fromEntries(REPAIR_CATEGORIES.map((c) => [c, v[c]])) });
    return { v, attempt, tier, setup };
  };
  const show = () => {
    const { v, attempt, tier, setup } = compute();
    for (const id of ids) $(`o-${id}`).textContent = $(id).value;
    const hack = mini() === 'hack', hag = mini() === 'haggle', rep = mini() === 'repair', cr = mini() === 'craft', nv = mini() === 'nav', sl = mini() === 'stealth';
    $('l-lock').hidden = !hack; $('l-retries').hidden = !hack; $('l-quality').hidden = !rep; $('l-time').hidden = hag || cr || sl; $('l-size').hidden = hag || cr || nv || sl; $('l-quiet').hidden = !sl; $('l-range').hidden = !sl; $('l-decay').hidden = !sl; $('l-fuel').hidden = !nv; $('l-warning').hidden = !nv; $('l-haggle').hidden = !hag; $('l-speed').hidden = !cr; $('l-material').hidden = !cr; $('l-quality').hidden = !(rep || cr);
    const spent = Object.values(setup.points).reduce((a, b) => a + b, 0);
    const what = sl
      ? `<b>${setup.guards}</b> guards · shift <b>${setup.beats}</b> beats · heard step +<b>${Math.round(12 * setup.noiseFactor * 10) / 10}</b> · cone <b>${Math.round(4 * setup.rangeFactor * 100) / 100}</b> cells · cools <b>${setup.decay}</b> a quiet beat`
      : nv
      ? `Map <b>${setup.size} x ${setup.size}</b> · <b>${setup.hazards}</b> hazards · warning <b>${setup.reveal}</b> ahead · time x<b>${setup.timeFactor}</b> · fuel x<b>${setup.fuelFactor}</b> · time budget x<b>${setup.budgetFactor}</b>`
      : cr
      ? `<b>${setup.strikes}</b> steps · heat band <b>${Math.round(setup.zone * 1000) / 10}%</b> · heat rate x<b>${setup.speed}</b> · work x<b>${setup.workFactor}</b> · quality +<b>${setup.qualityBonus}</b> · build x<b>${setup.buildFactor}</b> · scrap x<b>${setup.materialFactor}</b> (4-scrap recipe; banked <b>${Math.round(craftBank * 100) / 100}</b>)`
      : hag
      ? `Band <b>${Math.round(setup.band * 1000) / 10}%</b> of the range · needle <b>${setup.speed}</b>/s · <b>${setup.patience}</b> patience · <b>${setup.rounds}</b> rounds · price +<b>${Math.round(setup.priceBonus * 1000) / 10}%</b>`
      : hack
      ? `Ring <b>${setup.tumblers} tumblers</b> · <b>${setup.time}s</b> · <b>${setup.misses}</b> spare misses`
      : `Board <b>${setup.size} x ${setup.size}</b> · <b>${setup.seconds}s</b> · quality +<b>${setup.qualityBonus}</b>`;
    $('mg-readout').innerHTML = `d20 ${v.roll} + ${v.level} = <b>${attempt.total}</b> vs ${v.dc}${attempt.natural ? ' (natural 20)' : ''}<br>`
      + `Tier <b>${tier > 0 ? '+' : ''}${tier} ${tierInfo(tier).label}</b><br>${what}<br>Points spent ${spent} of ${v.level}`;
  };
  const stage = $('mg-stage');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = Number(params.get('seed')) || 1;
  let craftBank = Number(params.get('bank')) || 0; // fraction of scrap earlier crafts rounded up (carried between crafts)
  async function start() {
    stage.replaceChildren();
    if (innerWidth < 760) stage.scrollIntoView({ block: 'start' });
    const { setup, v } = compute();
    const result = mini() === 'stealth'
      ? await playStealth(stage, { state: createStealth({ seed, setup }), title: 'Cargo hold', reducedMotion })
      : mini() === 'nav'
      ? await playNav(stage, { state: createNav({ seed, setup }), title: 'Lane scan', reducedMotion })
      : mini() === 'craft'
      ? await playCraft(stage, { state: createCraft({ seed, recipe: { materials: 4, build: 30 }, setup, bank: craftBank }), what: 'fitting', unit: 'scrap', reducedMotion })
      : mini() === 'haggle'
      ? await playHaggle(stage, { state: createHaggle({ seed, open: 20, best: 30, setup }), who: 'Captain Tull', what: 'your share', reducedMotion })
      : mini() === 'hack'
      ? await playSetupHack(stage, { state: createSetupHack({ seed, lock: v.lock, setup }), title: 'Door lock', reducedMotion })
      : await playRepair(stage, { seed, setup, reducedMotion });
    if (mini() === 'craft' && result) { craftBank = result.bank; show(); }
    window.__minigame = { ...window.__minigame, last: result };
    seed++;
  }
  $('mg-controls').addEventListener('input', show);
  $('mg-controls').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  show();
  window.__minigame = { compute, get panel() { return stage.querySelector('.rp-panel'); }, start };
  if (params.get('auto') === '1') start();
}
