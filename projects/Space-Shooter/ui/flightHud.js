// The flight HUD as positioned DOM widgets (so the layout editor can move and
// resize them, and art/ui PNGs can skin them):
//   gauges    fuel dial, speed meter, hull bar, boost pips + refill, flux
//   topbar    best time | current time | shard slots that fill as collected
//   settings  the gear: opens the pause panel with the flight settings
//   minimap   an empty frame; ui/hud.js draws the map inside its rectangle
import { state, config } from '../state.js';
import { levelElapsedMs } from '../engine/rules.js';
import { sceneMs } from '../engine/weekly/sim.js';
import { readLocalBest } from '../engine/weekly/localBest.js';
import { artImage } from './uiArt.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const two = (n) => String(n).padStart(2, '0');
export function clock(ms) {
  if (!Number.isFinite(ms)) return '--:--.--';
  const t = Math.max(0, Math.round(ms));
  return `${Math.floor(t / 60000)}:${two(Math.floor(t / 1000) % 60)}.${two(Math.floor((t % 1000) / 10))}`;
}

// Local bests for the network circuits and the custom track, per device.
const BEST_KEY = 'stardust.localBests.v1';
function readBests() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch { return {}; }
}
function saveBest(key, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const bests = readBests();
  if (!(bests[key] <= ms)) {
    bests[key] = Math.round(ms);
    try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch { /* private window */ }
  }
}
function listenForBests() {
  window.addEventListener('stardust:levelComplete', (e) => saveBest(`L${e.detail?.level}`, e.detail?.elapsedMs));
  window.addEventListener('roadmap:runComplete', (e) => saveBest('full', e.detail?.totalMs));
  window.addEventListener('stardust:customRunComplete', (e) => { if (!e.detail?.preview) saveBest('custom', e.detail?.totalMs); });
}

