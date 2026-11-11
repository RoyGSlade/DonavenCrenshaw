// The pilot's live fight overlay for quest fights (the quest player's "Fly it
// live"): Dogfight's simulation with the new game's layer around it
// (./liveFight.js): the crew's turret and repairs, knocked-out systems, and
// the ability bar (hack-jam, overcharge, field repair, drift) from the
// captain's skills. Keyboard, gamepad-free touch buttons for phones, canvas at
// the new game's render scale. Text goes in with textContent.
import { RULES, NEUTRAL } from '../../dogfight/simulation.js';
import { drawCustomShip } from '../../dogfight/shipArt.js';
import { createLiveFight, liveFightResult } from '../quests/live/dogfight.js';
import { renderDpr, readRenderScale } from '../renderScale.js';
import { createLiveLayer, stepLiveLayer, liveFrame, crewLiveAct, useAbility, abilitiesFor, cooldownLeft, drainEvents, hackWindow, ABILITY } from './liveFight.js';
import { LIVE_CREW } from './data.js';

const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'thrust', w: 'thrust', W: 'thrust', ArrowDown: 'brake', s: 'brake', S: 'brake', ' ': 'fire', Shift: 'boost' };
const W = 800, H = 480;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function ensureCss() {
  if (document.querySelector('link[data-races-css]')) return;
  document.head.append(el('link', { rel: 'stylesheet', href: new URL('./races.css', import.meta.url).href, dataset: { racesCss: '' } }));
}

/**
 * setup: liveFightSetup(...); name: the enemy's name; pilot: the captain;
 * crew(): the crew card or null; onFrame(frame): for the crew's scope;
 * onResult(result|null): the fight ended ({ outcome, hull }) or was stopped (null).
 * Returns { close, crewAct(action) -> error|null }.
 */
