// Developer preview for the minigames. Closed unless the new-game flag is on
// (?newgame=1), like the on-foot preview. Everything can come from the address:
//   ?newgame=1&mini=repair&roll=14&dc=12&level=5&time=2&size=1&quality=2&seed=7&auto=1
//   ?newgame=1&mini=hack&roll=9&dc=12&level=6&lock=2&time=1&size=2&retries=3&auto=1
import { runtimeConfig } from '../../runtime-config.js';
import { newGameFlag } from '../flag.js';
import { tierOf, tierInfo, setupRepair, REPAIR_CATEGORIES, HACK_CATEGORIES } from './setup.js';
import { playRepair } from './repairView.js';
import { createSetupHack, hackSetup } from './hack.js';
import { playSetupHack } from './hackView.js';

const flag = newGameFlag({ config: runtimeConfig, search: location.search });
const $ = (id) => document.getElementById(id);
if (!flag.enabled) $('mg-closed').hidden = false;
else boot();

function boot() {
  $('mg-page').hidden = false;
  const params = new URLSearchParams(location.search);
  const ids = ['roll', 'level', 'dc', 'lock', 'time', 'size', 'quality', 'retries'];
  if (['repair', 'hack'].includes(params.get('mini'))) $('mg-mini').value = params.get('mini');
  for (const id of ids) { const v = params.get(id); if (v != null && /^\d+$/.test(v)) $(id).value = v; }
  const mini = () => $('mg-mini').value;
  const read = () => Object.fromEntries(ids.map((id) => [id, Number($(id).value)]));
  const compute = () => {
    const v = read();
    const attempt = { total: v.roll + v.level, dc: v.dc, natural: v.roll === 20 };
    const tier = tierOf(attempt);
    const setup = mini() === 'hack'
      ? hackSetup({ tier, level: v.level, lock: v.lock, points: Object.fromEntries(HACK_CATEGORIES.map((c) => [c, v[c]])) })
      : setupRepair({ tier, level: v.level, points: Object.fromEntries(REPAIR_CATEGORIES.map((c) => [c, v[c]])) });
    return { v, attempt, tier, setup };
  };
  const show = () => {
    const { v, attempt, tier, setup } = compute();
    for (const id of ids) $(`o-${id}`).textContent = $(id).value;
    const hack = mini() === 'hack';
    $('l-lock').hidden = !hack; $('l-retries').hidden = !hack; $('l-quality').hidden = hack;
    const spent = Object.values(setup.points).reduce((a, b) => a + b, 0);
    const what = hack
      ? `Ring <b>${setup.tumblers} tumblers</b> · <b>${setup.time}s</b> · <b>${setup.misses}</b> spare misses`
      : `Board <b>${setup.size} x ${setup.size}</b> · <b>${setup.seconds}s</b> · quality +<b>${setup.qualityBonus}</b>`;
    $('mg-readout').innerHTML = `d20 ${v.roll} + ${v.level} = <b>${attempt.total}</b> vs ${v.dc}${attempt.natural ? ' (natural 20)' : ''}<br>`
      + `Tier <b>${tier > 0 ? '+' : ''}${tier} ${tierInfo(tier).label}</b><br>${what}<br>Points spent ${spent} of ${v.level}`;
  };
  const stage = $('mg-stage');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = Number(params.get('seed')) || 1;
  async function start() {
    stage.replaceChildren();
    if (innerWidth < 760) stage.scrollIntoView({ block: 'start' });
    const { setup, v } = compute();
    const result = mini() === 'hack'
      ? await playSetupHack(stage, { state: createSetupHack({ seed, lock: v.lock, setup }), title: 'Door lock', reducedMotion })
      : await playRepair(stage, { seed, setup, reducedMotion });
    window.__minigame = { ...window.__minigame, last: result };
    seed++;
  }
  $('mg-controls').addEventListener('input', show);
  $('mg-controls').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  show();
  window.__minigame = { compute, get panel() { return stage.querySelector('.rp-panel'); }, start };
  if (params.get('auto') === '1') start();
}