// SVG arc gauge (placeholder art; gauge-fuel/gauge-speed PNGs replace the face).
const ARC = 240, R = 40;
function arcPath(fraction) {
  const start = 90 + (360 - ARC) / 2, end = start + ARC * clamp01(fraction);
  const p = (deg) => { const a = (deg * Math.PI) / 180; return `${50 + R * Math.cos(a)} ${50 + R * Math.sin(a)}`; };
  const large = end - start > 180 ? 1 : 0;
  return `M ${p(start)} A ${R} ${R} 0 ${large} 1 ${p(end)}`;
}
function dial(kind, label) {
  const el = document.createElement('div');
  el.className = `fx-dial fx-dial-${kind}`;
  el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="fx-dial-track" d="${arcPath(1)}"/><path class="fx-dial-fill" d="${arcPath(1)}"/></svg><div class="fx-dial-needle"></div><span class="fx-dial-value"></span><span class="fx-dial-label">${label}</span>`;
  artImage(`gauge-${kind}`, el);
  artImage('gauge-needle', el.querySelector('.fx-dial-needle'));
  return el;
}

let els = null;
const last = {};
function set(key, el, prop, value) {
  if (last[key] === value) return;
  last[key] = value;
  if (prop === 'text') el.textContent = value;
  else if (prop.startsWith('--')) el.style.setProperty(prop, value);
  else el.setAttribute(prop, value);
}

export function initFlightHud(root, { onSettings }) {
  listenForBests();
  const gauges = document.createElement('div');
  gauges.className = 'fx-widget fx-gauges';
  gauges.dataset.widget = 'gauges';
  const fuel = dial('fuel', 'FUEL');
  const speed = dial('speed', 'SPEED');
  const hull = document.createElement('div');
  hull.className = 'fx-hull';
  hull.innerHTML = '<span class="fx-hull-label">HULL</span><div class="fx-hull-bar"><div class="fx-hull-fill"></div></div>';
  artImage('bar-hull-frame', hull.querySelector('.fx-hull-bar'));
  const boost = document.createElement('div');
  boost.className = 'fx-boostmeter';
  boost.innerHTML = '<span class="fx-boost-label">BOOST</span><div class="fx-pips"><span></span><span></span><span></span></div><div class="fx-refill"><div></div></div><span class="fx-flux">FLUX 0%</span>';
  for (const pip of boost.querySelectorAll('.fx-pips span')) artImage('boost-pip-empty', pip);
  gauges.append(fuel, speed, hull, boost);

  const topbar = document.createElement('div');
  topbar.className = 'fx-widget fx-topbar';
  topbar.dataset.widget = 'topbar';
  topbar.innerHTML = '<div class="fx-tb-cell"><span class="fx-tb-label">BEST</span><span class="fx-tb-best">--:--.--</span></div><div class="fx-tb-cell fx-tb-now"><span class="fx-tb-label">TIME</span><span class="fx-tb-time">0:00.00</span></div><div class="fx-tb-cell"><span class="fx-tb-label">SHARDS</span><span class="fx-tb-shards"></span></div>';
  artImage('topbar-panel', topbar);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'fx-widget fx-settings';
  settings.dataset.widget = 'settings';
  settings.setAttribute('aria-label', 'Settings and pause');
  settings.innerHTML = '<span aria-hidden="true">⚙</span>';
  artImage('icon-settings', settings);
  settings.addEventListener('click', () => onSettings?.());

  const minimap = document.createElement('div');
  minimap.className = 'fx-widget fx-minimap';
  minimap.dataset.widget = 'minimap';
  minimap.setAttribute('aria-hidden', 'true');

  root.append(gauges, topbar, settings, minimap);
  els = {
    gauges, topbar, settings, minimap,
    fuelFill: fuel.querySelector('.fx-dial-fill'), fuelNeedle: fuel.querySelector('.fx-dial-needle'), fuelValue: fuel.querySelector('.fx-dial-value'),
    speedFill: speed.querySelector('.fx-dial-fill'), speedNeedle: speed.querySelector('.fx-dial-needle'), speedValue: speed.querySelector('.fx-dial-value'),
    hullFill: hull.querySelector('.fx-hull-fill'), hull,
    pips: [...boost.querySelectorAll('.fx-pips span')], refill: boost.querySelector('.fx-refill div'), flux: boost.querySelector('.fx-flux'),
    best: topbar.querySelector('.fx-tb-best'), time: topbar.querySelector('.fx-tb-time'), shards: topbar.querySelector('.fx-tb-shards'),
  };
  return els;
}

function bestFor(lv) {
  if (lv.weekly) return readLocalBest(lv.weekly)?.ms ?? null;
  if (state.run?.kind === 'custom') return readBests().custom ?? null;
  return readBests()[`L${lv.level}`] ?? null;
}

function renderShards(total, got) {
  if (last.shardsKey === `${total}:${got}`) return;
  last.shardsKey = `${total}:${got}`;
  const slots = [];
  for (let i = 0; i < total; i++) {
    const s = document.createElement('span');
    s.className = i < got ? 'is-full' : '';
    artImage(i < got ? 'shard-slot-full' : 'shard-slot-empty', s);
    slots.push(s);
  }
  els.shards.replaceChildren(...slots);
}

/** Per frame from the renderer. */
export function updateFlightHud() {
  if (!els) return;
  const lv = state.run?.current;
  const flying = !!(lv && state.mode === 'roadmap' && !state.ui.showStartOverlay && !state.ui.showEndOverlay);
  document.body.classList.toggle('fx-flying', flying);
  if (!flying) return;
  const p = lv.viewPlayer || lv.player;
  const fuel = clamp01(lv.fuel / (lv.maxFuel || config.MAX_TANK));
  set('fuel', els.fuelFill, 'd', arcPath(fuel));
  set('fuelN', els.fuelNeedle, '--turn', `${-120 + 240 * fuel}deg`);
  set('fuelV', els.fuelValue, 'text', `${Math.round(fuel * 100)}`);
  els.fuelFill.parentElement.parentElement.classList.toggle('is-low', fuel < 0.25);
  const speed = Math.hypot(p.vx || 0, p.vy || 0);
  const sp = clamp01(speed / (config.MAX_SPEED || 15));
  set('speed', els.speedFill, 'd', arcPath(sp));
  set('speedN', els.speedNeedle, '--turn', `${-120 + 240 * sp}deg`);
  set('speedV', els.speedValue, 'text', speed.toFixed(1));
  const hull = clamp01((p.hp ?? 100) / (p.maxHp || 100));
  set('hull', els.hullFill, '--fill', `${(hull * 100).toFixed(1)}%`);
  els.hull.classList.toggle('is-low', hull < 0.3);
  const pips = Math.max(0, lv.boost ?? 0);
  els.pips.forEach((pip, i) => {
    const full = pips >= i + 1;
    if (pip.classList.contains('is-full') !== full) {
      pip.classList.toggle('is-full', full);
      artImage(full ? 'boost-pip-full' : 'boost-pip-empty', pip);
    }
  });
  set('refill', els.refill, '--fill', `${(pips >= 3 ? 100 : (pips % 1) * 100).toFixed(1)}%`);
  set('flux', els.flux, 'text', `FLUX ${Math.floor(lv.flux || 0)}%`);
  const ms = lv.weekly ? sceneMs(lv) : levelElapsedMs(lv);
  set('time', els.time, 'text', clock(ms));
  set('best', els.best, 'text', clock(bestFor(lv)));
  const total = lv.nodes?.filter((n) => n.kind === 'planet').length || 0;
  renderShards(total, lv.shards?.size || 0);
}

/** The minimap's frame rectangle in CSS pixels, or null when it's hidden. */
export function minimapRect() {
  if (!els?.minimap || els.minimap.classList.contains('is-off')) return null;
  const r = els.minimap.getBoundingClientRect();
  return r.width > 4 && r.height > 4 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}
export function setMinimapVisible(on) {
  els?.minimap.classList.toggle('is-off', !on);
}