export function openLiveFightOverlay({ setup, name, pilot = null, crew = () => null, onFrame = () => {}, onResult = () => {}, reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches }) {
  ensureCss();
  const match = createLiveFight(setup);
  const layer = createLiveLayer(setup, { pilot, crew: crew() });
  const held = new Set();
  const canvas = el('canvas', { class: 'qs-live-canvas', 'aria-label': `Live fight against ${name}` });
  let dpr = 1;
  const size = () => { dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale()); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  size();
  const touchBtn = (label, key) => el('button', { type: 'button', class: 'qs-touch', dataset: { touch: key }, onpointerdown: (e) => { e.preventDefault(); held.add(key); }, onpointerup: () => held.delete(key), onpointerleave: () => held.delete(key), onpointercancel: () => held.delete(key) }, label);

  // ---- the ability bar ----
  const mine = abilitiesFor(pilot, 'pilot');
  let hack = null; // { start } while the hack's timed input is up
  const abilityButtons = mine.map((a) => el('button', { type: 'button', class: 'rc-ability', dataset: { ability: a.id }, 'aria-label': `${a.name} [${a.key}]: ${a.text}`, onpointerdown: (e) => { e.preventDefault(); trigger(a.id); } },
    el('i', { class: 'rc-ability-cd' }), el('b', { text: a.short }), el('small', { text: `[${a.key}]` })));
  const bar = mine.length
    ? el('div', { class: 'rc-abilities', role: 'group', 'aria-label': 'Abilities' }, ...abilityButtons)
    : el('p', { class: 'rc-note rc-abilities-none', text: 'No combat abilities yet. Pilot, Gunner, Mechanic and Hacker levels unlock them in your quarters.' });
  const status = el('p', { class: 'rc-live-status', role: 'status', 'aria-live': 'polite' });

  const overlay = el('div', { class: 'qs-live rc-live', role: 'dialog', 'aria-label': `Live fight: ${name}` },
    el('p', { class: 'qs-eyebrow', text: `LIVE FIGHT · ${name}` }),
    canvas,
    status,
    bar,
    el('div', { class: 'qs-touch-row' }, touchBtn('◀', 'left'), touchBtn('▶', 'right'), touchBtn('Thrust', 'thrust'), touchBtn('Boost', 'boost'), touchBtn('Fire', 'fire')),
    el('button', { type: 'button', onclick: () => close(null), text: 'Stop and fight turn by turn instead' }),
  );
  document.body.append(overlay);

  let lastLine = '';
  const note = (text) => { if (text && text !== lastLine) { lastLine = text; status.textContent = text; } };

  function trigger(id) {
    const a = ABILITY.get(id);
    if (!a || !mine.some((m) => m.id === id)) return;
    if (a.input === 'timed') {
      if (!hack) {
        if (cooldownLeft(layer, id) > 0 || match.phase !== 'playing') { note(`${a.name}: not ready.`); return; }
        hack = { start: performance.now() };
        note('Hack: press again when the marker is in the window.');
        return;
      }
      const hit = inWindow(hack, hackWindow(mine.find((m) => m.id === id).rank, pilot));
      hack = null;
      note(useAbility(layer, match, setup, id, { seat: 'pilot', hit }) || layer.log.at(-1));
      return;
    }
    note(useAbility(layer, match, setup, id, { seat: 'pilot' }) || layer.log.at(-1));
  }
  const sweep = (h) => {
    const a = ABILITY.get('ship.hack-jam');
    const p = ((performance.now() - h.start) / 1000 / a.sweepSeconds) % 2;
    return p <= 1 ? p : 2 - p; // back and forth
  };
  const inWindow = (h, w) => Math.abs(sweep(h) - 0.5) <= w / 2;

  const onKey = (down) => (e) => {
    if (down && !e.repeat) {
      const a = mine.find((m) => m.key === e.key);
      if (a) { e.preventDefault(); trigger(a.id); return; }
    }
    const key = KEYMAP[e.key];
    if (!key) return;
    e.preventDefault();
    if (down) held.add(key); else held.delete(key);
  };
  const kd = onKey(true), ku = onKey(false);
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  addEventListener('stardust:render-scale', size);

  let last = performance.now(), acc = 0, raf = 0, sentAt = 0, shake = 0, flash = 0, flashColor = '#ff5d6c';
  let closed = false;
  const input = () => (held.size ? { ...NEUTRAL, turn: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), thrust: held.has('thrust'), brake: held.has('brake'), boost: held.has('boost'), fire: held.has('fire') } : NEUTRAL);

  function juice(events) {
    for (const e of events) {
      if (e.type === 'hit-taken') { flash = 0.25; flashColor = '#ff5d6c'; shake = Math.max(shake, 0.25); }
      if (e.type === 'glance') { flash = 0.15; flashColor = '#81e6df'; note('Glancing hit: the drift saved you.'); }
      if (e.type === 'knock') { shake = Math.max(shake, 0.4); note(e.system === 'guns' ? 'GUNS DOWN. Crew: hold Repair.' : 'ENGINE DOWN. Crew: hold Repair.'); }
      if (e.type === 'turret-hit' || e.type === 'repair') note(layer.log.at(-1));
      if (e.type === 'ability' && e.seat === 'crew') note(layer.log.at(-1));
    }
  }

  function frame(now) {
    if (closed) return;
    acc = Math.min(0.25, acc + (now - last) / 1000); last = now;
    while (acc >= RULES.step) { stepLiveLayer(layer, match, setup, input()); acc -= RULES.step; }
    juice(drainEvents(layer));
    if (hack && (performance.now() - hack.start) / 1000 > ABILITY.get('ship.hack-jam').sweepSeconds * 2.2) {
      hack = null;
      note(useAbility(layer, match, setup, 'ship.hack-jam', { seat: 'pilot', hit: false }) || layer.log.at(-1));
    }
    shake = Math.max(0, shake - 1 / 60); flash = Math.max(0, flash - 1 / 60);
    draw();
    for (const [i, a] of mine.entries()) {
      const left = cooldownLeft(layer, a.id);
      abilityButtons[i].style.setProperty('--cd', String(Math.min(1, left / a.cooldown)));
      abilityButtons[i].dataset.ready = left > 0 ? '0' : '1';
    }
    if (crew() && now - sentAt > 1000 / LIVE_CREW.frameHz) { sentAt = now; layer.crew = crew(); onFrame(liveFrame(layer, match, setup)); }
    const result = liveFightResult(match, setup);
    if (result) { onFrame({ ...liveFrame(layer, match, setup), phase: 'finished' }); return close(result); }
    raf = requestAnimationFrame(frame);
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const unit = Math.min(W / RULES.width, H / RULES.height);
    const s = shake > 0 && !reducedMotion() ? shake * 10 : 0;
    const ox = s ? (Math.random() - 0.5) * s : 0, oy = s ? (Math.random() - 0.5) * s : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070d17'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(unit * dpr, 0, 0, unit * dpr, ox * dpr, oy * dpr);
    ctx.strokeStyle = '#2a4152'; ctx.lineWidth = 1 / unit; ctx.strokeRect(0, 0, RULES.width, RULES.height);
    for (const o of match.obstacles || []) {
      if (o.hp === 0) continue;
      ctx.fillStyle = '#1b2b3a'; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffe3cf';
    for (const b of match.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 0.09, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#9dffb0';
    for (const b of layer.bolts) { ctx.beginPath(); ctx.arc(b.x, b.y, 0.14, 0, Math.PI * 2); ctx.fill(); }
    match.ships.forEach((ship, i) => {
      if (ship.hp <= 0) return;
      ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle + Math.PI / 2);
      drawCustomShip(ctx, ship.loadout, ship.hit > 0);
      ctx.restore();
      if (i === 1 && layer.t < layer.fx.jam) { ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 0.08; ctx.setLineDash([0.2, 0.15]); ctx.beginPath(); ctx.arc(ship.x, ship.y, 1.1, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      if (i === 0 && layer.t < layer.fx.guard) { ctx.strokeStyle = '#81e6df'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(ship.x, ship.y, 1, 0, Math.PI * 2); ctx.stroke(); }
      const pct = Math.max(0, ship.hp) / Math.max(1, ship.hpMax);
      ctx.fillStyle = i ? '#ffad72' : '#81e6df';
      ctx.fillRect(ship.x - 0.6, ship.y - 0.95, 1.2 * pct, 0.12);
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flash > 0) { ctx.globalAlpha = Math.min(0.35, flash); ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#eaf4f5'; ctx.font = '14px Consolas, monospace';
    if (match.phase === 'countdown') { ctx.font = '700 40px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText(match.countdown > 0.5 ? String(Math.ceil(match.countdown)) : 'FIGHT', W / 2, H / 2); ctx.textAlign = 'left'; ctx.font = '14px Consolas, monospace'; }
    ctx.fillText(`Hull ${Math.round((Math.max(0, match.ships[0].hp) / RULES.damage) * setup.hitValue[0])}`, 16, H - 14);
    const tags = [];
    if (layer.systems.guns) tags.push('GUNS DOWN');
    if (layer.systems.engine) tags.push('ENGINE DOWN');
    if (layer.t < layer.fx.jam) tags.push('THEIR GUNS JAMMED');
    if (layer.t < layer.fx.overcharge) tags.push('OVERCHARGED');
    if (tags.length) { ctx.fillStyle = '#ffad72'; ctx.fillText(tags.join(' · '), 16, 24); }
    const c = crew();
    if (c) { ctx.fillStyle = '#9dffb0'; ctx.textAlign = 'right'; ctx.fillText(`CREW: ${c.name} on the turret`, W - 16, H - 14); ctx.textAlign = 'left'; }
    if (hack) {
      const w = hackWindow(mine.find((m) => m.id === 'ship.hack-jam')?.rank || 1, pilot);
      const x0 = W / 2 - 160, y0 = H / 2 + 60;
      ctx.fillStyle = '#0b1828ee'; ctx.fillRect(x0 - 8, y0 - 30, 336, 58);
      ctx.fillStyle = '#b48cff55'; ctx.fillRect(x0 + 320 * (0.5 - w / 2), y0, 320 * w, 16);
      ctx.strokeStyle = '#b48cff'; ctx.strokeRect(x0, y0, 320, 16);
      ctx.fillStyle = '#eaf4f5'; ctx.fillRect(x0 + 320 * sweep(hack) - 2, y0 - 4, 4, 24);
      ctx.fillText('HACK: press [1] in the window', x0, y0 - 10);
    }
  }

  function close(result) {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', kd); removeEventListener('keyup', ku);
    removeEventListener('stardust:render-scale', size);
    overlay.remove();
    onResult(result);
  }
  raf = requestAnimationFrame(frame);

  return {
    close,
    crewAct(action) {
      layer.crew = crew();
      const error = crewLiveAct(layer, match, setup, action);
      if (!error) juice(drainEvents(layer));
      return error;
    },
    get layer() { return layer; },
    get match() { return match; },
  };
}
