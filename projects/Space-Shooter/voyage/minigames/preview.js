// Developer preview for the minigames. Closed unless the new-game flag is on
// (?newgame=1), like the on-foot preview. Everything can come from the address:
//   ?newgame=1&mini=repair&roll=14&dc=12&level=5&time=2&size=1&quality=2&seed=7&auto=1
//   ?newgame=1&mini=hack&roll=9&dc=12&level=6&lock=2&time=1&size=2&retries=3&auto=1
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { tierOf, tierInfo, setupRepair, setupHack, poolLasts, setupHaggle, setupCraft, CRAFT_CATEGORIES, setupNav, NAV_CATEGORIES, setupPerihelion, PERI_CATEGORIES, setupStealth, STEALTH_CATEGORIES, setupPersuade, setupIntimidate, setupPilot, setupDocking, PILOT_CATEGORIES, REPAIR_CATEGORIES, HACK_CATEGORIES, SOCIAL_CATEGORIES } from './setup.js';
import { playRepair } from './repairView.js';
import { createRing } from './hack.js';
import { playRing } from './hackView.js';
import { playMirrors } from './mirrorsView.js';
import { CONSEQUENCES } from './mirrors.js';
import { createHaggle } from './haggle.js';
import { playHaggle } from './haggleView.js';
import { createPersuade } from './persuade.js';
import { playPersuade } from './persuadeView.js';
import { createIntimidate } from './intimidate.js';
import { playIntimidate } from './intimidateView.js';
import { createPracticeHack } from './hack.js';
import { rollPreview } from './rollPreview.js';
import { playNavField, playNavTrainer, TRAINER_SECTORS } from './perihelionEntry.js';
import { createPilot } from './pilot.js';
import { createDocking } from './docking.js';
import { playDocking } from './dockingView.js';
import { playPilot } from './pilotView.js';
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
  const ids = ['roll', 'level', 'dc', 'lock', 'time', 'size', 'quality', 'retries', 'haggle', 'persuade', 'intimidate', 'sector', 'handling', 'boost', 'landing', 'speed', 'material', 'fuel', 'warning', 'quiet', 'range', 'decay'];
  if (['repair', 'hack', 'haggle', 'persuade', 'intimidate', 'pilot', 'docking', 'practice', 'craft', 'nav', 'perihelion', 'trainer', 'stealth'].includes(params.get('mini'))) $('mg-mini').value = params.get('mini');
  for (const id of ids) { const v = params.get(id); if (v != null && /^\d+$/.test(v)) $(id).value = v; }
  if (Object.keys(CONSEQUENCES).includes(params.get('context'))) $('context').value = params.get('context');
  const mini = () => $('mg-mini').value;
  const read = () => Object.fromEntries(ids.map((id) => [id, Number($(id).value)]));
  const compute = () => {
    const v = read();
    const attempt = { total: v.roll + v.level, dc: v.dc, natural: v.roll === 20 };
    const tier = tierOf(attempt);
    const setup = mini() === 'practice'
      ? { points: {}, label: 'Practice', tier: 0 }
      : mini() === 'docking'
      ? setupDocking({ tier, level: v.level, points: Object.fromEntries(PILOT_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'pilot'
      ? setupPilot({ tier, level: v.level, points: Object.fromEntries(PILOT_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'intimidate'
      ? setupIntimidate({ tier, level: v.level, points: Object.fromEntries(SOCIAL_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'persuade'
      ? setupPersuade({ tier, level: v.level, points: Object.fromEntries(SOCIAL_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'stealth'
      ? setupStealth({ tier, level: v.level, points: Object.fromEntries(STEALTH_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'perihelion' || mini() === 'trainer'
      ? setupPerihelion({ tier: mini() === 'trainer' ? 0 : tier, level: v.level, points: Object.fromEntries(PERI_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'nav'
      ? setupNav({ tier, level: v.level, points: Object.fromEntries(NAV_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'craft'
      ? setupCraft({ tier, level: v.level, points: Object.fromEntries(CRAFT_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'haggle'
      ? setupHaggle({ tier, level: v.level, points: Object.fromEntries(SOCIAL_CATEGORIES.map((c) => [c, v[c] ?? 0])) })
      : mini() === 'hack'
      ? setupHack({ tier, level: v.level, lock: v.lock, points: Object.fromEntries(HACK_CATEGORIES.map((c) => [c, v[c]])) })
      : setupRepair({ tier, level: v.level, points: Object.fromEntries(REPAIR_CATEGORIES.map((c) => [c, v[c]])) });
    return { v, attempt, tier, setup };
  };
  const show = () => {
    const { v, attempt, tier, setup } = compute();
    for (const id of ids) $(`o-${id}`).textContent = $(id).value;
    const hack = mini() === 'hack', hag = mini() === 'haggle', rep = mini() === 'repair', cr = mini() === 'craft', nv = mini() === 'nav' || mini() === 'perihelion' || mini() === 'trainer', pv = mini() === 'perihelion' || mini() === 'trainer', sl = mini() === 'stealth', pe = mini() === 'persuade', it = mini() === 'intimidate', pl = mini() === 'pilot' || mini() === 'docking', dk = mini() === 'docking';
    $('l-lock').hidden = !hack; $('l-context').hidden = !hack; $('l-retries').hidden = !hack; $('l-quality').hidden = !rep; $('l-time').hidden = hag || cr || sl || pe || it || pl; $('l-sector').hidden = mini() !== 'trainer'; $('l-size').hidden = hag || cr || nv || sl || pe || it || pl; $('l-handling').hidden = !pl; $('l-boost').hidden = !pl; $('l-landing').hidden = !pl; $('l-persuade').hidden = !pe; $('l-intimidate').hidden = !it; $('l-quiet').hidden = !sl; $('l-range').hidden = !sl; $('l-decay').hidden = !sl; $('l-fuel').hidden = !nv; $('l-warning').hidden = !nv; $('l-haggle').hidden = !hag; $('l-speed').hidden = !cr; $('l-material').hidden = !cr; $('l-quality').hidden = !(rep || cr);
    if (mini() === 'practice') document.querySelectorAll('#mg-controls label[id^="l-"]').forEach((l) => { l.hidden = true; });
    const spent = Object.values(setup.points).reduce((a, b) => a + b, 0);
    const what = mini() === 'practice'
      ? 'Practice dummy lock: <b>3</b> tumblers · <b>no clock</b> · <b>no trace</b> · <b>no XP</b>. It never trips, so try the ring as long as you like.'
      : dk
      ? `Corridor <b>${Math.round(setup.mouth * 10) / 10}</b> wide at the mouth, <b>${Math.round(setup.berth * 10) / 10}</b> at the berth · sweep <b>${Math.round(setup.sweep * 1000) / 1000}</b> rad/s · warning <b>${setup.warn}</b> s before a scrape · safe closing speed <b>${setup.safe}</b>`
      : pl
      ? `Fall <b>${setup.fall}</b> s · safe speed <b>${setup.safe}</b> · drift power <b>${Math.round(setup.drift * 10) / 10}</b> · wind <b>${Math.round(setup.wind * 10) / 10}</b> · pad <b>${Math.round(setup.pad * 10) / 10}</b> wide · fuel <b>${setup.fuel}</b> s · <b>${setup.brakes}</b> brake${setup.brakes === 1 ? '' : 's'}`
      : it
      ? `Risk on the first push <b>${setup.chances[0]}%</b>, the sixth <b>${setup.chances[5]}%</b> · <b>${setup.saves}</b> save${setup.saves === 1 ? '' : 's'} · ${setup.readsOdds ? 'you read the exact risk' : 'you only read a word for the risk'}`
      : pe
      ? `Trust needed <b>${setup.goal}</b> · patience <b>${setup.patience}</b> · you notice <b>${setup.tells}</b> thing${setup.tells === 1 ? '' : 's'} about them`
      : sl
      ? `<b>${setup.guards}</b> guards · shift <b>${setup.beats}</b> beats · a heard step <b>+${Math.round(12 * setup.noiseFactor)}</b> heat · cones about <b>${Math.round(4 * setup.rangeFactor)}</b> cells · cools <b>${setup.decay}</b> a quiet beat`
      : pv
      ? `<b>${setup.turns}</b> turns · engine fires <b>${setup.window}</b> s · burns and trims x<b>${setup.fuelFactor}</b> fuel · arc shows <b>${Math.round(setup.arc * 100)}%</b> · shard warning <b>${setup.warn}</b> s${setup.scan ? ' · fog scanned' : ''}${mini() === 'trainer' ? ` · sector <b>${v.sector}</b> of ${TRAINER_SECTORS.length}` : ` · <b>${setup.wells}</b> well${setup.wells === 1 ? '' : 's'} · <b>${setup.asteroids}</b> rocks · ${setup.flares ? 'a solar flare' : 'no flare'} · shards ${setup.meteorEvery === 0 ? 'none' : setup.meteorEvery === 1 ? 'every burn after the first' : 'on even turns'}`}`
      : nv
      ? `Map <b>${setup.size} x ${setup.size}</b> · <b>${setup.hazards}</b> hazards · warning <b>${setup.reveal}</b> ahead · time x<b>${setup.timeFactor}</b> · fuel x<b>${setup.fuelFactor}</b> · time budget x<b>${setup.budgetFactor}</b>`
      : cr
      ? `<b>${setup.strikes}</b> steps · heat band <b>${Math.round(setup.zone * 1000) / 10}%</b> · heat rate x<b>${setup.speed}</b> · work x<b>${setup.workFactor}</b> · quality +<b>${setup.qualityBonus}</b> · build x<b>${setup.buildFactor}</b> · scrap x<b>${setup.materialFactor}</b> (4-scrap recipe; banked <b>${Math.round(craftBank * 100) / 100}</b>)`
      : hag
      ? `Band <b>${Math.round(setup.band * 1000) / 10}%</b> of the range · needle <b>${setup.speed}</b>/s · <b>${setup.patience}</b> patience · <b>${setup.rounds}</b> rounds · price +<b>${Math.round(setup.priceBonus * 1000) / 10}%</b>`
      : hack
      ? `<b>${setup.firewalls}</b> firewall${setup.firewalls === 1 ? '' : 's'} · <b>${setup.time}s</b> each · mirrors on the path <b>${setup.mirrors.join(', ')}</b> · decoys <b>${setup.decoys.join(', ')}</b> · mirrors start up to <b>${setup.spread}</b> steps off · <b>${setup.retries}</b> ${setup.retries === 1 ? 'retry' : 'retries'} · catch window <b>${Math.round(setup.catchWindow * 100)}%</b>`
      : `Board <b>${setup.size} x ${setup.size}</b> · the water reaches the valve in <b>${poolLasts(setup)}</b> with one leak open · flow <b>x${setup.flow}</b> · quality +<b>${setup.qualityBonus}</b>`;
    const rp = mini() === 'practice' || mini() === 'trainer' ? null : rollPreview(mini(), attempt, { level: v.level, points: setup.points });
    $('mg-readout').innerHTML = `d20 ${v.roll} + ${v.level} = <b>${attempt.total}</b> vs ${v.dc}${attempt.natural ? ' (natural 20)' : ''}<br>`
      + `Tier <b>${tier > 0 ? '+' : ''}${tier} ${tierInfo(tier).label}</b><br>${what}<br>Points spent ${spent} of ${v.level}`
      + (rp ? `<br><span class="mg-rollline">${rp.line} ${rp.nextLine}</span>` : '');
  };
  const stage = $('mg-stage');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = Number(params.get('seed')) || 1;
  let craftBank = Number(params.get('bank')) || 0; // fraction of scrap earlier crafts rounded up (carried between crafts)
  async function start() {
    stage.replaceChildren();
    if (innerWidth < 760) stage.scrollIntoView({ block: 'start' });
    const { setup, v } = compute();
    const result = mini() === 'practice'
      ? await playRing(stage, { state: createPracticeHack({ seed }), title: 'Practice dummy', reducedMotion })
      : mini() === 'docking'
      ? await playDocking(stage, { state: createDocking({ seed, setup }), where: 'the star base', reducedMotion })
      : mini() === 'pilot'
      ? await playPilot(stage, { state: createPilot({ seed, setup }), where: 'the hangar pad', reducedMotion })
      : mini() === 'intimidate'
      ? await playIntimidate(stage, { state: createIntimidate({ seed, setup }), who: 'The loan clerk', what: 'drop the fee', reducedMotion })
      : mini() === 'persuade'
      ? await playPersuade(stage, { state: createPersuade({ seed, setup }), who: 'The dockmaster', what: 'let you through', reducedMotion })
      : mini() === 'stealth'
      ? await playStealth(stage, { state: createStealth({ seed, setup }), title: 'Cargo hold', reducedMotion })
      : mini() === 'perihelion'
      ? await playNavField(stage, { seed, setup, title: 'Plot a burn', reducedMotion })
      : mini() === 'trainer'
      ? await playNavTrainer(stage, { index: Math.max(1, Math.min(TRAINER_SECTORS.length, v.sector || 1)) - 1, setup, reducedMotion })
      : mini() === 'nav'
      ? await playNav(stage, { state: createNav({ seed, setup }), title: 'Lane scan', reducedMotion })
      : mini() === 'craft'
      ? await playCraft(stage, { state: createCraft({ seed, recipe: { materials: 4, build: 30 }, setup, bank: craftBank }), what: 'fitting', unit: 'scrap', reducedMotion })
      : mini() === 'haggle'
      ? await playHaggle(stage, { state: createHaggle({ seed, open: 20, best: 30, setup }), who: 'Captain Tull', what: 'your share', reducedMotion })
      : mini() === 'hack'
      ? await playMirrors(stage, { seed, setup, context: $('context').value, title: { foot: 'Door terminal', ship: 'Ship port', combat: 'Enemy ship' }[$('context').value], reducedMotion })
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
