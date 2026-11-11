// The crew's scope in a live fight (player two, P11): the arena as the
// pilot's browser streams it (liveFrame in ./liveFight.js, ~15 a second), a
// turret you aim yourself, hold-to-repair, and the crew's own abilities
// (hack-jam, field repair) from their skills. Aim with the mouse or a finger
// (the turret points from your ship to it), or turn it with the arrow keys;
// click, tap or Space fires. The pilot's game decides what happens.
// Every string goes in with textContent.
import { RULES } from '../../dogfight/simulation.js';
import { renderDpr, readRenderScale } from '../renderScale.js';
import { abilitiesFor, hackWindow, cdKey, ABILITY } from './liveFight.js';
import { LIVE_CREW } from './data.js';

const W = 400, H = 240;

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
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const pt = (a) => (Array.isArray(a) && a.length >= 2 ? [num(a[0]), num(a[1]), num(a[2]), num(a[3]), num(a[4], 1)] : null);

/** send(action): to the pilot. me(): this player's crew card. Returns { node, frame(f), keydown, keyup, stop }. */
export function createLiveScope({ send, me, reducedMotion = () => false }) {
  if (!document.querySelector('link[data-races-css]')) document.head.append(el('link', { rel: 'stylesheet', href: new URL('./races.css', import.meta.url).href, dataset: { racesCss: '' } }));
  const canvas = el('canvas', { class: 'rc-scope', tabindex: '0', 'aria-label': 'Live turret scope. Point at the enemy and click or tap to fire, or turn with the arrow keys and press Space.' });
  let dpr = 1;
  const size = () => { dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale()); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  size();
  const unit = Math.min(W / RULES.width, H / RULES.height);
  let f = null;
  let aim = -Math.PI / 2;
  let flash = 0, raf = 0, hack = null, fired = 0;
  const status = el('p', { class: 'rc-live-status', role: 'status' });
  const log = el('ol', { class: 'qs-minilog rc-live-log', 'aria-label': 'Fight log' });
  const fire = el('button', { type: 'button', class: 'primary', id: 'rc-crew-fire', onclick: () => shoot(), text: 'Fire the turret [Space]' });

  // Repairs: hold for LIVE_CREW.repair.holdMs.
  const holds = ['guns', 'engine', 'hull'].map((system) => {
    const fill = el('i', { class: 'cw-hold-fill' });
    const b = el('button', { type: 'button', class: 'cw-hold', dataset: { liveRepair: system }, 'aria-label': `Repair ${system}: hold` }, fill, el('span', { text: system === 'hull' ? 'Patch the hull' : `Repair ${system}` }));
    let start = 0, r = 0;
    const stop = () => { cancelAnimationFrame(r); r = 0; start = 0; fill.style.width = '0%'; };
    const tick = (now) => {
      const p = Math.min(1, (now - start) / LIVE_CREW.repair.holdMs);
      fill.style.width = `${Math.round(p * 100)}%`;
      if (p >= 1) { stop(); send({ job: 'live-repair', system }); return; }
      r = requestAnimationFrame(tick);
    };
    const begin = (e) => { e?.preventDefault?.(); if (b.disabled || start) return; start = performance.now(); r = requestAnimationFrame(tick); };
    b.addEventListener('pointerdown', begin);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    return { system, node: b, begin, stop };
  });

  const mine = abilitiesFor(me(), 'crew');
  const abilityButtons = mine.map((a) => el('button', { type: 'button', class: 'rc-ability', dataset: { crewAbility: a.id }, 'aria-label': `${a.name} [${a.key}]`, onpointerdown: (e) => { e.preventDefault(); trigger(a.id); } },
    el('i', { class: 'rc-ability-cd' }), el('b', { text: a.short }), el('small', { text: `[${a.key}]` })));

  const node = el('div', { class: 'rc-crew-live' },
    el('p', { class: 'vy-eyebrow', text: 'LIVE FIGHT · YOU ARE ON THE TURRET' }),
    canvas, status, log,
    el('div', { class: 'qs-moves' }, fire),
    el('div', { class: 'cw-repairs' }, ...holds.map((h) => h.node)),
    mine.length ? el('div', { class: 'rc-abilities', role: 'group', 'aria-label': 'Your abilities' }, ...abilityButtons) : null,
  );

  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W / unit, ((e.clientY - r.top) / r.height) * H / unit];
  };
  function point(e) {
    const ship = pt(f?.me);
    if (!ship) return;
    const [x, y] = toWorld(e);
    aim = Math.atan2(y - ship[1], x - ship[0]);
  }
  canvas.addEventListener('pointermove', point);
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); point(e); shoot(); });

  function shoot() {
    if (!f || f.phase !== 'playing' || num(f.turret) > 0) return;
    fired += 1;
    canvas.dataset.fired = String(fired);
    flash = 0.12;
    send({ job: 'live-turret', aim: Math.round(aim * 1000) / 1000 });
  }

  function trigger(id) {
    const a = ABILITY.get(id);
    if (!a || !f || f.phase !== 'playing' || num(f.cd?.[cdKey(id)]) > 0) return;
    if (a.input === 'timed') {
      if (!hack) { hack = { start: performance.now(), id }; status.textContent = 'Hack: press again when the marker is in the window.'; return; }
      const rank = mine.find((m) => m.id === id)?.rank || 1;
      const hit = Math.abs(sweep() - 0.5) <= hackWindow(rank, me()) / 2;
      hack = null;
      send({ job: 'live-ability', id, hit });
      return;
    }
    send({ job: 'live-ability', id });
  }
  const sweep = () => {
    const p = ((performance.now() - hack.start) / 1000 / ABILITY.get('ship.hack-jam').sweepSeconds) % 2;
    return p <= 1 ? p : 2 - p;
  };

  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#050b14'; ctx.fillRect(0, 0, W, H);
    if (f) {
      ctx.setTransform(unit * dpr, 0, 0, unit * dpr, 0, 0);
      ctx.strokeStyle = '#1d3344'; ctx.lineWidth = 1 / unit; ctx.strokeRect(0, 0, RULES.width, RULES.height);
      for (const s of f.shots || []) { const p = pt(s); if (!p) continue; ctx.fillStyle = p[2] ? '#81e6df' : '#ffe3cf'; ctx.beginPath(); ctx.arc(p[0], p[1], 0.12, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#9dffb0';
      for (const b of f.bolts || []) { const p = pt(b); if (!p) continue; ctx.beginPath(); ctx.arc(p[0], p[1], 0.18, 0, Math.PI * 2); ctx.fill(); }
      const ship = (p, color) => {
        if (!p || p[3] <= 0) return;
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(p[2]);
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0.7, 0); ctx.lineTo(-0.5, 0.45); ctx.lineTo(-0.3, 0); ctx.lineTo(-0.5, -0.45); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillRect(p[0] - 0.6, p[1] - 0.95, 1.2 * Math.max(0, p[3]) / Math.max(1, p[4]), 0.12);
      };
      const me_ = pt(f.me), foe = pt(f.foe);
      ship(me_, '#81e6df');
      ship(foe, f.fx?.jam ? '#b48cff' : '#ffad72');
      if (me_) {
        const ready = f.phase === 'playing' && num(f.turret) <= 0;
        ctx.strokeStyle = ready ? '#9dffb0' : '#4c6677'; ctx.lineWidth = 0.08;
        ctx.setLineDash([0.4, 0.3]);
        ctx.beginPath(); ctx.moveTo(me_[0], me_[1]); ctx.lineTo(me_[0] + Math.cos(aim) * 6, me_[1] + Math.sin(aim) * 6); ctx.stroke();
        ctx.setLineDash([]);
        canvas.dataset.mx = String(me_[0]); canvas.dataset.my = String(me_[1]);
      }
      if (foe) { canvas.dataset.fx = String(foe[0]); canvas.dataset.fy = String(foe[1]); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (flash > 0 && !reducedMotion()) { ctx.globalAlpha = flash * 2; ctx.fillStyle = '#9dffb0'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    flash = Math.max(0, flash - 1 / 60);
    ctx.fillStyle = '#8fa6b7'; ctx.font = '11px Consolas, monospace';
    const phase = f?.phase === 'countdown' ? `GET READY ${Math.ceil(num(f.count))}` : f?.phase === 'finished' ? 'FIGHT OVER' : num(f?.turret) > 0 ? 'TURRET CYCLING' : 'TURRET READY';
    ctx.fillText(phase, 8, H - 8);
    const tags = [f?.sys?.guns && 'GUNS DOWN', f?.sys?.engine && 'ENGINE DOWN', f?.fx?.jam && 'THEIR GUNS JAMMED', f?.fx?.overcharge && 'OVERCHARGED'].filter(Boolean);
    if (tags.length) { ctx.fillStyle = '#ffad72'; ctx.fillText(tags.join(' · '), 8, 14); }
    if (hack) {
      const rank = mine.find((m) => m.id === hack.id)?.rank || 1;
      const w = hackWindow(rank, me()), x0 = 40, y0 = H / 2;
      ctx.fillStyle = '#0b1828ee'; ctx.fillRect(x0 - 6, y0 - 22, W - 68, 42);
      ctx.fillStyle = '#b48cff55'; ctx.fillRect(x0 + (W - 80) * (0.5 - w / 2), y0, (W - 80) * w, 12);
      ctx.strokeStyle = '#b48cff'; ctx.strokeRect(x0, y0, W - 80, 12);
      ctx.fillStyle = '#eaf4f5'; ctx.fillRect(x0 + (W - 80) * sweep() - 2, y0 - 3, 4, 18);
      ctx.fillText('HACK: press again in the window', x0, y0 - 8);
      if ((performance.now() - hack.start) / 1000 > ABILITY.get('ship.hack-jam').sweepSeconds * 2.2) { send({ job: 'live-ability', id: hack.id, hit: false }); hack = null; }
    }
    raf = requestAnimationFrame(draw);
  }

  return {
    node,
    frame(next) {
      if (!next || typeof next !== 'object') return;
      f = next;
      const cycling = num(f.turret) > 0 || f.phase !== 'playing';
      fire.disabled = cycling;
      fire.textContent = f.phase === 'countdown' ? 'Get ready…' : cycling ? 'Turret cycling' : 'Fire the turret [Space]';
      const busy = num(f.repair) > 0 || f.phase !== 'playing';
      for (const h of holds) h.node.disabled = busy || (h.system !== 'hull' && !f.sys?.[h.system]) || (h.system === 'hull' && pt(f.me) && pt(f.me)[3] >= pt(f.me)[4]);
      for (const [i, a] of mine.entries()) {
        const left = num(f.cd?.[cdKey(a.id)]);
        abilityButtons[i].style.setProperty('--cd', String(Math.min(1, left / a.cooldown)));
        abilityButtons[i].dataset.ready = left > 0 ? '0' : '1';
      }
      const lines = Array.isArray(f.log) ? f.log.filter((l) => typeof l === 'string').slice(-3) : [];
      if (lines.length) status.textContent = lines.at(-1).slice(0, 160);
      if (lines.join('\n') !== log.dataset.text) { log.dataset.text = lines.join('\n'); log.replaceChildren(...lines.map((l) => el('li', { text: l.slice(0, 160) }))); }
      if (!raf) raf = requestAnimationFrame(draw);
    },
    keydown(e) {
      if (e.target.closest?.('input, textarea, select')) return false;
      if (e.key === ' ') { e.preventDefault(); shoot(); return true; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); aim += (e.key === 'ArrowLeft' ? -1 : 1) * 0.12; return true; }
      const a = mine.find((m) => m.key === e.key);
      if (a && !e.repeat) { e.preventDefault(); trigger(a.id); return true; }
      if ((e.key === 'r' || e.key === 'R') && !e.repeat) { const h = holds.find((x) => !x.node.disabled); if (h) { h.begin(); return true; } }
      return false;
    },
    keyup(e) { if (e.key === 'r' || e.key === 'R') for (const h of holds) h.stop(); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    get started() { return Boolean(f); },
  };
}
