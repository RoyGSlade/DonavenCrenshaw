// Developer preview for the minigames. Closed unless the new-game flag is on
// (?newgame=1), like the on-foot preview. ?mini=repair&roll=14&dc=12&level=5
// &time=2&size=1&quality=2&seed=7 sets everything from the address; &auto=1 starts at once.
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { tierOf, tierInfo, setupRepair, REPAIR_CATEGORIES } from './setup.js';
import { playRepair } from './repairView.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
if (!flag.enabled) $('mg-closed').hidden = false;
else boot();

function boot() {
  $('mg-page').hidden = false;
  const params = new URLSearchParams(location.search);
  const ids = ['roll', 'level', 'dc', 'time', 'size', 'quality'];
  for (const id of ids) { const v = params.get(id); if (v != null && /^\d+$/.test(v)) $(id).value = v; }
  const read = () => Object.fromEntries(ids.map((id) => [id, Number($(id).value)]));
  const compute = () => {
    const v = read();
    const roll = v.roll, natural = roll === 20;
    const attempt = { total: roll + v.level, dc: v.dc, natural };
    const tier = tierOf(attempt);
    const points = Object.fromEntries(REPAIR_CATEGORIES.map((c) => [c, v[c]]));
    const setup = setupRepair({ tier, points, level: v.level });
    return { v, attempt, tier, setup };
  };
  const show = () => {
    const { v, attempt, tier, setup } = compute();
    for (const id of ids) $(`o-${id}`).textContent = $(id).value;
    const spent = setup.points.time + setup.points.size + setup.points.quality;
    $('mg-readout').innerHTML = `d20 ${v.roll} + ${v.level} = <b>${attempt.total}</b> vs ${v.dc}${attempt.natural ? ' (natural 20)' : ''}<br>`
      + `Tier <b>${tier > 0 ? '+' : ''}${tier} ${tierInfo(tier).label}</b><br>`
      + `Board <b>${setup.size} x ${setup.size}</b> · <b>${setup.seconds}s</b> · quality +<b>${setup.qualityBonus}</b><br>`
      + `Points spent ${spent} of ${v.level}`;
  };
  const stage = $('mg-stage');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = Number(params.get('seed')) || 1;
  async function start() {
    stage.replaceChildren();
    if (innerWidth < 760) stage.scrollIntoView({ block: 'start' });
    const { setup } = compute();
    const result = await playRepair(stage, { seed, setup, reducedMotion });
    window.__minigame = { ...window.__minigame, last: result };
    seed++;
  }
  $('mg-controls').addEventListener('input', show);
  $('mg-controls').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  show();
  window.__minigame = { compute, get panel() { return stage.querySelector('.rp-panel'); }, start };
  if (params.get('auto') === '1') start();
}
